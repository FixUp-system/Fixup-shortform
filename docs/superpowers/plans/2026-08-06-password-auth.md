# 회원가입·비밀번호 로그인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매직링크를 걷어내고 이메일+비밀번호 회원가입·로그인으로 바꾼다 — 메일 왕복이 사라지고, 사람마다 계정을 갖는 축(소유자·actor·크레딧)은 그대로 남는다.

**Architecture:** 서버 라우트 둘(`/api/auth/signup`·`/api/auth/login`)이 `authClient(cookieStore)`(anon 키 + 쿠키 어댑터, 이미 있음)로 Supabase 를 부르고 세션 쿠키를 세운다. 세션이 선 뒤는 지금과 완전히 같다 — middleware·`withUser`·`owner_id`·`actor`·크레딧·RLS 무수정. 화면은 `/login` 한 페이지에 탭 둘.

**Tech Stack:** Next.js 15 (App Router, JS), `@supabase/ssr`, Vitest 4.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-06-password-auth-design.md`
- **이메일 인증을 받지 않는다** — 가입 즉시 로그인. 승인제(`status='pending'`)가 방어선이다
- 승인제·middleware·`withUser`·`owner_id`·`actor`·크레딧·RLS는 **무수정**
- 공개 경로는 `/login`·`/api/auth/signup`·`/api/auth/login` **셋뿐**. `/auth/callback` 은 목록에서 뺀다
- **로그인 실패는 한 가지 문구·한 가지 상태코드** — 어느 이메일이 가입돼 있는지 흘리지 않는다. 가입 실패는 원인을 풀어 준다(사용자에게 필요한 정보다)
- 비밀번호를 응답·로그에 싣지 않는다
- 개발 우회 `SHOTFORM_DEV_USER` 는 남긴다
- 런타임 의존성 추가 금지, UI·메시지·주석 전부 한국어
- `npx vitest run` 전체 그린 유지. 커밋은 태스크마다. 커밋 전 `git branch --show-current` 로 `feature/video-compose` 확인, `git add` 는 명시 경로만
- ⚠️ 3000·3001 포트에 사용자 서버가 떠 있다. 빌드가 필요하면 `next.config.mjs` 의 기존 `SHOTFORM_DIST_DIR` 스위치를 쓰고 그 파일은 **커밋하지 마라**

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `app/api/auth/signup/route.js` | 가입 → 세션 쿠키 |
| Create `app/api/auth/login/route.js` | 로그인 → 세션 쿠키 |
| Modify `lib/auth/paths.js:25` | 공개 경로 교체 |
| Rewrite `app/login/page.js` | 탭 둘(로그인/회원가입), 비밀번호 입력 |
| Delete `app/auth/callback/route.js` | 발급처가 사라져 죽은 문 |
| Create `app/api/admin/users/[id]/password/route.js` | 운영자 비밀번호 재설정 |
| Modify `app/admin/page.js` | [비밀번호 재설정] 버튼 |
| Modify `CLAUDE.md`·`docs/auth-setup.md` | Confirm email 끄기 + 새 로그인 절차 |
| Test | `tests/auth-routes.test.js`·`tests/auth-paths.test.js`·`tests/auth-ui.test.js`·`tests/admin-password.test.js` |

---

### Task 1: 가입·로그인 라우트

**Files:**
- Create: `app/api/auth/signup/route.js` · `app/api/auth/login/route.js`
- Test: `tests/auth-routes.test.js`

**Interfaces:**
- Consumes: `authClient(cookieStore)` (`lib/auth/supabase-server.js`) — anon 키 + 쿠키 어댑터
- Produces:
  - `POST /api/auth/signup` body `{email, password}` → `200 {ok:true}` / `400 {error}`(형식·약한 비밀번호·이미 있는 주소) / `500 {error}`(설정 문제)
  - `POST /api/auth/login` body `{email, password}` → `200 {ok:true}` / `401 {error:"이메일 또는 비밀번호가 맞지 않아요"}`(**모든 인증 실패가 이 하나**) / `400`(빈 입력)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auth-routes.test.js`:

```js
// 가입·로그인 라우트. Supabase 는 모킹한다 — 여기서 재는 것은 우리 계약이다:
// 실패 문구가 하나로 뭉개지는가, 비밀번호가 새지 않는가, 쿠키를 세우는가.
import { describe, it, expect, beforeEach, vi } from "vitest";

const signUp = vi.fn();
const signInWithPassword = vi.fn();
vi.mock("../lib/auth/supabase-server.js", () => ({
  authClient: () => ({ auth: { signUp, signInWithPassword } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

const { POST: signupPOST } = await import("../app/api/auth/signup/route.js");
const { POST: loginPOST } = await import("../app/api/auth/login/route.js");

const req = (body) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("맞으면 200", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await loginPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "hunter22" });
  });

  it("틀린 비밀번호와 없는 계정이 **같은 문구·같은 코드**로 나간다 — 가입 여부를 흘리지 않는다", async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const wrongPw = await loginPOST(req({ email: "a@b.com", password: "nope" }));
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const noUser = await loginPOST(req({ email: "ghost@b.com", password: "nope" }));

    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  it("빈 입력은 400 이고 Supabase 를 부르지 않는다", async () => {
    expect((await loginPOST(req({ email: "", password: "" }))).status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("응답 어디에도 비밀번호가 없다", async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const body = await (await loginPOST(req({ email: "a@b.com", password: "s3cret-pw" }))).text();
    expect(body).not.toContain("s3cret-pw");
  });
});

describe("POST /api/auth/signup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("가입하면 200", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await signupPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(200);
    expect(signUp).toHaveBeenCalledWith({ email: "a@b.com", password: "hunter22" });
  });

  it("가입 실패는 원인을 알려 준다 — 로그인과 달리 사용자에게 필요한 정보다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    const res = await signupPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/이미/);
  });

  it("약한 비밀번호도 원인을 알려 준다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "Password should be at least 6 characters" } });
    const res = await signupPOST(req({ email: "a@b.com", password: "12" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/비밀번호/);
  });

  it("응답 어디에도 비밀번호가 없다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    const body = await (await signupPOST(req({ email: "a@b.com", password: "s3cret-pw" }))).text();
    expect(body).not.toContain("s3cret-pw");
  });
});
```

⚠️ `vi.mock` 의 경로·`next/headers` 사용 여부는 실물 `lib/auth/supabase-server.js` 와 다른 라우트들이 쿠키를 어떻게 얻는지 보고 맞춰라. 다르면 **테스트를 실물에 맞추고** 헬퍼를 고치지 마라.

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auth-routes.test.js` / Expected: FAIL — 두 라우트 파일 없음

- [ ] **Step 3: 구현** — `app/api/auth/login/route.js`:

```js
// POST /api/auth/login — 이메일+비밀번호. 성공하면 세션 쿠키가 선다.
//
// ★ 인증 실패는 **한 문구로 뭉갠다.** "없는 계정"과 "틀린 비밀번호"를 가르면 어느 주소가
// 가입돼 있는지 밖에서 셀 수 있다(계정 열거). 가입 실패는 반대다 — 그건 사용자가 알아야
// 다음 행동을 정한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";

const WRONG = "이메일 또는 비밀번호가 맞지 않아요";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "이메일과 비밀번호를 넣어 주세요" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = authClient(await cookies());
  } catch (e) {
    // env 누락 같은 설정 문제 — 사용자 잘못이 아니므로 인증 실패와 구분한다
    console.error("인증 클라이언트 생성 실패:", e.message);
    return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 원문을 화면에 내보내지 않는다(계정 열거·영문 노출). 서버 로그에는 남긴다.
    console.error("로그인 실패:", error.message);
    return Response.json({ error: WRONG }, { status: 401 });
  }
  return Response.json({ ok: true });
}
```

`app/api/auth/signup/route.js`:

```js
// POST /api/auth/signup — 이메일+비밀번호. 가입하면 그 자리에서 세션이 선다.
//
// 이메일 인증을 받지 않는다(Supabase 의 Confirm email 을 꺼 둔다). 가짜 주소는
// 운영자 승인제가 거른다 — 가입은 되지만 승인 전에는 /pending 에서 아무것도 못 한다.
import { cookies } from "next/headers";
import { authClient } from "../../../../lib/auth/supabase-server.js";

// Supabase 오류 원문을 사장님 말로 옮긴다. 모르는 것은 뭉뚱그리되 로그에는 원문을 남긴다.
function reason(message) {
  const m = String(message || "");
  if (/already registered|already exists/i.test(m)) return "이미 가입된 이메일이에요 — 로그인해 주세요";
  if (/password/i.test(m)) return "비밀번호가 너무 짧아요 — 6자 이상으로 정해 주세요";
  if (/email/i.test(m)) return "이메일 주소를 다시 확인해 주세요";
  return "가입하지 못했어요 — 잠시 후 다시 시도해 주세요";
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "이메일과 비밀번호를 넣어 주세요" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = authClient(await cookies());
  } catch (e) {
    console.error("인증 클라이언트 생성 실패:", e.message);
    return Response.json({ error: "인증 설정에 문제가 있어요" }, { status: 500 });
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error("가입 실패:", error.message);
    return Response.json({ error: reason(error.message) }, { status: 400 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auth-routes.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add app/api/auth tests/auth-routes.test.js && git commit -m "feat: 가입·로그인 라우트 — 인증 실패는 한 문구로 뭉갠다"`

---

### Task 2: 공개 경로 교체와 콜백 제거

**Files:**
- Modify: `lib/auth/paths.js:25`
- Delete: `app/auth/callback/route.js` (디렉터리째)
- Test: `tests/auth-paths.test.js` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `PUBLIC_PATHS = ["/login", "/api/auth/signup", "/api/auth/login"]` — middleware(Edge)와 `AppShell`(브라우저)이 같은 파일을 본다. **순수 상수·순수 함수만** 두는 파일이라는 성질을 지킨다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auth-paths.test.js`:

```js
// 공개 경로는 보안 경계다 — 늘어나는 것을 테스트가 알아채야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PUBLIC_PATHS, isPublicPath } from "../lib/auth/paths.js";

describe("공개 경로", () => {
  it("셋뿐이다", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(
      ["/api/auth/login", "/api/auth/signup", "/login"].sort()
    );
  });

  it("매직링크 콜백은 더 이상 공개가 아니다", () => {
    expect(isPublicPath("/auth/callback")).toBe(false);
  });

  it("접두어만 겹치는 경로가 공개로 새지 않는다", () => {
    expect(isPublicPath("/login-debug")).toBe(false);
    expect(isPublicPath("/api/auth/login-as-admin")).toBe(false);
  });

  it("보호된 경로는 그대로 보호된다", () => {
    expect(isPublicPath("/create")).toBe(false);
    expect(isPublicPath("/api/projects")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });

  it("콜백 라우트 파일이 저장소에 없다", () => {
    let exists = true;
    try { readFileSync("app/auth/callback/route.js"); } catch { exists = false; }
    expect(exists).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auth-paths.test.js` / Expected: FAIL — `/auth/callback` 이 아직 공개이고 파일도 있다

- [ ] **Step 3: 구현** — `lib/auth/paths.js` 의 상수를 교체(주변 주석은 새 사실에 맞게 갱신):

```js
// 매직링크를 걷어내면서 /auth/callback 이 빠졌다(발급처가 없으면 죽은 문이다).
// 대신 가입·로그인 라우트가 공개다 — 로그인하지 않은 사람이 불러야 하는 문이므로.
export const PUBLIC_PATHS = ["/login", "/api/auth/signup", "/api/auth/login"];
```

콜백 삭제: `git rm -r app/auth`

⚠️ `middleware.js` 의 주석 중 `/auth/callback` 을 설명하는 대목(70행 부근)과 `tests/middleware.test.js:111` 의 주석도 새 사실에 맞게 고쳐라(주석만 — 로직은 손대지 마라).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auth-paths.test.js tests/middleware.test.js tests/routes-auth.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/auth/paths.js middleware.js tests/auth-paths.test.js tests/middleware.test.js && git rm -r --cached app/auth 2>/dev/null; git commit -am "feat: 공개 경로를 가입·로그인으로 — 매직링크 콜백 제거"`

---

### Task 3: 로그인 화면 — 탭 둘

**Files:**
- Rewrite: `app/login/page.js`
- Test: `tests/auth-ui.test.js` (신규, 소스 판정 — 이 저장소에 React 렌더 테스트가 없다)

**Interfaces:**
- Consumes: Task 1 의 두 라우트
- Produces: 화면만 — 다른 태스크가 의존하지 않는다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auth-ui.test.js`:

```js
// 화면 배선을 소스에서 판정한다(staleness-ui·credits-ui 와 같은 패턴).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const login = strip(readFileSync("app/login/page.js", "utf8"));

describe("로그인 화면", () => {
  it("매직링크를 더 이상 부르지 않는다", () => {
    expect(login).not.toMatch(/signInWithOtp/);
    expect(login).not.toMatch(/auth\/callback/);
  });
  it("두 라우트를 부른다", () => {
    expect(login).toMatch(/\/api\/auth\/login/);
    expect(login).toMatch(/\/api\/auth\/signup/);
  });
  it("비밀번호 입력이 있다", () => {
    expect(login).toMatch(/type="password"/);
  });
  it("가입 탭이 승인 대기를 미리 알린다", () => {
    expect(login).toMatch(/승인/);
  });
  it("비밀번호를 화면 상태 밖으로 흘리지 않는다 — 링크·쿼리에 싣지 않는다", () => {
    expect(login).not.toMatch(/password=\$\{/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auth-ui.test.js` / Expected: FAIL — `signInWithOtp` 가 남아 있다

- [ ] **Step 3: 구현** — `app/login/page.js` 전체 교체:

```jsx
"use client";

// 로그인·회원가입 — 이메일과 비밀번호로 들어온다.
// 매직링크(메일 왕복)를 걷어낸 자리다. 가입은 누구나 되지만 **운영자 승인 전에는**
// /pending 에서 아무것도 못 한다 — 그 사실을 가입 탭이 미리 알린다.
//
// 이 저장소의 다른 화면과 같은 패널·버튼 클래스를 쓴다(app/globals.css, tests/design-system.test.js).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");     // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = tab === "signup";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "다시 시도해 주세요");
        return;
      }
      // 세션 쿠키가 섰다. 어디로 갈지는 middleware 가 정한다(승인 전이면 /pending).
      // refresh 를 함께 부르는 이유: 서버 컴포넌트가 새 세션으로 다시 그려져야 한다.
      router.replace("/");
      router.refresh();
    } catch {
      setError("연결에 문제가 있어요 — 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="pgtitle">shotform</h1>
      <p className="pgsub">
        {isSignup
          ? "이메일과 비밀번호로 가입해요. 운영자 승인 뒤에 쓸 수 있어요."
          : "이메일과 비밀번호를 넣어 주세요."}
      </p>

      <section className="panel panel--narrow">
        <div className="res-ops">
          <button
            type="button"
            className={`mini${tab === "login" ? " confirm-btn" : ""}`}
            onClick={() => { setTab("login"); setError(""); }}
          >
            로그인
          </button>
          <button
            type="button"
            className={`mini${isSignup ? " confirm-btn" : ""}`}
            onClick={() => { setTab("signup"); setError(""); }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            type="email"
            required
            autoComplete="email"
            className="sent-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="이메일"
          />
          <input
            type="password"
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="sent-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            aria-label="비밀번호"
          />
          <button type="submit" className="cta" disabled={busy}>
            {busy ? "확인 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>
        {error && <p className="pgsub warn">{error}</p>}
      </section>
    </>
  );
}
```

⚠️ `panel--narrow`·`sent-input`·`cta`·`mini`·`confirm-btn` 이 실제로 있는 클래스인지 `app/globals.css` 로 확인하고, 없으면 **있는 클래스로 맞춰라**(새 CSS 를 만들지 마라 — `tests/design-system.test.js` 가 규칙을 쥔다).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auth-ui.test.js tests/design-system.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add app/login/page.js tests/auth-ui.test.js && git commit -m "feat: 로그인 화면을 탭 둘로 — 이메일·비밀번호"`

---

### Task 4: 운영자 비밀번호 재설정

**Files:**
- Create: `app/api/admin/users/[id]/password/route.js`
- Modify: `app/admin/page.js`
- Test: `tests/admin-password.test.js` (신규)

**Interfaces:**
- Consumes: `withUser(handler, {adminOnly:true})` · `getStore().findProfiles([id])` (선례: `app/api/admin/users/[id]/route.js`)
- Produces: `POST /api/admin/users/[id]/password` body `{password}` → `200 {ok:true}` / `400`(짧거나 빈 값) / `403`(비운영자) / `404`(없는 사용자) / `502`(Supabase 실패)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/admin-password.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const updateUserById = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { updateUserById } } }),
}));
const { POST } = await import("../app/api/admin/users/[id]/password/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const headersFor = (id, role) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const req = (who, role, body) =>
  new Request("http://localhost/x", { method: "POST", headers: headersFor(who, role), body: JSON.stringify(body) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

describe("POST /api/admin/users/[id]/password", () => {
  beforeEach(async () => {
    resetMemoryStore();
    vi.clearAllMocks();
    updateUserById.mockResolvedValue({ error: null });
    await getStore().insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
  });

  it("운영자가 재설정하면 200 이고 Supabase 에 새 비밀번호를 넘긴다", async () => {
    const res = await POST(req(ADMIN, "admin", { password: "newpass123" }), ctx(A));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(A, { password: "newpass123" });
  });

  it("비운영자는 403 이고 Supabase 를 부르지 않는다", async () => {
    expect((await POST(req(A, "user", { password: "newpass123" }), ctx(A))).status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("없는 사용자는 404", async () => {
    const ghost = "00000000-0000-4000-8000-00000000ffff";
    expect((await POST(req(ADMIN, "admin", { password: "newpass123" }), ctx(ghost))).status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("짧은 비밀번호는 400", async () => {
    expect((await POST(req(ADMIN, "admin", { password: "12" }), ctx(A))).status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("응답에 비밀번호가 없다", async () => {
    const body = await (await POST(req(ADMIN, "admin", { password: "s3cret-pw" }), ctx(A))).text();
    expect(body).not.toContain("s3cret-pw");
  });
});
```

⚠️ `insertProfile` 의 실제 인자 모양은 `lib/store/memory.js` 에서 확인해 맞춰라.

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/admin-password.test.js` / Expected: FAIL — 라우트 파일 없음

- [ ] **Step 3: 구현** — `app/api/admin/users/[id]/password/route.js`:

```js
// POST /api/admin/users/[id]/password — 운영자가 비밀번호를 재설정한다.
//
// 자가 재설정 화면을 만들지 않은 이유: 그것은 결국 메일 왕복이라, 매직링크를 걷어낸
// 이유를 뒷문으로 되돌린다. 커스텀 SMTP 가 붙는 날 열면 된다.
import { createClient } from "@supabase/supabase-js";
import { withUser } from "../../../../../../lib/auth/require-user.js";
import { getStore } from "../../../../../../lib/store/index.js";

const MIN_LENGTH = 6;   // Supabase 기본 최소 길이와 같은 값

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_LENGTH) {
    return Response.json({ error: `비밀번호는 ${MIN_LENGTH}자 이상이어야 해요` }, { status: 400 });
  }

  // 없는 사용자에게 조용히 성공을 주지 않는다 — 선례(승인 라우트)와 같은 방식.
  if (!(await getStore().findProfiles([id])).get(id)) {
    return Response.json({ error: "사용자를 찾을 수 없어요" }, { status: 404 });
  }

  const admin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) {
    console.error("비밀번호 재설정 실패:", error.message);
    return Response.json({ error: "비밀번호를 바꾸지 못했어요" }, { status: 502 });
  }

  // 감사 — 누가 누구의 비밀번호를 언제 바꿨는지. 비밀번호 자체는 절대 남기지 않는다.
  console.log(`[비밀번호 재설정] ${user.id} → ${id}`);
  return Response.json({ ok: true });
}, { adminOnly: true });
```

`app/admin/page.js` 의 각 사용자 행에 버튼을 더한다(승인·차단·크레딧 버튼 옆):

```jsx
                    <button className="mini" disabled={busy === u.id} onClick={() => resetPassword(u.id)}>
                      비밀번호 재설정
                    </button>
```

```jsx
  // 운영자 전용 화면이고 드문 동작이라 prompt 로 받는다(크레딧 넣기와 같은 이유).
  async function resetPassword(id) {
    const pw = window.prompt("새 비밀번호를 정해 주세요 (6자 이상)");
    if (!pw) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/users/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "재설정 실패");
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }
```

⚠️ `setBusy`·`setErr` 의 실제 이름·초기값은 `app/admin/page.js` 실물을 열어 맞춰라(크레딧 버튼이 쓰는 것과 같은 것을 써라).

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/admin-password.test.js tests/admin-and-labels.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add "app/api/admin/users/[id]/password" app/admin/page.js tests/admin-password.test.js && git commit -m "feat: 운영자 비밀번호 재설정 — 자가 재설정은 SMTP 이후로"`

---

### Task 5: 문서·전체 그린·가짜 모드 확인

**Files:**
- Modify: `CLAUDE.md` (인증 절) · `docs/auth-setup.md`
- Test: 없음(검증 태스크 — 문서 외 결함은 고치지 말고 보고)

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: 배포·설정 절차 문서

- [ ] **Step 1: 전체 스위트** — Run: `npx vitest run` / Expected: 전체 PASS, 새 실패 0. 깨진 것이 있으면 **낡은 테스트인지 진짜 회귀인지 가려** 보고하라(매직링크를 뜻하던 테스트가 있을 수 있다)
- [ ] **Step 2: 잔재 확인** — Run: `grep -rn "signInWithOtp\|magiclink\|token_hash\|auth/callback" app lib components tests scripts docs/auth-setup.md CLAUDE.md` / Expected: 실행 코드 0건. 문서에 남은 것은 이 태스크에서 고친다
- [ ] **Step 3: 문서** — `docs/auth-setup.md` 의 "처음 켤 때" 절을 새 방식으로 다시 쓴다:
  - ⚠️ **Supabase 대시보드 → Authentication → Providers → Email 의 "Confirm email" 을 끈다.** 켜져 있으면 가입은 되는데 로그인이 안 되어 "가입했는데 못 들어간다"로 보인다
  - 첫 관리자 만들기: 화면에서 가입 → Supabase 대시보드에서 그 사용자의 `profiles.status='approved'`·`role='admin'` 과 **`app_metadata` 양쪽**을 맞춘다(기존 문서의 "양쪽" 경고를 그대로 유지)
  - 매직링크 절차(`generateLink`·`token_hash`·`type=email`)는 **삭제**한다 — 발급처가 없어졌다
  - 개발 로그인은 `SHOTFORM_DEV_USER` 하나로 정리
  `CLAUDE.md` 의 인증 절도 같은 내용으로 갱신하고, 매직링크 함정 서술을 걷어낸다
- [ ] **Step 4: 가짜 모드 화면 확인(0원)** — 3000·3001 은 사용자 서버이니 **3005** 를 쓰고 기존 `SHOTFORM_DIST_DIR` 스위치로 빌드 디렉터리를 가른다:

```bash
PORT=3005 SHOTFORM_FAKE=all SHOTFORM_DIST_DIR=.next-verify-auth npm run dev
```

⚠️ `.env.local` 에 `SHOTFORM_DEV_USER` 가 있으면 로그인 화면을 지나치므로, **그 값을 빼고 띄워라**(`SHOTFORM_DEV_USER= PORT=3005 …` 로 비워서). 확인할 것: ① `/login` 이 탭 둘로 뜬다 ② 없는 계정으로 로그인하면 *"이메일 또는 비밀번호가 맞지 않아요"* ③ 가입하면 `/pending` 으로 간다(Confirm email 이 꺼져 있어야 한다 — 켜져 있으면 그 사실을 보고하라). 끝나면 서버 종료 + `.next-verify-auth` 삭제
- [ ] **Step 5: 결과 보고 + 커밋** — 문서 수정만 커밋(`git add CLAUDE.md docs/auth-setup.md && git commit -m "docs: 인증을 비밀번호 방식으로 — Confirm email 끄기 절차 추가"`). ⚠️ 라이브 Supabase 설정은 **바꾸지 마라** — Confirm email 끄기는 사용자가 정한다

---

## Self-Review 결과 (계획 작성 시 수행)

- **스펙 커버리지**: 라우트 둘(T1) · 공개 경로·콜백 제거(T2) · 화면 탭 둘(T3) · 운영자 재설정(T4) · 문서·Confirm email·잔재 확인(T5). 스펙의 "테스트로 못 박을 것" 6개는 T1(문구 통일·비밀번호 미노출)·T2(공개 경로)·T3(잔재)·T4(운영자만·404)에 분산. 승인 전 차단은 기존 middleware 테스트가 이미 쥐고 있어 새로 만들지 않는다(T5 Step 1 이 그 그린을 확인).
- **타입 일치**: `POST /api/auth/{signup,login}` body `{email, password}` → `{ok:true}`|`{error}` 를 T1 정의, T3 화면이 소비. `POST /api/admin/users/[id]/password` body `{password}` 를 T4 정의, 같은 태스크의 화면이 소비. `PUBLIC_PATHS` 3개를 T2 정의, middleware·AppShell 이 기존대로 소비.
- **주의로 남긴 것**: `vi.mock` 경로·`next/headers` 사용 여부(T1), CSS 클래스 실재(T3), `insertProfile`·`setBusy/setErr` 이름(T4) — 전부 "실물에 맞추고 구현을 고치지 마라"를 명시.
