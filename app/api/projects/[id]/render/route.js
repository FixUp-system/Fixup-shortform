import { getProject, updateProject } from "../../../../../lib/projects";
import { runRenderPipeline } from "../../../../../lib/pipeline";
import { withUser } from "../../../../../lib/auth/require-user.js";

// 유료 입구 넷(/auto·/voice·/images·/clips)과 달리 여기에는 requireVideoCharge 가 없다 —
// 합성은 로컬 ffmpeg 라 fal 지출이 0원이고, 게이트의 목적은 "돈이 나가기 전에 받는 것"이다.
// ★ 다만 정책 질문은 남는다: **환불된 프로젝트가 완성본을 받아도 되는가.**
// 클립까지 만들어 둔 뒤 환불된 프로젝트는 여기서 0원에 완성본을 가져갈 수 있다.
// 지금은 "이미 만든 것을 합치는 데 또 받지 않는다"로 두었다(원가가 0이라). 판매가·정책이
// 정해지면 다시 볼 자리다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.some((c) => c.video?.url)) {
    return Response.json({ error: "영상을 먼저 만들어 주세요" }, { status: 400 });
  }

  // 완성본은 다시 만들 수 있다 — 멱등 가드를 두지 않는다.
  // 합성은 fal 호출이 아니라(기본 경로) 비용이 들지 않고, 컷을 고친 뒤 다시 만드는 게 정상 흐름이다.
  await updateProject(id, user.id, (proj) => ({ ...proj, render_error: null, render: null }));

  runRenderPipeline(id, user.id).catch(async (e) => {
    console.error("render pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, render_error: e?.message || "합성하지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
