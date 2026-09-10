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
// ★★★ 2026-09-10 — 크론 문 하나가 늘었다. Vercel 크론에는 **로그인한 사람이 없어서**
//   여기 없으면 307 로 /login 에 튕기고 아무 일도 안 일어난다(같은 날 표지 정적 파일이
//   그 자리에서 307 을 맞았다). 문을 지키는 것은 라우트 안의 `CRON_SECRET` 이다 —
//   비밀이 없으면 **닫힌 쪽으로** 떨어진다(app/api/cron/collect/route.js).
// ⚠️ **접두사(`/api/cron`)로 열지 마라.** matchesSegment 가 그 아래를 전부 여는데,
//   그러면 앞으로 만드는 크론이 **비밀 검사를 빠뜨린 채로도** 공개가 된다.
//   경로를 하나씩 적는다(tests/cron-collect.test.js 가 그것을 못 박는다).
// ★★★ 2026-09-10 — fal 웹훅 문이 하나 더 늘었다. fal 은 로그인 없이 우리를 부르는데,
//   문서가 못 박는다: *"Redirects are not followed … a 3xx status code … is treated as a
//   permanent failure and is not retried."* 벽 안에 두면 **307 한 번에 영영 재시도가 없다**.
//   자물쇠는 ED25519 서명이다(lib/fal-webhook.js) — 검증이 안 되면 401 로 닫힌다.
export const PUBLIC_PATHS = [
  "/login",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/cron/collect",
  "/api/fal/webhook",
];
export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => matchesSegment(pathname, p));
}

// ★ 운영자 전용 화면 — 로그인·승인만으로는 못 들어간다.
//
// /costs 는 전사 원장이고 /admin 은 백오피스다. 남의 지출·프롬프트가 담기므로 사장님에게
// 열려 있으면 안 된다. 데이터는 라우트의 withUser(…, {adminOnly:true}) 가 이미 403 으로
// 막지만, 그것만으로는 **페이지가 열린다**(빈 화면이 뜬다). 진짜 경계는 middleware 다.
//
// API 경로는 여기 넣지 않는다 — 라우트가 이미 403 을 내고, middleware 는 화면만 되돌린다.
// (matchesSegment 라 "/api/costs" 는 "/costs" 에 안 걸린다.)
export const ADMIN_PATHS = ["/costs", "/admin"];
export function isAdminPath(pathname) {
  return ADMIN_PATHS.some((p) => matchesSegment(pathname, p));
}

// PUBLIC_PATHS ⊂ BARE_PATHS — 공개 경로가 늘면 사이드바 규칙이 자동으로 따라온다.
// "/pending"만 그 위에 더한다(로그인은 필요하지만 사이드바는 없는 유일한 화면).
// (공개 경로에 섞인 "/api/auth/*"는 화면이 아니라 AppShell이 볼 일이 없다 — 포함돼도
//  무해하고, 포함되는 편이 "공개인데 사이드바가 그려지는 화면"이 생길 여지를 없앤다.)
export const BARE_PATHS = [...PUBLIC_PATHS, "/pending"];
export function isBarePath(pathname) {
  return BARE_PATHS.some((p) => matchesSegment(pathname, p));
}

// 랜딩 — **앱 틀(사이드바·띠)을 걷고 화면을 통째로 내주는** 화면 (2026-09-09 저녁).
//
// ★★ 왜 BARE_PATHS 에 안 섞는가. 그 목록은 바로 위에서 보듯 PUBLIC_PATHS 와 **짝지어**
//   읽힌다("공개 경로가 늘면 사이드바 규칙이 자동으로 따라온다"). 랜딩을 거기 넣으면
//   다음 사람이 그 관계를 거꾸로 읽어 **"랜딩이 공개 경로다"** 로 이해한다 — 실제로
//   /home 은 손님에게 열려 있지만 그 판정은 lib/auth/guest.js 가 따로 하고, 여기서
//   흉내 내면 보안 경계의 출처가 두 벌이 된다. 세 목록은 이렇게 다르다:
//     PUBLIC_PATHS  = 로그인 없이 들어갈 수 있는가   (middleware · 보안)
//     BARE_PATHS    = 사이드바를 뗄 것인가            (아직 안 들어온 사람)
//     LANDING_PATHS = 틀을 통째로 걷을 것인가         (여기 · 순전히 시각)
//
// ★ 이 목록이 생긴 이유는 실측이다. 랜딩을 어둡게 만들어 놓고 프로덕션에서 보니
//   프로토타입과 딴판이었다 — 색 토큰은 글자까지 같았는데 **사이드바와 띠가 랜딩을
//   액자에 넣어** 밝은 틀 안에 뜬 검은 카드가 돼 있었다. 고칠 것은 색이 아니라 틀이었다.
export const LANDING_PATHS = ["/home"];
export function isLandingPath(pathname) {
  return LANDING_PATHS.some((p) => matchesSegment(pathname, p));
}
