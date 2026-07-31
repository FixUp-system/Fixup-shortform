// 매직링크 착지점 — 코드를 세션으로 바꾸고 홈으로 보낸다.
//
// ★ authClient(cookieStore) 를 재사용한다(lib/auth/supabase-server.js). createServerClient 를
// 여기서 직접 다시 만들면 setAll 어댑터를 또 하나 손으로 짜게 되고, 그 사본이 낡으면
// (setAll 이 없거나 형태가 안 맞으면 @supabase/ssr 은 던지지 않고 console.warn 만 내고
// 쓰기를 조용히 버린다 — Task 6 에서 이미 겪은 결함) 세션이 조용히 저장되지 않는다.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authClient } from "../../../lib/auth/supabase-server.js";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const cookieStore = await cookies();
  const supabase = authClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("세션 교환 실패:", error.message);
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
