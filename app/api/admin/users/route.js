// GET /api/admin/users — 승인 대기·전체 사용자 목록 (운영자 전용)
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";

export const GET = withUser(async () => {
  const store = getStore();
  const users = await store.listProfiles();
  // 잔액은 두 장부의 차다(충전 − 청구). 행마다 왕복하지 않으려고 충전은 한 번에 받고,
  // 청구는 사용자별로 물어본다(청구 쪽에는 묶음 조회가 아직 없다).
  const grants = await store.listGrantsFor(users.map((u) => u.id));
  const withCredits = await Promise.all(
    users.map(async (u) => ({
      ...u,
      balance: (grants.get(u.id) || 0) - (await store.sumCharges(u.id)),
    }))
  );
  return Response.json({ users: withCredits });
}, { adminOnly: true });
