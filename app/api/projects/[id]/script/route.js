import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import { buildScriptMessages, buildScriptEditMessages, editKeptContent } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }
  // 구성이 곧 설계도다. 없으면 대본이 따를 장면이 없다.
  if (!project.synopsis) {
    return Response.json({ error: "구성을 먼저 만들어 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));
  const sceneCount = project.synopsis.scenes.length;

  // 1단 초안 — 구성의 장면 수·순서를 그대로 따른다
  const { system, messages } = buildScriptMessages(project, instruction);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }), sceneCount);
    } catch {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }), sceneCount);
    } catch {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 끝내 못 얻으면 아래에서 초안으로 폴백한다
    }
  }
  const script = editKeptContent(draft, edited) ? edited : draft;

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      synopsis_version: proj.synopsis?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
