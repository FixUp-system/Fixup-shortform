// 히어로는 **첫 화면을 꽉 채운다** (2026-09-10 사장님: "히어로 페이지가 화면 전체에
// 꽉 찼으면 좋겠어. 그리고 만들어진 영상들을 확인할 수 있게").
//
// ★★ 요구가 둘이고 서로 당긴다 — 꽉 채우면 아래 영상 벽이 화면 밖으로 밀린다.
//   그래서 짝이 되는 장치가 필요하다: **아래에 더 있다고 말하는 표시** 하나.
//   그 표시가 없으면 손님은 첫 화면이 전부인 줄 알고 나간다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const jsx = readFileSync("components/HomeMade.jsx", "utf8");
const rule = (sel) => {
  const i = css.indexOf(sel + " {");
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

describe("히어로 — 첫 화면을 꽉 채운다", () => {
  it("★★★ 높이가 **화면 전체**다 — 880px 에서 멈추지 않는다", () => {
    const cover = rule(".home .stage-cover");
    expect(cover, ".stage-cover 규칙이 없다").toBeTruthy();
    expect(cover, "아직 clamp 로 상한이 걸려 있다 — 큰 화면에서 안 찬다")
      .not.toMatch(/height:\s*clamp\(/);
    expect(cover, "화면 높이를 안 쓴다").toMatch(/height:\s*100/);
  });

  it("★★★ `dvh` 를 쓴다 — 모바일에서 `vh` 는 화면보다 크다", () => {
    // 모바일 브라우저의 `100vh` 는 주소창이 **접힌** 높이라, 주소창이 보이는 동안
    // 히어로가 화면보다 커져 아래가 잘린다. `dvh` 는 지금 보이는 높이를 따른다.
    // ★ 옛 브라우저를 위해 `vh` 를 먼저 적고 `dvh` 로 덮는다(둘 다 있어야 한다).
    const cover = rule(".home .stage-cover");
    expect(cover, "100vh 폴백이 없다").toMatch(/height:\s*100vh/);
    expect(cover, "100dvh 가 없다 — 모바일에서 잘린다").toMatch(/height:\s*100dvh/);
  });
});

describe("히어로 — 아래에 더 있다고 말한다", () => {
  it("★★★ 내려가는 표시가 **있다** — 없으면 첫 화면이 전부인 줄 안다", () => {
    expect(jsx, "내려가는 표시가 없다").toMatch(/stage-down/);
    expect(rule(".home .stage-down"), "그 표시의 자리를 안 잡았다").toBeTruthy();
  });

  it("★★ 사진 위에 서므로 **흰 글자**다 — 바탕색을 따라가면 안 된다", () => {
    expect(rule(".home .stage-down"), "사진 위에서 바탕색을 따라간다")
      .toMatch(/color:\s*var\(--on-media\)/);
  });

  it("★★★ 움직임은 **끄겠다는 사람에게는 멈춘다**", () => {
    // 이 저장소는 스스로 도는 움직임을 아껴 쓴다. 여기 하나를 두는 이유는 그것이
    // "아래에 더 있다"를 말하는 유일한 장치라서다 — 대신 끄는 길을 연다.
    expect(css, "prefers-reduced-motion 을 안 본다").toMatch(/prefers-reduced-motion/);
  });
});
