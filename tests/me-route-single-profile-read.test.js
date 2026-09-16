// GET /api/me — 프로필을 한 번만 읽는다.
//
// 왜: 이 라우트가 store.findProfiles 로 프로필을 읽고, 곧이어 creditsEnabledFor(lib/charges.js)가
// **같은 프로필**을 한 번 더 읽었다(실측 23~68ms). 라우트가 이미 읽은 값을 creditsEnabledFor
// 에 넘기면 그 둘째 조회가 통째로 사라진다. tests/me-route.test.js 는 lib/charges.js 를
// 통째로 mock 하므로 이 중복은 거기서는 안 보인다 — 여기서는 실제 스토어로 잰다.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET } from "../app/api/me/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const req = (id) => new Request("http://localhost/api/me", {
  headers: { [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

describe("GET /api/me — 프로필 조회가 하나다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: A, email: "a@example.com", status: "approved", role: "user" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("findProfiles 를 정확히 한 번 부른다", async () => {
    const spy = vi.spyOn(memoryStore, "findProfiles");
    const res = await GET(req(A), {});
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("내부 계정이어도 여전히 한 번이다 — 면제 판정도 같은 프로필을 쓴다", async () => {
    await memoryStore.updateProfile(A, { internal: true });
    const spy = vi.spyOn(memoryStore, "findProfiles");
    const body = await (await GET(req(A), {})).json();
    expect(body.internal).toBe(true);
    expect(body.gated).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
