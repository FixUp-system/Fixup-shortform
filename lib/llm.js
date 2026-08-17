import Anthropic from "@anthropic-ai/sdk";
import { fakeLlm } from "./fake";
import { addRecord, assertBudget, costActor, estimateLlmCost } from "./costs";
import { randomUUID } from "crypto";

// SHOTFORM_FAKE=all 일 때 돌려주는 응답.
//
// 프롬프트 문자열로 갈라 주지 않는다 — 프롬프트가 바뀌면 조용히 깨진다.
// 검증기들이 각자 자기 키만 보므로, 한 객체에 전부 담으면 어느 호출부가 받아도 통과한다:
//   validateBriefing → topic·key_points
//   validateCutRanges → cuts(빈 배열이면 "문장당 한 컷" 폴백이 받는다)
//   validateShows → shots(빈 배열이면 화면 설계 없이 진행한다)
//
// ⚠️ **시나리오(validateScenario)는 이 응답으로 통과하지 못한다** — 같은 `shots` 키를
//    쓰지만 요구하는 모양이 다르고(beat·line·seconds), 무엇보다 장면 초의 합이 사장님이
//    고른 길이와 정확히 같아야 한다(lib/scenario-rules.js). 여기 상수 하나로는 15·30·45·60
//    을 동시에 맞출 수 없다.
//    그래서 **부르는 쪽이 자기 모양의 가짜를 들고 온다**(아래 callJson 의 `fake` 인자).
//    판정("지금 가짜 모드인가")은 여전히 lib/fake.js 한 곳이고, 목표 초·모델 하한을 아는
//    쪽에서 값을 만든다(lib/scenario.js 의 fakeScenario) — 이 파일이 규칙을 두 벌로 들지 않는다.
function fakeResponse() {
  return {
    topic: "가짜 브리핑 주제",
    key_points: ["가짜 사실 하나", "가짜 사실 둘", "가짜 사실 셋"],
    audience: "동네 손님",
    takeaway: "한 번 들러 보세요",
    questions: [],
    cuts: [],
    shots: [],
  };
}

// ★ 모델 문자열을 한 곳에 둔다 — 원장 엔드포인트와 요청이 갈리면 원가가 엉뚱한 줄에 붙는다.
//   export 하는 이유는 app/api/chat/route.js 가 같은 값을 써야 하기 때문이다.
export const MODEL = "claude-opus-5";

// Opus 5 는 사고가 기본으로 켜져 있고 max_tokens 가 **사고 + 본문의 합계 상한**이다.
// 낮게 잡으면 대본이 중간에 잘린다. 스트리밍 없이 안전한 값으로 시작한다.
export const MAX_TOKENS = 16000;

// Claude 응답의 content 는 블록 배열이다. 텍스트 블록만 이어 붙인다 —
// 사고 블록이 섞여 들어와도 JSON.parse 가 그것을 먹지 않게 한다.
// export 하는 이유는 MODEL 과 같다 — chat 라우트가 같은 판독을 쓴다.
export function textOf(data) {
  return (data?.content || [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("");
}

// Claude JSON 호출 헬퍼 — 파싱 실패 시 1회 재시도.
//
// stage·projectId 는 비용 기록용이다. 오랫동안 LLM 비용이 한 줄도 안 남아, 비용 기록에는
// fal 만 보이고 대본을 열 번 다시 써도 0원으로 보였다. 대본 한 편에 되돌리기·교정까지
// 예닐곱 번을 부르므로 적은 돈이 아니다.
//
// ★ temperature 인자가 없다. Claude Opus 5 는 temperature·top_p·top_k 를 받으면 **400** 이다.
//   되돌리기의 다양성이 그 값에 기대고 있었을 수 있어, 전환 뒤 실측한다.
//
// ★ SDK 를 쓰되 fetch 를 주입한다 — 이 저장소의 테스트는 fetchImpl 로 실제 요청을 잡는다.
//
// fake 는 "이 호출이 가짜 모드에서 무엇을 받아야 하는가"를 부르는 쪽이 대는 자리다.
// 안 대면 위 공통 응답이 나간다 — 검증기 대부분은 그것으로 통과한다.
export async function callJson({ system, messages, fetchImpl = fetch, apiKey, stage = "대본", projectId, fake }) {
  // 키 검사보다 먼저 본다 — 완전 가짜 모드는 API 키 없이도 돌아야 한다
  if (fakeLlm()) return typeof fake === "function" ? fake() : fakeResponse();
  // ★ 기본값을 인자 자리에 두지 않는다 — 그러면 모듈이 로드되는 시점의 env 로 굳는다.
  //   테스트가 env 를 세웠다 지우므로 부를 때마다 읽어야 한다.
  const key = apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("CLAUDE_API_KEY가 설정되지 않았어요");

  // ★ 오랫동안 LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(아래 addRecord) 한도를
  // 안 봤다. 그래서 크레딧 0 인 채로 [대본 다시 쓰기] 를 무한히 누를 수 있었다.
  //
  // ★ amount 는 0 이다. fal 은 나가기 전에 값을 알지만 LLM 은 토큰 수를 **호출한 뒤에야**
  // 안다(estimateLlmCost 가 usage 를 받는다). 없는 숫자를 지어내지 않고 "이미 넘었는가"만
  // 판정한다 — 넘침은 최대 한 번이고, 그 한 번은 원장에 남아 다음 호출이 막는다.
  await assertBudget({ projectId, endpoint: `anthropic/${MODEL}`, amount: 0 });

  // ★ SDK 의 기본 재시도(2회)·기본 타임아웃(10분)을 명시해 덮는다.
  //
  // 기본값을 두면 한 논리 호출이 최대 6번 나간다 — SDK 가 429·5xx 를 3번까지 부르고,
  // 200 을 받았는데 JSON 파싱이 깨지면 아래 루프가 한 번 더 돌아 또 3번이다.
  // 게다가 타임아웃으로 우리가 끊은 요청도 서버는 이미 생성을 마쳤을 수 있는데, 그
  // 토큰은 usage 로 안 돌아와 **원장에 한 줄도 안 남는다** — "원가가 0 이 되는 경로는
  // 예산 가드가 못 보는 값" 이 그대로 재현되는 모양이다. 옛 raw fetch 에는 내부 재시도가
  // 없었으니 이것은 SDK 를 들이며 새로 생긴 구멍이다.
  //
  // 120초 근거: 실측(2026-08-12)에서 가장 큰 호출이 3,468 토큰이었다.
  const client = new Anthropic({ apiKey: key, fetch: fetchImpl, maxRetries: 1, timeout: 120_000 });

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    });
    // 파싱에 실패해 재시도하더라도 호출한 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    const model = data?.model || MODEL;
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `anthropic/${model}`,
      stage, user: costActor(), project_id: projectId,
      prompt: (messages?.[0]?.content || "").slice(0, 300),
      duration: `${data?.usage?.input_tokens ?? 0}+${data?.usage?.output_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
    try {
      return JSON.parse(textOf(data));
    } catch {
      // 재시도
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
