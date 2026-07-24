import { describe, it, expect } from "vitest";
import { buildBriefingMessages } from "../lib/briefing.js";

const project = {
  material: {
    text: "성수동 카페 미영 신메뉴 생딸기라떼. 시럽은 쓰지 않음.",
    photos: [{ id: "p1", filename: "라떼.jpg" }],
  },
};

describe("buildBriefingMessages", () => {
  it("자료 텍스트와 사진 파일명을 담는다", () => {
    const { system, messages } = buildBriefingMessages(project);
    expect(system).toContain("JSON");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("라떼.jpg");
  });

  it("사진이 없으면 없음으로 표기한다", () => {
    const { messages } = buildBriefingMessages({ material: { text: "자료", photos: [] } });
    expect(messages[0].content).toContain("(없음)");
  });

  it("질문 상한과 질문 기준을 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("3개");
    expect(system).toContain("정보가 있어야만");
  });

  it("영상 성격을 단정하지 않는다 — 훅·홍보를 전제하는 표현이 없다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).not.toContain("훅");
    expect(system).not.toContain("홍보");
  });

  it("이미 되물은 이력이 있으면 다시 묻지 말라고 지시한다", () => {
    const withAsked = {
      ...project,
      briefing: { asked: [{ question: "가격대는요?", options: [], answer: "5천원대", done: true }] },
    };
    const { messages } = buildBriefingMessages(withAsked);
    const user = messages[0].content;
    expect(user).toContain("가격대는요?");
    expect(user).toContain("5천원대");
    expect(user).toContain("추가 질문 없이");
  });
});
