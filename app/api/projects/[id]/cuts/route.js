import { getProject, updateProject } from "../../../../../lib/projects";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../../../lib/aspects";
import { runSplitPipeline } from "../../../../../lib/pipeline";
import { areCutsStale, scenarioCutsKey } from "../../../../../lib/steps";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 컷은 시나리오에서 나온다 — 확정된 시나리오가 없으면 나눌 것이 없다(2026-08-16).
  // 예전에는 원고(script.text)를 봤다. 옛 프로젝트는 시나리오가 없어 여기서 걸린다 —
  // 그 프로젝트들은 ②로 돌아가 시나리오를 만들면 된다.
  if (!project.scenario?.confirmed || !(project.scenario.shots || []).length) {
    return Response.json({ error: "시나리오를 먼저 확정해 주세요" }, { status: 400 });
  }

  // 화면 비율 — 이미지 생성이 이 값을 쓴다. 보내지 않으면 기존 설정(기본 9:16)을 유지한다.
  const body = await req.json().catch(() => ({}));
  const aspect_ratio = isAspect(body?.aspect_ratio)
    ? body.aspect_ratio
    : project.settings?.aspect_ratio || DEFAULT_ASPECT_ID;

  // 멱등 가드 — 지금 시나리오에서 나온 컷이 이미 있으면 다시 나누지 않는다.
  // 아래에서 cuts:[]를 선저장하므로, 막지 않으면 돈 주고 만든 소리·그림이 그 자리에서 지워진다.
  //
  // 낡은 컷(시나리오를 고친 뒤 남은 것)은 막지 않는다 — 그때는 다시 나누는 것이 맞다.
  // status 로 판정하지 않는 이유: 새 흐름에서 status 는 목소리·이미지로 계속 앞서 간다.
  // 컷이 비어 있는 경우(=분할 실패)도 다시 시도를 허용한다.
  if ((project.cuts || []).length > 0 && !areCutsStale(project)) {
    return Response.json(
      { error: "이미 나눈 컷이 있어요 — 목소리 단계에서 확인해 주세요" },
      { status: 409 }
    );
  }

  // 파이프라인보다 먼저 status:cuts 를 세운다 — 응답 직후 화면이 ③목소리로 이동해도
  // 가드가 통과하고, 컷이 비어 있는 동안은 "컷을 나누는 중"으로 폴링한다.
  await updateProject(id, user.id, (proj) => ({
    ...proj,
    settings: { ...proj.settings, aspect_ratio },
    status: "cuts", cuts: [], cuts_error: null,
    // 이 컷들이 **어느 시나리오에서** 나왔는지 각인한다 — 시나리오를 고치면 컷이 낡는다
    // (areCutsStale). 버전 번호가 아니라 각인인 이유는 lib/steps.js 의 "낡음 판정" 절에 있다.
    cuts_scenario_of: scenarioCutsKey(proj.scenario),
    // 옛 프로젝트(원고에서 나온 컷)의 판정용으로 그대로 둔다 — 원고가 없으면 언제나 1 이고,
    // 시나리오가 있으면 areCutsStale 이 이 값을 아예 안 본다.
    cuts_script_version: proj.script?.version || 1,
  }));

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (로컬 node 서버 전제. 배포 시 잡 큐 이관)
  runSplitPipeline(id, user.id).catch(async (e) => {
    console.error("split pipeline error:", e);
    // 컷 분할이 죽으면 cuts가 영영 비어 있다 — 화면이 5분을 기다리지 않게 실패를 남긴다
    await updateProject(id, user.id, (proj) => ({
      ...proj,
      cuts_error: e?.message || "컷을 나누지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
