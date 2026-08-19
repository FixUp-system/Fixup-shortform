import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject, isStepDoc } from "../../../../../lib/projects";
import { runRenderPipeline } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";

// 유료 입구 넷(/auto·/voice·/images·/clips)과 달리 여기에는 requireVideoCharge 가 없다 —
// 합성은 로컬 ffmpeg 라 fal 지출이 0원이고, 게이트의 목적은 "돈이 나가기 전에 받는 것"이다.
// ★ 다만 정책 질문은 남는다: **환불된 프로젝트가 완성본을 받아도 되는가.**
// 클립까지 만들어 둔 뒤 환불된 프로젝트는 여기서 0원에 완성본을 가져갈 수 있다.
// 지금은 "이미 만든 것을 합치는 데 또 받지 않는다"로 두었다(원가가 0이라). 판매가·정책이
// 정해지면 다시 볼 자리다.
// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 그것을 **플랫폼에 말해 줘야 한다**
//    (2026-08-18 프로덕션 실측). Vercel 에서 응답 후의 작업은 보장되지 않는다: `after()` 로
//    함수 수명을 그 약속까지 늘리고(lib/background.js 한 자리), `maxDuration` 으로 상한을 명시해야 한다. 둘 다 없어서
//    **클립 3개를 결제하고 2개만 저장됐고**(오류 기록조차 없다), 합성은 두 번 다 조용히 죽었다.
//    폴링이 우연히 그 인스턴스를 깨우면 진행되고 아니면 멈췄다 — 부분 성공과 전면 실패를 가른
//    것이 **운**이었다.
//
// ★ **약속(promise) 을 넘긴다 — 콜백이 아니다.** 콜백으로 넘기면 파이프라인이 요청 범위 밖에서
//   시작하고, 비용 주체는 AsyncLocalStorage 에서 읽으므로(lib/actor.js) 컨텍스트가 없으면
//   `costActor()` 가 **던진다**. 이 형태는 호출이 요청 안에서 일어나 컨텍스트가 따라간다.
// ★ 심장박동(startHeartbeat)은 이것을 막지 못한다 — 죽음을 보이게 하는 장치일 뿐이다.
//   근본 해결은 작업 큐·워커이고 별개 프로젝트다(CLAUDE.md).
//
// 합성은 ffmpeg 단일 작업이고 이 저장소는 정상 10분까지로 잡아 뒀다(STALL_EXEMPT_PHASES).
// 300 을 넘기는 긴 영상은 여전히 잘린다 — 그 경계는 실측해서 정해야 한다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 이 경로는 **종류가 없는 옛 문서**만 다룬다 — 광고는 /api/ads/*, film 은 /api/film/* 이 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!isStepDoc(project)) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  // 완성본은 다시 만들 수 있다 — 멱등 가드를 두지 않는다.
  // 합성은 fal 호출이 아니라(기본 경로) 비용이 들지 않고, 컷을 고친 뒤 다시 만드는 게 정상 흐름이다.
  await updateProject(id, user.id, (proj) => ({ ...proj, render_error: null, render: null }));

  runInBackground(
    runRenderPipeline(id, user.id).catch(async (e) => {
      console.error("render pipeline error:", e);
      await updateProject(id, user.id, (proj) => ({
        ...proj, render_error: e?.message || "합성하지 못했어요",
      })).catch(() => {});
    })
  );
  return Response.json({ started: true });
});
