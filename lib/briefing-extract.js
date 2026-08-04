// 브리핑 추출 루프 — 라우트(POST /briefing)와 자동 관통(lib/auto.js)이 같은 것을 부른다.
// 라우트 안에 있던 코드를 글자 그대로 옮긴 것이다(2026-08-04, 자동 관통 스펙).
// 실패는 null 로 알린다 — 502 냐 auto.state=failed 냐는 부르는 쪽이 정한다.
import { callJson } from "./llm";
import { validateBriefing } from "./validate";
import { buildBriefingMessages } from "./briefing";

export async function extractBriefing(project, { llm = callJson } = {}) {
  const { system, messages } = buildBriefingMessages(project);
  let briefing = null;
  for (let attempt = 0; attempt < 2 && !briefing; attempt++) {
    try {
      // 자료 원문을 함께 넘긴다 — 이미 답이 적혀 있는 질문을 코드가 버린다
      briefing = validateBriefing(
        await llm({ system, messages, stage: "브리핑", projectId: project.id }),
        project.material?.text || ""
      );
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      console.error("자료 정리 실패:", e);
    }
  }
  return briefing;
}
