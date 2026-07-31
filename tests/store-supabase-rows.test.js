// Supabase 구현의 **행 모양**을 가짜 클라이언트로 잰다.
//
// 왜 따로 필요한가: 인메모리 저장소는 레코드를 평평하게 통째로 들고 있어서
// "컬럼이냐 meta 냐", "행 상한에 걸렸느냐" 같은 차이가 **아예 보이지 않는다.**
// tests/store-supabase-contract.test.js 는 접속 정보가 있을 때만 도는 라이브 계약이라
// 평소에는 통째로 건너뛴다. 그 사이에 뚫린 구멍(actor 가 항상 "local", 합계가 앞의
// 1000건만, 컬럼을 meta 에 밀어 넣기)을 여기서 막는다.
import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

// 가짜 PostgREST — 체이닝을 그대로 기록하고, 응답은 테스트가 갈아 끼운다.
// supabase-js 의 빌더는 await 가 되는(thenable) 객체라 여기서도 then 을 단다.
const H = vi.hoisted(() => ({ calls: [], respond: () => ({ data: null, error: null }), rpc: [], rpcRespond: () => ({ data: 0, error: null }) }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table) {
      const state = { table };
      H.calls.push(state);
      const b = {
        select: (cols, opts) => ((state.select = { cols, opts }), b),
        insert: (v) => ((state.op = "insert"), (state.payload = v), b),
        upsert: (v, o) => ((state.op = "upsert"), (state.payload = v), (state.opts = o), b),
        update: (v) => ((state.op = "update"), (state.payload = v), b),
        eq: (c, v) => ((state.eq ||= []).push([c, v]), b),
        order: (c, o) => ((state.order ||= []).push([c, o]), b),
        range: (a, z) => ((state.range = [a, z]), b),
        maybeSingle: () => ((state.single = true), b),
        then: (res, rej) => Promise.resolve(H.respond(state)).then(res, rej),
      };
      return b;
    },
    rpc(fn, args) {
      H.rpc.push({ fn, args });
      return Promise.resolve(H.rpcRespond({ fn, args }));
    },
  }),
}));

const { supabaseStore } = await import("../lib/store/supabase.js");

beforeEach(() => {
  H.calls.length = 0;
  H.rpc.length = 0;
  H.respond = () => ({ data: null, error: null });
  H.rpcRespond = () => ({ data: 0, error: null });
});

const lastOf = (op) => [...H.calls].reverse().find((c) => c.op === op);

describe("insertCost — actor 컬럼", () => {
  it("호출부가 쓰는 user 가 actor 컬럼에 들어간다", async () => {
    // 실측: 옛 원장 54건이 전부 user 키였고 actor 는 0건이었다. 이 매핑이 없으면
    // actor 는 언제나 "local" 이라 (actor, ts) 인덱스가 상수 컬럼을 색인하고,
    // 인증이 붙어도 사용자별 집계가 전부 "local" 로 쌓인다.
    await supabaseStore.insertCost({
      request_id: "r1", ts: 1700000000000, endpoint: "fal-ai/x", est_cost_usd: 0.08, user: "u-7",
    });
    const row = lastOf("upsert").payload;
    expect(row.actor).toBe("u-7");
    // 읽는 쪽은 계속 user 로 본다 — meta 에도 남긴다
    expect(row.meta.user).toBe("u-7");
  });

  it("actor 를 직접 주면 그것이 이긴다", async () => {
    await supabaseStore.insertCost({ request_id: "r2", ts: 1, endpoint: "x", actor: "a", user: "u" });
    expect(lastOf("upsert").payload.actor).toBe("a");
  });

  it("둘 다 없으면 local 이다", async () => {
    await supabaseStore.insertCost({ request_id: "r3", ts: 1, endpoint: "x" });
    expect(lastOf("upsert").payload.actor).toBe("local");
  });
});

describe("patchCost — 컬럼과 meta 를 가른다", () => {
  it("컬럼 이름은 컬럼으로 간다 — meta 에만 들어가면 sumCosts 만 다른 값을 본다", async () => {
    H.respond = (s) => ({ data: s.op === "update" ? [{ request_id: "r1", ts: new Date().toISOString(), est_cost_usd: 2, meta: {} }] : null, error: null });
    await supabaseStore.patchCost("r1", { est_cost_usd: 2, stage: "images", status: "ok" });
    const p = lastOf("update").payload;
    expect(p.est_cost_usd).toBe(2);
    expect(p.stage).toBe("images");
    expect(p.status).toBe("ok");
    expect(p.meta).toBeUndefined(); // 컬럼뿐이라 meta 를 건드릴 일이 없다
  });

  it("컬럼이 아닌 것만 meta 로 병합된다", async () => {
    H.respond = (s) => {
      if (s.single) return { data: { request_id: "r1", meta: { prompt: "옛것", user: "u" } }, error: null };
      return { data: [{ request_id: "r1", ts: new Date().toISOString(), meta: {} }], error: null };
    };
    await supabaseStore.patchCost("r1", { video_url: "http://v", status: "done" });
    const p = lastOf("update").payload;
    expect(p.status).toBe("done");
    expect(p.meta).toEqual({ prompt: "옛것", user: "u", video_url: "http://v" });
    expect(p.meta.status).toBeUndefined();
  });
});

describe("sumCosts — DB 가 더한다", () => {
  it("sum_costs 함수를 부른다", async () => {
    H.rpcRespond = () => ({ data: "1.5", error: null }); // numeric 은 문자열로 올 수 있다
    expect(await supabaseStore.sumCosts({})).toBe(1.5);
    expect(H.rpc[0]).toEqual({ fn: "sum_costs", args: { p_project_id: null, p_actor: null } });
  });

  it("projectId 를 그대로 넘긴다", async () => {
    H.rpcRespond = () => ({ data: 0.25, error: null });
    expect(await supabaseStore.sumCosts({ projectId: "p-1" })).toBe(0.25);
    expect(H.rpc[0].args).toEqual({ p_project_id: "p-1", p_actor: null });
  });

  it("actor 를 그대로 넘긴다", async () => {
    H.rpcRespond = () => ({ data: 0.75, error: null });
    expect(await supabaseStore.sumCosts({ actor: "u-1" })).toBe(0.75);
    expect(H.rpc[0].args).toEqual({ p_project_id: null, p_actor: "u-1" });
  });

  it("합계를 숫자로 못 읽으면 던진다 — 조용히 적게 세면 예산 상한이 사라진다", async () => {
    H.rpcRespond = () => ({ data: null, error: null }); // 함수가 아직 안 올라간 경우 등
    await expect(supabaseStore.sumCosts({})).rejects.toThrow(/sum_costs/);
  });
});

describe("allCosts — 행 상한", () => {
  const rows = [1, 2, 3].map((n) => ({ request_id: `r${n}`, ts: new Date().toISOString(), est_cost_usd: n, meta: {} }));

  it("서버가 한 번에 다 안 줘도 끝까지 받아 온다", async () => {
    // 한 페이지에 한 건만 주는 서버를 흉내 낸다(실서버는 기본 1000건에서 자른다)
    H.respond = (s) => ({ data: rows.slice(s.range[0], s.range[0] + 1), error: null, count: rows.length });
    const all = await supabaseStore.allCosts();
    expect(all.map((r) => r.request_id)).toEqual(["r1", "r2", "r3"]);
  });

  it("끝까지 못 받으면 던진다 — 원장 화면이 조용히 일부만 보여주면 안 된다", async () => {
    H.respond = (s) => ({ data: s.select?.opts?.head ? null : [], error: null, count: 3 });
    await expect(supabaseStore.allCosts()).rejects.toThrow(/3건 중 0건/);
  });
});
