// 사용자 관리 — 운영자가 계정을 **바로 만들고**, **기록 보존형으로 삭제·복구**한다(2026-09-17 사장님 지시).
//
// ★ 삭제가 "기록 보존형"인 이유(사장님 결정): Supabase 에서 계정을 진짜로 지우면
//   credit_grants·credit_charges 가 `on delete cascade` 라 **충전·사용 내역이 함께 사라진다.**
//   그래서 로그인만 영구히 막고(ban) 상태를 deleted 로 두며, 계정·내역·영상은 남긴다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { SIGNUP_GRANT, SIGNUP_GRANT_REASON } from "../lib/pricing.js";

const updateUserById = vi.fn();
const createUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { updateUserById, createUser } } }),
}));
const { POST: createRoute } = await import("../app/api/admin/users/route.js");
const { DELETE: deleteRoute, PATCH: patchRoute } = await import("../app/api/admin/users/[id]/route.js");
const { POST: restoreRoute } = await import("../app/api/admin/users/[id]/restore/route.js");

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const A = "00000000-0000-4000-8000-00000000000a";
const OTHER_ADMIN = "00000000-0000-4000-8000-0000000000ae";
const NEW_ID = "00000000-0000-4000-8000-0000000000f1";
const headersFor = (id, role) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const req = (who, role, method, body) =>
  new Request("http://localhost/x", { method, headers: headersFor(who, role), ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const profile = async (id) => (await getStore().findProfiles([id])).get(id);

beforeEach(async () => {
  resetMemoryStore();
  vi.clearAllMocks();
  updateUserById.mockResolvedValue({ error: null });
  createUser.mockResolvedValue({ data: { user: { id: NEW_ID } }, error: null });
  await getStore().insertProfile({ id: ADMIN, email: "boss@fix-up.kr", status: "approved", role: "admin" });
  await getStore().insertProfile({ id: OTHER_ADMIN, email: "ops@fix-up.kr", status: "approved", role: "admin" });
  await getStore().insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
});

describe("POST /api/admin/users — 계정 추가", () => {
  const good = { name: "홍길동", email: "new@example.com", password: "newpass123" };

  it("★★★ 만든 계정은 **바로 승인**되고 이름이 붙고, 가입 기본 지급이 한 번 들어간다", async () => {
    const res = await createRoute(req(ADMIN, "admin", "POST", good), {});
    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({
      email: "new@example.com", password: "newpass123", email_confirm: true,
      app_metadata: { status: "approved", role: "user" },
    });
    const p = await profile(NEW_ID);
    expect(p.status).toBe("approved");
    expect(p.display_name).toBe("홍길동");
    const grants = await getStore().listGrants(NEW_ID);
    expect(grants.filter((g) => g.reason === SIGNUP_GRANT_REASON)).toHaveLength(1);
    expect(grants[0].amount_credits).toBe(SIGNUP_GRANT);
  });

  it("★ 응답에 비밀번호가 없다", async () => {
    const res = await createRoute(req(ADMIN, "admin", "POST", good), {});
    expect(await res.text()).not.toContain("newpass123");
  });

  it("비운영자는 403 이고 Supabase 를 부르지 않는다", async () => {
    expect((await createRoute(req(A, "user", "POST", good), {})).status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...good, name: "  " }, "이름"],
    [{ ...good, email: "not-an-email" }, "이메일"],
    [{ ...good, password: "12" }, "비밀번호"],
  ])("잘못된 입력은 400 — %s 의 %s", async (body) => {
    expect((await createRoute(req(ADMIN, "admin", "POST", body), {})).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("★ 이미 가입된 이메일은 409 로 알아듣게 말한다", async () => {
    createUser.mockResolvedValue({ data: null, error: { message: "A user with this email address has already been registered" } });
    const res = await createRoute(req(ADMIN, "admin", "POST", good), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("이미 가입된 이메일이에요");
  });
});

describe("DELETE /api/admin/users/[id] — 기록 보존형 삭제", () => {
  it("★★★ 로그인을 영구히 막고 상태만 deleted 로 — **크레딧 내역은 남는다**", async () => {
    await getStore().insertGrant({ user_id: A, amount_credits: 50, reason: "체험", granted_by: ADMIN });
    const res = await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(A, {
      ban_duration: "876000h",
      app_metadata: { status: "deleted", role: "user" },
    });
    expect((await profile(A)).status).toBe("deleted");
    expect(await getStore().listGrants(A), "삭제가 크레딧 내역을 지웠다").toHaveLength(1);
  });

  it("★★ 자기 계정은 못 지운다", async () => {
    expect((await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(ADMIN))).status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("★★ 운영자 계정은 못 지운다 — 먼저 역할을 내린다", async () => {
    expect((await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(OTHER_ADMIN))).status).toBe(400);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("비운영자는 403 · 없는 사용자는 404", async () => {
    expect((await deleteRoute(req(A, "user", "DELETE"), ctx(A))).status).toBe(403);
    expect((await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx("00000000-0000-4000-8000-00000000ffff"))).status).toBe(404);
  });

  it("★ 게이트 쓰기가 실패하면 502 이고 원장은 그대로다 — 순서가 게이트 먼저다", async () => {
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    expect((await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A))).status).toBe(502);
    expect((await profile(A)).status).toBe("approved");
  });

  it("두 번 눌러도 같은 결과다", async () => {
    await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A));
    updateUserById.mockClear();
    expect((await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A))).status).toBe(200);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("★★★ 삭제된 계정은 승인 문(PATCH)으로 못 살린다 — 로그인 금지가 남아 '승인했는데 못 들어온다'가 된다", async () => {
    await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A));
    const res = await patchRoute(req(ADMIN, "admin", "PATCH", { status: "approved" }), ctx(A));
    expect(res.status).toBe(409);
    expect((await profile(A)).status).toBe("deleted");
  });
});

describe("POST /api/admin/users/[id]/restore — 복구", () => {
  it("★★★ 로그인 금지를 풀고 승인 상태로 되돌린다 — 기본 지급은 다시 안 준다", async () => {
    await deleteRoute(req(ADMIN, "admin", "DELETE"), ctx(A));
    updateUserById.mockClear();
    const res = await restoreRoute(req(ADMIN, "admin", "POST"), ctx(A));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(A, {
      ban_duration: "none",
      app_metadata: { status: "approved", role: "user" },
    });
    expect((await profile(A)).status).toBe("approved");
    expect(await getStore().listGrants(A), "복구가 크레딧을 찍어 냈다").toHaveLength(0);
  });

  it("삭제되지 않은 계정은 409 · 비운영자는 403", async () => {
    expect((await restoreRoute(req(ADMIN, "admin", "POST"), ctx(A))).status).toBe(409);
    expect((await restoreRoute(req(A, "user", "POST"), ctx(A))).status).toBe(403);
  });
});

describe("사용자 관리 화면", () => {
  const page = readFileSync("app/admin/page.js", "utf8");

  it("★★ [+ 사용자 추가] 버튼과 이름·이메일·비밀번호 칸이 있다", () => {
    expect(page).toContain("+ 사용자 추가");
    expect(page).toMatch(/aria-label="이름"/);
    expect(page).toMatch(/aria-label="이메일"/);
    expect(page).toMatch(/type="password"/);
    expect(page, "추가가 계정 추가 문을 안 부른다").toMatch(/fetch\("\/api\/admin\/users", \{\s*method: "POST"/);
  });

  it("★★ [계정 삭제]는 자기·운영자·이미 삭제된 계정에 안 그린다", () => {
    expect(page).toMatch(/panelUser\.status !== "deleted" && panelUser\.self !== true && panelUser\.role !== "admin"/);
    expect(page, "삭제 전 확인을 안 묻는다").toMatch(/confirmLabel: "삭제"/);
  });

  it("★★ 「전체」에는 삭제된 계정이 안 섞이고, 「삭제됨」에서 복구한다", () => {
    expect(page).toMatch(/statusFilter \? u\.status === statusFilter : u\.status !== "deleted"/);
    expect(page).toContain('["deleted", "삭제됨"]');
    expect(page).toContain("restoreUser(panelUser)");
  });
});

describe("로그인 뒤 번쩍임", () => {
  it("★★★ 로그인하면 `/` 를 경유하지 않고 곧바로 `/home` 으로 간다", () => {
    const login = readFileSync("app/login/page.js", "utf8");
    expect(login).toContain('router.replace(back || "/home")');
    expect(login, "`/` 를 경유한다 — 그 사이 앱 껍데기(사이드바)가 번쩍인다").not.toContain('router.replace(back || "/")');
  });

  it("★ 운영자 화면에서 되돌려 보낼 때도 `/home` 이다", () => {
    const mw = readFileSync("middleware.js", "utf8");
    const at = mw.indexOf("isAdminPath(pathname) && role !== \"admin\"");
    expect(mw.slice(at, at + 400)).toContain('to.pathname = "/home"');
  });
});
