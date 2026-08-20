# 한 번에 굽는 영상 — 단계별 화면 + 그림 한 장만 다시 그리기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/film/[mode]` 한 화면이 다 받던 입력·시나리오·그림·굽기를 단계별 화면으로 나누고, 그림을 축 하나만 다시 그릴 수 있게 한다.

**Architecture:** 주소가 "무엇이 방식과 무관한가"를 그대로 담는다 — 입력·시나리오는 `/film/<id>/…`, 그림부터는 `/film/<id>/<mode>/…`. 단계 표와 라우팅 가드는 `lib/film/steps.js` 한 벌이 답하고, 화면은 `app/film/[id]/layout.js` 가 프로젝트를 한 번 읽어 스테퍼와 가드를 건다(`app/create/[id]/layout.js` 와 같은 구조). 기존 한 화면은 지우지 않고 `/film/one/[mode]` 로 옮긴다. 선택 재생성은 `runFilmImages` 에 `only` 를 더하되, 계획(`imagePlanFor`)을 기준으로 목록을 재구성해 안 고른 축의 그림을 자리에 유지한다.

**Tech Stack:** Next.js App Router (JS, no TS) · React client components · vitest · Supabase(memory store in tests)

**Spec:** `docs/superpowers/specs/2026-08-20-film-step-pages-design.md`

## Global Constraints

- **테스트 실행:** `npx vitest run` — 이 저장소에 린터·타입체커가 없다. 그린인지가 유일한 관문이다.
- **`main` 에 직접 쓰지 않는다.** 지금 브랜치는 `feat/theme-light` 이고 여기서 이어 작업한다. 푸시·배포는 사용자가 요청할 때만.
- **화면 파일을 손댔으면 한 번 굽는다:** dev 서버를 끄고 `npx next build && rm -rf .next`. 소스 문자열 검사는 문법이 깨진 파일을 못 잡는다(2026-08-13 에 1720 그린인 채 앱이 안 떴다).
- **`SHOTFORM_DIST_DIR` 는 안 먹는다.** dev 서버를 켜둔 채 굽지 마라 — `.next` 가 덮여 dev 가 죽는다.
- **스크립트(heredoc)로 코드를 넣지 마라.** 역슬래시가 한 겹 먹혀 `\n` 이 진짜 줄바꿈이 된다. Write/Edit 도구를 쓴다.
- **판정을 두 벌로 만들지 않는다.** 문 판정은 `lib/film/gates.js`, 방식 표는 `lib/film/mode.js`, 문서 판독은 `lib/film/doc.js`, 폴링은 `lib/poll.js`. 새 화면이 조건을 손으로 다시 적으면 안 된다.
- **화면("use client")이 import 하는 모듈은 `fs` 를 끌면 안 된다.** `lib/film/steps.js` 는 순수 데이터·순수 함수여야 한다(`lib/film/mode.js`·`doc.js`·`gates.js` 가 이미 그렇다).
- **유료 생성(fal)은 실행 전 반드시 사용자 승인.** 이 계획의 어떤 태스크도 실제 그림·영상을 굽지 않는다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/film/steps.js` (신규) | 단계 표 · 주소 만들기 · 경로→단계 · 지금 단계 · 열림 판정 |
| `app/film/one/[mode]/page.js` (이동) | 기존 한 화면 — 내용 그대로, 자기 링크만 갱신 |
| `app/film/[id]/layout.js` (신규) | 프로젝트 로드 · 스테퍼 · 못 연 단계 되돌리기 |
| `app/film/[id]/briefing/page.js` (신규) | 1 입력 — 소재·사진·조건 |
| `app/film/[id]/scenario/page.js` (신규) | 2 시나리오 |
| `app/film/[id]/[mode]/images/page.js` (신규) | 3 그림 — 방식 칩 · 카드별 다시 만들기 |
| `app/film/[id]/[mode]/video/page.js` (신규) | 4 영상 — 굽기 · 폴링 |
| `app/film/[id]/[mode]/done/page.js` (신규) | 5 완성 |
| `components/FilmProjectContext.jsx` (신규) | 레이아웃이 읽은 프로젝트를 단계 화면들이 공유 |
| `lib/film/pipeline.js` (수정) | `runFilmImages` 에 `only` |
| `app/api/film/[id]/images/route.js` (수정) | `only` 검증·전달 |

---

## Task 1: 단계 표와 라우팅 가드

**Files:**
- Create: `lib/film/steps.js`
- Test: `tests/film-steps.test.js`

**Interfaces:**
- Consumes: `filmOf` (`lib/film/doc.js`), `isFilmMode` (`lib/film/mode.js`)
- Produces:
  - `FILM_STEPS: ReadonlyArray<{key,no,label,seg,perMode:boolean}>`
  - `filmStepHref(step, projectId, mode) -> string`
  - `filmStepFromPathname(pathname) -> step | undefined`
  - `currentFilmStepKey(project, mode) -> string`
  - `isFilmStepReachable(key, project, mode) -> boolean`

- [ ] **Step 1: 실패하는 시험을 쓴다**

Create `tests/film-steps.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  FILM_STEPS, filmStepHref, filmStepFromPathname, currentFilmStepKey, isFilmStepReachable,
} from "../lib/film/steps.js";

const ID = "11111111-1111-4111-8111-111111111111";
const withScenario = { id: ID, scenario: { text: "Vertical 9:16 footage.", tries: 1 } };
const withImages = { ...withScenario, films: { order: { images: [{ key: "shot-1", url: "u" }] } } };
const withVideo = { ...withScenario, films: { order: { images: [{ key: "shot-1", url: "u" }], video: { url: "/api/renders/x-order.mp4" } } } };

describe("단계 표", () => {
  it("★ 다섯 단계이고 순서가 정해져 있다", () => {
    expect(FILM_STEPS.map((s) => s.key)).toEqual(["material", "scenario", "images", "video", "done"]);
  });

  it("★ 표는 못 바꾼다 — 호출부가 늘리면 스테퍼와 가드가 런타임에 갈린다", () => {
    expect(Object.isFrozen(FILM_STEPS)).toBe(true);
    expect(() => FILM_STEPS.push({ key: "hack" })).toThrow();
  });

  it("★ 방식과 무관한 단계는 입력·시나리오 둘뿐이다 — 그림부터 갈린다", () => {
    expect(FILM_STEPS.filter((s) => !s.perMode).map((s) => s.key)).toEqual(["material", "scenario"]);
  });
});

describe("주소", () => {
  it("★ 공유 단계의 주소에는 방식이 안 들어간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "scenario");
    expect(filmStepHref(step, ID, "order")).toBe(`/film/${ID}/scenario`);
  });

  it("★ 방식별 단계의 주소에는 방식이 들어간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "images");
    expect(filmStepHref(step, ID, "refs")).toBe(`/film/${ID}/refs/images`);
  });

  it("★ 모르는 방식으로는 주소를 못 만든다 — 조용히 한쪽으로 떨어지면 값이 헛나간다", () => {
    const step = FILM_STEPS.find((s) => s.key === "images");
    expect(() => filmStepHref(step, ID, "nope")).toThrow();
  });

  it("★ 경로에서 단계를 되찾는다 — 공유·방식별 둘 다", () => {
    expect(filmStepFromPathname(`/film/${ID}/scenario`).key).toBe("scenario");
    expect(filmStepFromPathname(`/film/${ID}/order/images`).key).toBe("images");
  });

  it("옛 한 화면(/film/one/...)은 이 표의 단계가 아니다 — 가드가 그 화면을 건드리면 안 된다", () => {
    expect(filmStepFromPathname("/film/one/order")).toBe(undefined);
  });
});

describe("지금 있어야 할 단계", () => {
  it("시나리오가 없으면 시나리오다", () => {
    expect(currentFilmStepKey({ id: ID }, "order")).toBe("scenario");
  });

  it("시나리오가 있고 그림이 없으면 그림이다", () => {
    expect(currentFilmStepKey(withScenario, "order")).toBe("images");
  });

  it("그림이 있으면 영상이다", () => {
    expect(currentFilmStepKey(withImages, "order")).toBe("video");
  });

  it("★ 방식마다 따로 센다 — order 로 구웠다고 refs 가 앞서가면 안 된다", () => {
    expect(currentFilmStepKey(withImages, "refs")).toBe("images");
  });
});

describe("열림 판정", () => {
  it("입력·시나리오는 언제나 열린다", () => {
    expect(isFilmStepReachable("material", { id: ID }, "order")).toBe(true);
    expect(isFilmStepReachable("scenario", { id: ID }, "order")).toBe(true);
  });

  it("시나리오가 없으면 그림은 안 열린다 — 값이 나가는 자리다", () => {
    expect(isFilmStepReachable("images", { id: ID }, "order")).toBe(false);
  });

  it("그림이 없으면 영상은 안 열린다", () => {
    expect(isFilmStepReachable("video", withScenario, "order")).toBe(false);
  });

  // ★★ 2026-07-29 에 단계별에서 겪은 잠금 고리의 회귀 시험이다.
  //   완성이 "지금 단계"로 판정되기를 기다리면 아무도 완성에 못 들어간다 —
  //   굽기가 끝나면 지금 단계는 여전히 영상인데 완성은 **열려 있어야** 한다.
  it("★ 구운 뒤 완성이 열린다 — '열려 있다'와 '지금 있어야 한다'는 다르다", () => {
    expect(isFilmStepReachable("done", withVideo, "order")).toBe(true);
    expect(currentFilmStepKey(withVideo, "order")).not.toBe("done");
  });

  it("영상이 없으면 완성은 안 열린다", () => {
    expect(isFilmStepReachable("done", withImages, "order")).toBe(false);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "단계 표"`
Expected: FAIL — `Failed to resolve import "../lib/film/steps.js"`

- [ ] **Step 3: 최소 구현을 쓴다**

Create `lib/film/steps.js`:

```js
// 한 번에 굽는 영상의 단계 표 — **한 벌**이다.
//
// ★★ 왜 lib/steps.js 를 안 쓰나: 저쪽 표는 컷 파이프라인의 낡음 판정·projectSpeaks 분기까지
//   얽혀 있다. 한 표에 두 흐름을 담으면 한쪽을 고칠 때마다 다른 쪽을 확인해야 한다.
//   대신 **모양은 같게** 둔다 — 읽는 사람이 저쪽에서 배운 것을 그대로 쓸 수 있게.
//
// ★★ perMode 가 이 표의 핵심이다. 입력·시나리오는 두 방식이 **공유하는 하나**이고
//   (app/api/film/[id]/scenario/route.js 가 mode 를 아예 안 본다), 그림부터 갈린다.
//   주소가 그 사실을 그대로 담으면, 나중에 방식 하나가 확정됐을 때 뒤쪽 세그먼트만
//   걷어내면 된다 — 앞 두 단계는 손대지 않는다.
//
// ★ import 는 doc.js·mode.js 둘뿐이고 그 사슬에 fs·env 가 없다 — "use client" 화면이
//   이 파일을 그대로 부를 수 있어야 한다(lib/steps.js 머리말과 같은 성질).
import { filmOf } from "./doc.js";
import { filmMode } from "./mode.js";

// ★ 얼려 둔다. 스테퍼·라우팅 가드·currentFilmStepKey 가 **모두 이 표를 본다** —
//   호출부의 push 한 줄로 화면이 여는 문과 가드가 닫는 문이 갈린다(lib/steps.js 가
//   2026-08-13 에 겪은 결함이다).
export const FILM_STEPS = Object.freeze([
  Object.freeze({ key: "material", no: "1", label: "입력", seg: "briefing", perMode: false }),
  Object.freeze({ key: "scenario", no: "2", label: "시나리오", seg: "scenario", perMode: false }),
  Object.freeze({ key: "images", no: "3", label: "그림", seg: "images", perMode: true }),
  Object.freeze({ key: "video", no: "4", label: "영상", seg: "video", perMode: true }),
  Object.freeze({ key: "done", no: "5", label: "완성", seg: "done", perMode: true }),
]);

// ★ 방식별 단계는 모르는 방식으로 주소를 못 만든다 — filmMode 가 던진다.
//   조용히 한쪽으로 떨어뜨리면 사장님이 고른 것과 다른 방식으로 값이 나간다.
export function filmStepHref(step, projectId, mode) {
  if (!step || !projectId) return null;
  if (!step.perMode) return `/film/${projectId}/${step.seg}`;
  filmMode(mode); // 반환값은 안 쓴다 — 모르는 방식을 여기서 던지게 하려는 검증 호출이다
  return `/film/${projectId}/${mode}/${step.seg}`;
}

// 경로 → 단계.
//
// ⚠️ 옛 한 화면(`/film/one/<mode>`)은 이 표의 단계가 **아니다.** `one` 은 정적 세그먼트라
//   프로젝트 id 자리에 오지 않는다 — 가드가 그 화면을 건드리면 멀쩡한 화면이 되돌려진다.
export function filmStepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "film" || parts.length < 3) return undefined;
  if (parts[1] === "one") return undefined;
  const seg = parts[parts.length - 1];
  const step = FILM_STEPS.find((s) => s.seg === seg);
  if (!step) return undefined;
  // 방식별 단계는 `/film/<id>/<mode>/<seg>` 네 칸, 공유 단계는 `/film/<id>/<seg>` 세 칸이다.
  const want = step.perMode ? 4 : 3;
  return parts.length === want ? step : undefined;
}

// 지금 있어야 할 단계 — **방식마다 따로 센다.** 한 프로젝트에서 두 편을 굽는 것이 이
// 기능이라, order 로 구운 것이 refs 의 진행을 앞당기면 안 된다.
export function currentFilmStepKey(project, mode) {
  const film = filmOf(project, mode);
  if (!project?.scenario?.text) return "scenario";
  if (!film?.images?.length) return "images";
  return "video";
}

// 열림 판정.
//
// ★★ **"열려 있다"와 "지금 있어야 한다"는 다르다.** 2026-07-29 에 단계별에서 이 둘을 섞어
//   완성 단계에 아무도 못 들어가는 잠금 고리를 만들었다(완성이 열리는 조건이 status==="done"
//   인데, status 를 done 으로 만드는 합성은 완성 화면에서만 시작할 수 있었다).
//   완성은 굽기가 끝나면 **열리고**, 지금 단계는 여전히 영상이다.
export function isFilmStepReachable(key, project, mode) {
  const film = filmOf(project, mode);
  if (key === "material" || key === "scenario") return true;
  if (key === "images") return !!project?.scenario?.text;
  if (key === "video") return !!film?.images?.length;
  if (key === "done") return !!film?.video?.url;
  return false;
}
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS (기존 것 포함)

- [ ] **Step 5: 커밋**

```bash
git add lib/film/steps.js tests/film-steps.test.js
git commit -m "feat(film): 단계 표와 라우팅 가드 — 방식은 그림부터 갈린다"
```

---

## Task 2: 기존 한 화면을 `/film/one/[mode]` 로 옮긴다

**Files:**
- Move: `app/film/[mode]/page.js` → `app/film/one/[mode]/page.js`
- Modify: 옮긴 파일의 자기 링크 2곳(옛 271·528줄)과 `router.replace`(옛 194줄)
- Test: `tests/film-one-route.test.js` (신규)

**Interfaces:**
- Consumes: 없음 (파일 이동)
- Produces: `/film/one/<mode>?id=<id>` 주소. `app/film/[id]/…` 자리가 비워진다.

**왜:** Next.js 는 같은 자리에 이름이 다른 동적 세그먼트를 못 둔다. `app/film/[mode]` 가 있는 한 `app/film/[id]` 를 만들면 **빌드가 죽는다.**

- [ ] **Step 1: 실패하는 시험을 쓴다**

Create `tests/film-one-route.test.js`:

```js
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";

// ★★ 이 시험이 지키는 것은 **빌드가 뜨는가**다. Next 는 같은 자리에 이름이 다른 동적
//   세그먼트를 못 둔다 — `app/film/[mode]` 와 `app/film/[id]` 가 함께 있으면 앱이 안 뜬다.
//   이 저장소의 화면 시험은 소스 문자열을 훑는 방식이라 그런 결함을 못 잡으므로,
//   **파일이 어디 있는가**를 값으로 잰다.
describe("옛 한 화면은 정적 세그먼트 아래로 비켰다", () => {
  it("★ app/film/[mode] 가 없다 — 있으면 app/film/[id] 와 부딪혀 빌드가 죽는다", () => {
    expect(existsSync("app/film/[mode]/page.js")).toBe(false);
  });

  it("★ 옛 화면은 지워지지 않고 살아 있다", () => {
    expect(existsSync("app/film/one/[mode]/page.js")).toBe(true);
  });

  it("★ 자기 자신을 가리키는 링크도 함께 옮겼다 — 안 옮기면 눌렀을 때 404 다", () => {
    const src = readFileSync("app/film/one/[mode]/page.js", "utf8");
    expect(src).not.toMatch(/href=\{`\/film\/\$\{m\.id\}`\}/);
    expect(src).not.toMatch(/href=\{`\/film\/\$\{other\.id\}\?id=/);
    expect(src).toMatch(/\/film\/one\//);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "옛 한 화면은 정적"`
Expected: FAIL — 첫 시험이 `expected true to be false`

- [ ] **Step 3: 파일을 옮기고 링크를 고친다**

```bash
mkdir -p "app/film/one"
git mv "app/film/[mode]" "app/film/one/[mode]"
```

그리고 옮긴 파일에서 **Edit 도구로** 세 곳을 고친다(heredoc 금지 — 역슬래시가 먹힌다):

1. `href={`/film/${m.id}`}` → `href={`/film/one/${m.id}`}`
2. `href={`/film/${other.id}?id=${id}`}` → `href={`/film/one/${other.id}?id=${id}`}`
3. `router.replace(`/film/${mode}?id=${data.id}`)` → `router.replace(`/film/one/${mode}?id=${data.id}`)`

머리말 주석 첫 줄도 고친다: `// /film/[mode] — 한 번에 굽는 영상.` → `// /film/one/[mode] — 한 번에 굽는 영상(옛 한 화면).` 그리고 그 아래에 한 줄 더한다:

```
// ★★ 2026-08-20 에 `/film/[mode]` 에서 여기로 **비켰다.** 지운 것이 아니다 — 단계별 흐름이
//   `/film/<id>/…` 를 쓰는데, Next 는 같은 자리에 이름이 다른 동적 세그먼트를 못 둔다.
//   두 방식을 나란히 재던 이 화면은 그대로 살아 있다.
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 5: 굽는다**

dev 서버를 끄고:

```bash
npx next build && rm -rf .next
```

Expected: 빌드 성공. 실패하면 라우트 충돌이 남아 있는 것이다.

- [ ] **Step 6: 커밋**

```bash
git add -A app/film tests/film-one-route.test.js
git commit -m "refactor(film): 옛 한 화면을 /film/one 으로 비킨다 — /film/[id] 자리를 연다"
```

---

## Task 3: 레이아웃 — 프로젝트 로드 · 스테퍼 · 가드

**Files:**
- Create: `components/FilmProjectContext.jsx`
- Create: `app/film/[id]/layout.js`
- Test: `tests/film-layout-ui.test.js`

**Interfaces:**
- Consumes: Task 1 의 `FILM_STEPS`·`filmStepHref`·`filmStepFromPathname`·`currentFilmStepKey`·`isFilmStepReachable`
- Produces:
  - `useFilmProject() -> { project, setProject, reload }` — 단계 화면들이 부른다
  - `FilmProjectProvider` — 레이아웃이 감싼다

- [ ] **Step 1: 실패하는 시험을 쓴다**

Create `tests/film-layout-ui.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const layout = () => readFileSync("app/film/[id]/layout.js", "utf8");

describe("film 레이아웃", () => {
  it("★ 프로젝트는 film 전용 문으로 읽는다 — /api/projects/[id] 는 kind 를 막는다", () => {
    expect(layout()).toMatch(/\/api\/film\/\$\{id\}/);
    expect(layout()).not.toMatch(/\/api\/projects\//);
  });

  it("★ 단계 표를 직접 적지 않고 lib/film/steps 에서 읽는다", () => {
    expect(layout()).toMatch(/from ".*lib\/film\/steps"/);
  });

  it("★ 못 연 단계로 들어오면 되돌려 보낸다", () => {
    const src = layout();
    expect(src).toMatch(/isFilmStepReachable/);
    expect(src).toMatch(/router\.replace/);
  });

  it("★ 폴링은 lib/poll 을 쓴다 — 화면에서 setInterval 을 직접 돌리지 않는다", () => {
    expect(layout()).not.toMatch(/setInterval/);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "film 레이아웃"`
Expected: FAIL — `ENOENT: no such file or directory, open 'app/film/[id]/layout.js'`

- [ ] **Step 3: 컨텍스트를 만든다**

Create `components/FilmProjectContext.jsx`:

```jsx
"use client";

// 레이아웃이 한 번 읽은 프로젝트를 단계 화면들이 나눠 쓴다.
//
// ★ 왜 컨텍스트인가: 단계마다 각자 GET 을 두드리면 같은 문서를 다섯 번 읽고, 한 화면이
//   갱신한 값을 옆 화면이 모른다. components/ProjectContext.jsx 가 단계별 흐름에서
//   같은 이유로 이미 이 모양이다.
import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext(null);

export function FilmProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  // ★ 실패를 삼키지 않는다. 조용히 실패하면 화면은 옛 상태를 든 채 유료 버튼을 다시 연다.
  const reload = useCallback(async (id) => {
    const res = await fetch(`/api/film/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
    setProject(data);
    return data;
  }, []);

  return <Ctx.Provider value={{ project, setProject, reload }}>{children}</Ctx.Provider>;
}

export function useFilmProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("FilmProjectProvider 안에서만 쓸 수 있어요");
  return v;
}
```

- [ ] **Step 4: 레이아웃을 만든다**

Create `app/film/[id]/layout.js`:

```jsx
"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 화면은 화면만 그린다.
// (app/create/[id]/layout.js 와 같은 구조다. 저쪽에서 배운 것이 여기서도 통해야 한다.)
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FilmProjectProvider, useFilmProject } from "../../../components/FilmProjectContext";
import {
  FILM_STEPS, filmStepHref, filmStepFromPathname, currentFilmStepKey, isFilmStepReachable,
} from "../../../lib/film/steps";
import { FILM_MODES, isFilmMode } from "../../../lib/film/mode";

function Inner({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { project, reload } = useFilmProject();
  const [err, setErr] = useState("");

  // 주소에서 방식을 읽는다 — 방식별 단계는 `/film/<id>/<mode>/<seg>` 네 칸이다.
  // 공유 단계에는 방식이 없으므로 첫 방식으로 떨어진다(스테퍼의 링크를 만들 때만 쓴다).
  const parts = (pathname || "").split("/").filter(Boolean);
  const fromPath = parts.length === 4 ? parts[2] : null;
  const mode = isFilmMode(fromPath) ? fromPath : FILM_MODES[0].id;

  useEffect(() => {
    reload(id).catch((e) => setErr(e.message));
  }, [id, reload]);

  const step = filmStepFromPathname(pathname);
  useEffect(() => {
    if (!project || project.id !== id) return;
    if (step && isFilmStepReachable(step.key, project, mode)) return;
    const target = FILM_STEPS.find((s) => s.key === currentFilmStepKey(project, mode));
    router.replace(filmStepHref(target, id, mode));
  }, [project, id, step, mode, router]);

  // 못 찾은 이유는 대개 둘이다 — 지워졌거나 남의 것이거나. 어느 쪽이든 할 수 있는 일이
  // 같으니 나갈 길을 함께 준다. 문구만 덩그러니 두면 "여기서 뭘 해야 하지"로 막힌다.
  if (err) {
    return (
      <>
        <h1 className="pgtitle">{err}</h1>
        <p className="pgsub">주소가 잘못됐거나 다른 계정의 영상일 수 있어요.</p>
        <Link href="/archive" className="cta">보관함으로</Link>
      </>
    );
  }
  if (!project || project.id !== id) return <p className="pgsub">불러오는 중…</p>;

  return (
    <>
      <h1 className="pgtitle">한 번에 굽는 영상</h1>
      <nav className="stepper">
        {FILM_STEPS.map((s) => {
          const open = isFilmStepReachable(s.key, project, mode);
          const on = step?.key === s.key;
          return open ? (
            <Link key={s.key} href={filmStepHref(s, id, mode)} className={`stepper-item${on ? " on" : ""}`}>
              {s.no} {s.label}
            </Link>
          ) : (
            <span key={s.key} className="stepper-item off">{s.no} {s.label}</span>
          );
        })}
      </nav>
      {children}
    </>
  );
}

export default function FilmLayout({ children }) {
  return (
    <FilmProjectProvider>
      <Inner>{children}</Inner>
    </FilmProjectProvider>
  );
}
```

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/film/[id]/layout.js components/FilmProjectContext.jsx tests/film-layout-ui.test.js
git commit -m "feat(film): 단계별 레이아웃 — 프로젝트를 한 번 읽고 스테퍼와 가드를 건다"
```

---

## Task 4: 1 입력 · 2 시나리오 (두 방식 공유)

**Files:**
- Create: `app/film/[id]/briefing/page.js`
- Create: `app/film/[id]/scenario/page.js`
- Create: `app/film/new/page.js` (프로젝트가 생기기 전 자리 — `/film/<id>` 가 없을 때 들어온다)
- Test: `tests/film-step-pages-ui.test.js`

**Interfaces:**
- Consumes: Task 3 의 `useFilmProject`, Task 1 의 `filmStepHref`
- Produces: 없음 (다음 태스크가 참조하지 않는다)

**옮겨 담는 것:** 지금 `app/film/one/[mode]/page.js` 의
- 입력 `<section>` = 308~435줄 (소재 글·사진 업로드·컨셉/분위기/화풍/언어/사이즈 칩·[만들기])
- 시나리오 `<section>` = 442~457줄

`/film/new` 가 [만들기]를 받아 `POST /api/film` 후 `router.replace(\`/film/${data.id}/scenario\`)` 한다. `/film/<id>/briefing` 은 이미 만들어진 프로젝트의 입력을 **보여 주기만** 한다 — 지금 화면도 만든 뒤에는 조건을 못 바꾼다(단계별 ①자료와 같은 규율).

- [ ] **Step 1: 실패하는 시험을 쓴다**

Create `tests/film-step-pages-ui.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = (p) => readFileSync(p, "utf8");

describe("1 입력 · /film/new", () => {
  it("★ 만들기는 사이즈·컨셉·분위기·화풍·언어를 함께 보낸다 — 안 보내면 기본값이 조용히 톤을 정한다", () => {
    const s = src("app/film/new/page.js");
    for (const k of ["aspect_ratio", "format", "mood", "style", "narration_lang"]) {
      expect(s).toContain(k);
    }
  });

  it("★ 길이·화질·모델은 안 보낸다 — 서버가 박는다(두 방식의 조건을 같게 둔다)", () => {
    const s = src("app/film/new/page.js");
    expect(s).not.toMatch(/seconds:/);
    expect(s).not.toMatch(/resolution:/);
  });

  it("★ 만든 뒤 시나리오 단계로 보낸다", () => {
    expect(src("app/film/new/page.js")).toMatch(/\/scenario/);
  });

  it("★ 사진 업로드 중에는 만들기가 잠긴다 — 2026-08-18 에 사진 0장으로 $3.63 이 나갔다", () => {
    expect(src("app/film/new/page.js")).toMatch(/uploading/);
  });
});

describe("2 시나리오", () => {
  it("★ 잠금 판정은 lib/film/doc 의 scenarioLock 하나다 — 손으로 다시 적지 않는다", () => {
    expect(src("app/film/[id]/scenario/page.js")).toMatch(/scenarioLock/);
  });

  it("★ 방식을 안 보낸다 — 시나리오는 두 방식이 공유하는 하나다", () => {
    const s = src("app/film/[id]/scenario/page.js");
    expect(s).toMatch(/\/scenario`, \{ method: "POST" \}/);
  });

  it("★ setInterval 을 직접 돌리지 않는다", () => {
    for (const p of ["app/film/[id]/briefing/page.js", "app/film/[id]/scenario/page.js"]) {
      expect(src(p)).not.toMatch(/setInterval/);
    }
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "1 입력"`
Expected: FAIL — `ENOENT ... app/film/new/page.js`

- [ ] **Step 3: 세 화면을 만든다**

`app/film/new/page.js` — 지금 화면의 입력 `<section>`(308~435줄)과 상태(`text`·`photos`·`aspect`·`format`·`mood`·`style`·`lang`·`uploading`)·`onPick`·`create` 를 그대로 옮긴다. `create` 의 끝만 바꾼다:

```js
router.replace(`/film/${data.id}/scenario`);
```

`app/film/[id]/briefing/page.js` — 저장된 `project.material`·`project.settings` 를 읽기 전용으로 보여 주고 "시나리오로" 링크 하나를 둔다:

```jsx
"use client";

// 1 입력 — **보여 주기만 한다.** 만든 뒤에는 조건을 못 바꾼다(단계별 ①자료와 같은 규율):
// 그 값들이 시나리오·그림·굽기의 재료라, 바꿀 자리를 열면 낡음 경고가 함께 돌아와야 한다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../components/FilmProjectContext";
import { FILM_STEPS, filmStepHref } from "../../../../lib/film/steps";
import { AD_FORMATS, AD_MOODS, AD_LANGS } from "../../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../../lib/styles";
import { aspectFor } from "../../../../lib/aspects";

const labelOf = (list, id) => list.find((x) => x.id === id)?.label || id;

export default function FilmBriefingPage() {
  const { id } = useParams();
  const { project } = useFilmProject();
  const s = project?.settings || {};
  const next = FILM_STEPS.find((x) => x.key === "scenario");

  return (
    <section className="panel panel--wide">
      <h2>입력</h2>
      <p className="pgsub">{project?.material?.text}</p>
      <div className="tray">
        <span className="chip on">{labelOf(AD_FORMATS, s.format)}</span>
        <span className="chip on">{labelOf(AD_MOODS, s.mood)}</span>
        <span className="chip on">{labelOf(STYLE_PRESETS, s.style)}</span>
        <span className="chip on">{labelOf(AD_LANGS, s.narration_lang)}</span>
        <span className="chip on">{aspectFor(s.aspect_ratio)?.label || s.aspect_ratio}</span>
      </div>
      <p className="pgsub">사진 {(project?.material?.photos || []).length}장</p>
      <div className="step-actions">
        <Link className="cta" href={filmStepHref(next, id)}>시나리오로</Link>
      </div>
    </section>
  );
}
```

`app/film/[id]/scenario/page.js` — 지금 화면의 시나리오 `<section>`(442~457줄)과 `makeScenario` 를 옮기고, 끝에 "그림으로" 링크를 둔다. 잠금은 `scenarioLock(project)` 하나를 그대로 쓴다.

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 5: 굽는다**

dev 서버를 끄고 `npx next build && rm -rf .next`

- [ ] **Step 6: 커밋**

```bash
git add app/film/new app/film/[id]/briefing app/film/[id]/scenario tests/film-step-pages-ui.test.js
git commit -m "feat(film): 입력·시나리오를 단계 화면으로 — 두 방식이 공유하는 자리다"
```

---

## Task 5: 그림 한 장만 다시 그리기 (서버)

**Files:**
- Modify: `lib/film/pipeline.js` — `runFilmImages`
- Test: `tests/film-partial-images.test.js`

**Interfaces:**
- Consumes: `imagePlanFor`·`usesFilmAnchor` (`lib/film/mode.js`), `filmOf`·`putFilm` (`lib/film/doc.js`)
- Produces: `runFilmImages(projectId, ownerId, mode, deps)` — `deps.only?: string[]`. 없으면 오늘 그대로 전부 그린다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

Create `tests/film-partial-images.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { filmOf, putFilm } from "../lib/film/doc.js";
import { runFilmImages } from "../lib/film/pipeline.js";

const U = "00000000-0000-4000-8000-0000000000f2";
const SETTINGS = { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", model: "seedance-2.0" };
const SCENARIO = {
  text: "Vertical 9:16 footage.",
  focus: "product",
  tries: 1,
  shots: [
    { line: "안녕", seconds: 8, shows: "a woman holding the box", avatar_id: "av-woman-20s" },
    { line: "잘가", seconds: 7, shows: "the finished bowl on a table", avatar_id: "" },
  ],
};

async function seed({ photoKeys = [], scenarioTries = 1, images } = {}) {
  for (const key of photoKeys) {
    await getStore().putObject("uploads", key, Buffer.from(`bytes:${key}`), "image/jpeg");
  }
  const p = await runWithActor(U, () =>
    createProject({
      settings: SETTINGS,
      material: { text: "떡볶이 밀키트", photos: photoKeys.map((k) => ({ url: `/api/uploads/${k}` })) },
      ownerId: U,
      kind: "ad",
    })
  );
  const row = await getStore().selectProject(p.id, U);
  let doc = { ...row.doc, scenario: { ...SCENARIO, tries: scenarioTries } };
  if (images) doc = putFilm(doc, "refs", { images, status: "images", scenarioTries: 1 });
  await getStore().updateProjectRow(p.id, U, row.version, doc);
  return p;
}

const OLD = [
  { key: "subject", url: "https://fal.example/old-subject.png", of: "old" },
  { key: "subject-in-use", url: "https://fal.example/old-in-use.png", of: "old" },
  { key: "person", url: "https://fal.example/old-person.png", of: "old" },
  { key: "place", url: "https://fal.example/old-place.png", of: "old" },
];

describe("그림 한 장만 다시 그린다", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 고른 축만 새로 그린다 — 나머지는 값을 안 치른다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD });
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async (args) => { drew.push(args); return { url: "https://fal.example/new.png" }; },
      })
    );
    expect(drew).toHaveLength(1);
  });

  it("★ 안 고른 축은 그 자리에 그대로 남는다 — 덧붙이기가 아니라 자리 맞춤이다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async () => ({ url: "https://fal.example/new.png" }),
      })
    );
    const row = await getStore().selectProject(p.id, U);
    const after = filmOf(row.doc, "refs").images;
    expect(after.map((i) => i.key)).toEqual(OLD.map((i) => i.key));
    expect(after.find((i) => i.key === "subject").url).toBe("https://fal.example/new.png");
    expect(after.find((i) => i.key === "place").url).toBe("https://fal.example/old-place.png");
  });

  // ★★ 시나리오 판이 다르면 열지 않는다. 섞이면 "어느 판으로 그렸는가"의 보증이 깨지고,
  //   "차이는 방식 때문"이라는 이 기능의 대전제를 나중에 아무도 확인할 수 없다.
  it("★ 시나리오 판이 다르면 던진다 — 판이 섞인 그림 묶음을 만들지 않는다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], scenarioTries: 2, images: OLD });
    await expect(
      runWithActor(U, () =>
        runFilmImages(p.id, U, "refs", {
          only: ["subject"],
          generateImage: async () => ({ url: "https://fal.example/new.png" }),
        })
      )
    ).rejects.toThrow(/시나리오/);
  });

  it("판이 달라도 전부 다시 그리기는 열린다 — 그때는 묶음이 통째로 새 판이 된다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], scenarioTries: 2, images: OLD });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", { generateImage: async () => ({ url: "https://fal.example/n.png" }) })
    );
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "refs").scenarioTries).toBe(2);
  });

  it("★ 계획에 있는데 그림이 없는 축은 only 밖이라도 그린다 — 빈 자리를 남기지 않는다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD.slice(0, 2) });
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async (a) => { drew.push(a); return { url: "https://fal.example/n.png" }; },
      })
    );
    const row = await getStore().selectProject(p.id, U);
    const after = filmOf(row.doc, "refs").images;
    expect(after.every((i) => i.url)).toBe(true);
    expect(drew.length).toBeGreaterThan(1); // subject + 없던 축들
  });

  it("★ 계획에서 사라진 축의 그림은 안 되살아난다", async () => {
    const p = await seed({
      photoKeys: ["a.jpg"],
      images: [...OLD, { key: "person-full", url: "https://fal.example/ghost.png", of: "old" }],
    });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async () => ({ url: "https://fal.example/n.png" }),
      })
    );
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "refs").images.map((i) => i.key)).not.toContain("person-full");
  });

  // ★★ 장면 순서 방식은 앵커를 먼저 만들고 장면 그림 **전부**가 그것을 참조한다.
  //   장면 하나만 다시 그릴 때 앵커를 새로 만들면 나머지와 갈린다.
  it("★ 앵커는 다시 만들지 않고 기존 것을 참조로 쓴다", async () => {
    const p = await seed({
      images: [
        { key: "anchor", url: "https://fal.example/anchor.png", of: "old" },
        { key: "shot-1", url: "https://fal.example/s1.png", of: "old" },
        { key: "shot-2", url: "https://fal.example/s2.png", of: "old" },
      ],
    });
    const row0 = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row0.version,
      putFilm(row0.doc, "order", { images: filmOf(row0.doc, "refs").images, status: "images", scenarioTries: 1 }));
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        only: ["shot-2"],
        generateImage: async (a) => { drew.push(a); return { url: "https://fal.example/n.png" }; },
      })
    );
    expect(drew).toHaveLength(1);
    expect(drew[0].refs.some((r) => r.url === "https://fal.example/anchor.png")).toBe(true);
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "order").images.find((i) => i.key === "anchor").url)
      .toBe("https://fal.example/anchor.png");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "그림 한 장만"`
Expected: FAIL — 첫 시험이 `expected 4 to have length 1`(지금은 `only` 를 무시하고 넷을 다 그린다)

- [ ] **Step 3: `runFilmImages` 를 고친다**

`lib/film/pipeline.js` 의 `runFilmImages` 안, `const images = []` 부터 앵커·루프까지를 아래로 바꾼다:

```js
    const aspect = project.settings?.aspect_ratio || "9:16";

    // ★★ 어느 축만 다시 그리는가(2026-08-20). 없으면 오늘 그대로 전부다 — 옛 호출부 회귀 0.
    //   축 하나를 손볼 때마다 넉 장($0.32)을 다시 그리던 것을 한 장($0.08)으로 줄인다.
    const only = Array.isArray(deps.only) && deps.only.length ? new Set(deps.only) : null;
    const kept = new Map((filmOf(project, mode).images || []).map((im) => [im.key, im]));

    // ⚠️ **판이 섞인 묶음을 만들지 않는다.** films[방식].scenarioTries 는 "어느 판의
    //   시나리오로 그렸는가"를 보증하는 값인데, 부분 재생성이 판을 넘나들면 그 보증이
    //   깨진다 — 그러면 "차이는 방식 때문"이라는 이 기능의 대전제를 확인할 길이 없다.
    //   전부 다시 그리는 것은 열려 있다: 그때는 묶음이 통째로 새 판이 된다.
    const scenarioTries = Number(project.scenario?.tries) || 0;
    if (only && Number(filmOf(project, mode).scenarioTries) !== scenarioTries) {
      throw new Error("시나리오가 바뀌었어요 — 그림을 전부 다시 그려 주세요");
    }

    const images = [];

    // ★★ 장면 순서 방식은 **앵커를 먼저** 만든다. 이 방식은 컷마다 독립으로 그리기 때문에
    //   인물도 제품도 컷마다 딴 것이 된다 — 앵커 한 장을 먼저 만들어 장면 그림 **전부**가
    //   그것을 참조하게 한다(직전 그림이 아니다: 오차가 누적된다).
    // ★ 참고 그림 방식에는 안 붙인다 — 그 방식은 세 축 자체가 앵커다.
    // ★ 조건을 손으로 적지 않는다 — 프롬프트가 라벨 번호를 매길 때 보는 것과 같은 함수다.
    // ★★ 부분 재생성이면 **앵커를 다시 만들지 않는다.** 새로 만들면 안 고친 장면들과
    //   갈려, 앵커를 둔 이유(전부가 같은 것을 참조한다)가 통째로 무너진다.
    const anchor = usesFilmAnchor(mode, refs.length)
      ? anchorPlanFor(project.scenario, { narrationLang: project.settings?.narration_lang })
      : null;
    let sceneRefs = refs;
    if (anchor) {
      const keptAnchor = kept.get(anchor.key);
      if (only && keptAnchor?.url) {
        images.push(keptAnchor);
        sceneRefs = [...refs, { url: keptAnchor.url }];
      } else {
        const out = await make({ prompt: anchor.prompt, aspect_ratio: aspect, refs, projectId });
        images.push({ key: anchor.key, url: out.url, of: anchor.prompt });
        sceneRefs = [...refs, { url: out.url }];
      }
    }

    const avatarCache = new Map();
    const avatarRef = async (id) => {
      if (!id) return null;
      if (avatarCache.has(id)) return avatarCache.get(id);
      const found = AVATARS.find((a) => a.id === id);
      const bytes = found ? await readRefBytes({ source: "avatar", key: found.file }) : null;
      const ref = bytes ? { key: found.file, bytes } : null;
      avatarCache.set(id, ref);
      return ref;
    };

    for (const item of plan) {
      // ★★ **계획이 기준이다.** 안 고른 축은 기존 그림을 그 자리에 두되, 계획에 없는 키의
      //   그림은 버리고(시나리오가 바뀌면 축 구성이 달라진다) 계획에 있는데 그림이 없는
      //   키는 only 밖이라도 그린다 — 빈 자리를 남기면 굽기가 그 자리 없이 나간다.
      const reuse = only && !only.has(item.key) ? kept.get(item.key) : null;
      if (reuse?.url) { images.push(reuse); continue; }
      const face = await avatarRef(item.avatarId);
      const out = await make({
        prompt: item.prompt,
        aspect_ratio: aspect,
        refs: face ? [...sceneRefs, face] : sceneRefs,
        projectId,
      });
      images.push({ key: item.key, url: out.url, of: item.prompt });
    }

    await updateProject(projectId, ownerId, (p) =>
      putFilm(p, mode, { images, status: "images", error: null, scenarioTries }));
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/film/pipeline.js tests/film-partial-images.test.js
git commit -m "feat(film): 그림을 축 하나만 다시 그린다 — 넉 장 \$0.32 를 한 장 \$0.08 로"
```

---

## Task 6: 그림 한 장만 다시 그리기 (라우트)

**Files:**
- Modify: `app/api/film/[id]/images/route.js`
- Test: `tests/film-routes.test.js` (기존 파일에 더한다)

**Interfaces:**
- Consumes: Task 5 의 `runFilmImages(..., { only })`
- Produces: `POST /api/film/<id>/images` 가 `{ mode, only?: string[] }` 를 받는다

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/film-routes.test.js` 끝에 더한다:

```js
describe("그림 라우트가 only 를 받는다", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 그 방식의 계획에 없는 축 이름은 400 — 모르는 키로 값이 나가면 안 된다", async () => {
    const { p, U } = await seedFilmProject();
    const res = await POST_IMAGES(p.id, U, { mode: "refs", only: ["nope"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/축|모르는/);
  });

  it("★ only 가 배열이 아니면 400 — 조용히 전부 그리면 값이 네 배다", async () => {
    const { p, U } = await seedFilmProject();
    const res = await POST_IMAGES(p.id, U, { mode: "refs", only: "subject" });
    expect(res.status).toBe(400);
  });

  it("only 를 안 주면 예전 그대로 전부 그린다", async () => {
    const { p, U } = await seedFilmProject();
    const res = await POST_IMAGES(p.id, U, { mode: "refs" });
    expect(res.status).toBe(200);
  });
});
```

> `seedFilmProject`·`POST_IMAGES` 는 `tests/film-routes.test.js` 에 이미 있는 헬퍼를 쓴다. 없으면 그 파일의 기존 테스트가 쓰는 방식(`withUser` 를 통과시키는 헤더 주입)을 그대로 따라 만든다.

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "그림 라우트가 only"`
Expected: FAIL — 400 이 아니라 200 이 온다

- [ ] **Step 3: 라우트를 고친다**

`app/api/film/[id]/images/route.js` 에서 `const { mode } = ...` 줄을 바꾸고, 계획 검증을 더한다:

```js
import { imagePlanFor, isFilmMode } from "../../../../../lib/film/mode.js";
...
  const body = (await req.json().catch(() => ({}))) || {};
  const { mode, only } = body;
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });

  // ★★ only 는 **그 방식의 계획에 있는 키**여야 한다(2026-08-20). 모르는 키를 받으면
  //   그 축은 아무것도 안 그려지는데 회차는 먹고, 사장님은 "눌렀는데 안 바뀐다"만 본다.
  //   ⚠️ 배열이 아닌 값을 조용히 무시하면 **전부 다시 그린다** — 값이 네 배다.
  if (only !== undefined && !Array.isArray(only)) {
    return Response.json({ error: "다시 그릴 그림을 골라 주세요" }, { status: 400 });
  }
```

프로젝트를 읽은 **뒤**(`loadFilm` 다음, 잠금 검사 앞)에 키를 검증한다:

```js
  if (Array.isArray(only) && only.length) {
    const keys = new Set(
      imagePlanFor(mode, project.scenario, {
        narrationLang: project.settings?.narration_lang,
      }).map((x) => x.key)
    );
    // 앵커는 계획에 없지만 실제 그림에는 있다 — 장면 순서 방식의 첫 장이다.
    keys.add("anchor");
    if (only.some((k) => !keys.has(k))) {
      return Response.json({ error: "모르는 그림이에요" }, { status: 400 });
    }
  }
```

그리고 `runFilmImages` 호출에 넘긴다:

```js
    await runFilmImages(id, user.id, mode, Array.isArray(only) && only.length ? { only } : {});
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/api/film/[id]/images/route.js" tests/film-routes.test.js
git commit -m "feat(film): 그림 라우트가 only 를 받는다 — 모르는 축 이름은 400"
```

---

## Task 7: 3 그림 · 4 영상 · 5 완성 (방식별)

**Files:**
- Create: `app/film/[id]/[mode]/images/page.js`
- Create: `app/film/[id]/[mode]/video/page.js`
- Create: `app/film/[id]/[mode]/done/page.js`
- Modify: `tests/film-step-pages-ui.test.js`
- Modify: `tests/poll-migration-ui.test.js` — 화면 목록에 새 화면들을 더한다

**Interfaces:**
- Consumes: Task 3 의 `useFilmProject`, Task 6 의 `only`, `filmGates`(`lib/film/gates.js`), `startPolling`(`lib/poll.js`)
- Produces: 없음

**옮겨 담는 것:** `app/film/one/[mode]/page.js` 의 그림 `<section>`(459~492줄)·굽기 `<section>`(494~521줄)·완성 링크(527~)와 `makeImages`·`startRender`·`beginPolling`·`live` 상태.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/film-step-pages-ui.test.js` 끝에 더한다:

```js
describe("3 그림", () => {
  const s = () => src("app/film/[id]/[mode]/images/page.js");

  it("★ 문 판정은 lib/film/gates 하나다 — 버튼마다 조건을 따로 적으면 한 곳이 빠진다", () => {
    expect(s()).toMatch(/filmGates/);
  });

  it("★ 방식 칩이 둘 다 있고, 같은 id 를 들고 건너간다 — 한 시나리오로 두 방식을 굽는다", () => {
    expect(s()).toMatch(/FILM_MODES/);
    expect(s()).toMatch(/filmStepHref/);
  });

  it("★ 그림 카드마다 다시 만들기가 있다 — only 로 그 축만 보낸다", () => {
    expect(s()).toMatch(/only:/);
  });

  it("★ 시나리오 판이 다르면 카드별 다시 만들기를 잠근다 — 서버가 던지기 전에 막는다", () => {
    expect(s()).toMatch(/scenarioTries/);
  });
});

describe("4 영상", () => {
  const s = () => src("app/film/[id]/[mode]/video/page.js");

  it("★ 폴링은 lib/poll 을 쓴다", () => {
    expect(s()).toMatch(/startPolling/);
    expect(s()).not.toMatch(/setInterval/);
  });

  it("★ 굽기는 접수(202)된 때만 폴링을 시작한다 — 402·409 에도 두드리면 헛돈다", () => {
    expect(s()).toMatch(/if \(res\.ok\) beginPolling\(\)/);
  });
});

describe("5 완성", () => {
  it("★ 다른 방식으로 굽기와 보관함으로 나가는 길이 있다", () => {
    const s = src("app/film/[id]/[mode]/done/page.js");
    expect(s).toMatch(/archive/);
    expect(s).toMatch(/FILM_MODES/);
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "3 그림"`
Expected: FAIL — `ENOENT ... app/film/[id]/[mode]/images/page.js`

- [ ] **Step 3: 세 화면을 만든다**

**3 그림** — 지금 화면의 그림 `<section>` 을 옮기고 다음을 더한다:

```jsx
  // ★ 시나리오 판이 다르면 카드별 다시 만들기를 잠근다. 서버(lib/film/pipeline.js)도
  //   던지지만, 화면이 먼저 막아야 사장님이 오류를 보기 전에 알 수 있다.
  //   판정은 서버와 같은 값을 본다 — films[방식].scenarioTries vs scenario.tries.
  const staleSet = Number(film?.scenarioTries) !== (Number(project?.scenario?.tries) || 0);

  async function redraw(only) {
    setBusy("images"); setErr("");
    const res = await fetch(`/api/film/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(only ? { mode, only } : { mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
  }
```

카드마다 `<button disabled={drawLocked || staleSet} onClick={() => redraw([im.key])}>다시 만들기</button>`, 아래에 `<button disabled={drawLocked} onClick={() => redraw(null)}>전부 다시 만들기</button>`.

방식 칩:

```jsx
  {FILM_MODES.map((m) => (
    <Link key={m.id} className={`chip${m.id === mode ? " on" : ""}`}
      href={filmStepHref(FILM_STEPS.find((s) => s.key === "images"), id, m.id)}>
      {m.label}
    </Link>
  ))}
```

**4 영상** — 굽기 `<section>`·`startRender`·`beginPolling`·`live` 를 그대로 옮긴다. 방식이 바뀌면 폴링을 떼고 `live` 를 비우는 effect(지금 화면 94~110줄의 `[mode, id]` effect)도 **반드시 함께 옮긴다** — 안 옮기면 옛 mode 를 클로저에 가둔 폴링이 옆 방식의 값으로 화면을 채운다.

**5 완성** — 영상 재생과 나가는 길 둘(다른 방식으로 굽기 · 보관함으로).

- [ ] **Step 4: setInterval 그물에 등록한다**

⚠️ `setInterval` 금지 그물이 세 파일에 흩어져 있어 **새 화면은 어디에도 안 걸린다**(CLAUDE.md). `tests/poll-migration-ui.test.js` 의 화면 목록 배열에 새 다섯 화면의 경로를 손으로 더한다.

- [ ] **Step 5: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 6: 굽는다**

dev 서버를 끄고 `npx next build && rm -rf .next`

- [ ] **Step 7: 커밋**

```bash
git add app/film/[id]/[mode] tests/film-step-pages-ui.test.js tests/poll-migration-ui.test.js
git commit -m "feat(film): 그림·영상·완성을 단계 화면으로 — 방식이 여기서 갈린다"
```

---

## Task 8: 들어가는 길 · 마무리 확인

**Files:**
- Modify: `app/archive/[id]/page.js` — film 프로젝트 상세에서 단계별 흐름으로 가는 링크
- Test: 기존 `tests/film-archive.test.js`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`tests/film-archive.test.js` 끝에 더한다:

```js
it("★ 보관함에서 단계별 흐름으로 들어가는 길이 있다 — 주소를 손으로 쳐야 하면 아무도 못 쓴다", () => {
  const src = readFileSync("app/archive/[id]/page.js", "utf8");
  expect(src).toMatch(/\/film\/\$\{[^}]*\}\//);
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `npx vitest run --dir tests -t "보관함에서 단계별"`
Expected: FAIL

- [ ] **Step 3: 링크를 더한다**

`app/archive/[id]/page.js` 의 film 프로젝트 갈래에 `filmStepHref` 로 만든 링크를 둔다(지금 단계로 보낸다):

```jsx
<Link className="mini" href={filmStepHref(
  FILM_STEPS.find((s) => s.key === currentFilmStepKey(project, mode)), project.id, mode
)}>이어서 만들기</Link>
```

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `npx vitest run --dir tests`
Expected: 전부 PASS

- [ ] **Step 5: 마지막으로 굽는다**

dev 서버를 끄고:

```bash
npx next build && rm -rf .next
```

Expected: 빌드 성공

- [ ] **Step 6: 손으로 한 번 지나가 본다 (0원)**

dev 서버를 `SHOTFORM_FAKE=fal npm run dev` 로 띄운다(이미지·영상이 가짜라 0원, LLM 은 진짜).

- `/film/new` 에서 소재를 적고 만든다 → 시나리오 단계로 간다
- 시나리오를 만든다 → 그림 단계로 간다
- 그림을 만든다 → 카드가 넷 뜬다
- 카드 하나의 [다시 만들기] → 그 카드만 바뀐다
- 방식 칩을 눌러 건너간다 → 그쪽은 그림이 없다
- 주소창에 `/film/<id>/order/done` 을 직접 친다 → 영상 단계로 되돌려진다
- `/film/one/order?id=<id>` → 옛 화면이 그대로 뜬다

- [ ] **Step 7: 커밋**

```bash
git add "app/archive/[id]/page.js" tests/film-archive.test.js
git commit -m "feat(film): 보관함에서 단계별 흐름으로 들어간다"
```

---

## 자기 점검 결과

**스펙 덮개** — 스펙의 절이 전부 태스크에 걸린다: §1 주소 → Task 1·2, §2 기존 자산 → Task 1·3, §3 화면 → Task 3·4·7, §4 선택 재생성(함정 셋 포함) → Task 5·6·7, §5 시험 → 각 태스크의 Step 1 과 Task 7 Step 4(그물 등록)·Task 8 Step 5(굽기).

**남는 위험 둘**
- `tests/film-routes.test.js` 의 헬퍼 이름(`seedFilmProject`·`POST_IMAGES`)은 실제 파일을 열어 확인해야 한다. 다르면 그 파일이 쓰는 방식을 그대로 따른다.
- 화면 시험이 소스 문자열 검사라 약하다. 그래서 Task 2·4·7·8 에 **굽기**를 넣었고, Task 8 에 손으로 지나가는 절차를 두었다. 이 저장소는 1720 그린인 채 앱이 안 뜬 적이 있다.
