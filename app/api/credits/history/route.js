// GET /api/credits/history — 내 크레딧이 어디로 갔는지.
//
// 잔액 숫자 하나만 보여 주던 동안, 크레딧이 줄어든 사장님은 이유를 알 길이 없었다.
// 장부에는 다 남아 있었는데(credit_grants·credit_charges) 부르는 화면이 없었다.
//
// ★ 두 장부를 하나로 합쳐 시간순으로 준다. 사장님에게는 "충전"과 "사용"이 한 줄기다.
// ★ 부호는 **잔액의 변화**로 뒤집어 준다(lib/ledger.js) — 청구 50 은 −50 이다.
//   그 규칙을 화면이 다시 적으면 언젠가 한쪽이 뒤집힌다.
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
import { creditStateFor } from "../../../../lib/charges.js";
import { ledgerDelta } from "../../../../lib/ledger.js";

export const GET = withUser(async (_req, _ctx, user) => {
  const store = getStore();
  const [grants, charges, state] = await Promise.all([
    store.listGrants(user.id),
    store.listCharges(user.id),
    creditStateFor(user.id),
  ]);

  const rows = [
    ...grants.map((g) => ({
      source: "grant",
      // 충전은 종류가 하나다 — 사유(reason)는 운영자가 적은 말이라 그대로 흘리지 않는다.
      kind: "grant",
      credits: Number(g.amount_credits) || 0,
      ts: new Date(g.created_at).getTime(),
      project_id: null,
    })),
    ...charges.map((c) => ({
      source: "charge",
      kind: c.kind,
      credits: Number(c.credits) || 0,
      ts: new Date(c.created_at).getTime(),
      project_id: c.project_id || null,
    })),
  ].sort((a, b) => b.ts - a.ts);   // 최근이 위

  // 어느 영상에 썼는지. 지운 영상은 제목이 없다 — 장부는 남고 프로젝트만 사라지기 때문이다
  // (지우면 환불이 되면 "만들고 지워서 되돌려받는" 길이 열린다 — DELETE 라우트 주석 참고).
  const titles = await store.findProjectTitles(
    [...new Set(rows.map((r) => r.project_id).filter(Boolean))],
    user.id
  );

  return Response.json({
    balance: state.balance,
    rows: rows.map((r) => ({
      ts: r.ts,
      kind: r.kind,
      delta: ledgerDelta(r),
      project_id: r.project_id,
      project_title: r.project_id ? titles.get(r.project_id) || null : null,
    })),
  });
});
