import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../lib/store/index.js";
import { grantSignupCreditsOnce } from "../../../../../lib/admin/signup-grant.js";
import { isTier, TIERS } from "../../../../../lib/tiers.js";
import { blocksSelfRoleChange } from "../../../../../lib/admin/self-guard.js";

// 가입 기본 지급은 lib/admin/signup-grant.js 한 벌이다(계정 추가 POST 도 같은 것을 부른다).

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
  const { status, role, tier, internal } = body || {};

  if (status === undefined && role === undefined && tier === undefined && internal === undefined) {
    return Response.json({ error: "status·role·tier·internal 중 하나는 있어야 해요" }, { status: 400 });
  }
  // ★ 내부 계정(크레딧 차감 면제, 2026-09-14) — **참/거짓만** 받는다. "false" 문자열이나 1 을
  //   받아 두면 DB·코드가 참으로 읽어 손님 계정이 무료로 샐 수 있다.
  if (internal !== undefined && typeof internal !== "boolean") {
    return Response.json({ error: "internal 은 true·false 중 하나예요" }, { status: 400 });
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
  // ★★ 삭제된 계정은 여기서 못 건드린다(2026-09-17). 삭제는 로그인 금지(ban)까지 걸어 두는데,
  //   이 문으로 승인만 바꾸면 **원장은 승인·게이트도 승인인데 로그인은 막힌** 계정이 생긴다 —
  //   운영자는 살렸다고 믿고 사용자는 영영 못 들어온다. 살리는 문은 복구 하나다.
  if (current.status === "deleted") {
    return Response.json({ error: "삭제된 계정이에요 — 먼저 복구해 주세요" }, { status: 409 });
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
    // ★ 내부 계정도 등급과 같은 이유로 **원장에만** 쓴다 — 게이트가 아니라 청구가 읽는 값이다.
    ...(internal !== undefined ? { internal } : {}),
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

// ★★★ DELETE /api/admin/users/[id] — **기록 보존형 삭제**(2026-09-17 사장님 결정).
//
// 계정을 Supabase 에서 진짜로 지우면 두 가지가 조용히 벌어진다(db/schema.sql 실측):
//   · credit_grants·credit_charges 가 `on delete cascade` 라 **충전·사용 내역이 함께 사라진다**
//     — 정산 기록이 날아간다.
//   · projects.owner_id 에는 FK 가 없어 영상은 **주인 없이 남는다**.
// 그래서 지우지 않고 **문을 닫는다**:
//   ① 로그인 금지(ban) — 새 로그인·토큰 갱신이 막힌다
//   ② 게이트(app_metadata.status)와 원장(profiles.status)을 `deleted` 로 — 목록에서 숨는다
//   계정·크레딧 내역·영상은 **그대로 남고**, 복구(POST …/restore)로 되돌릴 수 있다.
//
// ★ 막는 것 둘:
//   · 자기 계정 — 지우는 순간 이 화면에서 쫓겨나고 되돌릴 사람이 없을 수 있다
//   · 운영자 계정 — 먼저 역할을 사용자로 내린 뒤 지운다(운영자를 실수로 지우는 한 번을 더 거른다)
// ★ 쓰는 순서는 PATCH 와 같다 — **게이트 먼저**, 성공했을 때만 원장.
// 약 100년 — Supabase 의 ban_duration 은 "영구"를 따로 주지 않는다.
const BAN_FOREVER = "876000h";

export const DELETE = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  if (blocksSelfRoleChange(user.id, id)) {
    return Response.json({ error: "자기 계정은 삭제할 수 없어요" }, { status: 400 });
  }
  const store = getStore();
  const current = (await store.findProfiles([id])).get(id);
  if (!current) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }
  if (current.role === "admin") {
    return Response.json(
      { error: "운영자 계정은 삭제할 수 없어요 — 먼저 역할을 사용자로 바꿔 주세요" }, { status: 400 }
    );
  }
  // 이미 지운 계정 — 같은 결과를 또 만들 뿐이라 성공으로 답한다(두 번 누른 것).
  if (current.status === "deleted") return Response.json({ ok: true });

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: BAN_FOREVER,
    app_metadata: { status: "deleted", role: current.role },
  });
  if (error) {
    console.error("계정 삭제(로그인 금지) 실패:", error.message);
    return Response.json({ error: "계정을 삭제하지 못했어요" }, { status: 502 });
  }
  await store.updateProfile(id, { status: "deleted", approved_at: null });

  // 감사 — 누가 누구를 언제 지웠는지.
  console.log(`[계정 삭제] ${user.id} → ${id}`);
  return Response.json({ ok: true });
}, { adminOnly: true });
