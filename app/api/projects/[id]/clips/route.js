import { getProject, updateProject } from "../../../../../lib/projects";
import { runVideoPipeline } from "../../../../../lib/pipeline";
import { isClipStale } from "../../../../../lib/steps";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { fakeFal } from "../../../../../lib/fake";
import { modelIdForProject } from "../../../../../lib/clip-limits.js";

// 이 라우트는 **살아 있는 청구를 요구한다**(requireVideoCharge). 클립은 영상 정가에
// 포함이라 정상 흐름에서는 그냥 지나가지만, 정가를 안 낸(또는 환불받은) 프로젝트로
// 들어오면 여기서 정가를 받는다.
//
// 예전에는 남은컷×단가로 USD 하한을 계산했고(clipsCostFor), 그다음엔 아예 문을 뺐다.
// 문을 뺀 것이 구멍이었다: 실패 → 환불 → 그림은 남음 → /clips 로 순지불 0 완성본.
// 견적 계산으로 되돌리지 않는 이유는 사용자 축이 더 이상 USD 가 아니어서다 —
// 재는 것은 언제나 **정가를 냈는가** 하나다.

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
  const remaining = cuts.filter((c) => !c.video?.url || isClipStale(c, project));
  if (!remaining.length) {
    return Response.json(
      { error: "이미 만든 영상이 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  // 시작 게이트 + 청구 — 정가를 낸 프로젝트만 통과한다(/images 와 같은 문).
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다(assertBudget 과 같은 규칙).
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
        model: modelIdForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
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
