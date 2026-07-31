import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../lib/store/index.js";

const ALLOWED = new Set(["approved", "blocked", "pending"]);

// 승인은 두 곳에 쓴다 — profiles(원장, 이 화면이 본다)와 app_metadata(캐시,
// middleware 가 매 요청 읽는다). 원장이 진실이고 metadata 는 캐시다.
// 한쪽만 쓰고 넘어가면 화면은 승인됐다고 보여주는데 middleware 는 영원히 pending 으로
// 본다 — 그래서 metadata 갱신이 실패하면 조용히 넘어가지 않고 오류를 알린다.
export const PATCH = withUser(async (req, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = body?.status;
  if (!ALLOWED.has(status)) {
    return Response.json({ error: "status 는 approved·blocked·pending 중 하나예요" }, { status: 400 });
  }

  await getStore().updateProfile(id, {
    status,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  });

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { status },
  });
  if (error) {
    console.error("app_metadata 갱신 실패:", error.message);
    return Response.json({ error: "승인 상태를 반영하지 못했어요" }, { status: 502 });
  }

  // ★ 차단은 지연되면 안 된다 — 이미 발급된 토큰이 살아 있으므로 세션을 끊는다.
  // 승인은 반대다(토큰 갱신 때 반영되며, 화면이 "다시 로그인하세요"를 안내한다).
  if (status === "blocked") {
    await admin.auth.admin.signOut(id).catch((e) => console.error("세션 무효화 실패:", e?.message));
  }

  return Response.json({ ok: true });
}, { adminOnly: true });
