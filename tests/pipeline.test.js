import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

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

// 주입 deps가 전부 우회하는 자리 — buildCutsMessages와 validateCuts(obj, scenes)가
// 실제로 맞물리는 유일한 지점이라 여기만 직접 부른다.
describe("defaultDeps.splitCuts — 두 패스", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg" }] },
    briefing: { topic: "생딸기라떼" },
    script: { text: "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다. 성수역에서 2분입니다." },
  };
  const ranges = { cuts: [{ from: 1, to: 2 }, { from: 3, to: 3 }] };
  const shots = { shots: [{ shows: "딸기를 가는 손 클로즈업", ref_photo_id: "p1" }, { shows: "골목을 걷는 시점 샷" }] };

  it("경계로 자른 컷에 화면을 붙여 돌려준다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots);
    const cuts = await pipeline.defaultDeps.splitCuts(project);
    expect(cuts).toHaveLength(2);
    // 텍스트는 코드가 원고에서 자른다 — 모델이 문장을 다시 쓰지 못한다
    expect(cuts[0].sentence).toBe("매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.");
    expect(cuts[1].sentence).toBe("성수역에서 2분입니다.");
    expect(cuts[0].shows).toBe("딸기를 가는 손 클로즈업");
    expect(cuts[0].ref_photo_id).toBe("p1");
    expect(cuts[1].ref_photo_id).toBeUndefined();
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].seconds).toBeGreaterThan(1);
  });

  it("컷을 이어붙이면 원고와 같다 — 승인한 문장이 글자 그대로 살아남는다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValueOnce(shots);
    const cuts = await pipeline.defaultDeps.splitCuts(project);
    const joined = cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "");
    expect(joined).toBe(project.script.text.replace(/\s/g, ""));
  });

  it("화면 패스가 실패해도 컷은 남는다 — 그림은 문장으로 폴백한다", async () => {
    llmMock.callJson.mockResolvedValueOnce(ranges).mockResolvedValue({ shots: [] }); // 개수 불일치
    const cuts = await pipeline.defaultDeps.splitCuts(project);
    expect(cuts).toHaveLength(2);
    expect(cuts[0].shows).toBeUndefined();
  });

  it("경계를 못 받으면 한 문장에 한 컷으로 떨어진다 — 대본은 살아 있다", async () => {
    // 빈틈이 있는 경계(2번 문장을 건너뜀)는 거절된다
    llmMock.callJson.mockResolvedValue({ cuts: [{ from: 1, to: 1 }, { from: 3, to: 3 }] });
    const cuts = await pipeline.defaultDeps.splitCuts(project);
    expect(cuts).toHaveLength(3);
    expect(cuts[1].sentence).toBe("시럽은 쓰지 않습니다.");
  });

  it("원고가 없으면 컷 분할 실패를 던진다", async () => {
    await expect(pipeline.defaultDeps.splitCuts({ ...project, script: null })).rejects.toThrow("컷 분할 실패");
  });
});

describe("runCutsPipeline", () => {
  it("정상 흐름: ai 컷은 이미지·검수, photo 컷은 즉시 done", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    const after = await projects.getProject(p.id);
    expect(after.status).toBe("cuts");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
    expect(after.cuts[1].state).toBe("done");
    expect(after.cuts[1].image).toBeUndefined(); // 사진 컷은 원본 사용
  });

  it("전원 탈락 컷은 자동 보정 후에도 실패하면 needs_attention — 다른 컷은 정상(실패 격리)", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps({ failCut: 0 }));
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
    await pipeline.runCutsPipeline(p.id, capturing);
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
    await pipeline.runCutsPipeline(p.id, capturing);
    expect(seen[0]?.shows).toBe("옛 장면 화면");
  });

  it("regenCut은 3회 제한", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await expect(pipeline.regenCut(p.id, 0, deps())).rejects.toThrow(/3회/);
  });

  it("regenCut instruction이 컷에 저장되고 이후 프롬프트에 실린다", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    const prompts = [];
    const capturing = { ...deps(), genImage: async ({ prompt }) => { prompts.push(prompt); return { url: "http://img/x" }; } };
    await pipeline.regenCut(p.id, 0, capturing, "딸기라떼가 보이게");
    const cut = (await projects.getProject(p.id)).cuts.find((c) => c.idx === 0);
    expect(cut.edit_instruction).toBe("딸기라떼가 보이게");
    expect(prompts.some((pr) => pr.includes("딸기라떼가 보이게"))).toBe(true);
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
    expect(saved.cuts[0].audio).toEqual({ url: "a/첫 문장", seconds: 4.3 });
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
    expect(saved.cuts[0].video).toEqual({ url: "v4", seconds: 4, truncated: false });
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
});
