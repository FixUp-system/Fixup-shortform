import { getProject, updateProject } from "../../../../../lib/projects";
import { runVideoPipeline } from "../../../../../lib/pipeline";

// 경로가 clips 인 이유: app/api/video (Quick Create 의 text-to-video)가 이미 있다.
export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  // 클립 길이는 낭독 길이에서 나온다 — 소리가 없으면 몇 초를 만들지 알 수 없다
  if (!cuts.some((c) => c.audio)) {
    return Response.json({ error: "목소리를 먼저 만들어 주세요" }, { status: 400 });
  }

  // 멱등 가드 — 이미 만든 클립을 통째로 지우지 않는다(컷별 재생성으로 처리)
  if (project.status === "video" && cuts.some((c) => c.video)) {
    return Response.json(
      { error: "이미 만든 영상이 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  await updateProject(id, (proj) => ({ ...proj, video_error: null }));

  runVideoPipeline(id).catch(async (e) => {
    console.error("video pipeline error:", e);
    await updateProject(id, (proj) => ({
      ...proj, video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
