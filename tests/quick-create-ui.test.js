// 화면 배선을 소스에서 판정한다(staleness-ui.test.js 패턴) — 이 저장소는 React 렌더 테스트가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("components/QuickCreate.jsx", "utf8");

describe("QuickCreate — 자동 관통 배선", () => {
  it("t2v 경로를 더는 부르지 않는다", () => {
    expect(src).not.toMatch(/api\/video/);
  });
  it("프로젝트 생성과 자동 관통 시작을 부른다", () => {
    expect(src).toMatch(/\/api\/projects"/);
    expect(src).toMatch(/\/auto/);
  });
  it("진행 폴링은 프로젝트 조회로 한다", () => {
    expect(src).toMatch(/\/api\/projects\/\$\{/);
  });
  it("실패 시 단계별 화면으로 보낸다 — stepHref 가 경로의 진실의 원천", () => {
    expect(src).toMatch(/stepHref/);
  });
});
