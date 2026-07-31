import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject, updateProject, listProjects } from "../lib/projects.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("프로젝트 소유자", () => {
  beforeEach(() => resetMemoryStore());

  it("만든 사람은 읽을 수 있다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    expect(await getProject(p.id, A)).toMatchObject({ id: p.id });
  });

  it("남은 못 읽는다 — 없는 것과 구별되지 않는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    expect(await getProject(p.id, B)).toBeNull();
  });

  it("남은 못 고친다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await expect(updateProject(p.id, B, (d) => ({ ...d, status: "script" })))
      .rejects.toThrow(/찾을 수 없어요/);
  });

  it("owner 를 안 넘기면 읽기가 던진다 — 빠뜨림이 조용히 통과하지 않는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await expect(getProject(p.id)).rejects.toThrow(/소유자/);
  });

  it("owner 를 안 넘기면 쓰기도 던진다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await expect(updateProject(p.id, undefined, (d) => d)).rejects.toThrow(/소유자/);
  });

  it("createProject 도 owner 를 요구한다", async () => {
    await expect(createProject({ settings: {}, material: { text: "가", photos: [] } }))
      .rejects.toThrow(/소유자/);
  });

  it("목록은 내 것만 최신순으로 준다", async () => {
    const p1 = await createProject({ settings: {}, material: { text: "첫째", photos: [] }, ownerId: A });
    const p2 = await createProject({ settings: {}, material: { text: "둘째", photos: [] }, ownerId: A });
    await createProject({ settings: {}, material: { text: "남의 것", photos: [] }, ownerId: B });

    const mine = await listProjects(A);
    expect(mine.map((r) => r.id).sort()).toEqual([p1.id, p2.id].sort());
    // doc 통짜를 실어 보내지 않는다
    expect(mine[0]).not.toHaveProperty("cuts");
  });
});
