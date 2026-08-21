import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";
import { MAX_PHOTOS } from "../../../lib/photos.js";
import { MAX_MATERIAL_TEXT } from "../../../lib/material.js";
import { DEFAULT_I2V_MODEL } from "../../../lib/clip-limits.js";

// reel 프로젝트를 만든다 — kind:"reel" 로, 옛 단계별 흐름(isStepDoc)과 격리된다
// (lib/projects.js 의 KINDS, 2026-08-21).
export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string" || !body.material.text.trim()) {
    return Response.json({ error: "무엇을 만들지 적어 주세요" }, { status: 400 });
  }

  const aspect = body?.settings?.aspect_ratio ?? DEFAULT_ASPECT_ID;
  if (!isAspect(aspect)) {
    return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });
  }

  const photos = Array.isArray(body.material.photos) ? body.material.photos : [];
  if (photos.length > MAX_PHOTOS) {
    return Response.json({ error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요` }, { status: 400 });
  }
  if (!(await ownedPhotoKeys(photos, user.id))) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }

  const project = await createProject({
    ownerId: user.id,
    kind: "reel",
    material: { text: body.material.text.slice(0, MAX_MATERIAL_TEXT), photos },
    settings: {
      aspect_ratio: aspect,
      // ★★ 이 모델로 고정한다 — reel 은 "클립이 직접 말한다"(speaks:true) 위에 서 있다.
      //   여기서 안 박으면 modelIdForProject 가 없는 값을 LEGACY_I2V_MODEL(kling-v3,
      //   speaks:false) 로 떨어뜨려 대사가 통째로 사라진다(lib/clip-limits.js).
      i2v_model: DEFAULT_I2V_MODEL,
    },
  });
  return Response.json(project);
});
