import { withUser } from "../../../../../lib/auth/require-user.js";
import { runInBackground } from "../../../../../lib/background.js";
import { runReelClips, runReelOneShot } from "../../../../../lib/reel/pipeline.js";
import { planReelBake, canBakeReel } from "../../../../../lib/reel/oneshot.js";
import { putReel, reelOf } from "../../../../../lib/reel/doc.js";
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
  // ★★ 2026-08-21 리뷰 I10 — 종류 격리가 빠져 있었다. 옛 문서(kind 없음)에 이 라우트를
  //   부르면 클립이 그 문서의 컷에 그대로 저장되는데, 단계별 흐름은 이 필드 모양을 모른다.
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  // ★ 화면과 **같은 판정**을 쓴다 — 손으로 적으면 화면이 열어 준 버튼을 서버가 막는다.
  // ★★ 2026-08-21 리뷰 A2 — 여기가 프롬프트가 다 찼는지 하나만 봤었다. `runReelClips`
  //   (lib/reel/pipeline.js)의 진짜 전제는 "프롬프트 다 찼다 **그리고** 컷마다 그림도
  //   있다"인데, 그 조합은 **청구 뒤 백그라운드**에서만 확인됐다 — 프롬프트는 다 찼는데
  //   그림이 빠진 컷이 있으면 크레딧이 나간 **뒤** `status:"error"` 였다. 청구 앞인
  //   여기서 그 조합을 함께 보면 그 값은 아예 안 나간다(`canBakeReelClips`, 화면
  //   게이트와 같은 함수).
  // ★★ 2026-08-25 — 갈래가 둘이다. 15초 이하 + 스토리보드면 **한 번에 통짜로** 굽고
  //   (스토리보드 한 장 + 프롬프트 하나 → r2v 한 번), 그 밖이면 예전처럼 컷별로 굽는다.
  //   45·60초는 Seedance 2.0 이 한 번에 못 굽는 길이라(15초가 최대) 컷별이 유일한 길이다.
  //   판정은 lib/reel/oneshot.js 의 planReelBake **하나**다 — 여기서 초를 다시 세면
  //   화면과 갈린다. 게이트도 마찬가지로 canBakeReel 하나다(컷별 갈래에서는 예전
  //   canBakeReelClips 를 글자 그대로 부른다).
  const plan = planReelBake(project);
  if (!canBakeReel(project)) {
    return Response.json({
      error: plan.mode === "oneshot"
        ? "시나리오와 그림을 먼저 만들어 주세요"
        : "영상 프롬프트와 그림을 먼저 만들어 주세요",
    }, { status: 400 });
  }

  // ★★ 2026-08-21 리뷰 C2 — 돌고 있는 실행 위에 또 시작하지 않는다. **청구보다 앞**이다.
  //   (2026-08-21 재검토 N5 정정 — 아래 문구가 한때 거짓이었다: runReelClips 는 이제
  //   낡지 않은 완성 클립을 건너뛴다. 그래도 이 문은 그대로 필요하다 — 재진입 자체를
  //   막아야 "돌고 있는 실행 위에 또 시작"이 안 생긴다. 아직 안 구운/낡은 컷이 있으면
  //   두 실행이 같은 컷을 동시에 구울 수 있고, 그러면 fal 원가가 이중으로 나간다.)
  //   이미 살아 있는 청구가 있으면 requireVideoCharge 는 그냥 지나가 **크레딧은 0** 이다.
  //   화면 잠금만으로는 안 된다(탭 둘·직접 호출이 샌다) — 판정은 서버가 쥔 reel.status 하나다
  //   (app/api/projects/[id]/clips/route.js 의 isGenerationLive 409, film 의
  //   status==="rendering" 409 와 같은 결).
  if (reelOf(project).status === "rendering") {
    return Response.json({ error: "이미 만드는 중이에요 — 잠시 기다렸다가 다시 눌러 주세요" }, { status: 409 });
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
    (plan.mode === "oneshot" ? runReelOneShot(id, user.id) : runReelClips(id, user.id))
      // ★★ 2026-08-21 리뷰 C1 — 성공이 문서에 안 남고 있었다. runReelClips 는 cuts 만
      //   저장하고 reel.status 를 안 건드리므로, 여기서 옮기지 않으면 status 가 영원히
      //   "rendering" 으로 남아 화면은 영영 "만드는 중", scenarioLock 은 영구 잠금이 된다.
      //   ★ "done" 이 아니다 — 이건 클립(컷별 영상) 생성이 끝난 것이고, 최종 완성본은
      //   /render 가 만든다(REEL_STEPS 의 ⑤영상 단계 ≠ ⑥완성 단계). "clips" 로 구분해서
      //   /render 라우트가 다시 "rendering" 으로 바꿔도 뜻이 안 겹친다.
      .then(async () => {
        await updateProject(id, user.id, (p) => putReel(p, { status: "clips", error: null })).catch(() => {});
      })
      .catch(async (e) => {
        await updateProject(id, user.id, (p) =>
          putReel(p, { status: "error", error: e?.message || "영상을 못 만들었어요" })).catch(() => {});
      })
  );
  return Response.json({ ok: true });
});
