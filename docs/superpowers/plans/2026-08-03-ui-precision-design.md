# 화면 정밀도 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 "안 예쁘다"고 판정한 화면의 시각 정밀도를 올린다 — 아이콘을 SVG로 바꾸고, 액센트를 진행 단계로 옮기고, 타이포 위계와 여백을 다시 잡는다.

**Architecture:** 변경은 거의 전부 `app/globals.css` 한 파일과 `components/Icon.jsx`(신설)에 모인다. 화면 파일(`app/**/page.js`)은 기존 클래스를 재사용하므로 대부분 손대지 않는다 — 로그인·승인대기·관리자 화면도 CSS만 고치면 함께 좋아진다. 시각 변경은 단위 테스트로 잡히지 않으므로, `tests/design-system.test.js`가 소스를 훑어 규칙을 판정하는 것이 이 저장소의 방식이다. **각 태스크는 규칙 테스트를 먼저 고쳐 빨갛게 만든 뒤 CSS를 고쳐 그린으로 만든다.**

**Tech Stack:** Next.js 15 App Router · React 19 · 순수 CSS(`app/globals.css`) · Vitest

## Global Constraints

스펙 `docs/superpowers/specs/2026-08-03-ui-precision-design.md`의 "건드리지 않는 것"을 그대로 옮긴다. 모든 태스크에 적용된다.

- **`:root` 밖에 hex 색 리터럴을 쓰지 않는다.** 이 규칙은 `app/`·`components/` 아래 **`.js`·`.jsx`·`.css` 전부**에 적용된다(`tests/design-system.test.js:36`). SVG 아이콘은 반드시 `stroke="currentColor"`를 쓴다 — `#F5F5F5` 같은 값을 쓰면 그 테스트가 빨개진다
- **색 토큰 값을 바꾸지 않는다** — `--bg: #1A1A1A` 외 11개 전부 그대로(`tests/design-system.test.js:52`)
- **그라디언트를 쓰지 않는다**
- **`border-radius`는 `var(--r-card)`·`var(--r-ctl)`·`var(--r-pill)`·`50%`·`0`만 쓴다**
- **주 실행 버튼 `.cta`는 `--btn` 바탕에 `--btn-ink` 글씨다** — AI 영상 서비스 6곳 실측에서 6/6 공통이었던 규칙이다. 건드리지 않는다
- **`style={{ }}` 인라인 스타일은 전체 10곳 이하를 유지한다**
- **화면 로직·라우팅·단계 구조를 바꾸지 않는다.** `lib/steps.js`에서 바꾸는 것은 `no` 문자열뿐이다
- 새 npm 의존성을 추가하지 않는다
- **예상 못 한 실패는 고치지 말고 보고한다.** 아래 표에 없는 테스트가 빨개지면 범위를 넘은 것이다

이 계획이 갱신을 **허용**하는 테스트는 셋뿐이다:

| 파일·줄 | 무엇 | 어느 태스크 |
|---|---|---|
| `tests/design-system.test.js:128` | 굵기 허용 목록 | Task 1 |
| `tests/design-system.test.js:138` | 크기 허용 목록 | Task 1 |
| `tests/steps.test.js:28` | 단계 번호 `①`~`⑥` | Task 3 |
| `tests/design-system.test.js:117` | 액센트 사용처 | Task 4 |

**시작 HEAD:** `e9fb701` (설계 문서 커밋)
**기준 테스트 수:** 920 통과 / 10 skip. 매 태스크 끝에서 이 수가 유지되거나 늘어야 한다.

---

### Task 1: 타이포 스케일 재배분

먼저 한다. 이후 모든 태스크가 이 스케일 위에서 값을 고른다.

**Files:**
- Modify: `app/globals.css` (아래 표의 줄)
- Modify: `tests/design-system.test.js:128-146`

**Interfaces:**
- Produces: 굵기 `400 / 600 / 700`, 크기 `12 / 14 / 16 / 18 / 28`px. Task 2~6은 이 목록 밖의 값을 쓰면 안 된다

- [ ] **Step 1: 규칙 테스트를 새 스케일로 고친다 (실패하게)**

`tests/design-system.test.js`의 타이포 describe 두 개를 통째로 바꾼다:

```js
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/design-system.test.js`
Expected: FAIL 2건. 굵기는 `["500","800", …]`이, 크기는 `["15px","24px", …]`이 offenders에 잡힌다

- [ ] **Step 3: 굵기를 바꾼다**

`app/globals.css`에서 일괄 치환한다. **`font-weight: 500` 17곳 전부 → `600`**, **`font-weight: 800` 4곳 전부 → `700`**. `400`은 그대로 둔다.

- [ ] **Step 4: 크기를 바꾼다**

`font-size: 15px` **11곳 전부 → `16px`**. 스펙이 예외 없이 흡수하라고 정했다 — 15와 16을 둘 다 남기면 종류만 늘고 화면에서는 구분되지 않는다.

`font-size: 24px` 4곳은 자리마다 다르다:

| 줄 | 무엇 | 바꾼 뒤 |
|---|---|---|
| `h1.pgtitle` | 페이지 제목 | **28px** (굵기는 Step 3이 이미 700으로) |
| `.credit-box b` | "무제한" | **18px** · 굵기는 이 줄만 **600**으로 되돌린다 |
| `.cost-tile b` | 비용 합계 숫자 | **28px** |
| `label.up.add` | 사진 추가 `+` 기호 | **18px** |

`font-size: 16px` 3곳(`.logo`·`textarea.ref-lg`·`.script-box`)은 이미 허용 값이라 그대로 둔다.

`body { font-size: 15px }`도 위 11곳에 포함된다 — **16px**가 된다.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip. 타이포 2건이 그린

- [ ] **Step 6: 변이로 단정이 무는지 본다**

`h1.pgtitle`의 `28px`를 잠깐 `24px`로 되돌리고 `npx vitest run tests/design-system.test.js`를 돌린다.
Expected: 크기 테스트가 FAIL(`["24px"]`). 확인했으면 `28px`로 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add app/globals.css tests/design-system.test.js
git commit -m "style: 타이포 위계를 굵기와 대비로 — 400/600/700 · 12/14/16/18/28

500과 400은 화면에서 구분되지 않았고 800은 24px 한 자리에만 있어 실질 위계가
2단이었다. 종류를 늘리지 않고 대비만 키운다. 15px 11곳은 16px로 흡수했다 —
둘 다 남기면 크기 종류만 늘고 눈으로는 갈리지 않는다."
```

---

### Task 2: Icon 컴포넌트 신설 + 사이드바 글리프 교체

**Files:**
- Create: `components/Icon.jsx`
- Modify: `components/Sidebar.jsx` (`.ic` 글리프 7곳 + 로고 1곳)
- Modify: `app/globals.css` — `.side-item .ic`·`.logo i`

**Interfaces:**
- Produces: `<Icon name="home" />` · `<Icon name="home" size={18} />`. 이름은 `home`·`sparkle`·`archive`·`template`·`clock`·`gear`·`power`·`play`·`check` 아홉 개. Task 3이 `check`를 쓴다

- [ ] **Step 1: Icon 컴포넌트를 만든다**

Create `components/Icon.jsx`:

```jsx
// 아이콘을 SVG 한 세트로 — 유니코드 글리프(⌂ ✦ ▤ ◫ ◷ ⚙︎ ⏻ ▶)는 폰트마다 굵기·크기·
// 베이스라인이 달라 사이드바 세로줄이 눈에 띄게 어긋났다. .ic 의 width 는 폭만 맞출 뿐
// 글리프 자체의 크기 차이는 그대로 남는다.
//
// ★ 색은 반드시 currentColor 다. hex 를 쓰면 tests/design-system.test.js 의
//   ":root 밖에는 hex 색 리터럴이 없다"가 .jsx 까지 훑어 빨개진다.
//
// aria-hidden — 아이콘 옆에는 항상 글자 라벨이 있다. 빼면 스크린리더가 두 번 읽는다.

const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  sparkle: <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3" />,
  archive: <path d="M3 6h18M3 12h18M3 18h18" />,
  template: <path d="M3.5 4.5h17v15h-17zM10 4.5v15" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </>
  ),
  power: <path d="M12 3v9M6.8 6.8a7.5 7.5 0 1 0 10.4 0" />,
  play: <path d="M8 5.5l11 6.5-11 6.5z" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
};

export default function Icon({ name, size = 18 }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}
```

- [ ] **Step 2: 사이드바가 Icon을 쓰게 바꾼다**

`components/Sidebar.jsx` 상단에 `import Icon from "./Icon";`를 더하고, 글리프 여덟 자리를 바꾼다:

| 지금 | 바꾼 뒤 |
|---|---|
| `<i>▶</i>shotform` | `<Icon name="play" size={16} />shotform` |
| `<span className="ic">⌂</span>홈 — 빠른 생성` | `<span className="ic"><Icon name="home" /></span>홈 — 빠른 생성` |
| `<span className="ic">✦</span>영상 만들기 (단계별)` | `<span className="ic"><Icon name="sparkle" /></span>영상 만들기 (단계별)` |
| `<span className="ic">▤</span>보관함` | `<span className="ic"><Icon name="archive" /></span>보관함` |
| `<span className="ic">◫</span>템플릿` | `<span className="ic"><Icon name="template" /></span>템플릿` |
| `<span className="ic">◷</span>비용 기록` | `<span className="ic"><Icon name="clock" /></span>비용 기록` |
| `<span className="ic">⚙︎</span>설정` | `<span className="ic"><Icon name="gear" /></span>설정` |
| `<span className="ic">⏻</span>로그아웃` | `<span className="ic"><Icon name="power" /></span>로그아웃` |

- [ ] **Step 3: `.ic`와 `.logo i`의 폭 보정을 걷어낸다**

`app/globals.css`에서:

```css
/* 지금 */
.side-item .ic { width: 18px; text-align: center; flex: none; opacity: 0.85; }

/* 바꾼 뒤 — SVG 는 크기가 고정이라 폭 보정이 필요 없다 */
.side-item .ic { display: inline-flex; flex: none; opacity: 0.85; }
```

`.logo i`는 24×24 `--surface2` 상자 안에 글리프를 넣던 규칙이다. SVG가 들어가므로 정렬만 남긴다:

```css
.logo i {
  width: 24px; height: 24px;
  border-radius: var(--r-ctl);
  background: var(--surface2);
  color: var(--ink-soft);
  display: inline-flex; align-items: center; justify-content: center;
  font-style: normal;
}
```

(`font-size: 12px` 줄만 지운다 — SVG는 글자 크기를 보지 않는다.)

`Sidebar.jsx`의 로고는 `<i>` 껍데기를 유지한다: `<i><Icon name="play" size={16} /></i>shotform`

- [ ] **Step 4: 유니코드 글리프가 남았는지 확인한다**

Run: `grep -n "⌂\|✦\|▤\|◫\|◷\|⚙\|⏻\|▶" components/Sidebar.jsx`
Expected: 결과 없음

- [ ] **Step 5: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip. 특히 hex 금지 테스트가 그린이어야 한다 — 빨개졌다면 `Icon.jsx`에 hex를 쓴 것이다

- [ ] **Step 6: 커밋**

```bash
git add components/Icon.jsx components/Sidebar.jsx app/globals.css
git commit -m "style: 아이콘을 SVG 한 세트로 — 글리프는 세로줄을 못 맞춘다

⌂ ✦ ▤ ◫ ◷ ⚙︎ ⏻ ▶ 는 폰트마다 굵기·크기·베이스라인이 달라 사이드바 아이콘이
눈에 띄게 어긋나 있었다. .ic 의 width:18px 은 폭만 맞출 뿐 글리프 크기 차이는
그대로 남는다. stroke 1.5 · viewBox 24 로 통일한 인라인 SVG 아홉 개로 바꾼다.
라이브러리 의존성은 늘리지 않았고, 색은 currentColor 라 hex 금지 규칙을 지킨다."
```

---

### Task 3: 단계 번호를 숫자 배지로

**Files:**
- Modify: `lib/steps.js:13-20` (`STEPS[].no`)
- Modify: `tests/steps.test.js:28`
- Modify: `components/Sidebar.jsx` (`StepList`)
- Modify: `app/globals.css` — `.side-step i`·`.side-step em`

**Interfaces:**
- Consumes: Task 2의 `<Icon name="check" />`
- Produces: `STEPS[].no`가 `"1"`~`"6"`

- [ ] **Step 1: 테스트를 숫자로 고친다 (실패하게)**

`tests/steps.test.js:28`:

```js
    expect(STEPS.map((s) => s.no)).toEqual(["1", "2", "3", "4", "5", "6"]);
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — 받은 값이 `["①","②","③","④","⑤","⑥"]`

- [ ] **Step 3: STEPS의 번호를 바꾼다**

`lib/steps.js`:

```js
export const STEPS = [
  { key: "material", no: "1", label: "자료", seg: "briefing" },
  { key: "script", no: "2", label: "대본", seg: "script" },
  { key: "voice", no: "3", label: "목소리", seg: "voice" },
  { key: "images", no: "4", label: "이미지", seg: "images" },
  { key: "video", no: "5", label: "영상", seg: "video" },
  { key: "done", no: "6", label: "완성", seg: "done" },
];
```

**주석 안의 `①자료`·`②대본` 같은 표기는 그대로 둔다** — 문서적 표현이고, 건드리면 diff가 커져 실제 변경이 묻힌다.

- [ ] **Step 4: 배지 CSS를 쓴다**

`app/globals.css`의 `.side-step i`를 바꾼다:

```css
/* 단계 번호 — 배지. 원문자(①)는 획이 가늘어 잠긴 단계의 opacity 아래서 사라졌다. */
.side-step i {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--surface2);
  color: var(--ink-soft);
  display: inline-flex; align-items: center; justify-content: center;
  font-style: normal;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex: none;
}
/* 완료 — 배지 자리에 체크가 들어간다 */
.side-step.passed i { color: var(--good); }
```

`opacity: 0.8`은 뺀다 — 배지에 이미 색이 잡혀 있다.

- [ ] **Step 5: 완료·잠김 표시를 정리한다**

`components/Sidebar.jsx`의 `StepList`에서 두 가지를 바꾼다.

① **잠김 단계의 "잠김" 글자를 뺀다.** `.locked`의 `opacity: 0.5`가 이미 말한다:

```jsx
        if (!href || !reachable) {
          return (
            <span key={s.key} className={`${cls} locked`}>
              <i>{s.no}</i>{s.label}
              {s.soon ? <em>준비 중</em> : null}
            </span>
          );
        }
```

② **완료는 숫자 대신 체크를 배지에 넣고, 오른쪽 `em.ok`를 없앤다.** 같은 말을 두 번 하지 않는다:

```jsx
        return (
          <Link key={s.key} href={href} className={cls}>
            <i>{passed ? <Icon name="check" size={12} /> : s.no}</i>{s.label}
            {s.soon ? <em>준비 중</em> : null}
          </Link>
        );
```

`em.now`("진행 중")도 여기서 사라진다 — Task 4의 액센트 바가 대신 말한다.

`Sidebar.jsx` 상단에 `import Icon from "./Icon";`가 Task 2에서 이미 들어가 있다.

- [ ] **Step 6: 죽은 CSS를 걷는다**

`.side-step em.ok`와 `.side-step em.now` 규칙을 지운다. `.side-step em` 자체는 "준비 중"이 아직 쓰므로 남긴다.

- [ ] **Step 7: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip

- [ ] **Step 8: 커밋**

```bash
git add lib/steps.js tests/steps.test.js components/Sidebar.jsx app/globals.css
git commit -m "style: 단계 번호를 원문자에서 숫자 배지로

①②③ 은 획이 가늘어 잠긴 단계의 opacity:0.5 아래서 사실상 보이지 않았다.
18px 원형 배지에 tabular-nums 숫자를 넣고, 완료는 배지 자리에 체크를 넣는다.
오른쪽 '✓'·'진행 중' 칩과 '잠김' 글자는 뺐다 — 배지와 흐림이 이미 말한다."
```

---

### Task 4: 액센트를 크레딧 → 진행 단계로 ★ 규칙 변경

이 개편에서 유일하게 기존 규칙을 뒤집는 태스크다.

**Files:**
- Modify: `tests/design-system.test.js:117-124`
- Modify: `app/globals.css` — `.credit-box`·`.side-step.on`

- [ ] **Step 1: 규칙 테스트를 새 규칙으로 다시 쓴다 (실패하게)**

`tests/design-system.test.js`의 `"액센트를 배경으로 쓰는 규칙은 크레딧 상자뿐이다"`를 통째로 바꾼다. **개수·순서에 기대지 않는 형태로 쓴다** — CSS 규칙 순서가 바뀌었다고 빨개지면 안 된다:

```js
  it("액센트는 진행 중 단계 표시에만 쓴다", () => {
    const users = [];
    for (const m of cssWithoutRoot().matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      if (/background:\s*var\(--accent/.test(body)) users.push(selector.trim());
    }
    // 화면에서 가장 강한 색은 사장님이 가장 알아야 할 것 — 지금 몇 단계인가 — 을 가리킨다.
    expect(users.length, "액센트를 쓰는 자리가 하나도 없다").toBeGreaterThan(0);
    expect(users.filter((s) => !s.includes(".side-step.on"))).toEqual([]);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/design-system.test.js`
Expected: FAIL — `.credit-box`가 `.side-step.on`을 포함하지 않아 걸린다

- [ ] **Step 3: 크레딧 상자를 무채색으로 내린다**

`app/globals.css`:

```css
/* 크레딧 상자 — 테스트 기간에만 유효한 안내문이다. 화면에서 가장 강한 자리를
   차지할 이유가 없어 무채색으로 내렸다(액센트는 .side-step.on 으로 옮겼다). */
.credit-box {
  background: var(--surface2);
  border: 0;
  border-radius: var(--r-card);
  padding: 14px;
  font-size: 14px;
}
```

`.credit-box b`는 Task 1에서 이미 `18px`/`600`이 되어 있다. 그대로 둔다.

- [ ] **Step 4: 진행 중인 단계가 액센트를 받게 한다**

`.side-step.on`을 바꾼다:

```css
/* 지금 */
.side-step.on { background: var(--surface2); color: var(--ink); font-weight: 600; }

/* 바꾼 뒤 — 왼쪽 바와 채워진 배지가 "여기가 지금"을 말한다 */
.side-step.on {
  background: var(--accent-soft);
  color: var(--ink);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--accent);
}
.side-step.on i { background: var(--accent); color: var(--deep); }
```

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip

- [ ] **Step 6: 변이로 단정이 무는지 본다**

`.credit-box`의 `background`를 잠깐 `var(--accent-soft)`로 되돌리고 `npx vitest run tests/design-system.test.js`를 돌린다.
Expected: FAIL — `[".credit-box"]`가 잡힌다. 확인했으면 `var(--surface2)`로 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add app/globals.css tests/design-system.test.js
git commit -m "style: 액센트를 크레딧 상자에서 진행 중 단계로 옮긴다

화면에서 가장 강한 색(핑크 테두리 + 큰 숫자)이 가리키던 것은 '실험 모드 /
무제한 / 테스트 기간에는 차감하지 않아요' 라는 임시 안내문이었다. 정작 사장님이
매 순간 알아야 하는 '내가 지금 몇 단계인가'는 회색 12px 이었다.

액센트를 .side-step.on 으로 옮기고 크레딧 상자는 무채색으로 내린다.
design-system.test.js 의 규칙도 함께 뒤집었다 — 새 테스트는 개수·순서에 기대지
않아 CSS 규칙 순서가 바뀌어도 거짓으로 빨개지지 않는다."
```

---

### Task 5: 테두리는 1겹

**Files:**
- Modify: `app/globals.css` — `.panel`·`.chat-card`·`.cost-tile`·`.ask`·`.cost-table-wrap`
- 건드리지 않음: `.brief` (아래 표에 이유를 적었다 — 목록에 있지만 조치는 "유지"다)

- [ ] **Step 1: surface 배경을 가진 면에서 테두리를 걷는다**

여섯 규칙에서 `border: 1px solid var(--line);` 줄을 지운다. **`--surface` 배경이 이미 면을 가르므로 선이 중복이다.**

| 선택자 | 배경 | 조치 |
|---|---|---|
| `.panel` | `--surface` | 테두리 삭제 |
| `.chat-card` | `--surface` | 테두리 삭제 |
| `.cost-tile` | `--surface` | 테두리 삭제 |
| `.ask` | `--surface` | 테두리 삭제 |
| `.cost-table-wrap` | `--surface` | 테두리 삭제 |
| `.brief` | `--deep` | **테두리 유지** — 아래 참조 |

★ **`.brief`는 `--deep` 배경이다. 건드리지 않는다.** `--deep`은 바탕(`--bg`)보다 어두워 그 자체로는 면이 덜 갈린다. 규칙은 "`--surface` 배경이면 테두리를 뺀다"이지 "전부 뺀다"가 아니다.

같은 이유로 **입력칸(`textarea.ref`·`.chat-input textarea`·`.sent-input`·`.prompt-edit`·`.script-box`)의 테두리는 전부 유지한다** — 그 선이 "여기에 쓸 수 있다"를 말한다.

- [ ] **Step 2: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip

- [ ] **Step 3: 커밋**

```bash
git add app/globals.css
git commit -m "style: surface 배경을 가진 면에서 테두리를 걷는다

배경만으로 이미 면이 갈리는데 선을 또 그어 화면이 상자로 잘게 쪼개졌다.
홈 챗은 카드 → 입력칸 → 버튼이 각각 경계를 가져 3겹이었다.

--deep 배경(.brief)과 입력칸의 테두리는 남긴다 — 그 선은 장식이 아니라
'여기에 쓸 수 있다'는 신호다."
```

---

### Task 6: 죽은 여백 제거

**Files:**
- Modify: `app/globals.css` — `.chat`·`.chat-wrap`·`main.work`

- [ ] **Step 1: 챗의 최소 높이를 걷는다**

```css
/* 지금 */
.chat { padding: 18px; min-height: 340px; max-height: 56vh; ... }

/* 바꾼 뒤 — 인사말 한 줄뿐인 첫 화면에 340px 공백이 생겼다 */
.chat { padding: 18px; max-height: 56vh; ... }
```

- [ ] **Step 2: 홈 챗을 가로 중앙에 놓는다**

```css
/* 지금 */
.chat-wrap { max-width: 760px; }

/* 바꾼 뒤 — 1160px 폭에 760px 카드를 왼쪽에 붙여 둘 이유가 없다 */
.chat-wrap { max-width: 760px; margin: 0 auto; }
```

- [ ] **Step 3: 바닥 공백을 줄인다**

```css
main.work { flex: 1; min-width: 0; padding: 24px 28px 40px; max-width: 1160px; }
```

(`64px` → `40px`.)

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 920 통과 / 10 skip

- [ ] **Step 5: 커밋**

```bash
git add app/globals.css
git commit -m "style: 설계되지 않은 빈 자리를 걷는다

min-height:340px 이 인사말 한 줄뿐인 첫 화면에 340px 공백을 만들었고,
1160px 작업 영역에 760px 카드가 왼쪽에 붙어 오른쪽 400px 가 죽어 있었다."
```

---

### Task 7: 눈으로 확인

코드가 아니라 **판정**이다. 앞의 여섯 태스크가 실제로 화면을 낫게 했는지 본다.

**Files:** 없음 (스크린샷과 보고서만)

- [ ] **Step 1: dev 서버를 띄운다**

```bash
npx next dev -p 3737
```

`.env.local`에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 있어야 한다 — 없으면 서버가 죽는다(의도된 동작).

- [ ] **Step 2: 세 화면을 1440×900으로 찍는다**

Playwright로 `/`(홈)·`/login`·`/costs`를 찍는다. 사이드바가 모든 화면에 있으므로 아이콘·배지·액센트는 어디서든 보인다.

- [ ] **Step 3: 390×844(모바일)로 같은 세 화면을 찍는다**

가로 스크롤이 생기지 않아야 한다. 생기면 보고한다 — 이 계획에 모바일 레이아웃 수정은 없으므로 **고치지 말고 보고한다**.

- [ ] **Step 4: 여섯 항목을 하나씩 눈으로 판정한다**

| 항목 | 무엇을 볼 것인가 |
|---|---|
| A 아이콘 | 사이드바 아이콘의 **세로 중심선이 맞는가**. 굵기가 서로 같은가 |
| B 번호 | 잠긴 단계의 숫자가 **읽히는가** (원문자 시절엔 사라졌다) |
| C 액센트 | 화면에서 가장 먼저 눈에 들어오는 것이 **진행 중인 단계**인가 |
| D 여백 | 홈 첫 화면에 **빈 공백 덩어리가 없는가** |
| E 테두리 | 홈 챗이 **2겹**인가 (카드 면 → 입력칸 선) |
| F 위계 | 제목·본문·캡션이 **세 단으로 갈리는가** |

- [ ] **Step 5: 접근성 바닥을 확인한다**

- Tab 키로 사이드바를 훑어 **포커스 링이 보이는지**
- 아이콘이 스크린리더에 중복으로 읽히지 않는지 (`aria-hidden="true"`가 붙어 있는지 DOM에서 확인)

- [ ] **Step 6: 미검증으로 남는 것을 보고서에 명시한다**

**단계 화면(②대본·④이미지 등)은 이번에 눈으로 확인할 수 없다.** 저장이 Supabase로 넘어가 로컬 `data/projects/`를 더는 읽지 않고, 검토용 시드를 실 DB에 넣는 것은 사장님 승인 사항이다 — 계약 테스트가 실 DB를 오염시킨 사고가 07-31에 두 번 있었다.

개편은 전부 전역 CSS와 사이드바라 단계 화면에도 같이 적용되지만, **실물 확인은 미검증으로 남는다**고 보고서에 적는다.

- [ ] **Step 7: 최종 테스트와 커밋**

```bash
npx vitest run
git add docs/superpowers/
git commit -m "docs: 화면 정밀도 개편 실측 — 여섯 항목 눈 판정 결과"
```

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert`가 가능하다. 다만 **Task 3은 Task 2에 의존한다**(`check` 아이콘). Task 2를 되돌리면 Task 3도 함께 되돌려야 한다.

Task 4(액센트)만 되돌리고 싶으면 그 커밋 하나만 revert하면 된다 — 다른 태스크는 액센트를 건드리지 않는다.
