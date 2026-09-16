// 루트 레이아웃(서버 컴포넌트)이 **첫 페인트에 필요한 신원 힌트**를 뽑는 순수 함수.
//
// 왜 필요한가 — 사이드바의 [내 계정]·[운영] 섹션은 지금까지 components/MeContext.jsx 가
// 하이드레이션 뒤 useEffect 에서 GET /api/me 를 불러야만 나타났다(미들웨어 Auth 왕복 +
// 라우트 DB 조회, 실측 평균 131ms + 서버리스 콜드스타트). 그런데 middleware.js 는 이미
// 신원을 검증해 요청 헤더에 넣어 두고, app/layout.js 는 서버 컴포넌트라 next/headers 로
// 그 값을 곧장 읽을 수 있다(app/home/page.js 가 이미 같은 방식을 쓴다).
//
// ★ 여기서 새 판정을 만드는 것이 아니다 — middleware 가 이미 검증한 값을 옮겨 적을 뿐이다.
//   진짜 역할 게이트는 middleware.js 하나다(components/Sidebar.jsx 주석: "링크는 가림막").
// ★ 헤더가 없거나 role 이 "admin" 이 아니면 **모르는 쪽 = 손님/일반**으로 떨어진다
//   (fail-closed) — creditsEnabledFor 의 "모르는 값은 안전한 쪽" 규율과 같은 방향이다.
import { USER_HEADER, ROLE_HEADER } from "./headers.js";

// headerList — next/headers() 가 주는 것과 같은 모양(.get(name)). 테스트에서는
// { get } 만 있는 값을 그대로 넘긴다.
export function meInitialFromHeaders(headerList) {
  const userId = headerList.get(USER_HEADER) || "";
  const guest = !userId;
  // ★ 신원이 없으면(guest) role 값이 무엇이든 운영자로 읽지 않는다 — 신원 없는 운영자는
  //   원리적으로 없다. 방어적으로 한 번 더 막아 둔다(middleware 는 늘 둘을 같이 세운다).
  return { guest, isAdmin: !guest && headerList.get(ROLE_HEADER) === "admin" };
}
