// 광고 시나리오 전용 LLM 호출 — Claude Fable.
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
// ★ Task 20 — SYSTEM 이 카메라·조명·모션·음향을 장면마다 요구하게 되면서
// lighting·sound·seconds 세 필드를 shots 에 더했다. 가짜 응답도 같은 모양을 낸다 —
// 안 그러면 SHOTFORM_FAKE=all 로 개발할 때만 옛 모양을 보게 된다.
function fakeAdResponse() {
  return {
    text:
      "가짜 시나리오입니다. 배선을 확인하려고 만든 지시문이라 실제 내용이 아닙니다. " +
      "제품이 테이블 위에 놓이고 천천히 조명이 켜집니다.",
    shots: [
      {
        beat: "제품이 등장한다", camera: "슬로우 푸시인, 아이레벨, 얕은 심도",
        lighting: "탑 라이트 하나, 소프트, 어두운 배경에 제품만 살린다",
        action: "제품이 테이블 위에 놓인다, 실속도", sound: "테이블에 닿는 소리, 낮은 앰비언트",
        line: "가짜 나레이션입니다", seconds: 8,
      },
      {
        beat: "마무리", camera: "정면 고정",
        lighting: "역광이 서서히 밝아진다",
        action: "화면이 부드럽게 밝아진다, 슬로모션", sound: "정적 뒤 낮은 드럼 한 번",
        line: "", seconds: 7,
      },
    ],
    endpoint: "r2v",
  };
}

// 광고 시나리오가 요구하는 JSON 모양 — lib/ad/scenario.js 의 SYSTEM 프롬프트가 묻는
// {text, shots:[{beat,camera,lighting,action,sound,line,seconds}], endpoint} 와 같다.
// 이 모듈은 광고 시나리오 전용이라(다른 소비자가 없다) 스키마를 여기 하나로 못박는다 —
// 콜러가 스키마를 넘기게 하지 않는다(계약 callJson({system,messages,stage,projectId}) 을
// 그대로 유지하려고). scripts/measure/probe-scenario.mjs 가 실측용으로 이 스키마를
// 그대로 재사용하도록 export 한다.
//
// ⚠️ object 타입마다 additionalProperties:false 를 명시한다 — 실측에서 확인한 요구사항이다.
// camera·lighting·action·sound·seconds 를 required 로 못박은 것은 "장면마다 반드시
// 지시할 것"을 스키마 레벨에서 강제하려는 것이다 — SYSTEM 문구만으로는 모델이 조용히
// 생략해도 잡을 방법이 없다. line 은 나레이션이 없는 장면도 있을 수 있어 required 밖이다.
export const SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          // ★ 이 칸만 영어다 — lib/film/mode.js 의 imagePlanFor 가 이미지 프롬프트의
          //   재료로 쓴다. 여기 없으면 SYSTEM 이 아무리 요구해도 모델이 낼 길이 없다
          //   (additionalProperties:false 라 모르는 칸은 잘린다). 실측 2026-08-19:
          //   저장된 프로젝트 8개 전부 shows 가 0개였고 원인이 이 누락이었다.
          shows: { type: "string" },
          camera: { type: "string" },
          lighting: { type: "string" },
          action: { type: "string" },
          sound: { type: "string" },
          line: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["beat", "shows", "camera", "lighting", "action", "sound", "seconds"],
        additionalProperties: false,
      },
    },
    endpoint: { type: "string" },
  },
  required: ["text", "shots"],
  additionalProperties: false,
};

// 재시도해도 되는 stop_reason — 정상 완료(end_turn)와 토큰 상한에 잘린 경우(max_tokens,
// JSON.parse 가 알아서 실패로 잡는다)뿐이다. 그 밖(예: 안전 분류기 거절)은 같은 프롬프트를
// 다시 보내도 같은 이유로 다시 막힐 뿐이라 재시도하지 않는다.
const RETRYABLE_STOP = new Set(["end_turn", "max_tokens"]);

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
        output_config: { format: { type: "json_schema", schema: SCENARIO_SCHEMA } },
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
      prompt: (messages?.[0]?.content || "").slice(0, 300),
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
