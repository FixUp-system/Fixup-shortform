import { describe, it, expect } from "vitest";
import { buildScriptMessages, buildScriptEditMessages, buildPlanMessages, editKeptContent, estimateSeconds } from "../lib/script.js";

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
    const withScript = { ...project, script: { paragraphs: [{ tag: "훅", text: "기존문장" }], coverage: [] } };
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

  it("영상 성격을 단정하지 않는다 — 훅을 강제하지 않는다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).not.toContain("반드시");
    expect(system).toContain("성격");
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
  it("기획 point를 전사 말고 실현하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("실현");
    expect(system).toContain("강조");  // '강조·유도…' 연출 단어를 나레이션에 넣지 말라
    expect(system).toContain("옮기지 마"); // point 표현을 문장에 옮기지 마라
  });
  it("첫 문단을 스크롤 멈출 한 방으로 열라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("스크롤");
  });
  it("성격 중립·훅 비강제는 그대로 유지한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("성격");   // 성격은 자료가 정한다
    expect(system).not.toContain("반드시");
  });
  it("기획(plan)이 주어지면 앵글과 beats를 프롬프트에 싣는다", () => {
    const plan = { angle: "시럽을 안 쓴다", beats: [{ role: "여는말", facts: ["시럽 안 씀"], point: "그래서 단맛이 다르다" }] };
    const user = buildScriptMessages(project, undefined, plan).messages[0].content;
    expect(user).toContain("시럽을 안 쓴다");        // 앵글
    expect(user).toContain("그래서 단맛이 다르다");   // beat.point
  });
  it("기획이 없으면 오늘 형태 그대로 조립된다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).not.toContain("[기획");
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서.");
  });
  it("사실을 나열하지 말고 전개하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("나열");
    expect(system).toContain("전개");
    expect(system).toContain("그래서 단맛이 다릅니다"); // 전개 예시(인과)
  });
});

describe("buildScriptEditMessages", () => {
  const draft = {
    paragraphs: [{ tag: "여는말", text: "특별한 딸기라떼를 만나보세요" }],
    coverage: ["시럽 안 씀"],
  };
  it("다듬을 초안 문장과 반영 포인트가 프롬프트에 들어간다", () => {
    const user = buildScriptEditMessages(draft).messages[0].content;
    expect(user).toContain("특별한 딸기라떼를 만나보세요");
    expect(user).toContain("시럽 안 씀");
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
    paragraphs: [{ tag: "여는말", text: "문장1" }, { tag: "본문", text: "문장2" }],
    coverage: ["포인트1", "포인트2"],
  };
  it("문단·coverage를 다 지키면 채택한다", () => {
    const edited = { paragraphs: [{ tag: "여는말", text: "고친1" }, { tag: "본문", text: "고친2" }], coverage: ["포인트1", "포인트2"] };
    expect(editKeptContent(draft, edited)).toBe(true);
  });
  it("문단이 줄면 거부한다(사실 유실)", () => {
    const edited = { paragraphs: [{ tag: "여는말", text: "고친1" }], coverage: ["포인트1", "포인트2"] };
    expect(editKeptContent(draft, edited)).toBe(false);
  });
  it("coverage가 줄어도 문단·글자바닥을 지키면 채택한다", () => {
    const edited = { paragraphs: [{ tag: "여는말", text: "고친1" }, { tag: "본문", text: "고친2" }], coverage: ["포인트1"] };
    expect(editKeptContent(draft, edited)).toBe(true);
  });
  it("교정이 없으면(null) 거부한다", () => {
    expect(editKeptContent(draft, null)).toBe(false);
  });
  it("글자 수가 초안의 80% 미만으로 줄면 거부한다(전개 뭉갬)", () => {
    const longDraft = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(50) }, { tag: "본문", text: "나".repeat(50) }],
      coverage: ["포인트1", "포인트2"],
    };
    const gutted = { // 문단·coverage는 지켰지만 글자 수 20 → 100의 20%
      paragraphs: [{ tag: "여는말", text: "가".repeat(10) }, { tag: "본문", text: "나".repeat(10) }],
      coverage: ["포인트1", "포인트2"],
    };
    expect(editKeptContent(longDraft, gutted)).toBe(false);
  });
  it("클리셰 제거 수준(80% 이상 유지)은 통과시킨다", () => {
    const longDraft = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(50) }, { tag: "본문", text: "나".repeat(50) }],
      coverage: ["포인트1"],
    };
    const trimmed = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(45) }, { tag: "본문", text: "나".repeat(45) }],
      coverage: ["포인트1"],
    };
    expect(editKeptContent(longDraft, trimmed)).toBe(true);
  });
});

describe("buildPlanMessages", () => {
  it("브리핑과 원문·사진을 담아 기획을 요청한다", () => {
    const { system, messages } = buildPlanMessages(project);
    expect(system).toContain("기획");
    expect(system).toContain("angle");
    expect(system).toContain("beats");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼 신메뉴");                 // 브리핑 주제
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서."); // 원문
    expect(user).toContain("라떼.jpg");
  });
  it("문장이 아니라 설계도를 요구한다 — 새 사실 금지를 지시한다", () => {
    const { system } = buildPlanMessages(project);
    expect(system).toContain("문장을 쓰지 않는다");
    expect(system).toContain("지어내지 않는다");
  });
  it("point를 연출 의도로 지시하고 기법 서술을 금지한다", () => {
    const { system } = buildPlanMessages(project);
    expect(system).toContain("연출 의도");
    expect(system).toContain("강조한다");   // 금지 예로 이름을 올려 못 쓰게 한다
    expect(system).toContain("스크롤");     // 여는말 = 스크롤 멈출 한 방
  });
});
