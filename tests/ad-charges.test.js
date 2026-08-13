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
    expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    expect(await balanceFor(U)).toBe(100 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("이미 산 회차가 살아 있으면 또 받지 않는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again).toBe(0);
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
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
    expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
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
    expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    expect(adKey(P, 1)).toBe(`ad:${P}:1`);
  });

  it("잔액이 모자라면 NoCredits 다", async () => {
    await grant(10);
    await expect(assertCanAfford(U, AD_VIDEO_PRICE["seedance-2.0-fast"][15])).rejects.toBeInstanceOf(NoCredits);
  });

  // ★ 매출 누수 회귀(Task 17) — 성공한 회차의 청구는 refundAd 가 안 돌아 영원히 "살아 있다".
  // openNewAttempt 없이는 이 자리에서 또 받을 방법이 없었다(그래서 fal 원가는 나가는데
  // 청구가 0 이었다). openNewAttempt:true 는 "이미 영상을 낸 회차"를 뜻하고, 그때는
  // 살아 있는 청구가 있어도 새 회차를 열어 다시 받아야 한다.
  it("★ openNewAttempt 면 살아 있는 청구가 있어도 새 회차로 또 받는다", async () => {
    await grant(200);
    const first = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(first).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15, openNewAttempt: true });
    expect(again).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15] * 2);
    // 새 회차 키가 열렸다 — 첫 청구를 덮어쓴 것이 아니다
    expect(adKey(P, 2)).toBe(`ad:${P}:2`);
    expect(await getStore().findCharge(adKey(P, 2))).toBeTruthy();
  });

  it("openNewAttempt 가 없으면(기본값 false) 지금까지처럼 또 받지 않는다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again).toBe(0);
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  // ── Task 21 — chargeAd 가 모델을 안다 ────────────────────────────────
  describe("모델별 청구", () => {
    it("★ 모델·길이 조합대로 정가가 다르게 청구된다 — 2.5/30초가 가장 비싸다", async () => {
      await grant(1000);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 30, model: "seedance-2.5" });
      expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.5"][30]);
      expect(await balanceFor(U)).toBe(1000 - AD_VIDEO_PRICE["seedance-2.5"][30]);
    });

    it("2.5 로 15초를 만들면 2.0/15초보다 비싸게 받는다", async () => {
      await grant(1000);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-2.5" });
      expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.5"][15]);
      expect(paid).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    });

    // ③ 옛 문서 보호 — model 을 안 넘기면(옛 광고 프로젝트) 2.0 값으로 청구된다.
    // 반대로 두면 이미 만든 영상들이 다시 구울 때 갑자기 2.5 값으로 청구된다.
    it("★ model 을 안 넘기면(옛 문서) 2.0 값으로 청구된다", async () => {
      await grant(200);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
      expect(paid).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
    });

    // ④ 모르는 모델이 조용히 싼 값(2.0)으로 새면 그 차액이 그대로 우리 돈이다.
    it("★ 값이 있는데 모르는 모델이면 청구가 조용히 싼 값으로 안 새고 던진다", async () => {
      await grant(1000);
      await expect(
        chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-3.0-오타" })
      ).rejects.toThrow(/모르는 광고 모델/);
      // 던졌으니 아무것도 받지 않았다 — 잔액이 그대로다
      expect(await balanceFor(U)).toBe(1000);
    });
  });
});
