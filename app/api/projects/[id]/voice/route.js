import { getProject, updateProject } from "../../../../../lib/projects";
import { runVoicePipeline } from "../../../../../lib/pipeline";
import { VOICES } from "../../../../../lib/voices";
import { fakeFal } from "../../../../../lib/fake";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { modelIdForProject, projectSpeaks } from "../../../../../lib/clip-limits.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 읽을 컷이 있어야 한다 — 목소리는 컷별로 만든다.
  // 컷은 대본 승인이 나눈다(POST /cuts).
  if (!(project.cuts || []).length) {
    return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  }

  // ★ 말하는 모델에서는 클립이 목소리를 만든다 — 여기서 살 것이 없다.
  // 고른 목소리(voice_id)도 필요 없다: 대사와 목소리는 캐스팅(project.cast)에 있고
  // 클립 프롬프트가 그것을 싣는다.
  // 단계를 없애지 않는 이유는 Kling 경로가 그대로 쓰기 때문이다 — status 만 넘긴다.
  // 정가는 다음 문(/images)이 받는다. 아무것도 안 사는 자리에서 값을 물리지 않는다.
  if (projectSpeaks(project)) {
    await updateProject(id, user.id, (proj) => ({ ...proj, status: "voice", voice_error: null }));
    return Response.json({ skipped: true });
  }

  const body = await req.json().catch(() => ({}));
  // 가짜 모드에서는 voice_id 가 아직 비어 있어도 흐름을 확인할 수 있어야 한다.
  // 실제 호출에서는 목록에 있는 id 만 받는다(임의 문자열이 fal 로 새어 나가지 않게).
  const known = VOICES.some((v) => v.label === body?.voiceLabel);
  if (!known) return Response.json({ error: "목소리를 골라 주세요" }, { status: 400 });
  const voiceId = VOICES.find((v) => v.label === body.voiceLabel)?.id || "";
  if (!voiceId && !fakeFal()) {
    return Response.json({ error: "이 목소리는 아직 연결되지 않았어요" }, { status: 400 });
  }

  // 멱등 가드 — 이미 만든 소리를 통째로 지우고 다시 만들지 않는다(컷별 재생성으로 처리).
  // status 조건을 두지 않는다: 목소리가 끝나면 status 는 이미지·영상으로 계속 앞서 가므로,
  // status 로 판정하면 뒤 단계에서 소리를 다시 살 수 있다. 소리의 유무만 본다.
  if ((project.cuts || []).some((c) => c.audio)) {
    return Response.json(
      { error: "이미 만든 목소리가 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  // 시작 게이트 + 청구 — 정가를 낸 프로젝트만 통과한다(/images·/clips 와 같은 문).
  // 목소리는 영상 정가에 포함이라(편당 ~$0.014) 정상 흐름에서는 그냥 지나간다.
  // 문을 다는 이유는 값이 아니라 **순서**다: 여기를 열어 두면 정가를 안 낸 프로젝트가
  // 소리를 갖추고 /clips(편당 ~$2.10) 앞까지 걸어 들어온다.
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

  await updateProject(id, user.id, (proj) => ({
    ...proj, voice_id: voiceId, voice_label: body.voiceLabel, voice_error: null,
  }));

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (컷 파이프라인과 같은 방식)
  runVoicePipeline(id, user.id).catch(async (e) => {
    console.error("voice pipeline error:", e);
    await updateProject(id, user.id, (proj) => ({
      ...proj, voice_error: e?.message || "목소리를 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
});
