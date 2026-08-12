// 체험 한도 — 크레딧 없이 도는 경로에 그물을 친다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";

// 원장에 원가를 꽂는다. endpoint 는 아무 것이나 좋다 — 여기서 재는 것은 합계다.
async function spend(usd) {
  // ★ 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  // `user` 로 적으면 스토어가 `actor` 로 옮겨 준다 — sumCosts({actor}) 가 그 필드를 본다
  // (lib/store/memory.js:109-113 주석 참고).
  await memoryStore.insertCost({
    request_id: `r-${Math.round(usd * 1e6)}-${Date.now()}-${Math.random()}`,
    ts: Date.now(), endpoint: "openai/gpt-4o", stage: "대본",
    user: A, project_id: null, est_cost_usd: usd, status: "done",
  });
}

const guard = () => runWithActor(A, () => assertBudget({ endpoint: "openai/gpt-4o", amount: 0 }));

describe("체험 한도", () => {
  beforeEach(() => resetMemoryStore());

  it("갓 가입한 사장님은 통과한다 — 크레딧 0 이어도 대본까지는 만들어 봐야 한다", async () => {
    await expect(guard()).resolves.toBeUndefined();
  });

  it("한도 아래면 통과한다", async () => {
    await spend(FREE_TRIAL_USD - 0.1);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("한도를 넘으면 막는다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    await expect(guard()).rejects.toThrow(BudgetExceeded);
  });

  it("막을 때 scope 가 trial 이고 문구가 크레딧을 말한다 — 잔액 부족과 다른 상황이다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    await guard().then(
      () => { throw new Error("막았어야 한다"); },
      (e) => {
        expect(e.scope).toBe("trial");
        expect(e.message).toMatch(/체험/);
        expect(e.message).toMatch(/크레딧/);
      }
    );
  });

  // ★ 돈을 낸 사장님이 이 그물에 걸리면 안 된다.
  it("크레딧이 있으면 누적이 한도를 훌쩍 넘어도 통과한다", async () => {
    // sumGrants 는 amount_credits 를 센다(lib/store/memory.js:146).
    await memoryStore.insertGrant({ user_id: A, amount_credits: 100, reason: "테스트" });
    await spend(FREE_TRIAL_USD * 10);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("남의 지출은 내 한도에 안 들어간다", async () => {
    const B = "00000000-0000-4000-8000-00000000000b";
    await memoryStore.insertCost({
      request_id: "r-other", ts: Date.now(), endpoint: "openai/gpt-4o", stage: "대본",
      user: B, project_id: null, est_cost_usd: FREE_TRIAL_USD * 5, status: "done",
    });
    await expect(guard()).resolves.toBeUndefined();
  });

  it("가짜 모드는 잴 것이 없다 — 그물을 아예 안 친다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    await expect(guard()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});
