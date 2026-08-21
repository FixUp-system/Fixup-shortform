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
          // ★★ 이 장면에 보이는 사람의 **사진**을 고른다(lib/refs.js 의 AVATARS).
          //   "한국인"이라는 말만으로는 컷마다 다른 얼굴이 나오는 것을 못 막는다 —
          //   얼굴을 고정하려면 사진이 있어야 한다. 사람이 없는 장면은 빈 문자열.
          avatar_id: { type: "string" },
          // ★ 누가 말하는가 — 화면에 보이는 사람이면 그 사람, 화면 밖이면 "내레이션".
          //   그 글자가 그대로 판정에 쓰인다(단계별과 같은 규약).
          speaker: { type: "string" },
          // ★ 이 컷이 **앞 컷에서 어떻게 넘어오는가**. 장소를 옮겨도 끊기지 않게 하는 축이다
          //   (사장님 지적: "이동할 수 있긴 한데 부자연스럽다"). 첫 컷은 빈 문자열이다.
          transition: { type: "string" },
          // ★★ **읽는 표기**. line 은 자막에 박히는 글자이고 이 칸은 모델이 소리 내어
          //   읽을 표기다. 실측(2026-08-19): "Giants 에디션"이 "지에이턴스 에디전"으로,
          //   "에스더버니"가 "에스터버리"로 읽혔다. 표기를 바꾸면 발음이 바뀌는데
          //   line 을 바꾸면 자막에도 그 표기가 박힌다 — 그래서 나눈다.
          say_as: { type: "string" },
          camera: { type: "string" },
          lighting: { type: "string" },
          action: { type: "string" },
          sound: { type: "string" },
          line: { type: "string" },
          seconds: { type: "number" },
        },
        required: ["beat", "shows", "avatar_id", "speaker", "transition", "camera", "lighting", "action", "sound", "seconds"],
        additionalProperties: false,
      },
    },
    endpoint: { type: "string" },
    // ★★ 이 영상의 **중심**. 카메라·조명·음향은 장면마다 정하면서 "무엇이 주인공인가"는
    //   아무도 안 정했다 — 그래서 그림을 만들 때 무엇을 지켜야 하는지가 흔들렸다.
    //   lib/film/mode.js 의 imagePlanFor 가 이 값으로 갈라진다.
    focus: { type: "string" },
    // ★★ 나레이션 **목소리**. 환경음·효과음은 장면마다 정하면서 목소리의 성질은 아무도
    //   안 정해서, 영상 모델이 기본값으로 읽었다("AI 가 읽어주는 느낌"). 단계별은
    //   lib/cast.js 가 인물마다 이 값을 정하는데 통짜로 굽는 쪽에는 자리가 없었다.
    // ★ 화자는 하나라 최상위다 — shots 안에 두면 한 영상에서 사람이 바뀐다.
    voice: { type: "string" },
    // ★★ 아래 셋은 단계별(lib/scenario.js·lib/cuts.js)에 있고 여기 없던 것들이다
    //   (2026-08-19). 단계별이 실측으로 쌓은 축을 옮긴다.
    // music — 영상 하나에 **하나**. 장면마다 다르면 컷 경계에서 곡이 바뀐다.
    music: { type: "string" },
    // tone — 색 처리. 전 컷에 같은 글자로 실려 화면 색감이 안 흔들린다.
    tone: { type: "string" },
    // look — 제품 외형 전용 칸(색·부위·소재와 **크기·비례**). shows 에 섞여 있으면
    //   장면 서술에 묻혀 컷마다 다른 크기·색으로 그려진다.
    look: { type: "string" },
    // ★★ 인물 옷차림(2026-08-19). shows 에 옷차림이 없으면 모델이 mood 만 보고 알아서
    //   입힌다 — 야구단 굿즈 광고인데 mood=premium 이라 베이지 코트·정장이 나왔다.
    //   제품의 성격과 어울려야 톤이 안 깨진다. 영상 하나에 하나(컷마다 다르면 갈아입는다).
    // ★★★ 인물의 **생김새**(2026-08-21). wardrobe 가 옷을 맡듯 이 칸이 사람을 맡는다.
    //   이 칸이 없던 동안 wardrobe 가 사람까지 떠맡아, 등장인물이 둘인 소재에서
    //   "the climber…; the instructor…" 로 두 사람을 한 칸에 우겨 넣었고(실측 3/3),
    //   그 값이 굽기의 "the person wears ___" 틀에 들어가 말이 안 되는 영어가 나갔다.
    cast: { type: "string" },
    wardrobe: { type: "string" },
    // ★★ 무대 — 이 영상 전체의 장소·시간대·조명. **하나만** 정한다(2026-08-19).
    //   실측: 컷마다 다른 장소를 지정해 15초 안에 스튜디오→거리→카페를 점프했다.
    environment: { type: "string" },
    // ★★ 무슨 이야기인가(2026-08-19). 그전에는 "어떻게 찍나"만 있고 서사를 적는 자리가
    //   없어서 format(hero — "등장→클로즈업→쓰는 순간→마무리")의 틀이 그대로 나왔다.
    //   단계별의 angle 과 같은 자리다.
    angle: { type: "string" },
  },
  required: ["text", "shots", "focus", "voice", "music", "tone", "look", "cast", "wardrobe", "environment", "angle"],
  additionalProperties: false,
};

// ★★★ **경로마다 스키마가 다르다**(2026-08-21) — 지문이 그런 것과 같은 이유다
// (lib/ad/scenario.js 의 systemFor 머리말 참고).
//
// 광고(kind:"ad")는 `scenario.text` 하나만 굽기에 쓴다. `shows`·`avatar_id`·`transition`
// 은 그림 단계가 있는 film 만 읽는 값인데(lib/film/mode.js), 스키마가 셋 다 **required**
// 로 강제하고 있었다 — 아무도 안 볼 값을 모델이 반드시 만들어야 했다. 지문에서 그 규칙을
// 걷어내면서 여기도 같이 걷는다: **지문은 안 시키는데 스키마가 강제하면** 모델이 무엇을
// 적어야 할지 모른 채 빈 값이나 지어낸 값으로 칸을 채운다.
//
// ★ film 쪽 스키마는 **글자 그대로 예전과 같다** — kind 가 "ad" 가 아니면 그대로 돌려준다.
// ★ 두 벌을 손으로 적지 않는다. 한 벌에서 **덜어 낸다** — 칸이 늘 때 한쪽만 낡는 자리를
//   안 만든다(이 저장소가 "값이 사는 곳은 하나"로 부르는 규율이다).
const AD_DROPPED_SHOT_FIELDS = ["shows", "avatar_id", "transition"];

export function scenarioSchemaFor(kind) {
  if (kind !== "ad") return SCENARIO_SCHEMA;
  const item = SCENARIO_SCHEMA.properties.shots.items;
  const properties = { ...item.properties };
  for (const f of AD_DROPPED_SHOT_FIELDS) delete properties[f];
  return {
    ...SCENARIO_SCHEMA,
    properties: {
      ...SCENARIO_SCHEMA.properties,
      shots: {
        ...SCENARIO_SCHEMA.properties.shots,
        items: {
          ...item,
          properties,
          required: item.required.filter((f) => !AD_DROPPED_SHOT_FIELDS.includes(f)),
        },
      },
    },
  };
}

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
  // ★ 경로마다 다른 스키마를 받는다(scenarioSchemaFor). 안 넘기면 예전 그대로 —
  //   film 과 옛 부르는 자리가 글자 그대로 안 바뀐다.
  schema = SCENARIO_SCHEMA,
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
