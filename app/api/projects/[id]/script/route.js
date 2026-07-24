import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript, validatePlan } from "../../../../../lib/validate";
import { buildScriptMessages, buildScriptEditMessages, buildPlanMessages, editKeptContent } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));

  // 0단 기획 — 앵글·비트시트(내부 밑그림). 실패해도 던지지 않는다. plan=null이면 초안이 폴백 경로를 탄다.
  let plan = null;
  const planMsg = buildPlanMessages(project);
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    try {
      plan = validatePlan(await callJson({ system: planMsg.system, messages: planMsg.messages }));
    } catch {
      break;
    }
  }

  // 1단 초안 — 기획이 있으면 그 설계대로 전개한다
  const { system, messages } = buildScriptMessages(project, instruction, plan);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 사실·분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch {
      break;
    }
  }
  const script = editKeptContent(draft, edited) ? edited : draft;

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
