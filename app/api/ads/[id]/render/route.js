import { withUser } from "../../../../../lib/auth/require-user.js";
import { updateProject } from "../../../../../lib/projects.js";
import { runAdRenderPipeline } from "../../../../../lib/ad/pipeline.js";
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
      await assertCanAfford(user.id, adVideoPrice(project.settings?.seconds));
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  runAdRenderPipeline(id, user.id).catch(async (e) => {
    console.error("광고 파이프라인 실패:", e);
    await updateProject(id, user.id, (p) => ({
      ...p, video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
  });

  return Response.json({ started: true }, { status: 202 });
});
