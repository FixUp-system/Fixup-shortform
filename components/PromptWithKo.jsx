"use client";

// **모델이 읽는 영어 지문 + 사장님이 읽는 한국어** 한 덩어리 (2026-09-03 사장님 지시).
//
// ★★ 왜 컴포넌트로 뺐나 — 이 모양이 필요한 자리가 셋이다(②시나리오 · ④프롬프트 ·
//   ③이미지 지문). 화면마다 마크업을 따로 두면 한쪽만 고쳐지는 날이 온다(ProjectCards 가
//   홈·보관함에 하나로 선 이유와 같다).
//
// ★★★ 2026-09-14 — **한국어만 보인다**(사장님 지시: 사용자에게 불필요한 정보 제거).
//   그전에는 영어 원문을 먼저, 번역을 곁들여 보였다. 손님은 한국어만 읽고 고치는 칸도
//   한국어라, 영어 원문은 읽을 수도 쓸 수도 없는 글이었다. 원문은 문서에 그대로 남는다 —
//   모델에게 나가는 것은 여전히 원문이다.
// ★ 번역이 없는 옛 문서는 **원문으로 떨어진다** — 빈 자리를 두면 "시나리오가 사라졌나"로 읽힌다.
export default function PromptWithKo({ text, ko, className = "script-src" }) {
  const body = typeof text === "string" ? text : "";
  const trans = typeof ko === "string" ? ko.trim() : "";
  if (!body && !trans) return null;
  return <p className={className}>{trans || body}</p>;
}
