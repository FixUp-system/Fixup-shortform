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

  // ★★★ 2026-09-15 사장님 지적 — 「시나리오랑 이미지 비율이 안 맞아」.
  //   실측: 같은 폭(554px)인데 글 522px · 그림 324px 였다. 스토리보드가 16:9 라
  //   그 폭에서는 그 높이가 한계다(글 높이에 맞추려면 폭이 928px 필요).
  //   그래서 **카드 바닥을 맞추고**(사장님 선택) 그림은 그 안에서 가운데에 선다.
  it("★★★ 두 카드는 **같은 높이로** 선다 — 바닥이 맞는다", () => {
    const base = ruleOf(".rv-split");
    expect(base, ".rv-split 규칙이 없다").toBeTruthy();
    // `align-items: start` 면 각자 제 높이로 서서 바닥이 어긋난다.
    expect(base.body, "칸이 각자 제 높이로 선다 — 바닥이 어긋난다").not.toMatch(/align-items:\s*(start|flex-start)/);
  });

  it("★★ 그림은 늘어난 카드 **가운데**에 선다 — 위로 붙으면 아래가 빈 면으로 읽힌다", () => {
    const r = ruleOf(".rv-split > .sheet-view");
    expect(r, "격자 안 그림 규칙이 없다").toBeTruthy();
    expect(r.body, "그림 카드가 안 늘어난다").toMatch(/align-self:\s*stretch/);
    expect(r.body, "그림이 카드 안에서 가운데로 안 선다").toMatch(/align-items:\s*center/);
  });

  // ★★★ 2026-09-15 사장님 지적 — 「너무 분할되어 있는 느낌. 3개의 영역을 한 보드 안에」.
  //   한 번은 셋을 각각 카드로 세웠다가(같은 날 앞선 지시) 보고 나서 되돌린 것이다.
  //   지금은 **겉이 보드 하나**이고 그 안에 글·그림·고치기가 앉는다.
  it("★★★ 세 영역이 **한 보드** 안이다 — 글 칸이 제 카드를 따로 갖지 않는다", () => {
    expect(page, "겉이 보드가 아니다").toMatch(/className="panel[^"]*rv-page"/);
    // 보드 안에 보드를 또 앉히면 테두리가 두 겹이 된다.
    expect(page, "글 칸이 제 카드를 갖는다 — 보드가 두 겹이다").not.toMatch(/className="panel rv-read"/);
    expect(page, "고치기 칸이 제 카드를 갖는다 — 보드가 두 겹이다").not.toMatch(/className="panel rv-foot"/);
  });

  // ★★★ 2026-09-15 사장님 결정 — 그림은 **제 액자를 두르지 않는다.**
  //   그전에는 보드 테두리 + 그림 액자가 겹쳐 「카드 안 카드」의 약한 꼴이었다(같은 날
  //   「너무 분할된 느낌」이라 하신 것과 같은 뿌리다). 보드가 이미 경계이고 사진은 제
  //   모서리가 분명하므로 테두리가 필요 없다 — 참조 서비스 셋도 미디어를 맨몸으로 둔다.
  //   ★ 걷는 것은 **격자 안(②시나리오)뿐**이다. ③④⑤의 스토리보드는 제 액자를 그대로 쓴다.
  it("★★★ 그림은 제 액자를 두르지 않는다 — 보드가 유일한 테두리다", () => {
    const r = ruleOf(".rv-split > .sheet-view");
    expect(r, "격자 안 그림 규칙이 없다").toBeTruthy();
    expect(r.body, "그림이 제 테두리를 두른다 — 보드와 두 겹이 된다").toMatch(/border:\s*(0|none)/);
    expect(r.body, "그림이 제 바탕을 깐다 — 보드 위에 또 면이 앉는다").toMatch(/background:\s*none/);
  });

  it("★★ 사진 모서리는 보드와 결을 맞춘다", () => {
    const r = ruleOf(".rv-split > .sheet-view img");
    expect(r, "격자 안 사진 규칙이 없다").toBeTruthy();
    expect(r.body, "모서리가 각져 보드와 안 맞는다").toMatch(/border-radius:/);
  });

  // ★★★ 시트 비율은 **칸 수마다 다르다**(실측: 0.56 ~ 3.00). 세로로 긴 시트는 같은 폭에서
  //   높이가 985px 까지 가서 글보다 커지고, 그러면 그림이 배치를 지배한다.
  //   그래서 그림 쪽에만 **높이 상한**을 둔다 — 비율은 그대로 두고(강제하면 잘린다) 높이만 막는다.
  it("★★★ 세로로 긴 시트가 배치를 지배하지 않는다 — 높이 상한이 있다", () => {
    const r = ruleOf(".rv-split > .sheet-view img");
    expect(r, "격자 안 그림의 높이 규칙이 없다").toBeTruthy();
    expect(r.body, "높이 상한이 없다 — 9:16 컷4 시트가 985px 로 선다").toMatch(/max-height:/);
    // 비율을 강제하면 가로 한 줄짜리(1x3 · 3.00)가 잘린다 — 그 금지는 그대로다.
    expect(r.body, "비율을 강제했다 — 가로로 긴 시트가 잘린다").not.toMatch(/aspect-ratio/);
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
  //   카드 자체가 상한(그때는 `.panel--wide` 의 880px)에서 멈춘다(실측: 격자 832px,
  //   오른쪽에 324px 가 놀고 있었다). 진짜 병목은 기둥이 아니라 **카드 상한**이었다.
  //   ★ 다만 **두 칸일 때만** 푼다 — 한 칸(그림 없음)에서 상한을 풀면 글이 1,100px 로
  //     늘어져 한 줄에 100자가 넘는다. 그건 이 개편이 피하려던 바로 그것이다.
  it("★★★ 카드 상한은 **두 칸일 때만** 풀린다 — 한 칸이면 읽기 폭을 지킨다", () => {
    const m = /\.rv-page:has\(([^)]*)\)\s*\{([^}]*)\}/.exec(css);
    expect(m, "두 칸일 때 카드 상한을 푸는 규칙이 없다").toBeTruthy();
    expect(m[1], "한 칸에서도 상한이 풀린다 — is-two 를 요구해야 한다").toContain("is-two");
    expect(m[2], "상한을 안 푼다").toMatch(/max-width:\s*none/);
    // ★ 특이도로 이긴다(0,2,0 vs 0,1,0) — 규칙 순서에 안 기댄다. 이 파일은 여러 세션이
    //   끝에 덧붙이는 자리라 순서를 믿으면 안 된다.
    expect(m[0].indexOf(".rv-page:has("), "선택자가 바탕 규칙을 함께 물지 않는다").toBe(0);
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
