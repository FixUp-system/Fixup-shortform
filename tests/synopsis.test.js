import { describe, it, expect } from "vitest";
import { buildSynopsisMessages } from "../lib/synopsis.js";

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

describe("buildSynopsisMessages", () => {
  it("자료와 브리핑이 지문에 들어간다", () => {
    const { messages } = buildSynopsisMessages(project);
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("매일 아침 직접 갈아");
    expect(user).toContain("라떼.jpg");
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
    // '팬'은 뒤 공백 없이 잠근다 — 이 저장소 프롬프트는 '팬·돌리'처럼 가운뎃점으로 나열한다.
    // ('달리'는 '달리다'와 겹쳐 오탐이 나므로 넣지 않는다.)
    for (const term of ["팬", "돌리", "트럭", "크레인", "줌", "휩팬", "틸트", "트래킹", "핸드헬드", "슬로우모션"]) {
      expect(system).not.toContain(term);
    }
  });

  it("기법 서술과 광고 형용사를 금지한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("희소성을 강조한다");
    expect(system).toContain("특별한");
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
