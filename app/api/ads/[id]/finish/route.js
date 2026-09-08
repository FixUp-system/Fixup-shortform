import { withUser } from "../../../../../lib/auth/require-user.js";
import { finishAdRender } from "../../../../../lib/ad/pipeline.js";

// ★★★ 마무리 — **무거운 일만 사는 자리**다(2026-09-08 사고에서 갈라져 나왔다).
//
// 내려받기 · 저장 · 자막 굽기(ffmpeg)는 몇십 초가 걸린다. 그전에는 이 일을 상태
// 라우트(GET …/status, 상한 60초)가 했다. 화면은 응답을 기다리지 않고 2초마다 그 라우트를
// 두드리므로 **무거운 일이 수십 개 겹쳤고** 인스턴스가 메모리 초과로 죽었다
// (실측 3분 21초: 500 OOM 70건 · 504 타임아웃 14건 · 성공 0건). 마무리가 끝나야 ad_job 이
// 지워지는데 아무도 못 끝내니 문서는 영영 rendering 이었다 — fal 에는 영상이 있는데
// 화면만 "만드는 중"인 그 사고다.
//
// ★ 상한 300초 — 상태 라우트의 60초로는 못 끝낸다. 값을 줄이려면 마무리의 실제 길이를
//   먼저 재라(내려받기 + 업로드 + ffmpeg).
// ★ 겹치기는 여기서도 막는다 — finishAdRender 가 문서에 잠금을 쥔다(수명 6분).
//   화면이 두 번 불러도, 창을 둘 열어도 무거운 일은 하나만 돈다.
// ★ 던지지 않는다 — finishAdRender 가 실패를 문서의 video_error 로 남기고 환불한다.
//   화면은 그것을 상태 라우트에서 읽는다.
export const maxDuration = 300;

export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const out = await finishAdRender(id, user.id);
  return Response.json(out || {});
});
