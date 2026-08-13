// ★ kind 없음 = 기존 종류. 이 방향을 뒤집으면 기존 프로젝트 전체가 새 경로로 흘러간다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, listProjects } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";

const U = "00000000-0000-4000-8000-00000000000a";
const run = (fn) => runWithActor(U, fn);

describe("kind — 두 종류를 가른다", () => {
  beforeEach(() => resetMemoryStore());

  it("kind 를 안 주면 문서에 kind 가 없다 — 옛 문서와 같은 모양이다", async () => {
    const p = await run(() => createProject({ material: { text: "가" }, ownerId: U }));
    expect(p.kind).toBeUndefined();
  });

  it("kind:'ad' 를 주면 문서에 남는다", async () => {
    const p = await run(() => createProject({ material: { text: "가" }, ownerId: U, kind: "ad" }));
    expect(p.kind).toBe("ad");
    const back = await getProject(p.id, U);
    expect(back.kind).toBe("ad");
  });

  it("모르는 kind 는 던진다 — 오타로 새 세계가 생기면 안 된다", async () => {
    await expect(
      run(() => createProject({ material: { text: "가" }, ownerId: U, kind: "광고" }))
    ).rejects.toThrow();
  });

  it("목록이 종류를 실어 보낸다 — 옛 문서는 null", async () => {
    await run(() => createProject({ material: { text: "옛것" }, ownerId: U }));
    await run(() => createProject({ material: { text: "광고" }, ownerId: U, kind: "ad" }));
    const list = await listProjects(U);
    const kinds = list.map((p) => p.kind).sort();
    // ⚠️ 브리프 원문은 [null, "ad"] 였지만 Array.prototype.sort() 는 기본 비교자가
    // 요소를 문자열로 바꿔 비교한다 — String(null) === "null" 이라 "ad" < "null" 이 되어
    // 실제 정렬 결과는 언제나 ["ad", null] 이다(node -e 로 실측: [null,'ad'].sort() → ['ad', null]).
    // 검사 의도(옛 문서는 null·새 문서는 ad, 둘 다 목록에 실린다)는 그대로 두고 순서만 고쳤다.
    expect(kinds).toEqual(["ad", null]);
  });

  it("목록 썸네일이 종류에 맞는 자리를 본다", async () => {
    const p = await run(() => createProject({ material: { text: "광고" }, ownerId: U, kind: "ad" }));
    const store = getStore();
    const row = await store.selectProject(p.id, U);
    await store.updateProjectRow(p.id, U, row.version, {
      ...row.doc, videos: [{ url: "/api/renders/x.mp4", seconds: 15 }],
    });
    const list = await listProjects(U);
    expect(list.find((x) => x.id === p.id).video_url).toBe("/api/renders/x.mp4");
  });
});
