import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../lib/store/index.js";
import { SIGNUP_GRANT, SIGNUP_GRANT_REASON } from "../../../../../lib/pricing.js";
import { isTier, TIERS } from "../../../../../lib/tiers.js";
import { blocksSelfRoleChange } from "../../../../../lib/admin/self-guard.js";

// 가입 기본 지급 — **처음 승인될 때 한 번**만 들어간다.
//
// 왜 가입 시점이 아니라 여기인가: 승인 전에는 어차피 아무것도 못 쓰므로 사장님 입장에서는
// "가입하니 크레딧이 있다"와 똑같이 보이고, 공개 주소로 무작위 가입이 들어와도 장부에
// 지급 행이 안 쌓인다. 그리고 지급이 **사람이 누른 결과**로 남는다(granted_by).
//
// ★ credit_grants 에는 멱등키가 없다. approved→pending→approved 토글 한 번에 500 이
// 또 들어가므로, 지급 전에 같은 사유의 행이 이미 있는지 본다. 사유 문구가 곧 그 열쇠다.
async function grantSignupCreditsOnce(store, userId, grantedBy) {
  const grants = await store.listGrants(userId);
  if (grants.some((g) => g.reason === SIGNUP_GRANT_REASON)) return;
  await store.insertGrant({
    user_id: userId,
    amount_credits: SIGNUP_GRANT,
    reason: SIGNUP_GRANT_REASON,
    granted_by: grantedBy,
  });
}

const ALLOWED_STATUS = new Set(["approved", "blocked", "pending"]);
const ALLOWED_ROLE = new Set(["user", "admin"]);

// 승인은 두 곳에 쓴다 — app_metadata(게이트, middleware 가 매 요청 읽는다)와
// profiles(원장, 이 화면이 본다). ★ 순서가 중요하다 — 게이트를 먼저 쓰고 성공했을 때만
// 원장을 쓴다. 반대로 하면(원장 먼저) 게이트 쓰기가 실패했을 때 "원장=approved인데
// 게이트=pending"인 상태가 남는다. 화면은 502 오류를 err state로만 보여주는데 새로고침
// 한 번이면 사라지고, 그 뒤 /admin은 그 줄을 그냥 "승인됨"으로 보여준다 — 운영자는
// 승인했다고 믿고 사용자는 영원히 못 들어온다. 쓰는 순서를 뒤집으면 실패 시 화면이
// pending 그대로 남아 사실과 일치한다.
//
// role 도 status 와 같은 이중 쓰기가 필요하다 — middleware.js:83 이 app_metadata.role 을
// 읽는데, profiles.role 만 바꾸면 화면(관리자 판정)과 게이트가 서로 다른 role 을 본다.
// 그래서 role 을 안 바꾸는 요청(승인·차단)에도 **현재 role 을 함께 실어** metadata 가
// profiles 와 항상 같은 값을 보게 한다.
export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, role, tier } = body || {};

  if (status === undefined && role === undefined && tier === undefined) {
    return Response.json({ error: "status·role·tier 중 하나는 있어야 해요" }, { status: 400 });
  }
  if (status !== undefined && !ALLOWED_STATUS.has(status)) {
    return Response.json({ error: "status 는 approved·blocked·pending 중 하나예요" }, { status: 400 });
  }
  if (role !== undefined && !ALLOWED_ROLE.has(role)) {
    return Response.json({ error: "role 은 user·admin 중 하나예요" }, { status: 400 });
  }
  // ★★★ 자기 역할은 못 바꾼다 — 마지막 운영자가 자기를 내리면 **아무도 못 들어온다**
  //   (되돌릴 문이 앱 안에 없고 DB 를 직접 고쳐야 한다). 판정은 순수 함수 한 벌이다.
  //   ★ 승인·차단·등급에는 이 성질이 없다 — 자기를 차단해도 다른 운영자가 푼다.
  if (role !== undefined && blocksSelfRoleChange(user.id, id)) {
    return Response.json(
      { error: "자기 역할은 바꿀 수 없어요 — 다른 운영자에게 부탁해 주세요" }, { status: 400 }
    );
  }
  // ★ 판정은 lib/tiers.js 하나다 — 여기에 등급 이름을 손으로 적으면 표와 갈린다.
  //   조용히 받으면 아무 문자열이나 컬럼에 들어가고, 그 계정은 tierOf 가 basic 으로
  //   떨어뜨려 "올려 줬는데 안 열린다"가 된다.
  if (tier !== undefined && !isTier(tier)) {
    return Response.json({ error: `tier 는 ${TIERS.map((t) => t.id).join("·")} 중 하나예요` }, { status: 400 });
  }

  const store = getStore();
  const current = (await store.findProfiles([id])).get(id);
  if (!current) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }

  const nextStatus = status ?? current.status;
  const nextRole = role ?? current.role;

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { status: nextStatus, role: nextRole },
  });
  if (error) {
    console.error("app_metadata 갱신 실패:", error.message);
    return Response.json({ error: "승인 상태를 반영하지 못했어요" }, { status: 502 });
  }

  await store.updateProfile(id, {
    ...(status !== undefined ? {
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    } : {}),
    ...(role !== undefined ? { role } : {}),
    // ★★ 등급은 **원장에만** 쓴다. app_metadata 는 middleware 가 매 요청 읽는 게이트
    //   캐시이고(status·role), 등급은 게이트가 아니라 라우트가 필요할 때 읽는 값이다 —
    //   display_name 이 같은 판단으로 그 자리에 있다(db/schema.sql 의 그 주석).
    //   거기 두면 이중 쓰기를 지켜야 하는 자리가 하나 더 늘고, 갈리면 "화면은 pro 인데
    //   서버는 basic"이 된다.
    ...(tier !== undefined ? { tier } : {}),
  });

  // ★ 게이트·원장이 둘 다 성공한 **뒤에** 준다. 앞에 두면 게이트 실패로 502 를 돌려주면서
  // 크레딧만 나간다. 그리고 지급이 실패해도 **승인을 되돌리지 않는다** — 승인은 이미
  // 이중 쓰기라 되돌리면 중간 상태가 더 나빠진다. 운영자가 /admin 에서 손으로 넣으면 되고,
  // 그 사실이 로그에 남아야 한다.
  if (status === "approved") {
    await grantSignupCreditsOnce(store, id, user.id).catch((e) => {
      console.error(`가입 기본 지급 실패 — user=${id}:`, e?.message || e);
    });
  }

  // ★ 세션을 따로 끊지 않는다 — middleware.js 가 매 요청 getUser() 로 Auth 서버에서
  // fresh app_metadata 를 받으므로 차단은 다음 요청에 이미 걸린다. (auth-js 의
  // admin.signOut(jwt) 은 첫 인자가 user id 가 아니라 access token 이라 uuid 를 넘기면
  // 401 을 반환한다 — 그런데 던지지 않고 {data:null, error} 로 돌려주기 때문에 예전
  // 코드의 .catch()는 절대 안 걸렸고 실패조차 로그에 안 남았다. 애초에 불필요한 호출이었다.)
  return Response.json({ ok: true });
}, { adminOnly: true });
