// 광고 청구 — 기존 video 장부와 **이름공간이 다르다**. 섞이면 안 된다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { chargeAd, refundAd, alreadyChargedAd, adKey } from "../lib/charges.js";
import { balanceFor, chargeVideo, NoCredits, assertCanAfford } from "../lib/charges.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

const U = "00000000-0000-4000-8000-00000000000a";
const P = "00000000-0000-4000-8000-0000000000f1";

async function grant(n) {
  await getStore().insertGrant({ user_id: U, amount_credits: n, reason: "test" });
}

describe("광고 청구", () => {
  beforeEach(() => resetMemoryStore());

  it("정가를 받고 잔액이 그만큼 준다", async () => {
    await grant(100);
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
    expect(await balanceFor(U)).toBe(100 - AD_VIDEO_PRICE[15]);
  });

  it("이미 산 회차가 살아 있으면 또 받지 않는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again).toBe(0);
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE[15]);
  });

  it("환불은 지우지 않고 음수 행이다", async () => {
    await grant(100);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(100);
    expect(await alreadyChargedAd(P)).toBe(false);
    const rows = await getStore().listCharges(U);
    expect(rows.some((r) => Number(r.credits) < 0)).toBe(true);
  });

  it("환불 뒤 다시 만들면 새 회차라 또 받는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
  });

  it("두 번 불러도 환불은 한 번만 돈다", async () => {
    await grant(100);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(100);
  });

  it("★ 기존 video 장부와 키가 안 겹친다", async () => {
    await grant(300);
    await chargeVideo({ userId: U, projectId: P, seconds: 15 });   // 기존 경로
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 }); // 광고 경로
    // 같은 프로젝트 id 라도 서로를 "이미 샀다"로 보지 않는다
    expect(paid).toBe(AD_VIDEO_PRICE[15]);
    expect(adKey(P, 1)).toBe(`ad:${P}:1`);
  });

  it("잔액이 모자라면 NoCredits 다", async () => {
    await grant(10);
    await expect(assertCanAfford(U, AD_VIDEO_PRICE[15])).rejects.toBeInstanceOf(NoCredits);
  });
});
