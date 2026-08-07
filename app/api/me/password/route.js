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

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ② 살아 있는 세션을 전부 끊는다 — **비밀번호를 바꾸기 전에.**
  //
  // ★ 여기까지는 **예방**이다 — 남이 비밀번호를 바꾸는 것은 막았지만, 자리를 비운 사이
  // 이미 들어와 있던 사람의 세션이 살아 있으면 **복구**가 안 된다. 비밀번호를 바꾼
  // 이유가 바로 그 사람을 쫓아내는 것인데.
  //
  // ★ 순서가 이 자리의 전부다(2026-08-07 라이브 실측). 예전에는 바꾼 **뒤** 끊었는데,
  // updateUserById({password}) 가 ①에서 만든 재검증 세션까지 함께 무효화해서 그때 쥔
  // access_token 이 이미 죽어 있었다 — signOut 이 **매번** `400 Auth session missing!`
  // 으로 실패했고, 응답은 `signedOut:false` 로 나가 화면이 "다른 기기의 로그인을 끊지
  // 못했어요"라는 **거짓 경고**를 띄웠다(실제로는 끊겼다). 바꾸기 전에 부르면 토큰이
  // 살아 있어 성공한다.
  //
  // ★ auth-js 의 admin.signOut(jwt, scope) 은 첫 인자가 user id 가 **아니라 access token**
  // 이다(uuid 를 넘기면 던지지 않고 {data:null, error} 로 조용히 401 을 돌려준다 —
  // app/api/admin/users/[id]/route.js 에 그 사고 기록이 있다). 그래서 ①에서 재검증하며
  // 받은 세션의 access_token 을 쓴다.
  //
  // ★ scope 는 'global' 이다. 'others' 는 그 jwt 의 세션만 남기는데, 우리가 쥔 jwt 는
  // 지금 브라우저가 아니라 재검증용으로 잠깐 만든 세션이다 — 그걸 쓰면 침입자 대신
  // 버려질 세션만 살아남는다. 정반대다. 그래서 전부 끊고, **지금 브라우저도 함께 끊긴다**는
  // 사실을 응답의 signedOut 으로 화면에 알린다(다시 로그인하라고 안내할 수 있게).
  //
  // ★ 끊지 못하면 **비밀번호를 바꾸지 않고 멈춘다.** 여기서 그냥 지나가면 signedOut 이
  // 다시 추측이 되고, 거짓 경고가 그대로 돌아온다. 멈추면 아무것도 안 바뀐 상태라
  // 사장님은 그냥 다시 누르면 된다.
  const token = checked?.session?.access_token;
  if (!token) {
    console.error("세션을 끊지 못했다 — 재검증 응답에 access_token 이 없다:", user.id);
    return Response.json(
      { error: "비밀번호를 바꾸지 못했어요 — 잠시 후 다시 시도해 주세요", signedOut: false },
      { status: 502 }
    );
  }
  const { error: outErr } = await admin.auth.admin.signOut(token, "global");
  if (outErr) {
    console.error("세션 끊기 실패:", outErr.status, outErr.message);
    return Response.json(
      { error: "비밀번호를 바꾸지 못했어요 — 잠시 후 다시 시도해 주세요", signedOut: false },
      { status: 502 }
    );
  }

  // ③ 변경 — service_role.
  //
  // ★ 여기서 실패하면 **비밀번호는 그대로인데 모든 기기가 로그아웃된 상태**다. 안전한
  // 쪽(비밀번호가 안 새는 쪽)이지만 사장님에게는 당황스러우니, 문구가 그 상태를 그대로
  // 말한다 — "쓰던 비밀번호로 다시 로그인하세요". signedOut:true 를 함께 보내 화면이
  // 로그인 화면으로 안내할 수 있게 한다.
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) {
    console.error("비밀번호 변경 실패:", error.message);
    console.log(`[비밀번호 변경] ${user.id} 본인 · 변경 실패 · 세션 끊김=true`);
    return Response.json(
      {
        error: "비밀번호를 바꾸지 못했어요 — 안전을 위해 모든 기기에서 로그아웃했어요. 쓰던 비밀번호로 다시 로그인한 뒤 다시 시도해 주세요.",
        signedOut: true,
      },
      { status: 502 }
    );
  }

  // 감사 — 누가 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 변경] ${user.id} 본인 · 세션 끊김=true`);
  return Response.json({ ok: true, signedOut: true });
});
