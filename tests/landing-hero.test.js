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
// ★★ 주석을 걷은 판. 안 걷으면 **주석에 적어 둔 설명**을 코드로 착각한다 — 2026-09-10 에
//   세 번 밟았다(사이드바 · 벽 조건 · 여기). 설명에 `"use client"` 를 인용만 해도 걸렸다.
const jsxCode = jsx
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
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

describe("랜딩 — 만드는 법 세 걸음은 걷었다 (2026-09-10 사장님 지시)", () => {
  const page = readFileSync("app/home/page.js", "utf8");

  it("★★ 소재·시나리오·영상 생성 절이 **없다**", () => {
    for (const w of ["stage-steps", "stage-step", "STEPS"]) {
      expect(page, `${w} 가 아직 있다`).not.toContain(w);
    }
  });

  it("★★★ 죽은 규칙·토큰을 **남기지 않았다** — 쓰는 자리가 없는 것은 거짓말을 한다", () => {
    // 이 저장소의 규칙이다(09-09 에 소비자 0 이 된 토큰 넷을 같은 이유로 지웠다).
    for (const sel of [".home .stage-steps", ".home .stage-step", ".home .stage-n"]) {
      expect(css, `${sel} 규칙이 남았다`).not.toContain(sel + " ");
    }
    for (const tok of ["--stage-dim", "--stage-line"]) {
      expect(css, `${tok} 를 아직 쓴다`).not.toContain(`var(${tok})`);
      expect(css, `${tok} 정의가 남았다`).not.toMatch(new RegExp(`\\${tok}\\s*:`));
    }
  });
});

describe("랜딩 — 맨 위로 돌아가는 버튼", () => {
  it("★★★ 버튼이 있고 **맨 위를 가리킨다**", () => {
    expect(jsx, "맨 위로 버튼이 없다").toMatch(/stage-top/);
    expect(jsx, '맨 위 자리(#top)를 안 가리킨다').toMatch(/href="#top"/);
    expect(readFileSync("app/home/page.js", "utf8"), '가리킬 자리(id="top")가 없다')
      .toMatch(/id="top"/);
  });

  it("★★★ **자바스크립트를 안 쓴다** — 이 화면은 09-10 에 클라이언트 부품을 0으로 만들었다", () => {
    // 랜딩은 서버가 통째로 그려 내려준다(첫 방문 7.5초 → 1.6초). 스크롤을 감지하려고
    // "use client" 를 들이면 그 최적화가 통째로 깨진다 — 그래서 자리는 CSS 가 잡는다.
    expect(jsxCode, "랜딩 부품이 클라이언트가 됐다").not.toMatch(/^\s*["']use client["']/m);
    expect(jsxCode, "스크롤을 감지하는 코드가 들어왔다").not.toMatch(/scrollTo|onScroll|useEffect/);
  });

  it("★★★ 덮개를 눌러도 **아무 일도 안 일어난다** (2026-09-10 사장님 지시)", () => {
    // 그전에는 덮개 전체(inset:0)가 그 편의 상세로 가는 링크였다 — 첫 화면을 보려고
    // 누른 손님이 엉뚱한 데로 갔다. 재생 표시도 함께 걷었다(안 눌리는 재생 버튼은
    // 없는 것보다 나쁘다 — 누를 수 있다고 약속해 놓고 안 지킨다).
    expect(jsxCode, "덮개에 아직 재생 링크가 있다").not.toMatch(/stage-cover-play/);
    expect(jsxCode, "안 눌리는 재생 표시가 남았다").not.toMatch(/stage-bigplay/);
    expect(css, "죽은 규칙이 남았다").not.toContain(".home .stage-cover-play ");
  });

  it("★★ **오른쪽**에 서고, 벽을 볼 때만 보인다", () => {
    const top = rule(".home .stage-top");
    expect(top, ".home .stage-top 규칙이 없다").toBeTruthy();
    // sticky 라 벽(.stage-band) 안에서만 떠 있다 — 히어로에서는 안 보인다(JS 없이).
    expect(top, "sticky 가 아니다 — 히어로에서도 떠 있게 된다").toMatch(/position:\s*sticky/);
    expect(top, "오른쪽으로 안 붙는다").toMatch(/margin-left:\s*auto/);
    // ★ 벽은 기둥(max-width 1400px)이라, 그냥 두면 넓은 모니터에서 **글 칸의 오른쪽**에
    //   선다. 화면 끝까지 빼내야 한다(사장님 지시 "우측 끝").
    expect(top, "화면 끝까지 안 나간다 — 넓은 모니터에서 안쪽에 선다").toMatch(/50vw/);
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
