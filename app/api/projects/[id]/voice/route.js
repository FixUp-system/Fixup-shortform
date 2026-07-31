import { getProject, updateProject } from "../../../../../lib/projects";
import { runVoicePipeline } from "../../../../../lib/pipeline";
import { VOICES } from "../../../../../lib/voices";
import { fakeFal } from "../../../../../lib/fake";

// TEMP(Task 7 에서 requireUser 로 교체) — 인증이 붙기 전까지의 자리표시자.
// 이 상수가 남아 있으면 Task 7 이 안 끝난 것이다.
const TEMP_OWNER = process.env.SHOTFORM_TEMP_OWNER || "00000000-0000-0000-0000-000000000000";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id, TEMP_OWNER);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // 읽을 컷이 있어야 한다 — 목소리는 컷별로 만든다.
  // 컷은 대본 승인이 나눈다(POST /cuts).
  if (!(project.cuts || []).length) {
    return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
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

  await updateProject(id, TEMP_OWNER, (proj) => ({
    ...proj, voice_id: voiceId, voice_label: body.voiceLabel, voice_error: null,
  }));

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (컷 파이프라인과 같은 방식)
  runVoicePipeline(id, TEMP_OWNER).catch(async (e) => {
    console.error("voice pipeline error:", e);
    await updateProject(id, TEMP_OWNER, (proj) => ({
      ...proj, voice_error: e?.message || "목소리를 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
