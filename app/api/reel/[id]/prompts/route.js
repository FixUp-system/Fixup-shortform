import { withUser } from "../../../../../lib/auth/require-user.js";
import { runReelPrompts } from "../../../../../lib/reel/pipeline.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { LEDGER_PROMPT_MAX } from "../../../../../lib/costs.js";
import { putReel } from "../../../../../lib/reel/doc.js";

// 영상 프롬프트 만들기.
//
// ★ 기다린다(fire-and-forget 이 아니다). 컷 서넛에 LLM 호출이 짧아 서버리스 상한 안에서
//   끝나고, 기다리면 실패가 **HTTP 로** 보인다 — 상태 라우트를 한 겹 더 두지 않아도 된다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  // ★★ 2026-08-21 리뷰 I10 — 종류 격리가 빠져 있었다. 옛 문서(kind 없음)에 이 라우트를
  //   부르면 clip_prompt 가 그 문서의 컷에 그대로 저장된다 — 단계별 화면은 그 필드를
  //   "덮어쓰기 프롬프트"로 읽으므로(lib/steps.js 의 clipOverride), 각인이 갈려 이미 산
  //   클립이 통째로 낡는다.
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  // ★★ note — 사장님이 **한국어로** 고쳐 달라고 적은 것(2026-08-25). 컷마다 같은 말이
  //   실린다(단위는 전체 한 번이다). 문자열이 아니면 파이프라인이 그냥 무시한다 —
  //   안 실으면 지문이 예전과 글자 그대로다.
  const { only, note } = (await req.json().catch(() => ({}))) || {};
  // ⚠️ 배열이 아닌 값을 조용히 무시하면 **전부 다시 만든다** — 각인이 흔들려 이미 산 클립이
  //    통째로 낡는다(컷당 12크레딧).
  if (only !== undefined && !Array.isArray(only)) {
    return Response.json({ error: "다시 만들 컷을 골라 주세요" }, { status: 400 });
  }
  try {
    await runReelPrompts(id, user.id, { only, note });
  } catch (e) {
    return Response.json({ error: e?.message || "영상 프롬프트를 못 만들었어요" }, { status: 500 });
  }
  return Response.json({ ok: true });
});

// 사장님이 화면에서 고친 값을 저장한다 — **이 흐름의 값어치가 여기 있다**(굽기 전이라 0원).
export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { idx, body } = (await req.json().catch(() => ({}))) || {};
  // ★★ 2026-08-25 — **idx 를 안 주면 전체 프롬프트다**(통짜 갈래, 15초 이하). 컷별 프롬프트가
  //   없는 갈래라 고칠 자리도 컷이 아니라 한 편 전체다 — `reel.prompt` 에 산다.
  //   ★ 시나리오 `text` 를 직접 덮지 않는다: 그 값은 컷·그림의 원천이라(scenarioLock 이
  //     지키는 그 값) 고치면 그림까지 낡는다. 읽을 때 reel.prompt 가 먼저 이긴다
  //     (lib/reel/oneshot.js 의 reelWholePrompt).
  //   ★ idx 를 준 옛 경로는 **한 글자도 안 바뀐다**.
  const whole = idx === undefined || idx === null;
  if (!whole && (!Number.isInteger(idx) || idx < 0)) {
    return Response.json({ error: "어느 컷인지 알 수 없어요" }, { status: 400 });
  }
  const text = typeof body === "string" ? body.trim() : "";
  // 빈 값으로 덮으면 굽기가 문 앞에서 막힌다 — 여기서 막는 편이 사장님에게 가깝다.
  if (!text) return Response.json({ error: "프롬프트를 비워 둘 수 없어요" }, { status: 400 });
  // ★★ 2026-08-21 리뷰 I9 — 이 값은 본문을 통째로 대체해 **그대로 유료 fal 호출로
  //   나간다**. 상한이 없으면 사장님이 붙여 넣은 긴 글이 원장(cost_records)에서
  //   LEDGER_PROMPT_MAX 로 잘려 "무엇을 보냈는가"를 확인할 채널이 막힌다
  //   (app/api/projects/[id]/route.js 의 clip_prompt 상한과 같은 처방).
  if (text.length > LEDGER_PROMPT_MAX) {
    return Response.json(
      { error: `영상 프롬프트는 ${LEDGER_PROMPT_MAX}자까지예요 (지금 ${text.length}자).` },
      { status: 400 }
    );
  }

  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
  if (whole) {
    await updateProject(id, user.id, (p) => putReel(p, { prompt: text }));
    return Response.json({ ok: true });
  }
  if (!Array.isArray(project.cuts) || !project.cuts[idx]) {
    return Response.json({ error: "그 컷이 없어요" }, { status: 400 });
  }
  await updateProject(id, user.id, (p) => ({
    ...p,
    cuts: p.cuts.map((c, i) => (i === idx ? { ...c, clip_prompt: text } : c)),
  }));
  return Response.json({ ok: true });
});
