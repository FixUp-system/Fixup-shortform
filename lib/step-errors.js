// 단계마다 "봐야 할 오류 필드"의 유일한 표.
//
// 왜 표로 두는가 — 상태 라우트 다섯이 각자 다른 조합을 손으로 싣고 있었고, ④이미지 화면이
// images_error 를 영영 못 보던 버그가 정확히 그 어긋남이었다(2026-08-14). 스토어·라우트·
// 화면이 같은 표를 보면 그 자리가 다시 생기지 않는다.
//
// import 0 개의 순수 데이터다 — 화면이 읽어도 번들에 서버 것이 안 섞인다
// (lib/pricing.js·lib/steps.js 와 같은 규칙).

// 문서에 남을 수 있는 오류 필드 전부. 스토어의 부분 읽기가 무엇을 실어야 하는지의 기준이다.
export const ALL_ERROR_FIELDS = [
  "cuts_error",
  "voice_error",
  "images_error",
  "video_error",
  "render_error",
];

// 단계 → 그 화면이 봐야 할 오류 필드. **앞에 적힌 것이 더 가까운 원인**이다.
//
// ②대본·③목소리가 cuts_error 를 함께 보는 이유: 컷 분할은 대본 승인이 부르고 그 실패는
// 두 화면 어디에서나 사장님을 막는다. ⑤영상은 컷이 이미 있는 것이 전제라 안 본다.
export const STEP_ERROR_FIELDS = {
  script: ["cuts_error"],
  voice: ["voice_error", "cuts_error"],
  images: ["images_error", "cuts_error"],
  video: ["video_error"],
  done: ["render_error"],
};

// 이 단계에서 지금 살아 있는 첫 오류. 없으면 null.
// status 는 상태 라우트가 돌려준 것(혹은 프로젝트 문서) — 둘 다 같은 필드 이름을 쓴다.
export function firstError(status, stepKey) {
  for (const field of STEP_ERROR_FIELDS[stepKey] || []) {
    const message = status?.[field];
    if (message) return { field, message };
  }
  return null;
}
