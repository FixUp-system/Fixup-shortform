// 탐침 3 — **같은 시나리오·같은 프롬프트로 GPT Image 2** 를 뽑는다.
//
// 탐침 2(nano-banana-2)와 **한 변수만** 다르게 한다: 이미지 모델.
// 시나리오를 다시 만들지 않고 probe-scenario.json 을 그대로 읽는다 — 시나리오가 달라지면
// 무엇 때문에 그림이 달라졌는지 못 가른다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/storyboard-gpt-image-2.mjs [quality]
//     quality: high(기본) · medium · low · auto
//
// ★ 파라미터가 nano-banana-2 와 **다르다**(fal 문서 확인):
//     nano-banana-2 : aspect_ratio("21:9"…) + resolution("4K")
//     gpt-image-2   : image_size("landscape_16_9"…) + quality("high"|"medium"|"low"|"auto")
//   image_size 값: square_hd · square · portrait_4_3 · portrait_16_9 · landscape_4_3 · landscape_16_9
//
// 값(fal 공식표, 3840×2160 기준): low $0.012 · medium $0.101 · high $0.401
// ⚠️ 진짜 호출이다. 원장(cost_records)은 안 거친다 — 탐침 1·2 와 같은 이유.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { AD_STYLE_LINES, AD_MOODS } from "../../lib/ad/options.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

if (!existsSync("probe-scenario.json")) {
  throw new Error("probe-scenario.json 이 없다 — storyboard-from-scenario.mjs 를 먼저 돌려라");
}
const scenario = JSON.parse(readFileSync("probe-scenario.json", "utf8"));
const shots = Array.isArray(scenario.shots) ? scenario.shots : [];
const settings = { format: "story", mood: "warm", narration_lang: "ko", style: "photo", seconds: 15 };

// ── 프롬프트 조립 — 탐침 2 와 **글자 그대로 같은 함수**여야 한다 ────────────
// (한 변수만 바꾸는 것이 이 탐침의 전부다. 여기가 갈리면 비교가 무의미해진다.)
const one = (v) => (typeof v === "string" ? v.trim() : "");
function buildStoryboardPrompt(sc, st) {
  const n = (sc.shots || []).length;
  const head =
    `A ${n}-panel storyboard laid out as a single wide strip, ${n} vertical 9:16 frames ` +
    `placed side by side in a row, in order from left to right, with a thin clean gap between panels.`;
  const keep = [];
  if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
  if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
  if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);
  const panels = (sc.shots || []).map((s, i) => {
    const bits = [one(s.shows)];
    if (one(s.camera)) bits.push(one(s.camera));
    return `Panel ${i + 1}: ${bits.filter(Boolean).join(", ")}.`;
  });
  const mood = AD_MOODS.find((m) => m.id === st.mood)?.line || "";
  const style = AD_STYLE_LINES[st.style] || "";
  const tone = one(sc.tone);
  const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
    .filter(Boolean).join(". ");
  const ban = "No text, no letters, no numbers, no labels or logos anywhere in the image.";
  return [head, keep.join(" "), panels.join("\n"), look, ban].filter(Boolean).join("\n\n");
}

const prompt = buildStoryboardPrompt(scenario, settings);

// 탐침 2 가 쓴 프롬프트와 **정말 같은지** 대조한다. 다르면 비교가 성립하지 않으므로 멈춘다.
if (existsSync("probe-storyboard-prompt.txt")) {
  const before = readFileSync("probe-storyboard-prompt.txt", "utf8");
  if (before.trim() !== prompt.trim()) {
    console.log("⚠️ 탐침 2 의 프롬프트와 다르다 — 한 변수만 바꾸는 비교가 깨진다. 멈춘다.");
    process.exit(1);
  }
  console.log("✅ 탐침 2 와 프롬프트가 글자 그대로 같다 — 모델만 다르다.\n");
}

// 3칸이면 16:9 가 가장 가깝다(탐침 2 도 같은 이유로 16:9 였다).
const SIZE_BY_PANELS = { 2: "square_hd", 3: "landscape_16_9", 4: "landscape_16_9" };
const n = shots.length;
const image_size = SIZE_BY_PANELS[n];
if (!image_size) { console.log(`⚠️ 컷이 ${n}개다 — 맞는 크기가 없다. 멈춘다.`); process.exit(0); }

const quality = process.argv[2] || "high";
const PRICE = { low: "$0.012", medium: "$0.101", high: "$0.401", auto: "?" }[quality] || "?";
console.log(`뽑는 중 — openai/gpt-image-2 · image_size=${image_size} · quality=${quality} (${PRICE}) …`);

const res = await fetch("https://fal.run/openai/gpt-image-2", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({ prompt, image_size, quality, num_images: 1 }),
});
if (!res.ok) {
  console.log(`거절 ${res.status}: ${(await res.text()).slice(0, 500)}`);
  console.log("\n★ 422 면 위 메시지가 **받는 값 목록**을 알려 준다 — 그대로 고치면 된다.");
  process.exit(1);
}
const data = await res.json();
const url = data?.images?.[0]?.url;
const w = data?.images?.[0]?.width, h = data?.images?.[0]?.height;
console.log(`성공 — ${w ?? "?"}×${h ?? "?"}`);
console.log(`URL: ${url}`);
const out = `storyboard-gpt2-${quality}.png`;
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(out, buf);
console.log(`내려받음: ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
console.log(`\n비교 대상: storyboard2.png (nano-banana-2 4K, $0.16)`);
