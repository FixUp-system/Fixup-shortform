// ★ 이 파일은 두 가지를 막는다.
//  ① selectProjectCuts 가 images_error 를 빠뜨리던 버그(2026-08-14) — 이미지 실패가
//     화면까지 영영 도착하지 않았다.
//  ② memory·supabase 두 구현이 다른 모양을 돌려주는 것 — 한쪽만 고치면 테스트는 통과하고
//     프로덕션이 깨진다(lib/store/memory.js:64-67 주석).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

// 가짜 PostgREST — tests/store-supabase-rows.test.js 와 같은 수법이다. 체이닝을 그대로
// 기록해 두고, 응답은 테스트가 갈아 끼운다(빌더가 thenable 이라 then 을 단다).
const H = vi.hoisted(() => ({ calls: [], respond: () => ({ data: null, error: null }) }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table) {
      const state = { table };
      H.calls.push(state);
      const b = {
        select: (cols, opts) => ((state.select = { cols, opts }), b),
        eq: (c, v) => ((state.eq ||= []).push([c, v]), b),
        maybeSingle: () => ((state.single = true), b),
        then: (res, rej) => Promise.resolve(H.respond(state)).then(res, rej),
      };
      return b;
    },
  }),
}));

const { supabaseStore } = await import("../lib/store/supabase.js");

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
});

// supabase 쪽은 라이브 없이 부를 수 없으므로 가짜 클라이언트로 잰다. 소스에서 낱말만
// 찾는 검사로는 **연산자 바꿔치기를 못 잡는다** — 실제로 나가는 select 문자열과 실제로
// 돌아오는 반환 모양을 본다.
describe("supabase 구현도 같은 필드를 같은 연산자로 뽑는다", () => {
  beforeEach(() => {
    H.calls.length = 0;
    H.respond = () => ({ data: null, error: null });
  });

  // ★ `->` 와 `->>` 는 한 글자 차이인데 결과가 갈린다. `->>` 는 JSON 을 **문자열로 굳혀서**
  //   준다 — progress 를 그렇게 뽑으면 화면이 객체 대신 '{"at":...}' 문자열을 받고,
  //   `.phase` 가 undefined 가 되어 조용히 "판정 불가"로 떨어진다. 낱말만 보는 검사는
  //   금지형(`->>progress`)도 통과시키므로 별칭을 통째로 못 박고 금지형을 따로 부정한다.
  const pinsProgressAsObject = (cols) => {
    expect(cols, "progress 를 `->` 로 안 뽑는다").toContain("progress:doc->progress");
    expect(cols, "`->>` 로 뽑으면 객체가 문자열로 굳는다").not.toContain("->>progress");
  };

  it("selectProjectProgress", async () => {
    await supabaseStore.selectProjectProgress("p1", OWNER);
    pinsProgressAsObject(H.calls[0].select.cols);
  });

  it("selectProjectRender", async () => {
    await supabaseStore.selectProjectRender("p1", OWNER);
    pinsProgressAsObject(H.calls[0].select.cols);
  });

  it("selectProjectCuts 는 images_error 도 뽑는다 — 여기가 1-1 버그의 자리다", async () => {
    await supabaseStore.selectProjectCuts("p1", OWNER);
    const cols = H.calls[0].select.cols;
    pinsProgressAsObject(cols);
    // 이쪽은 문자열이라 `->>` 가 맞다(굳혀 줘야 한다).
    expect(cols, "selectProjectCuts 가 images_error 를 안 뽑는다").toContain(
      "images_error:doc->>images_error"
    );
  });

  // ★ 반환 모양을 memory 구현과 **직접 맞대어** 잰다. 눈으로 대조하면 언젠가 어긋나고,
  //   그 어긋남은 프로덕션에서만 드러난다(lib/store/memory.js:64-67 주석의 그 함정).
  it("세 함수의 반환이 memory 구현과 같은 모양이다", async () => {
    resetMemoryStore();
    await memoryStore.insertProject(doc, OWNER);

    // PostgREST 가 위 doc 을 상대로 각 select 에 돌려줄 행을 그대로 흉내 낸다.
    H.respond = () => ({
      data: {
        status: "images",
        kind: null,
        cuts_error: null,
        voice_error: null,
        images_error: doc.images_error,
        video_error: null,
        render_error: null,
        cut_count: doc.cuts,          // 배열이 통째로 온다 — 구현이 길이만 남긴다
        progress: doc.progress,
      },
      error: null,
    });
    expect(await supabaseStore.selectProjectProgress("p1", OWNER)).toEqual(
      await memoryStore.selectProjectProgress("p1", OWNER)
    );

    H.respond = () => ({
      data: { status: "images", kind: null, render: null, render_error: null, progress: doc.progress },
      error: null,
    });
    expect(await supabaseStore.selectProjectRender("p1", OWNER)).toEqual(
      await memoryStore.selectProjectRender("p1", OWNER)
    );

    H.respond = () => ({
      data: {
        status: "images",
        kind: null,
        cuts: doc.cuts,
        cuts_error: null,
        voice_error: null,
        video_error: null,
        images_error: doc.images_error,
        progress: doc.progress,
      },
      error: null,
    });
    const cuts = await supabaseStore.selectProjectCuts("p1", OWNER);
    expect(cuts).toEqual(await memoryStore.selectProjectCuts("p1", OWNER));
    // 위 toEqual 이 "둘 다 빠뜨렸다"로도 통과하는 허수아비가 아님을 못 박는다.
    expect(cuts.images_error).toBe(doc.images_error);
    expect(cuts.progress).toEqual(doc.progress);
  });
});
