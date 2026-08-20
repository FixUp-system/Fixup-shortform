// GET /api/admin/users — 승인 대기·전체 사용자 목록 (운영자 전용)
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";
// 잔액을 보이는 값으로 만드는 규칙은 한 곳이다 — 사장님 화면과 같은 값이어야 한다
import { floorBalance } from "../../../../lib/charges.js";

export const GET = withUser(async () => {
  const store = getStore();
  const users = await store.listProfiles();
  const ids = users.map((u) => u.id);

  // 잔액은 두 장부의 차다(충전 − 청구). 둘 다 **묶음으로 한 번씩** 받는다.
  //
  // ★★ 그리고 **둘을 겹친다**(2026-08-20). 그전에는 충전을 기다린 뒤 청구를 시작해서
  //   왕복이 셋이었다 — 그런데 둘 다 위에서 얻은 id 목록만 있으면 되므로 기다릴 이유가
  //   없었다. 겹칠 수 있는 것을 줄 세우고 있었을 뿐이다.
  //   실측(2026-08-20, 한국·10명): 236ms → 85ms. 프로덕션은 함수가 미국 동부에서 도니
  //   왕복 하나가 더 비싸고, 줄어드는 절대량은 더 크다. 보관함이 왕복 하나짜리 단일
  //   쿼리라 더 빨랐던 것도 같은 이유다.
  // ★ 청구 묶음 조회(listChargesFor)는 이 자리를 위해 만들었다 — 그전에는 충전만 묶음이고
  //   청구는 사람마다 따로였다.
  const [grants, charges] = await Promise.all([
    store.listGrantsFor(ids),
    store.listChargesFor(ids),
  ]);

  // ★ 칸이 없는 사람은 0 이다 — 두 장부 모두 "없으면 안 담는다"가 규약이다.
  const withCredits = users.map((u) => ({
    ...u,
    balance: floorBalance((grants.get(u.id) || 0) - (charges.get(u.id) || 0)),
  }));
  return Response.json({ users: withCredits });
}, { adminOnly: true });
