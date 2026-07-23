import { getProject, updateProject } from "../../../../lib/projects";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const project = await updateProject(id, (proj) => {
      const next = { ...proj };
      if (body.material) next.material = { ...proj.material, ...body.material };
      if (body.settings) next.settings = { ...proj.settings, ...body.settings };
      if (body.cut && Number.isInteger(body.cut.idx) && typeof body.cut.sentence === "string") {
        next.cuts = proj.cuts.map((c) =>
          c.idx === body.cut.idx ? { ...c, sentence: body.cut.sentence } : c
        );
      }
      if (body.script_paragraph && proj.script &&
          Number.isInteger(body.script_paragraph.idx) && typeof body.script_paragraph.text === "string") {
        next.script = {
          ...proj.script,
          paragraphs: proj.script.paragraphs.map((p, i) =>
            i === body.script_paragraph.idx ? { ...p, text: body.script_paragraph.text } : p
          ),
        };
      }
      return next;
    });
    return Response.json(project);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
