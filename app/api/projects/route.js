import { createProject } from "../../../lib/projects";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body?.settings || typeof body?.material?.text !== "string") {
    return Response.json({ error: "settings와 material.text가 필요해요" }, { status: 400 });
  }
  const { purpose, duration_s, aspect_ratio } = body.settings;
  if (![15, 30, 45, 60].includes(duration_s) || !["9:16", "1:1", "16:9"].includes(aspect_ratio)) {
    return Response.json({ error: "길이/비율 값이 잘못됐어요" }, { status: 400 });
  }
  const project = await createProject({
    settings: { purpose: String(purpose || "홍보·판매"), duration_s, aspect_ratio },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
  });
  return Response.json(project);
}
