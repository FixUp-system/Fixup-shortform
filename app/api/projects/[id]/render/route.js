import { getProject, updateProject } from "../../../../../lib/projects";
import { runRenderPipeline } from "../../../../../lib/pipeline";

// TEMP(Task 7 에서 requireUser 로 교체) — 인증이 붙기 전까지의 자리표시자.
// 이 상수가 남아 있으면 Task 7 이 안 끝난 것이다.
const TEMP_OWNER = process.env.SHOTFORM_TEMP_OWNER || "00000000-0000-0000-0000-000000000000";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id, TEMP_OWNER);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  // 완성본은 다시 만들 수 있다 — 멱등 가드를 두지 않는다.
  // 합성은 fal 호출이 아니라(기본 경로) 비용이 들지 않고, 컷을 고친 뒤 다시 만드는 게 정상 흐름이다.
  await updateProject(id, TEMP_OWNER, (proj) => ({ ...proj, render_error: null, render: null }));

  runRenderPipeline(id, TEMP_OWNER).catch(async (e) => {
    console.error("render pipeline error:", e);
    await updateProject(id, TEMP_OWNER, (proj) => ({
      ...proj, render_error: e?.message || "합성하지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
