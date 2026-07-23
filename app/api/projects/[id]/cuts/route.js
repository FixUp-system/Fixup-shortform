import { getProject } from "../../../../../lib/projects";
import { runCutsPipeline } from "../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.script) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (로컬 node 서버 전제. 배포 시 잡 큐 이관)
  runCutsPipeline(id).catch((e) => console.error("pipeline error:", e));
  return Response.json({ started: true });
}
