// 광고 청구 — 기존 video 장부와 **이름공간이 다르다**. 섞이면 안 된다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { chargeAd, refundAd, alreadyChargedAd, adKey } from "../lib/charges.js";
import { balanceFor, chargeVideo, NoCredits, assertCanAfford } from "../lib/charges.js";
import { AD_VIDEO_PRICE, adVideoPrice } from "../lib/pricing.js";
import { LEGACY_AD_MODEL, DEFAULT_AD_RESOLUTION } from "../lib/ad/models.js";

const U = "00000000-0000-4000-8000-00000000000a";
const P = "00000000-0000-4000-8000-0000000000f1";

// ★ Task 24 — 기본 모델이 standard 다(2.0-fast 가 아니다). model 을 안 넘기면 이 값으로
// 청구된다 — AD_VIDEO_PRICE[LEGACY_AD_MODEL][15] 는 해상도별 객체라 720p(기본 해상도)로
// ★ 2026-08-31 — 짝이 LEGACY 로 갈렸다. 모델을 안 넘기는 이 판들이 재는 것은 **옛 문서**이고,
//   그 폴백은 새로 만들 때의 기본(H3)이 아니라 그때 그 모델(2.0)이다.
// 뽑는다.
const DEFAULT_PRICE_15 = AD_VIDEO_PRICE[LEGACY_AD_MODEL][15][DEFAULT_AD_RESOLUTION];

async function grant(n) {
  await getStore().insertGrant({ user_id: U, amount_credits: n, reason: "test" });
}

describe("광고 청구", () => {
  beforeEach(() => resetMemoryStore());

  it("정가를 받고 잔액이 그만큼 준다 — 모델을 안 주면 기본 모델(standard)·720p 값이다", async () => {
    await grant(200);
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid.credits).toBe(DEFAULT_PRICE_15);
    expect(await balanceFor(U)).toBe(200 - DEFAULT_PRICE_15);
  });

  it("이미 산 회차가 살아 있으면 또 받지 않는다", async () => {
    await grant(300);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again.credits).toBe(0);
    expect(await balanceFor(U)).toBe(300 - DEFAULT_PRICE_15);
  });

  it("환불은 지우지 않고 음수 행이다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(200);
    expect(await alreadyChargedAd(P)).toBe(false);
    const rows = await getStore().listCharges(U);
    expect(rows.some((r) => Number(r.credits) < 0)).toBe(true);
  });

  it("환불 뒤 다시 만들면 새 회차라 또 받는다", async () => {
    await grant(300);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(paid.credits).toBe(DEFAULT_PRICE_15);
  });

  it("두 번 불러도 환불은 한 번만 돈다", async () => {
    await grant(200);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    await refundAd({ projectId: P });
    await refundAd({ projectId: P });
    expect(await balanceFor(U)).toBe(200);
  });

  it("★ 기존 video 장부와 키가 안 겹친다", async () => {
    await grant(300);
    await chargeVideo({ userId: U, projectId: P, seconds: 15 });   // 기존 경로
    const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 }); // 광고 경로
    // 같은 프로젝트 id 라도 서로를 "이미 샀다"로 보지 않는다
    expect(paid.credits).toBe(DEFAULT_PRICE_15);
    expect(adKey(P, 1)).toBe(`ad:${P}:1`);
  });

  it("잔액이 모자라면 NoCredits 다", async () => {
    await grant(10);
    await expect(assertCanAfford(U, DEFAULT_PRICE_15)).rejects.toBeInstanceOf(NoCredits);
  });

  // ★ 매출 누수 회귀(Task 17) — 성공한 회차의 청구는 refundAd 가 안 돌아 영원히 "살아 있다".
  // openNewAttempt 없이는 이 자리에서 또 받을 방법이 없었다(그래서 fal 원가는 나가는데
  // 청구가 0 이었다). openNewAttempt:true 는 "이미 영상을 낸 회차"를 뜻하고, 그때는
  // 살아 있는 청구가 있어도 새 회차를 열어 다시 받아야 한다.
  it("★ openNewAttempt 면 살아 있는 청구가 있어도 새 회차로 또 받는다", async () => {
    await grant(400);
    const first = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(first.credits).toBe(DEFAULT_PRICE_15);
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15, openNewAttempt: true });
    expect(again.credits).toBe(DEFAULT_PRICE_15);
    expect(await balanceFor(U)).toBe(400 - DEFAULT_PRICE_15 * 2);
    // 새 회차 키가 열렸다 — 첫 청구를 덮어쓴 것이 아니다
    expect(adKey(P, 2)).toBe(`ad:${P}:2`);
    expect(await getStore().findCharge(adKey(P, 2))).toBeTruthy();
  });

  it("openNewAttempt 가 없으면(기본값 false) 지금까지처럼 또 받지 않는다", async () => {
    await grant(300);
    await chargeAd({ userId: U, projectId: P, seconds: 15 });
    const again = await chargeAd({ userId: U, projectId: P, seconds: 15 });
    expect(again.credits).toBe(0);
    expect(await balanceFor(U)).toBe(300 - DEFAULT_PRICE_15);
  });

  // ── Task 21 — chargeAd 가 모델을 안다 ────────────────────────────────
  describe("모델별 청구", () => {
    it("★ 모델·길이 조합대로 정가가 다르게 청구된다 — 2.5/30초/720p가 가장 비싸다", async () => {
      await grant(1000);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 30, model: "seedance-2.5", resolution: "720p" });
      expect(paid.credits).toBe(AD_VIDEO_PRICE["seedance-2.5"][30]["720p"]);
      expect(await balanceFor(U)).toBe(1000 - AD_VIDEO_PRICE["seedance-2.5"][30]["720p"]);
    });

    
    // ③ 옛 문서 보호 — model·resolution 을 안 넘기면(옛 광고 프로젝트) 기본 모델
    // (standard)·720p 값으로 청구된다.
    it("★ model·resolution 을 안 넘기면(옛 문서) 기본 모델(standard)·720p 값으로 청구된다", async () => {
      await grant(200);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 15 });
      expect(paid.credits).toBe(DEFAULT_PRICE_15);
    });

    // ④ 모르는 모델이 조용히 싼 값(기본)으로 새면 그 차액이 그대로 우리 돈이다.
    it("★ 값이 있는데 모르는 모델이면 청구가 조용히 싼 값으로 안 새고 던진다", async () => {
      await grant(1000);
      await expect(
        chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-3.0-오타" })
      ).rejects.toThrow(/모르는 광고 모델/);
      // 던졌으니 아무것도 받지 않았다 — 잔액이 그대로다
      expect(await balanceFor(U)).toBe(1000);
    });

    // ── Task 24 — 해상도가 청구에 반영된다 ─────────────────────────────
    it("★ 같은 모델·길이라도 해상도가 다르면 청구액이 다르다 — 1080p 가 720p 보다 비싸다", async () => {
      await grant(1000);
      const paid720 = await chargeAd({
        userId: U, projectId: P, seconds: 15, model: "seedance-2.0", resolution: "720p",
      });
      expect(paid720.credits).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);

      const P2 = "00000000-0000-4000-8000-0000000000f2";
      const paid1080 = await chargeAd({
        userId: U, projectId: P2, seconds: 15, model: "seedance-2.0", resolution: "1080p",
      });
      expect(paid1080.credits).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["1080p"]);
      expect(paid1080.credits).toBeGreaterThan(paid720.credits);
    });

    it("★ resolution 을 안 넘기면(옛 호출부) 720p 값으로 청구된다", async () => {
      await grant(1000);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-2.0" });
      expect(paid.credits).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    });

    // ★ 값이 있는데 그 모델이 안 받는 해상도면 조용히 새지 않고 던진다.
    //   ★ 2026-08-21 — 예시를 바꿨다. 2.5 의 1080p 는 이제 **관리자 전용으로 열려 있고
    //     가격도 있다**. 여기서 재는 것은 "표에 없는 값이 들어오면 던지는가"이므로
    //     어느 모델도 안 받는 값(H3 의 2K 를 Seedance 에)으로 바꾼다.
    it("★ 값이 있는데 그 모델이 안 받는 해상도면 청구가 조용히 안 새고 던진다", async () => {
      await grant(1000);
      await expect(
        chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-2.5", resolution: "2K" })
      ).rejects.toThrow(/그 해상도를 지원하지 않아요/);
      expect(await balanceFor(U)).toBe(1000);
    });

    it("★ 관리자 전용 해상도(2.5 1080p)는 가격이 있고 그 값으로 청구된다 — 기록이 비면 안 된다", async () => {
      await grant(1000);
      const paid = await chargeAd({ userId: U, projectId: P, seconds: 15, model: "seedance-2.5", resolution: "1080p" });
      expect(paid.credits).toBe(AD_VIDEO_PRICE["seedance-2.5"][15]["1080p"]);
      expect(await balanceFor(U)).toBe(1000 - paid.credits);
    });

    // adVideoPrice(seconds, modelId, resolution) 을 라우트가 부르는 것과 같은 조합 — 화면
    // (app/ads/[id]/page.js)이 읽는 값과 같은 함수다.
    it("모델·길이·해상도 조합마다 정가가 다르다", () => {
      // 해상도를 생략하면 기본(720p) 값이다 — fast 티어가 사라져 65 라는 칸도 없다
      expect(adVideoPrice(15, "seedance-2.0")).toBe(80);
      expect(adVideoPrice(15, "seedance-2.0", "720p")).toBe(80);
      expect(adVideoPrice(15, "seedance-2.0", "1080p")).toBe(175);
      expect(adVideoPrice(15, "seedance-2.5", "720p")).toBe(120);
      expect(adVideoPrice(30, "seedance-2.5", "720p")).toBe(240);
    });
  });
});
