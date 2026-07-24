import { describe, it, expect } from "vitest";
import { buildCutsMessages, buildImagePrompt } from "../lib/cuts.js";

const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "자료", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  script: { paragraphs: [{ tag: "훅", text: "요즘 이거 모르면 손해" }], coverage: [] },
};

describe("buildCutsMessages", () => {
  it("대본 문장과 사진 id가 프롬프트에 포함된다", () => {
    const { messages } = buildCutsMessages(project);
    expect(messages[0].content).toContain("요즘 이거 모르면 손해");
    expect(messages[0].content).toContain("p1");
  });
  it("목표 길이 제약은 더 이상 주입하지 않는다", () => {
    const { system, messages } = buildCutsMessages(project);
    expect(messages[0].content).not.toContain("목표 길이");
    expect(system).not.toContain("±20%");
  });
});

describe("buildImagePrompt", () => {
  it("컷 문장·비율·레퍼런스 지시가 반영된다", () => {
    const cut = { sentence: "첫 모금에 과육이 씹히는", source: "ai", ref_photo_id: "p1" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toMatch(/vertical|9:16/);
    expect(prompt).toContain("reference");
  });
});
