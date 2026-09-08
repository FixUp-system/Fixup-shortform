import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { finishFilmRender } from "../../../../../lib/film/pipeline.js";

// ★★★ 마무리 — **무거운 일만 사는 자리**다(2026-09-08, 광고와 같은 갈라짐).
//
// 내려받기 · 저장 · 자막 굽기(ffmpeg)는 몇십 초가 걸린다. 그전에는 이 일을 상태
// 라우트(GET …/status, 상한 60초)가 했고, 그 라우트는 **방식마다** 수거를 돌아 한 요청이
// 무거운 일을 두 번 할 수 있었다. 화면은 응답을 안 기다리고 2초마다 두드리므로 겹치면
// 인스턴스가 메모리 초과로 죽는다 — 광고에서 실제로 그렇게 죽었고(실측 3분 21초에
// 500 OOM 70건 · 504 타임아웃 14건 · 성공 0건), 마무리가 끝나야 지워지는 접수증이 영영
// 안 지워져 화면이 "만드는 중"에 갇혔다.
//
// ★ 방식(mode)은 **본문으로 받는다** — 이 경로의 다른 라우트(…/render)와 같은 규약이다.
// ★ 겹치기는 finishFilmRender 가 문서에 쥐는 잠금이 막는다(방식별 · 수명 6분).
// ★ 던지지 않는다 — 실패는 films[mode].error 로 남고 환불도 거기서 한다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { mode } = (await req.json().catch(() => ({}))) || {};
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });

  const out = await finishFilmRender(id, user.id, mode);
  return Response.json(out || {});
});
