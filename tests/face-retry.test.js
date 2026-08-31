// **초상 거절을 한 번은 우리가 받아낸다** (2026-08-31 사장님 결정 A).
//
// ★★★ 왜 예방이 아니라 재시도인가 — **거절은 0원이다.** 굽는 쪽은 만들기 전에 되돌리므로
//   fal 도 안 물리고, 우리 원장에도 안 남는다(`addRecord` 가 성공 뒤에 있다 —
//   lib/i2v.js:119·178. 실측: 거절난 프로젝트 둘 다 영상 원가 기록 0건).
//   그래서 **자연스럽게 먼저 써 보고 걸리면 낮추는** 순서가 값이 안 든다.
//
// ★★ 예방만 하면 무엇을 잃는가 — 같은 날 실측(57db7ad6)에서 성공한 편은 **다섯 장면이
//   전부 제품컷**이었다. 사람이 하나도 없었다. 얼굴을 무서워하면 광고가 그렇게 죽는다.
//   그래서 지문은 되는 쪽을 먼저 말하고(B), 그래도 걸리면 이 재시도가 받는다(A).
//
// ★ 고치는 자리가 **글이 아니라 그림**인 이유: 검사가 걸리는 것은 프롬프트가 아니라
//   `loc:["body","image_urls"]` — 우리가 그린 **스토리보드 판**이다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildStoryboardPrompt } from "../lib/reel/panels.js";
import { collectReelOneShot, retryOneShotWithoutFaces } from "../lib/reel/pipeline.js";
import { reelOf } from "../lib/reel/doc.js";

const RAW422 = '영상 생성 실패 (422) {"detail":[{"loc":["body","image_urls"],"msg":"The images or videos provided may contain likenesses of real people or other private information that cannot be processed.","type":"content_policy_violation"}]}';

const GRID = { rows: 2, cols: 2, canvas: "1:1" };

function makeProject(extra = {}) {
  return {
    id: "p1",
    settings: { target_seconds: 15, aspect_ratio: "9:16", resolution: "720p", i2v_model: "minimax-h3" },
    scenario: { text: "A 15-second commercial." },
    cuts: [0, 1, 2, 3].map((idx) => ({
      idx,
      shows: "a woman brings the spoon to her lips",
      image: { url: `old-${idx}`, sheet: idx === 0 ? "https://sheet.example/one.png" : undefined },
    })),
    ...extra,
  };
}

// 저장소 흉내 — updateProject(id, owner, fn) 이 문서를 실제로 갈아 끼운다.
function makeStore(project) {
  const box = { doc: project };
  return {
    box,
    getProject: async () => box.doc,
    updateProject: async (_id, _owner, fn) => { box.doc = fn(box.doc); return box.doc; },
  };
}

describe("판 지시문 — 얼굴을 낮추되 사람은 남긴다", () => {
  const cuts = makeProject().cuts;

  it("평소에는 이 줄이 아예 없다 — 예전과 글자 그대로다", () => {
    const out = buildStoryboardPrompt(makeProject(), cuts, GRID, "", []);
    expect(out).not.toMatch(/dominates a panel/);
  });

  it("★★ face_safe 를 켜면 얼굴을 낮추라고 말한다", () => {
    const out = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    expect(out).toMatch(/no face\s+dominates a panel/);
    expect(out).toMatch(/straight into the camera/);
  });

  it("★★★ **사람을 빼라고는 안 한다** — 그것이 애초에 막으려던 결과다", () => {
    const out = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    expect(out).toMatch(/Do not remove the people/);
    expect(out).toMatch(/product-only/);
  });

  it("★ 장면 설명은 한 글자도 안 바뀐다 — 카메라만 내린다", () => {
    const plain = buildStoryboardPrompt(makeProject(), cuts, GRID, "", []);
    const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    for (const c of cuts) expect(safe).toContain(c.shows);
    // 늘어난 것은 그 한 단락뿐이다.
    expect(safe.length).toBeGreaterThan(plain.length);
  });

  it("★ 사장님이 적은 note 자리를 뺏지 않는다 — 그 자리는 '사장님 말'로 나간다", () => {
    const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "숟가락을 은색으로", []);
    expect(safe).toMatch(/The client asked for this change/);
    expect(safe).toMatch(/숟가락을 은색으로/);
    // 시스템 지시가 사장님 말인 척 나가면 안 된다.
    expect(safe).not.toMatch(/The client asked for this change[^\n]*dominates/);
  });
});

describe("재시도 — 판을 다시 그리고 다시 굽는다", () => {
  const drawn = new Map([[0, { url: "new-0", of: "prompt2", sheet: "https://sheet.example/two.png", cell: 0 }]]);

  it("★★ 판을 다시 그리고 굽기를 다시 부른다", async () => {
    const store = makeStore(makeProject());
    const draw = vi.fn(async () => drawn);
    const rerun = vi.fn(async () => {});
    const r = await retryOneShotWithoutFaces("p1", "u1", {
      ...store, drawStoryboardSheet: draw, runReelOneShot: rerun,
    });
    expect(r.retried).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(rerun).toHaveBeenCalledTimes(1);
    expect(store.box.doc.cuts[0].image.url).toBe("new-0");
    // 안 그린 칸은 그대로 남는다 — 병합이지 대체가 아니다.
    expect(store.box.doc.cuts[1].image.url).toBe("old-1");
  });

  it("★★★ 표시는 **그리기 전에** 켜진다 — 동시에 들어온 둘째가 또 그리면 값이 두 번 나간다", async () => {
    const store = makeStore(makeProject());
    let flagWhenDrawing = null;
    await retryOneShotWithoutFaces("p1", "u1", {
      ...store,
      drawStoryboardSheet: async () => { flagWhenDrawing = reelOf(store.box.doc)?.face_safe; return drawn; },
      runReelOneShot: async () => {},
    });
    expect(flagWhenDrawing, "그리는 동안 잠금이 안 걸려 있었다").toBe(true);
  });

  it("★★ **한 번뿐이다** — 두 번째는 그리지 않는다", async () => {
    const store = makeStore(makeProject());
    const draw = vi.fn(async () => drawn);
    await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    const second = await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    expect(second.retried).toBe(false);
    expect(second.reason).toBe("already");
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("★ 통짜가 아니면 받아낼 것이 없다 — 컷별은 그 컷 하나만 죽는다", async () => {
    const store = makeStore(makeProject({ cuts: [{ idx: 0, image: { url: "x" } }] })); // sheet 가 없다
    const draw = vi.fn(async () => drawn);
    const r = await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    expect(r.retried).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });

  it("다시 그리다 실패하면 사유가 문서에 남는다 — 조용히 사라지지 않는다", async () => {
    const store = makeStore(makeProject());
    const r = await retryOneShotWithoutFaces("p1", "u1", {
      ...store,
      drawStoryboardSheet: async () => { throw new Error("그림 생성 실패 (500)"); },
      runReelOneShot: async () => {},
    });
    expect(r.retried).toBe(false);
    expect(reelOf(store.box.doc).error).toMatch(/500/);
    expect(reelOf(store.box.doc).imagesDrawing).toBe(false);
  });
});

describe("수거가 초상 거절을 재시도로 넘긴다", () => {
  const withJob = () => makeProject({ reel: { job: { requestId: "r1", of: "body", imageOf: "sheet" } } });

  it("★★★ 초상 거절이면 실패로 적지 않고 재시도로 넘긴다", async () => {
    const store = makeStore(withJob());
    const retry = vi.fn(async () => ({ retried: true }));
    const r = await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error(RAW422); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(r.retried).toBe(true);
    expect(reelOf(store.box.doc).status, "실패로 적어 버렸다").not.toBe("error");
  });

  it("★★ 다른 실패는 예전 그대로다 — 재시도를 안 부른다", async () => {
    const store = makeStore(withJob());
    const retry = vi.fn(async () => ({ retried: true }));
    await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error("영상 생성 실패 (500) upstream"); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(reelOf(store.box.doc).status).toBe("error");
  });

  it("★ 이미 한 번 낮춘 판이면 또 안 부른다 — 두 번째 거절은 사장님께 간다", async () => {
    const store = makeStore(makeProject({ reel: { face_safe: true, job: { requestId: "r1" } } }));
    const retry = vi.fn(async () => ({ retried: true }));
    await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error(RAW422); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(reelOf(store.box.doc).status).toBe("error");
  });
});

describe("배선 — 접수 때 거절도 같은 문으로 받는다", () => {
  // ★ 거절이 **접수** 때 올지 **수거** 때 올지 모른다(큐로 옮긴 뒤로는 응답 쪽이 유력하지만
  //   실측 표본이 없다). 두 자리 다 받아야 한 자리에서만 새지 않는다.
  it("★★ /clips 라우트가 초상 거절에서 재시도를 부른다", () => {
    const src = readFileSync("app/api/reel/[id]/clips/route.js", "utf8");
    expect(src).toMatch(/retryOneShotWithoutFaces/);
    expect(src).toMatch(/rejected_likeness/);
  });

  it("★★ 판 그리기의 집은 하나다 — 라우트와 재시도가 같은 함수를 쓴다", () => {
    const route = readFileSync("app/api/reel/[id]/images/route.js", "utf8");
    const pipe = readFileSync("lib/reel/pipeline.js", "utf8");
    expect(route, "라우트가 아직 손으로 그린다").toMatch(/drawStoryboardSheet/);
    expect(pipe, "재시도가 다른 길로 그린다").toMatch(/drawStoryboardSheet/);
  });
});
