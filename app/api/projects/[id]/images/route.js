import { getProject, updateProject } from "../../../../../lib/projects";
import { runImagesPipeline } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { fakeFal } from "../../../../../lib/fake";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 컷은 대본 승인이 나눈다(POST /cuts) — 컷이 없으면 그릴 대상이 없다
  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });

  // 낭독이 있어야 컷 길이가 확정된다. 길이를 모르는 채로 그리면
  // 10초를 넘는 컷을 뒤늦게 알고 그림 값을 두 번 치른다.
  if (!cuts.some((c) => c.audio)) {
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
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    images_error: null,
    cuts: proj.cuts.map((c) => ({ ...c, state: "pending" })),
  }));

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (컷 파이프라인과 같은 방식)
  runImagesPipeline(id, user.id).catch(async (e) => {
    console.error("images pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, images_error: e?.message || "이미지를 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
