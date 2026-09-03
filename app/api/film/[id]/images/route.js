import { withUser } from "../../../../../lib/auth/require-user.js";
import { imagePlanFor, isFilmMode } from "../../../../../lib/film/mode.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { runFilmImages } from "../../../../../lib/film/pipeline.js";
import { updateProject } from "../../../../../lib/projects.js";
import { filmOf, putFilm, MAX_FILM_IMAGE_TRIES, isDrawLocked } from "../../../../../lib/film/doc.js";

// ★ 2026-09-03 — **배포 기본 상한에 잘리던 자리다.** 같은 동기 이미지 경로다
//   상한이 없으면 함수가 조용히 끊기고, 그때 fal 은 계속 만들어 과금하는데 우리 문서에는
//   아무것도 안 남는다(사장님이 겪은 "계속 로딩 중"의 뿌리 중 하나다).
export const maxDuration = 300;

// 그림 만들기 — 방식이 정한 계획대로 몇 장을 만든다(장면 순서는 장면 수만큼, 참고 그림은 셋).
//
// ★ 기다린다(fire-and-forget 이 아니다). 이미지 몇 장이라 서버리스 상한 안에서 끝나고,
//   기다리면 실패가 **HTTP 로** 보인다 — 상태 라우트를 한 겹 더 두지 않아도 된다.
//   (굽기만 큐를 탄다 — 거기는 출력 1초당 ≈33.5초라 기다릴 수 없다.)
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { mode, only } = (await req.json().catch(() => ({}))) || {};
  // ★ 입구에서 막는다. 모르는 방식이 안으로 들어가면 어느 칸에 쓸지가 흔들린다 —
  //   그때는 이미 그림값이 나간 뒤다.
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });

  // ★★ only 는 **그 방식의 계획에 있는 키**여야 한다(2026-08-20). 모르는 키를 받으면
  //   그 축은 아무것도 안 그려지는데 회차는 먹고, 사장님은 "눌렀는데 안 바뀐다"만 본다.
  //   ⚠️ 배열이 아닌 값을 조용히 무시하면 **전부 다시 그린다** — 값이 네 배다.
  if (only !== undefined && !Array.isArray(only)) {
    return Response.json({ error: "다시 그릴 그림을 골라 주세요" }, { status: 400 });
  }

  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });

  // 키 검증은 프로젝트를 읽은 **뒤**다 — 계획은 이 프로젝트의 시나리오가 정한다.
  // ★ 판정은 새로 만들지 않는다 — 파이프라인이 실제로 도는 계획과 **같은 함수**다.
  if (Array.isArray(only) && only.length) {
    const keys = new Set(
      imagePlanFor(mode, project.scenario, {
        narrationLang: project.settings?.narration_lang,
      }).map((x) => x.key)
    );
    // 앵커는 계획에 없지만 실제 그림에는 있다 — 장면 순서 방식의 첫 장이다.
    keys.add("anchor");
    if (only.some((k) => !keys.has(k))) {
      return Response.json({ error: "모르는 그림이에요" }, { status: 400 });
    }
  }

  const film = filmOf(project, mode);
  // ★★ 이 자리에는 **청구가 없다**(정가는 굽기에 붙는다). 그런데 그림 한 장에 ≈$0.08 이
  //   실제로 나가고, 잔액 0 인 사람도 lib/costs.js 의 그물(balance < 0)에는 안 걸린다 —
  //   청구가 0 이라 잔액이 줄지 않기 때문이다. 그래서 문을 둘 단다: **재진입 잠금**과 **상한**.
  // ★ 잠금에 시각을 함께 본다 — 서버리스 인스턴스가 도중에 죽으면 "그리는 중"이 문서에
  //   그대로 남는데, 시각을 안 보면 그 프로젝트는 영영 다시 못 그린다.
  // ★ 잠금 판정은 lib/film/doc.js 의 isDrawLocked 하나다 — 상태 라우트가 화면에 내려주는
  //   canDraw 도 같은 함수를 쓴다. 여기서 손으로 다시 계산하면 화면이 열어 준 버튼을
  //   서버가 409 로 막는(또는 그 반대) 어긋남이 생긴다.
  if (isDrawLocked(film)) {
    return Response.json({ error: "이미 그리는 중이에요" }, { status: 409 });
  }
  // ★★ **굽는 중에는 그리지 않는다.** 화면(lib/film/gates.js)이 이미 두 버튼을 서로
  //   잠그지만 화면 잠금은 한 벌뿐이라 샌다(탭 둘·새로고침 실패·직접 호출). 그리고
  //   새면 돈이 두 번 나간다: 그리기가 끝나면 putFilm 이 status 를 "images" 로 바꾸는데,
  //   collectFilmRender 는 `status !== "rendering"` 이면 그 job 을 **영영 수거하지 않는다** —
  //   fal 값은 나갔고 회차는 살아 있어 환불도 안 되며, 다음 [굽기]가 새 회차를 열어
  //   35 크레딧을 다시 걷는다. 그래서 지켜져야 하는 것을 서버가 판정한다.
  // ★ 판정은 새로 만들지 않는다 — 굽는 중은 곧 status 가 "rendering" 이라는 뜻이고,
  //   그것은 굽기 라우트가 자기 재진입을 막을 때 보는 것과 같은 값이다.
  if (film.status === "rendering") {
    return Response.json({ error: "지금 영상을 만드는 중이에요" }, { status: 409 });
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
    // ★ only 가 없으면 **넷째 인자도 안 붙인다** — 옛 호출과 글자 그대로 같아야 한다.
    if (Array.isArray(only) && only.length) await runFilmImages(id, user.id, mode, { only });
    else await runFilmImages(id, user.id, mode);
  } catch (e) {
    // ★ 문서에 실패를 적는 자리는 **파이프라인 하나다**(lib/film/pipeline.js 의 failFilm 이
    //   status:"error" 와 문구를 남긴다). 여기서 또 적으면 마지막 쓰기가 이겨 두 자리가
    //   조용히 갈린다 — 화면은 그 status 를 읽는다. 응답으로만 알린다.
    return Response.json({ error: e?.message || "그림을 만들지 못했어요" }, { status: 400 });
  }
  return Response.json({ ok: true });
});
