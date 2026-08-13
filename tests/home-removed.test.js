// 빠른 생성은 화면에서 내린다 — 사이드바의 "홈 — 빠른 생성"과 홈 화면을 없애고,
// 루트로 들어오면 단계별 흐름으로 보낸다(2026-08-13 사용자 결정).
//
// ★ 뒷단은 **그대로 둔다**: components/QuickCreate.jsx · /api/projects/[id]/auto ·
//   lib/auto.js 는 살아 있다. 나중에 되살릴 때 커밋을 뒤지지 않아도 되게.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

const home = readFileSync("app/page.js", "utf8");
const sidebar = readFileSync("components/Sidebar.jsx", "utf8");

describe("빠른 생성을 화면에서 내린다", () => {
  it("사이드바에 빠른 생성 자리가 없다", () => {
    expect(sidebar).not.toMatch(/빠른 생성/);
  });

  // ★ 주석에 남긴 "되살릴 자리" 안내는 걸리면 안 된다 — **그리는가**만 본다.
  it("홈 화면이 빠른 생성을 그리지 않는다", () => {
    expect(home, "QuickCreate 를 import 한다").not.toMatch(/^\s*import[^;]*QuickCreate/m);
    expect(home, "QuickCreate 를 그린다").not.toMatch(/<QuickCreate/);
  });

  it("루트로 들어오면 단계별 흐름으로 보낸다 — 빈 화면을 남기지 않는다", () => {
    expect(home).toMatch(/redirect\(/);
    expect(home).toMatch(/\/create/);
  });

  it("뒷단은 남겨 둔다 — 나중에 되살릴 자리다", () => {
    expect(existsSync("components/QuickCreate.jsx"), "QuickCreate 를 지웠다").toBe(true);
    expect(existsSync("lib/auto.js"), "lib/auto.js 를 지웠다").toBe(true);
    expect(existsSync("app/api/projects/[id]/auto/route.js"), "auto 라우트를 지웠다").toBe(true);
  });
});
