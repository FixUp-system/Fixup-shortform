# 시각 개편 (Magnific 규칙 이식) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shotform의 시각 시스템을 Magnific 규칙에 맞춰 다크 한 벌로 정리하고, 규칙 위반이 다시 쌓이지 않도록 검사 테스트를 남긴다.

**Architecture:** 시각 변경은 단위 테스트로 잡히지 않는다. 그래서 **소스를 정규식으로 검사하는 테스트 파일 하나**(`tests/design-system.test.js`)를 세우고, 규칙을 하나씩 추가하면서 그때마다 CSS·JSX를 고쳐 통과시킨다. 각 태스크는 "규칙 하나 = 테스트 하나 = 커밋 하나"다. 마지막에 눈으로 확인하는 수동 체크리스트가 붙는다.

**Tech Stack:** Next 15 (App Router) · React 19 · vitest 4 · `geist`(npm) · Pretendard(npm)

## Global Constraints

스펙 `docs/superpowers/specs/2026-07-27-visual-magnific-design.md`의 값을 그대로 쓴다. 태스크마다 아래가 암묵적으로 포함된다.

- **색 토큰** — `--bg:#1A1A1A` `--surface:#232323` `--surface2:#2E2E2E` `--deep:#101010` `--line:#3A3A3A` `--ink:#F5F5F5` `--ink-soft:#A0A0A0` `--accent:#FF58AE` `--accent-soft:rgba(255,88,174,0.10)` `--btn:#F5F5F5` `--btn-ink:#1A1A1A` `--good:#57B383` `--warn:#DFAF54`
- **모서리 3단** — `--r-card:16px` (패널·카드·큰 입력) / `--r-ctl:8px` (버튼·작은 입력·배지) / `--r-pill:999px` (칩·태그). 원형 아바타의 `50%`만 예외.
- **굵기 3단** — `400` 본문 / `500` UI 강조·버튼 / `800` 제목. `600`·`700` 금지.
- **크기 5단** — `12px` `14px` `15px` `16px` `24px`. 소수점 크기 금지.
- **핑크는 크레딧 상자와 결제 자리에만.** 배지·태그·선택·링크·포커스·호버는 전부 무채색.
- **주 실행 버튼은 한 화면에 하나**, `--btn` 바탕에 `--btn-ink` 글씨.
- **그라디언트 금지.**
- **`:root` 블록 밖에서 hex 색 리터럴 금지.** 색은 반드시 `var(--토큰)`으로 참조한다.
- 커밋 메시지는 저장소 관례를 따른다 — 한국어, `타입: 무엇을 왜` 형식.

## 작업 브랜치

현재 저장소는 `feature/synopsis-redefinition` 브랜치에 있고, **다른 세션의 미커밋 변경 9개 파일**이 워킹트리에 있다. 그 위에서 작업하면 섞인다.

Task 0을 먼저 수행한다. 격리가 필요하면 `superpowers:using-git-worktrees` 스킬로 워크트리를 만든다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `tests/design-system.test.js` | 시각 규칙 검사. 규칙마다 `describe` 하나 | **신규** |
| `app/globals.css` (626줄) | 토큰 정의, 전 화면 클래스 | 대폭 수정 |
| `app/layout.js` (27줄) | 벨트, 폰트 주입 | 수정 |
| `components/Sidebar.jsx` (97줄) | — | **수정 없음.** 로고 그라디언트는 CSS `.logo i`에 있어 Task 2에서 CSS만 고치면 된다 |
| `components/SoonStep.jsx` | 인라인 2곳 | 소폭 |
| `app/page.js` | 인라인 2곳 | 소폭 |
| `app/create/page.js` | 인라인 4곳 | 소폭 |
| `app/create/[id]/briefing/page.js` | 인라인 5곳 | 소폭 |
| `app/create/[id]/script/page.js` | 인라인 10곳 | 소폭 |
| `app/create/[id]/synopsis/page.js` | 인라인 12곳 | 소폭 |
| `app/create/[id]/images/page.js` | 인라인 3곳 | 소폭 |
| `package.json` | `geist` · `pretendard` 추가 | 수정 |

`globals.css`는 626줄로 이미 크지만 **분할하지 않는다.** 이 저장소는 CSS 한 파일 관례를 쓰고 있고, 쪼개면 이번 작업의 검사 테스트 경로가 복잡해진다. 분할이 필요해지면 별도 작업으로 다룬다.

---

### Task 0: 작업 브랜치 분리

**Files:**
- 없음 (git 조작만)

**Interfaces:**
- Consumes: 없음
- Produces: 깨끗한 워킹트리 위의 `feature/visual-magnific` 브랜치

- [ ] **Step 1: 현재 상태 확인**

```bash
git branch --show-current
git status --short
```

기대: `feature/synopsis-redefinition`, 수정된 파일 목록이 보인다.

- [ ] **Step 2: 다른 세션 변경을 건드리지 않고 분기**

미커밋 변경은 **그대로 둔다.** 스태시하거나 커밋하지 않는다 — 다른 세션의 작업이다.

```bash
git stash list
git worktree add ../shotform-visual -b feature/visual-magnific
cd ../shotform-visual
npm install
```

워크트리가 새로 생기므로 `node_modules`를 다시 설치해야 한다.

- [ ] **Step 3: 기준선 확인**

```bash
npm test
```

기대: 전량 PASS. 여기가 기준선이다. 이후 태스크에서 기존 테스트가 깨지면 CSS가 아니라 마크업을 잘못 건드린 것이다.

---

### Task 1: 검사 테스트 골격 + 하드코딩 색 제거

**Files:**
- Create: `tests/design-system.test.js`
- Modify: `app/globals.css` (`:root` 블록 및 전역)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `sourceFiles(): string[]` — 검사 대상 파일 경로 목록 (`app/`·`components/` 아래 `.js`·`.jsx`·`.css`)
  - `readAll(): {path: string, text: string}[]` — 위 파일들의 내용
  - `cssWithoutRoot(): string` — `globals.css`에서 `:root { … }` 블록을 제거한 나머지
  - 이후 모든 태스크가 이 세 함수를 재사용한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/design-system.test.js`를 새로 만든다.

```js
// 시각 규칙 검사 — 스펙 docs/superpowers/specs/2026-07-27-visual-magnific-design.md
// 시각 변경은 단위 테스트로 잡히지 않아서, 소스를 직접 훑어 규칙 위반을 잡는다.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components"];

export function sourceFiles() {
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

export function readAll() {
  return sourceFiles().map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

// :root 안은 토큰을 정의하는 곳이라 hex가 있어야 한다. 그 블록만 도려낸다.
// 주석도 함께 지운다 — 주석 안의 색 이름이나 설명이 검사에 걸리면 안 되고,
// 뒤에 올 선택자 추출 검사에서 주석이 선택자에 섞이는 것도 막는다.
export function cssWithoutRoot() {
  const css = readFileSync("app/globals.css", "utf8");
  return css
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
      "--warn": "#DFAF54",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(css, `${name} 토큰`).toMatch(
        new RegExp(`${name}\\s*:\\s*${value}\\s*;`, "i")
      );
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js
```

기대: 두 테스트 모두 FAIL.
첫 테스트는 `#B9A0FF`(10회) · `#8A5CFF` · `#5527E0` · `#3D1DAD` · `#333` 등이 목록으로 나온다.
두 번째는 `--bg` 값이 `#15191E`라서 실패한다.

- [ ] **Step 3: 토큰을 교체한다**

`app/globals.css` 맨 위 `:root` 블록을 통째로 갈아끼운다.

```css
/* shotform 디자인 토큰 — Magnific 다크 시스템 기반 */
:root {
  --bg: #1A1A1A;
  --surface: #232323;
  --surface2: #2E2E2E;
  --deep: #101010;
  --line: #3A3A3A;
  --ink: #F5F5F5;
  --ink-soft: #A0A0A0;

  /* 액센트 — 크레딧·결제 자리에만 */
  --accent: #FF58AE;
  --accent-soft: rgba(255, 88, 174, 0.10);

  /* 주 실행 버튼 — 바탕의 반대색 */
  --btn: #F5F5F5;
  --btn-ink: #1A1A1A;

  --good: #57B383;
  --good-soft: rgba(87, 179, 131, 0.14);
  --warn: #DFAF54;
  --warn-soft: rgba(223, 175, 84, 0.14);

  /* 모서리 3단 */
  --r-card: 16px;
  --r-ctl: 8px;
  --r-pill: 999px;
}
```

- [ ] **Step 4: 하드코딩 색을 토큰으로 바꾼다**

`globals.css`에서 아래를 치환한다. 규칙은 **"퍼플이 맡던 자리를 무채색으로 내린다"**이다.

| 현재 | 바꿀 값 | 나오는 곳 |
|---|---|---|
| `#B9A0FF` | `var(--ink-soft)` | `.side-step em.now` · `.mini:hover` · `.chip:hover` · `.prompt-cell summary` · `.bub summary` · `.st-submitted` · `.badge.vlm` · `.script-box .tag` · `label.up.add:hover` · `.thumb` 계열 |
| `#5527E0` | `var(--surface2)` | `.chat-input button:hover` · `.mini.confirm-btn:hover` |
| `rgba(102, 51, 255, …)` | `var(--line)` 또는 `var(--surface2)` | `.side-step em.now` 테두리 · `.credit-box` 테두리 · `.quick button` 테두리 · `.ask` 테두리 |
| `rgba(57, 62, 70, …)` | `var(--line)` | 카드·표 경계선 전부 |
| `#fff` / `#ffffff` | `var(--ink)` (글자) 또는 `var(--btn)` (버튼 바탕) | `.chip.on` · `.cta` · `.msg.me .bub` 등 |
| `#000` | `var(--deep)` | `.vid-result` 배경 |
| `rgba(10, 13, 15, 0.75)` | `rgba(16, 16, 16, 0.75)` | `.up .tag` |
| `rgba(0, 0, 0, .55)` | 그대로 둔다 | `.thumb .num` — 이미지 위 라벨이라 순수 검정이 맞다 |

`.credit-box`만은 **핑크를 유지한다.** 크레딧 상자는 핑크가 허용된 유일한 곳이다.

```css
.credit-box {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: var(--r-card);
  padding: 14px;
  font-size: 14px;
}
```

`rgba(0, 0, 0, .55)`처럼 남기는 것들은 `rgba()`라 hex 검사에 걸리지 않는다.

- [ ] **Step 5: JSX의 하드코딩 색을 고친다**

`app/create/page.js:55` 한 곳이다.

```jsx
// 전
<div className="thumb" style={{ background: "#333" }}>
// 후
<div className="thumb">
```

`.thumb`가 이미 `background: var(--surface2)`를 갖고 있어 인라인이 필요 없다.

- [ ] **Step 6: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 새 테스트 PASS, 기존 테스트도 전량 PASS.

- [ ] **Step 7: 커밋**

```bash
git add tests/design-system.test.js app/globals.css app/create/page.js
git commit -m "style: 색 토큰을 Magnific 값으로 바꾸고, 토큰 밖 색을 걷어낸다"
```

---

### Task 2: 그라디언트 제거

**Files:**
- Modify: `tests/design-system.test.js` (검사 추가)
- Modify: `app/globals.css` · `app/layout.js` · `components/Sidebar.jsx`

**Interfaces:**
- Consumes: `readAll()` (Task 1)
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`tests/design-system.test.js` 끝에 붙인다.

```js
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
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "그라디언트"
```

기대: FAIL. `globals.css`의 `.belt` · `.logo i` · `.msg .who` 세 곳이 나온다.

- [ ] **Step 3: 상단 벨트를 단색으로 내린다**

`globals.css`의 `.belt`. 원본 dropshot에서 이 자리는 프로모션 배너지만, 우리 벨트는 안내문이라 조용해야 한다.

```css
.belt {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-soft);
}
.belt b {
  background: var(--surface2);
  border-radius: var(--r-ctl);
  padding: 1px 8px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
```

- [ ] **Step 4: 로고와 아바타를 단색으로 내린다**

```css
.logo i {
  width: 24px;
  height: 24px;
  border-radius: var(--r-ctl);
  background: var(--surface2);
  color: var(--ink-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-style: normal;
}

.msg .who {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface2);
  color: var(--ink-soft);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
```

`.msg .who`의 `50%`는 원형 아바타라 모서리 규칙의 예외로 남긴다.

- [ ] **Step 5: 내 말풍선의 퍼플을 뺀다**

`.msg.me .bub`는 지금 `background: var(--accent)`다. 오른쪽 정렬과 아바타 유무로 이미 구분되므로 색이 필요 없다.

```css
.msg.me .bub {
  background: var(--deep);
  border: 1px solid var(--line);
  border-bottom-right-radius: var(--r-ctl);
}
.msg.me .bub small { color: var(--ink-soft); }
```

- [ ] **Step 6: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 전량 PASS.

- [ ] **Step 7: 커밋**

```bash
git add tests/design-system.test.js app/globals.css
git commit -m "style: 그라디언트 세 곳을 단색으로 내리고, 내 말풍선에서 액센트를 뺀다"
```

---

### Task 3: 주 실행 버튼을 흰색으로, 크레딧을 버튼 안에

**Files:**
- Modify: `tests/design-system.test.js`
- Modify: `app/globals.css` (`.cta` · `.chat-input button` · `.mini.confirm-btn` · `.chip.on`)

**Interfaces:**
- Consumes: `cssWithoutRoot()` (Task 1)
- Produces: `.cta .cr` — 버튼 안 크레딧 칩. 이미 마크업에 존재하며(`app/create/[id]/*/page.js`), 스타일만 바뀐다.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

```js
describe("주 실행 버튼", () => {
  const cssRule = (selector) => {
    const css = cssWithoutRoot();
    const re = new RegExp(
      `(^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
      "m"
    );
    const m = css.match(re);
    return m ? m[2] : "";
  };

  it(".cta는 --btn 바탕에 --btn-ink 글씨다", () => {
    const rule = cssRule(".cta");
    expect(rule).toMatch(/background:\s*var\(--btn\)/);
    expect(rule).toMatch(/color:\s*var\(--btn-ink\)/);
  });

  it("액센트를 배경으로 쓰는 규칙은 크레딧 상자뿐이다", () => {
    const css = cssWithoutRoot();
    const offenders = [];
    // "선택자 { … background: var(--accent…) … }" 를 찾아 선택자만 모은다
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      if (/background:\s*var\(--accent/.test(body)) {
        offenders.push(selector.trim());
      }
    }
    expect(offenders).toEqual([".credit-box"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "주 실행 버튼"
```

기대: FAIL. `.cta`가 `var(--accent)` 배경이고, `.chip.on` · `.mini.confirm-btn` · `.chat-input button`도 액센트를 배경으로 쓴다.

- [ ] **Step 3: `.cta`를 흰 버튼으로 바꾼다**

```css
.cta {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 0;
  background: var(--btn);
  color: var(--btn-ink);
  border-radius: var(--r-ctl);
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 20px;
}
.cta:hover { background: var(--ink); }
.cta:disabled { opacity: 0.4; cursor: default; }
.cta[aria-disabled="true"] { opacity: 0.4; }

/* 버튼 안 크레딧 — 얼마 나가는지를 누르는 자리에서 말한다 */
.cta .cr {
  background: rgba(26, 26, 26, 0.12);
  border-radius: var(--r-ctl);
  padding: 1px 8px;
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: 나머지 액센트 배경을 무채색으로 내린다**

```css
/* 선택된 칩 — 채워진 배경으로 선택을 말하되 색은 쓰지 않는다 */
.chip.on {
  background: var(--surface2);
  border-color: var(--surface2);
  color: var(--ink);
  font-weight: 500;
}

/* 홈 챗 전송 — 여기도 주 실행 버튼이다 */
.chat-input button {
  border: 0;
  background: var(--btn);
  color: var(--btn-ink);
  border-radius: var(--r-card);
  height: 84px;
  padding: 0 22px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  flex: none;
}
.chat-input button:hover { background: var(--ink); }
.chat-input button:disabled { opacity: 0.4; cursor: default; }

/* 결과 확정 — 미리보기 패널의 주 버튼 */
.mini.confirm-btn {
  background: var(--btn);
  border-color: var(--btn);
  color: var(--btn-ink);
  font-weight: 500;
  padding: 9px 16px;
  font-size: 14px;
}
.mini.confirm-btn:hover { background: var(--ink); color: var(--btn-ink); }
.mini.confirm-btn:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 5: 남은 액센트 사용처를 정리한다**

`background`가 아닌 곳의 액센트도 규칙 2에 걸린다. 아래를 무채색으로 내린다.

```css
.side-step.on { background: var(--surface2); color: var(--ink); font-weight: 500; }
.thumb.selected { border-color: var(--ink); }
.brief-point::before { content: "•"; color: var(--ink-soft); }
.ask { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); padding: 14px 16px; margin-top: 14px; }
.badge.vlm { background: var(--surface2); color: var(--ink-soft); }
.st-submitted { background: var(--surface2); color: var(--ink-soft); }
.script-box .tag { background: var(--surface2); color: var(--ink-soft); }
.spin { border: 2px solid var(--ink-soft); border-top-color: transparent; }
```

포커스 링도 액센트를 쓰고 있다. 4곳(`.chat-input textarea` · `.prompt-edit` · `textarea.ref` · `.sent-input`)의 `outline` 색을 `var(--ink)`로 바꾼다.

```css
.chat-input textarea:focus-visible,
.prompt-edit:focus-visible,
textarea.ref:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -1px;
}
```

- [ ] **Step 6: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 전량 PASS. 두 번째 테스트가 `[".credit-box"]`만 남았다고 확인해 준다.

- [ ] **Step 7: 커밋**

```bash
git add tests/design-system.test.js app/globals.css
git commit -m "style: 주 실행 버튼을 흰색으로 세우고, 액센트를 크레딧 자리에만 남긴다"
```

---

### Task 4: 모서리 3단으로 통일

**Files:**
- Modify: `tests/design-system.test.js`
- Modify: `app/globals.css` (전역)

**Interfaces:**
- Consumes: `cssWithoutRoot()` (Task 1)
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 추가한다**

```js
describe("모서리", () => {
  it("border-radius는 토큰 세 개와 50%만 쓴다", () => {
    const ALLOWED = [
      "var(--r-card)", "var(--r-ctl)", "var(--r-pill)", "50%", "inherit",
    ];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/border(-[a-z]+)?-radius:\s*([^;]+);/g)) {
      const value = m[2].trim();
      // "var(--r-ctl) var(--r-ctl) 0 0" 처럼 여러 값을 쓰는 경우도 통과시킨다
      const parts = value.split(/\s+/);
      if (!parts.every((p) => ALLOWED.includes(p) || p === "0")) {
        offenders.push(value);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "모서리"
```

기대: FAIL. `4px` `5px` `6px` `7px` `9px` `10px` `12px` `14px` `999px` 등이 목록에 나온다.

- [ ] **Step 3: 값을 매핑해 치환한다**

기계적 매핑을 쓰되, **요소 성격이 우선**이다.

| 현재 값 | 바꿀 토큰 | 근거 |
|---|---|---|
| `4px` `5px` `6px` `7px` `8px` `9px` | `var(--r-ctl)` | 버튼·배지·작은 입력 |
| `10px` `12px` `14px` | `var(--r-card)` | 패널·카드·표·큰 입력·미디어 프레임 |
| `999px` | `var(--r-pill)` | 칩·태그 |
| `50%` | 그대로 | 원형 아바타(`.msg .who`) |

예외 두 가지:

- `.msg.me .bub` · `.msg.ai .bub`의 `border-bottom-*-radius: 4px`는 말풍선 꼬리다. `var(--r-ctl)`로 올린다.
- `.thumb`의 `border: 2px solid transparent`는 선택 테두리라 모서리와 무관하다. 건드리지 않는다.

치환 후 확인:

```bash
grep -n 'border[a-z-]*radius' app/globals.css | grep -v 'var(--r-' | grep -v '50%'
```

기대: 아무것도 안 나온다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 전량 PASS.

- [ ] **Step 5: 커밋**

```bash
git add tests/design-system.test.js app/globals.css
git commit -m "style: 모서리 열 종류를 세 토큰으로 모은다"
```

---

### Task 5: 굵기 3단 · 크기 5단

**Files:**
- Modify: `tests/design-system.test.js`
- Modify: `app/globals.css` (전역)

**Interfaces:**
- Consumes: `cssWithoutRoot()` (Task 1)
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 추가한다**

```js
describe("타이포", () => {
  it("font-weight는 400 · 500 · 800만 쓴다", () => {
    const ALLOWED = ["400", "500", "800", "inherit", "normal"];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/font-weight:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (!ALLOWED.includes(v)) offenders.push(v);
    }
    expect(offenders).toEqual([]);
  });

  it("font-size는 12 · 14 · 15 · 16 · 24px만 쓴다", () => {
    const ALLOWED = ["12px", "14px", "15px", "16px", "24px", "inherit"];
    const offenders = [];
    for (const m of cssWithoutRoot().matchAll(/font-size:\s*([^;]+);/g)) {
      const v = m[1].trim();
      if (!ALLOWED.includes(v)) offenders.push(v);
    }
    expect(offenders).toEqual([]);
  });
});
```

`font: inherit` 축약형은 크기를 지정하지 않으므로 검사에 걸리지 않는다. 그대로 둔다.

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "타이포"
```

기대: FAIL. 굵기는 `600` `700` `800`이, 크기는 `9px`부터 `24px`까지 14종이 나온다.

- [ ] **Step 3: 굵기를 매핑한다**

| 대상 | 값 |
|---|---|
| `h1.pgtitle` · `.panel h2` · `.credit-box b` · `.cost-tile b` | `800` |
| 그 외 `600` · `700` · `800` 전부 | `500` |

`800`을 받는 곳에는 `letter-spacing: -0.02em`을 함께 준다.

```css
h1.pgtitle {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
}
.credit-box b {
  display: block;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 2px;
}
.cost-tile b {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: 크기를 매핑한다**

| 현재 값 | 바꿀 값 | 대상 성격 |
|---|---|---|
| `9px` `10px` `10.5px` `11px` `11.5px` `12px` `12.5px` | `12px` | 배지·태그·보조 문구·표 헤더 |
| `13px` `13.5px` `14px` `14.5px` | `14px` | UI 컨트롤·버튼·라벨·사이드바 |
| — | `15px` | **본문**: `body` · `.bub` · `.cut .txt` · `.brief-row .val` · `textarea` 계열 |
| `16px` | `16px` | 대본 본문(`.script-box`) |
| `19px` `20px` | `24px` | 제목 |

`body`의 `font-size: 14px` → **`15px`**로 올린다. 이게 스펙의 본문 기준값이다.

치환 후 확인:

```bash
grep -n 'font-size' app/globals.css | grep -vE 'font-size:\s*(12px|14px|15px|16px|24px|inherit)'
```

기대: 아무것도 안 나온다.

- [ ] **Step 5: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 전량 PASS.

- [ ] **Step 6: 커밋**

```bash
git add tests/design-system.test.js app/globals.css
git commit -m "style: 굵기를 세 단, 글자 크기를 다섯 단으로 줄인다"
```

---

### Task 6: 인라인 스타일 회수

**Files:**
- Modify: `tests/design-system.test.js`
- Modify: `app/globals.css` (클래스 신설)
- Modify: `app/page.js` · `app/create/page.js` · `app/create/[id]/{briefing,script,synopsis,images}/page.js` · `components/SoonStep.jsx`

**Interfaces:**
- Consumes: 없음
- Produces: 아래 다섯 클래스. 이후 화면을 만들 때 재사용한다.
  - `.panel--narrow` — 읽기 좋은 폭으로 제한된 패널
  - `.pgsub.warn` — 경고 문구
  - `.editable` — `contentEditable` 영역
  - `.fix-row` / `.fix-input` — 수정 지시 입력 행

- [ ] **Step 1: 실패하는 테스트를 추가한다**

```js
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
```

0을 목표로 하지 않는다. 계산된 값이나 조건부 표시처럼 클래스로 뺄 수 없는 것이 남는다.

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "인라인"
```

기대: FAIL, `38`이 나온다.

- [ ] **Step 3: 클래스를 만든다**

`globals.css` 끝에 추가한다.

```css
/* ── 인라인에서 회수한 반복 패턴 */

/* 읽기 좋은 폭 — 대본·구성·브리핑 패널이 공통으로 쓴다 */
.panel--narrow { max-width: 760px; }
.panel--wide { max-width: 880px; }

/* 경고 문구 — 실패·주의를 말하는 한 줄 */
.pgsub.warn { color: var(--warn); }

/* 클릭해서 고치는 문장 — 포커스 테두리를 지우고 글자만 남긴다 */
.editable { outline: none; }
.editable:focus-visible { background: var(--surface2); border-radius: var(--r-ctl); }

/* 수정 지시 행 — 입력 하나 + 버튼 하나 */
.fix-row { display: flex; gap: 8px; margin-top: 14px; align-items: flex-end; }
.fix-row .fix-input {
  flex: 1;
  min-height: 96px;
  padding: 13px 15px;
  font-size: 15px;
  line-height: 1.55;
  resize: vertical;
  font-family: inherit;
}
.fix-row .mini { padding: 13px 18px; font-size: 14px; white-space: nowrap; }

/* 간격 유틸 — 인라인 marginTop 을 대신한다 */
.mt-sm { margin-top: 6px; }
.mt-md { margin-top: 12px; }
.mt-lg { margin-top: 18px; }
```

`.editable:focus-visible`에 배경을 준 것은 개선이다. 지금은 `outline: none`만 있어서 **키보드로 이동하면 어디에 있는지 안 보인다.**

- [ ] **Step 4: 각 화면에서 인라인을 걷어낸다**

패턴별로 치환한다.

**(1) 경고 문구 — 12곳.** `briefing:139,143` · `images:139` · `script:76,93,95,118` · `synopsis:65,80,85,117,119,157` · `create/page:65`

```jsx
// 전
<p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>
// 후
<p className="pgsub warn">{err}</p>
```

**(2) 패널 폭 — 5곳.** `briefing:136` · `script:91` · `synopsis:74,115` · `SoonStep:9`

```jsx
// 전
<section className="panel" style={{ maxWidth: 760 }}>
// 후
<section className="panel panel--narrow">
```

`create/page.js:45`의 `maxWidth: 880`은 `.panel--wide`를 쓴다.

**(3) `contentEditable` — 5곳.** `briefing:156` · `images:160` · `script:107` · `synopsis:131,139`

```jsx
// 전
<span contentEditable suppressContentEditableWarning style={{ outline: "none" }} onBlur={…}>
// 후
<span contentEditable suppressContentEditableWarning className="editable" onBlur={…}>
```

`briefing:156`은 `{ outline: "none", flex: 1 }`이다. `flex: 1`이 필요하므로 `.editable`에 더해 감싼 요소에서 처리하거나, `className="editable"` + 부모에 `display:flex`가 이미 있으면 `flex:1`만 남긴다. 이 한 곳은 인라인 `style={{ flex: 1 }}`로 남겨도 된다(허용 10곳 안).

**(4) 수정 지시 행 — 6곳.** `script:122,123,126` · `synopsis:161,164` 및 짝 버튼

```jsx
// 전
<div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "flex-end" }}>
  <textarea className="sent-input" style={{ flex: 1, minHeight: 96, padding: "13px 15px", fontSize: 14, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }} … />
  <button className="mini" style={{ padding: "13px 18px", fontSize: 13.5, whiteSpace: "nowrap" }} …>…</button>
</div>
// 후
<div className="fix-row">
  <textarea className="sent-input fix-input" … />
  <button className="mini" …>…</button>
</div>
```

**(5) 간격 — 4곳.** `briefing:163` · `images:228` · `script:133` · `SoonStep:11`

```jsx
// 전
<div className="eyebrow" style={{ marginTop: 18 }}>화면 비율 …</div>
// 후
<div className="eyebrow mt-lg">화면 비율 …</div>
```

**(6) 남기는 것 — 4곳.** 아래는 클래스로 뺄 이유가 없다. 그대로 둔다.

- `create/page.js:56` — `<video>`의 `objectFit: "cover"` (요소 하나뿐)
- `page.js:150` — 아이콘 정렬 `verticalAlign: "3px"`
- `page.js:190` — 링크 `textDecoration: "none"` + 정렬
- `briefing:156` — 위 (3)에서 남긴 `flex: 1`

- [ ] **Step 5: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
```

기대: 전량 PASS. 인라인 개수가 10 이하로 떨어진다.

- [ ] **Step 6: 커밋**

```bash
git add tests/design-system.test.js app/globals.css app components
git commit -m "refactor: 반복되던 인라인 스타일을 클래스로 회수한다"
```

---

### Task 7: 서체 주입 (Geist + Pretendard)

**Files:**
- Modify: `package.json`
- Modify: `app/layout.js`
- Modify: `app/globals.css` (`body`의 `font-family`)
- Modify: `tests/design-system.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `--font-geist` · `--font-pretendard` CSS 변수. `layout.js`가 `<html>`에 클래스로 붙인다.

지금 `font-family`에 Pretendard가 적혀 있지만 **폰트를 로드하는 코드가 어디에도 없다.** 실제로는 시스템 대체 서체가 보이는 중이다.

- [ ] **Step 1: 패키지를 설치한다**

```bash
npm i geist pretendard
```

- [ ] **Step 2: Pretendard 파일 경로를 확인한다**

```bash
ls node_modules/pretendard/dist/web/variable/woff2/
```

기대: `PretendardVariable.woff2` 가 있다. 경로가 다르면 다음 단계에서 실제 경로를 쓴다.

- [ ] **Step 3: 실패하는 테스트를 추가한다**

```js
describe("서체", () => {
  it("layout.js 가 폰트를 실제로 주입한다", () => {
    const layout = readFileSync("app/layout.js", "utf8");
    expect(layout).toMatch(/from ["']geist\/font\/sans["']/);
    expect(layout).toMatch(/from ["']next\/font\/local["']/);
  });

  it("body 는 주입된 폰트 변수를 쓴다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    // geist/font/sans 가 만드는 변수 이름은 --font-geist-sans 다.
    expect(css).toMatch(/var\(--font-geist-sans\)/);
    expect(css).toMatch(/var\(--font-pretendard\)/);
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

```bash
npx vitest run tests/design-system.test.js -t "서체"
```

기대: FAIL 둘 다.

- [ ] **Step 5: `layout.js`에서 폰트를 주입한다**

```jsx
import "./globals.css";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import Sidebar from "../components/Sidebar";
import { ProjectProvider } from "../components/ProjectContext";

// 한글은 Geist에 글리프가 없어 Pretendard가 받는다.
const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "400 800",
  display: "swap",
});

export const metadata = {
  title: "shotform — 숏폼 자동 생성",
  description: "대화만 하면 숏폼 영상이 만들어져요",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${pretendard.variable}`}>
      <body>
        <div className="belt">
          <b>BETA</b> 빠른 생성 실험 버전 — 대화로 정보를 모아 최신 비디오 모델에 전달합니다
        </div>
        <ProjectProvider>
          <div className="shell">
            <Sidebar />
            <main className="work">{children}</main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
```

`geist/font/sans`는 `--font-geist-sans` 변수를 만든다. 테스트가 찾는 이름과 맞추기 위해 `globals.css`에서 그 이름을 그대로 쓴다(다음 단계).

- [ ] **Step 6: `globals.css`의 `body`를 고친다**

```css
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  /* 라틴·숫자는 Geist, 한글은 Pretendard가 받는다 */
  font-family: var(--font-geist-sans), var(--font-pretendard), system-ui, sans-serif;
  line-height: 1.6;
  font-size: 15px;
}
```

`GeistSans.variable`은 클래스명을 돌려주고, 그 클래스가 `--font-geist-sans`를 정의한다. `localFont` 쪽은 위에서 `variable: "--font-pretendard"`로 직접 지정했다.

변수명이 예상과 다르면 브라우저 개발자 도구에서 `<html>` 요소의 계산된 스타일을 열어 실제 이름을 확인하고, CSS와 테스트의 정규식을 함께 고친다.

- [ ] **Step 7: 실제로 로드되는지 확인한다**

```bash
npm run dev
```

브라우저에서 아무 화면이나 열고 개발자 도구 → Network → Font 탭에서 **woff2 두 개가 실제로 받아지는지** 본다. 받아지지 않으면 경로가 틀린 것이다.

- [ ] **Step 8: 통과를 확인한다**

```bash
npx vitest run tests/design-system.test.js
npm test
npm run build
```

`npm run build`를 여기서 한 번 돌린다. `next/font/local`은 빌드 시 경로를 해석하므로, 경로가 틀리면 빌드에서 잡힌다.

- [ ] **Step 9: 커밋**

```bash
git add package.json package-lock.json app/layout.js app/globals.css tests/design-system.test.js
git commit -m "style: Geist와 Pretendard를 실제로 주입한다 — 지금까지 웹폰트가 로드되지 않았다"
```

---

### Task 8: 눈으로 확인하고 마무리

**Files:**
- 없음 (확인만). 발견한 문제가 있으면 해당 파일을 고친다.

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 없음

자동 검사가 잡지 못하는 것들이다. **7개 화면을 전부 연다.**

- [ ] **Step 1: 개발 서버를 띄운다**

```bash
npm run dev
```

- [ ] **Step 2: 화면별로 확인한다**

- [ ] `/` 홈(챗) — 내 말풍선이 무채색인가. 아바타·퀵 버튼에 퍼플이 남아 있지 않은가
- [ ] `/create` 자료 넣기 — 업로드 칸과 썸네일이 정상인가
- [ ] `/create/[id]/briefing` 기획 — 브리핑 카드의 불릿·질문 상자가 무채색인가
- [ ] `/create/[id]/synopsis` 구성 — 인라인을 걷어낸 뒤 레이아웃이 깨지지 않았는가
- [ ] `/create/[id]/script` 대본 — **주 버튼이 화면에서 유일하게 가장 밝은가.** 문장을 클릭했을 때 편집 상태가 보이는가
- [ ] `/create/[id]/images` 이미지 — **생성된 사진이 UI보다 밝고 선명한가**
- [ ] `/costs` 비용 기록 — 표의 배지 세 종류가 읽히는가

- [ ] **Step 3: 사이드바를 확인한다**

- [ ] 어느 화면에서든 **핑크가 크레딧 상자에만** 있는가
- [ ] 단계 스테퍼의 `진행 중` 배지가 무채색인가

- [ ] **Step 4: 실패 상태를 확인한다 — 이 방향의 유일한 위험**

대본 화면에서 일부러 실패를 만든다. 개발자 도구 Network 탭에서 오프라인으로 전환한 뒤 `전체 다시 쓰기`를 누르면 에러 문구가 나온다.

- [ ] 경고 노랑(`#DFAF54`)과 크레딧 핑크(`#FF58AE`)가 **같은 화면에서 헷갈리지 않는가**

헷갈린다면 `--warn`을 더 노란 쪽으로 옮긴다.

```css
--warn: #E5B93C;
--warn-soft: rgba(229, 185, 60, 0.14);
```

- [ ] **Step 5: 본문 15px 상향의 영향을 확인한다**

- [ ] 대본·구성 화면에서 스크롤이 눈에 띄게 길어지지 않았는가

길어져서 한 화면에 안 들어오면 `.script-box`의 `line-height`를 `1.8` → `1.7`로 줄인다. 글자 크기는 되돌리지 않는다.

- [ ] **Step 6: 최종 검사**

```bash
npm test
npm run build
```

기대: 전량 PASS, 빌드 성공.

- [ ] **Step 7: 커밋**

Step 4·5에서 고친 것이 있을 때만 커밋한다.

```bash
git add -A
git commit -m "style: 실패 화면에서 경고색과 액센트가 부딪히지 않게 조정한다"
```

- [ ] **Step 8: 사용자에게 보고한다**

병합·푸시는 **하지 않는다.** 사용자가 요청할 때만 한다. 아래를 보고한다.

- 최종 인라인 개수 (`38 → ?`)
- Step 4의 색 충돌 판단 결과
- 서체가 실제로 로드됐는지, 인상이 기대와 맞는지
- 워크트리 위치 (`../shotform-visual`)와 브랜치 이름

---

## 이번 작업에서 하지 않는 것

스펙 §5에 적힌 대로다. 나중에 헷갈리지 않게 여기에도 남긴다.

- **밝은 면 / 종이 시트** — 다크 한 벌로 간다
- **3열 레이아웃 재배치** — 화면 구조는 건드리지 않는다
- **상태 표현 컴포넌트 신설**(로딩·에러·빈 화면) — UX 3분할 중 A(상태) 축. 별도 스펙
- **흐름 개선**(유료 호출 예고 흐름, `contentEditable` 대체, 되돌리기, 단계 이동) — B(흐름) 축. 별도 스펙
- **스토리보드 카드 재설계** — 라이브 출력을 보고 디자인해야 한다

Task 3에서 넣는 버튼 안 크레딧(`✦ N`)은 **시각 층에서만** 한다. 이미 알고 있는 값을 버튼에 표시하는 것까지이고, 비용 계산·예고 흐름은 B축이다.
