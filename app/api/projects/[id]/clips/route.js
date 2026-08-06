import { getProject, updateProject } from "../../../../../lib/projects";
import { runVideoPipeline } from "../../../../../lib/pipeline";
import { isClipStale } from "../../../../../lib/steps";
import { withUser } from "../../../../../lib/auth/require-user.js";

// 이 라우트에는 **시작 게이트가 없다.** 클립은 영상 정가에 포함이고, 그 정가는 자동 관통
// 입구(POST /auto) 또는 그림 시작(POST /images)에서 이미 받았다 — 여기서 또 재면
// 정가를 낸 사장님이 원가 눈금에 두 번 걸린다.
//
// 예전에는 남은컷×단가로 하한을 계산했다(clipsCostFor). 그 계산이 있던 이유는 사용자 축이
// **USD 잔액**이라 컷 중간에 끊길 수 있었기 때문인데, 지금은 정가를 선불로 받으므로
// 그 상황 자체가 없다. 남은 그물은 호출 게이트(lib/costs.js, 잔액 음수)와
// 전역·프로젝트 USD 상한이다.

// 경로가 clips 인 이유: 옛 app/api/video (Quick Create 의 t2v)와 이름이 겹쳤다.
// 그 라우트는 2026-08-04 에 제거됐지만 경로 이름은 그대로 둔다(화면·테스트가 문다).
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  // 클립 길이는 낭독 길이에서 나온다 — 소리가 없으면 몇 초를 만들지 알 수 없다
  if (!cuts.some((c) => c.audio)) {
    return Response.json({ error: "목소리를 먼저 만들어 주세요" }, { status: 400 });
  }

  // 멱등 가드 — **할 일이 없을 때만** 막는다.
  //
  // 예전에는 status 가 video 이고 클립이 하나라도 있으면 막았다. 그런데 컷 하나만 클립이
  // 있는 상태가 실제로 생겼고(A/B 로 미리 산 클립을 심었다), 그때 나머지를 만들 길이 없었다.
  // 부분 실패도 같은 자리에 걸렸다 — 성공분이 있으면 다시 누를 수 없었다.
  //
  // 지금은 runVideoPipeline 이 살아 있는 클립을 건너뛰므로 다시 부르는 데 값이 들지 않는다.
  // 판정은 그 건너뛰기 조건의 정확한 반대다 — 두 곳이 다른 규칙을 쓰면 화면이 "남았다"고
  // 하는데 파이프라인이 아무것도 안 하는 자리가 생긴다.
  //
  // status === "video" 조건은 일부러 뺐다. 예전에 그 조건을 본 이유는 "만든 걸 통째로
  // 지우지 않기"였는데, 그 보장은 이제 이 필터(remaining)와 runVideoPipeline 의 건너뛰기가
  // 함께 지킨다 — 살아 있는 클립은 애초에 remaining 에 안 들어가고, 설령 들어가 다시 불려도
  // 파이프라인이 손대지 않는다. status 를 더 보는 건 같은 것을 두 규칙으로 지키는 것이라
  // 언젠가 어긋난다("할 일이 있는가" 하나로 충분하다).
  const remaining = cuts.filter((c) => !c.video?.url || isClipStale(c));
  if (!remaining.length) {
    return Response.json(
      { error: "이미 만든 영상이 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  await updateProject(id, user.id, (proj) => ({ ...proj, video_error: null }));

  runVideoPipeline(id, user.id).catch(async (e) => {
    console.error("video pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
