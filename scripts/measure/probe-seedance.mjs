// Seedance 2.0 fast 탐침 — 값을 치르기 전에 확인한다.
//   ① 오디오가 나오는가 (안 나오면 광고 v1 의 전제가 무너진다 — 자막도 소리도 없는 영상이 된다)
//   ② 한국어 발화가 납품 가능한가
//   ③ (선택) reference-to-video 가 로고·라벨 글자를 얼마나 지키는가 — 이미지 경로를 주면 잰다
//
// ⚠️ 이 스크립트는 우리 원장(cost_records)을 안 거친다 — fal 을 직접 부른다.
//    예산 가드(assertBudget)도 안 탄다. 쓴 돈은 fal 대시보드에서 확인한다.
//
// 실행: node scripts/measure/probe-seedance.mjs [로고이미지경로]
//   .env.local 에서 FAL_KEY 를 읽는다(환경변수가 이미 있으면 그것을 쓴다).
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const SECONDS = 4;                      // 최소 길이로 잰다 — 값을 아끼려고
const BASE = "bytedance/seedance-2.0/fast";
const OUT_DIR = process.env.PROBE_OUT_DIR || "probe-out";

// .env.local 을 직접 읽는다. 측정 스크립트는 Next 를 안 거치므로 자동 로드가 없다.
async function loadEnvLocal() {
  if (process.env.FAL_KEY) return;
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // 없으면 환경변수에 기대한다
  }
}

async function call(endpointPath, input) {
  const url = `https://fal.run/${BASE}/${endpointPath}`;
  console.log(`\n→ POST ${url}`);
  console.log(`  body: ${JSON.stringify({ ...input, image_urls: input.image_urls ? `[${input.image_urls.length}장 생략]` : undefined })}`);
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  console.log(`  ← ${res.status} (${Math.round((Date.now() - started) / 1000)}초)`);
  if (!res.ok) throw new Error(`${endpointPath} 실패 (${res.status})\n${text.slice(0, 800)}`);
  return JSON.parse(text);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`내려받기 실패 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, bytes);
  return bytes.length;
}

await loadEnvLocal();
if (!process.env.FAL_KEY) throw new Error("FAL_KEY 가 필요해요 (.env.local 또는 환경변수)");
await mkdir(OUT_DIR, { recursive: true });

const logoPath = process.argv[2];
const results = {};

// ── ① + ② 한국어 나레이션이 있는 text-to-video ──────────────────────────
// 프롬프트에 "한국어로 말한다"를 명시한다. 별도 언어 파라미터가 있는지 모르는 상태라
// 지금 우리가 쓸 수 있는 유일한 방법이 이것이고, 그것이 통하는지가 확인 대상이다.
const t2v = await call("text-to-video", {
  prompt:
    "Vertical commercial. A premium skincare ampoule bottle stands on a pale marble table, " +
    "soft window light from the left. Slow push-in on the bottle, then a hand lifts it into frame. " +
    "A calm Korean female voiceover speaks in Korean: \"매일 아침, 피부가 달라집니다.\" " +
    "Premium and restrained mood, live-action cinematic footage, shallow depth of field.",
  duration: SECONDS,
  aspect_ratio: "9:16",
  resolution: "720p",
});
results.t2v = t2v;
console.log("  응답 최상위 키:", Object.keys(t2v).join(", "));
const t2vUrl = t2v?.video?.url;
console.log("  video.url:", t2vUrl ? "있음" : "★ 없음 — 응답 모양이 다르다");
if (t2vUrl) {
  const dest = path.join(OUT_DIR, "probe-t2v.mp4");
  const size = await download(t2vUrl, dest);
  console.log(`  내려받음: ${dest} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

// ── ③ 로고를 참조로 넣은 reference-to-video (경로를 줬을 때만) ───────────
if (logoPath) {
  const bytes = await readFile(logoPath);
  const ext = logoPath.split(".").pop().toLowerCase();
  const mime = ext === "jpg" ? "jpeg" : ext;
  const dataUri = `data:image/${mime};base64,${bytes.toString("base64")}`;
  const r2v = await call("reference-to-video", {
    prompt:
      "The product from the reference image sits on a clean studio backdrop. " +
      "Slow orbit around it, then a close-up on the label. Keep the product and its label exactly as in the reference.",
    image_urls: [dataUri],
    duration: SECONDS,
    aspect_ratio: "9:16",
    resolution: "720p",
  });
  results.r2v = r2v;
  const r2vUrl = r2v?.video?.url;
  console.log("  video.url:", r2vUrl ? "있음" : "★ 없음");
  if (r2vUrl) {
    const dest = path.join(OUT_DIR, "probe-r2v.mp4");
    const size = await download(r2vUrl, dest);
    console.log(`  내려받음: ${dest} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }
} else {
  console.log("\n③ 로고 정확도: 건너뜀 — 이미지 경로를 인자로 주면 잰다");
}

await writeFile(path.join(OUT_DIR, "probe-result.json"), JSON.stringify(results, null, 2));
console.log(`\n응답 원문: ${path.join(OUT_DIR, "probe-result.json")}`);
console.log("★ 다음: 내려받은 mp4 에 오디오 트랙이 있는지, 한국어가 들리는지 확인한다");
