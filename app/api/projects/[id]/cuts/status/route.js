import { getProject } from "../../../../../../lib/projects";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({ status: project.status, cuts: project.cuts });
}
