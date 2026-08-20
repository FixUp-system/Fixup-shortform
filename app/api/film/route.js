import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../lib/ad/options.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";
// 사진 상한 — 화면(app/film/one/[mode]/page.js)과 **같은 파일**에서 읽는다. 두 벌이면 화면은
// 통과시키는데 서버가 400 을 내고, 사장님은 다 올린 뒤에야 거절당한다.
import { MAX_PHOTOS } from "../../../lib/photos.js";
import { MAX_MATERIAL_TEXT } from "../../../lib/material.js";

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string" || !body.material.text.trim()) {
    return Response.json({ error: "무엇을 만들지 적어 주세요" }, { status: 400 });
  }

  // 컨셉·분위기·말·화풍은 광고와 **같은 닫힌 목록**을 쓴다(두 벌이면 갈린다).
  let options;
  try {
    options = normalizeAdOptions(body?.settings);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
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
    kind: "film",
    material: { text: body.material.text.slice(0, MAX_MATERIAL_TEXT), photos },
    settings: {
      ...options,
      aspect_ratio: aspect,
      // ★★ 길이·화질·모델은 **화면이 고르는 축이 아니다.** 이 기능은 두 방식(장면 순서 ·
      //   참고 그림) 중 어느 쪽이 나은지를 재는 자리라, 두 편의 조건이 같아야 한다 —
      //   한쪽만 1080p 30초로 구우면 차이가 방식 때문인지 조건 때문인지 알 수 없다.
      //   그래서 body 의 값을 보지 않고 여기서 박는다(위 spread 뒤에 두는 이유도 그것이다).
      seconds: 15,          // 2.0 이 여는 길이. 30초는 2.5 가 필요하고 초당 단가가 더 비싸다
      resolution: "480p",   // 방식의 차이는 480p 로도 보인다 — 재는 값을 싸게 산다
      model: "seedance-2.0",
    },
  });
  return Response.json(project);
});
