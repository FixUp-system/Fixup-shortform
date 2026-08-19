import { withUser } from "../../../../lib/auth/require-user.js";
import { loadFilmForViewing } from "../../../../lib/film/load.js";

// film 문서를 **읽는 문**. 화면 둘이 이것으로 문서를 읽는다
// (app/film/[mode]/page.js 의 초기 로드·reload, app/archive/[id]/page.js 의 상세).
//
// ★★ 왜 뒤늦게 생겼는가 — 이 자리가 비어 있던 것이 사고였다.
//   film 문서는 원래 `GET /api/projects/[id]` 를 지나 읽혔다. 그 문이 `kind === "ad"` 만
//   막고 있었기 때문이다. 즉 film 화면은 **단계별 경로의 문이 덜 막힌 덕에** 돌고 있었고,
//   그 문을 옳게 막는 순간(종류가 있는 문서는 전부 404) film 화면이 통째로 죽었다.
//   광고는 처음부터 /api/ads/[id] 에 자기 읽기 문이 있어 같은 문제가 없었다 —
//   **film 만 그 대칭이 비어 있었다.** 이 파일이 그 대칭을 채운다.
//
// ★ 소유자를 안 따진다(보관함 전체 공유) — 판정은 lib/film/load.js 의 loadFilmForViewing 이다.
//   값이 나가는 라우트(images·render)는 그대로 loadFilm 을 지난다: 읽는 문과 만드는 문은
//   갈려 있어야 한다(광고가 loadAd·loadAdForViewing 으로 가른 것과 같은 결이다).
//
// ★ 문구는 film 라우트의 다른 자리와 같다("찾을 수 없어요") — status·render 와 갈리면
//   같은 화면이 문에 따라 다른 말을 한다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const viewed = await loadFilmForViewing(id, user.id);
  if (!viewed) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  // mine — 화면이 쓰기 버튼을 그릴지 정하는 근거다(만든 사람이 누구인지는 안 준다).
  return Response.json({ ...viewed.project, mine: viewed.mine });
});
