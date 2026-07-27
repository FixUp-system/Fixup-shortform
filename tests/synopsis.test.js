import { describe, it, expect } from "vitest";
import { buildSynopsisMessages, factCount, sceneBudget } from "../lib/synopsis.js";

const project = {
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
};

describe("factCount · sceneBudget", () => {
  const withBrief = (briefing) => ({ ...project, briefing });

  it("핵심 내용과 답을 받은 질문을 사실로 센다", () => {
    const p = withBrief({
      key_points: ["ㄱ", "ㄴ", "  "],
      asked: [
        { question: "가격은?", answer: "5천원" },
        { question: "언제부터?", answer: "" },   // 안 답한 것은 사실이 아니다
        { question: "왜?", answer: "   " },
      ],
    });
    expect(factCount(p)).toBe(3);
    expect(sceneBudget(p)).toBe(3);
  });

  it("두 줄짜리 자료도 최소 2장면은 준다 — 여는말과 마감이 한 장면에 겹치지 않게", () => {
    expect(sceneBudget(withBrief({ key_points: ["하나뿐"], asked: [] }))).toBe(2);
    expect(sceneBudget(withBrief(null))).toBe(2);
  });

  it("사실이 아무리 많아도 8장면을 넘지 않는다", () => {
    const many = Array.from({ length: 20 }, (_, i) => `사실${i}`);
    expect(sceneBudget(withBrief({ key_points: many, asked: [] }))).toBe(8);
  });
});

describe("buildSynopsisMessages", () => {
  it("자료와 브리핑이 지문에 들어간다", () => {
    const { messages } = buildSynopsisMessages(project);
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("매일 아침 직접 갈아");
    expect(user).toContain("라떼.jpg");
    // 사진 id를 함께 적어야 장면이 ref_photo_id를 고를 수 있다 — 표기가 배선이다
    expect(user).toContain("id:p1");
  });

  it("shows와 says를 갈라서 요구한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain('"shows"');
    expect(system).toContain('"says"');
    expect(system).toContain('"seconds"');
  });

  it("says에 완성 문장을 쓰지 말라고 지시한다 — 문장은 대본 단계의 일이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("완성된 낭독 문장을 쓰지 마라");
  });

  it("shows를 추상어로 쓰지 말라고 지시한다 — 이미지 프롬프트의 원천이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("추상어");
  });

  it("shows에 샷 크기와 앵글 용어를 쓰라고 지시한다", () => {
    const { system } = buildSynopsisMessages(project);
    for (const term of ["극단적 클로즈업", "클로즈업", "미디엄 샷", "풀 샷", "광각"]) {
      expect(system).toContain(term);
    }
    for (const term of ["눈높이", "로우 앵글", "하이 앵글", "조감도", "오버더숄더", "시점 샷"]) {
      expect(system).toContain(term);
    }
  });

  it("shows에 조명과 시간대를 적으라고 지시한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("조명");
    expect(system).toContain("골든아워");
    expect(system).toContain("새벽");
  });

  it("shows를 부정형으로 쓰지 말라고 지시한다 — 이미지 모델은 '~이 없는'을 못 다룬다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("없는 것으로 쓰지 않는다");
    expect(system).toContain("손님이 없는 매장");
    expect(system).toContain("텅 빈 새벽 매장");
  });

  it("카메라 움직임 용어는 넣지 않는다 — shows는 정지 키프레임이다", () => {
    const { system } = buildSynopsisMessages(project);
    // 다른 낱말에 파묻히지 않는 용어는 그대로 잠근다.
    // ('달리'는 '달리다'와 겹쳐 오탐이 나므로 넣지 않는다.)
    for (const term of ["돌리", "크레인", "휩팬", "틸트", "트래킹", "핸드헬드", "슬로우모션"]) {
      expect(system).not.toContain(term);
    }
    // '팬·줌·트럭'을 맨 부분문자열로 잠그면 '프라이팬'·'보여줌'·'푸드트럭' 하나만 들어와도
    // 거짓 실패가 난다. 낱말 경계를 두고 본다 — 이 저장소 프롬프트의 '팬·돌리' 같은
    // 가운뎃점 나열도 경계다.
    for (const term of ["팬", "줌", "트럭"]) {
      expect(system).not.toMatch(new RegExp(`(^|[^가-힣A-Za-z])${term}([^가-힣A-Za-z]|$)`));
    }
    // 경계 없이 붙여 쓰는 합성어는 따로 잠근다
    for (const term of ["팬인", "팬아웃", "줌인", "줌아웃", "트럭샷"]) {
      expect(system).not.toContain(term);
    }
  });

  it("기법 서술과 광고 형용사를 금지한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("희소성을 강조한다");
    expect(system).toContain("특별한");
  });

  // 아래 일곱은 "정보는 다 있는데 구성이 없다"를 막는 규칙이다. 라이브 3건(딸기·공방·세탁소)에서
  // 앵글이 소개문으로, 순서가 자료 순서로, 여는말이 거리 전경으로, 초가 균등 배분으로 나왔다.
  it("앵글을 소개문이 아니라 주장으로 잡게 한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("주장");
    expect(system).toContain("소개문");
  });

  // 두 줄짜리 자료(세탁소)에서 "주장을 세우라"는 압력이 환각으로 샜다 —
  // 자료에 없는 "더 빠르다"·"전문 장비"가 앵글과 장면에 들어왔다.
  it("세울 주장이 없으면 지어내지 말라는 안전판을 둔다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("세울 것이 없으면");
  });

  it("장면 순서에 인과를 요구한다 — 섞어도 말이 되면 목록이지 구성이 아니다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("근데");
    expect(system).toContain("그래서");
    expect(system).toContain("순서를 바꿔도");
  });

  it("첫 장면은 스크롤을 멈추는 한 방이다 — 거리 전경·간판으로 열지 않는다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("첫 장면");
    expect(system).toContain("간판");
  });

  it("화면이 할 말을 그대로 그리지 않게 한다 — 삽화가 되면 그 초의 정보량이 절반이다", () => {
    expect(buildSynopsisMessages(project).system).toContain("삽화");
  });

  it("seconds를 균등하게 배분하지 말라고 지시한다", () => {
    expect(buildSynopsisMessages(project).system).toContain("균등");
  });

  // 풍부한 자료에서 다 담으려다 57초가 됐다 — 숏폼이 아니다
  it("전체 길이에 상한을 두고 무엇을 버릴지 기준을 준다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("40초를 넘지 않는다");
    expect(system).toContain("버리는 것이 구성이다");
  });

  it("role 라벨이 장면 내용과 어긋나지 않게 한다", () => {
    expect(buildSynopsisMessages(project).system).toContain("'희소성'이라 적고");
  });

  it("자료가 얇으면 장면 수를 줄이라고 지시한다 — 3은 하한이지 목표가 아니다", () => {
    expect(buildSynopsisMessages(project).system).toContain("목표가 아니다");
  });

  // 풍부한 자료에서 says가 완성 문장으로 나와 대본이 그대로 옮겼다(전사율 1.0).
  // 요지와 완성 문장의 거리가 좁아지는 자리를 길이로 벌린다.
  it("says를 완성 문장이 못 되게 짧게 묶는다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("20자");
    expect(system).toContain("옮겨 적을 뿐이다");
  });

  it("지문에 장면 예산을 적는다 — 자료가 얇으면 장면도 적다", () => {
    const { messages } = buildSynopsisMessages(project); // 핵심 내용 1개, 답한 질문 0개
    const user = messages[0].content;
    expect(user).toContain("[분량]");
    expect(user).toContain("장면은 2개를 넘지 않는다");
    expect(user).toContain("지어내 길이를 늘리지 않는다");
  });

  it("수정 지시가 있으면 기존 구성과 함께 지문에 붙는다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn, "더 짧게");
    const user = messages[0].content;
    expect(user).toContain("기존앵글");
    expect(user).toContain("기존화면");
    expect(user).toContain("더 짧게");
  });

  it("수정 지시가 없으면 기존 구성을 붙이지 않는다 — 처음부터 다시 짠다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn);
    expect(messages[0].content).not.toContain("기존앵글");
  });
});
