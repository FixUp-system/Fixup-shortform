# 마이페이지와 상단 계정 바 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이용자가 이름과 비밀번호를 스스로 고칠 수 있는 `/me` 를 만들고, 계정에 관한 것(크레딧·이름·로그아웃)을 사이드바에서 상단 우측 한 자리로 옮긴다.

**Architecture:** `GET/PATCH /api/me` 와 `POST /api/me/password` 세 라우트를 `withUser` 로 세우고, 상단바(`UserMenu`)와 마이페이지가 **같은 `GET /api/me` 하나**를 쓴다. 이름은 `profiles.display_name` 에 저장한다(게이트가 아니므로 `app_metadata` 가 아니다). 보관함은 이미 `listProjects(ownerId)` 로 회원별로 갈려 있어 **흡수하지 않고 링크로만 잇는다**.

**Tech Stack:** Next.js 15 App Router (JavaScript, TS 아님) · React 19 · Supabase(`@supabase/supabase-js`, `@supabase/ssr`) · vitest

**설계 문서:** `docs/superpowers/specs/2026-08-07-mypage-and-topbar-design.md`

## Global Constraints

- **한국어 문구.** 이용자에게 보이는 모든 문구는 한국어다. 저장소 주석은 이용자를 "사장님"이라 부른다 — 새 주석도 그 어휘를 따른다.
- **TypeScript 를 쓰지 않는다.** `.js` / `.jsx` 만.
- **`tests/design-system.test.js` 가 `app/` 과 `components/` 전체를 훑는다. 아래를 어기면 빨개진다:**
  - `:root` 밖에 **hex 색 리터럴 금지** — 색은 `var(--…)` 토큰만
  - **`var(--accent…)` 는 `.side-step.on` 선택자에서만** 쓸 수 있다. 상단바·마이페이지에 쓰면 실패한다
  - `font-size` 는 **12px · 14px · 16px · 18px · 28px** 만
  - `font-weight` 는 **400 · 600 · 700** 만
  - `border-radius` 는 **`var(--r-card)` · `var(--r-ctl)` · `var(--r-pill)` · `50%` · `inherit` · `0`** 만
  - 그라디언트 금지 · 인라인 `style={{ }}` 는 저장소 전체 합계 10곳 이하
  - 화면 문자열에 `①②③…` 과 `⌂✦▤◫◷⚙⏻▶` 글리프 금지 → 아이콘은 `components/Icon.jsx` 의 SVG 를 쓴다
- **테스트는 인메모리 저장소에 갇혀 있다.** `vitest.setup.js` 가 `SHOTFORM_STORE=memory` 를 세우고 매 테스트 전에 `resetMemoryStore()` 를 부른다. 별도 리셋을 적어도 무해하다.
- **React 렌더 테스트가 없다.** 화면 배선은 소스를 읽어 판정한다(`tests/credits-ui.test.js` 선례).
- **`db/schema.sql` 은 통째로 다시 올려도 안전해야 한다** — `if not exists` · `or replace` 만 쓴다.
- **비밀번호는 응답에도 서버 로그에도 절대 남기지 않는다.**
- 실행: `npx vitest run` (개수는 세지 않는다 — "전부 그린"만 본다)

---

### Task 1: 스토어 — `display_name`·`created_at` 읽기와 `countProjects`

**Files:**
- Modify: `db/schema.sql` (인증·소유자 절, `profiles` 생성문 아래)
- Modify: `lib/store/supabase.js:161-171` (`listProjects` 아래에 `countProjects` 추가) · `:472-480` (`findProfiles`)
- Modify: `lib/store/memory.js:80` 근처(`listProjects` 아래) · `:207-214` (`findProfiles`)
- Create: `lib/display-name.js`
- Test: `tests/store-profile-fields.test.js`

**Interfaces:**
- Produces:
  - `store.findProfiles(ids: string[]) → Map<string, { email, role, status, display_name: string|null, created_at: string }>` — 기존 세 필드에 **두 개가 늘어난다**(기존 소비자는 그대로 돈다)
  - `store.countProjects(ownerId: string) → Promise<number>`
  - `lib/display-name.js` 의 `displayNameOf({ display_name, email }) → string` 와 `NAME_MAX = 20`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/store-profile-fields.test.js` 를 새로 만든다:

```js
// 스토어가 마이페이지에 필요한 것을 주는가. 인메모리 스토어로 판정한다
// (vitest.setup.js 가 SHOTFORM_STORE=memory 를 세운다).
import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { displayNameOf, NAME_MAX } from "../lib/display-name.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("findProfiles — 마이페이지가 쓰는 필드", () => {
  beforeEach(() => resetMemoryStore());

  it("display_name 과 created_at 을 함께 준다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
    await memoryStore.updateProfile(A, { display_name: "윤재찬" });
    const p = (await memoryStore.findProfiles([A])).get(A);
    expect(p.display_name).toBe("윤재찬");
    expect(typeof p.created_at).toBe("string");
    // 기존 소비자(/admin 목록)가 쓰던 필드가 그대로 있어야 한다.
    expect(p.email).toBe("a@b.com");
    expect(p.role).toBe("user");
    expect(p.status).toBe("approved");
  });

  it("이름을 한 번도 안 정했으면 display_name 은 null 이다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });
});

// ★ listProjects().length 로 세면 안 된다 — 그 쿼리에 limit(100) 이 있어
// 영상이 많은 이용자에게 조용히 틀린 숫자를 보여준다. 그래서 세는 자리를 따로 둔다.
describe("countProjects — 소유자별로 센다", () => {
  beforeEach(() => resetMemoryStore());

  it("남의 영상은 안 센다", async () => {
    await memoryStore.insertProject({ id: "p1", created_ts: 1, status: "draft" }, A);
    await memoryStore.insertProject({ id: "p2", created_ts: 2, status: "draft" }, A);
    await memoryStore.insertProject({ id: "p3", created_ts: 3, status: "draft" }, B);
    expect(await memoryStore.countProjects(A)).toBe(2);
    expect(await memoryStore.countProjects(B)).toBe(1);
  });

  it("하나도 없으면 0", async () => {
    expect(await memoryStore.countProjects(A)).toBe(0);
  });
});

describe("displayNameOf — 이름이 없으면 이메일 앞부분", () => {
  it("이름이 있으면 그대로", () => {
    expect(displayNameOf({ display_name: "윤재찬", email: "a@b.com" })).toBe("윤재찬");
  });
  it("없거나 공백뿐이면 이메일의 @ 앞", () => {
    expect(displayNameOf({ display_name: null, email: "jaechan@fix-up.kr" })).toBe("jaechan");
    expect(displayNameOf({ display_name: "   ", email: "jaechan@fix-up.kr" })).toBe("jaechan");
  });
  it("둘 다 없으면 빈 버튼이 생기지 않게 기본 문구", () => {
    expect(displayNameOf({})).toBe("이용자");
  });
  it("상한은 20자다", () => {
    expect(NAME_MAX).toBe(20);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/store-profile-fields.test.js`
Expected: FAIL — `lib/display-name.js` 를 못 찾고(`Cannot find module`), `countProjects is not a function`

> 프로젝트를 넣는 메서드 이름은 **`insertProject(project, ownerId)`** 다(`lib/store/memory.js:30`). `createProject` 가 아니다.

- [ ] **Step 3: `lib/display-name.js` 를 만든다**

```js
// 표시명 한 벌 — 화면과 라우트가 **같은 규칙**을 봐야 한다.
// import 0 개의 순수 모듈이다("use client" 화면에서 안전하게 가져다 쓴다).

export const NAME_MAX = 20;

// 이름이 없으면 이메일의 @ 앞부분. 둘 다 없으면 빈 버튼이 생기지 않게 기본 문구.
export function displayNameOf({ display_name, email } = {}) {
  const name = String(display_name || "").trim();
  if (name) return name;
  const head = String(email || "").split("@")[0];
  return head || "이용자";
}
```

- [ ] **Step 4: `db/schema.sql` 에 컬럼을 더한다**

`profiles` 생성문(`create table if not exists profiles …`) **바로 아래**에 넣는다:

```sql
-- 표시명 — 마이페이지에서 이용자가 직접 고친다(2026-08-07).
-- ★ app_metadata 가 아니라 여기다. app_metadata 는 middleware 가 매 요청 읽는
-- **게이트용 캐시**이고(status·role), 이름은 게이트가 아니다. 거기 두면 원장(profiles)과
-- 이중 쓰기를 지켜야 하는 자리가 하나 더 는다.
alter table profiles add column if not exists display_name text;
```

- [ ] **Step 5: `lib/store/memory.js` 를 고친다**

`findProfiles` 를 이렇게 바꾼다:

```js
  async findProfiles(ids) {
    const out = new Map();
    for (const id of ids) {
      const p = profiles.get(id);
      if (p) out.set(id, {
        email: p.email,
        role: p.role,
        status: p.status,
        display_name: p.display_name ?? null,
        created_at: p.created_at,
      });
    }
    return out;
  },
```

`listProjects` 바로 아래에 더한다:

```js
  async countProjects(ownerId) {
    return [...projects.values()].filter((r) => r.owner_id === ownerId).length;
  },
```

- [ ] **Step 6: `lib/store/supabase.js` 를 고친다**

`findProfiles` 의 `select` 와 매핑을 넓힌다:

```js
  async findProfiles(ids) {
    if (!ids.length) return new Map();
    const { data, error } = await db()
      .from("profiles")
      .select("id, email, role, status, display_name, created_at")
      .in("id", ids);
    if (error) raise(error, "프로필 조회");
    return new Map((data || []).map((p) => [p.id, {
      email: p.email,
      role: p.role,
      status: p.status,
      display_name: p.display_name ?? null,
      created_at: p.created_at,
    }]));
  },
```

`listProjects` 바로 아래에 더한다:

```js
  // ★ listProjects 는 limit(100) 이라 그 길이를 세면 조용히 틀린다. 세는 것은 DB 가 한다.
  async countProjects(ownerId) {
    const { count, error } = await db()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    if (error) raise(error, "프로젝트 수");
    return count ?? 0;
  },
```

- [ ] **Step 7: 테스트가 통과하는지 본다**

Run: `npx vitest run tests/store-profile-fields.test.js`
Expected: PASS

- [ ] **Step 8: 전체 회귀를 돌린다**

Run: `npx vitest run`
Expected: 전부 그린. (`findProfiles` 는 필드가 늘기만 해서 `/admin` 목록은 그대로 돈다.)

- [ ] **Step 9: 커밋**

```bash
git add db/schema.sql lib/display-name.js lib/store/memory.js lib/store/supabase.js tests/store-profile-fields.test.js
git commit -m "feat(store): 표시명·가입일을 읽고 프로젝트 수를 센다"
```

---

### Task 2: `GET /api/me` — 상단바와 마이페이지가 함께 쓰는 한 자리

**Files:**
- Create: `app/api/me/route.js`
- Test: `tests/me-route.test.js`

**Interfaces:**
- Consumes: Task 1 의 `store.findProfiles` · `store.countProjects` · `displayNameOf`
- Produces: `GET /api/me → { email, name, created_at, balance, gated, projectCount }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/me-route.test.js`:

```js
// GET /api/me — 상단바와 마이페이지가 함께 쓴다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

vi.mock("../lib/charges.js", () => ({ balanceFor: async () => 85.18 }));

const { GET } = await import("../app/api/me/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const req = (id, status = "approved") =>
  new Request("http://localhost/api/me", {
    headers: { [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: "user" },
  });

describe("GET /api/me", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("이메일·이름·가입일·잔액·영상 수를 한 번에 준다", async () => {
    await memoryStore.updateProfile(A, { display_name: "윤재찬" });
    await memoryStore.insertProject({ id: "p1", created_ts: 1, status: "draft" }, A);
    const res = await GET(req(A), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("jaechan@fix-up.kr");
    expect(body.name).toBe("윤재찬");
    expect(body.balance).toBe(85.18);
    expect(body.projectCount).toBe(1);
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.gated).toBe("boolean");
  });

  it("이름을 안 정했으면 이메일 앞부분을 준다 — 화면에 빈 자리가 생기지 않게", async () => {
    expect((await (await GET(req(A), {})).json()).name).toBe("jaechan");
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await GET(req(A, "pending"), {})).status).toBe(403);
  });

  it("프로필이 없으면 404 — 조용히 빈 값을 주지 않는다", async () => {
    const ghost = "00000000-0000-4000-8000-00000000ffff";
    expect((await GET(req(ghost), {})).status).toBe(404);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/me-route.test.js`
Expected: FAIL — `Cannot find module '../app/api/me/route.js'`

- [ ] **Step 3: 라우트를 만든다**

`app/api/me/route.js`:

```js
// GET /api/me — 내 정보 한 자리.
//
// 상단바(components/UserMenu.jsx)와 마이페이지(app/me/page.js)가 **이 하나**를 쓴다.
// 이름과 크레딧을 따로 부르면 화면 진입마다 왕복이 두 번이 된다.
//
// GET /api/credits 는 남긴다 — QuickCreate 등이 이미 쓰고 있고 이번 작업의 범위가 아니다.
import { withUser } from "../../../lib/auth/require-user.js";
import { getStore } from "../../../lib/store/index.js";
import { balanceFor } from "../../../lib/charges.js";
import { fakeFal } from "../../../lib/fake.js";
import { displayNameOf } from "../../../lib/display-name.js";

export const GET = withUser(async (_req, _ctx, user) => {
  const store = getStore();
  const profile = (await store.findProfiles([user.id])).get(user.id);
  // 신원은 있는데 원장에 행이 없으면 가입 트리거가 빠진 것이다 — 빈 값으로 덮지 않는다.
  if (!profile) {
    console.error("프로필 행이 없다:", user.id);
    return Response.json({ error: "프로필을 찾을 수 없어요" }, { status: 404 });
  }
  return Response.json({
    email: profile.email,
    name: displayNameOf(profile),
    created_at: profile.created_at ?? null,
    balance: await balanceFor(user.id),
    // ★ gated 는 "잔액 부족"이 아니라 "크레딧 게이트가 켜져 있음"이다(/api/credits 와 같은 규칙).
    // 실모드면 잔액과 무관하게 늘 true 이고, 잔액 판정은 화면이 gated && balance < 가격 으로 한다.
    gated: !fakeFal(),
    projectCount: await store.countProjects(user.id),
  });
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/me-route.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/me/route.js tests/me-route.test.js
git commit -m "feat(api): GET /api/me — 이름·가입일·잔액·영상 수를 한 번에"
```

---

### Task 3: `PATCH /api/me` — 이름만 고친다

**Files:**
- Modify: `app/api/me/route.js` (같은 파일에 `PATCH` 를 더한다)
- Modify: `tests/me-route.test.js` (같은 파일에 describe 를 더한다)

**Interfaces:**
- Consumes: Task 1 의 `NAME_MAX` · `store.updateProfile`
- Produces: `PATCH /api/me` — 몸통 `{ name: string }`, 응답 `{ ok: true }`

- [ ] **Step 1: 실패하는 테스트를 더한다**

`tests/me-route.test.js` 맨 위 import 를 `const { GET, PATCH } = await import(...)` 로 바꾸고, 파일 끝에 더한다:

```js
const patch = (id, body, status = "approved") =>
  new Request("http://localhost/api/me", {
    method: "PATCH",
    headers: {
      [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("PATCH /api/me", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("이름을 저장한다", async () => {
    expect((await PATCH(patch(A, { name: "윤재찬" }), {})).status).toBe(200);
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe("윤재찬");
  });

  it("앞뒤 공백을 떼고 저장한다", async () => {
    await PATCH(patch(A, { name: "  윤재찬  " }), {});
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe("윤재찬");
  });

  it("공백만 넣으면 null 로 되돌린다 — 이메일 폴백으로 돌아간다", async () => {
    await PATCH(patch(A, { name: "윤재찬" }), {});
    await PATCH(patch(A, { name: "   " }), {});
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });

  it("21자는 400 이고 저장되지 않는다", async () => {
    const long = "가".repeat(21);
    expect((await PATCH(patch(A, { name: long }), {})).status).toBe(400);
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });

  it("name 이 없으면 400", async () => {
    expect((await PATCH(patch(A, {}), {})).status).toBe(400);
  });

  // ★ 권한 상승 자리 — 몸통에 무엇을 실어 보내도 이름 말고는 반영되지 않아야 한다.
  it("role·status 를 실어 보내도 안 바뀐다", async () => {
    await PATCH(patch(A, { name: "윤재찬", role: "admin", status: "approved", email: "evil@x.com" }), {});
    const p = (await memoryStore.findProfiles([A])).get(A);
    expect(p.role).toBe("user");
    expect(p.email).toBe("jaechan@fix-up.kr");
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await PATCH(patch(A, { name: "윤재찬" }, "pending"), {})).status).toBe(403);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/me-route.test.js`
Expected: FAIL — `PATCH is not a function`

- [ ] **Step 3: `PATCH` 를 더한다**

`app/api/me/route.js` 의 import 에 `NAME_MAX` 를 더하고(`import { displayNameOf, NAME_MAX } from "../../../lib/display-name.js";`), 파일 끝에 붙인다:

```js
// PATCH /api/me — 이름만 고친다.
//
// ★ 몸통을 그대로 updateProfile 에 넘기면 status·role 이 함께 넘어간다(권한 상승).
// 화이트리스트로 이름 하나만 뽑는다.
export const PATCH = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.name !== "string") {
    return Response.json({ error: "이름을 넣어 주세요" }, { status: 400 });
  }
  const name = body.name.trim();
  if (name.length > NAME_MAX) {
    return Response.json({ error: `이름은 ${NAME_MAX}자까지예요` }, { status: 400 });
  }
  // 빈 이름은 지우는 것으로 본다 — null 이면 화면이 이메일 앞부분으로 돌아간다.
  await getStore().updateProfile(user.id, { display_name: name || null });
  return Response.json({ ok: true });
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/me-route.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/me/route.js tests/me-route.test.js
git commit -m "feat(api): PATCH /api/me — 이름을 화이트리스트로만 고친다"
```

---

### Task 4: `POST /api/me/password` — 현재 비밀번호를 다시 묻는다

**Files:**
- Create: `app/api/me/password/route.js`
- Test: `tests/me-password-route.test.js`

**Interfaces:**
- Consumes: Task 1 의 `store.findProfiles`(이메일이 필요하다 — 재검증에 쓴다)
- Produces: `POST /api/me/password` — 몸통 `{ current: string, next: string }`, 응답 `{ ok: true }`

**왜 이 태스크가 까다로운가 — 두 함정**

1. Supabase 의 `updateUser({ password })` 는 **현재 비밀번호를 묻지 않는다.** 세션만 살아 있으면 바뀐다. 그대로 열면 이용자가 자리를 비운 사이 남이 비밀번호를 바꿔 계정을 통째로 가져간다.
2. 재검증하려고 **쿠키에 붙은 클라이언트**로 `signInWithPassword` 를 부르면 **세션 쿠키를 덮어쓴다**. 확인만 하려던 것이 지금 로그인 상태를 건드린다. 그래서 `persistSession: false` 로 만든 별도 클라이언트로 확인하고 결과는 버린다. (`lib/auth/supabase-server.js` 의 `authClient` 를 **여기서 쓰면 안 된다**.)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/me-password-route.test.js`:

```js
// POST /api/me/password — 본인이 바꾼다. 현재 비밀번호를 다시 묻는 것이 핵심이다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const signInWithPassword = vi.fn();
const updateUserById = vi.fn();
const createClient = vi.fn(() => ({
  auth: { signInWithPassword, admin: { updateUserById } },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a) => createClient(...a) }));

const { POST } = await import("../app/api/me/password/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const req = (id, body, status = "approved") =>
  new Request("http://localhost/api/me/password", {
    method: "POST",
    headers: {
      [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

const logged = (spy) => spy.mock.calls.flat().map((a) => String(a)).join(" ");

describe("POST /api/me/password", () => {
  beforeEach(async () => {
    resetMemoryStore();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    signInWithPassword.mockResolvedValue({ data: { user: { id: A } }, error: null });
    updateUserById.mockResolvedValue({ error: null });
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("현재 비밀번호가 맞으면 바꾼다", async () => {
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "jaechan@fix-up.kr", password: "old-pass-1",
    });
    expect(updateUserById).toHaveBeenCalledWith(A, { password: "new-pass-1" });
  });

  // ★ 이 테스트가 이 태스크의 존재 이유다.
  it("현재 비밀번호가 틀리면 401 이고 **비밀번호가 안 바뀐다**", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const res = await POST(req(A, { current: "wrong", next: "new-pass-1" }), {});
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/현재 비밀번호/);
    expect(updateUserById).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ★ 확인만 하려던 것이 지금 세션을 끊으면 안 된다 — 확인용 클라이언트는 쿠키를 안 쓴다.
  it("재검증용 클라이언트는 anon 키에 persistSession:false 다", async () => {
    await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(createClient).toHaveBeenNthCalledWith(
      1, "https://example.supabase.co", "anon-key",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) })
    );
  });

  it("쿠키 세션 클라이언트(authClient)를 import 하지 않는다", () => {
    const src = readFileSync("app/api/me/password/route.js", "utf8");
    expect(src).not.toMatch(/supabase-server/);
  });

  it("새 비밀번호가 6자 미만이면 400 이고 Supabase 를 부르지 않는다", async () => {
    const res = await POST(req(A, { current: "old-pass-1", next: "12345" }), {});
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("현재 비밀번호가 비어 있으면 400", async () => {
    expect((await POST(req(A, { current: "", next: "new-pass-1" }), {})).status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  // 인프라 실패를 "비밀번호가 틀렸다"로 위장하면 이용자는 고칠 것도 없는데 계속 다시 누른다.
  it("Supabase 5xx 는 401 이 아니라 500 이다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Service unavailable", status: 503 } });
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(500);
    expect(updateUserById).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("응답에도 서버 로그에도 비밀번호가 없다", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const body = await (await POST(req(A, { current: "s3cret-old", next: "s3cret-new" }), {})).text();
    expect(body).not.toContain("s3cret-old");
    expect(body).not.toContain("s3cret-new");
    expect(logged(errSpy)).not.toContain("s3cret-old");
    expect(logged(logSpy)).not.toContain("s3cret-new");
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }, "pending"), {})).status).toBe(403);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/me-password-route.test.js`
Expected: FAIL — `Cannot find module '../app/api/me/password/route.js'`

- [ ] **Step 3: 라우트를 만든다**

`app/api/me/password/route.js`:

```js
// POST /api/me/password — 로그인한 본인이 비밀번호를 바꾼다.
//
// 운영자 재설정(/api/admin/users/[id]/password)과 다른 문이다. 그쪽은 비밀번호를 **잊은**
// 사람을 위해 운영자가 대신 바꿔 준다. 이 문은 비밀번호를 **아는** 사람이 스스로 바꾼다.
// (비밀번호 찾기는 여전히 없다 — 메일 왕복이 필요해 매직링크를 걷어낸 이유로 되돌아간다.)
//
// ★ Supabase 의 updateUser({password}) 는 현재 비밀번호를 **묻지 않는다** — 세션만 살아
// 있으면 바뀐다. 그대로 열면 이용자가 자리를 비운 사이 남이 비밀번호를 바꿔 계정을 통째로
// 가져간다. 그래서 여기서 현재 비밀번호를 다시 묻는다.
//
// ★ 재검증이 지금 세션을 흔들면 안 된다. 쿠키에 붙은 클라이언트(lib/auth/supabase-server.js
// 의 authClient)로 signInWithPassword 를 부르면 세션 쿠키를 덮어쓴다 — 확인만 하려던 것이
// 로그인 상태를 건드린다. persistSession:false 로 만든 **별도 클라이언트**로 확인하고
// 결과는 버린다. (매직링크 시절 middleware 가 공개 경로에서 쿠키를 건드려 PKCE verifier 를
// 지웠던 사고와 같은 계열이다 — 인증 쿠키는 의도한 자리에서만 만진다.)
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getStore } from "../../../../lib/store/index.js";

const MIN_LENGTH = 6;   // 운영자 재설정 라우트와 같은 값

// supabase-js 는 네트워크 실패·5xx 를 던지지 않고 error 로 준다(status 0 또는 5xx).
// 그것까지 "비밀번호가 틀렸다"로 답하면 이용자는 고칠 것도 없는데 자기 입력을 의심한다.
function isInfra(error) {
  const s = error?.status;
  return typeof s === "number" && (s === 0 || s >= 500);
}

export const POST = withUser(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";

  if (!current) {
    return Response.json({ error: "현재 비밀번호를 넣어 주세요" }, { status: 400 });
  }
  if (next.length < MIN_LENGTH) {
    return Response.json({ error: `새 비밀번호는 ${MIN_LENGTH}자 이상이어야 해요` }, { status: 400 });
  }

  const profile = (await getStore().findProfiles([user.id])).get(user.id);
  if (!profile) {
    console.error("프로필 행이 없다:", user.id);
    return Response.json({ error: "프로필을 찾을 수 없어요" }, { status: 404 });
  }

  // ① 현재 비밀번호 재검증 — 쿠키를 건드리지 않는 별도 클라이언트. 결과는 버린다.
  const checker = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await checker.auth.signInWithPassword({
    email: profile.email,
    password: current,
  });
  if (wrong) {
    if (isInfra(wrong)) {
      console.error("인증 서버 오류:", wrong.status, wrong.message);
      return Response.json(
        { error: "인증 서버에 연결하지 못했어요 — 잠시 후 다시 시도해 주세요" },
        { status: 500 }
      );
    }
    // ★ 로그인 라우트의 "한 문구" 계약은 여기 적용되지 않는다 — 이미 로그인한 본인의
    // 계정이라 숨길 대상이 없고, 숨기면 무엇을 고쳐야 할지 알 수 없다.
    console.error("현재 비밀번호 확인 실패:", wrong.message);
    return Response.json({ error: "현재 비밀번호가 맞지 않아요" }, { status: 401 });
  }

  // ② 변경 — service_role.
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) {
    console.error("비밀번호 변경 실패:", error.message);
    return Response.json({ error: "비밀번호를 바꾸지 못했어요" }, { status: 502 });
  }

  // 감사 — 누가 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 변경] ${user.id} 본인`);
  return Response.json({ ok: true });
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/me-password-route.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/me/password/route.js tests/me-password-route.test.js
git commit -m "feat(api): 본인 비밀번호 변경 — 현재 비밀번호를 다시 묻는다"
```

---

### Task 5: 마이페이지 `/me`

**Files:**
- Create: `app/me/page.js`
- Modify: `app/globals.css` (파일 끝에 `/* ── 마이페이지 */` 절을 더한다)
- Test: `tests/me-ui.test.js`

**Interfaces:**
- Consumes: Task 2·3·4 의 세 라우트 · `NAME_MAX`
- Produces: `/me` 경로(상단바가 Task 6 에서 링크한다)

**middleware 를 손대지 않는다** — `matcher` 가 이미 전 경로를 덮는다. `/me` 는 공개도 아니고(`PUBLIC_PATHS` 그대로) 사이드바도 있다(`BARE_PATHS` 그대로). 승인 대기자는 기존 규칙대로 `/pending` 으로 튕긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/me-ui.test.js`:

```js
// 화면 배선을 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// credits-ui.test.js·staleness-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const me = strip(readFileSync("app/me/page.js", "utf8"));

describe("마이페이지", () => {
  it("서버에서 내 정보를 읽는다", () => {
    expect(me).toMatch(/\/api\/me/);
  });

  it("이름을 PATCH 로 저장한다", () => {
    expect(me).toMatch(/method:\s*["']PATCH["']/);
  });

  it("비밀번호 변경에 **현재 비밀번호** 칸이 있다", () => {
    expect(me).toMatch(/current/);
    expect(me).toMatch(/현재 비밀번호/);
  });

  it("새 비밀번호를 두 번 받아 화면에서 먼저 맞춰 본다", () => {
    expect(me).toMatch(/confirm/);
  });

  // ★ 라우트가 비밀번호를 바꾸면서 **지금 브라우저 세션까지 끊는다**(scope: global).
  // 화면이 signedOut 을 안 읽으면 사장님은 "비밀번호를 바꿨어요"를 본 직후 아무 안내 없이
  // 로그인 화면으로 튕긴다 — 무슨 일이 났는지 알 방법이 없다.
  it("세션이 끊겼으면 다시 로그인해야 한다고 알리고 로그인 화면으로 보낸다", () => {
    expect(me).toMatch(/signedOut/);
    expect(me).toMatch(/다시 로그인/);
    expect(me).toMatch(/\/login/);
  });

  it("이메일은 바꿀 수 없다고 알린다 — 빈 입력칸을 두면 눌러 보게 된다", () => {
    expect(me).toMatch(/바꿀 수 없어요/);
  });

  it("보관함으로 잇는다 — 흡수하지 않는다", () => {
    expect(me).toMatch(/\/archive/);
  });

  it("이름 상한을 손으로 적지 않고 가격표처럼 한 곳에서 가져온다", () => {
    expect(me).toMatch(/NAME_MAX/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/me-ui.test.js`
Expected: FAIL — `ENOENT: app/me/page.js`

- [ ] **Step 3: 페이지를 만든다**

`app/me/page.js`:

```js
"use client";

// 마이페이지 — 이용자가 스스로 고칠 수 있는 것만 둔다(이름·비밀번호).
//
// 보관함은 흡수하지 않는다. listProjects(ownerId) 가 이미 소유자를 필수 인자로 요구해
// 회원별로 갈려 있다 — 잘 도는 화면을 옮기면 회귀 위험만 생긴다. 링크로만 잇는다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NAME_MAX } from "../../lib/display-name";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [busy, setBusy] = useState("");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function load() {
    const r = await fetch("/api/me");
    if (!r.ok) return;
    const d = await r.json();
    setMe(d);
    setName(d.name);
  }
  useEffect(() => { load(); }, []);

  async function saveName(e) {
    e.preventDefault();
    setBusy("name");
    setNameMsg("");
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "저장하지 못했어요");
      setNameMsg("저장했어요");
      await load();
    } catch (err) {
      setNameMsg(err.message);
    } finally {
      setBusy("");
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    // 두 번 받은 값을 화면에서 먼저 맞춰 본다 — 서버까지 갔다 오지 않아도 아는 실수다.
    if (next !== confirm) {
      setPwMsg("새 비밀번호가 서로 달라요");
      return;
    }
    setBusy("pw");
    setPwMsg("");
    try {
      const r = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "바꾸지 못했어요");
      setCurrent(""); setNext(""); setConfirm("");
      // ★ 서버가 살아 있는 세션을 전부 끊는다(scope: global) — 자리를 비운 사이 이미
      // 들어와 있던 사람을 쫓아내려면 그래야 한다. 지금 브라우저도 함께 끊기므로
      // 그 사실을 먼저 알리고 로그인 화면으로 보낸다. 이 안내가 없으면 사장님은
      // "바꿨어요"를 본 직후 아무 설명 없이 튕긴다.
      if (d.signedOut) {
        setPwMsg("비밀번호를 바꿨어요 — 안전을 위해 모든 기기에서 로그아웃했어요. 다시 로그인해 주세요.");
        setTimeout(() => router.push("/login"), 1500);
        return;
      }
      setPwMsg("비밀번호를 바꿨어요");
    } catch (err) {
      setPwMsg(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1 className="pgtitle">내 정보</h1>
      <p className="pgsub">이름과 비밀번호를 여기서 바꿀 수 있어요.</p>

      <section className="panel me-panel">
        <h2 className="me-h">내 정보</h2>
        <form className="me-form" onSubmit={saveName}>
          <label className="me-row">
            <span className="me-label">이름</span>
            <input
              className="sent-input"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="화면에 보일 이름"
            />
          </label>
          <button className="cta" disabled={busy === "name"}>저장</button>
        </form>
        {nameMsg && <p className="pgsub">{nameMsg}</p>}

        <div className="me-row">
          <span className="me-label">이메일</span>
          <span className="me-value mono">{me ? me.email : "…"}</span>
          <span className="me-note">바꿀 수 없어요</span>
        </div>
        <div className="me-row">
          <span className="me-label">가입일</span>
          <span className="me-value">{me?.created_at ? me.created_at.slice(0, 10) : "…"}</span>
        </div>
      </section>

      <section className="panel me-panel">
        <h2 className="me-h">비밀번호 변경</h2>
        <p className="pgsub">
          지금 쓰는 비밀번호를 함께 넣어 주세요 — 자리를 비운 사이 다른 사람이 바꾸지 못하게 합니다.
          바꾸면 <b>모든 기기에서 로그아웃</b>되니 다시 로그인해 주세요.
        </p>
        <form className="me-form" onSubmit={changePassword}>
          <label className="me-row">
            <span className="me-label">현재 비밀번호</span>
            <input className="sent-input" type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="me-row">
            <span className="me-label">새 비밀번호</span>
            <input className="sent-input" type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="me-row">
            <span className="me-label">새 비밀번호 확인</span>
            <input className="sent-input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button className="cta" disabled={busy === "pw"}>바꾸기</button>
        </form>
        {pwMsg && <p className="pgsub">{pwMsg}</p>}
      </section>

      <section className="panel me-panel">
        <div className="me-row">
          <span className="me-value">내 영상 {me ? me.projectCount : "…"}편</span>
          <Link href="/archive" className="back-link">보관함 열기</Link>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: CSS 를 더한다**

`app/globals.css` 끝에 붙인다. **hex 색·`--accent`·허용 밖 font-size/weight/radius 를 쓰지 않는다**(Global Constraints):

```css
/* ── 마이페이지 */
.me-panel { margin-bottom: 16px; }
.me-h { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.me-form { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
.me-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.me-label { flex: none; width: 120px; font-size: 14px; color: var(--ink-soft); }
.me-value { font-size: 14px; }
.me-note { font-size: 12px; color: var(--ink-soft); }
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/me-ui.test.js tests/design-system.test.js`
Expected: 둘 다 PASS

> `design-system.test.js` 가 빨개지면 위 Global Constraints 목록에서 어긴 항목을 찾는다. 흔한 것: hex 색, `font-size: 13px` 같은 허용 밖 값, `style={{ }}` 총량 초과.

- [ ] **Step 6: 브라우저로 실제로 본다**

```bash
npx next dev -p 3000
```

`http://localhost:3000/me` 를 열어 ① 이름이 채워져 보이는지 ② 이름을 바꾸고 [저장] 하면 "저장했어요" 가 뜨는지 ③ 새 비밀번호 두 칸을 다르게 넣으면 서버로 가기 전에 "서로 달라요" 가 뜨는지 본다.

> ⚠️ **dev 서버를 켜둔 채 `npm run build` 를 돌리지 마라** — `.next` 가 덮여 dev 서버가 죽는다.
> ⚠️ **로그인 화면·다른 계정으로 보려면 `.env.local` 의 `SHOTFORM_DEV_USER` 를 비워야 한다.** PowerShell 의 `$env:X=""` 는 변수를 **삭제**해 `.env.local` 값이 되살아난다 — bash 로 `export SHOTFORM_DEV_USER="" && npx next dev -p 3005` 처럼 띄운다.

- [ ] **Step 7: 커밋**

```bash
git add app/me/page.js app/globals.css tests/me-ui.test.js
git commit -m "feat(me): 마이페이지 — 이름·비밀번호를 스스로 고친다"
```

---

### Task 6: 상단 계정 바

**Files:**
- Modify: `components/Icon.jsx:10-35` (`caret`·`user` 추가)
- Create: `components/UserMenu.jsx`
- Modify: `components/AppShell.jsx:31-33` (`.belt` 안에 넣는다)
- Modify: `app/globals.css:49-63` (`.belt`) + 파일 끝에 `/* ── 상단 계정 바 */` 절
- Test: `tests/topbar-ui.test.js`

**Interfaces:**
- Consumes: Task 2 의 `GET /api/me` · Task 5 의 `/me` 경로
- Produces: `components/UserMenu.jsx` (기본 export, props 없음)

**이 태스크는 사이드바를 아직 건드리지 않는다.** 크레딧이 잠시 두 곳에 보인다 — Task 7 에서 사이드바 쪽을 뺀다. 그래야 두 태스크를 따로 리뷰할 수 있다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/topbar-ui.test.js`:

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
const shell = strip(readFileSync("components/AppShell.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("상단 계정 바", () => {
  it("내 정보를 서버에서 한 번에 읽는다 — 이름과 크레딧을 따로 부르지 않는다", () => {
    expect(menu).toMatch(/\/api\/me/);
    expect(menu).not.toMatch(/\/api\/credits/);
  });

  it("마이페이지와 로그아웃을 담는다", () => {
    expect(menu).toMatch(/\/me/);
    expect(menu).toMatch(/로그아웃/);
    expect(menu).toMatch(/signOut/);
  });

  it("잔액을 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/balance/);
    expect(menu).toMatch(/크레딧/);
  });

  it("드롭다운이 Esc 와 바깥 클릭으로 닫힌다", () => {
    expect(menu).toMatch(/Escape/);
    expect(menu).toMatch(/aria-expanded/);
  });

  it("AppShell 이 상단 띠에 붙인다", () => {
    expect(shell).toMatch(/UserMenu/);
  });

  // BETA 문구는 화면 가운데를 지켜야 한다 — 우측 묶음을 그냥 더하면 왼쪽으로 밀린다.
  it("띠가 좌·중·우 3영역이다", () => {
    expect(css).toMatch(/\.belt-side/);
    expect(css).toMatch(/\.belt-mid/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/topbar-ui.test.js`
Expected: FAIL — `ENOENT: components/UserMenu.jsx`

- [ ] **Step 3: 아이콘 둘을 더한다**

`components/Icon.jsx` 의 `PATHS` 에 더한다(색은 반드시 `currentColor` — 이 파일은 hex 를 쓰면 `design-system.test.js` 가 빨개진다):

```js
  caret: <path d="M6 9.5l6 6 6-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
```

- [ ] **Step 4: `UserMenu` 를 만든다**

`components/UserMenu.jsx`:

```js
"use client";

// 상단 우측 계정 묶음 — 크레딧 잔액 + 이름 버튼 + 드롭다운(마이페이지·로그아웃).
//
// 사이드바에 흩어져 있던 "내 계정에 관한 것"을 한 자리로 모은다.
// 로그인·승인대기 화면에는 자동으로 안 나온다 — AppShell 이 isBarePath 로 갈라
// .belt 자체를 안 그린다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Icon from "./Icon";

// 사이드바에 있던 것을 그대로 옮겼다(새로 쓰지 않는다).
async function handleLogout(router) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  await supabase.auth.signOut();
  router.push("/login");
}

export default function UserMenu() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  // 진입 때 한 번 읽는다. 실패하면 조용히 숨긴다 — 상단 띠가 오류로 시끄러워질 자리가 아니다.
  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setMe(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 바깥 클릭·Esc 로 닫는다. 열려 있을 때만 듣는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;

  return (
    <div className="um" ref={box}>
      <span className="um-credit">크레딧 <b>{me.balance}</b></span>
      <button
        className="um-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="ic"><Icon name="user" size={16} /></span>
        {me.name}
        <span className="ic"><Icon name="caret" size={14} /></span>
      </button>
      {open && (
        <div className="um-menu" role="menu">
          <Link href="/me" className="um-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="ic"><Icon name="gear" size={16} /></span>마이페이지
          </Link>
          <button className="um-item" role="menuitem" onClick={() => handleLogout(router)}>
            <span className="ic"><Icon name="power" size={16} /></span>로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `AppShell` 이 붙인다**

`components/AppShell.jsx` 에 `import UserMenu from "./UserMenu";` 를 더하고 `.belt` 을 바꾼다:

```jsx
      <div className="belt">
        <span className="belt-side" />
        <span className="belt-mid">
          <b>BETA</b> 시험 서비스 — 대본부터 완성까지 자동으로 만듭니다
        </span>
        <span className="belt-side belt-right">
          <UserMenu />
        </span>
      </div>
```

- [ ] **Step 6: CSS 를 고친다**

`app/globals.css` 의 `.belt` 규칙에서 `justify-content: center;` 를 빼고 `padding: 0 16px;` 를 더한 뒤, 그 아래에 3영역 규칙을 붙인다:

```css
/* BETA 안내는 화면 가운데를 지킨다 — 우측 계정 묶음을 그냥 더하면 문구가 왼쪽으로 밀린다.
   좌·우 영역을 같은 flex 로 두면 가운데가 정확히 화면 중앙에 선다(오른쪽만 채워도). */
.belt-side { flex: 1; display: flex; align-items: center; gap: 12px; min-width: 0; }
.belt-right { justify-content: flex-end; }
.belt-mid { display: flex; align-items: center; gap: 10px; flex: none; }
```

파일 끝에 계정 묶음 규칙을 더한다:

```css
/* ── 상단 계정 바 */
.um { position: relative; display: flex; align-items: center; gap: 12px; }
.um-credit { font-size: 12px; color: var(--ink-soft); white-space: nowrap; }
/* ★ 이미 있는 `.belt b` 가 BETA 배지를 만든다 — 계정 묶음이 .belt 안에 들어가므로
   여기 <b> 도 그 규칙을 받아 **크레딧 숫자가 배지처럼 보인다.** 구체성이 같아(선택자
   둘 다 클래스 1 + 요소 1) 나중에 오는 이 규칙이 이기지만, 배경·패딩은 덮지 않으면
   그대로 남는다. 명시적으로 되돌린다.
   (로그인 화면에서 전역 `h1.pgtitle` 의 margin 단축이 수정을 덮었던 것과 같은 계열이다.) */
.um-credit b {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-weight: 600;
  color: var(--ink);
}
.um-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--r-ctl);
  padding: 4px 8px;
  cursor: pointer;
}
.um-btn:hover { background: var(--surface2); }
.um-menu {
  position: absolute;
  right: 0;
  top: 34px;
  min-width: 168px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  padding: 6px;
  z-index: 40;
}
.um-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  text-align: left;
  text-decoration: none;
  border-radius: var(--r-ctl);
  padding: 8px;
  cursor: pointer;
}
.um-item:hover { background: var(--surface2); }
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npx vitest run tests/topbar-ui.test.js tests/design-system.test.js`
Expected: 둘 다 PASS

- [ ] **Step 8: 브라우저로 실제로 본다**

`npx next dev -p 3000` 으로 띄우고 아무 화면에서 ① BETA 문구가 **여전히 화면 가운데**인지 ② 우측에 크레딧과 이름이 보이는지 ③ **크레딧 숫자가 BETA 처럼 배지 모양이 아닌지**(`.belt b` 를 되돌리지 않으면 그렇게 보인다) ④ 이름을 누르면 메뉴가 열리고 **바깥을 클릭하거나 Esc 를 누르면 닫히는지** ⑤ [마이페이지]가 `/me` 로 가는지 ⑥ [로그아웃]이 `/login` 으로 보내는지 확인한다.

> 시각 규칙은 소스 검사로 못 잡는다 — `design-system.test.js` 는 토큰과 값의 목록만 본다. 로그인 화면 작업에서 "`min-height` 로는 52px 이 안 나온다"·"제목과 카드의 정렬 축이 갈렸다"를 **브라우저로 재서야** 잡았다. 이 단계를 건너뛰지 않는다.

- [ ] **Step 9: 커밋**

```bash
git add components/Icon.jsx components/UserMenu.jsx components/AppShell.jsx app/globals.css tests/topbar-ui.test.js
git commit -m "feat(topbar): 상단 우측에 크레딧·이름·계정 메뉴"
```

---

### Task 7: 사이드바 정리와 테스트 이전

**Files:**
- Modify: `components/Sidebar.jsx` — `handleLogout`(`:13-20`) · `/api/credits` fetch(`:70-78`) · 로그아웃 버튼(`:116-118`) · 크레딧 상자(`:120-128`) 제거
- Modify: `app/globals.css` — `.credit-box` 규칙 제거
- Modify: `tests/credits-ui.test.js:21-24` — 판정 대상을 사이드바에서 상단바로 옮긴다
- Test: `tests/topbar-ui.test.js` (사이드바에 더는 없다는 단정을 더한다)

**Interfaces:**
- Consumes: Task 6 의 `components/UserMenu.jsx`
- Produces: 없음(제거 태스크)

**"설정 준비 중" 버튼은 그대로 둔다** — 앱 설정은 계정 정보와 다른 것이라, 지금 합치면 나중에 다시 갈라야 한다.

- [ ] **Step 1: 테스트를 먼저 옮긴다(실패하게)**

`tests/credits-ui.test.js` 의 `:21-24` 를 **지우지 말고** 이렇게 바꾼다. 크레딧이 화면에서 조용히 사라지는 회귀는 계속 막아야 한다:

```js
  // 2026-08-07: 크레딧이 사이드바에서 상단 계정 바로 옮겨갔다. 판정 대상만 옮긴다 —
  // 이 단정을 지우면 "크레딧이 화면에서 사라지는" 회귀를 아무도 못 잡는다.
  it("상단 계정 바가 잔액을 서버에서 읽어 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/\/api\/me/);
    expect(menu).toMatch(/balance/);
  });
```

같은 파일 위쪽 상수 목록에 더한다:

```js
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
```

그리고 `tests/topbar-ui.test.js` 끝에 더한다:

```js
// 두 곳에 남으면 한쪽이 조용히 낡는다 — 옮겼으면 옛 자리는 비어 있어야 한다.
describe("사이드바 — 계정에 관한 것이 더는 없다", () => {
  const side = strip(readFileSync("components/Sidebar.jsx", "utf8"));
  it("로그아웃이 없다", () => {
    expect(side).not.toMatch(/로그아웃/);
    expect(side).not.toMatch(/signOut/);
  });
  it("크레딧을 읽지도 보여주지도 않는다", () => {
    expect(side).not.toMatch(/\/api\/credits/);
    expect(side).not.toMatch(/credit-box/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/topbar-ui.test.js`
Expected: FAIL — 사이드바에 아직 "로그아웃"·`credit-box` 가 있다

- [ ] **Step 3: `Sidebar.jsx` 에서 뺀다**

지울 것 넷:
1. `handleLogout` 함수 전체와 `createBrowserClient`·`useRouter` import (다른 곳에서 안 쓰면)
2. `credits` state 와 그것을 채우는 `useEffect`(`/api/credits` fetch)
3. 로그아웃 버튼 `<button className="side-item" onClick={() => handleLogout(router)}>…</button>`
4. `<div className="credit-box">…</div>` 블록

`useState`·`useEffect` 를 더는 안 쓰면 import 에서도 뺀다. `<div className="side-grow" />` 는 **남긴다** — 크레딧 상자가 없어도 목록을 위로 붙여 두는 역할이 있다.

- [ ] **Step 4: `.credit-box` CSS 를 지운다**

`app/globals.css` 의 `.credit-box`·`.credit-box b`·`.credit-box small` 규칙을 지운다. 남겨 두면 아무도 안 쓰는 규칙이 쌓인다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/topbar-ui.test.js tests/credits-ui.test.js`
Expected: 둘 다 PASS

- [ ] **Step 6: 전체 회귀**

Run: `npx vitest run`
Expected: 전부 그린

- [ ] **Step 7: 브라우저로 마지막 확인**

`npx next dev -p 3000` — 사이드바에 로그아웃·크레딧이 **없고**, 상단 우측에 **있고**, 사이드바 목록이 어색하게 벌어지지 않았는지 본다.

- [ ] **Step 8: 커밋**

```bash
git add components/Sidebar.jsx app/globals.css tests/credits-ui.test.js tests/topbar-ui.test.js
git commit -m "refactor(sidebar): 로그아웃·크레딧을 상단 계정 바로 넘긴다"
```

---

## 라이브 반영 (구현 뒤, 사용자 요청이 있을 때만)

- **`db/schema.sql` 을 통째로 다시 올려야 `display_name` 컬럼이 생긴다.** 안 올리면 `GET /api/me` 가 `column profiles.display_name does not exist` 로 500 이다(2026-08-06 크레딧 이관 때와 같은 모양).
- 대시보드 SQL Editor 가 유일한 경로다 — DDL 이라 `service_role` 키(PostgREST)로는 안 되고, 이 PC 에 `DATABASE_URL`·supabase CLI·`psql` 이 없다.
- **커밋·푸시(=Vercel 배포)는 자동으로 하지 않는다.** 사용자가 요청할 때만.
