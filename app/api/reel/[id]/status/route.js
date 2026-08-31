import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject } from "../../../../../lib/projects.js";
import { collectReelOneShot } from "../../../../../lib/reel/pipeline.js";
import { reelOf } from "../../../../../lib/reel/doc.js";
import { isReelClipStale } from "../../../../../lib/reel/steps.js";
// ★ 멈춘 경과는 **서버가 잰다.** 브라우저가 자기 시계로 빼면 PC 시계가 빠른 사장님에게는
//   시작하자마자 "멈췄어요"가 뜬다(lib/progress.js 의 stalledFor 머리말).
import { stalledFor } from "../../../../../lib/progress.js";

// 화면이 두드리는 상태 라우트 — 이 계약은 다음 태스크(화면)가 소비한다. 모양을 여기서
// 못 박는다:
//   { status, error, progress, stalled_for_ms, cuts: [{ idx, image, clip_prompt, video, stale }] }
//
// ★★ 2026-08-27 — progress·stalled_for_ms 를 싣기 시작했다. 그전에는 화면이 "돌고 있다"와
//   "2분째 아무 일도 없다"를 **같은 말**로 했다(둘 다 스피너 + "만드는 중"). 단계별 흐름의
//   다섯 상태 라우트가 이미 이 둘을 싣고 화면이 generationState 로 가른다 — 여섯째인 이
//   라우트만 계약 밖이었다. 값을 하나 더 실을 때 **원래 싣던 것을 떨어뜨리지 마라** —
//   그 종류의 조용한 누락이 images_error 버그(2026-08-14)의 뿌리였다.
//
// ★ 클립·합성 둘 다 fal 큐가 아니라 이 라우트가 부른 백그라운드 프로미스 안에서
//   끝까지 돈다(runReelClips·composeVideo) — film·광고처럼 "여기서 한 번 더 수거한다"가
//   없다. 그래서 이 라우트는 그냥 문서를 읽기만 한다(GET 인데 일을 안 한다).
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;

  // ★★★ 2026-08-31 — **GET 인데 일을 한다.** 통짜 굽기가 큐로 옮겨 가면서 생긴 자리다:
  //   접수는 즉시 끝나고 결과는 여기서 이어받는다. 배포(서버리스)에는 응답 뒤에 남아서
  //   도는 자리가 없고, 통짜 한 편은 어떤 한 요청 안에서도 못 끝난다 — 원클릭의
  //   app/api/ads/[id]/status/route.js 가 같은 이유로 같은 모양이다.
  // ★ 상태를 읽기 **전에** 수거한다 — 순서가 바뀌면 방금 끝난 영상을 한 박자 늦게 본다.
  // ★ collectReelOneShot 은 던지지 않는다 — 수거가 실패해도 화면은 상태를 읽어야 한다.
  //   실패는 문서의 reel.error 로 남고 아래에서 그대로 실어 보낸다.
  // ⚠️ 남는 성질: 아무도 안 두드리면 수거도 안 된다. 창을 닫으면 fal 에서는 완성되지만
  //   우리 문서는 굽는 중인 채로 있다가, 다음에 그 화면을 열면 그때 수거된다.
  await collectReelOneShot(id, user.id).catch((e) => {
    console.error("reel 수거 실패:", e);
  });

  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  const reel = reelOf(project);
  const cuts = (project.cuts || []).map((c) => ({
    idx: c.idx,
    image: c.image || null,
    clip_prompt: c.clip_prompt || "",
    video: c.video || null,
    // ★ 판정은 lib/reel/steps.js 의 isReelClipStale 하나다 — 화면의 "다시 만들기" 배지도
    //   같은 함수를 본다. 손으로 다시 재면 각인이 흔들려 이미 산 클립이 거짓으로 낡는다.
    stale: isReelClipStale(c),
  }));

  // ★ 판정할 근거가 없으면 null 이다 — 0 은 "방금 뛰었다"라서, 섞으면 심장박동을 모르는
  //   옛 프로젝트가 영원히 건강해 보인다.
  return Response.json({
    status: reel.status,
    error: reel.error,
    progress: project.progress || null,
    stalled_for_ms: stalledFor(project, Date.now()),
    cuts,
  });
});
