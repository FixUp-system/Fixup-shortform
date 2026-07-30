import { getProject, updateProject } from "../../../../lib/projects";
import { briefingContentChanged } from "../../../../lib/briefing";
import { activeClipLimits } from "../../../../lib/clip-limits";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 활성 모델의 클립 상한을 함께 실어 보낸다 — 저장하지 않고 요청마다 지금 env 로 푼다.
  // 화면은 서버 env 를 볼 수 없어서, 이 값 없이는 기본 프로필(20초)로 판정한다.
  return Response.json({ ...project, clip_limits: activeClipLimits() });
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
        // 초점이 바뀌면 컷을 비운다 — 화면과 캐스팅이 그것을 기준으로 다시 만들어져야 한다.
        // 실제로 달라졌을 때만 비운다: 같은 값으로 저장했는데 지우면 고쳐 둔 화면이 날아간다.
        const focusKey = (f) => `${f?.mode || ""}|${(f?.subject || "").trim()}`;
        if (focusKey(proj.briefing?.focus) !== focusKey(next.briefing?.focus)) {
          next.cuts = [];
          next.cuts_error = null;
        }
      }
      // 컷 한 줄 고치기 — 문장·화면·움직임. 준 것만 바꾼다(빈 값으로 지우지 않게).
      // 사장님이 구성 단계에서 손보는 자리다. 이미지·클립은 이 값들을 읽어 만든다.
      if (body.cut && Number.isInteger(body.cut.idx)) {
        const patch = {};
        for (const key of ["sentence", "shows", "motion"]) {
          if (typeof body.cut[key] === "string" && body.cut[key].trim()) {
            patch[key] = body.cut[key].trim();
          }
        }
        if (Object.keys(patch).length) {
          next.cuts = proj.cuts.map((c) => (c.idx === body.cut.idx ? { ...c, ...patch } : c));
        }
      }
      // 원고 직접 편집. version을 올리지 않는다 — 사장님이 손으로 고친 것을
      // "원고가 바뀌었다"로 알리면 이미지 화면에 거짓 경고가 뜨고, 그 버튼은 유료 호출이다.
      // (손으로 고친 문장을 컷에 반영하려면 컷을 다시 만들어야 하는 것은 그대로다.)
      if (typeof body.script_text === "string" && body.script_text.trim() && proj.script) {
        next.script = { ...proj.script, text: body.script_text.trim() };
      }
      return next;
    });
    return Response.json(project);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
