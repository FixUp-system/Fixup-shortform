import { withUser } from "../../../../../../lib/auth/require-user.js";
import { undoScenario } from "../../../../../../lib/ad/pipeline.js";
import { getProject } from "../../../../../../lib/projects.js";
import { loadAd } from "../../route.js";

// 되돌리기 — 직전 시나리오로 돌아간다.
//
// 형제 라우트(../route.js)와 라우트를 가른 이유: 저쪽은 LLM 을 부르고 회차를 먹는다.
// 이쪽은 문서 안의 prev 를 되꺼낼 뿐이라 부르는 것도 세는 것도 없다. 같은 문에 body
// 분기로 얹으면 "무료지만 회차를 먹는 문"과 "아무것도 안 먹는 문"이 한 이름이 된다.
export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  // 굽는 중에는 못 되돌린다 — 그 시나리오로 이미 값이 나갔다(형제 라우트와 같은 규칙).
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이에요" }, { status: 400 });
  }
  try {
    await undoScenario(id, user.id);
  } catch (e) {
    // 되돌릴 것이 없는 것은 사장님이 할 일이 있는 실패라 400
    const empty = /되돌릴 것이 없어요/.test(e?.message || "");
    return Response.json({ error: e?.message || "되돌리지 못했어요" }, { status: empty ? 400 : 500 });
  }
  return Response.json(await getProject(id, user.id));
});
