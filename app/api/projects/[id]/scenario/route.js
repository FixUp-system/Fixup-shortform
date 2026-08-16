// ②시나리오 — 만들고(POST), 사장님이 고치고(PATCH), 확정한다(PATCH confirmed).
//
// ★ 확정만 규칙을 강제한다. 고치는 도중에는 어긋나 있는 것이 정상이라 PATCH 는 저장하고
//   problems 만 함께 돌려준다 — 막으면 사장님이 한 번에 다 맞춰야 저장이 된다.
import { getProject, updateProject } from "../../../../../lib/projects";
import { generateScenario, validateScenario } from "../../../../../lib/scenario.js";
import { checkScenario } from "../../../../../lib/scenario-rules.js";
import { withUser } from "../../../../../lib/auth/require-user.js";

// 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — 없는 것과 같이 404 다.
async function load(id, userId) {
  const project = await getProject(id, userId);
  return !project || project.kind === "ad" ? null : project;
}

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await load(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "만들고 싶은 영상을 먼저 적어 주세요" }, { status: 400 });
  }

  const { scenario, problems } = await generateScenario(project);
  if (!scenario) {
    return Response.json({ error: "시나리오를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
  }

  await updateProject(id, user.id, (proj) => ({ ...proj, scenario: { ...scenario, confirmed: false } }));
  return Response.json({ scenario, problems });
});

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await load(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const scenario = validateScenario(body?.scenario);
  if (!scenario) return Response.json({ error: "시나리오 모양이 아니에요" }, { status: 400 });

  const { ok, problems } = checkScenario(scenario, project);
  const confirming = body?.confirmed === true;
  if (confirming && !ok) {
    return Response.json({ error: problems.join(" "), problems }, { status: 400 });
  }

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    scenario: { ...scenario, confirmed: confirming },
  }));
  return Response.json({ scenario, problems });
});
