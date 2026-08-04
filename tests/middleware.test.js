// middleware 는 이 저장소의 유일한 인증 경계인데도 "vitest 밖" 이라는 이유로 테스트가
// 없었다(리뷰 I4). next/server 는 vitest 와 같은 Node 런타임에서 그대로 import 되므로
// @supabase/ssr 하나만 목으로 갈아끼우면 middleware(req) 를 직접 부를 수 있다.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

let userResult;
let refreshCookie;

// getUser() 가 호출될 때마다 세션을 갱신했다고 흉내낸다 — setAll 로 쿠키를 흘려보낸다.
// C1 회귀 테스트가 이 쿠키가 최종 응답까지 살아남는지를 잰다.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url, _key, { cookies }) => ({
    auth: {
      getUser: async () => {
        if (refreshCookie) {
          cookies.setAll([{ name: "sb-access-token", value: "NEW", options: { path: "/" } }]);
        }
        return userResult;
      },
    },
  }),
}));

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  refreshCookie = false;
  userResult = { data: { user: null }, error: null };
});

const approvedUser = {
  id: "u-real",
  app_metadata: { status: "approved", role: "user" },
};

function req(path, headers = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("middleware", () => {
  it("들어온 x-shotform-user 위조 헤더를 지운다", async () => {
    userResult = { data: { user: approvedUser }, error: null };
    const res = await middleware(req("/api/x", { [USER_HEADER]: "attacker" }));
    // NextResponse.next({request:{headers}}) 는 실제 다운스트림 요청 헤더를
    // x-middleware-request-* 로 응답에 실어 나른다 — 그게 우리가 검증할 수 있는 지점이다.
    expect(res.headers.get("x-middleware-request-" + USER_HEADER)).toBe("u-real");
    expect(res.headers.get("x-middleware-request-" + USER_HEADER)).not.toBe("attacker");
  });

  it("검증된 신원을 헤더로 주입한다", async () => {
    userResult = { data: { user: approvedUser }, error: null };
    const res = await middleware(req("/api/x"));
    expect(res.headers.get("x-middleware-request-" + USER_HEADER)).toBe("u-real");
    expect(res.headers.get("x-middleware-request-" + STATUS_HEADER)).toBe("approved");
    expect(res.headers.get("x-middleware-request-" + ROLE_HEADER)).toBe("user");
  });

  it("미로그인 API 요청은 401 이다", async () => {
    userResult = { data: { user: null }, error: null };
    const res = await middleware(req("/api/x"));
    expect(res.status).toBe(401);
  });

  it("미로그인 화면 요청은 /login 으로 리다이렉트한다", async () => {
    userResult = { data: { user: null }, error: null };
    const res = await middleware(req("/create/1"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/login");
  });

  it("★ C1 회귀: 갱신된 세션 쿠키가 최종 응답(통과)에 실린다", async () => {
    refreshCookie = true;
    userResult = { data: { user: approvedUser }, error: null };
    const res = await middleware(req("/api/x"));
    expect(res.headers.get("set-cookie")).toContain("sb-access-token=NEW");
  });

  it("★ C1 회귀: 갱신된 세션 쿠키가 리다이렉트(/pending) 응답에도 실린다", async () => {
    refreshCookie = true;
    userResult = {
      data: { user: { id: "u-pending", app_metadata: { status: "pending", role: "user" } } },
      error: null,
    };
    const res = await middleware(req("/create/1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("set-cookie")).toContain("sb-access-token=NEW");
  });

  it("★ C1 회귀: 갱신된 세션 쿠키가 401 응답에도 실린다", async () => {
    refreshCookie = true;
    userResult = { data: { user: null }, error: null };
    const res = await middleware(req("/api/x"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toContain("sb-access-token=NEW");
  });

  it("/login-debug 같은 접두어 겹침 경로는 공개 경로로 취급하지 않는다 (M2)", async () => {
    userResult = { data: { user: null }, error: null };
    const res = await middleware(req("/login-debug"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/login");
  });

  // ★ Task 14 변이 검증에서 드러난 구멍: 인증 성공 경로는 delete 직후 set 이 항상 덮어써서
  // delete 세 줄을 지워도 위 테스트들이 구별하지 못했다. delete 가 실제로 일하는 유일한
  // 자리는 "비로그인 + 공개 경로"다 — 그 경로는 set 을 타지 않고 cookieRes 를 그대로
  // 반환하므로, 위조 헤더가 delete 되지 않으면 그대로 다운스트림에 실려 간다.
  // 지금은 /login·/auth/callback 핸들러가 이 헤더를 안 읽어 실제 뚫림은 없지만,
  // 공개 경로가 늘거나 그 핸들러가 신원 헤더를 읽게 되는 날 구멍이 된다 — 그래서
  // "지금 안전하다"가 아니라 "delete 가 실제로 지운다"를 여기서 직접 확인한다.
  it("비로그인 + 공개 경로에서도 위조 신원 헤더가 라우트에 닿지 않는다", async () => {
    userResult = { data: { user: null }, error: null };
    const res = await middleware(
      req("/login", {
        [USER_HEADER]: "attacker",
        [STATUS_HEADER]: "approved",
        [ROLE_HEADER]: "admin",
      })
    );
    expect(res.headers.get("x-middleware-request-" + USER_HEADER)).toBeNull();
    expect(res.headers.get("x-middleware-request-" + STATUS_HEADER)).toBeNull();
    expect(res.headers.get("x-middleware-request-" + ROLE_HEADER)).toBeNull();
  });
});

// 로컬에서 화면을 볼 때마다 매직링크를 받는 것이 실질적인 방해라 개발 전용 우회를 뒀다.
// 이 문은 **프로덕션에서 열릴 길이 없어야 한다** — 그것이 이 describe 의 전부다.
describe("개발 전용 로그인 우회 — 프로덕션에서는 열리지 않는다", () => {
  const DEV_ID = "dev-user-uuid";
  const reqHeader = (res, name) => res.headers.get("x-middleware-request-" + name);

  beforeEach(() => {
    delete process.env.SHOTFORM_DEV_USER;
    vi.stubEnv("NODE_ENV", "development");
  });

  it("★ NODE_ENV=production 이면 SHOTFORM_DEV_USER 가 있어도 무시한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SHOTFORM_DEV_USER = DEV_ID;
    userResult = { data: { user: null }, error: null };

    const res = await middleware(req("/archive"));
    // 우회가 먹었다면 200 통과였을 것이다. 로그인으로 튕겨야 한다.
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/login");
    expect(reqHeader(res, USER_HEADER)).toBeNull();
  });

  it("env 가 없으면 개발 모드에서도 평소대로 로그인을 요구한다", async () => {
    userResult = { data: { user: null }, error: null };
    const res = await middleware(req("/archive"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")).pathname).toBe("/login");
  });

  it("개발 모드 + env 가 있으면 그 사용자로 통과시킨다", async () => {
    process.env.SHOTFORM_DEV_USER = DEV_ID;
    userResult = { data: { user: null }, error: null };

    const res = await middleware(req("/archive"));
    expect(res.status).toBe(200);
    expect(reqHeader(res, USER_HEADER)).toBe(DEV_ID);
    expect(reqHeader(res, STATUS_HEADER)).toBe("approved");
  });

  it("우회 중에도 클라이언트가 심은 신원 헤더는 버린다", async () => {
    process.env.SHOTFORM_DEV_USER = DEV_ID;
    userResult = { data: { user: null }, error: null };

    const res = await middleware(
      req("/archive", { [USER_HEADER]: "attacker", [ROLE_HEADER]: "admin" })
    );
    // 우리가 정한 값만 실린다 — 공격자가 넣은 id 가 아니다
    expect(reqHeader(res, USER_HEADER)).toBe(DEV_ID);
  });
});
