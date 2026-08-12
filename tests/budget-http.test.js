// 예산 오류가 프레임워크 500 으로 새면 사장님은 "왜 안 되지"만 본다.
// withUser 한 곳에서 옮긴다 — 라우트마다 붙이면 새 라우트에서 또 빠뜨린다.
import { describe, it, expect } from "vitest";
import { withUser } from "../lib/auth/require-user.js";
import { BudgetExceeded } from "../lib/costs.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const req = () =>
  new Request("http://localhost/api/x", {
    headers: {
      [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
      [STATUS_HEADER]: "approved",
      [ROLE_HEADER]: "user",
    },
  });

const throwing = (scope) =>
  withUser(async () => { throw new BudgetExceeded(1, 2, scope); });

describe("withUser 가 예산 오류를 옮긴다", () => {
  it("체험 한도는 402 다 — 사장님이 할 일이 있다(크레딧 받기)", async () => {
    const res = await throwing("trial")(req(), {});
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/체험/);
  });

  it("잔액 부족도 402 다", async () => {
    expect((await throwing("user")(req(), {})).status).toBe(402);
  });

  // 전역·프로젝트 상한은 우리 안전핀이다 — 사장님 잘못이 아니니 402 로 말하면 안 된다.
  it("우리 안전핀은 503 이다", async () => {
    expect((await throwing("total")(req(), {})).status).toBe(503);
    expect((await throwing("project")(req(), {})).status).toBe(503);
  });

  it("예산과 무관한 오류는 그대로 던진다 — 조용히 402 로 뭉개지 않는다", async () => {
    const boom = withUser(async () => { throw new Error("펑"); });
    await expect(boom(req(), {})).rejects.toThrow("펑");
  });

  it("정상 응답은 그대로 지나간다", async () => {
    const ok = withUser(async () => Response.json({ ok: true }));
    expect((await ok(req(), {})).status).toBe(200);
  });
});
