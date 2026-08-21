import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject } from "../../../../../lib/projects.js";
import { reelOf } from "../../../../../lib/reel/doc.js";
import { isReelClipStale } from "../../../../../lib/reel/steps.js";

// 화면이 두드리는 상태 라우트 — 이 계약은 다음 태스크(화면)가 소비한다. 모양을 여기서
// 못 박는다:
//   { status, error, cuts: [{ idx, image, clip_prompt, video, stale }] }
//
// ★ 클립·합성 둘 다 fal 큐가 아니라 이 라우트가 부른 백그라운드 프로미스 안에서
//   끝까지 돈다(runReelClips·composeVideo) — film·광고처럼 "여기서 한 번 더 수거한다"가
//   없다. 그래서 이 라우트는 그냥 문서를 읽기만 한다(GET 인데 일을 안 한다).
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
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

  return Response.json({ status: reel.status, error: reel.error, cuts });
});
