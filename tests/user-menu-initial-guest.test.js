// 손님이 받는 **첫 그림**에 계정 버튼이 찍히지 않는다 (2026-09-14 실측 후 고침).
//
// 증상: 랜딩을 로그아웃 상태로 열면 HTML 에 "내 계정"이 찍혀 내려오고, 브라우저가 붙어
//   `/api/me` 가 401 을 돌려준 **뒤에야** [로그인] 으로 바뀌었다. 없는 계정을 가진 것처럼
//   보이는 한 프레임이다 — 손님이 처음 닿는 화면이라 그대로 눈에 띈다.
//
// 고침: 랜딩은 **서버 컴포넌트**라 요청 헤더로 신원을 이미 안다. 그 답을 부품에 넘긴다.
//   ★ 판정이 두 벌이 된 것이 아니다 — `/api/me` 가 답하기 전까지만 쓰는 **첫 값**이고,
//     답이 온 뒤에는 그쪽이 유일한 진실이다(다른 탭에서 로그인·로그아웃하면 첫 값은 낡는다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const menu = readFileSync("components/UserMenu.jsx", "utf8");
const home = readFileSync("app/home/page.js", "utf8");
const shell = readFileSync("components/AppShell.jsx", "utf8");

describe("UserMenu — 서버가 아는 신원을 첫 그림에 쓴다", () => {
  it("★★★ 손님 갈래가 **답이 오기 전**의 첫 값도 본다", () => {
    // `initialGuest` 만 보면 안 된다 — 그러면 다른 탭에서 로그인한 사람에게도 영영
    // [로그인] 이 선다. `!ready` 가 그 창을 **답이 오기 전**으로 좁힌다.
    expect(menu, "손님 갈래가 첫 값을 안 본다").toMatch(
      /if\s*\(\s*guest\s*\|\|\s*\(\s*initialGuest\s*&&\s*!ready\s*\)\s*\)/
    );
    expect(menu, "ready 를 공유본에서 안 읽는다").toMatch(/const\s*\{[^}]*\bready\b[^}]*\}\s*=\s*useMe\(\)/);
  });

  it("★★ 안 넘기면 **옛 동작 그대로**다 — 기본값이 false", () => {
    // 앱 틀(AppShell)의 상단바는 이 회차에 손대지 않았다. 기본값이 true 였다면 그 자리가
    // 로그인한 사람에게도 잠깐 [로그인] 으로 보인다.
    expect(menu, "기본값이 없다 — 안 넘기는 자리에서 undefined 가 된다").toMatch(
      /function UserMenu\(\s*\{\s*initialGuest\s*=\s*false\s*\}\s*\)/
    );
    expect(shell, "앱 틀이 첫 값을 넘긴다 — 이번 회차 범위가 아니다").toMatch(/<UserMenu\s*\/>/);
  });

  it("★★★ 랜딩이 **서버가 읽은 신원**을 넘긴다", () => {
    expect(home, "랜딩이 첫 값을 안 넘긴다").toMatch(/<UserMenu\s+initialGuest=\{!signedIn\}\s*\/>/);
    // 그 값의 출처는 미들웨어가 넣어 준 헤더 하나다(화면이 세션을 다시 확인하지 않는다).
    expect(home, "신원을 헤더에서 안 읽는다").toMatch(/headers\(\)\)\.get\(USER_HEADER\)/);
  });
});
