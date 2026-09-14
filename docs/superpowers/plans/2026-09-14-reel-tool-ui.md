# 단계별 만들기 도구형 화면 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단계별 영상 화면(`/reel/[id]/*`)을 **왼쪽 설정 패널 + 오른쪽 누적 작업대**로 바꾼다.

**Architecture:** 라우팅·단계 표·낡음 판정은 **손대지 않는다.** 지금도 `app/reel/[id]/layout.js`
가 단계 페이지들을 감싸고 라우팅을 지키므로, 그 자리에 껍데기 둘(설정 패널 · 누적 카드 틀)을
더하고 각 단계 페이지를 **카드 안에 그대로 꽂는다.** 설정의 잠금은 새 상태를 만들지 않고
`isReelStepReachable` 이 쓰는 신호(시나리오 확정 · 첫 그림 · 첫 클립)에서 파생한다.

**Tech Stack:** Next.js 15 App Router(클라이언트 부품) · React · vitest · 순수 JS(타입 없음).
스타일은 `app/globals.css` 한 파일, 색은 `:root` 토큰.

**Spec:** `docs/superpowers/specs/2026-09-14-reel-tool-ui-design.md`

## Global Constraints

이 저장소의 판이 실제로 잡는 것들이다. **모든 태스크에 적용된다.**

- **색**: `:root` 밖에 hex 리터럴 금지. 앱층 규칙에서 `var(--accent)` 금지(면제는 `.side-step.on` 과 `.home` 뿌리 아래뿐).
- **글자**: `font-size` 는 `12px·14px·16px·18px·30px` 만. `font-weight` 는 `400·600·700` 만.
- **모서리**: `border-radius` 는 `var(--r-card)·var(--r-ctl)·var(--r-pill)·50%·0` 만.
- **그라디언트 금지**: 허용 목록은 `.home .stage-cut::after` 하나뿐(`tests/design-system.test.js`).
- **값은 한 곳에서**: 가격은 `lib/pricing.js`, 단계는 `lib/reel/steps.js`, 비율은 `lib/aspects.js`.
  화면에 숫자를 새로 적지 않는다.
- **테스트**: `npx vitest run` 전부 그린이어야 한다(지금 6,141개).
- **굽기**: 화면 파일을 고쳤으면 한 번 굽는다. 단 dev 서버가 떠 있으면 `.next` 가 덮여 죽으므로
  **테스트 그린 + 화면 200** 으로 갈음한다(`CLAUDE.md`).
- **커밋**: 한국어 메시지 + 아래 두 줄을 끝에 붙인다.
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
  ```
- **푸시·배포는 하지 않는다.** 사장님이 요청할 때만.

## 이 계획에서 **뺀 것** (스펙에서 줄어든 자리)

**[나머지는 알아서 끝내기] 문은 이번에 만들지 않는다.** 스펙에는 "자동 관통(`lib/auto.js`)을
그대로 부른다"고 적었는데, 코드를 확인하니 **`lib/auto.js` 는 옛 단계별 흐름(`lib/steps.js`)용**
이고 reel 에는 자동 관통 라우트가 없다(`app/api/reel/[id]/` 에 `auto` 없음).
껍데기 작업이 아니라 **파이프라인을 새로 만드는 일**이라 별도 스펙·계획이 필요하다.
→ 스펙의 해당 절에 이 사실을 적어 두고, 이번 계획은 화면 껍데기까지만 한다.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/reel/locks.js` (신설) | 축별 잠금 판정. **순수 함수 하나**, import 0 |
| `app/api/reel/[id]/settings/route.js` (신설) | 열린 축만 저장하는 PATCH. 잠긴 축은 409 |
| `components/reel/SettingsPanel.jsx` (신설) | 설정 패널 부품. 값·잠금·정가를 그리고 열린 축을 고친다 |
| `components/reel/StepStack.jsx` (신설) | 누적 카드 틀. 접힌 머리줄 + 펼친 자리(children) |
| `app/reel/[id]/layout.js` (수정) | 둘을 좌우로 배치. 라우팅 가드는 그대로 |
| `components/Sidebar.jsx` (수정) | reel 스테퍼 제거 · 두 항목에 한 줄 설명 |
| `app/home/page.js` (수정) | 랜딩 원클릭 문구를 사실로 |
| `app/globals.css` (수정) | 패널·작업대 규칙 |

---

### Task 1: 잠금 판정 (`lib/reel/locks.js`)

**Files:**
- Create: `lib/reel/locks.js`
- Test: `tests/reel-locks.test.js`

**Interfaces:**
- Consumes: 없음(순수 함수, import 0)
- Produces: `lockedAxes(project)` → 축 이름 다섯을 키로 갖는 객체.
  각 값은 `{ locked: boolean, reason: string }`. 축 이름은
  `aspect_ratio` · `target_seconds` · `style` · `i2v_model` · `resolution`
  (프로젝트 문서의 `settings` 필드 이름 그대로다 — 화면과 라우트가 같은 말을 쓴다).

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/reel-locks.test.js`:

```js
// 설정은 **돈을 치른 순간** 잠긴다 — 값이 컷마다 각인돼 있어서, 바꾸면 이미 만든 것이 낡는다.
// ★ 새 상태를 만들지 않는다: 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과 같다.
import { describe, it, expect } from "vitest";
import { lockedAxes } from "../lib/reel/locks.js";

const p = (extra = {}) => ({ id: "p1", settings: {}, ...extra });
const cut = (extra = {}) => ({ idx: 0, shows: "장면", ...extra });

describe("lockedAxes — 축마다 잠기는 때가 다르다", () => {
  it("아무것도 안 만들었으면 다 열려 있다", () => {
    const l = lockedAxes(p());
    for (const k of ["aspect_ratio", "target_seconds", "style", "i2v_model", "resolution"]) {
      expect(l[k].locked, `${k} 가 잠겨 있다`).toBe(false);
      expect(l[k].reason).toBe("");
    }
  });

  it("★ 시나리오를 확정하면 비율·길이가 잠긴다 — 컷 구조가 그 값에서 나왔다", () => {
    const l = lockedAxes(p({ scenario: { text: "A 15-second commercial." } }));
    expect(l.aspect_ratio.locked).toBe(true);
    expect(l.aspect_ratio.reason).toBe("시나리오를 확정해서 잠겼어요");
    expect(l.target_seconds.locked).toBe(true);
    // 그림·클립은 아직 없으므로 나머지는 열려 있다
    expect(l.style.locked).toBe(false);
    expect(l.i2v_model.locked).toBe(false);
  });

  it("★ 첫 그림을 그리면 화풍이 잠긴다", () => {
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "/api/uploads/a.jpg" } }), cut({ idx: 1 })],
    }));
    expect(l.style.locked).toBe(true);
    expect(l.style.reason).toBe("첫 그림을 그려서 잠겼어요");
    expect(l.i2v_model.locked, "클립이 없는데 모델이 잠겼다").toBe(false);
  });

  it("★★ 첫 클립을 구우면 모델·화질이 잠긴다 — 여기서부터 돈이 크게 나간다", () => {
    const l = lockedAxes(p({
      scenario: { text: "t" },
      cuts: [cut({ image: { url: "a" }, video: { url: "v" } })],
    }));
    expect(l.i2v_model.locked).toBe(true);
    expect(l.i2v_model.reason).toBe("첫 컷을 만들어 잠겼어요");
    expect(l.resolution.locked).toBe(true);
  });

  it("문서가 없거나 이상해도 던지지 않는다 — 화면이 죽으면 안 된다", () => {
    for (const bad of [null, undefined, {}, { cuts: null }]) {
      expect(() => lockedAxes(bad)).not.toThrow();
      expect(lockedAxes(bad).style.locked).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-locks.test.js`
Expected: FAIL — `Failed to resolve import "../lib/reel/locks.js"`

- [ ] **Step 3: 최소 구현**

`lib/reel/locks.js`:

```js
// 설정이 **언제 잠기나** — 한 곳에서 판정한다.
//
// ★★ 새 상태를 만들지 않는다. 여기서 보는 신호는 lib/reel/steps.js 의 도달 판정이 쓰는 것과
//   글자 그대로 같다(scenario.text · cuts[].image.url · cuts[].video.url). 잠금을 위해 문서에
//   플래그를 더하면, 그 플래그와 실제 산출물이 갈리는 날 화면이 거짓말을 한다.
//
// ★ 왜 잠그나: 이 값들은 컷마다 **각인**(`of`)돼 있다(lib/steps.js 하단). 바꾸면 이미 만든
//   산출물이 낡고, 다시 만들면 그만큼 다시 청구된다. 열어 두면 사장님이 모르는 새 재구매다.
//
// ★ 이 파일은 화면("use client")에서도 import 된다 — **import 를 두지 마라.**

const NOT_LOCKED = { locked: false, reason: "" };
const lock = (on, reason) => (on ? { locked: true, reason } : NOT_LOCKED);

export function lockedAxes(project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const scenarioDone = !!project?.scenario?.text;
  const drawn = cuts.some((c) => !!c?.image?.url);
  const baked = cuts.some((c) => !!c?.video?.url);

  const byScenario = lock(scenarioDone, "시나리오를 확정해서 잠겼어요");
  const byClip = lock(baked, "첫 컷을 만들어 잠겼어요");
  return {
    aspect_ratio: byScenario,
    target_seconds: byScenario,
    style: lock(drawn, "첫 그림을 그려서 잠겼어요"),
    i2v_model: byClip,
    resolution: byClip,
  };
}

// 화면이 "이 축을 지금 고칠 수 있나"만 묻는 자리 — 라우트도 같은 함수를 쓴다.
export function isAxisOpen(project, axis) {
  const l = lockedAxes(project)[axis];
  return !!l && !l.locked;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/reel-locks.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/reel/locks.js tests/reel-locks.test.js
git commit -m "$(cat <<'EOF'
feat(reel): 설정 잠금 판정 — 돈 치른 축만 잠근다

새 상태를 만들지 않는다. 도달 판정이 쓰는 신호(시나리오 확정·첫 그림·첫 클립)에서
그대로 파생한다 — 플래그를 따로 두면 실제 산출물과 갈리는 날 화면이 거짓말을 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 2: 설정을 고치는 문 (`app/api/reel/[id]/settings/route.js`)

**Files:**
- Create: `app/api/reel/[id]/settings/route.js`
- Test: `tests/reel-settings-route.test.js`

**Interfaces:**
- Consumes: `lockedAxes` (Task 1) · `withUser`(`lib/auth/require-user.js`) ·
  `getProject`·`updateProject`(`lib/projects.js`) · `ASPECTS`(`lib/aspects.js`) ·
  `TARGET_CHOICES`(`lib/script.js`) · `isResolutionFor`·`reelAllowsModel`(`lib/clip-limits.js`)
- Produces: `PATCH /api/reel/<id>/settings` — 몸통 `{ aspect_ratio?, target_seconds?, i2v_model?, resolution?, style? }`.
  성공 `200 { settings }` · 잠긴 축 `409 { error }` · 모르는 값 `400 { error }`.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/reel-settings-route.test.js`:

```js
// 열린 축만 고칠 수 있다. **잠긴 축은 라우트가 막는다** — 화면만 막으면 주소로 부르면 뚫린다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
import { PATCH } from "../app/api/reel/[id]/settings/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const headers = { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json" };
const req = (body) => new Request("http://localhost/api/reel/x/settings", { method: "PATCH", headers, body: JSON.stringify(body) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function makeReel(extra = {}) {
  return projects.createProject({
    ownerId: A, kind: "reel",
    settings: { aspect_ratio: "9:16", target_seconds: 15, i2v_model: "seedance-2.0", resolution: "720p", style: "photo" },
    material: { text: "자료", photos: [] },
    ...extra,
  });
}

beforeEach(() => resetMemoryStore());

describe("PATCH /api/reel/[id]/settings", () => {
  it("열린 축은 저장된다", async () => {
    const p = await makeReel();
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.target_seconds).toBe(30);
  });

  it("★★ 잠긴 축은 409 다 — 화면이 아니라 여기가 문지기다", async () => {
    const p = await makeReel();
    await projects.updateProject(p.id, A, (d) => ({ ...d, scenario: { text: "확정된 시나리오" } }));
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("시나리오를 확정해서");
    const after = await projects.getProject(p.id, A);
    expect(after.settings.target_seconds, "막았는데 저장됐다").toBe(15);
  });

  it("모르는 값은 400 이다 — 목록 밖 비율·길이·화질", async () => {
    const p = await makeReel();
    for (const body of [{ aspect_ratio: "3:2" }, { target_seconds: 17 }, { resolution: "4K" }]) {
      const res = await PATCH(req(body), ctx(p.id));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("남의 영상은 못 고친다", async () => {
    const p = await makeReel();
    const other = { ...headers, [USER_HEADER]: "00000000-0000-4000-8000-00000000000b" };
    const res = await PATCH(
      new Request("http://localhost/api/reel/x/settings", { method: "PATCH", headers: other, body: JSON.stringify({ target_seconds: 30 }) }),
      ctx(p.id)
    );
    expect([403, 404]).toContain(res.status);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-settings-route.test.js`
Expected: FAIL — `Failed to resolve import ".../settings/route.js"`

- [ ] **Step 3: 최소 구현**

`app/api/reel/[id]/settings/route.js`:

```js
// 설정을 고치는 유일한 문 — **열린 축만** 받는다.
//
// ★★ 문지기는 화면이 아니라 여기다. 화면에서 칩을 회색으로 칠하는 것은 예의이고, 주소로
//   직접 부르면 뚫린다. 잠금 판정은 lib/reel/locks.js 하나를 화면과 함께 쓴다.
// ★ 값 검증은 **기존 표**를 그대로 쓴다 — 목록을 여기에 다시 적으면 두 벌이 된다.
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { lockedAxes } from "../../../../../lib/reel/locks.js";
import { ASPECTS } from "../../../../../lib/aspects.js";
import { TARGET_CHOICES } from "../../../../../lib/script.js";
import { STYLES } from "../../../../../lib/styles.js";
import { isResolutionFor, reelAllowsModel } from "../../../../../lib/clip-limits.js";

const ok = (v, list) => list.some((x) => (typeof x === "object" ? x.id === v : x === v));

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "없는 영상이에요" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const locks = lockedAxes(project);
  const next = {};

  for (const [axis, value] of Object.entries(body)) {
    if (!(axis in locks)) continue; // 모르는 축은 조용히 흘린다(옛 화면이 보낸 값일 수 있다)
    if (locks[axis].locked) {
      return Response.json({ error: locks[axis].reason }, { status: 409 });
    }
    if (axis === "aspect_ratio" && !ok(value, ASPECTS)) return Response.json({ error: "그런 비율은 없어요" }, { status: 400 });
    if (axis === "target_seconds" && !TARGET_CHOICES.includes(value)) return Response.json({ error: "그런 길이는 없어요" }, { status: 400 });
    if (axis === "style" && !ok(value, STYLES)) return Response.json({ error: "그런 화풍은 없어요" }, { status: 400 });
    if (axis === "i2v_model" && !reelAllowsModel(project?.settings?.tier, value)) {
      return Response.json({ error: "지금 등급에서 못 쓰는 모델이에요" }, { status: 400 });
    }
    if (axis === "resolution" && !isResolutionFor(value, { settings: { i2v_model: body.i2v_model || project?.settings?.i2v_model } })) {
      return Response.json({ error: "그 모델에서 못 쓰는 화질이에요" }, { status: 400 });
    }
    next[axis] = value;
  }

  if (Object.keys(next).length === 0) return Response.json({ error: "고칠 값이 없어요" }, { status: 400 });

  // ★ 길이는 이름이 둘이다 — target_seconds(정가·청구)와 seconds(시나리오 생성).
  //   한쪽만 고치면 값이 갈린다(app/api/reel/route.js 의 주석과 같은 이유).
  const merged = { ...next, ...(next.target_seconds ? { seconds: next.target_seconds } : {}) };
  const saved = await updateProject(id, user.id, (d) => ({ ...d, settings: { ...d.settings, ...merged } }));
  return Response.json({ settings: saved.settings });
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/reel-settings-route.test.js`
Expected: PASS (4 tests)

⚠️ `reelAllowsModel`·`isResolutionFor`·`STYLES` 의 정확한 이름은 구현 직전에 확인한다
(`grep -n "export" lib/clip-limits.js lib/styles.js`). 이름이 다르면 **판을 고치지 말고
import 를 고친다** — 판이 재는 것은 동작이다.

- [ ] **Step 5: 커밋**

```bash
git add app/api/reel/\[id\]/settings/route.js tests/reel-settings-route.test.js
git commit -m "$(cat <<'EOF'
feat(reel): 설정을 고치는 문 — 열린 축만, 잠긴 축은 409

문지기는 화면이 아니라 라우트다. 화면에서 칩을 회색으로 칠하는 것은 예의이고,
주소로 직접 부르면 뚫린다. 값 검증은 기존 표(ASPECTS·TARGET_CHOICES·STYLES)를
그대로 쓴다 — 목록을 라우트에 다시 적으면 두 벌이 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 3: 설정 패널 부품 (`components/reel/SettingsPanel.jsx`)

**Files:**
- Create: `components/reel/SettingsPanel.jsx`
- Modify: `app/globals.css` (패널 규칙 추가)
- Test: `tests/reel-settings-panel-ui.test.js`

**Interfaces:**
- Consumes: `lockedAxes`(Task 1) · `PATCH /api/reel/<id>/settings`(Task 2) ·
  `videoPrice`(`lib/pricing.js`) · `ASPECTS`·`TARGET_CHOICES`·`STYLES` · `useReelProject`
- Produces: `<SettingsPanel />` — props 없음(공유본에서 프로젝트를 읽는다).
  Task 5 의 layout 이 이것을 왼쪽 칸에 그린다.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/reel-settings-panel-ui.test.js`:

```js
// 이 저장소의 화면 계약은 **소스 문자열**로 잰다(렌더 테스트 인프라가 없다).
// 그래서 단정은 "이름이 적혀 있나"가 아니라 "코드가 그렇게 생겼나"를 본다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/reel/SettingsPanel.jsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("설정 패널", () => {
  it("★★★ 잠금은 **한 곳**에서 판정한다 — 화면이 신호를 다시 읽지 않는다", () => {
    expect(code, "lockedAxes 를 안 쓴다").toMatch(/lockedAxes\s*\(/);
    expect(code, "화면이 잠금 신호를 직접 읽는다 — 판정이 두 벌이 된다")
      .not.toMatch(/scenario\?\.text|image\?\.url|video\?\.url/);
  });

  it("★★★ 값 목록을 손으로 적지 않는다 — 표에서 온다", () => {
    for (const t of ["ASPECTS", "TARGET_CHOICES", "STYLES"]) {
      expect(code, `${t} 를 안 읽는다`).toContain(t);
    }
    expect(code, "화면에 초 숫자를 손으로 적었다").not.toMatch(/["'`]15초["'`]/);
  });

  it("★★ 정가는 가격표가 낸다 — 화면이 계산하지 않는다", () => {
    expect(code, "videoPrice 를 안 쓴다").toMatch(/videoPrice\s*\(/);
    expect(code, "화면에 크레딧 숫자를 손으로 적었다").not.toMatch(/\b\d{2,3}\s*크레딧/);
  });

  it("★★ 잠긴 축은 **값이 계속 보인다** — 무엇으로 만들었는지가 사라지면 안 된다", () => {
    expect(code, "잠기면 통째로 감춘다").not.toMatch(/locked\s*&&\s*null/);
    expect(code, "잠긴 이유를 안 보여 준다").toMatch(/\.reason/);
  });

  it("열린 축을 고치면 그 문으로 보낸다", () => {
    expect(code, "설정 문을 안 부른다").toMatch(/\/settings["'`]/);
    expect(code, "PATCH 가 아니다").toMatch(/method:\s*["'`]PATCH["'`]/);
  });

  it("규칙: 색·치수는 토큰이다", () => {
    const rules = css.slice(css.indexOf(".rp-panel"));
    expect(rules.slice(0, rules.indexOf("/* ──")), "hex 를 적었다").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-settings-panel-ui.test.js`
Expected: FAIL — `ENOENT: components/reel/SettingsPanel.jsx`

- [ ] **Step 3: 최소 구현**

`components/reel/SettingsPanel.jsx` — 뼈대(값·잠금·정가·저장):

```jsx
"use client";
// 이 영상의 설정 — **늘 보인다.**
//
// ★★ 잠금은 lib/reel/locks.js 하나가 판정한다. 여기서 scenario.text 나 cuts[].image.url 을
//   다시 읽지 마라 — 그 순간 판정이 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
// ★★ 목록(비율·길이·화풍)과 가격은 **표에서 온다.** 화면에 숫자를 적으면 값이 갈린다.
// ★ 잠긴 축도 **값은 보여 준다** — 무엇으로 만들었는지가 화면에서 사라지면 안 된다.
import { useState } from "react";
import { useReelProject } from "../ReelProjectContext";
import { lockedAxes } from "../../lib/reel/locks.js";
import { ASPECTS } from "../../lib/aspects.js";
import { TARGET_CHOICES } from "../../lib/script.js";
import { STYLES } from "../../lib/styles.js";
import { videoPrice } from "../../lib/pricing.js";

export default function SettingsPanel() {
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState(false);
  if (!project) return null;

  const s = project.settings || {};
  const locks = lockedAxes(project);
  const price = videoPrice(s.target_seconds, s.i2v_model, s.resolution);

  async function change(axis, value) {
    if (locks[axis].locked || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reel/${project.id}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [axis]: value }),
      });
      if (res.ok) await reload(project.id);
    } finally {
      setBusy(false);
    }
  }

  const Chips = ({ axis, items, value, label }) => (
    <div className={`rp-field${locks[axis].locked ? " is-locked" : ""}`}>
      <div className="rp-lab">
        {label}
        {locks[axis].locked && <span className="rp-lockmark">잠김</span>}
      </div>
      <div className="rp-chips">
        {items.map((it) => {
          const id = typeof it === "object" ? it.id : it;
          const text = typeof it === "object" ? `${it.label} ${it.id}` : `${it}초`;
          return (
            <button
              key={id}
              type="button"
              className={`rp-chip${id === value ? " on" : ""}`}
              disabled={locks[axis].locked || busy}
              onClick={() => change(axis, id)}
            >
              {text}
            </button>
          );
        })}
      </div>
      {locks[axis].locked && <p className="rp-why">{locks[axis].reason}</p>}
    </div>
  );

  return (
    <aside className="rp-panel">
      <div className="rp-head">이 영상의 설정</div>
      <div className="rp-body">
        <Chips axis="aspect_ratio" items={ASPECTS} value={s.aspect_ratio} label="비율" />
        <Chips axis="target_seconds" items={TARGET_CHOICES} value={s.target_seconds} label="길이" />
        <Chips axis="style" items={STYLES} value={s.style} label="화풍" />
      </div>
      <div className="rp-foot">
        <span className="rp-price">{price} 크레딧</span>
      </div>
    </aside>
  );
}
```

`app/globals.css` 끝에 규칙을 더한다(색·치수는 토큰만):

```css
/* ── 단계별 설정 패널 (2026-09-14) ───────────────────────────────────────
   이 영상이 무엇으로 만들어지는지 늘 보이는 자리. 잠긴 축도 값은 남는다. */
.rp-panel { display: flex; flex-direction: column; background: var(--surface);
  border-radius: var(--r-card); box-shadow: var(--ring), var(--lift); overflow: hidden; }
.rp-head { padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 600; }
.rp-body { padding: 14px; display: flex; flex-direction: column; gap: 14px; }
.rp-field { display: flex; flex-direction: column; gap: 7px; }
.rp-lab { font-size: 12px; font-weight: 600; color: var(--ink-soft); display: flex; justify-content: space-between; }
.rp-lockmark { font-size: 12px; font-weight: 400; color: var(--ink-faint); }
.rp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rp-chip { font-size: 12px; padding: 5px 11px; border-radius: var(--r-pill); border: 0;
  background: var(--surface); color: var(--ink-soft); box-shadow: var(--ring); cursor: pointer; }
.rp-chip.on { background: var(--ink); color: var(--bg); box-shadow: none; font-weight: 600; }
.rp-chip:disabled { cursor: default; }
.rp-field.is-locked .rp-chips { opacity: .72; }
.rp-why { margin: 0; font-size: 12px; color: var(--ink-faint); }
.rp-foot { margin-top: auto; padding: 12px 14px; border-top: 1px solid var(--line); }
.rp-price { font-size: 14px; font-weight: 600; }
```

⚠️ 칩의 고른 상태는 `--ink`(검정)다 — 앱층에서 `--accent` 는 사이드바 스테퍼의 몫이라
판이 막는다(`tests/design-system.test.js`).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/reel-settings-panel-ui.test.js tests/design-system.test.js`
Expected: PASS (둘 다)

- [ ] **Step 5: 커밋**

```bash
git add components/reel/SettingsPanel.jsx app/globals.css tests/reel-settings-panel-ui.test.js
git commit -m "$(cat <<'EOF'
feat(reel): 설정 패널 — 값·잠금·정가를 늘 보여 준다

잠금은 lib/reel/locks.js 하나가 판정하고, 목록과 가격은 표에서 온다.
잠긴 축도 값은 남긴다 — 무엇으로 만들었는지가 화면에서 사라지면 안 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 4: 누적 작업대 틀 (`components/reel/StepStack.jsx`)

**Files:**
- Create: `components/reel/StepStack.jsx`
- Modify: `app/globals.css`
- Test: `tests/reel-step-stack-ui.test.js`

**Interfaces:**
- Consumes: `REEL_STEPS`·`isReelStepReachable`·`currentReelStepKey`·`reelStepHref`(`lib/reel/steps.js`) · `useReelProject`
- Produces: `<StepStack>{children}</StepStack>` — 지금 단계 자리에 `children`(단계 페이지)을 꽂는다.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/reel-step-stack-ui.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/reel/StepStack.jsx", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("누적 작업대", () => {
  it("★★★ 단계 표를 **하나만** 본다 — 목록을 손으로 적지 않는다", () => {
    expect(code, "REEL_STEPS 를 안 읽는다").toMatch(/REEL_STEPS/);
    expect(code, "단계 이름을 화면에 손으로 적었다").not.toMatch(/["'`](시나리오|이미지 생성|영상 프롬프트)["'`]/);
  });

  it("★★★ 못 가는 단계는 열지 않는다 — 가드와 같은 판정을 쓴다", () => {
    expect(code, "isReelStepReachable 을 안 쓴다").toMatch(/isReelStepReachable\s*\(/);
  });

  it("★★ 지금 단계에만 children 을 꽂는다 — 끝난 단계는 접힌 머리줄뿐", () => {
    expect(code, "children 을 안 받는다").toMatch(/\{\s*children\s*\}/);
    expect(code, "현재 단계 판정을 안 쓴다").toMatch(/currentReelStepKey|reelStepFromPathname/);
  });

  it("끝난 단계는 그 단계 주소로 간다", () => {
    expect(code, "reelStepHref 를 안 쓴다").toMatch(/reelStepHref\s*\(/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-step-stack-ui.test.js`
Expected: FAIL — `ENOENT: components/reel/StepStack.jsx`

- [ ] **Step 3: 최소 구현**

`components/reel/StepStack.jsx`:

```jsx
"use client";
// 작업대 — 끝난 단계는 **접혀서 쌓이고** 지금 단계만 펼쳐진다.
//
// ★★ 단계 목록·도달 판정은 lib/reel/steps.js 하나를 본다. 여기서 이름을 손으로 적으면
//   가드가 닫는 문과 화면이 여는 문이 갈린다(2026-08-13 에 겪은 결함과 같은 모양).
// ★ 접힌 머리줄의 한 줄 요약은 **문서에서 파생**한다 — 새 저장 값을 만들지 않는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReelProject } from "../ReelProjectContext";
import {
  REEL_STEPS, isReelStepReachable, currentReelStepKey, reelStepHref, reelStepFromPathname,
} from "../../lib/reel/steps.js";

function summary(key, project) {
  const cuts = project?.cuts || [];
  if (key === "material") {
    const photos = project?.material?.photos?.length || 0;
    return [project?.material?.text?.slice(0, 40), photos ? `사진 ${photos}장` : null].filter(Boolean).join(" · ");
  }
  if (key === "scenario") return project?.scenario?.text ? `장면 ${cuts.length || 0}개` : "";
  if (key === "images") return cuts.length ? `컷 ${cuts.filter((c) => c?.image?.url).length}/${cuts.length}` : "";
  return "";
}

export default function StepStack({ children }) {
  const pathname = usePathname();
  const { project } = useReelProject();
  if (!project) return children;

  const here = reelStepFromPathname(pathname)?.key || currentReelStepKey(project);

  return (
    <div className="rs-stack">
      {REEL_STEPS.map((step) => {
        const open = step.key === here;
        const reachable = isReelStepReachable(step.key, project);
        const cls = `rs-card${open ? " is-open" : ""}${reachable ? "" : " is-todo"}`;
        return (
          <section className={cls} key={step.key}>
            {open ? (
              <>
                <div className="rs-hd"><span className="rs-no">{step.no}</span><b>{step.label}</b></div>
                <div className="rs-bd">{children}</div>
              </>
            ) : reachable ? (
              <Link className="rs-hd" href={reelStepHref(step, project.id)}>
                <span className="rs-no">{step.no}</span><b>{step.label}</b>
                <span className="rs-sum">{summary(step.key, project)}</span>
              </Link>
            ) : (
              <div className="rs-hd"><span className="rs-no">{step.no}</span><b>{step.label}</b></div>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

`app/globals.css`:

```css
/* ── 단계별 작업대 — 끝난 단계는 접혀 쌓인다 (2026-09-14) ───────────── */
.rs-stack { display: flex; flex-direction: column; gap: 10px; }
.rs-card { background: var(--surface); border-radius: var(--r-card); box-shadow: var(--ring), var(--lift); overflow: hidden; }
.rs-card.is-open { box-shadow: var(--ring), var(--elevate); }
.rs-card.is-todo { opacity: .5; }
.rs-hd { display: flex; align-items: center; gap: 10px; padding: 12px 14px; font-size: 14px; text-decoration: none; color: inherit; }
.rs-no { font-size: 12px; color: var(--ink-faint); }
.rs-sum { font-size: 12px; color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-bd { padding: 0 14px 14px; border-top: 1px solid var(--line); padding-top: 12px; }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/reel-step-stack-ui.test.js tests/design-system.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/reel/StepStack.jsx app/globals.css tests/reel-step-stack-ui.test.js
git commit -m "$(cat <<'EOF'
feat(reel): 누적 작업대 — 끝난 단계는 접혀서 쌓인다

단계 목록·도달 판정은 lib/reel/steps.js 하나를 본다. 접힌 머리줄의 한 줄 요약은
문서에서 파생한다 — 새 저장 값을 만들지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 5: 배치 (`app/reel/[id]/layout.js`)

**Files:**
- Modify: `app/reel/[id]/layout.js:60-76`(반환부)
- Modify: `app/globals.css`
- Test: `tests/reel-workbench-layout.test.js`

**Interfaces:**
- Consumes: `<SettingsPanel />`(Task 3) · `<StepStack>`(Task 4)
- Produces: 화면 구조 `.rw-grid`(왼쪽 패널 · 오른쪽 작업대). 단계 페이지는 그대로 `children`.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/reel-workbench-layout.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/reel/[id]/layout.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("단계별 작업 화면 배치", () => {
  it("★★★ 라우팅 가드는 그대로다 — 이번 작업은 껍데기뿐이다", () => {
    expect(code, "가드가 사라졌다").toMatch(/isReelStepReachable\s*\(/);
    expect(code, "현재 단계로 되돌리는 갈래가 사라졌다").toMatch(/router\.replace\(/);
  });

  it("★★ 설정 패널과 작업대를 함께 그린다", () => {
    expect(code).toMatch(/<SettingsPanel\s*\/>/);
    expect(code).toMatch(/<StepStack>[\s\S]*\{children\}[\s\S]*<\/StepStack>/);
  });

  it("★★ 좁은 화면에서는 위아래로 쌓인다 — 가로 스크롤을 만들지 않는다", () => {
    const at = css.indexOf(".rw-grid");
    expect(at, ".rw-grid 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(at, at + 400), "두 칸으로 안 눕는다").toMatch(/grid-template-columns/);
    expect(css, "좁은 화면 규칙이 없다").toMatch(/@media[^{]*max-width[^{]*\{[\s\S]*?\.rw-grid/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-workbench-layout.test.js`
Expected: FAIL — `<SettingsPanel />` 을 못 찾는다

- [ ] **Step 3: 최소 구현**

`app/reel/[id]/layout.js` 의 반환부만 바꾼다(가드·오류 갈래는 그대로 둔다):

```jsx
  return (
    <div className="rw-grid">
      <SettingsPanel />
      <div className="rw-work">
        <StepStack>{children}</StepStack>
      </div>
    </div>
  );
```

파일 맨 위에 import 둘을 더한다:

```js
import SettingsPanel from "../../../components/reel/SettingsPanel";
import StepStack from "../../../components/reel/StepStack";
```

`app/globals.css`:

```css
/* 단계별 작업 화면 — 왼쪽 설정, 오른쪽 작업대 (2026-09-14) */
.rw-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: var(--sp-5); align-items: start; }
.rw-work { min-width: 0; }
@media (max-width: 900px) {
  .rw-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. 그리고 dev 서버에서 `/reel/<id>/scenario` 가 **200** 인지 본다
(`curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/reel/<id>/scenario`).

- [ ] **Step 5: 커밋**

```bash
git add app/reel/\[id\]/layout.js app/globals.css tests/reel-workbench-layout.test.js
git commit -m "$(cat <<'EOF'
feat(reel): 단계별 화면을 설정 패널 + 작업대로 배치

라우팅 가드는 손대지 않았다 — 이번 작업은 껍데기뿐이고, 단계 페이지는 작업대
카드 안에 그대로 꽂힌다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 6: 사이드바 — reel 스테퍼를 걷고 한 줄을 붙인다

**Files:**
- Modify: `components/Sidebar.jsx`(`ReelStepList` 정의와 그 호출 한 곳, 그리고 두 항목)
- Test: `tests/sidebar-reel-steps-removed.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: 사이드바에서 reel 단계 목록이 사라지고, 두 항목에 설명 한 줄이 붙는다.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/sidebar-reel-steps-removed.test.js`:

```js
// 같은 말이 두 곳에 있으면 언젠가 한쪽만 고쳐진다. 단계는 이제 작업대가 말한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/Sidebar.jsx", "utf8");

describe("사이드바", () => {
  it("★★★ reel 단계 목록이 없다 — 작업대가 그 말을 한다", () => {
    expect(src, "ReelStepList 가 남아 있다").not.toMatch(/ReelStepList/);
  });

  it("★★★ 다른 흐름의 스테퍼는 **그대로 있다** — 같이 지우면 길을 잃는다", () => {
    expect(src, "광고 스테퍼가 사라졌다").toMatch(/adStepIndex/);
    expect(src, "film 스테퍼가 사라졌다").toMatch(/filmStepFromPathname/);
    expect(src, "옛 단계별 스테퍼가 사라졌다").toMatch(/stepsFor\s*\(/);
  });

  it("★★ 두 항목이 무엇을 해 주는지 한 줄로 말한다", () => {
    expect(src).toMatch(/손쉽게 한 번에/);
    expect(src).toMatch(/보면서 고쳐요/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/sidebar-reel-steps-removed.test.js`
Expected: FAIL — `ReelStepList 가 남아 있다`

- [ ] **Step 3: 최소 구현**

1. `components/Sidebar.jsx` 에서 `function ReelStepList(...)` 정의 전체와 `{inReel && <ReelStepList pathname={pathname} />}` 호출을 지운다.
   ★ 지운 자리에 **왜 지웠는지** 주석을 남긴다:
   ```jsx
   {/* ★★ 2026-09-14 — reel 단계 목록은 **작업대**가 말한다(components/reel/StepStack.jsx).
       같은 말이 두 곳에 있으면 언젠가 한쪽만 고쳐진다. 광고·film·옛 단계별 스테퍼는 그대로다. */}
   ```
2. 두 항목에 한 줄을 붙인다(문구는 **정해진 값** 그대로):
   ```jsx
   <span className="side-item-sub">손쉽게 한 번에</span>   {/* 원클릭 영상 */}
   <span className="side-item-sub">보면서 고쳐요</span>     {/* 단계별 영상 */}
   ```
3. `app/globals.css`:
   ```css
   .side-item-sub { display: block; font-size: 12px; color: var(--ink-faint); }
   ```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. ⚠️ 기존 사이드바 판(`tests/sidebar-*.test.js`)이 reel 스테퍼를 재고
있으면 **그 판도 이 회차의 계약으로 고친다** — 지우는 것이 아니라 "이제 작업대가 말한다"로 뒤집는다.

- [ ] **Step 5: 커밋**

```bash
git add components/Sidebar.jsx app/globals.css tests/sidebar-reel-steps-removed.test.js
git commit -m "$(cat <<'EOF'
refactor(sidebar): reel 단계 목록을 걷고 두 항목에 한 줄을 붙인다

단계는 이제 작업대가 말한다 — 같은 말이 두 곳에 있으면 한쪽만 고쳐진다.
광고·film·옛 단계별 스테퍼는 그대로 둔다(넷 중 하나만 걷는다).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

### Task 7: 랜딩의 원클릭 문구를 사실로

**Files:**
- Modify: `app/home/page.js`(두 갈래 절의 원클릭 카드)
- Test: `tests/landing-hero.test.js`(단정 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 랜딩이 지키지 못할 약속을 하지 않는다.

- [ ] **Step 1: 실패하는 판을 쓴다**

`tests/landing-hero.test.js` 의 "두 갈래 절" describe 에 더한다:

```js
  it("★★★ 지키지 못할 약속을 하지 않는다 — 원클릭도 시나리오에서 한 번 멈춘다", () => {
    // app/ads/[id]/page.js 의 실제 흐름: 입력 → 시나리오 확인 → [영상 만들기] → 완성.
    // 돈 나가는 버튼 앞이라 그 한 번은 있어야 하는 자리다. 그래서 문구를 사실로 맞춘다.
    expect(pageCode, "안 멈춘다고 약속한다").not.toMatch(/중간에 멈추는 곳이 없습니다/);
    expect(pageCode, "손쉬움으로 말하지 않는다").toMatch(/손쉽게/);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/landing-hero.test.js`
Expected: FAIL — `안 멈춘다고 약속한다`

- [ ] **Step 3: 최소 구현**

`app/home/page.js` 의 원클릭 카드 첫 줄을 바꾼다:

```jsx
<li><b>손쉽게 한 번에 만듭니다.</b> 시나리오만 한 번 보고 나머지는 맡기면 돼요.</li>
```

★ 같은 카드의 다른 줄과 뱃지("원클릭")는 건드리지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/landing-hero.test.js tests/home-sections-ui.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/home/page.js tests/landing-hero.test.js
git commit -m "$(cat <<'EOF'
fix(home): 원클릭 문구를 사실로 — 시나리오에서 한 번 멈춘다

랜딩이 "중간에 멈추는 곳이 없습니다"라고 약속했는데 app/ads/[id]/page.js 의
실제 흐름은 입력 → 시나리오 확인 → 영상이다. 돈 나가는 버튼 앞이라 그 멈춤은
있어야 하는 자리이므로, 흐름이 아니라 문구를 고친다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NNeMphbT6YCejdo1UPr2mF
EOF
)"
```

---

## 마무리 점검 (모든 태스크 뒤)

- [ ] `npx vitest run` — 전부 그린(종료코드 0). **파이프로 받지 마라** — `tail` 의 종료코드라 늘 0이다.
- [ ] dev 서버에서 `/reel/<id>/scenario`·`/reel/<id>/images` **200**, 랜딩 `/home` **200**
- [ ] 화면 파일을 고쳤으므로 **한 번 굽는다**(`npx next build`). dev 서버가 떠 있으면 굽지 말고
      위 두 줄(테스트 그린 + 화면 200)로 갈음한다 — `.next` 가 덮이면 돌던 서버가 죽는다
- [ ] `OUTSTANDING.md` 갱신 — 이 회차가 무엇을 바꿨고 무엇이 남았는지(자동 관통 문은 다음 회차)
- [ ] 푸시·배포는 **하지 않는다**(사장님 요청 시에만)

## 자체 점검 결과

**스펙 대조** — 스펙의 요구를 태스크에 하나씩 붙였다:
설정 패널(3) · 누적 작업대(4) · 배치(5) · 잠금 규칙(1·2·3) · 사이드바(6) · 랜딩 문구(7).
**하나가 빠졌다**: [나머지는 알아서 끝내기] — 위 「이 계획에서 뺀 것」에 이유를 적었다
(reel 에 자동 관통 라우트가 없다). 스펙에도 같은 사실을 적어 둔다.

**자리표시자 없음** — 모든 단계에 실제 코드가 들어 있다.

**이름 대조** — `lockedAxes` 는 Task 1 에서 정의하고 2·3 에서 같은 이름으로 쓴다. 축 이름은
문서의 `settings` 필드 이름(`aspect_ratio`·`target_seconds`·`style`·`i2v_model`·`resolution`)으로
통일했다 — 화면·라우트·판정이 같은 말을 쓴다.
