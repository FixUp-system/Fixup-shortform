import { getProject, updateProject } from "../../../../lib/projects";
import { briefingContentChanged } from "../../../../lib/briefing";

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
      if (body.briefing) {
        next.briefing = { ...proj.briefing, ...body.briefing };
        // 버전은 "확정했다"가 아니라 "내용이 바뀌었다"에 묶는다 — 확정만 다시 눌러도 버전이 오르면
        // 대본 화면에 거짓 안내가 뜨고, 그 안내의 [대본 다시 쓰기]는 유료 호출이다.
        // 브리핑이 처음 생기는 저장은 "바뀐" 것이 아니다(직접 채우기 폴백) — 1에서 시작한다.
        const changed = proj.briefing ? briefingContentChanged(proj.briefing, next.briefing) : false;
        next.briefing.version = (proj.briefing?.version || 1) + (changed ? 1 : 0);
      }
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
      // 장면 직접 편집. version을 올리지 않는다 — 사장님이 손으로 고친 것을
      // "구성이 바뀌었다"로 알리면 대본 화면에 거짓 경고가 뜨고, 그 버튼은 유료 호출이다.
      if (body.synopsis_scene && proj.synopsis && Number.isInteger(body.synopsis_scene.idx)) {
        const { idx, shows, says } = body.synopsis_scene;
        next.synopsis = {
          ...proj.synopsis,
          scenes: proj.synopsis.scenes.map((s, i) =>
            i !== idx ? s : {
              ...s,
              ...(typeof shows === "string" && shows.trim() ? { shows: shows.trim() } : {}),
              ...(typeof says === "string" && says.trim() ? { says: says.trim() } : {}),
            }
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
