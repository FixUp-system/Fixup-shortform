// 보관함 카드의 라벨 — **제목 자리를 만든 날짜로** (2026-09-15 사장님 결정).
//
// ★★★ 거기 있던 "제목"은 제목이 아니었다. `material_text.slice(0, 100)` — 사장님이
//   적은 원문 앞 100자다. 그래서 비슷한 프로젝트끼리는 앞머리가 똑같이 잘려
//   (「아래는 이미 확정된 콘티다. 이대로…」) **구별에 아무 도움이 안 됐다.**
// ★★ 그렇다고 줄을 통째로 비우면 안 된다 — 목록의 썸네일은 대부분 비어 있어서
//   (아직 안 구운 편) 카드를 가를 단서가 배지 둘(종류·상태)뿐이 된다.
//   날짜는 목록이 **최신순**이라 그 자리를 설명해 주고, `created_ts` 는 이미 목록에
//   실려 오므로 추가 조회가 0이다.
// ★ 판단은 화면 밖에 둔다 — 화면 안 삼항식은 값으로 잴 방법이 없다(이 폴더의 다른
//   부품들이 전부 같은 이유로 여기 있다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { madeOnLabel } from "../lib/archive/spec.js";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
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

describe("보관함 카드 — 제목 자리", () => {
  it("★★★ 원문 앞머리를 더는 안 그린다", () => {
    expect(cards, "아직 제목 줄을 그린다").not.toMatch(/className="title"/);
    expect(cards, "「제목 없음」이 남아 있다").not.toContain("제목 없음");
  });

  it("★★★ 그 자리에 만든 날짜가 온다", () => {
    expect(cards, "madeOnLabel 을 안 쓴다").toContain("madeOnLabel");
    expect(cards, "lib/archive/spec 에서 안 가져온다").toMatch(/from\s+["'][^"']*archive\/spec/);
    expect(cards, "카드가 날짜를 안 그린다").toMatch(/className="when"/);
  });

  it("★★ 날짜를 화면에서 손으로 만들지 않는다 — 자리마다 모양이 갈린다", () => {
    expect(cards, "화면이 직접 날짜를 조립한다").not.toMatch(/getMonth\(\)|getFullYear\(\)/);
  });

  it("★ 그림의 대체 텍스트는 그대로 둔다 — 눈으로 못 보는 사람에게는 글이 더 낫다", () => {
    expect(cards, "alt 가 사라졌다").toMatch(/alt=\{p\.title \|\| "만든 영상"\}/);
  });
});

describe("보관함 카드 CSS — 자리를 옮긴다", () => {
  it("★ 날짜 줄에 규칙이 있다", () => {
    expect(css.indexOf(".project-meta .when"), ".project-meta .when 규칙이 없다").toBeGreaterThan(-1);
  });

  it("★★ 옛 제목 규칙은 걷는다 — 아무도 안 쓰는 CSS 가 남으면 다음 사람이 살아 있는 줄 안다", () => {
    expect(css.indexOf(".project-meta .title"), "옛 제목 규칙이 남아 있다").toBe(-1);
  });
});
