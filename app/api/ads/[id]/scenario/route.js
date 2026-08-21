import { withUser } from "../../../../../lib/auth/require-user.js";
import { runScenarioStep } from "../../../../../lib/ad/pipeline.js";
import { getProject } from "../../../../../lib/projects.js";
import { loadAd } from "../route.js";

// 동기다 — LLM 만 쓰고 몇 초면 끝난다. fire-and-forget 으로 만들 이유가 없다.
// (유료 생성만 fire-and-forget 이다.)
// ★ 선택 body `{ shots, globals }` — 사장님이 컷이나 **영상 전체 값**(인물·무대·옷차림…)을
// 고쳐 [고친 대로 다시 쓰기]를 누른 경우다.
// [다시 쓰기]는 지금처럼 body 없이 부른다. 둘은 **같은 동작**(전체 재생성)이고 입력만
// 다르므로 라우트를 가르지 않는다 — 가르면 재시도 상한·상태 전이·오류 처리가 두 벌이 된다.
// 무엇이 실제로 고쳐졌는지는 여기서 안 따진다. 저장된 시나리오와 대조하는 판정은
// runScenarioStep 안(lib/ad/scenario.js 의 pickEditedShots)에 한 벌만 둔다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이에요" }, { status: 400 });
  }
  // body 가 없거나 깨져도 죽지 않는다 — [다시 쓰기]가 body 없이 부르는 같은 문이다.
  const body = await req.json().catch(() => null);
  try {
    await runScenarioStep(id, user.id, { edits: body?.shots, globals: body?.globals });
  } catch (e) {
    // 상한 초과는 사장님이 할 일이 있는 실패라 400, 나머지는 500
    const over = /너무 많이/.test(e?.message || "");
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: over ? 400 : 500 });
  }
  return Response.json(await getProject(id, user.id));
});
