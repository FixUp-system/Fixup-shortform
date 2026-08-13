// 자동 관통(lib/auto.js)과 그 재료(추출 루프)의 계약 테스트.
// 스토어는 vitest.setup.js 가 SHOTFORM_STORE=memory 로 세운다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { extractBriefing } from "../lib/briefing-extract.js";
import { generateScript } from "../lib/script-gen.js";
import { runAutoPipeline } from "../lib/auto.js";
import * as projects from "../lib/projects.js";
import { chargeVideo, balanceFor, alreadyChargedVideo } from "../lib/charges.js";
import { VIDEO_PRICE } from "../lib/pricing.js";

// validateBriefing 스키마를 통과하는 최소 형태 — briefing.test.js 의 실물과 같은 키
const RAW_BRIEFING = {
  topic: "딸기라떼 신메뉴",
  key_points: ["국산 딸기 사용", "이번 주 출시"],
  questions: [],
};

describe("extractBriefing", () => {
  beforeEach(() => resetMemoryStore());

  it("LLM 응답이 검증을 통과하면 브리핑을 돌려준다", async () => {
    // 실물 프로젝트는 항상 photos 배열을 가진다(lib/projects.js 의 기본값) — 픽스처도 그에 맞춘다
    const project = { id: "p1", material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] } };
    const briefing = await extractBriefing(project, { llm: async () => RAW_BRIEFING });
    expect(briefing).toBeTruthy();
    expect(briefing.topic).toBe("딸기라떼 신메뉴");
  });

  it("첫 호출이 죽으면 한 번 더 부르고, 두 번째가 성공하면 그것을 쓴다", async () => {
    let calls = 0;
    const llm = async () => {
      calls += 1;
      if (calls === 1) throw new Error("일시 실패");
      return RAW_BRIEFING;
    };
    const project = { id: "p1", material: { text: "자료", photos: [] } };
    const briefing = await extractBriefing(project, { llm });
    expect(calls).toBe(2);
    expect(briefing).toBeTruthy();
  });

  it("두 번 다 실패하면 null — 던지지 않는다(응답 코드는 부르는 쪽의 일)", async () => {
    const llm = async () => { throw new Error("죽음"); };
    const briefing = await extractBriefing({ id: "p1", material: { text: "자료", photos: [] } }, { llm });
    expect(briefing).toBeNull();
  });
});

// validateScript 를 통과하는 최소 형태 — 검증기가 읽는 키는 `script` 다(lib/validate.js:7).
// 돌려주는 것은 { text } 이므로 픽스처(LLM 원응답)와 결과의 키가 다르다.
const RAW_SCRIPT = { script: "국산 딸기를 쓴 딸기라떼가 이번 주에 나옵니다. 매장에서 만나 보세요." };

const PROJECT = {
  id: "p1",
  // 실물 프로젝트는 항상 photos 배열을 가진다(lib/projects.js 의 기본값) — 픽스처도 그에 맞춘다
  material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] },
  briefing: { topic: "딸기라떼", key_points: ["국산 딸기"], confirmed: true, version: 1 },
  settings: { target_seconds: 15 },
};

describe("generateScript", () => {
  it("초안이 검증을 통과하면 대본을 돌려준다", async () => {
    const script = await generateScript(PROJECT, "p1", { llm: async () => RAW_SCRIPT });
    expect(script).toBeTruthy();
    expect(typeof script.text).toBe("string");
  });

  it("모든 시도가 실패하면 null", async () => {
    const script = await generateScript(PROJECT, "p1", {
      llm: async () => { throw new Error("죽음"); },
    });
    expect(script).toBeNull();
  });
});

const OWNER = "00000000-0000-4000-8000-000000000001";

async function makeProject() {
  return projects.createProject({
    ownerId: OWNER,
    settings: { aspect_ratio: "9:16", target_seconds: 15 },
    material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] },
  });
}

// 성공 경로에서 파이프라인 단계가 프로젝트에 남기는 최소 흔적을 흉내 낸다.
// 스토어를 실제로 거친다 — deps 는 "무엇을 불렀나"와 "무엇을 남겼나"를 함께 검증한다.
function happyDeps(calls) {
  const mark = (name, patch) => async (id, ownerId) => {
    calls.push(name);
    if (patch) await projects.updateProject(id, ownerId, patch);
  };
  return {
    extractBriefing: async () => { calls.push("briefing"); return { topic: "딸기라떼", key_points: [], questions: [] }; },
    generateScript: async () => { calls.push("script"); return { text: "문장 하나." }; },
    runSplitPipeline: mark("split", (p) => ({ ...p, status: "cuts",
      cuts: [{ idx: 0, sentence: "문장 하나.", seconds: 3, state: "pending", regen_count: 0 }] })),
    runVoicePipeline: mark("voice", (p) => ({ ...p, status: "voice",
      cuts: p.cuts.map((c) => ({ ...c, audio: { url: "a0", seconds: 3 }, seconds: 3 })) })),
    runImagesPipeline: mark("images", (p) => ({ ...p, status: "images",
      cuts: p.cuts.map((c) => ({ ...c, state: "done", image: { url: "i0" } })) })),
    runVideoPipeline: mark("clips", (p) => ({ ...p, status: "video",
      cuts: p.cuts.map((c) => ({ ...c, video: { url: "v0", seconds: 3 } })) })),
    runRenderPipeline: mark("render", (p) => ({ ...p, status: "done", render: { url: "/r.mp4" } })),
    regenVoice: async () => calls.push("regenVoice"),
    regenCut: async () => calls.push("regenCut"),
    regenClip: async () => calls.push("regenClip"),
  };
}

describe("runAutoPipeline", () => {
  beforeEach(() => resetMemoryStore());

  it("단계를 순서대로 관통하고 auto.state=done 을 남긴다", async () => {
    const p = await makeProject();
    const calls = [];
    await runAutoPipeline(p.id, OWNER, happyDeps(calls));
    expect(calls).toEqual(["briefing", "script", "split", "voice", "images", "clips", "render"]);
    const done = await projects.getProject(p.id, OWNER);
    expect(done.auto).toEqual({ stage: "render", state: "done", error: null });
    expect(done.briefing.confirmed).toBe(true);   // 자동 확정
    expect(done.script.version).toBe(1);
    expect(done.status).toBe("done");
  });

  it("실패 컷은 해당 regen 을 1회만 부르고 강행한다", async () => {
    const p = await makeProject();
    const calls = [];
    const deps = happyDeps(calls);
    // 목소리 단계가 컷 하나를 voice_error 로 남긴다 — regenVoice 가 정확히 1회 불려야 한다
    deps.runVoicePipeline = async (id, ownerId) => {
      calls.push("voice");
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "voice",
        cuts: proj.cuts.map((c) => ({ ...c, voice_error: "읽지 못했어요" })) }));
    };
    await runAutoPipeline(p.id, OWNER, deps);
    expect(calls.filter((c) => c === "regenVoice")).toHaveLength(1);
    const done = await projects.getProject(p.id, OWNER);
    expect(done.auto.state).toBe("done"); // 재시도가 실패해도(스텁이라 상태 그대로) 멈추지 않는다
  });

  it("브리핑 추출이 끝내 실패하면 auto.state=failed 를 남기고 던진다", async () => {
    const p = await makeProject();
    const deps = happyDeps([]);
    deps.extractBriefing = async () => null;
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    const failed = await projects.getProject(p.id, OWNER);
    expect(failed.auto.state).toBe("failed");
    expect(failed.auto.error).toBeTruthy();
  });

  it("클립이 하나도 없으면 합성 없이 failed — 빈 완성본을 만들지 않는다", async () => {
    const p = await makeProject();
    const calls = [];
    const deps = happyDeps(calls);
    deps.runVideoPipeline = async (id, ownerId) => {
      calls.push("clips");
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "video",
        cuts: proj.cuts.map((c) => ({ ...c, video_error: "만들지 못했어요" })) }));
    };
    deps.regenClip = async () => calls.push("regenClip"); // 재시도도 실패(상태 그대로)
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    expect(calls).not.toContain("render");
    expect((await projects.getProject(p.id, OWNER)).auto.state).toBe("failed");
  });

  it("컷 분할이 빈 컷을 남기면 failed", async () => {
    const p = await makeProject();
    const deps = happyDeps([]);
    deps.runSplitPipeline = async (id, ownerId) => {
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "cuts", cuts: [] }));
    };
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    expect((await projects.getProject(p.id, OWNER)).auto.state).toBe("failed");
  });
});

// 완성본을 못 준 값은 되돌린다 — 장부에 음수 행으로 남는다.
// (청구는 auto 라우트가 시작 전에 한다. 여기서는 lib/charges.js 로 직접 심어
//  "실패가 환불을 부르는가"만 본다.)
describe("자동 관통 실패는 환불한다", () => {
  beforeEach(() => resetMemoryStore());

  it("실패하면 받은 정가를 되돌린다", async () => {
    const p = await makeProject();
    await chargeVideo({ userId: OWNER, projectId: p.id, seconds: 15 });
    // 자동 관통은 모델을 안 넘긴다 → 정가는 레거시(Kling) 표에서 나온다
    expect(await balanceFor(OWNER)).toBe(-VIDEO_PRICE["kling-v3"]["720p"][15]);

    const deps = happyDeps([]);
    deps.extractBriefing = async () => null;
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();

    expect(await balanceFor(OWNER)).toBe(0);
    expect(await alreadyChargedVideo(p.id)).toBe(false);
  });

  it("성공하면 되돌리지 않는다", async () => {
    const p = await makeProject();
    await chargeVideo({ userId: OWNER, projectId: p.id, seconds: 15 });
    await runAutoPipeline(p.id, OWNER, happyDeps([]));
    expect(await balanceFor(OWNER)).toBe(-VIDEO_PRICE["kling-v3"]["720p"][15]);
    expect(await alreadyChargedVideo(p.id)).toBe(true);
  });

  it("청구가 없었으면(가짜 모드) 환불도 조용히 지나간다", async () => {
    const p = await makeProject();
    const deps = happyDeps([]);
    deps.extractBriefing = async () => null;
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    expect(await balanceFor(OWNER)).toBe(0);
  });
});
