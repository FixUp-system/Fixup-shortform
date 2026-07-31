// 신원 검증은 여기서 **한 번만** 한다.
//
// ★ 왜 라우트마다 안 하는가: app/create/[id]/script/page.js 와 voice/page.js 가 2초 간격으로
// 폴링한다. 라우트마다 getUser() 를 부르면 생성 중 분당 30회/사용자의 Auth 왕복이 생긴다.
//
// ★ getSession() 이 아니라 getUser() 다. getSession() 은 쿠키를 파싱해 그대로 돌려주므로
// **위조된 쿠키를 통과시킨다.** getUser() 는 Auth 서버가 검증한다. 우리가 JWT 를 직접
// 검증하지 않으므로 서명 알고리즘(ES256/JWKS)을 알 필요도 없다 — addog 가 그 함정에서
// 프로덕션 핫픽스를 했다.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "./lib/auth/headers.js";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // ★ 들어온 신원 헤더를 먼저 지운다. 클라이언트가 x-shotform-user 를 실어 보내도
  // 여기서 사라진다 — 아래에서 우리가 검증한 값만 다시 넣는다.
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);
  headers.delete(STATUS_HEADER);
  headers.delete(ROLE_HEADER);

  let res = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return res;
    if (isApi) return Response.json({ error: "로그인이 필요해요" }, { status: 401 });
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    return NextResponse.redirect(to);
  }

  // 승인 상태는 app_metadata 에 심어 둔다 — profiles 를 매 요청 읽으면 왕복이 하나 더 는다.
  // profiles 가 원장이고 이것은 캐시다(승인 버튼이 둘 다 쓴다).
  const status = user.app_metadata?.status || "pending";
  const role = user.app_metadata?.role || "user";

  headers.set(USER_HEADER, user.id);
  headers.set(STATUS_HEADER, status);
  headers.set(ROLE_HEADER, role);
  res = NextResponse.next({ request: { headers } });

  if (status !== "approved" && !isApi && !pathname.startsWith("/pending")) {
    const to = req.nextUrl.clone();
    to.pathname = "/pending";
    return NextResponse.redirect(to);
  }
  return res;
}

// ★ matcher 가 곧 보안 경계다. 여기 안 걸리는 경로는 신원 헤더 없이 라우트에 닿고,
// requireUser 가 500 으로 드러낸다(조용히 통과하지 않는다).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
