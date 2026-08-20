// 광고 경로의 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
//
// ⚠️ 이 파일은 화면("use client")도 import 한다. **import 문을 두지 마라** —
//    순수 데이터·순수 함수만 있어야 번들에 fs 가 안 섞인다.
//    (lib/pricing.js·lib/styles.js·lib/aspects.js 와 같은 규율이다.)
//
// 모델 id 가 `bytedance/…` 라 `fal-ai/` 로 시작하지 않는다. 그래서 lib/costs.js 의
// 가짜 판정과 원가표가 이 접두사를 따로 알아야 한다(Task 3).
//
// ★ Task 21 — 길이가 이제 모델마다 다르다. `seconds` 가 그 모델에서 **고를 수 있는
//   길이의 닫힌 목록**이다(v1 이 제품으로 노출하는 값). `minSeconds`·`maxSeconds` 는
//   모델 자체가 실제로 지원하는 범위이고 성격이 다른 축이다(lib/ad/generate.js 의
//   fitsAdModel 이 그 축을 쓴다) — 둘을 섞지 않는다.
//
// ★ 2026-08-13 — 모델은 **둘뿐이다: 2.0 · 2.5**. 그전에는 "기본(2.0 standard)·저가
//   (2.0 fast)·2.5" 셋이었는데, "기본/저가"는 fal 의 모델 이름이 아니라 우리가 붙인
//   등급이라 사장님이 고른 것과 fal 이 받는 것이 머릿속에서 이어지지 않았다.
//   해상도도 모델이 실제로 여는 것만 둔다 — 2.0: 480p·720p·1080p · 2.5: 480p·720p.
//   ⚠️ 여기 문자열이 fal 의 모델 경로와 **글자 그대로** 같아야 한다. 한 글자만 달라도
//   404 인데, 그때는 이미 값을 치른 뒤다(tests/ad-two-models.test.js 가 지킨다).
//
// ★ (옛 기록) Task 24 — 기본을 fast → standard 로 바로잡았다. 처음 모델을 정할 때 "원가가 싸다"는
//   이유로 fast 를 추천했는데, 사장님이 실제로 쓰고 싶었던 것은 standard 다
//   (https://fal.ai/models/bytedance/seedance-2.0/text-to-video — "fast" 세그먼트가 없다).
//   standard 라야 1080p 가 열린다(fast 는 480p·720p 뿐). fast 는 **지우지 않고 남긴다** —
//   원가가 싸서 고를 이유가 있는 선택지이지, 잘못된 기본값이었을 뿐이다(아래 `resolutions`
//   가 새 축).
//
// ★ Task 24 — 해상도가 셋째 축이 됐다(모델 × 길이 × 해상도). `resolutions` 가 그 모델이
//   **고를 수 있는 해상도의 닫힌 목록**이다. `adResolutionsFor`·`isAdResolution` 이
//   `adSecondsFor`·`isAdSeconds` 와 같은 결로 이 축을 다룬다.

export const AD_MODELS = [
  {
    id: "seedance-2.0",
    // label 은 **칩에 쓰는 짧은 이름**이다(모델 묶음 안에 있어 "2.0" 만으로 읽힌다).
    // name 은 그 묶음 밖에서 쓰는 전체 이름 — 보관함 상세처럼 맥락이 없는 자리가 쓴다.
    label: "2.0",
    name: "Seedance 2.0",
    hint: "480p·720p·1080p · 15초 · 소리까지 한 번에",
    endpoints: {
      t2v: "bytedance/seedance-2.0/text-to-video",
      i2v: "bytedance/seedance-2.0/image-to-video",
      r2v: "bytedance/seedance-2.0/reference-to-video",
    },
    seconds: [15],
    minSeconds: 4,
    maxSeconds: 15,
    resolutions: ["480p", "720p", "1080p"],
    // fal 문서 확인값: t2v $0.3034/s · i2v·r2v $0.3024/s(둘 다 720p 기준) — 갈리는 폭이
    // 작아 더 비싼 쪽(t2v)으로 통일한다(세 갈래가 같은 단가로 잡히는 기존 규율 + 안전한
    // 방향). 1080p $0.682/s 도 fal 문서 값 그대로.
    // 480p 는 문서에 없다 — 720p:1080p 원가비(0.682/0.3034=2.248)가 가로폭 제곱비
    // (1080²/720²=2.25)와 거의 같아(같은 가로세로비라 픽셀수는 가로폭 제곱에 비례) 480p 도
    // 같은 식으로 추정한다: 0.3034 × (480/720)² = 0.3034 × 4/9 ≈ 0.1348.
    // ⚠️ 480p 는 계산값이지 실측이 아니다. 원가표(lib/costs.js)와 **같은 값이어야 한다**.
    perSecUsd: { "480p": 0.1348, "720p": 0.3034, "1080p": 0.682 },
  },
  {
    id: "seedance-2.5",
    label: "2.5",
    name: "Seedance 2.5",
    hint: "480p·720p · 15·30초 · 네이티브 오디오 · 멀티샷",
    // ★★ 2026-08-20 — **숨김에서 등급으로 옮겼다.** `hidden: true` 였고, 그것은 화면에서만
    //   거르는 것이라(app/ads/new/page.js 의 filter) 서버의 isAdModel 은 그대로 true 였다.
    //   즉 잠금이 아니라 **가림막**이었고, API 를 직접 두드리면 만들어졌다.
    //   이제 lib/tiers.js 가 "누가 쓸 수 있나"를 정하고 **서버가 판정한다**.
    //   두 축을 갈라 둔다: `hidden` = 아무도 못 쓴다 · 등급 = 누가 쓸 수 있나.
    // (옛 기록) 2026-08-13 에 "원가가 크다"로 숨겼고, 08-19 에 잠깐 열었다가 같은 날 닫았다.
    //   지우지 않은 이유는 그때나 지금이나 같다: 지우면 이미 2.5 로 만든 문서가
    //   adVideoPrice 에서 던져 화면째 죽는다(seedance-2.0-fast 가 정확히 그랬다).
    // ⚠️ 미검증 — 문서에서 본 문자열이고 실제로 불러본 적이 없다. 첫 호출에서 404/422 가
    //    나면 그때 고친다.
    endpoints: {
      t2v: "bytedance/seedance-2.5/text-to-video",
      i2v: "bytedance/seedance-2.5/image-to-video",
      r2v: "bytedance/seedance-2.5/reference-to-video",
    },
    seconds: [15, 30],
    minSeconds: 15,
    maxSeconds: 30,
    resolutions: ["480p", "720p"],
    // ⚠️ 계산값이지 실측이 아니다 — 2.5 를 실제로 불러본 적이 없다. 2.0 과 달리
    //    해상도가 원가를 정한다(토큰식: tokens = h×w×초×24/1024, $0.0214/1000토큰).
    //    9:16 720p(720×1280) 기준: tokens/s = 720×1280×24/1024 = 21600 → $/s = 21.6 × 0.0214
    //    = 0.4622(15초 ≈ $6.93 · 30초 ≈ $13.87). 9:16 480p(480×854, 세로 픽셀은 **가정**이지
    //    실측 아니다) 기준: tokens/s = 480×854×24/1024 ≈ 9607 → $/s ≈ 9.607×0.0214 = 0.2056
    //    (15초 ≈ $3.08 · 30초 ≈ $6.17). 원가표(lib/costs.js)와 **같은 값이어야 한다**.
    perSecUsd: { "480p": 0.2056, "720p": 0.4622 },
  },
];

export const DEFAULT_AD_MODEL = "seedance-2.0";

// 옛 문서(settings.resolution 이 없음)는 이 값으로 본다 — 지금까지 실제로 fal 에
// 보낸 해상도가 720p 하드코딩이었다(lib/ad/generate.js). 반대로 두면 이미 만든
// 영상들의 해상도 판정이 조용히 달라진다.
export const DEFAULT_AD_RESOLUTION = "720p";

// 모르는 id 는 기본 모델이다 — 옛 문서가 값을 안 들었을 때 죽지 않게.
// (문서에는 만들 때 명시 저장하므로 정상 흐름에서는 여기 안 온다.)
export function adModel(id) {
  return AD_MODELS.find((m) => m.id === id) || AD_MODELS.find((m) => m.id === DEFAULT_AD_MODEL);
}

// 라우트가 **닫힌 목록**으로 모델을 받을 때 쓴다. adModel() 은 모르는 id 를 기본 모델로
// 관대하게 떨어뜨리므로(옛 문서 보호용) "모르는지 아닌지"를 못 가린다 — 그래서 따로 둔다.
export function isAdModel(id) {
  return AD_MODELS.some((m) => m.id === id);
}

// 모델이 고를 수 있는 길이 — 닫힌 목록. modelId 가 없거나 모르면 기본 모델 기준이다
// (adModel 의 성질을 그대로 물려받는다 — 길이 판정은 돈이 걸리지 않아 관대해도 안전하다).
export function adSecondsFor(modelId) {
  return adModel(modelId).seconds;
}

// modelId 를 생략하면 기본 모델(2.0) 기준으로 본다 — 옛 호출부 호환.
// ★ 돈이 걸리는 가격(lib/pricing.js 의 adVideoPrice)은 이 관대한 폴백을 쓰지 않고
//   따로 엄격하게 던진다 — 여기는 검증만이라 어긋나도 "너무 깐깐하게 막는" 쪽으로만
//   틀린다(안전한 방향).
export function isAdSeconds(n, modelId) {
  return adSecondsFor(modelId).includes(n);
}

// 모르는 갈래는 **던진다.** 오타로 조용히 다른 모델을 부르면 값이 나가고 결과가 다르다 —
// lib/pricing.js 의 regenPrice 가 모르는 종류에 던지는 것과 같은 원칙이다.
export function adEndpoint(modelId, kind) {
  const e = adModel(modelId).endpoints[kind];
  if (!e) throw new Error(`모르는 영상 갈래: ${kind}`);
  return e;
}

// ── 해상도(Task 24) ─────────────────────────────────────────────────────
// adSecondsFor·isAdSeconds 와 같은 결이다 — 길이가 그랬듯 해상도도 모델마다 닫힌
// 목록이 다르다(2.0 standard 만 1080p, 나머지는 480p·720p 뿐).

// 모델이 고를 수 있는 해상도 — 닫힌 목록. modelId 가 없거나 모르면 기본 모델 기준이다
// (adSecondsFor 와 같은 폴백 — 돈이 안 걸린 검사라 관대해도 안전하다).
export function adResolutionsFor(modelId) {
  return adModel(modelId).resolutions;
}

// 라우트가 **닫힌 목록**으로 해상도를 받을 때 쓴다.
export function isAdResolution(resolution, modelId) {
  return adResolutionsFor(modelId).includes(resolution);
}
