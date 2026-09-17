// POST /api/admin/users/[id]/restore — 삭제한 계정을 되살린다(2026-09-17).
//
// 삭제가 **기록 보존형**이라 가능한 일이다(DELETE /api/admin/users/[id] 머리말) — 계정·크레딧
// 내역·영상이 그대로 남아 있으므로 문만 다시 열면 된다:
//   ① 로그인 금지를 푼다(ban_duration: "none")
//   ② 게이트·원장을 `approved` 로 — 지운 사람은 이미 승인됐던 사람이다(승인 전 계정은
//      승인 대기로 돌려보내도 되지만, 운영자가 일부러 되살리는 자리라 한 번에 연다)
// ★ 쓰는 순서는 PATCH·DELETE 와 같다 — **게이트 먼저**, 성공했을 때만 원장.
// ★ 가입 기본 지급은 **다시 안 준다** — 그 계정은 이미 받았거나(사유로 판정하는 멱등) 받을
//   이유가 없다. 되살리기가 크레딧을 찍어 내는 문이 되면 안 된다.
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../../lib/store/index.js";

export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const store = getStore();
  const current = (await store.findProfiles([id])).get(id);
  if (!current) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }
  if (current.status !== "deleted") {
    return Response.json({ error: "삭제된 계정이 아니에요" }, { status: 409 });
  }

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "none",
    app_metadata: { status: "approved", role: current.role },
  });
  if (error) {
    console.error("계정 복구 실패:", error.message);
    return Response.json({ error: "계정을 복구하지 못했어요" }, { status: 502 });
  }
  await store.updateProfile(id, { status: "approved", approved_at: new Date().toISOString() });

  console.log(`[계정 복구] ${user.id} → ${id}`);
  return Response.json({ ok: true });
}, { adminOnly: true });
