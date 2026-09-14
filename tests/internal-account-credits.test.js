// 내부 계정은 크레딧을 걷지 않는다 (2026-09-14 사장님 결정).
//
// 왜: 지금 계정은 전부 내부 테스트용이다. 전역 스위치(SHOTFORM_NO_CREDITS)는 **모두**를
// 끄므로, 와디즈로 들어온 손님에게도 크레딧이 안 걷힌다. 스위치를 끄고 계정마다 가른다 —
// 내부 계정은 면제, 손님은 새 단위로 차감.
//
// ★ 면제는 **걷지 않는 것**이지 원가를 안 적는 것이 아니다. cost_records 는 그대로 쌓인다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 운영자 PATCH 는 app_metadata 를 함께 쓴다 — 실제 Auth 서버를 부르지 않게 막는다
// (tests/admin-and-labels.test.js 와 같은 방식).
const { updateUserById } = vi.hoisted(() => ({ updateUserById: vi.fn(async () => ({ error: null })) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { updateUserById } } }),
}));
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import {
  creditsEnabledFor, requireVideoCharge, chargeRegen, chargeAd, assertCanAfford, NoCredits,
} from "../lib/charges.js";
import { GET as creditsGET } from "../app/api/credits/route.js";
import { GET as meGET } from "../app/api/me/route.js";
import { GET as usersGET } from "../app/api/admin/users/route.js";
import { PATCH as userPATCH } from "../app/api/admin/users/[id]/route.js";

const STAFF = "00000000-0000-4000-8000-0000000000e1";
const GUEST = "00000000-0000-4000-8000-0000000000e2";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const P = "00000000-0000-4000-8000-0000000000f1";

const headersFor = (id, role = "user") => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });

let envBefore;
beforeEach(async () => {
  resetMemoryStore();
  envBefore = { credits: process.env.SHOTFORM_NO_CREDITS, fake: process.env.SHOTFORM_FAKE };
  delete process.env.SHOTFORM_NO_CREDITS;
  delete process.env.SHOTFORM_FAKE;
  await getStore().insertProfile({ id: STAFF, email: "staff@example.com", status: "approved", role: "user", internal: true });
  await getStore().insertProfile({ id: GUEST, email: "guest@example.com", status: "approved", role: "user" });
});
afterEach(() => {
  for (const [k, v] of [["SHOTFORM_NO_CREDITS", envBefore.credits], ["SHOTFORM_FAKE", envBefore.fake]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("판정 — creditsEnabledFor", () => {
  it("내부 계정은 꺼져 있고, 손님은 켜져 있다", async () => {
    expect(await creditsEnabledFor(STAFF)).toBe(false);
    expect(await creditsEnabledFor(GUEST)).toBe(true);
  });

  it("★ 전역 스위치를 켜면(=크레딧 끔) 손님도 꺼진다 — 스위치는 여전히 최상위다", async () => {
    process.env.SHOTFORM_NO_CREDITS = "1";
    expect(await creditsEnabledFor(GUEST)).toBe(false);
  });

  it("★ 프로필을 못 찾으면 켜진 쪽이다 — 모르는 계정이 무료로 새면 안 된다", async () => {
    expect(await creditsEnabledFor("00000000-0000-4000-8000-00000000dead")).toBe(true);
    expect(await creditsEnabledFor("cron")).toBe(true);
  });
});

describe("청구 — 내부 계정은 장부에 줄이 안 쌓인다", () => {
  it("영상 정가: 잔액 0 인 내부 계정도 통과하고 0 을 낸다", async () => {
    const paid = await requireVideoCharge({ userId: STAFF, projectId: P, seconds: 15, model: "seedance-2.0", resolution: "720p" });
    expect(paid).toBe(0);
    expect(await getStore().sumCharges(STAFF)).toBe(0);
  });

  it("같은 조건의 손님은 402 로 막힌다", async () => {
    await expect(requireVideoCharge({ userId: GUEST, projectId: P, seconds: 15, model: "seedance-2.0", resolution: "720p" }))
      .rejects.toBeInstanceOf(NoCredits);
  });

  it("잔액 검사·재생성·광고 청구도 면제된다", async () => {
    await expect(assertCanAfford(STAFF, 100000)).resolves.toBeUndefined();
    expect(await chargeRegen({ userId: STAFF, projectId: P, kind: "clip", idx: 0, priorCount: 2, model: "seedance-2.0", resolution: "720p" })).toBe(0);
    expect(await chargeAd({ userId: STAFF, projectId: P, seconds: 15, model: "minimax-h3", resolution: "2K" }))
      .toEqual({ credits: 0, attempt: null });
    expect(await getStore().sumCharges(STAFF)).toBe(0);
  });

  it("손님의 광고 청구는 그대로 걷힌다", async () => {
    const r = await chargeAd({ userId: GUEST, projectId: P, seconds: 15, model: "minimax-h3", resolution: "2K" });
    expect(r.credits).toBeGreaterThan(0);
    expect(await getStore().sumCharges(GUEST)).toBe(r.credits);
  });
});

describe("화면에 알려 준다", () => {
  it("/api/credits·/api/me — 내부 계정은 gated=false · internal=true", async () => {
    const c = await (await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(STAFF) }), {})).json();
    expect(c.gated).toBe(false);
    expect(c.internal).toBe(true);
    const me = await (await meGET(new Request("http://localhost/api/me", { headers: headersFor(STAFF) }), {})).json();
    expect(me.gated).toBe(false);
    expect(me.internal).toBe(true);
  });

  it("손님은 gated=true · internal=false", async () => {
    const c = await (await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(GUEST) }), {})).json();
    expect(c.gated).toBe(true);
    expect(c.internal).toBe(false);
  });
});

describe("운영자가 계정마다 켜고 끈다 — PATCH /api/admin/users/[id]", () => {
  const patch = (id, body, who = ADMIN, role = "admin") => userPATCH(
    new Request(`http://localhost/api/admin/users/${id}`, { method: "PATCH", headers: headersFor(who, role), body: JSON.stringify(body) }),
    ctx(id),
  );

  it("internal 을 켜면 원장에 남고 목록에 실린다", async () => {
    const res = await patch(GUEST, { internal: true });
    expect(res.status).toBe(200);
    expect(await creditsEnabledFor(GUEST)).toBe(false);
    const list = await (await usersGET(new Request("http://localhost/api/admin/users", { headers: headersFor(ADMIN, "admin") }), {})).json();
    expect(list.users.find((u) => u.id === GUEST).internal).toBe(true);
  });

  it("끄면 다시 걷는다", async () => {
    await patch(STAFF, { internal: false });
    expect(await creditsEnabledFor(STAFF)).toBe(true);
  });

  it("★ 참/거짓이 아니면 400 — \"false\" 문자열이 참으로 읽혀 무료가 새면 안 된다", async () => {
    expect((await patch(GUEST, { internal: "false" })).status).toBe(400);
    expect((await patch(GUEST, { internal: 1 })).status).toBe(400);
    expect(await creditsEnabledFor(GUEST)).toBe(true);
  });

  it("운영자가 아니면 403", async () => {
    expect((await patch(GUEST, { internal: true }, GUEST, "user")).status).toBe(403);
  });
});

describe("백오피스 화면 — 계정마다 켜고 끄는 자리가 있다", () => {
  it("관리 창이 internal 을 참/거짓으로 PATCH 하고, 목록은 내부 계정에 \"내부\"를 적는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/admin/page.js", "utf8");
    expect(src).toMatch(/JSON\.stringify\(\{ internal: internal === true \}\)/);
    expect(src).toMatch(/setInternal\(panelUser\.id/);
    expect(src).toMatch(/u\.internal === true/);
  });
});
