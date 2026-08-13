// 청구 장부 — 잔액의 한쪽이다(다른 쪽은 충전).
// cost_records(USD 원가)와 **다른 장부**다: 알갱이가 프로젝트·행위 단위다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import {
  balanceFor, chargeVideo, chargeRegen, refundVideo, refundRegen,
  assertCanAfford, alreadyChargedVideo, NoCredits, requireVideoCharge,
} from "../lib/charges.js";
// 정가는 길이 × 모델로 갈린다. 이 장부 함수들은 모델을 안 넘기므로
// 레거시(Kling) 표를 읽는다 — lib/pricing.js 의 폴백이 가리키는 그 표다.
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

  it("음수 충전(회수)도 반영된다", async () => {
    const s = getStore();
    await s.insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    await s.insertGrant({ user_id: A, amount_credits: -200, reason: "정정", granted_by: ADMIN });
    expect(await s.sumGrants(A)).toBe(300);
  });

  it("남의 충전은 안 센다", async () => {
    const s = getStore();
    await s.insertGrant({ user_id: B, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    expect(await s.sumGrants(A)).toBe(0);
  });

  // 백오피스 목록이 쓰는 묶음 조회 — 행마다 왕복하지 않으려고 있다.
  it("listGrantsFor 는 사용자별 합계를 한 번에 준다", async () => {
    const s = getStore();
    await s.insertGrant({ user_id: A, amount_credits: 300, reason: "충전", granted_by: ADMIN });
    await s.insertGrant({ user_id: A, amount_credits: 200, reason: "충전", granted_by: ADMIN });
    await s.insertGrant({ user_id: B, amount_credits: 100, reason: "충전", granted_by: ADMIN });
    const m = await s.listGrantsFor([A, B, "없는-id"]);
    expect(m.get(A)).toBe(500);
    expect(m.get(B)).toBe(100);
    expect(m.get("없는-id") ?? 0).toBe(0);
  });
});

describe("청구", () => {
  beforeEach(() => resetMemoryStore());

  const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

  it("잔액은 충전에서 청구를 뺀 값이다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("길이마다 값이 다르다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 60 });
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][60]);
  });

  it("같은 프로젝트를 두 번 청구하지 않는다 — 자동 관통으로 산 것을 단계별이 또 받지 않게", async () => {
    await grant(500);
    const first = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    const second = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(first).toBe(VIDEO_PRICE["kling-v3"]["720p"][30]);
    expect(second).toBe(0);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
    expect(await alreadyChargedVideo(P)).toBe(true);
  });

  it("컷당 첫 재생성은 공짜, 둘째부터 값을 치른다", async () => {
    await grant(500);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 0 })).toBe(0);
    expect(await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1 })).toBe(REGEN_PRICE.clip["kling-v3"]["720p"]);
    expect(await balanceFor(A)).toBe(500 - REGEN_PRICE.clip["kling-v3"]["720p"]);
  });

  it("컷이 다르면 각자 첫 회가 공짜다", async () => {
    await grant(500);
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 0, priorCount: 0 });
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 1, priorCount: 0 });
    expect(await balanceFor(A)).toBe(500);
  });

  it("소수점 아래는 버린다 — 장부가 numeric 이라 소수 행이 섞일 수 있다", async () => {
    await grant(500.7);
    expect(await balanceFor(A)).toBe(500);
  });

  it("빚도 버림이다 — 음수 잔액은 더 큰 빚으로 내려간다", async () => {
    await grant(0.5);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(-VIDEO_PRICE["kling-v3"]["720p"][30]);   // 0.5 - 50 = -49.5 → -50
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

  it("환불한 프로젝트를 다시 돌리면 다시 받는다 — 되돌려줬으면 공짜가 아니다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    const again = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(again).toBe(VIDEO_PRICE["kling-v3"]["720p"][30]);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);   // 두 번 줄고 한 번 돌아왔다
    expect(await alreadyChargedVideo(P)).toBe(true);
  });

  it("환불 뒤에는 이미 샀다고 하지 않는다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await alreadyChargedVideo(P)).toBe(true);
    await refundVideo({ userId: A, projectId: P });
    expect(await alreadyChargedVideo(P)).toBe(false);
  });

  it("환불한 회차를 또 청구하지는 않는다 — 새 회차만 받는다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await chargeVideo({ userId: A, projectId: P, seconds: 30 })).toBe(0);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("동시에 눌러도 한 번만 받는다 — 멱등키가 마지막 방어선이다", async () => {
    await grant(500);
    const both = await Promise.all([
      chargeVideo({ userId: A, projectId: P, seconds: 30 }),
      chargeVideo({ userId: A, projectId: P, seconds: 30 }),
    ]);
    expect(both.filter((n) => n > 0).length).toBe(1);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("환불 행의 주인은 원 청구 행의 주인이다", async () => {
    await grant(500);
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: B, projectId: P });   // 호출자가 남을 넘겨도
    expect(await balanceFor(A)).toBe(500);            // 돈은 낸 사람에게 돌아간다
    expect(await getStore().sumCharges(B)).toBe(0);
  });

  it("priorCount 를 빠뜨리면 조용히 공짜가 되지 않고 던진다", async () => {
    await grant(500);
    await expect(chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0 })).rejects.toThrow(/priorCount/);
    await expect(chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: -1 })).rejects.toThrow(/priorCount/);
    expect(await balanceFor(A)).toBe(500);
  });

  it("assertCanAfford 는 모자라면 NoCredits 를 던지고 남은 값을 담는다", async () => {
    await grant(10);
    await expect(assertCanAfford(A, VIDEO_PRICE["kling-v3"]["720p"][30])).rejects.toMatchObject({
      name: "NoCredits", balance: 10, price: VIDEO_PRICE["kling-v3"]["720p"][30],
    });
    await expect(assertCanAfford(A, VIDEO_PRICE["kling-v3"]["720p"][30])).rejects.toBeInstanceOf(NoCredits);
  });

  it("정확히 맞으면 통과한다", async () => {
    await grant(VIDEO_PRICE["kling-v3"]["720p"][30]);
    await expect(assertCanAfford(A, VIDEO_PRICE["kling-v3"]["720p"][30])).resolves.toBeUndefined();
  });
});

// ★ 장부가 실제로 받아 가는 크레딧을 잰다 — 목 호출 횟수가 아니라 잔액을 읽는다.
describe("청구가 모델을 탄다", () => {
  beforeEach(() => resetMemoryStore());

  const 충전 = () =>
    getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "테스트", granted_by: ADMIN });

  it("Seedance 프로젝트는 정가가 세 배다", async () => {
    await 충전();
    await chargeVideo({ userId: A, projectId: P, seconds: 30, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 160);
  });

  // ★★ 모델을 안 넘기면 조용히 싼 값이 청구된다 — 이것이 이 태스크의 유일한 실패 방식이다
  it("모델을 안 넘기면 Kling 정가다", async () => {
    await 충전();
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(await balanceFor(A)).toBe(500 - 50);
  });

  it("클립 재생성도 모델을 탄다 — Seedance 25, Kling 8", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 25);
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 1, priorCount: 1, model: "kling-v3" });
    expect(await balanceFor(A)).toBe(500 - 25 - 8);
  });

  it("이미지·목소리 재생성은 모델과 무관하다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "image", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 2);
  });

  it("컷마다 첫 회는 여전히 무료다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 0, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500);
  });

  // ⚠️ 청구는 25 를 받고 환불이 8 을 돌려주면 사장님이 17 크레딧을 잃는다.
  it("환불은 청구와 같은 값을 돌려준다", async () => {
    await 충전();
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    await refundRegen({ projectId: P, kind: "clip", idx: 0, priorCount: 1, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500);
  });

  it("requireVideoCharge 도 모델을 탄다", async () => {
    await 충전();
    await requireVideoCharge({ userId: A, projectId: P, seconds: 30, model: "seedance-2.0" });
    expect(await balanceFor(A)).toBe(500 - 160);
  });

  // 잔액이 Kling 값(50)은 넘지만 Seedance 값(160)에는 못 미치는 자리 —
  // 모델을 안 태우면 여기서 통과해 버리고 fal 이 나간다.
  it("잔액이 Seedance 정가에 못 미치면 402 로 막힌다", async () => {
    await getStore().insertGrant({ user_id: A, amount_credits: 100, reason: "테스트", granted_by: ADMIN });
    await expect(
      requireVideoCharge({ userId: A, projectId: P, seconds: 30, model: "seedance-2.0" }),
    ).rejects.toBeInstanceOf(NoCredits);
    expect(await balanceFor(A)).toBe(100);
  });
});

// 크레딧은 개수다 — 장부에 소수가 한 번 들어가면 잔액도 화면도 그때부터 소수가 된다.
// 값은 lib/pricing.js 가 반올림해서 내보내지만, **장부에 닿는 자리**에서 한 번 더 막는다.
describe("장부에는 정수만 들어간다", () => {
  beforeEach(() => resetMemoryStore());

  it("영상 청구가 정수다", async () => {
    await getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    const paid = await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    expect(Number.isInteger(paid)).toBe(true);
    for (const row of await getStore().listCharges(A)) {
      expect(Number.isInteger(Number(row.credits)), `장부에 소수가 들어갔다: ${row.credits}`).toBe(true);
    }
  });

  it("재생성 청구도 정수다", async () => {
    await getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    await chargeRegen({ userId: A, projectId: P, kind: "clip", idx: 0, priorCount: 1 });
    for (const row of await getStore().listCharges(A)) {
      expect(Number.isInteger(Number(row.credits))).toBe(true);
    }
  });

  // 환불은 원 청구 행에서 값을 읽는다 — 그 값이 정수면 환불도 정수다(규칙이 하나라는 뜻).
  it("환불도 정수로 돌아간다", async () => {
    await getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: ADMIN });
    await chargeVideo({ userId: A, projectId: P, seconds: 30 });
    await refundVideo({ userId: A, projectId: P });
    for (const row of await getStore().listCharges(A)) {
      expect(Number.isInteger(Number(row.credits))).toBe(true);
    }
  });
});
