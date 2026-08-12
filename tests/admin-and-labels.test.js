import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { listRecords } from "../lib/costs.js";
import { balanceFor } from "../lib/charges.js";
import { SIGNUP_GRANT } from "../lib/pricing.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { loadCostsRecords } from "../lib/costs-client.js";

// @supabase/supabase-js 를 모킹한다 — 실제 Auth 서버를 부르지 않고 admin 라우트의
// 두 갈래(성공/실패)를 통제한다. vi.hoisted 로 만든 값이라야 아래 vi.mock 팩토리가
// (호이스팅되어 import 전에 실행돼도) 참조할 수 있다.
//
// ★ signOut 은 더는 라우트가 부르지 않는다(리뷰 C1 — auth-js 의 admin.signOut(jwt) 은
// 첫 인자가 user id 가 아니라 access token 이라 uuid 를 넘기면 401 을 반환할 뿐이고,
// middleware 가 매 요청 getUser() 로 fresh app_metadata 를 받으므로 애초에 불필요했다).
// 그래도 모킹은 남겨 둔다 — "더는 안 부른다"를 실제로 확인하는 테스트가 있어야
// 되돌림(누군가 다시 넣는 것)을 잡는다.
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

  // M1 — 프로필 행이 없는 uuid(탈퇴했거나 handle_new_user 트리거가 안 걸린 경우)도
  // uuid 그대로 새면 안 된다.
  it("프로필을 못 찾은 uuid 는 '(알 수 없음)'으로 감춘다", async () => {
    await memoryStore.insertCost({ request_id: "r6", ts: 6, endpoint: "e", actor: A, est_cost_usd: 1 });
    const [row] = await listRecords();
    expect(row.actor_label).toBe("(알 수 없음)");
  });

  // M2 — UUID 정규식이 대문자를 놓치면 대문자 uuid 가 라벨 없이 그대로 샌다.
  it("대문자 uuid 도 프로필로 라벨을 붙인다", async () => {
    const upper = A.toUpperCase();
    await memoryStore.insertProfile({ id: upper, email: "boss@fix-up.kr", status: "approved", role: "admin" });
    await memoryStore.insertCost({ request_id: "r7", ts: 7, endpoint: "e", actor: upper, est_cost_usd: 1 });
    const [row] = await listRecords();
    expect(row.actor_label).toBe("admin");
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

// M3 — /costs 화면이 403 을 삼키면 안 된다. app/costs/page.js 의 loadCostsRecords 를
// 순수 함수로 빼서 렌더 없이 이 판단만 물 수 있게 했다.
// 변이 검증 ③: r.ok 체크를 지우고 `d.records || []` 로 바로 떨어지게 되돌리면
// "일반 사용자는 빈 원장이 아니라 오류를 본다" 가 빨개져야 한다.
describe("/costs 화면 — 403 을 오류로 보여준다", () => {
  const fakeFetch = (status, body) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  it("일반 사용자는 빈 원장이 아니라 오류를 본다", async () => {
    const { records, err } = await loadCostsRecords(fakeFetch(403, { error: "권한이 없어요" }));
    expect(records).toEqual([]);
    expect(err).toBe("운영자만 볼 수 있어요");
  });

  it("운영자는 오류 없이 원장을 받는다", async () => {
    const { records, err } = await loadCostsRecords(fakeFetch(200, { records: [{ request_id: "x" }] }));
    expect(err).toBe("");
    expect(records).toHaveLength(1);
  });

  // loadProjects 와 같은 결함이 여기에도 있었다 — 200 인데 본문이 JSON 이 아니면
  // res.json() 이 던지고, 호출부(app/costs/page.js:27)는 .then 만 달아 두어 setState 를
  // 못 한다. 화면이 "불러오는 중…"에서 멈추고 오류 문구도 못 띄운다.
  it("200 이어도 본문이 JSON 이 아니면 오류로 준다 — 던지지 않는다", async () => {
    const badJson = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });
    const { records, err } = await loadCostsRecords(badJson);
    expect(records).toEqual([]);
    expect(err).toBe("원장을 불러오지 못했어요");
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
    expect(updateUserById).toHaveBeenCalledWith(A, { app_metadata: { status: "approved", role: "user" } });
  });

  it("app_metadata 갱신이 실패하면 조용히 넘어가지 않고 오류를 알린다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });

    const res = await adminPatchUser(patchReq({ status: "approved" }), ctx(A));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // I1 — 게이트(app_metadata)를 먼저 쓰고, 실패하면 원장(profiles)은 손대지 않는다.
  // 순서가 뒤집히면(원장 먼저) 이 테스트가 profiles.status 가 이미 "approved"로 바뀐
  // 상태를 보게 되어 빨개진다.
  it("app_metadata 갱신이 실패하면 profiles(원장)는 그대로 pending 이다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));

    const [profile] = await memoryStore.listProfiles();
    expect(profile.status).toBe("pending");
  });

  // C1 — signOut 은 더는 부르지 않는다(auth-js 의 admin.signOut(jwt) 은 첫 인자가
  // user id 가 아니라 access token 이라 uuid 를 넘기면 401 을 조용히 반환할 뿐이었다).
  // middleware 가 매 요청 getUser() 로 fresh app_metadata 를 받으므로 차단은
  // app_metadata.status 가 "blocked"로 바뀌는 순간 다음 요청부터 걸린다.
  it("차단하면 app_metadata.status 가 blocked 로 바뀐다 — signOut 은 부르지 않는다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "approved", role: "user" });

    const res = await adminPatchUser(patchReq({ status: "blocked" }), ctx(A));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(A, { app_metadata: { status: "blocked", role: "user" } });
    expect(signOut).not.toHaveBeenCalled();
  });

  // I2 — role 축도 status 와 같은 이중 쓰기가 필요하다. status 만 바꾸는 요청(승인)에도
  // "현재" role 이 metadata 에 함께 실려야 한다(위 "profiles 와 app_metadata 둘 다 쓴다"
  // 테스트가 role: "user"로 이미 그걸 본다). 여기서는 role 자체를 바꾸는 경로를 확인한다.
  it("role 을 바꾸면 profiles 와 app_metadata 둘 다 쓴다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "approved", role: "user" });

    const res = await adminPatchUser(patchReq({ role: "admin" }), ctx(A));
    expect(res.status).toBe(200);

    const [profile] = await memoryStore.listProfiles();
    expect(profile.role).toBe("admin");
    expect(updateUserById).toHaveBeenCalledWith(A, { app_metadata: { status: "approved", role: "admin" } });
  });

  it("존재하지 않는 사용자는 404 다", async () => {
    const res = await adminPatchUser(patchReq({ status: "approved" }), ctx("no-such-id"));
    expect(res.status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
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

// 가입 기본 지급 — 운영자가 **처음 승인할 때** 500 크레딧이 자동으로 들어간다.
//
// 왜 가입 시점이 아니라 승인 시점인가: 승인 전에는 어차피 아무것도 못 쓰므로 사장님
// 입장에서는 "가입하니 크레딧이 있다"와 똑같이 보이고, 공개 주소로 무작위 가입이
// 들어와도 장부에 지급 행이 안 쌓인다.
describe("승인하면 가입 기본 크레딧이 들어간다", () => {
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
  const patchReq = (body) => ({ json: async () => body, headers: new Headers(admin()) });

  it("처음 승인하면 500 이 들어간다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));

    expect(await balanceFor(A)).toBe(SIGNUP_GRANT);
    const [grant] = await memoryStore.listGrants(A);
    expect(grant.amount_credits).toBe(SIGNUP_GRANT);
    // 누가 승인했는지가 장부에 남아야 한다 — 자동 지급도 사람이 누른 결과다
    expect(grant.granted_by).toBe("op-1");
  });

  // ★★ credit_grants 에는 멱등키가 없다. 이 단정이 없으면 approved→pending→approved
  //    토글 한 번에 500 이 또 들어간다.
  it("승인을 껐다 켜도 두 번 주지 않는다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));
    await adminPatchUser(patchReq({ status: "pending" }), ctx(A));
    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));

    expect(await balanceFor(A)).toBe(SIGNUP_GRANT);
    expect((await memoryStore.listGrants(A)).length).toBe(1);
  });

  it("승인이 아닌 변경(차단·역할)에는 주지 않는다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });

    await adminPatchUser(patchReq({ status: "blocked" }), ctx(A));
    await adminPatchUser(patchReq({ role: "admin" }), ctx(A));

    expect(await balanceFor(A)).toBe(0);
  });

  // 이미 운영자가 손으로 넣어 준 사람도 가입 지급은 따로 한 번 받는다 — 두 지급은
  // 사유가 다르고, 손으로 준 것을 자동 지급으로 갈음하면 운영자 의도가 지워진다.
  it("이미 크레딧이 있어도 첫 승인이면 준다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });
    await memoryStore.insertGrant({ user_id: A, amount_credits: 100, reason: "운영자 선지급", granted_by: "op-1" });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));

    expect(await balanceFor(A)).toBe(100 + SIGNUP_GRANT);
  });

  // 게이트(app_metadata)가 실패하면 승인 자체가 안 된 것이므로 크레딧도 없어야 한다.
  it("app_metadata 갱신이 실패하면 크레딧도 안 준다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@x.com", status: "pending", role: "user" });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });

    await adminPatchUser(patchReq({ status: "approved" }), ctx(A));

    expect(await balanceFor(A)).toBe(0);
  });
});
