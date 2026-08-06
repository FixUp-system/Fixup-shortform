# 크레딧 가격표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크레딧을 실비용 연동에서 **길이별 정가 가격표**로 바꾼다 — 사장님이 누르기 전에 얼마가 나가는지 안다.

**Architecture:** 청구와 원가를 **다른 장부**로 가른다. `credit_charges`(크레딧, 프로젝트·행위 단위)가 새로 생기고 `cost_records`(USD, fal 호출 단위)는 무수정으로 남는다. 잔액 = `sum_grants − sum_charges`(둘 다 크레딧). 모든 가격 숫자는 `lib/pricing.js` 한 곳에 있다.

**Tech Stack:** Next.js 15 (App Router, JS), Vitest 4, Supabase Postgres(테스트는 메모리 스토어).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-06-credit-pricing-design.md`
- **가격 숫자는 `lib/pricing.js` 밖에 두지 않는다** — 값이 바뀔 것을 전제로 한 설계다
- **합계는 SQL 함수가 낸다**(`sum_charges`·`sum_grants`) — 앱에서 행을 더하면 PostgREST 행 상한(1000)에 걸려 조용히 틀린다
- `cost_records` 는 **무수정**(USD 원가 장부 그대로). `lib/i2v.js`·`lib/imagegen.js`·`lib/tts.js` 도 무수정
- 전역(`SHOTFORM_BUDGET_TOTAL_USD`)·프로젝트(`SHOTFORM_BUDGET_PROJECT_USD`) USD 상한은 **회사 안전핀으로 그대로**
- 청구는 **유료 흐름이 시작되기 전에**. 환불은 삭제가 아니라 **음수 행**
- `idem_key` 규약: 영상 `video:<project_id>` · 재생성 `regen_<kind>:<project_id>:<idx>:<회차>`
- 가짜 모드(`fakeFal()`)에서는 청구도 게이트도 없다
- 런타임 의존성 추가 금지, UI·메시지·주석 전부 한국어
- `npx vitest run` 전체 그린 유지. 커밋은 태스크마다. 커밋 전 `git branch --show-current` 로 `feature/video-compose` 확인, `git add` 는 명시 경로만
- ⚠️ 3000·3001 포트에 사용자 서버가 떠 있다. 빌드가 필요하면 `next.config.mjs` 의 기존 `SHOTFORM_DIST_DIR` 스위치를 쓰고 그 파일은 **커밋하지 마라**

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `lib/pricing.js` | 가격표(길이별·재생성별)·기본 지급값. 순수 데이터 |
| Create `lib/charges.js` | 청구·환불·잔액. `chargeVideo`·`chargeRegen`·`refundVideo`·`balanceFor` |
| Modify `db/schema.sql` | `credit_charges` + `sum_charges()` + `credit_grants.amount_usd → amount_credits` + `sum_grants` 갱신 |
| Modify `lib/store/{memory,supabase}.js` | `insertCharge`·`sumCharges`·`listCharges` 추가, grants 열 이름 변경 반영 |
| Delete `lib/credits.js` | `lib/charges.js` 로 대체(perVideoUsd·videosLeft 는 사라진다) |
| Modify `lib/costs.js` | 사용자 축을 "잔액 > 0" 으로 |
| Modify `app/api/projects/[id]/auto/route.js` | 정가 청구 + 실패 시 환불 배선 |
| Modify `app/api/projects/[id]/images/route.js` | 정가 청구(이미 샀으면 건너뜀) |
| Modify `.../clips/route.js` | 남은컷×단가 하한 **제거**(정가에 포함) |
| Modify regen 3종 route.js | 회차 보고 2회째부터 정가 청구 |
| Modify `app/api/credits/route.js` | 응답을 크레딧 기준으로 |
| Modify `app/api/admin/users/[id]/credits/route.js` · `route.js` | 충전 단위를 크레딧으로 |
| Modify `components/Sidebar.jsx`·`QuickCreate.jsx`·`app/admin/page.js` | 표시를 크레딧으로 |
| Modify `app/create/[id]/images/page.js` + regen 버튼 화면들 | 정가 표기 |
| Test | `tests/pricing.test.js`·`tests/charges.test.js`·`tests/charge-routes.test.js`·`tests/credits-ui.test.js`(개정) |

---

### Task 1: `lib/pricing.js` — 가격표

**Files:**
- Create: `lib/pricing.js`
- Test: `tests/pricing.test.js`

**Interfaces:**
- Consumes: `TARGET_CHOICES`(lib/script.js, `[15,30,45,60]`)
- Produces: `VIDEO_PRICE` · `REGEN_PRICE` · `FREE_REGEN_PER_CUT` · `DEFAULT_GRANT` · `videoPrice(seconds) → number` · `regenPrice(kind, priorCount) → number`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/pricing.test.js`:

```js
// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";

describe("가격표", () => {
  it("고를 수 있는 길이 전부에 값이 있다", () => {
    for (const s of TARGET_CHOICES) {
      expect(typeof VIDEO_PRICE[s]).toBe("number");
      expect(VIDEO_PRICE[s]).toBeGreaterThan(0);
    }
  });

  it("길이에 비례한다 — 원가가 컷 수에 비례하기 때문이다", () => {
    expect(VIDEO_PRICE[30]).toBeGreaterThan(VIDEO_PRICE[15]);
    expect(VIDEO_PRICE[60]).toBeGreaterThan(VIDEO_PRICE[45]);
  });

  it("videoPrice 는 목록 밖 값을 기본 길이(30초) 값으로 받는다", () => {
    expect(videoPrice(30)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(null)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(7)).toBe(VIDEO_PRICE[30]);
  });

  it("컷당 첫 재생성은 공짜, 그 뒤는 정가", () => {
    expect(FREE_REGEN_PER_CUT).toBe(1);
    expect(regenPrice("image", 0)).toBe(0);
    expect(regenPrice("image", 1)).toBe(REGEN_PRICE.image);
    expect(regenPrice("clip", 2)).toBe(REGEN_PRICE.clip);
    expect(regenPrice("voice", 1)).toBe(REGEN_PRICE.voice);
  });

  it("모르는 재생성 종류는 0 이 아니라 던진다 — 조용히 공짜가 되면 안 된다", () => {
    expect(() => regenPrice("사진", 1)).toThrow();
  });

  it("클립 재생성이 이미지보다 비싸다 — 실측 원가가 그렇다($0.42 대 $0.08)", () => {
    expect(REGEN_PRICE.clip).toBeGreaterThan(REGEN_PRICE.image);
  });

  it("기본 지급값이 30초 몇 편치는 된다", () => {
    expect(DEFAULT_GRANT).toBeGreaterThanOrEqual(VIDEO_PRICE[30] * 2);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/pricing.test.js` / Expected: FAIL — `lib/pricing.js` 없음

- [ ] **Step 3: 구현** — `lib/pricing.js`:

```js
// 크레딧 가격표 — 이 파일이 유일한 진실의 원천이다.
//
// 값은 2026-08-06 실측 원가(원장 63건, 전부 진짜 지출)에서 뽑았다:
//   클립 $0.420/컷 · 이미지 $0.080/컷 · 나머지(LLM) 편당 ~$0.06
//   → 편당 원가 ≈ $0.06 + 컷당 $0.50 × 컷 수. 30초(6컷) ≈ $3.06
// 1크레딧 ≈ $0.06 원가로 잡아 30초 = 50 크레딧. 마진은 없다 —
// 지금 크레딧은 사실상 사용 한도이고, 판매가는 결제를 붙일 때 정한다.
//
// ★ 이 값들은 바뀐다. 바뀔 때 고칠 자리가 여기 하나여야 한다 —
//   가격 숫자를 라우트·화면에 흘리지 마라.

// 목표 길이(초) → 크레딧. 원가가 길이(=컷 수)에 비례하므로 가격도 그렇다.
export const VIDEO_PRICE = { 15: 25, 30: 50, 45: 75, 60: 100 };

// 컷 하나를 다시 만들 때. 실측 원가 이미지 $0.08 · 클립 $0.42 · 목소리 $0.002 를 올림했다.
export const REGEN_PRICE = { image: 2, clip: 8, voice: 1 };

// 컷마다 이만큼은 공짜다 — "한 번은 다시 해 볼 수 있게".
export const FREE_REGEN_PER_CUT = 1;

// 백오피스 [크레딧 넣기] 의 기본값(운영자가 고칠 수 있다).
export const DEFAULT_GRANT = 500;

// 길이를 모르거나 목록 밖이면 30초 값으로 본다 — 프로젝트의 target_seconds 는
// null 일 수 있고(사장님이 안 고른 경우) 그때 실제로 만들어지는 분량이 그 언저리다.
export function videoPrice(seconds) {
  const p = VIDEO_PRICE[Number(seconds)];
  return typeof p === "number" ? p : VIDEO_PRICE[30];
}

// priorCount = 이 컷에서 이미 한 재생성 횟수. 0 이면 첫 번째라 공짜다.
// 모르는 종류는 던진다 — 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다.
export function regenPrice(kind, priorCount) {
  const p = REGEN_PRICE[kind];
  if (typeof p !== "number") throw new Error(`모르는 재생성 종류: ${kind}`);
  return Number(priorCount) >= FREE_REGEN_PER_CUT ? p : 0;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/pricing.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/pricing.js tests/pricing.test.js && git commit -m "feat: 크레딧 가격표 — 길이별 정가, 값이 바뀔 자리를 한 곳으로"`

---

### Task 2: 저장 계층 — `credit_charges` 와 grants 단위 변경

**Files:**
- Modify: `db/schema.sql`
- Modify: `lib/store/memory.js` · `lib/store/supabase.js`
- Test: `tests/charges.test.js` (신규, describe "스토어 — 청구 장부")

**Interfaces:**
- Consumes: 없음
- Produces: 두 스토어가 같은 계약 —
  - `insertCharge({ user_id, project_id, kind, credits, idem_key }) → Promise<boolean>` (idem_key 가 이미 있으면 **쓰지 않고 false**, 새로 썼으면 true)
  - `sumCharges(userId) → Promise<number>`
  - `listCharges(userId) → Promise<행 배열>` (최신 우선)
  - `findCharge(idemKey) → Promise<행|null>`
  - 기존 `sumGrants(userId)` 는 그대로 쓰되 **크레딧 단위**를 센다. `insertGrant` 는 `{ user_id, amount_credits, reason, granted_by }` 를 받는다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/charges.test.js`:

```js
// 청구 장부 — 잔액의 한쪽이다(다른 쪽은 충전).
// cost_records(USD 원가)와 **다른 장부**다: 알갱이가 프로젝트·행위 단위다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const P = "00000000-0000-4000-8000-0000000000p1".replace("p1", "0f1");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

describe("스토어 — 청구 장부", () => {
  beforeEach(() => resetMemoryStore());

  it("청구가 없으면 합계는 0", async () => {
    expect(await getStore().sumCharges(A)).toBe(0);
  });

  it("청구를 더해서 돌려준다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    await s.insertCharge({ user_id: A, project_id: P, kind: "regen_clip", credits: 8, idem_key: `regen_clip:${P}:0:1` });
    expect(await s.sumCharges(A)).toBe(58);
  });

  it("같은 idem_key 는 두 번 쓰지 않는다 — 이중 청구 방어선", async () => {
    const s = getStore();
    expect(await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` })).toBe(true);
    expect(await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` })).toBe(false);
    expect(await s.sumCharges(A)).toBe(50);
  });

  it("환불은 음수 행이다 — 장부를 지우지 않는다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    await s.insertCharge({ user_id: A, project_id: P, kind: "refund", credits: -50, idem_key: `refund:${P}` });
    expect(await s.sumCharges(A)).toBe(0);
    expect((await s.listCharges(A)).length).toBe(2);
  });

  it("남의 청구는 안 센다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: B, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    expect(await s.sumCharges(A)).toBe(0);
  });

  it("findCharge 로 이미 산 것을 알아본다", async () => {
    const s = getStore();
    expect(await s.findCharge(`video:${P}`)).toBeNull();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    expect((await s.findCharge(`video:${P}`)).credits).toBe(50);
  });

  it("충전은 크레딧 단위다", async () => {
    const s = getStore();
    await s.insertGrant({ user_id: A, amount_credits: 500, reason: "체험", granted_by: ADMIN });
    expect(await s.sumGrants(A)).toBe(500);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/charges.test.js` / Expected: FAIL — `store.sumCharges is not a function`

- [ ] **Step 3: 구현** — `db/schema.sql` 의 크레딧 절을 다음으로 교체(기존 `credit_grants` 블록·`sum_grants` 함수를 이 내용으로 바꾼다):

```sql
-- ── 크레딧 ──────────────────────────────────────────────────────────────
-- 장부가 둘이다. 알갱이가 다르기 때문이다:
--   cost_records  = 우리가 쓴 돈(USD, fal 호출 단위)   ← 회계
--   credit_charges= 사장님이 낸 값(크레딧, 행위 단위)  ← 청구
-- 잔액 = sum_grants - sum_charges (둘 다 크레딧이라 단위가 안 섞인다).
create table if not exists credit_grants (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  amount_credits numeric not null,        -- 양수=충전, 음수=회수(운영자 정정)
  reason         text not null,
  granted_by     uuid not null,
  created_at     timestamptz not null default now()
);
create index if not exists credit_grants_user on credit_grants (user_id);

create table if not exists credit_charges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid,
  kind        text not null,             -- video | regen_image | regen_clip | regen_voice | refund
  credits     numeric not null,          -- 양수=청구, 음수=환불
  idem_key    text not null unique,      -- 같은 청구를 두 번 하지 않는다
  created_at  timestamptz not null default now()
);
create index if not exists credit_charges_user on credit_charges (user_id);

-- 합계는 DB 가 낸다. 앱에서 행을 받아 더하면 PostgREST 행 상한(1000)에 걸려
-- 조용히 일부만 더한다 — 잔액이 부풀어 없는 크레딧이 생긴다.
create or replace function sum_grants(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(amount_credits), 0) from credit_grants where user_id = p_user_id;
$$;

create or replace function sum_charges(p_user_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(credits), 0) from credit_charges where user_id = p_user_id;
$$;

alter table credit_grants  enable row level security;  -- 정책 0개 = 전부 거부(앱은 service_role)
alter table credit_charges enable row level security;
```

⚠️ **열 이름이 바뀐다**(`amount_usd` → `amount_credits`). `db/schema.sql` 은 재적용 안전해야 하므로 위 `create table if not exists` 는 **이미 있는 테이블을 바꾸지 못한다.** 그래서 파일 끝에 이관 블록을 덧붙인다:

```sql
-- 옛 열 이름 이관(2026-08-06). 있으면 바꾸고, 이미 새 이름이면 아무 일도 안 한다.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='credit_grants' and column_name='amount_usd') then
    alter table credit_grants rename column amount_usd to amount_credits;
  end if;
end $$;
```

`lib/store/memory.js` — grants 배열 옆에 `const charges = []` 를 두고(`resetMemoryStore` 가 비우게), 메서드 추가:

```js
  // ── 크레딧 청구 장부 ────────────────────────────────────────
  async insertCharge(row) {
    if (charges.some((c) => c.idem_key === row.idem_key)) return false;  // 이중 청구 방어
    charges.push({ created_at: new Date().toISOString(), ...clone(row) });
    return true;
  },
  async sumCharges(userId) {
    return charges.reduce((s, c) => (c.user_id === userId ? s + (Number(c.credits) || 0) : s), 0);
  },
  async listCharges(userId) {
    return charges.filter((c) => c.user_id === userId).map(clone).reverse();
  },
  async findCharge(idemKey) {
    const c = charges.find((x) => x.idem_key === idemKey);
    return c ? clone(c) : null;
  },
```

`lib/store/supabase.js` — 같은 계약으로:

```js
  // ── 크레딧 청구 장부 ────────────────────────────────────────
  // 이중 청구는 unique(idem_key) 가 막는다. 앱에서 먼저 조회해 판정하지 않는 이유는
  // 조회와 삽입 사이가 열려 있기 때문이다(동시 클릭). 충돌 코드를 받아 false 로 바꾼다.
  async insertCharge(row) {
    const { error } = await db().from("credit_charges").insert(row);
    if (error) {
      if (error.code === "23505") return false;   // unique violation = 이미 청구됨
      raise(error, "크레딧 청구");
    }
    return true;
  },
  async sumCharges(userId) {
    const { data, error } = await db().rpc("sum_charges", { p_user_id: userId });
    if (error) raise(error, "청구 합계");
    const n = data == null ? NaN : Number(data);
    if (!Number.isFinite(n)) {
      throw new Error("청구 합계 실패: 합계를 숫자로 읽지 못했어요 — db/schema.sql 의 sum_charges 함수가 올라갔는지 확인해 주세요");
    }
    return n;
  },
  async listCharges(userId) {
    const { data, error } = await db()
      .from("credit_charges").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) raise(error, "청구 목록");
    return data || [];
  },
  async findCharge(idemKey) {
    const { data, error } = await db()
      .from("credit_charges").select("*").eq("idem_key", idemKey).maybeSingle();
    if (error) raise(error, "청구 조회");
    return data || null;
  },
```

기존 `insertGrant`·`sumGrants` 는 열 이름만 `amount_credits` 로 맞춘다(supabase 는 insert 가 그대로 통과하므로 호출부에서 넘기는 키를 바꾸면 되고, memory 는 합산 키를 바꾼다).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/charges.test.js tests/store-memory.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add db/schema.sql lib/store/memory.js lib/store/supabase.js tests/charges.test.js && git commit -m "feat: 청구 장부 신설 — 청구(크레딧)와 원가(USD)를 가른다"`

---

### Task 3: `lib/charges.js` — 청구·환불·잔액

**Files:**
- Create: `lib/charges.js`
- Delete: `lib/credits.js`
- Test: `tests/charges.test.js` (describe "청구" 추가)

**Interfaces:**
- Consumes: Task 1 의 `videoPrice`·`regenPrice`, Task 2 의 스토어 메서드
- Produces:
  - `balanceFor(userId) → Promise<number>` (크레딧, 음수 가능)
  - `chargeVideo({ userId, projectId, seconds }) → Promise<number>` (청구한 크레딧. 이미 샀으면 0)
  - `chargeRegen({ userId, projectId, kind, idx, priorCount }) → Promise<number>` (kind ∈ image|clip|voice)
  - `refundVideo({ userId, projectId }) → Promise<void>`
  - `assertCanAfford(userId, price) → Promise<void>` — 모자라면 `NoCredits` 를 던진다
  - `class NoCredits extends Error` — `name === "NoCredits"`, `balance`·`price` 필드
  - `alreadyChargedVideo(projectId) → Promise<boolean>`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/charges.test.js` 에 추가:

```js
import {
  balanceFor, chargeVideo, chargeRegen, refundVideo,
  assertCanAfford, alreadyChargedVideo, NoCredits,
} from "../lib/charges.js";
import { VIDEO_PRICE, REGEN_PRICE } from "../lib/pricing.js";

describe("청구", () => {
  beforeEach(() => resetMemoryStore());

  const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

  it("잔액은 충전에서 청구를 뺀 값이다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("길이마다 값이 다르다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 60 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[60]);
  });

  it("같은 프로젝트를 두 번 청구하지 않는다 — 자동 관통으로 산 것을 단계별이 또 받지 않게", async () => {
    await grant(500);
    const first = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    const second = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(first).toBe(VIDEO_PRICE[30]);
    expect(second).toBe(0);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
    expect(await alreadyChargedVideo(P)).toBe(true);
  });

  it("컷당 첫 재생성은 공짜, 둘째부터 값을 치른다", async () => {
    await grant(500);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 0 })).toBe(0);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1 })).toBe(REGEN_PRICE.clip);
    expect(await balanceFor(A)).toBe(500 - REGEN_PRICE.clip);
  });

  it("컷이 다르면 각자 첫 회가 공짜다", async () => {
    await grant(500);
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 0, priorCount: 0 });
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 1, priorCount: 0 });
    expect(await balanceFor(A)).toBe(500);
  });

  it("환불은 잔액을 되돌린다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    expect(await balanceFor(A)).toBe(500);
  });

  it("환불을 두 번 해도 한 번만 돌아온다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    await refundVideo({ userId: A, projectId: P });
    expect(await balanceFor(A)).toBe(500);
  });

  it("assertCanAfford 는 모자라면 NoCredits 를 던지고 남은 값을 담는다", async () => {
    await grant(10);
    await expect(assertCanAfford(A, VIDEO_PRICE[30])).rejects.toMatchObject({
      name: "NoCredits", balance: 10, price: VIDEO_PRICE[30],
    });
  });

  it("정확히 맞으면 통과한다", async () => {
    await grant(VIDEO_PRICE[30]);
    await expect(assertCanAfford(A, VIDEO_PRICE[30])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/charges.test.js` / Expected: FAIL — `lib/charges.js` 없음

- [ ] **Step 3: 구현** — `lib/charges.js`:

```js
// 크레딧 청구 — 정가를 받고, 실패하면 되돌린다.
//
// 잔액은 저장하지 않는다: **충전 합계 − 청구 합계**가 곧 잔액이다.
// 두 장부 다 크레딧이라 단위가 안 섞인다(USD 원가는 cost_records 가 따로 진다).
//
// costs.js 가 이 모듈을 부른다(assertBudget). 이 모듈은 costs.js 를 부르지 않는다 —
// 순환 import 를 만들지 않으려고 스토어에서 직접 읽는다.
import { getStore } from "./store/index.js";
import { videoPrice, regenPrice } from "./pricing.js";

export class NoCredits extends Error {
  constructor(balance, price) {
    super(`크레딧이 모자라요 — 이 작업은 ${price} 크레딧인데 ${balance} 남았어요`);
    this.name = "NoCredits";
    this.balance = balance;
    this.price = price;
  }
}

export async function balanceFor(userId) {
  const store = getStore();
  const [granted, charged] = await Promise.all([
    store.sumGrants(userId),
    store.sumCharges(userId),
  ]);
  return granted - charged;
}

export async function assertCanAfford(userId, price) {
  const balance = await balanceFor(userId);
  if (balance < price) throw new NoCredits(balance, price);
}

// 영상 한 편. 자동 관통과 단계별이 같은 키를 쓰므로 **둘 중 먼저 온 쪽만** 받는다.
export const videoKey = (projectId) => `video:${projectId}`;

export async function alreadyChargedVideo(projectId) {
  return (await getStore().findCharge(videoKey(projectId))) !== null;
}

export async function chargeVideo({ userId, projectId, seconds }) {
  const credits = videoPrice(seconds);
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "video",
    credits, idem_key: videoKey(projectId),
  });
  return wrote ? credits : 0;   // 이미 산 프로젝트면 0
}

// 재생성. idx·회차가 키에 들어가 같은 회차를 두 번 청구하지 않는다.
// priorCount 는 그 컷에서 이미 한 횟수 — 첫 회(0)는 공짜다.
export async function chargeRegen({ userId, projectId, kind, idx, priorCount }) {
  const credits = regenPrice(kind, priorCount);
  if (credits === 0) return 0;
  const wrote = await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: `regen_${kind}`,
    credits, idem_key: `regen_${kind}:${projectId}:${idx}:${priorCount}`,
  });
  return wrote ? credits : 0;
}

// 자동 관통이 실패로 끝났을 때. 지우지 않고 **음수 행**으로 되돌린다 —
// 장부는 무슨 일이 있었는지 남기는 것이 일이다.
export async function refundVideo({ userId, projectId }) {
  const charge = await getStore().findCharge(videoKey(projectId));
  if (!charge) return;                       // 산 적이 없으면 되돌릴 것도 없다
  await getStore().insertCharge({
    user_id: userId, project_id: projectId, kind: "refund",
    credits: -Number(charge.credits), idem_key: `refund:${projectId}`,
  });
}
```

`lib/credits.js` 를 지운다(`git rm lib/credits.js`). 남은 import 는 다음 태스크가 옮긴다 — 이 태스크에서는 **아직 라우트가 credits.js 를 참조**하므로, 삭제를 Task 4 로 미루고 이 태스크에서는 파일만 새로 만들어도 된다. 어느 쪽이든 커밋 시점에 전체 스위트가 그린이어야 한다(그린이 안 되면 삭제를 Task 4 로 미뤄라).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/charges.test.js tests/pricing.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/charges.js tests/charges.test.js && git commit -m "feat: 청구·환불·잔액 — 정가를 받고 실패하면 음수 행으로 되돌린다"`

---

### Task 4: 라우트 배선 — 청구·환불·게이트

**Files:**
- Modify: `app/api/projects/[id]/auto/route.js` · `images/route.js` · `clips/route.js` · `voice/route.js`
- Modify: `app/api/projects/[id]/{cuts,voice,clips}/[idx]/regen/route.js`
- Modify: `lib/auto.js` (실패 시 환불 호출)
- Modify: `lib/costs.js` (사용자 축을 잔액 > 0 으로)
- Delete: `lib/credits.js`
- Test: `tests/charge-routes.test.js` (신규), 기존 `tests/credits-gate.test.js` 개정

**Interfaces:**
- Consumes: Task 3 의 `assertCanAfford`·`chargeVideo`·`chargeRegen`·`refundVideo`·`alreadyChargedVideo`·`NoCredits`, Task 1 의 `videoPrice`·`regenPrice`
- Produces: 라우트 계약 — 잔액 부족 시 **402**, 청구 성공 시 기존 응답 그대로(202/200)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/charge-routes.test.js`:

```js
// 라우트가 정가를 받는지, 두 번 받지 않는지, 실패하면 되돌리는지.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
import { VIDEO_PRICE } from "../lib/pricing.js";
import { balanceFor } from "../lib/charges.js";

vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";
import { POST as autoPOST } from "../app/api/projects/[id]/auto/route.js";
import { POST as imagesPOST } from "../app/api/projects/[id]/images/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const headersFor = (id) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const autoReq = () =>
  new Request("http://localhost/x", { method: "POST", headers: headersFor(A), body: JSON.stringify({ voice_label: "차분한 여성" }) });
const imagesReq = () =>
  new Request("http://localhost/x", { method: "POST", headers: headersFor(A), body: "{}" });

const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

async function makeProject(seconds = 30) {
  return projects.createProject({
    ownerId: A,
    settings: { aspect_ratio: "9:16", target_seconds: seconds },
    material: { text: "자료", photos: [] },
  });
}

describe("자동 관통 청구", () => {
  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });

  it("정가를 받고 시작한다", async () => {
    await grant(500);
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(202);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
    expect(runAutoPipeline).toHaveBeenCalledTimes(1);
  });

  it("길이가 길면 더 받는다", async () => {
    await grant(500);
    const p = await makeProject(60);
    await autoPOST(autoReq(), ctx(p.id));
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[60]);
  });

  it("모자라면 402 이고 청구도 시작도 없다", async () => {
    await grant(10);
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(402);
    expect(await balanceFor(A)).toBe(10);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("가짜 모드는 청구하지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(202);
    expect(await balanceFor(A)).toBe(0);
  });
});

describe("단계별 청구", () => {
  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });

  it("자동 관통으로 이미 산 프로젝트는 이미지에서 또 받지 않는다", async () => {
    await grant(500);
    const p = await makeProject(30);
    await autoPOST(autoReq(), ctx(p.id));
    const after = await balanceFor(A);
    // 컷·소리를 갖춰 /images 가 400 에 걸리지 않게 한다
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장.", seconds: 3, state: "pending", regen_count: 0, audio: { url: "a0", seconds: 3 } }],
    }));
    await imagesPOST(imagesReq(), ctx(p.id));
    expect(await balanceFor(A)).toBe(after);
  });
});
```

⚠️ `/images` 의 기존 가드(컷 없음 400·소리 없음 400·이미 그림 409)를 먼저 읽고, 위 픽스처가 그 가드를 통과하도록 맞춰라. 통과 못 하면 **픽스처를 실물에 맞춘다**(가드를 고치지 마라).

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/charge-routes.test.js` / Expected: FAIL — 라우트가 아직 USD 잔액을 본다

- [ ] **Step 3: 구현** —

`app/api/projects/[id]/auto/route.js`: 기존 크레딧 게이트 블록(`assertCanStart(user.id, { need: perVideoUsd() })`)을 다음으로 교체하고 import 를 `lib/charges`·`lib/pricing` 으로 바꾼다:

```js
  // 시작 게이트 + 청구 — 정가를 **시작하기 전에** 받는다.
  // 가짜 모드는 건너뛴다(0원이라 받을 것이 없다).
  if (!fakeFal()) {
    const price = videoPrice(project.settings?.target_seconds);
    try {
      await assertCanAfford(user.id, price);
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
    await chargeVideo({ userId: user.id, projectId: id, seconds: project.settings?.target_seconds });
  }
```

`lib/auto.js`: catch 블록에서 `auto.state="failed"` 를 세운 뒤 환불한다(가짜 모드는 청구가 없어 `refundVideo` 가 조용히 지나간다):

```js
  } catch (e) {
    await setAuto({ state: "failed", error: e?.message || "자동 생성에 실패했어요" }).catch(() => {});
    // 완성본을 못 준 값은 되돌린다 — 장부에 음수 행으로 남는다.
    await refundVideo({ userId: ownerId, projectId }).catch((err) =>
      console.error(`[자동 ${projectId.slice(0, 8)}] 환불 실패:`, err?.message));
    throw e;
  }
```

`app/api/projects/[id]/images/route.js`: 기존 게이트를 다음으로 교체:

```js
  // 단계별로 온 사장님도 같은 정가를 낸다 — 그림부터가 진짜 돈이 나가는 자리다.
  // 자동 관통으로 이미 산 프로젝트는 chargeVideo 가 0 을 돌려주므로 두 번 받지 않는다.
  if (!fakeFal() && !(await alreadyChargedVideo(id))) {
    const price = videoPrice(project.settings?.target_seconds);
    try {
      await assertCanAfford(user.id, price);
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
    await chargeVideo({ userId: user.id, projectId: id, seconds: project.settings?.target_seconds });
  }
```

`app/api/projects/[id]/clips/route.js`: **남은컷×단가 하한 계산(`clipsCostFor` 와 그 need)을 통째로 걷어낸다.** 클립은 영상 정가에 포함되므로 별도 게이트가 없다. `voice/route.js` 도 게이트를 걷어낸다(목소리는 정가에 포함, 편당 $0.014).

regen 3종(`cuts/[idx]/regen`·`voice/[idx]/regen`·`clips/[idx]/regen`): 게이트를 회차 기반 청구로 바꾼다. 각 라우트에서 그 컷의 현재 회차를 읽어야 한다 — `cuts` 는 `regen_count`, `voice` 는 `voice_regen_count`, `clips` 는 `clip_regen_count`(`lib/pipeline.js` 참조):

```js
  // 컷당 첫 재생성은 공짜, 둘째부터 정가. 회차는 그 컷이 이미 쓴 횟수다.
  if (!fakeFal()) {
    const project = await getProject(id, user.id);
    const cut = (project?.cuts || []).find((c) => c.idx === Number(idx));
    const prior = cut?.regen_count || 0;          // voice: voice_regen_count, clips: clip_regen_count
    const price = regenPrice("image", prior);      // voice: "voice", clips: "clip"
    if (price > 0) {
      try {
        await assertCanAfford(user.id, price);
      } catch (e) {
        if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
        throw e;
      }
      await chargeRegen({ userId: user.id, projectId: id, kind: "image", idx: Number(idx), priorCount: prior });
    }
  }
```

⚠️ 기존 게이트가 `try` **바깥**에 있는 이유(NoCredits 가 아래 catch 에 잡혀 400 이 되면 화면이 "크레딧 부족"과 "만들지 못했어요"를 구분 못 한다)를 유지하라.

`lib/costs.js`: 사용자 축을 잔액 판정으로 바꾼다(정가를 이미 받았으므로 컷 단위로 다시 재지 않는다):

```js
  // 사용자 축 — 정가는 시작 전에 이미 받았다. 여기서는 **청구 없이 도는 경로**의 그물만 친다:
  // 잔액이 음수인 채로 fal 이 나가면 안 된다.
  const actor = costActor();
  const balance = await balanceFor(actor);
  if (balance < 0) throw new BudgetExceeded(0, 0, "user");
```

`lib/credits.js` 를 삭제하고 남은 참조를 전부 옮긴다(`grep -rn "lib/credits" app lib tests` 가 0건이 되어야 한다).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run` / Expected: 전체 PASS. `tests/credits-gate.test.js`·`tests/credits-admin.test.js` 가 USD 전제로 깨질 것이다 — **크레딧 전제로 고쳐 쓰되 약화시키지 마라**(무엇을 왜 바꿨는지 보고서에)
- [ ] **Step 5: Commit** — `git add app lib tests && git commit -m "feat: 라우트가 정가를 받는다 — 실패는 환불, 재생성은 회차별"`

---

### Task 5: 충전·조회 라우트와 화면

**Files:**
- Modify: `app/api/credits/route.js` · `app/api/admin/users/[id]/credits/route.js` · `app/api/admin/users/route.js`
- Modify: `components/Sidebar.jsx` · `components/QuickCreate.jsx` · `app/admin/page.js`
- Modify: `app/create/[id]/images/page.js` 및 regen 버튼이 있는 화면들
- Test: `tests/credits-admin.test.js`(개정) · `tests/credits-ui.test.js`(개정)

**Interfaces:**
- Consumes: Task 1·3 전부
- Produces:
  - `GET /api/credits` → `{ balance, gated }` (크레딧 정수. `videos_left`·`per_video_usd` 는 **사라진다**)
  - `POST /api/admin/users/[id]/credits` body `{ credits: number, reason: string }` → `{ balance }`
  - `GET /api/admin/users` 각 행에 `balance`(크레딧)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/credits-ui.test.js` 를 다음으로 교체:

```js
// 화면 배선을 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const quick = strip(readFileSync("components/QuickCreate.jsx", "utf8"));
const admin = strip(readFileSync("app/admin/page.js", "utf8"));

describe("화면 — 크레딧", () => {
  it("편수로 말하지 않는다 — 정가가 길이마다 달라 'N편'은 거짓말이 된다", () => {
    expect(sidebar).not.toMatch(/편 남음/);
    expect(quick).not.toMatch(/videos_left/);
  });
  it("사이드바가 잔액을 서버에서 읽어 크레딧으로 보여준다", () => {
    expect(sidebar).toMatch(/\/api\/credits/);
    expect(sidebar).toMatch(/balance/);
  });
  it("요약 카드가 이 영상의 정가를 보여준다", () => {
    expect(quick).toMatch(/크레딧/);
  });
  it("부족하면 만들기를 막는다", () => {
    expect(quick).toMatch(/noCredits/);
  });
  it("백오피스가 크레딧 단위로 충전한다", () => {
    expect(admin).toMatch(/credits/);
    expect(admin).toMatch(/reason/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/credits-ui.test.js` / Expected: FAIL — 화면이 아직 `videos_left`·"편 남음"을 쓴다

- [ ] **Step 3: 구현** —

`app/api/credits/route.js`:

```js
// GET /api/credits — 내 잔액(크레딧)과 게이트 적용 여부.
import { withUser } from "../../../lib/auth/require-user.js";
import { balanceFor } from "../../../lib/charges.js";
import { fakeFal } from "../../../lib/fake.js";

export const GET = withUser(async (_req, _ctx, user) => {
  return Response.json({
    balance: await balanceFor(user.id),
    // 가짜 모드에서는 청구가 없다 — 화면이 버튼을 막지 않게 알려 준다.
    gated: !fakeFal(),
  });
});
```

`app/api/admin/users/[id]/credits/route.js`: `videos` → `credits` 로 받고 `insertGrant({ ..., amount_credits: credits })` 로 쓴다. 검증은 그대로(0 아닌 정수·사유 필수·없는 사용자 404). 응답은 `{ balance: await balanceFor(id) }`.

`app/api/admin/users/route.js`: 각 사용자의 `balance` 를 `sumGrants − sumCharges` 로 낸다(기존 `listGrantsFor` 에 대응하는 청구 쪽 묶음 조회가 없으므로, 사용자별 `sumCharges` 를 `Promise.all` 로 — 기존 `sumCosts` 와 같은 모양).

`components/Sidebar.jsx` 의 `.credit-box`:

```jsx
      <div className="credit-box">
        크레딧
        <b>{credits ? `${credits.balance}` : "…"}</b>
        <small>
          {credits && credits.balance <= 0
            ? "운영자에게 문의해 주세요 (실비용은 비용 기록에서)"
            : "영상을 만들 때마다 줄어요 (실비용은 비용 기록에서)"}
        </small>
      </div>
```

`components/QuickCreate.jsx`: 정가를 요약 카드에 넣는다. 화면은 `lib/pricing.js` 를 import 해도 안전하다(import 0개의 순수 데이터 — `lib/styles.js` 와 같은 성질):

```jsx
import { videoPrice } from "../lib/pricing";
```

요약 카드 문구에 정가를 더한다:

```jsx
            `(${data.target_seconds}초 · ${data.aspect_ratio} · ${styleLabel(data.style)} · ${data.voice_label})\n` +
            `이 영상은 ${videoPrice(data.target_seconds)} 크레딧이에요.\n` +
```

부족 판정을 정가 기준으로:

```jsx
  const price = (m) => videoPrice(m?.params?.target_seconds);
  const noCredits = (m) => credits && credits.gated && credits.balance < price(m);
```

버튼과 안내가 그 카드의 정가를 보게 바꾼다(`disabled={busy || noCredits(m)}`).

`app/admin/page.js`: 열 제목을 "크레딧", 값은 `u.balance ?? 0`, `grant()` 의 prompt 를 "몇 크레딧을 넣을까요? (회수는 음수)" 로 바꾸고 기본값에 `DEFAULT_GRANT` 를 쓴다(`lib/pricing.js` 를 import 해도 안전하다). body 는 `{ credits, reason }`.

`app/create/[id]/images/page.js` 의 시작 버튼과 regen 버튼들에 정가를 표기한다 — 예: `이미지 만들기 · {videoPrice(project.settings?.target_seconds)} 크레딧`, 재생성은 `다시 만들기 · {regenPrice("image", cut.regen_count || 0) || "무료"}`.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run` / Expected: 전체 PASS. 이어 `SHOTFORM_DIST_DIR=.next-verify-pricing npx next build` 로 번들 오염(fs) 없음 확인 후 그 디렉터리 삭제
- [ ] **Step 5: Commit** — `git add app components tests && git commit -m "feat: 화면이 크레딧과 정가를 말한다 — 편수 표기 폐지"`

---

### Task 6: 마이그레이션·문서·관통 검증

**Files:**
- Modify: `CLAUDE.md`(크레딧 절) · `.env.local.example`(죽은 env 정리)
- Test: 없음(검증 태스크 — 결함은 고치지 말고 보고. 단 문서 수정은 이 태스크의 일이다)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 관통 증거, 배포 절차 문서

- [ ] **Step 1: 전체 스위트** — Run: `npx vitest run` / Expected: 전체 PASS, 새 실패 0
- [ ] **Step 2: 죽은 것 정리** — `SHOTFORM_PER_VIDEO_USD` 는 이제 아무도 안 읽는다(가격표가 대신한다). `.env.local.example`·`CLAUDE.md`·`README.md` 에서 지우거나 가격표 설명으로 바꿔라(⚠️ `.env.local` 실파일은 건드리지 마라). `grep -rn "SHOTFORM_PER_VIDEO_USD\|videos_left\|perVideoUsd" app lib components tests` 가 0건이어야 한다
- [ ] **Step 3: 문서** — `CLAUDE.md` 의 크레딧 절을 새 모델로 갱신하라: 장부 둘(청구=크레딧 / 원가=USD), 길이별 정가, 컷당 1회 무료 재생성, `lib/pricing.js` 가 유일한 가격 자리. **⚠️ 배포 경고를 갱신하라** — `db/schema.sql` 을 먼저 올려야 하고, 이번에는 **열 이름 이관(`amount_usd → amount_credits`)이 포함**된다는 것과, 안 올리면 전면 500 이라는 것
- [ ] **Step 4: 가짜 모드 관통(0원)** — 3000·3001 포트는 사용자 것이니 **3003** 을 쓰고, 기존 `SHOTFORM_DIST_DIR` 스위치로 빌드 디렉터리를 갈라라:

```bash
PORT=3003 SHOTFORM_FAKE=all SHOTFORM_DIST_DIR=.next-verify-pricing npm run dev
```

확인: ① `GET /api/credits` 가 `{balance, gated:false}` 를 준다 ② 사이드바가 잔액을 크레딧으로 보여준다 ③ 가짜 모드라 청구가 없다(관통 후 잔액 불변) ④ 충전 라우트로 500 크레딧을 넣으면 잔액이 500 이 된다. 끝나면 서버 종료 + `.next-verify-pricing` 삭제
- [ ] **Step 5: 실모드 게이트(0원)** — `SHOTFORM_FAKE` 없이 띄우고 **생성 버튼은 절대 누르지 마라.** curl 로 `POST /api/projects/<id>/auto` 만 쳐서 잔액 0 일 때 **402** 를 확인한다(202 는 실제 파이프라인을 돌리므로 금지). 충전 후 202 확인은 **가짜 모드로 대신한다**
- [ ] **Step 6: 결과 보고 + 커밋** — 문서 수정만 커밋(`git add CLAUDE.md .env.local.example && git commit -m "docs: 크레딧 가격표로 갱신 — 배포는 스키마(열 이관 포함) 먼저"`). ⚠️ **라이브 DB 에는 올리지 마라** — 올릴지는 사용자가 정한다

---

## Self-Review 결과 (계획 작성 시 수행)

- **스펙 커버리지**: 가격표(T1) · 장부 분리·스키마·이관(T2) · 청구/환불/잔액(T3) · 라우트 배선·게이트·`/clips` 하한 제거(T4) · 충전·조회·화면 5곳(T5) · 문서·관통(T6). 스펙의 "테스트로 못 박을 것" 7개는 T1~T4 에 분산(길이별 정가 T4, 첫 재생성 무료 T1·T3, 환불 T3, 이중 청구 방지 T3·T4, 402+미호출 T4, SQL 합계 T2, 가짜 모드 T4).
- **타입 일치**: `insertCharge/sumCharges/listCharges/findCharge` 를 T2 정의 → T3 소비. `balanceFor/chargeVideo/chargeRegen/refundVideo/assertCanAfford/alreadyChargedVideo/NoCredits` 를 T3 정의 → T4·T5 소비. `videoPrice/regenPrice/VIDEO_PRICE/REGEN_PRICE/DEFAULT_GRANT` 를 T1 정의 → T3·T4·T5 소비. 라우트 응답 `{balance, gated}` 를 T5 정의 → 화면 소비.
- **주의로 남긴 것**: `/images` 픽스처가 기존 가드를 통과하도록 실물 대조(T4), regen 3종의 회차 필드 이름이 서로 다름(T4에 명시), `lib/credits.js` 삭제 시점을 T3/T4 중 그린이 유지되는 쪽으로(T3에 명시).
