// 크레딧 코드 — 저장소 계약(메모리). Supabase 는 같은 모양이어야 한다(db/schema.sql 의 redeem_credit_code).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const row = (code, amount = 1000, extra = {}) => ({
  code, amount_credits: amount, batch: "와디즈 1차", meta: { 발송번호: code }, created_by: ADMIN, ...extra,
});

describe("크레딧 코드 저장소", () => {
  beforeEach(() => resetMemoryStore());

  it("넣은 코드를 최신 먼저 돌려준다", async () => {
    const s = getStore();
    expect(await s.insertCreditCodes([row("AAAA2222AAAA")])).toBe(true);
    expect(await s.insertCreditCodes([row("BBBB2222BBBB", 3000)])).toBe(true);
    const list = await s.listCreditCodes();
    expect(list.map((c) => c.code)).toEqual(["BBBB2222BBBB", "AAAA2222AAAA"]);
    expect(list[0]).toMatchObject({ amount_credits: 3000, batch: "와디즈 1차", redeemed_by: null, redeemed_at: null });
    expect(list[0].meta).toEqual({ 발송번호: "BBBB2222BBBB" });
  });

  it("코드가 겹치면 false 이고 한 줄도 안 들어간다", async () => {
    const s = getStore();
    await s.insertCreditCodes([row("AAAA2222AAAA")]);
    expect(await s.insertCreditCodes([row("CCCC2222CCCC"), row("AAAA2222AAAA")])).toBe(false);
    expect((await s.listCreditCodes()).map((c) => c.code)).toEqual(["AAAA2222AAAA"]);
    // 한 묶음 안에서 겹쳐도 같다
    expect(await s.insertCreditCodes([row("DDDD2222DDDD"), row("DDDD2222DDDD")])).toBe(false);
    expect(await s.listCreditCodes()).toHaveLength(1);
  });

  it("등록하면 충전 장부에 한 줄이 생긴다 — 누가·왜", async () => {
    const s = getStore();
    await s.insertCreditCodes([row("AAAA2222AAAA", 1500)]);
    const r = await s.redeemCreditCode("AAAA2222AAAA", A, "크레딧 코드 AAAA-2222-AAAA");
    expect(r).toEqual({ result: "ok", credits: 1500 });
    expect(await s.sumGrants(A)).toBe(1500);
    const [g] = await s.listGrants(A);
    expect(g).toMatchObject({ user_id: A, amount_credits: 1500, reason: "크레딧 코드 AAAA-2222-AAAA", granted_by: A });
    const [c] = await s.listCreditCodes();
    expect(c.redeemed_by).toBe(A);
    expect(c.redeemed_at).toBeTruthy();
  });

  it("두 번째 등록은 used — 같은 사람이어도, 다른 사람이어도", async () => {
    const s = getStore();
    await s.insertCreditCodes([row("AAAA2222AAAA")]);
    await s.redeemCreditCode("AAAA2222AAAA", A, "r");
    expect(await s.redeemCreditCode("AAAA2222AAAA", A, "r")).toEqual({ result: "used", credits: null });
    expect(await s.redeemCreditCode("AAAA2222AAAA", B, "r")).toEqual({ result: "used", credits: null });
    expect(await s.sumGrants(A)).toBe(1000);
    expect(await s.sumGrants(B)).toBe(0);
  });

  it("없는 코드는 not_found", async () => {
    expect(await getStore().redeemCreditCode("ZZZZ2222ZZZZ", A, "r")).toEqual({ result: "not_found", credits: null });
  });

  it("동시에 둘이 넣어도 한 명만 받는다", async () => {
    const s = getStore();
    await s.insertCreditCodes([row("AAAA2222AAAA")]);
    const results = await Promise.all([
      s.redeemCreditCode("AAAA2222AAAA", A, "r"),
      s.redeemCreditCode("AAAA2222AAAA", B, "r"),
    ]);
    expect(results.filter((r) => r.result === "ok")).toHaveLength(1);
    expect((await s.sumGrants(A)) + (await s.sumGrants(B))).toBe(1000);
  });

  it("안 쓴 코드만 지운다", async () => {
    const s = getStore();
    await s.insertCreditCodes([row("AAAA2222AAAA"), row("BBBB2222BBBB")]);
    await s.redeemCreditCode("AAAA2222AAAA", A, "r");
    expect(await s.deleteCreditCode("AAAA2222AAAA")).toBe("used");
    expect(await s.deleteCreditCode("BBBB2222BBBB")).toBe("deleted");
    expect(await s.deleteCreditCode("BBBB2222BBBB")).toBe("not_found");
    expect((await s.listCreditCodes()).map((c) => c.code)).toEqual(["AAAA2222AAAA"]);
  });

  it("리셋이 코드도 비운다 — 테스트 사이로 새지 않는다", async () => {
    await getStore().insertCreditCodes([row("AAAA2222AAAA")]);
    resetMemoryStore();
    expect(await getStore().listCreditCodes()).toEqual([]);
  });
});

describe("Supabase 쪽 짝", () => {
  const supa = readFileSync("lib/store/supabase.js", "utf8");
  const schema = readFileSync("db/schema.sql", "utf8");

  it("같은 네 함수가 있다", () => {
    for (const fn of ["insertCreditCodes", "listCreditCodes", "deleteCreditCode", "redeemCreditCode"]) {
      expect(supa).toMatch(new RegExp(`async ${fn}\\(`));
    }
  });

  it("등록은 SQL 함수 한 번이다 — 코드 잡기와 충전을 앱에서 나누지 않는다", () => {
    expect(supa).toMatch(/rpc\("redeem_credit_code"/);
    expect(schema).toMatch(/create table if not exists credit_codes/);
    expect(schema).toMatch(/create or replace function redeem_credit_code/);
    expect(schema).toMatch(/redeemed_by is null/);
    expect(schema).toMatch(/alter table credit_codes\s+enable row level security/);
  });
});
