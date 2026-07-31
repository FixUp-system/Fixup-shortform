import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

describe("sumCosts 가 actor 로도 가른다", () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  async function seed() {
    await memoryStore.insertCost({ request_id: "r1", ts: 1, endpoint: "e", actor: "u-1", project_id: "p1", est_cost_usd: 1 });
    await memoryStore.insertCost({ request_id: "r2", ts: 2, endpoint: "e", actor: "u-2", project_id: "p1", est_cost_usd: 2 });
    await memoryStore.insertCost({ request_id: "r3", ts: 3, endpoint: "e", actor: "u-1", project_id: "p2", est_cost_usd: 4 });
  }

  it("actor 만 주면 그 사람 합계", async () => {
    await seed();
    expect(await memoryStore.sumCosts({ actor: "u-1" })).toBe(5);
    expect(await memoryStore.sumCosts({ actor: "u-2" })).toBe(2);
  });

  it("아무것도 안 주면 전체 합계", async () => {
    await seed();
    expect(await memoryStore.sumCosts({})).toBe(7);
  });

  it("projectId 와 actor 를 함께 주면 둘 다 만족하는 것만", async () => {
    await seed();
    expect(await memoryStore.sumCosts({ projectId: "p1", actor: "u-1" })).toBe(1);
  });
});
