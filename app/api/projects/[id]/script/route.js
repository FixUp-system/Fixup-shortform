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
  targetChars,
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
  //
  // 라운드마다 로그를 남긴다 — 분량이 88~140%로 흔들리는데 3회를 다 쓰고도 못 줄인 것인지
  // 개선 없다고 일찍 멈춘 것인지 추측으로는 갈릴 수 없다.
  const target = targetChars(project);
  const chars = (s) => (s?.text || "").replace(/\s/g, "").length;
  const tag = `[대본 ${id.slice(0, 8)}]`;
  console.log(`${tag} 목표 ${target}자 · 초안 ${chars(draft)}자(${Math.round(chars(draft) / target * 100)}%) · 결함 ${scriptFaults(project, draft).join(",") || "없음"}`);

  for (let round = 1; round <= 3; round++) {
    const faults = scriptFaults(project, draft);
    if (faults.length === 0) break;
    const rewrite = buildScriptRewriteMessages(project, draft, faults);
    let rewritten = null;
    try {
      rewritten = validateScript(await callJson({ system: rewrite.system, messages: rewrite.messages }));
    } catch (e) {
      console.error(`${tag} ${round}회차 호출 실패:`, e);
      break;
    }
    if (!rewritten) {
      console.log(`${tag} ${round}회차 스키마 거절 → 중단`);
      break;
    }
    const before = scriptScore(project, draft);
    const after = scriptScore(project, rewritten);
    const verdict = after < before ? "채택" : "기각(나아지지 않음) → 중단";
    console.log(`${tag} ${round}회차 [${faults.join(",")}] ${chars(draft)}자 → ${chars(rewritten)}자 · 남은 결함 ${scriptFaults(project, rewritten).join(",") || "없음"} · 점수 ${before}→${after} · ${verdict}`);
    if (after >= before) break;
    draft = rewritten;
  }

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(project, draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 끝내 못 얻으면 아래에서 초안으로 폴백한다
      console.error("대본 교정 실패:", e);
    }
  }
  // 교정본을 받을지도 되돌리기와 같은 자로 잰다. 내용 보존만 보던 때는 교정이 174자를
  // 206자로 불려 놓아도 통과했다 — editKeptContent는 줄어드는 것만 막는다.
  // 20자 여유를 두는 이유: 금지어·상투어 제거는 점수에 안 잡히므로, 조금 멀어진 것까지
  // 기각하면 교정이 한 일을 통째로 버리게 된다. 결함이 늘면 1000점이라 어차피 기각된다.
  const worse = edited ? scriptScore(project, edited) > scriptScore(project, draft) + 20 : true;
  const script = editKeptContent(draft, edited) && !worse ? edited : draft;
  console.log(`${tag} 교정 ${edited ? `${chars(edited)}자${worse ? "(기각)" : ""}` : "실패"} → 최종 ${chars(script)}자(${Math.round(chars(script) / target * 100)}%) · 결함 ${scriptFaults(project, script).join(",") || "없음"}`);

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
