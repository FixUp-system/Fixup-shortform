import { describe, it, expect } from "vitest";
import { validateCutRanges, validateShows, validateCast, validateBriefing, dropAnsweredQuestions, validateProps } from "../lib/validate.js";
import { secondsForText } from "../lib/script.js";

// ★ 이 묶음은 tests/script.test.js 에 있었고, 그 파일이 원고와 함께 통째로 지워졌다(2026-08-16).
//   그런데 secondsForText 는 **살아 있다** — lib/validate.js 가 컷의 spoken_seconds 를 이 자로
//   재고, lib/cuts.js 가 문장을 묶을지 이 자로 판정한다.
//
// ⚠️ 아래 아랫집(`말하는 시간을 spoken_seconds 로 따로 적는다`)이 대신할 수 없다 —
//    그쪽은 `expect(c.spoken_seconds).toBe(secondsForText(c.sentence))` 라 같은 함수를 양변에
//    둔 항등식이다. 초당 글자수를 9 로 바꿔도, 2초 바닥이나 15초 천장을 지워도 **그린인 채
//    모든 컷의 낭독 초가 움직인다.**
//    그래서 여기서는 **숫자를 손으로 적는다.** 함수에서 끌어오지 않는다 — 끌어오는 순간
//    같은 항등식이 된다.
describe("secondsForText — 컷의 낭독 초를 재는 자", () => {
  it("공백을 뺀 글자수를 초당 5.5자로 센다", () => {
    expect(secondsForText("가".repeat(55))).toBe(10);   // 55 / 5.5
    expect(secondsForText("가".repeat(33))).toBe(6);    // 33 / 5.5
    expect(secondsForText("가".repeat(44))).toBe(8);    // 44 / 5.5
  });

  it("공백은 세지 않는다 — 띄어쓰기를 늘려도 낭독 시간은 그대로다", () => {
    // 글자 33개 + 공백 32개. 공백을 세면 12초가 되어 컷이 둘로 쪼개진다.
    expect(secondsForText("가 ".repeat(33))).toBe(6);
    expect(secondsForText("  가".repeat(33))).toBe(6);
  });

  it("바닥은 2초다 — 한 글자짜리 컷도 화면에 머물 시간이 필요하다", () => {
    expect(secondsForText("가")).toBe(2);
    expect(secondsForText("가나다")).toBe(2);   // 3 / 5.5 = 0.5 → 1 이 아니라 2
    expect(secondsForText("")).toBe(2);
    expect(secondsForText(null)).toBe(2);
  });

  it("천장은 15초다 — 클립 모델의 상한을 넘는 값을 만들지 않는다", () => {
    expect(secondsForText("가".repeat(200))).toBe(15);
    expect(secondsForText("가".repeat(2000))).toBe(15);
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

  // ★ 값 하나가 두 가지 뜻을 겸하고 있었다: cut.seconds 가 "낭독 시간"이면서 동시에
  //   "이 컷이 화면에 있는 시간"이었다. 여백을 넣으려면 둘이 갈라져야 한다 —
  //   자막은 말하는 동안만 떠야 하고, 클립은 화면 시간만큼 주문해야 한다.
  it("말하는 시간을 spoken_seconds 로 따로 적는다", () => {
    const cuts = validateCutRanges(
      { cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] },
      ["매일 아침 직접 갈아 만듭니다.", "하루 40잔이면 끝납니다."]
    );
    expect(cuts).toHaveLength(2);
    for (const c of cuts) {
      expect(c.spoken_seconds).toBe(secondsForText(c.sentence));
      expect(c.spoken_seconds).toBeGreaterThan(0);
    }
  });

  // ★ 무음 컷은 문장을 소비하지 않는다 — 그래서 "컷을 이어붙이면 원고와 같다"가 유지된다
  it("무음 컷을 받되 문장 덮기 규칙은 그대로다", () => {
    const cuts = validateCutRanges(
      { cuts: [{ silent: true }, { from: 1, to: 1 }, { from: 2, to: 2 }] },
      ["첫 문장입니다.", "둘째 문장입니다."]
    );
    expect(cuts).toHaveLength(3);
    expect(cuts[0]).toMatchObject({ idx: 0, silent: true, sentence: "", spoken_seconds: 0 });
    expect(cuts.filter((c) => !c.silent).map((c) => c.sentence).join(" "))
      .toBe("첫 문장입니다. 둘째 문장입니다.");
  });

  it("무음 컷을 여럿 받는다 — 개수 상한은 여기서 걸지 않는다", () => {
    const cuts = validateCutRanges(
      { cuts: [{ silent: true }, { from: 1, to: 1 }, { silent: true }] },
      ["첫 문장입니다."]
    );
    expect(cuts).toHaveLength(3);
    expect(cuts.filter((c) => c.silent)).toHaveLength(2);
  });

  it("무음 컷만 있으면 버린다 — 원고가 통째로 사라진다", () => {
    expect(validateCutRanges({ cuts: [{ silent: true }] }, ["첫 문장입니다."])).toBe(null);
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

describe("validateShows — tone·transition", () => {
  it("tone 을 전 컷에 복사한다", () => {
    const out = validateShows(
      { tone: "채도를 올린 시네마틱 질감", shots: [{ shows: "가" }, { shows: "나" }] },
      2
    );
    expect(out[0].tone).toBe("채도를 올린 시네마틱 질감");
    expect(out[1].tone, "환경과 같은 경로 — 전체가 정하고 컷이 들고 다닌다")
      .toBe("채도를 올린 시네마틱 질감");
  });

  it("transition 은 컷마다 다르다", () => {
    const out = validateShows(
      { shots: [{ shows: "가" }, { shows: "나", transition: "발 클로즈업, 같은 눈높이" }] },
      2
    );
    expect(out[0].transition, "첫 컷에는 전환이 없다").toBeUndefined();
    expect(out[1].transition).toBe("발 클로즈업, 같은 눈높이");
  });

  it("둘이 없어도 컷을 버리지 않는다", () => {
    // motion·speed 와 같은 취급 — 화면 설계가 부분적으로 실패해도 그림은 나와야 한다
    const out = validateShows({ shots: [{ shows: "가" }] }, 1);
    expect(out).toHaveLength(1);
    expect(out[0].shows).toBe("가");
    expect(out[0]).not.toHaveProperty("tone");
    expect(out[0]).not.toHaveProperty("transition");
  });

  it("빈 문자열은 없는 것으로 본다", () => {
    const out = validateShows({ tone: "   ", shots: [{ shows: "가", transition: "" }] }, 1);
    expect(out[0]).not.toHaveProperty("tone");
    expect(out[0]).not.toHaveProperty("transition");
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

describe("캐스팅이 목소리를 정한다", () => {
  const raw = (extra) => ({ cast: [{ who: "20대 동양인 남성", cuts: [1], ...extra }] });

  it("voice 를 그대로 싣는다", () => {
    const out = validateCast(raw({ voice: "중저음, 차분하고 단단한 톤" }), [], 1);
    expect(out[0].voice).toBe("중저음, 차분하고 단단한 톤");
  });

  it("앞뒤 공백을 턴다", () => {
    expect(validateCast(raw({ voice: "  높고 밝은 톤  " }), [], 1)[0].voice).toBe("높고 밝은 톤");
  });

  // ★ look 과 같은 규칙 — 없어도 인물을 버리지 않는다
  it("voice 가 없어도 인물은 남는다", () => {
    const out = validateCast(raw({ look: "짧은 검은 머리" }), [], 1);
    expect(out).toHaveLength(1);
    expect(out[0].voice).toBeUndefined();
  });

  it("빈 문자열은 싣지 않는다 — 빈 지시가 프롬프트에 들어가면 안 된다", () => {
    expect(validateCast(raw({ voice: "   " }), [], 1)[0].voice).toBeUndefined();
    expect(validateCast(raw({ voice: 42 }), [], 1)[0].voice).toBeUndefined();
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

describe("무대(environment)를 컷마다 나눠 갖는다", () => {
  // ★ 실측(2026-07-30): 5컷이 5개의 다른 장소로 나왔다 — 야외 아스팔트 코트(노을) ·
  //   야외 스트리트코트(한낮) · 실내 체육관(나무 마루) · 야외 코트(자주빛 노을) · 일본 거리(간판).
  //   shows 에 장소가 적힌 컷이 하나뿐이었고, 나머지는 이미지 모델이 매번 만들었다.
  //   애니 프리셋이 "자세히 그린 배경"을 요구하니 매번 다른 배경을 정성껏 그렸다.
  const shots = (n) => ({ shots: Array.from({ length: n }, (_, i) => ({ shows: `화면 ${i}` })) });

  it("무대를 전 컷에 나눠 넣는다", () => {
    const out = validateShows({ ...shots(3), environment: " 실내 농구 코트, 야간, 강한 스포트라이트 " }, 3);
    expect(out).toHaveLength(3);
    for (const s of out) expect(s.environment).toBe("실내 농구 코트, 야간, 강한 스포트라이트");
  });

  it("무대가 없으면 넣지 않는다 — 지금 동작 그대로", () => {
    const out = validateShows(shots(2), 2);
    for (const s of out) expect(s.environment).toBeUndefined();
  });

  // 코트에서 거리로 넘어가는 영상이 있다 — 컷이 스스로 무대를 말하면 그것을 쓴다
  it("컷이 자기 무대를 적으면 그것이 이긴다", () => {
    const obj = {
      environment: "실내 농구 코트, 야간",
      shots: [{ shows: "가" }, { shows: "나", environment: "야외 거리, 낮" }],
    };
    const out = validateShows(obj, 2);
    expect(out[0].environment).toBe("실내 농구 코트, 야간");
    expect(out[1].environment).toBe("야외 거리, 낮");
  });
});

describe("초점에 외형을 담는다", () => {
  const base = { topic: "농구화", key_points: ["하이톱"], questions: [] };

  it("물건 외형을 담는다", () => {
    const out = validateBriefing({
      ...base,
      focus: { mode: "물건", subject: "하이톱 농구화", look: " 검정 갑피에 빨강 스우시, 빨강 밑창 " },
    });
    expect(out.focus.look).toBe("검정 갑피에 빨강 스우시, 빨강 밑창");
  });

  it("외형이 없어도 초점을 버리지 않는다", () => {
    const out = validateBriefing({ ...base, focus: { mode: "물건", subject: "하이톱 농구화" } });
    expect(out.focus).toEqual({ mode: "물건", subject: "하이톱 농구화" });
  });
});

describe("validateShows — 움직임 축", () => {
  const base = (extra) => ({ shots: [{ shows: "미디엄 샷, 커피잔", ...extra }] });

  it("세 축을 받아 컷에 싣는다", () => {
    const out = validateShows(base({
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "창밖으로 사람들이 지나간다",
    }), 1);
    expect(out[0].camera).toBe("천천히 뒤로 물러난다");
    expect(out[0].subject).toBe("컵을 들어 입으로 가져간다");
    expect(out[0].ambient).toBe("창밖으로 사람들이 지나간다");
  });

  it("빈 축은 싣지 않는다 — 키 자체가 없어야 한다", () => {
    const out = validateShows(base({ camera: "  ", subject: "컵을 든다" }), 1);
    expect("camera" in out[0]).toBe(false);
    expect(out[0].subject).toBe("컵을 든다");
  });

  it("축이 하나도 없어도 컷을 버리지 않는다", () => {
    const out = validateShows(base({}), 1);
    expect(out).toHaveLength(1);
    expect(out[0].shows).toBe("미디엄 샷, 커피잔");
  });

  it("옛 motion 도 계속 받는다 — 저장된 프로젝트가 그것을 갖고 있다", () => {
    const out = validateShows(base({ motion: "천천히 회전한다" }), 1);
    expect(out[0].motion).toBe("천천히 회전한다");
  });

  it("목록 밖 축은 무시한다", () => {
    const out = validateShows(base({ lighting: "빛이 밝아진다" }), 1);
    expect("lighting" in out[0]).toBe(false);
  });
});
