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
// 네트워크 실패·5xx·429 는 "비밀번호가 틀렸다"가 아니다. 그것까지 401 로 답하면 사장님은
// 고칠 것도 없는데 자기 입력을 의심한다. 판정과 문구는 로그인·가입과 한 벌이다.
// ★ 이 라우트는 재검증마다 **진짜 로그인 시도**를 쏘므로 429 에 가장 쉽게 닿는 자리다.
import { isInfra, infraResponse } from "../../../../lib/auth/infra-error.js";

const MIN_LENGTH = 6;   // 운영자 재설정 라우트와 같은 값

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
  const { data: checked, error: wrong } = await checker.auth.signInWithPassword({
    email: profile.email,
    password: current,
  });
  if (wrong) {
    if (isInfra(wrong)) {
      console.error("인증 서버 오류:", wrong.status, wrong.message);
      return infraResponse(wrong);
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

  // ③ 살아 있는 세션을 전부 끊는다.
  //
  // ★ 여기까지는 **예방**이다 — 남이 비밀번호를 바꾸는 것은 막았지만, 자리를 비운 사이
  // 이미 들어와 있던 사람의 세션은 비밀번호를 바꿔도 그대로 살아 있다(updateUserById 는
  // refresh token 을 무효화하지 않는다). 그러면 **복구**가 안 된다 — 비밀번호를 바꾼
  // 이유가 바로 그 사람을 쫓아내는 것인데.
  //
  // ★ auth-js 의 admin.signOut(jwt, scope) 은 첫 인자가 user id 가 **아니라 access token**
  // 이다(uuid 를 넘기면 던지지 않고 {data:null, error} 로 조용히 401 을 돌려준다 —
  // app/api/admin/users/[id]/route.js 에 그 사고 기록이 있다). 그래서 ①에서 재검증하며
  // 받은 세션의 access_token 을 쓴다. 그리고 **오류를 반드시 판정한다** — 조용히 실패하면
  // "세션을 끊었다"고 믿는 거짓 안전이 된다.
  //
  // ★ scope 는 'global' 이다. 'others' 는 그 jwt 의 세션만 남기는데, 우리가 쥔 jwt 는
  // 지금 브라우저가 아니라 재검증용으로 잠깐 만든 세션이다 — 그걸 쓰면 침입자 대신
  // 버려질 세션만 살아남는다. 정반대다. 그래서 전부 끊고, **지금 브라우저도 함께 끊긴다**는
  // 사실을 응답의 signedOut 으로 화면에 알린다(다시 로그인하라고 안내할 수 있게).
  // 지금 세션만 살리려면 브라우저의 access token 이 필요한데, 그건 쿠키 클라이언트를
  // 건드려야 나온다 — ②의 이유(쿠키를 안 만진다)와 정면으로 부딪혀 택하지 않았다.
  let signedOut = false;
  const token = checked?.session?.access_token;
  if (!token) {
    console.error("세션을 끊지 못했다 — 재검증 응답에 access_token 이 없다:", user.id);
  } else {
    const { error: outErr } = await admin.auth.admin.signOut(token, "global");
    if (outErr) {
      console.error("세션 끊기 실패:", outErr.status, outErr.message);
    } else {
      signedOut = true;
    }
  }

  // 감사 — 누가 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 변경] ${user.id} 본인 · 세션 끊김=${signedOut}`);
  return Response.json({ ok: true, signedOut });
});
