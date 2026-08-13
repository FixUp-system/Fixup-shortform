// 체험 한도 — 크레딧 없이 도는 경로에 그물을 친다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { assertBudget, BudgetExceeded } from "../lib/costs.js";
import { requireVideoCharge, refundVideo } from "../lib/charges.js";
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

  // 경계값 — 정확히 한도인 지점은 아직 통과다(`>` 이지 `>=` 가 아니다).
  // 이 케이스가 없으면 판정을 `>=` 로 바꿔도 아무도 안 잡는다.
  it("딱 한도까지는 통과한다 — 넘어야 막는다", async () => {
    await spend(FREE_TRIAL_USD);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("한도를 티끌만큼만 넘어도 막는다", async () => {
    await spend(FREE_TRIAL_USD);
    await spend(0.000001);
    await expect(guard()).rejects.toThrow(BudgetExceeded);
  });

  // ★★ 이 그룹이 이번 수정의 본체다 — 돈을 낸 사장님이 자기가 산 영상 도중에 갇히면 안 된다.
  describe("결제한 사장님은 잔액이 0 이 되어도 갇히지 않는다", () => {
    const P = "p-paid";

    it("정가를 내면 잔액이 0 이 되는데, 그 뒤에도 컷이 계속 나가야 한다", async () => {
      await memoryStore.insertGrant({ user_id: A, amount_credits: 50, reason: "충전" });
      // 30초 한 편 = 50 크레딧. 내고 나면 잔액이 정확히 0 이다.
      await requireVideoCharge({ userId: A, projectId: P, seconds: 30 });
      // 30초 한 편 원가가 $3.06 이라 컷 두어 개면 체험 한도($0.5)를 훌쩍 넘는다.
      await spend(FREE_TRIAL_USD * 6);
      await expect(guard()).resolves.toBeUndefined();
    });

    // 실패 → 환불 → 재시도. 옛 판정에서는 재시도 때마다 잔액이 다시 0 이 되어
    // 같은 자리에서 또 막혔다 — 빠져나갈 문이 없는 무한 루프였다.
    it("실패해서 되돌려받고 다시 돌려도 갇히지 않는다", async () => {
      await memoryStore.insertGrant({ user_id: A, amount_credits: 50, reason: "충전" });
      await requireVideoCharge({ userId: A, projectId: P, seconds: 30 });
      await spend(FREE_TRIAL_USD * 6);
      await refundVideo({ userId: A, projectId: P });      // 못 준 것은 받지 않는다
      await requireVideoCharge({ userId: A, projectId: P, seconds: 30 }); // 새 회차 = 잔액 다시 0
      await expect(guard()).resolves.toBeUndefined();
    });
  });

  // ★ 예산 가드도 사장님이 고른 화질을 봐야 한다. 안 넘기면 estimateCost 가 720p 열로
  // 떨어져 1080p 호출을 원가의 절반 이하로 재고, 그물이 **느슨한 방향으로** 틀린다.
  it("해상도를 넘기면 그 원가로 잰다 — 1080p 를 720p 로 재면 그물이 느슨해진다", async () => {
    const endpoint = "bytedance/seedance-2.0/image-to-video";
    const call = (resolution) =>
      runWithActor(A, () => assertBudget({ endpoint, amount: 1, resolution }));
    // 1초 원가는 720p $0.3034 · 1080p $0.682 다(lib/costs.js 의 PRICE_TABLE).
    // 체험 한도가 $0.5 라 그 둘 사이에 선이 있다 — 안 넘기면 둘 다 통과한다.
    await expect(call("720p")).resolves.toBeUndefined();
    await expect(call("1080p")).rejects.toThrow(BudgetExceeded);
  });

  it("가짜 모드는 잴 것이 없다 — 그물을 아예 안 친다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    await expect(guard()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});
