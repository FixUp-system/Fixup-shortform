// 브리핑 추출 루프 — 라우트(POST /briefing)와 자동 관통(lib/auto.js)이 같은 것을 부른다.
// 라우트 안에 있던 코드를 글자 그대로 옮긴 것이다(2026-08-04, 자동 관통 스펙).
// 실패는 null 로 알린다 — 502 냐 auto.state=failed 냐는 부르는 쪽이 정한다.
import { callJson } from "./llm";
import { BudgetExceeded } from "./costs";
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
      // ★ 예산 오류는 삼키면 안 된다 — null 이 되고 부르는 쪽이 502 "자료를 정리하지
      // 못했어요"(라우트) 또는 auto.state=failed 를 낸다. 브리핑은 체험 사장님이 밟는
      // **첫 LLM 호출**이라, 한도에 걸린 사장님이 402 "체험분을 다 썼어요" 대신
      // 고장 화면을 보게 된다. lib/script-gen.js 의 세 catch 와 같은 처방이다.
      if (e instanceof BudgetExceeded) throw e;
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      console.error("자료 정리 실패:", e);
    }
  }
  return briefing;
}
