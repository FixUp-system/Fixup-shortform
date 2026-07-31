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

// 지금 쓰는 클립 모델. env 가 없으면 이것으로 돈다.
//
// ⚠️ **이 값과 lib/i2v.js 의 요청 엔드포인트는 반드시 같아야 한다.** 둘이 갈리면
//    프로필과 실제 모델이 어긋난다 — Kling 을 부르면서 LTX 프로필을 쓰면
//    `generate_audio:false` 가 빠져 오디오가 켜진 채 청구되고($0.084→$0.126)
//    클립 소리가 우리 낭독과 두 겹이 된다. 그래서 문자열을 여기 하나만 둔다.
export const DEFAULT_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";

// 모르는 모델이 떨어질 자리. LTX 를 고르는 이유는 대칭이 아니기 때문이다 —
// 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고 값만 조금 더 나가지만,
// 열거 모델에 7초를 보내면 422 로 죽는다. 그렇다고 도는 것을 보장하진 않는다 —
// 실제 눈금이 5/10(구형 Kling)이거나 "8s" 같은 문자열 길이(Veo)를 원하는 모델이면
// 이 기본값도 그대로 422 를 받는다. 그래서 아래에서 매치 실패를 눈에 띄게 경고한다.
export const DEFAULT_CLIP_PROFILE = CLIP_PROFILES[CLIP_PROFILES.length - 1];

export function profileFor(endpoint) {
  const id = String(endpoint || "");
  const found = CLIP_PROFILES.find((p) => id.startsWith(p.prefix));
  if (!found) {
    console.warn(`[clip-limits] 알 수 없는 모델 "${id}" — 기본 눈금(LTX)으로 요청한다. 422 가능성 있음.`);
  }
  return found || DEFAULT_CLIP_PROFILE;
}

// 지금 도는 모델의 프로필.
//
// ⚠️ 브라우저 번들에서는 이 env 가 undefined 다(NEXT_PUBLIC_ 이 아니라 Next 가 넣지 않는다)
//    → 화면에서는 기본 프로필로 떨어진다. 그것을 받아들인 이유는 계획 문서에 적어 두었다:
//    상한 경고의 숫자만 20 으로 남고, 잘림 판정 자체는 서버가 정확하게 한다.
export function activeClipProfile() {
  return profileFor(activeI2vEndpoint());
}

// 실제로 부를 엔드포인트. i2v 도 이 함수를 쓴다 — 기본값이 두 군데 있으면 갈린다.
export function activeI2vEndpoint() {
  return process.env.FAL_I2V_ENDPOINT || DEFAULT_I2V_ENDPOINT;
}

// 화면에 실어 보낼 값. 브라우저에는 FAL_I2V_ENDPOINT 가 없으므로 이 함수는 **서버에서만**
// 부른다(GET /api/projects/[id]). 화면은 응답에 실려 온 값을 읽는다.
//
// 왜 env 를 NEXT_PUBLIC_ 으로 한 벌 더 두지 않는가: 두 벌이면 한 군데를 빠뜨리는 날이 오고,
// 그때 화면과 서버가 다른 상한을 말한다. 값이 하나면 어긋날 자리가 없다.
export function activeClipLimits() {
  const profile = activeClipProfile();
  return { min: minSecondsFor(profile), max: maxSecondsFor(profile) };
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

// 화면(script·video 페이지)이 쓰는 이름들.
//
// **활성 프로필로는 만들 수 없다** — 브라우저에는 env 가 없어 서버와 값이 갈리고, 갈린 값으로
// 경고를 띄우면 사장님이 보는 숫자가 요청과 달라진다. 그래서 상수여야 한다.
//
// 다만 그 상수를 **기본 엔드포인트의 프로필**에서 뽑는다(2026-07-30). 예전에는
// DEFAULT_CLIP_PROFILE(=모르는 모델의 폴백, LTX)에 묶여 있었는데, 기본 모델이 Kling 이 된 뒤로는
// 그 값이 아무 모델도 가리키지 않는 숫자가 된다 — 화면이 상한 20 을 말하고 서버는 15 로 자른다.
// 화면은 서버가 실어 보낸 `clip_limits` 를 먼저 쓰고, 이 값은 그것이 오기 전의 폴백이다.
const DEFAULT_ENDPOINT_PROFILE = profileFor(DEFAULT_I2V_ENDPOINT);

// ⚠️ 범위 모델(Kling)이면 **null** 이다 — 눈금이 없다는 뜻이다. `I2V_STEPS[0]` 처럼 쓰면 죽는다.
export const I2V_STEPS = DEFAULT_ENDPOINT_PROFILE.steps;
export const I2V_MAX_SECONDS = maxSecondsFor(DEFAULT_ENDPOINT_PROFILE);
export function fitDuration(seconds) {
  return fitDurationFor(DEFAULT_ENDPOINT_PROFILE, seconds);
}
