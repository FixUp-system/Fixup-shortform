// 만드는 중에는 **그림 자리 위에** 그렇게 말한다 — 좌측 카드와 우측 미리보기 둘 다.
//
// 사장님 지시(2026-08-18): "이미지나 영상을 다시 만들거나 생성 중일 때는 우측 그리고 좌측에
// 기본 이미지 영역을 다시 만드는 중이에요라고 표현하고 로딩 표시가 뜰 수 있게."
//
// ★ 왜 자리표시자로는 부족했나: 지금까지 "다시 만드는 중"은 **그림이 없을 때 보이는 자리**
//   (`url ? <img/> : <span className="ph">…`)에만 적혀 있었다. 그런데 **재생성은 언제나 그림이
//   이미 있는 컷에서 일어난다** — 옛 그림이 그대로 보이고 아무 표시도 안 뜬다.
//   그래서 덮개(overlay)여야 한다: 그림이 있든 없든 그 위에 뜬다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const css = read("app/globals.css");
const PAGES = [
  ["④이미지", read("app/create/[id]/images/page.js")],
  ["⑤영상", read("app/create/[id]/video/page.js")],
];

// 어떤 요소 하나의 여는 태그부터 그 블록 끝까지 — 덮개가 **그 안**에 있는지 보려면 필요하다.
const blockAt = (src, marker) => {
  const at = src.indexOf(marker);
  if (at < 0) return "";
  return src.slice(at, at + 900);
};

describe("만드는 중 — 그림 자리 위에 덮개가 뜬다", () => {
  it("★ 덮개를 그리는 규칙이 있다", () => {
    expect(css, "frame-busy 규칙이 없다 — 클래스만 붙이면 화면에서는 아무 일도 안 난다")
      .toMatch(/\.frame-busy/);
    // 그림 위에 얹혀야 한다 — 흐름에 끼면 카드가 밀려 레이아웃이 흔들린다
    expect(css, "덮개가 그림 위에 얹히지 않는다").toMatch(/\.frame-busy[\s\S]{0,300}position:\s*absolute/);
  });

  for (const [step, src] of PAGES) {
    it(`★ ${step} — 좌측 컷 카드에 덮개가 있다`, () => {
      const box = blockAt(src, 'className={`thumb');
      expect(box, "좌측 컷 카드를 못 찾았다").toBeTruthy();
      expect(box, "좌측 카드에 덮개가 없다").toMatch(/frame-busy/);
    });

    it(`★ ${step} — 우측 미리보기에 덮개가 있다`, () => {
      const box = blockAt(src, '<div className="preview-frame"');
      expect(box, "우측 미리보기를 못 찾았다").toBeTruthy();
      expect(box, "우측 미리보기에 덮개가 없다").toMatch(/frame-busy/);
      // ★ 그림과 **나란히** 있어야 한다 — 자리표시자 갈래 안에 들어가면 그림이 있는 컷에서 안 뜬다
      expect(box, "덮개가 그림과 나란히 있지 않다").toMatch(/(<img|<video)[\s\S]{0,400}frame-busy/);
    });

    it(`★ ${step} — 덮개가 로딩 표시와 말을 함께 낸다`, () => {
      const at = src.indexOf("frame-busy");
      const box = src.slice(at, at + 400);
      expect(box, "로딩 표시가 없다").toMatch(/spinner/);
      // ★ 문구는 lib/progress.js 의 busyLabel 이 정한다(2026-08-18) — 처음 굽는 컷에
      //   "다시"가 뜨던 것을 고치면서 네 자리가 갈리지 않게 한 곳으로 모았다.
      //   여기서 재는 것은 "덮개가 말을 하는가"이고, 그 말이 무엇인지는 busy-label.test.js 다.
      expect(box, "무엇을 하는 중인지 말하지 않는다").toMatch(/만드는 중|busyLabel\(/);
    });
  }
});
