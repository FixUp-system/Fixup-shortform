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
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

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
// ★★★ 2026-09-10 — 후보를 **영상이 있는 편 전부**로 넓혔다. 그전에는 올린 사진이
//   우리 저장소에 있는 편만 봤는데(`image_url.startsWith("/api/uploads/")`), 그 사진
//   대부분이 09-07 에 못 옮긴 옛 Supabase 에 있어 죽어 있다 — 그래서 벽이 **다섯 칸**이었다.
//   전수 실측: 우리 저장소 영상 41편 중 **37편이 404**. 반면 fal 주소 영상은 살아 있다.
const cands = all.filter((p) => p.video_url);
console.log(`후보 ${cands.length}편 (전체 ${all.length})`);

// 영상 앞부분만 받아 **첫 장면**을 뽑는다.
//
// ★★★ 전송량이 이 함수의 존재 이유다. 09-07 에 Supabase 무료 5GB 를 넘겨 서비스가 죽었다.
//   영상을 통째로 받으면 41편에 155MB 인데, mp4 색인(moov)이 맨 앞이라(실측: 오프셋 36)
//   **앞 64KB** 만 받아도 프레임이 나온다 — 전체의 1.6% 다.
// ★ 그래도 안 나오는 편이 있을 수 있어 조금씩 넓혀 본다. 넓혀도 1MB 를 안 넘긴다.
const HEADS_KB = [64, 256, 1024];

function runFfmpeg(args) {
  return new Promise((done) => {
    const ps = spawn(ffmpegPath, args, { stdio: "ignore" });
    ps.on("close", (code) => done(code === 0));
    ps.on("error", () => done(false));
  });
}

async function frameFromVideo(url) {
  for (const kb of HEADS_KB) {
    const res = await fetch(url, { headers: { Range: `bytes=0-${kb * 1024 - 1}` } }).catch(() => null);
    if (!res || !(res.ok || res.status === 206)) continue;
    const part = join(tmpdir(), `showcase-${Date.now()}-${kb}.mp4`);
    const out = `${part}.jpg`;
    try {
      writeFileSync(part, Buffer.from(await res.arrayBuffer()));
      // ★ `-ss` 를 안 준다 — 앞부분만 들고 있으므로 **첫 프레임**이 유일하게 확실한 자리다.
      if (await runFfmpeg(["-v", "error", "-i", part, "-frames:v", "1", "-y", out])) {
        const buf = readFileSync(out);
        if (buf.length > 1000) return { buf, kb };
      }
    } catch {} finally {
      for (const f of [part, out]) { try { unlinkSync(f); } catch {} }
    }
  }
  return null;
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const kept = [];
let dead = 0;
const abs = (u) => (u.startsWith("http") ? u : `${BASE}${u}`);

for (const p of cands) {
  if (kept.length >= WANT) break;
  let raw = null;
  let from = "";

  // ① 올린 사진이 **살아 있으면** 그것을 쓴다 — 가장 싸다(영상을 아예 안 건드린다).
  if (p.image_url) {
    const r = await fetch(`${abs(p.image_url)}${p.image_url.startsWith("http") ? "" : "?t=1"}`).catch(() => null);
    if (r?.ok) { raw = Buffer.from(await r.arrayBuffer()); from = "사진"; }
  }
  // ② 죽었으면 **영상 첫 장면**에서 뽑는다(앞부분만 받는다 — frameFromVideo 주석 참고).
  if (!raw) {
    const got = await frameFromVideo(abs(p.video_url));
    if (got) { raw = got.buf; from = `영상 ${got.kb}KB`; }
  }
  if (!raw) { dead += 1; continue; }               // ★ 둘 다 죽었으면 여기서 걸러진다

  // ★ **webp 로 굽는다.** 그전에는 받은 바이트를 그대로 `.webp` 이름으로 썼다(사진이
  //   jpg 여도). 영상에서 뽑은 것은 jpg 라 더 그렇다 — 이름과 내용을 맞춘다.
  const buf = await sharp(raw).webp({ quality: 82 }).toBuffer().catch(() => null);
  const meta = buf ? await sharp(buf).metadata().catch(() => null) : null;
  if (!meta?.width || !meta?.height) { dead += 1; continue; }
  const file = `${String(kept.length + 1).padStart(2, "0")}.webp`;
  writeFileSync(join(OUT_DIR, file), buf);
  kept.push({ file, w: meta.width, h: meta.height, id: p.id, kb: Math.round(buf.length / 1024) });
  console.log(`  ✓ ${file}  ${meta.width}x${meta.height}  ${Math.round(buf.length / 1024)}KB  (${from})`);
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
