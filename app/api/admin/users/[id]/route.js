import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../lib/store/index.js";

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
export const PATCH = withUser(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, role } = body || {};

  if (status === undefined && role === undefined) {
    return Response.json({ error: "status 나 role 중 하나는 있어야 해요" }, { status: 400 });
  }
  if (status !== undefined && !ALLOWED_STATUS.has(status)) {
    return Response.json({ error: "status 는 approved·blocked·pending 중 하나예요" }, { status: 400 });
  }
  if (role !== undefined && !ALLOWED_ROLE.has(role)) {
    return Response.json({ error: "role 은 user·admin 중 하나예요" }, { status: 400 });
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
  });

  // ★ 세션을 따로 끊지 않는다 — middleware.js 가 매 요청 getUser() 로 Auth 서버에서
  // fresh app_metadata 를 받으므로 차단은 다음 요청에 이미 걸린다. (auth-js 의
  // admin.signOut(jwt) 은 첫 인자가 user id 가 아니라 access token 이라 uuid 를 넘기면
  // 401 을 반환한다 — 그런데 던지지 않고 {data:null, error} 로 돌려주기 때문에 예전
  // 코드의 .catch()는 절대 안 걸렸고 실패조차 로그에 안 남았다. 애초에 불필요한 호출이었다.)
  return Response.json({ ok: true });
}, { adminOnly: true });
