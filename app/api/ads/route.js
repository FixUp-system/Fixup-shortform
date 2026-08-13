import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../lib/ad/options.js";
import { isAdSeconds, isAdModel, adSecondsFor, DEFAULT_AD_MODEL } from "../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";

// 사진 상한. base64 는 1.33배로 부는데 fal 요청 본문에 통째로 실린다 —
// 10MB 짜리 아홉 장이면 100MB 를 넘는다. 실측하고 올린다.
const MAX_PHOTOS = 4;

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string" || !body.material.text.trim()) {
    return Response.json({ error: "무엇을 만들지 적어 주세요" }, { status: 400 });
  }

  // 옵션은 **닫힌 목록**이다. 조용히 기본값으로 떨어뜨리지 않는다 —
  // 고른 것과 만들어지는 것이 다르면 아무도 못 알아본다.
  let options;
  try {
    options = normalizeAdOptions(body?.settings);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  // 모델도 **닫힌 목록**이다. 모르는 모델이면 400 — 여기를 통과한 값만 값이 걸린
  // 가격·과금 계산(lib/pricing.js·lib/charges.js)에 흘러간다.
  const model = body?.settings?.model ?? DEFAULT_AD_MODEL;
  if (!isAdModel(model)) {
    return Response.json({ error: "그 영상 모델은 몰라요" }, { status: 400 });
  }

  // ★ 길이는 고른 모델 기준이다 — 모델마다 고를 수 있는 길이가 다르다(2.0=15초,
  // 2.5=15·30초). AD_SECONDS 처럼 전역 배열 하나로 재던 시절과 갈리는 자리다.
  const seconds = body?.settings?.seconds ?? adSecondsFor(model)[0];
  if (!isAdSeconds(seconds, model)) {
    return Response.json({ error: `이 모델은 ${adSecondsFor(model).join("·")}초만 만들 수 있어요` }, { status: 400 });
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
    kind: "ad",
    // ★ 모델을 명시 저장한다. 나중에 모델이 늘 때 "값이 없으면 어느 모델인가"가
    //   옛 문서의 뜻을 바꾼다 — 처음부터 적어 두면 그 질문이 안 생긴다.
    settings: { ...options, seconds, aspect_ratio: aspect, model },
    material: { text: body.material.text.slice(0, 4000), photos },
    ownerId: user.id,
  });
  return Response.json(project);
});
