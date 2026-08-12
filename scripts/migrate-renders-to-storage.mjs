// data/renders/ 의 완성본을 renders 버킷으로 옮긴다.
//
// ★ 최종본(<uuid>.mp4)만 올린다. 같은 폴더에 중간물이 섞여 있다 —
//   실측 71개 중 65개가 클립(<uuid>-<N>.mp4)·소리(.m4a)·자막(.ass)이고,
//   그것들은 fal CDN 에서 다시 받을 수 있어 지킬 이유가 없다.
//
// ★ 멱등이다. 두 번 돌려도 개수가 안 는다 — 이미 있는 것은 건너뛴다.
// ★ 로컬 파일을 지우지 않는다. 확인한 뒤 사람이 지운다.
//
// 실행: node scripts/migrate-renders-to-storage.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { getStore } = await import("../lib/store/index.js");
const store = getStore();

// compose.js 의 rendersDir() 를 그대로 쓴다 — 경로 규칙을 복제하면 한쪽만 고치고
// 잊는 사고가 난다(이 스크립트가 규칙을 복제했던 것이 실제로 그 사고였다).
const { rendersDir } = await import("../lib/compose.js");
const dir = rendersDir();
if (!existsSync(dir)) {
  console.log(`${dir} 가 없습니다 — 옮길 것이 없습니다.`);
  process.exit(0);
}

// 라우트의 UUID_MP4 와 같은 형태만 고른다
const FINAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;
const all = readdirSync(dir);
const finals = all.filter((f) => FINAL.test(f));

console.log(`${dir}`);
console.log(`  전체 ${all.length}개 · 최종본 ${finals.length}개 · 건너뜀 ${all.length - finals.length}개(중간물)\n`);

let uploaded = 0;
let skipped = 0;
for (const name of finals) {
  try {
    await store.getObject("renders", name);
    console.log(`  = ${name}  (이미 있음)`);
    skipped += 1;
    continue;
  } catch {
    // 없다 = 올릴 대상
  }
  const bytes = readFileSync(path.join(dir, name));
  await store.putObject("renders", name, bytes, "video/mp4");
  console.log(`  + ${name}  (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
  uploaded += 1;
}
console.log(`\n올림 ${uploaded} · 이미 있음 ${skipped} · 합계 ${uploaded + skipped}`);
console.log("로컬 파일은 그대로 뒀습니다 — 화면에서 재생을 확인한 뒤 지우세요.");
