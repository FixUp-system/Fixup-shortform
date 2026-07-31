import { describe, it, expect } from "vitest";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { requireUser, NotApproved, withUser } from "../lib/auth/require-user.js";
import { currentActor } from "../lib/actor.js";

const req = (headers) => new Request("http://localhost/api/x", { headers });

describe("requireUser", () => {
  it("헤더에서 신원을 꺼낸다", () => {
    const u = requireUser(req({ [USER_HEADER]: "u-1", [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }));
    expect(u).toEqual({ id: "u-1", status: "approved", role: "user" });
  });

  it("헤더가 없으면 던진다 — matcher 밖 라우트가 조용히 통과하지 않는다", () => {
    expect(() => requireUser(req({}))).toThrow(/middleware/);
  });

  it("미승인이면 NotApproved 를 던진다", () => {
    expect(() => requireUser(req({ [USER_HEADER]: "u-1", [STATUS_HEADER]: "pending", [ROLE_HEADER]: "user" })))
      .toThrow(NotApproved);
  });

  it("차단된 계정도 NotApproved 다", () => {
    expect(() => requireUser(req({ [USER_HEADER]: "u-1", [STATUS_HEADER]: "blocked", [ROLE_HEADER]: "user" })))
      .toThrow(NotApproved);
  });
});

describe("withUser", () => {
  const ok = (h) => req({ [USER_HEADER]: "u-9", [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", ...h });

  it("핸들러에 신원을 넘기고 actor 컨텍스트를 세운다", async () => {
    const handler = withUser(async (request, ctx, user) => {
      return Response.json({ actor: currentActor(), id: user.id });
    });
    const res = await handler(ok(), {});
    expect(await res.json()).toEqual({ actor: "u-9", id: "u-9" });
  });

  it("미승인은 403 이다", async () => {
    const handler = withUser(async () => Response.json({ ok: true }));
    const res = await handler(req({ [USER_HEADER]: "u-1", [STATUS_HEADER]: "pending", [ROLE_HEADER]: "user" }), {});
    expect(res.status).toBe(403);
  });

  it("헤더 없음은 500 이다 — 조용히 통과시키지 않는다", async () => {
    const handler = withUser(async () => Response.json({ ok: true }));
    const res = await handler(req({}), {});
    expect(res.status).toBe(500);
  });

  it("adminOnly 는 일반 사용자를 403 으로 막는다", async () => {
    const handler = withUser(async () => Response.json({ ok: true }), { adminOnly: true });
    const res = await handler(ok(), {});
    expect(res.status).toBe(403);
  });

  it("adminOnly 는 운영자를 통과시킨다", async () => {
    const handler = withUser(async () => Response.json({ ok: true }), { adminOnly: true });
    const res = await handler(ok({ [ROLE_HEADER]: "admin" }), {});
    expect(res.status).toBe(200);
  });
});
