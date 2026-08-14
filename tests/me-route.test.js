// GET /api/me — 상단바와 마이페이지가 함께 쓴다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

// creditsEnabled 도 함께 준다 — 라우트가 gated 를 그것으로 판정한다(2026-08-14).
vi.mock("../lib/charges.js", () => ({ balanceFor: async () => 85.18, creditsEnabled: () => true }));

const { GET, PATCH } = await import("../app/api/me/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const req = (id, status = "approved", role = "user") =>
  new Request("http://localhost/api/me", {
    headers: { [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: role },
  });

describe("GET /api/me", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("이메일·이름·가입일·잔액을 한 번에 준다", async () => {
    await memoryStore.updateProfile(A, { display_name: "윤재찬" });
    await memoryStore.insertProject({ id: "p1", created_ts: 1, status: "draft" }, A);
    const res = await GET(req(A), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("jaechan@fix-up.kr");
    expect(body.name).toBe("윤재찬");
    expect(body.balance).toBe(85.18);
    // ★ 영상 수는 안 센다 — 그 줄이 마이페이지에서 빠졌다(보관함이 따로 있다).
    // 화면이 안 쓰는 값을 위해 요청마다 count 쿼리를 한 번 더 날릴 이유가 없다.
    expect(body.projectCount).toBeUndefined();
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.gated).toBe("boolean");
  });

  it("이름을 안 정했으면 이메일 앞부분을 준다 — 화면에 빈 자리가 생기지 않게", async () => {
    expect((await (await GET(req(A), {})).json()).name).toBe("jaechan");
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await GET(req(A, "pending"), {})).status).toBe(403);
  });

  // 사이드바가 운영자 전용 링크(비용 기록)를 그릴지 이 하나로 정한다.
  it("운영자에게 isAdmin: true 를 준다", async () => {
    const body = await (await GET(req(A, "approved", "admin"), {})).json();
    expect(body.isAdmin).toBe(true);
  });

  it("일반 사장님에게는 isAdmin: false 다", async () => {
    const body = await (await GET(req(A), {})).json();
    expect(body.isAdmin).toBe(false);
  });

  it("원문 role 은 흘리지 않는다 — 화면이 쓸 판정 하나만 준다", async () => {
    const body = await (await GET(req(A, "approved", "admin"), {})).json();
    expect(body.role).toBeUndefined();
  });

  it("프로필이 없으면 404 — 조용히 빈 값을 주지 않는다", async () => {
    const ghost = "00000000-0000-4000-8000-00000000ffff";
    expect((await GET(req(ghost), {})).status).toBe(404);
  });
});

const patch = (id, body, status = "approved") =>
  new Request("http://localhost/api/me", {
    method: "PATCH",
    headers: {
      [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("PATCH /api/me", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("이름을 저장한다", async () => {
    expect((await PATCH(patch(A, { name: "윤재찬" }), {})).status).toBe(200);
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe("윤재찬");
  });

  it("앞뒤 공백을 떼고 저장한다", async () => {
    await PATCH(patch(A, { name: "  윤재찬  " }), {});
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe("윤재찬");
  });

  it("공백만 넣으면 null 로 되돌린다 — 이메일 폴백으로 돌아간다", async () => {
    await PATCH(patch(A, { name: "윤재찬" }), {});
    await PATCH(patch(A, { name: "   " }), {});
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });

  it("21자는 400 이고 저장되지 않는다", async () => {
    const long = "가".repeat(21);
    expect((await PATCH(patch(A, { name: long }), {})).status).toBe(400);
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });

  it("name 이 없으면 400", async () => {
    expect((await PATCH(patch(A, {}), {})).status).toBe(400);
  });

  // ★ 권한 상승 자리 — 몸통에 무엇을 실어 보내도 이름 말고는 반영되지 않아야 한다.
  it("role·status 를 실어 보내도 안 바뀐다", async () => {
    await PATCH(patch(A, { name: "윤재찬", role: "admin", status: "approved", email: "evil@x.com" }), {});
    const p = (await memoryStore.findProfiles([A])).get(A);
    expect(p.role).toBe("user");
    expect(p.email).toBe("jaechan@fix-up.kr");
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await PATCH(patch(A, { name: "윤재찬" }, "pending"), {})).status).toBe(403);
  });
});
