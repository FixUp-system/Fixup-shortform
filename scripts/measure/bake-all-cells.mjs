// 스토리보드 칸 아홉을 **전부** 굽고 한 편으로 잇는다 — 게이트 15(한 편 관통)의 축소판.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/bake-all-cells.mjs [해상도]
//
// ★ 이미 구운 컷은 건너뛴다(clip-cutN.mp4 가 있으면) — lib/reel/pipeline.js 의 N5 와 같은 처방.
//   그래야 중간에 죽어도 다시 돌릴 때 값이 두 번 안 나간다.
// ★ 클립은 모델 최소(4초)로 굽고, 합성이 **시나리오 초로 자른다** — lib/compose.js 의
//   `trim=duration=` 과 같은 규약이다. 그래서 완성본이 정확히 30초가 된다.
// ⚠️ 진짜 호출이다. 컷당 480p 4초 ≈$0.54.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { CLIP_PROFILES, fitDurationFor } from "../../lib/clip-limits.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
const resolution = process.argv[2] || "480p";
const PER_SEC = { "480p": 0.1348, "720p": 0.3034, "1080p": 0.682 }[resolution];
const profile = CLIP_PROFILES.find((p) => p.prefix === "bytedance/seedance-2.0");
const prompts = JSON.parse(readFileSync("reel-clip-prompts.json", "utf8"));
const scenario = JSON.parse(readFileSync("reel-scenario-9.json", "utf8"));

let spent = 0;
for (const p of prompts) {
  const out = `clip-cut${p.n}.mp4`;
  if (existsSync(out)) { console.log(`컷 ${p.n}: 이미 있음 — 건너뜀`); continue; }
  const duration = fitDurationFor(profile, p.seconds);
  const bytes = readFileSync(`gcell-${p.n}.png`);
  console.log(`컷 ${p.n}/9 굽는 중 (${duration}초, $${(PER_SEC * duration).toFixed(3)}) …`);
  const res = await fetch("https://fal.run/bytedance/seedance-2.0/image-to-video", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
    body: JSON.stringify({
      image_url: `data:image/png;base64,${bytes.toString("base64")}`,
      prompt: p.plain, duration, aspect_ratio: "9:16", resolution, ...(profile.extra || {}),
    }),
  });
  if (!res.ok) { console.log(`  ✗ 실패 (${res.status}) ${(await res.text()).slice(0, 200)}`); continue; }
  const url = (await res.json())?.video?.url;
  if (!url) { console.log("  ✗ 영상이 비었다"); continue; }
  writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
  spent += PER_SEC * duration;
  console.log(`  ✓ ${out}`);
}
console.log(`\n이번에 쓴 값: $${spent.toFixed(3)}`);

// ── 합성 — 시나리오 초로 자르고 잇는다 ──────────────────────────────────────
const ff = (await import("ffmpeg-static")).default;
const have = prompts.filter((p) => existsSync(`clip-cut${p.n}.mp4`));
if (have.length < prompts.length) {
  console.log(`⚠️ ${have.length}/${prompts.length} 컷만 있다 — 있는 것만 잇는다.`);
}
const args = [];
have.forEach((p) => args.push("-i", `clip-cut${p.n}.mp4`));
const filters = have.map((p, i) =>
  `[${i}:v]trim=duration=${p.seconds},setpts=PTS-STARTPTS,scale=496:864,setsar=1[v${i}]`
).join(";");
const concat = have.map((_, i) => `[v${i}]`).join("") + `concat=n=${have.length}:v=1:a=0[outv]`;
args.push("-filter_complex", `${filters};${concat}`, "-map", "[outv]", "-r", "24", "-y", "reel-final.mp4");
console.log("\n합성 중 (ffmpeg) …");
execFileSync(ff, ["-v", "error", ...args]);
const total = have.reduce((a, p) => a + p.seconds, 0);
console.log(`완성: reel-final.mp4 (${total}초, 컷 ${have.length}개)`);
