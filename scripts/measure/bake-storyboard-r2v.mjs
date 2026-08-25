// ★★ 스토리보드 **한 장을 통째로** 참조로 주고 영상 하나를 굽는다 (r2v).
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/bake-storyboard-r2v.mjs <스토리보드png> <시나리오json> [행] [열] [해상도] [초]
//
// 근거: Seedance 2.0 가이드 §3.2 「다중 패널 시퀀스 참조」. 우리는 그 기능을 **이미지 생성**
//   쪽으로만 써 봤고 영상 모델에 스토리보드를 통째로 주는 것은 처음이다.
// 재는 것: 모델이 격자를 **장면 순서**로 읽는가, 아니면 **분할 화면**으로 그리는가.
//   되면 컷별 굽기·합성·페이드가 통째로 필요 없어진다(그리고 더 싸다).
// ⚠️ 진짜 호출이다(480p 15초 ≈$2.02).
import { readFileSync, writeFileSync } from "fs";
import { CLIP_PROFILES, fitDurationFor } from "../../lib/clip-limits.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
const board = process.argv[2] || "storyboard-gpt-15s.png";
const scFile = process.argv[3] || "reel-scenario-15s.json";
const rows = Number(process.argv[4]) || 2;
const cols = Number(process.argv[5]) || 3;
const resolution = process.argv[6] || "480p";
const wantSec = Number(process.argv[7]) || 15;

const profile = CLIP_PROFILES.find((p) => p.prefix === "bytedance/seedance-2.0");
const duration = fitDurationFor(profile, wantSec);
const sc = JSON.parse(readFileSync(scFile, "utf8"));
const n = rows * cols;

// ★★ 패널을 **순서**로 읽게 못 박는다. 이 문장이 없으면 모델이 격자를 그대로 움직여
//   분할 화면을 만들 위험이 크다 — 이 탐침이 재려는 것이 정확히 그 갈림이다.
const head =
  `The attached reference image is a ${n}-panel storyboard laid out as a ${rows}-row by ${cols}-column grid, ` +
  `read in order left to right across each row, top row first. ` +
  `Use those panels as the shot sequence for this film, in that order. ` +
  `Do NOT show the grid, panel borders, or any split screen — render one single continuous vertical film that moves through those shots.`;
const prompt = `${head}\n\n${sc.text}`;

const bytes = readFileSync(board);
const PER_SEC = { "480p": 0.1348, "720p": 0.3034, "1080p": 0.682 }[resolution];
console.log(`참조: ${board} (${Math.round(bytes.length / 1024)}KB) · ${rows}×${cols} ${n}칸`);
console.log(`${resolution} ${duration}초 · $${(PER_SEC * duration).toFixed(3)}\n굽는 중 …`);

const res = await fetch("https://fal.run/bytedance/seedance-2.0/reference-to-video", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({
    image_urls: [`data:image/png;base64,${bytes.toString("base64")}`],
    prompt, duration, aspect_ratio: "9:16", resolution, ...(profile.extra || {}),
  }),
});
if (!res.ok) throw new Error(`실패 (${res.status}) ${(await res.text()).slice(0, 400)}`);
const url = (await res.json())?.video?.url;
if (!url) throw new Error("영상이 비었다");
const out = "storyboard-r2v.mp4";
writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log(`\n내려받음: ${out}\nfal URL: ${url}`);
