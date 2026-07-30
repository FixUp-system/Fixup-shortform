// 클립 길이 눈금 — 화면(클라이언트)과 i2v(서버)가 함께 본다.
//
// lib/i2v.js 에 두면 안 된다. 그 모듈은 costs.js 를 거쳐 fs 를 끌고 오는데,
// "use client" 화면이 import 하면 번들에 fs 가 들어가 빌드가 깨진다.
// (lib/voices.js 가 같은 이유로 분리돼 있다.)
//
// 클립 모델마다 받는 길이가 다르다. PRICE_TABLE 과 같은 방식으로 prefix 로 고른다.
//
// 왜 표로 옮겼는가: 모델은 FAL_I2V_ENDPOINT(env)로 바뀌는데 눈금은 코드에 박혀 있었다.
// env 를 바꾸는 순간 코드가 모르는 눈금으로 요청이 갔다. 주석으로 경고해 두었지만
// 적어 둔 것은 판정이 아니다.
//
// 눈금은 두 종류다:
//   steps 열거 — LTX 계열. 임의의 초를 보내면 422 로 거절한다:
//     Input should be 6, 8, 10, 12, 14, 16, 18 or 20
//   min~max 범위 — Kling v3. 정수 초를 그 사이에서 자유롭게 받는다.
//     낭독을 그대로 살 수 있어 올림 손실이 사라진다(07-30 실측: 32초 낭독에 40초를 샀다)
//
// ⚠️ prefix 순서가 곧 로직이다 — 더 구체적인 것이 위에 온다. PRICE_TABLE 과 같은 함정이다.
export const CLIP_PROFILES = [
  {
    prefix: "fal-ai/kling-video/v3",
    steps: null, min: 3, max: 15,
    // 오디오를 끄는 것이 코드 보장이어야 단가가 $0.084 다(켜면 $0.126). 무엇보다 클립에
    // 소리가 실리면 우리 낭독과 두 겹이 되고, 낭독이 컷 길이를 정하는 뼈대와 어긋난다.
    extra: { generate_audio: false },
  },
  { prefix: "fal-ai/ltx-2", steps: [6, 8, 10, 12, 14, 16, 18, 20], extra: null },
];

// 모르는 모델이 떨어질 자리. LTX 를 고르는 이유는 대칭이 아니기 때문이다 —
// 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고 값만 조금 더 나가지만,
// 열거 모델에 7초를 보내면 422 로 죽는다. 모르면 "비싸지만 도는" 쪽을 준다.
export const DEFAULT_CLIP_PROFILE = CLIP_PROFILES[CLIP_PROFILES.length - 1];

export function profileFor(endpoint) {
  const id = String(endpoint || "");
  return CLIP_PROFILES.find((p) => id.startsWith(p.prefix)) || DEFAULT_CLIP_PROFILE;
}

// 지금 도는 모델의 프로필.
//
// ⚠️ 브라우저 번들에서는 이 env 가 undefined 다(NEXT_PUBLIC_ 이 아니라 Next 가 넣지 않는다)
//    → 화면에서는 기본 프로필로 떨어진다. 그것을 받아들인 이유는 계획 문서에 적어 두었다:
//    상한 경고의 숫자만 20 으로 남고, 잘림 판정 자체는 서버가 정확하게 한다.
export function activeClipProfile() {
  return profileFor(process.env.FAL_I2V_ENDPOINT);
}

export function minSecondsFor(profile) {
  return profile.steps ? profile.steps[0] : profile.min;
}

export function maxSecondsFor(profile) {
  return profile.steps ? profile.steps[profile.steps.length - 1] : profile.max;
}

// 낭독 길이를 모델이 받는 길이로 **올린다**. 상한을 넘으면 상한에 묶는다.
// 내리지 않는 이유: 내리면 소리가 그림보다 길어져 뒤가 잘린다.
//
// 올린 만큼 클립이 낭독보다 길어지는데, 그 차이는 **합성이 잘라낸다**
// (trim=duration=낭독, lib/compose.js). 그래서 자막·완성본 길이는 낭독으로 잰다.
export function fitDurationFor(profile, seconds) {
  const want = Number(seconds) || 1;
  if (profile.steps) return profile.steps.find((s) => s >= want) ?? maxSecondsFor(profile);
  const ceil = Math.ceil(want);
  if (ceil < profile.min) return profile.min;
  if (ceil > profile.max) return profile.max;
  return ceil;
}

// 화면(script·video 페이지)이 쓰는 이름들 — 기본 프로필에 묶어 둔다.
// 활성 프로필로 바꾸면 안 된다: 브라우저에는 env 가 없어 서버와 값이 갈리고,
// 갈린 값으로 경고를 띄우면 사장님이 보는 숫자가 요청과 달라진다.
export const I2V_STEPS = DEFAULT_CLIP_PROFILE.steps;
export const I2V_MAX_SECONDS = maxSecondsFor(DEFAULT_CLIP_PROFILE);
export function fitDuration(seconds) {
  return fitDurationFor(DEFAULT_CLIP_PROFILE, seconds);
}
