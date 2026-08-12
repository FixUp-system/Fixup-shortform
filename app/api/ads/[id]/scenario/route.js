import { withUser } from "../../../../../lib/auth/require-user.js";
import { runScenarioStep } from "../../../../../lib/ad/pipeline.js";
import { getProject } from "../../../../../lib/projects.js";
import { loadAd } from "../route.js";

// 동기다 — LLM 만 쓰고 몇 초면 끝난다. fire-and-forget 으로 만들 이유가 없다.
// (유료 생성만 fire-and-forget 이다.)
export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이에요" }, { status: 400 });
  }
  try {
    await runScenarioStep(id, user.id);
  } catch (e) {
    // 상한 초과는 사장님이 할 일이 있는 실패라 400, 나머지는 500
    const over = /너무 많이/.test(e?.message || "");
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: over ? 400 : 500 });
  }
  return Response.json(await getProject(id, user.id));
});
