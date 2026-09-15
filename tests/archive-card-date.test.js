// 보관함 카드의 라벨 — **제목 자리를 만든 날짜로** (2026-09-15 사장님 결정).
//
// ★★★ 거기 있던 "제목"은 제목이 아니었다. `material_text.slice(0, 100)` — 사장님이
//   적은 원문 앞 100자다. 그래서 비슷한 프로젝트끼리는 앞머리가 똑같이 잘려
//   (「아래는 이미 확정된 콘티다. 이대로…」) **구별에 아무 도움이 안 됐다.**
// ★★ 날짜는 목록이 **최신순**이라 자리를 설명해 주고, `created_ts` 는 이미 목록에
//   실려 오므로 추가 조회가 0이다.
// ★★★ 같은 날 자리가 세 번 바뀌었다 — 배지 줄 옆 → 썸네일 왼쪽 아래 → **날짜 묶음 제목**.
//   카드마다 날짜를 다니 배지·태그와 섞여 이질감이 났다(사장님 지적). 지금은 보관함 화면이
//   같은 날끼리 묶고 그 위에 한 번만 적는다(lib/archive/spec.js 의 groupByDay).
// ★ 판단은 화면 밖에 둔다 — 화면 안 삼항식은 값으로 잴 방법이 없다(이 폴더의 다른
//   부품들이 전부 같은 이유로 여기 있다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { madeOnLabel, groupByDay } from "../lib/archive/spec.js";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
const page = strip(readFileSync("app/archive/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("만든 날짜 — 사람이 읽는 말로", () => {
  it("★ 올해 것은 해를 안 적는다 — 전부 올해면 그 숫자가 아무것도 안 가른다", () => {
    const now = new Date();
    const ts = new Date(now.getFullYear(), 8, 15).getTime(); // 9월 15일
    expect(madeOnLabel(ts)).toBe("9월 15일");
  });

  it("★★ 지난해 것은 해를 적는다 — 안 적으면 작년 9월이 올해 9월로 읽힌다", () => {
    const ts = new Date(2020, 0, 3).getTime();
    expect(madeOnLabel(ts)).toBe("2020년 1월 3일");
  });

  it("★★★ 값이 없으면 빈 줄이다 — 없는 날짜를 지어내면 안 된다", () => {
    expect(madeOnLabel(null)).toBe("");
    expect(madeOnLabel(undefined)).toBe("");
    expect(madeOnLabel(NaN)).toBe("");
    expect(madeOnLabel("어제")).toBe("");
  });
});

describe("날짜 묶음 — 같은 날끼리", () => {
  const at = (m, d, h = 12) => new Date(2020, m - 1, d, h).getTime();

  it("★★★ 이웃한 같은 날을 한 묶음으로 — 순서는 서버가 준 그대로다", () => {
    const list = [
      { id: "a", created_ts: at(1, 3, 18) },
      { id: "b", created_ts: at(1, 3, 9) },
      { id: "c", created_ts: at(1, 2) },
    ];
    expect(groupByDay(list).map((g) => [g.label, g.items.map((p) => p.id)])).toEqual([
      ["2020년 1월 3일", ["a", "b"]],
      ["2020년 1월 2일", ["c"]],
    ]);
  });

  it("★★ 다시 정렬하지 않는다 — 「더 보기」로 붙인 순서를 화면이 섞으면 안 된다", () => {
    const list = [{ id: "x", created_ts: at(1, 2) }, { id: "y", created_ts: at(1, 5) }];
    expect(groupByDay(list).map((g) => g.items[0].id)).toEqual(["x", "y"]);
  });

  it("★ 날짜를 모르는 편은 「날짜 모름」이다 — 지어내지 않는다", () => {
    expect(groupByDay([{ id: "z" }])[0].label).toBe("날짜 모름");
    expect(groupByDay(null)).toEqual([]);
  });
});

describe("보관함 — 날짜는 묶음 제목이다", () => {
  it("★★★ 카드는 제목·날짜를 안 그린다 — 원문 앞머리도, 날짜 태그도 없다", () => {
    expect(cards, "아직 제목 줄을 그린다").not.toMatch(/className="title"/);
    expect(cards, "「제목 없음」이 남아 있다").not.toContain("제목 없음");
    expect(cards, "카드가 아직 날짜를 단다").not.toMatch(/madeOnLabel|className="[^"]*when/);
  });

  it("★★★ 보관함 화면이 날짜로 묶어 제목을 단다", () => {
    expect(page).toMatch(/groupByDay\(projects\)/);
    expect(page).toMatch(/className="archive-day-title"/);
  });

  it("★★ 날짜를 화면에서 손으로 만들지 않는다 — 자리마다 모양이 갈린다", () => {
    for (const src of [cards, page]) {
      expect(src, "화면이 직접 날짜를 조립한다").not.toMatch(/getMonth\(\)|getFullYear\(\)/);
    }
  });

  it("★ 그림의 대체 텍스트는 그대로 둔다 — 눈으로 못 보는 사람에게는 글이 더 낫다", () => {
    expect(cards, "alt 가 사라졌다").toMatch(/alt=\{p\.title \|\| "만든 영상"\}/);
  });

  it("★ 묶음 제목은 접히지 않는다 — 좁은 폭에서 「8월 28 / 일」이 됐다", () => {
    const at = css.indexOf("\n.archive-day-title {");
    expect(at, ".archive-day-title 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("\n}", at))).toMatch(/white-space:\s*nowrap/);
  });

  it("★★ 옛 자리의 규칙은 걷었다 — 아무도 안 쓰는 CSS 가 남으면 다음 사람이 살아 있는 줄 안다", () => {
    expect(css.indexOf(".project-meta .title"), "옛 제목 규칙이 남아 있다").toBe(-1);
    expect(css.indexOf(".project-meta .when"), "배지 줄 날짜 규칙이 남아 있다").toBe(-1);
    expect(css.indexOf(".thumb-tag.when"), "썸네일 날짜 태그 규칙이 남아 있다").toBe(-1);
  });
});
