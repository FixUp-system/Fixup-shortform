// 시각 규칙 검사 — 스펙 docs/superpowers/specs/2026-07-27-visual-magnific-design.md
// 시각 변경은 단위 테스트로 잡히지 않는다. 소스를 직접 훑어 규칙 위반을 잡는다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|jsx|css)$/.test(p)) out.push(p);
    }
  };
  for (const r of ROOTS) walk(r);
  return out;
}

function readAll() {
  return sourceFiles().map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

// :root 안은 토큰을 정의하는 곳이라 hex가 있어야 한다. 그 블록만 도려낸다.
// 주석도 함께 지운다 — 주석 안의 설명이 검사에 걸리면 안 되고,
// 선택자 추출 검사에서 주석이 선택자에 섞이는 것도 막는다.
function cssWithoutRoot() {
  return readFileSync("app/globals.css", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/:root\s*\{[^}]*\}/g, "");
}

describe("색", () => {
  it(":root 밖에는 hex 색 리터럴이 없다", () => {
    const offenders = [];

    for (const m of cssWithoutRoot().matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      offenders.push(`globals.css: ${m[0]}`);
    }
    for (const { path, text } of readAll()) {
      if (path.endsWith(".css")) continue;
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("토큰이 스펙 값과 같다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const expected = {
      "--bg": "#1A1A1A",
      "--surface": "#232323",
      "--surface2": "#2E2E2E",
      "--deep": "#101010",
      "--line": "#3A3A3A",
      "--ink": "#F5F5F5",
      "--ink-soft": "#A0A0A0",
      "--accent": "#FF58AE",
      "--btn": "#F5F5F5",
      "--btn-ink": "#1A1A1A",
      "--good": "#57B383",
      "--warn": "#E5B93C",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(css, `${name} 토큰`).toMatch(
        new RegExp(`${name}\\s*:\\s*${value}\\s*;`, "i")
      );
    }
  });
});

describe("형태", () => {
  it("그라디언트를 쓰지 않는다", () => {
    const offenders = [];
    for (const { path, text } of readAll()) {
      for (const m of text.matchAll(/(linear|radial|conic)-gradient/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("border-radius는 토큰 세 개와 50%만 쓴다", () => {
    const ALLOWED = ["var(--r-card)", "var(--r-ctl)", "var(--r-pill)", "50%", "inherit", "0"];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/border(-[a-z]+)*-radius:\s*([^;]+);/g)) {
      const value = m[2].trim();
      // "var(--r-ctl) var(--r-ctl) 0 0" 처럼 여러 값을 쓰는 경우도 통과시킨다
      if (!value.split(/\s+/).every((p) => ALLOWED.includes(p))) {
        offenders.push(value);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("주 실행 버튼", () => {
  const cssRule = (selector) => {
    const re = new RegExp(
      `(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
      "m"
    );
    const m = cssWithoutRoot().match(re);
    return m ? m[2] : "";
  };

  it(".cta는 --btn 바탕에 --btn-ink 글씨다", () => {
    const rule = cssRule(".cta");
    expect(rule).toMatch(/background:\s*var\(--btn\)/);
    expect(rule).toMatch(/color:\s*var\(--btn-ink\)/);
  });

  it("액센트는 진행 중 단계 표시에만 쓴다", () => {
    const users = [];
    for (const m of cssWithoutRoot().matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      if (/var\(--accent/.test(body)) users.push(selector.trim());
    }
    // 화면에서 가장 강한 색은 사장님이 가장 알아야 할 것 — 지금 몇 단계인가 — 을 가리킨다.
    expect(users.length, "액센트를 쓰는 자리가 하나도 없다").toBeGreaterThan(0);
    expect(users.filter((s) => !s.includes(".side-step.on"))).toEqual([]);
  });
});

describe("타이포", () => {
  it("font-weight는 400 · 600 · 700만 쓴다", () => {
    const ALLOWED = ["400", "600", "700", "inherit", "normal"];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/font-weight:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (!ALLOWED.includes(v)) offenders.push(v);
    }
    expect(offenders).toEqual([]);
  });

  it("font-size는 12 · 14 · 16 · 18 · 28px만 쓴다", () => {
    const ALLOWED = ["12px", "14px", "16px", "18px", "28px", "inherit"];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/font-size:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (!ALLOWED.includes(v)) offenders.push(v);
    }
    expect(offenders).toEqual([]);
  });
});

describe("인라인 스타일", () => {
  it("style={{ }} 는 10곳 이하다", () => {
    let count = 0;
    const perFile = [];
    for (const { path, text } of readAll()) {
      const n = [...text.matchAll(/style=\{\{/g)].length;
      if (n > 0) perFile.push(`${path}: ${n}`);
      count += n;
    }
    expect(count, perFile.join("\n")).toBeLessThanOrEqual(10);
  });
});

// 아이콘·단계 번호는 소스에 글리프로 남기 쉽다 — 색·타이포와 달리 CSS 에 흔적이 없어
// 눈으로 보기 전에는 아무도 모른다. 실제로 이 단정이 없는 동안 화면 본문 일곱 자리가
// 원문자로 남았고, 사이드바가 "4 이미지"인데 버튼은 "④ 이미지 만들러 가기"였다.
describe("글리프", () => {
  // 주석은 문서적 표현이라 원문자를 허용한다(lib/steps.js 의 "①자료는 ..." 등).
  // 화면에 렌더되는 문자열만 판정한다.
  const stripComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("화면 문자열에 단계 원문자가 없다", () => {
    const offenders = [];
    for (const { path, text } of readAll()) {
      if (path.endsWith(".css")) continue;
      for (const m of stripComments(text).matchAll(/[①②③④⑤⑥⑦⑧⑨]/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("사이드바 아이콘이 유니코드 글리프가 아니다", () => {
    const offenders = [];
    for (const { path, text } of readAll()) {
      if (path.endsWith(".css")) continue;
      for (const m of stripComments(text).matchAll(/[⌂✦▤◫◷⚙⏻▶]/g)) {
        offenders.push(`${path}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("서체", () => {
  it("layout.js 가 폰트를 실제로 주입한다", () => {
    const layout = readFileSync("app/layout.js", "utf8");
    expect(layout).toMatch(/from ["']geist\/font\/sans["']/);
    expect(layout).toMatch(/from ["']next\/font\/local["']/);
  });

  it("body 는 주입된 폰트 변수를 쓴다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/var\(--font-geist-sans\)/);
    expect(css).toMatch(/var\(--font-pretendard\)/);
  });
});
