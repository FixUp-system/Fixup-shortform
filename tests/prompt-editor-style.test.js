// 실제로 보내는 지시(프롬프트 편집 상자) — 본문과 꼬리가 **한 지시문으로 보이는가**.
//
// 이 저장소는 렌더링 하네스가 없어 소스를 읽어 판정한다(tests/ad-ui.test.js 방식).
// ★ 이 파일이 생긴 이유: 2026-08-18 에 본문이 <textarea> 에서 <div contentEditable> 로
//   바뀌면서 `textarea.ref` 규칙이 **통째로 떨어져 나갔다**. 소스에는 여전히
//   `className="ref mono prompt-body"` 라고 적혀 있어 스타일이 붙은 것처럼 보였지만,
//   브라우저 실측은 본문 12px/18px · 꼬리 16px/24.8px 로 갈려 있었다.
//   그래서 여기서 재는 것은 "클래스를 적었는가"가 아니라 **그 클래스가 실제로 살아 있는가**,
//   그리고 **눈금이 태그와 무관한 한 자리에 있는가** 두 가지다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 주석을 걷어내고 판정한다 — 주석 속 낱말이 계약을 대신 통과시킨 사고가 반복됐다.
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJs = (s) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // JSX 주석 {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const css = stripCss(readFileSync("app/globals.css", "utf8"));

// 같은 상자를 쓰는 화면 둘 — ④이미지와 ⑤영상. 하나만 고치면 다른 하나가 갈린다.
const SCREENS = [
  ["④이미지", "app/create/[id]/images/page.js"],
  ["⑤영상", "app/create/[id]/video/page.js"],
];

/** `.prompt-one {` 처럼 선택자 하나로 시작하는 규칙 블록의 본문을 꺼낸다 */
function block(selector) {
  const at = css.indexOf(selector + " {");
  if (at < 0) return null;
  const end = css.indexOf("}", at);
  return css.slice(at + selector.length + 2, end);
}

/** JSX 에서 그 className 을 단 요소의 **태그 이름**을 읽는다 */
function tagOf(src, className) {
  const at = src.indexOf(`className="${className}"`);
  if (at < 0) return null;
  const before = src.slice(0, at);
  const m = before.match(/<([a-zA-Z][\w.]*)[^<>]*$/);
  return m ? m[1] : null;
}

/** 그 클래스에 CSS 가 **이 태그에서도** 닿는가 — `textarea.ref` 를 div 가 입은 상태를 잡는다 */
function reachableTags(cls) {
  const re = new RegExp(String.raw`(?:^|[\s,>+~(])([a-zA-Z][\w-]*)?\.${cls}(?![\w-])`, "g");
  const tags = [];
  let m;
  while ((m = re.exec(css))) tags.push(m[1] || "*");
  return tags;
}

describe("프롬프트 편집 상자 — 본문과 꼬리가 한 지시문으로 보인다", () => {
  it("눈금(글자·줄간격)과 좌우 여백을 **상자 하나**(.prompt-one)가 쥔다", () => {
    const one = block(".prompt-one");
    expect(one, ".prompt-one 규칙이 없다").toBeTruthy();
    expect(one, "상자가 글자 크기를 안 쥔다 — 안쪽 둘이 따로 정하면 또 갈린다").toMatch(/font-size:/);
    expect(one, "상자가 줄간격을 안 쥔다").toMatch(/line-height:/);
    expect(one, "상자가 좌우 여백을 안 쥔다 — 여백이 다르면 글줄이 이어져 보이지 않는다").toMatch(/padding:/);
  });

  it("본문은 눈금을 물려받는다 — 자기 글자 크기를 따로 갖지 않는다", () => {
    const body = block(".prompt-one .prompt-body");
    expect(body, ".prompt-one .prompt-body 규칙이 없다").toBeTruthy();
    // font: inherit — 이 자리가 다시 textarea(폼 컨트롤)가 돼도 글꼴이 안 끊긴다
    expect(body, "본문이 상자의 글꼴을 물려받지 않는다").toMatch(/font:\s*inherit/);
    expect(body, "본문이 여백을 0 으로 두지 않는다 — 상자 여백과 겹치면 글줄이 어긋난다").toMatch(/padding:\s*0\b/);
    expect(body, "본문이 자기 글자 크기를 들고 있다 — 값이 두 벌이면 갈린다").not.toMatch(/font-size:/);
  });

  it("꼬리도 눈금을 물려받는다 — 본문과 같은 값을 두 번 적지 않는다", () => {
    const tail = block(".prompt-one .prompt-fixed");
    expect(tail, ".prompt-one .prompt-fixed 규칙이 없다").toBeTruthy();
    expect(tail, "꼬리가 자기 글자 크기를 들고 있다 — 본문과 갈릴 자리다").not.toMatch(/font-size:/);
    expect(tail, "꼬리가 자기 줄간격을 들고 있다").not.toMatch(/line-height:/);
    expect(tail, "꼬리가 여백을 0 으로 두지 않는다").toMatch(/padding:\s*0\b/);
    // 색은 2026-08-18 사장님 지시로 통일했다 — 되돌리지 않는다
    expect(tail, "꼬리 색이 본문과 갈렸다(흐린 글자로 되돌아갔다)").toMatch(/color:\s*var\(--ink\)/);
  });

  for (const [label, path] of SCREENS) {
    const src = stripJs(readFileSync(path, "utf8"));

    it(`${label} — 상자·본문·꼬리가 한 덩어리로 붙어 있다`, () => {
      expect(src).toContain('className="prompt-one"');
      expect(src).toMatch(/className="[^"]*\bprompt-body\b[^"]*"/);
      expect(src).toMatch(/className="[^"]*\bprompt-fixed\b[^"]*"/);
    });

    it(`${label} — 적어 둔 클래스가 **실제로 살아 있다**(태그에 묶인 선택자에 기대지 않는다)`, () => {
      for (const m of src.matchAll(/className="([^"]*\b(?:prompt-body|prompt-fixed)\b[^"]*)"/g)) {
        const classes = m[1].trim().split(/\s+/);
        const tag = tagOf(src, m[1]);
        expect(tag, `${m[1]} 를 단 요소의 태그를 못 읽었다`).toBeTruthy();
        for (const cls of classes) {
          const tags = reachableTags(cls);
          expect(tags.length, `.${cls} 를 적었는데 CSS 에 그런 규칙이 없다`).toBeGreaterThan(0);
          expect(
            tags.some((t) => t === "*" || t === tag),
            `<${tag}> 에 .${cls} 를 달았는데 CSS 는 ${tags.join("/")} 에만 붙는다 — ` +
              `소스는 멀쩡해 보이지만 브라우저에서는 규칙이 통째로 떨어져 나간다 ` +
              `(2026-08-18 에 실제로 난 회귀: textarea.ref 를 div 가 입었다)`,
          ).toBe(true);
        }
      }
    });
  }
});

// ★ 상한을 걷는다 (2026-08-19 사장님 지적: "987자가 전부 드래그가 안 되고 중간에 한번 짤려").
//
// 실측: 상자는 420px 만 보여 주는데 내용이 718px 이었다 — **본문(570px)조차 다 안 보였다.**
// 스크롤 상자 안에서 드래그하면 보이는 만큼 긁다가 경계에서 끊긴 것처럼 느껴진다.
//
// 이 칸은 <details> 안이라 **사장님이 일부러 펼친 자리**다. 펼친 뜻은 "전부 보겠다"이므로
// 거기서 다시 상한으로 가두는 것은 그 뜻과 어긋난다. 옛 주석은 "없으면 긴 지시문이 화면을
// 통째로 밀어낸다"고 걱정했는데, 접힌 칸이 이미 그 걱정을 맡고 있다.
describe("실제로 보내는 지시 — 펼치면 전부 보인다", () => {
  const one = css.slice(css.indexOf(".prompt-one {"), css.indexOf(".prompt-one .prompt-body"));

  it("★ 상자가 내용을 자르지 않는다", () => {
    expect(one, "max-height 가 남아 있으면 드래그가 그 경계에서 끊긴다")
      .not.toMatch(/max-height:/);
  });

  it("★ 스스로 구르지 않는다 — 자를 것이 없으면 막대도 없다", () => {
    expect(one, "overflow-y: auto 가 남으면 스크롤 상자로 남는다")
      .not.toMatch(/overflow-y:\s*auto/);
  });
});
