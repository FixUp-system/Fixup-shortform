// ②시나리오 — 만들고(POST), 사장님이 고치고(PATCH), 확정한다(PATCH confirmed).
//
// ★ 확정만 규칙을 강제한다. 고치는 도중에는 어긋나 있는 것이 정상이라 PATCH 는 저장하고
//   problems 만 함께 돌려준다 — 막으면 사장님이 한 번에 다 맞춰야 저장이 된다.
import { getProject, updateProject } from "../../../../../lib/projects";
import { generateScenario, validateScenario } from "../../../../../lib/scenario.js";
import { checkScenario } from "../../../../../lib/scenario-rules.js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { BudgetExceeded } from "../../../../../lib/costs.js";

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

  // ★ 예산 오류는 삼키지 않는다 — withUser 까지 올라가야 402 가 된다(브리핑 라우트와 같은
  //   처방). 그 밖의 실패(LLM 장애·네트워크)는 502 로 사장님 말로 답한다. 안 잡으면
  //   프레임워크가 한국어 안내 없이 500 을 낸다.
  let generated;
  try {
    generated = await generateScenario(project);
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    console.error("시나리오 생성 실패:", e);
    return Response.json({ error: "시나리오를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
  }
  const { scenario, problems, photos } = generated;
  if (!scenario) {
    return Response.json({ error: "시나리오를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
  }

  // ★ 읽은 사진값을 남긴다(2026-08-18) — 안 남기면 다시 만들 때마다 같은 사진을 또 읽어
  //   사진당 값이 또 든다. photos 는 읽은 것이 하나라도 있을 때만 온다(lib/scenario.js).
  await updateProject(id, user.id, (proj) => ({
    ...proj,
    scenario: { ...scenario, confirmed: false },
    ...(photos ? { material: { ...proj.material, photos } } : {}),
  }));
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
  // ★ 길이를 안 고른 프로젝트는 확정할 수 없다. checkScenario 는 목표가 없으면 합·개수를
  //   아예 안 재고 ok:true 를 준다(tests/scenario-rules.test.js 가 그 동작을 못 박아 뒀다) —
  //   즉 **ok:true 가 "확정해도 안전"과 같지 않다.** 여기가 그 차이를 메우는 자리이고,
  //   ③목소리부터 돈이 나가므로 이 문이 마지막 무료 관문이다.
  if (confirming && !Number(project?.settings?.target_seconds)) {
    return Response.json({ error: "영상 길이를 먼저 골라 주세요" }, { status: 400 });
  }
  if (confirming && !ok) {
    return Response.json({ error: problems.join(" "), problems }, { status: 400 });
  }

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    scenario: { ...scenario, confirmed: confirming },
  }));
  return Response.json({ scenario, problems });
});
