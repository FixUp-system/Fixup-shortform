import { describe, it, expect } from "vitest";
import { validateScript, validateCutRanges, validateShows, validateCast, validateBriefing, validateDevelopQuestions, dropAnsweredQuestions, validateProps } from "../lib/validate.js";

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

  it("ref_ids 를 더 이상 만들지 않는다 — 사진은 캐스팅이 고른다", () => {
    const shots = validateShows({ shots: [{ shows: "화면", ref_ids: ["p1"] }] }, 1);
    expect(shots[0].ref_ids).toBeUndefined();
    expect(shots[0].shows).toBe("화면");
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

  it("초점을 통과시킨다 — 갈래와 대상이 함께 온다", () => {
    const got = validateBriefing({
      topic: "옷 수선집 소개", key_points: ["12년"], questions: [],
      focus: { mode: "사람", subject: "20년 된 아버지 코트를 맡기러 온 50대 남성 손님" },
    });
    expect(got.focus).toEqual({
      mode: "사람", subject: "20년 된 아버지 코트를 맡기러 온 50대 남성 손님",
    });
  });

  it("물건·정보 갈래도 그대로 받는다", () => {
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "물건", subject: "생딸기라떼" } }).focus.mode).toBe("물건");
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "정보", subject: "가격과 영업시간" } }).focus.mode).toBe("정보");
  });

  it("모르는 갈래는 초점을 통째로 버린다 — 반쪽짜리는 뒤 단계를 헷갈리게만 한다", () => {
    const got = validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "분위기", subject: "따뜻함" } });
    expect(got.focus).toBe(null);
  });

  it("대상이 비면 초점을 버린다", () => {
    const got = validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "사람", subject: "  " } });
    expect(got.focus).toBe(null);
  });

  it("초점이 아예 없으면 null — 지금 동작 그대로 간다", () => {
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [] }).focus).toBe(null);
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [], focus: "사람" }).focus).toBe(null);
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

describe("validateProps — 사물이 보이는 컷", () => {
  it("사진과 컷 번호를 받는다 — 1부터 세는 번호를 0부터로 바꾼다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [1, 3] }] }, ["p1"], 4);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0, 2] }]);
  });

  it("모르는 사진은 버린다 — 첨부되지 않을 것을 가리키면 그림을 망친다", () => {
    expect(validateProps({ props: [{ photo_id: "없음", cuts: [1] }] }, ["p1"], 4)).toEqual([]);
  });

  it("범위 밖 컷 번호는 버리고 나머지는 살린다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [1, 9, 0, -2] }] }, ["p1"], 3);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0] }]);
  });

  it("보이는 컷이 하나도 없으면 그 사진은 뺀다 — 꽂을 데가 없다", () => {
    expect(validateProps({ props: [{ photo_id: "p1", cuts: [] }] }, ["p1"], 3)).toEqual([]);
  });

  it("같은 컷을 두 번 적어도 한 번만 남고 정렬된다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [3, 1, 3] }] }, ["p1"], 4);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0, 2] }]);
  });

  it("props 가 없거나 깨져 있으면 빈 배열 — cast 는 따로 산다", () => {
    expect(validateProps({}, ["p1"], 3)).toEqual([]);
    expect(validateProps({ props: "이상함" }, ["p1"], 3)).toEqual([]);
    expect(validateProps(null, ["p1"], 3)).toEqual([]);
  });

  it("사물 사진 목록이 비면 아무것도 통과하지 않는다", () => {
    expect(validateProps({ props: [{ photo_id: "p1", cuts: [1] }] }, [], 3)).toEqual([]);
  });
});

describe("validateBriefing — 연출 바람(direction)", () => {
  // 사장님은 자료 한 칸에 사실과 연출 바람을 섞어 쓴다. 갈라 받으면 쓰기가 번거로워지므로
  // 코드가 갈라 쓴다: 사실은 대본이 보고, 연출 바람은 화면 설계가 본다.
  //
  // 이것이 없던 동안 연출 지시가 대본으로 흘러들어 낭독이 됐다 —
  // "공중에 뜬 실루엣은 극단적 슬로모션으로 강조됩니다"(2026-07-30 실제 생성물).
  const base = {
    topic: "농구화 광고",
    key_points: ["검정 빨강 배색", "하이톱"],
    focus: { mode: "물건", subject: "하이톱 농구화" },
    questions: [],
  };

  it("연출 바람을 그대로 담는다", () => {
    const out = validateBriefing({ ...base, direction: " 로우 앵글 트래킹, 마찰 먼지, 역광 실루엣 " });
    expect(out.direction).toBe("로우 앵글 트래킹, 마찰 먼지, 역광 실루엣");
  });

  it("없으면 빈 문자열이다 — 없다고 브리핑을 버리지 않는다", () => {
    const out = validateBriefing(base);
    expect(out.direction).toBe("");
    expect(out.topic).toBe("농구화 광고");
  });

  it("문자열이 아니면 빈 문자열로 떨어진다", () => {
    expect(validateBriefing({ ...base, direction: { 나쁜: "값" } }).direction).toBe("");
    expect(validateBriefing({ ...base, direction: 42 }).direction).toBe("");
  });
});

describe("연출 바람의 줄바꿈을 지킨다", () => {
  // 연출은 "연출 — 어느 순간" 쌍을 줄바꿈으로 잇는다. 줄바꿈이 사라지면 쌍 경계가 무너진다.
  it("여러 줄을 그대로 담는다", () => {
    const pairs = "역광 실루엣 — 점프슛 정점에서 공중에 뜬 선수\n마찰 먼지 — 크로스오버로 멈추는 발";
    const out = validateBriefing({
      topic: "농구화", key_points: ["하이톱"], questions: [], direction: `  ${pairs}  `,
    });
    expect(out.direction).toBe(pairs);
    expect(out.direction.split("\n")).toHaveLength(2);
  });
});
