// ⑤영상 — **시킨 것 ↔ 나온 것** (2026-09-15, B안 이어서).
//
// ★★★ 이 화면이 이번 개편의 핵심이다. 왼쪽은 내가 시킨 것(스토리보드), 오른쪽은 나온 것
//   (영상) — 「내가 그린 대로 나왔나」를 한 화면에서 판단한다.
//
// ⚠️⚠️ **2026-08-25 사장님 지시를 뒤집는다.** 그때는 "영상이 나온 뒤에는 이 칸을 안
//   그린다"였다 — 재생기 아래에 **86px 네모**가 같은 것을 한 번 더 보여 주고 있었기
//   때문이다(중복). 지금은 그 칸이 86px 가 아니라 **나란히 선 큰 그림**이고, 하는 일도
//   중복이 아니라 **대조**다. 전제가 바뀌었으므로 되살린다.
//   ★ 되돌리려면 이 판을 지우고 `!cuts[0]?.video?.url &&` 를 되살리면 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/[id]/video/page.js", "utf8"));

describe("⑤영상 — 시킨 것 ↔ 나온 것", () => {
  it("★★★ 영상이 나온 뒤에도 **스토리보드가 남는다** — 대조할 것이 있어야 한다", () => {
    const a = page.indexOf("oneShot ? (");
    const b = page.indexOf("cuts.length > 0", a);
    const 통짜 = page.slice(a, b);
    expect(통짜, "통짜 갈래를 못 찾았다").toContain("sheet-view");
    // 옛 모양: 영상이 있으면 스토리보드를 지웠다.
    expect(통짜, "영상이 나오면 스토리보드를 지운다 — 대조할 것이 사라진다")
      .not.toMatch(/!cuts\[0\]\?\.video\?\.url\s*&&\s*sheetUrl/);
  });

  it("★★★ 둘이 **나란히** 선다 — 둘 다 있을 때만 두 칸", () => {
    expect(page, "두 칸 격자를 안 쓴다").toContain("rv-split");
    expect(page, "겉틀을 안 쓴다").toContain("rv-page");
    // 굽기 전에는 보여 줄 것이 스토리보드뿐이라 한 칸이다.
    expect(page, "굽기 전에도 두 칸이다 — 오른쪽이 빈 칸으로 선다")
      .toMatch(/playing\?\.video\?\.url[\s\S]{0,60}?is-two/);
  });

  it("★★ 굽는 중 덮개는 그대로 스토리보드 위에 얹힌다", () => {
    expect(page, "도는 표시가 사라졌다").toContain("frame-busy");
  });

  it("★★ 컷별 갈래의 썸네일 줄은 그대로다 — 그것은 고르는 자리다", () => {
    const b = page.indexOf("cuts.length > 0");
    expect(page.slice(b), "컷별 갈래의 칸까지 걷어냈다").toContain("up photo-mark");
  });
  // ★★★ 2026-09-16 사장님 지시 — 영상을 **판 높이에 맞춘다**(이전에는 230px 고정이라
  //   판만 크고 영상은 작아 아랫변이 크게 어긋났다). 재는 것은 **높이**다 — 폭을 잡으면
  //   9:16 영상이 칸을 넘는다. 상한은 판과 같은 560px 이어야 둘이 같은 자를 쓴다.
  it("★★★ 영상은 판 높이를 따른다 — 폭이 아니라 높이를 맞춘다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".rv-split > .vid-result");
    expect(at, ".rv-split 안 재생기 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule, "높이를 칸에 안 맞춘다").toMatch(/height:\s*100%/);
    expect(rule, "폭을 고정했다 — 비율이 정해야 한다").toMatch(/width:\s*auto/);
    expect(rule, "상한이 판(560px)과 다르다").toMatch(/max-height:\s*560px/);
    expect(rule, "가로로 넘칠 수 있다").toMatch(/max-width:\s*100%/);
  });

  // ★★★ 2026-09-16 저녁 사장님 지시 — 낮의 규칙만으로는 **판이 영상보다 작았다**.
  //   판은 가로로 넓은 격자(4×2 ≈ 1.125)라 같은 칸 폭에서 560 에 못 미친다.
  //   그래서 키를 하나 정해 두고(`--rv-media-h`) 둘 다 그 키로 세우고,
  //   영상 칸은 제 폭만큼만 차지해 **오른쪽 끝**에 붙는다.
  it("★★★ ⑤만의 규칙을 쓴다 — ②·④의 글 카드 짝은 건드리지 않는다", () => {
    expect(page, "⑤ 전용 표식이 없다 — 규칙이 ②시나리오까지 간다").toContain("rv-split--video");
  });

  it("★★★ 판과 영상이 **같은 키**로 선다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".rv-split--video.is-two");
    expect(at, "⑤ 전용 격자 규칙이 없다").toBeGreaterThan(-1);
    const grid = css.slice(at, css.indexOf("}", at));
    expect(grid, "키를 정하는 자리가 없다").toMatch(/--rv-media-h:/);
    expect(grid, "영상 칸이 제 폭만큼만 차지하지 않는다 — 양옆에 빈 자리가 남는다")
      .toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);

    for (const sel of [".rv-split--video > .sheet-view img", ".rv-split--video > .vid-result"]) {
      const i = css.indexOf(sel);
      expect(i, `${sel} 규칙이 없다`).toBeGreaterThan(-1);
      const rule = css.slice(i, css.indexOf("}", i));
      expect(rule, `${sel} 가 공통 키를 안 쓴다`).toMatch(/height:\s*var\(--rv-media-h\)/);
      expect(rule, `${sel} 에 옛 560 상한이 남아 키가 둘이다`).toMatch(/max-height:\s*none/);
      expect(rule, `${sel} 가 칸을 넘칠 수 있다`).toMatch(/max-width:\s*100%/);
    }
  });

  // ★ 실측으로 밟은 자리 둘 — 둘 다 없으면 좁은 화면에서 티가 난다.
  it("★★ 좁은 화면에서는 키를 낮추고, 판은 찌그러지지 않는다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css, "좁은 화면에서 키를 안 낮춘다 — 판이 제 칸을 못 채워 위아래가 빈다")
      .toMatch(/@media \(max-width: 1440px\) \{\s*\.rv-split--video\.is-two \{ --rv-media-h:/);
    const i = css.indexOf(".rv-split--video > .sheet-view img");
    expect(css.slice(i, css.indexOf("}", i)), "높이를 못 박은 그림에 object-fit 이 없다 — 좁은 칸에서 찌그러진다")
      .toMatch(/object-fit:\s*contain/);
  });

  it("★★ 판은 왼쪽 끝, 영상은 오른쪽 끝에 붙는다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const s = css.indexOf(".rv-split--video > .sheet-view {");
    expect(s, "판을 왼쪽에 붙이는 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(s, css.indexOf("}", s)), "판이 가운데 서서 왼쪽에 빈 자리가 남는다")
      .toMatch(/justify-content:\s*flex-start/);
    const v = css.indexOf(".rv-split--video > .vid-result");
    expect(css.slice(v, css.indexOf("}", v)), "영상이 오른쪽 끝에 안 붙는다")
      .toMatch(/justify-self:\s*end/);
  });
});
