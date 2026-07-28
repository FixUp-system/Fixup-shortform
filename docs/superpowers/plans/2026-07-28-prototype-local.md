# 프로토타입 — 로컬 e2e 30초 영상 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자료를 넣으면 **자막이 구워진 30초 mp4** 가 나온다. 로컬에서, 한 번도 막히지 않고.

그러기 위해 예산을 코드로 막고(Task 1~2), 목소리를 이미지 앞으로 옮기고(Task 3~6),
실제 fal 을 처음으로 관통시킨다(Task 8).

> **실행 순서 주의:** Task 7(긴 컷 알림)은 관통에 필요 없다. **Task 8 을 먼저 하고 Task 7 로
> 돌아온다.** 관통에서 나온 실측 데이터(10초 초과가 흔한가 드문가)를 보고 만드는 편이
> 정확하다 — 흔하면 알림이 아니라 재분할이 필요할 수도 있다.

**Architecture:** `lib/costs.js`가 fal 호출 직전에 누적 비용을 재어 상한을 넘으면 던진다.
`runCutsPipeline`을 `runSplitPipeline`(분할, OpenAI만)과 `runImagesPipeline`(이미지, fal)으로
가르고, 분할을 대본 승인에 붙여 단계 순서를 `대본 → 목소리 → 이미지`로 바꾼다.

**Tech Stack:** Next.js App Router, vitest, fal.ai, OpenAI

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 두 워크트리가
  같은 파일 이름을 갖는다 — 잘못 쓰면 다른 세션의 작업을 조용히 오염시킨다
- 기존 테스트 **211개 그린이 하한선**. 단 Task 3~7은 `steps.test.js`의 순서 기대값을
  **의도적으로** 바꾼다
- 테스트에서 파일을 쓰는 모듈을 다룰 때는 `SHOTFORM_DATA_DIR`을 임시 폴더로 돌린다
  (`tests/projects.test.js` 패턴). 실제 `data/costs.json`을 오염시키지 않는다
- 비용 상한 기본값: 전체 `$20`, 프로젝트당 `$5` (30초 한 편이 약 $2, VLM 재시도 시 $3)
- **단가 주의:** 단계별 워크플로의 클립은 `FAL_I2V_ENDPOINT`(기본 `ltx-2.3/image-to-video/fast`,
  $0.04/s)를 쓴다. `FAL_VIDEO_ENDPOINT`(Veo 3.1, $0.40/s)는 `app/api/video/route.js`(옛 단발
  t2v)만 쓴다 — 혼동하면 단가를 10배로 잘못 잡는다
- **합성은 로컬 ffmpeg**(`lib/compose.js` 기본 경로). 배포하지 않으므로 자막이 구워진 mp4 가
  그대로 나온다. `SHOTFORM_COMPOSER` 는 비워 둔다
- i2v 상한: `I2V_MAX_SECONDS = 10` (`lib/i2v.js`)
- 한국어 문구는 사장님이 읽는 말로 쓴다. 파일명·함수명을 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조를 따른다 (무엇을 왜 바꿨는지 한 줄 + 본문)

## 선행 작업 (계획 밖)

메인 워크트리 `C:\Users\fixup\shotform-saas`에 **미커밋으로 남은 길이 임계 작업**
(`lib/script.js`의 `LENGTH_SLACK` 1.3→1.15, `AIM_BAND` 신설, `tests/script.test.js`)이 있다.
테스트는 이미 그린이다. 이 계획을 시작하기 전에 그쪽에서 커밋해 둔다. 이 워크트리는 건드리지
않는다.

---

## File Structure

**수정**
- `lib/costs.js` — 누적 합계와 예산 가드를 더한다 (지금은 기록만 한다)
- `lib/imagegen.js` · `lib/tts.js` · `lib/i2v.js` · `lib/compose.js` — fal 호출 직전 가드,
  비용 기록에 `project_id`
- `lib/pipeline.js` — `runCutsPipeline`을 둘로 가른다
- `lib/steps.js` — 단계 순서와 상태 판정
- `lib/cuts.js` — 긴 컷 판정 함수를 더한다
- `app/api/projects/[id]/cuts/route.js` — 분할만 한다
- `app/api/projects/[id]/voice/route.js` — 앞 단계 가드가 바뀐다
- `app/create/[id]/script/page.js` · `voice/page.js` · `images/page.js` · `video/page.js` — 번호와 문구

**생성**
- `app/api/projects/[id]/images/route.js` — 이미지 생성 시작
- `tests/budget.test.js` — 예산 가드

**건드리지 않음**
- `lib/subtitles.js` (`toAss` 포함) — 배포 계획에서 쓴다
- `lib/store/` — 계획 2(Supabase)에서 만든다

---

## Task 1: 예산 가드 코어

`lib/costs.js`는 지금 기록만 하고 막지 않는다. 누적 합계와 상한 판정을 더한다.

**Files:**
- Modify: `lib/costs.js`
- Test: `tests/budget.test.js` (신규)

**Interfaces:**
- Consumes: 기존 `estimateCost(endpoint, amount)`, 내부 `readAll()`
- Produces:
  - `spentTotal(): Promise<number>`
  - `spentForProject(projectId: string): Promise<number>`
  - `assertBudget({ projectId?, endpoint, amount }): Promise<void>` — 넘으면 `BudgetExceeded` throw
  - `class BudgetExceeded extends Error` — `.scope`가 `"total"` 또는 `"project"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/budget.test.js` 를 만든다:

```js
// 예산 가드 — 기록이 아니라 "나가기 전에 막는 것"이 요점이다.
// 호출한 뒤에 재면 이미 돈이 나간 뒤다.
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let costs;

async function fresh(env = {}) {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  process.env.SHOTFORM_FAKE = "off";
  delete process.env.SHOTFORM_FAKE_IMAGES;
  process.env.SHOTFORM_BUDGET_TOTAL_USD = env.total ?? "20";
  process.env.SHOTFORM_BUDGET_PROJECT_USD = env.project ?? "3";
  costs = await import("../lib/costs.js?t=" + Date.now() + Math.random());
}

async function record(costs, { project_id, est_cost_usd }) {
  await costs.addRecord({
    request_id: String(Math.random()), ts: Date.now(), endpoint: "fal-ai/veo3.1",
    stage: "영상", user: "local", project_id,
    prompt: "-", duration: "1", aspect_ratio: "-",
    est_cost_usd, status: "done", video_url: "u",
  });
}

describe("누적 합계", () => {
  beforeEach(() => fresh());

  it("기록이 없으면 0이다", async () => {
    expect(await costs.spentTotal()).toBe(0);
    expect(await costs.spentForProject("p1")).toBe(0);
  });

  it("전체와 프로젝트별을 따로 센다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 1.5 });
    await record(costs, { project_id: "p2", est_cost_usd: 2 });
    expect(await costs.spentTotal()).toBe(3.5);
    expect(await costs.spentForProject("p1")).toBe(1.5);
  });

  it("project_id 없는 옛 기록도 전체에는 들어간다", async () => {
    await record(costs, { project_id: undefined, est_cost_usd: 1 });
    expect(await costs.spentTotal()).toBe(1);
    expect(await costs.spentForProject("p1")).toBe(0);
  });
});

describe("assertBudget", () => {
  beforeEach(() => fresh({ total: "10", project: "3" }));

  it("여유가 있으면 통과한다", async () => {
    // veo3.1 $0.40/s × 5초 = $2.00
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });

  it("이번 호출을 더해 프로젝트 상한을 넘으면 막는다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    // 2 + 2 = 4 > 3
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).rejects.toThrow(/예산 상한/);
  });

  it("다른 프로젝트가 쓴 것은 이 프로젝트 상한에 들어가지 않는다", async () => {
    await record(costs, { project_id: "p2", est_cost_usd: 2.9 });
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });

  it("전체 상한은 프로젝트를 가리지 않고 넘으면 막는다", async () => {
    await record(costs, { project_id: "p2", est_cost_usd: 9 });
    // 9 + 2 = 11 > 10
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).rejects.toThrow(/예산 상한/);
  });

  it("어느 상한에 걸렸는지 알려준다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    await costs
      .assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      .then(() => { throw new Error("막았어야 한다"); })
      .catch((e) => { expect(e.scope).toBe("project"); });
  });

  it("projectId가 없으면 전체 상한만 본다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2.9 });
    await expect(
      costs.assertBudget({ endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });
});

describe("가짜 모드", () => {
  it("가짜 모드에서는 재지도 막지도 않는다 — 0원이므로", async () => {
    await fresh({ total: "0", project: "0" });
    process.env.SHOTFORM_FAKE = "all";
    const c = await import("../lib/costs.js?t=" + Date.now() + Math.random());
    await expect(
      c.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 100 })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/budget.test.js`
Expected: FAIL — `costs.spentTotal is not a function`

- [ ] **Step 3: 구현한다**

`lib/costs.js`의 `estimateCost` 아래, `readAll` 위에 `fakeFal` import를 더하고
(파일 맨 위 import 구역에 `import { fakeFal } from "./fake";`) 다음을 더한다:

```js
// 예산 가드 — 기록만으로는 아무것도 막지 못한다.
// 팀원 여럿이 각자 돌리는 프로토타입에서, 상한이 없으면 하룻밤에 바닥난다.
export class BudgetExceeded extends Error {
  constructor(spent, limit, scope) {
    super(`예산 상한($${limit})에 닿아 멈췄어요 — 지금까지 $${spent.toFixed(2)} 썼어요`);
    this.name = "BudgetExceeded";
    this.scope = scope; // "total" | "project"
  }
}

// 상한은 매번 env 에서 읽는다 — 모듈 로드 시점에 굳히면 테스트가 값을 못 바꾼다
function limitTotal() {
  return Number(process.env.SHOTFORM_BUDGET_TOTAL_USD ?? 20);
}
function limitProject() {
  // 30초 한 편이 약 $2(클립 $1.20 + 이미지 $0.80). 재생성 여지를 두어 두 배쯤 잡는다
  return Number(process.env.SHOTFORM_BUDGET_PROJECT_USD ?? 5);
}

const sum = (records) => records.reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);

export async function spentTotal() {
  return sum(await readAll());
}

export async function spentForProject(projectId) {
  return sum((await readAll()).filter((r) => r.project_id === projectId));
}

// fal 로 나가기 직전에 부른다. 호출한 뒤에 재는 것이 아니라 나가기 전에 막는다 —
// 이번 호출의 예상 비용을 더한 값으로 판정하는 이유다.
export async function assertBudget({ projectId, endpoint, amount }) {
  if (fakeFal()) return; // 가짜 모드는 0원이라 잴 것이 없다
  const cost = estimateCost(endpoint, amount);
  const all = await readAll();

  const total = sum(all) + cost;
  if (total > limitTotal()) throw new BudgetExceeded(total - cost, limitTotal(), "total");

  if (projectId) {
    const mine = sum(all.filter((r) => r.project_id === projectId)) + cost;
    if (mine > limitProject()) throw new BudgetExceeded(mine - cost, limitProject(), "project");
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/budget.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 기존 테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/costs.js tests/budget.test.js
git commit -m "feat: 비용을 기록만 하지 말고 상한에서 막는다

팀원 여럿이 각자 돌리는데 상한이 없으면 하룻밤에 바닥난다. 나가기 전에
이번 호출의 예상 비용을 더해 재고, 넘으면 부르지 않는다. 전체와 프로젝트당
두 자리에 건다. 가짜 모드는 0원이라 재지 않는다."
```

---

## Task 2: 가드를 fal 호출부 넷에 배선한다

가드를 만들었으니 실제로 부르게 한다. 비용 기록에 `project_id`도 함께 넣는다 — 없으면
프로젝트별 집계가 항상 0이다.

**Files:**
- Modify: `lib/imagegen.js` · `lib/tts.js` · `lib/i2v.js` · `lib/compose.js`
- Modify: `lib/pipeline.js` (네 모듈에 `projectId`를 넘긴다)
- Test: `tests/budget.test.js` (배선 테스트 추가)

**Interfaces:**
- Consumes: `assertBudget`, `BudgetExceeded` (Task 1)
- Produces: 네 함수가 `projectId`를 받는다
  - `generateImage({ prompt, aspect_ratio, refImagePath, projectId, fetchImpl })`
  - `generateSpeech({ text, voiceId, projectId, fetchImpl })`
  - `generateClip({ imageUrl, seconds, aspect_ratio, projectId, fetchImpl })`
  - `composeVideo({ projectId, cuts, ... })` — 이미 받고 있다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/budget.test.js` 끝에 더한다:

```js
describe("호출부 배선 — 가드에 걸리면 fal 로 나가지 않는다", () => {
  beforeEach(() => fresh({ total: "0.01", project: "0.01" }));

  it("이미지: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateImage } = await import("../lib/imagegen.js?t=" + Date.now() + Math.random());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });

  it("목소리: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateSpeech } = await import("../lib/tts.js?t=" + Date.now() + Math.random());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateSpeech({ text: "가".repeat(500), voiceId: "v", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });

  it("영상: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateClip } = await import("../lib/i2v.js?t=" + Date.now() + Math.random());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateClip({ imageUrl: "u", seconds: 5, aspect_ratio: "9:16", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });
});

describe("비용 기록에 프로젝트가 남는다", () => {
  beforeEach(() => fresh({ total: "100", project: "100" }));

  it("이미지 기록에 project_id 가 들어간다", async () => {
    const { generateImage } = await import("../lib/imagegen.js?t=" + Date.now() + Math.random());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ images: [{ url: "https://x/y.png" }] }),
    });
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl });
    const c = await import("../lib/costs.js?t=" + Date.now() + Math.random());
    expect(await c.spentForProject("p1")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/budget.test.js`
Expected: FAIL — 가드를 부르지 않아 `called`가 `true`가 되거나, `spentForProject`가 0

- [ ] **Step 3: `lib/imagegen.js` 를 고친다**

import 줄을 바꾼다:

```js
import { addRecord, costActor, assertBudget } from "./costs";
```

`generateImage` 시그니처와 가드·기록:

```js
export async function generateImage({ prompt, aspect_ratio, refImagePath, projectId, fetchImpl = fetch }) {
  // 가짜 모드 — fal을 부르지 않고 플레이스홀더를 즉시 돌려준다. 비용도 기록하지 않는다.
  if (fakeFal()) return { url: placeholderImage(prompt, aspect_ratio) };
  // 레퍼런스 사진이 있으면 edit 계열 엔드포인트 사용 — base 모델은 image_urls를 받지 않음
  const base = process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana";
  const endpoint = refImagePath ? `${base}/edit` : base;
  // 나가기 전에 막는다 — 이미지는 컷마다 후보 2장이라 가장 빨리 쌓인다.
  // 단가표에 없는 엔드포인트라 amount 는 장당 고정가에 맞춰 1을 넘긴다.
  await assertBudget({ projectId, endpoint, amount: IMAGE_PRICE_USD / 0.1 });
  ...
```

> `assertBudget`은 `estimateCost`로 비용을 재는데 이미지 엔드포인트는 단가표에 없어
> 기본 단가(`DEFAULT_PER_SEC = 0.1`)로 떨어진다. `amount`를 `IMAGE_PRICE_USD / 0.1`로 주면
> 실제 기록값(`$0.04`)과 같은 값이 나온다.

`addRecord` 호출에 `project_id`를 더한다:

```js
  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "이미지", user: costActor(), project_id: projectId,
    prompt: prompt.slice(0, 300), duration: "-", aspect_ratio,
    est_cost_usd: IMAGE_PRICE_USD, status: "done", video_url: url,
  }).catch(() => {});
```

- [ ] **Step 4: `lib/tts.js` 를 고친다**

```js
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
```

```js
export async function generateSpeech({ text, voiceId, projectId, fetchImpl = fetch }) {
  if (fakeFal()) return { url: SILENT_WAV, seconds: estimateSeconds(text) };

  const endpoint = process.env.FAL_TTS_ENDPOINT || "fal-ai/elevenlabs/tts/turbo-v2.5";
  // TTS 는 글자당 과금이라 amount 가 글자 수다
  await assertBudget({ projectId, endpoint, amount: (text || "").length });
  const res = await fetchImpl(...);
```

`addRecord`에 `project_id: projectId` 를 더한다 (`user: costActor(),` 뒤).

- [ ] **Step 5: `lib/i2v.js` 를 고친다**

```js
import { addRecord, costActor, estimateCost, assertBudget } from "./costs";
```

```js
export async function generateClip({ imageUrl, seconds, aspect_ratio, projectId, fetchImpl = fetch }) {
  const want = Number(seconds) || 1;
  const duration = Math.min(Math.max(want, 1), I2V_MAX_SECONDS);
  const truncated = want > I2V_MAX_SECONDS;

  if (fakeFal()) return { url: imageUrl, seconds: duration, truncated };

  const endpoint = process.env.FAL_I2V_ENDPOINT || "fal-ai/ltx-2.3/image-to-video/fast";
  // 클립이 가장 비싸다 — 여기서 막히는 것이 정상이다
  await assertBudget({ projectId, endpoint, amount: duration });
  const res = await fetchImpl(...);
```

`addRecord`에 `project_id: projectId` 를 더한다.

- [ ] **Step 6: `lib/compose.js` 를 고친다**

`composeWithFal`이 `call()` 안에서 `addRecord`를 부른다. `composeWithFal({ cuts, seconds, fetchImpl })`
에 `projectId`를 더해 넘기고, `call` 안의 `addRecord`에 `project_id: projectId`를 더한다.
`composeVideo`에서 부르는 자리도 함께 고친다:

```js
  if (process.env.SHOTFORM_COMPOSER === "fal") {
    return composeWithFal({ projectId, cuts: usable, seconds, fetchImpl });
  }
```

합성은 사실상 $0 이라 `assertBudget`은 걸지 않는다 — 막을 값이 없고, 여기서 막히면
이미 치른 클립 값이 결과물 없이 버려진다.

- [ ] **Step 7: `lib/pipeline.js` 에서 `projectId` 를 넘긴다**

`processCut` 안의 `deps.genImage` 호출 두 곳:

```js
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath, projectId }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath, projectId }),
      ]);
```

`runVoicePipeline`·`runVideoPipeline` 안의 `generateSpeech`·`generateClip` 호출에도
`projectId`를 더한다. 두 함수의 첫 인자가 이미 `projectId`이므로 그 값을 그대로 쓴다.

- [ ] **Step 8: 통과를 확인한다**

Run: `npx vitest run tests/budget.test.js`
Expected: PASS

- [ ] **Step 9: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. `tests/i2v.test.js`·`tests/tts.test.js`·`tests/compose.test.js`가
`projectId` 없이 부르더라도 통과해야 한다 (`projectId`가 없으면 전체 상한만 본다)

- [ ] **Step 10: 커밋**

```bash
git add lib/imagegen.js lib/tts.js lib/i2v.js lib/compose.js lib/pipeline.js tests/budget.test.js
git commit -m "feat: 예산 가드를 fal 호출 앞에 세우고, 비용에 프로젝트를 남긴다

가드를 만들어도 부르지 않으면 아무것도 막지 않는다. 이미지·목소리·영상 셋 앞에
세웠다. 합성은 사실상 0원이라 걸지 않는다 — 거기서 막히면 이미 치른 클립 값이
결과물 없이 버려진다.

기록에 project_id 가 없어 프로젝트별 집계가 늘 0이었다."
```

---

## Task 3: 단계 순서를 바꾼다

`lib/steps.js`의 순서와 상태 판정을 새 흐름으로 옮긴다. **화면·파이프라인보다 먼저** 여기를
바꾼다 — 이 표를 사이드바와 라우팅 가드가 함께 보기 때문에, 여기가 진실의 원천이다.

**Files:**
- Modify: `lib/steps.js:4-14` (주석과 `STEPS`), `lib/steps.js:38-47` (`currentStepKey`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Produces: `STEPS` 순서가 `material · script · voice · images · video · done`
- Produces: `currentStepKey(project)` 가 새 status 값 `"images"` 를 읽는다

**상태 흐름:** `status`는 **마지막으로 끝난 산출물**, `currentStepKey`는 **다음에 열릴 화면**이다.

| status | 뜻 | currentStepKey |
|---|---|---|
| `cuts` | 컷 분할이 끝났다 | `voice` |
| `voice` | 목소리가 끝났다 | `images` |
| `images` | 이미지가 끝났다 | `video` |
| `video` | 클립이 끝났다 | `video` |
| `done` | 완성본이 있다 | `done` |

> `video`만 자기 자신을 가리킨다. 완성(`done`)은 사장님이 버튼을 눌러야 시작되므로, 클립이
> 끝난 상태에서 열려 있어야 할 화면은 여전히 ⑤영상이다. 기존 동작과 같다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/steps.test.js:5-17`의 두 테스트를 **바꾼다**:

```js
  it("구성이 빠져 6단계다 — 원고가 곧 설계다", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "material", "script", "voice", "images", "video", "done",
    ]);
    expect(STEPS[1]).toMatchObject({ key: "script", label: "대본", seg: "script" });
  });

  it("목소리가 이미지 앞이다 — 낭독 길이가 컷 구조를 판정한다", () => {
    // TTS 실측이 cut.seconds 를 덮는다. 그 값이 10초를 넘으면 클립이 잘린다.
    // 이미지 값을 치르기 전에 알아야 쪼갤 기회가 있다.
    const keys = STEPS.map((s) => s.key);
    expect(keys.indexOf("voice")).toBeLessThan(keys.indexOf("images"));
    expect(keys.indexOf("images")).toBeLessThan(keys.indexOf("video"));
  });
```

`tests/steps.test.js:70-90`의 `currentStepKey` 테스트를 **바꾼다**:

```js
  it("분할이 끝나면 목소리 차례", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed })).toBe("voice");
  });
  it("목소리가 끝나면 이미지 차례", () => {
    expect(currentStepKey({ status: "voice", briefing: confirmed })).toBe("images");
  });
  it("뒤 단계 status 를 각각 읽는다", () => {
    expect(currentStepKey({ status: "images", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "video", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "done", briefing: confirmed })).toBe("done");
  });
  it("뒤 단계 판정을 앞보다 먼저 본다 — 앞서간 프로젝트를 끌어내리지 않는다", () => {
    // status 가 done 인데 cuts 조건에 먼저 걸려 뒤로 가면, 완성본을 두고 되돌아간다
    const finished = { status: "done", briefing: confirmed, cuts: [{ idx: 0 }] };
    expect(currentStepKey(finished)).toBe("done");
  });
  it("구성 시절 프로젝트도 status가 cuts면 목소리 차례 — 돈 주고 만든 컷에서 쫓아내지 않는다", () => {
    const old = { status: "cuts", briefing: confirmed, synopsis: { scenes: [] }, cuts: [{ id: "c1" }] };
    expect(currentStepKey(old)).toBe("voice");
  });
```

`tests/steps.test.js:126-150`의 `isReachable` 테스트를 **바꾼다**:

```js
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("대본 승인 직후 status가 cuts로 서야 목소리 단계가 열린다", () => {
    const base = { briefing: { confirmed: true } };
    expect(isReachable("voice", { ...base, status: "script" })).toBe(false);
    expect(isReachable("voice", { ...base, status: "cuts", cuts: [] })).toBe(true);
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "voice", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
  it("영상 단계에 있으면 앞 단계가 전부 열려 있다", () => {
    const p = { briefing: { confirmed: true }, status: "images" };
    for (const k of ["material", "script", "voice", "images", "video"]) {
      expect(isReachable(k, p), k).toBe(true);
    }
    expect(isReachable("done", p)).toBe(false);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — 순서와 status 매핑이 옛것

- [ ] **Step 3: `lib/steps.js` 를 고친다**

`lib/steps.js:4-14`를 바꾼다:

```js
// 목소리가 이미지 앞인 이유: 낭독 길이가 컷 구조를 판정한다.
// TTS 실측이 cut.seconds 를 덮고, 그 값이 i2v 상한(10초)을 넘으면 클립이 잘린다 —
// 이미지 값을 치르기 전에 알아야 쪼갤 기회가 있다. 이미지는 컷당 후보 2장이라 가장 비싸다.
// 컷 분할은 대본 승인이 부른다(OpenAI만 쓰므로 fal 비용이 없다).
export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "script", no: "②", label: "대본", seg: "script" },
  { key: "voice", no: "③", label: "목소리", seg: "voice" },
  { key: "images", no: "④", label: "이미지", seg: "images" },
  { key: "video", no: "⑤", label: "영상", seg: "video" },
  { key: "done", no: "⑥", label: "완성", seg: "done" },
];
```

`lib/steps.js:34-47`을 바꾼다:

```js
// 프로젝트 상태 → 지금 있어야 할 단계.
// status 는 "마지막으로 끝난 산출물", 이 함수가 돌려주는 것은 "다음에 열릴 화면"이다.
// 이 구분이 흐려지면 완성본을 두고 앞 화면으로 되돌아가는 결함이 재발한다.
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  // 뒤 단계부터 확인한다 — 앞선 조건에 먼저 걸리면 앞서간 프로젝트를 끌어내린다
  if (project.status === "done") return "done";
  if (project.status === "video") return "video";
  if (project.status === "images") return "video";
  if (project.status === "voice") return "images";
  if (project.status === "cuts") return "voice";
  return "script";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS

- [ ] **Step 5: 무엇이 깨졌는지 본다**

Run: `npx vitest run`
Expected: `tests/routes.test.js`·`tests/pipeline.test.js`에서 실패가 난다. **여기서 고치지
않는다** — Task 4·5가 그 원인을 고친다. 실패 목록을 적어두고 다음 태스크로 간다.

- [ ] **Step 6: 커밋**

순서 표만 먼저 커밋한다. 라우트가 아직 옛 흐름이라 앱은 중간 상태다.

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "refactor: 목소리를 이미지 앞으로 — 낭독 길이가 컷 구조를 판정한다

TTS 실측이 cut.seconds 를 덮고 그 값이 10초를 넘으면 클립이 잘린다. 지금은
이미 이미지 값을 치른 뒤에 그 사실을 알았다. 이미지는 컷당 후보 2장이라 가장
비싸므로 싼 것으로 먼저 재는 것이 맞다.

기존 순서는 필연이 아니었다 — 컷 분할이 이미지 단계에 묶여 있었을 뿐이다.

라우트는 아직 옛 흐름이다(다음 커밋)."
```

---

## Task 4: 파이프라인을 분할과 이미지로 가른다

`runCutsPipeline`이 분할·화면설계·이미지생성을 한 덩어리로 돈다. 분할(OpenAI)과 이미지(fal)를
가른다.

**Files:**
- Modify: `lib/pipeline.js:110-122`
- Test: `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `defaultDeps.splitCuts`, `processCut` (그대로)
- Produces:
  - `runSplitPipeline(projectId, deps = defaultDeps): Promise<void>` — 분할 + 화면 설계.
    `status: "cuts"`, `cuts` 를 `state: "pending"` 으로 저장
  - `runImagesPipeline(projectId, deps = defaultDeps): Promise<void>` — 컷별 이미지.
    끝나면 `status: "images"`
- `runCutsPipeline` 은 **없앤다**. 부르는 곳은 Task 5가 고친다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js`에서 `runCutsPipeline`을 쓰는 기존 테스트를 찾아 둘로 나눈다.
새로 더할 테스트:

이 파일은 상단에서 `projects`·`pipeline` 을 동적 import 하고, 헬퍼 `makeProject()` 와
`deps({ failCut })` 를 쓴다. **그 패턴을 그대로 따른다** (새 헬퍼를 만들지 않는다):

```js
describe("분할과 이미지가 갈라져 있다", () => {
  it("runSplitPipeline 은 컷만 만들고 이미지는 부르지 않는다", async () => {
    let imageCalls = 0;
    const d = {
      splitCuts: async () => [{ idx: 0, sentence: "첫 문장입니다.", seconds: 3 }],
      genImage: async () => { imageCalls++; return { url: "img" }; },
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, d);

    const saved = await projects.getProject(p.id);
    expect(saved.status).toBe("cuts");
    expect(saved.cuts).toHaveLength(1);
    expect(saved.cuts[0].state).toBe("pending");
    expect(imageCalls).toBe(0); // 이미지는 아직이다
  });

  it("runImagesPipeline 은 이미 있는 컷에 그림을 붙이고 status 를 images 로 올린다", async () => {
    const d = {
      splitCuts: async () => { throw new Error("분할을 다시 부르면 안 된다"); },
      genImage: async () => ({ url: "img" }),
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "첫 문장입니다.", seconds: 3, state: "pending", regen_count: 0 }],
    }));

    await pipeline.runImagesPipeline(p.id, d);

    const saved = await projects.getProject(p.id);
    expect(saved.status).toBe("images");
    expect(saved.cuts[0].image.url).toBe("img");
    expect(saved.cuts[0].state).toBe("done");
  });
});
```

기존 테스트 중 `runCutsPipeline` 을 부르는 것들은 **둘로 나눈다** — 분할까지 보던 단언은
`runSplitPipeline` 뒤로, 이미지 산출물을 보던 단언은 `runSplitPipeline` → `runImagesPipeline`
을 잇달아 부른 뒤로 옮긴다. 단언 내용 자체는 바꾸지 않는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `runSplitPipeline is not defined`

- [ ] **Step 3: `lib/pipeline.js:110-122` 를 바꾼다**

```js
// 분할 — 원고를 컷으로 자르고 화면을 붙인다. OpenAI 만 쓰므로 fal 비용이 없다.
// 그래서 대본 승인에 이어 붙일 수 있고, 목소리가 이미지 앞에 설 수 있다.
export async function runSplitPipeline(projectId, deps = defaultDeps) {
  const project = await getProject(projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 대본 필수 검증은 라우트에서 수행 — 주입 deps 테스트는 대본 없이 컷 분할 가능
  const cuts = await deps.splitCuts(project);
  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "cuts",
    cuts: cuts.map((c) => ({ ...c, state: "pending" })),
  }));
}

// 이미지 — 컷마다 후보 2장을 뽑아 VLM 이 고른다. 실패는 컷 단위로 격리된다.
// 컷이 이미 있다는 전제다(분할·목소리가 끝난 뒤).
export async function runImagesPipeline(projectId, deps = defaultDeps) {
  const saved = await getProject(projectId);
  if (!saved) throw new Error("프로젝트를 찾을 수 없어요");
  await Promise.all(saved.cuts.map((cut) => processCut(projectId, cut, saved, deps)));
  // 컷 하나가 needs_attention 이어도 단계는 넘어간다 — 그 컷만 다시 만들 수 있어야 한다
  await updateProject(projectId, (proj) => ({ ...proj, status: "images" }));
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js
git commit -m "refactor: 컷 파이프라인을 분할과 이미지로 가른다

분할은 OpenAI 만 쓰고 이미지는 fal 을 쓴다. 한 덩어리로 묶여 있어서 목소리가
이미지 뒤로 밀렸다. 가르고 나면 분할을 대본 승인에 붙일 수 있다."
```

---

## Task 5: 라우트를 새 흐름으로 잇는다

**Files:**
- Modify: `app/api/projects/[id]/cuts/route.js` (분할만)
- Create: `app/api/projects/[id]/images/route.js` (이미지 시작)
- Modify: `app/api/projects/[id]/voice/route.js:11-14, 26-32` (가드)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: `runSplitPipeline`, `runImagesPipeline` (Task 4)
- Produces: `POST /api/projects/:id/images` — `{ started: true }` 또는 4xx

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**먼저 파일 상단의 파이프라인 mock(9-15행)을 새 함수 이름으로 고친다.** 안 고치면
`runSplitPipeline` 이 mock 되지 않아 라우트 테스트가 진짜 LLM 경로로 샌다:

```js
vi.mock("../lib/pipeline.js", () => ({
  runSplitPipeline: (...a) => pipelineMock.run(...a),
  runImagesPipeline: (...a) => pipelineMock.run(...a),
  runVoicePipeline: (...a) => pipelineMock.run(...a),
  runVideoPipeline: (...a) => pipelineMock.run(...a),
  runRenderPipeline: (...a) => pipelineMock.run(...a),
}));
```

새 라우트를 import 한다 (20-25행 옆):

```js
const { POST: imagesPOST } = await import("../app/api/projects/[id]/images/route.js");
```

`POST /cuts` 의 **기존 멱등 가드 테스트를 고친다.** 지금은 `currentStepKey(project) === "images"`
로 판정해 status 에 얽혀 있는데, 새 코드는 컷의 유무만 본다. 헬퍼 `projectWithScript()`·`ctx()`·
`patchReq()` 를 그대로 쓴다:

```js
  it("이미 나눈 컷이 있으면 409 — 돈 주고 만든 소리·그림을 지우지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts", cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3 }],
    }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/목소리/);
  });

  it("컷이 비어 있으면 다시 나눌 수 있다 — 분할 실패는 재시도해야 한다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts: [] }));
    const res = await cutsPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
  });
```

새 라우트 테스트를 더한다:

```js
describe("POST /api/projects/[id]/images", () => {
  it("컷이 없으면 400", async () => {
    const p = await projectWithScript();
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/대본/);
  });

  it("목소리가 없으면 400 — 길이를 모르는 채로 그림을 그리지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, state: "pending" }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/목소리/);
  });

  it("소리가 있으면 시작한다 — 컷을 pending 으로 되돌리고 파이프라인을 띄운다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, audio: { url: "a" } }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledWith(p.id);
    expect((await getProject(p.id)).cuts[0].state).toBe("pending");
  });

  it("이미 이미지가 있으면 409 — 컷당 두 장씩 다시 사지 않는다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "images",
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, audio: { url: "a" }, image: { url: "i" } }],
    }));
    const res = await imagesPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — `images/route.js` 없음

- [ ] **Step 3: `app/api/projects/[id]/cuts/route.js` 를 고친다**

`runCutsPipeline` → `runSplitPipeline`, 멱등 가드의 판정과 문구를 바꾼다:

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { runSplitPipeline } from "../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 컷은 원고를 잘라서 만든다 — 원고가 없으면 자를 것도, 그릴 근거도 없다.
  if (!project.script?.text) {
    return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const aspect_ratio = ["9:16", "1:1", "16:9"].includes(body?.aspect_ratio)
    ? body.aspect_ratio
    : project.settings?.aspect_ratio || "9:16";

  // 멱등 가드 — 컷이 이미 있으면 다시 나누지 않는다.
  // 분할 자체는 싸지만, cuts:[] 를 선저장하므로 막지 않으면 돈 주고 만든 소리·그림이
  // 그 자리에서 지워진다. 컷이 비어 있는 경우(=분할 실패)는 다시 시도를 허용한다.
  if ((project.cuts || []).length > 0) {
    return Response.json(
      { error: "이미 나눈 컷이 있어요 — ③ 목소리에서 확인해 주세요" },
      { status: 409 }
    );
  }

  await updateProject(id, (proj) => ({
    ...proj,
    settings: { ...proj.settings, aspect_ratio },
    status: "cuts", cuts: [], cuts_error: null,
    cuts_script_version: proj.script?.version || 1,
  }));

  runSplitPipeline(id).catch(async (e) => {
    console.error("split pipeline error:", e);
    await updateProject(id, (proj) => ({
      ...proj,
      cuts_error: e?.message || "컷을 나누지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
```

- [ ] **Step 4: `app/api/projects/[id]/images/route.js` 를 만든다**

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { runImagesPipeline } from "../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });

  // 낭독이 있어야 컷 길이가 확정된다 — 길이를 모르는 채로 그림을 그리면
  // 10초를 넘는 컷을 뒤늦게 알고 그림 값을 두 번 치른다
  if (!cuts.some((c) => c.audio)) {
    return Response.json({ error: "목소리를 먼저 만들어 주세요" }, { status: 400 });
  }

  // 멱등 가드 — 이미 그린 그림을 통째로 다시 사지 않는다(컷별 재생성으로 처리).
  // 컷당 후보 2장이라 여기가 가장 비싸다.
  if (cuts.some((c) => c.image)) {
    return Response.json(
      { error: "이미 만든 이미지가 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }

  await updateProject(id, (proj) => ({
    ...proj,
    images_error: null,
    cuts: proj.cuts.map((c) => ({ ...c, state: "pending" })),
  }));

  runImagesPipeline(id).catch(async (e) => {
    console.error("images pipeline error:", e);
    await updateProject(id, (proj) => ({
      ...proj, images_error: e?.message || "이미지를 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
```

- [ ] **Step 5: `app/api/projects/[id]/voice/route.js` 를 고친다**

앞 단계 가드 문구(11-14행)와 멱등 가드(26-32행)를 바꾼다:

```js
  // 읽을 컷이 있어야 한다 — 목소리는 컷별로 만든다.
  // 컷은 대본 승인이 나눈다(POST /cuts).
  if (!(project.cuts || []).length) {
    return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  }
```

```js
  // 멱등 가드 — 이미 만든 소리를 통째로 지우고 다시 만들지 않는다(컷별 재생성으로 처리)
  if ((project.cuts || []).some((c) => c.audio)) {
    return Response.json(
      { error: "이미 만든 목소리가 있어요 — 컷별로 다시 만들 수 있어요" },
      { status: 409 }
    );
  }
```

> `status === "voice"` 조건을 뺀 이유: 새 흐름에서 목소리가 끝나면 status 가 `voice`가 되고
> 이어서 이미지로 `images`가 된다. status 로 판정하면 이미지 단계에서 목소리를 다시 살 수 있다.
> **소리가 있는지**만 보는 것이 맞다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS

- [ ] **Step 7: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. Task 3에서 적어둔 실패 목록이 전부 사라졌는지 대조한다

- [ ] **Step 8: 커밋**

```bash
git add app/api/projects/ tests/routes.test.js
git commit -m "feat: 대본 승인이 컷을 나누고, 이미지는 목소리 뒤에 선다

/cuts 는 분할만 한다. 이미지는 /images 로 떼어내고 '목소리를 먼저' 가드를
세웠다 — 길이를 모르는 채로 그림을 그리면 10초 넘는 컷을 뒤늦게 알고 그림 값을
두 번 치른다.

목소리 멱등 가드에서 status 조건을 뺐다. 새 흐름에서는 이미지 단계에서도
status 가 앞으로 가 있어, status 로 판정하면 소리를 다시 살 수 있었다."
```

---

## Task 6: 화면을 새 순서로 잇는다

번호(③④⑤)와 안내 문구가 화면에 박혀 있다. 커밋 `be15c5b`가 같은 자리에서 옛 번호를 고쳤다 —
빠뜨리면 사장님이 읽는 말이 틀린다.

**Files:**
- Modify: `app/create/[id]/script/page.js:192`
- Modify: `app/create/[id]/voice/page.js:3-5, 99, 104, 191`
- Modify: `app/create/[id]/images/page.js:3, 58, 118`
- Modify: `app/create/[id]/video/page.js:3-4, 92-93, 97`

- [ ] **Step 1: 고칠 자리를 전부 찾는다**

Run:
```bash
git grep -n "[③④⑤]" -- app/
git grep -n "이미지를 먼저\|목소리를 먼저\|이미지 확인하러" -- app/
```
Expected: 위 File 목록의 자리들이 나온다. 목록에 없는 자리가 나오면 함께 고친다.

- [ ] **Step 2: `script/page.js` 의 승인 버튼을 고친다**

192행의 다음 화면 안내를 목소리로 바꾼다:

```jsx
            {hasCuts ? "③ 목소리 만들러 가기" : "대본 승인 →"}
```

승인 후 이동 경로도 함께 본다 — `/create/<id>/images` 로 보내고 있으면 `/create/<id>/voice`
로 바꾼다. (같은 파일에서 `router.push` 또는 `href`를 찾는다.)

- [ ] **Step 3: `voice/page.js` 를 고친다**

- 3-5행 머리주석: `// ③ 목소리 — 컷마다 문장을 읽혀 실제 길이를 확정한다.` 로. 클립 길이(⑤)와
  자막 타이밍(⑥) 언급은 그대로 맞다
- 99행: `이미지를 먼저 만들어 주세요.` → `대본을 먼저 만들어 주세요.`
- 104행 배지: `③ 목소리`
- 191행 다음 단계 버튼: `④ 이미지 만들러 가기 →`, 이동 경로를 `/create/<id>/images` 로

- [ ] **Step 4: `images/page.js` 를 고친다**

- 3행 머리주석: `// ④ 이미지 — 승인 게이트 (컷별 이미지 확인·재생성)`
- 58행 폴링 조건: `project?.status === "cuts"` → **이미지 진행 중 판정으로 바꾼다.**
  새 흐름에서 이미지 단계에 들어올 때 status 는 `voice` 이고, 끝나면 `images` 가 된다:

```js
    const running = project?.status === "voice" && cuts.some((c) => c.state === "generating" || c.state === "pending");
    if (running && !project.images_error && !pollRef.current && !pollTimedOut && waiting) {
```

- 118행 `splitting`: 분할은 이제 이 화면에서 일어나지 않는다. 이 상태 표시를 지우고, 컷이
  비어 있으면 "대본을 먼저 만들어 주세요"로 되돌린다
- 배지·다음 버튼의 번호를 `④`·`⑤ 영상 만들러 가기 →` 로

- [ ] **Step 5: `video/page.js` 를 고친다**

- 3-4행 머리주석의 `④에서 확정된 낭독 길이` → `③에서 확정된 낭독 길이`
- 92-93행 가드 순서를 새 흐름에 맞춘다:

```jsx
  if (!cuts.length) return <p className="pgsub">대본을 먼저 만들어 주세요.</p>;
  if (!cuts.some((c) => c.audio)) return <p className="pgsub">목소리를 먼저 만들어 주세요.</p>;
  if (!cuts.some((c) => c.image)) return <p className="pgsub">이미지를 먼저 만들어 주세요.</p>;
```

- [ ] **Step 6: `app/api/projects/[id]/clips/route.js` 의 가드도 같은 순서로 맞춘다**

11·14행의 두 문구가 화면과 어긋나지 않게 위와 같은 순서·문구로 고친다.

- [ ] **Step 7: 남은 옛 번호가 없는지 확인한다**

Run: `git grep -n "[③④⑤]" -- app/ lib/`
Expected: 목소리=③, 이미지=④, 영상=⑤ 로만 나온다. 어긋난 자리가 하나도 없어야 한다

- [ ] **Step 8: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 9: 손으로 훑는다**

Run: `SHOTFORM_FAKE=all npm run dev` (0원)
자료 → 대본 승인 → 목소리 → 이미지 → 영상 → 완성까지 눌러 본다. 사이드바 번호, 다음 단계
버튼, 뒤로 갔을 때 가드가 새 순서를 따르는지 본다.

- [ ] **Step 10: 커밋**

```bash
git add app/
git commit -m "style: 화면의 단계 번호와 안내를 새 순서로 맞춘다

번호가 화면에 박혀 있어 순서를 바꾸면 사장님이 읽는 말이 틀린다. 목소리=③,
이미지=④ 로 맞추고 '이미지를 먼저'가 '대본을 먼저'로 바뀌는 자리들을 고쳤다.

이미지 화면의 폴링 조건도 바꿨다 — 분할은 이제 여기서 일어나지 않는다."
```

---

## Task 7: 긴 컷을 이미지 전에 알린다

목소리가 끝나면 `cut.seconds`가 실측으로 덮인다. 10초를 넘는 컷은 클립이 잘린다 — **이미지 값을
치르기 전에** 보이게 한다.

**Files:**
- Modify: `lib/cuts.js` (판정 함수 추가)
- Modify: `app/create/[id]/images/page.js` (표시)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: `I2V_MAX_SECONDS` from `lib/i2v.js`
- Produces: `overLongCuts(cuts): Array<Cut>` — 10초를 **넘는** 컷 객체를 그대로 걸러 돌려준다
  (화면이 `idx`와 `seconds`를 함께 쓰므로 필드를 줄이지 않는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js`에 더한다:

```js
import { overLongCuts } from "../lib/cuts";

describe("overLongCuts — 잘릴 컷을 그림 값 치르기 전에 알린다", () => {
  it("10초를 넘는 컷만 고른다", () => {
    const cuts = [
      { idx: 0, seconds: 3 },
      { idx: 1, seconds: 12.4 },
      { idx: 2, seconds: 10 },    // 정확히 10초는 잘리지 않는다
      { idx: 3, seconds: 10.1 },
    ];
    expect(overLongCuts(cuts).map((c) => c.idx)).toEqual([1, 3]);
  });

  it("길이가 없으면 판정하지 않는다 — 목소리 전에는 추정치조차 없을 수 있다", () => {
    expect(overLongCuts([{ idx: 0 }, { idx: 1, seconds: null }])).toEqual([]);
  });

  it("컷이 없으면 빈 배열", () => {
    expect(overLongCuts([])).toEqual([]);
    expect(overLongCuts(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — `overLongCuts is not a function`

- [ ] **Step 3: `lib/cuts.js` 에 더한다**

파일 맨 위 import 구역에 `import { I2V_MAX_SECONDS } from "./i2v";` 를 더하고:

```js
// 낭독이 i2v 상한을 넘는 컷 — 그림은 10초에서 끝나는데 소리는 계속된다.
// 목소리가 끝난 뒤에야 실측 길이를 알므로, 이미지 값을 치르기 전에 보여 주는 것이 요점이다.
// 쪼개는 것은 아직 하지 않는다 — 얼마나 자주 걸리는지 보고 정한다.
export function overLongCuts(cuts) {
  return (cuts || []).filter((c) => Number(c?.seconds) > I2V_MAX_SECONDS);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS

- [ ] **Step 5: 이미지 화면에 표시한다**

`app/create/[id]/images/page.js`에서 `overLongCuts`를 import 하고, 이미지 만들기 버튼 **위에**
안내를 둔다:

```jsx
{overLongCuts(cuts).length > 0 && (
  <p className="pgsub warn">
    {overLongCuts(cuts).map((c) => `${c.idx + 1}번째 컷은 낭독이 ${Math.round(c.seconds)}초라 영상은 10초까지만 나와요`).join(" · ")}
  </p>
)}
```

> `warn` 클래스가 이미 있는지 `app/globals.css`에서 확인한다. 없으면 기존 경고 표시에 쓰는
> 클래스명을 그대로 쓴다 — 새 스타일을 만들지 않는다.

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js app/create/ tests/cuts.test.js
git commit -m "feat: 잘릴 컷을 그림 값 치르기 전에 알린다

낭독이 10초를 넘으면 클립은 10초에서 끝나는데 소리는 계속된다. 목소리가 끝난
뒤에야 실측 길이를 알므로, 이미지 단계 문턱에서 보여 준다.

쪼개지는 않는다 — QA 에서 얼마나 자주 걸리는지 보고 정한다."
```

---

## Task 8: e2e 30초 관통 ← **Task 7보다 먼저 한다**

**실제 fal 호출이 처음 나가는 지점.** 여기까지의 모든 코드가 추정 위에 서 있다.
그리고 **로컬 ffmpeg 합성은 가짜 모드에서 아예 건너뛰므로 한 번도 돈 적이 없다.**

**Files:** 없음 (수동 검증). 발견한 것만 고친다.

- [ ] **Step 1: 환경을 세운다**

`.env.local`을 확인하고 다음을 맞춘다:

```
SHOTFORM_FAKE=off
SHOTFORM_COMPOSER=                 # 비운다 — 로컬 ffmpeg 로 자막을 굽는다
FAL_I2V_ENDPOINT=fal-ai/ltx-2.3/image-to-video/fast
SHOTFORM_BUDGET_TOTAL_USD=20
SHOTFORM_BUDGET_PROJECT_USD=5
```

- `SHOTFORM_FAKE_IMAGES` 가 남아 있으면 **지운다** — `1`이면 fal 이 전부 가짜가 된다
- `FAL_VIDEO_ENDPOINT` 는 이 경로가 쓰지 않는다. 값이 뭐든 상관없다

- [ ] **Step 2: 가드가 실제로 막는지 먼저 본다**

`SHOTFORM_BUDGET_PROJECT_USD=0.01` 로 두고 한 번 돌린다.
Expected: 목소리 단계에서 "예산 상한($0.01)에 닿아 멈췄어요"가 뜨고, fal 로 나가지 않는다.
**돈이 나가기 전에 가드를 확인하는 것이 이 스텝의 목적이다.**

- [ ] **Step 3: 상한을 되돌리고 한 편을 관통한다**

`SHOTFORM_BUDGET_PROJECT_USD=5` 로 되돌린다. `npm run dev` 로 띄우고:

- 자료: 짧은 실제 가게 이야기 하나 (사진 없이 먼저 — 사진은 업로드 경로가 얽히므로 다음 편에서)
- 목표 길이: **30초** (컷 3초 × 10개 정도)
- 자료 → 대본 승인 → 목소리 → 이미지 → 영상 → 완성

예상 비용 약 $2 (클립 $1.20 + 이미지 $0.80 + 목소리 $0.01).

- [ ] **Step 4: 확인 목록을 하나씩 대조한다**

**fal 응답 형식**
- [ ] TTS 응답의 `data.audio.url`·`data.audio.duration` 이 코드 가정과 맞는가
- [ ] i2v 응답의 `data.video.url` 이 맞는가
- [ ] 이미지 응답의 `data.images[0].url` 이 맞는가

**길이가 이어지는가**
- [ ] TTS 실측이 `cut.seconds` 를 덮었는가 (`data/projects/<id>.json` 을 직접 연다)
- [ ] 그 값이 클립 길이로 넘어갔는가
- [ ] 컷을 이어붙인 전체가 **30초 근처**인가
- [ ] **실측이 추정치(5.5자/초)와 얼마나 벌어지는가** — 10초 초과 컷이 흔한지 드문지가
      여기서 갈리고, 그 답이 Task 7 의 형태를 정한다
- [ ] **같은 문장을 [다시 읽기]로 두세 번 읽혀 길이를 비교한다.** TTS 는 결정적이지 않고,
      우리는 `stability`·`seed` 를 보내지 않아 fal 기본값에 맡기고 있다(`lib/tts.js:31` 은
      text·voice 만 보낸다). 편차가 크면 [다시 읽기]가 뒷단을 흔드는 버튼이 된다 —
      seconds 가 바뀌면 클립 길이와 자막 타이밍이 함께 바뀌기 때문이다.
      크면 선택지는 둘: `stability` 를 올려 안정시키거나(낭독이 밋밋해진다),
      `seed` 를 고정하되 재생성할 때만 바꾼다
- [ ] **화면의 "N초" 배지와 재생기가 보여주는 파일 길이가 같은가.** 배지는 파이프라인이
      믿고 쓰는 값(`cut.seconds`)이고 재생기는 파일의 실제 길이다. TTS 가 duration 을
      돌려주지 않으면 코드가 글자 수로 어림해 채우므로(`lib/tts.js:42`) 둘이 어긋날 수 있다.
      어긋나면 그림·자막이 소리와 밀린다

**합성 — 이번에 처음 돈다**
- [ ] `ffmpeg-static` 바이너리가 실제로 실행되는가
- [ ] 클립이 소리보다 짧을 때 마지막 프레임 정지로 길이가 맞는가 (`buildFfmpegArgs` 의 `tpad`)
- [ ] **자막이 화면에 구워져 나오는가** — 하단 18% 세이프존, 글자가 깨지지 않는가
      (폰트를 `assets/` 에서 찾는다. 없으면 네모로 나온다)
- [ ] 내려받은 mp4 를 다른 플레이어에서 열어도 자막이 있는가

**돈**
- [ ] `data/costs.json` 의 합계와 fal 대시보드의 실제 청구액을 대조한다 —
      `PRICE_TABLE` 이 얼마나 틀렸는가

- [ ] **Step 5: 틀린 것을 고친다**

필드 이름·파라미터가 틀렸으면 그 자리에서 고치고, **고칠 때마다 테스트를 하나 더한다**
(같은 실수를 다시 하지 않게). 단가가 실제와 크게 다르면 `PRICE_TABLE`을 고친다.

- [ ] **Step 6: 알아낸 것을 적는다**

`docs/superpowers/specs/2026-07-28-prototype-qa-deploy-design.md` 의 **"미검증 가정"** 절을
연다. 판명된 항목을 사실로 바꿔 적는다 — 다음에 무엇을 할지가 이 값들 위에서 정해진다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "fix: 처음으로 진짜 fal 을 관통시키고 어긋난 곳을 고친다

여기까지 모든 코드가 문서를 보고 세운 추정 위에 있었다. 실제로 한 편을 돌려
[무엇이 틀렸는지]를 고쳤다. 실측 낭독 길이는 추정치 대비 [얼마]였다."
```

---

## 다음

Task 8(관통) → Task 7(긴 컷 알림) 순으로 끝내고, **그 다음은 관통에서 무엇이 부서졌는지 보고
정한다.** 후보는 배포(Supabase · Vercel · 자막 오버레이 · 팀 QA)와 대본 품질 잔여과제 1~5 인데,
지금 정하면 추정 위에 추정을 쌓는 것이 된다.
