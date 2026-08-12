import { createProject, listProjects } from "../../../lib/projects";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects";
import { TARGET_CHOICES } from "../../../lib/script";
import { normalizeStyle } from "../../../lib/styles";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";
import { DEFAULT_I2V_MODEL, I2V_MODEL_IDS } from "../../../lib/clip-limits";

// 내 프로젝트 목록 — doc 통짜를 안 실어 보낸다(listProjects 가 이미 요약해서 준다).
export const GET = withUser(async (_req, _ctx, user) => {
  return Response.json({ projects: await listProjects(user.id) });
});

export const POST = withUser(async (req, ctx, user) => {
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
  // 생성 시에도 같은 구멍이 있다 — 남의 업로드 키를 처음부터 material.photos 에 심을 수
  // 있었다(PATCH 와 같은 이유, 리뷰 I2).
  if (
    Array.isArray(body.material.photos) &&
    !(await ownedPhotoKeys(body.material.photos, user.id))
  ) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }
  const project = await createProject({
    settings: {
      aspect_ratio: aspect,
      target_seconds: target,
      // ★ 기본값을 **명시 저장**한다. 값이 없는 것은 "안 골랐다"가 아니라 "이 기능 전에
      //   만들어졌다"는 뜻이고, 그런 프로젝트는 Kling 으로 돈다(lib/clip-limits.js).
      i2v_model: I2V_MODEL_IDS.includes(body.settings?.i2v_model)
        ? body.settings.i2v_model
        : DEFAULT_I2V_MODEL,
      ...(style ? { style } : {}),
    },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
    ownerId: user.id,
  });
  return Response.json(project);
});
