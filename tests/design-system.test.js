// 시각 규칙 검사 — 스펙 docs/superpowers/specs/2026-09-08-light-theme-mcs-design.md
// (2026-09-08 에 갈아탔다. 그 전 스펙 `2026-07-27-visual-magnific-design.md`("Magnific 다크")는
//  어두운 벌의 것이라, 이 판이 재는 값과 더는 같은 것을 가리키지 않는다.)
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
// ★ 2026-09-08 — 정의 블록은 다시 **하나**다(밝은 벌 한 벌). 2026-08-18 에 밝은 팔레트가
//   `:root[data-theme="light"]` 로 덮어쓰던 시절 정의 블록이 둘이었고, 아래 정규식의
//   `(\[[^\]]*\])?` 가 그 흔적이다 — 속성 선택자가 붙은 :root 도 함께 도려낸다.
//   안 도려내면 "토큰으로만 색을 쓴다"는 이 규칙이 **정의 자체를 위반으로 잡는다**.
// 주석도 함께 지운다 — 주석 안의 설명이 검사에 걸리면 안 되고,
// 선택자 추출 검사에서 주석이 선택자에 섞이는 것도 막는다.
function cssWithoutRoot() {
  return readFileSync("app/globals.css", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/:root(\[[^\]]*\])?\s*\{[^}]*\}/g, "");
}

// ── 규칙 블록 자르기 + 전시층(.display) 면제 판정 — **한 자리에서만** ──────────────
// 2026-09-08. 글자가 두 층이 되면서(앱층 = 작업 화면 · 전시층 = 보여 주는 화면) 같은
// 면제 판정을 보는 자리가 넷이 됐다: 전시층 굵기 판 · 옛 굵기 판 · 옛 크기 판 · 액센트 판.
// 네 벌로 적으면 언젠가 갈리고, 갈리는 쪽은 대개 **느슨한 쪽**이라 그물이 조용히 뚫린다.
//
// ★ cssWithoutRoot() 로 재는 것이 핵심이다(주석이 지워진 본문). 날 것에서 재면 규칙
//   **바로 위 주석**이 선택자로 딸려 들어와, 그 주석이 ".display" 를 언급하기만 해도
//   아래 면제 조건을 통과한다. 이 저장소는 규칙 위에 이유를 적는 문화라 그 배치가
//   흔하다 — 실제로 `/* 전시층(.display)은 ... */` 한 줄을 위에 붙이자 900 짜리 위반이
//   그대로 통과했다(2026-09-08 실측). 그러면 "항상 참"인 빈 그물이 된다.
function cssRules() {
  const css = cssWithoutRoot()
    // @media·@supports 껍데기를 벗긴다. 안 벗기면 그 안의 첫 규칙이 껍데기 이름
    // ("@media (max-width: 560px)")을 선택자로 달고 나와, 전시층을 반응형으로 조정하는
    // 순간 이 판이 애먼 곳에서 빨개진다.
    .replace(/@(media|supports)[^{]*\{/g, "");

  const rules = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();

    // 면제는 **조각마다** 따진다. 쉼표 목록을 통째로 보면 `h1, .display { … }` 에서
    // .display 하나가 h1 까지 데리고 빠져나간다 — 작업 화면의 h1 이 굵어지는 그 사고를
    // 이 판이 막으려고 있는 것이다.
    // 그리고 `.display` 는 **클래스 이름 그대로**여야 한다. 부분 문자열로 보면
    // `.displayed`·`.display-none` 처럼 전시층과 아무 상관없는 이름이 면제된다.
    // (`.display-xl` 같은 전시층 **변종**도 여기서는 막힌다. 그것은 실수가 아니라 결정이다 —
    //  스펙이 못 박은 것은 ".display 안에서만"이고, 변종이 필요해지면 이 판을 고쳐
    //  **의도적으로** 여는 편이 낫다. 그 비용을 감수한다.)
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    const display = parts.length > 0 && parts.every((s) => /\.display(?![\w-])/.test(s));

    // ★★ 2026-09-08(Task 4) — 면제가 **둘**이 됐다. 액센트만 범위가 다르기 때문이다.
    //   · display — 전시층 글자(크기·굵기). 액센트도 여기 포함된다(`.display em`).
    //   · showcase — **보여 주는 화면 전체**(home). 액센트 판만 이것을 본다.
    //
    //   왜 하나로 안 묶나. 홈도 글자 크기·굵기는 앱층 규율(12·14·16·18·30 / 400·600·700)을
    //   그대로 지켜야 한다 — 묶으면 홈이 그 그물에서 통째로 빠져 30px·900 짜리 카드 제목이
    //   조용히 통과한다. 반대로 액센트는 홈에서 자유롭다: 그 화면에는 사이드바 스테퍼가
    //   없어 "지금 몇 단계인가"와 경쟁할 상대가 아예 없다.
    //
    //   ★ 판정은 **이름이 아니라 자리**로 한다. `^\.home-` 로 재면 보관함 머리인
    //     `.home-header` 까지 면제된다 — 이름만 같은 **앱층** 화면이라 거기서 액센트가
    //     새면 잡아야 한다. 그래서 `.home` 뿌리 아래임을 요구한다(`.home` 뒤가 낱말
    //     문자나 하이픈이면 안 된다). CSS 쪽이 그 뿌리를 실제로 적는다.
    const showcase =
      display ||
      (parts.length > 0 && parts.every((s) => /^\.home(?![\w-])/.test(s)));

    rules.push({ selector, body: m[2], display, showcase });
  }
  return rules;
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
      "--bg": "#F5F4ED",
      "--surface": "#FFFFFF",
      "--surface2": "#FAF9F5",
      "--deep": "#EFEDE4",
      "--line": "#E8E6DC",
      "--ink": "#141413",
      "--ink-soft": "#5E5D59",
      // ★ 이 둘은 **벌을 안 탄다** — 사진 위 글자와 자막 무대는 바탕색과 무관하다.
      //   그래서 벌을 갈 때 같이 갈리면 안 되고, 기대 목록에 고정해 둔다(2026-09-08).
      "--on-media": "#FFFFFF",
      "--accent": "#B0446A",
      "--btn": "#B0446A",
      "--btn-ink": "#FFFFFF",
      "--good": "#0E7C57",
      "--warn": "#9A6400",
      "--stage-dark": "#101010",
      // ★★ 2026-09-09 — 여기 있던 셋(--band · --band-ink · --accent-fill)을 **뺐다.**
      //   결과물 띠가 어두울 때만 쓰이던 값인데 그 띠가 밝은 면(--deep)이 되며 소비자가
      //   0 이 됐고, 토큰도 함께 지웠다(app/globals.css :root 의 주석에 옛 값이 있다).
      //   ⚠️ 이 표는 **있어야 할 토큰**만 적는다 — 없어진 토큰을 남겨 두면 판이 "지우지
      //   마라"고 말하게 되어, 쓰지도 않는 색을 영원히 붙들어 둔다.
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(css, `${name} 토큰`).toMatch(
        new RegExp(`${name}\\s*:\\s*${value}\\s*;`, "i")
      );
    }
  });
});

// ★★ 2026-09-08 — 이 두 단정은 tests/theme-light.test.js 에 살던 것이다. 그 파일은 "밝은
//   팔레트가 별도 블록"이라는 전제 위에 서 있어 벌이 하나가 되며 지웠는데, **이 둘만은
//   팔레트와 무관한 성질**이라 함께 사라지면 안 됐다.
//
//   지키는 것: **자막을 판단하는 무대는 벌이 밝아져도 어둡다.** 그 자리는 실제 영상 위에
//   자막이 어떻게 얹히는지 보는 곳이라, 바탕이 밝으면 흰 자막이 안 보여 사장님이
//   **영상에서는 멀쩡한 자막**을 흰색이 아닌 것으로 고치게 된다.
//   "보는 면은 어둡게, 조작하는 면만 밝게" — 이 개편의 경계선이다.
describe("경계선 — 자막 무대는 벌을 안 탄다", () => {
  it("★★ 무대 전용 색 토큰이 :root 에 있다", () => {
    const root = readFileSync("app/globals.css", "utf8").match(/:root\s*\{[^}]*\}/);
    expect(root, ":root 블록을 못 찾았다 — 이 판이 낡았다").not.toBeNull();
    expect(root[0], "--stage-dark 가 없다 — 무대가 바탕색을 따라 밝아진다")
      .toMatch(/--stage-dark:\s*#[0-9a-fA-F]{3,8}\s*;/);
  });

  it("★★ 완성 화면 무대가 그 색을 실제로 쓴다 — 토큰만 있고 안 쓰면 아무 일도 안 한다", () => {
    // 주석이 지워진 본문에서 잰다 — 그 규칙 안의 주석이 토큰 이름을 언급하는 것만으로
    // 단정이 통과하면 안 된다(실제로 그 자리에 "--stage-dark 주석 참고"가 적혀 있다).
    expect(cssWithoutRoot(), ".done-stage .done-preview 가 무대 색을 안 쓴다")
      .toMatch(/\.done-stage \.done-preview \{[^}]*background:\s*var\(--stage-dark\)/);
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
    // ★ 2026-09-08(Task 3) — **앱층에서만** 그렇다. 전시층(`.display em`)은 액센트를 쓴다.
    //   그 자리(home · 로그인 전)에는 사이드바 스테퍼가 아예 없어서 "지금 몇 단계인가"와
    //   경쟁할 상대가 없다 — 앱층 안에서 가장 강한 색이 하나뿐이라는 성질은 그대로다.
    //   면제 판정은 cssRules() 하나가 한다(옛 굵기 판·옛 크기 판과 같은 정의를 본다).
    // ★★ 2026-09-08(Task 4) — 그 면제를 **화면 단위**로 넓혔다(showcase). 홈이 결과물로
    //   열리며 액센트를 쓰는 자리가 셋 늘었다: 띠의 눈썹(2026-09-09 부터 --accent) · 도구 카드의
    //   경로 칩 · 작동 원리의 번호. 셋 다 전시층 **글자**가 아니라 전시 **화면의 부속**이라
    //   `.display` 면제로는 못 지난다. 크기·굵기 판은 여전히 홈을 잰다(cssRules 주석 참고).
    const users = [];
    for (const { selector, body, showcase } of cssRules()) {
      if (showcase) continue;
      if (/var\(--accent/.test(body)) users.push(selector);
    }
    // 화면에서 가장 강한 색은 사장님이 가장 알아야 할 것 — 지금 몇 단계인가 — 을 가리킨다.
    expect(users.length, "액센트를 쓰는 자리가 하나도 없다").toBeGreaterThan(0);
    expect(users.filter((s) => !s.includes(".side-step.on"))).toEqual([]);
  });

  // ★★★ 2026-09-08(Task 5) — 위 면제의 **짝**이다. 위 판은 "`.home` 뿌리 아래면 액센트를
  //   봐준다"까지만 증명한다. 그 뿌리를 **누가 다는가**는 아무도 안 재고 있었다.
  //   다른 화면이 `className="... home"` 을 달면 그 순간 앱층 화면 하나가 통째로 면제를
  //   받는다 — 액센트가 사이드바 스테퍼와 경쟁해도 판이 조용하다.
  //   이 저장소는 이미 `home-header`(보관함)라는 이름 충돌을 겪었다. 그래서 실제 마크업
  //   쪽에도 자물쇠를 건다.
  //   ★ 낱말로 자른다 — 정규식 `\bhome\b` 로 재면 하이픈이 낱말 경계라 `home-header` 가
  //     걸린다(실측). className 값을 공백으로 쪼개 **정확히 그 토큰**인지 본다.
  it("★★★ `home` 클래스를 다는 화면은 app/home/page.js 하나뿐이다", () => {
    const wearers = [];
    for (const { path, text } of readAll()) {
      if (path.endsWith(".css")) continue;
      for (const m of text.matchAll(/className="([^"]*)"/g)) {
        if (m[1].split(/\s+/).includes("home")) wearers.push(path.replace(/\\/g, "/"));
      }
    }
    expect(
      [...new Set(wearers)],
      "액센트 면제(showcase)가 이 클래스에 딸려 있다 — 다른 화면이 달면 그 화면이 통째로 면제된다"
    ).toEqual(["app/home/page.js"]);
  });
});

// ★ 2026-09-08 — 아래 두 판은 이제 **앱층**(작업 화면)만 잰다. 전시층(`.display`)은
//   cssRules() 의 면제를 타고 빠져나가고, 그쪽 굵기는 "전시층 글자는 .display 안에서만
//   쓴다"가 따로 잰다. 두 층을 한 목록으로 묶으면 둘 중 하나가 반드시 거짓말이 된다 —
//   앱층에 62px·900 을 허락하거나, 전시층을 30px·700 으로 눌러 표지가 표지가 아니게 되거나.
describe("타이포", () => {
  it("font-weight는 400 · 600 · 700만 쓴다", () => {
    const ALLOWED = ["400", "600", "700", "inherit", "normal"];
    const offenders = [];
    for (const { display, body } of cssRules()) {
      if (display) continue;
      for (const m of body.matchAll(/font-weight:\s*([^;]+);?/g)) {
        const v = m[1].trim();
        if (!ALLOWED.includes(v)) offenders.push(v);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("font-size는 12 · 14 · 16 · 18 · 30px만 쓴다", () => {
    const ALLOWED = ["12px", "14px", "16px", "18px", "30px", "inherit"];
    const offenders = [];
    for (const { display, body } of cssRules()) {
      if (display) continue;
      for (const m of body.matchAll(/font-size:\s*([^;]+);?/g)) {
        const v = m[1].trim();
        if (!ALLOWED.includes(v)) offenders.push(v);
      }
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

// ★★ 2026-09-08(Task 3) — **서체는 한 벌이다.** 라틴·숫자를 Geist 가, 한글을 Pretendard 가
//   받던 두 벌 구성을 걷었다. 숫자가 다른 서체로 그려지면(원가 타일·크레딧·초 표시가 전부
//   숫자다) 같은 화면 안에서 인상이 갈리고, MCS 와 "같은 디자인 언어"가 숫자에서 깨진다.
describe("서체", () => {
  it("layout.js 가 폰트를 실제로 주입한다", () => {
    const layout = readFileSync("app/layout.js", "utf8");
    expect(layout).toMatch(/from ["']next\/font\/local["']/);
  });

  it("body 는 주입된 폰트 변수를 쓴다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/var\(--font-pretendard\)/);
  });

  it("★ 라틴 서체를 다시 끌어오지 않는다 — 지웠다고 믿지 말고 센다", () => {
    // 왜 걷었는지는 **주석으로 남긴다**(globals.css 의 body · layout.js 머리). 그래서 이 판은
    // 산문이 아니라 **실제로 서체를 붙이는 것**만 본다 — import 문 · 변수 이름 · 주입 식별자.
    // 주석 속 단어 하나까지 빨개지게 만들면 다음 사람이 이유를 지우는 쪽으로 고친다.
    const layout = readFileSync("app/layout.js", "utf8");
    expect(layout, "layout.js 가 라틴 서체를 다시 import 한다").not.toMatch(/from ["']geist\//);
    expect(layout, "layout.js 가 라틴 서체 변수를 다시 주입한다").not.toMatch(/GeistSans/);
    // 주석이 지워진 본문에서 잰다 — 위 주석이 이름을 언급하는 것만으로 빨개지면 안 된다.
    expect(cssWithoutRoot(), "body 가 --font-geist-sans 를 다시 쓴다").not.toMatch(
      /--font-geist-sans/
    );
  });

  it("★★ 주입한 굵기 범위가 CSS 가 쓰는 굵기를 덮는다 — 안 덮으면 조용히 눌려 그려진다", () => {
    // 가변 폰트는 선언한 범위 **밖**의 굵기를 오류 없이 양 끝으로 눌러 그린다. 범위가
    // "400 800" 인 채로 전시층에 900 을 쓰면 판은 전부 그린인데 화면만 800 이다 —
    // 이 저장소가 가장 싫어하는 모양(아무도 안 알려 주는 조용한 격하)이다.
    // 값은 하나가 정한다: **CSS 가 실제로 쓰는 최대 굵기**. 전시층 굵기를 바꾸면 이 판이
    // 따라 움직인다(숫자를 두 벌 적지 않는다).
    // 근거: node_modules/pretendard 의 pretendardvariable.css 가 `font-weight: 45 920` 을
    // 선언한다 — 900 은 이 파일이 실제로 가진 굵기라 범위만 열면 된다(용량은 그대로다).
    const layout = readFileSync("app/layout.js", "utf8");
    const range = layout.match(/weight:\s*"(\d+)\s+(\d+)"/);
    expect(range, "layout.js 가 굵기 범위를 선언하지 않는다").not.toBeNull();

    const used = [...cssWithoutRoot().matchAll(/font-weight:\s*(\d{3,4})/g)].map((m) =>
      Number(m[1])
    );
    expect(used.length, "CSS 에 숫자 굵기가 하나도 없다 — 이 판이 낡았다").toBeGreaterThan(0);
    expect(
      Number(range[2]),
      `선언한 최대 굵기(${range[2]})가 CSS 가 쓰는 최대 굵기(${Math.max(...used)})에 못 미친다`
    ).toBeGreaterThanOrEqual(Math.max(...used));
  });
});

// 자막 조절판은 네 가지 결정(위치·글꼴·색·크기)을 나란히 놓는 자리다. 행마다 컨트롤이
// 제각각이면(칩 40px · 슬라이더 16px · 색 22px) 격자가 무너져 프로토타입처럼 보인다.
// 2026-08-13 사용자 지적: "배치가 균일하지 못하고 글자 크기가 제각각이다".
describe("자막 조절판 — 한 격자", () => {
  const css = cssWithoutRoot();
  const rule = (selector) => {
    const start = css.indexOf(selector + " {");
    if (start < 0) return "";
    return css.slice(start + selector.length, css.indexOf("}", start));
  };

  it("컨트롤 높이를 한 곳에서 정한다", () => {
    // 세그먼트·색 견본·슬라이더가 같은 높이라야 네 행의 리듬이 맞는다.
    expect(rule(".subpanel"), "조절판 자체가 없다").toBeTruthy();
    expect(css, "컨트롤 높이 토큰(--ctl-h)이 없다").toMatch(/--ctl-h:/);
  });

  it("드롭다운 글자 크기는 한 자리에서만 정한다", () => {
    // 글꼴 드롭다운만 키우면 행마다 높이가 갈린다 — 글꼴 차이는 획으로 보이지 크기로 보이지 않는다.
    expect(rule(".sub-select"), "드롭다운이 없다").toMatch(/font-size/);
    expect(rule(".sub-select.face"), "글꼴 드롭다운이 크기를 따로 정한다").not.toMatch(/font-size/);
  });

  it("조절판 안에서 네이티브 위젯 색을 그대로 쓰지 않는다", () => {
    // 브라우저 기본 파랑은 이 화면에서 유일한 시스템 색이라 눈이 먼저 그리로 간다.
    expect(rule(".sub-slider"), "슬라이더를 직접 그리지 않는다").toMatch(/appearance:\s*none/);
  });
});

// 나란히 선 버튼의 높이가 다르면 줄이 어긋나 보인다. 주/보조는 **색과 폭**으로 가르고
// 높이는 맞춘다(2026-08-13 사용자 지적: 보관함 [수정] 70px vs [새 영상 만들기] 50px,
// 비밀번호 [취소] 28px vs [바꾸기] 46px).
describe("한 줄에 선 버튼은 높이가 같다", () => {
  const css = cssWithoutRoot();
  const has = (selector, prop) => {
    const start = css.indexOf(selector + " {");
    if (start < 0) return false;
    return css.slice(start, css.indexOf("}", start)).includes(prop);
  };

  it("보관함 머리의 보조 버튼이 높이를 정한다", () => {
    expect(has(".home-header .mini", "height"), ".home-header .mini 가 높이를 안 정한다").toBe(true);
  });

  it("마이페이지 한 줄의 보조 버튼도 높이를 정한다", () => {
    expect(has(".me-row .mini", "height"), ".me-row .mini 가 높이를 안 정한다").toBe(true);
  });

  // .cta 의 margin-top(20px)이 머리 줄에 들어오면 그 줄만 아래로 밀린다.
  it("머리 줄에서는 주 버튼의 위 여백을 지운다", () => {
    expect(has(".home-header .cta", "margin-top"), ".home-header .cta 의 여백을 안 지운다").toBe(true);
  });
});

// ★★ 2026-09-08 — 지운 것이 되돌아오지 못하게 세우는 판 둘이다(밝은 벌 한 벌로 옮기는 개편).
//   앞 회차가 어두운 벌(`:root[data-theme="light"]` 블록 · ThemeToggle · layout.js 의 테마
//   부팅 스크립트)을 **지웠는데**, 지운 것은 다음 사람이 무심코 되살릴 수 있다. 지웠다는
//   기억이 아니라 **매 회차 세는 판**이 그것을 막는다.
describe("테마는 한 벌이다", () => {
  it("★ data-theme 흔적이 코드에 없다 — 지웠다고 믿지 말고 센다", () => {
    // 주석을 지우지 않고 **날 것 그대로** 센다. 이 판에서는 주석이 판을 **더 엄하게** 만든다
    // — "data-theme 은 이제 없다" 같은 주석 한 줄도 분기가 돌아오는 길목이라 지우는 편이 낫다.
    // (아래 굵기 판은 정반대다. 거기서는 주석이 판을 **느슨하게** 만들어 반드시 지워야 한다.)
    // app/globals.css 를 따로 읽지 않는다 — readAll() 의 ROOTS(app·components)가 .css 도
    // 훑어서 globals.css 가 이미 그 목록에 있다(두 번 읽으면 같은 파일이 두 번 보고된다).
    const hits = readAll()
      .filter(({ text }) => /data-theme/.test(text))
      .map(({ path }) => path);
    expect(hits, `테마 분기가 남아 있다:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("★★ 전시층 글자는 .display 안에서만 쓴다", () => {
    // 전시층(표지·큰 제목)은 800 이상으로 굵어도 되지만, 작업 화면이 같이 굵어지면
    // 화면 전체가 소리를 질러 사장님이 **지금 눌러야 할 것**을 못 고른다.
    //
    // ★★ 2026-09-08(Task 3) — 옛 굵기 판("font-weight는 400 · 600 · 700만 쓴다")이 이제
    //   전시층을 놓아준다. 그 순간부터 **이 판이 800+ 를 막는 유일한 파수꾼**이다.
    //   면제 정의(cssRules)를 손댈 때는 여기가 먼저 무너진다고 생각하고 손대라.
    const offenders = [];
    for (const { selector, body, display } of cssRules()) {
      // 블록 안 **모든** 선언을 본다 — 첫 것만 보면 `font-weight: 400` 뒤에 오는 `900` 을
      // 놓친다. 자릿수는 3~4 다: `font-weight: 1000` 이 합법값(CSS Fonts 4)이라 `\d{3}` 이면
      // "100" 만 물어 800 미만으로 조용히 통과한다.
      for (const w of body.matchAll(/font-weight:\s*(\d{3,4})/g)) {
        if (Number(w[1]) >= 800 && !display) offenders.push(`${selector} → ${w[1]}`);
      }
    }
    expect(offenders, `전시층이 작업 화면으로 샜다:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});


// ★★ 2026-09-10 — 형제 제품 **MCS**(fixup-image-agent) 와 대조해 골격 셋을 맞췄다.
//   색은 이미 같았다(우리 09-08 밝은 벌 전환이 그쪽을 보고 한 것이다). 남은 차이 중
//   **문구를 안 건드리는 것**만 이번에 옮겼다 — 눈썹(eyebrow)·본문 기둥 정책은 사장님
//   판단이 필요해 남겼다.
describe("MCS 와 맞춘 골격 — 그림자 두 벌과 사이드바 폭", () => {
  const css = readFileSync("app/globals.css", "utf8");
  // ⚠️ `[^}]*` 로 자르면 안 된다 — :root 안 **주석에 `}` 가 있어서**(`.chips { gap: 7px }`)
  //   거기서 끊긴다. 실제로 이 판을 그렇게 썼다가 토큰이 있는데 "없다"로 빨개졌다.
  //   블록을 닫는 것은 **줄 맨 앞의 `}`** 다.
  const root = css.match(/:root\s*\{[\s\S]*?\n\}/)[0];
  // ★ 정규식을 만들지 않는다 — 선택자에 `.` 이 들어가 이스케이프가 필요하고, 이 저장소는
  //   heredoc 으로 판을 쓸 때 역슬래시가 한 겹 먹혀 **아무것도 안 맞는 판**을 만든 적이 있다.
  //   문자열로 자르면 그 함정이 아예 없다.
  const rule = (sel) => {
    const at = css.indexOf(`\n${sel} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };

  it("★★★ 그림자를 토큰 둘이 쥔다 — 제자리에 손으로 적으면 아홉 벌이 된다", () => {
    expect(root, "--ring 토큰이 없다").toMatch(/--ring:\s*0 0 0 1px var\(--line\)/);
    expect(root, "--elevate 토큰이 없다").toMatch(/--elevate:\s*0 4px 24px/);
  });

  it("★★★ 토큰만 있고 안 쓰면 아무 일도 안 한다 — 쓰는 자리를 잰다", () => {
    expect(rule(".panel"), "카드가 링을 안 두른다").toMatch(/box-shadow:\s*var\(--ring\)/);
    expect(rule(".dlg"), "떠 있는 면에 고도가 없다").toMatch(/box-shadow:\s*var\(--elevate\)/);
  });

  it("★★ 카드의 링은 border 가 아니라 그림자다 — border 면 여백이 1px 씩 밀린다", () => {
    expect(rule(".panel"), "카드에 테두리를 달았다").not.toMatch(/border:/);
  });

  it("★★ 사이드바 폭이 고정값이 아니라 화면을 따라 늘어난다", () => {
    expect(rule("aside.side"), "사이드바 폭이 아직 고정값이다").toMatch(
      /width:\s*clamp\(236px,\s*15vw,\s*300px\)/
    );
  });
});
