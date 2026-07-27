import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateBriefing } from "../../../../../lib/validate";
import { buildBriefingMessages, mergeAsked, briefingContentChanged } from "../../../../../lib/briefing";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "정리할 자료가 없어요" }, { status: 400 });
  }

  const { system, messages } = buildBriefingMessages(project);

  let briefing = null;
  for (let attempt = 0; attempt < 2 && !briefing; attempt++) {
    try {
      briefing = validateBriefing(await callJson({ system, messages }));
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      // 다만 왜 실패했는지는 남긴다(키 미설정·크레딧 소진·형식 거절이 전부 같은 502로 보이지 않게).
      console.error("자료 정리 실패:", e);
    }
  }
  if (!briefing) {
    return Response.json({ error: "자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요." }, { status: 502 });
  }

  // 이미 답한 이력은 보존하고, 질문 라운드는 1회로 코드가 강제한다.
  // (프롬프트로도 지시하지만 LLM이 어길 수 있으므로 여기서 잘라낸다)
  const updated = await updateProject(id, (proj) => {
    const asked = mergeAsked(proj.briefing?.asked, briefing.asked);
    const next = {
      ...briefing,
      asked,
      confirmed: proj.briefing?.confirmed || false,
      version: proj.briefing?.version || 1,
    };
    // 재추출로 내용이 달라졌으면 버전을 올린다 — 확정된 프로젝트에서 다시 정리했는데도 버전이 그대로면
    // 대본 화면이 "브리핑이 바뀌었어요"를 띄우지 못한다. (첫 추출은 바뀐 것이 아니다)
    if (proj.briefing && briefingContentChanged(proj.briefing, next)) next.version += 1;
    // 재추출은 브리핑 내용을 갱신하는 것이지 진행을 취소하는 게 아니다 —
    // 이미 나아간 status와 확정 여부는 되감지 않는다(되감으면 만든 이미지가 잠긴다).
    return {
      ...proj,
      status: proj.status === "draft" ? "briefing" : proj.status,
      briefing: next,
    };
  });
  return Response.json({ briefing: updated.briefing });
}
