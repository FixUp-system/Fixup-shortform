import { withUser } from "../../../../../lib/auth/require-user.js";
import { attachAdVideo } from "../../../../../lib/ad/pipeline.js";

// ★★★ 잃어버린 영상 붙이기 — **운영자 전용 구조선**(2026-09-08 실물 사고).
//
// fal 에서는 완성됐는데 우리 수거가 죽어 문서에 못 붙은 편이 생겼고, 그 사이 새 굽기가
// 접수되며 재시작 단서(ad_request_id)까지 덮였다. 그러면 이미 값을 치른 영상을 앱에서
// 되찾을 길이 없다 — 이 라우트가 그 길이다. fal 접수번호를 주면 결과를 받아 붙인다.
//
// ★ **굽지 않는다.** 이미 만들어진 것을 가져오기만 하므로 이 문으로는 값이 새로 안 나간다.
// ★ **운영자 전용이다.** 열려 있으면 남의 편에 아무 영상이나 꽂을 수 있는 문이 된다.
// ★ 상한 300초 — 마무리와 같은 일(내려받기·저장·자막 굽기)을 한다.
// ★ 굽는 중이면 거절한다(409) — 도는 굽기를 덮으면 그 값이 사라진다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { requestId, url } = (await req.json().catch(() => ({}))) || {};
  if (!requestId && !url) {
    return Response.json({ error: "fal 접수번호(requestId)가 필요해요" }, { status: 400 });
  }

  // ★ 소유자 자리에 운영자 자신을 넘긴다 — getProject 가 운영자면 소유자 필터를 걷는다
  //   (lib/projects.js 의 ownerScope). 그래서 남의 편도 되살릴 수 있다.
  const out = await attachAdVideo(id, user.id, { requestId, url });
  if (out?.rendering) return Response.json(out, { status: 409 });
  if (out?.error) return Response.json(out, { status: 400 });
  return Response.json(out || {});
}, { adminOnly: true });
