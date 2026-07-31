import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";

describe("사용자별 예산 상한", () => {
  const OLD = process.env.SHOTFORM_BUDGET_USER_USD;
  beforeEach(() => {
    resetMemoryStore();
    process.env.SHOTFORM_BUDGET_USER_USD = "1";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.SHOTFORM_BUDGET_USER_USD;
    else process.env.SHOTFORM_BUDGET_USER_USD = OLD;
  });

  it("내 지출이 상한을 넘으면 던진다", async () => {
    await memoryStore.insertCost({
      request_id: "r1", ts: 1, endpoint: "e", actor: "u-1", est_cost_usd: 0.99,
    });
    await expect(
      runWithActor("u-1", () =>
        assertBudget({ endpoint: "fal-ai/nano-banana-2", amount: 1 })
      )
    ).rejects.toThrow(BudgetExceeded);
  });

  it("남의 지출은 내 상한을 안 갉아먹는다", async () => {
    await memoryStore.insertCost({
      request_id: "r1", ts: 1, endpoint: "e", actor: "u-2", est_cost_usd: 0.99,
    });
    await expect(
      runWithActor("u-1", () =>
        assertBudget({ endpoint: "fal-ai/nano-banana-2", amount: 1 })
      )
    ).resolves.toBeUndefined();
  });

  it("초과 사유가 user 로 나온다", async () => {
    await memoryStore.insertCost({
      request_id: "r1", ts: 1, endpoint: "e", actor: "u-1", est_cost_usd: 0.99,
    });
    try {
      await runWithActor("u-1", () =>
        assertBudget({ endpoint: "fal-ai/nano-banana-2", amount: 1 })
      );
      throw new Error("던졌어야 한다");
    } catch (e) {
      expect(e.scope).toBe("user");
    }
  });
});
