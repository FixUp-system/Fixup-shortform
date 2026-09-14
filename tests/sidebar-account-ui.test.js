// 사이드바 — [내 계정] 묶음(2026-09-14 사장님 지시: "사이드바에도 내 정보로 이동할 수 있는 섹션, 위의 영상 만들기랑 분리해서").
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const side = readFileSync("components/Sidebar.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("사이드바 — 내 계정", () => {
  it("내 정보(/me) 링크가 있다 — 보관함 아래, 운영자 메뉴 위", () => {
    const me = side.indexOf('href="/me"');
    expect(me).toBeGreaterThan(side.indexOf('href="/archive"'));
    expect(me).toBeLessThan(side.indexOf('href="/admin"'));
  });

  it("영상 메뉴와 갈라 선 머리말 아래에 있다", () => {
    const me = side.indexOf('href="/me"');
    const head = side.lastIndexOf('className="side-sec"', me);
    expect(head).toBeGreaterThan(side.indexOf('href="/archive"'));
    expect(side.slice(head, me)).toMatch(/내 계정/);
    expect(css).toMatch(/\.side-sec \{[^}]*border-top/);
  });

  it("손님(비로그인)에게는 안 보인다 — 눌러도 로그인으로 튕기는 막다른 링크다", () => {
    const me = side.indexOf('href="/me"');
    expect(side.slice(Math.max(0, me - 400), me)).toMatch(/!guest &&/);
  });

  it("운영자 메뉴에도 머리말이 있다 — 세 묶음이 갈린다", () => {
    const admin = side.indexOf('href="/admin"');
    expect(side.slice(side.indexOf('href="/me"'), admin)).toMatch(/className="side-sec"[^>]*>\s*운영/);
  });
});
