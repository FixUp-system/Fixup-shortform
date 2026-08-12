# 청구 없이 도는 경로 막기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 이용자가 크레딧을 내지 않고 우리 돈(LLM)을 쓰는 경로 넷을 막고, 가격표와 어긋난 예산 안전핀 두 값을 바로잡는다.

**Architecture:** 새 게이트를 만들지 않는다. `assertBudget`(`lib/costs.js:137`)이 이미 "나가기 직전에 막는" 자리인데 **LLM 이 그 함수를 안 부른다** — 기존 게이트에 LLM 을 태우는 것이 본체다. 무료 체험 한도는 새 테이블·스키마 변경 없이 **"청구 이력도 잔액도 없음 + 누적 원가 초과"** 로 판정한다.

> ⚠️ **정정(2026-08-12 구현 중).** 계획 시점의 문구는 **"잔액 0 이하 + 누적 원가 초과"** 였다. 그 한 줄이 이 브랜치의 **유일한 Critical** 을 냈다 — 잔액이 정확히 0 인 **유료 사장님이 자기가 산 영상 도중에 무한 루프로 갇혔다**. 아래 Task 2 와 Step 4 에 무엇이 왜 바뀌었는지 적었다. **정본은 `lib/costs.js:196-215` 의 주석이다.**

**Tech Stack:** Next.js 15 App Router (JavaScript, TS 아님) · React 19 · Supabase · vitest

**설계 문서:** `docs/superpowers/specs/2026-08-12-billing-gaps-design.md`

## Global Constraints

- **한국어 문구·주석.** 이용자에게 보이는 모든 문구는 한국어다. 저장소 주석은 이용자를 "사장님"이라 부른다 — 새 주석도 그 어휘를 따른다.
- **TypeScript 를 쓰지 않는다.** `.js` / `.jsx` 만.
- **`lib/pricing.js` 는 import 문이 0개인 순수 모듈이어야 한다** — 화면(`"use client"`)이 import 하므로 import 를 하나라도 넣으면 번들이 깨진다(파일 상단 주석 `lib/pricing.js:12-13`).
- **가격·정책 숫자는 `lib/pricing.js` 한 곳에만 둔다.** 라우트·화면에 숫자를 흘리지 않는다.
- **비밀번호·API 키는 응답에도 서버 로그에도 남기지 않는다.**
- 테스트는 인메모리 저장소에 갇혀 있다 — `vitest.setup.js` 가 `SHOTFORM_STORE=memory` 를 세우고 매 테스트 전에 `resetMemoryStore()` 를 부른다.
- **`db/schema.sql` 은 건드리지 않는다.** 이 계획에는 스키마 변경이 없다(그게 "누적 한도"를 고른 이유다).
- 실행: `npx vitest run` (개수는 세지 않는다 — "전부 그린"만 본다)

## 파일 구조

| 파일 | 이 계획에서의 책임 |
|---|---|
| `lib/pricing.js` | **정책값 하나 추가** — `FREE_TRIAL_USD` |
| `lib/costs.js` | 상한 두 값 교정 · `BudgetExceeded` 에 `trial` 갈래 · `assertBudget` 에 체험 한도 |
| `lib/auth/require-user.js` | `BudgetExceeded` 를 HTTP 응답으로 옮긴다(지금 아무도 안 잡는다) |
| `lib/llm.js` | 호출 **앞**에 `assertBudget` |
| `app/api/chat/route.js` | 원장 기록 + `assertBudget` |
| `app/api/projects/[id]/route.js` | `target_seconds` 값 검증 + 결제 후 잠금 |
| `.env.local.example` | 예산 env 두 개를 적는다(지금 없다) |

---

### Task 1: 정책값과 상한값을 바로잡는다

**Files:**
- Modify: `lib/pricing.js` (파일 끝, `regenPrice` 아래)
- Modify: `lib/costs.js:115-122` (`limitTotal`·`limitProject`)
- Modify: `.env.local.example`
- Test: `tests/budget-limits.test.js` (신설)

**Interfaces:**
- Produces: `lib/pricing.js` 의 `FREE_TRIAL_USD = 0.5` (Task 2 가 쓴다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/budget-limits.test.js` 를 새로 만든다. ★ 마지막 단정이 이 태스크의 존재 이유다 — 가격표와 안전핀이 **서로 모르는 채** 갈라진 것이 이 결함의 원인이었다.

```js
// 가격표(파는 값)와 예산 안전핀(우리 지갑)이 어긋나면 산 영상이 중간에 죽는다.
// 실제로 그랬다 — 60초를 100크레딧에 팔면서 프로젝트 상한은 $5 였다(원가 ~$6.06).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FREE_TRIAL_USD, VIDEO_PRICE } from "../lib/pricing.js";

// 원가 공식 — lib/pricing.js 주석의 실측값(편당 $0.06 + 컷당 $0.50, 컷 ≈ 5초)
const costFor = (seconds) => 0.06 + 0.5 * (seconds / 5);

describe("체험 한도", () => {
  it("$0.50 다 — 편당 LLM 원가 ~$0.06 이니 대본 여덟 편쯤", () => {
    expect(FREE_TRIAL_USD).toBe(0.5);
  });

  it("편당 LLM 원가보다 넉넉하다 — 한 편도 못 만들면 체험이 아니다", () => {
    expect(FREE_TRIAL_USD).toBeGreaterThan(0.06 * 3);
  });
});

describe("예산 안전핀이 가격표를 견딘다", () => {
  // env 를 비워 기본값을 재고, 끝나면 되돌린다 — 다른 테스트가 값을 물려받으면 안 된다.
  const saved = {};
  beforeEach(() => {
    for (const k of ["SHOTFORM_BUDGET_TOTAL_USD", "SHOTFORM_BUDGET_PROJECT_USD"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ★ 이 단정이 이번 결함을 다시 잡는다.
  it("가장 긴 영상의 원가가 프로젝트 상한 아래다", async () => {
    const { limitProject } = await import("../lib/costs.js");
    const longest = Math.max(...Object.keys(VIDEO_PRICE).map(Number));
    expect(costFor(longest)).toBeLessThan(limitProject());
  });

  it("재생성 최대치까지 얹어도 프로젝트 상한 아래다 — 재생성은 크레딧을 받고 하는 정상 사용이다", async () => {
    const { limitProject } = await import("../lib/costs.js");
    const longest = Math.max(...Object.keys(VIDEO_PRICE).map(Number));
    const cuts = longest / 5;
    const regenWorst = cuts * 3 * 0.5;   // 컷당 3회(MAX_REGEN_PER_CUT) × 컷당 $0.50
    expect(costFor(longest) + regenWorst).toBeLessThan(limitProject());
  });

  it("전역 상한이 영상 여러 편을 견딘다 — 전 사용자 합계가 몇 편에서 멎으면 안 된다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal() / costFor(30)).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/budget-limits.test.js`
Expected: FAIL — `FREE_TRIAL_USD` 가 없고(`undefined`), `limitProject()` 가 5 라 `6.06 < 5` 가 거짓

> `limitTotal`·`limitProject` 는 지금 **export 되어 있지 않다**(`lib/costs.js:116,119`). Step 3 에서 `export` 를 붙인다.

- [ ] **Step 3: `lib/pricing.js` 에 체험 한도를 더한다**

`regenPrice` 함수 **아래**(파일 끝)에 붙인다. ★ 이 파일은 import 문이 0개여야 한다 — 새 import 를 넣지 마라.

```js
// 크레딧을 한 번도 못 받은 사장님이 **체험으로** 써 볼 수 있는 원가 한도(USD, 누적).
//
// 대화·브리핑·대본까지는 크레딧 없이 만들어 볼 수 있게 열어 뒀다 — 결과를 봐야 지갑을
// 연다. 대신 무제한이면 그대로 우리 돈이라 누적 상한을 건다. 편당 LLM 원가가 ~$0.06 이니
// 대본 여덟 편쯤이다.
//
// ★ env 가 아니라 여기 있는 이유: env 는 프로덕션에 넣는 것을 잊으면 조용히 기본값으로
// 돈다. 실제로 전역 예산 상한($20)이 그렇게 킬스위치가 될 뻔했다. 이건 가격 성격의
// 정책값이라 가격표에 둔다.
//
// ★ "하루 리셋"이 아니라 **누적**이다. 매일 리셋하면 영영 무료로 쓰는 사람이 생기고,
// 기간으로 재려면 sum_costs 에 기간 인자를 더해 **라이브 스키마를 다시 올려야 한다.**
export const FREE_TRIAL_USD = 0.5;
```

- [ ] **Step 4: `lib/costs.js` 의 상한 두 값을 고치고 export 한다**

`limitTotal`·`limitProject` 를 통째로 이렇게 바꾼다(주석 포함):

```js
// 전역 — 우리 지갑의 마지막 안전핀. 30초 한 편 원가가 ~$3 이라 $20 이면 전 사용자 합계
// **여섯 편**에서 서비스가 멎는다(실제로 그 값이었다). 프로덕션 env 에 넣는 것을 잊어도
// 곧바로 서비스가 죽지 않을 값으로 올린다 — 그래도 폭주는 여기서 멈춘다.
export function limitTotal() {
  return Number(process.env.SHOTFORM_BUDGET_TOTAL_USD ?? 300);
}

// 프로젝트 — ★ 이것은 **요금 상한이 아니라 폭주 방어**다. 요금은 크레딧이 맡는다
// (정가 + 재생성 청구). 여기서 막아야 하는 것은 파이프라인이 무한 루프에 빠져 한
// 프로젝트가 돈을 태우는 경우뿐이다.
//
// 그래서 **정상 사용을 막으면 안 된다.** 옛 값 $5 는 60초 원가(~$6.06)조차 못 견뎌
// 사장님이 100크레딧을 내고 산 영상이 중간에 죽었다. 재생성(컷당 최대 3회)까지 얹으면
// ~$24 라, 여유를 두어 $30 이다. 근거는 tests/budget-limits.test.js 가 지킨다.
export function limitProject() {
  return Number(process.env.SHOTFORM_BUDGET_PROJECT_USD ?? 30);
}
```

- [ ] **Step 5: `.env.local.example` 에 두 키를 적는다**

파일 끝에 붙인다(형식은 그 파일의 기존 항목을 따른다):

```
# 예산 안전핀(USD). 없으면 코드 기본값(전역 300 / 프로젝트 30)으로 돈다.
# 전역은 우리 지갑의 마지막 방어선이고, 프로젝트는 폭주(무한 루프) 방어다 —
# 요금 상한이 아니다. 요금은 크레딧이 맡는다.
SHOTFORM_BUDGET_TOTAL_USD=300
SHOTFORM_BUDGET_PROJECT_USD=30
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/budget-limits.test.js`
Expected: PASS

- [ ] **Step 7: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린. 상한을 올렸으므로 기존 예산 테스트가 값을 명시적으로 세우는지 확인한다 — 세우지 않고 기본값에 기대던 테스트가 있으면 **그 테스트가 env 를 직접 세우도록** 고친다(구현을 테스트에 맞추지 않는다).

- [ ] **Step 8: 커밋**

```bash
git add lib/pricing.js lib/costs.js .env.local.example tests/budget-limits.test.js
git commit -m "fix(budget): 안전핀이 가격표를 견디게 하고 체험 한도를 세운다"
```

---

### Task 2: 체험 한도를 `assertBudget` 에 태운다

**Files:**
- Modify: `lib/costs.js:101-113` (`BudgetExceeded`) · `:137-159` (`assertBudget`)
- Test: `tests/free-trial-gate.test.js` (신설)

**Interfaces:**
- Consumes: Task 1 의 `FREE_TRIAL_USD`
- Produces: `BudgetExceeded` 에 `scope === "trial"` 갈래. `assertBudget({ projectId, endpoint, amount })` 시그니처는 **안 바뀐다**.

**판정 규칙 (이 태스크의 전부)**

~~계획 시점의 규칙(폐기됨):~~

```
잔액 <= 0  이고  (그 사용자의 누적 원가 + 이번 호출 예상 원가) > FREE_TRIAL_USD  →  막는다
```

~~"크레딧을 받은 적이 있는가"가 아니라 **"지금 잔액이 있는가"** 를 본다. 그 한 줄이 세 경우를 모두 맞게 처리한다: 크레딧 있는 사람은 그냥 통과, 갓 가입한 사람은 한도까지 체험, 다 쓴 사람은 누적이 이미 한도를 넘어 자동으로 막힌다.~~

> ⚠️⚠️ **이 한 줄이 틀렸다 — 구현 중에 이 브랜치의 유일한 Critical 로 드러났다.** 위 표현은 **넷째 부류**를 빠뜨렸다: *결제했고 그 크레딧을 방금 다 쓴 사장님*. 정가는 `requireVideoCharge` 가 **시작할 때 통째로** 받아 가므로 **잔액이 정확히 0 이 되는 것이 정상 흐름**이다.
>
> ```
> 잔액 50 → requireVideoCharge(30초)가 50 을 받아감 → 잔액 0
> → 첫 컷이 fal 로 나가는 순간 balance <= 0 이라 그물에 걸림
> → 30초 한 편 원가가 $3.06 이라 컷 두 개면 이미 $0.5 를 넘는다
> ```
>
> 게다가 **탈출구가 없다** — 실패하면 `refundVideo` 가 50 을 돌려주고, 다시 돌리면 또 50 을 내고 잔액 0 이 되어 같은 자리에서 또 막힌다(**무한 루프**).

**실제 규칙 — 청구 이력과 잔액 둘을 본다:**

```
charged <= 0  이고  balance <= 0        ← 여기까지가 "체험자"의 정의
  이고 (그 사용자의 누적 원가 + 이번 호출 예상 원가) > FREE_TRIAL_USD  →  막는다
```

한 번이라도 결제했으면 체험자가 아니다. 이 **넷**이 전부 맞는다: 결제한 사장님(`charged > 0`)은 잔액 0 이어도 통과 · 크레딧을 받은 사장님(`balance > 0`)은 통과 · 갓 가입한 사장님(둘 다 0)은 한도까지 체험 · 체험분을 다 쓴 사람(둘 다 0)은 누적이 이미 한도를 넘어 막힌다. 크레딧을 다 쓴 사람의 **새 프로젝트**는 여기가 아니라 유료 입구의 `requireVideoCharge`/`NoCredits`(402)가 막는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/free-trial-gate.test.js`:

```js
// 체험 한도 — 크레딧 없이 도는 경로에 그물을 친다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";

// 원장에 원가를 꽂는다. endpoint 는 아무 것이나 좋다 — 여기서 재는 것은 합계다.
async function spend(usd) {
  // ★ 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  // `user` 로 적으면 스토어가 `actor` 로 옮겨 준다 — sumCosts({actor}) 가 그 필드를 본다
  // (lib/store/memory.js:109-113 주석 참고).
  await memoryStore.insertCost({
    request_id: `r-${Math.round(usd * 1e6)}-${Date.now()}-${Math.random()}`,
    ts: Date.now(), endpoint: "openai/gpt-4o", stage: "대본",
    user: A, project_id: null, est_cost_usd: usd, status: "done",
  });
}

const guard = () => runWithActor(A, () => assertBudget({ endpoint: "openai/gpt-4o", amount: 0 }));

describe("체험 한도", () => {
  beforeEach(() => resetMemoryStore());

  it("갓 가입한 사장님은 통과한다 — 크레딧 0 이어도 대본까지는 만들어 봐야 한다", async () => {
    await expect(guard()).resolves.toBeUndefined();
  });

  it("한도 아래면 통과한다", async () => {
    await spend(FREE_TRIAL_USD - 0.1);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("한도를 넘으면 막는다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    await expect(guard()).rejects.toThrow(BudgetExceeded);
  });

  it("막을 때 scope 가 trial 이고 문구가 크레딧을 말한다 — 잔액 부족과 다른 상황이다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    await guard().then(
      () => { throw new Error("막았어야 한다"); },
      (e) => {
        expect(e.scope).toBe("trial");
        expect(e.message).toMatch(/체험/);
        expect(e.message).toMatch(/크레딧/);
      }
    );
  });

  // ★ 돈을 낸 사장님이 이 그물에 걸리면 안 된다.
  it("크레딧이 있으면 누적이 한도를 훌쩍 넘어도 통과한다", async () => {
    // sumGrants 는 amount_credits 를 센다(lib/store/memory.js:146).
    await memoryStore.insertGrant({ user_id: A, amount_credits: 100, reason: "테스트" });
    await spend(FREE_TRIAL_USD * 10);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("남의 지출은 내 한도에 안 들어간다", async () => {
    const B = "00000000-0000-4000-8000-00000000000b";
    await memoryStore.insertCost({
      request_id: "r-other", ts: Date.now(), endpoint: "openai/gpt-4o", stage: "대본",
      user: B, project_id: null, est_cost_usd: FREE_TRIAL_USD * 5, status: "done",
    });
    await expect(guard()).resolves.toBeUndefined();
  });

  it("가짜 모드는 잴 것이 없다 — 그물을 아예 안 친다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    await expect(guard()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/free-trial-gate.test.js`
Expected: FAIL — 한도를 넘겨도 안 막는다(지금은 `balance < 0` 만 본다)

> 스토어 메서드 이름은 **`insertCost`**(원가)·**`insertGrant`**(충전)다. `addRecord` 는 `lib/costs.js` 가 감싼 이름이라 스토어에는 없다.

- [ ] **Step 3: `BudgetExceeded` 에 `trial` 갈래를 더한다**

`lib/costs.js` 의 `BudgetExceeded` 생성자 문구를 이렇게 바꾼다:

```js
export class BudgetExceeded extends Error {
  constructor(spent, limit, scope) {
    // 축마다 사장님이 할 일이 다르다 — 같은 문구를 쓰면 아무도 무엇을 해야 할지 모른다.
    //   trial : 체험분을 다 썼다 → 크레딧을 받으면 이어서 만든다
    //   user  : 크레딧 잔액이 바닥났다
    //   total·project : 우리 안전핀이다. 사장님이 할 수 있는 것이 없다
    super(
      scope === "trial"
        ? "체험으로 만들어 볼 수 있는 만큼을 다 썼어요 — 크레딧을 받으면 이어서 만들 수 있어요"
        : scope === "user"
          ? "크레딧이 모자라요 — 잔액이 바닥났어요"
          : `예산 상한($${limit})에 닿아 멈췄어요 — 지금까지 $${spent.toFixed(2)} 썼어요`
    );
    this.name = "BudgetExceeded";
    this.scope = scope; // "trial" | "user" | "total" | "project"
  }
}
```

- [ ] **Step 4: `assertBudget` 의 사용자 축에 체험 한도를 더한다**

`lib/costs.js` 의 `assertBudget` 안, 지금 `balance < 0` 을 보는 자리(사용자 축)를 이렇게 바꾼다. `import { FREE_TRIAL_USD } from "./pricing";` 를 파일 상단 import 에 더한다.

```js
  const actor = costActor();
  const { balance, charged } = await creditStateFor(actor);   // lib/charges.js — 왕복 한 번에 둘
  if (balance < 0) throw new BudgetExceeded(0, 0, "user");

  // ★ 체험 한도 — 크레딧을 안 낸 채로 도는 경로에 치는 그물이다.
  //
  // 정가는 ③목소리에서 받으므로 그 앞단계(대화·브리핑·대본)는 크레딧 0 으로도 돈다.
  // 결과를 봐야 지갑을 열기 때문에 그 자체는 의도한 것이고, 대신 누적 상한을 건다.
  //
  // ⚠️ 여기를 "지금 잔액이 있는가"(balance <= 0) **하나로** 판정하면 안 된다 — 잔액이
  // 정확히 0 인 유료 사장님이 자기가 산 영상 도중에 무한 루프로 갇힌다(위 판정 규칙 절 참고).
  // **청구 이력(charged)** 을 함께 봐야 넷이 전부 맞는다.
  if (charged <= 0 && balance <= 0) {
    const mine = (await store.sumCosts({ actor })) + cost;
    if (mine > FREE_TRIAL_USD) throw new BudgetExceeded(mine - cost, FREE_TRIAL_USD, "trial");
  }
```

> ⚠️ **위 코드 블록은 구현 결과로 고쳐 적은 것이다.** 계획 시점에는 `balanceFor(actor)` 하나로 `if (balance <= 0)` 만 보았다 — 그것이 Critical 이었다. 정본은 `lib/costs.js:196-215` 의 주석이다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/free-trial-gate.test.js`
Expected: PASS

- [ ] **Step 6: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린.

> ⚠️ 기존 파이프라인 테스트가 **크레딧 없이** fal 경로를 도는 것이 있으면 이제 `trial` 로 막힐 수 있다. 그런 테스트는 **크레딧을 넣어 주거나 가짜 모드로 돌리도록** 고친다 — 한도를 낮추거나 게이트를 우회하지 마라.

- [ ] **Step 7: 커밋**

```bash
git add lib/costs.js tests/free-trial-gate.test.js
git commit -m "feat(budget): 크레딧 없이 도는 경로에 체험 한도를 건다"
```

---

### Task 3: 예산 오류를 HTTP 응답으로 옮긴다

**Files:**
- Modify: `lib/auth/require-user.js:30-47` (`withUser`)
- Test: `tests/budget-http.test.js` (신설)

**Interfaces:**
- Consumes: Task 2 의 `BudgetExceeded`(`scope`)
- Produces: 모든 `withUser` 라우트가 `BudgetExceeded` 를 **402/503** 으로 답한다

**왜 필요한가** — 지금 `BudgetExceeded` 를 잡는 라우트가 **한 곳도 없다**(`app/` 전체 grep 결과 `NoCredits` 만 잡는다). 대본 라우트(`app/api/projects/[id]/script/route.js`)는 `generateScript` 를 그냥 부르므로, Task 2 가 붙는 순간 **한도에 걸린 사장님이 고장 화면을 본다.** 라우트마다 붙이면 새 라우트에서 또 빠뜨리므로 `withUser` 한 곳에서 옮긴다 — 이 저장소가 인가를 그렇게 다루는 것과 같은 이유다.

> ⚠️ **근거는 반증됐다(구현 중, 2026-08-12).** 원래 문구는 "**프레임워크 raw 500** 을 본다"였는데 실제로는 raw 500 이 아니다 — `lib/script-gen.js` 의 catch 세 곳이 `BudgetExceeded` 까지 삼켜 `null` 을 돌려주고, 라우트가 그 `null` 을 보고 **502 "대본을 만들지 못했어요"** 를 낸다. **결론(402 로 옮긴다)은 그대로**지만 처방이 하나 늘었다: `withUser` 만으로는 부족하고 **오류를 삼키는 catch 들이 `BudgetExceeded` 만은 다시 던지게** 해야 한다(실제로 고친 자리 여덟 — `lib/script-gen.js` 셋 · `lib/briefing-extract.js` 하나 · 라우트 넷).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/budget-http.test.js`:

```js
// 예산 오류가 프레임워크 500 으로 새면 사장님은 "왜 안 되지"만 본다.
// withUser 한 곳에서 옮긴다 — 라우트마다 붙이면 새 라우트에서 또 빠뜨린다.
import { describe, it, expect } from "vitest";
import { withUser } from "../lib/auth/require-user.js";
import { BudgetExceeded } from "../lib/costs.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const req = () =>
  new Request("http://localhost/api/x", {
    headers: {
      [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
      [STATUS_HEADER]: "approved",
      [ROLE_HEADER]: "user",
    },
  });

const throwing = (scope) =>
  withUser(async () => { throw new BudgetExceeded(1, 2, scope); });

describe("withUser 가 예산 오류를 옮긴다", () => {
  it("체험 한도는 402 다 — 사장님이 할 일이 있다(크레딧 받기)", async () => {
    const res = await throwing("trial")(req(), {});
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/체험/);
  });

  it("잔액 부족도 402 다", async () => {
    expect((await throwing("user")(req(), {})).status).toBe(402);
  });

  // 전역·프로젝트 상한은 우리 안전핀이다 — 사장님 잘못이 아니니 402 로 말하면 안 된다.
  it("우리 안전핀은 503 이다", async () => {
    expect((await throwing("total")(req(), {})).status).toBe(503);
    expect((await throwing("project")(req(), {})).status).toBe(503);
  });

  it("예산과 무관한 오류는 그대로 던진다 — 조용히 402 로 뭉개지 않는다", async () => {
    const boom = withUser(async () => { throw new Error("펑"); });
    await expect(boom(req(), {})).rejects.toThrow("펑");
  });

  it("정상 응답은 그대로 지나간다", async () => {
    const ok = withUser(async () => Response.json({ ok: true }));
    expect((await ok(req(), {})).status).toBe(200);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/budget-http.test.js`
Expected: FAIL — `BudgetExceeded` 가 그대로 던져진다(응답이 안 나온다)

- [ ] **Step 3: `withUser` 가 옮긴다**

`lib/auth/require-user.js` 상단에 `import { BudgetExceeded } from "../costs.js";` 를 더하고, 마지막 `return runWithActor(...)` 를 이렇게 바꾼다:

```js
    // ★ 예산·체험 오류는 사장님에게 보여줄 답이 있는 실패다 — 프레임워크 500 으로 흘리면
    // "왜 안 되지"만 남는다. 라우트마다 붙이면 새 라우트에서 또 빠뜨리므로 여기서 옮긴다
    // (인가를 이 파일에서 다루는 것과 같은 이유다).
    //
    // 축에 따라 코드가 다르다: 사장님이 할 일이 있으면 402, 우리 안전핀이면 503 이다.
    // 예산과 무관한 오류는 **그대로 던진다** — 여기서 삼키면 진짜 사고가 402 로 뭉개진다.
    try {
      return await runWithActor(user.id, () => handler(req, ctx, user));
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        console.error("예산 가드:", e.scope, e.message);
        const ours = e.scope === "total" || e.scope === "project";
        return Response.json({ error: e.message }, { status: ours ? 503 : 402 });
      }
      throw e;
    }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/budget-http.test.js`
Expected: PASS

- [ ] **Step 5: 순환 import 가 없는지 확인한다**

Run: `npx vitest run`
Expected: 전부 그린. `lib/costs.js` 는 `lib/auth/require-user.js` 를 import 하지 않으므로 순환이 생기지 않는다 — 그린이면 확인된 것이다.

- [ ] **Step 6: 커밋**

```bash
git add lib/auth/require-user.js tests/budget-http.test.js
git commit -m "fix(budget): 예산 오류를 402·503 으로 옮긴다 — 지금은 아무도 안 잡는다"
```

---

### Task 4: `lib/llm.js` 가 한도를 본다

**Files:**
- Modify: `lib/llm.js:33-37` (`callJson` 초입)
- Test: `tests/llm-gate.test.js` (신설)

**Interfaces:**
- Consumes: Task 2 의 `assertBudget`
- Produces: 없음(기존 `callJson` 시그니처 그대로)

**★ 예상 원가는 0 으로 넘긴다.** fal 은 나가기 전에 값을 알지만 LLM 은 **토큰 수를 호출한 뒤에야 안다**(`estimateLlmCost` 가 `data.usage` 를 받는다 — `lib/llm.js:61`). 없는 숫자를 지어내지 않고 **"이미 넘었는가"만** 판정한다. 넘침은 최대 한 번(~$0.02)이고 그 한 번은 원장에 남아 다음 호출이 막는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/llm-gate.test.js`:

```js
// LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(addRecord) 한도를 안 봤다.
// 그래서 [대본 다시 쓰기] 를 계속 눌러도 청구가 0 이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { callJson } from "../lib/llm.js";
import { BudgetExceeded } from "../lib/costs.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";

async function spend(usd) {
  // 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  await memoryStore.insertCost({
    request_id: `r-${Date.now()}-${Math.random()}`, ts: Date.now(),
    endpoint: "openai/gpt-4o", stage: "대본", user: A, project_id: null,
    est_cost_usd: usd, status: "done",
  });
}

const okFetch = () =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 10 },
      choices: [{ message: { content: '{"ok":true}' } }],
    }),
  }));

const call = (fetchImpl) =>
  runWithActor(A, () =>
    callJson({ system: "s", messages: [{ role: "user", content: "m" }], fetchImpl, apiKey: "k" })
  );

describe("callJson 이 한도를 본다", () => {
  beforeEach(() => resetMemoryStore());

  it("한도 아래면 부른다", async () => {
    const f = okFetch();
    await expect(call(f)).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalled();
  });

  // ★ 막는 것이 기록보다 먼저다 — 돈이 나간 뒤에 막으면 막은 것이 아니다.
  it("한도를 넘으면 OpenAI 를 **안 부른다**", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    const f = okFetch();
    await expect(call(f)).rejects.toThrow(BudgetExceeded);
    expect(f).not.toHaveBeenCalled();
  });

  it("가짜 모드는 한도와 무관하게 돈다 — 0 원이라 잴 것이 없다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    const f = okFetch();
    await expect(call(f)).resolves.toBeTruthy();
    expect(f).not.toHaveBeenCalled();   // 가짜 응답이라 fetch 자체가 없다
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/llm-gate.test.js`
Expected: FAIL — 한도를 넘겨도 `fetchImpl` 이 불린다

- [ ] **Step 3: `callJson` 초입에 게이트를 더한다**

`lib/llm.js` 상단 import 에 `assertBudget` 을 더하고(`import { addRecord, assertBudget, costActor, estimateLlmCost } from "./costs";`), 가짜 판정 **뒤**·키 검사 **뒤**에 넣는다:

```js
  // 키 검사보다 먼저 본다 — 완전 가짜 모드는 API 키 없이도 돌아야 한다
  if (fakeLlm()) return fakeResponse();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");

  // ★ 오랫동안 LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(아래 addRecord) 한도를
  // 안 봤다. 그래서 크레딧 0 인 채로 [대본 다시 쓰기] 를 무한히 누를 수 있었다.
  //
  // ★ amount 는 0 이다. fal 은 나가기 전에 값을 알지만 LLM 은 토큰 수를 **호출한 뒤에야**
  // 안다(estimateLlmCost 가 usage 를 받는다). 없는 숫자를 지어내지 않고 "이미 넘었는가"만
  // 판정한다 — 넘침은 최대 한 번이고, 그 한 번은 원장에 남아 다음 호출이 막는다.
  await assertBudget({ projectId, endpoint: "openai/gpt-4o", amount: 0 });
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/llm-gate.test.js`
Expected: PASS

- [ ] **Step 5: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린.

> ⚠️ `callJson` 을 부르는 기존 테스트가 **actor 컨텍스트 없이** 도는 것이 있으면 `costActor()` 가 던진다. 그런 테스트는 `runWithActor(...)` 로 감싸거나 가짜 모드로 돌린다 — 게이트를 우회하지 마라.

- [ ] **Step 6: 커밋**

```bash
git add lib/llm.js tests/llm-gate.test.js
git commit -m "fix(budget): 대본·컷·브리핑이 예산 그물 안으로 들어온다"
```

---

### Task 5: `/api/chat` 이 기록하고 한도를 본다

**Files:**
- Modify: `app/api/chat/route.js:43-50`(초입) · `:63-82`(fetch 루프)
- Test: `tests/chat-ledger.test.js` (신설)

**Interfaces:**
- Consumes: Task 2 의 `assertBudget` · 기존 `addRecord`·`costActor`·`estimateLlmCost`(`lib/costs.js`)
- Produces: 없음

**왜 이 라우트만 따로인가** — 이 라우트는 `lib/llm.js` 를 **안 거치고** OpenAI 를 raw fetch 로 부른다(`:65`). 그래서 이 지출은 **원장에 아예 안 남는다** — 우리 `/costs` 화면에 존재하지 않는 유일한 지출이다. 구조를 `lib/llm.js` 로 합치는 것은 응답 모양이 달라 이번 범위 밖이다.

> ⚠️ 이 라우트는 **가짜 모드가 안 먹는다**(raw fetch). 테스트·데모 중에도 진짜 돈이 나간다. 이번 작업은 그것을 고치지 않는다 — 다만 기록이 붙으면 최소한 **보이기는** 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/chat-ledger.test.js`:

```js
// /api/chat 은 lib/llm.js 를 안 거치고 OpenAI 를 직접 부른다 — 그래서 이 지출만
// 원장에 안 남았다. 우리 비용 화면에 존재하지 않는 유일한 지출이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";
const { POST } = await import("../app/api/chat/route.js");

const req = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "me", text: "안녕" }] }),
  });

async function spend(usd) {
  // 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  await memoryStore.insertCost({
    request_id: `r-${Date.now()}-${Math.random()}`, ts: Date.now(),
    endpoint: "openai/gpt-4o", stage: "대화", user: A, project_id: null,
    est_cost_usd: usd, status: "done",
  });
}

const okBody = {
  model: "gpt-4o",
  usage: { prompt_tokens: 100, completion_tokens: 50 },
  choices: [{ message: { content: '{"action":"ask","say":"네"}' } }],
};

describe("POST /api/chat", () => {
  beforeEach(() => {
    resetMemoryStore();
    vi.unstubAllGlobals();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  it("부른 값을 원장에 남긴다 — 안 남기면 우리 비용 화면에서 안 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => okBody })));
    const res = await POST(req(), {});
    expect(res.status).toBe(200);
    // 스토어의 읽기 메서드는 allCosts 다. 사용자 필드는 `actor` 로 저장된다.
    const rows = await memoryStore.allCosts();
    const mine = rows.filter((r) => r.actor === A);
    expect(mine).toHaveLength(1);
    expect(mine[0].endpoint).toMatch(/gpt-4o/);
    expect(mine[0].est_cost_usd).toBeGreaterThan(0);
  });

  // ★ 막는 것이 부르는 것보다 먼저다.
  it("한도를 넘으면 OpenAI 를 안 부르고 402 다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    const f = vi.fn(async () => ({ ok: true, json: async () => okBody }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req(), {});
    expect(res.status).toBe(402);
    expect(f).not.toHaveBeenCalled();
  });

  it("응답에도 서버 로그에도 API 키가 없다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })));
    const body = await (await POST(req(), {})).text();
    expect(body).not.toContain("test-key");
    expect(spy.mock.calls.flat().map(String).join(" ")).not.toContain("test-key");
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/chat-ledger.test.js`
Expected: FAIL — 원장에 아무것도 안 남고, 한도를 넘겨도 fetch 가 불린다

> 원장 읽기는 `memoryStore.allCosts()` 이고 사용자 필드는 `actor` 다 — `insertCost` 가 `user` 를 `actor` 로 옮긴다(`lib/store/memory.js:109-113`).

- [ ] **Step 3: 게이트와 기록을 붙인다**

`app/api/chat/route.js` 상단 import 에 더한다:

```js
import { addRecord, assertBudget, costActor, estimateLlmCost } from "../../../lib/costs";
import { randomUUID } from "crypto";
```

API 키 검사 **뒤**, 몸통 파싱 **앞**에 게이트를 넣는다:

```js
  // ★ 이 라우트는 lib/llm.js 를 안 거치고 OpenAI 를 직접 부른다 — 그래서 오랫동안
  // 한도도 기록도 없었다. 승인만 받으면 크레딧 0 으로 gpt-4o 를 무한히 태울 수 있었고,
  // 그 지출은 우리 비용 화면에 **보이지도 않았다.**
  //
  // amount 는 0 이다 — 토큰 수는 호출한 뒤에야 안다(lib/llm.js 와 같은 이유).
  await assertBudget({ endpoint: "openai/gpt-4o", amount: 0 });
```

그리고 응답을 받은 뒤(`const data = await res.json();` 자리, 파싱 **앞**) 기록을 남긴다:

```js
    // 파싱에 실패해 재시도하더라도 부른 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    // (lib/llm.js 와 같은 규칙).
    const model = data?.model || "gpt-4o";
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${model}`,
      stage: "대화", user: costActor(), project_id: null,
      prompt: "", duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
```

> `prompt` 를 빈 문자열로 두는 이유: 대화 내용은 사장님이 쓴 글이라 원장에 통째로 남길 이유가 없다. `lib/llm.js` 는 시스템 프롬프트 앞 300자를 남기는데, 여기서는 첫 메시지가 **사장님의 말**이다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/chat-ledger.test.js`
Expected: PASS

- [ ] **Step 5: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린.

- [ ] **Step 6: 커밋**

```bash
git add app/api/chat/route.js tests/chat-ledger.test.js
git commit -m "fix(budget): 대화가 원장에 남고 한도를 본다 — 보이지 않던 유일한 지출"
```

---

### Task 6: 정가를 낸 뒤 길이를 못 바꾸게 한다

**Files:**
- Modify: `app/api/projects/[id]/route.js:37-50` (검증 자리)
- Test: `tests/project-settings-guard.test.js` (신설)

**Interfaces:**
- Consumes: `TARGET_CHOICES`(`lib/script.js`) · `alreadyChargedVideo(projectId)`(`lib/charges.js:62`)
- Produces: 없음

**두 겹이다.** 값 검증은 만들 때 이미 한다(`app/api/projects/route.js:20`) — **고칠 때만 빠져 있다.** 그리고 정가가 길이에 묶여 있으므로(`VIDEO_PRICE`) 결제 후 변경은 거부한다.

**검증 자리** — 기존 검증들과 같이 **락을 잡기 전**에 둔다. `app/api/projects/[id]/route.js:37-38` 주석이 이유를 적어 두었다: 락 안(`updateProject` 의 patchFn)에서 던지면 "프로젝트가 없다"는 404 로 잘못 보고된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/project-settings-guard.test.js`:

```js
// 정가는 길이에 묶여 있다(VIDEO_PRICE). 만들 때는 길이를 검증하는데 고칠 때는 안 봐서,
// 15초로 25크레딧 낸 뒤 60초로 고치면 추가 청구가 0 이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const A = "00000000-0000-4000-8000-00000000000a";
const P = "p-1";

const { PATCH } = await import("../app/api/projects/[id]/route.js");

const req = (settings) =>
  new Request(`http://localhost/api/projects/${P}`, {
    method: "PATCH",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ settings }),
  });
const ctx = () => ({ params: Promise.resolve({ id: P }) });

async function seedProject() {
  await memoryStore.insertProject(
    { id: P, created_ts: 1, status: "draft", settings: { target_seconds: 15 } },
    A
  );
}

describe("PATCH /api/projects/[id] — 길이", () => {
  beforeEach(async () => { resetMemoryStore(); await seedProject(); });

  it("결제 전에는 목록 안의 값으로 바꿀 수 있다", async () => {
    expect((await PATCH(req({ target_seconds: 30 }), ctx())).status).toBe(200);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(30);
  });

  it("목록 밖 값은 400 이고 저장되지 않는다", async () => {
    expect((await PATCH(req({ target_seconds: 37 }), ctx())).status).toBe(400);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  // ★ 이 태스크의 존재 이유.
  it("정가를 낸 뒤에는 길이를 못 바꾼다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    const res = await PATCH(req({ target_seconds: 60 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/바꿀 수 없어요/);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  it("결제해도 같은 길이를 다시 보내는 것은 막지 않는다 — 다른 설정을 고치는 정상 저장이다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    expect((await PATCH(req({ target_seconds: 15 }), ctx())).status).toBe(200);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/project-settings-guard.test.js`
Expected: FAIL — 목록 밖 값도 통과하고, 결제 후에도 바뀐다

> `insertCharge` 는 `idem_key` 가 이미 있으면 `false` 를 돌려주고 안 쓴다(이중 청구 방어, `lib/store/memory.js:167`). 위 행은 `alreadyChargedVideo(P)` 가 참이 되게 하는 최소 형태다 — 환불 행(`refund:<id>:1`)이 없으므로 "살아 있는 청구"로 잡힌다.

- [ ] **Step 3: 검증을 더한다**

`app/api/projects/[id]/route.js` 상단 import 에 더한다:

```js
import { TARGET_CHOICES } from "../../../../lib/script";
import { alreadyChargedVideo } from "../../../../lib/charges.js";
```

기존 `aspect_ratio` 검증 **바로 아래**(락 잡기 전)에 넣는다:

```js
  // ★ 길이는 정가를 정한다(lib/pricing.js 의 VIDEO_PRICE). 만들 때는 검증하는데
  // (app/api/projects/route.js) 고칠 때는 안 봐서, 15초로 25크레딧 낸 뒤 60초로 고치면
  // 추가 청구가 0 이었다. 두 겹으로 막는다 — 아는 값인가, 그리고 이미 팔았는가.
  if (body.settings?.target_seconds !== undefined) {
    if (!TARGET_CHOICES.includes(body.settings.target_seconds)) {
      return Response.json({ error: "그 길이는 몰라요" }, { status: 400 });
    }
    // 정가를 낸 뒤 길이를 바꾸면 낸 값과 만드는 값이 어긋난다. 차액 청구는 만들지 않았다
    // (청구 장부가 회차·멱등키 기반이라 차액 개념이 없다) — 그래서 못 바꾸게 한다.
    // 같은 값을 다시 보내는 것은 막지 않는다: 다른 설정을 고치는 정상 저장이다.
    const project = await getProject(id, user.id);
    if (
      project &&
      body.settings.target_seconds !== project.settings?.target_seconds &&
      (await alreadyChargedVideo(id))
    ) {
      return Response.json(
        { error: "이미 결제된 영상은 길이를 바꿀 수 없어요 — 새로 만들어 주세요" },
        { status: 400 }
      );
    }
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/project-settings-guard.test.js`
Expected: PASS

- [ ] **Step 5: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린.

- [ ] **Step 6: 커밋**

```bash
git add app/api/projects/[id]/route.js tests/project-settings-guard.test.js
git commit -m "fix(billing): 정가를 낸 뒤 길이를 못 바꾸게 한다"
```

---

### Task 7: 라이브로 한 번 밟는다

**Files:** 없음(검증 전용). 결함을 찾으면 그 자리에서 보고하고 고친다.

**왜 필요한가** — 이 브랜치의 앞선 작업에서 **모킹 테스트 1234개가 전부 그린인데 실물이 틀린** 일이 있었다(비밀번호 변경의 세션 무효화가 매번 실패했다). 돈이 걸린 변경은 실물을 한 번 부르는 것으로만 확인된다.

- [ ] **Step 1: 우회 없는 서버를 띄운다**

**bash 로** 띄운다 — PowerShell 의 `$env:X=""` 는 변수를 **삭제**해 `.env.local` 값이 되살아난다:

```bash
export SHOTFORM_DEV_USER="" && export SHOTFORM_DIST_DIR=".next-billing" && npx next dev -p 3025
```

⚠️ 서버가 살아 있는 채로 그 서버의 `.next*` 를 지우지 마라(빌드 매니페스트가 사라져 500 이 난다).

- [ ] **Step 2: 크레딧 0 인 계정으로 체험 한도를 확인한다**

검증 계정(승인됨·크레딧 0): `flow-0807@fix-up.kr` / `new-pass-0807`
⚠️ 비밀번호를 바꾸게 되면 **바꾼 값을 보고서에 반드시 적어라.**

- 대화를 몇 번 주고받는다 → **`/costs` 원장에 "대화" 가 쌓이는지** 확인한다(이번 작업 전에는 한 줄도 안 남았다).
- 한도($0.50)에 닿을 때까지 대본을 반복 생성한다 → **402 와 "체험으로 만들어 볼 수 있는 만큼을 다 썼어요" 문구**가 뜨는지 확인한다. 500·**502 "대본을 만들지 못했어요"** 가 뜨면 Task 3 이 안 먹은 것이다(502 는 `script-gen` 의 catch 가 예산 오류를 삼킨 모양이다).

- [ ] **Step 3: 크레딧을 넣으면 풀리는지 확인한다**

운영자 화면(포트 3000, dev 우회)의 `/admin` → [크레딧 넣기] 로 그 계정에 크레딧을 넣는다.
→ 같은 계정에서 대본이 **다시 되는지** 확인한다. 안 되면 판정 조건(`charged <= 0 && balance <= 0`)이 잘못 걸린 것이다.

- [ ] **Step 4: 길이 잠금을 확인한다**

크레딧을 넣은 그 계정으로 15초 프로젝트를 만들고 ③목소리까지 진행해 정가를 낸 뒤,
설정에서 길이를 60초로 바꿔 본다 → **"이미 결제된 영상은 길이를 바꿀 수 없어요"** 가 떠야 한다.

- [ ] **Step 5: 정리한다**

서버를 끄고 `.next-billing` 을 지운다.

- [ ] **Step 6: 보고서에 실측을 적는다**

무엇을 보았는지, 서버 로그에 무엇이 남았는지, 바꾼 비밀번호가 있으면 그 값을 적는다.

---

## 라이브 반영 (구현 뒤, 사용자 요청이 있을 때만)

- **스키마 변경이 없다.** 이 계획은 `db/schema.sql` 을 건드리지 않는다 — "누적 한도"를 고른 이유다.
- **프로덕션 env 에 `SHOTFORM_BUDGET_TOTAL_USD`·`SHOTFORM_BUDGET_PROJECT_USD` 를 넣을지 정한다.** 안 넣으면 코드 기본값(300/30)으로 돈다 — 이제 그 값이 서비스를 죽이지는 않는다.
- **커밋·푸시(=배포)는 자동으로 하지 않는다.** 사용자가 요청할 때만.
