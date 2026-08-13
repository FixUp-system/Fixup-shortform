// Claude Fable 탐침 — 응답 모양을 실제로 확인한다. 문서만 보고 파싱을 맞추지 않는다.
//   ① 최상위 키가 무엇인가 (choices 냐 content 냐 — OpenAI 와 다르다고 들었다)
//   ② content 배열의 모양 (텍스트 블록이 어디 있는가)
//   ③ usage 필드 이름 (input_tokens/output_tokens 인가)
//   ④ stop_reason (안전 분류기 거절을 이 값으로 봐야 한다)
//
// ⚠️ 이 스크립트는 우리 원장(cost_records)을 안 거친다 — Anthropic 을 직접 부른다.
//    예산 가드(assertBudget)도 안 탄다. 쓴 돈은 대략적으로만 찍는다(단가는 lib/costs.js 참고).
//
// 실행: node scripts/measure/probe-claude.mjs
//   .env.local 에서 CLAUDE_API_KEY 를 읽는다(환경변수가 이미 있으면 그것을 쓴다).
import { readFile } from "fs/promises";

const MODEL = "claude-fable-5";

// .env.local 을 직접 읽는다. 측정 스크립트는 Next 를 안 거치므로 자동 로드가 없다.
async function loadEnvLocal() {
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) return;
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

await loadEnvLocal();
const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("CLAUDE_API_KEY 가 필요해요 (.env.local 또는 환경변수)");

// 광고 시나리오 호출이 실제로 요구할 모양과 최대한 비슷하게 잰다 —
// text + shots 구조화 출력을 강제해서, 그 강제가 실제로 통하는지도 함께 본다.
// ★ 실측으로 알게 됨: object 타입은 additionalProperties: false 를 명시해야 한다
//   (안 넣으면 400 invalid_request_error — "For 'object' type, 'additionalProperties'
//   must be explicitly set to false"). OpenAI 의 json_object 모드와 다른 점이다.
const schema = {
  type: "object",
  properties: {
    text: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          camera: { type: "string" },
        },
        required: ["beat", "camera"],
        additionalProperties: false,
      },
    },
  },
  required: ["text", "shots"],
  additionalProperties: false,
};

const body = {
  model: MODEL,
  max_tokens: 1024,
  // ★★ thinking 필드를 아예 안 보낸다 — Fable 은 사고가 항상 켜져 있고,
  //    thinking: {type:"disabled"} 를 보내면 400 이 난다(생략이 정답).
  messages: [
    {
      role: "user",
      content:
        "15초 광고 영상의 짧은 지시문을 하나 써라. 제품: 프리미엄 앰플. " +
        "장면은 하나만 만들어라. JSON 스키마를 그대로 지켜라.",
    },
  ],
  output_config: { format: { type: "json_schema", schema } },
};

console.log(`→ POST https://api.anthropic.com/v1/messages (model=${MODEL})`);
const started = Date.now();
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`← ${res.status} (${Math.round((Date.now() - started) / 1000)}초)`);
if (!res.ok) throw new Error(`탐침 실패 (${res.status})\n${text.slice(0, 1000)}`);

const data = JSON.parse(text);

console.log("\n① 최상위 키:", Object.keys(data).join(", "));
console.log("\n② content 배열 모양:");
console.log(JSON.stringify(data.content, null, 2));
console.log("\n③ usage 필드:", JSON.stringify(data.usage));
console.log("\n④ stop_reason:", data.stop_reason);

console.log("\n원문 전체:");
console.log(JSON.stringify(data, null, 2));
