import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject, isStepDoc } from "../../../../../lib/projects";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../../../lib/aspects";
import { runSplitPipeline } from "../../../../../lib/pipeline";
import { areCutsStale, scenarioCutsKey } from "../../../../../lib/steps";
import { withUser } from "../../../../../lib/auth/require-user.js";

// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 그것을 **플랫폼에 말해 줘야 한다**
//    (2026-08-18 프로덕션 실측). Vercel 에서 응답 후의 작업은 보장되지 않는다: `after()` 로
//    함수 수명을 그 약속까지 늘리고(lib/background.js 한 자리), `maxDuration` 으로 상한을 명시해야 한다. 둘 다 없어서
//    **클립 3개를 결제하고 2개만 저장됐고**(오류 기록조차 없다), 합성은 두 번 다 조용히 죽었다.
//    폴링이 우연히 그 인스턴스를 깨우면 진행되고 아니면 멈췄다 — 부분 성공과 전면 실패를 가른
//    것이 **운**이었다.
//
// ★ **약속(promise) 을 넘긴다 — 콜백이 아니다.** 콜백으로 넘기면 파이프라인이 요청 범위 밖에서
//   시작하고, 비용 주체는 AsyncLocalStorage 에서 읽으므로(lib/actor.js) 컨텍스트가 없으면
//   `costActor()` 가 **던진다**. 이 형태는 호출이 요청 안에서 일어나 컨텍스트가 따라간다.
// ★ 심장박동(startHeartbeat)은 이것을 막지 못한다 — 죽음을 보이게 하는 장치일 뿐이다.
//   근본 해결은 작업 큐·워커이고 별개 프로젝트다(CLAUDE.md).
//
// LLM 두 번(화면 설계·캐스팅). 실측 ~55초.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 이 경로는 **종류가 없는 옛 문서**만 다룬다 — 광고는 /api/ads/*, film 은 /api/film/* 이 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!isStepDoc(project)) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
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
  runInBackground(
    runSplitPipeline(id, user.id).catch(async (e) => {
      console.error("split pipeline error:", e);
      // 컷 분할이 죽으면 cuts가 영영 비어 있다 — 화면이 5분을 기다리지 않게 실패를 남긴다
      await updateProject(id, user.id, (proj) => ({
        ...proj,
        cuts_error: e?.message || "컷을 나누지 못했어요",
      })).catch(() => {});
    })
  );
  return Response.json({ started: true });
});
