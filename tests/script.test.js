import { describe, it, expect } from "vitest";
import { buildScriptMessages, buildScriptEditMessages, editKeptContent, estimateSeconds } from "../lib/script.js";

const synopsis = {
  angle: "매일 맛이 다른 라떼",
  scenes: [
    { role: "여는말", shows: "딸기 과육이 우유에 섞이는 클로즈업", says: "오늘 한 잔은 어제와 다르다", seconds: 3, facts: ["매일 아침 직접"] },
    { role: "마감", shows: "카페 외관", says: "성수역 3번 출구 2분", seconds: 4, facts: [] },
  ],
};

const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
  synopsis,
  script: null,
};

describe("buildScriptMessages", () => {
  it("자료가 프롬프트에 포함된다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(system).toContain("대본");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("라떼.jpg");
  });
  it("폐지된 목적·길이·비율은 프롬프트에 나오지 않는다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).not.toContain("[설정]");
    expect(user).not.toContain("목적");
    expect(user).not.toContain("9:16");
  });
  it("instruction과 기존 대본이 있으면 수정 요청으로 구성된다", () => {
    const withScript = { ...project, script: { paragraphs: [{ text: "기존문장" }] } };
    const { messages } = buildScriptMessages(withScript, "더 짧게");
    expect(messages[0].content).toContain("기존문장");
    expect(messages[0].content).toContain("더 짧게");
  });
  it("브리핑과 원문 자료를 모두 담는다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("생딸기라떼 신메뉴");   // 브리핑 주제
    expect(user).toContain("매일 아침 직접 갈아"); // 핵심내용
    expect(user).toContain("동네 주민");           // 대상
    expect(user).toContain("매장에 와보고 싶어지기"); // 보고 나면
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서."); // 원문
  });

  it("브리핑이 없어도 원문만으로 조립된다", () => {
    const user = buildScriptMessages({ ...project, briefing: null }).messages[0].content;
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서.");
  });

  it("여는말은 센 사실로 열게 하되 정해진 틀을 강요하지 않는다", () => {
    const { system } = buildScriptMessages(project);
    // 여는 방식을 지시하긴 한다 — 다만 문구 틀이 아니라 '가장 센 사실'로 열라는 지시다
    expect(system).toContain("가장 센 한 방");
    expect(system).toContain("가장 구체적이고 센 사실로");
    // 틀을 못박는 명령("반드시 …로 시작하라")은 두지 않는다
    expect(system).not.toContain("반드시");
  });

  it("숏폼 어조(짧고 힘있게·훅)를 지시하고 상투어를 금지한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toMatch(/짧고 힘있게|훅|리듬/);
    expect(system).toContain("특별한");     // 금지 목록에 이름을 올려 못 쓰게 한다
    expect(system).toContain("만나보세요");
    expect(system).toContain("쓰지 않는다"); // 금지 지시문
  });
  it("대조 예시를 톤 참고용으로만 제시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("베끼지 말 것");
    expect(system).toContain("지나면 없습니다"); // 짧고 센 예
  });
  it("장면의 '할 말'을 전사 말고 실현하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("실현");
    expect(system).toContain("강조");  // '강조·유도…' 연출 단어를 나레이션에 넣지 말라
    expect(system).toContain("그대로 옮기지 말고"); // 장면의 '할 말' 표현을 그대로 옮기지 마라
  });
  it("첫 문단을 스크롤 멈출 한 방으로 열라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("스크롤");
  });
  it("구성이 없으면 자료만으로 조립된다", () => {
    const user = buildScriptMessages({ ...project, synopsis: null }).messages[0].content;
    expect(user).not.toContain("[구성");
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서.");
  });
  it("사실을 나열하지 말고 전개하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("나열");
    expect(system).toContain("전개");
    expect(system).toContain("그래서 단맛이 다릅니다"); // 전개 예시(인과)
  });
});

describe("buildScriptMessages — 구성 종속", () => {
  it("구성이 지문에 들어간다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("매일 맛이 다른 라떼");
    expect(user).toContain("오늘 한 잔은 어제와 다르다");
  });

  it("shows도 문맥으로 주되 나레이션으로 옮기지 말라고 지시한다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(messages[0].content).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(system).toContain("나레이션으로 옮기지 않는다");
  });

  it("촬영·조명 용어를 낭독 문장에 넣지 말라고 지시한다 — shows에 적힌 기법이 전사되면 안 된다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("샷 크기·앵글·조명 용어");
    expect(system).toContain("클로즈업");
    expect(system).toContain("골든아워");
    expect(system).toContain("낭독 문장에 한 낱말도 넣지 않는다");
    expect(system).toContain("나쁜 예(촬영 용어 전사)"); // 대조 예시로 못박는다
  });

  it("장면과 같은 개수·순서를 요구한다", () => {
    expect(buildScriptMessages(project).system).toContain("같은 개수·같은 순서");
  });

  it("출력 스키마에 tag와 coverage가 없다 — 초안·교정 프롬프트 둘 다", () => {
    // 교정 프롬프트도 같은 스키마를 요구한다. 한쪽만 보면 coverage가 되살아나도 못 잡는다.
    for (const { system } of [buildScriptMessages(project), buildScriptEditMessages({ paragraphs: [{ text: "문장" }] })]) {
      expect(system).not.toContain('"tag"');
      expect(system).not.toContain("coverage");
    }
  });
});

describe("buildScriptEditMessages", () => {
  const draft = {
    paragraphs: [{ text: "특별한 딸기라떼를 만나보세요" }],
  };
  it("다듬을 초안 문장이 프롬프트에 들어간다", () => {
    const user = buildScriptEditMessages(draft).messages[0].content;
    expect(user).toContain("특별한 딸기라떼를 만나보세요");
  });
  it("사실 유지·상투어 제거·새 사실 추가 금지를 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("빠뜨리지 않는다");
    expect(system).toContain("만나보세요");       // 없앨 표현 목록
    expect(system).toContain("더하지 않는다");     // 새 사실 금지
    expect(system).toContain("paragraphs");        // 초안과 같은 출력 스키마
  });
  it("인과 전개를 뭉개지 말라고 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("뭉개지 않는다");
    expect(system).toContain("줄이지 않는다");
  });
  it("촬영·조명 용어도 기법 서술과 같이 걷어내라고 지시한다 — 교정이 두 번째 그물이다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("샷 크기·앵글·조명 용어");
    expect(system).toContain("클로즈업");
    expect(system).toContain("골든아워");
    expect(system).toContain("기법 서술과 똑같이 걷어낸다");
    expect(system).toContain("강조·유도·차별화"); // 기존 기법 서술 규칙은 그대로 남는다
  });

  it("평탄화 말고 날카롭게·임팩트 보존을 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toMatch(/날카롭|임팩트|평탄/);
  });
});

describe("estimateSeconds", () => {
  it("공백 제외 글자수를 초당 5.5자로 환산한다", () => {
    // 11자 → 2초, 33자 → 6초
    const s = (text) => estimateSeconds({ paragraphs: [{ text }] });
    expect(s("가나다라마바사아자차카")).toBe(2);
    expect(s("가나다 라마바사 아자차카".repeat(3))).toBe(6);
  });
  it("여러 문단을 합산한다", () => {
    const one = estimateSeconds({ paragraphs: [{ text: "가".repeat(55) }] });
    const two = estimateSeconds({ paragraphs: [{ text: "가".repeat(55) }, { text: "나".repeat(55) }] });
    expect(one).toBe(10);
    expect(two).toBe(20);
  });
  it("대본이 없거나 비어 있으면 0", () => {
    expect(estimateSeconds(null)).toBe(0);
    expect(estimateSeconds({ paragraphs: [] })).toBe(0);
    expect(estimateSeconds({ paragraphs: [{ text: "   " }] })).toBe(0);
  });
});

describe("editKeptContent", () => {
  const draft = {
    paragraphs: [{ text: "문장1" }, { text: "문장2" }],
  };
  it("문단·글자수를 다 지키면 채택한다", () => {
    const edited = { paragraphs: [{ text: "고친1" }, { text: "고친2" }] };
    expect(editKeptContent(draft, edited)).toBe(true);
  });
  it("문단이 줄면 거부한다(사실 유실)", () => {
    const edited = { paragraphs: [{ text: "고친1" }] };
    expect(editKeptContent(draft, edited)).toBe(false);
  });
  it("교정이 없으면(null) 거부한다", () => {
    expect(editKeptContent(draft, null)).toBe(false);
  });
  it("글자 수가 초안의 80% 미만으로 줄면 거부한다(전개 뭉갬)", () => {
    const longDraft = {
      paragraphs: [{ text: "가".repeat(50) }, { text: "나".repeat(50) }],
    };
    const gutted = { // 문단 수는 지켰지만 글자 수 20 → 100의 20%
      paragraphs: [{ text: "가".repeat(10) }, { text: "나".repeat(10) }],
    };
    expect(editKeptContent(longDraft, gutted)).toBe(false);
  });
  it("클리셰 제거 수준(80% 이상 유지)은 통과시킨다", () => {
    const longDraft = {
      paragraphs: [{ text: "가".repeat(50) }, { text: "나".repeat(50) }],
    };
    const trimmed = {
      paragraphs: [{ text: "가".repeat(45) }, { text: "나".repeat(45) }],
    };
    expect(editKeptContent(longDraft, trimmed)).toBe(true);
  });
});
