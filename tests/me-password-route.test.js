// POST /api/me/password — 본인이 바꾼다. 현재 비밀번호를 다시 묻는 것이 핵심이다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const signInWithPassword = vi.fn();
const updateUserById = vi.fn();
const signOut = vi.fn();
const createClient = vi.fn(() => ({
  auth: { signInWithPassword, admin: { updateUserById, signOut } },
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
    // 실물처럼 세션까지 담는다 — 이 access_token 이 다른 기기 세션을 끊는 열쇠다.
    signInWithPassword.mockResolvedValue({
      data: { user: { id: A }, session: { access_token: "at-throwaway" } },
      error: null,
    });
    updateUserById.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ data: null, error: null });
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

  // ★ 이 라우트는 재검증마다 진짜 로그인 시도를 쏜다 — 429 에 다른 곳보다 쉽게 닿는다.
  // 그걸 "비밀번호가 맞지 않아요"로 답하면 고칠 것도 없는데 계속 다시 누른다.
  it("429(요청 과다)는 401 이 아니라 429 이고 '잠시 후' 문구다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Rate limit exceeded", status: 429 } });
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/잠시 후/);
    expect(body.error).not.toMatch(/현재 비밀번호/);
    expect(updateUserById).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ★ 예방만으로는 절반이다 — 자리를 비운 사이 들어온 사람의 세션이 비밀번호를 바꾼
  // 뒤에도 살아 있으면 복구가 안 된다. 바꾸면 그 사용자의 세션을 전부 끊는다.
  it("세션을 전부 끊는다(global)", async () => {
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalledWith("at-throwaway", "global");
    // 지금 브라우저도 함께 끊기므로 화면이 알아야 한다.
    expect(await res.json()).toEqual({ ok: true, signedOut: true });
  });

  // ★ 이 순서가 이번 결함의 본체다 (2026-08-07 라이브 실측).
  // updateUserById({password}) 가 ①의 재검증 세션까지 무효화해서, 바꾼 **뒤** signOut 을
  // 부르면 그 access_token 이 이미 죽어 있다 — 실물이 매번 `400 Auth session missing!`
  // 을 돌려줬다. 바꾸기 **전에** 부르면 토큰이 살아 있다.
  it("세션 끊기가 비밀번호 변경보다 **먼저** 일어난다", async () => {
    await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(signOut.mock.invocationCallOrder[0])
      .toBeLessThan(updateUserById.mock.invocationCallOrder[0]);
  });

  it("비밀번호가 안 바뀌었으면 세션도 안 끊는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });
    await POST(req(A, { current: "wrong", next: "new-pass-1" }), {});
    expect(signOut).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ★ auth-js 의 admin.signOut 은 실패해도 던지지 않고 {data:null, error} 로 돌려준다.
  // 판정하지 않으면 "세션을 끊었다"고 믿는 거짓 안전이 된다.
  //
  // ★ 목의 응답이 실물이 준 그대로다: 순서를 뒤집기 전 라이브 서버 로그가
  // `세션 끊기 실패: 400 Auth session missing!` 이었다. 그 상황에서 예전 코드는
  // **200 + signedOut:false** 를 내보냈고, 화면은 "다른 기기의 로그인을 끊지 못했어요"
  // 라는 거짓 경고를 띄웠다(실제로는 끊겼다). 이제는 비밀번호를 **바꾸지 않고** 멈춘다 —
  // 그래야 signedOut 이 추측이 아니게 된다.
  it("세션을 못 끊으면 비밀번호를 바꾸지 않고 502 로 멈춘다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockResolvedValue({ data: null, error: { message: "Auth session missing!", status: 400 } });
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(502);
    expect(updateUserById).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.signedOut).toBe(false);
    expect(body.error).toMatch(/바꾸지 못했어요/);
    // 예전의 거짓 경고("끊지 못했어요")를 다시 내보내지 않는다.
    expect(body.ok).toBeUndefined();
    expect(logged(spy)).toMatch(/세션/);
    spy.mockRestore();
  });

  it("재검증 응답에 세션이 없으면 끊을 열쇠가 없다 — 바꾸지 않고 502", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInWithPassword.mockResolvedValue({ data: { user: { id: A } }, error: null });
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(502);
    expect((await res.json()).signedOut).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(logged(spy)).toMatch(/세션/);
    spy.mockRestore();
  });

  // ★ 순서를 뒤집은 대가가 이 자리다 — 세션은 끊겼는데 비밀번호는 그대로다.
  // 안전한 쪽이지만 사장님에게는 당황스러우니, 문구가 그 상태를 그대로 말해야 한다.
  it("세션은 끊고 비밀번호 변경이 실패하면 '이미 로그아웃됐다'고 말한다", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    const res = await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }), {});
    expect(res.status).toBe(502);
    const body = await res.json();
    // 화면이 로그인 화면으로 안내할 수 있어야 한다.
    expect(body.signedOut).toBe(true);
    expect(body.error).toMatch(/로그아웃/);
    expect(body.error).toMatch(/다시 로그인/);
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await POST(req(A, { current: "old-pass-1", next: "new-pass-1" }, "pending"), {})).status).toBe(403);
  });
});
