// 사용자 축 — 예전에는 고정 상한($5, SHOTFORM_BUDGET_USER_USD)이었다.
// 크레딧이 붙으면서 이 축의 자(尺)가 **잔액(충전 − 쓴 것)** 으로 바뀌었다.
// 지키는 것(내 지출만 나를 막는다 · 초과 사유가 user 다)은 그대로다.
import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";

// nano-banana-2 는 장당 $0.08 — 아래 잔액 $0.01 은 못 내고 $1 은 낸다
const call = () => assertBudget({ endpoint: "fal-ai/nano-banana-2", amount: 1 });
const grant = (user, amount) =>
  memoryStore.insertGrant({ user_id: user, amount_credits: amount, reason: "충전", granted_by: "admin" });
const spend = (id, user, amount) =>
  memoryStore.insertCost({ request_id: id, ts: 1, endpoint: "e", actor: user, est_cost_usd: amount });

describe("사용자별 예산 축 — 잔액", () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it("내 지출이 충전액을 갉아먹어 잔액이 모자라면 던진다", async () => {
    await grant("u-1", 1);
    await spend("r1", "u-1", 0.99);
    await expect(runWithActor("u-1", call)).rejects.toThrow(BudgetExceeded);
  });

  it("남의 지출은 내 잔액을 안 갉아먹는다", async () => {
    await grant("u-1", 1);
    await spend("r1", "u-2", 0.99);
    await expect(runWithActor("u-1", call)).resolves.toBeUndefined();
  });

  it("충전이 아예 없으면 첫 호출부터 막는다 — 옛 고정 상한이면 통과해 버리던 자리다", async () => {
    await expect(runWithActor("u-1", call)).rejects.toThrow(BudgetExceeded);
  });

  it("초과 사유가 user 로 나온다", async () => {
    await grant("u-1", 1);
    await spend("r1", "u-1", 0.99);
    try {
      await runWithActor("u-1", call);
      throw new Error("던졌어야 한다");
    } catch (e) {
      expect(e.scope).toBe("user");
      expect(e.message).toMatch(/크레딧이 모자라요/);
    }
  });
});
