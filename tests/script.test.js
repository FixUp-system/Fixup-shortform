import { describe, it, expect } from "vitest";
import { buildScriptMessages } from "../lib/script.js";

const project = {
  settings: { purpose: "홍보·판매", duration_s: 45, aspect_ratio: "9:16" },
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  script: null,
};

describe("buildScriptMessages", () => {
  it("자료·설정이 프롬프트에 포함된다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(system).toContain("숏폼");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("45초");
    expect(user).toContain("라떼.jpg");
  });
  it("instruction과 기존 대본이 있으면 수정 요청으로 구성된다", () => {
    const withScript = { ...project, script: { paragraphs: [{ tag: "훅", text: "기존문장" }], coverage: [] } };
    const { messages } = buildScriptMessages(withScript, "더 짧게");
    expect(messages[0].content).toContain("기존문장");
    expect(messages[0].content).toContain("더 짧게");
  });
});
