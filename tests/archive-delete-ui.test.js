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

// 하나씩 지우면 스무 편을 치우는 데 스무 번을 묻는다. 정리는 몰아서 하는 일이다.
// (2026-08-13 사용자 요청: 보관함 머리에 [수정] — 체크해서 한 번에 지우기)
describe("보관함 — 골라서 한 번에 지우기", () => {
  const archive = readFileSync("app/archive/page.js", "utf8");

  it("머리에 수정 모드로 드는 자리가 있다", () => {
    expect(archive).toMatch(/수정/);
    expect(archive).toMatch(/selecting|editing/);
  });

  it("고른 것을 쥐고 있다", () => {
    expect(archive).toMatch(/selected/);
  });

  // 카드가 <Link> 라 수정 모드에서 눌렀을 때 프로젝트로 들어가 버리면 고를 수가 없다.
  it("수정 모드에서는 카드를 눌러 고른다 — 이동하지 않는다", () => {
    expect(cards).toMatch(/selectable|selecting/);
    expect(cards).toMatch(/preventDefault\(\)/);
  });

  it("한 번 묻고 고른 것을 다 지운다", () => {
    expect(archive).toMatch(/confirm\(/);
    expect(archive).toMatch(/method:\s*["']DELETE["']/);
  });

  it("아무것도 안 골랐으면 지울 수 없다", () => {
    expect(archive).toMatch(/disabled=\{[^}]*(size|length)[^}]*\}/);
  });
});
