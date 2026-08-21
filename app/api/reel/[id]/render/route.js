import { withUser } from "../../../../../lib/auth/require-user.js";
import { runInBackground } from "../../../../../lib/background.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { putReel } from "../../../../../lib/reel/doc.js";
import { composeVideo } from "../../../../../lib/compose.js";
import { speechLangOf } from "../../../../../lib/subtitle-langs.js";

// 완성 — 컷마다 만든 클립을 이어 붙이고 자막을 태운다. lib/compose.js 의 composeVideo
// 하나가 그 둘을 다 한다(합성이 곧 자막 굽기다) — 새 장치를 만들지 않는다.
//
// ★ 유료 입구가 아니다(/clips 와 다르다). 합성은 로컬 ffmpeg 라 fal 지출이 0원이고,
//   requireVideoCharge 는 여기 없다(app/api/projects/[id]/render/route.js 와 같은 이유).
//
// ★★ 응답을 보낸 뒤에도 이 일이 계속 돌아야 한다 — 플랫폼에 말해 줘야 한다(2026-08-18
//    프로덕션 실측). maxDuration 없이 fire-and-forget 을 쓰면 클립 결제·저장이 조용히
//    끊긴 전례가 있다(app/api/projects/[id]/clips/route.js 머리말).
// ★ **약속(promise)을 넘긴다 — 콜백이 아니다.** costActor() 가 요청 컨텍스트를 요구한다.
export const maxDuration = 300;

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  await updateProject(id, user.id, (p) => putReel(p, { status: "rendering", error: null }));

  runInBackground(
    composeVideo({
      projectId: id,
      cuts: project.cuts || [],
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      subtitle: project.settings?.subtitle,
      lang: project.settings?.subtitle_lang || speechLangOf(project),
      sourceLang: speechLangOf(project),
    })
      .then(async (result) => {
        await updateProject(id, user.id, (p) =>
          putReel(p, { status: "done", video: { url: result.url, seconds: result.seconds }, error: null }));
      })
      .catch(async (e) => {
        console.error("reel render error:", e);
        await updateProject(id, user.id, (p) =>
          putReel(p, { status: "error", error: e?.message || "합성하지 못했어요" })).catch(() => {});
      })
  );
  return Response.json({ ok: true });
});
