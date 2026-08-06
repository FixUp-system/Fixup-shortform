import { regenCut } from "../../../../../../../lib/pipeline";
import { getProject } from "../../../../../../../lib/projects";
import { withUser } from "../../../../../../../lib/auth/require-user.js";
import { assertCanAfford, chargeRegen, refundRegen, NoCredits } from "../../../../../../../lib/charges.js";
import { regenPrice, MAX_REGEN_PER_CUT } from "../../../../../../../lib/pricing.js";
import { fakeFal } from "../../../../../../../lib/fake";

export const POST = withUser(async (req, { params }, user) => {
  const { id, idx } = await params;
  const { instruction } = await req.json().catch(() => ({}));

  // 컷당 첫 재생성은 공짜, 둘째부터 정가. 회차는 그 컷이 이미 쓴 횟수다.
  //
  // ★ 회차는 **프로젝트 문서**(regen_count)가 센다 — 청구 장부로 세면 첫 회가 공짜라
  // 행을 안 남기고, 그러면 회차가 영원히 0 이라 계속 공짜가 된다.
  // ★ try 바깥이다. 안에 넣으면 NoCredits 가 아래 catch 에 잡혀 400 으로 나가고,
  // 화면은 "크레딧 부족"과 "만들지 못했어요"를 구분할 수 없다.
  // 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다(assertBudget 과 같은 규칙).
  let charged = null;
  if (!fakeFal()) {
    const project = await getProject(id, user.id);
    const cut = (project?.cuts || []).find((c) => c.idx === Number(idx));
    const prior = Number(cut?.regen_count) || 0;

    // ★ 상한 판정이 **청구보다 앞**이다. 뒤에 두면 4회째에 값을 받고 나서 regenCut 이
    // 같은 상한으로 던져 400 이 된다 — 내고 아무것도 못 받는 응답이다.
    if (prior >= MAX_REGEN_PER_CUT) {
      return Response.json({ error: "재생성은 컷당 3회까지예요" }, { status: 400 });
    }

    const price = regenPrice("image", prior);
    if (price > 0) {
      try {
        await assertCanAfford(user.id, price);
      } catch (e) {
        if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
        throw e;
      }
      await chargeRegen({
        userId: user.id, projectId: id, kind: "image", idx: Number(idx), priorCount: prior,
      });
      charged = prior;   // 실패하면 이 회차를 되돌린다
    }
  }

  try {
    const cut = await regenCut(id, user.id, Number(idx), undefined, instruction);
    return Response.json({ cut });
  } catch (e) {
    // 못 준 것은 받지 않는다 — 자동 관통의 환불과 같은 정책.
    // 카운터는 시도 **전**에 오르므로, 되돌리지 않으면 재시도가 다음 회차 값을 또 낸다.
    if (charged !== null) {
      await refundRegen({ projectId: id, kind: "image", idx: Number(idx), priorCount: charged })
        .catch((err) => console.error("재생성 환불 실패:", err?.message));
    }
    return Response.json({ error: e.message }, { status: 400 });
  }
});
