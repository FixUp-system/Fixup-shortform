import { withUser } from "../../../../../lib/auth/require-user.js";
import { runInBackground } from "../../../../../lib/background.js";
import { runReelClips } from "../../../../../lib/reel/pipeline.js";
import { isPromptsReady, putReel } from "../../../../../lib/reel/doc.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { modelIdForProject, resolutionForProject } from "../../../../../lib/clip-limits.js";
import { fakeFal } from "../../../../../lib/fake.js";

// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 그것을 **플랫폼에 말해 줘야 한다**
//    (2026-08-18 프로덕션 실측). 둘 다 없어서 **클립 3개를 결제하고 2개만 저장됐다**
//    (오류 기록조차 없었습니다). app/api/projects/[id]/clips/route.js 와 같은 처방을 쓴다.
export const maxDuration = 300;

// 굽기 — **값이 나가는 문이다.**
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // ★ 화면과 **같은 판정**을 쓴다 — 손으로 적으면 화면이 열어 준 버튼을 서버가 막는다.
  if (!isPromptsReady(project.cuts)) {
    return Response.json({ error: "영상 프롬프트를 먼저 만들어 주세요" }, { status: 400 });
  }

  // 정가 게이트. 이미 살아 있는 청구가 있으면 그냥 지나간다(정가에 포함된 정상 흐름).
  // ★ 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다.
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
        model: modelIdForProject(project), resolution: resolutionForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  await updateProject(id, user.id, (p) => putReel(p, { status: "rendering", error: null }));
  // ★ **약속(promise)을 넘긴다 — 콜백이 아니다.** 콜백으로 넘기면 파이프라인이 요청 범위
  //   밖에서 시작하고, 비용 주체는 AsyncLocalStorage 에서 읽으므로 costActor() 가 던진다.
  runInBackground(
    runReelClips(id, user.id).catch(async (e) => {
      await updateProject(id, user.id, (p) =>
        putReel(p, { status: "error", error: e?.message || "영상을 못 만들었어요" })).catch(() => {});
    })
  );
  return Response.json({ ok: true });
});
