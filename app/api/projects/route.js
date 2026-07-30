import { createProject } from "../../../lib/projects";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects";
import { TARGET_CHOICES } from "../../../lib/script";
import { normalizeStyle } from "../../../lib/styles";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string") {
    return Response.json({ error: "material.text가 필요해요" }, { status: 400 });
  }
  // 원하는 길이는 사장님이 고른다. 고르지 않으면(null) 자료가 담은 사실 수로 정한다.
  // 목록에 없는 값은 조용히 무시한다 — 400으로 막으면 자료를 다 쓰고 되돌아가야 한다.
  const target = TARGET_CHOICES.includes(body?.settings?.target_seconds)
    ? body.settings.target_seconds
    : null;
  // 영상 컨셉은 자료를 넣는 화면에서 함께 고른다. 길이와 달리 조용히 무시하지 않는다 —
  // 고른 컨셉과 그림에 실리는 컨셉이 달라지면 아무도 못 알아본다.
  // 400 이어도 써 둔 자료는 화면에 남으므로(로컬 state) 되돌아가 다시 쓸 일이 없다.
  let style;
  if (body?.settings?.style !== undefined) {
    try {
      style = normalizeStyle(body.settings.style);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }
  // 영상 사이즈도 자료를 넣는 화면에서 고른다. 길이와 같은 종류의 값이다 —
  // 모르는 값은 조용히 기본(세로)으로 떨어진다: 이 값으로 유료 호출이 나가지만, 목록 밖
  // 값은 우리 화면에서 나올 수 없고(닫힌 칩) 400 으로 막으면 자료를 다시 써야 한다.
  const aspect = isAspect(body?.settings?.aspect_ratio)
    ? body.settings.aspect_ratio
    : DEFAULT_ASPECT_ID;
  const project = await createProject({
    settings: { aspect_ratio: aspect, target_seconds: target, ...(style ? { style } : {}) },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
  });
  return Response.json(project);
}
