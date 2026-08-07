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

  it("마이페이지와 로그아웃을 담는다", () => {
    expect(menu).toMatch(/\/me/);
    expect(menu).toMatch(/로그아웃/);
    expect(menu).toMatch(/signOut/);
  });

  it("잔액을 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/balance/);
    expect(menu).toMatch(/크레딧/);
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
});
