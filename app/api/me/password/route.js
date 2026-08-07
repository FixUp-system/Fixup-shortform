// POST /api/me/password — 로그인한 본인이 비밀번호를 바꾼다.
//
// 운영자 재설정(/api/admin/users/[id]/password)과 다른 문이다. 그쪽은 비밀번호를 **잊은**
// 사람을 위해 운영자가 대신 바꿔 준다. 이 문은 비밀번호를 **아는** 사람이 스스로 바꾼다.
// (비밀번호 찾기는 여전히 없다 — 메일 왕복이 필요해 매직링크를 걷어낸 이유로 되돌아간다.)
//
// ★ Supabase 의 updateUser({password}) 는 현재 비밀번호를 **묻지 않는다** — 세션만 살아
// 있으면 바뀐다. 그대로 열면 이용자가 자리를 비운 사이 남이 비밀번호를 바꿔 계정을 통째로
// 가져간다. 그래서 여기서 현재 비밀번호를 다시 묻는다.
//
// ★ 재검증이 지금 세션을 흔들면 안 된다. 쿠키에 붙은 클라이언트(lib/auth 의 authClient)로
// signInWithPassword 를 부르면 세션 쿠키를 덮어쓴다 — 확인만 하려던 것이
// 로그인 상태를 건드린다. persistSession:false 로 만든 **별도 클라이언트**로 확인하고
// 결과는 버린다. (매직링크 시절 middleware 가 공개 경로에서 쿠키를 건드려 PKCE verifier 를
// 지웠던 사고와 같은 계열이다 — 인증 쿠키는 의도한 자리에서만 만진다.)
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";

const MIN_LENGTH = 6;   // 운영자 재설정 라우트와 같은 값

// supabase-js 는 네트워크 실패·5xx 를 던지지 않고 error 로 준다(status 0 또는 5xx).
// 그것까지 "비밀번호가 틀렸다"로 답하면 이용자는 고칠 것도 없는데 자기 입력을 의심한다.
function isInfra(error) {
  const s = error?.status;
  return typeof s === "number" && (s === 0 || s >= 500);
}

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";

  if (!current) {
    return Response.json({ error: "현재 비밀번호를 넣어 주세요" }, { status: 400 });
  }
  if (next.length < MIN_LENGTH) {
    return Response.json({ error: `새 비밀번호는 ${MIN_LENGTH}자 이상이어야 해요` }, { status: 400 });
  }

  const profile = (await getStore().findProfiles([user.id])).get(user.id);
  if (!profile) {
    console.error("프로필 행이 없다:", user.id);
    return Response.json({ error: "프로필을 찾을 수 없어요" }, { status: 404 });
  }

  // ① 현재 비밀번호 재검증 — 쿠키를 건드리지 않는 별도 클라이언트. 결과는 버린다.
  const checker = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await checker.auth.signInWithPassword({
    email: profile.email,
    password: current,
  });
  if (wrong) {
    if (isInfra(wrong)) {
      console.error("인증 서버 오류:", wrong.status, wrong.message);
      return Response.json(
        { error: "인증 서버에 연결하지 못했어요 — 잠시 후 다시 시도해 주세요" },
        { status: 500 }
      );
    }
    // ★ 로그인 라우트의 "한 문구" 계약은 여기 적용되지 않는다 — 이미 로그인한 본인의
    // 계정이라 숨길 대상이 없고, 숨기면 무엇을 고쳐야 할지 알 수 없다.
    console.error("현재 비밀번호 확인 실패:", wrong.message);
    return Response.json({ error: "현재 비밀번호가 맞지 않아요" }, { status: 401 });
  }

  // ② 변경 — service_role.
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) {
    console.error("비밀번호 변경 실패:", error.message);
    return Response.json({ error: "비밀번호를 바꾸지 못했어요" }, { status: 502 });
  }

  // 감사 — 누가 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 변경] ${user.id} 본인`);
  return Response.json({ ok: true });
});
