// 진행 상태를 두드리는 루프 한 벌.
//
// 왜 모았나: ②대본·③목소리·④이미지·⑤영상·⑥완성 다섯 화면이 이 루프를 각자 복붙해
// 두었고, 조금씩 다르게 틀려 있었다 — ④이미지가 images_error 를 영영 못 보던 버그가
// 그 어긋남이다(2026-08-14).
//
// **동작은 옮기기만 한다**: 2초 간격 · 5분 상한 · 연속 5회 실패면 중단. 여기서 동작까지
// 바꾸면 회귀가 어디서 났는지 못 가른다.
//
// timer 와 fetch 를 주입받는다 — 그래야 vitest 가 2초를 실제로 기다리지 않고 회차를
// 손으로 밀 수 있다(이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다).
//
// ★ 딱 한 군데 화면과 **일부러** 다르게 했다: 실패 수를 res.json() 뒤에 초기화한다.
//   화면들은 `if (!res.ok) throw; failures = 0; await res.json()` 순서라, 200 인데
//   본문이 JSON 이 아닌 경우(프록시가 끼운 HTML 오류 페이지, 반쯤 깨진 dev 서버 —
//   lib/projects-client.js 가 실제로 겪고 남긴 그 사고다) 매 회차 카운터가 0 으로
//   돌아가 **영원히 폴링한다**. 사용자에게는 아무것도 안 뜬 채로. 그것이 바로 이 계획이
//   없애려는 "무슨 일이 나는지 알 수 없음"이라서, 여기서는 실패로 세고 5회에 멈춘다.
//   tests/poll.test.js 의 "200 인데 본문이 JSON 이 아니면 실패로 센다" 가 이 결정을 박아 둔다.

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const POLL_MAX_FAILURES = 5;

export function startPolling({
  url,
  fetchImpl = fetch,
  onTick,
  onStop = () => {},
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
  maxFailures = POLL_MAX_FAILURES,
  setTimer = setInterval,
  clearTimer = clearInterval,
  now = Date.now,
}) {
  let handle = null;
  let failures = 0;
  const startedAt = now();

  // ★ handle 을 null 로 비운다. 비우지 않으면 (dev StrictMode 의 재마운트처럼) 다시
  //   마운트됐을 때 "이미 돌고 있음"으로 오인해 폴링이 되살아나지 않는다.
  const halt = () => {
    clearTimer(handle);
    handle = null;
  };

  const finish = (timedOut) => {
    if (handle === null) return; // 이미 멈췄다 — onStop 을 두 번 부르지 않는다
    halt();
    onStop({ timedOut });
  };

  handle = setTimer(async () => {
    if (now() - startedAt > timeoutMs) return finish(true);
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error("상태를 읽지 못했어요");
      const data = await res.json();
      failures = 0;
      if (onTick(data)) finish(false);
    } catch {
      failures += 1;
      if (failures >= maxFailures) finish(true);
    }
  }, intervalMs);

  // 호출부(언마운트·사용자 중단)가 부른다. onStop 은 안 불린다 — 끝난 것이 아니라 뗀 것이다.
  return halt;
}
