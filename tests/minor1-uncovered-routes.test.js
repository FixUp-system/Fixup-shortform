// ★ 최종 리뷰 Minor 1 — 변이로 withUser·adminOnly 를 떼도 전부 그린이던 라우트 4개.
// 각각 최소 한 줄: 주인(또는 admin) 200 / 남 또는 비-admin 은 막힘.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const headersFor = (id, role = "user", status = "approved") => ({
  [USER_HEADER]: id,
  [STATUS_HEADER]: status,
  [ROLE_HEADER]: role,
});

const ORIG_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIG_FETCH;
});

// ── POST /api/projects/[id]/voice — withUser ────────────────────────────
describe("POST /api/projects/[id]/voice — withUser", () => {
  const ORIG_FAKE = process.env.SHOTFORM_FAKE;
  beforeEach(() => {
    resetMemoryStore();
    process.env.SHOTFORM_FAKE = "all"; // 백그라운드 파이프라인이 실제 fal·OpenAI 를 안 부르게
  });
  afterEach(() => {
    if (ORIG_FAKE === undefined) delete process.env.SHOTFORM_FAKE;
    else process.env.SHOTFORM_FAKE = ORIG_FAKE;
  });

  it("주인은 200(started) 이고, 남은 404 다", async () => {
    const { POST } = await import("../app/api/projects/[id]/voice/route.js");
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await updateProject(p.id, A, (proj) => ({ ...proj, cuts: [{ idx: 0, sentence: "문장" }] }));
    const ctx = { params: Promise.resolve({ id: p.id }) };

    const ownerReq = {
      json: async () => ({ voiceLabel: "차분한 여성" }),
      headers: new Headers(headersFor(A)),
    };
    const ok = await POST(ownerReq, ctx);
    expect(ok.status).toBe(200);

    const otherReq = {
      json: async () => ({ voiceLabel: "차분한 여성" }),
      headers: new Headers(headersFor(B)),
    };
    const denied = await POST(otherReq, ctx);
    expect(denied.status).toBe(404);
  });
});

// ── POST /api/chat — withUser ───────────────────────────────────────────
describe("POST /api/chat — withUser", () => {
  const ORIG_KEY = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    if (ORIG_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIG_KEY;
  });

  const openAiOk = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ action: "ask", message: "m", quick_replies: [] }) } }],
    }),
  });

  it("헤더가 없으면 500 이고 OpenAI 를 부르지 않는다", async () => {
    const { POST } = await import("../app/api/chat/route.js");
    let called = false;
    global.fetch = async () => {
      called = true;
      return openAiOk();
    };
    const bare = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "me", text: "안녕" }] }),
    });
    const res = await POST(bare);
    expect(res.status).toBe(500);
    expect(called).toBe(false);
  });

  it("신원이 있으면 200 이다", async () => {
    const { POST } = await import("../app/api/chat/route.js");
    global.fetch = async () => openAiOk();
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...headersFor(A) },
      body: JSON.stringify({ messages: [{ role: "me", text: "안녕" }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ── GET /api/video/status — withUser ────────────────────────────────────
describe("GET /api/video/status — withUser", () => {
  const ORIG_FAL = process.env.FAL_KEY;
  beforeEach(() => {
    process.env.FAL_KEY = "test-fal-key";
  });
  afterEach(() => {
    if (ORIG_FAL === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = ORIG_FAL;
  });

  it("헤더가 없으면 500 이고 fal 을 부르지 않는다", async () => {
    const { GET } = await import("../app/api/video/status/route.js");
    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ status: "IN_QUEUE" }) };
    };
    const bare = new Request("http://localhost/api/video/status?id=r1");
    const res = await GET(bare);
    expect(res.status).toBe(500);
    expect(called).toBe(false);
  });

  it("신원이 있으면 조회를 시도한다(200)", async () => {
    const { GET } = await import("../app/api/video/status/route.js");
    global.fetch = async () => ({ ok: true, json: async () => ({ status: "IN_QUEUE", queue_position: 1 }) });
    const req = new Request("http://localhost/api/video/status?id=r1", { headers: headersFor(A) });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

// ── GET /api/admin/users — adminOnly ────────────────────────────────────
// 이 라우트는 승인된 일반 사용자도 통과시키면(=adminOnly 가 빠지면) 전체 이메일·역할
// 목록을 그대로 내보낸다 — 지금 4개 중 유일하게 "떼면 정보가 샌다" 종류다.
describe("GET /api/admin/users — adminOnly", () => {
  beforeEach(() => resetMemoryStore());

  it("운영자는 200 이고 전체 목록을 받는다", async () => {
    const { GET } = await import("../app/api/admin/users/route.js");
    await memoryStore.insertProfile({ id: A, email: "boss@fix-up.kr", status: "approved", role: "admin" });
    const req = new Request("http://localhost/api/admin/users", { headers: headersFor(A, "admin") });
    const res = await GET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
  });

  it("승인된 일반 사용자는 403 이다 — 전체 이메일·역할 목록을 못 본다", async () => {
    const { GET } = await import("../app/api/admin/users/route.js");
    const req = new Request("http://localhost/api/admin/users", { headers: headersFor(B, "user") });
    const res = await GET(req, {});
    expect(res.status).toBe(403);
  });
});
