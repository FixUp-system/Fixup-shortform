import { getProject, updateProject } from "../../../../../lib/projects";
import { generateScript } from "../../../../../lib/script-gen";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));

  const script = await generateScript(project, id, { instruction });
  if (!script) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  const updated = await updateProject(id, user.id, (proj) => ({
    ...proj,
    status: "script",
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
});
