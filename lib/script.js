// 길이·목표 상수 — 이름이 "script" 인 것은 내력일 뿐이다(2026-08-16).
//
// 원고(대본) 생성은 걷어냈다. 컷의 원본은 이제 시나리오이고(lib/scenario.js),
// 원고를 쓰고·되돌리고·판정하던 것들(buildScript*·scriptFaults·scriptScore·targetChars·
// SPEECH_DENSITY…)은 옮겨 갈 곳 없이 사라졌다 — 시나리오가 장면마다 대사와 초를 직접 정하고,
// 그 규칙은 lib/scenario-rules.js 가 판정한다.
//
// ★ 그런데 이 파일을 지우면 안 된다. 원고와 무관한 것 셋이 여기 살고 있고, 셋 다 지금도
//   쓰인다. 파일 이름만 보고 통째로 지우면 길이 선택과 낭독 시간 추정이 함께 사라진다.
//   옮기지 않고 여기 둔 이유는 이 저장소의 규칙 그대로다 — 값은 한 자리에만 둔다.
//   화면("use client")도 이 파일을 읽으므로 **import 없는 순수 데이터·순수 함수**여야 한다.

// 사장님이 고를 수 있는 길이. 숏폼의 실제 폭에 맞춘 네 칸이다.
// 정가가 이 값에서 나온다(lib/pricing.js) — 목록 밖 값은 라우트가 거절한다.
export const TARGET_CHOICES = [15, 30, 45, 60];

// 낭독 시간 근사 — 한국어 나레이션은 쉼 포함 대략 초당 5.5자.
// 컷의 spoken_seconds 를 이 자로 재고(lib/validate.js), TTS 실측이 오면 그 값이 덮는다.
export function secondsForText(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.min(15, Math.max(2, Math.round(chars / CHARS_PER_SEC)));
}

export const CHARS_PER_SEC = 5.5;
