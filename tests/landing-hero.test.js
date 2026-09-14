// 랜딩은 **제품 도해로 연다** (2026-09-14 사장님이 시안 둘 중 이쪽을 골랐다).
//
// ★★★ 이 판은 2026-09-10 의 "히어로가 화면을 꽉 채운다"를 **뒤집은 것**이다. 그때의 요구
//   둘("꽉 채워라" · "만든 영상도 보이게")은 서로 당겨서, 꽉 찬 사진 한 장 + 내려가는 표시로
//   풀었었다. 09-14 에 전제가 바뀌었다 — 첫 화면이 사진이면 **무엇을 만들어 주는 곳인지**가
//   안 보인다. 그래서 덮개를 걷고 도해(입력 → 두 갈래 → 같은 영상)를 그 자리에 놓았다.
//   지운 것: `.stage-cover` · `.stage-cover-img` · `.stage-down` 과 그 움직임 · `--stage-bg`.
//   ⚠️ 되살리려거든 **뒤집힌 줄 알고** 되살려라 — 값은 git 이력에 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const page = readFileSync("app/home/page.js", "utf8");
const jsx = readFileSync("components/HomeMade.jsx", "utf8");
// ★★ 주석을 걷은 판. 안 걷으면 **주석에 적어 둔 설명**을 코드로 착각한다 — 2026-09-10 에
//   세 번 밟았다(사이드바 · 벽 조건 · 여기). 설명에 `"use client"` 를 인용만 해도 걸렸다.
const codeOf = (s) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const jsxCode = codeOf(jsx);
const pageCode = codeOf(page);
const rule = (sel) => {
  const i = css.indexOf(sel + " {");
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

describe("랜딩 — 화면을 채우던 덮개는 걷었다 (2026-09-14)", () => {
  it("★★★ 덮개를 그리는 코드가 **없다**", () => {
    for (const w of ["stage-cover", "stage-down"]) {
      expect(pageCode, `${w} 가 화면에 남았다`).not.toContain(w);
      expect(jsxCode, `${w} 가 벽 부품에 남았다`).not.toContain(w);
    }
  });

  it("★★★ 죽은 규칙·토큰을 **남기지 않았다** — 쓰는 자리가 없는 것은 거짓말을 한다", () => {
    // 이 저장소의 규칙이다(09-09 에 소비자 0 이 된 토큰 넷을, 09-10 에 세 걸음 규칙을
    // 같은 이유로 지웠다).
    for (const sel of [".home .stage-cover", ".home .stage-down", ".home .stage-cover-img"]) {
      expect(css, `${sel} 규칙이 남았다`).not.toContain(sel + " ");
    }
    for (const tok of ["--stage-dim", "--stage-line", "--stage-bg"]) {
      expect(css, `${tok} 를 아직 쓴다`).not.toContain(`var(${tok})`);
      expect(css, `${tok} 정의가 남았다`).not.toMatch(new RegExp(`\\${tok}\\s*:`));
    }
  });

  it("★★★ 랜딩이 **밝은 벌**이다 — 어두운 것은 두 갈래 절 하나뿐", () => {
    // 09-09 밤에 화면 전체를 검게 칠한 것은 덮개 때문이었고, 덮개가 사라지며 이유도 사라졌다.
    expect(rule(".home"), "랜딩 뿌리가 바탕색을 안 쓴다").toMatch(/background:\s*var\(--bg\)/);
    const dark = [...css.matchAll(/(\.home [^{]*)\{[^}]*background:\s*var\(--stage-dark\)/g)]
      .map((m) => m[1].trim());
    expect(dark, "어두운 면이 두 갈래 절 말고 또 있다(또는 하나도 없다)").toEqual([".home .land-two"]);
  });
});

describe("랜딩 — 첫 화면이 제품을 말한다 (2026-09-14 뒤집힘)", () => {
  it("★★★ 머리글이 **있다** — 09-09 에 걷었던 것이 돌아왔다", () => {
    // 그때는 "결과물이 유일한 주인공"이라 큰 글자를 걷었다. 시안 검토에서 사장님이
    // "무엇을 해 주는 곳인지 먼저"로 돌아섰다 — 없어진 것을 지키던 판을 뒤집는다.
    expect(pageCode, "전시층 제목이 없다").toMatch(/className="display"/);
    expect(pageCode, "리드 문장이 없다").toMatch(/className="land-lede"/);
  });

  it("★★ 걸음 띠가 **순서를 말한다** — 01 · 02 · 03", () => {
    // 번호는 장식이 아니라 정보다(실제 순서). 09-10 에 지운 절과는 **다른 절**이다 —
    // 그때 지운 것은 소재·시나리오·영상 생성이고 이름도 `.stage-step*` 이었다.
    for (const n of ["STEP 01", "STEP 02", "STEP 03"]) {
      expect(pageCode, `${n} 이 없다`).toContain(n);
    }
    expect(css, "걸음 띠의 자리를 안 잡았다").toContain(".home .land-steps ");
    expect(css, "옛 이름이 되살아났다").not.toContain(".home .stage-steps ");
  });

  it("★★★ 도해가 **세 칸**이다 — 적는 자리 · 두 갈래 · 모이는 결과", () => {
    for (const c of ["land-panel", "land-fork", "land-out"]) {
      expect(pageCode, `${c} 가 없다`).toContain(c);
    }
    expect(rule(".home .land-diagram"), "세 칸으로 안 눕는다")
      .toMatch(/grid-template-columns:\s*[^;]*minmax/);
  });

  it("★★ 도해는 **그림이다** — 진짜 입력칸을 두지 않는다", () => {
    // 여기서 누르게 만들면 랜딩이 앱 흉내를 내다 만다. 진짜 입력은 [시작하기] 뒤에 있다.
    expect(pageCode, "입력 요소가 랜딩에 있다").not.toMatch(/<(input|textarea|select|button)\b/);
  });
});

describe("랜딩 — 두 갈래 절 (2026-09-14 사장님 지시)", () => {
  it("★★★ 두 카드가 **같은 크기**다 — 한쪽만 길면 그쪽이 정답처럼 읽힌다", () => {
    expect(rule(".home .land-paths"), "늘여서 맞추지 않는다")
      .toMatch(/align-items:\s*stretch/);
    // 늘인 카드에서 마지막 줄까지 같은 높이에 서게 하는 짝이다(없으면 카드만 커진다).
    expect(rule(".home .land-pwhen"), "마지막 줄이 바닥에 안 붙는다")
      .toMatch(/margin:\s*auto\s+0\s+0/);
  });

  it("★★★ 뱃지가 **알약**이다 — 글자만으로는 제목에 묻혔다", () => {
    const tag = rule(".home .land-ptag");
    expect(tag, ".home .land-ptag 규칙이 없다").toBeTruthy();
    expect(tag, "바탕이 없다 — 다시 글자로 돌아갔다").toMatch(/background:\s*var\(--/);
    expect(tag, "알약 모서리가 아니다").toMatch(/border-radius:\s*var\(--r-pill\)/);
    // 두 길의 **무게는 같다**(색만 다르다) — 한쪽만 강조하면 다른 길이 없는 것처럼 읽힌다.
    expect(rule(".home .land-path--deep .land-ptag"), "단계별 뱃지가 원클릭과 다른 급이다")
      .toMatch(/background:\s*var\(--accent\)/);
  });
});

describe("랜딩 — 맨 위로 돌아가는 버튼", () => {
  it("★★★ 버튼이 있고 **맨 위를 가리킨다**", () => {
    expect(jsx, "맨 위로 버튼이 없다").toMatch(/stage-top/);
    expect(jsx, '맨 위 자리(#top)를 안 가리킨다').toMatch(/href="#top"/);
    expect(page, '가리킬 자리(id="top")가 없다').toMatch(/id="top"/);
  });

  it("★★★ **자바스크립트를 안 쓴다** — 이 화면은 09-10 에 클라이언트 부품을 0으로 만들었다", () => {
    // 랜딩은 서버가 통째로 그려 내려준다(첫 방문 7.5초 → 1.6초). 스크롤을 감지하려고
    // "use client" 를 들이면 그 최적화가 통째로 깨진다 — 그래서 자리는 CSS 가 잡는다.
    for (const [name, code] of [["벽 부품", jsxCode], ["화면", pageCode]]) {
      expect(code, `랜딩 ${name}이 클라이언트가 됐다`).not.toMatch(/^\s*["']use client["']/m);
      expect(code, `${name}에 스크롤을 감지하는 코드가 들어왔다`).not.toMatch(/scrollTo|onScroll|useEffect/);
    }
  });

  it("★★ **오른쪽**에 서고, 벽을 볼 때만 보인다", () => {
    const top = rule(".home .stage-top");
    expect(top, ".home .stage-top 규칙이 없다").toBeTruthy();
    // sticky 라 벽(.stage-band) 안에서만 떠 있다 — 위쪽 절들에서는 안 보인다(JS 없이).
    expect(top, "sticky 가 아니다 — 도해에서도 떠 있게 된다").toMatch(/position:\s*sticky/);
    expect(top, "오른쪽으로 안 붙는다").toMatch(/margin-left:\s*auto/);
    // ★ 벽은 기둥(max-width 1400px)이라, 그냥 두면 넓은 모니터에서 **글 칸의 오른쪽**에
    //   선다. 화면 끝까지 빼내야 한다(사장님 지시 "우측 끝").
    expect(top, "화면 끝까지 안 나간다 — 넓은 모니터에서 안쪽에 선다").toMatch(/50vw/);
  });
});

describe("랜딩 — 움직임", () => {
  it("★★★ 움직임은 **끄겠다는 사람에게는 멈춘다**", () => {
    // 이 저장소는 스스로 도는 움직임을 아껴 쓴다. 09-14 에 덮개가 사라지며 스스로 도는
    // 움직임(내려가라는 표시)도 함께 사라졌고, 남은 것은 hover 전이뿐이다 — 그래도
    // 끄는 길은 열어 둔다.
    expect(css, "prefers-reduced-motion 을 안 본다").toMatch(/prefers-reduced-motion/);
  });
});
