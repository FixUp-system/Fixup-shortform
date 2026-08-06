// 청구 장부 — 잔액의 한쪽이다(다른 쪽은 충전).
// cost_records(USD 원가)와 **다른 장부**다: 알갱이가 프로젝트·행위 단위다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import {
  balanceFor, chargeVideo, chargeRegen, refundVideo,
  assertCanAfford, alreadyChargedVideo, NoCredits,
} from "../lib/charges.js";
import { VIDEO_PRICE, REGEN_PRICE } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const P = "00000000-0000-4000-8000-0000000000p1".replace("p1", "0f1");
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

describe("스토어 — 청구 장부", () => {
  beforeEach(() => resetMemoryStore());

  it("청구가 없으면 합계는 0", async () => {
    expect(await getStore().sumCharges(A)).toBe(0);
  });

  it("청구를 더해서 돌려준다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    await s.insertCharge({ user_id: A, project_id: P, kind: "regen_clip", credits: 8, idem_key: `regen_clip:${P}:0:1` });
    expect(await s.sumCharges(A)).toBe(58);
  });

  it("같은 idem_key 는 두 번 쓰지 않는다 — 이중 청구 방어선", async () => {
    const s = getStore();
    expect(await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` })).toBe(true);
    expect(await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` })).toBe(false);
    expect(await s.sumCharges(A)).toBe(50);
  });

  it("환불은 음수 행이다 — 장부를 지우지 않는다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    await s.insertCharge({ user_id: A, project_id: P, kind: "refund", credits: -50, idem_key: `refund:${P}` });
    expect(await s.sumCharges(A)).toBe(0);
    expect((await s.listCharges(A)).length).toBe(2);
  });

  it("남의 청구는 안 센다", async () => {
    const s = getStore();
    await s.insertCharge({ user_id: B, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    expect(await s.sumCharges(A)).toBe(0);
  });

  it("findCharge 로 이미 산 것을 알아본다", async () => {
    const s = getStore();
    expect(await s.findCharge(`video:${P}`)).toBeNull();
    await s.insertCharge({ user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}` });
    expect((await s.findCharge(`video:${P}`)).credits).toBe(50);
  });

  it("충전은 크레딧 단위다", async () => {
    const s = getStore();
    await s.insertGrant({ user_id: A, amount_credits: 500, reason: "체험", granted_by: ADMIN });
    expect(await s.sumGrants(A)).toBe(500);
  });
});

describe("청구", () => {
  beforeEach(() => resetMemoryStore());

  const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

  it("잔액은 충전에서 청구를 뺀 값이다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("길이마다 값이 다르다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 60 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[60]);
  });

  it("같은 프로젝트를 두 번 청구하지 않는다 — 자동 관통으로 산 것을 단계별이 또 받지 않게", async () => {
    await grant(500);
    const first = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    const second = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(first).toBe(VIDEO_PRICE[30]);
    expect(second).toBe(0);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
    expect(await alreadyChargedVideo(P)).toBe(true);
  });

  it("컷당 첫 재생성은 공짜, 둘째부터 값을 치른다", async () => {
    await grant(500);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 0 })).toBe(0);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1 })).toBe(REGEN_PRICE.clip);
    expect(await balanceFor(A)).toBe(500 - REGEN_PRICE.clip);
  });

  it("컷이 다르면 각자 첫 회가 공짜다", async () => {
    await grant(500);
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 0, priorCount: 0 });
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 1, priorCount: 0 });
    expect(await balanceFor(A)).toBe(500);
  });

  it("환불은 잔액을 되돌린다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    expect(await balanceFor(A)).toBe(500);
  });

  it("환불을 두 번 해도 한 번만 돌아온다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    await refundVideo({ userId: A, projectId: P });
    expect(await balanceFor(A)).toBe(500);
  });

  it("assertCanAfford 는 모자라면 NoCredits 를 던지고 남은 값을 담는다", async () => {
    await grant(10);
    await expect(assertCanAfford(A, VIDEO_PRICE[30])).rejects.toMatchObject({
      name: "NoCredits", balance: 10, price: VIDEO_PRICE[30],
    });
    await expect(assertCanAfford(A, VIDEO_PRICE[30])).rejects.toBeInstanceOf(NoCredits);
  });

  it("정확히 맞으면 통과한다", async () => {
    await grant(VIDEO_PRICE[30]);
    await expect(assertCanAfford(A, VIDEO_PRICE[30])).resolves.toBeUndefined();
  });
});
