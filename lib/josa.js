// 한국어 조사 — **받침을 보고 고른다.** 순수 함수다(화면이 import 한다).
//
// ★★ 왜 필요한가: 화면이 `{label}으로` 처럼 조사를 고정하면 라벨이 바뀔 때 깨진다.
//   단계 라벨은 표(lib/reel/steps.js)가 쥐고 있어서 화면은 무엇이 올지 모른다 —
//   "시나리오으로"가 실제로 그렇게 나왔다(2026-08-25 사장님 지적).
//
// ★ 여기에 조사를 더 붙일 때도 같은 규칙이다: 판정은 이 파일 하나가 하고,
//   화면은 결과 문자열만 받는다. 화면마다 받침을 세면 언젠가 한 곳만 틀린다.

// 마지막 글자에 받침이 있는가. 한글이 아니면 **없음**으로 본다 —
// 라벨이 늘 한글이라는 보장이 없고(영문 모델명 등), 모르는 값에 던지지 않는 것이
// 이 저장소 규율이다(lib/ad/scenario.js 의 pickFocus).
export function hasFinalConsonant(word) {
  const s = typeof word === "string" ? word.trim() : "";
  if (!s) return false;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false; // 완성형 한글 밖
  return (code - 0xac00) % 28 !== 0;
}

// 받침이 ㄹ 인가 — "서울로"처럼 ㄹ 뒤에는 "으로"가 아니라 "로"가 붙는다.
function endsWithRieul(word) {
  const s = typeof word === "string" ? word.trim() : "";
  if (!s) return false;
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 === 8; // 종성 인덱스 8 = ㄹ
}

// "…으로" / "…로"
export function euroRo(word) {
  const s = typeof word === "string" ? word : "";
  return `${s}${hasFinalConsonant(s) && !endsWithRieul(s) ? "으로" : "로"}`;
}
