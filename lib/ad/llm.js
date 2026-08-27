// Claude Fable JSON 호출 — 광고와 film 이 함께 쓰는 **유일한** 조각.
//
// ★ 스키마는 흐름마다 다르다: 광고는 아래 AD_SCENARIO_SCHEMA, film 은
//   lib/film/scenario.js 의 SCENARIO_SCHEMA 를 넘긴다.
//
// ★ lib/llm.js(OpenAI gpt-4o)는 기존 6단계 파이프라인 7곳이 매달려 있어 건드리지 않는다.
// 광고 경로(lib/ad/scenario.js)만 이 모듈을 쓴다.
//
// ★★ 실측(scripts/measure/probe-claude.mjs, 2026-08-13 두 번 호출)으로 확인한 것 —
// 문서만 보고 짐작하지 않았다. 아래 셋은 문서에 없거나 눈에 안 띄는 함정이었다:
//   ① usage 필드 이름이 다르다 — OpenAI 는 prompt_tokens/completion_tokens, Anthropic 은
//     input_tokens/output_tokens. lib/costs.js 의 estimateLlmCost 는 전자를 읽으므로
//     여기서 후자를 전자 이름으로 옮겨 넘긴다(안 옮기면 원가가 조용히 0으로 기록된다).
//   ② 응답 모양이 다르다 — data.content 는 배열이고 블록이 여럿이다. Fable 은 사고가
//     항상 켜져 있어 {type:"thinking", thinking:"", signature:"..."} 블록이 먼저 오고,
//     실제 JSON 은 {type:"text", text:"..."} 블록의 .text 문자열 안에 있다.
//   ③ output_config.format.schema 의 object 타입은 additionalProperties 를 **명시로
//     false** 로 주지 않으면 400 이 난다("must be explicitly set to false") — 문서를
//     읽는 것만으로는 몰랐을 함정이라 실측에서 처음 걸렸다.
// 그리고 정상 완료의 stop_reason 은 "end_turn" 이다. max_tokens 를 낮게 주면(첫 실측
// 300으로는 JSON이 중간에 잘렸다) "max_tokens" 로 끊긴다 — 그 경우는 JSON.parse 가
// 알아서 실패해 아래 재시도 루프가 잡는다.
import { fakeLlm } from "../fake.js";
import { assertBudget, addRecord, costActor, estimateLlmCost } from "../costs.js";
import { randomUUID } from "crypto";

// ★★ 모델 문자열은 여기 한 곳뿐이다. lib/costs.js 의 LLM_PRICE 키가 이 값과
// 같아야 한다 — 갈리면 단가표가 모델을 못 찾아 LLM_DEFAULT(gpt-4o 단가)로 떨어지고
// 원가가 실제의 1/5 로 기록된다.
export const CLAUDE_MODEL = "claude-fable-5";
const ENDPOINT_PREFIX = "anthropic/";

// SHOTFORM_FAKE=all 일 때 돌려주는 응답 — **광고 경로가 실제로 쓸 수 있는 시나리오**다.
//
// lib/llm.js 의 fakeResponse 는 shots:[] 라 lib/ad/scenario.js 의 validateScenario 가
// 장면 없음으로 보고 항상 null 을 준다 — SHOTFORM_FAKE=all 에서 광고 시나리오가 매번
// 실패하던 원인이 이것이었다. 여기는 광고 전용 모듈이라 광고가 요구하는 모양(text·shots)을
// 채워, 0원으로 전체 흐름이 끝까지 돈다.
// ★★ 2026-08-27 — 새 모양이다. 광고 시나리오에 남은 것은 셋뿐이다(text·angle·shots)
// 이고, 장면 칸도 셋(beat·line·seconds)이다. 가짜 응답이 옛 모양을 내면
// SHOTFORM_FAKE=all 로 개발할 때만 **사라진 칸이 화면에 보인다.**
function fakeAdResponse() {
  return {
    text:
      "A fake 15-second vertical ad. This prompt exists only to check wiring, not to be shot. " +
      "A product sits on a table as the light slowly comes up. " +
      'A calm voice says "가짜 나레이션입니다".',
    angle: "배선을 확인하려고 만든 가짜 시나리오입니다.",
    shots: [
      { beat: "제품이 등장한다", line: "가짜 나레이션입니다", seconds: 8 },
      { beat: "마무리", line: "", seconds: 7 },
    ],
  };
}

// 광고 시나리오가 요구하는 JSON 모양 — **칸 셋뿐이다**(2026-08-27).
//
//   text   영상 생성 모델에 그대로 들어갈 영어 프롬프트 한 편
//   angle  사장님이 읽는 한국어 한 줄
//   shots  자막을 태우려고 우리가 쓰는 목록 (beat·line·seconds)
//
// ★★ 그전에는 칸이 스무 개였다(cast·wardrobe·look·tone·music·focus·voice·environment·
//   endpoint + 장면 열 칸). 그 값들을 코드가 프롬프트 꼬리에 절로 덧붙였는데, text 와
//   중복되거나 한국어가 영어 프롬프트에 섞이거나 말이 안 되는 영어를 만들었다. 이제
//   Fable 이 일곱 단 양식으로 한 편을 쓰고(lib/ad/scenario.js 의 AD_SYSTEM) 코드는
//   아무것도 안 붙인다 — 그래서 물어볼 칸도 셋뿐이다.
// ★ film 의 스키마는 **lib/film/scenario.js 가 따로 들고 있다.** 두 흐름이 요구하는 것이
//   완전히 달라져서 2026-08-27 에 갈랐다 — 한 표에서 덜어 내던 방식이 오히려 낡는다.
//
// ⚠️ object 타입마다 additionalProperties:false 를 명시한다 — 실측에서 확인한 요구사항이다.
//   line 은 나레이션이 없는 장면도 있어 required 밖이다.
export const AD_SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    angle: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          line: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["beat", "seconds"],
        additionalProperties: false,
      },
    },
  },
  required: ["text", "angle", "shots"],
  additionalProperties: false,
};

// 재시도해도 되는 stop_reason — 정상 완료(end_turn)와 토큰 상한에 잘린 경우(max_tokens,
// JSON.parse 가 알아서 실패로 잡는다)뿐이다. 그 밖(예: 안전 분류기 거절)은 같은 프롬프트를
// 다시 보내도 같은 이유로 다시 막힐 뿐이라 재시도하지 않는다.
const RETRYABLE_STOP = new Set(["end_turn", "max_tokens"]);

// 원장에 남길 프롬프트 요약 — 사진 블록은 빼고 글만 잇는다.
function flatPrompt(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((c) => c?.type === "text").map((c) => c.text || "").join("\n");
}

function extractText(data) {
  const block = Array.isArray(data?.content) ? data.content.find((c) => c?.type === "text") : null;
  return block?.text ?? "";
}

// Claude Fable JSON 호출 헬퍼 — lib/llm.js 의 callJson 과 같은 계약을 지킨다
// (system·messages·stage·projectId 를 받아 파싱된 객체를 돌려준다). 파싱 실패 시 1회 재시도.
export async function callJson({
  system,
  messages,
  fetchImpl = fetch,
  apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  stage = "광고 시나리오",
  projectId,
  // ★ 경로마다 다른 스키마를 받는다(scenarioSchemaFor). 안 넘기면 예전 그대로 —
  //   film 과 옛 부르는 자리가 글자 그대로 안 바뀐다.
  schema = AD_SCENARIO_SCHEMA,
}) {
  // 키 검사보다 먼저 본다 — 완전 가짜 모드는 API 키 없이도 돌아야 한다(lib/llm.js 와 같은 순서)
  if (fakeLlm()) return fakeAdResponse();
  if (!apiKey) throw new Error("CLAUDE_API_KEY가 설정되지 않았어요");

  // amount 는 0 이다 — 토큰 수를 호출 전에는 모른다(lib/llm.js 와 같은 이유).
  await assertBudget({ projectId, endpoint: `${ENDPOINT_PREFIX}${CLAUDE_MODEL}`, amount: 0 });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      // ★★ thinking 필드를 아예 안 보낸다. Fable 은 사고가 항상 켜져 있고,
      // thinking:{type:"disabled"} 를 보내면 400 이 난다(생략이 정답 — CLAUDE.md 지시).
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system,
        messages,
        output_config: { format: { type: "json_schema", schema } },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM 호출 실패 (${res.status}) ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const model = data?.model || CLAUDE_MODEL;
    // 파싱에 실패해 재시도하더라도 호출한 값은 치렀다 — 그래서 파싱(또는 거절 판정) 앞에서
    // 기록한다(lib/llm.js 와 같은 순서). ① usage 이름 매핑 — Anthropic 은
    // input_tokens/output_tokens 인데 estimateLlmCost 는 prompt_tokens/completion_tokens
    // 를 읽는다. 안 옮기면 원가가 조용히 0으로 남는다.
    const usage = {
      prompt_tokens: data?.usage?.input_tokens,
      completion_tokens: data?.usage?.output_tokens,
    };
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `${ENDPOINT_PREFIX}${model}`,
      stage, user: costActor(), project_id: projectId,
      // ★ content 는 **문자열이거나 블록 배열**이다(사진을 붙이면 배열). 배열에 .slice(0,300)
      //   을 하면 배열이 돌아와 원장에 [object Object] 가 박힌다 — 글 블록만 골라 잇는다.
      prompt: flatPrompt(messages?.[0]?.content).slice(0, 300),
      duration: `${usage.prompt_tokens ?? 0}+${usage.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, usage), status: "done", video_url: "-",
    }).catch(() => {});

    // ★ 안전 분류기 거절 — end_turn·max_tokens 밖의 stop_reason 은 재시도하지 않고
    // 사장님에게 보일 오류로 바꾼다.
    if (!RETRYABLE_STOP.has(data?.stop_reason)) {
      throw new Error(
        `시나리오 생성이 거절됐어요 (${data?.stop_reason ?? "알 수 없음"}) — 표현을 바꿔서 다시 시도해 주세요`
      );
    }

    try {
      return JSON.parse(extractText(data));
    } catch {
      // 재시도 (max_tokens 로 잘려 파싱이 실패한 경우도 여기로 온다)
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
