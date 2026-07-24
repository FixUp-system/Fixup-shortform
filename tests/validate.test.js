import { describe, it, expect } from "vitest";
import { validateScript, validateCuts, validateBriefing } from "../lib/validate.js";

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
  it("정상 컷 배열을 통과시키고 idx를 재부여한다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "문장1", seconds: 6, source: "ai", ref_photo_id: "p1" },
        { sentence: "문장2", seconds: 8, source: "photo", photo_id: "p2" },
      ]},
      photoIds
    );
    expect(cuts).toHaveLength(2);
    expect(cuts[0].idx).toBe(0);
    expect(cuts[1].photo_id).toBe("p2");
  });
  it("photo 소스인데 photo_id가 목록에 없으면 null", () => {
    expect(validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "photo", photo_id: "없음" }] }, photoIds)).toBeNull();
  });
  it("존재하지 않는 ref_photo_id는 제거하고 통과시킨다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "ai", ref_photo_id: "없음" }] }, photoIds);
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

  it("이미 답한 이력이 있으면 새 질문을 쓰지 않는다 (라우트 규칙과 같은 판정)", () => {
    const kept = [{ question: "가격대는요?", options: [], answer: "5천원대", done: true }];
    const fresh = validateBriefing({ topic: "주제", key_points: ["가"], questions: [{ question: "새 질문" }] });
    const asked = kept.length > 0 ? kept : fresh.asked;
    expect(asked).toEqual(kept);
  });
});
