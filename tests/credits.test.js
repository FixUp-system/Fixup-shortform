// 충전 장부 — 잔액의 절반(나머지 절반은 기존 cost_records)이다.
// 메모리 스토어로 계약을 못 박는다. Supabase 쪽은 같은 시그니처를 구현하되
// 합계를 SQL 함수(sum_grants)에 맡긴다 — 앱에서 더하면 행 상한에 걸린다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

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
    await store.insertGrant({ user_id: A, amount_usd: 2.59, reason: "체험 1편", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_usd: 5, reason: "유료 충전", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBeCloseTo(7.59, 6);
  });

  it("음수 충전(회수)도 반영된다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 5, reason: "유료 충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_usd: -2, reason: "정정", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBeCloseTo(3, 6);
  });

  it("남의 충전은 안 센다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: B, amount_usd: 10, reason: "유료 충전", granted_by: ADMIN });
    expect(await store.sumGrants(A)).toBe(0);
  });

  it("listGrantsFor 는 사용자별 합계를 한 번에 준다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 3, reason: "충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: A, amount_usd: 2, reason: "충전", granted_by: ADMIN });
    await store.insertGrant({ user_id: B, amount_usd: 1, reason: "충전", granted_by: ADMIN });
    const m = await store.listGrantsFor([A, B, "없는-id"]);
    expect(m.get(A)).toBeCloseTo(5, 6);
    expect(m.get(B)).toBeCloseTo(1, 6);
    expect(m.get("없는-id") ?? 0).toBe(0);
  });
});
