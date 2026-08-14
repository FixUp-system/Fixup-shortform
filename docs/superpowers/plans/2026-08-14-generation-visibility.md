# 생성 상태 가시화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지·영상 생성이 도는 중인지 · 멈췄는지 · 실패했는지(그리고 왜)를 화면이 구분해 말하게 만든다.

**Architecture:** 판정을 화면이 아니라 순수 모듈 셋(`lib/step-errors.js`·`lib/failure.js`·`lib/progress.js`)이 낸다. 파이프라인은 컷마다 이미 도는 저장에 진척 표식(`doc.progress`)을 얹고, 상태 라우트 다섯이 그것을 `stalled_for_ms` 숫자 하나로 바꿔 내보낸다. 화면 다섯에 복붙된 폴링은 `lib/poll.js` 한 벌로 모은다.

**Tech Stack:** Next.js 15 App Router · React 19 · vitest 4 · Supabase(JSONB doc + version 낙관적 락). **새 의존성 없음.**

**Spec:** `docs/superpowers/specs/2026-08-14-generation-visibility-design.md`

## Global Constraints

- **새 의존성을 추가하지 않는다.** `package.json` 을 건드리지 않는다.
- **순수 모듈 규칙**: `lib/step-errors.js`·`lib/failure.js`·`lib/progress.js`·`lib/poll.js` 는 화면이 import 한다. 따라서 `fs`·`next/server`·env 를 끌고 오는 것을 import 하면 안 된다(`lib/pricing.js`·`lib/steps.js` 와 같은 규칙 — 그 파일들 머리 주석에 이유가 적혀 있다).
- **컴포넌트 렌더 테스트 인프라가 없다**(`lib/projects-client.js:2` 주석). 화면 동작은 소스 문자열을 읽어 재는 `tests/*-ui.test.js` 관례를 따른다(`tests/video-preview-ui.test.js` 참고). 판정 로직은 반드시 순수 모듈로 빼서 직접 잰다.
- **`patchFn` 은 순수해야 한다.** `updateProject` 는 낙관적 락이라 CAS 에 지면 같은 `patchFn` 을 다시 부른다(`lib/projects.js:25-40`). 시각(`Date.now()`)은 `patchFn` **밖에서** 재서 닫아 넣는다.
- **스토어 구현 둘이 같은 계약이어야 한다.** `lib/store/memory.js` 와 `lib/store/supabase.js` 의 부분 읽기 함수는 같은 모양을 돌려준다(`memory.js:64-67` 주석). 한쪽만 고치면 테스트는 통과하고 프로덕션이 깨진다.
- **멈춤 임계 120,000ms.** 상수는 `lib/progress.js` 한 곳에만 적는다.
- **"끝난 컷"의 정의는 `lib/progress.js` 의 `isCutDone(cut, phase)` 하나가 쥔다.** 파이프라인이든 화면이든 그 술어를 손으로 다시 적지 않는다 — 실제로 갈렸다. 계획 초안은 이미지 단계의 술어를 두 곳에 적었고 둘 다 실패한 컷(`image` 없이 `state:"needs_attention"`)을 세지 않아, 정상 종료한 실행이 영구히 "멈춤"으로 읽혔다. 진행 판정에 넘기는 `done` 은 **더 기다릴 것이 남았는가**를 세는 값이라 실패로 끝난 컷도 끝난 것이다. 사장님에게 보여주는 "N개 만들었어요"는 그것과 **다른 값**(성공한 것만)이니 섞지 말 것.
- **합성(render)은 멈춤 판정에서 제외한다.** 합성은 단일 ffmpeg 작업이라 중간 진척이 없고 최대 10분까지 정상적으로 걸린다 — 120초 임계를 적용하면 정상 합성이 전부 "멈춤"으로 보인다.
- 기존 **2,272 그린**이 유지되어야 한다. 매 태스크 끝에서 `npm test` 전체를 돌린다.
- 한국어 주석·문구. 사장님에게 보이는 말에는 내부 필드명(`images_error` 등)을 쓰지 않는다.

## File Structure

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `lib/step-errors.js` | 단계 → 봐야 할 오류 필드 표. import 0개 |
| `lib/failure.js` | 원시 오류 문구 → `{code, message, retryable}`. import 0개 |
| `lib/progress.js` | `{done,total,error,phase,stalledForMs,busy}` → 네 상태 중 하나. `step-errors`·`failure` 만 import |
| `lib/poll.js` | 주입식 폴링 루프. import 0개 |

**고치는 것**

| 파일 | 무엇을 |
|---|---|
| `lib/store/memory.js` · `lib/store/supabase.js` | 부분 읽기 셋에 `images_error`·`progress` 추가 |
| `lib/pipeline.js` | 컷 저장에 `progress` 를 함께 얹는다 |
| `app/api/projects/[id]/images/route.js` · `clips/route.js` · `voice/route.js` · `render/route.js` | 시작 시 `progress` 초기 스탬프 |
| `app/api/projects/[id]/status/route.js` 외 상태 라우트 4개 | `stalled_for_ms`·`progress` 내보내기 |
| `app/create/[id]/{images,video,voice,script,done}/page.js` | 폴링 이관 + 네 상태 표시 |

**의존 방향**: `step-errors` ← `progress` → `failure`. `poll` 은 아무것도 안 본다. 화면은 셋 다 본다. 순환 없음.

---

### Task 1: 단계별 오류 필드 표 (`lib/step-errors.js`)

지금 상태 라우트 다섯이 각자 다른 오류 필드 조합을 손으로 싣고 있고, 이미지 화면이 `images_error` 를 영영 못 보던 버그가 그 어긋남이다. 표를 한 곳에 두고 스토어·라우트·화면이 같은 것을 본다.

**Files:**
- Create: `lib/step-errors.js`
- Test: `tests/step-errors.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `ALL_ERROR_FIELDS: string[]`
  - `STEP_ERROR_FIELDS: Record<"script"|"voice"|"images"|"video"|"done", string[]>`
  - `firstError(status: object, stepKey: string) → { field: string, message: string } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/step-errors.test.js`:

```js
import { describe, it, expect } from "vitest";
import { ALL_ERROR_FIELDS, STEP_ERROR_FIELDS, firstError } from "../lib/step-errors.js";

describe("단계별 오류 필드 표", () => {
  it("다섯 단계를 모두 덮는다", () => {
    expect(Object.keys(STEP_ERROR_FIELDS).sort())
      .toEqual(["done", "images", "script", "video", "voice"]);
  });

  // ★ 이 자리가 이번 버그의 회귀 방어다 — 이미지 단계가 images_error 를 본다는 사실.
  it("이미지 단계는 images_error 를 본다", () => {
    expect(STEP_ERROR_FIELDS.images).toContain("images_error");
  });

  it("표에 적힌 필드는 전부 아는 필드다", () => {
    for (const fields of Object.values(STEP_ERROR_FIELDS)) {
      for (const f of fields) expect(ALL_ERROR_FIELDS).toContain(f);
    }
  });

  it("앞엣것이 더 가까운 원인이다 — 둘 다 있으면 앞엣것", () => {
    const status = { images_error: "그림 실패", cuts_error: "컷 실패" };
    expect(firstError(status, "images")).toEqual({ field: "images_error", message: "그림 실패" });
  });

  it("앞엣것이 없으면 뒤엣것", () => {
    expect(firstError({ cuts_error: "컷 실패" }, "images"))
      .toEqual({ field: "cuts_error", message: "컷 실패" });
  });

  it("오류가 없으면 null", () => {
    expect(firstError({ status: "images" }, "images")).toBeNull();
  });

  it("모르는 단계·빈 입력에도 안 던진다", () => {
    expect(firstError({ images_error: "x" }, "무슨단계")).toBeNull();
    expect(firstError(null, "images")).toBeNull();
    expect(firstError(undefined, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/step-errors.test.js`
Expected: FAIL — `Failed to resolve import "../lib/step-errors.js"`

- [ ] **Step 3: 최소 구현**

`lib/step-errors.js`:

```js
// 단계마다 "봐야 할 오류 필드"의 유일한 표.
//
// 왜 표로 두는가 — 상태 라우트 다섯이 각자 다른 조합을 손으로 싣고 있었고, ④이미지 화면이
// images_error 를 영영 못 보던 버그가 정확히 그 어긋남이었다(2026-08-14). 스토어·라우트·
// 화면이 같은 표를 보면 그 자리가 다시 생기지 않는다.
//
// import 0 개의 순수 데이터다 — 화면이 읽어도 번들에 서버 것이 안 섞인다
// (lib/pricing.js·lib/steps.js 와 같은 규칙).

// 문서에 남을 수 있는 오류 필드 전부. 스토어의 부분 읽기가 무엇을 실어야 하는지의 기준이다.
export const ALL_ERROR_FIELDS = [
  "cuts_error",
  "voice_error",
  "images_error",
  "video_error",
  "render_error",
];

// 단계 → 그 화면이 봐야 할 오류 필드. **앞에 적힌 것이 더 가까운 원인**이다.
//
// ②대본·③목소리가 cuts_error 를 함께 보는 이유: 컷 분할은 대본 승인이 부르고 그 실패는
// 두 화면 어디에서나 사장님을 막는다. ⑤영상은 컷이 이미 있는 것이 전제라 안 본다.
export const STEP_ERROR_FIELDS = {
  script: ["cuts_error"],
  voice: ["voice_error", "cuts_error"],
  images: ["images_error", "cuts_error"],
  video: ["video_error"],
  done: ["render_error"],
};

// 이 단계에서 지금 살아 있는 첫 오류. 없으면 null.
// status 는 상태 라우트가 돌려준 것(혹은 프로젝트 문서) — 둘 다 같은 필드 이름을 쓴다.
export function firstError(status, stepKey) {
  for (const field of STEP_ERROR_FIELDS[stepKey] || []) {
    const message = status?.[field];
    if (message) return { field, message };
  }
  return null;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/step-errors.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 회귀**

Run: `npm test`
Expected: 기존 그린 유지 + 7 추가

- [ ] **Step 6: 커밋**

```bash
git add lib/step-errors.js tests/step-errors.test.js
git commit -m "feat(steps): 단계마다 봐야 할 오류 필드를 한 표에 모은다"
```

---

### Task 2: 사유 분류 (`lib/failure.js`)

지금 실패는 `e?.message` 한 줄이라 사장님이 "왜"도 "다시 눌러도 되는지"도 모른다.

뒷단이 던지는 문구는 대개 `이미지 생성 실패 (429) {본문}` 꼴이다 — `lib/imagegen.js:68`·`lib/i2v.js:52`·`lib/tts.js:36`·`lib/llm.js:59` 가 같은 모양으로 던진다. 그래서 **괄호 안 HTTP 상태**가 본문 낱말보다 믿을 만한 단서다.

**Files:**
- Create: `lib/failure.js`
- Test: `tests/failure.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `FAILURE_CODES: string[]`
  - `classifyFailure(raw: string | Error | null) → { code: string, message: string, retryable: boolean }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/failure.test.js`:

```js
import { describe, it, expect } from "vitest";
import { classifyFailure, FAILURE_CODES } from "../lib/failure.js";

describe("실패 사유 분류", () => {
  it("크레딧 부족은 장부 문구를 그대로 쓰고 재시도를 열지 않는다", () => {
    const r = classifyFailure("크레딧이 모자라요 — 이 작업은 160 크레딧인데 20 남았어요");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
    expect(r.message).toContain("160 크레딧인데 20 남았어요");
  });

  it("예산 상한도 재시도를 열지 않는다", () => {
    const r = classifyFailure("예산 상한($5)에 닿아 멈췄어요 — 지금까지 $5.10 썼어요");
    expect(r.code).toBe("budget");
    expect(r.retryable).toBe(false);
  });

  it("429 는 몰린 것 — 다시 시도할 수 있다", () => {
    const r = classifyFailure("이미지 생성 실패 (429) rate limited");
    expect(r.code).toBe("busy");
    expect(r.retryable).toBe(true);
  });

  it("504 는 시간 초과다", () => {
    expect(classifyFailure("영상 생성 실패 (504) gateway timeout").code).toBe("timeout");
  });

  it("5xx 는 만드는 쪽 문제다", () => {
    expect(classifyFailure("영상 생성 실패 (500) internal").code).toBe("provider");
  });

  it("402 는 5xx·4xx 규칙보다 먼저 걸려 크레딧으로 읽힌다", () => {
    const r = classifyFailure("이미지 생성 실패 (402) insufficient balance");
    expect(r.code).toBe("no_credits");
    expect(r.retryable).toBe(false);
  });

  it("그 밖 4xx 는 모델이 거부한 것으로 본다", () => {
    const r = classifyFailure("이미지 생성 실패 (400) content policy violation");
    expect(r.code).toBe("rejected");
    expect(r.retryable).toBe(true);
  });

  it("빈 결과", () => {
    expect(classifyFailure("영상 결과가 비어 있어요").code).toBe("empty");
  });

  it("연결 실패", () => {
    expect(classifyFailure("fetch failed").code).toBe("network");
    expect(classifyFailure("connect ETIMEDOUT 1.2.3.4:443").code).toBe("network");
  });

  // ★ 이 자리가 이 표의 핵심이다 — 못 알아본 것을 "알 수 없는 오류"로 뭉개면
  //   지금보다 정보가 **줄어든다**. 사장님이 우리에게 문구를 그대로 읽어 줄 수 있어야 한다.
  it("못 알아본 것은 원문을 그대로 내보낸다", () => {
    const r = classifyFailure("ffmpeg 가 -22 로 죽었어요");
    expect(r.code).toBe("unknown");
    expect(r.message).toBe("ffmpeg 가 -22 로 죽었어요");
    expect(r.retryable).toBe(true);
  });

  it("Error 객체도 받는다", () => {
    expect(classifyFailure(new Error("이미지 생성 실패 (429) x")).code).toBe("busy");
  });

  it("빈 입력에도 안 던진다", () => {
    for (const v of [null, undefined, "", {}]) {
      const r = classifyFailure(v);
      expect(FAILURE_CODES).toContain(r.code);
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/failure.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/failure.js`:

```js
// 왜 안 됐는지를 사장님 말로 옮긴다.
//
// 뒷단이 남기는 문구는 대개 `이미지 생성 실패 (429) {본문}` 꼴이다
// (lib/imagegen.js·lib/i2v.js·lib/tts.js·lib/llm.js 가 같은 모양으로 던진다).
// 그래서 **괄호 안의 HTTP 상태**가 가장 믿을 만한 단서다 — 본문 낱말로 맞히는 것보다
// 안정적이고, 제공자가 문구를 바꿔도 안 흔들린다.
//
// ★ 못 알아본 것은 **원문 그대로** 내보낸다. "알 수 없는 오류"로 뭉개면 지금보다 정보가
//   줄어든다 — 사장님이 우리에게 그 문구를 그대로 읽어 줄 수 있어야 고칠 수 있다.
//
// import 0 개의 순수 모듈이다 — 화면이 읽어도 안전하다(lib/pricing.js 와 같은 규칙).

export const FAILURE_CODES = [
  "no_credits", "budget", "rejected", "busy", "timeout", "network", "provider", "empty", "unknown",
];

export function classifyFailure(raw) {
  const text = (typeof raw === "string" ? raw : raw?.message) || "";
  if (!text) return { code: "unknown", message: "만들지 못했어요", retryable: true };

  // 돈 — 여기서는 **원문이 곧 사장님에게 할 말**이다(lib/charges.js·lib/costs.js 가 남긴
  // 문구에 얼마가 모자란지까지 들어 있다). 다시 써서 그 숫자를 잃지 않는다.
  if (text.includes("크레딧이 모자라요")) {
    return { code: "no_credits", message: text, retryable: false };
  }
  if (text.includes("예산 상한")) {
    return { code: "budget", message: text, retryable: false };
  }

  // 괄호 안 세 자리 숫자 = 제공자가 준 HTTP 상태.
  const status = Number((text.match(/\((\d{3})\)/) || [])[1]) || 0;
  // ★ 402 를 아래 4xx 규칙보다 **먼저** 본다 — 순서가 뒤바뀌면 돈 문제가 "장면을 못 만들었어요"가 된다.
  if (status === 402) {
    return { code: "no_credits", message: "크레딧이 모자라요 — 충전한 뒤 다시 시도해 주세요", retryable: false };
  }
  if (status === 429) {
    return { code: "busy", message: "만드는 쪽에 요청이 몰렸어요 — 잠시 뒤 다시 시도해 주세요", retryable: true };
  }
  if (status === 408 || status === 504) {
    return { code: "timeout", message: "만드는 데 너무 오래 걸렸어요 — 다시 시도해 주세요", retryable: true };
  }
  if (status >= 500) {
    return { code: "provider", message: "만드는 쪽 서비스에 문제가 있어요 — 잠시 뒤 다시 시도해 주세요", retryable: true };
  }
  if (status >= 400) {
    // 안전 필터·잘못된 요청이 여기로 온다. 사장님이 할 수 있는 일은 같다 — 문장을 바꿔 다시.
    return { code: "rejected", message: "이 장면은 만들지 못했어요 — 문장을 조금 바꿔 다시 시도해 주세요", retryable: true };
  }

  if (/결과가 비어 있어요/.test(text)) {
    return { code: "empty", message: "결과가 비어서 왔어요 — 다시 시도해 주세요", retryable: true };
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(text)) {
    return { code: "network", message: "잠시 연결이 끊겼어요 — 다시 시도해 주세요", retryable: true };
  }

  return { code: "unknown", message: text, retryable: true };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/failure.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: 전체 회귀**

Run: `npm test`

- [ ] **Step 6: 커밋**

```bash
git add lib/failure.js tests/failure.test.js
git commit -m "feat(failure): 실패 사유를 사장님 말로 옮긴다 — 못 알아본 것은 원문 그대로"
```

---

### Task 3: 스토어가 `images_error` 와 `progress` 를 싣는다

**여기가 1-1 버그의 수정 지점이다.** `selectProjectCuts` 가 `images_error` 를 안 돌려줘서 이미지 화면이 실패를 영영 못 봤다.

`progress` 필드의 모양(Task 4 가 쓴다): `{ at: number, phase: "images"|"voice"|"video"|"render", done: number, total: number }`. 옛 문서에는 없다 → `null`.

**Files:**
- Modify: `lib/store/memory.js` (`selectProjectProgress`·`selectProjectRender`·`selectProjectCuts`)
- Modify: `lib/store/supabase.js` (같은 셋의 select 문자열과 반환)
- Test: `tests/store-progress-fields.test.js` (create)

**Interfaces:**
- Consumes: `ALL_ERROR_FIELDS` (Task 1) — 테스트가 쓴다
- Produces: 부분 읽기 셋의 반환에 `images_error`(cuts 쪽만 새로), `progress: object|null` 추가

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/store-progress-fields.test.js`:

```js
// ★ 이 파일은 두 가지를 막는다.
//  ① selectProjectCuts 가 images_error 를 빠뜨리던 버그(2026-08-14) — 이미지 실패가
//     화면까지 영영 도착하지 않았다.
//  ② memory·supabase 두 구현이 다른 모양을 돌려주는 것 — 한쪽만 고치면 테스트는 통과하고
//     프로덕션이 깨진다(lib/store/memory.js:64-67 주석).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

const OWNER = "44444444-4444-4444-4444-444444444444";

const doc = {
  id: "p1",
  status: "images",
  cuts: [{ idx: 0 }, { idx: 1 }],
  images_error: "이미지 생성 실패 (429) rate limited",
  progress: { at: 1_700_000_000_000, phase: "images", done: 1, total: 2 },
};

describe("부분 읽기가 실패와 진척을 싣는다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProject(doc, OWNER);
  });

  it("컷 상태에 images_error 가 있다", async () => {
    const st = await memoryStore.selectProjectCuts("p1", OWNER);
    expect(st.images_error).toBe("이미지 생성 실패 (429) rate limited");
  });

  it("컷 상태에 progress 가 있다", async () => {
    const st = await memoryStore.selectProjectCuts("p1", OWNER);
    expect(st.progress).toEqual({ at: 1_700_000_000_000, phase: "images", done: 1, total: 2 });
  });

  it("진행 상태와 합성 상태에도 progress 가 있다", async () => {
    expect((await memoryStore.selectProjectProgress("p1", OWNER)).progress.phase).toBe("images");
    expect((await memoryStore.selectProjectRender("p1", OWNER)).progress.phase).toBe("images");
  });

  it("progress 가 없는 옛 문서는 null 이다 — 없는 것과 0 은 다르다", async () => {
    resetMemoryStore();
    await memoryStore.insertProject({ id: "old", status: "images", cuts: [] }, OWNER);
    expect((await memoryStore.selectProjectCuts("old", OWNER)).progress).toBeNull();
    expect((await memoryStore.selectProjectProgress("old", OWNER)).progress).toBeNull();
  });

  it("남의 것은 여전히 null 이다", async () => {
    expect(await memoryStore.selectProjectCuts("p1", "55555555-5555-5555-5555-555555555555")).toBeNull();
  });

  // supabase 쪽은 라이브 없이 호출할 수 없으므로 select 문자열을 소스에서 읽어 확인한다.
  // (tests/store-supabase-rows.test.js 가 쓰는 것과 같은 수법이다.)
  it("supabase 구현도 같은 필드를 뽑는다", () => {
    const src = readFileSync("lib/store/supabase.js", "utf8");
    const cuts = src.slice(src.indexOf("async selectProjectCuts"), src.indexOf("async listProjects"));
    expect(cuts, "selectProjectCuts 가 images_error 를 안 뽑는다").toMatch(/images_error/);
    expect(cuts, "selectProjectCuts 가 progress 를 안 뽑는다").toMatch(/progress/);

    const prog = src.slice(src.indexOf("async selectProjectProgress"), src.indexOf("async selectProjectRender"));
    expect(prog).toMatch(/progress/);

    const render = src.slice(src.indexOf("async selectProjectRender"), src.indexOf("async selectProjectCuts"));
    expect(render).toMatch(/progress/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/store-progress-fields.test.js`
Expected: FAIL — `images_error` 가 undefined, `progress` 가 undefined

- [ ] **Step 3: memory 구현**

`lib/store/memory.js` — `selectProjectProgress` 의 반환에 한 줄 추가:

```js
      cut_count: (d.cuts || []).length,
      // 심장박동 — 파이프라인이 마지막으로 살아 있던 시각·단계·진척.
      // 옛 문서에는 없다. **null 과 0 은 다르다**: null 은 "판정 불가"이지 "멈춤"이 아니다.
      progress: d.progress ? clone(d.progress) : null,
```

`selectProjectRender` 의 반환에:

```js
      render_error: row.doc.render_error || null,
      progress: row.doc.progress ? clone(row.doc.progress) : null,
```

`selectProjectCuts` 의 반환에 **두 줄**:

```js
      video_error: d.video_error || null,
      // ★ 2026-08-14 — 여기가 빠져 있어서 이미지 생성 실패가 화면까지 영영 못 갔다.
      //   ④이미지 화면이 2초마다 두드리는 것이 이 함수다(GET /cuts/status).
      images_error: d.images_error || null,
      progress: d.progress ? clone(d.progress) : null,
```

- [ ] **Step 4: supabase 구현**

`lib/store/supabase.js` — `selectProjectProgress` 의 select 문자열 끝에 `progress` 를 더하고 반환에 넣는다:

```js
      .select(
        "status,kind:doc->>kind," +
          "cuts_error:doc->>cuts_error,voice_error:doc->>voice_error," +
          "images_error:doc->>images_error,video_error:doc->>video_error," +
          "render_error:doc->>render_error,cut_count:doc->cuts,progress:doc->progress"
      )
```
```js
      cut_count: Array.isArray(data.cut_count) ? data.cut_count.length : 0,
      progress: data.progress || null,
```

`selectProjectRender`:

```js
      .select("status,kind:doc->>kind,render:doc->render,render_error:doc->>render_error,progress:doc->progress")
```
```js
      render_error: data.render_error || null,
      progress: data.progress || null,
```

`selectProjectCuts`:

```js
      .select(
        "status,kind:doc->>kind,cuts:doc->cuts," +
          "cuts_error:doc->>cuts_error,voice_error:doc->>voice_error," +
          "video_error:doc->>video_error,images_error:doc->>images_error," +
          "progress:doc->progress"
      )
```
```js
      video_error: data.video_error || null,
      // ★ 2026-08-14 — 빠져 있던 자리. 이미지 실패가 화면에 영영 안 닿았다.
      images_error: data.images_error || null,
      progress: data.progress || null,
```

`->>` 가 아니라 `->` 를 쓴다 — `progress` 는 문자열이 아니라 객체다(`render:doc->render` 와 같은 이유).

그리고 `selectProjectCuts` 위의 실측표 주석(`supabase.js:114-129`)에 한 줄 덧붙인다:

```js
  //   selectProjectCuts       9,417 B   ← 1/1.4 (cuts 가 doc 의 대부분이라 여기가 한계)
  // ★ images_error·progress 를 실은 뒤에도 이 크기는 거의 그대로다(문자열 한 줄 + 작은 객체).
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/store-progress-fields.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: 전체 회귀**

Run: `npm test`
Expected: 기존 그린 유지. `tests/store-memory.test.js`·`tests/store-supabase-rows.test.js` 가 반환 모양을 통째로 비교한다면 그 기대값에도 새 필드를 더한다.

- [ ] **Step 7: 커밋**

```bash
git add lib/store/memory.js lib/store/supabase.js tests/store-progress-fields.test.js
git commit -m "fix(store): 이미지 실패가 화면까지 못 가던 것 — 컷 상태에 images_error 를 싣는다"
```

---

### Task 4: 파이프라인이 심장박동을 남긴다

서버리스에서 fire-and-forget 이 얼어 죽으면 오류조차 안 남는다. 파이프라인은 이미 컷마다 `updateProject` 를 부르니, **그 저장에 진척 표식을 함께 얹는다** — 쓰기 횟수는 늘지 않는다.

**Files:**
- Modify: `lib/pipeline.js` (`processCut` 의 `setCut`, `runVoicePipeline`, `runVideoPipeline` 의 컷 저장)
- Test: `tests/pipeline-progress.test.js` (create)

**Interfaces:**
- Consumes: 없음
- Produces: 문서에 `progress: { at, phase, done, total }`. `lib/pipeline.js` 에서 export 하는 `withProgress(proj, phase, at)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline-progress.test.js`:

```js
import { describe, it, expect } from "vitest";
import { withProgress } from "../lib/pipeline.js";

describe("심장박동 표식", () => {
  it("이미지 단계는 그림이 있거나 내 사진인 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [
      { idx: 0, image: { url: "a" } },
      { idx: 1, source: "photo" },
      { idx: 2 },
    ] };
    expect(withProgress(proj, "images", 111).progress)
      .toEqual({ at: 111, phase: "images", done: 2, total: 3 });
  });

  it("목소리 단계는 낭독이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [{ idx: 0, audio: {} }, { idx: 1, voice_error: "x" }, { idx: 2 }] };
    expect(withProgress(proj, "voice", 1).progress.done).toBe(2);
  });

  it("영상 단계는 클립이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [{ idx: 0, video: {} }, { idx: 1, video_error: "x" }, { idx: 2 }] };
    expect(withProgress(proj, "video", 1).progress.done).toBe(2);
  });

  it("원래 문서를 안 건드린다 — 새 객체를 돌려준다", () => {
    const proj = { cuts: [], status: "images" };
    const next = withProgress(proj, "images", 5);
    expect(proj.progress).toBeUndefined();
    expect(next.status).toBe("images");
  });

  it("컷이 없어도 안 던진다", () => {
    expect(withProgress({}, "images", 7).progress).toEqual({ at: 7, phase: "images", done: 0, total: 0 });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline-progress.test.js`
Expected: FAIL — `withProgress is not a function`

- [ ] **Step 3: `withProgress` 를 만든다**

`lib/pipeline.js` 의 `processCut` **위**에 추가:

```js
// ── 심장박동 ────────────────────────────────────────────────────────────────
//
// 왜 필요한가: 생성 라우트는 파이프라인을 await 하지 않고 응답한다(서버리스에서 응답을
// 먼저 돌려줘야 하기 때문이다). 그래서 응답 뒤 함수가 얼면 catch 조차 돌지 않고 컷이
// generating 인 채로 남는다 — 오류 필드도 비어 있어 화면에서 보면 "영원히 만드는 중"이다.
//
// 파이프라인이 컷마다 이미 저장을 하므로, 그 저장에 "언제·어느 단계·몇 개째"를 얹는다.
// **쓰기 횟수는 늘지 않는다.** 진척이 멈추면 그것이 곧 죽었다는 신호다.
//
// ★ at 은 이 함수 밖에서 받는다. updateProject 는 낙관적 락이라 CAS 에 지면 같은 patchFn 을
//   다시 부른다(lib/projects.js) — patchFn 안에서 Date.now() 를 부르면 시도마다 값이 달라져
//   "부작용 없는 patchFn" 규약이 깨진다.
//
// ★ done 은 밖에서 세어 넘기지 않고 **문서에서 판다.** 밖에서 세면 CAS 재시도로 문서가
//   바뀌었을 때 옛 숫자가 저장된다. 파생값은 파생값답게 그 자리에서 만든다.
const PHASE_DONE = {
  images: (c) => !!(c.image || c.source === "photo"),
  voice: (c) => !!(c.audio || c.voice_error),
  video: (c) => !!(c.video || c.video_error),
};

export function withProgress(proj, phase, at) {
  const cuts = proj?.cuts || [];
  const isDone = PHASE_DONE[phase] || (() => false);
  return {
    ...proj,
    progress: { at, phase, done: cuts.filter(isDone).length, total: cuts.length },
  };
}
```

- [ ] **Step 4: `processCut` 의 저장에 얹는다**

`lib/pipeline.js` 의 `setCut` 을 바꾼다:

```js
  const setCut = (patch) => {
    // 시각은 락 밖에서 잰다 — 위 withProgress 주석 참고
    const at = Date.now();
    return updateProject(projectId, ownerId, (proj) =>
      withProgress(
        { ...proj, cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)) },
        "images",
        at
      )
    );
  };
```

- [ ] **Step 5: 목소리·영상 파이프라인의 컷 저장에도 얹는다**

`runVoicePipeline` 안에서 컷에 `audio` 나 `voice_error` 를 쓰는 `updateProject` 호출(`lib/pipeline.js` 의 두 자리, `audio:` 와 `voice_error:` 를 쓰는 곳)을 같은 모양으로 감싼다:

```js
        const at = Date.now();
        await updateProject(projectId, ownerId, (proj) =>
          withProgress({ ...proj, cuts: /* 기존 map 그대로 */ }, "voice", at)
        );
```

`runVideoPipeline` 안에서 컷에 `video` 나 `video_error` 를 쓰는 자리도 같은 모양으로, `phase` 만 `"video"` 로.

기존 `updateProject(projectId, ownerId, (proj) => ({ ...proj, status: "voice" }))` 처럼 **컷을 안 건드리는 저장은 그대로 둔다** — 심장박동은 컷 진척에만 붙인다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/pipeline-progress.test.js tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 7: 전체 회귀**

Run: `npm test`

- [ ] **Step 8: 커밋**

```bash
git add lib/pipeline.js tests/pipeline-progress.test.js
git commit -m "feat(pipeline): 컷 저장에 심장박동을 얹는다 — 조용히 죽으면 진척이 멈춘다"
```

---

### Task 5: 생성 라우트가 시작 시각을 찍는다

첫 컷이 끝나기 전에 함수가 얼면 `progress` 자체가 없어 판정할 근거가 없다. 시작하는 그 저장에서 찍는다.

**Files:**
- Modify: `app/api/projects/[id]/images/route.js`
- Modify: `app/api/projects/[id]/clips/route.js`
- Modify: `app/api/projects/[id]/voice/route.js`
- Test: `tests/generation-start-stamp.test.js` (create)

**Interfaces:**
- Consumes: 없음 (`progress` 를 직접 쓴다 — `withProgress` 는 컷에서 세지만 여기는 시작이라 `done: 0`)
- Produces: 시작 직후 문서에 `progress: { at, phase, done: 0, total: cuts.length }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/generation-start-stamp.test.js`:

```js
// 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어 "멈췄다"를 판정할 근거가 없다.
// 시작하는 저장에서 찍어 둬야 그 창이 닫힌다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "66666666-6666-6666-6666-666666666666";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

vi.mock("../lib/pipeline.js", async (orig) => ({
  ...(await orig()),
  runImagesPipeline: vi.fn(async () => {}),
}));

const { POST: imagesPOST } = await import("../app/api/projects/[id]/images/route.js");

describe("생성 시작이 심장박동을 찍는다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await getStore().insertGrant({
      user_id: OWNER, amount_credits: 500, reason: "충전",
      granted_by: "00000000-0000-4000-8000-0000000000ad",
    });
  });

  it("POST /images 직후 progress 가 있다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: { target_seconds: 30 } });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0, audio: { seconds: 3 } }, { idx: 1, audio: { seconds: 3 } }],
    }));

    const req = new Request("http://x/api", { method: "POST", headers: AUTH });
    const res = await imagesPOST(req, { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);

    const after = await getProject(p.id, OWNER);
    expect(after.progress.phase).toBe("images");
    expect(after.progress.done).toBe(0);
    expect(after.progress.total).toBe(2);
    expect(typeof after.progress.at).toBe("number");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/generation-start-stamp.test.js`
Expected: FAIL — `after.progress` 가 undefined

- [ ] **Step 3: `images/route.js` 를 고친다**

`updateProject` 호출을 바꾼다:

```js
  // 시작 시각을 여기서 찍는다 — 첫 컷이 끝나기 전에 함수가 얼면 progress 가 아예 없어
  // "멈췄다"를 판정할 근거가 없다. 시각은 락 밖에서 잰다(lib/pipeline.js withProgress 주석).
  const startedAt = Date.now();
  await updateProject(id, user.id, (proj) => ({
    ...proj,
    images_error: null,
    cuts: proj.cuts.map((c) => ({ ...c, state: "pending" })),
    progress: { at: startedAt, phase: "images", done: 0, total: (proj.cuts || []).length },
  }));
```

- [ ] **Step 4: `clips/route.js` 와 `voice/route.js` 에 같은 것을 넣는다**

각 라우트에서 파이프라인을 던지기 **직전**의 `updateProject`(상태·오류를 비우는 자리)에 같은 모양으로 `progress` 를 더한다. `phase` 는 각각 `"video"`·`"voice"`.

그 자리에 `updateProject` 가 없는 라우트라면, 파이프라인을 던지기 직전에 한 번 추가한다:

```js
  const startedAt = Date.now();
  await updateProject(id, user.id, (proj) => ({
    ...proj,
    progress: { at: startedAt, phase: "video", done: 0, total: (proj.cuts || []).length },
  }));
```

**합성(`render/route.js`)에는 넣지 않는다** — 합성은 중간 진척이 없는 단일 작업이라 심장박동이 뛸 자리가 없고, 멈춤 판정에서도 제외한다(Task 6).

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/generation-start-stamp.test.js`
Expected: PASS

- [ ] **Step 6: 전체 회귀**

Run: `npm test`
Expected: `tests/routes.test.js` 가 저장 뒤 문서를 통째로 비교하는 자리가 있으면 기대값을 갱신한다

- [ ] **Step 7: 커밋**

```bash
git add app/api/projects/\[id\]/images/route.js app/api/projects/\[id\]/clips/route.js app/api/projects/\[id\]/voice/route.js tests/generation-start-stamp.test.js
git commit -m "feat(api): 생성이 시작될 때 심장박동을 찍는다 — 첫 컷 전에 죽어도 알 수 있게"
```

---

### Task 6: 진행 판정 (`lib/progress.js`)

네 상태를 가르는 유일한 자리. 화면이 직접 재지 않는 이유는 ① 렌더 테스트 인프라가 없어 경계를 잴 수 없고 ② 같은 판정을 화면 다섯이 쓰는데 흩으면 갈리기 때문이다(이번 버그가 그렇게 났다).

**Files:**
- Modify: `lib/progress.js` — **이미 존재한다.** Task 4 의 수정 라운드가 만들었고 지금은 공용 판정 술어 `isCutDone(cut, phase)` 하나만 들어 있다(파이프라인과 화면이 "무엇이 끝난 컷인가"를 한 곳에서 보게 하려고 옮겼다 — 화면이 같은 술어를 손으로 다시 적어 결함이 복제돼 있었다). 이 태스크는 그 파일에 **덧붙인다**: `STALL_MS`·`STALL_EXEMPT_PHASES`·`stalledFor`·`generationState`. `isCutDone` 과 그 테스트는 건드리지 않는다.
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `classifyFailure` (Task 2)
- Produces:
  - `STALL_MS: 120000`
  - `STALL_EXEMPT_PHASES: string[]` — `["render"]`
  - `stalledFor(status: object, now: number) → number | null`
  - `generationState({ done, total, error, phase, stepPhase, stalledForMs, busy }) → { kind, done, total, reason }`
    - `kind`: `"idle" | "running" | "stalled" | "failed" | "done"`
    - `reason`: `null` 또는 `classifyFailure` 의 결과

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/progress.test.js`:

```js
import { describe, it, expect } from "vitest";
import { generationState, stalledFor, STALL_MS } from "../lib/progress.js";

const base = { done: 0, total: 3, error: null, phase: "images", stepPhase: "images", stalledForMs: 0, busy: true };

describe("stalledFor", () => {
  it("progress 가 없으면 null 이다 — 판정 불가이지 멈춤이 아니다", () => {
    expect(stalledFor({}, 1000)).toBeNull();
    expect(stalledFor({ progress: null }, 1000)).toBeNull();
  });
  it("마지막 진척 이후 흐른 시간을 잰다", () => {
    expect(stalledFor({ progress: { at: 400 } }, 1000)).toBe(600);
  });
  it("시계가 뒤로 가도 음수를 안 준다", () => {
    expect(stalledFor({ progress: { at: 2000 } }, 1000)).toBe(0);
  });
});

describe("generationState", () => {
  it("실패가 있으면 무엇보다 먼저 failed 다", () => {
    const s = generationState({ ...base, error: { message: "이미지 생성 실패 (429) x" } });
    expect(s.kind).toBe("failed");
    expect(s.reason.code).toBe("busy");
    expect(s.reason.retryable).toBe(true);
  });

  it("컷이 없으면 idle", () => {
    expect(generationState({ ...base, total: 0 }).kind).toBe("idle");
  });

  it("다 끝났으면 done — 진척이 오래 멈춰 있어도 done 이 먼저다", () => {
    const s = generationState({ ...base, done: 3, total: 3, stalledForMs: 999_999 });
    expect(s.kind).toBe("done");
  });

  it("시작 전이면 idle — 누르지 않았는데 스피너가 돌면 안 된다", () => {
    expect(generationState({ ...base, busy: false, stalledForMs: null }).kind).toBe("idle");
  });

  it("도는 중이면 running", () => {
    const s = generationState({ ...base, done: 1, stalledForMs: 3000 });
    expect(s).toMatchObject({ kind: "running", done: 1, total: 3 });
  });

  it("임계 직전은 아직 running", () => {
    expect(generationState({ ...base, stalledForMs: STALL_MS - 1 }).kind).toBe("running");
  });

  it("임계에 닿으면 stalled", () => {
    expect(generationState({ ...base, stalledForMs: STALL_MS }).kind).toBe("stalled");
  });

  // ★ 앞 단계의 심장박동이 남아 있는 채로 다음 화면에 들어오는 흔한 경우.
  //   단계를 안 보면 ④이미지에 들어서자마자 "멈췄어요"가 뜬다.
  it("다른 단계의 심장박동으로는 멈춤을 판정하지 않는다", () => {
    const s = generationState({ ...base, busy: false, phase: "voice", stalledForMs: 999_999 });
    expect(s.kind).toBe("idle");
  });

  it("다른 단계여도 지금 누른 상태(busy)면 running 이다", () => {
    const s = generationState({ ...base, busy: true, phase: "voice", stalledForMs: 999_999 });
    expect(s.kind).toBe("running");
  });

  it("progress 가 없는 옛 문서는 도는 동안 running 이고 절대 stalled 가 아니다", () => {
    expect(generationState({ ...base, stalledForMs: null }).kind).toBe("running");
  });

  it("합성은 멈춤 판정에서 빠진다 — 정상 합성이 10분 걸린다", () => {
    const s = generationState({
      done: 0, total: 1, error: null, phase: "render", stepPhase: "render",
      stalledForMs: 999_999, busy: true,
    });
    expect(s.kind).toBe("running");
  });

  it("빈 입력에도 안 던진다", () => {
    expect(generationState().kind).toBe("idle");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/progress.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/progress.js`:

```js
// 생성이 지금 어떤 상태인가 — "안 눌렀다 / 되고 있다 / 멈춘 것 같다 / 실패했다 / 끝났다".
//
// 화면이 직접 재지 않는 이유 둘:
//  ① 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다(lib/projects-client.js:2 주석).
//     판정을 순수 모듈로 빼야 경계(119초/120초)를 vitest 로 직접 잴 수 있다.
//  ② 같은 판정을 화면 다섯이 쓴다. 흩으면 조금씩 갈린다 — ④이미지가 images_error 를
//     영영 못 보던 버그가 그렇게 났다.
//
// import 는 lib/failure.js 하나뿐이고 그것도 import 0 개다 — 화면이 읽어도 안전하다.
import { classifyFailure } from "./failure.js";

// 진척이 이만큼 멈춰 있으면 "멈춘 것 같다"고 말한다.
// 클립 하나가 30초쯤 걸리므로 2분이면 정상 진행으로 설명되지 않는다.
export const STALL_MS = 120_000;

// ★ 합성은 뺀다. 단일 ffmpeg 작업이라 중간 진척이 없고 정상적으로 최대 10분까지 걸린다 —
//   임계를 적용하면 잘 돌고 있는 합성이 전부 "멈춤"으로 보인다.
export const STALL_EXEMPT_PHASES = ["render"];

// 마지막 진척 이후 흐른 밀리초. 판정할 근거가 없으면 null 이다.
//
// ★ 이 계산은 **서버에서** 돌아야 한다(상태 라우트가 부른다). 브라우저가 자기 시계로
//   빼면 사장님 PC 가 3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
export function stalledFor(status, now) {
  const at = status?.progress?.at;
  if (typeof at !== "number") return null;
  return Math.max(0, now - at);
}

// 순서가 곧 규칙이다 — 위엣것이 더 큰 사실이다.
export function generationState({
  done = 0,
  total = 0,
  error = null,
  phase = null,      // 문서에 남은 심장박동의 단계
  stepPhase = null,  // 지금 보고 있는 화면의 단계
  stalledForMs = null,
  busy = false,      // 방금 시작 버튼을 눌렀는가(아직 컷이 pending 이라 진척으로는 안 보인다)
} = {}) {
  // ① 실패는 무엇보다 먼저다. 실패한 채로 "도는 중"이라 말하면 사장님이 계속 기다린다.
  if (error) {
    return { kind: "failed", done, total, reason: classifyFailure(error.message ?? error) };
  }
  // ② 만들 대상이 없다
  if (total === 0) return { kind: "idle", done, total, reason: null };
  // ③ 다 끝났다. 진척이 멈춘 지 오래여도 여기가 먼저다 — 끝나서 멈춘 것이다.
  if (done >= total) return { kind: "done", done, total, reason: null };

  // 이 심장박동이 지금 화면의 것인가. 아니면 앞 단계가 남긴 것이라 판정에 못 쓴다.
  const mine = stepPhase !== null && phase === stepPhase;

  // ④ 아직 안 눌렀다 — 누르지 않았는데 스피너가 돌면 자동으로 되는 줄 알고 기다린다
  //    (④이미지 화면 placeholder 주석에 같은 사고가 적혀 있다).
  if (!busy && (!mine || stalledForMs === null)) {
    return { kind: "idle", done, total, reason: null };
  }
  // ⑤ 멈춤 의심 — 내 단계의 심장박동이 임계만큼 멎었을 때만.
  if (
    mine &&
    stalledForMs !== null &&
    stalledForMs >= STALL_MS &&
    !STALL_EXEMPT_PHASES.includes(phase)
  ) {
    return { kind: "stalled", done, total, reason: null };
  }
  // ⑥ 그 밖은 도는 중
  return { kind: "running", done, total, reason: null };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/progress.test.js`
Expected: PASS (15 tests)

- [ ] **Step 5: 전체 회귀**

Run: `npm test`

- [ ] **Step 6: 커밋**

```bash
git add lib/progress.js tests/progress.test.js
git commit -m "feat(progress): 네 상태를 가르는 판정을 한 곳에 둔다"
```

---

### Task 7: 상태 라우트가 `stalled_for_ms` 를 내보낸다

새로 넣는 값은 **처음부터 다섯 라우트 전부에** 넣는다 — 다섯이 서로 다른 것을 싣는 것이 이번 버그의 뿌리다.

**Files:**
- Modify: `app/api/projects/[id]/status/route.js`
- Modify: `app/api/projects/[id]/cuts/status/route.js`
- Modify: `app/api/projects/[id]/voice/status/route.js`
- Modify: `app/api/projects/[id]/clips/status/route.js`
- Modify: `app/api/projects/[id]/render/status/route.js`
- Test: `tests/status-routes-progress.test.js` (create)

**Interfaces:**
- Consumes: `stalledFor` (Task 6), 스토어의 `progress` (Task 3)
- Produces: 다섯 응답 모두에 `progress: {phase,done,total} | null` 과 `stalled_for_ms: number | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/status-routes-progress.test.js`:

```js
// 새 값은 다섯 라우트에 **전부** 실린다. 다섯이 서로 다른 것을 싣는 것이
// images_error 버그(2026-08-14)의 뿌리였다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "77777777-7777-7777-7777-777777777777";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = () => new Request("http://x/api", { headers: AUTH });

const routes = {
  status: (await import("../app/api/projects/[id]/status/route.js")).GET,
  cuts: (await import("../app/api/projects/[id]/cuts/status/route.js")).GET,
  voice: (await import("../app/api/projects/[id]/voice/status/route.js")).GET,
  clips: (await import("../app/api/projects/[id]/clips/status/route.js")).GET,
  render: (await import("../app/api/projects/[id]/render/status/route.js")).GET,
};

describe("상태 라우트가 심장박동을 실어 보낸다", () => {
  let id;
  beforeEach(async () => {
    resetMemoryStore();
    const p = await createProject({ ownerId: OWNER, settings: {} });
    id = p.id;
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0 }, { idx: 1 }],
      progress: { at: Date.now() - 5000, phase: "images", done: 1, total: 2 },
    }));
  });

  for (const [name, GET] of Object.entries(routes)) {
    it(`${name} 응답에 stalled_for_ms 와 progress 가 있다`, async () => {
      const res = await GET(req(), { params: Promise.resolve({ id }) });
      const body = await res.json();
      expect(body.stalled_for_ms, `${name} 이 stalled_for_ms 를 안 실었다`).toBeGreaterThanOrEqual(5000);
      expect(body.progress.phase).toBe("images");
      expect(body.progress.done).toBe(1);
      expect(body.progress.total).toBe(2);
    });
  }

  it("★ 컷 상태가 images_error 를 실어 보낸다 — 이 자리가 비어 있었다", async () => {
    await updateProject(id, OWNER, (proj) => ({ ...proj, images_error: "이미지 생성 실패 (429) x" }));
    const body = await (await routes.cuts(req(), { params: Promise.resolve({ id }) })).json();
    expect(body.images_error).toBe("이미지 생성 실패 (429) x");
  });

  it("progress 가 없는 옛 프로젝트는 stalled_for_ms 가 null 이다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {} });
    const body = await (await routes.status(req(), { params: Promise.resolve({ id: p.id }) })).json();
    expect(body.stalled_for_ms).toBeNull();
    expect(body.progress).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/status-routes-progress.test.js`
Expected: FAIL — `stalled_for_ms` 가 undefined

- [ ] **Step 3: 다섯 라우트를 고친다**

각 라우트에서 응답을 만들 때 두 값을 더한다. 예 — `cuts/status/route.js`:

```js
import { getProjectCuts } from "../../../../../../lib/projects";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { stalledFor } from "../../../../../../lib/progress.js";

export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const st = await getProjectCuts(id, user.id);
  if (!st || st.kind === "ad") return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: st.status,
    cuts: st.cuts,
    cuts_error: st.cuts_error,
    voice_error: st.voice_error,
    video_error: st.video_error,
    // ★ 2026-08-14 — 빠져 있던 자리. 이미지 실패가 이 화면까지 영영 못 갔다.
    images_error: st.images_error,
    // 심장박동. 시간 차는 **서버가 뺀다** — 브라우저 시계로 빼면 시계가 어긋난 PC 에서
    // 시작하자마자 "멈췄어요"가 뜬다(lib/progress.js stalledFor 주석).
    progress: st.progress,
    stalled_for_ms: stalledFor(st, Date.now()),
  });
});
```

나머지 넷(`status`·`voice/status`·`clips/status`·`render/status`)도 각자 기존 필드는 그대로 두고 `progress`·`stalled_for_ms` 두 줄을 같은 모양으로 더한다. `status/route.js` 는 지금 `Response.json(progress)` 로 통째로 내보내므로 이렇게 바꾼다:

```js
  return Response.json({ ...progress, stalled_for_ms: stalledFor(progress, Date.now()) });
```

(`getProjectProgress` 의 반환에 이미 `progress` 키가 들어 있다 — Task 3 에서 넣었다.)

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/status-routes-progress.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 회귀**

Run: `npm test`

- [ ] **Step 6: 커밋**

```bash
git add app/api/projects/\[id\]/status/route.js app/api/projects/\[id\]/cuts/status/route.js app/api/projects/\[id\]/voice/status/route.js app/api/projects/\[id\]/clips/status/route.js app/api/projects/\[id\]/render/status/route.js tests/status-routes-progress.test.js
git commit -m "feat(api): 상태 라우트 다섯이 같은 심장박동을 싣는다 — 컷 상태의 images_error 포함"
```

---

### Task 8: 폴링 한 벌 (`lib/poll.js`)

다섯 화면이 interval·타임아웃·연속실패 카운트를 각자 복붙해 두었다. **동작을 바꾸지 않고** 한 벌로 옮긴다 — 동작까지 함께 바꾸면 회귀가 어디서 났는지 못 가른다.

**Files:**
- Create: `lib/poll.js`
- Test: `tests/poll.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `POLL_INTERVAL_MS: 2000`, `POLL_TIMEOUT_MS: 300000`, `POLL_MAX_FAILURES: 5`
  - `startPolling(opts) → stop: () => void`
    - `opts`: `{ url, fetchImpl, onTick, onStop, intervalMs?, timeoutMs?, maxFailures?, setTimer?, clearTimer?, now? }`
    - `onTick(data) → boolean` — `true` 를 돌려주면 멈춘다
    - `onStop({ timedOut: boolean })`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/poll.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { startPolling, POLL_MAX_FAILURES } from "../lib/poll.js";

// 2초를 실제로 기다리지 않으려고 timer 를 주입한다 — 회차를 손으로 민다.
function fakeTimers() {
  let tick = null;
  return {
    setTimer: (fn) => { tick = fn; return 1; },
    clearTimer: () => { tick = null; },
    run: async () => { if (tick) await tick(); },
    alive: () => tick !== null,
  };
}
const ok = (body) => async () => ({ ok: true, json: async () => body });

describe("폴링 한 벌", () => {
  it("응답을 onTick 에 넘긴다", async () => {
    const t = fakeTimers();
    const onTick = vi.fn(() => false);
    startPolling({ url: "/x", fetchImpl: ok({ status: "images" }), onTick, onStop: () => {}, ...t });
    await t.run();
    expect(onTick).toHaveBeenCalledWith({ status: "images" });
  });

  it("onTick 이 true 를 주면 멈춘다 — 시간초과가 아니다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({ url: "/x", fetchImpl: ok({}), onTick: () => true, onStop, ...t });
    await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: false });
    expect(t.alive()).toBe(false);
  });

  it("연속 실패가 상한에 닿으면 시간초과로 멈춘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/x", fetchImpl: async () => { throw new Error("끊김"); },
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES; i++) await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("중간에 한 번 성공하면 실패 수가 초기화된다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    let n = 0;
    startPolling({
      url: "/x",
      fetchImpl: async () => { n++; if (n === 3) return { ok: true, json: async () => ({}) }; throw new Error("끊김"); },
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES + 1; i++) await t.run();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("ok 가 아닌 응답은 실패로 센다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    startPolling({
      url: "/x", fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
      onTick: () => false, onStop, ...t,
    });
    for (let i = 0; i < POLL_MAX_FAILURES; i++) await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("상한 시간을 넘기면 시간초과로 멈춘다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    let clock = 0;
    startPolling({
      url: "/x", fetchImpl: ok({}), onTick: () => false, onStop,
      timeoutMs: 100, now: () => clock, ...t,
    });
    clock = 101;
    await t.run();
    expect(onStop).toHaveBeenCalledWith({ timedOut: true });
  });

  it("stop 을 부르면 더 안 돈다 — onStop 은 안 불린다", async () => {
    const t = fakeTimers();
    const onStop = vi.fn();
    const onTick = vi.fn(() => false);
    const stop = startPolling({ url: "/x", fetchImpl: ok({}), onTick, onStop, ...t });
    stop();
    expect(t.alive()).toBe(false);
    await t.run();
    expect(onTick).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/poll.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

`lib/poll.js`:

```js
// 진행 상태를 두드리는 루프 한 벌.
//
// 왜 모았나: ②대본·③목소리·④이미지·⑤영상·⑥완성 다섯 화면이 이 루프를 각자 복붙해
// 두었고, 조금씩 다르게 틀려 있었다 — ④이미지가 images_error 를 영영 못 보던 버그가
// 그 어긋남이다(2026-08-14).
//
// **동작은 옮기기만 한다**: 2초 간격 · 5분 상한 · 연속 5회 실패면 중단. 여기서 동작까지
// 바꾸면 회귀가 어디서 났는지 못 가른다.
//
// timer 와 fetch 를 주입받는다 — 그래야 vitest 가 2초를 실제로 기다리지 않고 회차를
// 손으로 밀 수 있다(이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다).

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const POLL_MAX_FAILURES = 5;

export function startPolling({
  url,
  fetchImpl = fetch,
  onTick,
  onStop = () => {},
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
  maxFailures = POLL_MAX_FAILURES,
  setTimer = setInterval,
  clearTimer = clearInterval,
  now = Date.now,
}) {
  let handle = null;
  let failures = 0;
  const startedAt = now();

  // ★ handle 을 null 로 비운다. 비우지 않으면 (dev StrictMode 의 재마운트처럼) 다시
  //   마운트됐을 때 "이미 돌고 있음"으로 오인해 폴링이 되살아나지 않는다.
  const halt = () => {
    clearTimer(handle);
    handle = null;
  };

  const finish = (timedOut) => {
    if (handle === null) return; // 이미 멈췄다 — onStop 을 두 번 부르지 않는다
    halt();
    onStop({ timedOut });
  };

  handle = setTimer(async () => {
    if (now() - startedAt > timeoutMs) return finish(true);
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error("상태를 읽지 못했어요");
      const data = await res.json();
      failures = 0;
      if (onTick(data)) finish(false);
    } catch {
      failures += 1;
      if (failures >= maxFailures) finish(true);
    }
  }, intervalMs);

  // 호출부(언마운트·사용자 중단)가 부른다. onStop 은 안 불린다 — 끝난 것이 아니라 뗀 것이다.
  return halt;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/poll.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 회귀**

Run: `npm test`

- [ ] **Step 6: 커밋**

```bash
git add lib/poll.js tests/poll.test.js
git commit -m "feat(poll): 다섯 화면에 복붙된 폴링을 한 벌로 모은다"
```

---

### Task 9: ④이미지 화면 배선

**Files:**
- Modify: `app/create/[id]/images/page.js`
- Test: `tests/generation-status-ui.test.js` (create)

**Interfaces:**
- Consumes: `startPolling` (Task 8), `generationState` (Task 6), `firstError` (Task 1)
- Produces: 없음 (화면)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/generation-status-ui.test.js`:

```js
// 렌더 테스트 인프라가 없어 소스에서 잰다(tests/video-preview-ui.test.js 와 같은 수법).
// 재는 것은 "화면이 판정을 스스로 하지 않고 lib 에 맡겼는가" 하나다 — 그래야 경계는
// tests/progress.test.js 가 잰 것으로 보장된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const images = readFileSync("app/create/[id]/images/page.js", "utf8");

describe("④이미지 — 생성 상태 표시", () => {
  it("판정을 lib/progress 에 맡긴다", () => {
    expect(images).toMatch(/generationState/);
  });

  it("오류 필드를 손으로 고르지 않고 표에서 가져온다", () => {
    expect(images).toMatch(/firstError/);
  });

  it("폴링을 손으로 돌리지 않는다", () => {
    expect(images).toMatch(/startPolling/);
    expect(images, "setInterval 이 화면에 남아 있다").not.toMatch(/setInterval\(/);
  });

  it("멈춤과 실패를 서로 다른 말로 알린다", () => {
    expect(images).toMatch(/stalled/);
    expect(images).toMatch(/멈춰/);
  });

  it("진척을 숫자로 보여준다", () => {
    expect(images).toMatch(/\bdone\b/);
    expect(images).toMatch(/\btotal\b/);
  });

  it("임계 시간을 화면에 손으로 적지 않는다", () => {
    expect(images, "120000 을 화면에 적었다").not.toMatch(/120_?000/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: FAIL

- [ ] **Step 3: import 와 폴링을 갈아끼운다**

`app/create/[id]/images/page.js` 머리에 추가:

```js
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone } from "../../../../lib/progress";
import { firstError } from "../../../../lib/step-errors";
```

`startPolling` 지역 함수와 `pollRef` 를 다음으로 바꾼다:

```js
  const [status, setStatus] = useState(null); // 마지막 상태 응답 — 심장박동이 여기 온다
  const stopRef = useRef(null);

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/cuts/status`,
      onTick: (st) => {
        setStatus(st);
        setProject((p) => ({
          ...p, status: st.status, cuts: st.cuts,
          cuts_error: st.cuts_error, images_error: st.images_error,
        }));
        // 실패했으면 더 두드릴 것이 없다
        if (firstError(st, "images")) return true;
        const pending = (st.cuts || []).some((c) => ["pending", "generating"].includes(c.state));
        return !!st.cuts?.length && !pending;
      },
      onStop: ({ timedOut }) => {
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          // ★ "오래 걸린다"가 아니다 — 상태를 못 읽은 것이다. 둘은 다른 사건이고,
          //   전에는 같은 문구를 써서 사장님이 생성이 느린 줄 알았다.
          setErr("상태를 확인하지 못했어요 — 새로고침해 주세요");
        }
      },
    });
  }
```

기존 `startPolling()` 호출부(진입 복원 `useEffect`·`start()`)를 `beginPolling()` 으로 바꾼다.

- [ ] **Step 4: 네 상태를 그린다**

`shownErr`·`stalled` 계산을 판정 하나로 바꾼다:

```js
  // 판정은 lib/progress 하나가 낸다 — 화면은 그린다.
  const err0 = firstError({ ...project, ...(status || {}) }, "images");
  const gen = generationState({
    // ★ 술어를 여기 손으로 적지 않는다 — 파이프라인의 심장박동과 **같은 함수**를 쓴다.
    //   손으로 적었을 때 실제로 갈렸다: 실패한 컷(image 없이 needs_attention)을 안 세서
    //   정상 종료한 실행이 영구히 "멈춤"으로 읽혔다. 한 곳에서 오면 그 표류가 불가능하다.
    done: cuts.filter((c) => isCutDone(c, "images")).length,
    total: cuts.length,
    error: dismissed ? null : err0,
    phase: status?.progress?.phase ?? project.progress?.phase ?? null,
    stepPhase: "images",
    stalledForMs: status?.stalled_for_ms ?? null,
    busy,
  });
```

그리고 기존 오류 문단을 상태별 문단으로 바꾼다:

```js
        {err && <p className="pgsub warn">{err}</p>}

        {gen.kind === "running" && (
          <p className="pgsub">
            <span className="spinner" aria-hidden="true" /> 컷 {gen.done}/{gen.total} 만드는 중이에요
          </p>
        )}

        {gen.kind === "stalled" && (
          <p className="pgsub warn">
            ⚠ 진행이 멈춘 것 같아요 — 컷 {gen.done}/{gen.total}에서 더 나아가지 않고 있어요.{" "}
            <button className="mini" onClick={dismiss}>컷별로 다시 만들기</button>
          </p>
        )}

        {gen.kind === "failed" && (
          <p className="pgsub warn">
            ⚠ {gen.reason.message}{" "}
            {gen.reason.retryable && (
              <button className="mini" onClick={dismiss} disabled={busy}>닫고 컷별로 다시 만들기</button>
            )}
          </p>
        )}
```

`stalled` 를 쓰던 `PreviewPane` 인자는 `stalled={gen.kind === "stalled" || gen.kind === "failed"}` 로 바꾼다 — 파이프라인이 더 안 도니 컷별 [다시 생성]을 열어야 한다는 기존 뜻 그대로다.

- [ ] **Step 5: 스피너 CSS 를 더한다**

전역 스타일시트(`app/globals.css` 또는 프로젝트가 쓰는 자리)에 `.spinner` 가 없으면 추가한다:

```css
/* 도는 중임을 글자 말고도 알린다 — 글자만 있으면 멈춘 화면과 구별되지 않는다 */
.spinner {
  display: inline-block; width: .8em; height: .8em; margin-right: .4em;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  animation: spin .7s linear infinite; vertical-align: -.1em;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
```

먼저 `grep -n "\.spinner" app/globals.css` 로 이미 있는지 확인하고, 있으면 이 단계를 건너뛴다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: 전체 회귀**

Run: `npm test`
Expected: `tests/staleness-ui.test.js` 가 이 파일의 소스를 읽으므로 함께 그린인지 확인한다

- [ ] **Step 8: 커밋**

```bash
git add app/create/\[id\]/images/page.js app/globals.css tests/generation-status-ui.test.js
git commit -m "feat(images): 되는 중·멈춤·실패를 구분해 말한다"
```

---

### Task 10: ⑤영상 화면 배선

Task 9 와 같은 모양이되 단계가 다르다 — 오류 필드는 `video_error`, 완료 판정은 `c.video`, 폴링 주소는 `/clips/status`.

**Files:**
- Modify: `app/create/[id]/video/page.js`
- Test: `tests/generation-status-ui.test.js` (Task 9 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: `startPolling`·`generationState`·`firstError`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 더한다**

`tests/generation-status-ui.test.js` 끝에 추가:

```js
const video = readFileSync("app/create/[id]/video/page.js", "utf8");

describe("⑤영상 — 생성 상태 표시", () => {
  it("판정을 lib/progress 에 맡긴다", () => {
    expect(video).toMatch(/generationState/);
  });
  it("오류 필드를 표에서 가져온다", () => {
    expect(video).toMatch(/firstError/);
  });
  it("폴링을 손으로 돌리지 않는다", () => {
    expect(video).toMatch(/startPolling/);
    expect(video, "setInterval 이 화면에 남아 있다").not.toMatch(/setInterval\(/);
  });
  it("멈춤을 실패와 다른 말로 알린다", () => {
    expect(video).toMatch(/stalled/);
    expect(video).toMatch(/멈춰/);
  });
  it("임계 시간을 화면에 손으로 적지 않는다", () => {
    expect(video, "120000 을 화면에 적었다").not.toMatch(/120_?000/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: FAIL — ⑤영상 블록 5건

- [ ] **Step 3: import 와 폴링을 갈아끼운다**

`app/create/[id]/video/page.js` 머리에:

```js
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone } from "../../../../lib/progress";
import { firstError } from "../../../../lib/step-errors";
```

지역 `startPolling` 과 `pollRef` 를 바꾼다:

```js
  const [status, setStatus] = useState(null);
  const stopRef = useRef(null);

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/clips/status`,
      onTick: (st) => {
        setStatus(st);
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, video_error: st.video_error }));
        if (firstError(st, "video")) return true;
        return !(st.cuts || []).some((c) => !c.video && !c.video_error);
      },
      onStop: ({ timedOut }) => {
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          setErr("상태를 확인하지 못했어요 — 새로고침해 주세요");
        }
      },
    });
  }
```

기존 `startPolling()` 호출부(진입 복원 `useEffect`·`start()`)를 `beginPolling()` 으로.

- [ ] **Step 4: 네 상태를 그린다**

`doneCount` 계산 아래에 추가:

```js
  const gen = generationState({
    // ★ `doneCount` 를 넘기지 않는다 — 그것은 **성공한** 클립 수라 화면 문구
    //   ("N/M개 컷을 만들었어요")의 값이다. 진행 판정이 원하는 것은 **더 기다릴 것이
    //   남았는가**이므로 실패로 끝난 컷도 끝난 것으로 세야 한다(안 그러면 실패 컷 하나가
    //   영원히 "만드는 중"으로 남는다). 그래서 파이프라인과 같은 함수를 쓴다.
    done: cuts.filter((c) => isCutDone(c, "video")).length,
    total: cuts.length,
    error: firstError({ ...project, ...(status || {}) }, "video"),
    phase: status?.progress?.phase ?? project?.progress?.phase ?? null,
    stepPhase: "video",
    stalledForMs: status?.stalled_for_ms ?? null,
    busy,
  });
```

기존 `{err && <p className="pgsub warn">{err}</p>}` 아래에:

```js
      {gen.kind === "running" && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 컷 {gen.done}/{gen.total} 만드는 중이에요
        </p>
      )}
      {gen.kind === "stalled" && (
        <p className="pgsub warn">
          ⚠ 진행이 멈춘 것 같아요 — 컷 {gen.done}/{gen.total}에서 더 나아가지 않고 있어요.
          아래에서 컷별로 다시 만들 수 있어요.
        </p>
      )}
      {gen.kind === "failed" && <p className="pgsub warn">⚠ {gen.reason.message}</p>}
```

컷별 [다시 만들기] 버튼의 `disabled` 에서 `busy` 를 `gen.kind === "running"` 으로 바꾼다 — 멈췄거나 실패했을 때는 눌러야 빠져나갈 수 있는데 지금은 `busy` 가 참인 채로 잠겨 있을 수 있다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: PASS (11 tests)

- [ ] **Step 6: 전체 회귀**

Run: `npm test`
Expected: `tests/video-preview-ui.test.js`·`tests/staleness-ui.test.js` 도 그린

- [ ] **Step 7: 커밋**

```bash
git add app/create/\[id\]/video/page.js tests/generation-status-ui.test.js
git commit -m "feat(video): 되는 중·멈춤·실패를 구분해 말한다"
```

---

### Task 11: ③목소리·②대본·⑥완성 폴링 이관

> **★ 화면 다섯에 루프는 여섯이다** (Task 8 에서 실측·교차확인. `grep setInterval app/create` 가
> `script:85`·`voice:59`·`voice:105`·`images:63`·`video:53`·`done:230` 여섯을 준다).
> ②대본은 **분할 대기 루프 하나뿐**이고 본 루프가 없다. ③목소리는 본 루프 + 분할 대기 루프 둘이다.
> 그 **분할 대기 루프 둘은 상한도 실패 카운트도 없다.** 그리고 ⑥완성만 상한이 10분이다.
> 아래 코드에 그 셋이 반영돼 있다 — 옵션을 지우면 동작이 조용히 바뀐다.
>
> **★ 또 하나의 함정**: 화면은 `pollRef.current` 의 참 여부를 "이미 돌고 있나"의 판정으로 쓴다.
> 모듈은 자기 내부 `handle` 만 null 로 만들 뿐이라, 화면 ref 는 반환받은 `halt` 함수를 계속
> 쥔다(항상 참). 그래서 **`onStop` 안에서 화면 ref 를 반드시 null 로 되돌려야** 한다 —
> 안 하면 스스로 끝난 폴링이 다시는 안 살아난다. 아래 코드와 Task 9·10 이 그렇게 돼 있다.

남은 세 화면을 같은 한 벌로 옮긴다. **표시는 최소로** — ③목소리만 네 상태를 그리고, ②대본(컷 분할 대기)과 ⑥완성(합성)은 폴링만 옮긴다. 이유: 컷 분할은 OpenAI 한 번이라 컷 단위 진척이 없고, 합성은 멈춤 판정에서 제외되기 때문이다(Global Constraints).

**Files:**
- Modify: `app/create/[id]/voice/page.js`
- Modify: `app/create/[id]/script/page.js`
- Modify: `app/create/[id]/done/page.js`
- Test: `tests/generation-status-ui.test.js` (블록 추가)

**Interfaces:**
- Consumes: `startPolling`·`generationState`·`firstError`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 더한다**

`tests/generation-status-ui.test.js` 끝에:

```js
const voice = readFileSync("app/create/[id]/voice/page.js", "utf8");
const script = readFileSync("app/create/[id]/script/page.js", "utf8");
const done = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("남은 화면 — 폴링 한 벌", () => {
  for (const [name, src] of [["③목소리", voice], ["②대본", script], ["⑥완성", done]]) {
    it(`${name} 이 setInterval 을 직접 돌리지 않는다`, () => {
      expect(src).toMatch(/startPolling/);
      expect(src, `${name} 에 setInterval 이 남아 있다`).not.toMatch(/setInterval\(/);
    });
  }

  it("③목소리는 네 상태를 구분해 말한다", () => {
    expect(voice).toMatch(/generationState/);
    expect(voice).toMatch(/멈춰/);
  });

  // ⑥완성은 단일 ffmpeg 작업이라 중간 진척이 없다 — 멈춤 경고를 띄우면 정상 합성이
  // 전부 "멈췄어요"가 된다(lib/progress.js STALL_EXEMPT_PHASES).
  it("⑥완성은 멈춤 경고를 띄우지 않는다", () => {
    expect(done, "합성에 멈춤 경고를 달았다").not.toMatch(/멈춰/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: FAIL — 남은 화면 블록 5건

- [ ] **Step 3: ③목소리를 옮긴다**

`app/create/[id]/voice/page.js` — Task 10 과 같은 모양. 주소는 `/api/projects/${id}/voice/status`, `stepPhase` 는 `"voice"`, 완료 판정은 `!(st.cuts || []).some((c) => !c.audio && !c.voice_error)`.

이 파일에는 **폴링이 둘**이다 — 낭독 폴링과, 컷이 생기길 기다리는 가벼운 `/status` 폴링(`voice/page.js:105`). 둘 다 `startPolling` 으로 옮긴다. 뒤엣것은 이렇게:

```js
    const stop = startPolling({
      url: `/api/projects/${id}/status`,
      // ★ 이 가벼운 대기 루프는 지금 **상한도 실패 카운트도 없다**(실측: script/page.js 에
      //    startedAt·failures 가 아예 없다). 기본값을 그대로 받으면 5분 상한과 연속 5회
      //    중단이 새로 생긴다 — 이 태스크는 동작을 옮기기만 하는 자리라 그러면 안 된다.
      //    컷 분할이 5분을 넘기면 화면이 조용히 멈춘 채 영영 안 갱신된다(onStop 이 기본 noop).
      timeoutMs: Infinity,
      maxFailures: Infinity,
      onTick: (st) => {
        if (st.cut_count > 0 || st.cuts_error) { load(id).catch(() => {}); return true; }
        return false;
      },
    });
    return stop;
```

그리고 Task 9 의 상태 문단을 같은 모양으로 넣되 문구를 낭독에 맞춘다(`컷 {gen.done}/{gen.total} 읽는 중이에요`).

- [ ] **Step 4: ②대본을 옮긴다**

`app/create/[id]/script/page.js:85` 의 컷 분할 대기 폴링을 위와 같은 모양으로 옮긴다. **상태 표시는 더하지 않는다** — 컷 분할은 컷 단위 진척이 없고, 이 화면은 이미 `splitting`·`cuts_error` 로 두 상태를 말하고 있다.

- [ ] **Step 5: ⑥완성을 옮긴다**

`app/create/[id]/done/page.js:230` 의 합성 폴링을 옮긴다:

```js
    stopRef.current = startPolling({
      url: `/api/projects/${id}/render/status`,
      // ★★ ⑥완성만 상한이 **10분**이다(실측: done/page.js 의 `10 * 60 * 1000`). 다른 넷은 5분.
      //    이 줄을 빠뜨리면 모듈 기본값 5분이 걸려 상한이 반토막 나고, 정상적으로 6~9분 걸리는
      //    합성이 "상태를 확인하지 못했어요"로 끝난다. 합성이 멈춤 판정에서 빠져 있는 것과
      //    같은 이유다 — 합성은 원래 오래 걸린다.
      timeoutMs: 10 * 60 * 1000,
      onTick: (st) => {
        setProject((p) => ({ ...p, status: st.status, render: st.render, render_error: st.render_error }));
        if (st.render_error) { setErr(st.render_error); return true; }
        return !!st.render?.url;
      },
      onStop: ({ timedOut }) => {
        stopRef.current = null;
        setBusy(false);
        if (timedOut) { setPollTimedOut(true); setErr("상태를 확인하지 못했어요 — 새로고침해 주세요"); }
      },
    });
```

기존 완료 판정을 그대로 옮긴다 — `done/page.js` 의 현재 `onTick` 자리 로직(`render.url` 판독)을 읽어 글자 그대로 옮길 것. **멈춤 경고는 달지 않는다.**

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/generation-status-ui.test.js`
Expected: PASS (16 tests)

- [ ] **Step 7: 전체 회귀**

Run: `npm test`
Expected: 전부 그린. `tests/subtitle-ui.test.js` 가 `done/page.js` 를 읽으므로 함께 확인한다

- [ ] **Step 8: 커밋**

```bash
git add app/create/\[id\]/voice/page.js app/create/\[id\]/script/page.js app/create/\[id\]/done/page.js tests/generation-status-ui.test.js
git commit -m "refactor(create): 남은 세 화면의 폴링도 한 벌로 — ③목소리는 네 상태를 말한다"
```

---

### Task 12: 문서 갱신

**Files:**
- Modify: `CLAUDE.md`
- Test: 없음 (문서)

- [ ] **Step 1: 무엇이 달라졌는지 적는다**

`CLAUDE.md` 에서 생성·폴링을 설명하는 절을 찾아(`grep -n "폴링\|status" CLAUDE.md`) 다음을 반영한다:

- 상태 라우트 다섯은 `progress`·`stalled_for_ms` 를 **전부** 싣는다. 새 필드를 넣을 때 한 곳만 고치지 말 것.
- 단계별 오류 필드는 `lib/step-errors.js` 의 표가 유일한 출처다.
- 폴링은 `lib/poll.js` 한 벌이다. 화면에서 `setInterval` 을 직접 돌리지 말 것 — `tests/generation-status-ui.test.js` 가 막는다.
- 멈춤 임계는 `lib/progress.js` 의 `STALL_MS` 하나다. 합성은 `STALL_EXEMPT_PHASES` 로 빠져 있다.
- **조용한 죽음은 여전히 막지 못한다** — 감지해서 알릴 뿐이다. 근본 해법(작업 큐·워커)은 별개 프로젝트다.

- [ ] **Step 2: 전체 회귀**

Run: `npm test`

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): 상태 라우트·폴링·멈춤 판정의 유일한 자리를 적는다"
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 절 | 태스크 |
|---|---|
| §2① 오류 필드 표 | Task 1 |
| §2① `images_error` 버그 수정 | Task 3, Task 7 |
| §2② 심장박동 | Task 4(파이프라인), Task 5(시작 스탬프), Task 3(스토어), Task 7(라우트) |
| §2② `stalled_for_ms` 를 서버가 잰다 | Task 6 `stalledFor`, Task 7 |
| §2③ 사유 분류 | Task 2 |
| §2④ 네 상태 · `generationState` | Task 6, Task 9, Task 10, Task 11 |
| §2⑤ 폴링 통합 | Task 8, Task 9, Task 10, Task 11 |
| §4 폴링 실패 문구 분리 | Task 9·10·11 의 `onStop` |
| §4 멈춤은 폴링을 안 멈춘다 | Task 9·10 의 `onTick` — `stalled` 를 중단 조건에 안 넣었다 |
| §5 테스트 표 | Task 1·2·3·6·7·8·9 의 테스트 |
| §6 안 하는 것 | Global Constraints |

**스펙에 없던 것을 계획이 더한 것 하나**: 합성(render)을 멈춤 판정에서 제외. 스펙을 쓸 때 놓친 것으로, 넣지 않으면 정상 합성(최대 10분)이 전부 "멈췄어요"가 된다. Global Constraints·Task 6·Task 11 에 반영했다.

**2. 자리표시자 점검** — "TBD"·"적절히"·"비슷하게" 없음. Task 11 Step 5 만 "현재 로직을 글자 그대로 옮길 것"이라 적었는데, 이는 **동작을 바꾸지 말라**는 지시이지 자리표시자가 아니다(옮길 대상의 파일·줄을 명시했다).

**3. 타입 일관성**
- `firstError(status, stepKey) → {field, message} | null` — Task 1 에서 정의, Task 9·10·11 에서 `.message` 로 쓴다. ✓
- `generationState(...) → {kind, done, total, reason}` — Task 6 정의, Task 9·10·11 에서 `gen.kind`·`gen.reason.message`·`gen.reason.retryable` 로 쓴다. `reason` 은 `failed` 일 때만 non-null이고, 화면은 `kind === "failed"` 안에서만 읽는다. ✓
- `startPolling(...) → stop()` — Task 8 정의, Task 9·10·11 에서 `stopRef.current = startPolling(...)` 로 받아 `stopRef.current?.()` 로 부른다. ✓
- `withProgress(proj, phase, at)` — Task 4 정의·사용. `phase` 값은 `"images"|"voice"|"video"` 로 Task 5·6·7 과 같은 낱말. ✓
- `progress: {at, phase, done, total}` — Task 3(스토어)·4(파이프라인)·5(라우트 스탬프)·7(응답)에서 같은 키. ✓
- `stalled_for_ms`(응답, snake) ↔ `stalledForMs`(함수 인자, camel) — 경계에서 한 번 바뀐다. Task 9·10 의 배선 코드에 그 변환이 명시돼 있다. ✓
