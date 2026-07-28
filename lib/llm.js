import { fakeLlm } from "./fake";
import { addRecord, costActor, estimateLlmCost } from "./costs";
import { randomUUID } from "crypto";

// SHOTFORM_FAKE=all 일 때 돌려주는 응답.
//
// 프롬프트 문자열로 갈라 주지 않는다 — 프롬프트가 바뀌면 조용히 깨진다.
// 검증기들이 각자 자기 키만 보므로, 한 객체에 전부 담으면 어느 호출부가 받아도 통과한다:
//   validateBriefing → topic·key_points        validateScript → script
//   validateCutRanges → cuts(빈 배열이면 "문장당 한 컷" 폴백이 받는다)
//   validateShows → shots(빈 배열이면 화면 설계 없이 진행한다)
//   validateDevelopQuestions → questions
function fakeResponse() {
  return {
    topic: "가짜 브리핑 주제",
    key_points: ["가짜 사실 하나", "가짜 사실 둘", "가짜 사실 셋"],
    audience: "동네 손님",
    takeaway: "한 번 들러 보세요",
    questions: [],
    script:
      "가짜 원고입니다. 배선을 확인하려고 만든 문장이라 실제 내용이 아닙니다. " +
      "이 글은 컷으로 잘려 이미지와 목소리가 됩니다.",
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
