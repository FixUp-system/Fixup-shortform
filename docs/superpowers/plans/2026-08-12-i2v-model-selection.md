# 영상 모델 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⑤영상 단계에서 영상 모델을 고를 수 있게 한다. 기본은 Seedance 2.0, 대안은 지금 쓰는 Kling v3 다. 첫 클립을 만들면 잠긴다.

**Architecture:** 모델은 `settings.i2v_model` 에 **id**(`"seedance-2.0"`·`"kling-v3"`)로 저장한다. 엔드포인트·길이 눈금·모델별 필드는 `lib/clip-limits.js` 의 표 하나가 쥐고, 가격은 `lib/pricing.js` 하나가 쥔다. env `FAL_I2V_ENDPOINT` 는 폐지한다 — 원천이 둘이면 갈린다.

**Tech Stack:** Next.js App Router · Supabase(jsonb 통짜 문서) · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-i2v-model-selection-design.md` 의 "지켜야 할 것"을 그대로 옮긴다.

- ★★ **옛 프로젝트가 조용히 모델을 갈아타면 안 된다.** `settings.i2v_model` 이 **없으면 Kling v3** 다. 반대로 두면(없으면 Seedance) 이미 Kling 으로 클립을 만들던 영상이 다음 컷부터 모델이 바뀌어 한 편 안에 두 모델이 섞인다
- ★★ **가짜 모드 판정의 방향을 뒤집지 마라.** `lib/costs.js` 의 `isFakeFor` 는 "fal 접두사면 `fakeFal()`, 나머지는 `fakeLlm()`" 이고 그것이 옳다(그 위 주석이 이유를 적고 있다 — 뒤집으면 모르는 엔드포인트가 fal 축으로 떨어져 `SHOTFORM_FAKE=fal` 에서 `assertBudget` 게이트가 통째로 꺼진다). **접두사 목록만 넓힌다**
- ★ **`lib/pricing.js` 는 화면("use client")에서도 import 된다 — import 문을 두지 마라.** 순수 데이터·순수 함수만
- ★ **`lib/clip-limits.js` 도 화면이 import 한다** — `fs` 를 끌고 오는 모듈(`lib/costs.js` 등)을 import 하지 마라
- 가격 숫자를 라우트·화면에 흘리지 않는다. `lib/pricing.js` 하나다
- 모델 엔드포인트 문자열을 두 군데 두지 않는다. `lib/clip-limits.js` 하나다
- 새 npm 의존성 금지. 새 CSS 금지
- **Seedance 오디오는 켜지 않는다**(`generate_audio: false`)
- **예상 못 한 실패는 고치지 말고 보고한다**

**모델 표 (여러 태스크가 이 값을 쓴다 — 글자 그대로):**

| id | endpoint | 길이 | 초당 원가 |
|---|---|---|---|
| `seedance-2.0` | `bytedance/seedance-2.0/image-to-video` | 4~15 정수 | $0.3024 |
| `kling-v3` | `fal-ai/kling-video/v3/standard/image-to-video` | 3~15 정수 | $0.084 |

**정가 (크레딧):**

| 초 | seedance-2.0 | kling-v3 |
|---|---|---|
| 15 | 80 | 25 |
| 30 | 160 | 50 |
| 45 | 240 | 75 |
| 60 | 320 | 100 |

클립 재생성: seedance `25` · kling `8`. 이미지 `2` · 목소리 `1` 은 모델과 무관하다.

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라(문서 숫자는 낡는다). 매 태스크 끝에서 유지되거나 늘어야 한다.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

## ★ 병렬 가능 여부

**Task 1 · Task 2 · Task 7 은 동시에 돌려도 된다** — 파일이 갈린다.

| Task | 파일 |
|---|---|
| 1 | `lib/clip-limits.js` · `tests/clip-limits.test.js` |
| 2 | `lib/pricing.js` · `tests/pricing.test.js` |
| 3 | `lib/costs.js` · `tests/costs.test.js` (Task 1 의 엔드포인트 문자열을 씀) |
| 4 | `lib/i2v.js` · `lib/pipeline.js` · `tests/i2v.test.js` (Task 1 뒤) |
| 5 | `app/api/projects/[id]/route.js` · `app/api/projects/route.js` · `tests/routes.test.js` (Task 1 뒤) |
| 6 | `lib/charges.js` · 화면 넷 · 재생성 라우트 셋 (Task 2 뒤) |
| 7 | `lib/costs.js` 예산 축 · `tests/budget-limits.test.js` |
| 8 | `app/create/[id]/video/page.js` (Task 5 뒤) |

⚠️ **Task 3 과 Task 7 은 둘 다 `lib/costs.js` 를 고친다** — 동시에 돌리지 마라. 3 → 7 순서로.

병렬로 돌릴 때는 **각자 자기 테스트 파일만** 돌린다(`npx vitest run` 전체 금지 — 남의 미완성 변경으로 거짓 실패가 난다). 전체 테스트는 컨트롤러가 마지막에 한 번 돌린다.

---

### Task 1: 모델 표 — 프로필과 목록

**Files:**
- Modify: `lib/clip-limits.js`
- Test: `tests/clip-limits.test.js`

**Interfaces:**
- Produces:
  - `I2V_MODELS` — `[{ id, endpoint, label, hint }]` 배열. 화면이 그린다
  - `DEFAULT_I2V_MODEL = "seedance-2.0"` · `LEGACY_I2V_MODEL = "kling-v3"`
  - `I2V_MODEL_IDS` — `["seedance-2.0", "kling-v3"]`. Task 5 가 닫힌 목록 검증에 쓴다
  - `modelIdForProject(project)` → id. `settings.i2v_model` 이 아는 값이면 그것, **아니면 `LEGACY_I2V_MODEL`**
  - `endpointForProject(project)` → 엔드포인트 문자열. Task 4 가 쓴다
  - `clipProfileForProject(project)` → 프로필. Task 4 가 쓴다
  - `clipLimitsForProject(project)` → `{ min, max }`. Task 5 가 GET 응답에 싣는다
- 폐지: `activeI2vEndpoint()` · `activeClipProfile()` · `activeClipLimits()` · env `FAL_I2V_ENDPOINT`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/clip-limits.test.js` 에 describe 를 더한다(파일이 없으면 만들고, 상단 import 는 실제 export 이름에 맞춘다):

```js
import { describe, it, expect } from "vitest";
import {
  I2V_MODELS, I2V_MODEL_IDS, DEFAULT_I2V_MODEL, LEGACY_I2V_MODEL,
  modelIdForProject, endpointForProject, clipProfileForProject,
  clipLimitsForProject, fitDurationFor, profileFor,
} from "../lib/clip-limits.js";

describe("영상 모델 표", () => {
  it("고를 수 있는 것은 둘이고 기본은 Seedance 다", () => {
    expect(I2V_MODEL_IDS).toEqual(["seedance-2.0", "kling-v3"]);
    expect(DEFAULT_I2V_MODEL).toBe("seedance-2.0");
    expect(LEGACY_I2V_MODEL).toBe("kling-v3");
  });

  it("표의 모든 항목이 사장님에게 보일 말과 엔드포인트를 가진다", () => {
    for (const m of I2V_MODELS) {
      expect(I2V_MODEL_IDS).toContain(m.id);
      expect(m.endpoint).toMatch(/\S/);
      expect(m.label).toMatch(/\S/);
      expect(m.hint).toMatch(/\S/);
    }
  });

  // ★★ 이 단정이 이 태스크의 전부다 — 옛 프로젝트가 조용히 모델을 갈아타면 안 된다
  it("i2v_model 이 없는 옛 프로젝트는 Kling 이다", () => {
    expect(modelIdForProject(undefined)).toBe("kling-v3");
    expect(modelIdForProject({})).toBe("kling-v3");
    expect(modelIdForProject({ settings: {} })).toBe("kling-v3");
    expect(endpointForProject({ settings: {} })).toBe(
      "fal-ai/kling-video/v3/standard/image-to-video"
    );
  });

  it("모르는 값도 Kling 으로 떨어진다 — 새 모델로 조용히 갈아타는 것보다 낫다", () => {
    expect(modelIdForProject({ settings: { i2v_model: "뒤죽박죽" } })).toBe("kling-v3");
    expect(modelIdForProject({ settings: { i2v_model: "constructor" } })).toBe("kling-v3");
  });

  it("고른 모델이 엔드포인트와 프로필을 정한다", () => {
    const p = { settings: { i2v_model: "seedance-2.0" } };
    expect(endpointForProject(p)).toBe("bytedance/seedance-2.0/image-to-video");
    expect(clipProfileForProject(p).min).toBe(4);
    expect(clipProfileForProject(p).max).toBe(15);
    expect(clipLimitsForProject(p)).toEqual({ min: 4, max: 15 });
  });

  it("Seedance 는 오디오를 끈다 — 클립 소리가 우리 낭독과 두 겹이 되면 안 된다", () => {
    const profile = profileFor("bytedance/seedance-2.0/image-to-video");
    expect(profile.extra.generate_audio).toBe(false);
  });

  it("Seedance 는 4~15 정수를 받는다 — 눈금이 아니다", () => {
    const profile = profileFor("bytedance/seedance-2.0/image-to-video");
    expect(profile.steps).toBe(null);
    expect(fitDurationFor(profile, 2)).toBe(4);    // 바닥에 묶인다
    expect(fitDurationFor(profile, 7.2)).toBe(8);  // 올린다
    expect(fitDurationFor(profile, 99)).toBe(15);  // 상한에 묶인다
  });

  it("Kling 프로필은 그대로다 — 옛 영상이 달라지면 안 된다", () => {
    const profile = profileFor("fal-ai/kling-video/v3/standard/image-to-video");
    expect(profile.min).toBe(3);
    expect(profile.max).toBe(15);
    expect(profile.extra.generate_audio).toBe(false);
  });

  it("env 로는 모델이 바뀌지 않는다 — 원천은 프로젝트 하나다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/ltx-2";
    try {
      expect(endpointForProject({ settings: { i2v_model: "seedance-2.0" } })).toBe(
        "bytedance/seedance-2.0/image-to-video"
      );
      expect(endpointForProject({ settings: {} })).toBe(
        "fal-ai/kling-video/v3/standard/image-to-video"
      );
    } finally {
      delete process.env.FAL_I2V_ENDPOINT;
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: FAIL — `I2V_MODELS` 등이 export 되지 않아 `undefined` 다.

- [ ] **Step 3: 프로필과 표를 더한다**

`lib/clip-limits.js` 의 `CLIP_PROFILES` **맨 위**에 Seedance 를 더한다. 접두사가 `fal-ai/` 와 안 겹치므로 순서 함정은 없지만, 기본 모델을 맨 위에 두는 편이 읽기 좋다:

```js
export const CLIP_PROFILES = [
  {
    prefix: "bytedance/seedance-2.0",
    steps: null, min: 4, max: 15,
    // Kling 과 같은 이유로 오디오를 끈다 — 클립에 소리가 실리면 우리 낭독과 두 겹이 되고,
    // 낭독이 컷 길이를 정하는 뼈대와 어긋난다. (Seedance 는 끄든 켜든 값이 같다.)
    extra: { generate_audio: false, resolution: "720p" },
  },
  // … 기존 kling · ltx 항목은 그대로
];
```

그 아래에 모델 목록을 더한다:

```js
// 사장님이 고를 수 있는 모델. 엔드포인트 문자열이 사는 유일한 자리다.
//
// label·hint 는 화면이 그대로 쓴다 — 화면에 문구를 적으면 두 군데가 되고 언젠가 갈린다.
export const I2V_MODELS = [
  {
    id: "seedance-2.0",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    label: "Seedance 2.0",
    hint: "움직임이 자연스러워요. 값이 더 들어요",
  },
  {
    id: "kling-v3",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    label: "Kling v3",
    hint: "값이 싼 쪽이에요",
  },
];

export const I2V_MODEL_IDS = I2V_MODELS.map((m) => m.id);
export const DEFAULT_I2V_MODEL = "seedance-2.0";

// ★★ i2v_model 이 없는 프로젝트가 떨어질 자리. **기본값과 다르다.**
//
// 없는 것 = 이 기능이 붙기 전에 만들어진 프로젝트 = 이미 Kling 으로 클립을 만들고 있다.
// 여기를 DEFAULT_I2V_MODEL 로 두면 그 영상들이 다음 컷부터 조용히 Seedance 로 갈아타
// 한 편 안에 두 모델이 섞인다. 새 프로젝트는 생성 시점에 기본값을 **명시 저장**한다.
export const LEGACY_I2V_MODEL = "kling-v3";
```

- [ ] **Step 4: 프로젝트 스코프 함수로 바꾼다**

`activeI2vEndpoint`·`activeClipProfile`·`activeClipLimits` **셋을 지우고** 아래로 갈아낀다:

```js
// 이 프로젝트가 쓰는 모델. 모르는 값·없는 값은 전부 LEGACY 로 떨어진다.
//
// ★ Object.hasOwn 이 아니라 목록 검색인 이유: I2V_MODELS 는 배열이라 프로토타입 함정이 없다.
export function modelIdForProject(project) {
  const id = project?.settings?.i2v_model;
  return I2V_MODELS.some((m) => m.id === id) ? id : LEGACY_I2V_MODEL;
}

export function endpointForProject(project) {
  const id = modelIdForProject(project);
  return I2V_MODELS.find((m) => m.id === id).endpoint;
}

export function clipProfileForProject(project) {
  return profileFor(endpointForProject(project));
}

// GET /api/projects/[id] 가 화면에 실어 보내는 값. 화면은 env 를 못 보므로 서버가 준다.
export function clipLimitsForProject(project) {
  const profile = clipProfileForProject(project);
  return { min: minSecondsFor(profile), max: maxSecondsFor(profile) };
}
```

파일 위쪽의 `DEFAULT_I2V_ENDPOINT` 상수와 그 위 주석(env 경고)도 지운다 — 엔드포인트는 이제 `I2V_MODELS` 가 쥔다. 아래쪽 `DEFAULT_ENDPOINT_PROFILE` 이 그 상수를 쓰고 있으므로 **`I2V_MODELS` 의 기본 모델 엔드포인트**로 바꾼다:

```js
const DEFAULT_ENDPOINT_PROFILE = profileFor(
  I2V_MODELS.find((m) => m.id === DEFAULT_I2V_MODEL).endpoint
);
```

★ `I2V_STEPS`·`I2V_MAX_SECONDS`·`fitDuration` 은 **건드리지 마라** — 화면 폴백이고 소비자가 있다.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: PASS 전부. 기존 clip-limits 테스트가 `activeI2vEndpoint` 등을 쓰고 있으면 **그 테스트도 새 함수로 옮긴다**(지워진 함수를 되살리지 마라).

- [ ] **Step 6: ★ 옛 프로젝트 보호를 변이로 확인한다**

`LEGACY_I2V_MODEL` 을 잠깐 `"seedance-2.0"` 으로 바꾸고 돌린다.
Expected: "i2v_model 이 없는 옛 프로젝트는 Kling 이다" 와 "모르는 값도 Kling 으로 떨어진다" 가 FAIL.
**이것이 이 태스크에서 가장 중요한 확인이다** — 확인했으면 되돌린다.

★ 되돌릴 때 `git checkout` 을 쓰지 마라 — 이 파일의 미커밋 작업까지 사라진다. 편집기로 그 값만.

- [ ] **Step 7: env 의 자취를 지운다**

`FAL_I2V_ENDPOINT` 는 이제 아무 데서도 읽지 않는다. 남은 언급을 지운다:

- `.env.local.example:14` — `FAL_I2V_ENDPOINT=fal-ai/ltx-2.3/image-to-video/fast` 줄을 지운다
- `README.md:17` — 그 env 를 설명하는 줄을 지우고, 대신 한 줄을 남긴다:
  `- 영상 모델은 env 가 아니라 프로젝트가 정한다(⑤영상에서 고른다, \`lib/clip-limits.js\`의 \`I2V_MODELS\`)`
- `vitest.setup.js:49` — `delete process.env.FAL_I2V_ENDPOINT;` 줄을 지운다

Run: `grep -rn "FAL_I2V_ENDPOINT" --include=* . | grep -v node_modules | grep -v "\.git/"`
Expected: Task 1 의 테스트("env 로는 모델이 바뀌지 않는다")에서 일부러 세우는 자리 말고는 **0건**.

- [ ] **Step 8: 커밋**

```bash
git add lib/clip-limits.js tests/clip-limits.test.js .env.local.example README.md vitest.setup.js
git commit -m "feat(clip-limits): 영상 모델 표 — Seedance 2.0 과 Kling v3

모델이 env 하나로 정해지던 것을 프로젝트별로 바꾼다. 엔드포인트 문자열은 표
하나가 쥔다 — 원천이 둘이면 프로필과 실제 모델이 갈린다.

★ i2v_model 이 없으면 Kling 이다. 기본값(Seedance)과 다른 이유는, 없는 것이
'아직 안 골랐다'가 아니라 '이 기능 전에 만들어져 이미 Kling 으로 돌고 있다'
이기 때문이다. 기본값으로 떨어뜨리면 옛 영상이 다음 컷부터 모델을 갈아탄다."
```

---

### Task 2: 가격이 길이 × 모델로 갈라진다

**Files:**
- Modify: `lib/pricing.js:16`(`VIDEO_PRICE`) · `:19`(`REGEN_PRICE`) · `:34`(`videoPrice`) · `:48`(`regenPrice`)
- Test: `tests/pricing.test.js`

**Interfaces:**
- Produces: `videoPrice(seconds, model)` · `regenPrice(kind, priorCount, model)`.
  `model` 은 Task 1 의 id(`"seedance-2.0"`·`"kling-v3"`). **없거나 모르는 값이면 `kling-v3` 표**
- Task 6 이 이 두 함수에 모델을 넘긴다

★ **이 파일에 import 문을 두지 마라.** 화면이 import 하는 순수 데이터·순수 함수 파일이다. 그래서 Task 1 의 `LEGACY_I2V_MODEL` 을 **import 하지 않고 문자열을 쓴다** — 이 파일의 기존 규약이고, 대신 아래 Step 3 의 주석이 그 결합을 적는다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/pricing.test.js` 에 더한다(파일이 없으면 만들고 import 는 실제 경로에 맞춘다):

```js
import { describe, it, expect } from "vitest";
import { videoPrice, regenPrice, VIDEO_PRICE, REGEN_PRICE } from "../lib/pricing.js";

describe("모델별 정가", () => {
  it("Seedance 는 원가 비례로 비싸다", () => {
    expect(videoPrice(15, "seedance-2.0")).toBe(80);
    expect(videoPrice(30, "seedance-2.0")).toBe(160);
    expect(videoPrice(45, "seedance-2.0")).toBe(240);
    expect(videoPrice(60, "seedance-2.0")).toBe(320);
  });

  it("Kling 정가는 그대로다 — 옛 프로젝트의 값이 바뀌면 안 된다", () => {
    expect(videoPrice(15, "kling-v3")).toBe(25);
    expect(videoPrice(30, "kling-v3")).toBe(50);
    expect(videoPrice(45, "kling-v3")).toBe(75);
    expect(videoPrice(60, "kling-v3")).toBe(100);
  });

  // ★★ 모델을 안 넘긴 옛 호출은 옛 프로젝트다 — Kling 으로 봐야 한다
  it("모델을 안 주면 Kling 값이다", () => {
    expect(videoPrice(30)).toBe(50);
    expect(videoPrice(30, undefined)).toBe(50);
    expect(videoPrice(30, "뒤죽박죽")).toBe(50);
  });

  it("길이를 모르면 30초 값으로 본다 — 모델별로", () => {
    expect(videoPrice(null, "seedance-2.0")).toBe(160);
    expect(videoPrice(7, "seedance-2.0")).toBe(160);
    expect(videoPrice(null, "kling-v3")).toBe(50);
  });

  it("클립 재생성도 모델을 탄다", () => {
    expect(regenPrice("clip", 1, "seedance-2.0")).toBe(25);
    expect(regenPrice("clip", 1, "kling-v3")).toBe(8);
    expect(regenPrice("clip", 1)).toBe(8);
  });

  it("이미지·목소리는 모델과 무관하다", () => {
    for (const m of ["seedance-2.0", "kling-v3", undefined]) {
      expect(regenPrice("image", 1, m)).toBe(2);
      expect(regenPrice("voice", 1, m)).toBe(1);
    }
  });

  it("컷마다 첫 회는 여전히 무료다", () => {
    expect(regenPrice("clip", 0, "seedance-2.0")).toBe(0);
    expect(regenPrice("image", 0, "seedance-2.0")).toBe(0);
  });

  // ★ 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다
  it("모르는 재생성 종류는 던진다", () => {
    expect(() => regenPrice("클립", 1, "seedance-2.0")).toThrow();
  });

  it("두 모델이 같은 길이 눈금을 덮는다 — 한쪽만 값이 빠지면 안 된다", () => {
    for (const m of ["seedance-2.0", "kling-v3"]) {
      expect(Object.keys(VIDEO_PRICE[m]).map(Number).sort((a, b) => a - b)).toEqual([15, 30, 45, 60]);
    }
    expect(Object.keys(REGEN_PRICE.clip).sort()).toEqual(["kling-v3", "seedance-2.0"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pricing.test.js`
Expected: FAIL — `videoPrice(15, "seedance-2.0")` 이 지금은 모델을 무시하고 25 를 준다.

- [ ] **Step 3: 표를 모델별로 나눈다**

`lib/pricing.js` 의 `VIDEO_PRICE`·`REGEN_PRICE` 를 갈아낀다:

```js
// 목표 길이(초) → 크레딧. **모델마다 다르다** — 원가가 모델의 초당 단가에 비례한다.
//   kling-v3     : 클립 $0.084/s → 30초 한 편 원가 ≈ $3.06
//   seedance-2.0 : 클립 $0.3024/s → 30초 한 편 원가 ≈ $9.62 (3.2배)
// 1크레딧 ≈ $0.06 원가 기준은 그대로다.
export const VIDEO_PRICE = {
  "seedance-2.0": { 15: 80, 30: 160, 45: 240, 60: 320 },
  "kling-v3": { 15: 25, 30: 50, 45: 75, 60: 100 },
};

// 컷 하나를 다시 만들 때. 클립만 모델을 탄다(이미지·목소리는 모델과 무관하다).
// 실측 원가 이미지 $0.08 · 목소리 $0.002 · 클립 kling $0.42 / seedance $1.51 을 올림했다.
export const REGEN_PRICE = {
  image: 2,
  voice: 1,
  clip: { "seedance-2.0": 25, "kling-v3": 8 },
};

// ★ 모델을 안 넘긴 호출이 떨어질 자리. **기본 모델이 아니라 옛 모델이다.**
// 모델을 모른다는 것은 이 기능 전에 만들어진 프로젝트라는 뜻이고, 그것들은 Kling 으로 돈다.
// (같은 규칙이 lib/clip-limits.js 의 LEGACY_I2V_MODEL 에 있다. 이 파일은 import 를 둘 수
//  없어 — 화면이 읽는 순수 데이터 파일이다 — 문자열을 되풀이한다. 한쪽을 바꾸면 둘 다 바꿔라.)
const LEGACY_MODEL = "kling-v3";

function priceModel(model) {
  return VIDEO_PRICE[model] ? model : LEGACY_MODEL;
}
```

- [ ] **Step 4: 두 함수가 모델을 받게 한다**

같은 파일의 `videoPrice`·`regenPrice` 를 갈아낀다:

```js
export function videoPrice(seconds, model) {
  const table = VIDEO_PRICE[priceModel(model)];
  const p = table[Number(seconds)];
  return typeof p === "number" ? p : table[30];
}

// priorCount = 이 컷에서 이미 한 재생성 횟수. 0 이면 첫 번째라 공짜다.
// 모르는 종류는 던진다 — 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다.
export function regenPrice(kind, priorCount, model) {
  const entry = REGEN_PRICE[kind];
  if (entry === undefined) throw new Error(`모르는 재생성 종류: ${kind}`);
  const p = typeof entry === "number" ? entry : entry[priceModel(model)];
  return Number(priorCount) >= FREE_REGEN_PER_CUT ? p : 0;
}
```

★ `priceLabel`·`FREE_REGEN_PER_CUT`·`MAX_REGEN_PER_CUT`·`DEFAULT_GRANT`·`FREE_TRIAL_USD` 는 **건드리지 마라.**

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/pricing.test.js`
Expected: PASS 전부. 기존 pricing 테스트도 무손상이어야 한다(모델 없는 호출이 Kling 값이므로).

- [ ] **Step 6: ★ 폴백 방향을 변이로 확인한다**

`const LEGACY_MODEL = "kling-v3";` 를 잠깐 `"seedance-2.0"` 으로 바꾸고 돌린다.
Expected: "모델을 안 주면 Kling 값이다" 가 FAIL. 확인했으면 되돌린다(편집기로).

- [ ] **Step 7: 커밋**

```bash
git add lib/pricing.js tests/pricing.test.js
git commit -m "feat(pricing): 정가가 길이 × 모델로 갈라진다

Seedance 는 클립 단가가 Kling 의 3.6배라 편당 원가가 \$3.06 → \$9.62 다.
1크레딧 ≈ 원가 \$0.06 기준을 그대로 적용해 30초 50 → 160 크레딧.

★ 모델을 안 넘긴 호출은 Kling 표로 본다 — 기본 모델(Seedance)이 아니다.
모델을 모른다는 것은 이 기능 전의 프로젝트라는 뜻이고 그것들은 Kling 으로 돈다."
```

---

### Task 3: 안전장치가 Seedance 를 알게 한다

**Files:**
- Modify: `lib/costs.js`(`PRICE_TABLE` · `isFakeFor`)
- Test: `tests/costs.test.js`

**Interfaces:**
- Consumes: Task 1 의 엔드포인트 문자열 `bytedance/seedance-2.0/image-to-video`
- Produces: `estimateCost` 가 Seedance 를 초당 $0.3024 로 센다 · `isFakeFor` 가 Seedance 를 fal 축으로 본다

⚠️ **Task 7 도 `lib/costs.js` 를 고친다. 동시에 돌리지 마라.**

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/costs.test.js` 에 더한다(상단 import 에 `estimateCost`·`isFakeFor` 가 없으면 더한다):

```js
describe("Seedance 를 안전장치가 안다", () => {
  const SEEDANCE = "bytedance/seedance-2.0/image-to-video";

  it("원가를 초당 0.3024 로 센다 — 표에 없으면 조용히 0 이 된다", () => {
    expect(estimateCost(SEEDANCE, 10)).toBeCloseTo(3.024, 5);
    // 표에 없는 엔드포인트가 0 이라는 사실 자체를 못 박는다 — 이 테스트가 지키는 것이다
    expect(estimateCost("bytedance/모르는모델", 10)).toBe(0);
  });

  it("Kling 원가는 그대로다", () => {
    expect(estimateCost("fal-ai/kling-video/v3/standard/image-to-video", 10)).toBeCloseTo(0.84, 5);
  });

  // ★★ 이것이 이 태스크에서 가장 위험한 자리다
  it("가짜 모드에서 Seedance 는 fal 로 본다 — 아니면 진짜 호출이 나간다", () => {
    const before = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "fal";
    try {
      expect(isFakeFor(SEEDANCE)).toBe(true);
      expect(isFakeFor("fal-ai/kling-video/v3/standard/image-to-video")).toBe(true);
      // ★ 방향은 그대로여야 한다 — 모르는 것은 fal 축으로 떨어지면 안 된다
      expect(isFakeFor("openai/gpt-4o")).toBe(false);
      expect(isFakeFor("모르는공급자/모델")).toBe(false);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = before;
    }
  });

  it("SHOTFORM_FAKE=all 이면 둘 다 가짜다", () => {
    const before = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "all";
    try {
      expect(isFakeFor(SEEDANCE)).toBe(true);
      expect(isFakeFor("openai/gpt-4o")).toBe(true);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = before;
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: FAIL 2건 — 원가가 0 이고, `SHOTFORM_FAKE=fal` 에서 `isFakeFor(SEEDANCE)` 가 `false` 다.

- [ ] **Step 3: 원가표에 더한다**

`lib/costs.js` 의 `PRICE_TABLE` 에서 **Kling 항목들 위**에 더한다(접두사가 안 겹치므로 순서는 무관하지만 영상끼리 모아 둔다):

```js
  // Seedance 2.0 i2v — 초당 $0.3024. 오디오를 켜도 값이 같다(문서 확인).
  // ⚠️ 접두사가 "fal-ai/" 가 아니다. isFakeFor 의 FAL_PREFIXES 에도 같은 접두사가 있어야 한다.
  { prefix: "bytedance/seedance-2.0", perSec: 0.3024 },
```

- [ ] **Step 4: 가짜 판정의 접두사 목록을 넓힌다**

`isFakeFor` 바로 위에 목록을 두고 판정을 그것으로 바꾼다:

```js
// fal 로 나가는 엔드포인트의 접두사. fal 이 공급자 이름을 그대로 쓰는 모델들이 있어
// "fal-ai/" 하나로는 부족하다(bytedance/seedance-2.0 이 그렇다).
//
// ⚠️ **판정 방향은 뒤집지 마라** — 아래 주석 참고. 넓히는 것은 이 목록뿐이다.
const FAL_PREFIXES = ["fal-ai/", "bytedance/"];

export function isFakeFor(endpoint) {
  const id = String(endpoint || "");
  return FAL_PREFIXES.some((p) => id.startsWith(p)) ? fakeFal() : fakeLlm();
}
```

★ `isFakeFor` 위의 기존 주석(방향에 대한 설명)은 **지우지 마라.** 그것이 다음 사람이 방향을 뒤집는 것을 막는다.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: PASS 전부

- [ ] **Step 6: ★ 가짜 판정을 변이로 확인한다**

`FAL_PREFIXES` 에서 `"bytedance/"` 를 잠깐 빼고 돌린다.
Expected: "가짜 모드에서 Seedance 는 fal 로 본다" 가 FAIL. 확인했으면 되돌린다(편집기로).

- [ ] **Step 7: 커밋**

```bash
git add lib/costs.js tests/costs.test.js
git commit -m "fix(costs): Seedance 를 fal 로 본다 — 원가표와 가짜 판정 둘 다

모델 id 가 bytedance/… 라 'fal-ai/' 접두사 판정을 둘 다 빠져나갔다:
원가가 조용히 \$0 으로 기록되고, SHOTFORM_FAKE=fal 에서 LLM 으로 분류돼
진짜 호출이 나갔다 — 0원인 줄 알고 돌린 테스트가 클립당 \$1.5 를 쓴다.

★ 판정 방향은 그대로 둔다. 뒤집으면 모르는 엔드포인트가 fal 축으로 떨어져
SHOTFORM_FAKE=fal 에서 assertBudget 게이트가 통째로 꺼진다."
```

---

### Task 4: 클립을 만드는 자리가 프로젝트의 모델을 쓴다

**Files:**
- Modify: `lib/i2v.js:14-36` · `lib/pipeline.js`(`generateClip` 호출부)
- Test: `tests/i2v.test.js`

**Interfaces:**
- Consumes: Task 1 의 `endpointForProject(project)` · `clipProfileForProject(project)`
- Produces: `generateClip({ …, project })` — 새 인자 `project` 를 받는다. 안 넘기면 Kling(레거시)으로 돈다

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/i2v.test.js` 에 더한다(파일이 없으면 만든다. `fetchImpl` 을 주입해 **실제로 나가는 body 와 URL** 을 잡는 것이 요점이다 — 목 호출 횟수만 세면 이 배선의 오타를 못 잡는다):

```js
import { describe, it, expect, beforeEach } from "vitest";
import { generateClip } from "../lib/i2v.js";
import { runWithActor } from "../lib/actor.js";

function captor(seconds = 5) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ video: { url: "https://x/v.mp4" } }) };
  };
  return { calls, fetchImpl };
}

const base = { imageUrl: "https://x/i.png", seconds: 5, aspect_ratio: "9:16", prompt: "움직인다", projectId: "p1" };

describe("클립이 프로젝트의 모델로 나간다", () => {
  it("Seedance 프로젝트는 Seedance 로 나가고 오디오가 꺼져 있다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("admin", () =>
      generateClip({ ...base, project: { settings: { i2v_model: "seedance-2.0" } }, fetchImpl })
    );
    expect(calls[0].url).toBe("https://fal.run/bytedance/seedance-2.0/image-to-video");
    expect(calls[0].body.generate_audio).toBe(false);
    expect(calls[0].body.duration).toBe(5);
  });

  // ★★ 옛 프로젝트가 조용히 모델을 갈아타면 안 된다
  it("i2v_model 이 없는 프로젝트는 Kling 으로 나간다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("admin", () =>
      generateClip({ ...base, project: { settings: {} }, fetchImpl })
    );
    expect(calls[0].url).toBe("https://fal.run/fal-ai/kling-video/v3/standard/image-to-video");
  });

  it("project 를 안 넘겨도 Kling 으로 나간다 — 옛 호출부가 조용히 비싸지면 안 된다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("admin", () => generateClip({ ...base, fetchImpl }));
    expect(calls[0].url).toContain("kling-video");
  });

  it("모델의 길이 눈금이 실제 요청에 실린다", async () => {
    const { calls, fetchImpl } = captor();
    await runWithActor("admin", () =>
      generateClip({ ...base, seconds: 2, project: { settings: { i2v_model: "seedance-2.0" } }, fetchImpl })
    );
    // Seedance 바닥은 4 초다
    expect(calls[0].body.duration).toBe(4);
  });
});
```

★ `runWithActor` 의 import 경로와 인자 형태는 **`tests/` 의 다른 파일이 쓰는 방식을 먼저 읽고 그대로 따라라** — 이 저장소는 `costActor()` 가 컨텍스트 없이는 던진다.
★ 이 테스트는 진짜 fal 로 안 나간다(`fetchImpl` 주입). 가짜 모드가 켜져 있으면 `generateClip` 이 조기 반환해 `calls` 가 빈다 — 그때는 테스트 안에서 `SHOTFORM_FAKE` 를 `off` 로 세우고 `finally` 에서 되돌려라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/i2v.test.js`
Expected: FAIL — 지금은 `project` 를 안 보고 env/기본값 하나로만 나간다. Seedance 프로젝트도 Kling URL 로 간다.

- [ ] **Step 3: `generateClip` 이 프로젝트를 받는다**

`lib/i2v.js` 를 고친다. import 를 새 함수로 갈아끼우고:

```js
import {
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
  clipProfileForProject, endpointForProject, fitDurationFor, maxSecondsFor,
} from "./clip-limits";
```

시그니처와 첫 두 줄, 그리고 엔드포인트 줄을 바꾼다(**나머지는 그대로**):

```js
export async function generateClip({ imageUrl, seconds, aspect_ratio, prompt, projectId, project, fetchImpl = fetch }) {
  // 모델은 프로젝트가 정한다 — 없으면 레거시(Kling). env 는 폐지됐다.
  const profile = clipProfileForProject(project);
  …
  const endpoint = endpointForProject(project);
```

`activeClipProfile`·`activeI2vEndpoint` 를 부르던 두 줄만 위처럼 바뀐다.

- [ ] **Step 4: 파이프라인이 프로젝트를 넘긴다**

`lib/pipeline.js` 에서 `generateClip(` 을 부르는 자리를 **전부** 찾아(`grep -n "generateClip(" lib/pipeline.js`) 각각에 `project` 를 더한다. 그 자리에 `project` 변수가 이미 있으면 그대로 넘기고, 없으면 그 함수가 이미 쥐고 있는 프로젝트 문서를 넘긴다:

```js
    const clip = await generateClip({
      imageUrl, seconds, aspect_ratio, prompt, projectId,
      project,
    });
```

★ 컷 하나만 다시 만드는 재생성 경로도 같은 함수를 부른다 — **빠뜨리면 재생성만 Kling 으로 돈다.** 호출처를 세어 전부 고쳤는지 확인하라.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/i2v.test.js tests/pipeline.test.js`
Expected: PASS 전부

- [ ] **Step 6: ★ 합성이 클립 소리를 버리는지 확인한다 (읽기만)**

`lib/compose.js` 를 읽고, 클립을 이어붙일 때 **비디오 스트림만 취하는지**(예: `-an`, 또는 오디오를 우리 낭독 트랙으로만 매핑) 확인하라.

- 버리고 있으면: 보고서에 근거(파일:줄)를 적고 넘어간다
- **버리지 않고 있으면: 고치지 마라. 보고하라.** 덩어리 B(낭독 폐지)의 입력이다

- [ ] **Step 7: 커밋**

```bash
git add lib/i2v.js lib/pipeline.js tests/i2v.test.js
git commit -m "feat(i2v): 클립이 프로젝트의 모델로 나간다

env 하나로 정해지던 모델이 프로젝트별로 갈린다. 원장에 남는 endpoint 도 같은
값이라, 어느 모델로 만들었는지가 기록으로 남는다.

project 를 안 넘긴 호출은 Kling 으로 떨어진다 — 옛 호출부가 조용히 3.6배
비싸지는 것보다 낫다."
```

---

### Task 5: 저장과 잠금

**Files:**
- Modify: `app/api/projects/[id]/route.js`(settings 검증 자리 · GET 의 `clip_limits`) · `app/api/projects/route.js:48-49`(생성)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: Task 1 의 `I2V_MODEL_IDS` · `DEFAULT_I2V_MODEL` · `clipLimitsForProject(project)`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/routes.test.js` 에서 `PATCH /api/projects/[id]` 를 재는 기존 describe 를 찾아 그 안에 더한다. **기존 PATCH 테스트를 먼저 읽고 그 형태를 그대로 따라 쓴다** — 컨텍스트 인자(`ctx(p.id)`)와 프로젝트 만드는 방식이 파일마다 다르다:

```js
  it("영상 모델은 아는 값만 받는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: OWNER });
    const res = await PATCH(patchReq({ settings: { i2v_model: "seedance-3" } }), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("아는 값이면 저장된다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: OWNER });
    const res = await PATCH(patchReq({ settings: { i2v_model: "seedance-2.0" } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBe("seedance-2.0");
  });

  // ★★ 잠금 — 클립이 하나라도 있으면 못 바꾼다
  it("영상을 만들기 시작했으면 모델을 못 바꾼다", async () => {
    const p = await createProject({
      settings: { i2v_model: "seedance-2.0" },
      material: { text: "가", photos: [] },
      ownerId: OWNER,
    });
    await updateProject(p.id, (d) => ({ ...d, cuts: [{ video: { url: "https://x/v.mp4" } }] }), OWNER);
    const res = await PATCH(patchReq({ settings: { i2v_model: "kling-v3" } }), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await getProject(p.id, OWNER)).settings.i2v_model).toBe("seedance-2.0");
  });

  it("클립이 아직 없으면 바꿀 수 있다", async () => {
    const p = await createProject({
      settings: { i2v_model: "seedance-2.0" },
      material: { text: "가", photos: [] },
      ownerId: OWNER,
    });
    await updateProject(p.id, (d) => ({ ...d, cuts: [{ image: { url: "https://x/i.png" } }] }), OWNER);
    const res = await PATCH(patchReq({ settings: { i2v_model: "kling-v3" } }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("모델을 안 보내는 PATCH 는 클립이 있어도 통과한다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: OWNER });
    await updateProject(p.id, (d) => ({ ...d, cuts: [{ video: { url: "https://x/v.mp4" } }] }), OWNER);
    const res = await PATCH(patchReq({ settings: { aspect_ratio: "9:16" } }), ctx(p.id));
    expect(res.status).toBe(200);
  });
```

그리고 생성·GET 을 재는 자리에 더한다:

```js
  // ★ createProject() 를 직접 부르면 라우트의 명시 저장을 안 거친다 — POST 라우트를 부른다.
  it("새로 만드는 프로젝트는 기본 모델을 명시 저장한다", async () => {
    const res = await POST(
      new Request("http://x/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { aspect_ratio: "9:16", target_seconds: 30 },
          material: { text: "가", photos: [] },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).settings.i2v_model).toBe("seedance-2.0");
  });

  it("GET 이 이 프로젝트의 모델 눈금을 실어 보낸다", async () => {
    const p = await createProject({
      settings: { i2v_model: "seedance-2.0" },
      material: { text: "가", photos: [] },
      ownerId: OWNER,
    });
    const res = await GET(new Request("http://x"), ctx(p.id));
    expect((await res.json()).clip_limits).toEqual({ min: 4, max: 15 });
  });
```

★ 위 POST 테스트의 **import 이름·요청 만드는 방식·인증 세우는 방식**은 그 파일이 이미 쓰는 형태를 먼저 읽고 맞춰라(`tests/routes.test.js` 는 라우트를 직접 import 해 부른다). 이 저장소는 라우트가 `withUser` 로 신원을 읽으므로, 그 파일이 사용자를 세우는 헬퍼가 있으면 그것을 써라.
★ `updateProject` 의 시그니처도 그 파일이 쓰는 형태를 따르라. 다르면 그 파일의 방식대로 컷을 심어라.
★ `POST` 가 그 파일에 아직 import 돼 있지 않으면 상단에 더하라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — 모르는 값이 200 으로 통과하고, 잠금이 없고, 생성이 모델을 안 적고, `clip_limits` 가 Kling 값(3~15)이다.

- [ ] **Step 3: 검증과 잠금을 더한다**

`app/api/projects/[id]/route.js` 상단 import 에 더한다(경로 깊이는 그 파일의 다른 import 를 보고 맞춘다):

```js
import { clipLimitsForProject, I2V_MODEL_IDS } from "../../../../lib/clip-limits";
```

`aspect_ratio` 를 검증하는 줄 **바로 아래**(락을 잡기 전)에 닫힌 목록 판정을 붙인다:

```js
  // 영상 모델도 닫힌 목록이다. 모르는 값이 들어가면 clip-limits 가 조용히 레거시로
  // 떨어뜨리는데, 고른 것과 만들어지는 것이 달라지면 아무도 못 알아본다.
  if (
    body.settings?.i2v_model !== undefined &&
    !I2V_MODEL_IDS.includes(body.settings.i2v_model)
  ) {
    return Response.json({ error: "그 영상 모델은 몰라요" }, { status: 400 });
  }
```

그리고 **잠금**은 프로젝트를 읽은 뒤에 판정한다(클립이 있는지 봐야 하므로). `target_seconds` 를 정가 낸 뒤에 못 바꾸게 막는 기존 판정 자리를 찾아 **그 옆에** 같은 형태로 붙인다:

```js
  // 클립이 하나라도 있으면 모델을 못 바꾼다. 클립이 한 편에서 가장 비싸서, 중간에
  // 바꾸면 한 영상 안에 두 모델이 섞이거나 이미 낸 돈을 버려야 한다.
  // (정가를 낸 뒤 길이를 못 바꾸게 한 것과 같은 자리·같은 이유다.)
  if (
    body.settings?.i2v_model !== undefined &&
    body.settings.i2v_model !== proj.settings?.i2v_model &&
    (proj.cuts || []).some((c) => c.video?.url)
  ) {
    return Response.json(
      { error: "이미 영상을 만들기 시작해서 모델을 바꿀 수 없어요" },
      { status: 400 }
    );
  }
```

★ 위 코드의 `proj` 는 **그 파일이 프로젝트를 담아 둔 변수 이름**이다. 기존 `target_seconds` 잠금이 쓰는 이름을 그대로 따라라.
★ **같은 값을 다시 보내는 것은 막지 않는다**(`!==` 비교) — 화면이 헛 PATCH 를 보내도 400 이 뜨지 않는다.

같은 파일의 GET 에서 `clip_limits` 를 만드는 줄을 프로젝트 스코프로 바꾼다:

```js
    clip_limits: clipLimitsForProject(project),
```

★ 그 자리의 프로젝트 변수 이름을 확인하고 맞춰라.

- [ ] **Step 4: 생성이 기본 모델을 명시 저장한다**

`app/api/projects/route.js` 상단에 import 를 더하고:

```js
import { DEFAULT_I2V_MODEL, I2V_MODEL_IDS } from "../../../lib/clip-limits";
```

`createProject({ settings: { … } })` 의 settings 를 고친다:

```js
    settings: {
      aspect_ratio: aspect,
      target_seconds: target,
      // ★ 기본값을 **명시 저장**한다. 값이 없는 것은 "안 골랐다"가 아니라 "이 기능 전에
      //   만들어졌다"는 뜻이고, 그런 프로젝트는 Kling 으로 돈다(lib/clip-limits.js).
      i2v_model: I2V_MODEL_IDS.includes(body.settings?.i2v_model)
        ? body.settings.i2v_model
        : DEFAULT_I2V_MODEL,
      ...(style ? { style } : {}),
    },
```

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS 전부

- [ ] **Step 6: ★ 잠금을 변이로 확인한다**

잠금 판정의 `(proj.cuts || []).some((c) => c.video?.url)` 을 잠깐 `false` 로 바꾸고 돌린다.
Expected: "영상을 만들기 시작했으면 모델을 못 바꾼다" 가 FAIL. 확인했으면 되돌린다(편집기로).

- [ ] **Step 7: 커밋**

```bash
git add "app/api/projects/[id]/route.js" app/api/projects/route.js tests/routes.test.js
git commit -m "feat(api): 영상 모델을 닫힌 목록으로 받고, 클립이 생기면 잠근다

settings 는 화이트리스트 없이 머지되므로 닫힌 목록은 라우트가 판정한다 —
aspect_ratio·target_seconds 와 같은 자리, 같은 이유다.

잠금은 정가를 낸 뒤 길이를 못 바꾸게 한 것과 같다. 클립이 한 편에서 가장
비싸서, 중간에 모델을 바꾸면 두 모델이 섞이거나 이미 낸 돈을 버려야 한다.

생성은 기본 모델을 명시 저장한다 — 값이 없는 것은 '안 골랐다'가 아니라
'이 기능 전에 만들어졌다'는 뜻이어야 한다."
```

---

### Task 6: 값을 말하는 자리 전부가 모델을 넘긴다

**Files:**
- Modify: `lib/charges.js:81`·`:103`·`:121` 부근 · `components/QuickCreate.jsx:55`·`:187` · `app/create/[id]/voice/page.js:145` · `app/create/[id]/images/page.js:223` · `app/create/[id]/video/page.js:173` · `app/api/projects/[id]/clips/[idx]/regen/route.js:54` · `app/api/projects/[id]/voice/[idx]/regen/route.js:53` · 이미지 재생성 라우트
- Test: `tests/charges.test.js`(있으면) 또는 새 파일

**Interfaces:**
- Consumes: Task 2 의 `videoPrice(seconds, model)` · `regenPrice(kind, priorCount, model)`

★ **모델을 안 넘기면 조용히 Kling 값(싼 값)이 청구된다.** 이것이 이 태스크의 유일한 실패 방식이다 — 화면은 160 크레딧이라 적고 장부는 50 을 받아 가는 식으로 갈린다.

- [ ] **Step 1: 호출처를 전부 센다**

Run: `grep -rn "videoPrice(\|regenPrice(" --include=*.js --include=*.jsx app lib components`

세어 둔 목록을 보고서에 적어라. 아래 Step 들에서 **하나도 빠뜨리면 안 된다.**

- [ ] **Step 2: 실패 테스트를 쓴다**

청구 장부가 실제로 받아 가는 크레딧을 잰다. `tests/charges.test.js` 에 더한다 — 그 파일은 이미 `resetMemoryStore()`·`getStore()`·`balanceFor` 를 쓰고 `A`·`P`·`ADMIN` 상수를 갖고 있다:

```js
describe("청구가 모델을 탄다", () => {
  beforeEach(() => resetMemoryStore());

  const 충전 = () =>
    getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "테스트", granted_by: ADMIN });

  it("Seedance 프로젝트는 정가가 세 배다", async () => {
    await 충전();
    await chargeVideo({ userId: A, projectId: P, seconds: 30, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 160);
  });

  // ★★ 모델을 안 넘기면 조용히 싼 값이 청구된다 — 이것이 이 태스크의 유일한 실패 방식이다
  it("모델을 안 넘기면 Kling 정가다", async () => {
    await 충전();
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(500 - 50);
  });

  it("클립 재생성도 모델을 탄다 — Seedance 25, Kling 8", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 25);
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 1, priorCount: 1, model: "kling-v3" });
    expect(await balanceFor(A)).toBe(500 - 25 - 8);
  });

  it("이미지·목소리 재생성은 모델과 무관하다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 2);
  });

  it("컷마다 첫 회는 여전히 무료다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 0, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500);
  });
});
```

★ `chargeVideo`·`chargeRegen`·`balanceFor` 는 이미 그 파일이 import 하고 있다. `getStore` 도 마찬가지다. `insertGrant` 의 인자 이름(`amount_credits`)은 `tests/budget.test.js` 가 쓰는 형태 그대로다.
★ 잔액은 `sum_grants − sum_charges` 로 나온다 — 목 호출 횟수를 세는 것이 아니라 **장부를 실제로 읽는다.**

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/charges.test.js`
Expected: FAIL — Seedance 프로젝트인데 Kling 정가(50)가 청구된다.

- [ ] **Step 4: `lib/charges.js` 가 모델을 넘긴다**

`lib/charges.js` 의 네 함수가 `model` 을 받게 한다. 지금 시그니처는 이렇다:

```js
export async function chargeVideo({ userId, projectId, seconds })
export async function requireVideoCharge({ userId, projectId, seconds })
export async function chargeRegen({ userId, projectId, kind, idx, priorCount })
export async function refundRegen({ projectId, kind, idx, priorCount })
```

넷 다 `model` 을 인자 목록 끝에 더하고, 안에서 `videoPrice(seconds, model)`·`regenPrice(kind, priorCount, model)` 로 넘긴다. **`assertCanAfford(userId, price)` 는 이미 값을 받으므로 안 바꾼다.**

```js
// ★ model 은 lib/clip-limits.js 의 id 다("seedance-2.0"·"kling-v3"). 안 넘기면
//   lib/pricing.js 가 레거시(Kling) 표로 떨어뜨린다 — 옛 프로젝트가 그 자리다.
export async function chargeVideo({ userId, projectId, seconds, model }) {
  const credits = videoPrice(seconds, model);
  …
```

⚠️ **`refundRegen` 을 빠뜨리지 마라.** 청구는 25 를 받고 환불은 8 을 돌려주면 사장님이 17 크레딧을 잃는다. 환불이 청구와 **같은 값**을 내는지 테스트로 확인하라:

```js
  it("환불은 청구와 같은 값을 돌려준다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    await refundRegen({ projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500);
  });
```

호출처(`requireVideoCharge` 를 부르는 유료 입구 넷: `/auto`·`/voice`·`/images`·`/clips`)는 프로젝트를 이미 읽고 있다. 각 라우트에서:

```js
import { modelIdForProject } from ".../lib/clip-limits.js";
…
await requireVideoCharge({ userId: user.id, projectId, seconds, model: modelIdForProject(proj) });
```

★ **Task 1 의 `modelIdForProject` 로 id 를 뽑아라** — `settings.i2v_model` 을 직접 읽으면 레거시 폴백이 빠져 옛 프로젝트가 `undefined` 로 흘러간다(결과는 같지만 규칙이 두 군데가 된다).
★ 각 라우트의 프로젝트 변수 이름·import 경로 깊이는 그 파일을 보고 맞춰라.

- [ ] **Step 5: 화면 넷이 모델을 넘긴다**

- `components/QuickCreate.jsx` — 프로젝트가 아직 없다. **기본 모델**을 넘긴다:
  `import { DEFAULT_I2V_MODEL } from "../lib/clip-limits";` 후 `videoPrice(seconds, DEFAULT_I2V_MODEL)`
- `app/create/[id]/voice/page.js` · `app/create/[id]/images/page.js` · `app/create/[id]/video/page.js`
  — `project` 가 있다. `import { modelIdForProject } from ".../lib/clip-limits";` 후
  `videoPrice(project?.settings?.target_seconds, modelIdForProject(project))` ·
  `regenPrice("clip", c.clip_regen_count || 0, modelIdForProject(project))`

★ import 경로 깊이는 각 파일의 기존 import 를 보고 맞춰라.
★ `lib/clip-limits.js` 는 화면이 이미 import 하는 파일이다(제약 통과).

- [ ] **Step 6: 재생성 라우트 셋이 모델을 넘긴다**

`app/api/projects/[id]/clips/[idx]/regen/route.js` · `voice/[idx]/regen/route.js` · 이미지 재생성 라우트에서 `regenPrice(...)` 호출에 모델을 더한다. 그 라우트들은 프로젝트를 이미 읽고 있으므로 `modelIdForProject(proj)` 를 넘긴다.

★ **클립 라우트가 가장 중요하다** — 여기를 빠뜨리면 Seedance 재생성이 8 크레딧에 팔린다.
★ 라우트가 청구 앞에서 상한을 세는 자리(`MAX_REGEN_PER_CUT`)는 **건드리지 마라.**

- [ ] **Step 7: 그린을 확인한다**

Run: `npx vitest run tests/charges.test.js tests/routes.test.js tests/pricing.test.js`
Expected: PASS 전부

- [ ] **Step 8: 빠뜨린 곳이 없는지 다시 센다**

Run: `grep -rn "videoPrice(\|regenPrice(" --include=*.js --include=*.jsx app lib components`

Step 1 의 목록과 대조해, **모든 호출이 두 번째/세 번째 인자를 넘기는지** 확인하라. 안 넘기는 것이 남아 있으면 그 자리가 조용히 Kling 값을 쓴다 — 의도한 것이면 보고서에 이유를 적어라.

- [ ] **Step 9: 커밋**

```bash
git add lib/charges.js components/QuickCreate.jsx "app/create/[id]/voice/page.js" "app/create/[id]/images/page.js" "app/create/[id]/video/page.js" app/api/projects tests/charges.test.js
git commit -m "feat(pricing): 값을 말하는 자리 전부가 모델을 넘긴다

모델을 안 넘기면 조용히 Kling 값(싼 값)이 청구된다 — 화면은 160 크레딧이라
적고 장부는 50 을 받아 가는 식으로 갈린다. 그래서 호출처를 전수로 셌다.

빠른 생성은 프로젝트가 아직 없어 기본 모델로 값을 말한다."
```

---

### Task 7: 프로젝트 예산 상한을 걷어낸다

**Files:**
- Modify: `lib/costs.js`(`limitProject` · `assertBudget` 의 프로젝트 축 · `BudgetExceeded` 의 `"project"` 갈래)
- Test: `tests/budget-limits.test.js:58-68`

**Interfaces:**
- Produces: `assertBudget` 이 더 이상 프로젝트 축으로 던지지 않는다. 전역·사용자·체험 축은 그대로

⚠️ **Task 3 도 `lib/costs.js` 를 고친다. Task 3 이 커밋된 뒤에 시작하라.**

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/budget-limits.test.js` 의 `limitProject` 를 쓰는 두 테스트(`:58-68`)를 **지우고**, 그 자리에 새 계약을 쓴다:

```js
  it("프로젝트 축은 사라졌다 — 폭주 방어는 전역 상한이 맡는다", async () => {
    const costs = await import("../lib/costs.js");
    expect(costs.limitProject).toBeUndefined();
  });

  it("전역 상한은 그대로다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal()).toBe(300);
  });
```

그리고 **`tests/budget.test.js` 를 고친다.** 그 파일이 프로젝트 축의 진짜 테스트를 갖고 있다. 먼저 `fresh()` 헬퍼(`:9-25`)에서 이 줄을 지운다:

```js
  process.env.SHOTFORM_BUDGET_PROJECT_USD = env.project ?? "5";
```

그리고 `fresh({ total: "10", project: "3" })` 처럼 `project` 를 넘기는 호출을 전부 `fresh({ total: "10" })` 으로 줄인다.

**지울 테스트 셋**(이름으로 찾아라):
- `"이번 호출을 더해 프로젝트 상한을 넘으면 막는다"`
- `"다른 프로젝트가 쓴 것은 이 프로젝트 상한에 들어가지 않는다"`
- `e.scope` 가 `"project"` 인지 재는 테스트(`:104-110` 부근)

**남길 테스트**(뜻이 그대로다): `"전체와 프로젝트별을 따로 센다"`(집계 함수는 살아 있다) · `"전체 상한은 프로젝트를 가리지 않고 넘으면 막는다"` · `"projectId가 없으면 전체 상한만 본다"`.

지운 자리에 새 계약을 쓴다. **같은 `describe` 안에 두어 `fresh()` 의 `beforeEach` 를 그대로 쓴다**:

```js
  // ★ 프로젝트 축이 사라졌다. 요금은 크레딧이 맡고, 폭주 방어는 전역 상한이 맡는다.
  it("한 프로젝트가 옛 상한을 한참 넘겨도 전역 안이면 안 막힌다", async () => {
    await fresh({ total: "1000" });
    await record(costs, { project_id: "p1", est_cost_usd: 100 });
    await runWithActor("t-user", () =>
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ); // 던지지 않으면 통과다
  });

  it("전역 상한은 프로젝트가 하나여도 여전히 막는다", async () => {
    await fresh({ total: "10" });
    await record(costs, { project_id: "p1", est_cost_usd: 9 });
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      )
    ).rejects.toThrow();
  });
```

★ `record`·`fresh`·`runWithActor` 는 그 파일이 이미 갖고 있다. `amount: 5` 는 `fal-ai/veo3.1` 초당 $0.4 라 $2 다 — 첫 테스트에서 100+2 가 1000 안이고, 둘째에서 9+2 가 10 을 넘는다.
★ 이 저장소는 원장 행을 실제로 넣고 합계 함수로 잰다 — 목을 주입하지 마라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/budget-limits.test.js tests/budget.test.js`
Expected: FAIL — `limitProject` 가 아직 있고, 옛 상한을 넘은 프로젝트가 막힌다.

- [ ] **Step 3: 프로젝트 축을 지운다**

`lib/costs.js` 에서:

1. `limitProject()` 함수와 그 위 주석을 **지운다**
2. `assertBudget` 끝의 블록을 **지운다**:
   ```js
   if (projectId) {
     const mine = (await store.sumCosts({ projectId })) + cost;
     if (mine > limitProject()) throw new BudgetExceeded(mine - cost, limitProject(), "project");
   }
   ```
3. `BudgetExceeded` 의 문구 분기에서 `"project"` 갈래를 정리한다 — `"total"` 과 묶여 있으면 `"total"` 만 남기고, 주석의 `total·project` 표기도 `total` 로 고친다
4. `assertBudget({ projectId, … })` 의 `projectId` 인자는 **그대로 둔다** — `spentForProject` 와 원장 기록이 계속 쓴다

`spentForProject` 는 **지우지 마라** — 원장 화면·집계가 쓴다. `grep -rn "spentForProject" app lib` 로 확인하라.

- [ ] **Step 4: 남은 자취를 지운다**

Run: `grep -rn "limitProject\|SHOTFORM_BUDGET_PROJECT_USD\|\"project\"" --include=*.js --include=*.jsx --include=*.mjs --include=*.example app lib components scripts .env.local.example`

나오는 자리를 모두 정리한다(화면 문구·`.env.local.example`·README 포함). **`"project"` 는 다른 뜻으로도 쓰이므로 예산 축인 것만 고쳐라.**

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/budget-limits.test.js tests/budget.test.js tests/budget-http.test.js tests/costs.test.js`
Expected: PASS 전부. `tests/budget-http.test.js` 가 `"project"` 축의 HTTP 응답을 재고 있으면 그것도 함께 정리한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/costs.js tests/budget-limits.test.js tests/budget.test.js .env.local.example
git commit -m "feat(costs): 프로젝트 예산 상한을 걷어낸다

Seedance 60초 한 편이 원가 \$19.2 라 재생성 몇 번이면 옛 상한(\$30)에 닿아
'돈은 있는데 못 만드는' 상태가 됐다. 요금은 크레딧이 맡고, 폭주 방어는
전역 상한(\$300)이 맡는다 — 그 둘은 그대로 둔다."
```

---

### Task 8: ⑤영상 화면의 모델 선택

**Files:**
- Modify: `app/create/[id]/video/page.js`

**Interfaces:**
- Consumes: Task 5 의 `PATCH { settings: { i2v_model } }` · Task 1 의 `I2V_MODELS`·`modelIdForProject` · Task 2 의 `videoPrice`

- [ ] **Step 1: 지금 화면을 읽는다**

Run: `sed -n '1,60p;120,200p' "app/create/[id]/video/page.js"`

`project`·`busy`·`err`/`setErr`·`load` 같은 상태 이름과, 클립 만들기 버튼이 어디 있는지 확인한다. **아래 코드를 그 파일의 이름에 맞춰 쓴다.** 이름이 없으면 추측하지 말고 그 파일의 기존 패턴을 따르라.

- [ ] **Step 2: 저장 함수를 더한다**

컴포넌트 안에 더한다:

```jsx
  // 모델은 첫 클립을 만들기 전까지만 바꿀 수 있다 — 클립이 한 편에서 가장 비싸서,
  // 중간에 바꾸면 두 모델이 섞이거나 이미 낸 돈을 버려야 한다.
  const chosenModel = modelIdForProject(project);
  const modelLocked = (project?.cuts || []).some((c) => c.video?.url);

  async function saveModel(id_) {
    if (busy || modelLocked || id_ === chosenModel) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { i2v_model: id_ } }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "영상 모델을 저장하지 못했어요");
      return;
    }
    await load(id).catch(() => {});
  }
```

★ 화살표 함수·매개변수 이름을 `id` 로 쓰지 마라 — 컴포넌트의 `const { id } = useParams()` 를 가린다.
★ `setErr`·`load` 가 그 파일에 없으면 그 파일이 오류를 표시하고 다시 읽는 방식을 그대로 따르라.

- [ ] **Step 3: 잠기지 않았을 때 칩을 그린다**

클립 만들기 버튼 **위**에 넣는다:

```jsx
      <div className="eyebrow mt-lg">영상 모델</div>
      {modelLocked ? (
        <p className="pgsub">
          이 영상은 {I2V_MODELS.find((m) => m.id === chosenModel)?.label} 으로 만들고 있어요.
        </p>
      ) : (
        <>
          <div className="chips">
            {I2V_MODELS.map((m) => (
              <button
                key={m.id}
                className={`chip${m.id === chosenModel ? " on" : ""}`}
                disabled={busy}
                onClick={() => saveModel(m.id)}
              >
                {m.label} · {videoPrice(project?.settings?.target_seconds, m.id)} 크레딧
              </button>
            ))}
          </div>
          <p className="pgsub">
            {I2V_MODELS.find((m) => m.id === chosenModel)?.hint} · 영상을 만들기 시작하면 바꿀 수 없어요.
          </p>
        </>
      )}
```

파일 상단 import 에 더한다(경로 깊이는 그 파일의 기존 import 에 맞춘다):

```jsx
import { I2V_MODELS, modelIdForProject } from "../../../../lib/clip-limits";
import { videoPrice } from "../../../../lib/pricing";
```

★ `.chips`/`.chip`/`.chip.on`/`.eyebrow`/`.mt-lg`/`.pgsub` 는 **이미 있는 CSS 다. 새 CSS 를 만들지 마라.**

- [ ] **Step 4: 눈으로 확인한다**

dev 서버에서 ⑤영상 화면을 열어 확인한다:

1. 칩 둘이 보이고 각각 크레딧이 적혀 있는가
2. 새 프로젝트에서 **Seedance 에 `on`** 이 붙어 있는가
3. Kling 을 누르면 `on` 이 옮겨가고 새로고침해도 유지되는가
4. 클립을 하나 만든 뒤 칩이 사라지고 "이 영상은 ○○ 으로 만들고 있어요" 한 줄만 남는가

⚠️ 클립 만들기는 **유료다.** 확인할 때 `SHOTFORM_FAKE=fal npm run dev` 로 띄워라 — 클립이 가짜로 돌아 0원이고, 4번의 잠금은 `cuts[].video.url` 이 채워지므로 그대로 확인된다.

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`
Expected: 시작 시 센 수에서 Task 1~7 이 더한 만큼 늘고, **전부 그린**

- [ ] **Step 6: 커밋**

```bash
git add "app/create/[id]/video/page.js"
git commit -m "feat(video): ⑤영상에서 모델을 고른다 — 첫 클립 전까지만

값이 3.2배 차이라 칩마다 이 길이의 크레딧을 함께 적는다. 첫 클립이 생기면
선택이 사라지고 무엇으로 만들고 있는지만 남는다."
```

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert` 가 가능하다. 의존은 이렇다:

- **Task 3·4·5 는 Task 1 에 의존한다**(엔드포인트 문자열·`I2V_MODEL_IDS`·프로젝트 스코프 함수)
- **Task 6 은 Task 2 에 의존한다**(`videoPrice`/`regenPrice` 의 모델 인자)
- **Task 8 은 Task 1·2·5 에 의존한다**

**Task 3(안전장치)을 되돌리면 위험하다** — Seedance 원가가 $0 으로 기록되고 `SHOTFORM_FAKE=fal` 에서 진짜 호출이 나간다. Task 1(기본값 Seedance)과 함께 되돌려야 한다.

**Task 6(값 배선)만 되돌리면** 화면과 장부가 갈린다 — 화면은 160 크레딧이라 적고 장부는 50 을 받는다. Task 2 와 함께 되돌려라.
