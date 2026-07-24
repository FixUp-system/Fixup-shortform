import { createProject } from "../../../lib/projects";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string") {
    return Response.json({ error: "material.text가 필요해요" }, { status: 400 });
  }
  const project = await createProject({
    // 목적·길이는 폐지(자료가 결정), 비율은 9:16 고정 — docs/…/2026-07-24-pipeline-roadmap.md
    settings: { aspect_ratio: "9:16" },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
  });
  return Response.json(project);
}
