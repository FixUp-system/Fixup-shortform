import { getProjectCuts } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";

// 클립 진행 상태 — doc 통짜 대신 cuts 만 읽는다(실측 13,236 → 9,417 bytes).
//
// 여기는 절감이 1.4배뿐이다. cuts 가 doc 의 대부분이고, 화면이 컷마다의 진행을
// 그리는 데 실제로 그 배열을 쓴다(setProject 로 통째로 갈아끼운다).
//
// ★ 더 줄이려고 각인(image.of·video.of)을 떼면 안 된다 — isImageStale·isClipStale
//   이 그것으로 낡음을 판정한다. 각인이 사라지면 "각인 없음 = 안 낡음"이 되어
//   낡은 그림에 경고가 안 뜨고, 그 경고가 유료 재생성 버튼을 띄우는 자리다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const st = await getProjectCuts(id, user.id);
  if (!st) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({ status: st.status, cuts: st.cuts, video_error: st.video_error });
});
