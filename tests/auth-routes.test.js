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

// 로그인 실패 문구는 하나뿐이다 — 테스트가 그 하나를 잡고 있어야 인프라 실패가
// 슬쩍 같은 문구로 나가는 것을 잡을 수 있다.
const WRONG_TEXT = "이메일 또는 비밀번호가 맞지 않아요";

// console.error 스파이에 실린 인자 전부를 한 문자열로 — 어느 인자에 숨어도 걸린다.
const logged = (spy) => spy.mock.calls.flat().map((a) => String(a)).join(" ");

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

  // 응답만 보는 것으로는 절반이다 — 서버 로그에 실려 나가는 것도 함께 막는다.
  it("서버 로그에도 비밀번호가 없다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    await loginPOST(req({ email: "a@b.com", password: "s3cret-pw" }));
    expect(spy).toHaveBeenCalled();
    expect(logged(spy)).not.toContain("s3cret-pw");
    spy.mockRestore();
  });

  // ★ 인프라 실패를 인증 실패로 위장하면, 프로젝트가 멈춘 동안 사장님은 자기 비밀번호를
  // 의심하며 계속 다시 누른다. supabase-js 는 네트워크 오류·5xx 를 던지지 않고 error 로
  // 돌려주므로(status 0 또는 5xx) 여기서 갈라야 한다.
  it("Supabase 5xx 는 401 이 아니라 500 이다", async () => {
    signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Service unavailable", status: 503 },
    });
    const res = await loginPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toBe(WRONG_TEXT);
  });

  it("네트워크 실패(status 0)도 500 이다", async () => {
    signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch", status: 0 },
    });
    expect((await loginPOST(req({ email: "a@b.com", password: "hunter22" }))).status).toBe(500);
  });

  it("status 없는 오류는 여전히 401 — 안전한 쪽으로 떨어뜨린다", async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    const res = await loginPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(WRONG_TEXT);
  });
});

describe("POST /api/auth/signup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("가입하면 200", async () => {
    // 세션이 서야 진짜 가입이다 — 목도 실물처럼 세션을 담는다.
    signUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: { access_token: "t" } },
      error: null,
    });
    const res = await signupPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(signUp).toHaveBeenCalledWith({ email: "a@b.com", password: "hunter22" });
  });

  // ★ Confirm email 이 켜져 있으면 signUp 은 오류 없이 session: null 을 준다.
  // 200 으로 흘려보내면 화면이 "/" 로 갔다가 middleware 에 되튕겨 아무 안내 없이
  // /login 으로 돌아온다 — 조용한 거짓 성공이다. 설정 실패는 500 이다.
  it("오류가 없는데 세션도 없으면(Confirm email 켜짐) 200 이 아니라 500 이다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const res = await signupPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.error).toMatch(/인증 설정에 문제가 있어요/);
    expect(body.error).toMatch(/이메일 확인/);
    // 서버 로그에 원인이 남아야 운영자가 무엇을 끌지 안다.
    expect(logged(spy)).toMatch(/Confirm email/);
    spy.mockRestore();
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

  it("서버 로그에도 비밀번호가 없다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    await signupPOST(req({ email: "a@b.com", password: "s3cret-pw" }));
    expect(spy).toHaveBeenCalled();
    expect(logged(spy)).not.toContain("s3cret-pw");
    spy.mockRestore();
  });

  it("Supabase 5xx 는 400 이 아니라 500 이다 — 사용자 잘못이 아니다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "Service unavailable", status: 503 } });
    expect((await signupPOST(req({ email: "a@b.com", password: "hunter22" }))).status).toBe(500);
  });

  it("네트워크 실패(status 0)도 500 이다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "Failed to fetch", status: 0 } });
    expect((await signupPOST(req({ email: "a@b.com", password: "hunter22" }))).status).toBe(500);
  });

  it("status 없는 오류는 여전히 400 — 원인을 풀어 준다", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    const res = await signupPOST(req({ email: "a@b.com", password: "hunter22" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/이미/);
  });
});
