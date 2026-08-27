// 비용 기록을 **한 번에 다 안 준다** (2026-08-27 사장님 지시: "100개씩하고 300개만
// 불러오고 그 이외는 필터를 통해서 검색하는걸로").
//
// 뿌리 — 원장은 계속 쌓이는 표다(지금 846건). 화면 한 장을 그리려고 전부 읽어 전부
// 실어 보내면 행이 늘수록 그대로 느려진다. 세 단으로 줄인다:
//   ① **기간으로 자른 창**만 SQL 로 읽는다(store.listCosts)
//   ② 사람·종류로 좁힌다 — 프로필·프로젝트를 물어야 해서 SQL 한 번으로 안 끝난다
//   ③ **300개까지만** 실어 보내고, 잘렸으면 그 사실을 말한다
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { listRecords } from "../lib/costs.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { COSTS_PAGE_MAX, GET } from "../app/api/costs/route.js";

const ADMIN = "22222222-2222-2222-2222-222222222222";
const AUTH = { [USER_HEADER]: ADMIN, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "admin" };
const req = (qs = "") => new Request(`http://x/api/costs${qs}`, { headers: AUTH });
const day = (d) => new Date(2026, 7, d, 12).getTime();   // 8월 d일 정오

// ★ request_id 는 원장의 **기본키**다(멱등키) — 두 뭉치가 같은 id 를 쓰면 뒤엣것이
//   앞엣것을 덮어써서 건수가 조용히 줄어든다(이 판을 쓰면서 실제로 밟았다).
let seq = 0;
async function seed(n, { actor = ADMIN, at = day(20) } = {}) {
  for (let i = 0; i < n; i++) {
    await memoryStore.insertCost({
      request_id: `r${seq++}`, ts: at - i * 1000, endpoint: "e", actor, est_cost_usd: 1,
    });
  }
}

describe("읽는 양 — 창으로 자른다", () => {
  beforeEach(() => { resetMemoryStore(); seq = 0; });

  // ★★ 2026-08-27 실측 — 이 판은 **라이브 조회에서 잡힌 것**을 못 박는다.
  //   `cost_records.ts` 는 timestamptz 인데(db/schema.sql) 에폭 밀리초를 그대로 넘겨
  //   `date/time field value out of range: 1787756400000` 로 죽었다. 메모리 저장소는
  //   숫자를 그대로 다뤄서 이 판 밖에서는 안 드러난다 — 그래서 **소스**로 잰다.
  it("★ 기간은 시각 문자열로 넘긴다 — 숫자를 주면 라이브에서 죽는다", () => {
    const sb = readFileSync("lib/store/supabase.js", "utf8");
    const at = sb.indexOf("async listCosts(");
    const body = sb.slice(at, at + 900);
    expect(body, "에폭 밀리초를 그대로 넘긴다").not.toMatch(/gte\("ts", from\)/);
    expect(body).toContain("toISOString");
  });

  it("★ 저장소에 창을 여는 문이 있다 — 없으면 늘 전부 읽는다", () => {
    expect(typeof memoryStore.listCosts).toBe("function");
    // supabase 쪽도 같은 계약이어야 한다(둘이 갈리면 로컬만 빨라진다).
    const sb = readFileSync("lib/store/supabase.js", "utf8");
    expect(sb).toMatch(/async listCosts\(/);
    expect(sb, "SQL 에 상한이 없다").toMatch(/\.limit\(limit\)/);
  });

  it("기간 밖은 아예 안 읽는다", async () => {
    await seed(3, { at: day(10) });
    await seed(3, { at: day(20) });
    const rows = await memoryStore.listCosts({ from: day(15), to: day(25) });
    expect(rows.length).toBe(3);
  });

  it("최신부터 준다 — 창이 잘려도 최근 것이 남는다", async () => {
    await seed(5);
    const rows = await memoryStore.listCosts({ limit: 2 });
    // seed 는 ts 를 뒤로 밀며 넣는다 — r0 가 가장 최근이다.
    expect(rows.map((r) => r.request_id)).toEqual(["r0", "r1"]);
  });

  it("listRecords 가 그 문을 쓴다", async () => {
    await seed(3, { at: day(10) });
    await seed(3, { at: day(20) });
    const got = await listRecords({ from: day(15), to: day(25) });
    expect(got.length).toBe(3);
  });
});

describe("실어 보내는 양 — 300개까지", () => {
  beforeEach(() => { resetMemoryStore(); seq = 0; });

  it(`상한이 ${COSTS_PAGE_MAX} 이다 — 100개씩 세 쪽`, () => {
    expect(COSTS_PAGE_MAX).toBe(300);
  });

  it("★ 넘치면 자르고, **잘렸다고 말한다**", async () => {
    await seed(320);
    const body = await (await GET(req(), {})).json();
    expect(body.records.length).toBe(300);
    expect(body.matched, "몇 건이 걸렸는지 안 말한다").toBe(320);
    expect(body.truncated).toBe(true);
  });

  it("안 넘치면 그대로 주고 잘렸다고 안 한다", async () => {
    await seed(12);
    const body = await (await GET(req(), {})).json();
    expect(body.records.length).toBe(12);
    expect(body.matched).toBe(12);
    expect(body.truncated).toBe(false);
  });

  it("★ 좁히는 일을 **서버가 한다** — 그래야 300 밖의 것에 닿는다", async () => {
    await seed(5, { at: day(10) });
    await seed(7, { at: day(20) });
    const body = await (await GET(req("?from=2026-08-19&to=2026-08-21"), {})).json();
    expect(body.records.length).toBe(7);
    expect(body.matched).toBe(7);
  });

  it("사람으로도 서버가 좁힌다", async () => {
    await seed(4, { actor: "admin" });
    await memoryStore.insertCost({ request_id: "x", ts: day(20), endpoint: "e", actor: "local", est_cost_usd: 1 });
    const body = await (await GET(req("?person=local"), {})).json();
    expect(body.records.length).toBe(1);
  });

  it("운영자만 본다 — 이 문은 전사 원장이다", () => {
    const src = readFileSync("app/api/costs/route.js", "utf8");
    expect(src).toContain("adminOnly: true");
  });
});

describe("화면 — 100개씩 넘긴다", () => {
  const src = readFileSync("app/costs/page.js", "utf8");

  it("한 쪽이 100개다", () => {
    expect(src).toMatch(/PER_PAGE = 100/);
  });

  it("쪽 넘기는 자리가 있다 — 한 쪽뿐이면 안 그린다", () => {
    expect(src).toContain("cost-pager");
    expect(src).toMatch(/pageCount > 1/);
  });

  it("★ 조건이 바뀌면 첫 쪽으로 돌아간다 — 안 그러면 빈 쪽에 서 있게 된다", () => {
    expect(src).toMatch(/setPage\(0\)/);
    expect(src, "쪽 번호를 범위 안으로 안 묶는다").toMatch(/Math\.min\(page, pageCount - 1\)/);
  });

  it("★ 좁히기를 화면에서 **다시 하지 않는다** — 두 곳에서 하면 두 수가 갈린다", () => {
    expect(src, "화면이 또 거른다").not.toContain("filterRecords");
  });

  it("사람 검색은 한 박자 늦춘다 — 글자마다 요청을 보내지 않는다", () => {
    expect(src).toMatch(/setTimeout\(go, person \? 300 : 0\)/);
  });

  it("잘렸으면 화면이 말한다", () => {
    expect(src).toMatch(/truncated &&/);
    expect(src).toContain("좁혀 주세요");
  });
});
