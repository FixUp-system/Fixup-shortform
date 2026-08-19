import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { runFilmImages } from "../../../../../lib/film/pipeline.js";
import { updateProject } from "../../../../../lib/projects.js";
import { filmOf, putFilm, MAX_FILM_IMAGE_TRIES, FILM_IMAGE_LOCK_MS } from "../../../../../lib/film/doc.js";

// 그림 만들기 — 방식이 정한 계획대로 몇 장을 만든다(장면 순서는 장면 수만큼, 참고 그림은 셋).
//
// ★ 기다린다(fire-and-forget 이 아니다). 이미지 몇 장이라 서버리스 상한 안에서 끝나고,
//   기다리면 실패가 **HTTP 로** 보인다 — 상태 라우트를 한 겹 더 두지 않아도 된다.
//   (굽기만 큐를 탄다 — 거기는 출력 1초당 ≈33.5초라 기다릴 수 없다.)
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { mode } = (await req.json().catch(() => ({}))) || {};
  // ★ 입구에서 막는다. 모르는 방식이 안으로 들어가면 어느 칸에 쓸지가 흔들린다 —
  //   그때는 이미 그림값이 나간 뒤다.
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });

  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });

  const film = filmOf(project, mode);
  // ★★ 이 자리에는 **청구가 없다**(정가는 굽기에 붙는다). 그런데 그림 한 장에 ≈$0.08 이
  //   실제로 나가고, 잔액 0 인 사람도 lib/costs.js 의 그물(balance < 0)에는 안 걸린다 —
  //   청구가 0 이라 잔액이 줄지 않기 때문이다. 그래서 문을 둘 단다: **재진입 잠금**과 **상한**.
  // ★ 잠금에 시각을 함께 본다 — 서버리스 인스턴스가 도중에 죽으면 "그리는 중"이 문서에
  //   그대로 남는데, 시각을 안 보면 그 프로젝트는 영영 다시 못 그린다.
  if (film.status === "drawing" && Date.now() - Number(film.drawingAt || 0) < FILM_IMAGE_LOCK_MS) {
    return Response.json({ error: "이미 그리는 중이에요" }, { status: 409 });
  }
  const tries = Number(film.imageTries) || 0;
  if (tries >= MAX_FILM_IMAGE_TRIES) {
    return Response.json({ error: "그림을 너무 많이 다시 그렸어요" }, { status: 400 });
  }

  // 잠금은 **부르기 전에** 건다 — 부른 뒤에 걸면 그 사이에 들어온 둘째 요청이 통과한다.
  // 회차도 여기서 올린다(실패해도 회차는 먹는다 — 실패한 시도에도 그림값은 나갔을 수 있다).
  await updateProject(id, user.id, (p) =>
    putFilm(p, mode, { status: "drawing", drawingAt: Date.now(), imageTries: tries + 1, error: null })
  );

  try {
    await runFilmImages(id, user.id, mode);
  } catch (e) {
    // ★ 문서에 실패를 적는 자리는 **파이프라인 하나다**(lib/film/pipeline.js 의 failFilm 이
    //   status:"error" 와 문구를 남긴다). 여기서 또 적으면 마지막 쓰기가 이겨 두 자리가
    //   조용히 갈린다 — 화면은 그 status 를 읽는다. 응답으로만 알린다.
    return Response.json({ error: e?.message || "그림을 만들지 못했어요" }, { status: 400 });
  }
  return Response.json({ ok: true });
});
