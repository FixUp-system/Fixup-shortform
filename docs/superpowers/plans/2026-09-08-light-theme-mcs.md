# 밝은 벌 한 벌 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** shotform 을 어두운 벌에서 **밝은 벌 한 벌**로 옮겨, 형제 제품 MCS 와 같은 디자인 언어로 만든다.

**Architecture:** 색은 `app/globals.css` 의 `:root` 토큰 한 곳에서만 정의된다(판이 `:root` 밖 hex 를 금지해 왔다). 그래서 토큰 값을 바꾸면 화면 34개가 따라온다. 어두운 벌(`:root[data-theme="light"]` 블록 · `ThemeToggle` · 부팅 스크립트)은 지운다. 글자는 두 층으로 나눈다 — 작업 화면은 조용한 앱층, `home` 과 로그인 전 화면만 `.display` 전시층.

**Tech Stack:** Next.js 15 (App Router) · 순수 CSS 토큰 · vitest (판은 **소스 문자열 검사**다 — 렌더 테스트 인프라가 없다)

**Spec:** `docs/superpowers/specs/2026-09-08-light-theme-mcs-design.md`

## Global Constraints

- **색은 토큰으로만.** `:root` 밖에 hex 리터럴을 쓰지 않는다(판이 막는다)
- **치수·간격·모서리는 건드리지 않는다** — `--ctl-*` · `--sp-*` · `--r-*` 는 테마가 아니다
- **`--on-media: #FFFFFF` 는 그대로** — 사진·영상 **위** 글자라 테마를 안 탄다
- **`--stage-dark: #101010` 은 그대로** — 영상 무대는 테마와 무관하게 어둡다
- **자막 `@font-face` 이름을 바꾸지 마라** — `"Pretendard Subtitle"` 은 `lib/subtitles.js` 의 `cssFamily` 와 글자 그대로 같아야 한다. `Pretendard` 로 줄이면 UI 폰트와 한 가족이 되어 전 화면이 1.5MB OTF 를 받는다
- **작업 화면 규칙 유지**: 돈 나가는 버튼은 그 줄에 혼자 · `이전으로`는 맨 아래 왼쪽 끝
- **모서리는 지금 토큰을 그대로 쓴다** — `--r-card: 16px` · `--r-ctl: 8px`. MCS 는 12px·7px 이지만
  모서리는 테마가 아니라 **치수**이고, 바꾸면 34개 화면의 모든 면이 함께 움직인다. 4px 차이로
  형제로 안 읽히지 않는다 — 색·서체·리듬이 같으면 같은 제품으로 읽힌다
- 테스트는 `npx vitest run`, 빌드는 `npx next build`(dev 서버를 먼저 끈다 · 끝나면 `rm -rf .next`)
- **기준선 빨강 하나**: `tests/reel-oneshot.test.js > "프롬프트를 고치면 다시 굽는다"` 는 회선 타임아웃으로 이 저장소에서 원래 실패한다. 그 하나만 빨간 것은 정상이다

---

### Task 1: 토큰을 밝은 벌로 바꾸고 어두운 벌을 지운다

**Files:**
- Modify: `tests/design-system.test.js:55-78` (기대 토큰 값)
- Delete: `tests/theme-light.test.js` (86줄 · 밝은 팔레트가 별도 블록임을 전제한다)
- Modify: `tests/ad-draft-form-ui.test.js:135` (레이아웃의 테마 스크립트 단정)
- Modify: `app/globals.css:50-117` (`:root` 색 토큰), `app/globals.css:138-162` (밝은 블록 삭제)
- Delete: `components/ThemeToggle.jsx`
- Modify: `components/AppShell.jsx:19` (import), `components/AppShell.jsx:46-48` (사용처)
- Modify: `app/layout.js` (`<head>` 테마 스크립트 블록)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 토큰 이름 `--band` · `--band-ink` · `--band-soft` · `--accent-fill` (Task 4 가 쓴다)

- [ ] **Step 1: 판의 기대값을 새 값으로 바꾼다 (여기서 빨개진다)**

`tests/design-system.test.js` 의 `expected` 객체를 통째로 교체한다:

```js
    const expected = {
      "--bg": "#F5F4ED",
      "--surface": "#FFFFFF",
      "--surface2": "#FAF9F5",
      "--deep": "#EFEDE4",
      "--line": "#E8E6DC",
      "--ink": "#141413",
      "--ink-soft": "#5E5D59",
      "--accent": "#B0446A",
      "--btn": "#B0446A",
      "--btn-ink": "#FFFFFF",
      "--good": "#0E7C57",
      "--warn": "#9A6400",
      "--band": "#1C1B19",
      "--band-ink": "#ECEAE2",
      "--accent-fill": "#C96A8A",
    };
```

- [ ] **Step 2: 판을 돌려 빨간 것을 눈으로 본다**

Run: `npx vitest run tests/design-system.test.js`
Expected: **FAIL** — `--bg 토큰` 부터 어긋난다(CSS 는 아직 `#1A1A1A`).

- [ ] **Step 3: `:root` 의 색 토큰을 바꾼다**

`app/globals.css` 의 `:root` 안에서 **색만** 바꾼다(치수·간격·모서리는 손대지 않는다):

```css
  --bg: #F5F4ED;
  --surface: #FFFFFF;
  --surface2: #FAF9F5;
  --deep: #EFEDE4;
  --line: #E8E6DC;
  --ink: #141413;
  --ink-soft: #5E5D59;
  --on-media: #FFFFFF;

  --accent: #B0446A;
  --accent-soft: rgba(176, 68, 106, 0.10);

  --btn: #B0446A;
  --btn-ink: #FFFFFF;

  --pick: #C2402C;
  --good: #0E7C57;
  --good-soft: rgba(14, 124, 87, 0.12);
  --warn: #9A6400;
  --warn-soft: rgba(154, 100, 0, 0.12);
  --sel: rgba(176, 68, 106, 0.22);
  --stage-dark: #101010;

  /* 결과물 어두운 띠 — 테마가 아니라 **구간**이다. --deep 은 가라앉은 칸이라 못 쓴다
     (var(--deep) 을 쓰는 16곳 중 .side-step.on i 는 그 값을 글자색으로 쓴다). */
  --band: #1C1B19;
  --band-ink: #ECEAE2;
  --band-soft: #9A968C;
  /* 로즈의 밝은 쪽. **띠 안에서만** 쓴다 — 밝은 바탕에 흰 글자를 얹으면 3.54:1 로 모자란다 */
  --accent-fill: #C96A8A;
```

머리말 주석(`app/globals.css:1-4`)의 "Magnific 다크 시스템 기반"도 함께 고친다:

```css
/* shortform 디자인 토큰 — MCS 와 같은 디자인 언어(밝은 벌 한 벌, 2026-09-08)
   규칙: 색은 반드시 토큰으로 참조한다(:root 밖 hex 금지) · 모서리 3단 ·
   굵기 400/600/700 · 크기 12/14/16/18/30 · 그라디언트 없음 ·
   주 실행 버튼은 액센트를 채운다(밝은 바탕에서 "바탕의 반대색"은 검정 버튼이 된다) */
```

- [ ] **Step 4: 밝은 팔레트 블록을 통째로 지운다**

`app/globals.css:119-162` — `/* ── 밝은 팔레트 ── */` 주석 블록과 `:root[data-theme="light"] { … }` 를 삭제한다. 값은 Step 3 이 이미 흡수했다.

- [ ] **Step 5: 테마 토글과 부팅 스크립트를 걷어낸다**

1. `components/ThemeToggle.jsx` 파일 삭제
2. `components/AppShell.jsx` 에서 `import ThemeToggle from "./ThemeToggle";` 줄과 `<ThemeToggle />` 줄(그 위 주석 포함) 삭제
3. `app/layout.js` 의 `<head>` 안 `<script dangerouslySetInnerHTML={…} />` 블록(테마를 찍는 스크립트)과 그것을 설명하는 주석 삭제

- [ ] **Step 6: 어두운 벌을 붙들던 판 둘을 정리한다**

1. `tests/theme-light.test.js` 파일 삭제 — 밝은 팔레트가 **별도 블록**이라는 전제 위에 서 있다
2. `tests/ad-draft-form-ui.test.js:135` 의 단정 삭제:

```js
    expect(layout).toMatch(/setAttribute\('data-theme','light'\)/);
```

- [ ] **Step 7: 판을 돌려 초록을 확인한다**

Run: `npx vitest run`
Expected: PASS — 실패는 기준선 하나(`reel-oneshot`)뿐이다.

- [ ] **Step 8: 빌드로 화면이 서는지 본다**

Run: `npx next build` → 끝나면 `rm -rf .next`
Expected: exit 0.

- [ ] **Step 9: 커밋**

```bash
git add app/globals.css app/layout.js components/AppShell.jsx tests/design-system.test.js tests/ad-draft-form-ui.test.js
git rm components/ThemeToggle.jsx tests/theme-light.test.js
git commit -m "feat(ui): 밝은 벌 한 벌로 — 토큰 교체, 어두운 벌 삭제"
```

---

### Task 2: 되돌아오지 못하게 판 둘을 세운다

**Files:**
- Modify: `tests/design-system.test.js` (describe "색" 아래에 새 `it` 둘)

**Interfaces:**
- Consumes: Task 1 이 지운 `data-theme` · Task 1 이 만든 토큰
- Produces: 없음 (판만 늘린다)

- [ ] **Step 1: 판 둘을 쓴다**

`tests/design-system.test.js` 끝에 붙인다. `readAll()` 은 이 파일 위쪽에 이미 있다(화면 소스를 모아 준다):

```js
describe("테마는 한 벌이다", () => {
  it("★ data-theme 흔적이 코드에 없다 — 지웠다고 믿지 말고 센다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const hits = readAll()
      .filter(({ text }) => /data-theme/.test(text))
      .map(({ path }) => path);
    if (/data-theme/.test(css)) hits.push("app/globals.css");
    expect(hits, `테마 분기가 남아 있다:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("★★ 전시층 글자는 .display 안에서만 쓴다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    // 규칙 블록을 { 단위로 자르고, 굵기 800 이상이 나온 블록의 선택자를 본다
    const offenders = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = m[1].trim();
      const body = m[2];
      const w = body.match(/font-weight:\s*(\d{3})/);
      if (w && Number(w[1]) >= 800 && !selector.includes(".display")) {
        offenders.push(`${selector} → ${w[1]}`);
      }
    }
    expect(offenders, `전시층이 작업 화면으로 샜다:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: 판을 돌린다 — 지금은 통과해야 한다**

Run: `npx vitest run tests/design-system.test.js`
Expected: PASS (Task 1 이 이미 지웠고, 800 이상 굵기는 아직 없다).

- [ ] **Step 3: ★ 그물이 진짜로 잡는지 확인한다 (빈 그물 방지)**

`app/globals.css` 맨 아래에 **일부러** 넣는다:

```css
.zzz-temp { font-weight: 900; }
```

Run: `npx vitest run tests/design-system.test.js`
Expected: **FAIL** — `전시층이 작업 화면으로 샜다: .zzz-temp → 900`.
확인했으면 그 두 줄을 **지운다**. 다시 돌려 PASS 를 본다.

- [ ] **Step 4: 커밋**

```bash
git add tests/design-system.test.js
git commit -m "test(ui): 테마 한 벌·전시층 경계를 판으로 굳힌다"
```

---

### Task 3: 글자를 두 층으로 나누고 서체를 한 벌로 모은다

**Files:**
- Modify: `tests/design-system.test.js:143-153` (허용 크기 목록)
- Modify: `app/globals.css:237` (`h1.pgtitle`), `app/globals.css:870` (`.cost-tile b`), 파일 끝(전시층 클래스 추가)
- Modify: `app/layout.js:2` (Geist import), `app/layout.js:33` (className), `app/globals.css` 의 `body { font-family }`

**Interfaces:**
- Consumes: Task 2 의 "전시층은 `.display` 안에서만" 판
- Produces: `.display` 클래스 (Task 4 의 `home` 이 쓴다)

- [ ] **Step 1: 허용 크기를 28 → 30 으로 옮긴다 (여기서 빨개진다)**

`tests/design-system.test.js` 의 `it("font-size는 …")` 안:

```js
    const ALLOWED = ["12px", "14px", "16px", "18px", "30px", "inherit"];
```

이름도 함께 고친다: `it("font-size는 12 · 14 · 16 · 18 · 30px만 쓴다", …)`

- [ ] **Step 2: 판을 돌려 빨간 것을 본다**

Run: `npx vitest run tests/design-system.test.js -t "font-size"`
Expected: **FAIL** — `["28px", "28px"]` 두 자리가 걸린다.

- [ ] **Step 3: 28px 두 자리를 30px 로 옮긴다**

`app/globals.css:237`:

```css
h1.pgtitle { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; }
```

`app/globals.css:870` (`.cost-tile b`)의 `font-size: 28px;` → `font-size: 30px;`

- [ ] **Step 4: 전시층 클래스를 만든다**

`app/globals.css` 끝에 붙인다:

```css
/* ── 전시층 ──────────────────────────────────────────────────────────────
   **보여 주는 화면에서만** 쓴다(home · 로그인 전). 작업 화면에 새면 판이 잡는다
   (tests/design-system.test.js 의 "전시층 글자는 .display 안에서만 쓴다").
   근거: MCS 실측 — 68px·900·자간 −3.06px 짜리 제목은 랜딩에만 있고 작업 화면은 30px·700 이다. */
.display {
  font-size: clamp(38px, 6vw, 62px);
  font-weight: 900;
  line-height: 1.06;
  letter-spacing: -0.045em;
  text-wrap: balance;
  margin: 0 0 20px;
}
.display em { font-style: normal; color: var(--accent); }
```

- [ ] **Step 5: 서체를 Pretendard 한 벌로 모은다**

`app/layout.js`: `import { GeistSans } from "geist/font/sans";` 삭제, `className={`${GeistSans.variable} ${pretendard.variable}`}` → `` className={pretendard.variable} ``.

`app/globals.css` 의 `body`:

```css
  /* 한 벌이다 — MCS 와 같은 서체를 쓴다(숫자까지). 라틴 Geist 는 2026-09-08 에 걷었다 */
  font-family: var(--font-pretendard), "Apple SD Gothic Neo", system-ui, sans-serif;
```

⚠️ `@font-face` 의 `"Pretendard Subtitle"` 은 **손대지 않는다**(Global Constraints 참고).

- [ ] **Step 6: 자막 폰트 이름이 안 흔들렸는지 센다**

Run: `grep -c "Pretendard Subtitle" app/globals.css lib/subtitles.js`
Expected: 두 파일 모두 1 이상. 0 이 나오면 Step 5 에서 이름을 건드린 것이다 — 되돌린다.

- [ ] **Step 7: 판과 빌드**

Run: `npx vitest run` → 기준선 하나 빼고 PASS
Run: `npx next build` → exit 0 · 끝나면 `rm -rf .next`

- [ ] **Step 8: 커밋**

```bash
git add app/globals.css app/layout.js tests/design-system.test.js
git commit -m "feat(ui): 글자를 두 층으로 나누고 서체를 Pretendard 한 벌로"
```

---

### Task 4: `home` 을 결과물로 연다

**Files:**
- Create: `tests/home-sections-ui.test.js`
- Modify: `app/home/page.js` (135줄 · 전면 재구성)
- Modify: `app/globals.css` (`.home-modes`·`.home-mode`·`.home-stage` 계열을 걷고 새 섹션 스타일 추가 — `app/globals.css:2624` 부근)

**Interfaces:**
- Consumes: `.display`(Task 3) · `--band`·`--band-ink`·`--band-soft`·`--accent-fill`(Task 1)
- Produces: 없음 (마지막 화면 작업)

- [ ] **Step 1: 화면 계약 판을 쓴다 (여기서 빨개진다)**

`tests/home-sections-ui.test.js`:

```js
// home 은 **결과물로 연다**(2026-09-08 사장님 확정). 그전에는 "만드는 방식 고르기"로 열었다.
// 이 저장소의 화면 계약은 소스 문자열로 잰다 — 렌더 테스트 인프라가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/home/page.js", "utf8");

describe("home 은 결과물로 연다", () => {
  it("★ 최근 완성본을 불러온다", () => {
    expect(src, "목록을 안 부른다").toMatch(/\/api\/projects/);
  });

  it("★★ 목록에서 영상을 물지 않는다 — 표지 그림만 그린다", () => {
    // 2026-09-07 전송량 사고: 목록이 <video> 를 물면 그것만으로 할당량이 탄다
    expect(src, "<video> 가 목록에 있다").not.toMatch(/<video/);
    expect(src, "표지 그림을 안 쓴다").toMatch(/thumbUrl/);
  });

  it("★ 완성본이 없으면 결과물 띠를 감춘다 — 빈 격자를 보이지 않는다", () => {
    expect(src).toMatch(/length\s*>\s*0|length\s*&&/);
  });

  it("★ 도구 격자가 세 갈래를 모두 연다", () => {
    for (const path of ["/ads", "/create", "/reel"]) {
      expect(src, `${path} 로 가는 길이 없다`).toContain(path);
    }
  });

  it("★ 전시층은 여기서만 쓴다", () => {
    expect(src, "display 제목이 없다").toMatch(/className="display"|class="display"/);
  });
});
```

- [ ] **Step 2: 판을 돌려 빨간 것을 본다**

Run: `npx vitest run tests/home-sections-ui.test.js`
Expected: **FAIL** — 지금 `home` 은 `/api/projects` 를 안 부르고 `.display` 도 없다.

- [ ] **Step 3: `home` 을 다시 짠다**

`app/home/page.js` 를 아래 구조로 바꾼다. **`"use client"`** 를 유지하고, 목록은 마운트 뒤 한 번 부른다.

```jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { thumbUrl } from "../../lib/thumb-url";

// 도구는 표가 정한다 — 화면에 손으로 적으면 갈린다.
const TOOLS = [
  { path: "/ads", slug: "/ads", name: "원클릭 영상",
    sub: "소재만 적으면 시나리오부터 완성본까지 한 번에 나옵니다.", how: "소재 → 시나리오 → 완성" },
  { path: "/create", slug: "/create", name: "단계별 영상",
    sub: "시나리오·목소리·그림·영상을 단계마다 확인하고 고칩니다.", how: "6단계 · 컷마다 다시 만들기" },
  { path: "/reel/new", slug: "/reel", name: "통짜 릴",
    sub: "스토리보드 한 장을 통째로 넘겨 한 편으로 굽습니다.", how: "보드 1장 → 한 편" },
];

const STEPS = [
  { n: "01", name: "소재", sub: "적어 둔 글과 사진이 재료가 됩니다." },
  { n: "02", name: "시나리오", sub: "사람이 확정합니다. 여기서 멈춰 고칠 수 있습니다." },
  { n: "03", name: "굽기", sub: "확정한 글자가 그대로 영상에 들어갑니다." },
  { n: "04", name: "보관함", sub: "완성본이 쌓이고, 다음 작업의 재료가 됩니다." },
];

export default function HomePage() {
  const [made, setMade] = useState([]);

  // ★ 목록만 부른다. **영상은 안 문다** — 카드가 <video> 를 물면 화면을 여는 것만으로
  //   전송량이 탄다(2026-09-07 사고). 표지 그림(thumbUrl)만 그린다.
  useEffect(() => {
    let alive = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => { if (alive) setMade((d.projects || []).filter((p) => p.video_url && p.image_url).slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <section className="panel panel--wide home">
      <p className="eyebrow">무엇을 만들까요</p>
      <h1 className="display">한 편이 끝까지<br /><em>이어집니다</em></h1>
      <p className="lede">소재를 적으면 시나리오·목소리·그림·영상이 한 줄기로 이어집니다.</p>

      {made.length > 0 && (
        <div className="home-band">
          <p className="eyebrow">만든 것</p>
          <h2>최근 완성본</h2>
          <div className="home-reel">
            {made.map((p) => (
              <Link key={p.id} href={`/archive/${p.id}`} className="home-reel-item">
                <img src={thumbUrl(p.image_url)} alt={p.title || "만든 영상"} loading="lazy" />
                <span>{p.title || "제목 없음"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="home-tools">
        {TOOLS.map((t) => (
          <Link key={t.path} href={t.path} className="home-tool">
            <span className="home-slug">{t.slug}</span>
            <h2>{t.name}</h2>
            <p>{t.sub}</p>
            <span className="home-how">{t.how}</span>
          </Link>
        ))}
      </div>

      <div className="home-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="home-step">
            <span className="home-n">{s.n}</span>
            <h3>{s.name}</h3>
            <p>{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 스타일을 갈아 끼운다**

`app/globals.css` 의 `.home-modes`·`.home-mode`·`.home-stage`·`.home-sealed`·`.home-out`·`.home-film`·`.home-facts`·`.home-pick`·`.home-down` 계열(2624줄 부근부터)을 **지우고** 아래를 넣는다:

```css
/* ── home ────────────────────────────────────────────────────────────────
   결과물 → 도구 → 작동 원리. 띠는 --band 다(--deep 은 가라앉은 칸이라 못 쓴다). */
.home-band {
  background: var(--band);
  color: var(--band-ink);
  border-radius: var(--r-card);
  padding: var(--sp-5);
  margin: var(--sp-5) 0;
}
.home-band .eyebrow { color: var(--accent-fill); }
.home-band h2 { color: var(--band-ink); font-size: 18px; font-weight: 700; margin: 0 0 var(--sp-4); }
.home-reel { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-3); }
.home-reel-item { display: block; text-decoration: none; }
.home-reel-item img {
  width: 100%; aspect-ratio: 9 / 16; object-fit: cover;
  border-radius: var(--r-ctl); background: var(--stage-dark);
}
.home-reel-item span {
  display: block; margin-top: var(--sp-2);
  font-size: 12px; color: var(--band-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.home-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4); }
.home-tool {
  display: flex; flex-direction: column; gap: var(--sp-2);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-card); padding: var(--sp-5);
  color: inherit; text-decoration: none;
}
.home-tool h2 { font-size: 18px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
.home-tool p { margin: 0; font-size: 14px; color: var(--ink-soft); }
.home-slug {
  align-self: flex-start; font-size: 12px;
  padding: var(--sp-1) var(--sp-2); border-radius: var(--r-ctl);
  background: var(--accent-soft); color: var(--accent);
}
.home-how { margin-top: auto; padding-top: var(--sp-3); font-size: 12px; color: var(--ink-soft); }
.home-steps { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: var(--sp-5); border-top: 1px solid var(--line); }
.home-step { padding: var(--sp-4) var(--sp-4) var(--sp-4) 0; border-right: 1px solid var(--line); }
.home-step:last-child { border-right: 0; }
.home-n { font-size: 12px; font-weight: 700; color: var(--accent); }
.home-step h3 { margin: var(--sp-2) 0 var(--sp-1); font-size: 16px; font-weight: 700; }
.home-step p { margin: 0; font-size: 14px; color: var(--ink-soft); }
@media (max-width: 900px) {
  .home-reel, .home-steps { grid-template-columns: 1fr 1fr; }
  .home-tools { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: 판을 돌린다**

Run: `npx vitest run tests/home-sections-ui.test.js`
Expected: PASS.
Run: `npx vitest run`
Expected: 기준선 하나 빼고 PASS. ★ 지운 클래스를 다른 판이 잡고 있으면 여기서 드러난다 — 그 판이 `home` 의 옛 구조를 재고 있었다면 새 구조에 맞게 고친다.

- [ ] **Step 6: 빌드**

Run: `npx next build` → exit 0 · 끝나면 `rm -rf .next`

- [ ] **Step 7: 커밋**

```bash
git add app/home/page.js app/globals.css tests/home-sections-ui.test.js
git commit -m "feat(home): 결과물로 연다 — 띠·도구 격자·작동 원리 4단"
```

---

### Task 5: 눈으로 확인하고 인계 문서를 갱신한다

**Files:**
- Modify: `OUTSTANDING.md` (§0 표와 새 절)

**Interfaces:**
- Consumes: Task 1~4 의 결과
- Produces: 없음

- [ ] **Step 1: 서버를 띄우고 화면 넷을 눈으로 본다**

```bash
npx next dev -p 3111
```

`.env.local` 의 `SHOTFORM_DEV_USER` 가 로그인을 건너뛴다. 볼 것:

| 화면 | 볼 것 |
|---|---|
| `/home` | 띠가 어둡고 그 안 글자가 읽히는가 · 완성본이 없으면 띠가 **안 보이는가** |
| `/archive` | 카드가 흰 면 위에 서는가 · 표지 없는 카드의 안내 글자가 읽히는가 |
| `/create` (①자료) | 입력 웰(`--deep`)이 **가라앉아 보이는가**(까맣지 않은가) |
| `/costs` | 큰 숫자(`.cost-tile b`)가 30px 로 서는가 |

- [ ] **Step 2: 인라인 style 10곳을 눈으로 본다**

Run: `grep -rn "style={{" app components --include=*.js --include=*.jsx`
그 자리마다 hex 나 흰색·검정 리터럴이 박혀 있는지 본다. 있으면 토큰으로 바꾼다 — **이 자리는 "`:root` 밖 hex 금지" 그물 밖이다**(판이 개수만 센다).

- [ ] **Step 3: 사진 위 글자를 확인한다**

Run: `grep -rn "on-media" app/globals.css | head`
`.thumb-tag` 같은 자리가 `--on-media` 를 쓰는지 본다. `--ink` 를 쓰는 자리가 있으면 사진 위 검정이 된다(2026-08-20 에 밟은 함정).

- [ ] **Step 4: 인계 문서를 갱신한다**

`OUTSTANDING.md` 에 「09-08 밝은 벌 전환」 절을 더한다. 담을 것 다섯:

1. **바뀐 토큰 표** — 스펙 §2 를 그대로 가리키고, 여기에는 "토큰 한 곳이 34개 화면을 옮겼다"만 적는다
2. **되돌릴 수 없는 것** — `ThemeToggle.jsx` 와 `theme-light.test.js` 를 **지웠다**. 어두운 벌로
   돌아가려면 다시 만들어야 한다(사장님 확정 사항이다)
3. **판이 지키는 경계 둘** — `data-theme` 흔적 0 · `.display` 밖 굵기 800 금지
4. **덜어낸 것** — 도입부 공식은 `home` 에만 적용했다(나머지 30개 화면은 별도 회차)
5. **수** — `npx vitest run` 을 실제로 돌려 통과·실패 수를 적는다(기억으로 적지 않는다)

- [ ] **Step 5: 커밋**

```bash
git add OUTSTANDING.md
git commit -m "docs: 밝은 벌 전환을 인계 문서에 담는다"
```

---

## 스펙에서 이 계획이 **덜어낸 것** (일부러)

- **도입부 공식을 34개 화면 전부에 못 박는 일**(스펙 §4) — 실측하니 `className="eyebrow"` 를 쓰는
  화면이 **34개 중 4개**다. 나머지 서른 화면을 훑는 것은 색 전환과 성격이 다른 작업이고,
  같은 회차에 섞으면 어디서 깨졌는지 못 가른다. **별도 회차**로 뺀다 — 이 계획은 `home` 하나만
  그 공식으로 짓고(Task 4), 표준이 실제로 보기 좋은지 그 화면으로 먼저 확인한다
- **카드·칩 모서리를 MCS 값(12/7px)에 맞추는 일** — 위 Global Constraints 참고

## 남는 일 (이 계획 밖)

- **도입부 공식 전면 적용** — 위 참고(지금 4/34)
- **로그인 전 화면**(`/login`)의 전시층 적용 — Task 4 뒤에 따로 본다
- **MCS 와 토큰 파일 공유** — 저장소가 둘이라 값이 굳은 뒤에 다시 본다
- **배포** — 사장님이 요청할 때만 한다(이 저장소 규칙)
