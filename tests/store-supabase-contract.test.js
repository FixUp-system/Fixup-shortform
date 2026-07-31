import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";

// 접속 정보가 없으면 통째로 건너뛴다 — CI·새 클론에서 빨간불이 뜨면 안 된다.
const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!live)("Supabase store 계약", () => {
  let store;
  beforeAll(async () => {
    delete process.env.SHOTFORM_STORE;
    store = (await import("../lib/store/supabase.js")).supabaseStore;
  });

  it("넣고 꺼내면 버전이 0이다", async () => {
    const id = randomUUID();
    await store.insertProject({ id, status: "draft", cuts: [] });
    const row = await store.selectProject(id);
    expect(row.version).toBe(0);
    // 타입까지 본다. Postgres bigint 는 PostgREST 를 거치며 문자열로 올 수 있고,
    // 그러면 updateProjectRow 의 expectedVersion + 1 이 "0"+1="01" 이 된다.
    // 라이브에서 이 위험이 드러나야 한다.
    expect(typeof row.version).toBe("number");
    expect(row.doc.status).toBe("draft");
  });

  it("낡은 버전으로는 갱신되지 않는다", async () => {
    const id = randomUUID();
    await store.insertProject({ id, status: "draft" });
    expect(await store.updateProjectRow(id, 0, { id, status: "script" })).toBe(true);
    expect(await store.updateProjectRow(id, 0, { id, status: "cuts" })).toBe(false);
    expect((await store.selectProject(id)).doc.status).toBe("script");
  });

  it("없는 프로젝트는 null 이다", async () => {
    expect(await store.selectProject(randomUUID())).toBeNull();
  });

  it("같은 request_id 를 두 번 넣어도 한 건이다", async () => {
    const rid = `t-${randomUUID()}`;
    const rec = { request_id: rid, ts: Date.now(), endpoint: "x", actor: "test", est_cost_usd: 0.25 };
    await store.insertCost(rec);
    await store.insertCost(rec);
    expect(await store.findCost(rid)).toBeTruthy();
    // 합계가 두 배가 되지 않는다
    const all = (await store.allCosts()).filter((r) => r.request_id === rid);
    expect(all).toHaveLength(1);
  });

  it("객체를 넣고 꺼낸다", async () => {
    const key = `test-${randomUUID()}.jpg`;
    await store.putObject("uploads", key, Buffer.from("hello"), "image/jpeg");
    expect((await store.getObject("uploads", key)).toString()).toBe("hello");
  });
});
