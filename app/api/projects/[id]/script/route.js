import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import {
  buildScriptMessages,
  buildScriptEditMessages,
  buildScriptRewriteMessages,
  editKeptContent,
  scriptFaults,
  scriptScore,
} from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));

  // 1단 초안 — 장면으로 끊기지 않은 하나의 원고
  const { system, messages } = buildScriptMessages(project, instruction);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }));
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      // 다만 왜 실패했는지는 남긴다(키 미설정·크레딧 소진·형식 거절이 전부 같은 502로 보이지 않게).
      console.error("대본 초안 생성 실패:", e);
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 1.5단 되돌리기 — 지적할 것이 남아 있는 동안 최대 3회 고쳐 쓴다.
  // 한 번만 시도하던 때는 265자를 220자로 줄여 와도(여전히 초과) 버리고 초안을 안고 갔다.
  // 나아지는 동안만 계속하고, 나아지지 않으면 그 자리에서 멈춘다(같은 자리를 맴돌지 않게).
  for (let round = 0; round < 3; round++) {
    const faults = scriptFaults(project, draft);
    if (faults.length === 0) break;
    const rewrite = buildScriptRewriteMessages(project, draft, faults);
    let rewritten = null;
    try {
      rewritten = validateScript(await callJson({ system: rewrite.system, messages: rewrite.messages }));
    } catch (e) {
      console.error("대본 되돌리기 실패:", e);
      break;
    }
    if (!rewritten || scriptScore(project, rewritten) >= scriptScore(project, draft)) break;
    draft = rewritten;
  }

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 끝내 못 얻으면 아래에서 초안으로 폴백한다
      console.error("대본 교정 실패:", e);
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
