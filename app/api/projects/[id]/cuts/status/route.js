import { getProject } from "../../../../../../lib/projects";

// TEMP(Task 7 에서 requireUser 로 교체) — 인증이 붙기 전까지의 자리표시자.
// 이 상수가 남아 있으면 Task 7 이 안 끝난 것이다.
const TEMP_OWNER = process.env.SHOTFORM_TEMP_OWNER || "00000000-0000-0000-0000-000000000000";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id, TEMP_OWNER);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({ status: project.status, cuts: project.cuts, cuts_error: project.cuts_error || null });
}
