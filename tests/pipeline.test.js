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
describe("defaultDeps.splitCuts", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg" }] },
    synopsis: {
      angle: "앵글",
      scenes: [
        { role: "여는말", shows: "딸기라떼 클로즈업", says: "요지", seconds: 5, facts: [], ref_photo_id: "p1" },
        { role: "마감", shows: "매장 외관", says: "위치", seconds: 4, facts: [] },
      ],
    },
    script: { paragraphs: [{ text: "문장1" }, { text: "문장2" }] },
  };

  it("정상 응답이면 scene_idx가 붙은 컷 배열을 돌려준다", async () => {
    llmMock.callJson.mockResolvedValue({
      cuts: [
        { scene_idx: 0, sentence: "컷1", seconds: 5 },
        { scene_idx: 1, sentence: "컷2", seconds: 4 },
      ],
    });
    const cuts = await pipeline.defaultDeps.splitCuts(project);
    expect(cuts).toHaveLength(2);
    expect(cuts.map((c) => c.scene_idx)).toEqual([0, 1]);
    expect(cuts[0].idx).toBe(0);
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].ref_photo_id).toBe("p1"); // 장면이 정한 참조 사진을 물려받는다
    expect(cuts[1].ref_photo_id).toBeUndefined();
    // 장면 지문이 실제로 프롬프트에 실렸는지 — buildCutsMessages와의 맞물림
    expect(llmMock.callJson.mock.calls[0][0].messages[0].content).toContain("딸기라떼 클로즈업");
  });

  it("스키마가 깨지면 2회 재시도 후 컷 분할 실패를 던진다", async () => {
    llmMock.callJson.mockResolvedValue({ cuts: [{ sentence: "장면을 안 밝힌 컷", seconds: 5 }] });
    await expect(pipeline.defaultDeps.splitCuts(project)).rejects.toThrow("컷 분할 실패");
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
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

  it("검수에 그 컷이 속한 장면을 함께 넘긴다(그림과 심사가 같은 기준을 보게)", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      synopsis: { angle: "앵글", scenes: [{ role: "여는말", shows: "딸기라떼 클로즈업", says: "요지", seconds: 5, facts: [] }] },
    }));
    const seen = [];
    const capturing = {
      ...deps(),
      splitCuts: async () => [{ idx: 0, scene_idx: 0, sentence: "AI컷", seconds: 6, source: "ai", regen_count: 0 }],
      select: async ({ scene }) => { seen.push(scene); return { selectedIndex: 0, passed: true, note: "ok" }; },
    };
    await pipeline.runCutsPipeline(p.id, capturing);
    expect(seen[0]?.shows).toBe("딸기라떼 클로즈업");
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
