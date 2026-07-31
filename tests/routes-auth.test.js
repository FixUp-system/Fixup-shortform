import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getProjectRoute } from "../app/api/projects/[id]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const reqAs = (id) =>
  new Request("http://localhost/api/projects/x", {
    headers: { [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
  });

describe("프로젝트 라우트 인증", () => {
  beforeEach(() => resetMemoryStore());

  it("주인은 읽는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const res = await getProjectRoute(reqAs(A), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
  });

  it("남은 404 다 — 존재 여부를 흘리지 않는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const res = await getProjectRoute(reqAs(B), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(404);
  });

  it("신원 헤더가 없으면 500 이다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const bare = new Request("http://localhost/api/projects/x");
    const res = await getProjectRoute(bare, { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(500);
  });

  it("미승인은 403 이다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const pendingReq = new Request("http://localhost/api/projects/x", {
      headers: { [USER_HEADER]: A, [STATUS_HEADER]: "pending", [ROLE_HEADER]: "user" },
    });
    const res = await getProjectRoute(pendingReq, { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(403);
  });
});
