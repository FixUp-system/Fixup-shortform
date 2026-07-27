import { describe, it, expect } from "vitest";
import {
  buildScriptMessages,
  buildScriptEditMessages,
  buildScriptRewriteMessages,
  editKeptContent,
  estimateSeconds,
  copyRatio,
  repeatsWithin,
  scriptFaults,
  overTarget,
  secondsForText,
  targetChars,
} from "../lib/script.js";

const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아", "하루 40잔"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
  script: null,
};

describe("buildScriptMessages — 하나로 흐르는 원고", () => {
  it("자료와 브리핑이 지문에 들어간다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(system).toContain("대본");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("라떼.jpg");
    expect(user).toContain("동네 주민");
  });

  it("출력이 문단 배열이 아니라 원고 한 덩어리다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain('{"script"');
    expect(system).not.toContain('"paragraphs"');
    expect(system).toContain("하나의 글로 쓴다");
  });

  it("장면·번호·소제목으로 쪼개지 말라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("소제목");
    expect(system).toContain("성우가 처음부터 끝까지 읽어 내려갈 원고");
  });

  it("문장끼리 이어지게 쓰라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("근데·그래서");
    expect(system).toContain("나열하지 않는다");
  });

  it("첫 문장을 한 방으로 열되 소개·업력으로 열지 말라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("스크롤");
    expect(system).toContain("업력");
  });

  it("무엇을 남기고 무엇을 버릴지 기준을 준다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("사람이 한 말");
    expect(system).toContain("버리는 것이 대본이다");
  });

  it("화면 묘사·기법어·명사형 카피·어체를 규정한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("샷 크기·앵글·조명");
    expect(system).toContain("강조·유도·차별화");
    expect(system).toContain("당신의 손에");
    expect(system).toContain("'~합니다'로 통일");
    expect(system).toContain("특별한");     // 금지 표현 12종
    expect(system).not.toContain("반드시"); // 틀을 못박는 명령은 두지 않는다
  });

  it("목표 분량을 지문에 적는다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("[분량]");
    expect(user).toContain(`${targetChars(project)}자 안팎`);
  });

  it("수정 지시가 있으면 기존 원고와 함께 붙는다", () => {
    const withScript = { ...project, script: { text: "기존 원고입니다." } };
    const user = buildScriptMessages(withScript, "더 짧게").messages[0].content;
    expect(user).toContain("기존 원고입니다.");
    expect(user).toContain("더 짧게");
  });

  it("지시가 없으면 기존 원고를 붙이지 않는다 — 처음부터 다시 쓴다", () => {
    const withScript = { ...project, script: { text: "기존 원고입니다." } };
    expect(buildScriptMessages(withScript).messages[0].content).not.toContain("기존 원고입니다.");
  });
});

describe("targetChars — 장면별 초 배분을 대신하는 숫자 하나", () => {
  const withPoints = (n) => ({ ...project, briefing: { key_points: Array.from({ length: n }, (_, i) => `사실${i}`), asked: [] } });

  it("사실 수에 비례하되 40초(220자)를 넘지 않는다", () => {
    expect(targetChars(withPoints(20))).toBe(220);
  });

  it("자료가 얇아도 최소 분량은 준다", () => {
    expect(targetChars(withPoints(1))).toBe(60);
  });

  it("답을 받은 질문도 사실로 센다", () => {
    const p = {
      ...project,
      briefing: { key_points: ["ㄱ", "ㄴ"], asked: [{ question: "가격은?", answer: "5천원" }, { question: "언제?", answer: "" }] },
    };
    expect(targetChars(p)).toBe(90); // 사실 3개 × 30
  });
});

describe("buildScriptEditMessages", () => {
  const draft = { text: "특별한 딸기라떼를 만나보세요. 지금 바로 오세요." };

  it("다듬을 원고가 통으로 들어간다", () => {
    const user = buildScriptEditMessages(draft).messages[0].content;
    expect(user).toContain("특별한 딸기라떼를 만나보세요");
  });

  it("사실 유지·상투어 제거·새 사실 금지를 지시하고 같은 스키마를 요구한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("빠뜨리지 않는다");
    expect(system).toContain("만나보세요");
    expect(system).toContain("더하지 않는다");
    expect(system).toContain('{"script"');
    expect(system).not.toContain('"paragraphs"');
  });

  it("쪼개지 말고 하나로 이어진 글을 유지하라고 지시한다", () => {
    expect(buildScriptEditMessages(draft).system).toContain("장면·번호·소제목으로 쪼개지 않는다");
  });

  it("촬영 용어·명사형 카피도 걷어내라고 지시한다 — 교정이 두 번째 그물이다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("샷 크기·앵글·조명 용어");
    expect(system).toContain("당신의 손에");
  });
});

describe("editKeptContent", () => {
  const draft = { text: "가".repeat(100) };

  it("분량을 지키면 채택한다", () => {
    expect(editKeptContent(draft, { text: "나".repeat(95) })).toBe(true);
  });

  it("80% 미만으로 줄면 거부한다(전개 뭉갬)", () => {
    expect(editKeptContent(draft, { text: "나".repeat(50) })).toBe(false);
  });

  it("교정이 없으면 거부한다", () => {
    expect(editKeptContent(draft, null)).toBe(false);
    expect(editKeptContent(draft, {})).toBe(false);
  });
});

describe("copyRatio · repeatsWithin", () => {
  it("수사만 덧대고 사실을 더하지 않은 문장은 임계 위다", () => {
    expect(copyRatio("이곳은 동네 작은 세탁소다", "이곳은 평범한 동네에 자리한 작은 세탁소입니다.")).toBeGreaterThan(0.5);
  });

  it("사실을 한 걸음 전개한 문장은 임계 아래다", () => {
    expect(copyRatio("물레 없이 손으로만 빚는다", "물레는 가르치지 않습니다. 손으로 빚어야 그날 만든 것을 가져갑니다.")).toBeLessThan(0.5);
  });

  it("같은 말을 두 번 하면 잡는다", () => {
    expect(repeatsWithin("손님들이 운동화를 맡기기 위해 세탁소를 방문합니다. 최근 들어 많은 손님들이 운동화를 맡기고 있습니다.")).toBe(true);
  });

  it("서로 다른 사실을 말하면 잡지 않는다", () => {
    expect(repeatsWithin("물레는 가르치지 않습니다. 수요일은 가마를 굽느라 쉽니다.")).toBe(false);
  });
});

describe("scriptFaults — 원고가 스스로 판정되는 둘", () => {
  // '할 말 전사'·'화면 설명 전사'는 사라졌다 — 옮겨 적을 원본이 없어졌다
  it("되풀이를 잡는다", () => {
    const script = { text: "손님들이 운동화를 맡기기 위해 세탁소를 방문합니다. 최근 들어 많은 손님들이 운동화를 맡기고 있습니다." };
    expect(scriptFaults(project, script)).toContain("같은 말 되풀이");
  });

  it("목표 분량을 크게 넘기면 잡는다", () => {
    const script = { text: "가".repeat(400) };
    expect(scriptFaults(project, script)).toContain("분량 초과");
    expect(overTarget(project, "가".repeat(400))).toBe(true);
  });

  it("조금 넘긴 것은 잡지 않는다 — 목표는 눈금이지 자가 아니다", () => {
    expect(overTarget(project, "가".repeat(targetChars(project) + 5))).toBe(false);
  });

  it("멀쩡하면 빈 배열", () => {
    expect(scriptFaults(project, { text: "매일 아침 딸기를 갈아 씁니다. 하루 40잔이면 끝입니다." })).toEqual([]);
  });

  it("원고가 없으면 판정하지 않는다", () => {
    expect(scriptFaults(project, null)).toEqual([]);
    expect(scriptFaults(project, { text: "  " })).toEqual([]);
  });
});

describe("buildScriptRewriteMessages", () => {
  const draft = { text: "늘어진 원고입니다. 늘어진 원고입니다." };

  it("원고와 지적된 문제, 목표 분량을 함께 준다", () => {
    const { system, messages } = buildScriptRewriteMessages(project, draft, ["같은 말 되풀이"]);
    const user = messages[0].content;
    expect(user).toContain("늘어진 원고입니다");
    expect(user).toContain("같은 말 되풀이");
    expect(user).toContain(`${targetChars(project)}자 안팎`);
    expect(system).toContain('{"script"');
  });

  it("이유마다 다른 처방을 준다", () => {
    const { system } = buildScriptRewriteMessages(project, draft, ["분량 초과"]);
    expect(system).toContain("같은 말 되풀이");
    expect(system).toContain("분량 초과");
    expect(system).toContain("가격·위치·영업시간부터 버린다");
    expect(system).toContain("지적되지 않은 자리는 그대로 둔다");
  });
});

describe("secondsForText · estimateSeconds", () => {
  it("공백 제외 글자수를 초당 5.5자로 환산하고 2~15초로 묶는다", () => {
    expect(secondsForText("가".repeat(55))).toBe(10);
    expect(secondsForText("가")).toBe(2);
    expect(secondsForText("가".repeat(200))).toBe(15);
  });

  it("원고 전체 길이를 초로 환산한다", () => {
    expect(estimateSeconds({ text: "가나다 라마바사 아자차카".repeat(3) })).toBe(6);
    expect(estimateSeconds(null)).toBe(0);
    expect(estimateSeconds({ text: "   " })).toBe(0);
  });

  it("구성 시절 프로젝트의 paragraphs도 읽는다", () => {
    expect(estimateSeconds({ paragraphs: [{ text: "가".repeat(55) }, { text: "나".repeat(55) }] })).toBe(20);
  });
});
