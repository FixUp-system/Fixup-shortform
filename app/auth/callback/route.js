// 매직링크 착지점 — 세션을 만들고 홈으로 보낸다.
//
// ★ authClient(cookieStore) 를 재사용한다(lib/auth/supabase-server.js). createServerClient 를
// 여기서 직접 다시 만들면 setAll 어댑터를 또 하나 손으로 짜게 되고, 그 사본이 낡으면
// (setAll 이 없거나 형태가 안 맞으면 @supabase/ssr 은 던지지 않고 console.warn 만 내고
// 쓰기를 조용히 버린다 — Task 6 에서 이미 겪은 결함) 세션이 조용히 저장되지 않는다.
//
// ★ 두 가지 형태를 받는다:
//
//   1. `?code=…`        — 로그인 화면이 signInWithOtp 로 시작한 PKCE 흐름.
//                         브라우저에 code verifier 가 쿠키로 남아 있어야 성립한다.
//   2. `?token_hash=…&type=…` — 이메일 링크에서 바로 오는 흐름. verifier 가 필요 없다.
//
// 2번을 함께 받는 이유는 1번이 **브라우저 상태에 의존**하기 때문이다. 다른 기기에서 메일을
// 열거나, 시크릿 창이거나, 그 사이 쿠키가 지워지면 1번은 "PKCE code verifier not found" 로
// 죽는다(라이브에서 실제로 겪었다). 2번은 링크 자체가 자기 완결이라 그 사고가 없다.
// Supabase 이메일 템플릿을 `{{ .TokenHash }}` 로 바꾸면 실사용도 2번으로 옮길 수 있다.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient } from "../../../lib/auth/supabase-server.js";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const cookieStore = await cookies();
  const supabase = authClient(cookieStore);

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || "magiclink" });

  if (error) {
    // 원인을 남긴다 — 이 자리가 조용하면 사용자는 "로그인 화면으로 되돌아왔다"만 보게 된다.
    console.error(`세션 ${code ? "교환" : "확인"} 실패:`, error.message);
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
