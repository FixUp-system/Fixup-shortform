// 생성 진척 — "이 컷은 이 단계에서 끝났는가"를 판정하는 **순수** 모듈.
//
// 서버(lib/pipeline.js 의 심장박동)와 화면이 **같은 자를 써야 한다.** 같은 조회식을 화면에
// 한 번 더 손으로 적으면 그 사본이 조용히 어긋나고, 어긋난 쪽만 "안 끝났다"로 세어
// 멀쩡히 끝난 생성이 멈춘 것처럼 보인다. 그래서 한 벌만 둔다.
//
// ★ 여기는 화면이 import 한다 — fs·next/server·env 를 절대 끌어오지 말 것.
//   순수 함수만 있어야 클라이언트 번들에 들어가도 안전하다.

// 단계별 "끝남" 판정.
//
// ★ 세 단계 모두 **성공과 종착 실패를 함께** 센다. 끝난 것은 끝난 것으로 세어야
//   진척이 total 까지 차오른다. 실패를 안 세면 실패한 컷 하나 때문에 문서가
//   done: N-1 에 영원히 멈춰, 정상 종료한 생성이 계속 "멈춤"으로 읽힌다
//   (그리고 스스로 낫지 않는다 — 그 컷은 다시 저장되지 않기 때문이다).
//   images 의 종착 실패는 오류 필드가 아니라 state 다(processCut 의 catch 는
//   image 없이 state: "needs_attention" 만 남긴다).
const PHASE_DONE = {
  images: (c) => !!(c.image || c.source === "photo" || c.state === "needs_attention"),
  voice: (c) => !!(c.audio || c.voice_error),
  video: (c) => !!(c.video || c.video_error),
};

// 모르는 단계는 던지지 않고 false 다 — 판정 못 하는 것이지 "안 끝난 것"은 아니지만,
// 세는 쪽에서 0 으로 떨어져 "판정 불가"로 읽히는 편이 안전하다.
export function isCutDone(cut, phase) {
  const isDone = PHASE_DONE[phase];
  return isDone ? !!isDone(cut || {}) : false;
}
