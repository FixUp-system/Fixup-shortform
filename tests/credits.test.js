// 충전 장부 — 잔액의 절반(나머지 절반은 기존 cost_records)이다.
// 메모리 스토어로 계약을 못 박는다. Supabase 쪽은 같은 시그니처를 구현하되
// 합계를 SQL 함수(sum_grants)에 맡긴다 — 앱에서 더하면 행 상한에 걸린다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { balanceFor, videosLeft, perVideoUsd, assertCanStart } from "../lib/credits.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

describe("스토어 — 충전 장부", () => {
  beforeEach(() => resetMemoryStore());

  it("충전이 없으면 합계는 0", async () => {
    expect(await getStore().sumGrants(A)).toBe(0);
  });

  it("충전을 더해서 돌려준다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 2.59, reason: "체험 1편", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_credits: 5, reason: "유료 충전", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBeCloseTo(7.59, 6);
  });

  it("음수 충전(회수)도 반영된다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 5, reason: "유료 충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_credits: -2, reason: "정정", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBeCloseTo(3, 6);
  });

  it("남의 충전은 안 센다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: B, amount_credits: 10, reason: "유료 충전", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBe(0);
  });

  it("listGrantsFor 는 사용자별 합계를 한 번에 준다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 3, reason: "충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_credits: 2, reason: "충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: B, amount_credits: 1, reason: "충전", granted_by: ADMIN });
    const m = await store.listGrantsFor([A, B, "없는-id"]);
    expect(m.get(A)).toBeCloseTo(5, 6);
    expect(m.get(B)).toBeCloseTo(1, 6);
    expect(m.get("없는-id") ?? 0).toBe(0);
  });
});

// ⚠️ 픽스처는 브리프의 `addRecord` 가 아니라 실물 스토어의 `insertCost` 를 부른다
// (memory.js·supabase.js 둘 다 이름이 insertCost 다). 스토어를 고치지 않고 픽스처를 맞췄다.
describe("잔액", () => {
  beforeEach(() => resetMemoryStore());

  it("충전에서 쓴 것을 뺀 값이다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 10, reason: "충전", granted_by: ADMIN });
    await store.insertCost({
      request_id: "r1", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: A, est_cost_usd: 2.5, status: "done",
    });
    expect(await balanceFor(A)).toBeCloseTo(7.5, 6);
  });

  it("남이 쓴 것은 내 잔액을 안 깎는다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 10, reason: "충전", granted_by: ADMIN });
    await store.insertCost({
      request_id: "r2", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: B, est_cost_usd: 4, status: "done",
    });
    expect(await balanceFor(A)).toBeCloseTo(10, 6);
  });

  it("초과하면 음수가 된다 — 병렬 호출이 조금 넘길 수 있고 그것을 숨기지 않는다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 1, reason: "충전", granted_by: ADMIN });
    await store.insertCost({
      request_id: "r3", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: A, est_cost_usd: 1.2, status: "done",
    });
    expect(await balanceFor(A)).toBeLessThan(0);
  });

  it("편수는 내림이고 음수는 0", () => {
    expect(videosLeft(perVideoUsd() * 3 + 0.9)).toBe(3);
    expect(videosLeft(perVideoUsd() - 0.01)).toBe(0);
    expect(videosLeft(-5)).toBe(0);
  });

  it("assertCanStart 는 모자라면 NoCredits 를 던진다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 0.5, reason: "충전", granted_by: ADMIN });
    await expect(assertCanStart(A, { need: perVideoUsd() })).rejects.toMatchObject({ name: "NoCredits" });
  });

  it("assertCanStart 는 충분하면 조용히 통과한다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 100, reason: "충전", granted_by: ADMIN });
    await expect(assertCanStart(A, { need: perVideoUsd() })).resolves.toBeUndefined();
  });
});
