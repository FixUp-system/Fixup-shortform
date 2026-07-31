import { getProject } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";

export const GET = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: project.status,
    render: project.render || null,
    render_error: project.render_error || null,
  });
});
