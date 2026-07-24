import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

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
});

async function makeProject() {
  return projects.createProject({
    settings: { aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg", url: "/api/uploads/a.jpg" }] },
  });
}

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

  it("regenCut은 3회 제한", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await expect(pipeline.regenCut(p.id, 0, deps())).rejects.toThrow(/3회/);
  });
});
