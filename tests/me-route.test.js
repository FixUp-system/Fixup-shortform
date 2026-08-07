// GET /api/me — 상단바와 마이페이지가 함께 쓴다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

vi.mock("../lib/charges.js", () => ({ balanceFor: async () => 85.18 }));

const { GET } = await import("../app/api/me/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const req = (id, status = "approved") =>
  new Request("http://localhost/api/me", {
    headers: { [USER_HEADER]: id, [STATUS_HEADER]: status, [ROLE_HEADER]: "user" },
  });

describe("GET /api/me", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "jaechan@fix-up.kr", status: "approved", role: "user" });
  });

  it("이메일·이름·가입일·잔액·영상 수를 한 번에 준다", async () => {
    await memoryStore.updateProfile(A, { display_name: "윤재찬" });
    await memoryStore.insertProject({ id: "p1", created_ts: 1, status: "draft" }, A);
    const res = await GET(req(A), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("jaechan@fix-up.kr");
    expect(body.name).toBe("윤재찬");
    expect(body.balance).toBe(85.18);
    expect(body.projectCount).toBe(1);
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.gated).toBe("boolean");
  });

  it("이름을 안 정했으면 이메일 앞부분을 준다 — 화면에 빈 자리가 생기지 않게", async () => {
    expect((await (await GET(req(A), {})).json()).name).toBe("jaechan");
  });

  it("승인 대기자는 403 이다", async () => {
    expect((await GET(req(A, "pending"), {})).status).toBe(403);
  });

  it("프로필이 없으면 404 — 조용히 빈 값을 주지 않는다", async () => {
    const ghost = "00000000-0000-4000-8000-00000000ffff";
    expect((await GET(req(ghost), {})).status).toBe(404);
  });
});
