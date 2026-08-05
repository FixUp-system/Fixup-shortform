// 호출 게이트 — fal 로 나가기 직전. 잔액을 넘으면 요청 자체가 안 나가야 한다.
// 옛 quick-create-budget.test.js 가 지키던 자리다(t2v 와 함께 삭제됐다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { assertBudget } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ORIG = { ...process.env };

// 되돌릴 때 undefined 를 그대로 넣으면 문자열 "undefined" 가 된다 — 지워야 한다
const restore = (k) => {
  if (ORIG[k] === undefined) delete process.env[k];
  else process.env[k] = ORIG[k];
};

// PRICE_TABLE 에 실제로 있는 prefix 다($0.084/s) — 없는 문자열을 쓰면 기본 단가로 떨어진다
const KLING = "fal-ai/kling-video/v3/standard/image-to-video";

describe("호출 게이트 — 사용자 축은 잔액이다", () => {
  beforeEach(() => {
    resetMemoryStore();
    // 전역·프로젝트 상한은 이 테스트의 관심사가 아니다 — 넉넉히 열어 둔다
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "1000";
    process.env.SHOTFORM_BUDGET_PROJECT_USD = "1000";
    delete process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_FAKE_IMAGES;
  });
  afterEach(() => {
    restore("SHOTFORM_BUDGET_TOTAL_USD");
    restore("SHOTFORM_BUDGET_PROJECT_USD");
    restore("SHOTFORM_FAKE");
    restore("SHOTFORM_FAKE_IMAGES");
  });

  it("충전이 없으면 첫 호출부터 막는다 — 옛 고정 상한($5)이 남아 있으면 통과해 버린다", async () => {
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "user" });
    });
  });

  it("충전이 있으면 그 안에서 통과한다", async () => {
    await getStore().insertGrant({ user_id: A, amount_usd: 10, reason: "충전", granted_by: ADMIN });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .resolves.toBeUndefined();
    });
  });

  it("쓴 만큼 줄어들어 결국 막힌다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 1, reason: "충전", granted_by: ADMIN });
    // ★ 스토어의 비용 기록 메서드 이름은 insertCost 다
    await store.insertCost({
      request_id: "spent-1", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: A, est_cost_usd: 0.95, status: "done",
    });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "user" });
    });
  });

  it("남의 지출은 내 잔액을 안 갉아먹는다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 1, reason: "충전", granted_by: ADMIN });
    await store.insertCost({
      request_id: "other-1", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: "00000000-0000-4000-8000-00000000000b", est_cost_usd: 0.95, status: "done",
    });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .resolves.toBeUndefined();
    });
  });

  it("전역 상한은 그대로 회사 안전핀이다 — 잔액이 넉넉해도 막힌다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "0.01";
    await getStore().insertGrant({ user_id: A, amount_usd: 1000, reason: "충전", granted_by: ADMIN });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "total" });
    });
  });
});
