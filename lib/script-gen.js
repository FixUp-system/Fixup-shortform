// 대본 생성 루프(초안 → 되돌리기 ≤3회 → 교정) — 라우트(POST /script)와
// 자동 관통(lib/auto.js)이 같은 것을 부른다. 라우트에서 글자 그대로 옮겼다(2026-08-04).
// 실패는 null 로 알린다 — 502 냐 auto.state=failed 냐는 부르는 쪽이 정한다.
// 돌려주는 script 에는 version 이 없다(부르는 쪽이 붙인다).
import { callJson } from "./llm";
import { validateScript } from "./validate";
import { BudgetExceeded } from "./costs";
import {
  buildScriptMessages,
  buildScriptEditMessages,
  buildScriptRewriteMessages,
  editKeptContent,
  scriptFaults,
  scriptScore,
  targetChars,
} from "./script";

export async function generateScript(project, id, { instruction, llm = callJson } = {}) {
  // 1단 초안 — 장면으로 끊기지 않은 하나의 원고
  const { system, messages } = buildScriptMessages(project, instruction);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await llm({ system, messages, stage: "대본", projectId: id }));
    } catch (e) {
      // ★ 예산 오류는 폴백할 것이 아니다 — 삼키면 null 이 되고 라우트가 502
      // "대본 생성에 실패했어요"를 낸다. 한도에 걸린 사장님이 이유를 모른 채 다시 누른다.
      if (e instanceof BudgetExceeded) throw e;
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      // 다만 왜 실패했는지는 남긴다(키 미설정·크레딧 소진·형식 거절이 전부 같은 502로 보이지 않게).
      console.error("대본 초안 생성 실패:", e);
    }
  }
  if (!draft) return null;

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

    // 스키마 거절과 호출 실패(네트워크 등)는 같은 정책을 받는다 — 라운드당 딱 한 번만
    // 재시도하고, 재시도도 실패하면 그 라운드만 버리고 남은 라운드를 계속 돈다.
    // 둘을 다르게 다루면(한쪽만 재시도) 실패 종류에 따라 라운드가 통째로 새는 자리가
    // 옆으로 옮겨갈 뿐이다 — 이 태스크가 애초에 없애려던 문제다.
    // ⚠️ 유료 호출이라 이 재시도는 라운드당 정확히 한 번이다 — 두 실패 경로가 겹쳐도
    // 재시도가 두 번으로 불어나지 않는다(아래는 시도를 한 번만 부른다).
    const attempt = async () => {
      try {
        const out = validateScript(await llm({ system: rewrite.system, messages: rewrite.messages, stage: "대본 되돌리기", projectId: id }));
        return { rewritten: out, reason: out ? null : "스키마 거절" };
      } catch (e) {
        if (e instanceof BudgetExceeded) throw e;
        return { rewritten: null, reason: "호출 실패", error: e };
      }
    };

    let { rewritten, reason, error } = await attempt();
    if (reason) {
      if (error) console.error(`${tag} ${round}회차 호출 실패:`, error);
      console.log(`${tag} ${round}회차 ${reason} → 재시도`);
      const retry = await attempt();
      rewritten = retry.rewritten;
      if (retry.reason) {
        if (retry.error) console.error(`${tag} ${round}회차 재시도 호출 실패:`, retry.error);
        // 이 라운드만 버린다 — 라운드 하나가 실패했다고 남은 라운드까지 포기하지 않는다.
        console.log(`${tag} ${round}회차 재시도도 ${retry.reason} → 이 라운드 버림`);
        continue;
      }
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
      edited = validateScript(await llm({ system: edit.system, messages: edit.messages, stage: "대본 교정", projectId: id }));
    } catch (e) {
      // 예산 오류는 초안 폴백으로 감추지 않는다 — 200 으로 나가면 다음 단계에서 또 걸린다.
      if (e instanceof BudgetExceeded) throw e;
      // 일시적 호출 실패는 삼키고 다음 시도로 — 끝내 못 얻으면 아래에서 초안으로 폴백한다
      console.error("대본 교정 실패:", e);
    }
  }
  // 교정본을 받을지도 되돌리기와 같은 자로 잰다. 내용 보존만 보던 때는 교정이 174자를
  // 206자로 불려 놓아도 통과했다 — editKeptContent는 줄어드는 것만 막는다.
  // 20자 여유를 두는 이유: 금지어·상투어 제거는 점수에 안 잡히므로, 조금 멀어진 것까지
  // 기각하면 교정이 한 일을 통째로 버리게 된다. 결함이 늘면 1000점이라 어차피 기각된다.
  const worse = edited ? scriptScore(project, edited) > scriptScore(project, draft) + 20 : true;
  const script = editKeptContent(draft, edited, project) && !worse ? edited : draft;
  console.log(`${tag} 교정 ${edited ? `${chars(edited)}자${worse ? "(기각)" : ""}` : "실패"} → 최종 ${chars(script)}자(${Math.round(chars(script) / target * 100)}%) · 결함 ${scriptFaults(project, script).join(",") || "없음"}`);

  return script;
}
