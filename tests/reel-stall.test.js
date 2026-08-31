// ⑤영상이 **"멈춘 것 같아요"를 가른다** (2026-08-27, OUTSTANDING §2① 의 남은 것).
//
// 뿌리 — reel 의 상태 라우트는 `progress`·`stalled_for_ms` 를 안 실었다. 그래서 화면은
// "돌고 있다"와 "2분째 아무 일도 없다"를 같은 말로 했다(둘 다 스피너 + "만드는 중").
// 단계별 흐름은 그것을 lib/progress.js 의 `generationState` 하나로 가른다 — reel 도
// **같은 자**를 쓴다(뜻만 같은 판정을 또 두면 조용히 갈린다).
//
// ★ 다만 **세는 단위가 갈래마다 다르다.** 통짜(oneshot)는 컷이 열둘이어도 굽는 것이
//   한 편이라 total 이 1 이다 — 컷 수로 세면 "1/12 만드는 중"에서 영원히 멈춘 것처럼
//   보인다(통짜는 첫 컷에만 영상을 담고 나머지 컷의 옛 클립은 걷어내기 때문이다).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, updateProject, getProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { reelBakeCounts } from "../lib/reel/oneshot.js";
import { STALL_MS } from "../lib/progress.js";

const OWNER = "77777777-7777-7777-7777-777777777777";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = () => new Request("http://x/api", { headers: AUTH });
const post = () => new Request("http://x/api", { method: "POST", headers: AUTH });

const sheet = "https://x/sheet.png";
const cut = (idx, extra = {}) => ({
  idx,
  clip_prompt: `body${idx}`,
  seconds: 4,
  image: { url: `https://x/c${idx}.png`, sheet },
  ...extra,
});

describe("reelBakeCounts — 갈래마다 세는 단위가 다르다", () => {
  const oneShotDoc = (cuts) => ({
    settings: { target_seconds: 15, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
    scenario: { text: "a kettle boils" },
    cuts,
  });

  it("통짜는 컷이 여럿이어도 한 편이 하나다", () => {
    const counts = reelBakeCounts(oneShotDoc([cut(0), cut(1), cut(2)]));
    expect(counts.total).toBe(1);
    expect(counts.done).toBe(0);
  });

  it("통짜는 첫 컷에 영상이 담기면 끝난 것이다", () => {
    const cuts = [cut(0, { video: { url: "https://x/v.mp4", whole: true } }), cut(1), cut(2)];
    expect(reelBakeCounts(oneShotDoc(cuts))).toEqual({ done: 1, total: 1 });
  });

  it("컷별은 컷 수로 세고, 구운 컷만 끝난 것이다", () => {
    // 60초는 한 번에 못 굽는 길이라 컷별로 떨어진다(planReelBake).
    const doc = {
      settings: { target_seconds: 60, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      cuts: [cut(0, { video: { url: "https://x/v0.mp4" } }), cut(1), cut(2)],
    };
    expect(reelBakeCounts(doc)).toEqual({ done: 1, total: 3 });
  });

  it("화면이 준 최신 컷으로 셀 수 있다 — 문서보다 상태 라우트가 앞선다", () => {
    const doc = { settings: { target_seconds: 60 }, cuts: [cut(0), cut(1)] };
    const live = [cut(0, { video: { url: "https://x/v0.mp4" } }), cut(1)];
    expect(reelBakeCounts(doc, live)).toEqual({ done: 1, total: 2 });
  });

  it("컷이 없으면 total 0 이다 — 0 이면 generationState 가 idle 로 받는다", () => {
    expect(reelBakeCounts({ settings: {}, cuts: [] })).toEqual({ done: 0, total: 0 });
  });
});

describe("reel 상태 라우트가 심장박동을 실어 보낸다", () => {
  let id;
  let GET;
  beforeEach(async () => {
    resetMemoryStore();
    GET = (await import("../app/api/reel/[id]/status/route.js")).GET;
    const p = await createProject({ ownerId: OWNER, settings: {} });
    id = p.id;
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      kind: "reel",
      cuts: [cut(0), cut(1)],
      reel: { status: "rendering", error: null },
      progress: { at: Date.now() - 5000, phase: "video", done: 1, total: 2 },
    }));
  });

  it("progress 와 stalled_for_ms 를 싣는다", async () => {
    const body = await (await GET(req(), { params: Promise.resolve({ id }) })).json();
    expect(body.stalled_for_ms).toBeGreaterThanOrEqual(5000);
    // 위아래로 조인다 — 아래만 보면 상수를 박아 넣어도 통과한다.
    expect(body.stalled_for_ms).toBeLessThan(60_000);
    expect(body.progress.phase).toBe("video");
    expect(body.progress.done).toBe(1);
    expect(body.progress.total).toBe(2);
  });

  it("★ 원래 싣던 것을 그대로 싣는다 — 필드가 조용히 사라지는 것이 원래의 버그였다", async () => {
    const body = await (await GET(req(), { params: Promise.resolve({ id }) })).json();
    for (const key of ["status", "error", "cuts"]) expect(body).toHaveProperty(key);
    expect(body.cuts[0]).toHaveProperty("image");
    expect(body.cuts[0]).toHaveProperty("clip_prompt");
    expect(body.cuts[0]).toHaveProperty("video");
    expect(body.cuts[0]).toHaveProperty("stale");
  });

  it("심장박동이 없는 옛 프로젝트는 null 이다 — 0 이 아니다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {} });
    await updateProject(p.id, OWNER, (proj) => ({ ...proj, kind: "reel" }));
    const body = await (await GET(req(), { params: Promise.resolve({ id: p.id }) })).json();
    expect(body.stalled_for_ms).toBeNull();
    expect(body.progress).toBeNull();
  });
});

describe("굽기가 도는 동안 박동한다", () => {
  it("컷별 갈래 — 컷을 저장할 때마다 progress 가 함께 찍힌다", async () => {
    const { runReelClips } = await import("../lib/reel/pipeline.js");
    const doc = {
      id: "pid",
      settings: { target_seconds: 60, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      cuts: [cut(0), cut(1)],
    };
    await runReelClips("pid", "uid", {
      getProject: async () => doc,
      updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
      loadRefs: async () => ({ refs: [] }),
      makeClip: async () => ({ url: "https://x/v.mp4", seconds: 4 }),
    });
    expect(doc.progress.phase).toBe("video");
    expect(doc.progress.total).toBe(2);
    expect(doc.progress.done).toBe(2);
    expect(typeof doc.progress.at).toBe("number");
  });

  it("통짜 갈래 — **수거까지** 끝나면 1/1 이다", async () => {
    const { runReelOneShot, collectReelOneShot } = await import("../lib/reel/pipeline.js");
    const doc = {
      id: "pid",
      settings: { target_seconds: 15, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      scenario: { text: "a kettle boils" },
      cuts: [cut(0), cut(1), cut(2)],
    };
    await runReelOneShot("pid", "uid", {
      getProject: async () => doc,
      updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
      toFalUrl: async (u) => u,
      // ★ 2026-08-31 — 굽기가 **큐로** 갔다: 접수만 하고 돌아온다. 1/1 이 되는 것은
      //   수거가 결과를 꽂은 뒤다(lib/reel/pipeline.js 의 collectReelOneShot).
      submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }),
    });
    await collectReelOneShot("pid", "uid", {
      getProject: async () => doc,
      updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
      collectClip: async () => ({ done: true, url: "https://x/whole.mp4", seconds: 15 }),
    });
    expect(doc.progress.phase).toBe("video");
    expect(doc.progress.total).toBe(1);
    expect(doc.progress.done).toBe(1);
  });

  it("★ 굽는 동안 **수거 시도**가 살아 있음을 갱신한다 — 임계보다 오래 걸려도 안 죽는다", async () => {
    // ★★ 2026-08-31 — 통짜가 큐로 가면서 **그 자리에서 기다리는 프로세스가 사라졌다.**
    //   예전에는 굽는 동안 시계로 박동을 찍었는데, 이제 기다리는 것은 화면이다 —
    //   상태 조회가 두드릴 때마다 수거를 시도하고, 아직이면 그 자리에서 진척을 갱신한다.
    //   이 갱신이 없으면 정상으로 굽는 중인 편이 2분 뒤 "멈췄어요"가 된다(STALL_MS).
    const { runReelOneShot, collectReelOneShot } = await import("../lib/reel/pipeline.js");
    const doc = {
      id: "pid",
      settings: { target_seconds: 15, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      scenario: { text: "a kettle boils" },
      cuts: [cut(0), cut(1), cut(2)],
    };
    const deps = {
      getProject: async () => doc,
      updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
      toFalUrl: async (u) => u,
    };
    await runReelOneShot("pid", "uid", {
      ...deps,
      submitClip: async () => ({ requestId: "req-1", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15 }),
    });
    expect(doc.progress, "접수할 때 한 번 찍어야 한다").toBeTruthy();
    const first = doc.progress.at;
    await new Promise((r) => setTimeout(r, 5));
    await collectReelOneShot("pid", "uid", { ...deps, collectClip: async () => ({ done: false }) });
    expect(doc.progress.at, "수거 시도가 진척을 안 갱신했다").toBeGreaterThan(first);
    expect(doc.reel.job, "아직인데 접수증이 지워졌다").toBeTruthy();
  });
});

describe("굽기 문 — 잠금이 저절로 낡는다", () => {
  let id;
  let POST;
  // ★ 가짜 모드로 돈다 — 이 판이 재는 것은 **문이 열리고 닫히는가**지 청구가 아니다.
  //   안 켜면 크레딧 게이트가 먼저 402 로 답해 문 판정에 닿지도 못한다.
  beforeEach(async () => {
    process.env.SHOTFORM_FAKE = "fal";
    resetMemoryStore();
    POST = (await import("../app/api/reel/[id]/clips/route.js")).POST;
    const p = await createProject({ ownerId: OWNER, settings: {} });
    id = p.id;
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      kind: "reel",
      settings: { target_seconds: 15, i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      scenario: { text: "a kettle boils" },
      cuts: [cut(0), cut(1), cut(2)],
      reel: { status: "draft", error: null },
    }));
  });
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("접수하면 그 자리에서 심장박동을 한 번 찍는다 — 첫 박동을 기다리면 그 틈에 두 번 눌린다", async () => {
    const res = await POST(post(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const p = await getProject(id, OWNER);
    expect(p.progress?.phase).toBe("video");
    expect(typeof p.progress?.at).toBe("number");
  });

  it("박동이 살아 있는 동안에는 두 번째 누름을 막는다 (409)", async () => {
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      reel: { status: "rendering", error: null },
      progress: { at: Date.now(), phase: "video", done: 0, total: 1 },
    }));
    const res = await POST(post(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
  });

  it("★ 박동이 임계만큼 멎으면 다시 누를 수 있다 — 얼어붙은 실행에 사장님이 갇히지 않는다", async () => {
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      reel: { status: "rendering", error: null },
      progress: { at: Date.now() - STALL_MS - 1000, phase: "video", done: 0, total: 1 },
    }));
    const res = await POST(post(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
  });

  it("심장박동을 모르는 옛 문서는 막지 않는다 — 판정할 근거가 없으면 갇히는 쪽이 더 나쁘다", async () => {
    await updateProject(id, OWNER, (proj) => ({ ...proj, reel: { status: "rendering", error: null } }));
    const res = await POST(post(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
  });
});

describe("⑤영상 화면이 같은 자를 쓴다", () => {
  const src = readFileSync(new URL("../app/reel/[id]/video/page.js", import.meta.url), "utf8");

  it("generationState 로 가른다 — 화면이 스스로 재지 않는다", () => {
    expect(src).toContain("generationState");
    expect(src).toContain('stepPhase: "video"');
    expect(src).toContain("stalled_for_ms");
  });

  it("멈춤을 다른 말로 말한다", () => {
    expect(src).toContain('gen.kind === "stalled"');
    expect(src).toContain("진행이 없어요");
  });

  it("세는 것은 reelBakeCounts 하나다 — 통짜에서 컷 수로 세면 거짓말이 된다", () => {
    expect(src).toContain("reelBakeCounts");
  });

  it("멈춘 시간은 서버가 잰 값을 쓴다 — 브라우저가 자기 시계로 빼면 안 된다", () => {
    expect(src).not.toMatch(/Date\.now\(\)\s*-\s*\w*[Pp]rogress/);
  });
});
