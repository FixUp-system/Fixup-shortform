import { withUser } from "../../../../../lib/auth/require-user.js";
import { startAdRender } from "../../../../../lib/ad/pipeline.js";
import { assertCanAfford, NoCredits, alreadyChargedAd } from "../../../../../lib/charges.js";
import { adVideoPrice } from "../../../../../lib/pricing.js";
import { hasRenderedAdVideo } from "../../../../../lib/ad/attempt.js";
import { loadAd } from "../route.js";

// ★ 유료 입구다. 청구는 파이프라인이 하지만, **낼 수 있는지는 여기서 먼저 본다** —
//   그래야 사장님이 402 를 HTTP 로 받는다. 파이프라인은 fire-and-forget 이라
//   거기서 던지면 응답이 이미 나가 있다.
export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (!project.scenario?.text) {
    return Response.json({ error: "시나리오를 먼저 만들어 주세요" }, { status: 400 });
  }
  if (project.status === "rendering") {
    return Response.json({ error: "이미 만드는 중이에요" }, { status: 400 });
  }

  // 살아 있는 청구가 없거나, 이미 영상을 낸 회차([다시 만들기]가 새 회차를 열 것)면
  // 잔액을 본다. "이미 영상 있음" 판정은 lib/ad/attempt.js 하나 — 파이프라인의 chargeAd
  // 호출(lib/ad/pipeline.js)과 같은 판정을 써야 한다. 여기서만 통과시키고 파이프라인이
  // 못 받으면(또는 반대) 두 자리가 어긋나 사고가 난다.
  //
  // 굽는 도중(청구는 했지만 아직 videos 가 없는) 재시도는 여기서 openNewAttempt==false 라
  // 계속 통과한다 — 그게 옳다(같은 회차를 이어서 굽는 정상 흐름).
  if (!(await alreadyChargedAd(id)) || hasRenderedAdVideo(project)) {
    try {
      // ★ 모델을 넘긴다 — 안 넘기면 항상 기본 모델 값으로 잔액을 검사하게 되어,
      // 더 비싼 모델로 구우려는 사람이 402 를 안 받고 통과했다가 실제 청구(lib/ad/pipeline.js 의
      // chargeAd, 같은 project.settings.model 을 읽는다)에서야 모자란 것이 드러난다.
      //
      // ★ Task 24 — 해상도도 넘긴다(같은 이유, 같은 원칙). ⚠️ 다만 lib/ad/pipeline.js 의
      // chargeAd 호출은 이번 태스크에서 resolution 을 못 넘겼다(그 파일이 Task 23 이 쓰는
      // 중이라 잠겨 있다) — 그래서 실제 청구는 지금 항상 720p 값이다. 480p·1080p 를 고른
      // 사장님에게는 이 잔액 검사가 실제로 받을 금액보다 **더 높게** 요구할 수 있다(과소
      // 청구가 아니라 과잉 게이트다 — 손해 보는 방향은 아니지만 사용자 경험 결함이다).
      // 자세한 내용은 task-24-report.md의 "후속으로 남긴 것" 참고.
      await assertCanAfford(
        user.id,
        adVideoPrice(project.settings?.seconds, project.settings?.model, project.settings?.resolution)
      );
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  // ★★ await 한다. 예전에는 파이프라인을 띄우고 바로 202 를 보냈는데(fire-and-forget),
  // 배포(Vercel 서버리스)는 **응답이 나가면 인스턴스를 얼린다** — fal 폴링 루프가 통째로
  // 사라져 영상이 영영 안 나왔다(시나리오는 동기 경로라 멀쩡했고 영상만 안 됐다).
  //
  // 그렇다고 여기서 완성까지 기다릴 수도 없다: lib/ad/timing.js 실측이 출력 1초당 ≈33.5초라
  // 15초 광고가 ≈8.4분인데 서버리스 상한은 300초다. 그래서 startAdRender 는 **접수만** 한다 —
  // 몇 초로 끝나고, 완성은 화면이 두드리는 GET …/status 가 수거한다.
  try {
    await startAdRender(id, user.id);
  } catch (e) {
    // 여기서 실패하면 startAdRender 가 이미 환불하고 문서에 video_error 를 남겼다.
    console.error("광고 접수 실패:", e);
    return Response.json({ error: e?.message || "영상을 만들지 못했어요" }, { status: 500 });
  }

  return Response.json({ started: true }, { status: 202 });
});
