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
//    을 동시에 맞출 수 없다. 가짜 모드로 ②시나리오를 관통하려면 이 함수가 **지문에서 목표
//    길이를 읽어** 장면을 지어내야 한다 — 아직 안 했다.
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

// gpt-4o JSON 호출 헬퍼 — response_format json_object, 파싱 실패 시 1회 재시도
//
// stage·projectId 는 비용 기록용이다. 오랫동안 LLM 비용이 한 줄도 안 남아, 비용 기록에는
// fal 만 보이고 대본을 열 번 다시 써도 0원으로 보였다. 대본 한 편에 되돌리기·교정까지
// 예닐곱 번을 부르므로 적은 돈이 아니다.
export async function callJson({ system, messages, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY, temperature = 0.4, stage = "대본", projectId }) {
  // 키 검사보다 먼저 본다 — 완전 가짜 모드는 API 키 없이도 돌아야 한다
  if (fakeLlm()) return fakeResponse();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");

  // ★ 오랫동안 LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(아래 addRecord) 한도를
  // 안 봤다. 그래서 크레딧 0 인 채로 [대본 다시 쓰기] 를 무한히 누를 수 있었다.
  //
  // ★ amount 는 0 이다. fal 은 나가기 전에 값을 알지만 LLM 은 토큰 수를 **호출한 뒤에야**
  // 안다(estimateLlmCost 가 usage 를 받는다). 없는 숫자를 지어내지 않고 "이미 넘었는가"만
  // 판정한다 — 넘침은 최대 한 번이고, 그 한 번은 원장에 남아 다음 호출이 막는다.
  await assertBudget({ projectId, endpoint: "openai/gpt-4o", amount: 0 });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM 호출 실패 (${res.status}) ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    // 파싱에 실패해 재시도하더라도 호출한 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    const model = data?.model || "gpt-4o";
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${model}`,
      stage, user: costActor(), project_id: projectId,
      prompt: (messages?.[0]?.content || "").slice(0, 300),
      duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
    try {
      return JSON.parse(data?.choices?.[0]?.message?.content ?? "");
    } catch {
      // 재시도
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
