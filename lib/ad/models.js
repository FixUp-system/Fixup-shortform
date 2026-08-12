// 광고 경로의 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
//
// ⚠️ 이 파일은 화면("use client")도 import 한다. **import 문을 두지 마라** —
//    순수 데이터·순수 함수만 있어야 번들에 fs 가 안 섞인다.
//    (lib/pricing.js·lib/styles.js·lib/aspects.js 와 같은 규율이다.)
//
// 모델 id 가 `bytedance/…` 라 `fal-ai/` 로 시작하지 않는다. 그래서 lib/costs.js 의
// 가짜 판정과 원가표가 이 접두사를 따로 알아야 한다(Task 3).

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
    minSeconds: 4,
    maxSeconds: 15,
    // 720p fast. 원가표(lib/costs.js)와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
    perSecUsd: 0.2419,
  },
];

export const DEFAULT_AD_MODEL = "seedance-2.0-fast";

// v1 이 받는 길이. 배열로 두는 이유는 30·45·60 을 여기에 더하면 끝나게 하려고다.
export const AD_SECONDS = [15];

export function isAdSeconds(n) {
  return AD_SECONDS.includes(n);
}

// 모르는 id 는 기본 모델이다 — 옛 문서가 값을 안 들었을 때 죽지 않게.
// (문서에는 만들 때 명시 저장하므로 정상 흐름에서는 여기 안 온다.)
export function adModel(id) {
  return AD_MODELS.find((m) => m.id === id) || AD_MODELS.find((m) => m.id === DEFAULT_AD_MODEL);
}

// 모르는 갈래는 **던진다.** 오타로 조용히 다른 모델을 부르면 값이 나가고 결과가 다르다 —
// lib/pricing.js 의 regenPrice 가 모르는 종류에 던지는 것과 같은 원칙이다.
export function adEndpoint(modelId, kind) {
  const e = adModel(modelId).endpoints[kind];
  if (!e) throw new Error(`모르는 영상 갈래: ${kind}`);
  return e;
}
