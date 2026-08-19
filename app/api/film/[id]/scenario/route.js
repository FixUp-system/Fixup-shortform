import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { updateProject, getProject } from "../../../../../lib/projects.js";
import { generateScenario, pickEditedShots } from "../../../../../lib/ad/scenario.js";
import { MAX_SCENARIO_TRIES } from "../../../../../lib/pricing.js";

// 시나리오 — 동기다(LLM 만 쓰고 몇 초면 끝난다).
//
// ★★ **이 라우트만 방식(mode)을 안 본다.** 시나리오는 두 방식이 **공유하는 하나**여야 한다:
//   방식마다 새로 쓰면 두 영상의 차이가 방식 때문인지 시나리오 때문인지 알 수 없게 되고,
//   그러면 이 기능(어느 방식이 나은가를 재는 것)이 통째로 무의미해진다.
//   그래서 결과는 films.* 가 아니라 문서 최상단 p.scenario 한 자리에 넣는다.
//
// ★ 광고의 runScenarioStep(lib/ad/pipeline.js)과 **같은 모양**이되 films 는 건드리지 않는다.
//   사진 읽기(describePhoto)는 여기서 하지 않는다 — 이 경로는 사장님 사진을 그림 만들기에서
//   **참조 바이트로** 직접 넘기므로(lib/film/pipeline.js), 글자를 받아쓰는 우회가 필요 없다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });

  const tries = Number(project.scenario?.tries) || 0;
  // 무료지만 무제한은 아니다 — 광고와 같은 상한을 쓴다(값은 lib/pricing.js 하나).
  if (tries >= MAX_SCENARIO_TRIES) {
    return Response.json({ error: "시나리오를 너무 많이 다시 썼어요" }, { status: 400 });
  }

  // 사장님이 고친 컷 — 화면이 보낸 목록을 그대로 믿지 않고 저장된 시나리오와 대조해
  // **서버가** 고른다(lib/ad/scenario.js 의 pickEditedShots).
  const body = await req.json().catch(() => null);
  const edits = pickEditedShots(project.scenario?.shots, body?.shots);

  let scenario;
  try {
    scenario = await generateScenario({ project, edits });
  } catch (e) {
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: 500 });
  }

  await updateProject(id, user.id, (p) => ({
    ...p,
    scenario: { ...scenario, tries: (Number(p.scenario?.tries) || 0) + 1 },
    status: "scenario",
  }));
  return Response.json(await getProject(id, user.id));
});
