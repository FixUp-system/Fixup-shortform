# 광고 영상 한 방 만들기 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 옵션 + 프롬프트 + 사진 한 번으로 15초 CF·브랜드 영상을 만드는 **제3의 경로**를 낸다. 기존 6단계와 `/auto` 는 손대지 않는다.

**Architecture:** 같은 `projects` 테이블에 `doc.kind = "ad"` 문서를 얹는다. LLM 이 시나리오를 쓰고(무료·승인 게이트), 승인하면 크레딧을 받고 fal 의 Seedance 2.0 fast 가 영상과 소리를 **한 번에** 만든다. 컷 분할·이미지 생성·낭독·ffmpeg 합성이 없다.

**Tech Stack:** Next.js App Router (JS, TS 아님) · Supabase(jsonb 통짜 문서) · Vitest · fal.ai

설계 원문: `docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md`

---

## Global Constraints

설계의 "지켜야 할 것"을 그대로 옮긴다. **모든 태스크의 요구사항에 이 절이 암묵적으로 포함된다.**

- ★★ **기존 시스템에 바로 적용하지 않는다.** 별도 브랜치(`feat/ad-video-oneshot`)에서만 작업한다. 기존 파일 수정은 **덧붙이기만** — 기존 분기의 동작을 바꾸는 수정은 하지 않는다
- ★★ **관문은 기존 테스트다.** 착수 시점 실측: `npx vitest run` = **1334 passed / 10 skipped / 73 files passed / 2 skipped**. 숫자는 낡으므로 **착수할 때 다시 센다.** 매 태스크 끝에서 유지되거나 늘어야 한다. 줄거나 깨지면 **그 자리에서 멈추고 보고한다**
- ★★ **`kind` 없음 = 기존 종류다.** 옛 문서에는 `kind` 가 없다. 반대로 두면(없으면 ad) 기존 프로젝트 전체가 새 경로로 흘러간다
- ★ **`lib/ad/options.js` · `lib/ad/models.js` · `lib/pricing.js` 에 `import` 문을 두지 마라.** 화면("use client")이 읽으므로 `fs` 가 딸려오면 번들이 깨진다. 순수 데이터·순수 함수만
- ★ **`isFakeFor` 의 판정 방향을 뒤집지 마라.** `lib/costs.js` 의 그 함수 위 주석이 이유를 적고 있다 — 뒤집으면 모르는 엔드포인트가 fal 축으로 떨어져 `SHOTFORM_FAKE=fal` 에서 `assertBudget` 게이트가 통째로 꺼진다. **접두사 목록만 넓힌다**
- 가격 숫자를 라우트·화면에 흘리지 않는다. `lib/pricing.js` 하나다
- 모델 엔드포인트 문자열을 두 군데 두지 않는다. `lib/ad/models.js` 하나다
- **새 npm 의존성 금지. 새 CSS 금지** — 기존 `.chips`/`.chip`/`.chip.on` 등을 쓴다
- **유료 생성(fal)은 실행 전 반드시 사용자 승인.** 무료로 볼 수 있는 것을 먼저 다 한다
- **예상 못 한 실패는 고치지 말고 보고한다**
- 파일마다 `git add <파일들>` 로 명시 스테이징한다. **`git add -A` 금지**

**모델 표 (여러 태스크가 이 값을 글자 그대로 쓴다):**

| id | 엔드포인트 | 길이 | 720p 초당 원가 |
|---|---|---|---|
| `seedance-2.0-fast` | `bytedance/seedance-2.0/fast/text-to-video` | 4~15 정수 | $0.2419 |
| | `bytedance/seedance-2.0/fast/image-to-video` | | $0.2419 |
| | `bytedance/seedance-2.0/fast/reference-to-video` | | $0.2419 |

**정가:** 광고 영상 15초 = **65 크레딧**. 시나리오 생성·다시 쓰기 = **0(무료), 프로젝트당 20회 상한**.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

## ★ 병렬 가능 여부

**Task 1 · 2 · 3 · 4 · 6 은 동시에 돌려도 된다** — 파일이 갈린다.

| Task | 건드리는 파일 |
|---|---|
| 0 | `scripts/measure/probe-seedance.mjs` (유료·승인 필요) |
| 1 | `lib/ad/models.js` · `tests/ad-models.test.js` |
| 2 | `lib/ad/options.js` · `tests/ad-options.test.js` |
| 3 | `lib/costs.js` · `tests/ad-costs.test.js` |
| 4 | `lib/pricing.js` · `tests/pricing.test.js` |
| 5 | `lib/charges.js` · `tests/ad-charges.test.js` (Task 4 뒤) |
| 6 | `lib/projects.js` · `lib/store/memory.js` · `lib/store/supabase.js` · `tests/ad-kind.test.js` |
| 7 | `app/api/projects/[id]/**` · `tests/ad-isolation.test.js` (Task 6 뒤) |
| 8 | `lib/ad/scenario.js` · `tests/ad-scenario.test.js` (Task 1·2 뒤) |
| 9 | `lib/ad/generate.js` · `tests/ad-generate.test.js` (Task 1·3 뒤) |
| 10 | `lib/ad/pipeline.js` · `tests/ad-pipeline.test.js` (Task 5·8·9 뒤) |
| 11~13 | `app/api/ads/**` · `tests/ad-routes.test.js` (Task 6·10 뒤) |
| 14~15 | `app/ads/**` · `components/ProjectCards.jsx` (Task 11~13 뒤) |
| 16 | 관통 검증 (전부 뒤) |

---

## Task 0: 탐침 — Seedance 2.0 fast 를 한 번 재본다 (★유료·사용자 승인 필수)

**왜 먼저 하나:** 설계의 "아직 모르는 것" 1·2·3 이 전부 이 한 번에 답한다. 특히 **2.0 fast 가 오디오를 안 내면 v1 의 전제가 무너진다**(자막도 소리도 없는 영상이 된다). 구현을 다 하고 알면 늦다.

**값:** 4초 × $0.2419 = **약 $0.97 × 2회 = 약 $2.** 15초를 안 사고 최소 길이로 잰다.

**Files:**
- Create: `scripts/measure/probe-seedance.mjs`

**Interfaces:**
- Produces: 없음(제품 코드가 아니다). 산출물은 **문서에 적는 답 3개**다

- [ ] **Step 1: 탐침 스크립트를 쓴다**

`scripts/measure/probe-seedance.mjs`:

```js
// Seedance 2.0 fast 탐침 — 값을 치르기 전에 세 가지를 확인한다.
//   ① 오디오가 나오는가 (안 나오면 v1 전제가 무너진다)
//   ② 한국어 발화가 납품 가능한가
//   ③ reference-to-video 가 로고·라벨을 얼마나 지키는가
//
// ⚠️ 이 스크립트는 우리 원장(cost_records)을 안 거친다 — fal 을 직접 부른다.
//    쓴 돈은 fal 대시보드에서 확인하고 손으로 적는다.
//
// 실행: FAL_KEY=... node scripts/measure/probe-seedance.mjs [로고이미지경로]
import { readFile, writeFile } from "fs/promises";

const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 가 필요해요");

const SECONDS = 4;            // 최소 길이로 잰다 — 값을 아끼려고
const BASE = "bytedance/seedance-2.0/fast";

async function call(path, input) {
  const res = await fetch(`https://fal.run/${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} 실패 (${res.status}) ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const logoPath = process.argv[2];

// ① + ② 한국어 나레이션이 있는 t2v
const t2v = await call("text-to-video", {
  prompt:
    "A premium skincare ampoule bottle on a marble table, slow push-in, soft window light. " +
    "A calm Korean female voiceover says in Korean: \"매일 아침, 피부가 달라집니다.\"",
  duration: SECONDS,
  aspect_ratio: "9:16",
  resolution: "720p",
});
console.log("① t2v 응답 키:", Object.keys(t2v));
console.log("   video.url:", t2v?.video?.url);
console.log("   ★ 이 mp4 를 내려받아 오디오 트랙이 있는지, 한국어가 들리는지 직접 듣는다");

// ③ 로고를 참조로 넣은 r2v
if (logoPath) {
  const bytes = await readFile(logoPath);
  const ext = logoPath.split(".").pop().toLowerCase();
  const dataUri = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`;
  const r2v = await call("reference-to-video", {
    prompt:
      "The product from the reference image sits on a clean studio backdrop. " +
      "Slow orbit around it, then a close-up on the label. Keep the label text exact.",
    image_urls: [dataUri],
    duration: SECONDS,
    aspect_ratio: "9:16",
    resolution: "720p",
  });
  console.log("③ r2v 응답 키:", Object.keys(r2v));
  console.log("   video.url:", r2v?.video?.url);
  console.log("   ★ 라벨 글자가 원본과 같은지 프레임을 멈춰 확인한다");
} else {
  console.log("③ 건너뜀 — 로고 이미지 경로를 인자로 주면 잰다");
}

await writeFile(
  "probe-seedance-result.json",
  JSON.stringify({ t2v, r2v: logoPath ? "위 로그 참고" : null }, null, 2)
);
console.log("\n응답 원문을 probe-seedance-result.json 에 남겼다");
```

- [ ] **Step 2: ★ 사용자에게 승인을 받는다**

돌리기 전에 **반드시** 묻는다: "탐침 2회에 약 $2 가 나갑니다. 돌릴까요?" 승인 없이 실행하지 않는다. 이 저장소의 규칙이다.

- [ ] **Step 3: 돌리고 답 3개를 얻는다**

Run: `FAL_KEY=<키> node scripts/measure/probe-seedance.mjs assets/refs/<로고파일>`

확인할 것:
1. 응답에 `video.url` 이 있는가, 필드 이름이 `video.url` 이 맞는가 (Task 9 가 이 이름을 쓴다)
2. mp4 에 **오디오 트랙이 있는가** — `ffprobe` 또는 재생으로 확인
3. 한국어 발음·억양이 납품 가능한가
4. r2v 의 라벨 글자가 원본과 같은가

- [ ] **Step 4: 설계 문서의 "아직 모르는 것"에 답을 적는다**

`docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md` 의 1·2·3번 항목 아래에 실측 결과를 덧붙인다. 추정으로 적지 않는다 — 본 것만 적는다.

- [ ] **Step 5: ★ 판정하고 멈출지 정한다**

- **오디오가 안 나온다** → **멈추고 보고한다.** v1 전제가 무너졌다. 설계를 고쳐야 한다(standard 티어로 올리거나 자막을 되살린다)
- **한국어가 못 쓸 수준이다** → 멈추고 보고한다. 나레이션 언어 옵션의 뜻이 달라진다
- **둘 다 괜찮다** → Task 1 로 간다

- [ ] **Step 6: 커밋**

```bash
git add scripts/measure/probe-seedance.mjs docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md
git commit -m "measure: Seedance 2.0 fast 탐침 — 오디오·한국어·로고 정확도 실측"
```

---

## Task 1: `lib/ad/models.js` — 모델 표

**Files:**
- Create: `lib/ad/models.js`
- Test: `tests/ad-models.test.js`

**Interfaces:**
- Produces:
  - `AD_MODELS` — `[{ id, label, endpoints: {t2v, i2v, r2v}, minSeconds, maxSeconds, perSecUsd }]`
  - `DEFAULT_AD_MODEL: "seedance-2.0-fast"`
  - `adModel(id) -> model` — 모르는 id 는 기본 모델
  - `adEndpoint(modelId, kind) -> string` — `kind` 는 `"t2v"|"i2v"|"r2v"`. 모르는 kind 는 **던진다**
  - `AD_SECONDS: [15]` · `isAdSeconds(n) -> boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-models.test.js`:

```js
// 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
// 값보다 "표 밖에 문자열이 없다"와 "모르는 값이 어디로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import {
  AD_MODELS, DEFAULT_AD_MODEL, AD_SECONDS,
  adModel, adEndpoint, isAdSeconds,
} from "../lib/ad/models.js";

describe("광고 모델 표", () => {
  it("기본 모델이 표에 있다", () => {
    expect(AD_MODELS.some((m) => m.id === DEFAULT_AD_MODEL)).toBe(true);
  });

  it("모델마다 엔드포인트 셋을 다 든다", () => {
    for (const m of AD_MODELS) {
      expect(typeof m.endpoints.t2v).toBe("string");
      expect(typeof m.endpoints.i2v).toBe("string");
      expect(typeof m.endpoints.r2v).toBe("string");
    }
  });

  it("adModel 은 모르는 id 를 기본 모델로 받는다", () => {
    expect(adModel("없는모델").id).toBe(DEFAULT_AD_MODEL);
    expect(adModel(undefined).id).toBe(DEFAULT_AD_MODEL);
  });

  it("adEndpoint 가 세 갈래를 돌려준다", () => {
    expect(adEndpoint(DEFAULT_AD_MODEL, "t2v")).toBe("bytedance/seedance-2.0/fast/text-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "i2v")).toBe("bytedance/seedance-2.0/fast/image-to-video");
    expect(adEndpoint(DEFAULT_AD_MODEL, "r2v")).toBe("bytedance/seedance-2.0/fast/reference-to-video");
  });

  it("모르는 갈래는 0 이나 폴백이 아니라 던진다 — 조용히 틀린 모델로 가면 안 된다", () => {
    expect(() => adEndpoint(DEFAULT_AD_MODEL, "x2v")).toThrow();
  });

  it("v1 이 받는 길이는 15초 하나다", () => {
    expect(AD_SECONDS).toEqual([15]);
    expect(isAdSeconds(15)).toBe(true);
    expect(isAdSeconds(30)).toBe(false);
    expect(isAdSeconds("15")).toBe(false);
  });

  it("모델 길이 범위 안에 15초가 들어간다", () => {
    const m = adModel(DEFAULT_AD_MODEL);
    expect(m.minSeconds).toBeLessThanOrEqual(15);
    expect(m.maxSeconds).toBeGreaterThanOrEqual(15);
  });

  it("import 문이 없다 — 화면이 읽어도 fs 가 안 딸려온다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/models.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-models.test.js`
Expected: FAIL — `Cannot find module '../lib/ad/models.js'`

- [ ] **Step 3: 최소 구현**

`lib/ad/models.js`:

```js
// 광고 경로의 모델 표 — 엔드포인트 문자열이 사는 유일한 자리.
//
// ⚠️ 이 파일은 화면("use client")도 import 한다. **import 문을 두지 마라** —
//    순수 데이터·순수 함수만 있어야 번들에 fs 가 안 섞인다.
//    (lib/pricing.js·lib/styles.js·lib/aspects.js 와 같은 규율이다.)
//
// 모델 id 가 `bytedance/…` 라 `fal-ai/` 로 시작하지 않는다. 그래서 lib/costs.js 의
// 가짜 판정과 원가표가 이 접두사를 따로 알아야 한다(Task 3).

export const AD_MODELS = [
  {
    id: "seedance-2.0-fast",
    label: "기본",
    hint: "15초 · 소리까지 한 번에",
    endpoints: {
      t2v: "bytedance/seedance-2.0/fast/text-to-video",
      i2v: "bytedance/seedance-2.0/fast/image-to-video",
      r2v: "bytedance/seedance-2.0/fast/reference-to-video",
    },
    minSeconds: 4,
    maxSeconds: 15,
    // 720p fast. 원가표(lib/costs.js)와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
    perSecUsd: 0.2419,
  },
];

export const DEFAULT_AD_MODEL = "seedance-2.0-fast";

// v1 이 받는 길이. 배열로 두는 이유는 30·45·60 을 여기에 더하면 끝나게 하려고다.
export const AD_SECONDS = [15];

export function isAdSeconds(n) {
  return AD_SECONDS.includes(n);
}

// 모르는 id 는 기본 모델이다 — 옛 문서가 값을 안 들었을 때 죽지 않게.
// (문서에는 만들 때 명시 저장하므로 정상 흐름에서는 여기 안 온다.)
export function adModel(id) {
  return AD_MODELS.find((m) => m.id === id) || AD_MODELS.find((m) => m.id === DEFAULT_AD_MODEL);
}

// 모르는 갈래는 **던진다.** 오타로 조용히 다른 모델을 부르면 값이 나가고 결과가 다르다 —
// lib/pricing.js 의 regenPrice 가 모르는 종류에 던지는 것과 같은 원칙이다.
export function adEndpoint(modelId, kind) {
  const e = adModel(modelId).endpoints[kind];
  if (!e) throw new Error(`모르는 영상 갈래: ${kind}`);
  return e;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-models.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트가 그대로인지 본다**

Run: `npx vitest run`
Expected: 착수 시점 개수 이상, 실패 0

- [ ] **Step 6: 커밋**

```bash
git add lib/ad/models.js tests/ad-models.test.js
git commit -m "feat(ad): 모델 표 — 엔드포인트 문자열을 한 곳에 둔다"
```

---

## Task 2: `lib/ad/options.js` — 옵션 세 축

**Files:**
- Create: `lib/ad/options.js`
- Test: `tests/ad-options.test.js`

**Interfaces:**
- Produces:
  - `AD_FORMATS` · `AD_MOODS` · `AD_LANGS` — 각 `[{ id, label, ... }]`
  - `AD_STYLE_LINES` — `{ [styleId]: "영상 프롬프트용 문구" }`
  - `DEFAULT_AD_OPTIONS` — `{ format, mood, narration_lang, style }`
  - `normalizeAdOptions(input) -> { format, mood, narration_lang, style }` — 모르는 값은 **던진다**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-options.test.js`:

```js
// 옵션 세 축 — 화면이 그리는 목록이자 라우트가 검증하는 닫힌 목록이다.
// 두 벌이 되면 화면에는 있는데 서버가 거절하는 값이 생긴다(aspects.js 가 같은 이유로 표다).
import { describe, it, expect } from "vitest";
import {
  AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES,
  DEFAULT_AD_OPTIONS, normalizeAdOptions,
} from "../lib/ad/options.js";
import { STYLE_PRESETS } from "../lib/styles.js";

describe("광고 옵션", () => {
  it("세 축이 다 비어 있지 않다", () => {
    expect(AD_FORMATS.length).toBeGreaterThan(0);
    expect(AD_MOODS.length).toBeGreaterThan(0);
    expect(AD_LANGS.length).toBeGreaterThan(0);
  });

  it("포맷마다 시나리오 뼈대가 있다 — LLM 이 이 문구를 쓴다", () => {
    for (const f of AD_FORMATS) {
      expect(typeof f.beat).toBe("string");
      expect(f.beat.length).toBeGreaterThan(0);
    }
  });

  it("화풍은 styles.js 의 id 를 쓰되 문구는 따로 든다", () => {
    // id 는 공유한다 — 목록이 두 벌이 되면 화면과 서버가 갈린다
    for (const id of Object.keys(AD_STYLE_LINES)) {
      expect(STYLE_PRESETS.some((s) => s.id === id)).toBe(true);
    }
    // 문구는 갈라 둔다 — styles.js 것은 이미지 프롬프트용이라 영상에 그대로 실으면 어색하다
    const photo = STYLE_PRESETS.find((s) => s.id === "photo");
    expect(AD_STYLE_LINES.photo).not.toBe(`${photo.medium}. ${photo.finish}`);
  });

  it("styles.js 의 모든 화풍에 영상 문구가 있다 — 화면에 있는데 서버가 모르면 안 된다", () => {
    for (const s of STYLE_PRESETS) {
      expect(typeof AD_STYLE_LINES[s.id]).toBe("string");
    }
  });

  it("기본값이 전부 목록 안에 있다", () => {
    expect(AD_FORMATS.some((f) => f.id === DEFAULT_AD_OPTIONS.format)).toBe(true);
    expect(AD_MOODS.some((m) => m.id === DEFAULT_AD_OPTIONS.mood)).toBe(true);
    expect(AD_LANGS.some((l) => l.id === DEFAULT_AD_OPTIONS.narration_lang)).toBe(true);
    expect(typeof AD_STYLE_LINES[DEFAULT_AD_OPTIONS.style]).toBe("string");
  });

  it("normalizeAdOptions 는 빈 입력을 기본값으로 채운다", () => {
    expect(normalizeAdOptions({})).toEqual(DEFAULT_AD_OPTIONS);
    expect(normalizeAdOptions(undefined)).toEqual(DEFAULT_AD_OPTIONS);
  });

  it("모르는 값은 조용히 기본값이 되지 않고 던진다", () => {
    // ★ 고른 것과 만들어지는 것이 다르면 아무도 못 알아본다(styles.js 의 normalizeStyle 과 같은 판단)
    expect(() => normalizeAdOptions({ format: "없는포맷" })).toThrow();
    expect(() => normalizeAdOptions({ mood: "없는분위기" })).toThrow();
    expect(() => normalizeAdOptions({ narration_lang: "jp" })).toThrow();
    expect(() => normalizeAdOptions({ style: "없는화풍" })).toThrow();
  });

  it("import 문이 없다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/options.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-options.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/ad/options.js`:

```js
// 광고 영상 옵션 세 축 — 포맷·분위기·나레이션 언어. 화풍은 lib/styles.js 의 id 를 쓴다.
//
// ⚠️ 이 파일도 화면이 import 한다. **import 문을 두지 마라.**
//    그래서 styles.js 의 id 를 여기에 **글자로 적는다** — 목록이 갈릴 위험이 있지만,
//    tests/ad-options.test.js 가 두 목록이 어긋나는 순간 실패한다(코드가 판정한다).
//
// ⚠️ 아래 문구는 **초안이다.** styles.js 의 프리셋이 그랬듯 실제 결과를 나란히 보고
//    확정한다. 측정 없이 품질을 주장하지 않는다.

// 포맷 — 시나리오의 뼈대다. LLM 이 이 beat 에 맞춰 15초를 짠다. 가장 크게 작용하는 축.
export const AD_FORMATS = [
  { id: "hero", label: "제품 히어로",
    beat: "제품이 주인공이다. 등장 → 클로즈업 → 쓰는 순간 → 마무리 한 컷." },
  { id: "unboxing", label: "언박싱",
    beat: "손이 상자를 연다 → 꺼낸다 → 첫인상. 손과 제품이 화면을 채운다." },
  { id: "before_after", label: "비포·애프터",
    beat: "문제 상황을 먼저 보여준다 → 전환 → 달라진 결과. 대비가 분명해야 한다." },
  { id: "story", label: "브랜드 스토리",
    beat: "장면 몇 개로 분위기를 쌓고 마지막에 로고로 닫는다. 설명하지 않는다." },
  { id: "testimonial", label: "사용 후기",
    beat: "사람이 카메라를 보고 말한다. 나레이션이 주인공이고 화면은 그것을 받친다." },
];

// 분위기 — 음악·조명·편집 속도에 작용한다.
export const AD_MOODS = [
  { id: "bright", label: "밝고 경쾌한", line: "bright and upbeat, airy daylight, quick lively cuts" },
  { id: "premium", label: "고급스러운", line: "premium and restrained, soft directional light, slow deliberate camera" },
  { id: "dynamic", label: "역동적인", line: "energetic, punchy motion, fast camera moves and snappy transitions" },
  { id: "warm", label: "감성적인", line: "warm and intimate, golden hour light, gentle handheld feel" },
];

// 나레이션 언어. v1 은 둘이다.
// ⚠️ 별도 파라미터가 있는지 확인하지 못했다 — 지금은 프롬프트에 명시해서 넘긴다.
export const AD_LANGS = [
  { id: "ko", label: "한국어", line: "Korean" },
  { id: "en", label: "영어", line: "English" },
];

// 화풍 — id 는 lib/styles.js 와 같다. 문구만 영상용으로 다시 썼다.
// styles.js 의 medium/finish 는 **정지 이미지** 프롬프트용이라 영상에 그대로 실으면 어색하다
// ("High-quality photographic still" 을 영상에 요구하는 꼴이 된다).
export const AD_STYLE_LINES = {
  photo: "live-action cinematic footage, realistic lighting, shallow depth of field",
  illust: "hand-drawn 2D animated look, soft pastel palette, clean bold outlines",
  anime: "Japanese anime style animation, cel shading, vibrant colors",
  studio: "clean studio product footage, seamless pale backdrop, even softbox lighting",
};

export const DEFAULT_AD_OPTIONS = {
  format: "hero",
  mood: "premium",
  narration_lang: "ko",
  style: "photo",
};

// 모르는 값은 **던진다.** 조용히 기본값으로 떨어뜨리면 사장님이 고른 것과 만들어지는 것이
// 달라지고, 그 차이를 아무도 못 알아본다(lib/styles.js 의 normalizeStyle 과 같은 판단).
export function normalizeAdOptions(input) {
  const src = input || {};
  const pick = (list, key, fallback) => {
    const v = src[key];
    if (v === undefined || v === null) return fallback;
    if (!list.some((x) => x.id === v)) throw new Error(`모르는 ${key} 예요: ${v}`);
    return v;
  };
  const style = src.style === undefined || src.style === null ? DEFAULT_AD_OPTIONS.style : src.style;
  // ★ 대괄호 접근으로 판정하지 마라. AD_STYLE_LINES 는 평범한 객체라 Object.prototype 을
  //   상속한다 — `AD_STYLE_LINES["constructor"]` 가 함수라서 truthy 가 되고, `style:"constructor"`
  //   가 검증을 통과한다. 그 값이 저장되면 나중에 프롬프트 자리에 **문자열이 아니라 함수**가
  //   잡혀 $3.63 짜리 호출이 쓰레기 지시문으로 나간다. 자기 소유 키만 인정한다.
  if (!Object.keys(AD_STYLE_LINES).includes(style)) throw new Error(`모르는 style 예요: ${style}`);
  return {
    format: pick(AD_FORMATS, "format", DEFAULT_AD_OPTIONS.format),
    mood: pick(AD_MOODS, "mood", DEFAULT_AD_OPTIONS.mood),
    narration_lang: pick(AD_LANGS, "narration_lang", DEFAULT_AD_OPTIONS.narration_lang),
    style,
  };
}
```

⚠️ `AD_STYLE_LINES` 는 `lib/styles.js` 의 `STYLE_PRESETS` 를 전부 덮어야 한다. `styles.js` 에 프리셋이 더 있으면(테스트가 실패하면) **거기 있는 id 를 전부 채운다.** 임의로 빼지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-options.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`

- [ ] **Step 6: 커밋**

```bash
git add lib/ad/options.js tests/ad-options.test.js
git commit -m "feat(ad): 옵션 세 축 — 포맷·분위기·언어. 모르는 값은 던진다"
```

---

## Task 3: `lib/costs.js` — ★가짜 모드와 원가표 (가장 위험한 태스크)

**왜 위험한가:** 지금 `isFakeFor` 는 `fal-ai/` 로 시작하지 않으면 전부 LLM 축으로 본다. Seedance 는 `bytedance/` 로 시작하므로 **`SHOTFORM_FAKE=fal` 에서 진짜 호출이 나간다** — 0원인 줄 알고 돌린 테스트가 $3.63 을 쓴다.

**Files:**
- Modify: `lib/costs.js` (`PRICE_TABLE` 에 한 줄, `isFakeFor` 를 접두사 목록으로)
- Test: `tests/ad-costs.test.js`

**Interfaces:**
- Consumes: Task 1 의 엔드포인트 문자열
- Produces: `isFakeFor(endpoint)` 가 `bytedance/` 를 fal 축으로 본다 · `estimateCost` 가 seedance 를 $0 이 아니게 센다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-costs.test.js`:

```js
// ★ 이 파일의 첫 단정 하나가 "SHOTFORM_FAKE=fal 에서 $3.63 이 안 나간다"의 증거다.
import { describe, it, expect, afterEach } from "vitest";
import { isFakeFor, estimateCost } from "../lib/costs.js";
import { adEndpoint, DEFAULT_AD_MODEL, adModel } from "../lib/ad/models.js";

const T2V = adEndpoint(DEFAULT_AD_MODEL, "t2v");

describe("광고 모델과 비용 축", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("★ SHOTFORM_FAKE=fal 이면 seedance 는 가짜다 — 아니면 진짜 돈이 나간다", () => {
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor(T2V)).toBe(true);
  });

  it("SHOTFORM_FAKE 가 없으면 진짜다", () => {
    expect(isFakeFor(T2V)).toBe(false);
  });

  it("판정 방향은 그대로다 — 모르는 엔드포인트는 fal 축으로 안 떨어진다", () => {
    // fail-closed: SHOTFORM_FAKE=fal 에서 모르는 것은 "가짜"가 아니어야 예산 게이트가 산다
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor("누가봐도/모르는것")).toBe(false);
    expect(isFakeFor("openai/gpt-4o")).toBe(false);
  });

  it("SHOTFORM_FAKE=all 이면 셋 다 가짜다", () => {
    process.env.SHOTFORM_FAKE = "all";
    expect(isFakeFor(T2V)).toBe(true);
    expect(isFakeFor("fal-ai/nano-banana-2")).toBe(true);
    expect(isFakeFor("openai/gpt-4o")).toBe(true);
  });

  it("원가표가 seedance 를 기본 단가가 아니라 제 단가로 센다", () => {
    const perSec = adModel(DEFAULT_AD_MODEL).perSecUsd;
    expect(estimateCost(T2V, 15)).toBeCloseTo(perSec * 15, 6);
    // 기본 단가($0.1/s)로 떨어지면 15초가 $1.5 로 기록돼 원장과 전역 상한이 함께 무력해진다
    expect(estimateCost(T2V, 15)).not.toBeCloseTo(0.1 * 15, 6);
  });

  it("엔드포인트 셋 다 같은 단가로 잡힌다", () => {
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(estimateCost(adEndpoint(DEFAULT_AD_MODEL, kind), 1)).toBeCloseTo(0.2419, 6);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-costs.test.js`
Expected: FAIL — 첫 단정이 `false` 를 받는다(가장 중요한 그 단정이다)

- [ ] **Step 3: `lib/costs.js` 를 고친다 — 덧붙이기만**

`PRICE_TABLE` 배열의 **끝 근처**에 한 줄을 더한다(다른 항목의 순서를 바꾸지 않는다):

```js
  // 광고 경로(lib/ad). fast 티어 720p — t2v/i2v/r2v 가 같은 단가다.
  // ⚠️ lib/ad/models.js 의 perSecUsd 와 **같은 값이어야 한다** — 갈리면 예산 가드가 틀린다.
  { prefix: "bytedance/seedance-2.0/fast", perSec: 0.2419 },
  { prefix: "bytedance/seedance-2.0", perSec: 0.3024 },
```

`isFakeFor` 를 접두사 **목록**으로 바꾼다. 위 주석 블록은 그대로 두고, 아래만 고친다:

```js
// fal 로 나가는 엔드포인트의 접두사 목록.
// ★ 새 공급자를 붙일 때 여기에 더한다. 안 더하면 그 호출이 LLM 축으로 분류되어
//   SHOTFORM_FAKE=fal 에서 **진짜 돈이 나간다**(0원인 줄 알고 돌린 테스트가 값을 쓴다).
//   Seedance 가 `bytedance/` 라서 실제로 그 자리에 있었다.
const FAL_PREFIXES = ["fal-ai/", "bytedance/"];

export function isFakeFor(endpoint) {
  const id = String(endpoint || "");
  return FAL_PREFIXES.some((p) => id.startsWith(p)) ? fakeFal() : fakeLlm();
}
```

★ **판정 방향은 그대로다.** `openai/` 를 묻는 형태로 뒤집지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-costs.test.js`
Expected: PASS

- [ ] **Step 5: ★ 기존 비용 테스트가 전부 그대로인지 본다**

Run: `npx vitest run tests/costs.test.js tests/budget.test.js tests/budget-limits.test.js tests/budget-user.test.js tests/budget-http.test.js tests/fake.test.js tests/llm-gate.test.js`
Expected: 전부 PASS. **하나라도 깨지면 멈추고 보고한다** — 기존 동작을 바꾼 것이다

- [ ] **Step 6: 전체 테스트**

Run: `npx vitest run`

- [ ] **Step 7: 커밋**

```bash
git add lib/costs.js tests/ad-costs.test.js
git commit -m "feat(ad): 가짜 모드가 bytedance 를 fal 로 본다 + seedance 원가표"
```

---

## Task 4: `lib/pricing.js` — 광고 정가

**Files:**
- Modify: `lib/pricing.js` (덧붙이기만)
- Test: `tests/pricing.test.js` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Produces: `AD_VIDEO_PRICE = { 15: 65 }` · `adVideoPrice(seconds) -> number` · `MAX_SCENARIO_TRIES = 20`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pricing.test.js` **끝에** 다음 블록을 덧붙인다(기존 블록은 손대지 않는다). import 줄에 새 이름을 더한다:

```js
import {
  VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice,
  AD_VIDEO_PRICE, adVideoPrice, MAX_SCENARIO_TRIES,
} from "../lib/pricing.js";
import { AD_SECONDS } from "../lib/ad/models.js";
```

```js
describe("광고 영상 정가", () => {
  it("v1 이 받는 길이 전부에 값이 있다", () => {
    for (const s of AD_SECONDS) {
      expect(typeof AD_VIDEO_PRICE[s]).toBe("number");
      expect(AD_VIDEO_PRICE[s]).toBeGreaterThan(0);
    }
  });

  it("15초가 65 크레딧이다 — 원가 $3.63 에 약 8% 여유", () => {
    expect(AD_VIDEO_PRICE[15]).toBe(65);
  });

  it("★ 기존 영상 정가와 섞이지 않는다 — 표가 둘이다", () => {
    expect(AD_VIDEO_PRICE[15]).not.toBe(VIDEO_PRICE[15]);
  });

  it("adVideoPrice 는 목록 밖 값을 15초 값으로 받는다", () => {
    expect(adVideoPrice(15)).toBe(AD_VIDEO_PRICE[15]);
    expect(adVideoPrice(null)).toBe(AD_VIDEO_PRICE[15]);
    expect(adVideoPrice(30)).toBe(AD_VIDEO_PRICE[15]);
  });

  it("시나리오 다시 쓰기 상한이 있다 — 무료·무제한이면 원가가 샌다", () => {
    expect(MAX_SCENARIO_TRIES).toBe(20);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pricing.test.js`
Expected: FAIL — `AD_VIDEO_PRICE` 가 undefined

- [ ] **Step 3: `lib/pricing.js` 끝에 덧붙인다**

```js
// ── 광고 경로(lib/ad) ────────────────────────────────────────────────────
// 표를 따로 둔다. 기존 VIDEO_PRICE 와 섞으면 같은 "15초"가 두 뜻이 된다 —
// 기존은 컷 여러 개를 합친 15초이고, 이쪽은 Seedance 클립 하나다. 원가가 다르다.
//
// 원가: 2.0 fast 720p $0.2419/s × 15초 = $3.63. 1크레딧 ≈ 원가 $0.06 → 60.5 →
// 올림해서 65(약 8% 여유). 올려 잡는 방향이 안전하다 — 내려 잡으면 팔수록 손해다.
export const AD_VIDEO_PRICE = { 15: 65 };

// 시나리오 다시 쓰기는 무료지만 무제한은 아니다. LLM 원가가 조금씩 샌다.
// MAX_REGEN_PER_CUT 과 같은 성격의 안전핀이다.
export const MAX_SCENARIO_TRIES = 20;

// 길이를 모르거나 목록 밖이면 15초 값으로 본다 — v1 은 15초뿐이다.
export function adVideoPrice(seconds) {
  const p = AD_VIDEO_PRICE[Number(seconds)];
  return typeof p === "number" ? p : AD_VIDEO_PRICE[15];
}
```

⚠️ `lib/pricing.js` 에 **import 문을 넣지 마라.** `AD_SECONDS` 를 import 하고 싶어지겠지만, 그러면 화면 번들이 깨진다. 테스트가 두 값의 대응을 대신 판정한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pricing.test.js`
Expected: PASS (기존 블록 포함 전부)

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`

- [ ] **Step 6: 커밋**

```bash
git add lib/pricing.js tests/pricing.test.js
git commit -m "feat(ad): 광고 영상 정가 65 크레딧 + 시나리오 20회 상한"
```

---

## Task 5: `lib/charges.js` — `chargeAd` · `refundAd`

**Files:**
- Modify: `lib/charges.js` (**덧붙이기만.** 기존 함수는 한 줄도 안 고친다)
- Test: `tests/ad-charges.test.js`

**Interfaces:**
- Consumes: Task 4 의 `adVideoPrice`
- Produces:
  - `adKey(projectId, attempt) -> "ad:<pid>:<n>"` · `adRefundKey(projectId, attempt)`
  - `chargeAd({ userId, projectId, seconds }) -> credits`(0 이면 이미 산 회차)
  - `alreadyChargedAd(projectId) -> boolean`
  - `refundAd({ projectId }) -> void`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-charges.test.js`:

```js
// 광고 청구 — 기존 video 장부와 **이름공간이 다르다**. 섞이면 안 된다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { chargeAd, refundAd, alreadyChargedAd, adKey } from "../lib/charges.js";
import { balanceFor, chargeVideo, NoCredits, assertCanAfford } from "../lib/charges.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

const U = "00000000-0000-4000-8000-00000000000a";
const P = "00000000-0000-4000-8000-0000000000f1";

async function grant(n) {
  await getStore().insertGrant({ user_id: U, amount_credits: n, reason: "test" });
}

describe("광고 청구", () => {
  beforeEach(() => resetMemoryStore());

  it("정가를 받고 잔액이 그만큼 준다", async () => {
    await grant(100);
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
    expect(await balanceFor(U)).toBe(100 - AD_VIDEO_PRICE[15]);
  });

  it("이미 산 회차가 살아 있으면 또 받지 않는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again).toBe(0);
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE[15]);
  });

  it("환불은 지우지 않고 음수 행이다", async () => {
    await grant(100);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(100);
    expect(await alreadyChargedAd(P)).toBe(false);
    const rows = await getStore().listCharges(U);
    expect(rows.some((r) => Number(r.credits) < 0)).toBe(true);
  });

  it("환불 뒤 다시 만들면 새 회차라 또 받는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
  });

  it("두 번 불러도 환불은 한 번만 돈다", async () => {
    await grant(100);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(100);
  });

  it("★ 기존 video 장부와 키가 안 겹친다", async () => {
    await grant(300);
    await chargeVideo({ userId: U, projectId: P, seconds: 15 });   // 기존 경로
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 }); // 광고 경로
    // 같은 프로젝트 id 라도 서로를 "이미 샀다"로 보지 않는다
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
    expect(adKey(P, 1)).toBe(`ad:${P}:1`);
  });

  it("잔액이 모자라면 NoCredits 다", async () => {
    await grant(10);
    await expect(assertCanAfford(U, AD_VIDEO_PRICE[15])).rejects.toBeInstanceOf(NoCredits);
  });
});
```

⚠️ `insertGrant` 의 정확한 인자 이름은 `lib/store/memory.js` 를 열어 확인하고 맞춘다. 다르면 **테스트를 실제 계약에 맞춘다**(구현을 바꾸지 않는다).

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-charges.test.js`
Expected: FAIL — `chargeAd` 가 export 되지 않음

- [ ] **Step 3: `lib/charges.js` 끝에 덧붙인다**

```js
// ── 광고 경로(lib/ad) ────────────────────────────────────────────────────
// 기존 video 장부와 **이름공간이 다르다**(`ad:` 대 `video:`). 같은 프로젝트 id 라도
// 서로를 "이미 샀다"로 보지 않는다 — 한 문서가 두 종류일 수 없으므로 실무상 안 겹치지만,
// 키를 가르는 비용이 0 이라 가른다.
export const adKey = (projectId, attempt) => `ad:${projectId}:${attempt}`;
export const adRefundKey = (projectId, attempt) => `refund_ad:${projectId}:${attempt}`;

const MAX_AD_ATTEMPTS = 100;

async function readAdLedger(projectId) {
  const store = getStore();
  let attempts = 0;
  let active = null;
  for (let n = 1; n <= MAX_AD_ATTEMPTS; n++) {
    const charge = await store.findCharge(adKey(projectId, n));
    if (!charge) break;
    attempts = n;
    const refunded = await store.findCharge(adRefundKey(projectId, n));
    active = refunded ? null : { charge, attempt: n };
  }
  return { attempts, active };
}

export async function alreadyChargedAd(projectId) {
  return (await readAdLedger(projectId)).active !== null;
}

export async function chargeAd({ userId, projectId, seconds }) {
  const { attempts, active } = await readAdLedger(projectId);
  if (active) return 0;
  const credits = adVideoPrice(seconds);
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "ad_video",
    credits, idem_key: adKey(projectId, attempts + 1),
  });
  return wrote ? credits : 0;
}

// 살아 있는 회차만 되돌린다. 환불 행의 주인은 **원 청구 행의 주인**이다 —
// 소유가 어긋난 환불을 원천에서 막는다(refundVideo 와 같은 규칙).
export async function refundAd({ projectId }) {
  const { active } = await readAdLedger(projectId);
  if (!active) return;
  await getStore().insertCharge({
    user_id: active.charge.user_id, project_id: projectId, kind: "refund_ad",
    credits: -Number(active.charge.credits), idem_key: adRefundKey(projectId, active.attempt),
  });
}
```

파일 맨 위 import 줄에 `adVideoPrice` 를 더한다:
```js
import { videoPrice, regenPrice, adVideoPrice } from "./pricing.js";
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-charges.test.js`
Expected: PASS

- [ ] **Step 5: ★ 기존 청구 테스트가 그대로인지 본다**

Run: `npx vitest run tests/charges.test.js tests/charge-routes.test.js tests/credits-gate.test.js tests/free-trial-gate.test.js`
Expected: 전부 PASS

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/charges.js tests/ad-charges.test.js
git commit -m "feat(ad): 광고 청구·환불 — 기존 video 장부와 이름공간을 가른다"
```

---

## Task 6: `kind` — `lib/projects.js` 와 store 두 벌

**Files:**
- Modify: `lib/projects.js` (`createProject` 가 `kind` 를 받는다)
- Modify: `lib/store/memory.js` (`listProjects` 요약에 `kind`·광고 썸네일)
- Modify: `lib/store/supabase.js` (같은 것)
- Test: `tests/ad-kind.test.js`

**Interfaces:**
- Produces: `createProject({ settings, material, ownerId, kind })` · `listProjects` 결과 항목에 `kind` 필드(기존 문서는 `null`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-kind.test.js`:

```js
// ★ kind 없음 = 기존 종류. 이 방향을 뒤집으면 기존 프로젝트 전체가 새 경로로 흘러간다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, listProjects } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";

const U = "00000000-0000-4000-8000-00000000000a";
const run = (fn) => runWithActor(U, fn);

describe("kind — 두 종류를 가른다", () => {
  beforeEach(() => resetMemoryStore());

  it("kind 를 안 주면 문서에 kind 가 없다 — 옛 문서와 같은 모양이다", async () => {
    const p = await run(() => createProject({ material: { text: "가" }, ownerId: U }));
    expect(p.kind).toBeUndefined();
  });

  it("kind:'ad' 를 주면 문서에 남는다", async () => {
    const p = await run(() => createProject({ material: { text: "가" }, ownerId: U, kind: "ad" }));
    expect(p.kind).toBe("ad");
    const back = await getProject(p.id, U);
    expect(back.kind).toBe("ad");
  });

  it("모르는 kind 는 던진다 — 오타로 새 세계가 생기면 안 된다", async () => {
    await expect(
      run(() => createProject({ material: { text: "가" }, ownerId: U, kind: "광고" }))
    ).rejects.toThrow();
  });

  it("목록이 종류를 실어 보낸다 — 옛 문서는 null", async () => {
    await run(() => createProject({ material: { text: "옛것" }, ownerId: U }));
    await run(() => createProject({ material: { text: "광고" }, ownerId: U, kind: "ad" }));
    const list = await listProjects(U);
    // ⚠️ 기본 .sort() 는 값을 **문자열로 바꿔** 비교한다 — "ad" < "null" 이라 결과는 ["ad", null] 이다.
    const kinds = list.map((p) => p.kind).sort();
    expect(kinds).toEqual(["ad", null]);
  });

  it("목록 썸네일이 종류에 맞는 자리를 본다", async () => {
    const p = await run(() => createProject({ material: { text: "광고" }, ownerId: U, kind: "ad" }));
    const store = getStore();
    const row = await store.selectProject(p.id, U);
    await store.updateProjectRow(p.id, U, row.version, {
      ...row.doc, videos: [{ url: "/api/renders/x.mp4", seconds: 15 }],
    });
    const list = await listProjects(U);
    expect(list.find((x) => x.id === p.id).video_url).toBe("/api/renders/x.mp4");
  });
});
```

⚠️ `selectProject`·`updateProjectRow` 의 정확한 반환 모양은 `lib/store/memory.js` 를 열어 확인하고 맞춘다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-kind.test.js`
Expected: FAIL

- [ ] **Step 3: `lib/projects.js` 의 `createProject` 를 고친다**

```js
// 문서 종류. **없으면 기존 종류다** — 옛 문서에는 이 필드가 아예 없다.
// 반대로 두면(없으면 ad) 기존 프로젝트 전체가 새 경로로 흘러간다.
const KINDS = ["ad"];

export async function createProject({ settings, material, ownerId, kind }) {
  requireOwner(ownerId);
  if (kind !== undefined && !KINDS.includes(kind)) {
    throw new Error(`모르는 프로젝트 종류예요: ${kind}`);
  }
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    // 광고 문서의 상태는 draft → scenario → rendering → done 이다(설계 참고).
    // 기존 종류의 전이표와 겹치는 것은 draft 뿐이고, 두 세계는 kind 로 갈린다.
    status: "draft",
    ...(kind ? { kind } : {}),
    settings: settings || {},
    material: material || { text: "", photos: [] },
    briefing: null,
    synopsis: null,
    script: null,
    cuts: [],
  };
  await getStore().insertProject(project, ownerId);
  return project;
}
```

- [ ] **Step 4: store 두 벌의 `listProjects` 를 고친다**

`lib/store/memory.js`:

```js
      .map((r) => ({
        id: r.doc.id,
        created_ts: r.doc.created_ts,
        status: r.doc.status,
        // 종류. 옛 문서에는 없으므로 null 이다 — 화면이 "없으면 기존"으로 읽는다.
        kind: r.doc.kind ?? null,
        title: (r.doc.material?.text || "").slice(0, 40),
        // 완성본 자리가 종류마다 다르다: 기존은 render.url, 광고는 videos[0].url
        video_url: r.doc.render?.url || r.doc.videos?.[0]?.url || null,
        image_url: r.doc.cuts?.[0]?.image?.url || null,
      }))
```

`lib/store/supabase.js` — select 문과 매핑을 함께 고친다:

```js
      .select(
        "id, status, created_at, material_text:doc->material->>text," +
          "kind:doc->>kind," +
          "video_url:doc->render->>url,ad_video_url:doc->videos->0->>url," +
          "image_url:doc->cuts->0->image->>url"
      )
```
```js
    return (data || []).map((r) => ({
      id: r.id,
      status: r.status,
      created_ts: new Date(r.created_at).getTime(),
      kind: r.kind ?? null,
      title: (r.material_text || "").slice(0, 40),
      video_url: r.video_url || r.ad_video_url || null,
      image_url: r.image_url || null,
    }));
```

⚠️ **두 벌을 같이 고친다.** 한쪽만 고치면 테스트(memory)는 통과하고 라이브(supabase)가 깨진다. 이 저장소의 store 계약은 두 벌이다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/ad-kind.test.js tests/store-memory.test.js tests/store-supabase-contract.test.js tests/store-supabase-rows.test.js tests/projects.test.js tests/projects-list-route.test.js`
Expected: 전부 PASS

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/projects.js lib/store/memory.js lib/store/supabase.js tests/ad-kind.test.js
git commit -m "feat(ad): 문서 종류 kind — 없으면 기존 종류다"
```

---

## Task 7: 양방향 격리 — 기존 라우트가 광고 문서를 거절한다

**Files:**
- Modify: `app/api/projects/[id]/route.js` 및 그 아래 모든 라우트 — `getProject` 뒤에 가드 한 줄
- Test: `tests/ad-isolation.test.js`

**Interfaces:**
- Consumes: Task 6 의 `kind`
- Produces: 기존 `/api/projects/[id]/**` 가 `kind === "ad"` 문서에 **404**

- [ ] **Step 1: 대상 라우트를 센다**

Run: `grep -rln "getProject" app/api/projects/`
이 목록이 이 태스크의 범위다. **하나도 빠뜨리지 않는다** — 한 곳만 열려 있으면 그 문으로 샌다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/ad-isolation.test.js`:

```js
// ★ 양방향 격리 — 한쪽만 막으면 반대쪽으로 샌다.
// 이 저장소는 /clips·/voice 를 열어 둬서 환불된 프로젝트로 클립을 순지불 0 에 산 전례가 있다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { GET as getProjectRoute } from "../app/api/projects/[id]/route.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const U = "00000000-0000-4000-8000-00000000000a";

function req(url = "http://x/api/projects/x") {
  return new Request(url, {
    headers: { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
  });
}

describe("기존 라우트는 광고 문서를 모른다", () => {
  beforeEach(() => resetMemoryStore());

  it("kind:'ad' 문서를 기존 조회 라우트에 넣으면 404", async () => {
    const p = await runWithActor(U, () =>
      createProject({ material: { text: "광고" }, ownerId: U, kind: "ad" })
    );
    const res = await getProjectRoute(req(), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(404);
  });

  it("기존 문서는 그대로 200 — 격리가 기존 동작을 안 바꾼다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ material: { text: "옛것" }, ownerId: U })
    );
    const res = await getProjectRoute(req(), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
  });
});
```

⚠️ 기존 라우트 테스트(`tests/routes.test.js`)가 요청을 어떻게 만드는지 먼저 읽고 **그 방식에 맞춘다.** 위 헬퍼가 다르면 기존 것을 따른다.

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/ad-isolation.test.js`
Expected: FAIL — 첫 테스트가 200 을 받는다

- [ ] **Step 4: 가드를 넣는다**

Step 1 에서 센 **모든** 라우트의 `getProject(...)` 바로 뒤, 기존 `if (!project) return 404` 와 **같은 줄에 합친다**:

```js
  const project = await getProject(id, user.id);
  // ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
  // 없는 것과 같이 404 다: 남의 것이 아니라 "이 문 뒤에 없는 것"이라서다.
  if (!project || project.kind === "ad") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }
```

기존 문구를 바꾸지 않는다 — 조건만 넓힌다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/ad-isolation.test.js`
Expected: PASS

- [ ] **Step 6: ★ 기존 라우트 테스트가 전부 그대로인지 본다**

Run: `npx vitest run tests/routes.test.js tests/routes-auth.test.js tests/project-owner.test.js tests/auto-route.test.js tests/charge-routes.test.js tests/minor1-uncovered-routes.test.js`
Expected: 전부 PASS

- [ ] **Step 7: 전체 테스트 + 커밋**

```bash
npx vitest run
git add app/api/projects tests/ad-isolation.test.js
git commit -m "feat(ad): 기존 라우트가 광고 문서를 404 로 거절한다"
```

---

## Task 8: `lib/ad/scenario.js` — 시나리오와 자동 배치

**Files:**
- Create: `lib/ad/scenario.js`
- Test: `tests/ad-scenario.test.js`

**Interfaces:**
- Consumes: Task 1 (`adModel`), Task 2 (`AD_FORMATS`·`AD_MOODS`·`AD_LANGS`·`AD_STYLE_LINES`)
- Produces:
  - `pickEndpointKind(photoCount, llmChoice) -> "t2v"|"i2v"|"r2v"`
  - `buildScenarioMessages({ settings, material }) -> { system, messages }`
  - `validateScenario(raw, photoCount) -> { text, shots, endpoint } | null`
  - `generateScenario({ project, deps }) -> { text, shots, endpoint }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-scenario.test.js`:

```js
// 자동 배치 — 값이 나가는 판정이라 LLM 에 통째로 안 맡긴다.
// 코드가 먼저 좁히고, 남는 결정 지점은 "사진 1장" 하나다.
import { describe, it, expect } from "vitest";
import { pickEndpointKind, buildScenarioMessages, validateScenario } from "../lib/ad/scenario.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0-fast",
};

describe("자동 배치", () => {
  it("사진 0장이면 t2v 로 고정 — LLM 에 안 묻는다", () => {
    expect(pickEndpointKind(0, "i2v")).toBe("t2v");
    expect(pickEndpointKind(0, undefined)).toBe("t2v");
  });

  it("사진 2장 이상이면 r2v 로 고정 — i2v 는 1장만 받는다", () => {
    expect(pickEndpointKind(2, "i2v")).toBe("r2v");
    expect(pickEndpointKind(4, "t2v")).toBe("r2v");
  });

  it("사진 1장일 때만 LLM 의 선택을 받는다", () => {
    expect(pickEndpointKind(1, "i2v")).toBe("i2v");
    expect(pickEndpointKind(1, "r2v")).toBe("r2v");
  });

  it("★ 모르는 값은 r2v 로 떨어진다 — 안전한 쪽", () => {
    expect(pickEndpointKind(1, "x2v")).toBe("r2v");
    expect(pickEndpointKind(1, undefined)).toBe("r2v");
    expect(pickEndpointKind(1, "t2v")).toBe("r2v");   // 사진이 있는데 t2v 면 사진이 버려진다
  });
});

describe("시나리오 프롬프트", () => {
  it("고른 옵션이 전부 프롬프트에 실린다 — 하나라도 빠지면 아무도 못 알아본다", () => {
    const { system, messages } = buildScenarioMessages({
      settings, material: { text: "앰플 광고", photos: [] },
    });
    const all = system + JSON.stringify(messages);
    expect(all).toContain("15");
    expect(all).toContain("9:16");
    expect(all).toMatch(/Korean|한국어/);
    expect(all).toContain("앰플 광고");
    // 포맷의 뼈대·분위기·화풍 문구가 실린다
    expect(all).toMatch(/제품이 주인공/);
    expect(all).toMatch(/premium and restrained/);
    expect(all).toMatch(/live-action cinematic/);
  });
});

describe("시나리오 검증", () => {
  it("장면이 없으면 null 이다", () => {
    expect(validateScenario({ shots: [] }, 0)).toBe(null);
    expect(validateScenario(null, 0)).toBe(null);
  });

  it("장면과 본문을 받아 정리해서 돌려준다", () => {
    const out = validateScenario(
      { text: "전체 시나리오", shots: [{ beat: "등장", camera: "slow push-in", action: "병이 놓인다" }], endpoint: "i2v" },
      1
    );
    expect(out.shots.length).toBe(1);
    expect(out.text).toBe("전체 시나리오");
    expect(out.endpoint).toBe("i2v");
  });

  it("★ 사진 수가 LLM 선택을 이긴다", () => {
    const out = validateScenario(
      { text: "가", shots: [{ beat: "가" }], endpoint: "i2v" },
      3
    );
    expect(out.endpoint).toBe("r2v");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-scenario.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/ad/scenario.js`:

```js
// 시나리오 — 옵션+프롬프트+사진을 받아 Seedance 에 그대로 넘길 지시문을 쓴다.
//
// 이 파일은 서버 전용이다(llm.js 를 부른다). 화면은 이것을 import 하지 않는다.
import { callJson } from "../llm.js";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "./options.js";

// 자동 배치 — 코드가 먼저 좁힌다.
//
// ★ LLM 에 통째로 안 맡기는 이유: 이 판정 하나가 $3.63 을 가른다. 결정 지점을
// "사진 1장" 하나로 좁히고 나머지는 코드가 정한다. 모르는 값은 r2v 다 —
// 사진이 있는데 t2v 로 가면 올린 사진이 통째로 버려진다.
export function pickEndpointKind(photoCount, llmChoice) {
  const n = Number(photoCount) || 0;
  if (n === 0) return "t2v";
  if (n >= 2) return "r2v";
  return llmChoice === "i2v" ? "i2v" : "r2v";
}

const SYSTEM = `너는 15초짜리 광고 영상의 연출자다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

지켜야 할 것:
- 전체 길이는 정확히 주어진 초 수다. 장면을 나눠도 합이 그 길이다
- 장면마다 카메라(앵글·움직임)·액션·분위기를 말로 적는다. "슬로우 푸시인", "로우 트래킹" 처럼 사람이 쓰는 말로 쓴다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 15초에 두 문장을 넘기지 않는다
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다
- 사진이 주어졌으면 그 안의 제품·인물·로고를 지키라고 명시한다

JSON 으로만 답한다:
{
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다)",
  "shots": [{ "beat": "이 장면이 하는 일(한국어)", "camera": "...", "action": "...", "line": "나레이션 대사" }],
  "endpoint": "i2v 또는 r2v (사진이 정확히 1장일 때만 의미가 있다)"
}`;

export function buildScenarioMessages({ settings, material }) {
  const fmt = AD_FORMATS.find((f) => f.id === settings.format);
  const mood = AD_MOODS.find((m) => m.id === settings.mood);
  const lang = AD_LANGS.find((l) => l.id === settings.narration_lang);
  const styleLine = AD_STYLE_LINES[settings.style];
  const photos = material?.photos || [];

  const user = [
    `길이: ${settings.seconds}초`,
    `화면 비율: ${settings.aspect_ratio}`,
    `나레이션 언어: ${lang.line} (${lang.label})`,
    `광고 포맷: ${fmt.label} — ${fmt.beat}`,
    `분위기: ${mood.label} — ${mood.line}`,
    `화풍: ${styleLine}`,
    `첨부 사진: ${photos.length}장`,
    "",
    "사장님이 쓴 것:",
    material?.text || "",
  ].join("\n");

  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// ★ 사진 수가 LLM 선택을 이긴다. 검증이 판정의 마지막 자리다.
export function validateScenario(raw, photoCount) {
  const shots = Array.isArray(raw?.shots) ? raw.shots.filter((s) => s && typeof s === "object") : [];
  if (shots.length === 0) return null;
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  return {
    text: text.slice(0, 4000),
    shots: shots.slice(0, 12),
    endpoint: pickEndpointKind(photoCount, raw?.endpoint),
  };
}

export async function generateScenario({ project, deps = {} }) {
  const call = deps.callJson || callJson;
  const { system, messages } = buildScenarioMessages(project);
  const raw = await call({ system, messages, stage: "광고 시나리오", projectId: project.id });
  const out = validateScenario(raw, (project.material?.photos || []).length);
  if (!out) throw new Error("시나리오를 만들지 못했어요");
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-scenario.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/ad/scenario.js tests/ad-scenario.test.js
git commit -m "feat(ad): 시나리오 생성과 자동 배치 — 코드가 먼저 좁힌다"
```

---

## Task 9: `lib/ad/generate.js` — fal 호출

**Files:**
- Create: `lib/ad/generate.js`
- Test: `tests/ad-generate.test.js`

**Interfaces:**
- Consumes: Task 1 (`adEndpoint`·`adModel`), Task 3 (원가표)
- Produces: `generateAdVideo({ project, scenario, refs, fetchImpl }) -> { url, seconds }`
  - `refs` 는 `[{ key, bytes }]` (부르는 쪽이 읽어 온다 — `generateImage` 와 같은 규약)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-generate.test.js`:

```js
import { describe, it, expect, afterEach } from "vitest";
import { generateAdVideo } from "../lib/ad/generate.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const U = "00000000-0000-4000-8000-00000000000a";
const project = {
  id: "00000000-0000-4000-8000-0000000000f1",
  settings: { seconds: 15, aspect_ratio: "9:16", model: "seedance-2.0-fast" },
};
const ok = () => ({
  ok: true,
  json: async () => ({ video: { url: "https://fal.example/v.mp4" } }),
  text: async () => "",
});

describe("광고 영상 생성", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; resetMemoryStore(); });

  it("t2v 는 사진 없이 부른다", async () => {
    resetMemoryStore();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    expect(seen.url).toContain("text-to-video");
    expect(seen.body.duration).toBe(15);
    expect(seen.body.aspect_ratio).toBe("9:16");
    expect(seen.body.resolution).toBe("720p");
    expect(seen.body.image_urls).toBeUndefined();
    expect(out.url).toBe("https://fal.example/v.mp4");
    expect(out.seconds).toBe(15);
  });

  it("i2v 는 사진 한 장을 image_url 로 넘긴다", async () => {
    resetMemoryStore();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "i2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }], fetchImpl,
      })
    );
    expect(seen.url).toContain("image-to-video");
    expect(seen.body.image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("r2v 는 여러 장을 image_urls 로 넘긴다", async () => {
    resetMemoryStore();
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return ok(); };
    await runWithActor(U, () =>
      generateAdVideo({
        project, scenario: { text: "P", endpoint: "r2v" },
        refs: [{ key: "a.png", bytes: Buffer.from("x") }, { key: "b.jpg", bytes: Buffer.from("y") }],
        fetchImpl,
      })
    );
    expect(seen.url).toContain("reference-to-video");
    expect(seen.body.image_urls.length).toBe(2);
  });

  it("★ 가짜 모드에서는 fal 을 안 부른다", async () => {
    resetMemoryStore();
    process.env.SHOTFORM_FAKE = "fal";
    let called = false;
    const fetchImpl = async () => { called = true; return ok(); };
    const out = await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    expect(called).toBe(false);
    expect(out.url).toBeTruthy();
  });

  it("원장에 그 엔드포인트가 남는다 — 어느 모델로 만들었는지의 유일한 기록", async () => {
    resetMemoryStore();
    const fetchImpl = async () => ok();
    await runWithActor(U, () =>
      generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
    );
    const rows = await getStore().listCosts({ projectId: project.id });
    expect(rows.some((r) => String(r.endpoint).startsWith("bytedance/seedance-2.0/fast"))).toBe(true);
  });

  it("결과가 비면 던진다", async () => {
    resetMemoryStore();
    const fetchImpl = async () => ({ ok: true, json: async () => ({}), text: async () => "" });
    await expect(
      runWithActor(U, () =>
        generateAdVideo({ project, scenario: { text: "P", endpoint: "t2v" }, refs: [], fetchImpl })
      )
    ).rejects.toThrow();
  });
});
```

⚠️ `listCosts` 의 실제 이름·인자는 `lib/store/memory.js` 에서 확인하고 맞춘다. 없으면 `sumCosts` 로 "0 이 아니다"를 재는 것으로 바꾼다.

⚠️ **Task 0 에서 확인한 응답 필드 이름을 쓴다.** 탐침이 `video.url` 이 아닌 다른 이름을 냈으면 여기와 테스트를 그 이름으로 맞춘다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-generate.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/ad/generate.js`:

```js
// 광고 영상 생성 — fal 을 부르는 유일한 자리.
//
// 기존 lib/i2v.js·lib/imagegen.js 와 같은 모양이다: 가짜 판정 → 예산 → 호출 → 원장.
// ★ 가짜 판정이 assertBudget **앞**이다. 그래서 가짜 모드에서는 기록도 안 남는다
//   (CLAUDE.md 가 적어 둔 성질 그대로다 — 비용 배선을 검증하려면 SHOTFORM_FAKE=fal 이 아니라
//   진짜로 돌려야 한다).
import { addRecord, costActor, estimateCost, assertBudget } from "../costs.js";
import { fakeFal } from "../fake.js";
import { toDataUri } from "../refs-io.js";
import { adEndpoint, adModel } from "./models.js";
import { randomUUID } from "crypto";

// 가짜 모드에서 돌려주는 자리표시자. 실제 mp4 가 아니다 — 배선과 상태 전이만 확인한다.
const FAKE_URL = "data:video/mp4;base64,";

export async function generateAdVideo({ project, scenario, refs = [], fetchImpl = fetch }) {
  const settings = project?.settings || {};
  const seconds = Number(settings.seconds) || 15;
  const kind = scenario?.endpoint || "t2v";
  const endpoint = adEndpoint(settings.model, kind);

  if (fakeFal()) return { url: FAKE_URL, seconds };

  // 나가기 전에 막는다 — 한 번이 $3.63 이다
  await assertBudget({ projectId: project.id, endpoint, amount: seconds });

  const input = {
    prompt: scenario.text,
    duration: seconds,
    aspect_ratio: settings.aspect_ratio,
    resolution: "720p",
  };
  // 업로드는 비공개 버킷이라 URL 을 fal 이 못 읽는다 — 바이트를 data URI 로 넘긴다
  // (lib/imagegen.js 가 이미 푼 문제이고 같은 헬퍼를 쓴다).
  if (kind === "i2v" && refs[0]) input.image_url = toDataUri(refs[0].bytes, refs[0].key);
  if (kind === "r2v" && refs.length) input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));

  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`영상 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "광고영상", user: costActor(), project_id: project.id,
    prompt: String(scenario.text || "-").slice(0, 300),
    duration: String(seconds), aspect_ratio: settings.aspect_ratio,
    est_cost_usd: estimateCost(endpoint, seconds), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds };
}

// 모델의 길이 범위를 벗어나면 만들 수 없다 — 라우트가 이것으로 미리 막는다.
export function fitsAdModel(modelId, seconds) {
  const m = adModel(modelId);
  return seconds >= m.minSeconds && seconds <= m.maxSeconds;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-generate.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/ad/generate.js tests/ad-generate.test.js
git commit -m "feat(ad): fal 호출 한 자리 — t2v/i2v/r2v"
```

---

## Task 10: `lib/ad/pipeline.js` — 청구 → 생성 → 저장 → 실패 시 환불

**Files:**
- Create: `lib/ad/pipeline.js`
- Test: `tests/ad-pipeline.test.js`

**Interfaces:**
- Consumes: Task 5 (`chargeAd`·`refundAd`), Task 8 (`generateScenario`), Task 9 (`generateAdVideo`)
- Produces:
  - `runScenarioStep(projectId, ownerId, deps) -> void` — 문서에 `scenario` 저장, `status: "scenario"`
  - `runAdRenderPipeline(projectId, ownerId, deps) -> void` — fire-and-forget 으로 부른다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-pipeline.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { runScenarioStep, runAdRenderPipeline } from "../lib/ad/pipeline.js";
import { balanceFor } from "../lib/charges.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

const U = "00000000-0000-4000-8000-00000000000a";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0-fast",
};

async function makeAd() {
  return runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
}
const scenario = { text: "P", shots: [{ beat: "가" }], endpoint: "t2v" };

describe("광고 파이프라인", () => {
  beforeEach(() => resetMemoryStore());

  it("시나리오를 만들면 문서에 남고 상태가 scenario 가 된다", async () => {
    const p = await makeAd();
    await runWithActor(U, () =>
      runScenarioStep(p.id, U, { generateScenario: async () => scenario })
    );
    const back = await getProject(p.id, U);
    expect(back.scenario.text).toBe("P");
    expect(back.scenario.tries).toBe(1);
    expect(back.status).toBe("scenario");
  });

  it("다시 쓰면 회차가 는다", async () => {
    const p = await makeAd();
    const deps = { generateScenario: async () => scenario };
    await runWithActor(U, () => runScenarioStep(p.id, U, deps));
    await runWithActor(U, () => runScenarioStep(p.id, U, deps));
    expect((await getProject(p.id, U)).scenario.tries).toBe(2);
  });

  it("상한을 넘으면 던진다", async () => {
    const p = await makeAd();
    const store = getStore();
    const row = await store.selectProject(p.id, U);
    await store.updateProjectRow(p.id, U, row.version, { ...row.doc, scenario: { ...scenario, tries: 20 } });
    await expect(
      runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }))
    ).rejects.toThrow();
  });

  it("성공하면 videos 에 한 개가 남고 done 이 된다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    await runWithActor(U, () =>
      runAdRenderPipeline(p.id, U, {
        generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
        storeVideo: async (url) => url,
      })
    );
    const back = await getProject(p.id, U);
    expect(back.videos.length).toBe(1);
    expect(back.status).toBe("done");
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE[15]);
  });

  it("★ 실패하면 환불하고 scenario 로 되돌린다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    await expect(
      runWithActor(U, () =>
        runAdRenderPipeline(p.id, U, {
          generateAdVideo: async () => { throw new Error("fal 죽음"); },
        })
      )
    ).rejects.toThrow();
    const back = await getProject(p.id, U);
    expect(back.status).toBe("scenario");
    expect(back.video_error).toBeTruthy();
    expect(await balanceFor(U)).toBe(200);   // 못 준 것은 안 받는다
  });

  it("시나리오가 없으면 굽지 않는다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await expect(
      runWithActor(U, () => runAdRenderPipeline(p.id, U, { generateAdVideo: async () => ({ url: "x", seconds: 15 }) }))
    ).rejects.toThrow();
    expect(await balanceFor(U)).toBe(200);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-pipeline.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/ad/pipeline.js`:

```js
// 광고 경로의 파이프라인 — 청구 → 생성 → 저장, 실패하면 환불.
//
// 기존 lib/pipeline.js 를 부르지 않는다. 컷·이미지·낭독·합성이 없는 경로다.
import { randomUUID } from "crypto";
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { chargeAd, refundAd } from "../charges.js";
import { MAX_SCENARIO_TRIES } from "../pricing.js";
import { readRefBytes } from "../refs-io.js";
import { generateScenario as defaultScenario } from "./scenario.js";
import { generateAdVideo as defaultGenerate } from "./generate.js";

const RENDERS_BUCKET = "renders";

// fal 산출물은 기본이 publicly readable 이다 — 우리 비공개 버킷으로 옮긴다.
// 미공개 캠페인 영상이면 URL 이 새는 것만으로 사고다.
async function storeVideoDefault(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`완성본을 내려받지 못했어요 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = `${randomUUID()}.mp4`;
  await getStore().putObject(RENDERS_BUCKET, name, bytes, "video/mp4");
  return `/api/renders/${name}`;
}

export async function runScenarioStep(projectId, ownerId, deps = {}) {
  const make = deps.generateScenario || defaultScenario;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  const tries = Number(project.scenario?.tries) || 0;
  // 무료지만 무제한은 아니다 — 라우트가 청구 앞에서 보는 상한과 같은 값이다
  if (tries >= MAX_SCENARIO_TRIES) throw new Error("시나리오를 너무 많이 다시 썼어요");

  const scenario = await make({ project });
  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    scenario: { ...scenario, tries: (Number(p.scenario?.tries) || 0) + 1 },
    status: "scenario",
    video_error: null,
  }));
}

export async function runAdRenderPipeline(projectId, ownerId, deps = {}) {
  const make = deps.generateAdVideo || defaultGenerate;
  const store = deps.storeVideo || storeVideoDefault;

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 시나리오 없이 굽지 않는다 — 그러면 무엇을 만드는지 아무도 모른다
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");

  // ★ 청구가 생성 앞이다. 잔액 없이 fal 이 나가는 길을 안 만든다.
  await chargeAd({ userId: ownerId, projectId, seconds: project.settings?.seconds });
  await updateProject(projectId, ownerId, (p) => ({ ...p, status: "rendering", video_error: null }));

  try {
    // 레퍼런스 바이트는 여기서 읽는다 — generate 는 바이트만 받는다(imagegen 과 같은 규약)
    const refs = [];
    for (const photo of project.material?.photos || []) {
      const key = photo.url?.split("/").pop();
      const bytes = key ? await readRefBytes({ source: "upload", key }) : null;
      if (bytes) refs.push({ key, bytes });
    }
    const out = await make({ project, scenario: project.scenario, refs });
    const url = await store(out.url);
    await updateProject(projectId, ownerId, (p) => ({
      ...p, videos: [{ url, seconds: out.seconds }], status: "done", video_error: null,
    }));
  } catch (e) {
    // 못 준 것은 받지 않는다. 지우지 않고 음수 행으로 되돌린다.
    await refundAd({ projectId }).catch(() => {});
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "scenario", video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/ad/pipeline.js tests/ad-pipeline.test.js
git commit -m "feat(ad): 파이프라인 — 청구 앞, 실패하면 환불"
```

---

## Task 11: 라우트 — 문서 만들기·고치기·조회·폴링

**Files:**
- Create: `app/api/ads/route.js` · `app/api/ads/[id]/route.js` · `app/api/ads/[id]/status/route.js`
- Test: `tests/ad-routes.test.js`

**Interfaces:**
- Consumes: Task 2 (`normalizeAdOptions`), Task 1 (`isAdSeconds`·`DEFAULT_AD_MODEL`), Task 6 (`kind`)
- Produces: `POST /api/ads` · `PATCH·GET /api/ads/[id]` · `GET /api/ads/[id]/status`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-routes.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { POST as createAd } from "../app/api/ads/route.js";
import { GET as getAd, PATCH as patchAd } from "../app/api/ads/[id]/route.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { DEFAULT_AD_MODEL } from "../lib/ad/models.js";

const U = "00000000-0000-4000-8000-00000000000a";
const H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const post = (body) =>
  new Request("http://x/api/ads", { method: "POST", headers: H, body: JSON.stringify(body) });
const patch = (body) =>
  new Request("http://x/api/ads/x", { method: "PATCH", headers: H, body: JSON.stringify(body) });
const get = () => new Request("http://x/api/ads/x", { headers: H });

const OK = { material: { text: "앰플 광고" }, settings: { seconds: 15, aspect_ratio: "9:16", format: "hero", mood: "premium", narration_lang: "ko", style: "photo" } };

describe("광고 라우트 — 문서", () => {
  beforeEach(() => resetMemoryStore());

  it("만들면 kind:'ad' 와 모델이 명시 저장된다", async () => {
    const res = await createAd(post(OK));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.kind).toBe("ad");
    expect(doc.settings.model).toBe(DEFAULT_AD_MODEL);
    expect(doc.settings.seconds).toBe(15);
    expect(doc.status).toBe("draft");
  });

  it("15초가 아니면 400 — v1 은 닫힌 목록이다", async () => {
    const res = await createAd(post({ ...OK, settings: { ...OK.settings, seconds: 30 } }));
    expect(res.status).toBe(400);
  });

  it("모르는 옵션은 400", async () => {
    for (const bad of [{ format: "x" }, { mood: "x" }, { narration_lang: "jp" }, { style: "x" }]) {
      const res = await createAd(post({ ...OK, settings: { ...OK.settings, ...bad } }));
      expect(res.status).toBe(400);
    }
  });

  it("모르는 비율은 400", async () => {
    const res = await createAd(post({ ...OK, settings: { ...OK.settings, aspect_ratio: "3:2" } }));
    expect(res.status).toBe(400);
  });

  it("사진 4장 초과는 400", async () => {
    const photos = Array.from({ length: 5 }, (_, i) => ({ url: `/api/uploads/${i}.png` }));
    const res = await createAd(post({ ...OK, material: { ...OK.material, photos } }));
    expect(res.status).toBe(400);
  });

  it("★ 기존 문서를 광고 라우트에 넣으면 404", async () => {
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await getAd(get(), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(404);
  });

  it("옵션을 고치면 시나리오가 버려지고 draft 로 돌아간다", async () => {
    const made = await (await createAd(post(OK))).json();
    // 시나리오가 있는 상태를 만든다
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{}], tries: 1 }, status: "scenario",
    });
    const res = await patchAd(patch({ settings: { mood: "bright" } }), { params: Promise.resolve({ id: made.id }) });
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.scenario).toBe(null);
    expect(doc.status).toBe("draft");
    expect(doc.settings.mood).toBe("bright");
  });
});
```

⚠️ 기존 `tests/routes.test.js` 가 Request·params 를 만드는 방식을 먼저 읽고 **그것에 맞춘다.**

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `app/api/ads/route.js` 를 쓴다**

```js
import { createProject } from "../../../lib/projects.js";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../lib/ad/options.js";
import { isAdSeconds, DEFAULT_AD_MODEL, AD_SECONDS } from "../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";

// 사진 상한. base64 는 1.33배로 부는데 fal 요청 본문에 통째로 실린다 —
// 10MB 짜리 아홉 장이면 100MB 를 넘는다. 실측하고 올린다.
const MAX_PHOTOS = 4;

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string" || !body.material.text.trim()) {
    return Response.json({ error: "무엇을 만들지 적어 주세요" }, { status: 400 });
  }

  // 옵션은 **닫힌 목록**이다. 조용히 기본값으로 떨어뜨리지 않는다 —
  // 고른 것과 만들어지는 것이 다르면 아무도 못 알아본다.
  let options;
  try {
    options = normalizeAdOptions(body?.settings);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  const seconds = body?.settings?.seconds ?? AD_SECONDS[0];
  if (!isAdSeconds(seconds)) {
    return Response.json({ error: `지금은 ${AD_SECONDS.join("·")}초만 만들 수 있어요` }, { status: 400 });
  }
  const aspect = body?.settings?.aspect_ratio ?? DEFAULT_ASPECT_ID;
  if (!isAspect(aspect)) {
    return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });
  }

  const photos = Array.isArray(body.material.photos) ? body.material.photos : [];
  if (photos.length > MAX_PHOTOS) {
    return Response.json({ error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요` }, { status: 400 });
  }
  if (!(await ownedPhotoKeys(photos, user.id))) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }

  const project = await createProject({
    kind: "ad",
    // ★ 모델을 명시 저장한다. 나중에 모델이 늘 때 "값이 없으면 어느 모델인가"가
    //   옛 문서의 뜻을 바꾼다 — 처음부터 적어 두면 그 질문이 안 생긴다.
    settings: { ...options, seconds, aspect_ratio: aspect, model: DEFAULT_AD_MODEL },
    material: { text: body.material.text.slice(0, 4000), photos },
    ownerId: user.id,
  });
  return Response.json(project);
});
```

- [ ] **Step 4: `app/api/ads/[id]/route.js` 를 쓴다**

```js
import { getProject, updateProject } from "../../../../lib/projects.js";
import { isAspect } from "../../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../../lib/ad/options.js";
import { isAdSeconds } from "../../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../../lib/refs-io.js";
import { withUser } from "../../../../lib/auth/require-user.js";

const MAX_PHOTOS = 4;

// 광고 문서만 다룬다. 기존 문서는 **404** 다 — 양방향 격리의 한쪽이다.
// (반대쪽은 app/api/projects/[id]/** 가 kind:"ad" 를 404 로 거절한다.)
export async function loadAd(id, ownerId) {
  const project = await getProject(id, ownerId);
  return project && project.kind === "ad" ? project : null;
}

export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  return Response.json(project);
});

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  // 굽는 중에는 못 고친다 — 고치면 시나리오가 버려지는데 그 시나리오로 이미 값이 나갔다
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이라 고칠 수 없어요" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);

  let options;
  try {
    options = normalizeAdOptions({ ...project.settings, ...(body?.settings || {}) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  const seconds = body?.settings?.seconds ?? project.settings.seconds;
  if (!isAdSeconds(seconds)) return Response.json({ error: "그 길이는 아직 안 돼요" }, { status: 400 });
  const aspect = body?.settings?.aspect_ratio ?? project.settings.aspect_ratio;
  if (!isAspect(aspect)) return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });

  let photos = project.material.photos;
  if (body?.material?.photos !== undefined) {
    photos = Array.isArray(body.material.photos) ? body.material.photos : [];
    if (photos.length > MAX_PHOTOS) {
      return Response.json({ error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요` }, { status: 400 });
    }
    if (!(await ownedPhotoKeys(photos, user.id))) {
      return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
    }
  }
  const text = typeof body?.material?.text === "string" ? body.material.text.slice(0, 4000) : project.material.text;

  // ★ 고치면 시나리오를 버리고 draft 로 되돌린다.
  //   낡은 시나리오로 굽는 길을 아예 막는다 — 그래서 낡음 판정을 새로 만들 필요가 없다.
  const updated = await updateProject(id, user.id, (p) => ({
    ...p,
    settings: { ...p.settings, ...options, seconds, aspect_ratio: aspect },
    material: { ...p.material, text, photos },
    scenario: null,
    status: "draft",
    video_error: null,
  }));
  return Response.json(updated);
});
```

✅ **확인됨(2026-08-12 실측):** `updateProject(id, ownerId, patchFn)` 은 갱신된 문서를 돌려준다
(`lib/projects.js:151` 의 `return next`). 다시 읽을 필요가 없다.

- [ ] **Step 5: `app/api/ads/[id]/status/route.js` 를 쓴다**

```js
import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadAd } from "../route.js";

// 화면이 2초마다 편다. doc 통짜를 안 실어 보낸다 — 필요한 것만 준다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: project.status,
    video: project.videos?.[0] || null,
    error: project.video_error || null,
  });
});
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: PASS

- [ ] **Step 7: 전체 테스트 + 커밋**

```bash
npx vitest run
git add app/api/ads tests/ad-routes.test.js
git commit -m "feat(ad): 문서 라우트 — 옵션은 닫힌 목록, 고치면 시나리오를 버린다"
```

---

## Task 12: 라우트 — 시나리오

**Files:**
- Create: `app/api/ads/[id]/scenario/route.js`
- Test: `tests/ad-routes.test.js` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 10 (`runScenarioStep`), Task 11 (`loadAd`)
- Produces: `POST /api/ads/[id]/scenario` — 동기다(LLM 만 쓰고 몇 초면 끝난다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-routes.test.js` 에 덧붙인다:

⚠️ **`SHOTFORM_FAKE=all` 로는 200 을 만들 수 없다.** `lib/llm.js` 의 `fakeResponse` 는 `shots`
가 빈 배열이라 `validateScenario` 가 `null` 을 주고 라우트가 500 을 낸다. 그렇다고
`fakeResponse` 를 고치면 **기존 파이프라인 검증기들이 그 모양에 기대고 있어** 깨진다.

그래서 **LLM 경계만 갈아끼운다.** 파일 맨 위(다른 import 앞)에 둔다 — `vi.mock` 은 끌어올려진다:

```js
// LLM 경계만 가짜로 막는다 — 라우트·파이프라인·시나리오 검증은 **진짜로** 돈다.
// 이 저장소의 기존 방식과 같다(tests/auto-route.test.js:9 참고).
vi.mock("../lib/llm.js", () => ({
  callJson: vi.fn(async () => ({
    text: "Vertical commercial. Slow push-in on the product, then a hand lifts it.",
    shots: [{ beat: "제품 등장", camera: "slow push-in", action: "병이 놓인다", line: "매일 아침" }],
    endpoint: "t2v",
  })),
}));
```

```js
describe("광고 라우트 — 시나리오", () => {
  beforeEach(() => resetMemoryStore());

  it("만들면 시나리오가 문서에 남고 200", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.scenario.shots.length).toBeGreaterThan(0);
    expect(doc.scenario.tries).toBe(1);
    expect(doc.status).toBe("scenario");
    // 사진 0장이므로 코드가 t2v 로 고정한다 — LLM 이 무엇을 말했든
    expect(doc.scenario.endpoint).toBe("t2v");
  });

  it("다시 쓰면 회차가 는다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const made = await (await createAd(post(OK))).json();
    const ctx = { params: Promise.resolve({ id: made.id }) };
    await makeScenario(new Request("http://x", { method: "POST", headers: H }), ctx);
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect((await res.json()).scenario.tries).toBe(2);
  });

  it("상한을 넘으면 400 — 사장님이 할 일이 있는 실패다", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const { MAX_SCENARIO_TRIES } = await import("../lib/pricing.js");
    const { getStore } = await import("../lib/store/index.js");
    const made = await (await createAd(post(OK))).json();
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{}], tries: MAX_SCENARIO_TRIES },
    });
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: made.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("기존 문서면 404", async () => {
    const { POST: makeScenario } = await import("../app/api/ads/[id]/scenario/route.js");
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await makeScenario(
      new Request("http://x", { method: "POST", headers: H }),
      { params: Promise.resolve({ id: p.id }) }
    );
    expect(res.status).toBe(404);
  });
});
```

⚠️ 가짜 LLM 응답(`lib/llm.js` 의 `fakeResponse`)에는 `shots` 가 **빈 배열**이라 `validateScenario` 가 `null` 을 준다. 가짜 모드로 200 을 받고 싶으면 **`fakeResponse` 를 고치지 말고**(기존 파이프라인이 그 모양에 기대고 있다) 이 테스트를 배선 확인으로 남긴다. 관통 검증은 Task 16 에서 한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`app/api/ads/[id]/scenario/route.js`:

```js
import { withUser } from "../../../../../lib/auth/require-user.js";
import { runScenarioStep } from "../../../../../lib/ad/pipeline.js";
import { getProject } from "../../../../../lib/projects.js";
import { loadAd } from "../route.js";

// 동기다 — LLM 만 쓰고 몇 초면 끝난다. fire-and-forget 으로 만들 이유가 없다.
// (유료 생성만 fire-and-forget 이다.)
export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이에요" }, { status: 400 });
  }
  try {
    await runScenarioStep(id, user.id);
  } catch (e) {
    // 상한 초과는 사장님이 할 일이 있는 실패라 400, 나머지는 500
    const over = /너무 많이/.test(e?.message || "");
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: over ? 400 : 500 });
  }
  return Response.json(await getProject(id, user.id));
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add app/api/ads/[id]/scenario tests/ad-routes.test.js
git commit -m "feat(ad): 시나리오 라우트 — 무료, 상한은 400"
```

---

## Task 13: 라우트 — 승인·굽기(`/render`)

**Files:**
- Create: `app/api/ads/[id]/render/route.js`
- Test: `tests/ad-routes.test.js` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 5 (`NoCredits`), Task 10 (`runAdRenderPipeline`), Task 11 (`loadAd`)
- Produces: `POST /api/ads/[id]/render` — 청구(동기) → fire-and-forget

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("광고 라우트 — 굽기", () => {
  beforeEach(() => resetMemoryStore());

  async function withScenario() {
    const made = await (await createAd(post(OK))).json();
    const { getStore } = await import("../lib/store/index.js");
    const row = await getStore().selectProject(made.id, U);
    await getStore().updateProjectRow(made.id, U, row.version, {
      ...row.doc, scenario: { text: "P", shots: [{ beat: "가" }], endpoint: "t2v", tries: 1 }, status: "scenario",
    });
    return made;
  }

  it("잔액이 없으면 402", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(402);
  });

  it("시나리오가 없으면 400 — 값을 받기 전에 막는다", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await (await createAd(post(OK))).json();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(400);
  });

  it("잔액이 있으면 202 로 시작한다", async () => {
    process.env.SHOTFORM_FAKE = "fal";
    const { getStore } = await import("../lib/store/index.js");
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const made = await withScenario();
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: made.id }),
    });
    expect(res.status).toBe(202);
    delete process.env.SHOTFORM_FAKE;
  });

  it("기존 문서면 404", async () => {
    const { POST: render } = await import("../app/api/ads/[id]/render/route.js");
    const p = await runWithActor(U, () => createProject({ material: { text: "옛것" }, ownerId: U }));
    const res = await render(new Request("http://x", { method: "POST", headers: H }), {
      params: Promise.resolve({ id: p.id }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`app/api/ads/[id]/render/route.js`:

```js
import { withUser } from "../../../../../lib/auth/require-user.js";
import { updateProject } from "../../../../../lib/projects.js";
import { runAdRenderPipeline } from "../../../../../lib/ad/pipeline.js";
import { assertCanAfford, NoCredits, alreadyChargedAd } from "../../../../../lib/charges.js";
import { adVideoPrice } from "../../../../../lib/pricing.js";
import { loadAd } from "../route.js";

// ★ 유료 입구다. 청구는 파이프라인이 하지만, **낼 수 있는지는 여기서 먼저 본다** —
//   그래야 사장님이 402 를 HTTP 로 받는다. 파이프라인은 fire-and-forget 이라
//   거기서 던지면 응답이 이미 나가 있다.
export const POST = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  if (!project.scenario?.text) {
    return Response.json({ error: "시나리오를 먼저 만들어 주세요" }, { status: 400 });
  }
  if (project.status === "rendering") {
    return Response.json({ error: "이미 만드는 중이에요" }, { status: 400 });
  }

  // 살아 있는 청구가 없을 때만 잔액을 본다(다시 굽기는 새 회차라 또 받는다).
  if (!(await alreadyChargedAd(id))) {
    try {
      await assertCanAfford(user.id, adVideoPrice(project.settings?.seconds));
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  runAdRenderPipeline(id, user.id).catch(async (e) => {
    console.error("광고 파이프라인 실패:", e);
    await updateProject(id, user.id, (p) => ({
      ...p, video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
  });

  return Response.json({ started: true }, { status: 202 });
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-routes.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add app/api/ads/[id]/render tests/ad-routes.test.js
git commit -m "feat(ad): 굽기 라우트 — 못 내면 402, 시작하면 202"
```

---

## Task 14: 화면 — `/ads/new`

**Files:**
- Create: `app/ads/new/page.js`
- Test: `tests/ad-ui.test.js`

**Interfaces:**
- Consumes: Task 2 (`AD_FORMATS`·`AD_MOODS`·`AD_LANGS`), Task 11 (`POST /api/ads`)
- Produces: 화면 하나. 다음 태스크가 `/ads/[id]` 로 잇는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-ui.test.js` — 이 저장소의 UI 테스트는 **소스를 읽어 판정한다**(`tests/staleness-ui.test.js`·`tests/credits-ui.test.js` 방식). 그 방식을 그대로 따른다:

```js
// 화면 테스트 — 이 저장소는 소스를 읽어 판정한다(렌더링 하네스가 없다).
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

describe("/ads/new 화면", () => {
  it("옵션 목록을 코드에 박지 않고 표에서 읽는다", async () => {
    const src = await read("app/ads/new/page.js");
    expect(src).toMatch(/from ["'].*lib\/ad\/options/);
    // 라벨을 화면에 복사하면 표와 갈린다
    expect(src).not.toContain("제품 히어로");
    expect(src).not.toContain("고급스러운");
  });

  it("가격을 화면에 박지 않는다", async () => {
    const src = await read("app/ads/new/page.js");
    expect(src).not.toMatch(/\b65\b/);
  });

  it("새 CSS 파일을 만들지 않았다", async () => {
    const src = await read("app/ads/new/page.js");
    expect(src).not.toMatch(/\.css["']/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-ui.test.js`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 화면을 쓴다**

`app/ads/new/page.js` — `"use client"` 로 시작한다. 반드시 지킬 것:

- `AD_FORMATS`·`AD_MOODS`·`AD_LANGS` 를 `lib/ad/options.js` 에서 **import 해서 그린다.** 라벨을 복사하지 않는다
- `ASPECTS` 는 `lib/aspects.js` 에서 읽는다
- 기존 CSS 클래스(`.chips`·`.chip`·`.chip.on`)를 쓴다. **새 CSS 금지**
- 사진은 기존 `POST /api/uploads` 로 올리고 받은 `url` 을 모은다. **4장까지**
- [시나리오 만들기] 를 누르면 `POST /api/ads` → 받은 `id` 로 `POST /api/ads/<id>/scenario` → `/ads/<id>` 로 이동
- 400 응답의 `error` 문구를 그대로 화면에 띄운다(닫힌 목록 위반을 사장님이 알아야 한다)

기존 화면 하나(`app/create/page.js`)를 열어 **칩·업로드·오류 표시 방식을 그대로 따른다.** 새 패턴을 만들지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/ad-ui.test.js`
Expected: PASS

- [ ] **Step 5: 빌드가 깨지지 않는지 본다 — ★ 화면이 서버 모듈을 끌었는지의 유일한 판정**

Run: `npm run build`
Expected: 성공. **실패하면 `lib/ad/options.js` 나 `models.js` 에 import 가 들어간 것이다**

⚠️ dev 서버를 켜둔 채로 돌리지 마라 — `.next` 가 덮여 dev 서버가 죽는다.

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
npx vitest run
git add app/ads/new tests/ad-ui.test.js
git commit -m "feat(ad): 새 광고 화면 — 옵션은 표에서 읽는다"
```

---

## Task 15: 화면 — `/ads/[id]` 와 카드 종류 표시

**Files:**
- Create: `app/ads/[id]/page.js`
- Modify: `components/ProjectCards.jsx`
- Test: `tests/ad-ui.test.js` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 11~13 의 라우트, Task 6 의 목록 `kind`
- Produces: 없음(마지막 소비자)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ad-ui.test.js` 에 덧붙인다:

```js
describe("/ads/[id] 화면", () => {
  it("가격 문구를 pricing 에서 읽는다 — 숫자를 화면에 박지 않는다", async () => {
    const src = await read("app/ads/[id]/page.js");
    expect(src).toMatch(/from ["'].*lib\/pricing/);
    expect(src).toMatch(/priceLabel|adVideoPrice/);
    expect(src).not.toMatch(/["']65 크레딧["']/);
  });

  it("상태 넷을 다 다룬다", async () => {
    const src = await read("app/ads/[id]/page.js");
    for (const s of ["draft", "scenario", "rendering", "done"]) {
      expect(src).toContain(s);
    }
  });

  it("굽는 동안 status 를 편다", async () => {
    const src = await read("app/ads/[id]/page.js");
    expect(src).toContain("/status");
  });
});

describe("보관함 카드", () => {
  it("종류를 갈라 그린다 — 두 세계가 한 목록에 섞인다", async () => {
    const src = await read("components/ProjectCards.jsx");
    expect(src).toContain("kind");
  });

  it("광고 카드는 /ads/ 로 간다", async () => {
    const src = await read("components/ProjectCards.jsx");
    expect(src).toContain("/ads/");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/ad-ui.test.js`
Expected: FAIL

- [ ] **Step 3: `app/ads/[id]/page.js` 를 쓴다**

`"use client"`. 한 화면이 상태에 따라 셋으로 변한다:

- `status === "draft"` — "시나리오를 만들어 주세요" + [시나리오 만들기](`POST /api/ads/<id>/scenario`)
- `status === "scenario"` — 시나리오 카드(`scenario.shots` 를 `beat`/`camera`/`action`/`line` 으로 그린다) + [이대로 만들기] + [다시 쓰기]
  - [이대로 만들기] 옆에 **`priceLabel(adVideoPrice(settings.seconds))`** 를 적는다. 숫자를 박지 않는다
  - [다시 쓰기] 는 무료임을 문구로 밝힌다
- `status === "rendering"` — `GET /api/ads/<id>/status` 를 **2초마다** 편다(기존 화면들과 같은 주기)
- `status === "done"` — `videos[0].url` 을 `<video controls>` 로 재생 + 내려받기 + [다시 만들기](또 정가임을 밝힌다)
- `video_error` 가 있으면 기존 화면들과 같은 오류 자리에 띄운다

- [ ] **Step 4: `components/ProjectCards.jsx` 를 고친다**

목록 항목의 `kind` 를 읽어:
- `kind === "ad"` → 링크를 `/ads/<id>` 로, 카드에 종류 표시("광고")
- 그 밖(=`null`, 옛 문서) → 지금 동작 **그대로**

⚠️ 기존 카드의 동작을 바꾸지 않는다. `kind` 가 없을 때의 경로가 지금과 같은지 확인한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/ad-ui.test.js`
Expected: PASS

- [ ] **Step 6: 빌드 + 전체 테스트**

```bash
npm run build
npx vitest run
```

- [ ] **Step 7: 커밋**

```bash
git add app/ads components/ProjectCards.jsx tests/ad-ui.test.js
git commit -m "feat(ad): 광고 화면과 보관함 카드 종류 표시"
```

---

## Task 16: 가짜 모드 관통 검증

**Files:**
- 없음(검증만). 발견한 결함이 있으면 그 자리에서 고치고 커밋한다

**Interfaces:**
- Consumes: 전부

- [ ] **Step 1: 0원으로 관통한다**

```bash
SHOTFORM_FAKE=all npm run dev
```

브라우저에서:
1. `/ads/new` — 옵션 여섯을 고르고, 사진 없이 프롬프트만 넣고 [시나리오 만들기]
2. `/ads/<id>` 로 이동하는가
3. 시나리오가 안 만들어지면(가짜 LLM 응답에 `shots` 가 없다) **그것이 정상이다** — 오류 문구가 화면에 뜨는지만 본다

- [ ] **Step 2: OpenAI 만 진짜로 관통한다 (★ 사용자 승인 필요, 약 $0.01)**

```bash
SHOTFORM_FAKE=fal npm run dev
```

이 모드는 **LLM 만 진짜**다. 시나리오가 실제로 만들어지고, fal 은 가짜라 영상은 자리표시자다. 확인할 것:

1. 시나리오 카드에 장면들이 뜨는가 — `beat`·`camera`·`action`·`line` 이 다 보이는가
2. 고른 옵션이 시나리오에 반영됐는가(포맷의 뼈대가 보이는가)
3. [다시 쓰기] 를 누르면 다른 시나리오가 나오는가
4. [이대로 만들기] → `rendering` → `done` 으로 상태가 흐르는가
5. **크레딧이 65 줄었는가** (`GET /api/credits`)
6. 옵션을 고치면 시나리오가 사라지고 `draft` 로 돌아가는가
7. 보관함에 광고 카드가 종류 표시와 함께 뜨고, 눌렀을 때 `/ads/<id>` 로 가는가

- [ ] **Step 3: ★ 격리를 손으로 확인한다**

1. 기존 프로젝트 하나를 열어 **지금까지처럼 동작하는지** 본다(6단계 화면이 멀쩡한가)
2. 기존 프로젝트 id 를 `/ads/<그 id>` 에 넣으면 "찾을 수 없어요"가 나오는가
3. 광고 프로젝트 id 를 `/create/<그 id>` 에 넣으면 되튕기는가

- [ ] **Step 4: 전체 테스트와 빌드**

```bash
npx vitest run
npm run build
```

Expected: 테스트는 착수 시점 개수 이상·실패 0. 빌드 성공.

- [ ] **Step 5: 결과를 적는다**

설계 문서의 "아직 모르는 것"에 이번에 알게 된 것을 덧붙인다. **본 것만 적는다.**

- [ ] **Step 6: 커밋**

```bash
git add -u
git commit -m "test(ad): 가짜 모드 관통 검증 — 격리와 상태 전이 확인"
```

- [ ] **Step 7: ★ 진짜 생성은 사용자 승인 뒤에**

`SHOTFORM_FAKE` 없이 한 편을 실제로 만드는 것은 **$3.63** 이다. 돌리기 전에 반드시 묻는다. 승인받으면 확인할 것: 완성본이 `renders` 버킷에 올라갔는가(URL 이 `/api/renders/…` 인가) · 원장에 seedance 엔드포인트와 원가가 남았는가 · **소리가 나오는가**.

---

## 자체 검토 결과

**스펙 대조 — 빠진 것 없음:**

| 스펙 절 | 태스크 |
|---|---|
| 사용자 흐름 5단계 | 11·12·13·14·15 |
| 문서 모양·상태 전이 | 6·11 |
| 옵션 세 축·화풍 문구 분리 | 2·14 |
| 화면 둘 | 14·15 |
| 새 파일 5 (`lib/ad/*`) | 1·2·8·9·10 |
| 라우트 6 | 11·12·13 |
| 양방향 격리 | 7·11 |
| 자동 배치 | 8 |
| 사진 data URI·상한 | 9·11 |
| 기존 파일 7 수정 | 3·4·5·6·15 |
| 크레딧 65·시나리오 20회 | 4·10·12·13 |
| 청구·환불 | 5·10 |
| 실패 표 6줄 | 10·12·13 |
| renders 버킷 이관 | 10 |
| 기존 시스템 보장 네 겹 | Global Constraints·3·5·6·7·16 |
| 60초 대비 4가지 | 1(`AD_SECONDS`)·6·10(`videos` 배열)·11(`model` 명시) |
| 확인 방법 8줄 | 각 태스크 테스트 + 16 |
| 아직 모르는 것 7 | 0·16 |

**자리표시자 없음** — 모든 코드 단계에 실제 코드가 들어 있다. Task 14·15 의 화면은 코드 대신 **지켜야 할 규칙 목록**으로 적었다(이 저장소에 렌더링 하네스가 없어 화면 코드를 테스트가 못 잡는다 — 대신 소스를 읽는 테스트를 붙였다).

**이름 일관성 확인** — `adEndpoint`·`adModel`·`AD_SECONDS`·`normalizeAdOptions`·`adVideoPrice`·`MAX_SCENARIO_TRIES`·`chargeAd`·`refundAd`·`alreadyChargedAd`·`adKey`·`pickEndpointKind`·`generateScenario`·`generateAdVideo`·`runScenarioStep`·`runAdRenderPipeline`·`loadAd` 가 정의된 태스크와 쓰이는 태스크에서 같다.

**계약 확인이 필요한 자리(구현자가 파일을 열어 맞춘다):** `insertGrant` 인자 이름 · `selectProject`/`updateProjectRow` 반환 모양 · `listCosts` 존재 여부 · `updateProject` 가 갱신 문서를 돌려주는지 · 기존 라우트 테스트의 Request 만드는 방식. **다르면 테스트를 실제 계약에 맞춘다 — 구현을 바꾸지 않는다.**
