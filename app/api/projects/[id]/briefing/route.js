import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateBriefing } from "../../../../../lib/validate";
import { buildBriefingMessages, mergeAsked } from "../../../../../lib/briefing";

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
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!briefing) {
    return Response.json({ error: "자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요." }, { status: 502 });
  }

  // 이미 답한 이력은 보존하고, 질문 라운드는 1회로 코드가 강제한다.
  // (프롬프트로도 지시하지만 LLM이 어길 수 있으므로 여기서 잘라낸다)
  const updated = await updateProject(id, (proj) => {
    const asked = mergeAsked(proj.briefing?.asked, briefing.asked);
    // 재추출은 브리핑 내용을 갱신하는 것이지 진행을 취소하는 게 아니다 —
    // 이미 나아간 status와 확정 여부는 되감지 않는다(되감으면 만든 이미지가 잠긴다).
    return {
      ...proj,
      status: proj.status === "draft" ? "briefing" : proj.status,
      briefing: {
        ...briefing,
        asked,
        confirmed: proj.briefing?.confirmed || false,
        version: proj.briefing?.version || 1,
      },
    };
  });
  return Response.json({ briefing: updated.briefing });
}
