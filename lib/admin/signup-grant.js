// 가입 기본 지급 — **처음 승인될 때 한 번**만 들어간다.
//
// 왜 가입 시점이 아니라 승인 시점인가: 승인 전에는 어차피 아무것도 못 쓰므로 사장님 입장에서는
// "가입하니 크레딧이 있다"와 똑같이 보이고, 공개 주소로 무작위 가입이 들어와도 장부에
// 지급 행이 안 쌓인다. 그리고 지급이 **사람이 누른 결과**로 남는다(granted_by).
//
// ★ credit_grants 에는 멱등키가 없다. approved→pending→approved 토글 한 번에 또 들어가므로,
// 지급 전에 같은 사유의 행이 이미 있는지 본다. 사유 문구가 곧 그 열쇠다.
//
// ★★ 2026-09-17 — 부르는 자리가 **둘**이 됐다(승인 PATCH · 운영자가 계정을 직접 추가하는 POST).
//   라우트 안에 두면 두 벌이 되어 한쪽만 고쳐진다. 그래서 여기로 뺐다.
import { SIGNUP_GRANT, SIGNUP_GRANT_REASON } from "../pricing.js";

export async function grantSignupCreditsOnce(store, userId, grantedBy) {
  const grants = await store.listGrants(userId);
  if (grants.some((g) => g.reason === SIGNUP_GRANT_REASON)) return;
  await store.insertGrant({
    user_id: userId,
    amount_credits: SIGNUP_GRANT,
    reason: SIGNUP_GRANT_REASON,
    granted_by: grantedBy,
  });
}
