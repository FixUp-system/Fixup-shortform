import { getProject, updateProject } from "../../../../../lib/projects";
import { runRenderPipeline } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  // 완성본은 다시 만들 수 있다 — 멱등 가드를 두지 않는다.
  // 합성은 fal 호출이 아니라(기본 경로) 비용이 들지 않고, 컷을 고친 뒤 다시 만드는 게 정상 흐름이다.
  await updateProject(id, user.id, (proj) => ({ ...proj, render_error: null, render: null }));

  runRenderPipeline(id, user.id).catch(async (e) => {
    console.error("render pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, render_error: e?.message || "합성하지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
