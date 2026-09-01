import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../lib/ad/options.js";
import {
  isAdSeconds, isAdModel, isRetiredModel, adSecondsFor, DEFAULT_AD_MODEL,
  isAdResolution, adResolutionsFor, adDefaultResolution, adRefMax,
} from "../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { isPhotoRole } from "../../../lib/photos.js";
import { withUser } from "../../../lib/auth/require-user.js";
import { getStore } from "../../../lib/store/index.js";
import { tierOf, tierAllowsModel } from "../../../lib/tiers.js";
import { MAX_MATERIAL_TEXT } from "../../../lib/material.js";

// ★★★ 2026-08-28 — 사진 상한을 **모델 표 하나**(lib/ad/models.js 의 adRefMax)가 정한다.
//   그전에는 `MAX_PHOTOS = 4` 가 네 군데에 손으로 적혀 있었다(화면·생성 라우트·수정 라우트·
//   lib/photos.js). 네 벌이면 한쪽만 고쳐도 아무도 안 잡는다 — 이 저장소가 "같은 값을 두
//   군데 두지 않는다"로 부르는 규율을 정면으로 어긴 자리였다.
//   fal 스키마 실측(2026-08-28): Seedance 2.0 = 9장 · Seedance 2.5 = **30장** · H3 = 9장.
//   ⚠️ 사진 한 장은 10MB 까지 올라가고 fal 에는 base64(1.33배)로 실린다. 30장을 꽉 채우면
//     요청이 아주 커진다 — 접수가 실패하면 크레딧은 환불되지만(failAndRefund) 그때 실측해
//     총 바이트 상한을 따로 걸어야 한다.

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

  // ★★★ **등급이 여는 모델인가 — 서버가 판정한다**(2026-08-20).
  //
  // 2.5 는 그전까지 `hidden: true` 로 숨겨져 있었는데, 그것은 화면에서만 거르는 것이라
  // (app/ads/new/page.js 의 filter) 이 자리는 그대로 통과시켰다 — 즉 잠금이 아니라
  // **가림막**이었고 API 를 직접 두드리면 만들어졌다.
  // 이 저장소가 같은 자리에서 이미 배운 것: "화면 잠금은 한 벌뿐이라 샌다(탭 둘·새로고침
  // 실패·직접 호출). 그리고 새면 돈이 두 번 나간다"(lib/ad/pipeline.js).
  // 2.5 는 원가가 2.0 의 3배 이상이다(15초 720p ≈ $6.93) — 새면 그만큼이 나간다.
  //
  // ★ 등급은 원장(profiles)에서 읽는다. app_metadata 가 아니다 — 그쪽은 middleware 가 매
  //   요청 읽는 게이트 캐시이고, 등급은 이 자리에서만 필요하다(db/schema.sql 의 그 주석).
  // ★ 관리자는 등급을 안 탄다(2026-08-21) — lib/tiers.js 의 modelsForTier 머리말 참고.
  //   해상도 게이트(아래)와 **같은 축**을 본다.
  // ★ 선언이 **두 게이트보다 위**에 있어야 한다 — 아래에 두면 모델 게이트가 선언 전에
  //   읽어 ReferenceError 로 500 이 난다(const 의 사각지대).
  const admin = user.role === "admin";
  const tier = tierOf((await getStore().findProfiles([user.id])).get(user.id));
  if (!tierAllowsModel(tier, model, { admin })) {
    return Response.json({ error: "지금 등급에서는 고를 수 없는 모델이에요" }, { status: 403 });
  }
  // ★★★ **은퇴한 모델로는 새로 안 만든다**(2026-09-01). 위 게이트는 그것을 통과시키는데,
  //   그 자리는 **이미 만든 문서를 다시 굽기 위한** 문이다. 여기서 안 막으면 화면에서만
  //   사라지고 API 로는 계속 만들어진다 — 2.5 를 `hidden` 으로 가렸을 때 겪은 그
  //   "가림막" 문제와 같은 모양이 된다.
  // ★ **관리자는 지난다** — 등급 게이트와 같은 축이다(lib/tiers.js 머리말). 막으면
  //   2.5 의 1080p 같은 관리자 전용 자리가 다시 죽은 코드가 된다.
  if (!admin && isRetiredModel(model)) {
    return Response.json({ error: "그 모델은 이제 새로 만들 수 없어요" }, { status: 403 });
  }

  // ★ 길이는 고른 모델 기준이다 — 모델마다 고를 수 있는 길이가 다르다(2.0=15초,
  // 2.5=15·30초). AD_SECONDS 처럼 전역 배열 하나로 재던 시절과 갈리는 자리다.
  const seconds = body?.settings?.seconds ?? adSecondsFor(model)[0];
  if (!isAdSeconds(seconds, model)) {
    return Response.json({ error: `이 모델은 ${adSecondsFor(model).join("·")}초만 만들 수 있어요` }, { status: 400 });
  }

  // ★ Task 24 — 해상도도 모델에 딸린 닫힌 목록이다(길이와 같은 결). 안 보내면 기본
  // 해상도(720p)를 명시 저장한다 — 옛 문서 보호 규칙과 같은 값이라 "생략=720p"가
  // 만드는 시점부터 저장된 시점까지 한 번도 안 갈린다.
  // ★★ 기본 해상도는 **모델이 정한다**(2026-08-21) — H3 에는 720p 가 아예 없어서
  //   전역 DEFAULT_AD_RESOLUTION 을 쓰면 그 자리에서 400 이 난다.
  // ★★ 관리자 전용 해상도(2.5 의 1080p)는 **서버가 판정한다.** 화면에서만 거르면
  //   가림막이지 잠금이 아니다 — 2.5 를 hidden 으로 두었다가 API 로 뚫린 그 자리다.
  //   한 편에 $15.60~31.20 이라 새면 그만큼이 그대로 나간다.
  const resolution = body?.settings?.resolution ?? adDefaultResolution(model);
  if (!isAdResolution(resolution, model, { admin })) {
    return Response.json(
      { error: `이 모델은 ${adResolutionsFor(model, { admin }).join("·")} 만 만들 수 있어요` },
      { status: 400 }
    );
  }
  const aspect = body?.settings?.aspect_ratio ?? DEFAULT_ASPECT_ID;
  if (!isAspect(aspect)) {
    return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });
  }

  //   상한은 **모델 표 하나**가 정한다(lib/ad/models.js 의 adRefMax). 화면도 같은 함수를 본다.
  const photos = Array.isArray(body.material.photos) ? body.material.photos : [];
  const photoMax = adRefMax(model);
  if (photos.length > photoMax) {
    return Response.json({ error: `사진은 ${photoMax}장까지 올릴 수 있어요` }, { status: 400 });
  }
  // ★ 사진의 **종류**도 닫힌 목록이다(2026-08-31). 화면에서만 거르면 가림막이지
  //   잠금이 아니다 — 이 저장소가 2.5 를 hidden 으로 두었다가 API 로 뚫린 그 자리다.
  // ★ **없으면 통과한다** — 옛 문서와 구버전 화면이 종류 없이 보낸다. 모르는 값만 막는다.
  if (photos.some((ph) => ph?.role !== undefined && !isPhotoRole(ph.role))) {
    return Response.json({ error: "그 사진 종류는 몰라요" }, { status: 400 });
  }
  if (!(await ownedPhotoKeys(photos, user.id))) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }

  const project = await createProject({
    kind: "ad",
    // ★ 모델을 명시 저장한다. 나중에 모델이 늘 때 "값이 없으면 어느 모델인가"가
    //   옛 문서의 뜻을 바꾼다 — 처음부터 적어 두면 그 질문이 안 생긴다.
    settings: { ...options, seconds, aspect_ratio: aspect, model, resolution },
    material: { text: body.material.text.slice(0, MAX_MATERIAL_TEXT), photos },
    ownerId: user.id,
  });
  return Response.json(project);
});
