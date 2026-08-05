import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST as grantPOST } from "../app/api/admin/users/[id]/credits/route.js";
import { GET as creditsGET } from "../app/api/credits/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const headersFor = (id, role = "user") => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const grantReq = (who, role, body) =>
  new Request("http://localhost/api/admin/users/x/credits", {
    method: "POST", headers: headersFor(who, role), body: JSON.stringify(body),
  });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

describe("POST /api/admin/users/[id]/credits", () => {
  beforeEach(() => resetMemoryStore());

  it("운영자가 편수로 넣으면 장부에 남고 잔액이 오른다", async () => {
    const res = await grantPOST(grantReq(ADMIN, "admin", { videos: 2, reason: "체험" }), ctx(A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.videos_left).toBe(2);
    expect(body.balance_usd).toBeGreaterThan(0);
  });

  it("음수로 회수할 수 있다", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { videos: 3, reason: "충전" }), ctx(A));
    const res = await grantPOST(grantReq(ADMIN, "admin", { videos: -2, reason: "정정" }), ctx(A));
    expect((await res.json()).videos_left).toBe(1);
  });

  it("누가 왜 넣었는지가 남는다 — 감사", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { videos: 1, reason: "체험 1편" }), ctx(A));
    const sum = await getStore().sumGrants(A);
    expect(sum).toBeGreaterThan(0);
    const m = await getStore().listGrantsFor([A]);
    expect(m.get(A)).toBeCloseTo(sum, 6);
  });

  it("운영자가 아니면 403", async () => {
    expect((await grantPOST(grantReq(A, "user", { videos: 1, reason: "내가 나에게" }), ctx(A))).status).toBe(403);
  });

  it("사유가 없으면 400 — 감사 로그가 비면 장부가 아니다", async () => {
    expect((await grantPOST(grantReq(ADMIN, "admin", { videos: 1, reason: "  " }), ctx(A))).status).toBe(400);
  });

  it("0 편은 400", async () => {
    expect((await grantPOST(grantReq(ADMIN, "admin", { videos: 0, reason: "무의미" }), ctx(A))).status).toBe(400);
  });
});

describe("GET /api/credits", () => {
  beforeEach(() => resetMemoryStore());

  it("내 잔액을 편수와 함께 준다", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { videos: 2, reason: "충전" }), ctx(A));
    const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.videos_left).toBe(2);
    expect(body.per_video_usd).toBeGreaterThan(0);
  });

  it("충전이 없으면 0편", async () => {
    const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
    expect((await res.json()).videos_left).toBe(0);
  });
});
