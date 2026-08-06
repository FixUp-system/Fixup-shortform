// POST /api/admin/users/[id]/password — 운영자가 비밀번호를 재설정한다.
//
// 자가 재설정 화면을 만들지 않은 이유: 그것은 결국 메일 왕복이라, 매직링크를 걷어낸
// 이유를 뒷문으로 되돌린다. 커스텀 SMTP 가 붙는 날 열면 된다.
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../../lib/store/index.js";

const MIN_LENGTH = 6;   // Supabase 기본 최소 길이와 같은 값

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_LENGTH) {
    return Response.json({ error: `비밀번호는 ${MIN_LENGTH}자 이상이어야 해요` }, { status: 400 });
  }

  // 없는 사용자에게 조용히 성공을 주지 않는다 — 선례(승인 라우트)와 같은 방식.
  if (!(await getStore().findProfiles([id])).get(id)) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) {
    console.error("비밀번호 재설정 실패:", error.message);
    return Response.json({ error: "비밀번호를 바꾸지 못했어요" }, { status: 502 });
  }

  // 감사 — 누가 누구의 비밀번호를 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 재설정] ${user.id} → ${id}`);
  return Response.json({ ok: true });
}, { adminOnly: true });
