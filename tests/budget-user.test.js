// 사용자 축 — 자(尺)가 두 번 바뀌었다.
//   ① 고정 상한($5, SHOTFORM_BUDGET_USER_USD)  → 죽은 env
//   ② 잔액(충전 − USD 지출)                    → 크레딧 가격표가 들어오며 폐기
//   ③ **크레딧 잔액(충전 − 청구)** — 지금. 정가는 유료 흐름을 시작하기 전에 이미 받으므로
//      이 축은 컷 단위로 다시 재지 않는다. 남은 일은 하나다: **음수인 채로 fal 이 나가지 않게.**
// 지키는 것(내 것만 나를 막는다 · 초과 사유가 user 다)은 그대로다.
import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";

// nano-banana-2 는 장당 $0.08 — USD 견적은 전역·프로젝트 축에서만 쓰인다
const call = () => assertBudget({ endpoint: "fal-ai/nano-banana-2", amount: 1 });
const grant = (user, credits) =>
  memoryStore.insertGrant({ user_id: user, amount_credits: credits, reason: "충전", granted_by: "admin" });
const charge = (key, user, credits) =>
  memoryStore.insertCharge({
    user_id: user, project_id: "p", kind: "video", credits, idem_key: key,
  });
const spend = (id, user, usd) =>
  memoryStore.insertCost({ request_id: id, ts: 1, endpoint: "e", actor: user, est_cost_usd: usd });

describe("사용자별 예산 축 — 크레딧 잔액", () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it("잔액이 음수면 던진다", async () => {
    await grant("u-1", 50);
    await charge("c1", "u-1", 60);
    await expect(runWithActor("u-1", call)).rejects.toThrow(BudgetExceeded);
  });

  // ★ 누적 원가를 얹어야 이 계약이 실제로 물린다. 원장이 비어 있으면 체험 한도($0.5)
  //   아래라 **아무 판정도 안 거치고** 우연히 통과한다($0.08 짜리 호출 하나뿐이므로).
  //   30초 한 편 원가가 $3.06 이라 실제로는 여기서 그 값을 이미 넘긴 상태다.
  it("잔액이 0 이면 통과한다 — 그 값은 시작 전에 이미 받았다", async () => {
    await grant("u-1", 50);
    await charge("c1", "u-1", 50);
    await spend("r-paid", "u-1", 3.06);
    await expect(runWithActor("u-1", call)).resolves.toBeUndefined();
  });

  it("충전이 아예 없어도 잔액 0 이라 이 축은 통과한다 — 막는 것은 시작 게이트다", async () => {
    await expect(runWithActor("u-1", call)).resolves.toBeUndefined();
  });

  it("남의 청구는 내 잔액을 안 갉아먹는다", async () => {
    await grant("u-1", 10);
    await charge("c1", "u-2", 1000);
    await expect(runWithActor("u-1", call)).resolves.toBeUndefined();
  });

  // ★ 자가 바뀌었다: USD 원장(cost_records)은 더 이상 사용자 축을 깎지 않는다.
  // 원가는 회사가 지고, 사장님이 내는 것은 정가(크레딧)다. USD 상한은 전역·프로젝트에만 남는다.
  it("USD 원장은 사용자 축을 깎지 않는다 — 이 축의 자는 크레딧이다", async () => {
    await grant("u-1", 1);
    // $10 은 전역 상한($20)·프로젝트 상한 아래다 — 여기서 걸리면 다른 축을 재는 것이 된다
    await spend("r1", "u-1", 10);
    await expect(runWithActor("u-1", call)).resolves.toBeUndefined();
  });

  it("초과 사유가 user 로 나온다", async () => {
    await grant("u-1", 1);
    await charge("c1", "u-1", 2);
    try {
      await runWithActor("u-1", call);
      throw new Error("던졌어야 한다");
    } catch (e) {
      expect(e.scope).toBe("user");
      expect(e.message).toMatch(/크레딧이 모자라요/);
    }
  });
});
