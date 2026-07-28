import { describe, it, expect } from "vitest";
import { splitSentences, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt } from "../lib/cuts.js";

const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "자료", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: { topic: "생딸기라떼" },
  script: { text: "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.\n성수역 3번 출구에서 2분입니다." },
};

describe("splitSentences", () => {
  it("종결부호와 줄바꿈으로 나눈다", () => {
    expect(splitSentences(project.script.text)).toEqual([
      "매일 아침 딸기를 갈아 씁니다.",
      "시럽은 쓰지 않습니다.",
      "성수역 3번 출구에서 2분입니다.",
    ]);
  });

  it("빈 원고는 빈 배열", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
  });
});

describe("buildSplitMessages", () => {
  const sentences = splitSentences(project.script.text);

  it("번호를 매겨 문장을 준다 — 경계를 번호로 이야기하기 위해서다", () => {
    const user = buildSplitMessages(sentences).messages[0].content;
    expect(user).toContain("1. 매일 아침 딸기를 갈아 씁니다.");
    expect(user).toContain("3. 성수역 3번 출구에서 2분입니다.");
    expect(user).toContain("문장 3개");
  });

  it("문장을 고쳐 쓰지 말고 경계만 고르라고 지시한다", () => {
    const { system } = buildSplitMessages(sentences);
    expect(system).toContain("경계만 고른다");
    expect(system).toContain("고쳐 쓰지 않는다");
    expect(system).toContain('{"cuts":[{"from"');
  });

  it("빈틈도 겹침도 없어야 한다고 지시한다", () => {
    expect(buildSplitMessages(sentences).system).toContain("빈틈도 겹침도 없다");
  });

  // 상한(15초)만 주자 두 문장씩 묶어 12~15초 컷이 나왔다. 이미지 한 장이 버티기엔 길다.
  it("컷 목표 길이를 준다 — 상한만으로는 넉넉하게 묶는다", () => {
    const { system } = buildSplitMessages(sentences);
    expect(system).toContain("3~8초");
    // 컷은 문장보다 잘게 쪼개질 수 없다 — 긴 문장은 그대로 두라는 예외가 함께 있어야 한다
    expect(system).toContain("문장을 쪼개지 않는다");
  });
});

describe("buildShowsMessages", () => {
  const cuts = [
    { idx: 0, sentence: "매일 아침 딸기를 갈아 씁니다." },
    { idx: 1, sentence: "성수역 3번 출구에서 2분입니다." },
  ];

  it("원고 전문과 컷 목록·사진을 함께 준다 — 화면은 전체 맥락에서 나온다", () => {
    const user = buildShowsMessages(project, cuts).messages[0].content;
    expect(user).toContain("시럽은 쓰지 않습니다");        // 원고 전문
    expect(user).toContain("1. 매일 아침 딸기를 갈아 씁니다.");
    expect(user).toContain("id:p1");
    expect(user).toContain("생딸기라떼");                   // 주제
  });

  it("shows 작법을 지시한다 — 샷 크기·앵글·조명, 부정형 금지, 삽화 금지", () => {
    const { system } = buildShowsMessages(project, cuts);
    for (const term of ["극단적 클로즈업", "미디엄 샷", "광각", "로우 앵글", "골든아워"]) {
      expect(system).toContain(term);
    }
    expect(system).toContain("없는 것으로 쓰지 않는다");
    expect(system).toContain("삽화가 아니다");
  });

  it("첫 컷을 설정 샷으로 열지 말라고 지시한다", () => {
    expect(buildShowsMessages(project, cuts).system).toContain("설정 샷으로 열지 않는다");
  });

  it("같은 그림을 반복하지 말라고 지시한다 — 한 편의 영상이다", () => {
    expect(buildShowsMessages(project, cuts).system).toContain("같은 그림을 반복하지 않는다");
  });

  it("카메라 움직임은 넣지 않는다 — 만드는 것은 정지 화면이다", () => {
    const { system } = buildShowsMessages(project, cuts);
    for (const term in { 돌리: 1, 크레인: 1, 휩팬: 1, 틸트: 1, 트래킹: 1, 핸드헬드: 1, 슬로우모션: 1 }) {
      expect(system).not.toContain(term);
    }
    for (const term of ["팬", "줌", "트럭"]) {
      expect(system).not.toMatch(new RegExp(`(^|[^가-힣A-Za-z])${term}([^가-힣A-Za-z]|$)`));
    }
  });
});

describe("buildImagePrompt — 화면 근거", () => {
  it("컷의 보여줌을 쓴다. 나레이션 문장은 그릴 대상이 아니다", () => {
    const cut = { idx: 0, sentence: "매일 아침 딸기를 갈아 씁니다.", shows: "딸기 과육이 우유에 섞이는 클로즈업" };
    const p = buildImagePrompt(cut, project);
    expect(p).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(p).not.toContain("매일 아침 딸기를 갈아 씁니다");
  });

  it("화면 패스가 실패한 컷은 문장으로 폴백한다 — 그림은 나온다", () => {
    const cut = { idx: 0, sentence: "폴백 문장입니다." };
    expect(buildImagePrompt(cut, project)).toContain("폴백 문장입니다.");
  });

  it("구성 시절 프로젝트는 장면의 보여줌으로 폴백한다", () => {
    const legacy = {
      ...project,
      synopsis: { scenes: [{ shows: "옛 장면의 화면" }] },
    };
    const cut = { idx: 0, scene_idx: 0, sentence: "옛 문장" };
    const p = buildImagePrompt(cut, legacy);
    expect(p).toContain("옛 장면의 화면");
    expect(p).not.toContain("옛 문장");
  });

  it("컷 비율·레퍼런스 지시가 반영된다", () => {
    const cut = { idx: 0, sentence: "문장", shows: "화면", source: "ai", ref_photo_id: "p1" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toMatch(/vertical|9:16/);
    expect(prompt).toContain("reference");
  });

  it("사진 목록에 없는 ref는 레퍼런스 문장을 붙이지 않는다", () => {
    const cut = { idx: 0, sentence: "문장", shows: "화면", source: "ai", ref_photo_id: "지워진사진" };
    expect(buildImagePrompt(cut, project)).not.toContain("reference");
  });

  it("브리핑 주제가 있으면 전 컷에 주제 앵커가 들어간다", () => {
    const cut = { idx: 0, sentence: "한 잔 6,500원", shows: "가격표 클로즈업", source: "ai" };
    expect(buildImagePrompt(cut, project)).toContain("생딸기라떼");
  });

  it("edit_instruction이 있으면 사용자 수정으로 강하게 반영된다", () => {
    const cut = { idx: 0, sentence: "문장", shows: "화면", source: "ai", edit_instruction: "컵을 더 작게" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toContain("컵을 더 작게");
    expect(prompt).toMatch(/correction/i);
  });
});

describe("buildClipPrompt — 이 그림이 어떻게 움직이는가", () => {
  it("컷의 movement 를 그대로 싣고, 첫 프레임이라는 것을 알린다", () => {
    const p = buildClipPrompt({ motion: "카메라가 천천히 뒤로 물러난다" });
    expect(p).toContain("카메라가 천천히 뒤로 물러난다");
    expect(p).toMatch(/first frame/i);
  });

  it("motion 이 없으면 조용한 기본값으로 간다 — 없는 움직임을 지어내면 그림이 무너진다", () => {
    // 화면 패스가 실패한 컷과 옛 프로젝트가 여기로 온다
    expect(buildClipPrompt({})).toContain("거의 정지");
    expect(buildClipPrompt({ motion: "   " })).toContain("거의 정지");
    expect(buildClipPrompt(null)).toContain("거의 정지");
  });

  it("말하는 얼굴을 막는다 — 지금 기술로는 뭉개진다", () => {
    expect(buildClipPrompt({ motion: "인물이 웃는다" })).toMatch(/lip sync/i);
  });
});
