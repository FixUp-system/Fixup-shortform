import { regenCut } from "../../../../../../../lib/pipeline";
import { withUser } from "../../../../../../../lib/auth/require-user.js";
import { assertCanStart, NoCredits } from "../../../../../../../lib/credits";
import { fakeFal } from "../../../../../../../lib/fake";

export const POST = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;
  const { instruction } = await req.json().catch(() => ({}));

  // 시작 게이트 — 잔액이 사실상 0 이면 시작하지 않는다.
  // ★ try 바깥이다. 안에 넣으면 NoCredits 가 아래 catch 에 잡혀 400 으로 나가고,
  // 화면은 "크레딧 부족"과 "만들지 못했어요"를 구분할 수 없다.
  // 가짜 모드는 건너뛴다 — 0원이라 잴 것이 없다(assertBudget 과 같은 규칙).
  if (!fakeFal()) {
    try {
      await assertCanStart(user.id, { need: 0.01 });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  try {
    const cut = await regenCut(id, user.id, Number(idx), undefined, instruction);
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
});
