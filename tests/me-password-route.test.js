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
