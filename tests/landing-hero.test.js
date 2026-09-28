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
// ★★ 2026-09-14 — 규칙 안의 **주석을 걷은** 판. CSS 규칙에도 설명을 적는데, 그것을 코드로
//   세면 "설명에 적힌 옛 계산식"이 단정을 통과시킨다. 실제로 이 파일에서 한 번 겪었다:
//   `50vw` 를 걷어낸 커밋에서 판이 초록이었고, 통과시킨 것은 **그 사실을 적은 주석**이었다.
const ruleCode = (sel) => rule(sel).replace(/\/\*[\s\S]*?\*\//g, "");

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

  it("★★★ 랜딩은 **어두운 벌**이다 — 색은 :root 의 무대 토큰과 --lime 만 쓴다", () => {
    // 이력이 오간 자리라 적어 둔다: 09-09 밤 어두움 → 09-14 밝음(제품 도해를 놓으면서) →
    // **09-28 어두움**(목업 전면 교체 · 사장님 "컬러도 반영해줘").
    // 지금 어두운 이유는 **첫 화면이 검정 무대의 콜라주**라서다 — 그 아래만 밝으면
    // 한 페이지에 두 벌이 얹힌 것처럼 읽힌다. 다시 밝게 되돌리려거든 첫 화면부터 바꿔라.
    // ★ 이 판이 여전히 세는 것은 "밝다/어둡다"가 아니라 **색 벌을 새로 만들지 않았는가**다.
    //   09-09 에 랜딩 전용 토큰을 만들었다가 소비자 0 이 되어 지운 적이 있다.
    expect(rule(".home"), "랜딩 뿌리가 무대 색을 안 쓴다").toMatch(/background:\s*var\(--stage-dark\)/);
    expect(rule(".home"), "랜딩 글자색이 무대 색이 아니다").toMatch(/color:\s*var\(--stage-ink\)/);
    // 랜딩 전용으로 더한 색은 **--lime 하나뿐**이어야 한다(그리고 :root 안에 있어야 한다).
    const rootAt = css.indexOf(":root {");
    expect(rootAt, ":root 블록을 못 찾았다").toBeGreaterThan(-1);
    const root = css.slice(rootAt, css.indexOf("\n}", rootAt));
    expect(root, "--lime 이 :root 에 없다").toMatch(/--lime:\s*#/);
    expect(root, "--lime-ink 가 :root 에 없다").toMatch(/--lime-ink:\s*#/);
    // 앱층은 여전히 --accent 가 강조색이다. 라임이 랜딩 밖으로 새면 여기서 걸린다.
    const stray = [...css.matchAll(/([^{}]*)\{[^}]*var\(--lime/g)]
      .map((m) => m[1].trim().split("*/").pop().trim())
      .filter((s) => s && !s.startsWith(":root") && !s.includes(".home"));
    expect(stray, "라임을 랜딩 밖에서 쓴다 — 앱의 강조색은 --accent 다").toEqual([]);
  });

  it("★★ 첫 화면의 **영상은 부품 안에만** 있다 — 화면 파일로 새어 나오지 않는다", () => {
    // 영상 태그는 2026-09-28 에 열렸지만 자리가 **하나**여야 한다(components/HomeCollage.jsx).
    // 화면 파일에 직접 적히기 시작하면 "여기도 한 편쯤"이 다시 퍼진다 — 방어선이 한 파일에 모여
    // 있어야 tests/home-collage.test.js 가 그것을 통째로 잰다.
    expect(pageCode, "화면 파일에 영상 태그가 들어왔다").not.toMatch(/<video/);
    expect(pageCode, "콜라주 부품을 안 쓴다").toMatch(/<HomeCollage\s*\/>/);
  });
});

describe("랜딩 — 첫 화면은 흩뿌린 콜라주다 (2026-09-28 전면 교체)", () => {
  // ★★★ 이 describe 는 09-14 의 **제품 도해**를 재던 자리다. 사장님이 09-28 에 랜딩을
  //   통째로 갈았다("전체 페이지를 갈아 끼울거야") — 걸음 띠 · 도해 · 규격 띠 · 두 갈래 절이
  //   전부 걷혔다. 되살릴 값은 git 이력에 있다. **뒤집힌 줄 알고** 되살려라.
  it("★★★ 옛 절을 그리는 코드가 **없다** — 남으면 죽은 규칙이 다음 사람을 속인다", () => {
    for (const w of ["land-diagram", "land-panel", "land-steps", "land-fits", "land-two"]) {
      expect(pageCode, `${w} 가 화면에 남았다`).not.toContain(w);
      expect(css, `${w} 규칙이 CSS 에 남았다`).not.toContain(".home ." + w);
    }
  });

  it("★★ 머리글이 **콜라주 한가운데**에서 제품을 말한다", () => {
    // 09-14 의 ①("무엇을 해 주는 곳인지 먼저 말해야 한다")은 문구가 바뀌어도 살아 있는 계약이다.
    // ★ 2026-09-28 문구 손질로 "영상 한 편이 됩니다" → "영상 한 편이 나옵니다"(주어를 손님으로).
    //   여기서 **글자를 그대로 재는 이유**는 첫 화면에서 이 한 줄이 사라지는 것을 막기 위해서다 —
    //   문구를 다시 고치면 이 줄도 같이 고쳐라. 고치는 것은 괜찮고, 없어지는 것이 사고다.
    expect(pageCode, "첫 화면 절이 없다").toMatch(/className="land-hero"/);
    expect(pageCode, "머리글이 콜라주 위에 없다").toMatch(/className="land-hero-copy"/);
    expect(pageCode, "제품을 말하는 한 줄이 없다").toContain("영상 한 편이 나옵니다");
  });

  it("★★ 아래 절이 여섯이다 — 자막 · 두 갈래 · 여섯 자리 · 만든 영상 · 크레딧 · 마무리", () => {
    for (const mark of ["land-say", "land-ways", "land-six", "HomeMade", "land-packs", "land-final"]) {
      expect(pageCode, `${mark} 절이 없다`).toContain(mark);
    }
  });

  it("★★ 껍데기의 닻이 **실제로 있는 자리**를 가리킨다 — 죽은 앵커는 아무 일도 안 한다", () => {
    for (const href of ["#made", "#two"]) {
      expect(pageCode, `${href} 로 가는 길이 없다`).toContain(`href="${href}"`);
    }
    expect(pageCode, '#two 가 가리키는 자리가 없다').toMatch(/id="two"/);
    // #made 는 벽 부품이 단다(components/HomeMade.jsx 의 stage-band).
    expect(jsxCode, '#made 가 가리키는 자리가 없다').toMatch(/id="made"/);
  });
});

describe("랜딩 — 맨 위로 돌아가는 버튼", () => {
  it("★★★ 버튼이 있고 **맨 위를 가리킨다**", () => {
    // ★ 2026-09-14 — 버튼이 **벽 부품에서 화면으로** 옮겨 왔다. 벽 안에 있으면 벽을
    //   지나는 순간 같이 사라져 페이지 맨 아래에서는 안 보였다(사장님 지적).
    expect(page, "맨 위로 버튼이 없다").toMatch(/stage-top/);
    expect(page, '맨 위 자리(#top)를 안 가리킨다').toMatch(/href="#top"/);
    expect(page, '가리킬 자리(id="top")가 없다').toMatch(/id="top"/);
    expect(jsxCode, "벽 부품에 아직 남아 있다 — 두 벌이 된다").not.toMatch(/stage-top/);
  });

  it("★★★ 아래 절들을 감싼 묶음 **안에서** 뜬다 — 히어로에서는 안 보인다", () => {
    // sticky 는 부모 상자 안에서만 붙어 있는다. 그래서 "어디까지 따라오는가"는
    // 이 묶음이 어디서 시작해 어디서 끝나는가와 같은 말이다.
    expect(pageCode, "아래 절 묶음이 없다").toMatch(/className="land-below"/);
    const below = pageCode.indexOf('className="land-below"');
    expect(pageCode.indexOf('className="land-diagram"'), "도해가 묶음 안에 들어갔다 — 맨 위에서도 뜬다")
      .toBeLessThan(below);
    expect(pageCode.indexOf('className="stage-top"'), "버튼이 묶음 밖에 있다").toBeGreaterThan(below);
  });

  it("★★★ **자바스크립트를 안 쓴다** — 이 화면은 09-10 에 클라이언트 부품을 0으로 만들었다", () => {
    // 랜딩은 서버가 통째로 그려 내려준다(첫 방문 7.5초 → 1.6초). 스크롤을 감지하려고
    // "use client" 를 들이면 그 최적화가 통째로 깨진다 — 그래서 자리는 CSS 가 잡는다.
    for (const [name, code] of [["벽 부품", jsxCode], ["화면", pageCode]]) {
      expect(code, `랜딩 ${name}이 클라이언트가 됐다`).not.toMatch(/^\s*["']use client["']/m);
      expect(code, `${name}에 스크롤을 감지하는 코드가 들어왔다`).not.toMatch(/scrollTo|onScroll|useEffect/);
    }
  });

  it("★★ **화면 오른쪽 끝**에 선다", () => {
    const top = ruleCode(".home .stage-top");
    expect(top, ".home .stage-top 규칙이 없다").toBeTruthy();
    // sticky 라 자기를 감싼 묶음 안에서만 떠 있다 — 히어로·도해에서는 안 보인다(JS 없이).
    expect(top, "sticky 가 아니다 — 맨 위에서도 떠 있게 된다").toMatch(/position:\s*sticky/);
    expect(top, "오른쪽으로 안 붙는다").toMatch(/margin-left:\s*auto/);
    // ★ 2026-09-14 — 버튼이 벽(기둥 1400px) 밖으로 나와 **화면 폭을 쓰는 묶음**
    //   (.land-below) 안에 있다. 기둥 밖으로 밀어내던 `50% - 50vw` 를 그대로 두면
    //   이번에는 화면 **밖으로** 나간다.
    expect(top, "기둥 시절 계산이 남았다 — 지금 부모는 화면 폭이다").not.toMatch(/50vw/);
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
