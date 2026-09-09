import { withUser } from "../../../../../lib/auth/require-user.js";
import { attachReelVideo } from "../../../../../lib/reel/pipeline.js";

// ★★★ 잃어버린 영상 붙이기 — **운영자 전용 구조선**(2026-09-09).
//
// 광고에는 09-08 에 생겼는데(app/api/ads/[id]/attach) reel 에는 없었다. fal 에서는
// 완성됐는데 우리 수거가 죽어 문서에 못 붙은 편이 생기면, 이미 값을 치른 영상을 앱에서
// 되찾을 길이 없다. 오늘 실물로 그런 편이 생겼다 — 초상 거절로 실패한 편을 격자 여유를
// 키워 다시 구웠는데, 그 결과물이 우리 파이프라인 밖에 있어 앱이 모른다.
//
// ★ **굽지 않는다.** 이미 만들어진 것을 가져오기만 하므로 이 문으로는 값이 새로 안 나간다.
// ★ **운영자 전용이다.** 열려 있으면 남의 편에 아무 영상이나 꽂을 수 있는 문이 된다.
// ★ 상한 300초 — 큐에서 결과를 받아 문서에 적는다(광고 쪽과 같은 값).
// ★ 굽는 중이면 409 — 도는 굽기를 덮으면 그 값이 사라진다.
//
// 쓰는 법(둘 중 하나):
//   POST /api/reel/<id>/attach  { "requestId": "01a0..." }   ← fal 큐에서 받아 붙인다
//   POST /api/reel/<id>/attach  { "url": "https://.../v.mp4" } ← 주소를 직접 준다
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { requestId, url } = (await req.json().catch(() => ({}))) || {};
  if (!requestId && !url) {
    return Response.json({ error: "fal 접수번호(requestId) 나 영상 주소(url)가 필요해요" }, { status: 400 });
  }

  // ★ 소유자 자리에 운영자 자신을 넘긴다 — getProject 가 운영자면 소유자 필터를 걷는다
  //   (lib/projects.js 의 ownerScope). 그래서 남의 편도 되살릴 수 있다.
  const out = await attachReelVideo(id, user.id, { requestId, url });
  if (out?.rendering) return Response.json(out, { status: 409 });
  if (out?.error) return Response.json(out, { status: 400 });
  return Response.json(out || {});
}, { adminOnly: true });
