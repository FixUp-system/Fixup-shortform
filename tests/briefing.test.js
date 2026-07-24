import { describe, it, expect } from "vitest";
import { buildBriefingMessages, mergeAsked } from "../lib/briefing.js";

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

  it("자료에 이미 있는 것은 되묻지 말라고 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("key_points");
    expect(system).toContain("버린다");
    expect(system).toContain("빈 배열이 정답");
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

describe("mergeAsked", () => {
  const fresh = [
    { question: "새 질문1", options: ["가"], answer: null, done: false },
    { question: "새 질문2", options: [], answer: null, done: false },
  ];

  it("이전 목록이 없으면 새 목록을 쓴다", () => {
    expect(mergeAsked(undefined, fresh)).toEqual(fresh);
    expect(mergeAsked(null, fresh)).toEqual(fresh);
    expect(mergeAsked([], fresh)).toEqual(fresh);
  });

  it("이전 목록이 전부 미답이면 새 목록을 쓴다", () => {
    const prev = [{ question: "옛 질문", options: [], answer: null, done: false }];
    expect(mergeAsked(prev, fresh)).toEqual(fresh);
  });

  it("이전 목록에 답한 항목이 있으면 이전 목록을 그대로 쓴다", () => {
    const prev = [
      { question: "가격대는요?", options: [], answer: "5천원대", done: true },
      { question: "안 답한 것", options: [], answer: null, done: false },
    ];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("done 없이 answer만 있는 항목도 답한 것으로 본다", () => {
    const prev = [{ question: "가격대는요?", options: [], answer: "5천원대" }];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("건너뛴 항목(answer 없이 done)도 답한 것으로 본다", () => {
    const prev = [{ question: "가격대는요?", options: [], answer: null, done: true }];
    expect(mergeAsked(prev, fresh)).toEqual(prev);
  });

  it("빈 문자열·공백뿐인 answer는 답한 것으로 보지 않는다", () => {
    const prev = [
      { question: "가격대는요?", options: [], answer: "   ", done: false },
      { question: "또?", options: [], answer: "", done: false },
    ];
    expect(mergeAsked(prev, fresh)).toEqual(fresh);
  });
});
