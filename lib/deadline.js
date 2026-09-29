// **우리 시계** — 플랫폼이 함수를 끊기 전에 우리가 먼저 끝낸다 (2026-09-29).
//
// ★★★ 왜 필요한가. 서버리스 함수는 상한(300초)에 닿으면 **통째로 종료된다.** 그 순간
//   우리 `catch` 도 함께 사라져서 **오류를 적는 코드조차 안 돈다** — 문서에는 "그리는 중"만
//   남고 화면은 영원히 로딩이다(2026-09-29 실측: 판 수정이 10분 넘게 멈춰 있었다).
//   `CLAUDE.md` 가 "조용한 죽음"이라고 부르는 그것이다.
// ★ 이 장치는 **막지 못하는 것을 보이게 만든다.** 호출 자체는 못 멈춘다(fal 은 계속 만든다) —
//   다만 우리가 먼저 끝내고 무슨 일이 있었는지 적을 수 있다.
// ★ 이 파일은 **import 문을 두지 않는다** — 순수하게 둔다(화면이 읽어도 안전하다).

// 시간 초과를 **다른 실패와 구분**하려고 따로 둔다 — 부르는 쪽이 사유를 가려 적을 수 있다.
export class DeadlineExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = "DeadlineExceeded";
  }
}

// ms 안에 안 끝나면 `DeadlineExceeded` 로 던진다.
//
// ★ 안에서 던진 오류는 **그대로 지나간다** — 우리 문구로 덮으면 진짜 사유(422 같은 것)가
//   사라진다(lib/failure.js 가 그 원문을 읽어 사장님 말로 옮긴다).
// ★ 끝나면 시계를 **반드시 치운다** — 안 치우면 함수가 그 시간만큼 안 잠들어 값이 샌다.
export function withDeadline(promise, ms, message) {
  let timer = null;
  const alarm = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(message)), ms);
  });
  return Promise.race([promise, alarm]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
