// 화면 배선을 소스에서 판정한다(staleness-ui.test.js·quick-create-ui.test.js 패턴).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const quick = readFileSync("components/QuickCreate.jsx", "utf8");
const admin = readFileSync("app/admin/page.js", "utf8");

describe("사이드바 — 크레딧", () => {
  it("무제한이라고 말하지 않는다", () => {
    expect(sidebar).not.toMatch(/무제한/);
    expect(sidebar).not.toMatch(/크레딧을 차감하지 않아요/);
  });
  it("잔액을 서버에서 읽는다", () => {
    expect(sidebar).toMatch(/\/api\/credits/);
  });
});

describe("빠른 생성 — 잔액 부족", () => {
  it("잔액을 읽고 부족하면 만들기를 막는다", () => {
    expect(quick).toMatch(/\/api\/credits/);
    expect(quick).toMatch(/크레딧이 모자라/);
  });
});

describe("빠른 생성 — 가짜 모드", () => {
  // 서버 시작 게이트는 `if (!fakeFal())` 로 가짜 모드를 건너뛴다. 화면이 그 사실을
  // 모르면 0원 관통이 화면에서 막힌다(서버는 202 인데 버튼이 disabled 였다).
  // 주석에 "gated" 라고 적어 두는 것만으로는 통과하지 않게, 주석·블록주석을 걷어낸
  // 코드에서 **막는 판정식 자체**가 gated 를 보는지 본다.
  const code = quick.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  it("막는 판정이 서버의 gated 신호를 본다", () => {
    expect(code).toMatch(/noCredits\s*=[^;]*credits\.gated/);
  });
});

describe("백오피스 — 충전", () => {
  it("충전 라우트를 부른다", () => {
    expect(admin).toMatch(/\/credits/);
  });
  it("사유를 함께 보낸다 — 감사 로그가 비지 않게", () => {
    expect(admin).toMatch(/reason/);
  });
});
