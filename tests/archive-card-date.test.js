// 보관함 카드의 제목 자리와 **만든 날짜** (2026-09-15 사장님 결정, 같은 날 네 번 바뀌었다).
//
// ★★★ 카드 아래 「제목」은 제목이 아니었다. `material_text.slice(0, 100)` — 사장님이
//   적은 원문 앞 100자라, 비슷한 프로젝트끼리는 앞머리가 똑같이 잘려
//   (「아래는 이미 확정된 콘티다. 이대로…」) **구별에 아무 도움이 안 됐다.** 그래서 걷었다.
// ★★ 날짜가 선 자리의 변천 — 배지 줄 옆 → 썸네일 왼쪽 아래 태그 → 날짜별 묶음 제목 →
//   **보관함 위 좁히기 줄의 시작일·종료일**. 카드에 날짜를 붙이면 태그·배지와 섞여
//   이질감이 났고, 묶음보다 **필터로 좁히는 편**이 낫다는 것이 사장님 판단이다.
// ★ 날짜 경계는 이 제품의 다른 날짜 좁히기와 **같은 한 벌**(lib/costs-filter.js 의 dayBounds)이다.
//   값으로 재는 판은 tests/archive-kind-filter.test.js 에 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
const page = strip(readFileSync("app/archive/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("보관함 카드 — 제목도 날짜도 안 단다", () => {
  it("★★★ 원문 앞머리를 더는 안 그린다", () => {
    expect(cards, "아직 제목 줄을 그린다").not.toMatch(/className="title"/);
    expect(cards, "「제목 없음」이 남아 있다").not.toContain("제목 없음");
  });

  it("★★★ 카드에 날짜 태그가 없다 — 날짜는 좁히기 줄이 맡는다", () => {
    expect(cards).not.toMatch(/created_ts|className="[^"]*when/);
  });

  it("★ 그림의 대체 텍스트는 그대로 둔다 — 눈으로 못 보는 사람에게는 글이 더 낫다", () => {
    expect(cards, "alt 가 사라졌다").toMatch(/alt=\{p\.title \|\| "만든 영상"\}/);
  });
});

describe("보관함 — 만든 날짜로 좁힌다", () => {
  it("★★★ 시작일·종료일 칸이 있다 — 다른 화면의 날짜 좁히기와 같은 모양(.cost-filters)", () => {
    expect(page).toMatch(/className="cost-filters archive-filters"/);
    expect(page).toContain("시작일");
    expect(page).toContain("종료일");
    expect((page.match(/type="date"/g) || []).length).toBe(2);
  });

  it("★★★ 경계는 dayBounds 한 벌이 만든다 — 화면이 자정을 손으로 계산하지 않는다", () => {
    expect(page).toMatch(/import \{ dayBounds \} from "\.\.\/\.\.\/lib\/costs-filter"/);
    expect(page).toMatch(/dayBounds\(from, to\)/);
    expect(page, "화면이 직접 날짜를 조립한다").not.toMatch(/getMonth\(\)|getFullYear\(\)|setHours\(/);
  });

  it("★★ 좁혔을 때만 [초기화]가 선다", () => {
    expect(page).toMatch(/\{narrowed && \(/);
    expect(page).toContain("초기화");
  });

  it("★★ 옛 자리의 규칙은 걷었다 — 아무도 안 쓰는 CSS 가 남으면 다음 사람이 살아 있는 줄 안다", () => {
    for (const sel of [".project-meta .title", ".project-meta .when", ".thumb-tag.when", ".archive-day"]) {
      expect(css.indexOf(sel), `${sel} 가 남아 있다`).toBe(-1);
    }
    expect(page).not.toMatch(/groupByDay/);
  });
});
