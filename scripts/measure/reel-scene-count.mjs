// reel 전용 장면 수 규칙이 **실제로 먹는가** — 진짜 API 를 한 번 불러 잰다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/reel-scene-count.mjs [초]
//   ⚠️ --import 가 필수다(lib/ad/scenario.js 가 확장자 없는 ./fake 사슬을 끈다).
//
// 재는 것 셋:
//   ① LLM 이 목록(3·4·6·9·10·12·16) 안에서 골랐는가
//   ② shots[].seconds 의 합이 전체 길이와 같은가
//   ③ 고른 수가 어느 격자로 떨어지는가
//
// ⚠️ 진짜 호출이다(claude-fable-5, 몇 센트). 원장은 안 거친다 — probe-scenario.mjs 와 같은
//    이유(배선이 아니라 프롬프트 품질을 잰다. callJson 사슬이 actor 를 uuid 로 요구한다).
import { readFileSync, writeFileSync } from "fs";
import { buildScenarioMessages, validateScenario } from "../../lib/ad/scenario.js";
import { reelSceneCountRule, REEL_CUT_CHOICES, REEL_GRIDS } from "../../lib/reel/scenario-rules.js";
import { SCENARIO_SCHEMA, CLAUDE_MODEL } from "../../lib/ad/llm.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("CLAUDE_API_KEY 를 못 찾았다");

const seconds = Number(process.argv[2]) || 30;
// ★ 두번째 인자로 컷 수를 강제한다 — **비교 실험용**이다(같은 소재를 6컷과 9컷으로).
//   reelSceneCountRule 을 베끼지 않고 그 뒤에 한 줄만 덧붙인다.
const force = Number(process.argv[3]) || 0;

const project = {
  material: {
    text:
      "집에서 간편하게 먹을 수 있는 밀키트 떡볶이. 조리법이 어렵지 않고 맛도 시중에서 " +
      "파는 것과 비슷해서 인기가 많은 제품이다. 퇴근 후 20대 여성이 간편하게 조리해서 먹는 모습.",
    photos: [],
  },
  settings: {
    format: "story", mood: "warm", narration_lang: "ko", style: "photo",
    seconds, aspect_ratio: "9:16",
  },
};

let rule = reelSceneCountRule(seconds);
if (force) rule += `
  ★ 이번에는 **${force}**를 고른다.`;
console.log(`① ${seconds}초 · 고를 수 있는 컷 수: ${REEL_CUT_CHOICES.join(" · ")}`);
console.log("   시나리오 만드는 중 (claude-fable-5) …\n");

const { system, messages } = buildScenarioMessages(project, { sceneCountRule: rule });
if (!system.includes("장면 수를 네가 고른다")) throw new Error("규칙이 system 에 안 실렸다");

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: CLAUDE_MODEL, max_tokens: 8192, system, messages,
    output_config: { format: { type: "json_schema", schema: SCENARIO_SCHEMA } },
  }),
});
if (!res.ok) throw new Error(`실패 (${res.status}) ${(await res.text()).slice(0, 400)}`);
const data = await res.json();
const raw = JSON.parse(data.content.find((b) => b.type === "text").text);
const sc = validateScenario(raw, 0);
if (!sc) throw new Error("검증 실패");

writeFileSync(process.env.OUT || "reel-scenario.json", JSON.stringify(sc, null, 2));

const n = sc.shots.length;
const sum = sc.shots.reduce((a, s) => a + (Number(s.seconds) || 0), 0);
const grid = REEL_GRIDS[n];
console.log(`② 컷 수: ${n} → ${REEL_CUT_CHOICES.includes(n) ? "✅ 목록 안" : "❌ 목록 밖"}`);
console.log(`③ 초 합: ${sum} / ${seconds} → ${sum === seconds ? "✅ 일치" : "❌ 어긋남"}`);
console.log(`④ 격자: ${grid ? `${grid.rows}×${grid.cols} (캔버스 ${grid.canvas})` : "없음"}`);
console.log(`\n   angle: ${sc.angle}`);
console.log(`   look: ${sc.look}`);
console.log(`   environment: ${sc.environment}\n`);
sc.shots.forEach((s, i) => {
  console.log(`   ${i + 1}. ${s.seconds}초 | ${(s.shows || "").slice(0, 72)}`);
});
console.log("\n   저장: reel-scenario.json");
