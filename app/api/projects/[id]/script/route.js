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

  const { instruction } = await req.json().catch(() => ({}));
  const { system, messages } = buildScriptMessages(project, instruction);

  // 1단 초안
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 사실을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch {
      break;
    }
  }
  // 교정본이 문단·coverage를 지켰을 때만 채택한다 — 스키마는 맞지만 사실을 흘린 교정은 버린다
  const script = editKeptContent(draft, edited) ? edited : draft;

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    // 어느 브리핑에서 나온 대본인지 찍어둔다 — 브리핑이 다시 확정되면 화면이 차이를 알 수 있다
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
