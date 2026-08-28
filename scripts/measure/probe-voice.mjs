// Seedance 가 **목소리를 실제로 바꿀 수 있는가** — 값을 더 치르기 전에 확인한다.
//
//   node scripts/measure/probe-voice.mjs
//
// ★ 왜 필요한가(2026-08-24 사장님 지적: "나레이션 톤이 모두 동일한데 맞는 건가요"):
//   fal 스키마 10개를 확인한 결과 **목소리 파라미터가 아예 없다**(voice·speaker·tts·tone).
//   있는 것은 `generate_audio`(켜기/끄기)와 r2v 의 `audio_urls`(문서상 리듬·립싱크 정렬용)뿐.
//   즉 목소리를 바꿀 수 있는 자리는 **프롬프트 글 한 줄**밖에 없는데, 그것이 실제로
//   먹히는지는 아무도 안 쟀다. 우리 시나리오가 늘 비슷한 값("20대 후반 한국 여성")을
//   내 왔기 때문에(최근 6건 중 5건) **모델이 못 하는 건지 우리가 안 시킨 건지 구분이 안 된다.**
//
// ⚠️ 진짜 돈이 나간다. 4초 × 2회 × 480p ≈ $1.08. 우리 원장(cost_records)은 안 거친다
//    — probe-seedance.mjs 와 같은 규율이다(배선이 아니라 모델의 성질을 잰다).
//
// ★★ 판정은 **귀가 아니라 숫자**다. 사람이 "다르게 들린다"고 말하는 것은 재현이 안 된다.
//    오디오를 뽑아 **기본 주파수(F0)** 를 재면 성별·나이대가 숫자로 갈린다:
//      50대 남성 ≈ 85~155Hz · 성인 여성 ≈ 165~255Hz · 아동 ≈ 250~350Hz
//    정반대 둘을 시켰는데 F0 가 안 벌어지면 **모델이 못 하는 것**이다.
import { readFile, writeFile, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";

const SECONDS = 4;          // 스키마 최소값 — 값을 아끼려고
const RESOLUTION = "480p";  // 가장 싼 해상도. 목소리를 재는 데 화질은 상관없다
const ENDPOINT = "bytedance/seedance-2.0/text-to-video"; // 사진이 필요 없는 갈래
const OUT_DIR = "probe-out/voice";

// ★ 장면·대사를 **똑같이** 두고 목소리 줄만 바꾼다 — 그래야 차이의 원인이 목소리 지시
//   하나로 좁혀진다(변수를 둘 이상 바꾸면 무엇 때문인지 못 가린다).
const SCENE =
  "A plain grey studio with a single ceramic mug on a wooden table. " +
  "Very slow push-in, soft even light, nothing else moves.";
const LINE = "오늘도 좋은 하루 보내세요.";

const CASES = [
  { key: "man50", voice: "a man in his fifties, deep and gravelly, slow and heavy, low chest voice" },
  { key: "girl10", voice: "a young girl around ten years old, very high and bright, light and excited" },
];

async function loadEnvLocal() {
  if (process.env.FAL_KEY) return;
  const text = await readFile(".env.local", "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
await loadEnvLocal();
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 가 필요해요 (.env.local)");

const auth = { Authorization: `Key ${KEY}` };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate({ key, voice }) {
  const prompt =
    `${SCENE}\n\nVoice: ${voice}. This describes how the narration sounds — ` +
    `it is audio only, never on-screen text.\n\n` +
    `The narrator says "${LINE}"`;

  console.log(`\n[${key}] 접수 — ${voice.slice(0, 50)}…`);
  const res = await fetch(`https://queue.fal.run/${ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    // duration 은 문자열 enum 이다(스키마 실측) — 여기서는 스키마대로 보낸다.
    body: JSON.stringify({ prompt, duration: String(SECONDS), resolution: RESOLUTION, aspect_ratio: "9:16" }),
  });
  if (!res.ok) throw new Error(`[${key}] 접수 실패 ${res.status} ${(await res.text()).slice(0, 300)}`);
  const { status_url, response_url } = await res.json();

  const started = Date.now();
  for (;;) {
    await wait(4000);
    const st = await (await fetch(status_url, { headers: auth })).json();
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED") throw new Error(`[${key}] 생성 실패: ${JSON.stringify(st).slice(0, 300)}`);
    process.stdout.write(".");
    if (Date.now() - started > 12 * 60_000) throw new Error(`[${key}] 12분 넘음`);
  }
  const out = await (await fetch(response_url, { headers: auth })).json();
  const url = out?.video?.url;
  if (!url) throw new Error(`[${key}] 영상 url 이 없다: ${JSON.stringify(out).slice(0, 300)}`);
  console.log(` 완성 (${Math.round((Date.now() - started) / 1000)}초)`);

  await mkdir(OUT_DIR, { recursive: true });
  const mp4 = path.join(OUT_DIR, `${key}.mp4`);
  await writeFile(mp4, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return mp4;
}

// mp4 → 16kHz 모노 wav. ffmpeg 는 이미 의존성에 있다(ffmpeg-static).
async function toWav(mp4) {
  const { default: ffmpeg } = await import("ffmpeg-static");
  const wav = mp4.replace(/\.mp4$/, ".wav");
  await new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, ["-y", "-i", mp4, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav], { stdio: "ignore" });
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg 실패 (${c}) — 오디오가 없을 수 있다`))));
    p.on("error", reject);
  });
  return wav;
}

const files = [];
for (const c of CASES) files.push({ ...c, mp4: await generate(c) });
for (const f of files) f.wav = await toWav(f.mp4);

console.log(`\n${"=".repeat(64)}`);
console.log("영상·오디오 저장:", OUT_DIR);
console.log("이제 F0 를 잰다 — scripts/measure/voice-f0.py");
console.log(files.map((f) => `  ${f.key}: ${f.wav}`).join("\n"));
console.log(`\n예상 비용: 4초 × ${CASES.length}회 × $0.1348/s ≈ $${(4 * CASES.length * 0.1348).toFixed(2)}`);
