// 인증 관련 경로 목록의 유일한 출처.
//
// middleware.js(Edge)와 components/AppShell.jsx(브라우저 클라이언트) 양쪽에서 이 파일을
// import 한다 — 그래서 여기는 **순수 상수·순수 함수만** 둔다. next/server·next/headers 같은
// 서버 전용 모듈을 하나라도 끌어오면 AppShell을 통해 클라이언트 번들에 딸려 들어가 빌드가
// 깨진다(이 저장소가 "use client" 화면이 서버 전용 모듈을 끌고 온 사고를 세 번 겪었다).
//
// ★ 목록이 둘인 이유 — 하나로 합치면 안 된다.
//
//   PUBLIC_PATHS = 로그인 없이 들어갈 수 있는 경로 (middleware의 인증 경계)
//   BARE_PATHS   = 사이드바 없이 그리는 화면 (AppShell의 시각 규칙)
//
// "/pending"은 공개가 아니다 — middleware가 로그인은 요구한다. 하지만 사이드바는 없어야
// 한다(잠긴 단계 스테퍼를 승인 대기 화면에 보여줄 이유가 없다). 두 목록을 하나로 합치면
// "사이드바가 없어야 하는 화면"이 전부 "로그인 없이 들어갈 수 있는 경로"가 돼 버려서
// 보안 경계가 조용히 넓어진다. 그래서 BARE_PATHS는 PUBLIC_PATHS의 상위집합으로 **표현**하되
// (PUBLIC_PATHS ⊂ BARE_PATHS), PUBLIC_PATHS 자체는 손대지 않는다.

// startsWith가 아니라 세그먼트 경계로 비교한다 — "/login-debug"나 "/pending-evil" 같은
// 미래 경로가 접두어만 겹친다고 조용히 같은 취급을 받으면 안 된다.
export function matchesSegment(pathname, base) {
  return pathname === base || pathname.startsWith(base + "/");
}

// 매직링크를 걷어내면서 /auth/callback 이 빠졌다(발급처가 없으면 죽은 문이다).
// 대신 가입·로그인 라우트가 공개다 — 로그인하지 않은 사람이 불러야 하는 문이므로.
export const PUBLIC_PATHS = ["/login", "/api/auth/signup", "/api/auth/login"];
export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => matchesSegment(pathname, p));
}

// PUBLIC_PATHS ⊂ BARE_PATHS — 공개 경로가 늘면 사이드바 규칙이 자동으로 따라온다.
// "/pending"만 그 위에 더한다(로그인은 필요하지만 사이드바는 없는 유일한 화면).
// (공개 경로에 섞인 "/api/auth/*"는 화면이 아니라 AppShell이 볼 일이 없다 — 포함돼도
//  무해하고, 포함되는 편이 "공개인데 사이드바가 그려지는 화면"이 생길 여지를 없앤다.)
export const BARE_PATHS = [...PUBLIC_PATHS, "/pending"];
export function isBarePath(pathname) {
  return BARE_PATHS.some((p) => matchesSegment(pathname, p));
}
