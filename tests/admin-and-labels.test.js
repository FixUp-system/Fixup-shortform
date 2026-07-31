import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { listRecords } from "../lib/costs.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

// @supabase/supabase-js 를 모킹한다 — 실제 Auth 서버를 부르지 않고 admin 라우트의
// 두 갈래(성공/실패)를 통제한다. vi.hoisted 로 만든 값이라야 아래 vi.mock 팩토리가
// (호이스팅되어 import 전에 실행돼도) 참조할 수 있다.
const { updateUserById, signOut } = vi.hoisted(() => ({
  updateUserById: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { updateUserById, signOut } } }),
}));
import { PATCH as adminPatchUser } from "../app/api/admin/users/[id]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("원장 표시 이름", () => {
  beforeEach(() => resetMemoryStore());

  it("운영자는 admin, 일반 사용자는 이메일로 보인다", async () => {
    await memoryStore.insertProfile({ id: A, email: "boss@fix-up.kr", status: "approved", role: "admin" });
    await memoryStore.insertProfile({ id: B, email: "user@example.com", status: "approved", role: "user" });
    await memoryStore.insertCost({ request_id: "r1", ts: 1, endpoint: "e", actor: A, est_cost_usd: 1 });
    await memoryStore.insertCost({ request_id: "r2", ts: 2, endpoint: "e", actor: B, est_cost_usd: 1 });

    const rows = await listRecords();
    const label = Object.fromEntries(rows.map((r) => [r.request_id, r.actor_label]));
    expect(label.r1).toBe("admin");
    expect(label.r2).toBe("user@example.com");
  });

  it("문자열 actor 는 그대로 — 스크립트는 admin, 옛 기록은 local", async () => {
    await memoryStore.insertCost({ request_id: "r3", ts: 3, endpoint: "e", actor: "admin", est_cost_usd: 1 });
    await memoryStore.insertCost({ request_id: "r4", ts: 4, endpoint: "e", actor: "local", est_cost_usd: 1 });

    const rows = await listRecords();
    const label = Object.fromEntries(rows.map((r) => [r.request_id, r.actor_label]));
    expect(label.r3).toBe("admin");
    expect(label.r4).toBe("local");
  });

  it("uuid 를 화면에 그대로 내보내지 않는다", async () => {
    await memoryStore.insertProfile({ id: A, email: "boss@fix-up.kr", status: "approved", role: "admin" });
    await memoryStore.insertCost({ request_id: "r5", ts: 5, endpoint: "e", actor: A, est_cost_usd: 1 });
    const [row] = await listRecords();
    expect(row.actor_label).not.toBe(A);
  });
});

// ── /api/costs 는 운영자 전용이다 ──────────────────────────────────────────
// 변이 검증 ①: 라우트의 { adminOnly: true } 를 떼면 이 테스트가 빨개져야 한다.
describe("GET /api/costs — 운영자 전용", () => {
  beforeEach(() => resetMemoryStore());

  const headersFor = (id, role) => ({
    [USER_HEADER]: id,
    [STATUS_HEADER]: "approved",
    [ROLE_HEADER]: role,
  });

  it("일반 사용자는 403 이다 — 전사 원장을 남이 못 본다", async () => {
    const { GET } = await import("../app/api/costs/route.js");
    const req = new Request("http://localhost/api/costs", { headers: headersFor(A, "user") });
    const res = await GET(req, {});
    expect(res.status).toBe(403);
  });

  it("운영자는 200 이고 원장을 받는다", async () => {
    const { GET } = await import("../app/api/costs/route.js");
    await memoryStore.insertCost({ request_id: "rc1", ts: 1, endpoint: "e", actor: "admin", est_cost_usd: 1 });
    const req = new Request("http://localhost/api/costs", { headers: headersFor(A, "admin") });
    const res = await GET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(1);
  });
});

// ── /api/admin/users/[id] — 승인은 profiles·app_metadata 둘 다 쓴다 ─────────
// 변이 검증 ②: app_metadata 갱신 호출을 지우면 아래 "둘 다 쓴다" 테스트가 빨개져야 한다.
describe("PATCH /api/admin/users/[id]", () => {
  beforeEach(() => {
    resetMemoryStore();
    updateUserById.mockReset().mockResolvedValue({ error: null });
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  const admin = () => ({
    [USER_HEADER]: "op-1",
    [STATUS_HEADER]: "approved",
    [ROLE_HEADER]: "admin",
  });
  const ctx = (id) => ({ params: Promise.resolve({ id }) });
  const patchReq = (body) => ({
    json: async () => body,
    headers: new Headers(admin()),
  });

  it("승인은 profiles 와 app_metadata 둘 다 쓴다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    const res = await adminPatchUser(patchReq({ status: "approved" }), ctx(A));
    expect(res.status).toBe(200);

    const [profile] = await memoryStore.listProfiles();
    expect(profile.status).toBe("approved");
    expect(updateUserById).toHaveBeenCalledWith(A, { app_metadata: { status: "approved" } });
  });

  it("app_metadata 갱신이 실패하면 조용히 넘어가지 않고 오류를 알린다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });

    const res = await adminPatchUser(patchReq({ status: "approved" }), ctx(A));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("차단은 즉시 세션을 끊는다 — signOut 을 부른다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "approved", role: "user" });

    const res = await adminPatchUser(patchReq({ status: "blocked" }), ctx(A));
    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalledWith(A);
  });

  it("승인은 signOut 을 부르지 않는다 — 지연돼도 안전하다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("일반 사용자는 403 이다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    const userReq = {
      json: async () => ({ status: "approved" }),
      headers: new Headers({ [USER_HEADER]: "u-1", [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }),
    };
    const res = await adminPatchUser(userReq, ctx(A));
    expect(res.status).toBe(403);
  });
});
