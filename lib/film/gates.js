// 화면의 문 판정 — **한 벌**.
//
// ★★ 왜 화면 파일 밖으로 뺐나: 이 저장소에는 렌더 하네스가 없어서 JSX 안의 판정은
//   소스를 훑는 것으로밖에 못 잰다. 그런데 여기서 재야 하는 것은 "글자가 있는가"가
//   아니라 **막다른 길이 안 생기는가**다 — 만료된 잠금에서 버튼이 실제로 열리는지.
//   순수 함수로 빼면 그것을 값으로 잴 수 있다(tests/film-ui.test.js).
// ★ import 가 없다 — "use client" 화면이 그대로 부른다.
//
// 재료는 상태 라우트(app/api/film/[id]/status/route.js)가 내려주는 한 방식의 상태다:
//   { status, images, video, error, canDraw, triesLeft }
// 문서만 읽은 첫 화면(GET /api/projects/[id])에는 canDraw·triesLeft 가 **없다** — 그때는
// status 로 떨어진다(옛 응답에서도 화면이 죽지 않아야 한다).

export function filmGates(film, busy = false) {
  const f = film || {};
  const status = f.status || "draft";
  const rendering = status === "rendering";

  // ★★ "지금 그릴 수 있는가"는 **서버가 답한다.** 만료(10분, lib/film/doc.js 의
  //   FILM_IMAGE_LOCK_MS)까지 셈해서 내려주므로 화면이 시각 계산을 두 벌로 두지 않는다.
  //   값이 없으면 status 로 떨어진다 — 그 폴백은 예전 동작 그대로다.
  const canDraw = typeof f.canDraw === "boolean" ? f.canDraw : status !== "drawing";
  // 다시 그릴 횟수를 다 쓴 것도 canDraw 를 false 로 만든다(서버가 두 문을 합쳐 답한다).
  // 그래서 **둘을 다시 가른다**: 횟수 소진은 "그리는 중"이 아니다.
  const triesGone = f.triesLeft === 0;

  // ★★ 여기가 막다른 길이 생기던 자리다. 예전에는 status === "drawing" 하나로 잠갔는데,
  //   인스턴스가 죽어 그 값이 문서에 눌러앉으면 서버는 10분 뒤 다시 열어 주는데도
  //   화면은 **무기한** 잠긴 채였다(새로고침으로도 안 풀린다). canDraw 가 그것을 걷어낸다.
  const drawingNow = !canDraw && !triesGone;

  // 그 밖의 버튼(사진·사이즈·굽기) — 그리는 중에는 함께 잠근다. 그리는 도중에 구우면
  // 방금 만들어지고 있는 그림이 아니라 **옛 그림으로** 값을 치른다.
  // ★ 횟수 소진은 여기에 안 들어간다 — 더 못 그리는 것과 못 굽는 것은 다른 일이다.
  //   (섞으면 6회를 다 쓴 프로젝트가 이미 만든 그림으로도 못 굽는 막다른 길이 된다.)
  const locked = !!busy || rendering || drawingNow;

  return { rendering, drawingNow, canDraw, triesGone, locked, drawLocked: locked || !canDraw };
}
