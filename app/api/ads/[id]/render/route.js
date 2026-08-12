import { withUser } from "../../../../../lib/auth/require-user.js";
import { updateProject } from "../../../../../lib/projects.js";
import { runAdRenderPipeline } from "../../../../../lib/ad/pipeline.js";
import { assertCanAfford, NoCredits, alreadyChargedAd } from "../../../../../lib/charges.js";
import { adVideoPrice } from "../../../../../lib/pricing.js";
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

  // 살아 있는 청구가 없을 때만 잔액을 본다(다시 굽기는 새 회차라 또 받는다).
  if (!(await alreadyChargedAd(id))) {
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
