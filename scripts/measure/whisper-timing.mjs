// 모델이 **언제 무슨 말을 했는가** — 자막 타이밍의 유일한 진실이다.
//
//   node scripts/measure/whisper-timing.mjs <오디오파일> [시나리오json]
//
// ★★ 왜 재는가: 우리 자막은 **컷 경계**를 기준으로 시각을 잡는데(lib/subtitles.js 의 buildCues),
//   통짜로 굽는 영상은 모델이 자기 리듬으로 말한다. 이 저장소가 이미 실측해 둔 어긋남이
//   1.8~2.7초다(같은 파일 주석). r2v 통짜는 한 클립 안이라 더 클 수 있다.
// ★ 결과는 `spoken_start`·`spoken_seconds` 로 들어갈 값이다 — buildCues 가 그 필드를 이미 읽는다.
// ⚠️ 진짜 호출이다(fal-ai/whisper, 15초 오디오면 $0.01 미만). 원장은 안 거친다 — 탐침 규약.
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

const file = process.argv[2] || "r2v-audio.mp3";
const scFile = process.argv[3] || "reel-scenario-15s.json";
const bytes = readFileSync(file);
console.log(`오디오: ${file} (${Math.round(bytes.length / 1024)}KB) → whisper …\n`);

const res = await fetch("https://fal.run/fal-ai/whisper", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({
    audio_url: `data:audio/mpeg;base64,${bytes.toString("base64")}`,
    task: "transcribe",
    language: "ko",
    chunk_level: "segment",
  }),
});
if (!res.ok) throw new Error(`실패 (${res.status}) ${(await res.text()).slice(0, 400)}`);
const data = await res.json();

const chunks = data.chunks || [];
console.log("■ 모델이 실제로 말한 것");
chunks.forEach((c, i) => {
  const [s, e] = c.timestamp || [];
  console.log(`  ${i + 1}. ${Number(s).toFixed(2)}s ~ ${Number(e).toFixed(2)}s  ${JSON.stringify(c.text.trim())}`);
});

// 계획과 대조 — 시나리오의 컷 초를 누적한 것이 우리가 자막을 띄우려던 시각이다.
try {
  const sc = JSON.parse(readFileSync(scFile, "utf8"));
  const shots = sc.shots || [];
  let t = 0;
  const planned = [];
  for (const s of shots) {
    if (s.line) planned.push({ at: t, text: s.line });
    t += Number(s.seconds) || 0;
  }
  console.log("\n■ 우리가 띄우려던 시각(컷 경계 누적)");
  planned.forEach((p, i) => console.log(`  ${i + 1}. ${p.at.toFixed(2)}s  ${JSON.stringify(p.text)}`));

  console.log("\n■ 어긋남");
  planned.forEach((p, i) => {
    const c = chunks[i];
    if (!c) return console.log(`  ${i + 1}. 실제 발화를 못 찾음`);
    const real = Number(c.timestamp?.[0]);
    const gap = real - p.at;
    console.log(`  ${i + 1}. 계획 ${p.at.toFixed(2)}s → 실제 ${real.toFixed(2)}s  (${gap >= 0 ? "+" : ""}${gap.toFixed(2)}초)`);
  });
} catch (e) {
  console.log("\n(시나리오 대조 건너뜀:", e.message + ")");
}
