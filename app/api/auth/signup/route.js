// POST /api/auth/signup — 이메일+비밀번호. 가입하면 그 자리에서 세션이 선다.
//
// 이메일 인증을 받지 않는다(Supabase 의 Confirm email 을 꺼 둔다). 가짜 주소는
// 운영자 승인제가 거른다 — 가입은 되지만 승인 전에는 /pending 에서 아무것도 못 한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";
// ★ 사용자 잘못이 아닌 실패(네트워크·5xx·429)의 판정과 문구는 lib/auth/infra-error.js
// 한 곳에 있다 — 로그인·비밀번호 변경과 같은 계약이다.
import { isInfra, infraResponse } from "../../../../lib/auth/infra-error.js";

// 계정은 만들어졌는데 로그인이 안 되는 상태다. 사장님이 고칠 것은 없고, 운영자가
// Supabase 설정 한 곳만 끄면 된다 — 무엇을 말해야 하는지까지 문구에 담는다.
const NO_SESSION =
  "인증 설정에 문제가 있어요 — 이메일 확인(Confirm email)이 켜져 있어서 가입해도 로그인이 되지 않아요. " +
  "운영자에게 '가입 후 로그인이 안 된다, 이메일 확인 설정을 꺼 달라'고 알려 주세요";

// Supabase 오류 원문을 사장님 말로 옮긴다. 모르는 것은 뭉뚱그리되 로그에는 원문을 남긴다.
function reason(message) {
  const m = String(message || "");
  if (/already registered|already exists/i.test(m)) return "이미 가입된 이메일이에요 — 로그인해 주세요";
  if (/password/i.test(m)) return "비밀번호가 너무 짧아요 — 6자 이상으로 정해 주세요";
  if (/email/i.test(m)) return "이메일 주소를 다시 확인해 주세요";
  return "가입하지 못했어요 — 잠시 후 다시 시도해 주세요";
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "이메일과 비밀번호를 넣어 주세요" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = authClient(await cookies());
  } catch (e) {
    console.error("인증 클라이언트 생성 실패:", e.message);
    return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (isInfra(error)) {
      console.error("인증 서버 오류:", error.status, error.message);
      return infraResponse(error);
    }
    console.error("가입 실패:", error.message);
    return Response.json({ error: reason(error.message) }, { status: 400 });
  }

  // ★ 오류가 없는데 세션도 없으면 Supabase 의 "Confirm email" 이 켜져 있는 것이다.
  // 계정은 만들어졌지만 확인 메일을 받기 전까지 세션이 안 선다 — 여기서 200 을 주면
  // 화면은 "/" 로 가고 middleware 가 세션이 없어 /login 으로 되튕긴다.
  // 사장님은 가입이 됐는지 안 됐는지도 모른 채 같은 화면을 다시 본다.
  // 이건 사용자 잘못이 아니라 **설정 실패**다 — isInfra 와 같은 계급으로 500 이다.
  if (!data?.session) {
    console.error(
      "가입은 됐는데 세션이 없다 — Supabase 의 Confirm email 이 켜져 있다.",
      "대시보드 → Authentication → Providers → Email 의 'Confirm email' 을 꺼야 한다.",
      "user:", data?.user?.id || "(없음)"
    );
    return Response.json({ error: NO_SESSION }, { status: 500 });
  }
  return Response.json({ ok: true });
}
