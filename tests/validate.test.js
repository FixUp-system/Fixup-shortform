import { describe, it, expect } from "vitest";
import { validateScript, validateCutRanges, validateShows, validateBriefing } from "../lib/validate.js";

describe("validateScript — 하나로 흐르는 원고", () => {
  it("원고 문자열을 받아 다듬어 돌려준다", () => {
    expect(validateScript({ script: "  매일 아침 딸기를 갈아 씁니다. 하루 40잔이면 끝입니다.  " })).toEqual({
      text: "매일 아침 딸기를 갈아 씁니다. 하루 40잔이면 끝입니다.",
    });
  });

  it("문단 배열은 더 이상 받지 않는다 — 원고가 원본이다", () => {
    expect(validateScript({ paragraphs: [{ text: "문장" }] })).toBeNull();
  });

  it("너무 짧으면 null — 한 마디는 대본이 아니다", () => {
    expect(validateScript({ script: "짧다." })).toBeNull();
  });

  it("파이프라인이 감당 못 할 크기는 막는다", () => {
    expect(validateScript({ script: "가".repeat(2001) })).toBeNull();
  });

  it("비었거나 문자열이 아니면 null", () => {
    expect(validateScript({ script: "   " })).toBeNull();
    expect(validateScript({ script: 123 })).toBeNull();
    expect(validateScript(null)).toBeNull();
  });
});

describe("validateCutRanges — 경계만 받고 텍스트는 코드가 자른다", () => {
  const sentences = ["첫 문장입니다.", "둘째 문장입니다.", "셋째 문장입니다."];

  it("경계로 원고를 잘라 컷을 만든다", () => {
    const cuts = validateCutRanges({ cuts: [{ from: 1, to: 2 }, { from: 3, to: 3 }] }, sentences);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]).toMatchObject({ idx: 0, sentence: "첫 문장입니다. 둘째 문장입니다.", source: "ai", regen_count: 0 });
    expect(cuts[1].sentence).toBe("셋째 문장입니다.");
  });

  it("초는 LLM에게 묻지 않고 자른 길이로 계산한다", () => {
    const cuts = validateCutRanges({ cuts: [{ from: 1, to: 3 }] }, sentences);
    expect(cuts[0].seconds).toBeGreaterThanOrEqual(2);
    expect(cuts[0].seconds).toBeLessThanOrEqual(15);
  });

  it("모델이 보낸 문장은 무시한다 — 원고를 다시 쓰지 못한다", () => {
    const cuts = validateCutRanges({ cuts: [{ from: 1, to: 1, sentence: "몰래 고친 문장" }, { from: 2, to: 3 }] }, sentences);
    expect(cuts[0].sentence).toBe("첫 문장입니다.");
  });

  it("빈틈이 있으면 null — 원고 한 조각이 조용히 사라진다", () => {
    expect(validateCutRanges({ cuts: [{ from: 1, to: 1 }, { from: 3, to: 3 }] }, sentences)).toBeNull();
  });

  it("겹치면 null — 같은 문장이 두 번 읽힌다", () => {
    expect(validateCutRanges({ cuts: [{ from: 1, to: 2 }, { from: 2, to: 3 }] }, sentences)).toBeNull();
  });

  it("끝까지 쓰지 않으면 null — 뒤를 잘라먹으면 승인한 대본이 사라진다", () => {
    expect(validateCutRanges({ cuts: [{ from: 1, to: 2 }] }, sentences)).toBeNull();
  });

  it("1번에서 시작하지 않으면 null", () => {
    expect(validateCutRanges({ cuts: [{ from: 2, to: 3 }] }, sentences)).toBeNull();
  });

  it("범위 밖이면 null", () => {
    expect(validateCutRanges({ cuts: [{ from: 1, to: 9 }] }, sentences)).toBeNull();
  });

  it("정수가 아니면 null — 강제변환으로 경계가 밀리지 않는다", () => {
    for (const bad of [null, "", [], true, "1", 1.5]) {
      expect(validateCutRanges({ cuts: [{ from: bad, to: 3 }] }, sentences)).toBeNull();
    }
  });

  it("문장이나 컷이 비면 null", () => {
    expect(validateCutRanges({ cuts: [] }, sentences)).toBeNull();
    expect(validateCutRanges({ cuts: [{ from: 1, to: 1 }] }, [])).toBeNull();
    expect(validateCutRanges(null, sentences)).toBeNull();
  });
});

describe("validateShows — 화면 패스", () => {
  it("컷 수만큼의 화면을 돌려준다", () => {
    const shots = validateShows({ shots: [{ shows: "클로즈업 화면" }, { shows: "풀 샷 화면" }] }, 2);
    expect(shots).toEqual([{ shows: "클로즈업 화면" }, { shows: "풀 샷 화면" }]);
  });

  it("개수가 어긋나면 null — 짝이 밀리면 엉뚱한 문장에 엉뚱한 그림이 붙는다", () => {
    expect(validateShows({ shots: [{ shows: "하나뿐" }] }, 2)).toBeNull();
    expect(validateShows({ shots: [{ shows: "가" }, { shows: "나" }, { shows: "다" }] }, 2)).toBeNull();
  });

  it("있는 사진만 ref로 남긴다", () => {
    const shots = validateShows({ shots: [{ shows: "화면", ref_photo_id: "p1" }, { shows: "화면2", ref_photo_id: "없는id" }] }, 2, ["p1"]);
    expect(shots[0].ref_photo_id).toBe("p1");
    expect(shots[1].ref_photo_id).toBeUndefined();
  });

  it("빈 화면이 있으면 null", () => {
    expect(validateShows({ shots: [{ shows: "  " }] }, 1)).toBeNull();
    expect(validateShows({ shots: [{}] }, 1)).toBeNull();
  });

  it("컷 수가 없거나 응답이 망가지면 null", () => {
    expect(validateShows({ shots: [{ shows: "가" }] }, 0)).toBeNull();
    expect(validateShows(null, 1)).toBeNull();
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
