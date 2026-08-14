// ★ 이 파일은 두 가지를 막는다.
//  ① selectProjectCuts 가 images_error 를 빠뜨리던 버그(2026-08-14) — 이미지 실패가
//     화면까지 영영 도착하지 않았다.
//  ② memory·supabase 두 구현이 다른 모양을 돌려주는 것 — 한쪽만 고치면 테스트는 통과하고
//     프로덕션이 깨진다(lib/store/memory.js:64-67 주석).
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

const OWNER = "44444444-4444-4444-4444-444444444444";

const doc = {
  id: "p1",
  status: "images",
  cuts: [{ idx: 0 }, { idx: 1 }],
  images_error: "이미지 생성 실패 (429) rate limited",
  progress: { at: 1_700_000_000_000, phase: "images", done: 1, total: 2 },
};

describe("부분 읽기가 실패와 진척을 싣는다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProject(doc, OWNER);
  });

  it("컷 상태에 images_error 가 있다", async () => {
    const st = await memoryStore.selectProjectCuts("p1", OWNER);
    expect(st.images_error).toBe("이미지 생성 실패 (429) rate limited");
  });

  it("컷 상태에 progress 가 있다", async () => {
    const st = await memoryStore.selectProjectCuts("p1", OWNER);
    expect(st.progress).toEqual({ at: 1_700_000_000_000, phase: "images", done: 1, total: 2 });
  });

  it("진행 상태와 합성 상태에도 progress 가 있다", async () => {
    expect((await memoryStore.selectProjectProgress("p1", OWNER)).progress.phase).toBe("images");
    expect((await memoryStore.selectProjectRender("p1", OWNER)).progress.phase).toBe("images");
  });

  it("progress 가 없는 옛 문서는 null 이다 — 없는 것과 0 은 다르다", async () => {
    resetMemoryStore();
    await memoryStore.insertProject({ id: "old", status: "images", cuts: [] }, OWNER);
    expect((await memoryStore.selectProjectCuts("old", OWNER)).progress).toBeNull();
    expect((await memoryStore.selectProjectProgress("old", OWNER)).progress).toBeNull();
  });

  it("남의 것은 여전히 null 이다", async () => {
    expect(await memoryStore.selectProjectCuts("p1", "55555555-5555-5555-5555-555555555555")).toBeNull();
  });

  // supabase 쪽은 라이브 없이 호출할 수 없으므로 select 문자열을 소스에서 읽어 확인한다.
  // (tests/store-supabase-rows.test.js 가 쓰는 것과 같은 수법이다.)
  it("supabase 구현도 같은 필드를 뽑는다", () => {
    const src = readFileSync("lib/store/supabase.js", "utf8");
    const cuts = src.slice(src.indexOf("async selectProjectCuts"), src.indexOf("async listProjects"));
    expect(cuts, "selectProjectCuts 가 images_error 를 안 뽑는다").toMatch(/images_error/);
    expect(cuts, "selectProjectCuts 가 progress 를 안 뽑는다").toMatch(/progress/);

    const prog = src.slice(src.indexOf("async selectProjectProgress"), src.indexOf("async selectProjectRender"));
    expect(prog).toMatch(/progress/);

    const render = src.slice(src.indexOf("async selectProjectRender"), src.indexOf("async selectProjectCuts"));
    expect(render).toMatch(/progress/);
  });
});
