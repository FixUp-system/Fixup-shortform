// ②시나리오 — **글과 그림을 나란히** (2026-09-15 사장님 결정, B안 1단계).
//
// ★★★ 왜: 2560px 화면에서 본문 기둥(1,160)이 좌우로 1,100px 을 버리고 있었다(실측).
//   그냥 넓히면 시나리오 한 줄이 100자를 넘어 **읽기가 나빠진다** — 그래서 넓힌 폭은
//   글이 아니라 **스토리보드**가 가져간다. 사장님이 이 화면에서 실제로 하는 일이
//   "시나리오를 읽고 고칠지 정하는 것"인데, 판단 재료인 그림이 ③에 가 있었다.
//
// ★ 새로 굽는 것은 없다 — ③에서 이미 만든 한 장을 **여기서도 보여 줄 뿐**이라 0원이다.
// ★ 그림이 아직 없을 수 있다(처음 지나가는 길). 그때는 **한 칸으로 돌아간다** —
//   빈 칸을 세우면 없는 것이 있는 것처럼 읽힌다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const page = strip(readFileSync("app/reel/[id]/scenario/page.js", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

function ruleOf(sel) {
  const at = css.indexOf(".rv-split");
  if (at < 0) return null;
  const rest = css.slice(at);
  const end = rest.indexOf("/* ──");
  if (end < 0) return null;
  const body = rest.slice(0, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [...body.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
  return found.find((r) => r.sel === sel) || null;
}

describe("②시나리오 — 글 ↔ 그림", () => {
  it("★★★ 두 칸으로 선다", () => {
    const r = ruleOf(".rv-split.is-two");
    expect(r, ".rv-split.is-two 규칙이 파서에 안 보인다").toBeTruthy();
    expect(r.body, "두 칸을 정하지 않는다").toMatch(/grid-template-columns:/);
    // ★ 늘어나는 칸은 minmax(0, …) 다. `1fr` 한 마디면 최소폭이 **내용 크기**가 되어
    //   긴 지시문 한 줄이 격자를 부풀리고 화면이 가로로 밀린다(.rw-grid 가 같은 값을 치렀다).
    // ★ `minmax(0, 1fr)` 안의 1fr 은 정상이다 — **감싸지 않은** fr 만 잡아야 한다.
    //   (처음엔 `[\d.]+fr` 을 통째로 막아 제 코드를 빨갛게 만들었다.)
    const cols = /grid-template-columns:\s*([^;]+)/.exec(r.body)[1];
    const 감싼것을뺀다 = cols.replace(/minmax\([^)]*\)/g, "");
    expect(감싼것을뺀다, "칸의 최소폭이 내용 크기다 — minmax(0, …) 로 감싸라").not.toMatch(/fr/);
  });

  it("★★★ 그림이 없으면 **한 칸**이다 — 빈 칸을 세우지 않는다", () => {
    const base = ruleOf(".rv-split");
    expect(base, ".rv-split 바탕 규칙이 없다").toBeTruthy();
    expect(base.body, "바탕이 격자가 아니다").toMatch(/display:\s*grid/);
    // 화면이 **그림 유무로** 두 칸 표식을 붙인다 — 판정을 CSS 에 맡기지 않는다.
    expect(page, "그림 유무가 칸 수를 안 가른다").toMatch(/sheetUrl\s*\?[\s\S]{0,60}?is-two/);
  });

  it("★★★ 스토리보드는 **이미 있는 틀**을 쓴다 — 새 모양을 만들지 않는다", () => {
    expect(page, "sheet-view 를 안 쓴다").toContain("sheet-view");
    expect(page, "주소 판독을 손으로 한다 — reelSheetUrl 하나를 봐야 한다").toContain("reelSheetUrl");
  });

  it("★★ 고치는 칸과 단계 버튼은 **격자 밖**이다 — 아래에서 전체 폭을 쓴다", () => {
    const open = page.indexOf("rv-split");
    const close = page.indexOf("</div>", page.indexOf("sheet-view"));
    const note = page.indexOf("note-form");
    const acts = page.indexOf("step-actions");
    expect(open, "격자를 안 그린다").toBeGreaterThan(-1);
    expect(note, "고치는 칸이 없다").toBeGreaterThan(close);
    expect(acts, "단계 버튼이 없다").toBeGreaterThan(note);
  });

  // ★★★ 2026-09-15 실측 — 기둥(main.work)만 1,600 으로 넓혔더니 **화면이 안 넓어졌다.**
  //   카드 자체가 `.panel--wide { max-width: 880px }` 에서 멈춘다(실측: 격자 832px,
  //   오른쪽에 324px 가 놀고 있었다). 진짜 병목은 기둥이 아니라 **카드 상한**이었다.
  //   ★ 다만 **두 칸일 때만** 푼다 — 한 칸(그림 없음)에서 상한을 풀면 글이 1,100px 로
  //     늘어져 한 줄에 100자가 넘는다. 그건 이 개편이 피하려던 바로 그것이다.
  it("★★★ 카드 상한은 **두 칸일 때만** 풀린다 — 한 칸이면 읽기 폭을 지킨다", () => {
    const m = /\.panel--wide:has\(([^)]*)\)\s*\{([^}]*)\}/.exec(css);
    expect(m, "두 칸일 때 카드 상한을 푸는 규칙이 없다").toBeTruthy();
    expect(m[1], "한 칸에서도 상한이 풀린다 — is-two 를 요구해야 한다").toContain("is-two");
    expect(m[2], "상한을 안 푼다").toMatch(/max-width:\s*none/);
    // ★ 특이도로 이긴다(0,2,0 vs 0,1,0) — 규칙 순서에 안 기댄다. 이 파일은 여러 세션이
    //   끝에 덧붙이는 자리라 순서를 믿으면 안 된다.
    expect(m[0].indexOf(".panel--wide:has("), "선택자가 .panel--wide 를 함께 물지 않는다").toBe(0);
    // 앱 공통 880 은 그대로 남아 있어야 한다.
    expect(css, "공통 카드 상한을 바꿨다").toMatch(/\.panel--wide\s*\{\s*max-width:\s*880px/);
  });

  it("★★★ 기둥은 **이 흐름에서만** 넓어진다 — 앱 공통 1160 은 그대로다", () => {
    const main = /main\.work\s*\{([^}]*)\}/.exec(css);
    expect(main, "main.work 규칙이 없다").toBeTruthy();
    expect(main[1], "앱 공통 기둥을 바꿨다 — 보관함·로그인까지 흔들린다").toMatch(/max-width:\s*1160px/);
    // 넓히는 규칙은 단계별 화면을 **이름으로** 집는다.
    expect(css, "단계별 화면만 넓히는 규칙이 없다").toMatch(/main\.work:has\([^)]*rw-grid[^)]*\)/);
  });
});
