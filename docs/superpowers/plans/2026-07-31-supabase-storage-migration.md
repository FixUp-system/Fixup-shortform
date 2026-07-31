# 저장 계층 Supabase 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `lib/projects.js`·`lib/costs.js` 의 공개 함수는 그대로 두고 그 뒤를 Supabase(Postgres + Storage)로 갈아끼운다.

**Architecture:** 저장 계층을 `lib/store/` 뒤로 숨긴다. 구현은 둘 — `supabase.js`(실제)와 `memory.js`(테스트). 프로젝트 문서는 `projects.doc jsonb` 한 칸에 통째로 넣고 `version` 컬럼으로 낙관적 락을 건다. 비용 원장은 `cost_records` 행 테이블로 쪼개 `request_id` 를 기본키로 삼는다. 업로드는 비공개 Storage 버킷으로 가되 `/api/uploads/<name>` URL 형태는 유지한다.

**Tech Stack:** Next.js 15 · `@supabase/supabase-js` · Postgres(Supabase) · Supabase Storage · vitest

## Global Constraints

- **공개 시그니처를 바꾸지 않는다** — `createProject({settings, material})` · `getProject(id)` · `updateProject(id, patchFn)` · `addRecord` · `updateRecord` · `listRecords` · `spentTotal` · `spentForProject` · `assertBudget`. 라우트 13개와 `lib/pipeline.js` 호출 29곳이 그대로 살아야 한다.
- **`patchFn` 은 동기 순수 함수다.** 재시도 대상이므로 부작용을 넣지 않는다.
- **구현 선택은 안전한 쪽으로.** `SHOTFORM_STORE=memory` 일 때만 인메모리. 그 외에는 Supabase 이고, 접속 정보가 없으면 **던진다**. 조용히 인메모리로 떨어지면 안 된다.
- **"없음"과 "실패"를 구분한다.** 0건은 `null`, 그 밖의 오류는 던진다.
- **`MAX_ATTEMPTS = 5`** — 낙관적 락 재시도 상한.
- **한국어 주석·오류 메시지.** 기존 코드 문체를 따른다(왜 그렇게 했는지를 적는다).
- **`data/renders/` 는 건드리지 않는다.** ffmpeg 가 로컬 경로를 요구한다.
- **범위 밖:** 인증·RLS·크레딧·프로젝트 목록 API·fal CDN 산출물 보관·Vercel 배포.
- 각 태스크 끝에서 `npx vitest run` 이 **전부 그린**이어야 한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/store/index.js` (신규) | 구현 선택 한 곳. `getStore()` 가 memory/supabase 중 하나를 준다 |
| `lib/store/memory.js` (신규) | 인메모리 구현 + `resetMemoryStore()` |
| `lib/store/supabase.js` (신규) | Supabase 구현. 낙관적 락·Storage 접근 |
| `lib/projects.js` (수정) | 공개 API 유지, 내부를 store 위임으로 |
| `lib/costs.js` (수정) | 원장 읽고 쓰는 부분만 store 위임으로 |
| `lib/pipeline.js` (수정) | `uploadsPath` 제거, `refs[]` 가 `{source, key}` 를 담음 |
| `lib/imagegen.js`·`lib/vlm.js` (수정) | 경로 대신 바이트를 받는다 |
| `app/api/uploads/route.js`·`[name]/route.js` (수정) | Storage 읽고 쓰기 |
| `db/schema.sql` (신규) | DDL. Supabase SQL 편집기에 붙여 넣는 원본 |
| `scripts/migrate-to-supabase.mjs` (신규) | 업로드·비용 일회성 이관 |
| `vitest.setup.js` (수정) | `SHOTFORM_STORE=memory` |

---

### Task 1: store 인터페이스와 인메모리 구현

**Files:**
- Create: `lib/store/index.js`
- Create: `lib/store/memory.js`
- Test: `tests/store-memory.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `getStore()` → store 객체
  - store 객체의 메서드:
    - `insertProject(project)` → `project`
    - `selectProject(id)` → `{ version: number, doc: object } | null`
    - `updateProjectRow(id, expectedVersion, doc)` → `boolean` (갱신됐으면 true)
    - `insertCost(record)` → `record` (같은 `request_id` 가 이미 있으면 그대로 둔다)
    - `patchCost(requestId, patch)` → `record | null`
    - `findCost(requestId)` → `record | null`
    - `allCosts()` → `record[]`
    - `sumCosts({ projectId })` → `number`
    - `putObject(bucket, key, bytes, contentType)` → `void`
    - `getObject(bucket, key)` → `Buffer`
  - `resetMemoryStore()` (memory.js 에서만 export)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/store-memory.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { getStore } from "../lib/store/index.js";
import { resetMemoryStore } from "../lib/store/memory.js";

beforeEach(() => resetMemoryStore());

describe("인메모리 store", () => {
  it("프로젝트를 넣고 꺼낸다 — 버전은 0에서 시작한다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft", cuts: [] });
    expect(await s.selectProject("p1")).toEqual({ version: 0, doc: { id: "p1", status: "draft", cuts: [] } });
  });

  it("없는 프로젝트는 null 이다 — 오류가 아니다", async () => {
    expect(await getStore().selectProject("없음")).toBeNull();
  });

  it("기대 버전이 맞을 때만 갱신한다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft" });
    expect(await s.updateProjectRow("p1", 0, { id: "p1", status: "script" })).toBe(true);
    expect((await s.selectProject("p1")).version).toBe(1);
    expect(await s.updateProjectRow("p1", 0, { id: "p1", status: "cuts" })).toBe(false); // 낡은 버전
    expect((await s.selectProject("p1")).doc.status).toBe("script"); // 안 바뀐다
  });

  it("비용은 request_id 로 멱등하다", async () => {
    const s = getStore();
    await s.insertCost({ request_id: "r1", ts: 1, endpoint: "x", est_cost_usd: 0.5 });
    await s.insertCost({ request_id: "r1", ts: 1, endpoint: "x", est_cost_usd: 0.5 });
    expect(await s.allCosts()).toHaveLength(1);
    expect(await s.sumCosts({})).toBe(0.5);
  });

  it("프로젝트별 합계를 낸다", async () => {
    const s = getStore();
    await s.insertCost({ request_id: "a", ts: 1, endpoint: "x", est_cost_usd: 1, project_id: "p1" });
    await s.insertCost({ request_id: "b", ts: 2, endpoint: "x", est_cost_usd: 2, project_id: "p2" });
    expect(await s.sumCosts({ projectId: "p1" })).toBe(1);
    expect(await s.sumCosts({})).toBe(3);
  });

  it("객체를 넣고 꺼낸다", async () => {
    const s = getStore();
    await s.putObject("uploads", "x.jpg", Buffer.from("bytes"), "image/jpeg");
    expect((await s.getObject("uploads", "x.jpg")).toString()).toBe("bytes");
  });

  it("없는 객체는 던진다 — 빈 값으로 흘리지 않는다", async () => {
    await expect(getStore().getObject("uploads", "없음.jpg")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/store-memory.test.js`
Expected: FAIL — `Cannot find module '../lib/store/index.js'`

- [ ] **Step 3: 인메모리 구현을 쓴다**

`lib/store/memory.js`:

```js
// 인메모리 저장소 — 테스트 전용.
//
// 프로덕션에서 절대 선택되면 안 된다(lib/store/index.js 가 명시적 env 로만 고른다).
// 저장이 되는 것처럼 보이다가 재시작하면 전부 사라지기 때문이다.
const projects = new Map(); // id → { version, doc }
const costs = new Map();    // request_id → record
const objects = new Map();  // `${bucket}/${key}` → Buffer

export function resetMemoryStore() {
  projects.clear();
  costs.clear();
  objects.clear();
}

// 깊은 복사 — 바깥이 doc 을 들고 고쳐도 저장된 것이 안 바뀌게 한다.
// 파일 저장소는 JSON 왕복이라 자연히 격리됐는데, 메모리는 참조를 그대로 주면
// 저장 안 한 변경이 반영된 것처럼 보인다(테스트가 거짓으로 통과한다).
const clone = (v) => JSON.parse(JSON.stringify(v));

export const memoryStore = {
  async insertProject(project) {
    projects.set(project.id, { version: 0, doc: clone(project) });
    return project;
  },
  async selectProject(id) {
    const row = projects.get(id);
    return row ? { version: row.version, doc: clone(row.doc) } : null;
  },
  async updateProjectRow(id, expectedVersion, doc) {
    const row = projects.get(id);
    if (!row || row.version !== expectedVersion) return false;
    projects.set(id, { version: row.version + 1, doc: clone(doc) });
    return true;
  },
  async insertCost(record) {
    if (!costs.has(record.request_id)) costs.set(record.request_id, clone(record));
    return record;
  },
  async patchCost(requestId, patch) {
    const cur = costs.get(requestId);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    costs.set(requestId, next);
    return clone(next);
  },
  async findCost(requestId) {
    const r = costs.get(requestId);
    return r ? clone(r) : null;
  },
  async allCosts() {
    return [...costs.values()].map(clone);
  },
  async sumCosts({ projectId } = {}) {
    let total = 0;
    for (const r of costs.values()) {
      if (projectId && r.project_id !== projectId) continue;
      total += Number(r.est_cost_usd) || 0;
    }
    return total;
  },
  async putObject(bucket, key, bytes) {
    objects.set(`${bucket}/${key}`, Buffer.from(bytes));
  },
  async getObject(bucket, key) {
    const buf = objects.get(`${bucket}/${key}`);
    if (!buf) throw new Error(`객체를 찾을 수 없어요: ${bucket}/${key}`);
    return buf;
  },
};
```

`lib/store/index.js`:

```js
// 저장소 구현을 고르는 유일한 자리.
//
// ★ 모르면 죽는다. env 가 빠졌을 때 조용히 인메모리로 떨어지면 저장이 되는 것처럼
// 보이다가 재시작하면 전부 사라진다. lib/fake.js 가 "모르는 값은 off(=진짜, 돈이
// 나감)로 본다"로 안전한 쪽을 고르는 것과 같은 규칙이다.
import { memoryStore } from "./memory.js";

let supabaseStore = null;

export function getStore() {
  if (process.env.SHOTFORM_STORE === "memory") return memoryStore;
  if (!supabaseStore) {
    // 지연 로드 — 인메모리로 도는 테스트가 supabase 모듈을 끌고 오지 않게 한다
    const mod = require("./supabase.js");
    supabaseStore = mod.supabaseStore;
  }
  return supabaseStore;
}
```

> **주의:** Task 2 에서 `lib/store/supabase.js` 를 만들기 전까지 `getStore()` 의 Supabase 갈래는 부를 수 없다. 이 태스크의 테스트는 `SHOTFORM_STORE=memory` 로만 돈다(Task 4 에서 `vitest.setup.js` 가 세우기 전이므로 테스트 파일 맨 위에서 직접 세운다).

`tests/store-memory.test.js` 맨 위에 한 줄 추가:

```js
process.env.SHOTFORM_STORE = "memory";
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/store-memory.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 테스트가 여전히 그린인지 본다**

Run: `npx vitest run`
Expected: 765 + 7 = 772 passed

- [ ] **Step 6: 커밋**

```bash
git add lib/store/index.js lib/store/memory.js tests/store-memory.test.js
git commit -m "feat: 저장소 인터페이스와 인메모리 구현 — 구현 선택은 명시적 env 로만"
```

---

### Task 2: Supabase 구현과 스키마

**Files:**
- Create: `db/schema.sql`
- Create: `lib/store/supabase.js`
- Modify: `package.json` (의존성 추가)
- Modify: `.env.local.example`
- Test: `tests/store-supabase-contract.test.js`

**Interfaces:**
- Consumes: Task 1 의 store 메서드 계약 (같은 이름·같은 반환형)
- Produces: `supabaseStore` — Task 1 의 `getStore()` 가 집어 가는 객체

- [ ] **Step 1: 의존성을 넣는다**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: DDL 을 쓴다**

`db/schema.sql`:

```sql
-- shotform 저장 계층. Supabase SQL 편집기에 그대로 붙여 넣는다.
--
-- 문서(projects)는 jsonb 통짜다: 스키마가 아직 흔들려서(2026-07-31 하루에도 vlm.passed 가
-- 2값→3값이 됐다) 컬럼을 못 박으면 매번 마이그레이션을 쓰게 된다.
-- 원장(cost_records)은 행이다: 단일 INSERT 라 락이 필요 없고 SUM 이 인덱스로 끝난다.

create table if not exists projects (
  id          uuid primary key,
  owner_id    uuid,                                -- 지금은 null. 인증이 붙으면 채운다
  status      text not null,
  version     bigint not null default 0,           -- 낙관적 락
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  doc         jsonb not null
);

create table if not exists cost_records (
  request_id    text primary key,                  -- 멱등키: 같은 호출을 두 번 기록하지 않는다
  ts            timestamptz not null,
  endpoint      text not null,
  stage         text,
  actor         text not null,
  project_id    uuid,
  est_cost_usd  numeric(12,6) not null default 0,
  status        text,
  meta          jsonb                              -- prompt·duration·aspect_ratio·video_url
);

create index if not exists cost_records_project_idx on cost_records (project_id);
create index if not exists cost_records_actor_ts_idx on cost_records (actor, ts);

-- 업로드 버킷은 비공개다. 서명 URL 을 프론트에 주지 않고 /api/uploads 라우트가 흘려준다 —
-- 문서에 저장된 url 이 영구히 유효해야 하고, 인증이 붙으면 그 라우트가 소유자 검사 자리가 된다.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;
```

- [ ] **Step 3: Supabase 구현을 쓴다**

`lib/store/supabase.js`:

```js
// Supabase 구현.
//
// supabase-js 는 PostgREST(HTTP)를 거쳐 호출 하나하나가 각각 독립된 트랜잭션이다.
// BEGIN 을 걸어놓고 그 안에서 JS 를 돌린 뒤 COMMIT 하는 것이 불가능하므로
// SELECT ... FOR UPDATE 를 쓸 수 없다. 그래서 version 컬럼으로 낙관적 락을 건다
// (updateProjectRow 가 expectedVersion 을 WHERE 에 넣는다).
import { createClient } from "@supabase/supabase-js";

const UPLOADS_BUCKET = "uploads";

let client = null;
function db() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  // service role 키를 쓴다 — 서버에서만 부르고, 아직 RLS 가 없다.
  // 인증이 붙으면 사용자 토큰 클라이언트로 갈아탄다.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)"
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// 오류와 "없음"을 구분한다 — 이 구분이 없으면 DB 가 잠깐 끊긴 것도
// "프로젝트를 찾을 수 없어요"가 되어 사용자가 작업물이 사라진 줄 안다.
function raise(error, what) {
  throw new Error(`${what} 실패: ${error.message}`);
}

export const supabaseStore = {
  async insertProject(project) {
    const { error } = await db().from("projects").insert({
      id: project.id,
      status: project.status,
      version: 0,
      doc: project,
    });
    if (error) raise(error, "프로젝트 저장");
    return project;
  },

  async selectProject(id) {
    const { data, error } = await db()
      .from("projects")
      .select("version, doc")
      .eq("id", id)
      .maybeSingle();
    if (error) raise(error, "프로젝트 조회");
    return data ? { version: data.version, doc: data.doc } : null;
  },

  async updateProjectRow(id, expectedVersion, doc) {
    const { data, error } = await db()
      .from("projects")
      .update({
        doc,
        version: expectedVersion + 1,
        status: doc.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("version", expectedVersion)   // 그 사이 아무도 안 바꿨을 때만
      .select("id");
    if (error) raise(error, "프로젝트 갱신");
    return (data || []).length > 0;
  },

  async insertCost(record) {
    const { request_id, ts, endpoint, stage, actor, project_id, est_cost_usd, status, ...meta } = record;
    const { error } = await db()
      .from("cost_records")
      .upsert(
        {
          request_id,
          ts: new Date(ts).toISOString(),
          endpoint,
          stage: stage ?? null,
          actor: actor ?? "local",
          project_id: project_id ?? null,
          est_cost_usd: est_cost_usd ?? 0,
          status: status ?? null,
          meta,
        },
        { onConflict: "request_id", ignoreDuplicates: true }
      );
    if (error) raise(error, "비용 기록");
    return record;
  },

  async patchCost(requestId, patch) {
    const { status, ...rest } = patch;
    const fields = {};
    if (status !== undefined) fields.status = status;
    // meta 는 통째로 덮지 않고 병합한다 — 지금 호출부는 status 만 고치지만,
    // 부분 갱신이 남은 필드를 지우면 조용히 정보가 사라진다.
    if (Object.keys(rest).length) {
      const cur = await this.findCost(requestId);
      if (!cur) return null;
      fields.meta = { ...(cur.meta || {}), ...rest };
    }
    const { data, error } = await db()
      .from("cost_records")
      .update(fields)
      .eq("request_id", requestId)
      .select();
    if (error) raise(error, "비용 갱신");
    return (data || [])[0] ? flatten((data || [])[0]) : null;
  },

  async findCost(requestId) {
    const { data, error } = await db()
      .from("cost_records")
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();
    if (error) raise(error, "비용 조회");
    return data || null;
  },

  async allCosts() {
    const { data, error } = await db().from("cost_records").select("*");
    if (error) raise(error, "비용 목록");
    return (data || []).map(flatten);
  },

  async sumCosts({ projectId } = {}) {
    // 예전에는 원장 전체를 읽어 JS 에서 더했다(O(n), 매 유료 호출마다).
    // 여기서는 필요한 열 하나만 가져와 더한다 — 인덱스가 걸린 필터를 탄다.
    let q = db().from("cost_records").select("est_cost_usd");
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) raise(error, "비용 합계");
    return (data || []).reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0);
  },

  async putObject(bucket, key, bytes, contentType) {
    const { error } = await db()
      .storage.from(bucket)
      .upload(key, bytes, { contentType, upsert: true });
    if (error) raise(error, "파일 저장");
  },

  async getObject(bucket, key) {
    const { data, error } = await db().storage.from(bucket).download(key);
    if (error) raise(error, "파일 조회");
    return Buffer.from(await data.arrayBuffer());
  },
};

// DB 행을 지금까지 쓰던 평평한 레코드 모양으로 되돌린다 —
// listRecords 를 소비하는 화면(app/costs)이 meta 안을 들여다보지 않게 한다.
function flatten(row) {
  const { meta, ts, ...rest } = row;
  return { ...rest, ts: new Date(ts).getTime(), ...(meta || {}) };
}

export const UPLOADS = UPLOADS_BUCKET;
```

- [ ] **Step 4: env 예시를 갱신한다**

`.env.local.example` 에 추가:

```
# 저장 계층 (Supabase). 둘 다 없으면 서버가 뜨면서 죽는다 — 조용히 인메모리로 떨어지지 않는다.
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# 테스트 전용. 프로덕션에서는 절대 세우지 않는다.
# SHOTFORM_STORE=memory
```

- [ ] **Step 5: 계약 테스트를 쓴다**

두 구현이 같은 계약을 지키는지 판정한다. Supabase 접속 정보가 있을 때만 돈다.

`tests/store-supabase-contract.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";

// 접속 정보가 없으면 통째로 건너뛴다 — CI·새 클론에서 빨간불이 뜨면 안 된다.
const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!live)("Supabase store 계약", () => {
  let store;
  beforeAll(async () => {
    delete process.env.SHOTFORM_STORE;
    store = (await import("../lib/store/supabase.js")).supabaseStore;
  });

  it("넣고 꺼내면 버전이 0이다", async () => {
    const id = randomUUID();
    await store.insertProject({ id, status: "draft", cuts: [] });
    const row = await store.selectProject(id);
    expect(row.version).toBe(0);
    expect(row.doc.status).toBe("draft");
  });

  it("낡은 버전으로는 갱신되지 않는다", async () => {
    const id = randomUUID();
    await store.insertProject({ id, status: "draft" });
    expect(await store.updateProjectRow(id, 0, { id, status: "script" })).toBe(true);
    expect(await store.updateProjectRow(id, 0, { id, status: "cuts" })).toBe(false);
    expect((await store.selectProject(id)).doc.status).toBe("script");
  });

  it("없는 프로젝트는 null 이다", async () => {
    expect(await store.selectProject(randomUUID())).toBeNull();
  });

  it("같은 request_id 를 두 번 넣어도 한 건이다", async () => {
    const rid = `t-${randomUUID()}`;
    const rec = { request_id: rid, ts: Date.now(), endpoint: "x", actor: "test", est_cost_usd: 0.25 };
    await store.insertCost(rec);
    await store.insertCost(rec);
    expect(await store.findCost(rid)).toBeTruthy();
    // 합계가 두 배가 되지 않는다
    const all = (await store.allCosts()).filter((r) => r.request_id === rid);
    expect(all).toHaveLength(1);
  });

  it("객체를 넣고 꺼낸다", async () => {
    const key = `test-${randomUUID()}.jpg`;
    await store.putObject("uploads", key, Buffer.from("hello"), "image/jpeg");
    expect((await store.getObject("uploads", key)).toString()).toBe("hello");
  });
});
```

- [ ] **Step 6: 스키마를 Supabase 에 올린다**

Supabase 대시보드 → SQL Editor 에 `db/schema.sql` 내용을 붙여 넣고 실행한다.
그다음 `.env.local` 에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 를 넣는다.

- [ ] **Step 7: 계약 테스트를 돌린다**

Run: `npx vitest run tests/store-supabase-contract.test.js`
Expected: PASS (5 tests). 접속 정보가 없으면 skipped 로 뜬다 — 그 경우 Step 6 을 먼저 한다.

- [ ] **Step 8: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 9: 커밋**

```bash
git add db/schema.sql lib/store/supabase.js tests/store-supabase-contract.test.js package.json package-lock.json .env.local.example
git commit -m "feat: Supabase store 구현 — 낙관적 락과 멱등 원장"
```

---

### Task 3: `lib/projects.js` 를 store 위에 얹는다

**Files:**
- Modify: `lib/projects.js` (전체 교체)
- Test: `tests/projects.test.js` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 의 `getStore()`, `insertProject`·`selectProject`·`updateProjectRow`
- Produces: 시그니처가 바뀌지 않은 `createProject`·`getProject`·`updateProject`

- [ ] **Step 1: 낙관적 락 테스트를 쓴다**

`tests/projects.test.js` 끝에 추가:

```js
describe("낙관적 락", () => {
  it("동시 갱신 둘이 모두 반영된다 — 하나가 사라지지 않는다", async () => {
    const p = await projects.createProject({ settings: {}, material: {} });
    await projects.updateProject(p.id, (proj) => ({ ...proj, cuts: [{ idx: 0 }, { idx: 1 }] }));

    // 컷 0 과 컷 1 을 동시에 갱신한다 — 파이프라인의 Promise.all 과 같은 모양이다
    await Promise.all([
      projects.updateProject(p.id, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 0 ? { ...c, state: "done" } : c)),
      })),
      projects.updateProject(p.id, (proj) => ({
        ...proj,
        cuts: proj.cuts.map((c) => (c.idx === 1 ? { ...c, state: "done" } : c)),
      })),
    ]);

    const after = await projects.getProject(p.id);
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[1].state).toBe("done"); // 덮어쓰기가 없었다
  });

  it("없는 프로젝트를 갱신하면 던진다", async () => {
    await expect(projects.updateProject("없는-id", (p) => p)).rejects.toThrow("찾을 수 없어요");
  });

  it("재시도를 소진하면 던진다 — 조용히 성공한 척하지 않는다", async () => {
    const p = await projects.createProject({ settings: {}, material: {} });
    const store = getStore();
    const real = store.updateProjectRow;
    store.updateProjectRow = async () => false; // 매번 진다
    try {
      await expect(projects.updateProject(p.id, (proj) => proj)).rejects.toThrow("충돌");
    } finally {
      store.updateProjectRow = real;
    }
  });

  it("저장소 오류는 '없음'으로 뭉개지 않는다 — 그대로 던진다", async () => {
    const store = getStore();
    const real = store.selectProject;
    store.selectProject = async () => { throw new Error("연결이 끊겼어요"); };
    try {
      await expect(projects.getProject("아무거나")).rejects.toThrow("연결이 끊겼어요");
    } finally {
      store.selectProject = real;
    }
  });
});
```

`tests/projects.test.js` 맨 위에 `import { getStore } from "../lib/store/index.js";` 를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/projects.test.js`
Expected: FAIL — 지금 구현은 파일 락이라 이 테스트는 통과할 수도 있다. **통과하면 그대로 두고 Step 3 으로 간다** (이 테스트는 이전 후에도 동작이 유지되는지를 지키는 회귀 테스트다).

- [ ] **Step 3: `lib/projects.js` 를 교체한다**

```js
// 프로젝트 저장소 — 공개 함수 셋의 시그니처는 바꾸지 않는다.
// 라우트 13개와 lib/pipeline.js 호출 29곳이 이 문 하나만 본다.
import { randomUUID } from "crypto";
import { getStore } from "./store/index.js";

// 낙관적 락 재시도 상한.
//
// 왜 락이 아니라 재시도인가: supabase-js 는 트랜잭션을 열 수 없어 SELECT ... FOR UPDATE 를
// 쓸 수 없다. 대신 version 컬럼을 두고 "내가 읽은 버전이 아직 그대로일 때만 쓴다"로 간다.
// 진 쪽은 최신 문서를 다시 읽어 그 위에 다시 얹는다 — 그래서 갱신이 사라지지 않는다.
//
// patchFn 이 순수 함수라 재시도가 안전하다. 호출부 29곳이 전부
// `proj => ({...proj, ...})` 형태이고 그 안에서 fal 호출이나 파일 쓰기를 하는 곳은 없다.
const MAX_ATTEMPTS = 5;

export async function createProject({ settings, material }) {
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    status: "draft", // draft → briefing → script → cuts → voice → images → video → done
    settings: settings || {},
    material: material || { text: "", photos: [] },
    briefing: null,
    synopsis: null,
    script: null,
    cuts: [],
  };
  await getStore().insertProject(project);
  return project;
}

// 없으면 null, 그 밖의 오류는 던진다.
//
// 예전에는 모든 예외를 삼켜 null 로 만들었다. 그러면 DB 가 잠깐 끊긴 것도
// "프로젝트를 찾을 수 없어요"가 되어 사용자가 자기 작업물이 사라진 줄 안다.
export async function getProject(id) {
  const row = await getStore().selectProject(id);
  return row ? row.doc : null;
}

export async function updateProject(id, patchFn) {
  const store = getStore();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await store.selectProject(id);
    if (!row) throw new Error("프로젝트를 찾을 수 없어요");
    const next = patchFn(row.doc);
    if (await store.updateProjectRow(id, row.version, next)) return next;
    // 졌다 — 아주 짧게 무작위로 쉬고 최신 문서를 다시 읽는다.
    // 무작위가 없으면 진 쪽들이 같은 순간에 다시 몰려 또 부딪힌다.
    await sleep(5 + Math.floor(Math.random() * 20) * (attempt + 1));
  }
  throw new Error("저장이 계속 충돌했어요 — 잠시 뒤 다시 시도해 주세요");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run tests/projects.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 — 여기서 많이 깨진다**

Run: `npx vitest run`
Expected: `tests/routes.test.js`·`tests/pipeline.test.js` 가 대량 실패한다. `SHOTFORM_DATA_DIR` 로 격리하던 테스트가 이제 store 를 안 비우기 때문이다. **Task 4 에서 고친다 — 여기서 멈추지 않는다.**

- [ ] **Step 6: 커밋 (아직 빨간불이므로 wip 로 남긴다)**

```bash
git add lib/projects.js tests/projects.test.js
git commit -m "wip: projects.js 를 store 위로 옮긴다 (테스트 격리는 다음 태스크)"
```

---

### Task 4: 테스트 격리를 store 기준으로 바꾼다

**Files:**
- Modify: `vitest.setup.js`
- Modify: `tests/projects.test.js:9-13`
- Modify: `tests/routes.test.js:35-39`
- Modify: `tests/pipeline.test.js:26-30`
- Test: `tests/store-selection.test.js` (신규)

**Interfaces:**
- Consumes: Task 1 의 `resetMemoryStore()`
- Produces: 없음 (테스트 인프라)

- [ ] **Step 1: 구현 선택 테스트를 쓴다**

`tests/store-selection.test.js`:

```js
import { describe, it, expect, afterEach } from "vitest";

const saved = { ...process.env };
afterEach(() => {
  process.env.SHOTFORM_STORE = saved.SHOTFORM_STORE;
  process.env.SUPABASE_URL = saved.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved.SUPABASE_SERVICE_ROLE_KEY;
});

describe("저장소 선택", () => {
  it("SHOTFORM_STORE=memory 일 때만 인메모리다", async () => {
    process.env.SHOTFORM_STORE = "memory";
    const { getStore } = await import("../lib/store/index.js?sel=1");
    const { memoryStore } = await import("../lib/store/memory.js");
    expect(getStore()).toBe(memoryStore);
  });

  it("★ env 가 없으면 조용히 인메모리로 떨어지지 않는다 — 던진다", async () => {
    delete process.env.SHOTFORM_STORE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getStore } = await import("../lib/store/index.js?sel=2");
    expect(() => getStore()).toThrow(/SUPABASE_URL/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/store-selection.test.js`
Expected: 둘째 테스트가 FAIL 하거나, `require` 가 ESM 에서 안 먹어 오류가 난다.

- [ ] **Step 3: `lib/store/index.js` 의 지연 로드를 ESM 으로 고친다**

`require` 는 이 저장소(ESM)에서 쓸 수 없다. 정적 import 로 바꾸되, **접속 정보 확인은 `getStore()` 호출 시점에** 한다(모듈 로드 시점이 아니라).

```js
// 저장소 구현을 고르는 유일한 자리.
//
// ★ 모르면 죽는다. env 가 빠졌을 때 조용히 인메모리로 떨어지면 저장이 되는 것처럼
// 보이다가 재시작하면 전부 사라진다. lib/fake.js 가 "모르는 값은 off(=진짜, 돈이
// 나감)로 본다"로 안전한 쪽을 고르는 것과 같은 규칙이다.
import { memoryStore } from "./memory.js";
import { supabaseStore } from "./supabase.js";

export function getStore() {
  if (process.env.SHOTFORM_STORE === "memory") return memoryStore;
  // supabaseStore 의 메서드는 첫 호출 때 db() 로 접속 정보를 확인한다.
  // 여기서 미리 확인해 두는 이유는 "쓸 때가 아니라 고를 때" 죽게 하기 위해서다 —
  // 첫 저장까지 멀쩡해 보이다가 죽으면 원인을 찾기 어렵다.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)"
    );
  }
  return supabaseStore;
}
```

- [ ] **Step 4: `vitest.setup.js` 를 바꾼다**

```js
// 모든 테스트를 인메모리 저장소에 가둔다.
//
// 왜 필요한가: 비용 기록·프로젝트 저장은 실제 저장소로 나간다. 테스트가 fetch 를 mock 해
// 호출부를 돌리면 그 기록이 **실제 비용 기록에 섞인다** — 예전에 실제로 그렇게 오염됐다
// (테스트 16건이 data/costs.json 에 0원짜리로 쌓였다). 이제는 Supabase 를 오염시킨다.
//
// 파일마다 세우는 방식은 새 테스트가 생길 때마다 빠뜨릴 수 있어 여기서 한 번에 막는다.
process.env.SHOTFORM_STORE = "memory";

// 클립 모델 env 는 테스트에서 지운다 — .env.local 을 Kling 으로 바꿔 두면 눈금 기대값이
// 머신마다 달라진다. 활성 프로필을 재는 테스트는 자기 안에서 직접 세운다.
delete process.env.FAL_I2V_ENDPOINT;
```

- [ ] **Step 5: 세 테스트 파일의 `beforeEach` 를 바꾼다**

`tests/projects.test.js` 의 `beforeEach`(:9-13) 를:

```js
import { resetMemoryStore } from "../lib/store/memory.js";
import * as projects from "../lib/projects.js";

beforeEach(() => {
  resetMemoryStore();
});
```

> 동적 import(`?t=` + timestamp)는 더 이상 필요 없다. 예전에는 모듈 스코프의 `locks` Map 을 새로 만들기 위한 것이었는데, 그 Map 이 사라졌다.

`tests/routes.test.js` 의 `beforeEach`(:35-39) 에서 `mkdtempSync` 줄을 지우고 `resetMemoryStore()` 로 바꾼다. 파일 맨 위에 `import { resetMemoryStore } from "../lib/store/memory.js";` 를 추가한다. **정적 import 는 그대로 둔다** — 라우트와 테스트가 같은 store 를 봐야 한다.

`tests/pipeline.test.js` 의 `beforeEach`(:26-30) 도 같은 방식으로 바꾸되, `projects`·`pipeline` 을 **정적 import 로 올린다**(동적 재로드가 불필요해졌다).

- [ ] **Step 6: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 7: 커밋**

```bash
git add vitest.setup.js tests/projects.test.js tests/routes.test.js tests/pipeline.test.js tests/store-selection.test.js
git commit -m "test: 저장 격리를 임시 폴더에서 인메모리 store 로 옮긴다"
```

---

### Task 5: 비용 원장을 store 위에 얹는다

**Files:**
- Modify: `lib/costs.js:84-97`(readAll/writeAll 제거), `:138-144`, `:148-160`, `:162-181`
- Test: `tests/costs.test.js` (기존 파일 수정 + 추가)

**Interfaces:**
- Consumes: Task 1 의 `insertCost`·`patchCost`·`allCosts`·`sumCosts`
- Produces: 시그니처가 바뀌지 않은 `addRecord`·`updateRecord`·`listRecords`·`spentTotal`·`spentForProject`·`assertBudget`

- [ ] **Step 1: 멱등성 테스트를 쓴다**

`tests/costs.test.js` 에 추가:

```js
describe("원장 멱등성", () => {
  it("같은 request_id 를 두 번 넣어도 합계가 두 배가 되지 않는다", async () => {
    const { addRecord, spentTotal } = await import("../lib/costs.js");
    const rec = { request_id: "dup-1", ts: Date.now(), endpoint: "fal-ai/x", actor: "test", est_cost_usd: 0.5 };
    await addRecord(rec);
    await addRecord(rec);
    expect(await spentTotal()).toBe(0.5);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: FAIL — `expected 1 to be 0.5` (지금은 그냥 push 라 두 건이 된다)

- [ ] **Step 3: `lib/costs.js` 를 고친다**

파일 맨 위의 `fs`·`path` import 와 `costsFile()`·`readAll()`·`writeAll()` 을 지우고 store 를 쓴다.

```js
import { getStore } from "./store/index.js";
```

`readAll`/`writeAll` 을 쓰던 함수 다섯을 바꾼다:

```js
export async function spentTotal() {
  return getStore().sumCosts({});
}

export async function spentForProject(projectId) {
  return getStore().sumCosts({ projectId });
}

// fal 로 나가기 직전에 부른다. 호출한 뒤에 재는 것이 아니라 나가기 전에 막는다 —
// 이번 호출의 예상 비용을 더한 값으로 판정하는 이유다.
//
// 예전에는 원장 전체 파일을 읽어 JS 에서 더했다(O(n), 매 유료 호출마다).
// 이제는 합계 두 번이라 원장이 커져도 같은 값이 든다.
export async function assertBudget({ projectId, endpoint, amount }) {
  if (fakeFal()) return; // 가짜 모드는 0원이라 잴 것이 없다
  const cost = estimateCost(endpoint, amount);
  const store = getStore();

  const total = (await store.sumCosts({})) + cost;
  if (total > limitTotal()) throw new BudgetExceeded(total - cost, limitTotal(), "total");

  if (projectId) {
    const mine = (await store.sumCosts({ projectId })) + cost;
    if (mine > limitProject()) throw new BudgetExceeded(mine - cost, limitProject(), "project");
  }
}

export async function listRecords() {
  const all = await getStore().allCosts();
  return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// 같은 request_id 를 두 번 넣어도 한 건이다 — store 가 막는다.
// 크레딧이 붙으면 이것이 이중 차감 방어선이 된다.
export async function addRecord(record) {
  await getStore().insertCost(record);
  return record;
}

export async function updateRecord(requestId, patch) {
  return getStore().patchCost(requestId, patch);
}
```

- [ ] **Step 4: 낡은 회귀 테스트를 갈아탄다**

`tests/costs.test.js:74-92` 의 "SHOTFORM_DATA_DIR 을 호출 시점에 읽는다" 테스트는 뜻을 잃었다. 지우고 대신 이것을 넣는다:

```js
it("★ 원장이 실제 저장소를 오염시키지 않는다 — 테스트는 인메모리다", async () => {
  const { getStore } = await import("../lib/store/index.js");
  const { memoryStore } = await import("../lib/store/memory.js");
  expect(getStore()).toBe(memoryStore);
});
```

- [ ] **Step 5: 테스트를 돌린다**

Run: `npx vitest run tests/costs.test.js`
Expected: PASS

- [ ] **Step 6: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 7: 커밋**

```bash
git add lib/costs.js tests/costs.test.js
git commit -m "feat: 비용 원장을 행 저장소로 — 락이 필요 없어지고 합계가 인덱스를 탄다"
```

---

### Task 6: 업로드를 Storage 로 옮긴다

**Files:**
- Modify: `app/api/uploads/route.js` (전체 교체)
- Modify: `app/api/uploads/[name]/route.js` (전체 교체)
- Test: `tests/uploads.test.js` (신규)

**Interfaces:**
- Consumes: Task 1 의 `putObject`·`getObject`
- Produces: `/api/uploads/<uuid>.<ext>` URL 형태 유지 (문서 스키마가 안 바뀐다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/uploads.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const post = (await import("../app/api/uploads/route.js")).POST;
const get = (await import("../app/api/uploads/[name]/route.js")).GET;

beforeEach(() => resetMemoryStore());

function fileForm(bytes, type, name = "a.jpg") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return { formData: async () => form };
}

describe("업로드", () => {
  it("올리면 Storage 에 들어가고 URL 형태가 유지된다", async () => {
    const res = await post(fileForm("hello", "image/jpeg"));
    const body = await res.json();
    expect(body.url).toMatch(/^\/api\/uploads\/[a-f0-9-]+\.jpg$/);
    const key = body.url.split("/").pop();
    expect((await getStore().getObject("uploads", key)).toString()).toBe("hello");
  });

  it("허용되지 않는 형식은 400 이다", async () => {
    const res = await post(fileForm("x", "image/gif"));
    expect(res.status).toBe(400);
  });

  it("올린 것을 다시 받는다", async () => {
    const body = await (await post(fileForm("bytes", "image/png", "a.png"))).json();
    const name = body.url.split("/").pop();
    const res = await get(new Request("http://x"), { params: Promise.resolve({ name }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("bytes");
  });

  it("없는 파일은 404 다 — 500 으로 새지 않는다", async () => {
    const res = await get(new Request("http://x"), {
      params: Promise.resolve({ name: "00000000-0000-0000-0000-000000000000.jpg" }),
    });
    expect(res.status).toBe(404);
  });

  it("잘못된 파일명은 400 이다", async () => {
    const res = await get(new Request("http://x"), { params: Promise.resolve({ name: "../secret" }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/uploads.test.js`
Expected: FAIL — 지금 구현은 로컬 파일에 쓴다

- [ ] **Step 3: 업로드 라우트를 바꾼다**

`app/api/uploads/route.js`:

```js
// 사진 업로드 — Supabase Storage 비공개 버킷.
//
// URL 형태(/api/uploads/<uuid>.<ext>)를 바꾸지 않는다. 이 문자열이 프로젝트 문서의
// material.photos[].url 에 박히기 때문이다. 서명 URL 을 프론트에 직접 주면 만료되는데
// 문서에 박힌 값은 안 바뀐다 — 그러면 과거 프로젝트의 사진이 조용히 깨진다.
import { randomUUID } from "crypto";
import { getStore } from "../../../lib/store/index.js";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "uploads";

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "file 필드가 필요해요" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return Response.json({ error: "jpg/png/webp만 올릴 수 있어요" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "10MB 이하만 올릴 수 있어요" }, { status: 400 });

  const id = randomUUID();
  const stored = `${id}.${ext}`;
  try {
    await getStore().putObject(BUCKET, stored, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return Response.json({ error: `파일을 저장하지 못했어요: ${e.message}` }, { status: 500 });
  }
  return Response.json({ id, filename: file.name, url: `/api/uploads/${stored}` });
}
```

`app/api/uploads/[name]/route.js`:

```js
// 업로드 파일 서빙 — 비공개 버킷에서 받아 흘려준다.
//
// 인증이 붙으면 여기가 소유자 검사 자리다. 지금은 이름만 알면 누구나 받을 수 있다.
import { getStore } from "../../../../lib/store/index.js";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const BUCKET = "uploads";

export async function GET(_req, { params }) {
  const { name } = await params;
  // 경로 조작 방지 — 버킷 키에 슬래시나 상위 경로가 들어가면 안 된다
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  let buf;
  try {
    buf = await getStore().getObject(BUCKET, name);
  } catch {
    // 없는 파일과 저장소 오류를 여기서는 구분하지 않는다 — 어느 쪽이든 사용자에게는
    // "그 사진이 없다"이고, 원인은 서버 로그에 남는다
    return new Response("파일을 찾을 수 없어요", { status: 404 });
  }
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[name.split(".").pop()],
      // 업로드는 내용이 바뀌지 않는다(이름이 UUID다) — 오래 캐시해도 된다
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run tests/uploads.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 6: 커밋**

```bash
git add app/api/uploads/route.js "app/api/uploads/[name]/route.js" tests/uploads.test.js
git commit -m "feat: 업로드를 Storage 비공개 버킷으로 — URL 형태는 유지"
```

---

### Task 7: 레퍼런스가 경로 대신 바이트를 탄다

**Files:**
- Modify: `lib/pipeline.js:18-23`(uploadsPath 제거), `:68`, `:190-198`, `:225`
- Modify: `lib/imagegen.js:34-41`
- Modify: `lib/vlm.js:30-36`, `:79-83`
- Modify: `lib/cast.js` (avatarBytes 추가)
- Test: `tests/refs-bytes.test.js` (신규), `tests/imagegen.test.js` (수정)

**Interfaces:**
- Consumes: Task 1 의 `getObject`
- Produces:
  - `readRefBytes({ source, key })` → `Buffer` — `lib/refs-io.js` 신규
  - `refs[]` 항목 모양: `{ kind, who, source: "upload"|"avatar", key: string }`
  - `generateImage({ prompt, aspect_ratio, refs, ... })` — `refs[].bytes`·`refs[].key` 를 읽는다
  - `selectImage({ ..., refImage })` — `refImagePath` 대신 `{ bytes, key }`
  - `describePhoto({ photoBytes, photoKey, projectId })` — `photoPath` 대신

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/refs-bytes.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { readRefBytes } from "../lib/refs-io.js";

beforeEach(() => resetMemoryStore());

describe("레퍼런스 바이트 읽기", () => {
  it("업로드는 Storage 에서 읽는다", async () => {
    await getStore().putObject("uploads", "x.jpg", Buffer.from("up"), "image/jpeg");
    expect((await readRefBytes({ source: "upload", key: "x.jpg" })).toString()).toBe("up");
  });

  it("아바타는 로컬 assets 에서 읽는다 — 저장소에 커밋된 읽기 전용 자산이다", async () => {
    const buf = await readRefBytes({ source: "avatar", key: "man-30s.jpg" });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("없는 것은 null 이다 — 그림은 레퍼런스 없이라도 나와야 한다", async () => {
    expect(await readRefBytes({ source: "upload", key: "없음.jpg" })).toBeNull();
    expect(await readRefBytes({ source: "avatar", key: "없음.jpg" })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/refs-bytes.test.js`
Expected: FAIL — `Cannot find module '../lib/refs-io.js'`

- [ ] **Step 3: `lib/refs-io.js` 를 만든다**

```js
// 레퍼런스 바이트를 어디서 읽을지 아는 유일한 자리.
//
// 출처가 둘이다: 업로드는 Storage 로 갔고, 아바타는 assets/refs 에 커밋된 로컬 파일로
// 남는다(읽기 전용이고 저장소에 들어 있다). 그래서 ref 가 경로가 아니라 출처와 키를 든다.
//
// 못 읽으면 null 이다 — 던지지 않는다. 레퍼런스가 없어도 그림은 나와야 하고,
// 부르는 쪽이 이미 "바이트를 못 얻은 레퍼런스는 버린다"로 걸러낸다.
import { promises as fs } from "fs";
import path from "path";
import { getStore } from "./store/index.js";
import { avatarsDir } from "./cast.js";

const BUCKET = "uploads";

export async function readRefBytes({ source, key }) {
  if (!key) return null;
  try {
    if (source === "avatar") return await fs.readFile(path.join(avatarsDir(), key));
    return await getStore().getObject(BUCKET, key);
  } catch {
    return null;
  }
}

// data URI 로 바꾼다 — fal 도 OpenAI 도 상대경로 URL 은 못 읽는다.
export function toDataUri(bytes, key) {
  const ext = String(key || "").split(".").pop();
  return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `npx vitest run tests/refs-bytes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: `lib/pipeline.js` 의 refs 조립을 바꾼다**

`:18-23` 의 `uploadsPath` 함수를 **지운다**. `lib/pipeline.js` 에서 `path.` 를 쓰는 곳은 그
함수 안(`:22`)뿐이므로 **`import path from "path"` 도 함께 지운다.**

`:190-198` 을:

```js
  await setCut({ state: "generating" });
  // 컷이 고른 레퍼런스를 출처와 키로 푼다 — 어디서 읽을지는 lib/refs-io.js 가 안다.
  // 바이트를 여기서 미리 읽는 이유: 그림(프롬프트)과 심사(VLM)가 같은 것을 봐야 하고,
  // 두 번 읽으면 그 사이에 달라질 수 있다.
  const resolved = resolveCutRefs(cut, project).map((r) => ({
    kind: r.kind,
    who: r.who, // 첨부를 배역에 묶는 데 쓴다 — 익명으로 보내면 모델이 배역을 뒤바꾼다
    source: r.from === "photo" ? "upload" : "avatar",
    key:
      r.from === "photo"
        ? (project.material?.photos || []).find((p) => p.id === r.id)?.url?.split("/").pop()
        : (AVATARS.find((a) => a.id === r.id) || {}).file,
  }));
  const refs = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    if (bytes) refs.push({ ...r, bytes }); // 못 읽은 것은 버린다(예전 .filter(r => r.path) 와 같은 뜻)
  }
```

import 를 추가한다:

```js
import { readRefBytes } from "./refs-io.js";
import { AVATARS } from "./refs.js";
```

`:225` 의 VLM 호출에서 `refImagePath: refs[0]?.path` 를 `refImage: refs[0] || null` 로 바꾼다.

`:68` 의 사진 판정을 바꾼다:

```js
    for (const p of project.material?.photos || []) {
      const key = p.url?.split("/").pop();
      if (p.vision || !key) { photos.push(p); continue; }
      const photoBytes = await readRefBytes({ source: "upload", key });
      // 볼 파일이 없으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치를 이유가 없다
      if (!photoBytes) { photos.push(p); continue; }
      const vision = await describePhoto({ photoBytes, photoKey: key, projectId: project.id });
```

- [ ] **Step 6: `lib/imagegen.js` 를 바꾼다**

`:34-41` 을:

```js
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));
  }
```

`fs` import 를 지우고 `import { toDataUri } from "./refs-io.js";` 를 넣는다.

- [ ] **Step 7: `lib/vlm.js` 를 바꾼다**

`selectImage` 의 인자 `refImagePath` 를 `refImage` 로 바꾸고 `:30-36` 을:

```js
  if (refImage?.bytes) {
    content.push(
      { type: "text", text: "(마지막 이미지는 레퍼런스 원본)" },
      { type: "image_url", image_url: { url: toDataUri(refImage.bytes, refImage.key) } }
    );
  }
```

`:27` 의 조건문 `${refImagePath ? ... : ""}` 도 `${refImage ? ... : ""}` 로 바꾼다.

`describePhoto` 의 `photoPath` 를 `photoBytes`·`photoKey` 로 바꾸고 `:79-83` 의 `readFile` 을 `toDataUri(photoBytes, photoKey)` 로 바꾼다.

`fs` import 를 지우고 `toDataUri` 를 넣는다.

- [ ] **Step 8: 기존 테스트를 고친다**

`tests/imagegen.test.js` 가 `refs: [{ path: ... }]` 를 쓴다. `{ source: "upload", key: "shoe.jpg", bytes: Buffer.from("x") }` 로 바꾼다. 파일을 실제로 만들던 `beforeEach`(:11-14)는 지운다.

`tests/pipeline.test.js` 의 "이미지 생성에 레퍼런스가 배열로 간다"(:254-277)가 `path` 를 단언한다 — `source`·`key` 로 바꾼다.

`tests/vlm.test.js` 에서 `refImagePath: "..."` 를 `refImage: { bytes: Buffer.from("x"), key: "r.jpg" }`
로, `photoPath: "..."` 를 `photoBytes: Buffer.from("x"), photoKey: "p.jpg"` 로 바꾼다.
파일을 실제로 만들던 준비 코드가 있으면 지운다.

- [ ] **Step 9: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 10: 커밋**

```bash
git add lib/refs-io.js lib/pipeline.js lib/imagegen.js lib/vlm.js tests/refs-bytes.test.js tests/imagegen.test.js tests/pipeline.test.js
git commit -m "refactor: 레퍼런스가 로컬 경로 대신 출처와 바이트를 탄다"
```

---

### Task 8: 기존 데이터 이관 스크립트

**Files:**
- Create: `scripts/migrate-to-supabase.mjs`

**Interfaces:**
- Consumes: Task 1 의 `insertCost`·`putObject`
- Produces: 없음 (일회성 도구)

- [ ] **Step 1: 스크립트를 쓴다**

```js
// 기존 로컬 데이터를 Supabase 로 옮긴다. 일회성이지만 **여러 번 돌려도 안전하다** —
// 비용은 request_id 가 기본키라 중복이 막히고, 파일은 이름이 고정이라 덮어써도 같다.
//
// 프로젝트 94개는 옮기지 않는다: 전부 실험 산출물이고 옛 스키마(폐지된 synopsis,
// 옛 ref_photo_id)를 새 저장소가 떠안을 이유가 없다. data/projects/ 는 그대로 남는다.
//
// 실행: node scripts/migrate-to-supabase.mjs
import { promises as fs } from "fs";
import path from "path";
import { getStore } from "../lib/store/index.js";

const DATA = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function migrateUploads(store) {
  const dir = path.join(DATA, "uploads");
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    console.log("업로드 폴더가 없어요 — 건너뜁니다");
    return 0;
  }
  let n = 0;
  for (const name of names) {
    const ext = name.split(".").pop();
    if (!MIME[ext]) { console.log(`  건너뜀(형식): ${name}`); continue; }
    await store.putObject("uploads", name, await fs.readFile(path.join(dir, name)), MIME[ext]);
    n++;
  }
  return n;
}

async function migrateCosts(store) {
  let raw;
  try {
    raw = await fs.readFile(path.join(DATA, "costs.json"), "utf8");
  } catch {
    console.log("비용 원장이 없어요 — 건너뜁니다");
    return 0;
  }
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error("costs.json 이 배열이 아니에요");
  let n = 0;
  for (const r of records) {
    if (!r.request_id) { console.log("  건너뜀(request_id 없음)"); continue; }
    await store.insertCost(r);
    n++;
  }
  return n;
}

const store = getStore();
console.log("업로드 이관…");
const uploads = await migrateUploads(store);
console.log("비용 원장 이관…");
const costs = await migrateCosts(store);
console.log(`\n완료 — 업로드 ${uploads}개 · 비용 ${costs}건`);
console.log("프로젝트는 옮기지 않았습니다(의도된 것). data/projects/ 는 그대로 남아 있습니다.");
```

- [ ] **Step 2: 인메모리로 시험한다 (0원, 안전)**

Run: `SHOTFORM_STORE=memory node scripts/migrate-to-supabase.mjs`
Expected: `완료 — 업로드 9개 · 비용 54건` (인메모리라 실제로 남지는 않는다. 오류 없이 도는지만 본다)

- [ ] **Step 3: 실제로 이관한다**

Run: `node scripts/migrate-to-supabase.mjs`
Expected: `완료 — 업로드 9개 · 비용 54건`

- [ ] **Step 4: 두 번 돌려도 안전한지 확인한다**

Run: `node scripts/migrate-to-supabase.mjs`
Expected: 같은 출력, 오류 없음. Supabase 대시보드에서 `cost_records` 가 **54행 그대로**인지 본다(108행이 되면 멱등성이 깨진 것이다).

- [ ] **Step 5: 커밋**

```bash
git add scripts/migrate-to-supabase.mjs
git commit -m "chore: 업로드·비용 원장 이관 스크립트 (멱등)"
```

---

### Task 9: 라이브 관통 확인과 마무리

**Files:**
- Modify: `CLAUDE.md` (실행 방법·상태 갱신)
- Modify: `.gitignore` (선택)

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 없음

- [ ] **Step 1: `data/` 를 백업한다**

```bash
cp -r data ../shotform-data-backup-20260731
```

- [ ] **Step 2: 이전된 것들을 로컬에서 치운다**

```bash
mkdir -p /tmp/shotform-old
mv data/projects /tmp/shotform-old/
mv data/costs.json /tmp/shotform-old/
mv data/uploads /tmp/shotform-old/
```

`data/renders/` 는 **그대로 둔다** — ffmpeg 가 쓴다.

- [ ] **Step 3: 서버를 띄우고 한 바퀴 돈다**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000/create` 로 가서:
1. 자료를 넣고 사진을 한 장 올린다 → 업로드가 Storage 로 가는지 확인(Supabase 대시보드 Storage)
2. 브리핑 → 대본 → 목소리 → **이미지까지** 진행한다
3. 컷 5개가 **전부** `done` 이 되는지 본다 (갱신 유실이 없다는 뜻)
4. Supabase 대시보드에서 `projects` 행 하나와 `cost_records` 가 쌓이는지 본다

> ⚠️ ⑤영상·⑥완성은 유료다(클립 5개 ≈ $2.10). **사장님 승인 뒤에 따로 확인한다.**

- [ ] **Step 4: 이관된 업로드가 같은 URL 로 열리는지 본다**

이전 프로젝트의 사진 URL 하나를 브라우저에 직접 넣는다:
`http://localhost:3000/api/uploads/3ff17aee-9026-430a-966a-aec6e52d3d38.jpg`
Expected: 사진이 보인다 (Storage 에서 온 것이다)

- [ ] **Step 5: `CLAUDE.md` 를 갱신한다**

"## 실행" 절에 추가:

```
저장 계층은 Supabase 다. `.env.local` 에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 가
없으면 **서버가 죽는다** — 조용히 인메모리로 떨어지지 않는다(그러면 재시작 때 다 사라진다).
테스트는 `vitest.setup.js` 가 `SHOTFORM_STORE=memory` 를 세운다.

⚠️ 무료 플랜은 요청이 며칠 없으면 프로젝트가 **일시정지**된다. QA 중에 갑자기 안 되면
대시보드에서 재개한다.

`data/renders/` 만 로컬에 남는다 — ffmpeg 가 로컬 경로와 자식 프로세스를 요구한다.
```

"## 이어서 할 일" 의 저장 계층 항목을 완료로 바꾸고, 다음을 **인증·RLS → 크레딧 → 결제**로 적는다.

- [ ] **Step 6: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 7: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: 저장 계층이 Supabase 로 옮겨진 뒤의 실행 방법"
```

---

## 성공 기준 (스펙과 대조)

- [ ] `npx vitest run` 전부 그린 (Task 1·4·5·6·7)
- [ ] `data/projects`·`costs.json`·`uploads` 없이 앱이 돈다 (Task 9 Step 2~3)
- [ ] 자료 → 브리핑 → 대본 → 목소리 → 이미지 관통 (Task 9 Step 3)
- [ ] 컷 5개 병렬 생성에서 **모든 컷 상태가 남는다** (Task 3 낙관적 락 테스트 + Task 9 Step 3)
- [ ] 비용이 `cost_records` 에 쌓이고 `assertBudget` 이 합계로 동작 (Task 5)
- [ ] 기존 업로드 9개가 **같은 URL 로** 열린다 (Task 8 + Task 9 Step 4)
