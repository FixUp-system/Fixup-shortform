import { describe, it, expect } from "vitest";
import { splitSentences, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, stillOnly } from "../lib/cuts.js";

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

  it("거울에 사람이 비치는 화면은 적지 말라고 지시한다 — 지금 기술로는 반드시 어긋난다", () => {
    // 2026-07-29 실측: "거울 앞에 서 있는" 컷이 두 번 다 깨졌다. 처음엔 등지고 선 사람이
    // 정면으로 비쳤고, 다시 만드니 거울 속 인물의 목이 돌아갔다. VLM 은 세 번 다 통과시켰다.
    // 검수를 조이는 대신 못 그리는 것을 요구하지 않는다 — motion 규칙이 이미 같은 판단을 한다
    // ("얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작은 적지 않는다 — 지금 기술로는 뭉개진다").
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toContain("거울");
    expect(system).toContain("비친 상과 실제가 어긋난다");
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

  it("출연 목록을 넣지 않는다 — 캐스팅은 이 패스 뒤에 돈다", () => {
    const withCast = { ...project, cast: [{ id: "c1", who: "50대 남성 가게 주인", cuts: [0] }] };
    const { messages, system } = buildShowsMessages(withCast, [{ sentence: "한 문장." }]);
    expect(messages[0].content).not.toContain("[출연]");
    expect(messages[0].content).not.toContain("50대 남성 가게 주인");
    // 화면 설계가 고를 수 있는 것은 사진뿐이다
    expect(system).toContain("올린 사진");
  });

  it("초점을 알려 준다 — 갈래와 대상을 함께 준다", () => {
    const withFocus = { ...project, briefing: { ...project.briefing,
      focus: { mode: "사람", subject: "50대 남성 손님" } } };
    const { messages, system } = buildShowsMessages(withFocus, [{ sentence: "한 문장." }]);
    expect(messages[0].content).toContain("[이 영상이 따라가는 것]\n사람 — 50대 남성 손님");
    expect(system).toContain("따라가는 것");
  });

  it("물건 갈래도 그대로 전한다 — 사람만 특별대우하지 않는다", () => {
    const withFocus = { ...project, briefing: { ...project.briefing,
      focus: { mode: "물건", subject: "생딸기라떼" } } };
    expect(buildShowsMessages(withFocus, [{ sentence: "한 문장." }]).messages[0].content)
      .toContain("물건 — 생딸기라떼");
  });

  it("초점이 없으면 그 블록을 넣지 않는다", () => {
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).messages[0].content)
      .not.toContain("[이 영상이 따라가는 것]");
  });

  it("사진 목록은 여전히 준다 — 무엇을 찍을 수 있는지 알아야 화면에 넣는다", () => {
    const withPhoto = { ...project, material: { ...project.material, photos: [{ id: "p1", filename: "b.jpg" }] } };
    expect(buildShowsMessages(withPhoto, [{ sentence: "한 문장." }]).messages[0].content)
      .toContain("id:p1");
  });

  it("사진 id 를 적으라고 시키지 않는다 — 그 책임은 캐스팅으로 갔다", () => {
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).system).not.toContain("ref_ids");
  });

  it("초점이 물건인데 사람이 보이면 둘을 한 화면에 담으라고 알려 준다", () => {
    // 규칙을 조이는 대신 본보기를 준다 — 조이는 고침은 이 저장소에서 네 번 다 샜다
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).system).toContain("한 화면에");
  });
});

// 표본은 실측이다 — 화면 설계 패스를 자료 6편 × 3회 돌려 절 122개를 모았고
// (scripts/measure/shows-motion-leak.mjs), 그중 움직임이 섞인 절은 4개(3.3%)였다.
// 아래 문장들은 그 표본에서 그대로 가져왔다. 규칙을 감으로 정하면 정당한 상태 서술까지
// 지운다 — 첫 초안("-고 있다는 진행상이니 움직임")은 정밀도 50%로 반증됐다.
describe("stillOnly — 정지 그림에 못 담을 절을 이미지 프롬프트에서 뺀다", () => {
  it("명사·관형형으로 끝나는 절은 구도 서술이라 건드리지 않는다", () => {
        // 표본 122절 중 93개(76%)가 이 형태다. 절 안에 '지나가며'가 있어도 구도다 —
    // 그래서 절의 끝 형태로만 판정한다
    const shows = "수리점 앞 거리, 초등학생이 자전거를 타고 지나가며 손을 흔드는 풀 샷, 맑은 날씨";
    expect(stillOnly(shows)).toBe(shows);
  });

  it("움직임이 섞인 절만 뺀다 — 사장님이 본 '페달 없이 굴러가는 자전거'의 출처", () => {
    expect(stillOnly("수리점 내부, 주인이 자전거를 타고 테스트하는 미디엄 샷, 자전거 바퀴가 천천히 회전한다"))
      .toBe("수리점 내부, 주인이 자전거를 타고 테스트하는 미디엄 샷");
  });

  it("상태·착용은 남긴다 — '있다' 구성은 정지 그림이다", () => {
    // 한국어의 '-고 있다'는 진행상이자 착용·소지 상태다. 문법 표지만으로는 갈리지 않는다
    for (const s of [
      "완성된 생딸기라떼가 하얀 테이블 위에 놓여 있다",
      "책상 위에 여러 문서와 전선이 얽혀 있다",
      "다양한 자전거 부품이 벽에 걸려 있다",
      "체인이 헐거워져 있다",
      "겨울 코트를 입고 있다",
      "손이 원고를 가리키고 있다",
    ]) {
      expect(stillOnly(s), s).toBe(s);
    }
  });

  it("빛이 주어인 조명 서술은 남긴다 — 프롬프트가 권장한 서술이다", () => {
    for (const s of [
      "한낮의 햇빛이 창문을 통해 들어온다",
      "햇빛에 먼지가 떠다닌다",
      "조명이 마이크에 부드럽게 비친다",
      "겨울 햇살이 비친다",
    ]) {
      expect(stillOnly(s), s).toBe(s);
    }
  });

  it("존재·양태도 남긴다", () => {
    expect(stillOnly("딸기 조각이 가득하다")).toBe("딸기 조각이 가득하다");
    expect(stillOnly("자전거 핸들 너머로 도로가 보인다")).toBe("자전거 핸들 너머로 도로가 보인다");
  });

  it("표본에서 나온 움직임 넷을 전부 뺀다", () => {
    for (const s of [
      "투명한 컵에 붉은 딸기 퓌레가 천천히 채워진다",
      "한 초등학생이 자전거를 타고 지나간다",
      "손이 키보드를 빠르게 치고 있다",       // '있다' 구성이지만 속도 부사가 있다
      "화면에 반사된 조명이 부드럽게 깜빡인다", // 빛이 주어이지만 깜빡임은 시간 변화다
    ]) {
      expect(stillOnly(s), s).toBe("");
    }
  });

  it("절이 하나뿐이고 그것이 움직임이면 빈 문자열이 된다 — 부르는 쪽이 폴백한다", () => {
    expect(stillOnly("자전거가 천천히 지나간다")).toBe("");
  });

  it("빈 값과 없는 값을 견딘다", () => {
    expect(stillOnly("")).toBe("");
    expect(stillOnly(null)).toBe("");
  });
});

describe("buildImagePrompt — 화면 근거", () => {
  it("움직임이 섞인 절은 그림 지시에서 빠진다", () => {
    // 정지 이미지 모델은 '회전한다'를 그릴 방법이 없어 회전을 암시하는 그림을 만든다 —
    // 페달에서 뗀 발, 굴러가는 자세. 그 그림이 클립의 첫 프레임이 되어 결함이 굳는다
    const cut = { idx: 0, sentence: "먼저 타봅니다.", shows: "주인이 자전거를 타고 테스트하는 미디엄 샷, 자전거 바퀴가 천천히 회전한다" };
    const p = buildImagePrompt(cut, project);
    expect(p).toContain("주인이 자전거를 타고 테스트하는 미디엄 샷");
    expect(p).not.toContain("회전한다");
  });

  it("shows 가 통째로 움직임이면 문장으로 폴백한다 — 그림은 나와야 한다", () => {
    const cut = { idx: 0, sentence: "폴백 문장입니다.", shows: "자전거가 천천히 지나간다" };
    expect(buildImagePrompt(cut, project)).toContain("폴백 문장입니다.");
  });


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
    const cut = { idx: 0, sentence: "문장", shows: "화면", source: "ai", ref_ids: ["p1"] };
    const prompt = buildImagePrompt(cut, project, [{ path: "/x/라떼.jpg", kind: "thing" }]);
    expect(prompt).toMatch(/vertical|9:16/);
    expect(prompt).toContain("reference");
  });

  // 2026-07-29 실측: 사진 두 장을 익명으로 보냈더니 모델이 배역을 뒤바꿨다.
  // 캐스팅은 50대를 손님으로 정했는데 그림에서는 50대가 치수를 재고 30대가 코트를 입었다.
  // 첨부를 번호로 세고 그 번호에 배역을 묶어 준다.
  it("첨부마다 누구인지 번호로 지목한다 — 두 장이면 모델이 임의로 배정한다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "손님과 수선사가 마주 선 미디엄 샷", ref_ids: ["c1", "c2"] };
    const p = buildImagePrompt(cut, project, [
      { path: "/x/a.jpg", kind: "person", who: "50대 남성 손님" },
      { path: "/x/b.jpg", kind: "person", who: "30대 남성 수선사" },
    ]);
    expect(p).toMatch(/\[1\][^[]*50대 남성 손님/);
    expect(p).toMatch(/\[2\][^[]*30대 남성 수선사/);
    // 뒤바꾸지 말라고 명시한다
    expect(p).toMatch(/do not swap/i);
  });

  it("인물과 사물이 섞여도 번호가 첨부 순서와 같다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "가게 안 미디엄 샷", ref_ids: ["p1", "c1"] };
    const p = buildImagePrompt(cut, project, [
      { path: "/x/shop.jpg", kind: "thing" },
      { path: "/x/a.jpg", kind: "person", who: "50대 남성 손님" },
    ]);
    expect(p).toMatch(/\[2\][^[]*50대 남성 손님/);
    expect(p).toMatch(/packaging/i);
  });

  it("who 가 없는 인물 레퍼런스도 견딘다 — 옛 프로젝트에는 없다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "가게 안 미디엄 샷" };
    const p = buildImagePrompt(cut, project, [{ path: "/x/a.jpg", kind: "person" }]);
    expect(p).toMatch(/same person/i);
  });

  it("사람 레퍼런스에는 같은 사람으로 그리라고 한다 — 제품 문구는 사람에게 틀리다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "아이가 자전거를 끄는 미디엄 샷", ref_ids: ["c1"] };
    const withCast = {
      ...project,
      cast: [{ id: "c1", who: "아이", ref: { from: "avatar", id: "av-child" } }],
    };
    const p = buildImagePrompt(cut, withCast, [{ path: "/x/child.jpg", kind: "person" }]);
    expect(p).toMatch(/same person/i);
    expect(p).not.toMatch(/packaging/i);
  });

  it("사물 레퍼런스에는 모양·색을 그대로 지킨다고 한다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "라떼 클로즈업", ref_ids: ["p1"] };
    const p = buildImagePrompt(cut, project, [{ path: "/x/latte.jpg", kind: "thing" }]);
    expect(p).toMatch(/packaging/i);
  });

  it("인물이 정해진 컷에는 그 밖의 사람을 넣지 말라고 한다", () => {
    // 2026-07-29 실측: shows 가 "손님이 들어오는" 뿐인 컷에 모델이 재봉틀 앞 중년 여성을
    // 덤으로 그려 넣었다. 그 사람은 레퍼런스가 없어 컷마다 다른 얼굴이 된다.
    // 초점(무엇을 따라가는지)을 선언해도 줄지 않아, 그림 지시에서 직접 막는다.
    const cut = { idx: 0, sentence: "문장.", shows: "손님이 코트를 들고 들어오는 미디엄 샷", ref_ids: ["c1"] };
    const p = buildImagePrompt(cut, project, [{ path: "/x/a.jpg", kind: "person", who: "30대 남성 손님" }]);
    expect(p).toMatch(/no other people/i);
  });

  it("인물 레퍼런스가 없는 컷에는 그 말을 넣지 않는다 — 거리 풍경에서 행인까지 지운다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "성수동 골목 풀 샷" };
    expect(buildImagePrompt(cut, project, [])).not.toMatch(/no other people/i);
    expect(buildImagePrompt(cut, project, [{ path: "/x/p.jpg", kind: "thing" }])).not.toMatch(/no other people/i);
  });

  it("레퍼런스가 없으면 첨부를 가리키는 말을 넣지 않는다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "빈 매장 풀 샷" };
    const p = buildImagePrompt(cut, project, []);
    expect(p).not.toMatch(/attached/i);
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
