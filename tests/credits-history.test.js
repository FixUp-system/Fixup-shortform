// GET /api/credits/history — 내 크레딧이 어디로 갔는지.
//
// 잔액 숫자 하나만 보여 주던 동안, 크레딧이 줄어든 사장님은 이유를 알 길이 없었다.
// 장부에는 다 남아 있었는데 부르는 화면이 없었다(2026-08-13).
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { chargeVideo, chargeRegen, refundVideo } from "../lib/charges.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET } from "../app/api/credits/history/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

const req = (uid = A) => ({
  headers: new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }),
});
const body = async (uid = A) => (await GET(req(uid), {})).json();

const grant = (uid, n) =>
  getStore().insertGrant({ user_id: uid, amount_credits: n, reason: "충전", granted_by: ADMIN });

describe("크레딧 내역", () => {
  beforeEach(() => resetMemoryStore());

  it("충전과 사용이 한 목록에 온다", async () => {
    await grant(A, 500);
    const p = await createProject({ ownerId: A, settings: { target_seconds: 30 }, material: { text: "농구화 광고", photos: [] } });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });

    const { rows } = await body();
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.kind).sort()).toEqual(["grant", "video"]);
  });

  it("잔액이 움직인 방향을 그대로 준다 — 쓰면 음수, 충전은 양수", async () => {
    await grant(A, 500);
    const p = await createProject({ ownerId: A, settings: { target_seconds: 30 }, material: { text: "가", photos: [] } });
    const paid = await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });

    const { rows } = await body();
    expect(rows.find((r) => r.kind === "grant").delta).toBe(500);
    expect(rows.find((r) => r.kind === "video").delta).toBe(-paid);
  });

  it("환불은 되돌아온 것으로 보인다", async () => {
    await grant(A, 500);
    const p = await createProject({ ownerId: A, settings: { target_seconds: 30 }, material: { text: "가", photos: [] } });
    const paid = await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    await refundVideo({ userId: A, projectId: p.id });

    const { rows } = await body();
    expect(rows.find((r) => r.kind === "refund").delta).toBe(paid);
  });

  it("어느 영상에 썼는지 제목을 함께 준다", async () => {
    await grant(A, 500);
    const p = await createProject({ ownerId: A, settings: { target_seconds: 30 }, material: { text: "농구화 광고 자료입니다", photos: [] } });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });

    const { rows } = await body();
    expect(rows.find((r) => r.kind === "video").project_title).toContain("농구화");
  });

  // 보관함에서 지운 영상의 내역은 장부에 그대로 남는다(환불하지 않는다) —
  // 제목을 못 찾는 것이 정상이고, 화면이 그 자리를 "지운 영상"으로 채운다.
  it("지운 영상은 제목이 비어서 온다", async () => {
    await grant(A, 500);
    const p = await createProject({ ownerId: A, settings: { target_seconds: 30 }, material: { text: "곧 지울 영상", photos: [] } });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    await getStore().deleteProject(p.id, A);

    const { rows } = await body();
    const used = rows.find((r) => r.kind === "video");
    expect(used).toBeTruthy();
    expect(used.project_title).toBe(null);
  });

  it("남의 내역은 안 온다", async () => {
    await grant(B, 500);
    const p = await createProject({ ownerId: B, settings: { target_seconds: 30 }, material: { text: "남의 것", photos: [] } });
    await chargeVideo({ userId: B, projectId: p.id, seconds: 30 });

    const { rows } = await body(A);
    expect(rows.length).toBe(0);
  });

  it("최근 것이 위다", async () => {
    await grant(A, 100);
    await new Promise((r) => setTimeout(r, 5));
    await grant(A, 200);
    const { rows } = await body();
    expect(rows[0].delta).toBe(200);
  });

  it("잔액도 함께 준다 — 화면이 다시 묻지 않게", async () => {
    await grant(A, 500);
    const { balance } = await body();
    expect(balance).toBe(500);
  });
});
