// 보관함에서 지우기 — 화면 계약.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const cards = readFileSync("components/ProjectCards.jsx", "utf8");

describe("보관함 — 지우기", () => {
  it("카드마다 지우는 자리가 있다", () => {
    expect(cards).toMatch(/method:\s*["']DELETE["']/);
  });

  // 되돌릴 수 없다 — 한 번 묻는다. 카드가 격자로 촘촘해서 오조작이 쉽다.
  it("묻고 나서 지운다", () => {
    expect(cards).toMatch(/confirm\(/);
  });

  // 카드 전체가 <Link> 라, 그 안의 버튼을 누르면 프로젝트로 들어가 버린다.
  it("지우기 버튼이 카드 이동을 막는다", () => {
    expect(cards).toMatch(/preventDefault\(\)/);
    expect(cards).toMatch(/stopPropagation\(\)/);
  });

  // 지운 뒤 목록이 그대로면 사장님은 안 지워진 줄 안다.
  it("지운 뒤 목록에서 뺀다", () => {
    expect(cards).toMatch(/onDeleted|setProjects|filter\(/);
  });
});
