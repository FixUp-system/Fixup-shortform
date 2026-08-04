// 자동 관통 시작 — 빠른 생성의 [만들기] 버튼이 부른다. 시작만 하고 폴링은 GET /projects/[id].
import { getProject, updateProject } from "../../../../../lib/projects";
import { runAutoPipeline } from "../../../../../lib/auto";
import { VOICES } from "../../../../../lib/voices";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "자료가 없어요" }, { status: 400 });
  }
  // 멱등 가드 — 진행 중 재클릭·완성 후 재시작을 막는다. 한 번의 자동 관통이 ~$2.59 다.
  if (project.auto?.state === "running") {
    return Response.json({ error: "이미 만드는 중이에요" }, { status: 409 });
  }
  if (project.render?.url) {
    return Response.json({ error: "이미 완성한 프로젝트예요 — 보관함에서 확인해 주세요" }, { status: 409 });
  }

  // 목소리는 대화가 고른 라벨. 목록 밖이면 기본으로 — 임의 문자열이 fal 로 새지 않게.
  const body = await req.json().catch(() => ({}));
  const voice = VOICES.find((v) => v.label === body?.voice_label) || VOICES[0];

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    voice_id: voice.id, voice_label: voice.label, voice_error: null,
    auto: { stage: "briefing", state: "running", error: null },
  }));

  // 비동기 시작 — 실패 처리는 runAutoPipeline 이 auto.state=failed 로 스스로 남긴다
  runAutoPipeline(id, user.id).catch((e) => console.error("auto pipeline error:", e));
  return Response.json({ started: true }, { status: 202 });
});
