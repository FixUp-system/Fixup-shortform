// 밝은 화면은 **고르는 사람만** 본다 — 기본은 지금 그대로 어둡다.
//
// 사장님 지시(2026-08-18): "다크가 기본이고 밝은 팔레트를 선택적으로 변경할 수 있도록."
//
// ★ 이 순서가 위험을 크게 줄인다. 기본 화면이 안 바뀌므로 지금 통과 중인 화면 계약이
//   전부 그대로 서고, 밝은 벌은 **덮어쓰는 벌**이라 빠뜨린 토큰이 있으면 그 자리만 어둡게
//   남는다(전부 무너지지 않는다). 반대로 밝은 것을 기본으로 삼았다면 빠뜨린 토큰이
//   흰 바탕 위의 흰 글자가 된다.
//
// ★ 색만 바뀐다. 치수(--ctl-*)·간격(--sp-*)·모서리(--r-*)는 테마와 무관하다 —
//   테마마다 버튼 높이가 다르면 그건 테마가 아니라 다른 화면이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const block = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
};
const tokensIn = (text) => [...text.matchAll(/^\s+(--[a-z0-9-]+):/gm)].map((m) => m[1]);

// 색 토큰 — 테마가 바꾸는 것들. 치수·간격·모서리는 여기 없다.
const COLOR_TOKENS = [
  "--bg", "--surface", "--surface2", "--deep", "--line", "--ink", "--ink-soft",
  "--accent", "--accent-soft", "--btn", "--btn-ink",
  "--good", "--good-soft", "--warn", "--warn-soft",
];

describe("테마 — 기본은 어둡다", () => {
  it("★★ 지금 팔레트가 그대로 기본이다 — 고르지 않은 사장님 화면은 한 픽셀도 안 바뀐다", () => {
    const root = block(":root");
    expect(root, "바탕색이 바뀌었다").toMatch(/--bg:\s*#1A1A1A/);
    expect(root, "카드색이 바뀌었다").toMatch(/--surface:\s*#232323/);
    expect(root, "글자색이 바뀌었다").toMatch(/--ink:\s*#F5F5F5/);
  });

  it("★★ 밝은 벌이 색 토큰을 **하나도 안 빠뜨린다**", () => {
    const light = block(':root[data-theme="light"]');
    expect(light, "밝은 팔레트가 없다").toBeTruthy();
    const defined = tokensIn(light);
    for (const t of COLOR_TOKENS) {
      expect(defined, `밝은 벌에 ${t} 가 없다 — 그 자리만 어두운 채로 남는다`).toContain(t);
    }
  });

  it("★ 밝은 벌은 색만 바꾼다 — 치수·간격·모서리는 테마가 아니다", () => {
    const light = block(':root[data-theme="light"]');
    for (const t of tokensIn(light)) {
      expect(/^--(ctl|sp|r)-/.test(t), `밝은 벌이 ${t} 를 바꾼다 — 테마마다 다른 화면이 된다`)
        .toBe(false);
    }
  });
});

describe("고르는 장치", () => {
  const shell = readFileSync("components/AppShell.jsx", "utf8");
  const layout = readFileSync("app/layout.js", "utf8");
  const files = [shell, layout, readFileSync("components/UserMenu.jsx", "utf8")].join("\n");

  it("★ 고르는 자리가 화면에 있다", () => {
    expect(files, "테마를 바꾸는 자리가 없다").toMatch(/data-theme/);
  });

  it("★★ 고른 것을 기억한다 — 새로고침마다 되돌아가면 고른 적이 없는 것과 같다", () => {
    expect(files, "선택을 저장하지 않는다").toMatch(/localStorage/);
  });

  it("★★ 첫 칠에서 결정된다 — 나중에 칠하면 어두운 화면이 번쩍인다", () => {
    // 리액트가 붙기 전에 <html> 에 표를 찍어야 한다. 그 일을 하는 것은 인라인 스크립트뿐이다.
    expect(layout, "첫 칠 전에 테마를 정하는 스크립트가 없다").toMatch(/dangerouslySetInnerHTML/);
    expect(layout, "저장된 값을 첫 칠에서 안 읽는다").toMatch(/localStorage/);
  });
});

describe("경계선", () => {
  it("★★ 자막 미리보기 무대는 밝은 테마에서도 어둡다", () => {
    // 그 자리는 **실제 영상 위에 자막이 어떻게 얹히는지**를 판단하는 곳이다. 바탕이 밝으면
    // 흰 자막이 안 보여, 사장님이 영상에서는 멀쩡한 자막을 흰색이 아닌 것으로 고치게 된다.
    expect(css, "무대 전용 색이 없다 — 테마를 따라 밝아진다").toMatch(/--stage-dark:/);
    // 밝은 벌이 그 값을 덮으면 경계선이 사라진다
    expect(block(':root[data-theme="light"]'), "밝은 벌이 무대 색을 덮는다")
      .not.toMatch(/--stage-dark/);
    // 그리고 실제로 그 자리에 쓰여야 한다 — 토큰만 있고 안 쓰면 아무 일도 안 한다
    expect(css, "완성 화면 무대가 그 색을 안 쓴다").toMatch(/\.done-stage \.done-preview \{[^}]*var\(--stage-dark\)/);
  });
});
