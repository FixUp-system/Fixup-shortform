// 롱폼 — **길이를 구간으로 나누는 산수**. (2026-09-29, 시험용)
//
// ★★★ 롱폼은 짧은 영상 한 편을 길게 만드는 것이 아니라, **15초짜리 여러 편을 이어 붙이는
//   것**이다. 15 는 취향이 아니라 모델이 정한 값이다 — Seedance 2.0 이 `min 4, max 15`
//   라(lib/clip-limits.js) 한 호출로 그보다 긴 영상을 못 만든다. 그래서 10분은
//   **구간 40개**가 하한이다.
//
// ★★ 이 파일은 **순수**하다 — import 가 한 줄도 없다. 화면("use client")이 읽기 때문이다.
//   이 저장소는 화면이 서버 전용 모듈을 끌고 와 빌드가 깨진 사고를 세 번 겪었고,
//   그래서 `pricing.js`·`clip-limits.js`·`aspects.js` 가 같은 이유로 따로 산다.
//
// ⚠️ **여기 있는 것은 산수뿐이다.** 구간을 실제로 어디서 끊을지는 다른 문제이고 아직
//   설계 전이다 — 사장님과 정한 방향은 "**경계를 장면 전환에 맞춘다**"(15초로 기계적으로
//   자르면 한 장면 한가운데가 잘려, 무엇을 씌워도 이음새가 티가 난다). 그 규칙이 생기면
//   구간 수는 이 산수가 아니라 시나리오가 정하게 되고, 이 함수는 **예상치**로 남는다.
//
// ⚠️ **원가는 여기 안 적는다.** 초당 단가는 lib/costs.js 가 쥐는데 그 모듈은 store·actor 를
//   끌어와 화면이 못 읽는다. 여기에 숫자를 베껴 두면 두 벌이 되어 갈린다("값이 사는 곳"
//   표의 규율). 화면은 **구간 수**만 보여 주고, 값은 굽기를 배선할 때 서버에서 계산한다.

// 구간 하나의 길이(초). 모델 상한에서 온다.
export const SEGMENT_SECONDS = 15;

// 고를 수 있는 총 길이(초) — 1·3·5·10분. 전부 15로 나누어떨어진다(마지막 구간이 토막나지
// 않게). 닫힌 목록인 이유는 이 저장소의 관용구다 — 화면에서만 거르면 가림막이지 잠금이 아니다.
export const LONGFORM_LENGTHS = Object.freeze([60, 180, 300, 600]);

// 그 길이면 구간이 몇 개인가. 값이 아니면 0 — 화면이 "0구간"을 보고 멈춘다.
// ★ 올림이다. 내리면 만들어진 영상이 사장님이 고른 길이보다 짧아진다.
export function segmentCountFor(totalSeconds) {
  const n = Number(totalSeconds);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / SEGMENT_SECONDS);
}

export function isLongformLength(seconds) {
  return LONGFORM_LENGTHS.includes(seconds);
}

// 사람이 읽는 이름. 목록이 전부 분 단위라 분으로만 적는다.
export function lengthLabel(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n / 60}분`;
}
