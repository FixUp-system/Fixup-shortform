import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { isAudioStale, isImageStale, isClipStale, isRenderStale } from "../lib/steps.js";
import { splitUnits } from "../lib/cuts.js";

const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

let projects, pipeline;

function deps({ failCut } = {}) {
  return {
    splitCuts: async () => [
      { idx: 0, sentence: "AI컷", seconds: 6, source: "ai", regen_count: 0 },
      { idx: 1, sentence: "사진컷", seconds: 8, source: "photo", photo_id: "p1", regen_count: 0 },
    ],
    genImage: async ({ prompt }) => ({ url: "http://img/" + Math.random() }),
    select: async ({ cut }) =>
      cut.idx === failCut ? { selectedIndex: 0, passed: false, note: "불합격" } : { selectedIndex: 0, passed: true, note: "ok" },
  };
}

beforeEach(async () => {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  projects = await import("../lib/projects.js?t=" + Date.now());
  pipeline = await import("../lib/pipeline.js?t=" + Date.now());
  llmMock.callJson.mockReset();
});

async function makeProject() {
  return projects.createProject({
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg", url: "/api/uploads/a.jpg" }] },
  });
}

// 분할과 이미지가 갈라지기 전에는 한 함수였다. 갈라져도 이어 부르면 결과가 같아야 하므로,
// 그 시절 단언들은 이 헬퍼를 거쳐 그대로 살아 있다.
const runBoth = async (id, d) => {
  await pipeline.runSplitPipeline(id, d);
  await pipeline.runImagesPipeline(id, d);
};

// 주입 deps가 전부 우회하는 자리 — buildCutsMessages와 validateCuts(obj, scenes)가
// 실제로 맞물리는 유일한 지점이라 여기만 직접 부른다.
describe("defaultDeps.splitCuts — 두 패스", () => {
  const SCRIPT = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다. 성수역에서 2분입니다.";
  // 실제로 저장된 프로젝트를 쓴다 — splitCuts 가 캐스팅 결과를 프로젝트에 남기기 때문이다.
  // 껍데기 객체로는 그 저장이 갈 곳이 없다.
  async function saved() {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg" }] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj,
      briefing: { topic: "생딸기라떼" },
      script: { text: SCRIPT },
    }));
  }
  const ranges = { cuts: [{ from: 1, to: 2 }, { from: 3, to: 3 }] };
  const noCast = { cast: [] };
  // 화면 설계는 사진을 고르지 않는다 — 사진은 props 로 온다
  const shots = { shots: [{ shows: "딸기를 가는 손 클로즈업" }, { shows: "골목을 걷는 시점 샷" }] };

  it("경계로 자른 컷에 화면을 붙여 돌려준다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(await saved());
    expect(cuts).toHaveLength(2);
    // 텍스트는 코드가 원고에서 자른다 — 모델이 문장을 다시 쓰지 못한다
    expect(cuts[0].sentence).toBe("매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.");
    expect(cuts[1].sentence).toBe("성수역에서 2분입니다.");
    expect(cuts[0].shows).toBe("딸기를 가는 손 클로즈업");
    expect(cuts[0].ref_ids).toBeUndefined();   // 화면 설계는 사진을 고르지 않는다
    expect(cuts[1].ref_ids).toBeUndefined();
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].seconds).toBeGreaterThan(1);
  });

  it("컷을 이어붙이면 원고와 같다 — 승인한 문장이 글자 그대로 살아남는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots).mockResolvedValueOnce(noCast);
    const cuts = await pipeline.defaultDeps.splitCuts(await saved());
    const joined = cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "");
    expect(joined).toBe(SCRIPT.replace(/\s/g, ""));
  });

  it("화면에서 뽑은 인물이 프로젝트에 남고, 코드가 컷에 꽂는다", async () => {
    const p = await saved();
    // 순서가 요점이다 — 화면 설계가 먼저 돌고, 캐스팅은 그 화면을 읽는다
    llmMock.callJson
      .mockResolvedValueOnce(ranges)
      .mockResolvedValueOnce(shots)
      .mockResolvedValueOnce({ cast: [{ who: "10세 전후 남자아이", cuts: [1] }] });
    const cuts = await pipeline.defaultDeps.splitCuts(p);
    const after = await projects.getProject(p.id);
    expect(after.cast).toEqual([{ id: "c1", who: "10세 전후 남자아이", cuts: [0] }]);
    // 인물 id 를 컷에 꽂는 것은 모델이 아니라 코드다 — 이것이 인물 일관성의 전부다
    expect(cuts[0].ref_ids).toEqual(["c1"]);   // 인물만 꽂힌다
    expect(cuts[1].ref_ids).toBeUndefined();
  });

  it("화면 패스가 실패해도 컷은 남는다 — 그림은 문장으로 폴백한다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValue({ shots: [] }); // 개수 불일치
    const cuts = await pipeline.defaultDeps.splitCuts(await saved());
    expect(cuts).toHaveLength(2);
    expect(cuts[0].shows).toBeUndefined();
  });

  it("경계를 못 받으면 한 문장에 한 컷으로 떨어진다 — 대본은 살아 있다", async () => {
    // 빈틈이 있는 경계(2번 문장을 건너뜀)는 거절된다
    llmMock.callJson.mockResolvedValue({ cuts: [{ from: 1, to: 1 }, { from: 3, to: 3 }] });
    const cuts = await pipeline.defaultDeps.splitCuts(await saved());
    expect(cuts).toHaveLength(3);
    expect(cuts[1].sentence).toBe("시럽은 쓰지 않습니다.");
  });

  it("원고가 없으면 컷 분할 실패를 던진다", async () => {
    await expect(pipeline.defaultDeps.splitCuts({ ...(await saved()), script: null })).rejects.toThrow("컷 분할 실패");
  });
});

describe("분할과 이미지가 갈라져 있다", () => {
  it("runSplitPipeline 은 컷만 만들고 이미지는 부르지 않는다", async () => {
    let imageCalls = 0;
    const d = { ...deps(), genImage: async () => { imageCalls++; return { url: "http://img/x" }; } };
    const p = await makeProject();

    await pipeline.runSplitPipeline(p.id, d);

    const after = await projects.getProject(p.id);
    expect(after.status).toBe("cuts");
    expect(after.cuts.length).toBeGreaterThan(0);
    expect(after.cuts.every((c) => c.state === "pending")).toBe(true);
    expect(imageCalls).toBe(0); // 목소리가 먼저다 — 아직 그림 값을 치르지 않는다
  });

  it("runImagesPipeline 은 이미 있는 컷에 그림을 붙이고 status 를 images 로 올린다", async () => {
    const d = {
      ...deps(),
      splitCuts: async () => { throw new Error("분할을 다시 부르면 안 된다"); },
    };
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      status: "voice",
      cuts: [{ idx: 0, sentence: "첫 문장입니다.", seconds: 3, state: "pending", regen_count: 0, source: "ai" }],
    }));

    await pipeline.runImagesPipeline(p.id, d);

    const after = await projects.getProject(p.id);
    expect(after.status).toBe("images");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
  });
});

describe("분할 → 이미지 (이어 부르면 갈라지기 전과 같다)", () => {
  it("정상 흐름: ai 컷은 이미지·검수, photo 컷은 즉시 done", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    const after = await projects.getProject(p.id);
    expect(after.status).toBe("images");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
    expect(after.cuts[1].state).toBe("done");
    expect(after.cuts[1].image).toBeUndefined(); // 사진 컷은 원본 사용
  });

  it("전원 탈락 컷은 자동 보정 후에도 실패하면 needs_attention — 다른 컷은 정상(실패 격리)", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps({ failCut: 0 }));
    const after = await projects.getProject(p.id);
    expect(after.cuts[0].state).toBe("needs_attention");
    expect(after.cuts[1].state).toBe("done");
  });

  it("검수에 그 컷의 화면을 함께 넘긴다(그림과 심사가 같은 기준을 보게)", async () => {
    const p = await makeProject();
    const seen = [];
    const capturing = {
      ...deps(),
      splitCuts: async () => [{ idx: 0, sentence: "AI컷", shows: "딸기라떼 클로즈업", seconds: 6, source: "ai", regen_count: 0 }],
      select: async ({ scene }) => { seen.push(scene); return { selectedIndex: 0, passed: true, note: "ok" }; },
    };
    await runBoth(p.id,capturing);
    expect(seen[0]?.shows).toBe("딸기라떼 클로즈업");
  });

  it("구성 시절 컷은 장면의 화면으로 검수한다 — 옛 프로젝트를 버리지 않는다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      synopsis: { angle: "앵글", scenes: [{ role: "여는말", shows: "옛 장면 화면", says: "요지", seconds: 5, facts: [] }] },
    }));
    const seen = [];
    const capturing = {
      ...deps(),
      splitCuts: async () => [{ idx: 0, scene_idx: 0, sentence: "옛 컷", seconds: 6, source: "ai", regen_count: 0 }],
      select: async ({ scene }) => { seen.push(scene); return { selectedIndex: 0, passed: true, note: "ok" }; },
    };
    await runBoth(p.id,capturing);
    expect(seen[0]?.shows).toBe("옛 장면 화면");
  });

  it("regenCut은 3회 제한", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await expect(pipeline.regenCut(p.id, 0, deps())).rejects.toThrow(/3회/);
  });

  it("regenCut instruction이 컷에 저장되고 이후 프롬프트에 실린다", async () => {
    const p = await makeProject();
    await runBoth(p.id,deps());
    const prompts = [];
    const capturing = { ...deps(), genImage: async ({ prompt }) => { prompts.push(prompt); return { url: "http://img/x" }; } };
    await pipeline.regenCut(p.id, 0, capturing, "딸기라떼가 보이게");
    const cut = (await projects.getProject(p.id)).cuts.find((c) => c.idx === 0);
    expect(cut.edit_instruction).toBe("딸기라떼가 보이게");
    expect(prompts.some((pr) => pr.includes("딸기라떼가 보이게"))).toBe(true);
  });

  it("그림에 무엇을 보고 그렸는지를 각인한다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());
    const saved = await projects.getProject(p.id);
    const ai = saved.cuts.find((c) => c.source === "ai");
    expect(ai.image.of).toBe(ai.shows || "");
    expect(isImageStale(ai)).toBe(false);
    // 화면 설명을 고치면 그 자리에서 낡는다
    expect(isImageStale({ ...ai, shows: "다른 화면" })).toBe(true);
  });
});

describe("이미지 생성에 레퍼런스가 배열로 간다", () => {
  it("컷이 고른 인물·사물이 refs 로 넘어간다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      status: "voice",
      cast: [{ id: "c1", who: "아이", ref: { from: "avatar", id: "av-child" } }],
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, state: "pending",
               shows: "아이가 자전거를 끄는 미디엄 샷", ref_ids: ["c1"], regen_count: 0 }],
    }));
    const seen = [];
    const d = {
      splitCuts: async () => { throw new Error("부르면 안 된다"); },
      genImage: async (args) => { seen.push(args.refs); return { url: "img" }; },
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    await pipeline.runImagesPipeline(p.id, d);
    // 아바타 파일이 없으면 refs 는 비어 있다 — 그래도 그림은 나온다
    expect(Array.isArray(seen[0])).toBe(true);
    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].image.url).toBe("img");
  });
});

describe("runVoicePipeline — 컷마다 따로 읽힌다", () => {
  async function withCuts(cuts) {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({ ...proj, status: "cuts", cuts, voice_id: "v1" }));
    return p;
  }

  it("컷마다 audio를 채우고 seconds를 실측으로 덮어쓴다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫 문장", seconds: 3, state: "done", image: { url: "i0" } },
      { idx: 1, sentence: "둘째 문장", seconds: 9, state: "done", image: { url: "i1" } },
    ]);

    await pipeline.runVoicePipeline(p.id, {
      speak: async ({ text }) => ({ url: "a/" + text, seconds: 4.3 }),
    });

    const saved = await projects.getProject(p.id);
    expect(saved.status).toBe("voice");
    expect(saved.cuts[0].audio).toEqual({ url: "a/첫 문장", seconds: 4.3, of: "첫 문장" });
    // 추정치 3초·9초가 실측 4.3초로 덮인다 — 소리와 그림이 어긋나지 않게
    expect(saved.cuts[0].seconds).toBe(4.3);
    expect(saved.cuts[1].seconds).toBe(4.3);
  });

  it("고른 목소리를 그대로 넘긴다", async () => {
    const p = await withCuts([{ idx: 0, sentence: "문장", seconds: 3 }]);
    let got;
    await pipeline.runVoicePipeline(p.id, {
      speak: async (args) => { got = args; return { url: "a", seconds: 1 }; },
    });
    expect(got.voiceId).toBe("v1");
  });

  it("한 컷이 실패해도 나머지는 살아남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "실패", seconds: 3 },
      { idx: 1, sentence: "성공", seconds: 3 },
    ]);

    await pipeline.runVoicePipeline(p.id, {
      speak: async ({ text }) => {
        if (text === "실패") throw new Error("고장");
        return { url: "a", seconds: 2 };
      },
    });

    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].voice_error).toMatch(/고장/);
    expect(saved.cuts[0].audio).toBeUndefined();
    expect(saved.cuts[1].audio.url).toBe("a");
    // 일부가 실패해도 단계는 넘어간다 — 사장님이 그 컷만 다시 만들 수 있어야 한다
    expect(saved.status).toBe("voice");
  });

  it("다시 만들면 앞선 실패 표시가 지워진다", async () => {
    const p = await withCuts([{ idx: 0, sentence: "문장", seconds: 3, voice_error: "지난번 실패" }]);
    await pipeline.runVoicePipeline(p.id, { speak: async () => ({ url: "a", seconds: 2 }) });
    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].voice_error).toBe(null);
  });

  it("소리에 읽은 문장을 각인한다 — 문장을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await pipeline.runVoicePipeline(p.id, { speak: async () => ({ url: "http://a", seconds: 5 }) });
    const cut = (await projects.getProject(p.id)).cuts[0];
    expect(cut.audio.of).toBe(cut.sentence);
    expect(isAudioStale(cut)).toBe(false);
    expect(isAudioStale({ ...cut, sentence: "고친 문장" })).toBe(true);
  });
});

describe("runVideoPipeline — 이미지를 클립으로", () => {
  async function withCuts(cuts) {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({ ...proj, status: "voice", cuts }));
    return p;
  }

  it("컷마다 클립을 만들고 잘린 컷을 표시한다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "짧은", seconds: 4, image: { url: "i0" }, audio: { url: "a0", seconds: 4 } },
      { idx: 1, sentence: "긴", seconds: 13, image: { url: "i1" }, audio: { url: "a1", seconds: 13 } },
    ]);

    await pipeline.runVideoPipeline(p.id, {
      clip: async ({ seconds }) => ({
        url: "v" + seconds, seconds: Math.min(seconds, 10), truncated: seconds > 10,
      }),
    });

    const saved = await projects.getProject(p.id);
    expect(saved.status).toBe("video");
    expect(saved.cuts[0].video).toEqual({ url: "v4", seconds: 4, truncated: false, of: "i0|4|" });
    expect(saved.cuts[1].video.truncated).toBe(true);
    // 소리 길이(13초)는 그대로 둔다 — 합성이 정지로 늘려 맞춘다
    expect(saved.cuts[1].seconds).toBe(13);
  });

  it("이미지와 비율을 그대로 넘긴다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "문장", seconds: 3, image: { url: "https://img/a.png" }, audio: { url: "a", seconds: 3 } },
    ]);
    let got;
    await pipeline.runVideoPipeline(p.id, {
      clip: async (args) => { got = args; return { url: "v", seconds: 3, truncated: false }; },
    });
    expect(got.imageUrl).toBe("https://img/a.png");
    expect(got.aspect_ratio).toBe("9:16");
  });

  it("한 컷이 실패해도 나머지는 살아남는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "실패", seconds: 3, image: { url: "i0" }, audio: { url: "a0", seconds: 3 } },
      { idx: 1, sentence: "성공", seconds: 3, image: { url: "i1" }, audio: { url: "a1", seconds: 3 } },
    ]);

    await pipeline.runVideoPipeline(p.id, {
      clip: async ({ imageUrl }) => {
        if (imageUrl === "i0") throw new Error("고장");
        return { url: "v", seconds: 3, truncated: false };
      },
    });

    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].video_error).toMatch(/고장/);
    expect(saved.cuts[1].video.url).toBe("v");
    expect(saved.status).toBe("video");
  });

  it("이미지가 없는 컷은 건너뛴다", async () => {
    // 이미지 단계에서 실패한 컷이 남아 있을 수 있다 — 없는 그림으로 클립을 부르면 안 된다
    const p = await withCuts([
      { idx: 0, sentence: "그림 없음", seconds: 3, audio: { url: "a0", seconds: 3 } },
    ]);
    let called = false;
    await pipeline.runVideoPipeline(p.id, {
      clip: async () => { called = true; return { url: "v", seconds: 3, truncated: false }; },
    });
    expect(called).toBe(false);
    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].video_error).toMatch(/이미지/);
  });

  it("클립에 그림·길이·움직임을 각인한다 — 소리를 다시 만들면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, image: { url: "http://img/" + c.idx } })),
    }));
    await pipeline.runVideoPipeline(p.id, {
      clip: async () => ({ url: "http://v", seconds: 6, truncated: false }),
    });
    const cut = (await projects.getProject(p.id)).cuts[0];
    expect(isClipStale(cut)).toBe(false);
    // 낭독을 다시 만들어 길이가 바뀐 상태
    expect(isClipStale({ ...cut, seconds: cut.seconds + 3 })).toBe(true);
  });
});

describe("runRenderPipeline — 하나로 합친다", () => {
  it("합성 결과를 render 에 담고 done 으로 넘긴다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    await pipeline.runRenderPipeline(p.id, {
      compose: async () => ({ url: "/api/renders/x.mp4", seconds: 4 }),
    });

    const saved = await projects.getProject(p.id);
    expect(saved.status).toBe("done");
    expect(saved.render.url).toBe("/api/renders/x.mp4");
    expect(saved.render.ts).toBeGreaterThan(0);
  });

  it("가짜 모드 표시를 그대로 옮긴다", async () => {
    // 화면이 "파일은 만들어지지 않았어요"를 띄우려면 이 값이 살아 있어야 한다
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    await pipeline.runRenderPipeline(p.id, {
      compose: async () => ({ url: null, seconds: 4, fake: true }),
    });

    const saved = await projects.getProject(p.id);
    expect(saved.render.fake).toBe(true);
    expect(saved.render.url).toBe(null);
  });

  it("고른 비율과 컷을 그대로 넘긴다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj, status: "video", settings: { aspect_ratio: "1:1" },
      cuts: [{ idx: 0, sentence: "문장", seconds: 4, video: { url: "v0" }, audio: { url: "a0", seconds: 4 } }],
    }));

    let got;
    await pipeline.runRenderPipeline(p.id, {
      compose: async (args) => { got = args; return { url: "u", seconds: 4 }; },
    });
    expect(got.aspect_ratio).toBe("1:1");
    expect(got.cuts).toHaveLength(1);
  });

  it("완성본에 컷별 소리·클립·문장을 각인한다 — 컷을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({
        ...c, audio: { url: "http://a" + c.idx, seconds: 5 }, video: { url: "http://v" + c.idx, seconds: 6 },
      })),
    }));
    await pipeline.runRenderPipeline(p.id, {
      compose: async () => ({ url: "http://out.mp4", seconds: 12 }),
    });
    const saved = await projects.getProject(p.id);
    expect(isRenderStale(saved)).toBe(false);
    const edited = { ...saved, cuts: [{ ...saved.cuts[0], sentence: "고친 문장" }, ...saved.cuts.slice(1)] };
    expect(isRenderStale(edited)).toBe(true);
  });
});

describe("사물 레퍼런스 — 캐스팅이 답하고 코드가 꽂는다", () => {
  // 자료에 사물 사진 하나. vision.person 이 false 라 인물 쪽으로 가지 않는다.
  async function projectWithThingPhoto(focusMode = "물건") {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "b.jpg", vision: { person: false, what: "화장품 병" } }] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj,
      briefing: { topic: "앰플", focus: { mode: focusMode, subject: "VT 앰플" } },
      script: { text: "앰플이 있습니다. 얼굴에 바릅니다." },
    }));
  }

  // 분할 → 화면 설계 → 캐스팅 순서로 응답을 준다
  function answer({ props }) {
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props });
  }

  it("사물이 보이는 컷에 사진을 꽂는다", async () => {
    const p = await projectWithThingPhoto();
    answer({ props: [{ photo_id: "p1", cuts: [1, 2] }] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(cuts[1].ref_ids).toEqual(["p1"]);
  });

  it("초점이 물건인데 사물이 0개면 한 번 더 묻는다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props: [] })            // 1차 — 빈손
      .mockResolvedValueOnce({ cast: [], props: [{ photo_id: "p1", cuts: [1] }] }); // 2차
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(llmMock.callJson).toHaveBeenCalledTimes(4); // 분할·화면·캐스팅 두 번
  });

  it("초점이 물건이 아니면 0개라도 다시 묻지 않는다 — 값을 치를 이유가 없다", async () => {
    const p = await projectWithThingPhoto("정보");
    answer({ props: [] });
    await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
  });

  it("재시도 2차에 인물이 빠져도 1차에서 뽑은 인물을 잃지 않는다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [{ who: "20대 여성", cuts: [1] }], props: [] })  // 1차 — 인물 있음, 제품 0개
      .mockResolvedValueOnce({ cast: [], props: [{ photo_id: "p1", cuts: [1] }] });   // 2차 — 인물 사라짐
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    const saved = await projects.getProject(p.id);
    expect(saved.cast).toHaveLength(1);            // 1차 인물이 살아 있다
    expect(cuts[0].ref_ids).toContain("p1");       // 2차 제품도 반영됐다
  });

  it("재시도 2차가 예외로 죽어도 1차 답을 지킨다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [{ who: "20대 여성", cuts: [1] }], props: [] })
      .mockRejectedValueOnce(new Error("네트워크"));
    await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect((await projects.getProject(p.id)).cast).toHaveLength(1);
  });
});

describe("사진 판정 실패는 저장하지 않는다 — 다음 실행이 다시 본다", () => {
  it("VLM 이 아무것도 알아내지 못한 판정(none)은 vision 을 저장하지 않는다", async () => {
    // 실제 파일이 없어 describePhoto 내부의 fs.readFile 이 실패해 none({person:false, what:""})을
    // 돌려준다 — 이것이 "실패한 판정"이다. 저장되면 다음 실행이 재판정하지 않고 사물로 굳는다.
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "c.jpg", url: "/api/uploads/c.jpg" }] },
    });
    const saved = await projects.updateProject(p.id, (proj) => ({
      ...proj,
      script: { text: "문장 하나입니다." },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "화면" }] })
      .mockResolvedValueOnce({ cast: [], props: [] });
    await pipeline.defaultDeps.splitCuts(saved);
    const after = await projects.getProject(p.id);
    expect(after.material.photos[0].vision).toBeUndefined();
  });

  it("성공한 판정({person:false, what:'화장품 병'})은 저장한다", async () => {
    // 사람이 아니라고 '알아낸' 것은 성공이다 — none 과 구분해야 한다
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "b.jpg", vision: { person: false, what: "화장품 병" } }] },
    });
    const saved = await projects.updateProject(p.id, (proj) => ({
      ...proj,
      script: { text: "문장 하나입니다." },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "화면" }] })
      .mockResolvedValueOnce({ cast: [], props: [] });
    await pipeline.defaultDeps.splitCuts(saved);
    const after = await projects.getProject(p.id);
    expect(after.material.photos[0].vision).toEqual({ person: false, what: "화장품 병" });
  });
});

describe("컷 길이 — 쪼갤 수 있는데 안 쪼갰으면 다시 묻는다", () => {
  // 8초를 넘는 컷이 있고 그 컷 안에 아직 안 쓴 후보가 남아 있으면 한 번 더 묻는다.
  // 후보가 없으면(쪼갤 수 없는 문장) 통과시킨다 — 영영 실패하지 않게.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  async function projectWithLongSentence() {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "앰플" }, script: { text: LONG },
    }));
  }

  const splitCallCount = () =>
    llmMock.callJson.mock.calls.filter((c) => c[0]?.stage === "컷 분할").length;

  it("쪼갤 수 있는데 한 컷에 다 몰아넣으면 한 번 더 묻는다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    expect(units.length, "이 문장이 여러 조각으로 나뉘어야 이 테스트가 의미가 있다").toBeGreaterThan(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })                    // 1차 — 통째로
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: units.length }] }) // 2차 — 나눔
      .mockResolvedValueOnce({ shots: [] })                                                 // 화면 설계
      .mockResolvedValueOnce({ cast: [] });                                                 // 캐스팅
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(splitCallCount()).toBe(2);
    expect(cuts.length).toBe(2);
  });

  it("쪼갤 수 없는 문장은 다시 묻지 않는다 — 영영 실패하지 않게", async () => {
    // 조각 하나로 이뤄진 컷은 8초를 넘어도 더 쪼갤 수 없다. 되물어도 답이 같다.
    const NO_BREAK = "아주아주아주긴한덩어리로이어져서끊을자리가전혀없는문장이길게이어지고또이어져서마침내끝납니다.";
    const p = await projects.createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: NO_BREAK },
    }));
    const units = splitUnits(NO_BREAK);
    expect(units.length, "이 문장은 나눌 자리가 없어야 한다").toBe(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].seconds, "이 컷은 8초를 넘는다 — 그런데도 되묻지 않아야 한다").toBeGreaterThan(8);
    expect(splitCallCount()).toBe(1);
  });
});
