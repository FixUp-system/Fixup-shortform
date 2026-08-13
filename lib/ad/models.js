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

export const AD_MODELS = [
  {
    id: "seedance-2.0-fast",
    label: "기본",
    hint: "15초 · 소리까지 한 번에",
    endpoints: {
      t2v: "bytedance/seedance-2.0/fast/text-to-video",
      i2v: "bytedance/seedance-2.0/fast/image-to-video",
      r2v: "bytedance/seedance-2.0/fast/reference-to-video",
    },
    seconds: [15],
    minSeconds: 4,
    maxSeconds: 15,
    // 720p fast. 원가표(lib/costs.js)와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
    perSecUsd: 0.2419,
  },
  {
    id: "seedance-2.5",
    label: "2.5",
    hint: "15·30초 · 네이티브 오디오 · 멀티샷",
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
    // ⚠️ 계산값이지 실측이 아니다 — 2.5 를 실제로 불러본 적이 없다. 2.0 과 달리
    //    해상도가 원가를 정한다(토큰식: tokens = h×w×초×24/1024, $0.0214/1000토큰).
    //    9:16 720p(720×1280) 기준으로 계산해 넣는다:
    //    tokens/s = 720×1280×24/1024 = 21600 → $/s = 21.6 × 0.0214 = 0.4622
    //    (15초 ≈ $6.93 · 30초 ≈ $13.87). 480p 로 내리면 실제 원가가 이보다 싸다 —
    //    올려 잡은 방향이라 예산 가드가 보수적으로 돈다(안전).
    //    원가표(lib/costs.js)와 **같은 값이어야 한다**.
    perSecUsd: 0.4622,
  },
];

export const DEFAULT_AD_MODEL = "seedance-2.0-fast";

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
