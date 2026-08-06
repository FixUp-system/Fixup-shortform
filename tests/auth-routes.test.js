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
