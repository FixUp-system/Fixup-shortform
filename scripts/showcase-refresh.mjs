// 랜딩에 걸 표지를 **파일로 구워 넣는다** (2026-09-10 사장님 지시: "파일 자체를 올린다던가").
//
// 쓰는 법:
//   node scripts/showcase-refresh.mjs                       # 프로덕션에서 12장
//   node scripts/showcase-refresh.mjs https://…  16         # 개수를 바꿔서
//
// ★★★ 왜 굽는가. 표지를 API 라우트로 흘려주면 한 장마다 함수가 뜨고 Postgres 를 조회하고
//   Storage 를 내려받는다. 09-09 에 엣지가 쥐게 고쳐 두 번째 방문은 0.6초가 됐지만
//   **첫 방문은 7.5초 그대로**였다. 정적 파일은 607KB 짜리가 0.076초다(라이브 실측).
//   그리고 죽은 표지(25장 중 스무 장이 404)와 방문마다 나가던 Supabase 전송이 함께 사라진다.
//
// ★★ **살아 있는 것만 굽는다.** 200 으로 실제로 받아지는 표지만 남긴다 — 그래서 굽고 나면
//   랜딩에 깨진 칸이 원리적으로 없다(옛 화면은 브라우저가 404 를 맞고 나서야 지웠다).
//
// ★ 이 스크립트는 **읽기만 한다** — 프로덕션 공개 목록을 받아 파일로 떨어뜨릴 뿐,
//   아무것도 고치지 않는다. 돈도 안 든다.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.argv[2] || "https://fixup-shortform-service.vercel.app";
const WANT = Number(process.argv[3]) || 12;
const OUT_DIR = "public/showcase";
const LIST = "lib/showcase.js";

const res = await fetch(`${BASE}/api/projects`);
if (!res.ok) {
  console.error(`목록을 못 받았다 (${res.status}) — 손님 보관함 스위치가 켜져 있어야 한다`);
  process.exit(1);
}
const all = (await res.json()).projects || [];
const cands = all.filter((p) => p.video_url && p.image_url && p.image_url.startsWith("/api/uploads/"));
console.log(`후보 ${cands.length}편 (전체 ${all.length})`);

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const kept = [];
let dead = 0;
for (const p of cands) {
  if (kept.length >= WANT) break;
  const r = await fetch(`${BASE}${p.image_url}?t=1`);
  if (!r.ok) { dead += 1; continue; }              // ★ 죽은 표지는 여기서 걸러진다
  const buf = Buffer.from(await r.arrayBuffer());
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.width || !meta?.height) { dead += 1; continue; }
  const file = `${String(kept.length + 1).padStart(2, "0")}.webp`;
  writeFileSync(join(OUT_DIR, file), buf);
  kept.push({ file, w: meta.width, h: meta.height, id: p.id, kb: Math.round(buf.length / 1024) });
  console.log(`  ✓ ${file}  ${meta.width}x${meta.height}  ${Math.round(buf.length / 1024)}KB`);
}
console.log(`남긴 것 ${kept.length}장 · 죽어서 버린 것 ${dead}장 · 합계 ${kept.reduce((s, k) => s + k.kb, 0)}KB`);

if (!kept.length) { console.error("살아 있는 표지가 하나도 없다 — 굽지 않는다"); process.exit(1); }

// ★ 목록 파일은 **순수 데이터**여야 한다(import 0). 화면이 이것을 읽는데, 여기에 뭔가를
//   끌어오면 그 사슬 끝의 fs 가 클라이언트 번들로 딸려 가 빌드가 깨진다(CLAUDE.md).
const body = kept.map((k) =>
  `  { file: ${JSON.stringify(k.file)}, w: ${k.w}, h: ${k.h}, id: ${JSON.stringify(k.id)} },`
).join("\n");

writeFileSync(LIST, `// 랜딩에 거는 표지 — **구워 넣은 목록이다. 손으로 고치지 마라.**
//
// 만드는 법:  node scripts/showcase-refresh.mjs
// 만든 때:    ${new Date().toISOString().slice(0, 10)}  (출처 ${BASE})
//
// ★★ 이 파일과 public/showcase/ 는 **한 벌**이다. 한쪽만 고치면 깨진 칸이 생긴다 —
//   스크립트가 둘을 함께 쓴다.
// ★★ 이 파일에 **import 를 더하지 마라.** 화면이 읽는 자리라 그 사슬 끝에 fs 가 있으면
//   빌드가 깨진다(이 저장소가 세 번 겪었다 — CLAUDE.md 「값이 사는 곳」).
// ★ w·h 는 굽는 시점에 실제 파일에서 쟀다. 화면이 그대로 적어 주면 표지가 하나씩 뜰 때
//   아래가 밀리지 않는다(자리를 미리 잡는다).
export const SHOWCASE = [
${body}
];
`);
console.log(`\n${LIST} 갱신 · ${OUT_DIR}/ 에 ${kept.length}장`);
console.log("⚠️ middleware.js 의 matcher 에 showcase/ 가 빠져 있어야 한다 — 아니면 307 이 된다.");
