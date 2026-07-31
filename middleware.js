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
// PUBLIC_PATHS(로그인 경계)·matchesSegment(세그먼트 경계 비교)의 유일한 출처.
// components/AppShell.jsx의 BARE_PATHS(사이드바 경계)도 같은 파일을 본다 — 왜 둘로 나뉘는지는
// lib/auth/paths.js 주석 참고. 여기서 합치면 안 된다.
import { matchesSegment, isPublicPath } from "./lib/auth/paths.js";

// setAll 이 어느 시점의 응답에 쓰든, 최종적으로 브라우저에 나가는 응답에는 그 쿠키가
// 실려 있어야 한다. res 를 여러 번 새로 만드는 이 middleware 에서 이 옮겨싣기를 빠뜨리면
// getUser() 가 갱신한 세션 쿠키가 조용히 버려진다(C1) — 액세스 토큰 만료 후 매 요청은
// 갱신에 성공하는데 브라우저는 계속 낡은 refresh token 을 보내다가 결국
// "Invalid Refresh Token: Already Used" 로 세션이 끊긴다.
function copyCookies(from, to) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // ★ 들어온 신원 헤더를 먼저 지운다. 클라이언트가 x-shotform-user 를 실어 보내도
  // 여기서 사라진다 — 아래에서 우리가 검증한 값만 다시 넣는다.
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);
  headers.delete(STATUS_HEADER);
  headers.delete(ROLE_HEADER);

  // env 가 없으면 @supabase/ssr 이 영어 메시지로 던지고 모든 요청이 원인 모를 500이 된다.
  // 여기가 보안 경계이니 lib/auth/supabase-server.js 와 같은 한국어 가드를 똑같이 둔다.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL·SUPABASE_ANON_KEY 가 필요해요 (.env.local 확인)");
  }

  // supabase 가 세션을 갱신하면 setAll 이 쿠키를 여기에 쓴다. 이후 실제로 내보내는 응답이
  // 통과·리다이렉트·401 무엇이든 이 쿠키를 copyCookies 로 옮겨 싣는다.
  const cookieRes = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => cookieRes.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    // 무료 플랜은 며칠 요청이 없으면 프로젝트가 일시정지된다 — 그때 user 가 null 이 되어
    // 전 사용자가 조용히 /login 으로 튕긴다. fail-closed 는 맞지만 원인이 로그에 안 남으면
    // "조용한 실패" 다. 동작은 그대로 두고 원인만 남긴다.
    console.error("getUser 실패:", error.message);
  }

  if (!user) {
    if (isPublicPath(pathname)) return cookieRes;
    if (isApi) {
      return copyCookies(cookieRes, NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 }));
    }
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    return copyCookies(cookieRes, NextResponse.redirect(to));
  }

  // 승인 상태는 app_metadata 에 심어 둔다 — profiles 를 매 요청 읽으면 왕복이 하나 더 는다.
  // profiles 가 원장이고 이것은 캐시다(승인 버튼이 둘 다 쓴다).
  const status = user.app_metadata?.status || "pending";
  const role = user.app_metadata?.role || "user";

  headers.set(USER_HEADER, user.id);
  headers.set(STATUS_HEADER, status);
  headers.set(ROLE_HEADER, role);
  const res = copyCookies(cookieRes, NextResponse.next({ request: { headers } }));

  if (status !== "approved" && !isApi && !matchesSegment(pathname, "/pending")) {
    const to = req.nextUrl.clone();
    to.pathname = "/pending";
    return copyCookies(cookieRes, NextResponse.redirect(to));
  }
  return res;
}

// ★ matcher 가 곧 보안 경계다. 여기 안 걸리는 경로는 신원 헤더 없이 라우트에 닿고,
// requireUser 가 500 으로 드러낸다(조용히 통과하지 않는다).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
