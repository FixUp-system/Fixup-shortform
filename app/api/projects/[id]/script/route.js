import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import {
  buildScriptMessages,
  buildScriptEditMessages,
  buildScriptRewriteMessages,
  editKeptContent,
  paragraphsToRewrite,
  syncSceneSeconds,
} from "../../../../../lib/script";

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
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      // 다만 왜 실패했는지는 남긴다(키 미설정·크레딧 소진·형식 거절이 전부 같은 502로 보이지 않게).
      console.error("대본 초안 생성 실패:", e);
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 1.5단 되돌리기 — 초안이 '할 말'이나 '보여줌'을 옮겨 적었거나 같은 말을 되풀이했으면 그 문단만 다시 쓴다.
  // 프롬프트로는 못 막혔다(막을 때마다 옆으로 샜다). 한 번만 시도하고, 실패하거나 나아지지 않으면
  // 초안을 그대로 안고 간다 — 대본을 못 주는 것보다 낫다.
  const weak = paragraphsToRewrite(project.synopsis, draft);
  if (weak.length > 0) {
    const rewrite = buildScriptRewriteMessages(project, draft, weak);
    try {
      const rewritten = validateScript(await callJson({ system: rewrite.system, messages: rewrite.messages }), sceneCount);
      if (rewritten && paragraphsToRewrite(project.synopsis, rewritten).length < weak.length) draft = rewritten;
    } catch (e) {
      console.error("대본 되돌리기 실패:", e);
    }
  }

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }), sceneCount);
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
      synopsis_version: proj.synopsis?.version || 1,
    },
    // 장면의 초를 방금 쓴 문장에 맞춘다 — 배분 의도였던 값이 실측에 가까워진다.
    // version은 올리지 않는다(사장님이 승인한 구성이 바뀐 게 아니다).
    synopsis: proj.synopsis ? syncSceneSeconds(proj.synopsis, script) : proj.synopsis,
  }));
  return Response.json({ script: updated.script });
}
