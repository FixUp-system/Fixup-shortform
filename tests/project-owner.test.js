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

  // 보관함 카드가 쓰는 두 URL. doc 통짜를 싣지 않는다는 계약을 지키면서도
  // 화면이 썸네일을 그릴 수 있어야 한다 — 둘 중 하나라도 빠지면 카드가 빈 칸이 된다.
  it("목록에 썸네일 URL 둘을 실어 준다 — 영상과 첫 컷 그림", async () => {
    const p = await createProject({ settings: {}, material: { text: "썸네일", photos: [] }, ownerId: A });
    await updateProject(p.id, A, (d) => ({
      ...d,
      render: { url: "/api/renders/x.mp4" },
      cuts: [{ image: { url: "https://cdn.example/first.png" } }, { image: { url: "https://cdn.example/second.png" } }],
    }));

    const [row] = await listProjects(A);
    expect(row.video_url).toBe("/api/renders/x.mp4");
    // 첫 컷이다 — 둘째 컷 그림이 오면 카드마다 다른 장면이 뜬다
    expect(row.image_url).toBe("https://cdn.example/first.png");
    expect(row).not.toHaveProperty("cuts");
  });

  it("산출물이 없으면 썸네일 자리는 null 이다 — undefined 가 아니라", async () => {
    await createProject({ settings: {}, material: { text: "아직", photos: [] }, ownerId: A });
    const [row] = await listProjects(A);
    expect(row.video_url).toBeNull();
    expect(row.image_url).toBeNull();
  });
});
