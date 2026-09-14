// 크레딧 코드 — 라우트(운영자 발급·목록·삭제 / 본인 등록). 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST as createPOST, GET as listGET } from "../app/api/admin/codes/route.js";
import { DELETE as codeDELETE } from "../app/api/admin/codes/[code]/route.js";
import { POST as redeemPOST } from "../app/api/credits/redeem/route.js";
import { isCodeShape, formatCode, MAX_CODE_ROWS } from "../lib/credit-codes.js";

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const req = (url, { who, role = "user", status = "approved", method = "POST", body } = {}) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: {
      [USER_HEADER]: who, [STATUS_HEADER]: status, [ROLE_HEADER]: role, "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const asAdmin = (url, opts = {}) => req(url, { who: ADMIN, role: "admin", ...opts });
const codeCtx = (code) => ({ params: Promise.resolve({ code }) });

async function makeCodes(rows, batch = "와디즈 1차") {
  const res = await createPOST(asAdmin("/api/admin/codes", { body: { batch, rows } }), {});
  return { res, body: await res.json() };
}

beforeEach(async () => {
  resetMemoryStore();
  await getStore().insertProfile({ id: A, email: "a@example.com", status: "pending", role: "user", display_name: "에이" });
});

describe("POST /api/admin/codes — 발급", () => {
  it("행마다 고유 코드 하나 · meta 를 그대로 싣는다", async () => {
    const { res, body } = await makeCodes([
      { credits: 1000, meta: { 발송번호: "101" } },
      { credits: 3000, meta: { 발송번호: "102" } },
    ]);
    expect(res.status).toBe(200);
    expect(body.codes).toHaveLength(2);
    expect(new Set(body.codes.map((c) => c.code)).size).toBe(2);
    for (const c of body.codes) expect(isCodeShape(c.code)).toBe(true);
    expect(body.codes.map((c) => [c.amount_credits, c.meta.발송번호])).toEqual([[1000, "101"], [3000, "102"]]);
    expect(await getStore().listCreditCodes()).toHaveLength(2);
  });

  it("일반 사용자는 403", async () => {
    const res = await createPOST(req("/api/admin/codes", { who: B, body: { batch: "x", rows: [{ credits: 1 }] } }), {});
    expect(res.status).toBe(403);
  });

  it.each([
    ["묶음 이름 없음", { batch: " ", rows: [{ credits: 1000 }] }],
    ["행 0", { batch: "x", rows: [] }],
    ["행 초과", { batch: "x", rows: Array.from({ length: MAX_CODE_ROWS + 1 }, () => ({ credits: 1 })) }],
    ["0 크레딧", { batch: "x", rows: [{ credits: 0 }] }],
    ["음수", { batch: "x", rows: [{ credits: -5 }] }],
    ["소수", { batch: "x", rows: [{ credits: 1.5 }] }],
    ["문자열", { batch: "x", rows: [{ credits: "1000" }] }],
  ])("%s → 400 · 아무것도 안 만든다", async (_name, body) => {
    const res = await createPOST(asAdmin("/api/admin/codes", { body }), {});
    expect(res.status).toBe(400);
    expect(await getStore().listCreditCodes()).toHaveLength(0);
  });
});

describe("GET /api/admin/codes — 목록", () => {
  it("등록한 계정의 이메일·이름·승인 상태가 붙는다", async () => {
    const { body } = await makeCodes([{ credits: 1000, meta: {} }, { credits: 500, meta: {} }]);
    const used = body.codes[0].code;
    await redeemPOST(req("/api/credits/redeem", { who: A, status: "pending", body: { code: used } }), {});

    const res = await listGET(asAdmin("/api/admin/codes", { method: "GET" }), {});
    expect(res.status).toBe(200);
    const { codes } = await res.json();
    const hit = codes.find((c) => c.code === used);
    expect(hit.redeemer).toEqual({ email: "a@example.com", display_name: "에이", status: "pending" });
    expect(codes.find((c) => c.code !== used).redeemer).toBeNull();
  });

  it("일반 사용자는 403", async () => {
    expect((await listGET(req("/api/admin/codes", { who: B, method: "GET" }), {})).status).toBe(403);
  });
});

describe("DELETE /api/admin/codes/[code]", () => {
  it("안 쓴 코드는 지우고, 쓴 코드는 409, 없으면 404", async () => {
    const { body } = await makeCodes([{ credits: 1000, meta: {} }, { credits: 1000, meta: {} }]);
    const [used, unused] = body.codes.map((c) => c.code);
    await redeemPOST(req("/api/credits/redeem", { who: A, status: "pending", body: { code: used } }), {});

    expect((await codeDELETE(asAdmin(`/api/admin/codes/${used}`, { method: "DELETE" }), codeCtx(used))).status).toBe(409);
    // 표시형(하이픈)으로 불러도 같은 코드다
    const shown = formatCode(unused);
    expect((await codeDELETE(asAdmin(`/api/admin/codes/${shown}`, { method: "DELETE" }), codeCtx(shown))).status).toBe(200);
    expect((await codeDELETE(asAdmin(`/api/admin/codes/${unused}`, { method: "DELETE" }), codeCtx(unused))).status).toBe(404);
  });

  it("일반 사용자는 403", async () => {
    const res = await codeDELETE(req("/api/admin/codes/X", { who: B, method: "DELETE" }), codeCtx("X"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/credits/redeem — 본인 등록", () => {
  it("승인 대기 중에도 등록된다 · 소문자·하이픈을 넣어도 된다", async () => {
    const { body } = await makeCodes([{ credits: 3000, meta: {} }]);
    const typed = formatCode(body.codes[0].code).toLowerCase();
    const res = await redeemPOST(req("/api/credits/redeem", { who: A, status: "pending", body: { code: typed } }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ credits: 3000, balance: 3000 });
    const [g] = await getStore().listGrants(A);
    expect(g.reason).toBe(`크레딧 코드 ${formatCode(body.codes[0].code)}`);
  });

  it("두 번째는 409", async () => {
    const { body } = await makeCodes([{ credits: 1000, meta: {} }]);
    const code = body.codes[0].code;
    await redeemPOST(req("/api/credits/redeem", { who: A, body: { code } }), {});
    const res = await redeemPOST(req("/api/credits/redeem", { who: B, body: { code } }), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/이미 사용된/);
  });

  it("없는 코드 404 · 모양이 틀리면 400", async () => {
    expect((await redeemPOST(req("/api/credits/redeem", { who: A, body: { code: "ZZZZ-2222-ZZZZ" } }), {})).status).toBe(404);
    expect((await redeemPOST(req("/api/credits/redeem", { who: A, body: { code: "abc" } }), {})).status).toBe(400);
    expect((await redeemPOST(req("/api/credits/redeem", { who: A, body: {} }), {})).status).toBe(400);
  });

  it("차단된 계정은 403", async () => {
    const { body } = await makeCodes([{ credits: 1000, meta: {} }]);
    const res = await redeemPOST(
      req("/api/credits/redeem", { who: A, status: "blocked", body: { code: body.codes[0].code } }), {}
    );
    expect(res.status).toBe(403);
    expect(await getStore().sumGrants(A)).toBe(0);
  });
});

describe("withUser({ pending }) — 이 옵션이 없는 라우트는 그대로 막힌다", () => {
  it("승인 대기는 여전히 403 이다", async () => {
    const { GET: creditsGET } = await import("../app/api/credits/route.js");
    const res = await creditsGET(req("/api/credits", { who: A, status: "pending", method: "GET" }), {});
    expect(res.status).toBe(403);
  });
});
