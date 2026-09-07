// 사용자 관리의 "내역" 을 **크레딧 → 실제 비용(USD)** 으로 (2026-09-07 사장님 지시).
//
// ★ 이 저장소는 **장부가 둘이고 단위가 다르다**:
//     청구 = 크레딧(credit_grants·credit_charges) · 원가 = USD(cost_records)
//   운영자가 보고 싶은 것은 "이 사람이 **우리 돈**을 얼마나 썼나"라 원가 쪽이다.
//   지금 크레딧은 꺼져 있어(SHOTFORM_NO_CREDITS=1) 그 장부는 사실상 비어 있기도 하다.
//
// ★ **`lib/ledger-read.js` 는 안 건드린다** — 마이페이지(/me)의 사장님 크레딧 화면이 그걸
//   쓴다. 거기서는 크레딧이 맞는 단위다. 그래서 읽는 자리를 새로 둔다(lib/cost-read.js).
//
// ★ 합계는 **SQL 이 낸다**(sumCosts). 행을 다 받아 JS 에서 더하면 PostgREST 행 상한(1000)에
//   걸려 **조용히 적게 센다** — 이 저장소가 예산 가드에서 이미 겪은 사고다(lib/costs.js 주석).
//
// ★ 커서는 번호가 아니라 **시각**이다 — ledger-read 와 같은 규약. 그 사이 새 줄이 생겨도
//   이미 본 줄이 다시 나오거나 건너뛰지 않는다.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { readCosts, COST_PAGE } from "../lib/cost-read.js";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";

// ts 를 직접 준다 — 커서가 시각으로 도는지 재려면 순서가 정해져 있어야 한다.
const cost = (actor, i, usd = 1) =>
  memoryStore.insertCost({
    request_id: `${actor}-${i}`,
    ts: 1_700_000_000_000 + i * 1000,
    endpoint: "bytedance/seedance-2.0",
    stage: "영상",
    actor,
    project_id: null,
    est_cost_usd: usd,
    status: "done",
  });

// 만들어 놓고 화면이 안 쓰면 아무것도 안 바뀐다 — 이 저장소의 JSX 는 소스를 읽어 잰다.
describe("사용자 관리 화면 — 크레딧이 아니라 비용을 그린다", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const admin = strip(readFileSync("app/admin/page.js", "utf8"));

  it("★ 내역 자리의 이름이 '사용 비용' 이다", () => {
    expect(admin).toContain("사용 비용");
  });

  it("★ 크레딧 내역의 말 표(ledgerLabel)를 이 자리에서 안 쓴다 — 단위가 다르다", () => {
    expect(admin).not.toMatch(/ledgerLabel/);
  });

  it("★ 전체 합계를 그린다 — 한 쪽만 더한 값이 아니라 서버가 준 total_usd 다", () => {
    expect(admin).toMatch(/total_usd/);
  });

  it("★ 더 받는 문이 있다 — 커서는 시각(before)이다", () => {
    expect(admin).toMatch(/before=/);
    expect(admin).toMatch(/has_more/);
  });

  it("크레딧 넣기와 잔액은 그대로다 — 바꾼 것은 '내역'이다(회귀 방어)", () => {
    expect(admin).toContain("크레딧 넣기");
    expect(admin).toMatch(/balance/);
  });
});

describe("스토어 — 사람으로 원장을 자른다", () => {
  beforeEach(() => resetMemoryStore());

  it("★ actor 를 주면 그 사람 것만 준다 — 남의 지출이 섞이면 안 된다", async () => {
    await cost(A, 1); await cost(A, 2); await cost(B, 3);
    const rows = await memoryStore.listCosts({ actor: A });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.actor === A)).toBe(true);
  });

  it("actor 를 안 주면 예전처럼 전부 준다(회귀 방어 — /costs 화면이 그렇게 쓴다)", async () => {
    await cost(A, 1); await cost(B, 2);
    expect(await memoryStore.listCosts({})).toHaveLength(2);
  });

  it("★ before 를 주면 그 시각보다 앞선 것만 — 커서가 시각이다", async () => {
    await cost(A, 1); await cost(A, 2); await cost(A, 3);
    const rows = await memoryStore.listCosts({ actor: A, before: 1_700_000_000_000 + 3 * 1000 });
    expect(rows.map((r) => r.request_id)).toEqual([`${A}-2`, `${A}-1`]);
  });
});

describe("readCosts — 합계와 상세", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 합계는 그 사람의 **전 기간**이다 — 한 쪽만 더하면 안 된다", async () => {
    for (let i = 1; i <= 25; i++) await cost(A, i, 2);
    await cost(B, 99, 1000);   // 남의 것은 안 섞인다
    const out = await readCosts(A, { limit: 5 });
    expect(out.rows).toHaveLength(5);
    expect(out.total_usd).toBe(50);   // 25건 × $2 — 5건만 더한 10 이 아니다
  });

  it("★ 페이지가 겹치거나 건너뛰지 않는다", async () => {
    for (let i = 1; i <= 7; i++) await cost(A, i);
    const p1 = await readCosts(A, { limit: 3 });
    const p2 = await readCosts(A, { limit: 3, before: p1.rows.at(-1).ts });
    const ids = [...p1.rows, ...p2.rows].map((r) => r.request_id);
    expect(new Set(ids).size, "겹쳤다").toBe(6);
    expect(p1.has_more).toBe(true);
  });

  it("마지막 쪽에서는 has_more 가 거짓이다", async () => {
    for (let i = 1; i <= 3; i++) await cost(A, i);
    expect((await readCosts(A, { limit: 10 })).has_more).toBe(false);
  });

  it("쓴 적이 없는 사람은 0 이고 던지지 않는다", async () => {
    const out = await readCosts(A);
    expect(out.total_usd).toBe(0);
    expect(out.rows).toEqual([]);
  });

  it("한 쪽 기본 크기가 정해져 있다 — 화면이 안 정하면 이 값이다", () => {
    expect(COST_PAGE).toBe(20);
  });

  it("★ 화면이 그릴 값이 실려 온다 — 무엇에 썼는지(stage)와 얼마인지", async () => {
    await cost(A, 1, 3.5);
    const r = (await readCosts(A)).rows[0];
    expect(r.stage).toBe("영상");
    expect(r.endpoint).toBe("bytedance/seedance-2.0");
    expect(r.est_cost_usd).toBe(3.5);
    expect(typeof r.ts).toBe("number");
  });
});
