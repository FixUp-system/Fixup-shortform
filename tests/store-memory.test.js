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

  it("renders 버킷도 같은 방식으로 넣고 꺼낸다", async () => {
    const s = getStore();
    await s.putObject("renders", "p1.mp4", Buffer.from("mp4-bytes"), "video/mp4");
    expect((await s.getObject("renders", "p1.mp4")).toString()).toBe("mp4-bytes");
    // 버킷이 갈라져 있다 — 같은 key 라도 uploads 것과 섞이지 않는다
    await s.putObject("uploads", "p1.mp4", Buffer.from("사진"), "image/jpeg");
    expect((await s.getObject("renders", "p1.mp4")).toString()).toBe("mp4-bytes");
  });
});

// 폴링용 부분 읽기 셋. 인메모리는 doc 전체가 이미 메모리에 있어 읽기량이 줄지 않지만,
// **모양이 Supabase 와 다르면 여기서 통과한 코드가 프로덕션에서만 깨진다.**
// (putObject 가 contentType 인자를 안 받아 같은 함정을 만들 뻔했다 — memory.js 주석 참고)
describe("인메모리 store — 폴링용 부분 읽기", () => {
  const doc = {
    id: "p1",
    status: "images",
    cuts: [
      { idx: 0, image: { url: "u0", of: "각인0" } },
      { idx: 1, image: { url: "u1", of: "각인1" } },
    ],
    render: { url: "/api/renders/p1.mp4" },
    cuts_error: null,
    images_error: "그림 실패",
    material: { text: "자료 원문" },
  };
  const seed = () => getStore().insertProject(doc, OWNER);

  it("진행 상태는 상태·오류·컷 개수만 준다 — 컷 내용도 자료도 없다", async () => {
    await seed();
    const p = await getStore().selectProjectProgress("p1", OWNER);
    expect(p.status).toBe("images");
    expect(p.images_error).toBe("그림 실패");
    expect(p.cut_count).toBe(2);
    // 이 함수가 존재하는 이유다 — 무거운 것이 실리면 목적이 사라진다
    expect(p).not.toHaveProperty("cuts");
    expect(p).not.toHaveProperty("material");
  });

  it("합성 상태는 render 만 준다 — cuts 는 없다", async () => {
    await seed();
    const p = await getStore().selectProjectRender("p1", OWNER);
    expect(p.render.url).toBe("/api/renders/p1.mp4");
    expect(p).not.toHaveProperty("cuts");
  });

  it("컷 상태는 각인(of)을 그대로 실어 준다 — 떼면 낡음 판정이 죽는다", async () => {
    await seed();
    const p = await getStore().selectProjectCuts("p1", OWNER);
    expect(p.cuts).toHaveLength(2);
    // isImageStale 이 image.of 로 판정한다. 여기서 각인이 빠지면 화면이 setProject 로
    // cuts 를 덮어쓰면서 "각인 없음 = 안 낡음"이 되어 낡은 그림에 경고가 안 뜬다.
    expect(p.cuts[0].image.of).toBe("각인0");
    expect(p).not.toHaveProperty("material");
  });

  it("남의 것은 셋 다 null 이다", async () => {
    await seed();
    const s = getStore();
    expect(await s.selectProjectProgress("p1", OTHER)).toBeNull();
    expect(await s.selectProjectRender("p1", OTHER)).toBeNull();
    expect(await s.selectProjectCuts("p1", OTHER)).toBeNull();
  });

  // ★ Task 7 — 기존 라우트가 광고 문서(kind:"ad")를 걸러내려면 이 셋(status 폴링이 쓰는
  // 좁은 셀렉터)이 kind 를 실어야 한다. doc 통짜를 안 읽는 자리라 셀렉터가 안 실으면
  // 라우트가 아예 판정할 수 없다.
  it("셋 다 kind 를 싣는다 — 옛 문서는 null, 광고 문서는 값 그대로", async () => {
    await seed(); // doc 에는 kind 가 없다 — 옛 문서
    const s = getStore();
    expect((await s.selectProjectProgress("p1", OWNER)).kind).toBeNull();
    expect((await s.selectProjectRender("p1", OWNER)).kind).toBeNull();
    expect((await s.selectProjectCuts("p1", OWNER)).kind).toBeNull();

    await s.insertProject({ id: "p2", status: "draft", kind: "ad", cuts: [] }, OWNER);
    expect((await s.selectProjectProgress("p2", OWNER)).kind).toBe("ad");
    expect((await s.selectProjectRender("p2", OWNER)).kind).toBe("ad");
    expect((await s.selectProjectCuts("p2", OWNER)).kind).toBe("ad");
  });
});
