# 단계별 영상 화질 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 ②대본에서 화질(480p·720p·1080p)을 고르고, 그 값이 fal 요청·가격·낡음 판정까지 관통하게 한다.

**Architecture:** 광고 경로가 이미 깔아 둔 배관을 최대한 재사용한다 — `lib/costs.js` 의 `PRICE_TABLE[].perSec[해상도]` 와 `estimateCost(endpoint, amount, resolution)` 는 **이미 있다**. 새로 만드는 것은 ①모델별 해상도 목록 ②크레딧 가격의 셋째 축 ③각인 ④화면이다. Kling 에는 해상도 파라미터가 없으므로 **Seedance 전용 기능**이다.

**Tech Stack:** Node.js · vitest · 순수 데이터 모듈(`clip-limits.js`·`pricing.js`) · Next.js 화면

**Spec:** `docs/superpowers/specs/2026-08-13-step-resolution-design.md`

## Global Constraints

- **브랜치 `feat/step-resolution`.** `main` 에 직접 쓰지 않는다(공용 저장소).
- **`git add -A` 금지.** `next.config.mjs` 는 의도적 미커밋이고 다른 세션의 변경이 섞여 있다. 파일을 명시해 add 한다.
- **한글 커밋 메시지는 Write 로 파일에 쓴 뒤 `git commit -F <경로>`.** 셸을 거치면 깨진다.
- **화면(`"use client"`)이 import 하는 모듈에는 `import` 문을 두지 않는다** — `pricing.js`·`clip-limits.js`·`aspects.js` 가 그 규율이다. 사슬 끝에 `fs` 가 닿으면 빌드가 깨진다.
- **기본 해상도는 `"720p"`.** 옛 문서(`settings.resolution` 없음)를 이 값으로 읽는다.
- **Kling·LTX 는 `resolutions: []`** — 화면에 선택지를 안 띄운다.
- **각인은 값이 있을 때만 덧붙인다.** 무조건 붙이면 이미 값을 치른 클립이 통째로 낡는다(~$9/편).
- 테스트: `npx vitest run <파일>` · 전체 `npx vitest run`. **판정하는 것은 테스트뿐이다**(린터·타입체커 없음).
- 화면을 손댄 태스크는 `SHOTFORM_DIST_DIR=.next-verify npx next build` 로 **컴파일까지 확인**한다 — 소스 훑기 테스트는 문법 오류를 못 잡는다(이 저장소가 실제로 겪었다).
- 각 태스크는 TDD(실패 → 최소 구현 → 통과 → 커밋).

---

### Task 1: 모델별 해상도 목록과 판정

**Files:**
- Modify: `lib/clip-limits.js`
- Test: `tests/clip-limits.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `CLIP_PROFILES[].resolutions: string[]` — Seedance 는 `["480p","720p","1080p"]`, 나머지는 `[]`
  - `DEFAULT_RESOLUTION = "720p"` (export)
  - `resolutionsForProject(project): string[]`
  - `resolutionForProject(project): string` — 저장값이 그 모델에 유효하면 그것, 아니면 목록의 기본값, 목록이 비면 `""`
  - `isResolutionFor(resolution, project): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/clip-limits.test.js` 에 추가한다. 파일이 없으면 만든다(기존 import 형태는 다른 테스트를 따른다).

```js
import { describe, it, expect } from "vitest";
import {
  CLIP_PROFILES, DEFAULT_RESOLUTION,
  resolutionsForProject, resolutionForProject, isResolutionFor,
} from "../lib/clip-limits.js";

const seedance = { settings: { i2v_model: "seedance-2.0" } };
const kling = { settings: { i2v_model: "kling-v3" } };

describe("해상도 목록", () => {
  it("Seedance 만 해상도를 연다", () => {
    expect(resolutionsForProject(seedance)).toEqual(["480p", "720p", "1080p"]);
    // Kling 에는 fal 스키마에 resolution 이 아예 없다(2026-08-13 확인).
    // 빈 목록이면 화면이 선택지를 안 띄운다 — "고를 수 있는 척"을 막는다.
    expect(resolutionsForProject(kling)).toEqual([]);
  });

  it("기본값은 720p 다 — 지금까지 실제로 보낸 값이다", () => {
    expect(DEFAULT_RESOLUTION).toBe("720p");
    expect(resolutionForProject(seedance)).toBe("720p");
  });

  it("저장값이 그 모델에 있으면 그것을 쓴다", () => {
    const p = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(resolutionForProject(p)).toBe("1080p");
  });

  it("모델을 바꿔 해상도가 사라지면 기본값으로 떨어진다", () => {
    // Seedance 1080p 로 저장해 두고 Kling 으로 바꾼 프로젝트. 그대로 보내면 fal 이 거절한다.
    const p = { settings: { i2v_model: "kling-v3", resolution: "1080p" } };
    expect(resolutionForProject(p)).toBe("");
  });

  it("모델에 없는 해상도는 거절한다", () => {
    expect(isResolutionFor("1080p", seedance)).toBe(true);
    expect(isResolutionFor("2160p", seedance)).toBe(false);
    expect(isResolutionFor("720p", kling)).toBe(false);
  });

  it("모든 프로필이 resolutions 를 갖는다", () => {
    // 빠뜨린 프로필이 있으면 resolutionsForProject 가 undefined 를 돌려주고
    // 화면이 .map 에서 죽는다.
    for (const p of CLIP_PROFILES) {
      expect(Array.isArray(p.resolutions), `${p.prefix} 에 resolutions 가 없다`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/clip-limits.test.js -t "해상도 목록"`
Expected: FAIL — `resolutionsForProject is not a function`

- [ ] **Step 3: 최소 구현**

`lib/clip-limits.js` 의 각 프로필에 `resolutions` 를 더한다. Seedance 프로필의 `extra` 에서
`resolution: "720p"` 를 **뺀다**(요청 시점에 채운다 — Task 4):

```js
  {
    prefix: "bytedance/seedance-2.0",
    steps: null, min: 4, max: 15,
    speaks: true,
    // ★ 해상도는 여기 고정하지 않는다 — 사장님이 고른 값을 lib/i2v.js 가 싣는다.
    //   목록은 fal 이 실제로 여는 것만 둔다(안 여는 값을 두면 고른 순간 거절된다).
    resolutions: ["480p", "720p", "1080p"],
    extra: { generate_audio: true },
  },
```

Kling·LTX 프로필에는 `resolutions: []` 를 더한다. Kling 주석에 근거를 남긴다:

```js
    // ★ 이 모델에는 resolution 파라미터가 없다(2026-08-13 fal 스키마·모델 페이지 확인,
    //   원장의 성공 5건도 resolution 없이 돌았다). 빈 목록이라 화면에 선택지가 안 뜬다.
    resolutions: [],
```

파일 끝에 함수 넷을 더한다:

```js
// 옛 문서(settings.resolution 없음)가 떨어질 자리. 지금까지 fal 에 실제로 보낸 값이 720p 라
// 반대로 두면 이미 만든 프로젝트의 가격과 각인이 소급해 달라진다.
export const DEFAULT_RESOLUTION = "720p";

export function resolutionsForProject(project) {
  return clipProfileForProject(project).resolutions || [];
}

// 이 프로젝트가 실제로 쓸 해상도. 목록이 비면 빈 문자열 — 그 모델은 해상도를 안 받는다.
//
// ★ 저장값이 지금 모델에 없으면 기본값으로 떨어뜨린다. 모델을 바꿔도 옛 해상도가 남아
//   fal 이 거절하는 길을 안 만든다(Seedance 1080p → Kling 전환이 그 경우다).
export function resolutionForProject(project) {
  const list = resolutionsForProject(project);
  if (!list.length) return "";
  const saved = project?.settings?.resolution;
  return list.includes(saved) ? saved : (list.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : list[0]);
}

export function isResolutionFor(resolution, project) {
  return resolutionsForProject(project).includes(resolution);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: PASS — 새 6개 + 기존 전부.

⚠️ `extra` 에서 `resolution` 을 뺐으므로 **기존 테스트가 그것을 보고 있으면 실패**한다. 실패하면
그 테스트를 고치지 말고 **보고하라** — 어디가 그 값을 기대하는지가 Task 4 의 입력이다.

- [ ] **Step 5: 커밋**

메시지 파일에 쓴 뒤 `git commit -F`:

```
feat(clip): 모델별 해상도 목록 — Seedance 만 연다

fal 스키마에 Kling 은 resolution 이 없다(원장의 성공 5건도 그 없이 돌았다).
빈 목록이면 화면이 선택지를 안 띄운다. Seedance extra 의 720p 하드코딩을 걷어내
요청 시점에 고른 값을 싣도록 자리를 비웠다.
```

```bash
git add lib/clip-limits.js tests/clip-limits.test.js
git commit -F <메시지파일>
```

---

### Task 2: 크레딧 가격의 셋째 축

**Files:**
- Modify: `lib/pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: Task 1 의 `DEFAULT_RESOLUTION`(값만 같으면 되고 import 하지 않는다 — `pricing.js` 는 화면이 import 하므로 import 문을 늘리지 않는다. 문자열로 다시 적고 테스트가 대조한다)
- Produces:
  - `VIDEO_PRICE[model][resolution][seconds]` — Seedance 는 해상도 3단, Kling 은 `"720p"` 한 칸에 기존 값
  - `videoPrice(seconds, model, resolution)` — 셋째 인자는 선택. 없으면 `"720p"`
  - `REGEN_PRICE.clip[model][resolution]`
  - `regenPrice(kind, priorCount, model, resolution)` — 넷째 인자 선택

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("해상도별 가격", () => {
  it("옛 호출(해상도 없음)은 720p 값과 같다", () => {
    // 이 작업의 하드 제약 — 이미 만든 프로젝트의 가격이 소급해 바뀌면 안 된다
    expect(videoPrice(30, "seedance-2.0")).toBe(160);
    expect(videoPrice(30, "seedance-2.0", "720p")).toBe(160);
    expect(videoPrice(15, "seedance-2.0")).toBe(80);
  });

  it("1080p 는 720p 의 2.25배다 — 픽셀수 비", () => {
    expect(videoPrice(30, "seedance-2.0", "1080p")).toBe(360);
    expect(videoPrice(15, "seedance-2.0", "1080p")).toBe(180);
  });

  it("480p 는 720p 의 4/9 다", () => {
    expect(videoPrice(30, "seedance-2.0", "480p")).toBe(80);
    expect(videoPrice(15, "seedance-2.0", "480p")).toBe(40);
  });

  it("Kling 은 해상도를 안 받는다 — 무엇을 줘도 같은 값이다", () => {
    expect(videoPrice(30, "kling-v3")).toBe(50);
    expect(videoPrice(30, "kling-v3", "1080p")).toBe(50);
  });

  it("재생성도 해상도를 탄다", () => {
    expect(regenPrice("clip", 1, "seedance-2.0")).toBe(25);
    expect(regenPrice("clip", 1, "seedance-2.0", "1080p")).toBe(57);
    expect(regenPrice("clip", 1, "seedance-2.0", "480p")).toBe(12);
    expect(regenPrice("clip", 1, "kling-v3", "1080p")).toBe(8);
  });

  it("모르는 해상도는 720p 로 본다", () => {
    // 던지지 않는다 — 가격은 화면이 부르는 자리라 죽으면 페이지가 안 뜬다.
    // 값이 틀리는 것보다 나쁜 것은 화면이 통째로 사라지는 것이다.
    expect(videoPrice(30, "seedance-2.0", "2160p")).toBe(160);
  });

  // ★ 두 목록이 갈릴 자리를 코드가 판정한다 — tests/ad-options.test.js 와 같은 방식.
  //   가격표에 없는 해상도를 화면이 띄우면 사장님이 고른 순간 720p 값으로 조용히 청구된다.
  it("가격표와 모델 프로필의 해상도 목록이 같다", () => {
    for (const profile of CLIP_PROFILES) {
      const model = I2V_MODELS.find((m) => m.endpoint.startsWith(profile.prefix));
      if (!model) continue; // 사장님이 못 고르는 옛 모델(LTX)은 가격표에 없어도 된다
      const priced = VIDEO_PRICE[model.id];
      expect(priced, `${model.id} 가 가격표에 없다`).toBeTruthy();
      for (const res of profile.resolutions) {
        expect(priced[res], `${model.id} 의 ${res} 가격이 없다`).toBeTruthy();
      }
      // 해상도를 안 받는 모델도 720p 한 칸은 있어야 videoPrice 가 떨어질 자리가 있다
      if (!profile.resolutions.length) expect(priced["720p"]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pricing.test.js -t "해상도별 가격"`
Expected: FAIL — `videoPrice(30, "seedance-2.0", "1080p")` 가 160 을 돌려준다(셋째 인자를 안 본다).

- [ ] **Step 3: 최소 구현**

`VIDEO_PRICE` 를 세 축으로 바꾼다. **720p 열은 지금 값 그대로** 둔다:

```js
// 모델 × 해상도 × 길이. 배수 계산을 쓰지 않고 표에 박는다 — 반올림이 생기고
// 모델마다 배율이 다른 것을 못 담는다(lib/pricing.js 의 AD_VIDEO_PRICE 와 같은 판단).
//
// 원가 근거(i2v 기준): 720p $0.3024/s 는 fal 문서값. 1080p·480p 는 **계산값**이다 —
// 원가가 픽셀수(가로폭 제곱)에 비례한다는 관측에서 왔다(광고 t2v 실측 0.682/0.3034 = 2.248
// vs 1080²/720² = 2.25). 실청구와 어긋나면 이 표를 고친다.
//   1080p = 0.3024 × 2.25 ≈ 0.680/s · 480p = 0.3024 × 4/9 ≈ 0.134/s
export const VIDEO_PRICE = {
  "seedance-2.0": {
    "480p": { 15: 40, 30: 80, 45: 120, 60: 160 },
    "720p": { 15: 80, 30: 160, 45: 240, 60: 320 },
    "1080p": { 15: 180, 30: 360, 45: 540, 60: 720 },
  },
  // 해상도를 안 받는 모델도 같은 모양을 쓴다 — 두 모양이면 videoPrice 에 분기가 생긴다.
  "kling-v3": {
    "720p": { 15: 25, 30: 50, 45: 75, 60: 100 },
  },
};

// 화면이 import 하는 파일이라 lib/clip-limits.js 를 끌어오지 않는다(import 문을 늘리면
// 사슬 끝에 fs 가 닿을 수 있다). 값이 갈리는 것은 tests/pricing.test.js 가 막는다.
const PRICE_DEFAULT_RESOLUTION = "720p";
```

`videoPrice` 를 고친다:

```js
export function videoPrice(seconds, model, resolution) {
  const byRes = VIDEO_PRICE[priceModel(model)];
  // 모르는 해상도·해상도를 안 받는 모델은 720p 열로 떨어진다. 던지지 않는 이유는
  // 이 함수를 화면이 부르기 때문이다 — 값이 틀리는 것보다 화면이 사라지는 것이 나쁘다.
  const table = byRes[resolution] || byRes[PRICE_DEFAULT_RESOLUTION];
  const p = table[Number(seconds)];
  return credits(typeof p === "number" ? p : table[30]);
}
```

`REGEN_PRICE.clip` 도 같은 축으로:

```js
  clip: {
    "seedance-2.0": { "480p": 12, "720p": 25, "1080p": 57 },
    "kling-v3": { "720p": 8 },
  },
```

`regenPrice` 의 clip 분기가 해상도를 받게 한다(넷째 인자, 없으면 `"720p"`). 다른 종류
(`image`·`voice`)는 모델·해상도와 무관하므로 손대지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pricing.test.js`
Expected: PASS.

⚠️ `VIDEO_PRICE` 의 모양이 바뀌었으므로 **그 표를 직접 읽는 다른 코드가 있으면 깨진다.**
`grep -rn "VIDEO_PRICE\|REGEN_PRICE" lib/ app/ components/ tests/` 로 호출부를 전부 확인하고,
`videoPrice()`·`regenPrice()` 를 거치지 않고 표를 직접 인덱싱하는 자리가 있으면 **보고하라.**

- [ ] **Step 5: 커밋**

```
feat(pricing): 영상 가격에 해상도 축을 더한다

720p 열은 지금 값 그대로다 — 이미 만든 프로젝트의 가격이 소급해 바뀌면 안 된다.
480p·1080p 는 픽셀수 비(4/9 · 2.25)로 계산했다. 계산값이지 실측이 아니라
첫 청구서와 대조해야 한다. 해상도를 안 받는 Kling 도 같은 모양을 써서
videoPrice 에 분기를 안 만든다.
```

```bash
git add lib/pricing.js tests/pricing.test.js
git commit -F <메시지파일>
```

---

### Task 3: 낡음 각인

**Files:**
- Modify: `lib/steps.js` (`clipKey`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: Task 1 의 `resolutionForProject(project)`
- Produces: `clipKey(cut, project)` 가 해상도를 **있을 때만** 덧붙인다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("clipKey — 해상도", () => {
  const cut = { image: { url: "u" }, seconds: 5, motion: "천천히" };

  it("해상도를 안 받는 모델에서는 각인이 안 바뀐다", () => {
    // 이 작업의 하드 제약 — 붙이는 순간 이미 값을 치른 클립이 통째로 낡는다(~$9/편)
    const kling = { settings: { i2v_model: "kling-v3" } };
    const before = clipKey(cut, { settings: { i2v_model: "kling-v3" } });
    expect(clipKey(cut, kling)).toBe(before);
    expect(clipKey(cut, kling)).not.toContain("720p");
  });

  it("project 를 안 주면 해상도를 안 붙인다", () => {
    // cuts.some(clipKey) 처럼 포인트프리로 넘기면 배열 번호가 이 자리에 온다.
    // 덜 알리는 쪽이 안전하다(isImageStale 의 style_of 와 같은 방침).
    expect(clipKey(cut, 1)).not.toContain("720p");
    expect(clipKey(cut)).not.toContain("720p");
  });

  it("Seedance 는 해상도가 각인에 들어간다", () => {
    const p = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(clipKey(cut, p)).toContain("1080p");
  });

  it("해상도를 바꾸면 각인이 달라진다 — 그래야 클립이 낡는다", () => {
    const a = { settings: { i2v_model: "seedance-2.0", resolution: "720p" } };
    const b = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(clipKey(cut, a)).not.toBe(clipKey(cut, b));
  });

  it("해상도를 안 고른 Seedance 프로젝트는 720p 로 각인된다", () => {
    // resolutionForProject 가 기본값을 주므로 저장 여부와 무관하게 같은 값이 나온다.
    // 사장님이 720p 를 명시로 골라도 각인이 안 바뀐다.
    const 미선택 = { settings: { i2v_model: "seedance-2.0" } };
    const 명시 = { settings: { i2v_model: "seedance-2.0", resolution: "720p" } };
    expect(clipKey(cut, 미선택)).toBe(clipKey(cut, 명시));
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js -t "clipKey — 해상도"`
Expected: FAIL — `"1080p"` 를 안 담는다.

- [ ] **Step 3: 최소 구현**

`lib/steps.js` 상단 import 에 `resolutionForProject` 를 더하고, `clipKey` 안에서 `spoken` 을
붙이는 자리 근처에 더한다. **값이 있을 때만** 붙인다:

```js
  // 해상도가 클립 요청에 실리므로(lib/i2v.js) 바꾸면 클립이 낡아야 한다.
  //
  // ⚠️ 있을 때만 덧붙인다. 무조건 바꾸면 옛 각인이 전부 불일치가 되어 이미 값을 치른
  //    클립이 통째로 낡는다 — style_of · 자막 위치 · tone_of 에서 세 번 같은 규칙을 썼다.
  // ★ 값은 컷이 아니라 **프로젝트에서 판다**(spokenOf 와 같은 이유 — 저장해 두면
  //   저장값과 비교값이 같은 출처가 되어 바꿔도 영영 안 낡는다).
  // ★ project 가 객체가 아니면(포인트프리 유입) 빈 문자열이 나와 안 붙는다.
  const res = project && typeof project === "object" ? resolutionForProject(project) : "";
  const withRes = res ? `${withSpoken}|${res}` : withSpoken;
```

`withSpoken` 은 기존 코드에서 `spoken` 을 붙인 결과 변수명이다. 실제 변수명이 다르면 그것을
쓰고, **마지막 반환값이 `withRes` 가 되게** 한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/steps.test.js tests/staleness-ui.test.js`
Expected: PASS — 기존 낡음 테스트가 전부 그대로여야 한다.

- [ ] **Step 5: 커밋**

```
feat(staleness): 화질을 바꾸면 클립이 낡는다 — 옛 클립은 그대로 둔 채

해상도가 클립 요청에 실리므로 바꾸면 낡아야 한다. 값이 있을 때만 덧붙여
해상도를 안 받는 모델(Kling)과 옛 프로젝트의 각인을 건드리지 않는다.
값은 컷이 아니라 프로젝트에서 판다 — 저장하면 저장값과 비교값이 같은 출처가 된다.
```

```bash
git add lib/steps.js tests/steps.test.js
git commit -F <메시지파일>
```

---

### Task 4: fal 요청에 싣기

**Files:**
- Modify: `lib/i2v.js`
- Test: `tests/i2v.test.js` (없으면 만든다)

**Interfaces:**
- Consumes: Task 1 의 `resolutionForProject(project)`
- Produces: 없음 (배선)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`fetchImpl` 을 주입해 요청 본문을 잡는다.

```js
describe("i2v 요청 — 해상도", () => {
  const base = {
    imageUrl: "https://f/i.png", prompt: "p", aspect_ratio: "9:16",
    projectId: "p1", want: 5,
  };
  const ok = async () => ({ ok: true, json: async () => ({ video: { url: "https://f/v.mp4" } }) });

  it("Seedance 요청에 고른 해상도가 실린다", async () => {
    let body = null;
    await generateClip({
      ...base,
      project: { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } },
      fetchImpl: async (_u, opt) => { body = JSON.parse(opt.body); return ok(); },
    });
    expect(body.resolution).toBe("1080p");
  });

  it("해상도를 안 고르면 720p 가 실린다", async () => {
    let body = null;
    await generateClip({
      ...base,
      project: { settings: { i2v_model: "seedance-2.0" } },
      fetchImpl: async (_u, opt) => { body = JSON.parse(opt.body); return ok(); },
    });
    expect(body.resolution).toBe("720p");
  });

  it("Kling 요청에는 resolution 키가 아예 없다", async () => {
    // 모르는 필드를 보내면 거절될 수 있다 — 프로필이 안 여는 모델에는 안 싣는다
    let body = null;
    await generateClip({
      ...base,
      project: { settings: { i2v_model: "kling-v3" } },
      fetchImpl: async (_u, opt) => { body = JSON.parse(opt.body); return ok(); },
    });
    expect("resolution" in body).toBe(false);
  });
});
```

⚠️ `generateClip` 의 실제 함수명·인자 모양은 `lib/i2v.js` 를 열어 확인하고 그대로 쓴다.
가짜 모드(`fakeFal()`)가 앞에서 가로채므로 테스트에서 `SHOTFORM_FAKE` 가 켜져 있으면 안 된다 —
`vitest.setup.js` 를 확인하고, 켜져 있으면 그 테스트 안에서만 끈다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/i2v.test.js`
Expected: FAIL — `body.resolution` 이 `undefined`(프로필 `extra` 에서 뺐으므로).

- [ ] **Step 3: 최소 구현**

`lib/i2v.js` 의 본문 조립을 고친다:

```js
    // 해상도는 프로필이 여는 모델에만 싣는다. 안 여는 모델에 보내면 거절될 수 있다.
    const resolution = resolutionForProject(project);
    body: JSON.stringify({
      image_url: imageUrl, prompt, duration, aspect_ratio,
      ...(resolution ? { resolution } : {}),
      ...(profile.extra || {}),
    }),
```

`resolutionForProject` 를 import 한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/i2v.test.js`
Expected: PASS.

- [ ] **Step 5: 원가 배선 확인**

`lib/i2v.js` 가 `addRecord` 에 넘기는 `est_cost_usd` 는 `estimateCost(endpoint, amount, resolution)`
로 계산된다. **셋째 인자를 넘기는지 확인하고, 안 넘기면 넘긴다** — 안 넘기면 1080p 를 골라도
원가가 720p 로 기록되어 원장과 실청구가 갈린다. 확인만으로 끝나면 이 단계는 커밋이 없다.

- [ ] **Step 6: 커밋**

```
feat(i2v): 고른 화질을 fal 요청에 싣는다

프로필이 해상도를 여는 모델에만 싣는다 — 안 여는 모델에 모르는 필드를 보내면
거절될 수 있다. 원가 기록도 같은 값을 본다(estimateCost 의 셋째 인자).
```

```bash
git add lib/i2v.js tests/i2v.test.js
git commit -F <메시지파일>
```

---

### Task 5: 가격을 부르는 자리에 해상도 넘기기

**Files:**
- Modify: `videoPrice()`·`regenPrice()` 호출부 전부 (라우트·화면)
- Test: 해당 라우트 테스트

**Interfaces:**
- Consumes: Task 1 의 `resolutionForProject`, Task 2 의 `videoPrice(seconds, model, resolution)`
- Produces: 없음 (배선)

- [ ] **Step 1: 호출부를 전부 찾는다**

```bash
grep -rn "videoPrice\|regenPrice" lib/ app/ components/ --include=*.js --include=*.jsx
```

목록을 보고서에 적는다. **하나라도 빠뜨리면 게이트와 실제 청구가 갈린다** — 이 저장소가
겪은 사고다(광고 쪽 `chargeAd` 가 `resolution` 을 안 넘겨 1080p 를 고른 사장님에게 720p 값만
차감될 뻔했다).

- [ ] **Step 2: 실패하는 테스트를 쓴다**

**청구가 실제로 일어나는 자리부터 문다.** `POST /api/projects/[id]/clips` 가 그것이다 —
`requireVideoCharge()` 를 거쳐 정가를 걷는 유일한 통로 중 하나다.

```js
it("1080p 프로젝트는 1080p 값으로 청구된다", async () => {
  // 720p 값(160)으로 걷히면 우리가 편당 손해를 본다 — 원가가 2.25배다.
  // 청구 함수를 주입해 실제로 넘어간 크레딧을 잡는다(라우트 테스트의 기존 주입 패턴을 따른다).
  let charged = null;
  await 라우트호출({
    project: { settings: { i2v_model: "seedance-2.0", resolution: "1080p", target_seconds: 30 } },
    charge: async ({ credits }) => { charged = credits; },
  });
  expect(charged).toBe(360);
});
```

⚠️ 라우트마다 주입 방식이 다르다. **그 파일의 기존 테스트를 먼저 읽고 같은 모양으로 쓴다** —
새 방식을 들이면 다음 사람이 두 패턴을 다 알아야 한다.

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run <그 라우트 테스트>`
Expected: FAIL — 청구액이 720p 값이다.

- [ ] **Step 4: 호출부를 고친다**

각 호출부에서 `resolutionForProject(project)` 를 셋째 인자로 넘긴다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS — 전체.

- [ ] **Step 6: 커밋**

```
fix(credits): 화질이 청구액까지 관통한다

videoPrice·regenPrice 호출부가 해상도를 안 넘기면 1080p 를 골라도 720p 값만
차감된다 — 게이트와 실제 청구가 갈리는 자리다.
```

---

### Task 6: 화면 — 모델 칩 옆 화질 선택

**Files:**
- Modify: `app/create/[id]/script/page.js` (모델 칩이 있는 자리)
- Test: 화면 테스트(기존 칩 테스트 패턴을 따른다)

**Interfaces:**
- Consumes: Task 1 의 `resolutionsForProject`·`resolutionForProject`, Task 2 의 `videoPrice`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("화질 선택", () => {
  it("Seedance 를 고르면 화질 칩이 뜬다", () => {
    // 소스에 해상도 목록을 순회하는 자리가 있는지 본다(이 저장소의 화면 테스트 패턴)
  });

  it("Kling 을 고르면 화질 칩이 없다", () => {
    // resolutions 가 빈 배열이면 아무것도 안 그린다 — "고를 수 있는 척"을 막는다
  });

  it("첫 클립 뒤에는 잠긴다", () => {
    // 모델 칩과 같은 잠금 조건을 쓴다
  });
});
```

⚠️ 이 저장소의 화면 테스트는 파일마다 방식이 다르다(소스 훑기 · 렌더). **모델 칩을 검사하는
기존 테스트를 먼저 찾아 그 방식을 그대로 따른다.** 새 방식을 들이지 않는다.

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 구현**

모델 칩 옆에 화질 칩을 둔다. 규칙 셋:
- `resolutionsForProject(project).length === 0` 이면 **아무것도 안 그린다**
- 현재 선택은 `resolutionForProject(project)` 로 읽는다(저장값이 아니라)
- **모델을 바꾸면 해상도도 정합을 맞춘다** — 새 모델에 없는 값이면 그 모델 기본값으로 저장한다
- 가격 표시는 `videoPrice(seconds, model, resolution)` 로 다시 계산한다

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 컴파일 확인 — 화면을 손댔으므로 필수**

Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: 빌드 성공. **소스 훑기 테스트는 문법 오류를 못 잡는다** — 이 저장소가 문법이 깨진 채
1720 그린이었던 적이 있다.

- [ ] **Step 6: 커밋**

```
feat(ui): ②대본에서 화질을 고른다 — 모델 칩 옆

정가가 ③에서 걷히므로 화질도 결제 앞에 있어야 한다(칩이 ⑤에 있어 사고가 났던 전례).
해상도를 안 받는 모델에는 칩을 안 띄운다. 모델을 바꾸면 해상도도 그 모델 것으로 맞춘다.
```

---

### Task 7: 저장 게이트와 관통

**Files:**
- Modify: `app/api/projects/[id]/route.js` (PATCH 게이트)
- Test: `tests/cuts.test.js` 또는 프로젝트 라우트 테스트

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: 없음 (검증)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
it("모델에 없는 해상도는 저장을 거절한다", () => {
  // settings 는 화이트리스트 없이 얕게 머지되므로 여기서 막지 않으면 아무 값이나 들어가고
  // 그 값으로 유료 호출이 나간다(lib/styles.js 의 normalizeStyle 과 같은 결).
});

it("화질이 저장 → 가격 → 요청 → 각인까지 관통한다", () => {
  // 1080p 를 저장한 프로젝트에서:
  //  · videoPrice 가 1080p 값을 낸다
  //  · i2v 요청 본문에 resolution:"1080p" 가 실린다
  //  · clipKey 에 "1080p" 가 들어간다
  // 셋이 같은 출처(resolutionForProject)를 보는지가 이 테스트의 핵심이다.
});
```

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 게이트를 더한다**

PATCH 가 `settings.resolution` 을 받을 때 `isResolutionFor(v, project)` 로 판정하고, 아니면
거절한다. 기존 `style` 게이트가 있는 자리를 따른다.

- [ ] **Step 4: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린.

- [ ] **Step 5: 변이 검증**

관통 테스트가 진짜 방어하는지 확인한다. `lib/i2v.js` 에서 `resolution` 을 안 싣도록 변이시켰을 때
테스트가 FAIL 하는가. **`git checkout` 은 쓰지 말고** 백업 파일로 복원한다(이 워크트리에는 다른
세션의 미커밋 작업이 있다). 복원 뒤 `git status --short lib/` 가 비었는지 확인한다.

- [ ] **Step 6: 커밋**

```
test: 화질이 저장부터 각인까지 관통하는 것을 고정한다

저장 게이트를 더하고(settings 는 얕게 머지되므로 여기서 안 막으면 아무 값이나 들어간다)
가격·요청·각인 셋이 같은 출처를 보는지 한 테스트가 쥔다.
```

---

## 남는 것 (이 계획 밖)

- **480p·1080p 원가는 계산값이다.** 첫 실사용 청구서와 대조해야 한다. 어긋나면 `lib/costs.js` 의
  `PRICE_TABLE` 과 `lib/pricing.js` 의 `VIDEO_PRICE` 를 **함께** 고친다(두 곳이 갈리면 예산 가드가 틀린다).
- **눈 확인 미수행** — 1080p 가 실제로 720p 보다 나은지는 만들어 봐야 안다(fal 유료).
- 광고 경로는 이미 해상도가 있다 — 건드리지 않았다.
