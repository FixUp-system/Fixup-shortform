// 탐침 2 — **우리 시나리오로** 스토리보드를 뽑는다.
//
// 탐침 1 의 한계를 메운다: 거기서 쓴 프롬프트는 내가 손으로 쓴 이상적인 것이었다.
// 이번에는 우리 파이프라인이 실제로 낸 시나리오만으로 조립한다. 손으로 보태지 않는다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/storyboard-from-scenario.mjs
//   ⚠️ --import 가 **필수**다 — lib/ad/scenario.js 가 ../vlm.js 를 끌고, 그 파일이
//      확장자 없는 `./fake` 를 써서 맨 node 로는 못 푼다.
//
// 값: 시나리오 LLM(claude-fable-5) 몇 센트 + 이미지 4K $0.16.
// ⚠️ 진짜 호출이다. 원장(cost_records)은 안 거친다 — probe-scenario.mjs 와 같은 이유
//    (이 스크립트는 배선이 아니라 프롬프트 품질을 잰다).
//
// ★ import 를 **가볍게** 유지한다. lib 곳곳에 확장자 없는 상대 import 가 있어서
//   (`./fake`·`./costs`·`./script` …) 맨 node 로는 못 푼다 — Next 번들러만 푼다.
//   로더(ext-loader.mjs)가 그 자리를 메운다. 더해서 generateScenario·validateScenario 는
//   안 쓴다 — 원장·예산 사슬을 끌기 때문이다(아래 ★★ 참고).
import { readFileSync, writeFileSync } from "fs";
import { buildScenarioMessages } from "../../lib/ad/scenario.js";
import { SCENARIO_SCHEMA, CLAUDE_MODEL } from "../../lib/ad/llm.js";
import { AD_STYLE_LINES, AD_MOODS } from "../../lib/ad/options.js";
// ★★ callJson 을 안 쓰고 Anthropic 을 **직접** 부른다 — probe-scenario.mjs 와 같은 선택이다.
//   callJson 은 assertBudget → costActor → creditStateFor 를 지나는데, 그 사슬이
//   actor 를 **uuid 로** 요구한다("admin" 은 DB 층에서 uuid 파싱 실패로 죽는다).
//   이 스크립트는 배선이 아니라 프롬프트 품질을 재므로 원장을 안 거치는 것이 옳다.

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

// ── ① 시나리오를 진짜로 만든다 ──────────────────────────────────────────────
const project = {
  id: undefined,
  material: {
    text: "원두 정기배송 서비스. 매주 목요일에 갓 볶은 원두 200g 이 집으로 온다. 첫 달은 반값이고 언제든 그만둘 수 있다.",
    photos: [],
  },
  settings: {
    format: "story", mood: "warm", narration_lang: "ko", style: "photo",
    seconds: 15, aspect_ratio: "9:16",
  },
};

console.log("① 시나리오 만드는 중 (claude-fable-5) …");
const CLAUDE_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!CLAUDE_KEY) throw new Error("CLAUDE_API_KEY 를 못 찾았다");
const { system, messages } = buildScenarioMessages(project);
const scRes = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  // ★ thinking 필드를 아예 안 보낸다 — Fable 은 사고가 항상 켜져 있다(lib/ad/llm.js 와 같은 이유).
  body: JSON.stringify({
    model: CLAUDE_MODEL, max_tokens: 4096, system, messages,
    output_config: { format: { type: "json_schema", schema: SCENARIO_SCHEMA } },
  }),
});
if (!scRes.ok) throw new Error(`시나리오 실패 (${scRes.status}) ${(await scRes.text()).slice(0, 400)}`);
const scData = await scRes.json();
const scText = (scData.content || []).find((c) => c?.type === "text")?.text ?? "";
const scenario = JSON.parse(scText);
writeFileSync("probe-scenario.json", JSON.stringify(scenario, null, 2));
const shots = Array.isArray(scenario.shots) ? scenario.shots : [];
console.log(`   컷 ${shots.length}개`);
console.log(`   look      = ${JSON.stringify(scenario.look)}`);
console.log(`   wardrobe  = ${JSON.stringify(scenario.wardrobe)}`);
console.log(`   environment = ${JSON.stringify(scenario.environment)}`);
console.log(`   tone      = ${JSON.stringify(scenario.tone)}`);
console.log(`   저장: probe-scenario.json\n`);

// ── ② 시나리오만으로 스토리보드 프롬프트를 조립한다 ────────────────────────
//
// ★ 이 함수가 이번 탐침의 진짜 산출물이다 — 나중에 lib 로 옮길 후보다.
const PRESET_BY_PANELS = { 2: "1:1", 3: "16:9", 4: "21:9" };
const one = (v) => (typeof v === "string" ? v.trim() : "");

function buildStoryboardPrompt(sc, settings) {
  const n = (sc.shots || []).length;

  // 판형 — 코드가 붙이는 유일한 자리(컷 수에서 나온다).
  const head =
    `A ${n}-panel storyboard laid out as a single wide strip, ${n} vertical 9:16 frames ` +
    `placed side by side in a row, in order from left to right, with a thin clean gap between panels.`;

  // 일관성 — **한 번만** 말한다. 컷마다 반복하지 않는 것이 이 방식의 요점이다.
  const keep = [];
  if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
  if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
  if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);

  // 컷별 장면 — shows 가 본문, camera 가 있으면 덧붙인다.
  const panels = (sc.shots || []).map((s, i) => {
    const bits = [one(s.shows)];
    if (one(s.camera)) bits.push(one(s.camera));
    return `Panel ${i + 1}: ${bits.filter(Boolean).join(", ")}.`;
  });

  // 분위기·화풍 — 우리 표에서 그대로.
  const mood = AD_MOODS.find((m) => m.id === settings.mood)?.line || "";
  const style = AD_STYLE_LINES[settings.style] || "";
  const tone = one(sc.tone);
  const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
    .filter(Boolean).join(". ");

  const ban = "No text, no letters, no numbers, no labels or logos anywhere in the image.";
  return [head, keep.join(" "), panels.join("\n"), look, ban].filter(Boolean).join("\n\n");
}

const prompt = buildStoryboardPrompt(scenario, project.settings);
writeFileSync("probe-storyboard-prompt.txt", prompt);
console.log("② 조립한 프롬프트 (probe-storyboard-prompt.txt 에도 저장)");
console.log("─".repeat(70));
console.log(prompt);
console.log("─".repeat(70) + "\n");

// ── ③ 뽑는다 ────────────────────────────────────────────────────────────────
const n = shots.length;
const aspect = PRESET_BY_PANELS[n];
if (!aspect) {
  console.log(`⚠️ 컷이 ${n}개다 — 가로 한 줄로는 프리셋이 없다(5컷 이상은 격자가 필요).`);
  console.log("   프롬프트만 확인하고 멈춘다. 이미지는 안 뽑는다(값을 안 쓴다).");
  process.exit(0);
}
console.log(`③ 이미지 뽑는 중 — ${n}칸 → aspect_ratio=${aspect}, 4K ($0.16) …`);
const res = await fetch("https://fal.run/fal-ai/nano-banana-2", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({ prompt, aspect_ratio: aspect, num_images: 1, resolution: "4K" }),
});
if (!res.ok) { console.log(`   거절 ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const url = (await res.json())?.images?.[0]?.url;
console.log(`   URL: ${url}`);
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync("storyboard2.png", buf);
console.log(`   내려받음: storyboard2.png (${(buf.length / 1024).toFixed(0)} KB)`);
