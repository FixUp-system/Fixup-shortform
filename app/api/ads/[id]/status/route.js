import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadAd } from "../route.js";

// 화면이 2초마다 편다. doc 통짜를 안 실어 보낸다 — 필요한 것만 준다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: project.status,
    video: project.videos?.[0] || null,
    error: project.video_error || null,
  });
});
