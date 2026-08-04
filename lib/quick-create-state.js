// 빠른 생성 대화에서 "요약 카드(confirm)" 가 어떻게 켜지고 꺼지는지를 화면과 떼어 둔다.
// 돈이 나가는 버튼이라 렌더 조건 하나에 맡기지 않고, 상태 전이 자체를 테스트로 문다.

/** 지금 살아 있는 요약 카드의 인덱스. 없으면 -1. */
export function lastConfirmIndex(messages) {
  return (messages || []).reduce((acc, m, i) => (m?.confirm ? i : acc), -1);
}

/**
 * 확정 순간 요약 카드를 **전부** 내린다.
 * 누른 카드 하나만 내리면 옛 카드가 다시 "마지막 confirm" 이 되어 버튼이 부활한다
 * — 그 카드의 params 는 사용자가 이미 고쳐 달라고 한 값이라 오발이 곧 유료 실행이다.
 */
export function clearConfirms(messages) {
  return (messages || []).map((m) => (m?.confirm ? { ...m, confirm: false } : m));
}

/**
 * 시작조차 못 했을 때(프로젝트 생성·auto 시작 실패) 그 카드만 되살린다.
 * 이미 시작된 뒤의 실패(폴링 중단·시간 초과)에는 쓰지 않는다 — 파이프라인이 실제로
 * 돌고 있는데 버튼을 살리면 같은 영상을 두 번 만들어 두 번 결제된다.
 */
export function restoreConfirm(messages, idx) {
  return (messages || []).map((m, i) => (i === idx ? { ...m, confirm: true } : m));
}
