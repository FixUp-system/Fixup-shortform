import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { FILM_MODES } from "../../../../../lib/film/mode.js";
import { filmOf, canDrawFilm, drawTriesLeft } from "../../../../../lib/film/doc.js";
import { collectFilmRender } from "../../../../../lib/film/pipeline.js";

// 화면이 두드리는 상태 라우트 — **두 방식을 한 번에** 준다.
//
// ★★ GET 인데 일을 한다(광고의 app/api/ads/[id]/status 와 같은 이유). 배포(Vercel 서버리스)에는
//   **응답 뒤에 남아서 도는 자리가 없다.** 한 편이 몇 분이라 어떤 요청 안에서도 못 끝난다 —
//   그래서 굽기를 접수(POST …/render)와 수거(여기)로 나눴고, 두드릴 때마다 fal 에 한 번 묻는다.
//
// ★ 두 방식을 다 수거한다. 이 경로는 한 프로젝트에서 두 편을 굽는 것이 정상 흐름이라,
//   한쪽만 수거하면 화면을 보고 있지 않은 쪽이 영원히 "만드는 중"으로 남는다.
//   굽는 중이 아닌 방식은 collectFilmRender 가 fal 에 묻지도 않고 그대로 돌아간다.
// ★ collectFilmRender 는 던지지 않는다 — 수거가 실패해도 화면은 상태를 읽어야 한다.
//   실패는 films[mode].error 로 남고, 아래에서 그대로 실어 보낸다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;

  // 상태를 읽기 **전에** 수거한다 — 순서가 바뀌면 방금 끝난 영상을 한 박자 늦게 본다.
  for (const m of FILM_MODES) {
    await collectFilmRender(id, user.id, m.id).catch((e) => {
      console.error("film 수거 실패:", e);
    });
  }

  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });

  // 문서 통짜를 안 실어 보낸다 — 화면이 쓰는 것만 준다(광고 상태 라우트와 같은 규율).
  const at = Date.now();
  const films = {};
  for (const m of FILM_MODES) {
    const film = filmOf(project, m.id);
    films[m.id] = {
      status: film.status || "draft",
      images: film.images || [],
      video: film.video || null,
      error: film.error || null,
      // ★★ "지금 그릴 수 있는가"를 **서버가 계산해서** 내려준다.
      //   화면은 status 만 보고 잠그는데, 인스턴스가 죽어 "drawing" 이 남으면 서버는 10분 뒤
      //   열어 주고 화면은 잠긴 채다 — 사장님에게는 다시 그릴 길이 아예 없어 보인다.
      //   만료 계산을 화면에 두면 판정이 두 벌이 되어 언제나 한쪽이 먼저 낡으므로,
      //   그림 라우트가 실제로 보는 판정(lib/film/doc.js)을 그대로 실어 보낸다.
      canDraw: canDrawFilm(film, at),
      triesLeft: drawTriesLeft(film),
    };
  }
  return Response.json({ status: project.status || null, films });
});
