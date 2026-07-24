import { describe, it, expect } from "vitest";
import { validateScript, validateCuts, validateBriefing, validatePlan } from "../lib/validate.js";

describe("validateScript", () => {
  it("정상 스키마를 통과시킨다", () => {
    const ok = validateScript({
      paragraphs: [{ tag: "훅", text: "요즘 이거 모르면 손해" }],
      coverage: ["생딸기 직접 갈기"],
    });
    expect(ok.paragraphs).toHaveLength(1);
  });
  it("paragraphs가 없으면 null", () => {
    expect(validateScript({ coverage: [] })).toBeNull();
    expect(validateScript({ paragraphs: [{ tag: "훅" }] })).toBeNull(); // text 누락
  });
});

describe("validateCuts", () => {
  const photoIds = ["p1", "p2"];
  it("모든 컷을 ai로 만들고 idx를 재부여한다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "문장1", seconds: 6, ref_photo_id: "p1" },
        { sentence: "문장2", seconds: 8 },
      ]},
      photoIds
    );
    expect(cuts).toHaveLength(2);
    expect(cuts[0].idx).toBe(0);
    expect(cuts.every((c) => c.source === "ai")).toBe(true);
    expect(cuts[0].ref_photo_id).toBe("p1");
    expect(cuts[1].ref_photo_id).toBeUndefined();
  });
  it("photo 소스로 와도 ai로 바꾸고 그 사진을 레퍼런스로 승격한다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "photo", photo_id: "p2" }] }, photoIds);
    expect(cuts[0].source).toBe("ai");
    expect(cuts[0].ref_photo_id).toBe("p2");
    expect(cuts[0].photo_id).toBeUndefined();
  });
  it("존재하지 않는 레퍼런스는 제거하고 통과시킨다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, ref_photo_id: "없음" }] }, photoIds);
    expect(cuts[0].ref_photo_id).toBeUndefined();
  });
});

describe("validateBriefing", () => {
  const ok = {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아", "시럽 안 씀"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    questions: [{ question: "가격대는요?", options: ["5천원대", "6천원대"] }],
  };

  it("정상 응답을 정규화한다", () => {
    const b = validateBriefing(ok);
    expect(b.topic).toBe("생딸기라떼 신메뉴");
    expect(b.key_points).toEqual(["매일 아침 직접 갈아", "시럽 안 씀"]);
    expect(b.asked).toEqual([
      { question: "가격대는요?", options: ["5천원대", "6천원대"], answer: null, done: false },
    ]);
  });

  it("주제나 핵심내용이 비면 실패", () => {
    expect(validateBriefing({ ...ok, topic: "  " })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: [] })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: "문자열" })).toBeNull();
    expect(validateBriefing(null)).toBeNull();
  });

  it("선택 항목이 없으면 빈 문자열", () => {
    const b = validateBriefing({ topic: "주제", key_points: ["가"] });
    expect(b.audience).toBe("");
    expect(b.takeaway).toBe("");
    expect(b.asked).toEqual([]);
  });

  it("질문은 3개까지, 보기는 4개까지", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      question: `질문${i}`,
      options: ["가", "나", "다", "라", "마"],
    }));
    const b = validateBriefing({ ...ok, questions: many });
    expect(b.asked).toHaveLength(3);
    expect(b.asked[0].options).toHaveLength(4);
  });

  it("망가진 질문은 조용히 버린다", () => {
    const b = validateBriefing({ ...ok, questions: [{ question: "" }, { question: "정상?" }] });
    expect(b.asked).toHaveLength(1);
    expect(b.asked[0].question).toBe("정상?");
    expect(b.asked[0].options).toEqual([]);
  });
});

describe("validatePlan", () => {
  const ok = {
    angle: "시럽을 쓰지 않는다",
    beats: [
      { role: "여는말", facts: ["시럽 안 씀"], point: "그래서 그날 단맛이 다르다" },
      { role: "희소성", facts: ["하루 40잔"], point: "적게 만들어 금방 떨어진다" },
    ],
  };
  it("정상 스키마를 통과시키고 다듬는다", () => {
    const r = validatePlan(ok);
    expect(r.angle).toBe("시럽을 쓰지 않는다");
    expect(r.beats).toHaveLength(2);
    expect(r.beats[0]).toEqual({ role: "여는말", facts: ["시럽 안 씀"], point: "그래서 그날 단맛이 다르다" });
  });
  it("angle이 비면 null", () => {
    expect(validatePlan({ ...ok, angle: "" })).toBeNull();
    expect(validatePlan({ ...ok, angle: undefined })).toBeNull();
  });
  it("beats가 비었거나 배열이 아니면 null", () => {
    expect(validatePlan({ ...ok, beats: [] })).toBeNull();
    expect(validatePlan({ ...ok, beats: "x" })).toBeNull();
  });
  it("beat에 role이나 point가 없으면 null", () => {
    expect(validatePlan({ angle: "a", beats: [{ role: "여는말", point: "" }] })).toBeNull();
    expect(validatePlan({ angle: "a", beats: [{ point: "전개" }] })).toBeNull();
  });
  it("facts가 없거나 배열이 아니면 빈 배열로 채운다", () => {
    const r = validatePlan({ angle: "a", beats: [{ role: "본문", point: "전개" }] });
    expect(r.beats[0].facts).toEqual([]);
  });
});
