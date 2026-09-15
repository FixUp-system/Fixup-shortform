// 단계별 작업 화면의 **배치** — 왼쪽 설정 패널, 오른쪽 작업대.
//
// ★★★ 이 판은 「선언이 있나」가 아니라 **「그려지면 어떻게 되나」**를 잰다.
//   2026-09-14 이 회차에서 거짓 초록이 네 번 났고, 그중 둘이 CSS 였다:
//   ① 주석 안 `*/` 가 주석을 일찍 닫아 규칙이 통째로 죽었는데 판은 날 것 소스에서
//      이름을 찾아 초록이었다. ② `opacity: 1` 선언이 있는지만 재고 **특이도 동률에서
//      지는지**를 안 봐서, 효력 0 인 고침이 초록이었다.
//   그래서 여기서는 globals.css 를 **파서처럼 읽고 캐스케이드 승부까지 계산**한다.
//   규칙이 죽으면(주석 누수·오타·누군가 뒤에 얹은 덮어쓰기) 그 자리에서 빨개진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/reel/[id]/layout.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ────────────────────────────────────────────────────────────────────────
// 아주 작은 CSS 엔진 — 규칙을 읽고, 선택자를 실제 화면 뼈대에 맞춰 보고,
// 같은 성질을 놓고 **누가 이기는지**까지 고른다.
//
// 다루는 범위는 이 파일이 실제로 쓰는 문법뿐이다(자손·자식 결합자 · 클래스 · 태그 ·
// `:not()` · `@media` 폭 조건). 범위 밖 문법이 우리 뼈대를 건드릴 수 있으면 **조용히
// 넘기지 않고 빨개진다**(아래 「못 재는 선택자」 단정) — 못 재는 것을 통과로 세면
// 그게 바로 거짓 초록이다.
// ────────────────────────────────────────────────────────────────────────
const RULES = (() => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const at = [];
  let prelude = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const sel = prelude.trim().replace(/\s+/g, " ");
      prelude = "";
      i++;
      if (sel.startsWith("@")) { at.push(sel); continue; }
      let body = "";
      while (i < text.length && text[i] !== "}") { body += text[i]; i++; }
      i++;
      out.push({ sel, body, at: [...at], order: out.length });
      continue;
    }
    if (ch === "}") { at.pop(); prelude = ""; i++; continue; }
    prelude += ch;
    i++;
  }
  return out;
})();

// 한 규칙이 그 폭에서 걸리는가. `@media` 의 폭 조건만 본다 — 인쇄·움직임 줄이기 같은
// 조건은 "평상시 화면"이 아니므로 안 걸린 것으로 센다.
function appliesAt(rule, width) {
  for (const q of rule.at) {
    if (!/^@media/.test(q)) return false;
    if (/prefers-|print|orientation|hover:/.test(q)) return false;
    const max = q.match(/max-width:\s*(\d+)px/);
    const min = q.match(/min-width:\s*(\d+)px/);
    if (max && width > Number(max[1])) return false;
    if (min && width < Number(min[1])) return false;
  }
  return true;
}

function compoundMatches(compound, el) {
  // 멈춰 있는 상태를 잰다 — 손이 올라가 있거나 눌린 상태는 "지금 보이는 화면"이 아니다.
  if (/:(hover|focus|active|focus-visible|focus-within|disabled|checked|target)\b/.test(compound)) return false;
  if (/::/.test(compound)) return false; // ::before 등은 그 요소 자체가 아니다
  // ★★★ 선택자로 **읽히지 않는 글자**가 섞여 있으면 브라우저는 그 규칙을 버린다.
  //   이 검사가 없으면 요구가 하나도 없는 조각(주석이 샌 뒤의 한국어 낱말, 쉼표로
  //   잘린 `1` 같은 숫자)이 `*` 처럼 **아무 요소나 맞는 것**이 되어, 죽은 규칙이
  //   살아 있는 것처럼 계산된다 — 2026-09-14 주석 누수를 이 판으로 재현했더니 실제로
  //   그 경로로 **거짓 초록**이 한 번 더 났다(펼친 줄 판이 그대로 초록이었다).
  const leftover = compound
    .replace(/^[a-zA-Z][\w-]*/, "")
    .replace(/\.[\w-]+/g, "")
    .replace(/#[\w-]+/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/:{1,2}[\w-]+(\([^)]*\))?/g, "")
    .replace(/\*/g, "");
  if (leftover.trim() !== "") return false;
  const tag = (compound.match(/^[a-zA-Z][\w-]*/) || [])[0];
  if (tag && tag !== el.tag) return false;
  const denied = new Set();
  for (const n of compound.matchAll(/:not\(([^)]*)\)/g)) {
    for (const c of n[1].match(/\.[\w-]+/g) || []) denied.add(c.slice(1));
  }
  for (const c of denied) if (el.classes.includes(c)) return false;
  for (const m of compound.replace(/:not\([^)]*\)/g, "").match(/\.[\w-]+/g) || []) {
    if (!el.classes.includes(m.slice(1))) return false;
  }
  return true;
}

function matchSel(sel, chain) {
  const toks = sel.replace(/\s*>\s*/g, " > ").trim().split(/\s+/).filter(Boolean);
  const step = (ti, ci) => {
    if (ci < 0 || ti < 0) return false;
    if (!compoundMatches(toks[ti], chain[ci])) return false;
    if (ti === 0) return true;
    if (toks[ti - 1] === ">") return step(ti - 2, ci - 1);
    for (let k = ci - 1; k >= 0; k--) if (step(ti - 1, k)) return true;
    return false;
  };
  return step(toks.length - 1, chain.length - 1);
}

function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const noPe = sel.replace(/::[\w-]+/g, " ");
  const pe = (sel.match(/::[\w-]+/g) || []).length;
  const cls = (noPe.match(/\.[\w-]+/g) || []).length;
  const attrs = (noPe.match(/\[[^\]]*\]/g) || []).length;
  const pcs = (noPe.match(/:(?!not\(|is\(|where\()[\w-]+/g) || []).length;
  const bare = noPe
    .replace(/\.[\w-]+/g, " ").replace(/\[[^\]]*\]/g, " ")
    .replace(/:[\w-]+(\([^)]*\))?/g, " ").replace(/#[\w-]+/g, " ");
  const els = (bare.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, cls + attrs + pcs, els + pe];
}

function declOf(body, prop) {
  let found = null;
  for (const d of body.split(";")) {
    const m = d.match(/^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (!m || m[1].toLowerCase() !== prop) continue;
    const important = /!important\s*$/.test(m[2]);
    found = { val: m[2].replace(/!important\s*$/, "").trim(), important };
  }
  return found;
}

// 이 성질을 놓고 **이기는 선언**. 없으면 null.
function winning(prop, chain, width) {
  let best = null;
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  for (const r of RULES) {
    if (!appliesAt(r, width)) continue;
    const d = declOf(r.body, prop);
    if (!d) continue;
    for (const part of r.sel.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!matchSel(part, chain)) continue;
      const key = [d.important ? 1 : 0, ...specificity(part), r.order];
      if (!best || cmp(key, best.key) > 0) best = { key, val: d.val, sel: part };
    }
  }
  return best;
}

// 트랙 목록으로 쪼갠다 — 괄호 안의 빈칸(`minmax(0, 1fr)`)은 경계가 아니다.
function tracks(value) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// 실제 화면 뼈대(app/reel/[id]/layout.js · components/reel/StepStack.jsx 가 그리는 모양).
const GRID = { tag: "div", classes: ["rw-grid"] };
const PANEL = { tag: "aside", classes: ["rp-panel"] };
const WORK = { tag: "div", classes: ["rw-work"] };
const STRIP = { tag: "div", classes: ["rs-strip"] };
const NOW_STEP = { tag: "a", classes: ["rs-step", "is-now"] };
const OTHER_STEP = { tag: "a", classes: ["rs-step"] };
const LAB = { tag: "span", classes: ["rs-lab"] };
const NO = { tag: "span", classes: ["rs-no"] };

const 지금라벨 = [GRID, WORK, STRIP, NOW_STEP, LAB];
const 다른라벨 = [GRID, WORK, STRIP, OTHER_STEP, LAB];
const 지금번호 = [GRID, WORK, STRIP, NOW_STEP, NO];

describe("단계별 작업 화면 배치", () => {
  it("★★★ 라우팅 가드는 그대로다 — 이번 작업은 껍데기뿐이다", () => {
    expect(code, "가드가 사라졌다").toMatch(/isReelStepReachable\s*\(/);
    expect(code, "현재 단계로 되돌리는 갈래가 사라졌다").toMatch(/router\.replace\(/);
    // 못 찾음·불러오는 중 갈래도 그대로다 — 이 둘이 사라지면 없는 프로젝트에서
    // 설정 패널과 작업대가 빈 껍데기로 선다.
    expect(code, "오류 갈래가 사라졌다").toMatch(/if\s*\(\s*err\s*\)/);
    expect(code, "불러오는 중 갈래가 사라졌다").toMatch(/불러오는 중/);
  });

  it("★★ 설정 패널과 본문을 함께 그린다", () => {
    expect(code).toMatch(/<SettingsPanel\s*\/>/);
    expect(code, "설정 패널을 import 하지 않았다").toMatch(/import\s+SettingsPanel\s+from/);
    expect(code, "걸음 띠를 import 하지 않았다").toMatch(/import\s*\{[^}]*ReelStepStrip[^}]*\}/);
  });

  // ★★★ 2026-09-15 사장님 지시 — 설정 카드의 **상단**이 시나리오 카드의 상단과 맞아야 한다.
  //   그전에는 띠가 본문 칸(.rw-work) 안에 있어서 설정 패널만 띠보다 위에서 시작했다.
  //   ★ 여백을 수로 밀어 넣지 않는다 — 띠가 두 줄로 접히는 화면에서 그 수가 바로 틀어진다.
  //     띠를 **격자 위로** 올리면 설정 패널과 본문이 **둘 다 격자 첫 줄**이 되어 저절로 맞는다.
  //   ★★ 격자의 한 줄로 떼어 내는 방법은 **쓸 수 없다**: 띠는 sticky 라 자기보다 큰 상자가
  //     있어야 움직인다. 제 높이만 한 줄에 갇히면 붙는 성질이 그 자리에서 죽는다.
  it("★★★ 띠는 격자 **밖·위**에 선다 — 그래야 설정과 본문의 상단이 맞는다", () => {
    const iStrip = code.indexOf("<ReelStepStrip");
    const iGrid = code.indexOf('className="rw-grid"');
    expect(iStrip, "띠를 안 그린다").toBeGreaterThan(-1);
    expect(iGrid, "격자를 안 그린다").toBeGreaterThan(-1);
    expect(iStrip, "띠가 격자 안에 있다 — 설정 패널만 위로 삐져나온다").toBeLessThan(iGrid);
  });

  it("★★ children 을 꽂는 자리는 하나다 — 두 곳이면 단계 페이지가 두 번 그려진다", () => {
    // ★ 매개변수 `({ children })` 와 아래쪽 `<Inner>{children}</Inner>` 도 글자 모양이
    //   같다 — **격자를 돌려주는 그 return 하나**만 잘라서 센다.
    const at = code.indexOf("className=\"rw-grid\"");
    expect(at, "격자를 안 그린다").toBeGreaterThan(-1);
    const jsx = code.slice(at, code.indexOf(");", at));
    expect([...jsx.matchAll(/\{\s*children\s*\}/g)].length, "children 을 여러 자리에 꽂는다").toBe(1);
    // 띠는 이제 격자 밖이므로, 격자 안에 남는 것은 **설정 패널과 본문 둘**이다.
    expect(jsx, "격자 안에 띠가 남아 있다").not.toContain("ReelStepStrip");
  });
});

// ★ "넓은 화면"을 재는 폭은 **1400** 이다. 좁은 화면 경계가 1200px 로 올라간 뒤로
//   (Ruling 14, 아래 「좁은 화면 경계」 판) 1200 은 이미 **쌓이는 쪽**이라,
//   거기서 재면 좁은 갈래를 넓은 갈래라 부르며 재게 된다.
//   폭이 갈래를 고르지 않는 성질(라벨 감추기·align-items·min-width)은 1200 그대로 둔다.
const 넓은폭 = 1400;

describe("배치는 **그려진 결과**로 잰다", () => {
  it("★★★ 넓은 화면에서 두 칸이다 — 설정이 왼쪽, 작업대가 오른쪽", () => {
    const disp = winning("display", [GRID], 넓은폭);
    expect(disp, ".rw-grid 에 display 를 정하는 규칙이 없다").toBeTruthy();
    expect(disp.val, "격자가 아니다").toBe("grid");
    const cols = winning("grid-template-columns", [GRID], 넓은폭);
    expect(cols, "칸을 정하는 규칙이 없다").toBeTruthy();
    expect(tracks(cols.val).length, `넓은 화면인데 두 칸이 아니다: ${cols.val}`).toBe(2);

    // ★ 순서가 곧 좌우다 — 격자에 order 를 안 주므로 **소스 순서가 그대로 칸 순서**다.
    //   이 줄이 없으면 <SettingsPanel /> 과 <div className="rw-work"> 를 뒤집어도
    //   판이 초록이고 화면만 좌우가 바뀐다(2026-09-14 검토 지적).
    const at = code.indexOf("className=\"rw-grid\"");
    expect(at, "격자를 안 그린다").toBeGreaterThan(-1);
    const ret = code.slice(at, code.indexOf(");", at));
    const iPanel = ret.indexOf("<SettingsPanel");
    const iWork = ret.indexOf("className=\"rw-work\"");
    expect(iPanel, "SettingsPanel 을 못 찾았다").toBeGreaterThan(-1);
    expect(iWork, "rw-work 를 못 찾았다").toBeGreaterThan(-1);
    expect(iPanel, "설정 패널이 작업대보다 뒤에 있다 — 좌우가 뒤집혔다").toBeLessThan(iWork);
    // 「order 를 안 준다」는 위 주석의 전제까지 잰다 — order 를 주는 순간 소스 순서는
    // 좌우를 못 정하고, 바로 위 세 줄이 아무것도 보장하지 않게 된다.
    expect(winning("order", [GRID, PANEL], 넓은폭), "설정 패널에 order 를 줬다").toBeFalsy();
    expect(winning("order", [GRID, WORK], 넓은폭), "작업대에 order 를 줬다").toBeFalsy();
  });

  it("★★★ 좁은 화면에서는 한 칸으로 쌓인다 — 300px 칸이 화면을 넘기면 안 된다", () => {
    const cols = winning("grid-template-columns", [GRID], 400);
    expect(cols, "좁은 화면에서 칸을 정하는 규칙이 없다").toBeTruthy();
    expect(tracks(cols.val).length, `좁은 화면인데 한 칸이 아니다: ${cols.val}`).toBe(1);
    // ★ 이기는 선언이 **좁은 화면 규칙에서 나왔는지**까지 본다. 넓은 화면 규칙을 그냥
    //   한 칸으로 바꿔도 위 단정은 통과하기 때문이다(그러면 넓은 화면 판이 빨개지지만,
    //   두 판이 같은 사실을 겹쳐 물어야 갈래가 지워졌을 때 자리를 짚어 준다).
    const rule = RULES.find((r) => r.sel.split(",").map((s) => s.trim()).includes(cols.sel)
      && declOf(r.body, "grid-template-columns")?.val === cols.val && appliesAt(r, 400));
    expect(rule?.at.join(" "), "좁은 화면 규칙이 아니라 기본 규칙이 이겼다").toMatch(/max-width/);
  });

  // ★ 토큰을 값으로 푼다 — gap 이 `var(--sp-5)` 라 글자 그대로는 못 센다.
  //   ⚠️ 동적 RegExp(템플릿 문자열)를 쓰지 마라 — 템플릿 안에서 역슬래시가 한 겹 먹혀
  //     `([\d.]+)` 가 `([d.]+)` 가 된다(2026-09-14 밤에 실제로 그랬다. CLAUDE.md 의
  //     같은 함정과 한 뿌리다). 그래서 토큰은 이름을 **찾아서 그 뒤만** 읽는다.
  const px = (v) => {
    const txt = String(v ?? "").trim();
    const t = /^var\((--[\w-]+)\)$/.exec(txt);
    if (!t) return Number(/^([\d.]+)px$/.exec(txt)?.[1] ?? NaN);
    const at = css.indexOf(t[1] + ":");
    if (at < 0) return NaN;
    return Number(/^\s*([\d.]+)px/.exec(css.slice(at + t[1].length + 1))?.[1] ?? NaN);
  };

  it("★★★ 두 칸이 서는 가장 좁은 화면에서도 작업대가 570px 은 된다 — 900px 에서는 311px 였다", () => {
    // 실측(2026-09-14, 브라우저): innerWidth = 942 → .rw-grid 의 계산된
    // grid-template-columns 가 `300px 310.667px`. 경계(900)는 넘었는데 **본문이 설정
    // 패널보다 좁다** — 배치가 사실상 뒤집혀 있었다.
    //
    // ★★★ 2026-09-14 밤 — 이 판은 원래 `작업대 = 화면폭 − 631` 로 셌다. 그 **631 안에
    //   설정 패널 폭 300 이 들어 있었다** — 즉 패널 폭이 CSS 와 이 판 두 곳에 살았다.
    //   그래서 패널을 넓히면 판은 낡은 300 으로 계산해 **초록인 채 작업대가 눌린다.**
    //   지금은 패널 폭도 간격도 **CSS 에서 읽는다.** 손으로 남은 수는 껍데기 하나뿐이다.
    const 껍데기 = 307; // 앱 사이드바+여백. 이것만 브라우저 실측값이다(.rw-grid 의 x=264·폭=635).
    const cols = winning("grid-template-columns", [GRID], 넓은폭);
    const 패널폭 = px(tracks(cols.val)[0]);
    expect(패널폭, `설정 패널 칸이 고정 px 가 아니다: ${tracks(cols.val)[0]}`).toBeGreaterThan(0);
    const 간격 = px(winning("gap", [GRID], 넓은폭)?.val);
    expect(간격, "격자의 간격을 못 읽었다 — 토큰 이름이 바뀌었나").toBeGreaterThan(0);

    // ★ 글자로 경계 수를 찾지 않는다 — 이 파일에는 다른 @media 의 수도 있다.
    //   .rw-grid 를 **한 칸으로 만드는** 규칙을 파서로 골라 그 폭을 읽는다.
    const 한칸으로 = RULES.filter((r) =>
      r.sel.split(",").map((s) => s.trim()).includes(".rw-grid")
      && tracks(declOf(r.body, "grid-template-columns")?.val ?? "").length === 1);
    expect(한칸으로.length, ".rw-grid 를 한 칸으로 만드는 규칙이 하나가 아니다").toBe(1);
    const 조건 = 한칸으로[0].at.join(" ");
    const max = 조건.match(/max-width:\s*(\d+)px/);
    expect(max, `한 칸 규칙이 @media max-width 안에 없다: ${조건 || "(조건 없음)"}`).toBeTruthy();
    // ★ 바닥을 수로 고정하지 않는다 — 경계 수를 다시 적으면 같은 값이 CSS 와 판 두 곳에
    //   산다. 재는 것은 경계가 아니라 그 경계가 낳는 **작업대 폭**이다.
    //   max-width 는 그 수를 포함하므로 두 칸이 서는 가장 좁은 화면은 **경계+1** 이다.
    const 작업대 = Number(max[1]) + 1 - (껍데기 + 패널폭 + 간격);
    expect(
      작업대,
      `패널 ${패널폭}px · 간격 ${간격}px · 경계 ${max[1]}px → 두 칸이 서는 가장 좁은 화면(${Number(max[1]) + 1}px)에서 작업대가 ${작업대}px 다`,
    ).toBeGreaterThanOrEqual(570);
  });

  it("★★★ 가로 스크롤을 만들지 않는다 — 늘어나는 칸의 최소폭이 0 이다", () => {
    // `1fr` 한 마디짜리 칸은 최소폭이 **내용 크기**다. 작업대 안에 긴 표나 안 접히는
    // 줄이 하나만 들어와도 격자가 그만큼 부풀어 화면 전체가 가로로 밀린다(이 저장소의
    // 단계 페이지에는 표·코드·긴 프롬프트가 실제로 들어 있다).
    for (const width of [넓은폭, 400]) {
      const cols = winning("grid-template-columns", [GRID], width);
      const 위험 = tracks(cols.val).filter((t) => /^[\d.]+fr$/.test(t));
      expect(위험, `${width}px: 최소폭이 내용 크기인 칸이 있다 — minmax(0, …) 로 감싸라`).toEqual([]);
    }
    // 격자 칸 안의 아이는 한 번 더 잠근다 — 칸이 안 늘어나도 아이가 밀고 나올 수 있다.
    const mw = winning("min-width", [GRID, WORK], 넓은폭);
    expect(mw, ".rw-work 의 최소폭을 정하는 규칙이 없다").toBeTruthy();
    expect(mw.val, "작업대 칸의 최소폭이 0 이 아니다").toBe("0");
  });

  it("★ 왼쪽 설정 패널은 작업대 길이를 따라 늘어나지 않는다", () => {
    // 작업대는 단계가 쌓일수록 길어진다. 그대로 두면 설정 패널의 흰 면이 그 길이만큼
    // 함께 늘어나 화면 왼쪽이 빈 흰 기둥이 된다.
    const align = winning("align-items", [GRID], 1200);
    expect(align?.val, "격자가 아이를 위로 붙이지 않는다").toBe("start");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 걸음 띠 — 줄의 이름은 **언제나 보인다.**
//
// 쌓기 시절에는 펼친 줄의 라벨을 감췄다(Ruling 13) — 단계 페이지의 h2 와 같은 말이
// 위아래로 **바싹 붙어** 두 번 떴기 때문이다. 띠에서는 그 중복이 사라진다: 띠는
// 화면 위에 선 길잡이고 h2 는 지금 보고 있는 화면의 제목이라, 탭 이름과 문서 제목이
// 같은 것과 같은 관계다. 그래서 이제는 **감추면 안 된다** — 감추는 순간 띠에서
// 그 줄이 어디를 가리키는지가 사라진다. 옛 규칙이 되살아나면 이 판이 잡는다.
// ────────────────────────────────────────────────────────────────────────
describe("걸음 띠 — 줄의 이름은 언제나 보인다", () => {
  it("★★★ 못 재는 선택자가 뼈대를 건드리지 않는다 — 못 재는 것을 통과로 세지 않는다", () => {
    // 형제 결합자(`+`·`~`)는 이 엔진이 못 잰다. 우리 뼈대의 이름을 달고 나타나면
    // 아래 승부 계산이 조용히 틀리므로, 그 자리에서 멈춘다.
    const 못재는것 = RULES
      .filter((r) => declOf(r.body, "display"))
      .map((r) => r.sel)
      .filter((s) => /[+~]/.test(s) && /\brs-|\brw-|\brp-/.test(s));
    expect(못재는것, "이 판의 엔진이 못 재는 선택자가 생겼다 — 엔진을 늘려라").toEqual([]);
  });

  it("★★★ 지금 서 있는 줄의 라벨이 보인다 — 옛 「펼친 줄 감추기」가 되살아나면 안 된다", () => {
    const w = winning("display", 지금라벨, 1200);
    // display 를 정하는 규칙이 아예 없는 것이 정상이다(기본값 inline).
    expect(w?.val ?? "inline", `지금 줄의 라벨을 감췄다 (이긴 규칙: ${w?.sel})`).not.toBe("none");
  });

  it("★★★ 다른 줄의 라벨도 보인다 — 그것이 그 줄의 유일한 이름이다", () => {
    const w = winning("display", 다른라벨, 1200);
    expect(w?.val ?? "inline", `다른 줄의 라벨을 감췄다 (이긴 규칙: ${w?.sel})`).not.toBe("none");
  });

  it("★★★ 번호도 그대로 남는다 — 라벨과 함께 지우면 줄이 어디를 가리키는지 사라진다", () => {
    const w = winning("display", 지금번호, 1200);
    expect(w?.val ?? "inline", `번호까지 감췄다 (이긴 규칙: ${w?.sel})`).not.toBe("none");
  });

  it("★★ 단계 페이지 여섯은 손대지 않았다 — 제목은 그대로 그 페이지의 것이다", () => {
    // ★ briefing 이 빠져 있었다(2026-09-14 검토). ①입력 화면은 `<h2>{stepLabel}</h2>` 로
    //   **라벨 글자 그대로**를 그린다. 여섯 단계 전부를 센다.
    const 단계들 = ["briefing", "scenario", "images", "prompts", "video", "done"];
    for (const s of 단계들) {
      const page = readFileSync(`app/reel/[id]/${s}/page.js`, "utf8");
      expect(page, `${s} 화면에서 제목이 사라졌다`).toMatch(/<h2[\s>]/);
    }
  });
});

// ★★★ 2026-09-15 — 자르는 기준점을 `.rw-grid` 에서 `.rw-grid {` 로 좁혔다.
//   그 이름이 **다른 규칙의 선택자 안**에도 나타나기 시작했기 때문이다
//   (`main.work:has(.rw-grid)` — 단계별 화면에서만 기둥을 넓히는 규칙).
//   그러면 slice 가 엉뚱한 자리에서 시작해 주석 글자를 선택자로 읽고, 메시지는
//   "주석이 선택자로 샜다"를 가리킨다 — 실제로 한 번 빨개졌다.
describe("규칙: 색·치수는 토큰이다", () => {
  it("내 블록 안에 hex·없는 토큰·액센트가 없다", () => {
    const at = css.indexOf(".rw-grid {");
    expect(at, ".rw-grid 규칙이 없다").toBeGreaterThan(-1);
    const rest = css.slice(at);
    const end = rest.indexOf("/* ──");
    expect(end, "블록 끝 표식이 없다 — 경계가 없으면 남의 CSS 까지 재게 된다").toBeGreaterThan(-1);
    const rules = rest.slice(0, end);
    expect(rules, "hex 를 적었다").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 앱층에서 액센트는 사이드바 스테퍼의 몫이다.
    expect(rules, "앱층에서 액센트를 썼다").not.toMatch(/var\(--accent/);
    // --ink-faint 는 :root 에 **없는** 토큰이다 — 쓰면 조용히 상속색으로 그려진다.
    expect(rules, "없는 토큰을 썼다 — --ink-soft 다").not.toMatch(/--ink-faint/);
  });

  it("★★ 주석이 선택자로 새지 않는다 — 새면 바로 아래 규칙이 통째로 죽는다", () => {
    // 2026-09-14 실측: 주석 안의 경로가 `*` `/` 로 읽혀 주석이 일찍 닫혔고,
    // 남은 한국어가 다음 규칙의 선택자에 붙어 그 규칙이 **첫 커밋부터 죽어 있었다.**
    const at = css.indexOf(".rw-grid {");
    const rest = css.slice(at);
    const body = rest.slice(0, rest.indexOf("/* ──")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of body.matchAll(/([^{}]+)\{/g)) {
      expect(m[1].trim(), `주석이 선택자로 샜다: ${m[1].trim().slice(0, 70)}`).not.toMatch(/[가-힣]/);
    }
  });

  // ★★★ 사장님 규칙 — 값·크레딧은 ⑤영상에서만 말한다. 이 껍데기는 ①~⑥ 어느 단계에서나
  //   서 있어서, 여기서 값을 말하면 "돈이 나가는 자리는 ⑤ 하나"라는 신호가 흐려진다.
  it("★★★ 값을 말하지 않는다 — 가격표를 import 하지도 않는다", () => {
    expect(code, "화면이 값을 말한다").not.toContain("크레딧");
    expect(code, "가격표를 끌어왔다").not.toMatch(/lib\/pricing/);
  });
});
