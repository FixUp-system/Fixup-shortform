// **보관함의 [내 영상]·[전체]를 토글로** (2026-09-01 사장님 지시).
//
// ★★★ 그전에는 셋이 똑같은 `.mini` 로 나란히 있었다: `내 영상` · `전체` · `수정`.
//   그런데 성격이 다르다 — 앞의 둘은 **둘 중 하나를 고르는 것**이고 셋째는 **동작**이다.
//   같은 모양으로 늘어놓으면 어느 둘이 한 짝인지 모양으로 안 드러난다. 게다가 선택 표시가
//   테두리 색 + 글자 굵기뿐이라, 화면에서 지금 무엇을 보고 있는지가 잘 안 읽혔다.
//
// ★★ **판정은 그대로 `aria-pressed` 다.** app/globals.css 의 옛 주석이 그 이유를 적어
//   두었다: *"클래스가 아니라 aria-pressed 를 셀렉터로 쓴다: 보이는 상태와 스크린리더가
//   읽는 상태가 갈릴 수 없다(한쪽만 고치는 날이 안 온다)."* 모양만 바꾸고 그 규율은 지킨다.
//
// ★ [수정]은 상자 **밖**이다 — 고르는 것과 하는 것을 가르는 것이 이 변경의 요점이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const page = strip(readFileSync("app/archive/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("범위 고르기 — 한 상자로 묶는다", () => {
  it("★★★ 두 칸이 한 상자 안에 있다", () => {
    const at = page.indexOf('className="seg"');
    expect(at, "seg 상자가 없다 — 셋이 여전히 따로 선다").toBeGreaterThan(-1);
    const box = page.slice(at, at + 700);
    expect(box).toContain("내 영상");
    expect(box).toContain("전체");
  });

  it("★★★ 판정은 aria-pressed 다 — 보이는 상태와 읽히는 상태가 갈릴 수 없게", () => {
    const at = page.indexOf('className="seg"');
    const box = page.slice(at, at + 700);
    expect((box.match(/aria-pressed/g) || []).length, "두 칸 모두에 없다").toBe(2);
  });

  it("★★ [수정]은 그 상자 밖이다 — 고르는 것과 하는 것은 다르다", () => {
    const at = page.indexOf('className="seg"');
    const end = page.indexOf("</div>", at);
    expect(page.slice(at, end), "수정이 상자 안에 있다").not.toContain("수정");
    expect(page, "수정 버튼이 사라졌다").toContain("수정");
  });

  it("★ 손님 안내는 그대로다 — 고를 것이 없는 사람에게는 상자를 안 그린다", () => {
    expect(page).toMatch(/로그인 없이 전체 결과물을 보고 있어요/);
  });
});

describe("모양 — 고른 칸이 눈에 띈다", () => {
  it("★★★ 선택된 칸에 바탕색이 깔린다 — 테두리 색만으로는 약하다", () => {
    const at = css.indexOf(".seg-btn[aria-pressed=");
    expect(at, "선택 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(at, at + 200)).toMatch(/background:/);
  });

  it("★★ 상자가 둘을 붙여 놓는다 — 사이에 선 하나, 바깥은 한 덩어리", () => {
    expect(css).toMatch(/\.seg\s*\{[^}]*inline-flex/);
    expect(css, "칸 사이 구분선이 없다").toMatch(/\.seg-btn \+ \.seg-btn\s*\{[^}]*border-left/);
  });

  it("★ 글자 크기는 저장소 눈금 안이다(12·14·16·18·28)", () => {
    const at = css.indexOf(".seg-btn {");
    const rule = css.slice(at, at + 300);
    const size = rule.match(/font-size:\s*(\d+)px/);
    if (size) expect([12, 14, 16, 18, 28]).toContain(Number(size[1]));
  });
});
