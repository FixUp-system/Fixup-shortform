import { describe, it, expect } from "vitest";
import { validateScript, validateCutRanges, validateShows, validateCast, validateBriefing, validateDevelopQuestions, dropAnsweredQuestions } from "../lib/validate.js";

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
    // motion 은 선택이다 — 없으면 컷을 버리지 않고 움직임만 기본값이 된다
    const withMotion = validateShows(
      { shots: [{ shows: "클로즈업", motion: "김이 피어오른다" }, { shows: "풀 샷" }] }, 2
    );
    expect(withMotion[0].motion).toBe("김이 피어오른다");
    expect(withMotion[1].motion).toBeUndefined();
    expect(withMotion[1].shows).toBe("풀 샷");

    expect(validateShows({ shots: [{ shows: "하나뿐" }] }, 2)).toBeNull();
    expect(validateShows({ shots: [{ shows: "가" }, { shows: "나" }, { shows: "다" }] }, 2)).toBeNull();
  });

  it("있는 사진만 ref로 남긴다", () => {
    const shots = validateShows({ shots: [{ shows: "화면", ref_ids: ["p1"] }, { shows: "화면2", ref_ids: ["없는id"] }] }, 2, ["p1"]);
    expect(shots[0].ref_ids).toEqual(["p1"]);
    expect(shots[1].ref_ids).toBeUndefined();
  });

  it("ref_ids 배열을 받는다 — 사진 두 장을 함께 고를 수 있다", () => {
    const got = validateShows(
      { shots: [{ shows: "화면", motion: "움직임", ref_ids: ["p2", "p1"] }] },
      1, ["p1", "p2", "p3"]
    );
    expect(got[0].ref_ids).toEqual(["p2", "p1"]);
  });

  it("모르는 id 는 조용히 지운다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["p2", "없음"] }] }, 1, ["p2"]);
    expect(got[0].ref_ids).toEqual(["p2"]);
  });

  it("2장에서 자른다 — 장수가 늘면 모델이 무엇을 따를지 헷갈린다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["a", "b", "c"] }] }, 1, ["a", "b", "c"]);
    expect(got[0].ref_ids).toEqual(["a", "b"]);
  });

  it("고른 것이 없으면 ref_ids 를 두지 않는다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["없음"] }] }, 1, ["p1"]);
    expect(got[0].ref_ids).toBeUndefined();
  });

  it("배열이 아니면 무시한다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: "p1" }] }, 1, ["p1"]);
    expect(got[0].ref_ids).toBeUndefined();
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

describe("validateDevelopQuestions", () => {
  it("질문만 받아 답변 자리와 함께 돌려준다", () => {
    const qs = validateDevelopQuestions({ questions: [{ question: "왜 시작하셨어요?" }] });
    expect(qs).toEqual([{ question: "왜 시작하셨어요?", options: [], answer: null, done: false, kind: "develop" }]);
  });

  it("보기를 보내와도 버린다 — 사장님만 아는 이야기에 보기를 만들면 없는 사실이 굳는다", () => {
    const qs = validateDevelopQuestions({ questions: [{ question: "왜요?", options: ["가", "나"] }] });
    expect(qs[0].options).toEqual([]);
  });

  it("3개까지만 남기고 망가진 질문은 버린다", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ question: `질문${i}` }));
    expect(validateDevelopQuestions({ questions: many })).toHaveLength(3);
    expect(validateDevelopQuestions({ questions: [{ question: "  " }, { question: "정상?" }] })).toHaveLength(1);
  });

  it("쓸 질문이 하나도 없으면 null — 빈 배열로 조용히 넘기지 않는다", () => {
    expect(validateDevelopQuestions({ questions: [] })).toBeNull();
    expect(validateDevelopQuestions({})).toBeNull();
    expect(validateDevelopQuestions(null)).toBeNull();
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

// 프롬프트에 "자료에 적혀 있으면 버려라"를 예시까지 들어 적었는데도 어겼다.
// 관통 첫 브리핑에서 "성수역 2번 출구에서 도보 3분"을 key_points 에 넣어 두고
// "수리점의 정확한 위치는 어디인가요?"를 물었다. 그래서 코드가 판정한다.
describe("dropAnsweredQuestions — 이미 아는 것을 되묻지 않는다", () => {
  const 자료 = `성수동에서 자전거 수리점 합니다. 펑크는 5분이면 되고 3,000원입니다.
평일 아홉 시부터 일곱 시까지, 일요일은 쉽니다. 성수역 2번 출구에서 3분입니다.`;

  it("자료에 답이 있으면 버린다", () => {
    const q = [
      { question: "수리점의 정확한 위치는 어디인가요?" },
      { question: "펑크 수리 비용은 얼마인가요?" },
      { question: "영업 시간은 언제인가요?" },
    ];
    expect(dropAnsweredQuestions(q, 자료)).toEqual([]);
  });

  it("자료에 없으면 남긴다", () => {
    const q = [
      { question: "어떤 손님이 주로 오시나요?" },
      { question: "예약을 받으시나요?" },
    ];
    expect(dropAnsweredQuestions(q, 자료)).toHaveLength(2);
  });

  it("동 이름만 있으면 위치 질문을 살린다 — 찾아갈 수 없는 정보는 답이 아니다", () => {
    const 얕은자료 = "성수동에서 자전거 수리점 합니다.";
    const q = [{ question: "수리점의 정확한 위치는 어디인가요?" }];
    expect(dropAnsweredQuestions(q, 얕은자료)).toHaveLength(1);
  });

  it("validateBriefing 이 자료를 받으면 그 질문을 걸러 낸다", () => {
    const b = validateBriefing({
      topic: "자전거 수리점",
      key_points: ["성수역 2번 출구에서 도보 3분 거리", "펑크 수리 5분, 3,000원"],
      questions: [
        { question: "수리점의 정확한 위치는 어디인가요?" },
        { question: "어떤 손님이 주로 오시나요?" },
      ],
    }, 자료);
    expect(b.asked.map((a) => a.question)).toEqual(["어떤 손님이 주로 오시나요?"]);
  });
});

// ⚠️ 모델은 컷을 **1부터** 센다(프롬프트가 "1. …" 로 매겨 준다). validateCast 가 0부터인
// 내부 인덱스로 바꾼다. 아래 입력은 1부터, 기대값은 0부터다 — 이 변환이 이 함수의 요점이다.
describe("validateCast", () => {
  const ids = ["av-child", "av-owner"];

  it("컷 번호를 1부터에서 0부터로 바꿔 받는다", () => {
    const got = validateCast({ cast: [
      { who: "50대 남성 주인", avatar_id: "av-owner", cuts: [2, 3] },
      { who: "40대 여성 손님", avatar_id: "av-child", cuts: [1, 3] },
    ] }, ids, 3);
    expect(got).toEqual([
      { id: "c1", who: "50대 남성 주인", avatar_id: "av-owner", cuts: [1, 2] },
      { id: "c2", who: "40대 여성 손님", avatar_id: "av-child", cuts: [0, 2] },
    ]);
  });

  it("범위 밖 컷 번호는 버린다 — 없는 컷을 가리키면 아무 데도 못 꽂는다", () => {
    // 컷 3개: 1·2·3 만 유효하다. 6 은 넘고, 0 은 1부터 세는 규약에서 없는 번호다
    const got = validateCast({ cast: [{ who: "주인", cuts: [1, 6, 0] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0]);
  });

  it("중복을 없애고 오름차순으로 정렬한다", () => {
    const got = validateCast({ cast: [{ who: "주인", cuts: [3, 1, 3] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0, 2]);
  });

  it("정수가 아닌 컷 번호는 버린다", () => {
    const got = validateCast({ cast: [{ who: "주인", cuts: [1, "2", 2.5, null] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0]);
  });

  it("나오는 컷이 하나도 없는 인물은 버린다 — 꽂을 데가 없다", () => {
    const got = validateCast({ cast: [
      { who: "주인", cuts: [1] },
      { who: "유령", cuts: [9] },
    ] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "주인", cuts: [0] }]);
  });

  it("cuts 가 배열이 아니면 그 인물을 버린다", () => {
    expect(validateCast({ cast: [{ who: "주인", cuts: 1 }] }, ids, 3)).toEqual([]);
  });

  it("없는 아바타 id 는 조용히 제거한다", () => {
    const got = validateCast({ cast: [{ who: "손님", avatar_id: "av-없음", cuts: [1] }] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "손님", cuts: [0] }]);
  });

  it("who 가 없는 항목은 버린다", () => {
    const got = validateCast({ cast: [{ cuts: [1] }, { who: "아이", cuts: [2] }] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "아이", cuts: [1] }]);
  });

  it("사람이 없는 영상은 빈 배열 — 실패가 아니다", () => {
    expect(validateCast({ cast: [] }, ids, 3)).toEqual([]);
  });

  it("모양이 틀리면 null — 호출측이 재시도를 판단한다", () => {
    expect(validateCast(null, ids, 3)).toBe(null);
    expect(validateCast({}, ids, 3)).toBe(null);
    expect(validateCast({ cast: "주인" }, ids, 3)).toBe(null);
  });

  it("인물이 너무 많으면 4명에서 자른다", () => {
    const many = { cast: Array.from({ length: 9 }, (_, i) => ({ who: `사람${i}`, cuts: [1] })) };
    expect(validateCast(many, ids, 3)).toHaveLength(4);
  });
});
