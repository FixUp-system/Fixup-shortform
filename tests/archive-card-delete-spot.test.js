// 보관함 카드의 지우기 — **썸네일 오른쪽 위 아이콘으로** (2026-09-15 사장님 결정).
//
// ★★★ 카드 아래 줄이 「9월 15일 · [단계별][완성]」 한 줄이 되자, 190px 카드에서는 그 셋만으로
//   줄이 꽉 차 [지우기] 글자 버튼이 **모든 카드에서** 날짜 밑으로 밀렸다(로컬 48장 실측 48/48).
//   글자 줄에 두면 배지가 늘 때마다 또 밀린다 — 그래서 **그 줄 밖**, 썸네일 모서리로 뺀다.
// ★ 왼쪽 위는 「영상」 태그 자리라 오른쪽 위다.
// ★ 평소 흐리고 마우스를 올리면 또렷한 규칙, 손가락 기기에서는 늘 보이는 규칙은 그대로다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("지우기는 썸네일 모서리에 선다", () => {
  const thumbAt = cards.indexOf('className="project-thumb"');
  const delAt = cards.indexOf('className="card-del"');

  // ★ 같은 날 뒤이어 카드 아래 글자 줄(project-meta)은 통째로 걷었다 — 지우기는 썸네일 안에만 산다.
  it("★★★ 버튼이 썸네일 안에 있고, 카드 아래 글자 줄은 없다", () => {
    expect(delAt, "card-del 이 없다").toBeGreaterThan(thumbAt);
    expect(thumbAt).toBeGreaterThan(-1);
    expect(cards, "카드 아래 글자 줄이 남아 있다").not.toContain('className="project-meta"');
  });

  it("★★ 글자가 아니라 휴지통 아이콘이다 — 이름은 aria-label 이 말한다", () => {
    const btn = cards.slice(delAt, cards.indexOf("</button>", delAt));
    expect(btn).toMatch(/<Icon name="trash"/);
    expect(btn).toContain('aria-label="이 영상 지우기"');
    expect(btn, "모서리 아이콘 옆에 글자가 남았다").not.toMatch(/"지우기"/);
  });

  it("★★ 오른쪽 위에 겹쳐 선다 — 왼쪽 위는 「영상」 태그 자리다", () => {
    const r = rule(".card-del");
    expect(r).toMatch(/position:\s*absolute/);
    expect(r).toMatch(/top:\s*8px/);
    expect(r).toMatch(/right:\s*8px/);
  });

  it("★ 흐리게 두다가 올리면 또렷해진다 · 손가락 기기에서는 늘 보인다(기존 규칙)", () => {
    expect(rule(".card-del")).toMatch(/opacity:\s*0/);
    expect(css).toMatch(/\.project-card:hover \.card-del/);
    expect(css).toMatch(/@media \(hover: none\)\s*\{\s*\.card-del\s*\{\s*opacity:\s*1/);
  });
});
