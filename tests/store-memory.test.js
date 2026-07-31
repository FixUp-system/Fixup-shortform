// Task 4 에서 vitest.setup.js 가 세우기 전까지는 이 파일이 직접 세운다.
// getStore() 는 명시적 env 없이는 던지므로(조용한 인메모리 폴백 금지) 여기서 켜 준다.
process.env.SHOTFORM_STORE = "memory";

import { describe, it, expect, beforeEach } from "vitest";
import { getStore } from "../lib/store/index.js";
import { resetMemoryStore } from "../lib/store/memory.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => resetMemoryStore());

describe("인메모리 store", () => {
  it("프로젝트를 넣고 꺼낸다 — 버전은 0에서 시작한다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft", cuts: [] }, OWNER);
    expect(await s.selectProject("p1", OWNER)).toEqual({ version: 0, doc: { id: "p1", status: "draft", cuts: [] } });
  });

  it("없는 프로젝트는 null 이다 — 오류가 아니다", async () => {
    expect(await getStore().selectProject("없음", OWNER)).toBeNull();
  });

  // ★ memory.js 의 `if (row.owner_id !== ownerId)` 를 지우면 이 자리가 빨개진다 —
  // selectProject 가 남의 owner 로도 문서를 돌려주게 되기 때문이다.
  it("남의 owner 로는 못 읽는다 — 없는 것과 구별되지 않는다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft", cuts: [] }, OWNER);
    expect(await s.selectProject("p1", OTHER)).toBeNull();
  });

  it("기대 버전이 맞을 때만 갱신한다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft" }, OWNER);
    expect(await s.updateProjectRow("p1", OWNER, 0, { id: "p1", status: "script" })).toBe(true);
    expect((await s.selectProject("p1", OWNER)).version).toBe(1);
    expect(await s.updateProjectRow("p1", OWNER, 0, { id: "p1", status: "cuts" })).toBe(false); // 낡은 버전
    expect((await s.selectProject("p1", OWNER)).doc.status).toBe("script"); // 안 바뀐다
  });

  // ★ memory.js 의 updateProjectRow 에서 owner_id 검사를 지우면 이 자리가 빨개진다.
  it("남의 owner 로는 갱신되지 않는다", async () => {
    const s = getStore();
    await s.insertProject({ id: "p1", status: "draft" }, OWNER);
    expect(await s.updateProjectRow("p1", OTHER, 0, { id: "p1", status: "script" })).toBe(false);
    expect((await s.selectProject("p1", OWNER)).doc.status).toBe("draft"); // 안 바뀐다
  });

  it("비용은 request_id 로 멱등하다", async () => {
    const s = getStore();
    await s.insertCost({ request_id: "r1", ts: 1, endpoint: "x", est_cost_usd: 0.5 });
    await s.insertCost({ request_id: "r1", ts: 1, endpoint: "x", est_cost_usd: 0.5 });
    expect(await s.allCosts()).toHaveLength(1);
    expect(await s.sumCosts({})).toBe(0.5);
  });

  it("프로젝트별 합계를 낸다", async () => {
    const s = getStore();
    await s.insertCost({ request_id: "a", ts: 1, endpoint: "x", est_cost_usd: 1, project_id: "p1" });
    await s.insertCost({ request_id: "b", ts: 2, endpoint: "x", est_cost_usd: 2, project_id: "p2" });
    expect(await s.sumCosts({ projectId: "p1" })).toBe(1);
    expect(await s.sumCosts({})).toBe(3);
  });

  it("객체를 넣고 꺼낸다", async () => {
    const s = getStore();
    await s.putObject("uploads", "x.jpg", Buffer.from("bytes"), "image/jpeg");
    expect((await s.getObject("uploads", "x.jpg")).toString()).toBe("bytes");
  });

  it("없는 객체는 던진다 — 빈 값으로 흘리지 않는다", async () => {
    await expect(getStore().getObject("uploads", "없음.jpg")).rejects.toThrow();
  });
});
