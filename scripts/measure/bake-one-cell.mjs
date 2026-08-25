// 게이트 B — **스토리보드 칸 하나를 i2v 로 굽는다.**
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/bake-one-cell.mjs <칸png> <컷번호> [해상도] [초]
//
// 재는 것: 잘라낸 칸이 첫 프레임으로 쓸 만한가 · 움직임이 자연스러운가 · 제품이 유지되는가.
// ⚠️ 진짜 호출이다(480p 4초 ≈$0.54). 원장은 안 거친다 — 탐침 규약(actor 가 uuid 를 요구한다).
// ★ 페이로드는 lib/i2v.js 의 generateClip 과 **같은 모양**이어야 한다. 프로필에서 뽑는다.
import { readFileSync } from "fs";
import { CLIP_PROFILES, fitDurationFor } from "../../lib/clip-limits.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

const cellFile = process.argv[2] || "gcell-3.png";
const cutNo = Number(process.argv[3]) || 3;
const resolution = process.argv[4] || "480p";
const wantSec = Number(process.argv[5]) || 4;

const profile = CLIP_PROFILES.find((p) => p.prefix === "bytedance/seedance-2.0");
const duration = fitDurationFor(profile, wantSec);
const endpoint = "bytedance/seedance-2.0/image-to-video";

const prompts = JSON.parse(readFileSync("reel-clip-prompts.json", "utf8"));
const entry = prompts.find((p) => p.n === cutNo);
if (!entry) throw new Error(`컷 ${cutNo} 프롬프트가 없다`);
// ★ 참조 없이 간다 = i2v. 스토리보드 칸은 **완성된 구도**라 첫 프레임으로 쓰는 것이 맞다
//   (r2v 는 그 구도를 버린다 — 2026-08-24 wiki §4).
const prompt = entry.plain;

const bytes = readFileSync(cellFile);
const imageUrl = `data:image/png;base64,${bytes.toString("base64")}`;

const PER_SEC = { "480p": 0.1348, "720p": 0.3034, "1080p": 0.682 }[resolution];
console.log(`칸: ${cellFile} (${Math.round(bytes.length / 1024)}KB) · 컷 ${cutNo} · ${resolution} ${duration}초 · $${(PER_SEC * duration).toFixed(3)}`);
console.log(`프롬프트: ${prompt.slice(0, 110)} …\n굽는 중 …`);

const res = await fetch(`https://fal.run/${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({
    image_url: imageUrl, prompt, duration, aspect_ratio: "9:16", resolution,
    ...(profile.extra || {}),
  }),
});
if (!res.ok) throw new Error(`실패 (${res.status}) ${(await res.text()).slice(0, 300)}`);
const data = await res.json();
const url = data?.video?.url;
if (!url) throw new Error(`영상이 비었다: ${JSON.stringify(data).slice(0, 200)}`);
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const out = `clip-cut${cutNo}.mp4`;
readFileSync; (await import("fs")).writeFileSync(out, buf);
console.log(`\n내려받음: ${out} (${(buf.length / 1024).toFixed(0)} KB)\nfal URL: ${url}`);
