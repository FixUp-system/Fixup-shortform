import { withUser } from "../../../../../lib/auth/require-user.js";
import { collectAdRender } from "../../../../../lib/ad/pipeline.js";
import { loadAd } from "../route.js";

// 화면이 2초마다 편다. doc 통짜를 안 실어 보낸다 — 필요한 것만 준다.
//
// ★★ GET 인데 일을 한다. 보통은 피할 모양이지만 여기서는 이것이 유일한 길이다 —
// 배포(Vercel 서버리스)에는 **응답 뒤에 남아서 도는 자리가 없다.** 광고 한 편은
// ≈8.4분이 걸려(lib/ad/timing.js 실측) 어떤 한 요청 안에서도 못 끝난다.
// 그래서 굽기를 접수(POST …/render)와 수거(여기)로 나눴고, 화면이 두드릴 때마다
// fal 에 한 번 물어본다. 물어보는 값이 몇 초라 상한과 무관하다.
//
// ★ collectAdRender 는 던지지 않는다 — 수거가 실패해도 화면은 상태를 읽어야 한다.
//   실패는 문서의 video_error 로 남고, 아래에서 그대로 실어 보낸다.
//
// ⚠️ 남는 성질: 아무도 안 두드리면 수거도 안 된다. 사장님이 창을 닫으면 그 영상은
//   fal 에서는 완성되지만 우리 문서는 rendering 인 채로 있다가, 다음에 그 화면을 열면
//   그때 수거된다. 완전한 해법은 크론이나 큐(fal 웹훅)인데 지금 범위 밖이다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;

  // 상태를 읽기 **전에** 수거한다 — 순서가 바뀌면 방금 끝난 영상을 한 박자 늦게 본다.
  await collectAdRender(id, user.id).catch((e) => {
    console.error("광고 수거 실패:", e);
  });

  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: project.status,
    video: project.videos?.[0] || null,
    error: project.video_error || null,
  });
});
