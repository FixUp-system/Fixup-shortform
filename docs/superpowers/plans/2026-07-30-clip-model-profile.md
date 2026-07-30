# 클립 모델 프로필 + Kling v3 교체 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클립 길이 눈금을 모델별 프로필로 다뤄, `FAL_I2V_ENDPOINT` 를 바꾸면 눈금·추가 body·단가가 함께 따라오게 한다. 그 위에서 Kling v3 Standard(3~15 임의 초, 오디오 끔)를 한 컷 A/B 로 잰다.

**Architecture:** `lib/clip-limits.js` 가 눈금 하나를 아는 것을 그만두고 `PRICE_TABLE` 과 같은 prefix → 프로필 표를 갖는다. 프로필이 눈금(열거 또는 범위)과 추가 body 필드를 함께 쥔다. 서버(`lib/i2v.js` · `lib/cuts.js`)는 env 로 활성 프로필을 고르고, 화면은 기본 프로필 값을 그대로 본다(브라우저 번들에는 서버 env 가 없다). 모르는 모델은 LTX 프로필로 떨어뜨린다 — 범위 모델에 열거 눈금을 보내면 통과하지만 반대는 422 로 죽는다.

**Tech Stack:** Next.js 15 App Router, vitest, fal.run REST

설계 문서: `docs/superpowers/specs/2026-07-30-clip-model-profile-design.md` (커밋 `ed2a10a`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD` 로 브랜치도 확인한다
- 기존 테스트 **546개 그린이 하한선**
- **Task 1~5 는 유료 API 를 한 번도 부르지 않는다.** Task 6 만 fal 을 부르고 그것은 사장님 승인 게이트다
- **`CONTENT_MAX_SECONDS`(콘텐츠 상한 8초)를 건드리지 않는다** — 이미지 한 장의 정보량이고 모델과 무관하다. 두 상한을 섞지 않는다
- **`lib/subtitles.js` 의 `cutSeconds` 와 `lib/compose.js` 의 자르기를 건드리지 않는다** — 낭독이 컷 길이라는 규칙은 그대로다
- **기존 `tests/i2v.test.js`(11개) · `tests/cuts.test.js` · `tests/costs.test.js` 의 테스트를 고치지 않는다.** 그것들이 "env 를 비우면 지금과 글자 그대로 같다"의 회귀 방어선이다
- 테스트를 통과시키려고 프로덕션 코드를 맞추지 않는다. 반대도 마찬가지다. 테스트를 지우거나 skip 하지 않는다
- `npm run build` 를 돌리지 않는다 — dev 서버가 3000번에 떠 있고 `.next` 가 겹쳐 죽는다
- 한국어 주석·커밋 메시지는 기존 이력의 어조를 따른다(사장님이 읽는 말)

## 이 저장소의 규율

- 지켜져야 하는 것은 프롬프트가 아니라 **코드가 판정**한다
- **측정 없이 품질을 주장하지 않는다**
- 주석은 "무엇을 하는가"가 아니라 **"왜 이렇게 했는가"**를 적는다
- 숫자를 하드코딩하지 않는다 — 파생할 수 있으면 파생한다

---

## File Structure

**수정**
- `lib/clip-limits.js` — 프로필 표와 순수 함수(Task 1). 지금은 눈금 상수 두 개와 `fitDuration` 하나뿐이다
- `lib/i2v.js` — 활성 프로필로 눈금·추가 body·`truncated` 를 푼다(Task 2)
- `lib/cuts.js:141-155` — `splitSystem()` 이 활성 프로필에서 하한·상한을 읽는다(Task 3)
- `lib/costs.js` — `PRICE_TABLE` 에 kling standard 단가(Task 4)
- `vitest.setup.js` — `FAL_I2V_ENDPOINT` 를 지운다(Task 1). 머신 env 가 테스트 결과를 바꾸지 않게

**신설**
- `tests/clip-limits.test.js` — 프로필 고르기·두 종류 눈금(Task 1)
- `scripts/measure/compare-clip-models.mjs` — 한 컷 A/B(Task 5)

**건드리지 않음**
- `lib/subtitles.js` · `lib/compose.js` · `lib/pipeline.js` · `lib/imagegen.js` · `lib/tts.js`
- `app/create/[id]/script/page.js` · `app/create/[id]/video/page.js` (기본 프로필 값을 그대로 쓴다 — 아래 참고)

### 알아 둘 것 — 지금 `lib/clip-limits.js` 의 모양

```js
export const I2V_STEPS = [6, 8, 10, 12, 14, 16, 18, 20];
export const I2V_MAX_SECONDS = I2V_STEPS[I2V_STEPS.length - 1];

export function fitDuration(seconds) {
  const want = Number(seconds) || 1;
  return I2V_STEPS.find((s) => s >= want) ?? I2V_MAX_SECONDS;
}
```

이 파일은 **화면(클라이언트)도 import 한다** — `app/create/[id]/script/page.js:11` 과
`app/create/[id]/video/page.js:10` 이 `I2V_MAX_SECONDS` 로 "N초까지만 움직여요" 경고를 띄운다.
그래서 이 파일은 `fs` 를 끌어오면 안 되고(주석에 그 이유가 있다), 세 이름
(`I2V_STEPS` · `I2V_MAX_SECONDS` · `fitDuration`)을 **없애면 안 된다.**

### 화면이 활성 프로필을 모르는 것을 왜 받아들이는가

`process.env.FAL_I2V_ENDPOINT` 는 `NEXT_PUBLIC_` 이 아니므로 Next 가 브라우저 번들에 넣지 않는다
(그 자리는 `undefined` 가 된다). 그래서 화면의 상한 경고는 Kling(15초)에서도 **기본 프로필
값(20초)**으로 뜬다.

env 를 두 벌(`FAL_I2V_ENDPOINT` + `NEXT_PUBLIC_...`) 두는 방식은 **쓰지 않는다** — 한 군데만
빠뜨리면 어긋나고, 이 저장소가 버전 번호를 버리고 각인으로 옮긴 이유가 그것이다.

이 간극이 실제로 문제가 되는 구간은 **한 조각이 15~20초인 컷**뿐이다. 컷은 8초를 넘고 두 조각
이상이면 코드가 분해하므로(07-29), 남는 것은 "쪼갤 수 없는 조각 하나가 15초를 넘는" 극단이다.
그 컷은 서버가 `truncated: true` 로 돌려주고 ⑤화면이 그 값을 읽어 표시한다 — **판정 자체는
서버가 정확하게 한다.** 문구의 숫자만 20으로 남는다. 이번 범위에서는 그것을 고치지 않는다.

---

## Task 1: 프로필 표와 순수 함수

**Files:**
- Modify: `lib/clip-limits.js`
- Modify: `vitest.setup.js`
- Test: `tests/clip-limits.test.js` (신설)

**Interfaces:**
- Consumes: 없음 (이 파일은 아무것도 import 하지 않는다 — 그 상태를 유지한다)
- Produces:
  - `CLIP_PROFILES: Array<{prefix: string, steps: number[]|null, min?: number, max?: number, extra: object|null}>`
  - `DEFAULT_CLIP_PROFILE: object` — LTX 프로필
  - `profileFor(endpoint: string|undefined) => profile`
  - `activeClipProfile() => profile` (env 를 읽는다)
  - `fitDurationFor(profile, seconds: number) => number`
  - `minSecondsFor(profile) => number` · `maxSecondsFor(profile) => number`
  - 그대로 유지: `I2V_STEPS` · `I2V_MAX_SECONDS` · `fitDuration(seconds)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/clip-limits.test.js` 를 새로 만든다:

```js
import { describe, it, expect, afterEach } from "vitest";
import {
  CLIP_PROFILES, DEFAULT_CLIP_PROFILE, profileFor, activeClipProfile,
  fitDurationFor, minSecondsFor, maxSecondsFor,
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
} from "../lib/clip-limits";

afterEach(() => { delete process.env.FAL_I2V_ENDPOINT; });

describe("profileFor — prefix 순서가 곧 로직이다", () => {
  it("Kling v3 을 고른다", () => {
    const p = profileFor("fal-ai/kling-video/v3/standard/image-to-video");
    expect(p.steps).toBe(null);
    expect(p.min).toBe(3);
    expect(p.max).toBe(15);
  });

  it("LTX 계열을 고른다 — 2.3 도 fast 도 같은 눈금이다", () => {
    for (const id of [
      "fal-ai/ltx-2.3/image-to-video/fast",
      "fal-ai/ltx-2.3/image-to-video",
      "fal-ai/ltx-2/image-to-video/fast",
    ]) {
      expect(profileFor(id).steps).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    }
  });

  // 왜 LTX 로 떨어뜨리는가: 대칭이 아니다. 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고
  // 값만 조금 더 나가지만, 열거 모델에 7초를 보내면 422 로 죽는다(2026-07-28 에 네 컷 전부).
  it("모르는 모델은 기본 프로필(LTX)로 떨어진다", () => {
    for (const id of ["fal-ai/veo3.1/fast", "fal-ai/minimax/video", "", undefined, null]) {
      expect(profileFor(id)).toBe(DEFAULT_CLIP_PROFILE);
    }
    expect(DEFAULT_CLIP_PROFILE.steps).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it("표의 모든 프로필이 눈금을 한 종류만 갖는다", () => {
    for (const p of CLIP_PROFILES) {
      const isRange = p.steps === null;
      expect(isRange ? typeof p.min === "number" && typeof p.max === "number" : Array.isArray(p.steps)).toBe(true);
    }
  });
});

describe("fitDurationFor — 눈금 종류마다 다르게 올린다", () => {
  const ltx = profileFor("fal-ai/ltx-2.3/image-to-video/fast");
  const kling = profileFor("fal-ai/kling-video/v3/standard/image-to-video");

  it("열거 눈금은 다음 칸으로 올린다", () => {
    expect(fitDurationFor(ltx, 5)).toBe(6);
    expect(fitDurationFor(ltx, 6)).toBe(6);
    expect(fitDurationFor(ltx, 9)).toBe(10);
    expect(fitDurationFor(ltx, 25)).toBe(20);
  });

  // 임의 초라 낭독을 그대로 살 수 있다 — 이 프로필을 넣은 이유다.
  // 07-30 실측: 컷 6개 낭독 32초에 LTX 눈금으로 40초를 샀다(8초 = $0.32 가 잘려나갔다).
  it("범위 눈금은 정수로 올리고 하한·상한에 묶는다", () => {
    expect(fitDurationFor(kling, 7)).toBe(7);
    expect(fitDurationFor(kling, 6.2)).toBe(7);
    expect(fitDurationFor(kling, 2)).toBe(3);
    expect(fitDurationFor(kling, 0)).toBe(3);
    expect(fitDurationFor(kling, 20)).toBe(15);
  });

  it("내리지 않는다 — 내리면 소리가 그림보다 길어져 뒤가 잘린다", () => {
    for (const s of [3.1, 4, 5.5, 7.2]) {
      expect(fitDurationFor(kling, s)).toBeGreaterThanOrEqual(s);
      expect(fitDurationFor(ltx, s)).toBeGreaterThanOrEqual(s);
    }
  });

  it("하한·상한을 눈금 종류와 무관하게 읽는다", () => {
    expect(minSecondsFor(ltx)).toBe(6);
    expect(maxSecondsFor(ltx)).toBe(20);
    expect(minSecondsFor(kling)).toBe(3);
    expect(maxSecondsFor(kling)).toBe(15);
  });
});

describe("activeClipProfile — env 가 정한다", () => {
  it("env 를 비우면 기본 프로필이다", () => {
    expect(activeClipProfile()).toBe(DEFAULT_CLIP_PROFILE);
  });

  it("env 를 바꾸면 그 모델의 프로필이다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(maxSecondsFor(activeClipProfile())).toBe(15);
  });
});

// 화면(script·video 페이지)이 이 세 이름을 import 한다. 없애면 빌드가 깨진다.
describe("하위호환 — 화면이 쓰는 이름은 기본 프로필 값이다", () => {
  it("눈금 상수가 그대로다", () => {
    expect(I2V_STEPS).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    expect(I2V_MAX_SECONDS).toBe(20);
  });

  it("fitDuration 은 env 와 무관하게 기본 프로필로 푼다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(fitDuration(7)).toBe(8); // 활성 프로필이면 7 이지만, 이 함수는 기본 프로필이다
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Users/fixup/shotform-video
npx vitest run tests/clip-limits.test.js
```

기대: `CLIP_PROFILES` 등이 없어 실패한다(`does not provide an export named`).

- [ ] **Step 3: `lib/clip-limits.js` 를 고친다**

파일 머리말 주석은 **유지하고**(fs 를 끌어오면 안 되는 이유가 적혀 있다), 눈금 설명 주석을
프로필 표 위로 옮긴다. 아래를 기존 `I2V_STEPS`/`I2V_MAX_SECONDS`/`fitDuration` 자리에 넣는다:

```js
// 클립 모델마다 받는 길이가 다르다. PRICE_TABLE 과 같은 방식으로 prefix 로 고른다.
//
// 왜 표로 옮겼는가: 모델은 FAL_I2V_ENDPOINT(env)로 바뀌는데 눈금은 코드에 박혀 있었다.
// env 를 바꾸는 순간 코드가 모르는 눈금으로 요청이 갔다. 주석으로 경고해 두었지만
// 적어 둔 것은 판정이 아니다.
//
// 눈금은 두 종류다:
//   steps 열거 — LTX 계열. 임의의 초를 보내면 422 로 거절한다:
//     Input should be 6, 8, 10, 12, 14, 16, 18 or 20
//   min~max 범위 — Kling v3. 정수 초를 그 사이에서 자유롭게 받는다.
//     낭독을 그대로 살 수 있어 올림 손실이 사라진다(07-30 실측: 32초 낭독에 40초를 샀다)
//
// ⚠️ prefix 순서가 곧 로직이다 — 더 구체적인 것이 위에 온다. PRICE_TABLE 과 같은 함정이다.
export const CLIP_PROFILES = [
  {
    prefix: "fal-ai/kling-video/v3",
    steps: null, min: 3, max: 15,
    // 오디오를 끄는 것이 코드 보장이어야 단가가 $0.084 다(켜면 $0.126). 무엇보다 클립에
    // 소리가 실리면 우리 낭독과 두 겹이 되고, 낭독이 컷 길이를 정하는 뼈대와 어긋난다.
    extra: { generate_audio: false },
  },
  { prefix: "fal-ai/ltx-2", steps: [6, 8, 10, 12, 14, 16, 18, 20], extra: null },
];

// 모르는 모델이 떨어질 자리. LTX 를 고르는 이유는 대칭이 아니기 때문이다 —
// 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고 값만 조금 더 나가지만,
// 열거 모델에 7초를 보내면 422 로 죽는다. 모르면 "비싸지만 도는" 쪽을 준다.
export const DEFAULT_CLIP_PROFILE = CLIP_PROFILES[CLIP_PROFILES.length - 1];

export function profileFor(endpoint) {
  const id = String(endpoint || "");
  return CLIP_PROFILES.find((p) => id.startsWith(p.prefix)) || DEFAULT_CLIP_PROFILE;
}

// 지금 도는 모델의 프로필.
//
// ⚠️ 브라우저 번들에서는 이 env 가 undefined 다(NEXT_PUBLIC_ 이 아니라 Next 가 넣지 않는다)
//    → 화면에서는 기본 프로필로 떨어진다. 그것을 받아들인 이유는 계획 문서에 적어 두었다:
//    상한 경고의 숫자만 20 으로 남고, 잘림 판정 자체는 서버가 정확하게 한다.
export function activeClipProfile() {
  return profileFor(process.env.FAL_I2V_ENDPOINT);
}

export function minSecondsFor(profile) {
  return profile.steps ? profile.steps[0] : profile.min;
}

export function maxSecondsFor(profile) {
  return profile.steps ? profile.steps[profile.steps.length - 1] : profile.max;
}

// 낭독 길이를 모델이 받는 길이로 **올린다**. 상한을 넘으면 상한에 묶는다.
// 내리지 않는 이유: 내리면 소리가 그림보다 길어져 뒤가 잘린다.
//
// 올린 만큼 클립이 낭독보다 길어지는데, 그 차이는 **합성이 잘라낸다**
// (trim=duration=낭독, lib/compose.js). 그래서 자막·완성본 길이는 낭독으로 잰다.
export function fitDurationFor(profile, seconds) {
  const want = Number(seconds) || 1;
  if (profile.steps) return profile.steps.find((s) => s >= want) ?? maxSecondsFor(profile);
  const ceil = Math.ceil(want);
  if (ceil < profile.min) return profile.min;
  if (ceil > profile.max) return profile.max;
  return ceil;
}

// 화면(script·video 페이지)이 쓰는 이름들 — 기본 프로필에 묶어 둔다.
// 활성 프로필로 바꾸면 안 된다: 브라우저에는 env 가 없어 서버와 값이 갈리고,
// 갈린 값으로 경고를 띄우면 사장님이 보는 숫자가 요청과 달라진다.
export const I2V_STEPS = DEFAULT_CLIP_PROFILE.steps;
export const I2V_MAX_SECONDS = maxSecondsFor(DEFAULT_CLIP_PROFILE);
export function fitDuration(seconds) {
  return fitDurationFor(DEFAULT_CLIP_PROFILE, seconds);
}
```

- [ ] **Step 4: 머신 env 가 테스트를 흔들지 않게 한다**

`vitest.setup.js` 끝에 두 줄을 더한다:

```js
// 클립 모델 env 는 테스트에서 지운다 — .env.local 을 Kling 으로 바꿔 두면 눈금 기대값이
// 머신마다 달라진다. 활성 프로필을 재는 테스트는 자기 안에서 직접 세운다.
delete process.env.FAL_I2V_ENDPOINT;
```

- [ ] **Step 5: 통과를 확인한다**

```bash
npx vitest run tests/clip-limits.test.js
```

기대: PASS.

- [ ] **Step 6: 회귀를 확인한다**

```bash
npx vitest run
```

기대: 546 + 새 테스트가 전부 그린. **`tests/i2v.test.js` 와 `tests/cuts.test.js` 가 하나도
깨지지 않아야 한다** — 그것이 "env 를 비우면 지금과 같다"의 증거다.

- [ ] **Step 7: 커밋**

```bash
cd /c/Users/fixup/shotform-video
git rev-parse --abbrev-ref HEAD   # feature/video-compose 인지 확인
git add lib/clip-limits.js vitest.setup.js tests/clip-limits.test.js
git commit -m "feat: 클립 눈금을 모델별 프로필 표로 — 열거와 범위 두 종류

모델은 env 로 바뀌는데 눈금은 코드에 박혀 있었다. 주석으로 경고해 두었지만 적어 둔 것은
판정이 아니다. PRICE_TABLE 처럼 prefix 로 고르고, 모르는 모델은 LTX 로 떨어뜨린다 —
범위 모델에 열거 눈금을 보내면 통과하지만 반대는 422 로 죽는다.

화면이 쓰는 세 이름은 기본 프로필에 묶어 그대로 뒀다. 브라우저에는 서버 env 가 없어
활성 프로필로 바꾸면 서버와 값이 갈린다."
```

---

## Task 2: i2v 가 활성 프로필을 쓴다

**Files:**
- Modify: `lib/i2v.js`
- Test: `tests/i2v.test.js` (새 describe 블록을 **더한다**. 기존 11개는 손대지 않는다)

**Interfaces:**
- Consumes: Task 1 의 `activeClipProfile()` · `fitDurationFor(profile, seconds)` · `maxSecondsFor(profile)`
- Produces: `generateClip` 의 시그니처·반환값은 그대로 (`{url, seconds, truncated}`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/i2v.test.js` 의 마지막 `});` **뒤에** 아래를 더한다. 파일 위쪽 import 줄에
`I2V_MAX_SECONDS` 는 이미 있으므로 건드리지 않는다:

```js
// 모델을 바꾸면 눈금과 body 가 함께 따라와야 한다 — 눈금만 따라오면 오디오가 켜진 채로
// 청구되고(단가 $0.084 → $0.126) 클립에 소리가 실려 낭독과 두 겹이 된다.
describe("generateClip — 활성 프로필이 요청을 정한다", () => {
  const KLING = "fal-ai/kling-video/v3/standard/image-to-video";
  const sender = () => {
    const box = {};
    return {
      box,
      fetchImpl: async (url, opts) => {
        box.url = url;
        box.sent = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
      },
    };
  };

  it("Kling 에서는 낭독 초를 그대로 산다 — 올림 손실이 사라진다", async () => {
    process.env.FAL_I2V_ENDPOINT = KLING;
    const { box, fetchImpl } = sender();
    const r = await generateClip({ imageUrl: "i", seconds: 7, aspect_ratio: "9:16", fetchImpl });
    expect(box.sent.duration).toBe(7);
    expect(r.seconds).toBe(7);
    expect(box.url).toContain(KLING);
  });

  it("Kling 에서는 오디오를 끈다", async () => {
    process.env.FAL_I2V_ENDPOINT = KLING;
    const { box, fetchImpl } = sender();
    await generateClip({ imageUrl: "i", seconds: 5, aspect_ratio: "9:16", fetchImpl });
    expect(box.sent.generate_audio).toBe(false);
  });

  it("LTX 에는 그 필드를 보내지 않는다 — 모르는 필드는 거절될 수 있다", async () => {
    const { box, fetchImpl } = sender();
    await generateClip({ imageUrl: "i", seconds: 5, aspect_ratio: "9:16", fetchImpl });
    expect("generate_audio" in box.sent).toBe(false);
    expect(box.sent.duration).toBe(6);
  });

  it("잘림 판정도 활성 프로필의 상한으로 한다", async () => {
    process.env.FAL_I2V_ENDPOINT = KLING;
    const { box, fetchImpl } = sender();
    const r = await generateClip({ imageUrl: "i", seconds: 16, aspect_ratio: "9:16", fetchImpl });
    expect(box.sent.duration).toBe(15);
    expect(r.truncated).toBe(true);
    // 기본 프로필 상한(20)으로 재면 16초가 잘리지 않은 것으로 나온다 — 그 실수를 여기서 막는다
    expect(I2V_MAX_SECONDS).toBe(20);
  });

  it("가짜 모드도 활성 프로필의 초를 돌려준다", async () => {
    process.env.FAL_I2V_ENDPOINT = KLING;
    process.env.SHOTFORM_FAKE = "1";
    const r = await generateClip({ imageUrl: "img", seconds: 7, aspect_ratio: "9:16" });
    expect(r.seconds).toBe(7);
  });
});
```

`afterEach` 가 파일 위쪽에 이미 있는데 `SHOTFORM_FAKE` 만 지운다. 그 줄을 이렇게 고친다
(**기존 테스트의 동작은 바뀌지 않는다** — 지우는 env 가 하나 늘 뿐이다):

```js
afterEach(() => { delete process.env.SHOTFORM_FAKE; delete process.env.FAL_I2V_ENDPOINT; });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/i2v.test.js
```

기대: 새 5개가 FAIL(`duration` 이 8, `generate_audio` 가 undefined). 기존 11개는 PASS.

- [ ] **Step 3: `lib/i2v.js` 를 고친다**

import 줄(5행)과 재수출(9행), 그리고 `generateClip` 앞부분을 고친다:

```js
import {
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
  activeClipProfile, fitDurationFor, maxSecondsFor,
} from "./clip-limits";

// 길이 눈금은 lib/clip-limits.js 에 있다 — 화면도 봐야 해서 fs 의존을 끊어 두었다.
// 여기서 다시 내보내는 이유는 기존 import 경로(lib/i2v)를 깨지 않기 위해서다.
export { I2V_STEPS, I2V_MAX_SECONDS, fitDuration };
```

`generateClip` 안에서 세 줄을 바꾼다:

```js
  // 모델마다 받는 길이와 body 가 다르다 — env 가 고른 프로필이 그것을 쥔다
  const profile = activeClipProfile();
  const want = Number(seconds) || 1;
  const duration = fitDurationFor(profile, want);
  // 낭독이 상한을 넘으면 뒤가 잘린다 — 눈금에 맞춘 것(6초로 올림 등)은 잘린 것이 아니다
  const truncated = want > maxSecondsFor(profile);
```

body 조립은 프로필의 추가 필드를 펼친다:

```js
    // prompt 가 이 컷이 어떻게 움직일지를 정한다 — 없으면 모델 재량이 된다(lib/cuts.js buildClipPrompt)
    // profile.extra 는 모델별 필드다(Kling 의 generate_audio:false). 모르는 필드를 다른 모델에
    // 보내면 거절될 수 있어 코드에 분기를 흩지 않고 프로필이 쥔다.
    body: JSON.stringify({ image_url: imageUrl, prompt, duration, aspect_ratio, ...(profile.extra || {}) }),
```

`endpoint` 를 정하는 줄(20행)은 그대로 둔다 — 프로필과 같은 env 를 읽으므로 어긋나지 않는다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/i2v.test.js
```

기대: 16개 전부 PASS.

- [ ] **Step 5: 회귀를 확인한다**

```bash
npx vitest run
```

기대: 전부 그린.

- [ ] **Step 6: 커밋**

```bash
git add lib/i2v.js tests/i2v.test.js
git commit -m "feat: 클립 요청이 활성 프로필을 따른다 — 눈금과 body 가 함께

눈금만 따라오면 Kling 에서 오디오가 켜진 채 청구되고(＄0.084 → ＄0.126) 클립에 소리가 실려
낭독과 두 겹이 된다. 잘림 판정도 활성 프로필의 상한으로 한다 — 기본값 20 으로 재면
16초 컷이 잘리지 않은 것으로 나온다."
```

---

## Task 3: 컷 분할 프롬프트가 활성 프로필을 읽는다

**Files:**
- Modify: `lib/cuts.js` (2행 import, `splitSystem()` 141-155행)
- Test: `tests/cuts.test.js` (새 it 을 **더한다**. 114행의 기존 테스트는 손대지 않는다)

**Interfaces:**
- Consumes: Task 1 의 `activeClipProfile()` · `minSecondsFor` · `maxSecondsFor`
- Produces: `splitSystem()` 은 내부 함수다(export 되지 않는다). `buildSplitMessages(units)` 의 시그니처는 그대로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 114행 테스트가 있는 describe 안에 아래를 더한다. 기존 테스트는
`I2V_STEPS[0]` 과 `I2V_MAX_SECONDS`(기본 프로필)를 보므로 **env 를 비운 상태로 그대로 통과한다**:

```js
  // 대본은 모델을 모르고 컷 분할부터 안다. 모델을 바꾸면 이 문장이 따라 움직여야 한다 —
  // Kling 은 하한이 3초라 짧은 컷을 만드는 데 주저할 이유가 없다(LTX 하한 6초에서는 손실이었다).
  it("모델을 바꾸면 알려 주는 길이도 바뀐다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    try {
      const { system } = buildSplitMessages(["한 조각."]);
      expect(system).toContain("3~15초");
      expect(system).not.toContain("6~20초");
    } finally {
      delete process.env.FAL_I2V_ENDPOINT;
    }
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/cuts.test.js
```

기대: 새 테스트가 FAIL(`6~20초` 가 그대로 들어 있다).

- [ ] **Step 3: `lib/cuts.js` 를 고친다**

2행 import 를 바꾼다. `I2V_STEPS` · `I2V_MAX_SECONDS` 는 **뺀다** — 이 파일에서 그 둘을 쓰는
자리는 142·143행(`splitSystem`)뿐이고, 그것이 프로필로 바뀌면 쓰이지 않는다(2026-07-30 확인):

```js
import { activeClipProfile, minSecondsFor, maxSecondsFor } from "./clip-limits.js";
```

> ⚠️ `CONTENT_MAX_SECONDS`(8초)는 `lib/cuts.js:34` 가 직접 정의하고 export 한다 —
> `clip-limits.js` 에서 오는 값이 아니다. 이 import 와 무관하니 건드리지 않는다.
> 바꾼 뒤 `grep -n "I2V_STEPS\|I2V_MAX_SECONDS" lib/cuts.js` 가 **아무것도 찾지 못해야** 한다.

`splitSystem()` 의 첫 두 줄을 바꾼다:

```js
function splitSystem() {
  // 지금 도는 모델의 하한·상한이다. 눈금 종류(열거/범위)와 무관하게 읽는다.
  const profile = activeClipProfile();
  const lo = minSecondsFor(profile);
  const hi = maxSecondsFor(profile);
```

나머지 본문은 그대로다 — `${lo}~${hi}초` 가 이미 파생값을 쓴다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/cuts.test.js
```

기대: 전부 PASS(기존 것 포함).

- [ ] **Step 5: 회귀를 확인한다**

```bash
npx vitest run
```

- [ ] **Step 6: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "feat: 컷 분할이 활성 모델의 길이를 알려 준다

대본은 모델을 모르고 컷 분할부터 안다. Kling 은 하한이 3초라 짧은 컷을 만드는 데 주저할
이유가 없다 — LTX 하한 6초에서는 3초 컷이 6초를 사는 손실이었다.
콘텐츠 상한 8초는 건드리지 않았다(모델과 무관하다)."
```

---

## Task 4: 단가표에 Kling Standard

**Files:**
- Modify: `lib/costs.js` (`PRICE_TABLE`)
- Test: `tests/costs.test.js` (새 it 을 **더한다**)

**Interfaces:**
- Consumes: 없음
- Produces: `estimateCost("fal-ai/kling-video/v3/standard/...", seconds)` 가 `seconds × 0.084`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/costs.test.js` 의 `describe("estimateCost", ...)` 안에 더한다:

```js
  // Kling v3 Standard 는 오디오를 끄면 ＄0.084/s, 켜면 ＄0.126/s 다.
  // 오디오를 끄는 것이 코드 보장이므로(lib/clip-limits.js 의 프로필) standard 는 audio-off 값이다.
  // ⚠️ 더 구체적인 prefix 가 위에 있어야 한다 — 아래 두 값이 같아지면 순서가 뒤집힌 것이다.
  it("kling v3 standard 는 audio-off 단가로 잰다", () => {
    expect(estimateCost("fal-ai/kling-video/v3/standard/image-to-video", 7)).toBeCloseTo(0.588, 3);
    expect(estimateCost("fal-ai/kling-video/v3/pro/image-to-video", 7)).toBeCloseTo(0.882, 3);
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/costs.test.js
```

기대: 첫 줄이 FAIL(0.882 가 나온다 — `kling-video/v3` 가 $0.126 으로 삼킨다).

> ⚠️ 기존 8행 테스트가 `kling-video/v3/standard/text-to-video` 를 **0.63**(5초 × $0.126)으로
> 고정하고 있다. 그 테스트는 **고치지 않는다**(Global Constraints). 그러므로 새 prefix 는
> `.../v3/standard/image-to-video` 처럼 **i2v 로 좁혀야** 한다 — t2v standard 는 지금 값
> 그대로 남는다(우리가 부르지 않는 경로이고, 실청구를 확인한 적도 없다).

- [ ] **Step 3: `lib/costs.js` 를 고친다**

`PRICE_TABLE` 의 kling 줄들을 이렇게 바꾼다:

```js
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  // Kling v3 Standard i2v 는 오디오를 끄면 ＄0.084/s 다(켜면 ＄0.126). 끄는 것이
  // lib/clip-limits.js 의 프로필로 코드 보장이라 여기 값은 audio-off 다.
  // v3 보다 위에 둔다 — "fal-ai/kling-video/v3" 가 standard 도 삼킨다.
  { prefix: "fal-ai/kling-video/v3/standard/image-to-video", perSec: 0.084 },
  { prefix: "fal-ai/kling-video/v3", perSec: 0.126 },
  { prefix: "fal-ai/kling-video", perSec: 0.05 },
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/costs.test.js
```

기대: 전부 PASS(기존 prefix 순서 테스트 포함).

- [ ] **Step 5: 회귀를 확인한다**

```bash
npx vitest run
```

- [ ] **Step 6: 커밋**

```bash
git add lib/costs.js tests/costs.test.js
git commit -m "feat: Kling v3 Standard i2v 단가 — audio-off ＄0.084/s

오디오를 끄는 것이 프로필로 코드 보장이라 audio-off 값을 쓴다. v3 보다 위에 둔다 —
prefix 가 뒤집히면 조용히 ＄0.126 으로 기록된다(나노바나나에서 겪은 함정)."
```

---

## Task 5: 한 컷 A/B 측정 스크립트 (0원)

**Files:**
- Create: `scripts/measure/compare-clip-models.mjs`
- Modify: `.env.local.example` (안내 한 줄)

**Interfaces:**
- Consumes: Task 1 의 `profileFor` · `fitDurationFor`; 기존 `buildClipPrompt(cut)` (`lib/cuts.js:318`)
- Produces: CLI — `node scripts/measure/compare-clip-models.mjs <projectId> <컷번호> [모델A] [모델B]`

- [ ] **Step 1: 스크립트를 만든다**

`compare-image-models.mjs` 와 같은 골격이다(순수 node 가 `lib/` 를 읽을 수 있게 확장자를 붙인
import 사슬을 쓴다). `scripts/measure/compare-clip-models.mjs`:

```js
// 같은 이미지·같은 움직임 지시를 두 클립 모델에 보내 나란히 놓는다.
//
//   node scripts/measure/compare-clip-models.mjs <projectId> <컷번호> [모델A] [모델B]
//   기본값: A=fal-ai/ltx-2.3/image-to-video/fast (지금)
//           B=fal-ai/kling-video/v3/standard/image-to-video (후보)
//
// ⚠️ 유료다. 컷 하나에 A 1개 + B 1개다(7초 컷이면 약 ＄0.91).
//    사장님 승인 없이 돌리지 않는다.
//
// 왜 같은 이미지여야 하는가: 이미지가 다르면 무엇이 효과였는지 못 가린다. 페달 사건에서
// 배운 것이다 — 클립을 다섯 번 다시 만들었지만 결함은 이미지 단계의 것이었다.
//
// 왜 저장된 프로젝트를 안 고치는가: 컷별 [다시 만들기]를 쓰면 클립이 덮여 비교 대상이 사라진다.
// 여기서는 URL 만 출력하고 프로젝트 파일은 읽기만 한다.
//
// 비용 기록(costs.json)에는 남기지 않는다 — lib/costs.js 를 끌어오면 의존이 커진다.
// 대시보드와 대조할 때 이 몫을 빼고 본다.
import { readFileSync } from "fs";
import path from "path";
import { buildClipPrompt } from "../../lib/cuts.js";
import { profileFor, fitDurationFor } from "../../lib/clip-limits.js";

const [projectId, cutArg, modelA = "fal-ai/ltx-2.3/image-to-video/fast",
       modelB = "fal-ai/kling-video/v3/standard/image-to-video"] = process.argv.slice(2);
if (!projectId || !cutArg) {
  console.error("사용법: node scripts/measure/compare-clip-models.mjs <projectId> <컷번호> [모델A] [모델B]");
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error("FAL_KEY 가 없다. .env.local 의 값을 환경변수로 넣고 돌린다.");
  process.exit(1);
}

const DATA = process.env.SHOTFORM_DATA_DIR || "data";
const project = JSON.parse(readFileSync(path.join(DATA, "projects", `${projectId}.json`), "utf8"));
const cut = (project.cuts || [])[Number(cutArg) - 1];
if (!cut) { console.error(`컷 ${cutArg} 이 없다 (컷 ${(project.cuts || []).length}개)`); process.exit(1); }
if (!cut.image?.url) { console.error(`컷 ${cutArg} 에 이미지가 없다 — ④이미지를 먼저 만든다`); process.exit(1); }

const aspect = project.settings?.aspect_ratio || "9:16";
const prompt = buildClipPrompt(cut);

async function generate(endpoint) {
  const profile = profileFor(endpoint);
  const duration = fitDurationFor(profile, cut.seconds);
  const input = { image_url: cut.image.url, prompt, duration, aspect_ratio: aspect, ...(profile.extra || {}) };
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { duration, error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}` };
  const data = await res.json();
  return { duration, url: data?.video?.url || null };
}

console.log(`프로젝트 ${projectId} · 컷 ${cutArg} · 낭독 ${cut.seconds}초 · ${aspect}`);
console.log(`움직임: ${cut.motion || "(없음 — 기본값)"}`);
console.log(`화면:   ${cut.shows || "(없음)"}`);
console.log(`이미지: ${cut.image.url}\n`);

for (const [tag, endpoint] of [["A", modelA], ["B", modelB]]) {
  const r = await generate(endpoint);
  console.log(`${tag} ${endpoint}`);
  console.log(`   ${r.duration}초 · ${r.url || "실패 " + r.error}\n`);
}

console.log(`두 영상을 나란히 열어 넷을 본다:`);
console.log(`  1. 지시한 움직임이 실제로 일어나는가`);
console.log(`  2. 시키지 않은 움직임이 있는가 (페달 없이 굴러가던 그 결함)`);
console.log(`  3. 손·신체가 움직이는 동안 무너지지 않는가`);
console.log(`  4. 첫 프레임이 우리가 만든 이미지와 같은가`);
console.log(`판정은 사장님이 한다 — VLM 에 묻지 않는다(07-29 에 결함 넷을 전부 통과시켰다).`);
```

- [ ] **Step 2: 돌리지 않고 문법만 확인한다**

```bash
node --check scripts/measure/compare-clip-models.mjs
```

기대: 출력 없음(통과). **이 태스크에서 스크립트를 실행하지 않는다 — 유료다.**

- [ ] **Step 3: `.env.local.example` 에 안내를 더한다**

이 파일에는 지금 `FAL_I2V_ENDPOINT` 줄이 **없다**(2026-07-30 확인 — 그래서 모델을 바꿀 수
있다는 것을 아무도 모른다). `FAL_IMAGE_ENDPOINT` 줄 아래에 세 줄을 더한다:

```
# 클립 모델. 눈금·오디오 설정은 lib/clip-limits.js 의 프로필이 따라온다.
#   fal-ai/kling-video/v3/standard/image-to-video  → 3~15 임의 초, ＄0.084/s(오디오 끔)
FAL_I2V_ENDPOINT=fal-ai/ltx-2.3/image-to-video/fast
```

> `.env.local.example` 은 예시 파일이라 기본값(LTX)을 적는다. 실제 전환은 Task 6 Step 6 에서
> `.env.local` 에만 한다.

- [ ] **Step 4: 회귀를 확인한다**

```bash
npx vitest run
```

- [ ] **Step 5: 커밋**

```bash
git add scripts/measure/compare-clip-models.mjs .env.local.example
git commit -m "feat: 두 클립 모델을 같은 이미지로 나란히 놓는 측정 스크립트

같은 image.url·같은 움직임 지시로 보낸다 — 이미지가 다르면 무엇이 효과였는지 못 가린다.
저장된 프로젝트는 읽기만 한다(컷별 다시 만들기를 쓰면 클립이 덮여 비교 대상이 사라진다).

아직 돌리지 않는다. 유료라 사장님 승인 게이트다."
```

---

## Task 6: 실제로 비교한다 — **사장님 검토 게이트**

> ⚠️ **사장님 승인 없이 시작하지 않는다.**

**예상 비용:** 컷4(낭독 7초) 기준 약 **$0.91** — A(LTX) 8초 × $0.04 = $0.32 + B(Kling) 7초 × $0.084 = $0.59

**Files:** 없음 (검증). 발견한 것만 고친다.

**전제:** ④이미지가 끝나 있어야 한다(컷에 `image.url` 이 있어야 함). 없으면 이 태스크를 멈추고
보고한다 — 이미지를 사는 것은 별개 승인이다(6컷 × $0.08 = $0.48).

- [ ] **Step 1: 승인을 받는다** — 무엇을 확인하려는지, 예상 비용, 대상 컷을 알리고 답을 받는다

> **예산에 대해 두 가지.** ① 이 스크립트는 `assertBudget` 을 지나지 않는다(fal 을 직접
> 부른다) — 가드가 막아 주지 않으니 승인이 유일한 문이다. ② 기록도 `costs.json` 에 남지
> 않으므로 대시보드와 대조할 때 이 몫($0.91)을 빼고 본다.
> 채택 뒤 **앱에서 도는 클립은 가드를 지난다**. 2026-07-30 기준 이 프로젝트 누적 $1.03 /
> 프로젝트 예산 $5 · 전체 $15.87 / $25 다. 6컷을 Kling 으로 한 벌 만들면 $2.69 이므로
> 이미지($0.48)까지 합쳐 $4.20 — 한 번은 통과하지만 두 번째 실험에서 막힌다.
> 그때는 `SHOTFORM_BUDGET_PROJECT_USD` 를 올린다(가드는 "앞으로 쓸 돈"이 아니라 기록된
> 총액을 잰다).

- [ ] **Step 2: 돌린다**

```bash
cd /c/Users/fixup/shotform-video
export FAL_KEY=$(grep '^FAL_KEY=' .env.local | cut -d= -f2-)
node scripts/measure/compare-clip-models.mjs f31c1c7f-b905-4819-bf62-e423e821b71b 4
```

컷4 는 `밤 조명 아래, 20대 후반 여성이 앰플을 한 손에 들고 얼굴에 몇 방울 떨어뜨리는
미디엄 샷`(낭독 7초)이다. **순서가 있는 동작**이라 움직임이 가장 까다롭다.

> ⚠️ 프로젝트의 컷이 다시 나뉘었으면 번호가 달라진다. `node -e` 로 컷 목록을 먼저 확인하고
> "사람이 제품을 다루는 컷"을 고른다.

- [ ] **Step 3: 눈금이 맞았는지 먼저 본다**

B 가 `422` 로 실패했으면 **에러 본문에 허용값이 담겨 온다**(`Input should be ...`).
그러면 `lib/clip-limits.js` 의 Kling 프로필(`min`/`max`, 또는 `steps` 열거로 전환)을 그 값으로
고치고 Task 1 의 테스트를 함께 고친 뒤 다시 돌린다. **이때 A 는 다시 사지 않는다** —
B 만 다시 부르도록 모델 인자를 같은 값으로 두 번 넘긴다:

```bash
node scripts/measure/compare-clip-models.mjs <projectId> 4 \
  fal-ai/kling-video/v3/standard/image-to-video fal-ai/kling-video/v3/standard/image-to-video
```

> 같은 모델을 두 번 사는 것이 아깝다면 스크립트를 고치지 말고 위 명령의 출력 중 하나만 본다 —
> 여기서 배선을 바꾸면 다음 비교가 어긋난다.

- [ ] **Step 4: 사장님이 판정한다**

두 영상을 나란히 놓고 넷을 본다. **판정은 사장님이 한다.**

- [ ] 지시한 움직임이 실제로 일어나는가 (`motion` 대비)
- [ ] 시키지 않은 움직임이 있는가 (페달 없이 굴러가던 그 결함)
- [ ] 손·신체가 움직이는 동안 무너지지 않는가
- [ ] 첫 프레임이 우리가 만든 이미지와 같은가

**채택 규칙: 넷 중 셋 이상에서 B 가 낫거나 같으면 채택.**

- [ ] **Step 5: 결과를 적는다**

`docs/models-and-costs.md` 에 남긴다:
- §1 표의 ⑤영상 줄에 채택한 모델과 단가
- §2 의 ⑤영상 절에 **실제 허용 눈금**(Step 3 에서 확인한 것)과 넷 각각의 판정
- §5 남은 대조에 **Kling 실청구 대조**(장당이 아니라 초당 $0.084 인지)를 더한다

- [ ] **Step 6: 채택했으면 `.env.local` 을 바꾼다**

```
FAL_I2V_ENDPOINT=fal-ai/kling-video/v3/standard/image-to-video
```

**여기서 처음 바꾼다.** 미리 바꾸면 비교 대상이던 옛 모델이 파이프라인에서 사라진다.
`.env.local` 은 저장소에 없으므로 커밋 대상이 아니다. **dev 서버를 재시작해야 적용된다**
(env 는 부팅 때 읽는다 — 07-30 에 이미지 모델에서 같은 자리를 밟았다).

- [ ] **Step 7: 커밋**

```bash
git add docs/models-and-costs.md
git commit -m "docs: 클립 모델 비교 결과

[어느 쪽을 채택했는지, 넷 각각이 어땠는지, 실제 허용 눈금]"
```

---

## 검증 요약

| | 무엇으로 | 언제 |
|---|---|---|
| 프로필 고르기·폴백 | `tests/clip-limits.test.js` | Task 1 |
| 두 종류 눈금 올림 | `tests/clip-limits.test.js` | Task 1 |
| 추가 body·잘림 판정 | `tests/i2v.test.js` | Task 2 |
| 컷 분할 프롬프트 연동 | `tests/cuts.test.js` | Task 3 |
| 단가표 prefix 순서 | `tests/costs.test.js` | Task 4 |
| **되돌릴 수 있음** | env 를 비우면 기존 546 개가 그대로 그린 | Task 1~4 각 마지막 |
| 실제 화질·움직임 | 한 컷 A/B ($0.91) | Task 6 |

**Task 1~5 는 $0 이다.** Task 6 만 fal 을 부른다.
