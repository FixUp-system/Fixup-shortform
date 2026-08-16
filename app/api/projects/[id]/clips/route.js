import { getProject, updateProject } from "../../../../../lib/projects";
import { runVideoPipeline, withProgress } from "../../../../../lib/pipeline";
import { isClipStale } from "../../../../../lib/steps";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, assertCanAfford, chargeRegen, NoCredits } from "../../../../../lib/charges.js";
import { regenPrice, MAX_REGEN_PER_CUT } from "../../../../../lib/pricing.js";
import { fakeFal } from "../../../../../lib/fake";
import { modelIdForProject, projectSpeaks, resolutionForProject } from "../../../../../lib/clip-limits.js";

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
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "시나리오를 먼저 확정해 주세요" }, { status: 400 });
  // 클립 길이는 낭독 길이에서 나온다 — 소리가 없으면 몇 초를 만들지 알 수 없다.
  // ★ 말하는 모델은 예외다 — 목소리를 클립이 만드니 낭독이 없고, 컷 길이는 분할 때 잡은
  //   추정 초가 그대로 최종값이다(lib/subtitles.js 의 cutSeconds).
  if (!projectSpeaks(project) && !cuts.some((c) => c.audio)) {
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
        model: modelIdForProject(project), resolution: resolutionForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  // ★ **낡아서 다시 만드는 컷은 재생성이다** — 컷별 [다시 만들기]와 같은 값·같은 회차·
  // 같은 상한(3회)을 쓴다. 이것이 없던 동안, 컷을 고쳐 클립을 낡게 만든 뒤 이 버튼을
  // 누르면 값을 한 푼도 안 내고 다시 만들 수 있었다(원가는 컷당 $0.42~$1.51 나간다).
  // 컷별 버튼만 값을 받고 일괄 버튼은 안 받으면, 값을 피하는 길이 화면에 그대로 있는 셈이다.
  //
  // 아직 안 만든 컷(클립이 아예 없는 컷)은 **정가에 포함**이라 여기서 또 받지 않는다.
  const stale = remaining.filter((c) => c.video?.url);
  if (!fakeFal() && stale.length) {
    const model = modelIdForProject(project);
    // ★ 일괄 [남은 N개 만들기]도 컷별 [다시 만들기]와 **같은 값**이어야 한다 — 해상도를
    //   여기만 빠뜨리면 1080p 클립을 720p 값에 일괄로 다시 만드는 길이 화면에 남는다.
    const resolution = resolutionForProject(project);

    // 상한 판정이 **청구보다 앞**이다 — 컷별 라우트와 같은 이유다(내고 아무것도 못 받는
    // 응답을 만들지 않는다).
    const over = stale.filter((c) => (Number(c.clip_regen_count) || 0) >= MAX_REGEN_PER_CUT);
    if (over.length) {
      const which = over.map((c) => c.idx + 1).join("·");
      return Response.json(
        { error: `${which}번 컷은 다시 만들기를 다 썼어요 — 영상 다시 만들기는 컷당 ${MAX_REGEN_PER_CUT}회까지예요` },
        { status: 400 }
      );
    }

    const bill = stale.map((c) => {
      const prior = Number(c.clip_regen_count) || 0;
      return { idx: c.idx, prior, price: regenPrice("clip", prior, model, resolution) };
    });
    const total = bill.reduce((sum, b) => sum + b.price, 0);

    // 총액을 **먼저** 확인한다 — 컷마다 확인하면 앞의 몇 컷만 받고 중간에 멈춘다.
    if (total > 0) {
      try {
        await assertCanAfford(user.id, total);
      } catch (e) {
        if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
        throw e;
      }
    }

    for (const b of bill) {
      if (b.price > 0) {
        await chargeRegen({
          userId: user.id, projectId: id, kind: "clip", idx: b.idx, priorCount: b.prior,
          model, resolution,
        });
      }
      // ★ 값이 0(첫 회)이어도 회차는 올린다 — 안 올리면 영원히 첫 회라 계속 공짜다.
      //   컷별 재생성에서 regenClip 이 하는 일을 여기서는 라우트가 한다.
      await updateProject(id, user.id, (proj) => ({
        ...proj,
        cuts: (proj.cuts || []).map((c) =>
          c.idx === b.idx ? { ...c, clip_regen_count: (Number(c.clip_regen_count) || 0) + 1 } : c
        ),
      }));
    }
  }

  // 시작 시각을 여기서 찍는다 — 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어
  // "멈췄다"를 판정할 근거가 없다(컷마다 찍는 심장박동은 첫 컷이 끝나야 처음 뛴다).
  //
  // ★ done 을 0 으로 박지 않고 withProgress 가 문서에서 세게 한다. 이 라우트에는
  //   [남은 N개 만들기]가 있어 **이미 끝난 클립을 쥔 채로** 시작하는 길이 있다 —
  //   거기서 0 은 일어난 적 없는 뒷걸음이다. 표식의 모양을 두 곳에서 지으면 어긋난다.
  // ★ 시각은 락 밖에서 잰다 — CAS 재시도로 patchFn 이 다시 불리기 때문이다(lib/projects.js).
  const startedAt = Date.now();
  await updateProject(id, user.id, (proj) =>
    withProgress({ ...proj, video_error: null }, "video", startedAt)
  );

  runVideoPipeline(id, user.id).catch(async (e) => {
    console.error("video pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
