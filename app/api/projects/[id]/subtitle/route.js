import { getProject, updateProject } from "../../../../../lib/projects";
import { runSubtitlePipeline } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";

// 자막만 다시 굽는다 — 클립·소리·그림은 그대로 두고 원본 위에 자막 필터만 건다.
//
// /render 와 마찬가지로 크레딧 게이트가 없다: 로컬 ffmpeg 라 fal 지출이 0원이고,
// 게이트의 목적은 "돈이 나가기 전에 받는 것"이다(render/route.js 상단 주석 참고).
//
// ★ /render 와 달리 **기다렸다가 답한다**. 자막 굽기는 원본 하나에 필터 한 번이라
// 클립을 다시 받는 전체 합성보다 훨씬 짧고, 화면([적용] 버튼)이 이 응답을 받은 뒤
// 곧바로 프로젝트를 다시 읽는다 — 백그라운드로 돌리면 사장님이 새로고침해야 자막이
// 바뀐 것으로 보인다(⑥완성 화면에는 자막용 폴링이 없다).
// ★ 이 저장소에서 **기다렸다가 답하는 유일한 라우트**이고, 영상 전 구간을 다시 인코딩한다.
// 배포 기본 타임아웃(10초대)에 잘리면 사장님에게는 그냥 500 이다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 원본이 없는 옛 프로젝트 — 자막만 다시 구울 재료가 없다. 전체 합성을 한 번 하면 생긴다.
  // ⚠️ 이름이 camelCase 다(render.rawUrl). `raw_url` 은 이 저장소에 없는 필드다.
  if (!project.render?.rawUrl) {
    return Response.json(
      { error: "자막만 다시 구울 수 없어요 — 완성본을 한 번 다시 만들어 주세요" },
      { status: 400 }
    );
  }

  try {
    await runSubtitlePipeline(id, user.id);
  } catch (e) {
    console.error("subtitle burn error:", e);
    // 실패해도 render 를 비우지 않는다 — 이미 있는 완성본은 그대로 볼 수 있어야 한다.
    // 대신 화면이 사유를 말할 수 있게 문서에도 남긴다.
    await updateProject(id, user.id, (proj) => ({
      ...proj, render_error: e?.message || "자막을 다시 굽지 못했어요",
    })).catch(() => {});
    return Response.json({ error: e?.message || "자막을 다시 굽지 못했어요" }, { status: 500 });
  }

  const after = await getProject(id, user.id);
  return Response.json({ render: after?.render || null });
});
