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
import { matchesSegment, isPublicPath, isAdminPath } from "./lib/auth/paths.js";

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

  // ── 개발 전용 로그인 우회 ──────────────────────────────────────────────
  //
  // 로컬에서 화면을 볼 때마다 매직링크를 받는 것이 실질적인 방해가 된다. 이 문은
  // **프로덕션에서 열릴 길이 없어야 한다** — 그래서 게이트가 둘이다:
  //   ① NODE_ENV 가 production 이면 env 값이 무엇이든 무시한다
  //   ② 그 위에서 SHOTFORM_DEV_USER 에 실제 사용자 id 가 있어야 한다
  // env 하나만으로는 켜지지 않는다. 프로덕션 빌드는 ①에서 막힌다.
  //
  // 이 자리는 위조 헤더 삭제(위) **뒤**여야 한다 — 클라이언트가 심은 x-shotform-user 는
  // 이미 지워졌고, 여기서 넣는 것은 우리가 정한 값뿐이다.
  const devUser =
    process.env.NODE_ENV !== "production" ? process.env.SHOTFORM_DEV_USER : "";
  if (devUser) {
    headers.set(USER_HEADER, devUser);
    headers.set(STATUS_HEADER, "approved");
    headers.set(ROLE_HEADER, "admin");
    return NextResponse.next({ request: { headers } });
  }

  // env 가 없으면 @supabase/ssr 이 영어 메시지로 던지고 모든 요청이 원인 모를 500이 된다.
  // 여기가 보안 경계이니 lib/auth/supabase-server.js 와 같은 한국어 가드를 똑같이 둔다.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL·SUPABASE_ANON_KEY 가 필요해요 (.env.local 확인)");
  }

  // ★ 공개 경로에서는 세션을 확인하지 않는다 — 확인하면 안 된다.
  //
  // 매직링크 시절 라이브에서 밟았다: 링크를 누르면 "PKCE code verifier not found in
  // storage" 로 세션 교환이 실패했다. 원인은 여기였다 — 세션이 없는 상태로 getUser() 를
  // 부르면 auth-js 가 저장소를 정리하면서 setAll 로 **삭제 쿠키**를 내보내는데,
  // middleware 가 NextResponse.next({request}) 로 쿠키를 건드리면 그것이 **다음 핸들러가
  // 보는 요청 쿠키에도 반영된다.** 그래서 콜백이 실행될 때는 방금 로그인 화면이 심어 둔
  // code verifier 가 이미 지워져 있었다. 매직링크와 그 콜백은 비밀번호 로그인으로 바뀌며
  // 사라졌지만, 쿠키를 건드리는 이 성질 자체는 그대로다.
  //
  // 공개 경로는 애초에 신원을 묻지 않는 자리다(로그인 화면과 가입·로그인 라우트).
  // 게다가 가입·로그인 라우트는 **여기서 세션 쿠키를 건드리면 안 되는 자리**다 —
  // 자기가 방금 심은 세션이 지워질 수 있다. 검증을 건너뛰면 그 일이 없다.
  // 위조 헤더 삭제는 위에서 이미 했으므로 방어는 그대로다.
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers } });
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

  // ★ 역할 게이트 — 운영자 전용 화면(/costs·/admin)은 여기서 막는다.
  //
  // 라우트의 withUser(…, {adminOnly:true}) 는 **데이터**를 막을 뿐이라 그것만으로는
  // 페이지가 열린다(빈 화면). 원장 화면이 열린다는 사실 자체를 안 보여준다.
  // API 는 그 403 이 이미 답이므로 화면(!isApi)만 홈으로 되돌린다 — 승인 게이트와 같은 방식.
  if (isAdminPath(pathname) && role !== "admin" && !isApi) {
    const to = req.nextUrl.clone();
    to.pathname = "/";
    return copyCookies(cookieRes, NextResponse.redirect(to));
  }
  return res;
}

// ★ matcher 가 곧 보안 경계다. 여기 안 걸리는 경로는 신원 헤더 없이 라우트에 닿고,
// requireUser 가 500 으로 드러낸다(조용히 통과하지 않는다).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
