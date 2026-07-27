import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateSynopsis } from "../../../../../lib/validate";
import { buildSynopsisMessages } from "../../../../../lib/synopsis";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));
  const photoIds = (project.material?.photos || []).map((p) => p.id);
  const { system, messages } = buildSynopsisMessages(project, instruction);

  let synopsis = null;
  for (let attempt = 0; attempt < 2 && !synopsis; attempt++) {
    try {
      synopsis = validateSynopsis(await callJson({ system, messages }), photoIds);
    } catch {
      break;
    }
  }
  if (!synopsis) {
    return Response.json({ error: "구성 만들기에 실패했어요. 다시 시도해 주세요." }, { status: 502 });
  }

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "synopsis",
    synopsis: {
      ...synopsis,
      version: (proj.synopsis?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ synopsis: updated.synopsis });
}
