// 도는 표시는 **문장 끝**에 붙는다.
//
// 사장님 지적(2026-08-18): "만드는 중이에요도 '만드는' 다음 줄에 로딩 아이콘 '중이에요'로
// 표시되고 있어서, 문장 끝에 로딩 아이콘 넣어줘."
//
// 원인: 표시를 문장 **앞**에 두었다. 덮개는 좁은 카드 위에 얹히는 상자라 글이 접히는데,
// 앞에 있으면 접힌 줄 사이로 표시가 끼어들어 "만드는 / ◌ 중이에요" 로 읽힌다.
// 끝에 두면 접혀도 문장이 먼저 읽히고 표시가 뒤따른다.
//
// ★ 문장은 접히더라도 **낱말 가운데서 갈라지면 안 된다** — 표시와 글자 사이도 마찬가지다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const PAGES = [
  ["④이미지", readFileSync("app/create/[id]/images/page.js", "utf8")],
  ["⑤영상", readFileSync("app/create/[id]/video/page.js", "utf8")],
];

describe("만드는 중 표시 — 문장 끝", () => {
  for (const [step, src] of PAGES) {
    it(`★★ ${step} — 덮개 둘 다 표시가 글 뒤에 온다`, () => {
      const covers = src.split('className="frame-busy"').slice(1);
      expect(covers.length, "덮개가 둘이 아니다").toBe(2);
      for (const cover of covers) {
        const block = cover.slice(0, 260);
        const label = block.indexOf("busyLabel(");
        const spin = block.indexOf('className="spinner"');
        expect(label, "문구를 못 찾았다").toBeGreaterThan(-1);
        expect(spin, "도는 표시를 못 찾았다").toBeGreaterThan(-1);
        expect(spin, "표시가 문장 앞에 있다 — 접히면 글 사이로 끼어든다").toBeGreaterThan(label);
      }
    });
  }

  it("★ 끝에 붙는 표시는 왼쪽에 사이를 둔다 — 앞에 두던 시절의 여백이 반대다", () => {
    expect(css, "덮개 안 표시의 여백 규칙이 없다").toMatch(/\.frame-busy \.spinner/);
  });
});
