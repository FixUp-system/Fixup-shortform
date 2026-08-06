// 청구 장부 — 잔액의 한쪽이다(다른 쪽은 충전).
// cost_records(USD 원가)와 **다른 장부**다: 알갱이가 프로젝트·행위 단위다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

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
