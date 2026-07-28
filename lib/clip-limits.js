// 클립 길이 눈금 — 화면(클라이언트)과 i2v(서버)가 함께 본다.
//
// lib/i2v.js 에 두면 안 된다. 그 모듈은 costs.js 를 거쳐 fs 를 끌고 오는데,
// "use client" 화면이 import 하면 번들에 fs 가 들어가 빌드가 깨진다.
// (lib/voices.js 가 같은 이유로 분리돼 있다.)
//
// i2v 모델이 받는 길이는 임의의 초가 아니라 정해진 눈금이다. 관통에서 낭독 실측(9초·5초)을
// 그대로 보냈다가 네 컷 전부 422 로 거절당했다:
//   Input should be 6, 8, 10, 12, 14, 16, 18 or 20
//
// ⚠️ 이 눈금은 LTX 계열의 것이다. FAL_I2V_ENDPOINT 로 모델을 바꾸면 함께 확인해야 한다.
export const I2V_STEPS = [6, 8, 10, 12, 14, 16, 18, 20];
export const I2V_MAX_SECONDS = I2V_STEPS[I2V_STEPS.length - 1];

// 낭독 길이를 모델이 받는 눈금으로 **올린다**. 상한을 넘으면 상한에 묶는다.
// 내리지 않는 이유: 내리면 소리가 그림보다 길어져 뒤가 잘린다.
// 올리면 합성이 마지막 프레임을 늘려 메운다(lib/compose.js 의 tpad).
export function fitDuration(seconds) {
  const want = Number(seconds) || 1;
  return I2V_STEPS.find((s) => s >= want) ?? I2V_MAX_SECONDS;
}
