import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("상단 계정 바", () => {
  it("내 정보를 서버에서 한 번에 읽는다 — 이름과 크레딧을 따로 부르지 않는다", () => {
    expect(menu).toMatch(/\/api\/me/);
    expect(menu).not.toMatch(/\/api\/credits/);
  });

  // /api/me 문자열에도 "/me" 가 들어 있어, 그냥 /\/me/ 로 물면 <Link> 를 통째로 지워도
  // 초록이었다. 실제 링크를 문다.
  it("마이페이지와 로그아웃을 담는다", () => {
    expect(menu).toMatch(/href="\/me"/);
    expect(menu).toMatch(/로그아웃/);
    expect(menu).toMatch(/signOut/);
  });

  it("잔액을 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/balance/);
    expect(menu).toMatch(/크레딧/);
  });

  // ★ 사이드바에서 로그아웃을 지운 뒤로, 화면에서 세션을 끊을 자리는 여기 하나뿐이다.
  // 내 정보를 못 읽었다고 계정 묶음을 통째로 숨기면 로그아웃할 방법이 사라진다
  // (라이브 GET /api/me 가 실제로 500 이었다 — profiles.display_name 컬럼이 없어서).
  // 데이터가 있어야 하는 것(크레딧)만 가리고, 이름은 기본 라벨로 채워 빈 버튼을 안 만든다.
  it("내 정보를 못 읽어도 로그아웃은 그린다", () => {
    expect(menu).not.toMatch(/if\s*\(\s*!\s*me\s*\)\s*return\s+null/);
    expect(menu).toMatch(/me\s*&&\s*\(?\s*<span className="um-credit"/);
    expect(menu).toMatch(/me\?\.name\s*\|\|/);
  });

  it("드롭다운이 Esc 와 바깥 클릭으로 닫힌다", () => {
    expect(menu).toMatch(/Escape/);
    expect(menu).toMatch(/aria-expanded/);
  });

  it("AppShell 이 상단 띠에 붙인다", () => {
    expect(shell).toMatch(/UserMenu/);
  });

  // BETA 문구는 화면 가운데를 지켜야 한다 — 우측 묶음을 그냥 더하면 왼쪽으로 밀린다.
  it("띠가 좌·중·우 3영역이다", () => {
    expect(css).toMatch(/\.belt-side/);
    expect(css).toMatch(/\.belt-mid/);
  });

  // .belt b 가 BETA 배지를 만드느라 자간을 벌려 둔다 — 크레딧 숫자는 배지가 아니다.
  it("크레딧 숫자가 BETA 배지의 자간을 물려받지 않는다", () => {
    expect(css).toMatch(/\.um-credit b\s*\{[^}]*letter-spacing:\s*normal/);
  });
});

// 두 곳에 남으면 한쪽이 조용히 낡는다 — 옮겼으면 옛 자리는 비어 있어야 한다.
describe("사이드바 — 계정에 관한 것이 더는 없다", () => {
  const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
  it("로그아웃이 없다", () => {
    expect(side).not.toMatch(/로그아웃/);
    expect(side).not.toMatch(/signOut/);
  });
  it("크레딧을 읽지도 보여주지도 않는다", () => {
    expect(side).not.toMatch(/\/api\/credits/);
    expect(side).not.toMatch(/credit-box/);
  });
  it("죽은 .credit-box CSS 도 남기지 않는다", () => {
    expect(css).not.toMatch(/\.credit-box/);
  });
});
