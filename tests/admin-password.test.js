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
