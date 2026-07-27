import { describe, it, expect } from "vitest";
import { buildSynopsisMessages } from "../lib/synopsis.js";

const project = {
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
};

describe("buildSynopsisMessages", () => {
  it("자료와 브리핑이 지문에 들어간다", () => {
    const { messages } = buildSynopsisMessages(project);
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("매일 아침 직접 갈아");
    expect(user).toContain("라떼.jpg");
  });

  it("shows와 says를 갈라서 요구한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain('"shows"');
    expect(system).toContain('"says"');
    expect(system).toContain('"seconds"');
  });

  it("says에 완성 문장을 쓰지 말라고 지시한다 — 문장은 대본 단계의 일이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("완성된 낭독 문장을 쓰지 마라");
  });

  it("shows를 추상어로 쓰지 말라고 지시한다 — 이미지 프롬프트의 원천이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("추상어");
  });

  it("기법 서술과 광고 형용사를 금지한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("희소성을 강조한다");
    expect(system).toContain("특별한");
  });

  it("수정 지시가 있으면 기존 구성과 함께 지문에 붙는다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn, "더 짧게");
    const user = messages[0].content;
    expect(user).toContain("기존앵글");
    expect(user).toContain("기존화면");
    expect(user).toContain("더 짧게");
  });

  it("수정 지시가 없으면 기존 구성을 붙이지 않는다 — 처음부터 다시 짠다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn);
    expect(messages[0].content).not.toContain("기존앵글");
  });
});
