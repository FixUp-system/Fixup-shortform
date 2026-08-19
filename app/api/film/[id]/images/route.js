import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { runFilmImages } from "../../../../../lib/film/pipeline.js";
import { updateProject } from "../../../../../lib/projects.js";
import { putFilm } from "../../../../../lib/film/doc.js";

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

  try {
    await runFilmImages(id, user.id, mode);
  } catch (e) {
    // 실패를 문서에도 남긴다 — 화면이 새로고침 뒤에도 왜 안 됐는지 읽을 수 있어야 한다.
    await updateProject(id, user.id, (p) =>
      putFilm(p, mode, { error: e?.message || "그림을 만들지 못했어요" })
    ).catch(() => {});
    return Response.json({ error: e?.message || "그림을 만들지 못했어요" }, { status: 400 });
  }
  return Response.json({ ok: true });
});
