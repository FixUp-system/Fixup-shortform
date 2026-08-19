import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject, isStepDoc } from "../../../../../lib/projects";
import { runImagesPipeline, withProgress } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { fakeFal } from "../../../../../lib/fake";
import { modelIdForProject, projectSpeaks, resolutionForProject } from "../../../../../lib/clip-limits.js";

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
// 컷마다 그림 한 장 + VLM 검수. 실측 3컷 ~13초.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 이 경로는 **종류가 없는 옛 문서**만 다룬다 — 광고는 /api/ads/*, film 은 /api/film/* 이 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!isStepDoc(project)) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 컷은 시나리오 확정이 나눈다(POST /cuts) — 컷이 없으면 그릴 대상이 없다
  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "시나리오를 먼저 확정해 주세요" }, { status: 400 });

  // 낭독이 있어야 컷 길이가 확정된다. 길이를 모르는 채로 그리면
  // 10초를 넘는 컷을 뒤늦게 알고 그림 값을 두 번 치른다.
  // ★ 말하는 모델은 예외다 — 목소리를 클립이 만들므로 낭독이 아예 없고,
  //   컷 길이는 분할 때 잡은 추정 초가 그대로 최종값이다(lib/subtitles.js 의 cutSeconds).
  if (!projectSpeaks(project) && !cuts.some((c) => c.audio)) {
    return Response.json({ error: "목소리를 먼저 만들어 주세요" }, { status: 400 });
  }

  // 멱등 가드 — 이미 그린 그림을 통째로 다시 사지 않는다(컷별 재생성으로 처리).
  // 컷당 후보 2장이라 이 단계가 가장 비싸다.
  if (cuts.some((c) => c.image)) {
    return Response.json(
      { error: "이미 만든 이미지가 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  // 시작 게이트 + 청구 — 단계별로 온 사장님도 같은 정가를 낸다.
  // 이미 낸 프로젝트는 requireVideoCharge 가 그냥 지나간다(/clips·/voice 와 같은 문).
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다(assertBudget 과 같은 규칙).
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
        model: modelIdForProject(project), resolution: resolutionForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  // 시작 시각을 여기서 찍는다 — 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어
  // "멈췄다"를 판정할 근거가 없다(컷마다 찍는 심장박동은 첫 컷이 끝나야 처음 뛴다).
  //
  // ★ 표식은 손으로 짓지 않고 withProgress 로 만든다. done 을 0 으로 박으면 이미 끝난 컷이
  //   있는 자리에서 **일어난 적 없는 뒷걸음**을 기록하게 되고(/clips 의 "남은 N개 만들기"),
  //   표식의 모양을 만드는 곳이 둘이 되면 언젠가 조용히 어긋난다 — 끝남 판정을
  //   lib/progress.js 한 벌로 모은 것과 같은 이유다.
  // ★ 시각은 락 밖에서 잰다 — updateProject 는 CAS 에 지면 같은 patchFn 을 다시 부른다
  //   (lib/projects.js). patchFn 안에서 Date.now() 를 부르면 시도마다 값이 달라진다.
  const startedAt = Date.now();
  await updateProject(id, user.id, (proj) =>
    withProgress(
      {
        ...proj,
        images_error: null,
        cuts: proj.cuts.map((c) => ({ ...c, state: "pending" })),
      },
      "images",
      startedAt
    )
  );

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (컷 파이프라인과 같은 방식)
  runInBackground(
    runImagesPipeline(id, user.id).catch(async (e) => {
      console.error("images pipeline error:", e);
      await updateProject(id, user.id, (proj) => ({
        ...proj, images_error: e?.message || "이미지를 만들지 못했어요",
      })).catch(() => {});
    })
  );
  return Response.json({ started: true });
});
