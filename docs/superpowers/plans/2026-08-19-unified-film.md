# 한 번에 굽는 영상 — 두 방식 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컷별 이미지를 먼저 만들어 확인하고 한 편을 통째로 굽는 경로를 만들되, 이미지를 모델에게 무엇이라고 말해 줄지를 **두 방식**(장면 순서 / 참고 그림)으로 갈라 같은 시나리오에서 비교할 수 있게 한다.

**Architecture:** 새 모듈 `lib/film/` 하나를 만들고, 시나리오·이미지·굽기·자막은 **이미 있는 것을 그대로 쓴다**. 두 방식의 차이는 `lib/film/mode.js` 한 파일에만 있다. 한 프로젝트가 두 방식으로 각각 구워 결과를 `films.order`·`films.refs` 두 벌로 남긴다.

**Tech Stack:** Next.js App Router · Supabase(문서는 `projects.doc` jsonb) · fal(`bytedance/seedance-2.0/reference-to-video`, `nano-banana-2/edit`) · vitest

**Spec:** `docs/superpowers/specs/2026-08-19-unified-film-design.md`

## Global Constraints

- 작업 디렉터리는 **`C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate`** 뿐이다. 메인 저장소 경로(`C:\Users\fixup\shotform-saas\lib\...`)를 쓰면 다른 세션 작업을 오염시킨다.
- **유료 API 실제 호출 금지.** 테스트는 전부 주입·가짜다. 실제 굽기는 사장님이 직접 한다.
- **git commit 은 하되 push 는 하지 않는다.** 배포는 사장님 요청 시에만.
- 주석은 한국어로, 이 저장소 문체(무엇을 했는지가 아니라 **왜 그렇게 했는지**)를 따른다.
- 화면 테스트는 렌더링 하네스가 없어 **소스를 읽어 판정**한다. 반드시 **주석을 걷어내고** 판정한다: `src.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1")` — 주석 속 낱말이 계약을 대신 통과시킨 사고가 반복됐다.
- 테스트 실행은 `npx vitest run`. **기준선 3,296 passed / 10 skipped, 실패 0.** 회귀 0 이어야 한다.
- 길이는 **15초**, 해상도는 **480p** 로 고정한다(방식을 재는 자리라 비싼 쪽을 쓸 이유가 없다).
- 방식 값은 `"order"` · `"refs"` 둘뿐이다. **모르는 값은 던진다** — 조용히 한쪽으로 떨어지면 사장님이 A 를 골랐는데 B 가 구워지고 그 실험은 못 쓰게 된다.

---

### Task 1: 두 방식이 갈리는 자리 — `lib/film/mode.js`

두 방식의 차이를 **여기 하나에** 모은다. 나중에 한 방식이 이기면 지울 자리가 한 곳이다.

**Files:**
- Create: `lib/film/mode.js`
- Test: `tests/film-mode.test.js`

**Interfaces:**
- Produces:
  - `FILM_MODES: [{ id: "order", label: "장면 순서", hint: string }, { id: "refs", label: "참고 그림", hint: string }]`
  - `isFilmMode(v) => boolean`
  - `filmMode(id) => { id, label, hint }` — 모르는 값이면 **throw**
  - `imagePlanFor(mode, scenario) => [{ key: string, prompt: string }]`
  - `attachClauseFor(mode) => string` (영어 한 문단)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-mode.test.js
import { describe, it, expect } from "vitest";
import { FILM_MODES, isFilmMode, filmMode, imagePlanFor, attachClauseFor } from "../lib/film/mode.js";

const SCENARIO = {
  text: "Vertical 9:16 ...",
  shots: [
    { beat: "가방에 달린 키링으로 시선을 끈다", camera: "slow push-in", lighting: "soft daylight", action: "keyring sways", line: "가방이 심심할 때 있잖아요", seconds: 5 },
    { beat: "손에 들어 크기를 보여준다", camera: "close-up", lighting: "window light", action: "hand lifts it", line: "얘를 데려왔어요", seconds: 5 },
    { beat: "가방에 달고 걸어 나간다", camera: "tracking", lighting: "golden hour", action: "walks out", line: "오늘부터 같이 다녀요", seconds: 5 },
  ],
};

describe("방식 표", () => {
  it("★ 방식은 둘뿐이다", () => {
    expect(FILM_MODES.map((m) => m.id)).toEqual(["order", "refs"]);
  });

  it("★ 모르는 방식은 던진다 — 조용히 떨어지면 고른 것과 다른 것이 구워진다", () => {
    expect(() => filmMode("nope")).toThrow();
    expect(isFilmMode("order")).toBe(true);
    expect(isFilmMode("nope")).toBe(false);
  });
});

describe("어떤 이미지를 만드는가", () => {
  it("★ 장면 순서 — 장면 수만큼 만든다", () => {
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan).toHaveLength(3);
    expect(plan[0].key).toBe("shot-1");
    // 그 장면의 말이 프롬프트에 실린다
    expect(plan[0].prompt).toContain("slow push-in");
    expect(plan[0].prompt).toContain("keyring sways");
  });

  it("★ 참고 그림 — 장면 수와 무관하게 축 셋이다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    expect(plan.map((p) => p.key)).toEqual(["subject", "person", "place"]);
  });

  it("★ 어느 방식이든 화면에 글자를 요구하지 않는다 — 자막은 우리가 태운다", () => {
    for (const mode of ["order", "refs"]) {
      for (const p of imagePlanFor(mode, SCENARIO)) {
        expect(p.prompt.toLowerCase()).toContain("no text");
      }
    }
  });

  it("★ 장면이 없으면 빈 계획이다 — 빈 프롬프트로 값을 치르지 않는다", () => {
    expect(imagePlanFor("order", { shots: [] })).toEqual([]);
  });
});

describe("그림을 뭐라고 부르는가", () => {
  it("★ 장면 순서 — 차례로 장면이라고 말한다", () => {
    expect(attachClauseFor("order")).toMatch(/in order|sequence/i);
  });

  it("★ 참고 그림 — 생김새 참조라고 말하고, 순서로 읽지 말라고 못 박는다", () => {
    const c = attachClauseFor("refs");
    expect(c).toMatch(/appearance|reference/i);
    expect(c).toMatch(/not.*(sequence|order)/i);
  });

  it("★ 둘이 서로 다른 말을 한다 — 같으면 실험이 성립하지 않는다", () => {
    expect(attachClauseFor("order")).not.toBe(attachClauseFor("refs"));
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-mode.test.js`
Expected: FAIL — `Cannot find module '../lib/film/mode.js'`

- [ ] **Step 3: 최소 구현**

```js
// lib/film/mode.js
// 두 방식이 갈리는 **유일한** 자리.
//
// ★ 왜 한 파일인가: 이 기능의 목적은 "어느 방식이 나은가"를 재는 것이고, 재고 나면 한쪽은
//   지운다. 차이가 여러 파일에 흩어져 있으면 어느 줄이 어느 방식의 것인지 구별이 안 된다.
// ★ r2v 가 이미지 순서를 보는지는 아무도 확인한 적이 없다. 그것이 이 실험의 축이다 —
//   코드가 미리 편들지 않는다.

export const FILM_MODES = [
  { id: "order", label: "장면 순서", hint: "그림이 차례로 장면이 돼요" },
  { id: "refs", label: "참고 그림", hint: "그림은 생김새만 알려 줘요" },
];

export function isFilmMode(v) {
  return FILM_MODES.some((m) => m.id === v);
}

// ★ 던진다. 모르는 값을 조용히 한쪽으로 떨어뜨리면 사장님이 고른 방식과 다른 것이
//   구워지고, 그 회차는 실험으로 못 쓴다 — 그런데 값은 이미 나갔다.
export function filmMode(id) {
  const m = FILM_MODES.find((x) => x.id === id);
  if (!m) throw new Error(`모르는 방식이에요: ${id}`);
  return m;
}

// 화면에 글자를 요구하지 않는다 — 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
// 자막은 우리가 ffmpeg 로 태운다(lib/compose.js).
const NO_TEXT = "No text or letters anywhere in the image.";

export function imagePlanFor(mode, scenario) {
  filmMode(mode);
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  if (!shots.length) return [];

  if (mode === "order") {
    // 장면마다 한 장. 그 장면이 적어 둔 말을 그대로 싣는다 — 시나리오가 이미 카메라·조명·
    // 동작을 정해 두었는데 여기서 새로 지어내면 두 벌이 된다.
    return shots.map((s, i) => ({
      key: `shot-${i + 1}`,
      prompt: [s.action, s.camera, s.lighting].filter(Boolean).join(". ") + `. ${NO_TEXT}`,
    }));
  }

  // 참고 그림 — 장면 수와 무관하게 축 셋이다. 무엇이 계속 같아야 하는가로 나눈다:
  // 물건 · 사람 · 자리. 장면 순서는 프롬프트(글)가 정한다.
  const all = shots.map((s) => [s.action, s.lighting].filter(Boolean).join(" ")).join(" ");
  return [
    { key: "subject", prompt: `A clean product shot of the subject described here: ${all}. ${NO_TEXT}` },
    { key: "person", prompt: `A portrait of the person appearing in this video: ${all}. ${NO_TEXT}` },
    { key: "place", prompt: `The place where this video happens: ${all}. ${NO_TEXT}` },
  ];
}

// 붙인 그림을 모델에게 **뭐라고 부를지**. 이 한 문단이 두 방식의 실질적 차이다.
export function attachClauseFor(mode) {
  filmMode(mode);
  if (mode === "order") {
    return "The attached images are the scenes of this video, in order: use the first image for the first scene, the second for the second, and so on. Keep each scene faithful to its image.";
  }
  return "The attached images are appearance references only — they show what the subject, the person and the place look like. Do not read them as a sequence or as scene order; the scene order is written above. Keep the subject, the person and the place looking exactly as in these images.";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-mode.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/film/mode.js tests/film-mode.test.js
git commit -m "feat(film): 두 방식이 갈리는 자리 하나 — 장면 순서 · 참고 그림"
```

---

### Task 2: 문서 모양 — 종류 등록과 방식별 두 벌

**Files:**
- Modify: `lib/projects.js:45` (`KINDS`)
- Create: `lib/film/doc.js`
- Test: `tests/film-doc.test.js`

**Interfaces:**
- Consumes: `isFilmMode` (Task 1)
- Produces:
  - `emptyFilm() => { images: [], video: null, status: "draft", error: null }`
  - `filmOf(project, mode) => 그 방식의 칸` (없으면 `emptyFilm()`)
  - `putFilm(project, mode, patch) => 새 project` — **다른 방식의 칸을 건드리지 않는다**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-doc.test.js
import { describe, it, expect } from "vitest";
import { emptyFilm, filmOf, putFilm } from "../lib/film/doc.js";

describe("방식별 두 벌", () => {
  it("★ 없는 방식을 물으면 빈 칸이 온다 — 옛 문서에서도 안 죽는다", () => {
    expect(filmOf({}, "order")).toEqual(emptyFilm());
  });

  it("★ 한 방식을 구워도 **다른 방식이 그대로 남는다** — 비교가 이 기능의 목적이다", () => {
    let p = { id: "x" };
    p = putFilm(p, "refs", { video: { url: "/api/renders/x-refs.mp4", seconds: 15 }, status: "done" });
    p = putFilm(p, "order", { video: { url: "/api/renders/x-order.mp4", seconds: 15 }, status: "done" });
    expect(filmOf(p, "refs").video.url).toBe("/api/renders/x-refs.mp4");
    expect(filmOf(p, "order").video.url).toBe("/api/renders/x-order.mp4");
  });

  it("★ 같은 방식을 다시 구우면 그 칸만 덮어쓴다", () => {
    let p = putFilm({}, "order", { status: "rendering" });
    p = putFilm(p, "order", { status: "done" });
    expect(filmOf(p, "order").status).toBe("done");
  });

  it("★ 모르는 방식은 던진다", () => {
    expect(() => putFilm({}, "nope", {})).toThrow();
    expect(() => filmOf({}, "nope")).toThrow();
  });

  it("★ 프로젝트의 다른 값은 그대로다", () => {
    const p = putFilm({ id: "x", scenario: { text: "s" } }, "order", { status: "done" });
    expect(p.id).toBe("x");
    expect(p.scenario.text).toBe("s");
  });
});

describe("프로젝트 종류", () => {
  it("★ film 종류가 등록돼 있다 — 없으면 createProject 가 던진다", async () => {
    const src = (await import("node:fs")).readFileSync("lib/projects.js", "utf8");
    expect(src).toMatch(/KINDS\s*=\s*\[[^\]]*"film"/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-doc.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```js
// lib/film/doc.js
// 방식별로 **두 벌**을 남긴다.
//
// ★ 한 자리에 덮어쓰면 비교 대상이 사라진다 — 그런데 비교가 이 기능의 목적이다.
//   films.order 를 구워도 films.refs 가 그대로 있어야 두 영상을 나란히 볼 수 있다.
import { filmMode } from "./mode.js";

export function emptyFilm() {
  return { images: [], video: null, status: "draft", error: null };
}

export function filmOf(project, mode) {
  filmMode(mode);
  return project?.films?.[mode] || emptyFilm();
}

export function putFilm(project, mode, patch) {
  filmMode(mode);
  return {
    ...project,
    films: {
      ...(project?.films || {}),
      [mode]: { ...filmOf(project, mode), ...patch },
    },
  };
}
```

`lib/projects.js:45` 를 고친다:

```js
// 문서 종류. **없으면 기존 종류다** — 옛 문서에는 이 필드가 아예 없다.
// 반대로 두면(없으면 ad) 기존 프로젝트 전체가 새 경로로 흘러간다.
const KINDS = ["ad", "film"];
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-doc.test.js` → PASS (6 tests)
Run: `npx vitest run` → 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add lib/film/doc.js lib/projects.js tests/film-doc.test.js
git commit -m "feat(film): 방식별 두 벌을 남기는 문서 모양 · 종류 등록"
```

---

### Task 3: 참조를 URL 로도 받는다 — `submitAdVideo` 작은 확장

지금은 참조를 **바이트**로만 받는다(`toDataUri(r.bytes, r.key)`). 우리가 만든 이미지는 fal 에 있는 **공개 URL** 이라 바이트로 다시 내려받을 이유가 없다.

**Files:**
- Modify: `lib/ad/generate.js:115-116`
- Test: `tests/film-refs-url.test.js`

**Interfaces:**
- Produces: `submitAdVideo({ refs })` 의 `refs` 원소가 `{ bytes, key }` **또는** `{ url }` 이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-refs-url.test.js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { submitAdVideo } from "../lib/ad/generate.js";

const PROJECT = { id: "p1", settings: { seconds: 15, model: "seedance-2.0", resolution: "480p", aspect_ratio: "9:16" } };
const SCENARIO = { text: "a video", endpoint: "r2v", shots: [] };

let sent;
const fakeFetch = async (url, opt) => {
  sent = JSON.parse(opt.body);
  return { ok: true, json: async () => ({ request_id: "r1", status_url: "s", response_url: "res" }) };
};

beforeEach(() => { process.env.FAL_KEY = "k"; delete process.env.SHOTFORM_FAKE; sent = null; });
afterEach(() => { delete process.env.FAL_KEY; });

describe("참조를 URL 로 넘긴다", () => {
  it("★ url 만 있는 참조는 그대로 실린다 — 만든 이미지는 이미 공개 주소다", async () => {
    await submitAdVideo({
      project: PROJECT, scenario: SCENARIO,
      refs: [{ url: "https://v3b.fal.media/files/a.png" }, { url: "https://v3b.fal.media/files/b.png" }],
      fetchImpl: fakeFetch,
    });
    expect(sent.image_urls).toEqual([
      "https://v3b.fal.media/files/a.png",
      "https://v3b.fal.media/files/b.png",
    ]);
  });

  it("★ 바이트 참조는 예전과 똑같이 data URI 가 된다 — 광고 경로가 안 다친다", async () => {
    await submitAdVideo({
      project: PROJECT, scenario: SCENARIO,
      refs: [{ bytes: Buffer.from([1, 2, 3]), key: "x.png" }],
      fetchImpl: fakeFetch,
    });
    expect(sent.image_urls[0].startsWith("data:")).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-refs-url.test.js`
Expected: 첫 테스트 FAIL — `image_urls` 가 `undefined` 이거나 data URI 로 변환 시도

- [ ] **Step 3: 구현** — `lib/ad/generate.js` 의 두 줄을 바꾼다

```js
  // 참조는 **바이트 또는 주소**다. 업로드는 비공개 버킷이라 URL 을 fal 이 못 읽어
  // 바이트를 data URI 로 넘기지만(lib/imagegen.js 가 이미 푼 문제), 우리가 만든 이미지는
  // fal 에 있는 **공개 주소**라 내려받았다 다시 올릴 이유가 없다(2026-08-19, film 경로).
  const refUri = (r) => (r?.url ? r.url : toDataUri(r.bytes, r.key));
  if (kind === "i2v" && refs[0]) input.image_url = refUri(refs[0]);
  if (kind === "r2v" && refs.length) input.image_urls = refs.map(refUri);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-refs-url.test.js` → PASS
Run: `npx vitest run tests/ad-generate.test.js` → 광고 경로 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add lib/ad/generate.js tests/film-refs-url.test.js
git commit -m "feat(ad): 참조를 주소로도 받는다 — 만든 이미지는 이미 공개 주소다"
```

---

### Task 3.5: 이미지가 읽을 **영어 한 줄** — 시나리오에 `shows` 를 더한다

★ 왜 계획에 없던 태스크가 생겼나(2026-08-19 실측): 광고 시나리오의 `shots` 는 값이 **전부
한국어**다(`camera: "테이블 높이 로우 앵글, 느린 푸시인…"`). 광고에서는 그 필드가 **사람이
읽는 용**이고 모델에 가는 것은 영어 `text` 하나뿐이라 문제가 없었다. 그런데 이 기능은 그
한국어를 **이미지 프롬프트로** 쓴다 — 이미지 모델의 한국어 이해에 기대는 셈이고, 그것은
"측정 없이 품질을 주장하지 않는다"는 이 저장소 규율과 어긋난다.

단계별 경로가 이미 같은 이름으로 같은 일을 한다(`cut.shows` — 화면에 무엇이 보이는가를
영어로). 광고 시나리오에도 같은 칸을 더한다.

**Files:**
- Modify: `lib/ad/scenario.js` (SYSTEM 의 JSON 스키마 · `EDITABLE_SHOT_FIELDS`)
- Modify: `lib/film/mode.js` (`imagePlanFor` 의 축 재료를 `shows` 로)
- Test: `tests/film-shows.test.js`

**Interfaces:**
- Produces: `scenario.shots[].shows` — 그 장면에 **보이는 것**을 영어 한 줄로
- Consumes: Task 1 의 `imagePlanFor`

★ **각인 영향 없음**: 광고 굽기 프롬프트는 `scenario.text` 만 쓰고 `shots` 를 안 읽는다
(`lib/ad/generate.js` 의 `withSpokenLines` 는 `line` 만 본다). 필드가 하나 늘어도 광고가
이미 산 영상은 낡지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-shows.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { imagePlanFor } from "../lib/film/mode.js";

const src = readFileSync("lib/ad/scenario.js", "utf8");

const SCENARIO = {
  shots: [
    { beat: "키링으로 시선을 끈다", shows: "a lavender bunny keyring swaying on a tan leather handbag", camera: "느린 푸시인", lighting: "부드러운 낮빛", action: "키링이 흔들린다", seconds: 5 },
    { beat: "손에 들어 보여준다", shows: "a hand holding the small bunny charm close to the lens", camera: "클로즈업", lighting: "창가 빛", action: "손이 들어올린다", seconds: 5 },
  ],
};

describe("시나리오가 이미지용 영어 한 줄을 낸다", () => {
  it("★ 스키마가 shows 를 요구한다 — 영어로", () => {
    expect(src).toMatch(/"shows"/);
  });

  it("★ 사장님이 고칠 수 있는 칸에도 들어간다", () => {
    expect(src).toMatch(/EDITABLE_SHOT_FIELDS[^\]]*"shows"/);
  });
});

describe("이미지 프롬프트가 영어에서 나온다", () => {
  it("★ 장면 순서 — 그 장면의 shows 가 실린다", () => {
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan[0].prompt).toContain("lavender bunny keyring");
    // 한국어 필드가 프롬프트를 채우지 않는다 — 이미지 모델이 읽는 글이다
    expect(plan[0].prompt).not.toContain("느린 푸시인");
  });

  it("★ 참고 그림 — 축들이 shows 에서 나온다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    const joined = plan.map((p) => p.prompt).join(" ");
    expect(joined).toContain("lavender bunny keyring");
    expect(joined).not.toContain("손이 들어올린다");
  });

  it("★ shows 가 없는 옛 문서에서도 죽지 않는다", () => {
    const old = { shots: [{ beat: "무엇을 한다", seconds: 5 }] };
    expect(() => imagePlanFor("order", old)).not.toThrow();
    expect(() => imagePlanFor("refs", old)).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-shows.test.js`
Expected: FAIL — 스키마에 `shows` 없음, 프롬프트가 한국어를 담음

- [ ] **Step 3: 구현**

`lib/ad/scenario.js` 의 JSON 스키마에 한 줄을 더한다(`"beat"` 바로 아래):

```js
    "shows": "이 장면에 **보이는 것** — 영어 한 줄. 이미지 모델이 읽는 글이라 한국어를 쓰지 않는다",
```

그리고 `EDITABLE_SHOT_FIELDS` 에 `"shows"` 를 더한다:

```js
const EDITABLE_SHOT_FIELDS = ["beat", "shows", "camera", "lighting", "action", "sound", "line"];
```

`lib/film/mode.js` 의 축 재료를 바꾼다 — **한국어 필드를 이미지 프롬프트에서 걷는다**:

```js
  if (mode === "order") {
    // ★ shows(영어)만 쓴다. beat·camera·lighting 은 사장님이 읽는 한국어라 이미지 모델에
    //   보내면 이해에 기대는 꼴이 된다(2026-08-19). 옛 문서(shows 없음)는 beat 로 떨어진다 —
    //   빈 프롬프트로 값을 치르는 것보다 낫다.
    return shots.map((s, i) => ({
      key: `shot-${i + 1}`,
      prompt: `${s.shows || s.beat || ""}. ${NO_TEXT}`.trim(),
    }));
  }
```

`refs` 의 세 축도 `shows` 에서 나오게 하되 **축마다 다른 조각**을 쓴다(세 장이 같은 그림이
되면 안 된다):

```js
  const shows = shots.map((s) => s.shows || s.beat || "").filter(Boolean);
  return [
    { key: "subject", prompt: `A clean product shot of the main object in: ${shows[0] || ""}. ${NO_TEXT}` },
    { key: "person", prompt: `A portrait of the person in: ${shows[shows.length - 1] || ""}. ${NO_TEXT}` },
    { key: "place", prompt: `The place, empty of people, in: ${shows.join(" ")}. ${NO_TEXT}` },
  ];
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-shows.test.js` → PASS
Run: `npx vitest run tests/film-mode.test.js` → **앞 태스크의 테스트가 깨질 것이다.** 축 재료가
바뀌었으므로 그 테스트의 픽스처에 `shows` 를 더해 뜻을 유지한다(테스트를 지우지 않는다).
Run: `npx vitest run` → 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add lib/ad/scenario.js lib/film/mode.js tests/film-shows.test.js tests/film-mode.test.js
git commit -m "feat(film): 이미지가 읽을 영어 한 줄 — 한국어 필드를 프롬프트에서 걷는다"
```

---

### Task 4: 파이프라인 — 이미지 만들기와 굽기

**Files:**
- Create: `lib/film/pipeline.js`
- Test: `tests/film-pipeline.test.js`

**Interfaces:**
- Consumes: `imagePlanFor`·`attachClauseFor` (Task 1), `filmOf`·`putFilm` (Task 2), URL 참조 (Task 3)
- Produces:
  - `buildFilmPrompt(scenario, mode) => string`
  - `runFilmImages(projectId, ownerId, mode, deps) => Promise<void>`
  - `startFilmRender(projectId, ownerId, mode, deps) => Promise<{ done, requestId }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-pipeline.test.js
import { describe, it, expect } from "vitest";
import { buildFilmPrompt } from "../lib/film/pipeline.js";

const SCENARIO = { text: "Vertical 9:16 footage. Scene 1 ...", shots: [{ line: "안녕하세요", seconds: 15 }] };

describe("굽기 프롬프트", () => {
  it("★ 시나리오 지문이 그대로 앞에 온다", () => {
    expect(buildFilmPrompt(SCENARIO, "order").startsWith(SCENARIO.text)).toBe(true);
  });

  it("★ 방식마다 붙는 말이 다르다", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).not.toBe(buildFilmPrompt(SCENARIO, "refs"));
  });

  it("★ 대사가 실린다 — 광고와 같은 장치를 쓴다(안 실으면 모델이 딴 말을 한다)", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).toContain("안녕하세요");
  });

  it("★ 모르는 방식은 던진다", () => {
    expect(() => buildFilmPrompt(SCENARIO, "nope")).toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-pipeline.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```js
// lib/film/pipeline.js
// 한 번에 굽는 경로 — 이미지 만들기와 굽기.
//
// ★ 새 장치를 만들지 않는다. 시나리오는 lib/ad/scenario.js, 이미지는 lib/imagegen.js,
//   굽기는 lib/ad/generate.js, 자막은 lib/ad/subtitles.js + lib/compose.js 를 그대로 쓴다.
//   두 벌이 되면 어느 쪽이 진짜인지 아무도 모르게 된다.
import { getProject, updateProject } from "../projects.js";
import { generateImage } from "../imagegen.js";
import { submitAdVideo, withSpokenLines } from "../ad/generate.js";
import { imagePlanFor, attachClauseFor, filmMode } from "./mode.js";
import { filmOf, putFilm } from "./doc.js";

// 굽기 프롬프트 = 시나리오 지문 + 붙인 그림을 뭐라고 부르는지 + 대사 못 박기.
//
// ★ 대사(withSpokenLines)는 광고와 **같은 함수**다. 2026-08-19 실측으로 대사를 안 실으면
//   모델이 자기가 지어낸 말을 하고 자막과 전혀 다른 영상이 나온다는 것이 확인됐다.
export function buildFilmPrompt(scenario, mode) {
  filmMode(mode);
  const base = typeof scenario?.text === "string" ? scenario.text : "";
  const withAttach = [base, "", attachClauseFor(mode)].join("\n");
  return withSpokenLines(withAttach, scenario?.shots);
}

// 이미지 — 방식이 정한 계획대로 만든다. 사장님이 올린 사진은 **참조로 함께** 넘긴다
// (lib/imagegen.js 가 refs 를 받으면 edit 계열 엔드포인트로 간다).
export async function runFilmImages(projectId, ownerId, mode, deps = {}) {
  const make = deps.generateImage || generateImage;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");

  const plan = imagePlanFor(mode, project.scenario);
  if (!plan.length) throw new Error("만들 그림이 없어요");

  const images = [];
  for (const item of plan) {
    const out = await make({
      prompt: item.prompt,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      projectId,
    });
    images.push({ key: item.key, url: out.url, of: item.prompt });
  }
  await updateProject(projectId, ownerId, (p) => putFilm(p, mode, { images, status: "images", error: null }));
}

// 굽기 접수 — 광고와 같은 이유로 접수와 수거를 나눈다(서버리스는 응답이 나가면 얼린다).
export async function startFilmRender(projectId, ownerId, mode, deps = {}) {
  const submit = deps.submitAdVideo || submitAdVideo;
  const now = deps.now || Date.now;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  const film = filmOf(project, mode);
  // ★ 그림 없이 굽지 않는다. 참조 없이 r2v 로 나가면 이 경로의 뜻이 사라지는데 값은 그대로 든다.
  if (!film.images?.length) throw new Error("먼저 그림을 만들어 주세요");

  const scenario = { ...project.scenario, text: buildFilmPrompt(project.scenario, mode), endpoint: "r2v" };
  const job = await submit({
    project, scenario,
    refs: film.images.map((im) => ({ url: im.url })),
  });

  if (job.fake) {
    await updateProject(projectId, ownerId, (p) => putFilm(p, mode, { status: "done", video: { url: job.url, seconds: job.seconds } }));
    return { done: true };
  }
  await updateProject(projectId, ownerId, (p) =>
    putFilm(p, mode, { status: "rendering", job: { ...job, startedAt: now() }, error: null }));
  return { done: false, requestId: job.requestId };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-pipeline.test.js` → PASS
Run: `npx vitest run` → 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add lib/film/pipeline.js tests/film-pipeline.test.js
git commit -m "feat(film): 이미지 만들기와 굽기 — 광고 장치를 그대로 쓴다"
```

---

### Task 5: 라우트

**Files:**
- Create: `app/api/film/route.js` (POST — 만들기)
- Create: `app/api/film/[id]/scenario/route.js` (POST — 시나리오)
- Create: `app/api/film/[id]/images/route.js` (POST — 그림)
- Create: `app/api/film/[id]/render/route.js` (POST — 굽기)
- Test: `tests/film-routes.test.js`

**Interfaces:**
- Consumes: Task 4 의 함수들, `generateScenario` (`lib/ad/scenario.js`)
- Produces: 화면이 부르는 네 주소. 방식은 **body 의 `mode`** 로 받는다(시나리오 라우트만 예외).

★ `POST /api/film` 이 문서를 만들 때 **길이·해상도를 여기서 박는다** — 화면이 고르는 축이
아니다(방식을 재는 자리라 조건이 같아야 한다):

```js
  const project = await createProject({
    ownerId: user.id,
    kind: "film",
    material,
    settings: {
      ...settings,
      seconds: 15,          // 2.0 이 여는 길이. 30초는 2.5 가 필요하고 초당 단가가 더 비싸다
      resolution: "480p",   // 방식의 차이는 480p 로도 보인다
      model: "seedance-2.0",
    },
  });
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-routes.test.js
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("film 라우트", () => {
  const FILES = [
    "app/api/film/route.js",
    "app/api/film/[id]/scenario/route.js",
    "app/api/film/[id]/images/route.js",
    "app/api/film/[id]/render/route.js",
  ];

  for (const f of FILES) {
    it(`★ ${f} 가 있다`, () => expect(existsSync(f)).toBe(true));

    it(`★ ${f} 가 로그인을 요구한다 — 값이 나가는 자리다`, () => {
      expect(strip(readFileSync(f, "utf8"))).toMatch(/withUser|requireUser/);
    });
  }

  it("★ 모르는 방식은 400 으로 막는다 — 라우트가 입구를 지킨다", () => {
    for (const f of FILES.slice(1)) {
      expect(strip(readFileSync(f, "utf8")), `${f} 가 방식을 안 본다`).toMatch(/isFilmMode/);
    }
  });

  it("★ 소유자를 넘긴다 — 남의 프로젝트에서 값이 나가면 안 된다", () => {
    for (const f of FILES.slice(1)) {
      expect(strip(readFileSync(f, "utf8"))).toMatch(/user\.id/);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/film-routes.test.js`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 구현**

★ **시나리오 라우트만 방식을 안 본다.** 시나리오는 두 방식이 **공유하는 하나**다 —
방식마다 새로 만들면 결과 차이가 방식 때문인지 시나리오 때문인지 알 수 없게 되고,
그것이 이 기능 전체를 무의미하게 만든다. 그래서 위 테스트의 `isFilmMode` 검사에서
`FILES.slice(1)` 가 아니라 **그림·굽기 둘만** 본다:

```js
    for (const f of ["app/api/film/[id]/images/route.js", "app/api/film/[id]/render/route.js"]) {
```

시나리오 라우트는 `lib/ad/scenario.js` 의 `generateScenario({ project, edits })` 를 그대로
부르고 결과를 `p.scenario` 에 넣는다(`lib/ad/pipeline.js` 의 `runScenarioStep` 과 같은 모양,
다만 `films` 는 건드리지 않는다).

`app/api/film/[id]/render/route.js` (그림 라우트도 같은 모양):

```js
import { withUser } from "../../../../../lib/auth/require-user.js";
import { isFilmMode } from "../../../../../lib/film/mode.js";
import { startFilmRender } from "../../../../../lib/film/pipeline.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const { mode } = await req.json().catch(() => ({}));
  // ★ 입구에서 막는다. 모르는 방식이 안으로 들어가면 어느 칸에 쓸지가 흔들린다.
  if (!isFilmMode(mode)) return Response.json({ error: "모르는 방식이에요" }, { status: 400 });
  try {
    return Response.json(await startFilmRender(id, user.id, mode));
  } catch (e) {
    return Response.json({ error: e?.message || "굽지 못했어요" }, { status: 400 });
  }
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-routes.test.js` → PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/film tests/film-routes.test.js
git commit -m "feat(film): 만들기 · 그림 · 굽기 라우트"
```

---

### Task 6: 화면 둘과 사이드바

**Files:**
- Create: `app/film/[mode]/page.js` — **한 화면이 두 방식을 다 받는다**(주소의 `mode` 로 갈린다)
- Modify: `components/Sidebar.jsx:146-152` 근처 (항목 둘 추가)
- Modify: `components/ProjectCards.jsx:109` (`kind === "film"` 갈래)
- Test: `tests/film-ui.test.js`

**Interfaces:**
- Consumes: `FILM_MODES` (Task 1), Task 5 의 세 주소

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-ui.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const page = strip(readFileSync("app/film/[mode]/page.js", "utf8"));
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

describe("사이드바", () => {
  it("★ 두 방식이 나란히 선다 — 라벨이 실험 조건을 말한다", () => {
    expect(side).toContain("/film/order");
    expect(side).toContain("/film/refs");
  });

  it("★ 라벨은 표에서 읽는다 — 화면에 복사하면 표와 갈린다", () => {
    expect(side).toMatch(/FILM_MODES/);
  });
});

describe("한 화면이 두 방식을 받는다", () => {
  it("★ 주소에서 방식을 읽는다", () => {
    expect(page).toMatch(/useParams|params/);
  });

  it("★ 모르는 방식이면 화면이 그것을 말한다 — 조용히 한쪽으로 떨어지지 않는다", () => {
    expect(page).toMatch(/isFilmMode/);
  });

  it("★ [다른 방식으로 굽기]가 있다 — 같은 시나리오로 재야 비교가 성립한다", () => {
    expect(page).toContain("다른 방식으로");
  });
});

describe("보관함 카드", () => {
  it("★ film 종류를 갈라 그린다", () => {
    expect(cards).toMatch(/kind === "film"|kind==="film"/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다** → FAIL (파일 없음)

- [ ] **Step 3: 구현**

사이드바에 더한다(`광고 영상` 블록 아래):

```jsx
      {/* ★ 두 방식을 나란히 둔다 — 사장님이 비교하실 것이므로 **라벨 자체가 실험 조건**을
          말해야 한다. 표(FILM_MODES)에서 읽는다: 화면에 라벨을 복사하면 표와 갈린다. */}
      {FILM_MODES.map((m) => (
        <Link
          key={m.id}
          href={`/film/${m.id}`}
          className={`side-item${pathname === `/film/${m.id}` ? " on" : ""}`}
        >
          <span className="ic"><Icon name="sparkle" /></span>{m.label}
        </Link>
      ))}
```

화면은 광고 화면(`app/ads/[id]/page.js`)의 단계 구성을 따른다: ①입력 → ②시나리오 → ③그림 → ④완성.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/film-ui.test.js` → PASS
Run: `npx vitest run` → 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add app/film components/Sidebar.jsx components/ProjectCards.jsx tests/film-ui.test.js
git commit -m "feat(film): 화면 둘과 사이드바 — 라벨이 실험 조건을 말한다"
```

---

### Task 7: 수거와 자막

**Files:**
- Modify: `lib/film/pipeline.js` (수거 추가)
- Create: `app/api/film/[id]/status/route.js`
- Test: `tests/film-collect.test.js`

**Interfaces:**
- Produces: `collectFilmRender(projectId, ownerId, mode, deps) => { changed, done?, pending?, error? }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/film-collect.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = readFileSync("lib/film/pipeline.js", "utf8");

describe("수거", () => {
  it("★ 던지지 않는다 — 상태 조회가 부르므로 던지면 화면이 상태조차 못 읽는다", () => {
    expect(src).toMatch(/export async function collectFilmRender/);
    expect(src).toMatch(/catch/);
  });

  it("★ 자막을 태운다 — 광고와 같은 장치(adSubtitleCuts · burnSubtitles)", () => {
    expect(src).toMatch(/adSubtitleCuts/);
    expect(src).toMatch(/burnSubtitles/);
  });

  it("★ 자막을 못 태워도 원본을 완성본으로 쓴다 — 이미 값을 치른 영상을 잃지 않는다", () => {
    expect(src).toMatch(/rawUrl/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다** → FAIL

- [ ] **Step 3: 구현** — `lib/ad/pipeline.js` 의 `collectAdRender`·`burnAdSubtitles` 를 같은 모양으로 옮긴다. 자막 언어는 `project.settings?.narration_lang || "ko"`, 원문도 같은 값이다(번역 단계가 없다).

- [ ] **Step 4: 통과를 확인한다** → PASS, 회귀 0

- [ ] **Step 5: 커밋**

```bash
git add lib/film/pipeline.js app/api/film tests/film-collect.test.js
git commit -m "feat(film): 수거와 자막 — 못 태워도 원본을 잃지 않는다"
```

---

## 마무리 확인 (구현자가 마지막에 한다)

- [ ] `npx vitest run` — 전체 그린, 회귀 0
- [ ] `git log --oneline` 으로 태스크별 커밋이 남았는지
- [ ] **push 하지 않는다** — 배포는 사장님 요청 시에만
- [ ] 남은 위험을 보고에 적는다: `r2v` 가 순서를 보는지는 **여전히 미검증**이고, 그것이 이 기능의 실험 대상이다
