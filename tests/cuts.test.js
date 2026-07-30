import { describe, it, expect, vi } from "vitest";
import { splitSentences, splitUnits, explodeLongRanges, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, stillOnly, clauseBoundaries } from "../lib/cuts.js";
import { I2V_STEPS, I2V_MAX_SECONDS } from "../lib/clip-limits.js";
import { STYLE_PRESETS } from "../lib/styles.js";

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

describe("splitUnits — 긴 문장은 절로 나눈다", () => {
  // 8초(= 공백 빼고 44자)를 넘는 문장만 나눈다. 짧은 문장은 통째로 둔다.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  it("짧은 문장은 통째로 둔다", () => {
    const text = "30ml에 39,000원입니다. 재구매가 많습니다.";
    expect(splitUnits(text)).toEqual(["30ml에 39,000원입니다.", "재구매가 많습니다."]);
  });

  it("8초를 넘는 문장은 여러 조각이 된다", () => {
    const units = splitUnits(LONG);
    expect(units.length).toBeGreaterThan(1);
  });

  it("★ 이어붙이면 원문과 같다 — 이 파이프라인의 유일한 구조적 보장이다", () => {
    expect(splitUnits(LONG).join(" ")).toBe(LONG);
  });

  it("쉼표 뒤에서 나뉜다", () => {
    const units = splitUnits(LONG);
    expect(units.some((u) => u.endsWith(","))).toBe(true);
  });

  it("연결어미 뒤에서 나뉜다", () => {
    const units = splitUnits(LONG);
    expect(units.some((u) => u.endsWith("바르고"))).toBe(true);
  });

  it("너무 짧은 조각은 앞에 붙인다 — 한두 낱말짜리 컷은 쓸모가 없다", () => {
    // "자면" 처럼 한 낱말만 떨어지는 자리가 생긴다. 그런 조각은 앞 조각에 붙인다.
    expect(splitUnits(LONG).every((u) => u.replace(/\s/g, "").length >= 6)).toBe(true);
  });

  it("나눌 자리가 없는 긴 문장은 통째로 둔다 — 쪼갤 수 없는 문장도 있다", () => {
    const noBreak = "아주아주아주아주아주아주아주아주아주아주아주아주아주아주긴한덩어리입니다.";
    expect(splitUnits(noBreak)).toEqual([noBreak]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(splitUnits("")).toEqual([]);
    expect(splitUnits(null)).toEqual([]);
  });

  it("★ 연속 공백·탭이 있어도 이어붙이면 원문과 같다", () => {
    // 자를 자리를 한 칸 공백으로 제한하고 원본에서 잘라내면 성립한다.
    // 토큰을 다시 이어 붙이면 여기서 깨진다.
    const messy = "이 앰플은  PDRN과 엑소좀, 시카가\t함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    expect(splitUnits(messy).join(" ")).toBe(messy);
  });

  it("두 칸 공백 자리에서는 자르지 않는다 — 이으면 복원할 수 없다", () => {
    // "바르고" 뒤가 두 칸이면 그 자리는 후보에서 빠진다.
    const twoSpaces = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고  자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    expect(splitUnits(twoSpaces).join(" ")).toBe(twoSpaces);
  });
});

describe("buildSplitMessages", () => {
  const sentences = splitSentences(project.script.text);

  it("번호를 매겨 문장을 준다 — 경계를 번호로 이야기하기 위해서다", () => {
    const user = buildSplitMessages(sentences).messages[0].content;
    expect(user).toContain("1. 매일 아침 딸기를 갈아 씁니다.");
    expect(user).toContain("3. 성수역 3번 출구에서 2분입니다.");
    expect(user).toContain("조각 3개");
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
    expect(system).toContain("8초");
    // 컷은 조각보다 잘게 쪼개질 수 없다 — 이제 쪼개는 것은 코드(splitUnits)이고,
    // LLM에게는 "조각을 고쳐 쓰지 않는다(경계만 고른다)"로 같은 보장이 전달된다
    expect(system).toContain("조각을 고쳐 쓰지 않는다");
  });

  it("모델이 만들 수 있는 길이를 사실로 알려 준다 — 눈금에서 읽는다", () => {
    const { system } = buildSplitMessages(["한 문장."]);
    // lib/clip-limits.js 의 눈금(지금 6·8·10…20)에서 하한·상한을 읽어야 한다.
    // 숫자를 프롬프트에 박으면 모델을 바꿀 때 지시가 어긋난다.
    expect(system).toContain(String(I2V_STEPS[0]));
    expect(system).toContain(String(I2V_MAX_SECONDS));
  });

  it("길이를 맞추려고 장면을 붙이거나 끊지 말라고 못 박는다", () => {
    // 나누는 것은 시나리오다. 모델 길이는 목표가 아니라 고려할 사실이다.
    expect(buildSplitMessages(["한 문장."]).system).toContain("억지로");
  });

  it("화면이 바뀌는 자리에서 끊으라는 규칙은 그대로다", () => {
    expect(buildSplitMessages(["한 문장."]).system).toContain("화면이 바뀔 자리");
  });

  // 대본은 모델을 모르고 컷 분할부터 안다. 모델을 바꾸면 이 문장이 따라 움직여야 한다 —
  // Kling 은 하한이 3초라 짧은 컷을 만드는 데 주저할 이유가 없다(LTX 하한 6초에서는 손실이었다).
  it("모델을 바꾸면 알려 주는 길이도 바뀐다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    try {
      const { system } = buildSplitMessages(["한 조각."]);
      expect(system).toContain("3~15초");
      expect(system).not.toContain("6~20초");
    } finally {
      delete process.env.FAL_I2V_ENDPOINT;
    }
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

  it("화면 안에 읽히는 글자·숫자를 요구하지 말라고 한다", () => {
    // 이미지 프롬프트에 이미 no text or letters 가 있는데도 가격표에 79,000원이 나왔다
    // (대본은 39,000원). 같은 프롬프트의 장면 서술이 글자를 요구해 두 지시가 모순됐고
    // 장면이 이겼다. 막을 자리는 shows 다.
    const { system } = buildShowsMessages(project, [{ sentence: "한 문장." }]);
    expect(system).toContain("가격표");
    expect(system).toContain("자막");
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

describe("explodeLongRanges — 8초를 넘고 두 조각 이상이면 푼다", () => {
  // secondsForText 는 공백을 빼고 5.5자/초로 센다(2~15초로 묶임).
  // 22자 → 4초, 44자 → 8초, 66자 → 12초, 55자 → 10초.
  const A = "가".repeat(22);
  const B = "나".repeat(22);
  const C = "다".repeat(22);
  const LONE = "라".repeat(55);   // 조각 하나로 10초 — 더 쪼갤 수 없다
  const units = [A, B, C, LONE];

  it("8초를 넘고 세 조각이면 조각 단위로 전부 푼다", () => {
    // 1~3 = 66자 = 12초
    const out = explodeLongRanges([{ from: 1, to: 3 }, { from: 4, to: 4 }], units);
    expect(out).toEqual([
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }, { from: 4, to: 4 },
    ]);
  });

  it("8초 이하면 묶음이 살아남는다 — 합치기가 없어지는 것이 아니라 예외가 된다", () => {
    // 1~2 = 44자 = 8초(초과 아님) · 3~4 = 77자 = 14초(초과)
    const out = explodeLongRanges([{ from: 1, to: 2 }, { from: 3, to: 4 }], units);
    expect(out).toEqual([
      { from: 1, to: 2 }, { from: 3, to: 3 }, { from: 4, to: 4 },
    ]);
  });

  it("조각 하나짜리는 8초를 넘어도 그대로 둔다 — 되물어도 답이 같다", () => {
    // LONE 하나가 원고 전부인 경우다. 55자 = 10초로 8초를 넘지만 더 쪼갤 수 없다.
    expect(explodeLongRanges([{ from: 1, to: 1 }], [LONE])).toEqual([{ from: 1, to: 1 }]);
  });

  it("빈틈도 겹침도 만들지 않는다 — 원고 보존의 전제다", () => {
    const out = explodeLongRanges([{ from: 1, to: 3 }, { from: 4, to: 4 }], units);
    let expected = 1;
    for (const r of out) {
      expect(r.from).toBe(expected);
      expected = r.to + 1;
    }
    expect(expected).toBe(units.length + 1);
  });

  it("망가진 입력은 빈 배열로 떨어뜨린다 — 부르는 쪽이 폴백을 쥔다", () => {
    expect(explodeLongRanges(null, units)).toEqual([]);
    expect(explodeLongRanges([{ from: 0, to: 2 }], units)).toEqual([]);
    expect(explodeLongRanges([{ from: 1, to: 9 }], units)).toEqual([]);
    expect(explodeLongRanges([{ from: 2, to: 1 }], units)).toEqual([]);
  });
});

describe("clauseBoundaries — 절 경계 위치", () => {
  // 위치만 돌려준다. 자막은 이 후보 중에서 폭을 보고 고른다 — 조각을 받으면 다시
  // 이어 붙였다 자르는 일이 생기고, 그때 원문 보존이 깨질 자리가 난다.
  it("연결어미와 쉼표 뒤를 후보로 돌려준다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const at = clauseBoundaries(s);
    expect(at.length).toBeGreaterThanOrEqual(2);
    // 각 위치는 뒤 조각의 시작이다 — 그 자리에서 자르면 앞이 어미로 끝난다
    expect(s.slice(0, at[0]).trim().endsWith("달아오르고")).toBe(true);
    expect(s.slice(at[0], at[1]).trim().endsWith("날,")).toBe(true);
  });

  it("오름차순이고 문장 안에 있다", () => {
    const s = "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    const at = clauseBoundaries(s);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    for (const x of at) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(s.length);
    }
  });

  it("자를 자리가 없으면 빈 배열이다", () => {
    expect(clauseBoundaries("환절기 아침입니다.")).toEqual([]);
    expect(clauseBoundaries("")).toEqual([]);
  });

  // 6자 하한이 오검출을 걸러 준다 — "라면"·"장면"처럼 어미가 아닌 것도 어절 끝에서는 걸린다
  it("앞 조각이 6자(공백 제외) 미만이면 후보가 아니다", () => {
    expect(clauseBoundaries("라면 먹고 갈래요?")).toEqual([]);
  });
});

describe("splitClauses 는 clauseBoundaries 위에서 그대로 돈다", () => {
  // 리팩터링이 컷 분할 동작을 바꾸지 않았다는 증거. splitUnits 가 splitClauses 를 쓴다.
  it("경계 위치로 자른 것과 splitUnits 의 조각이 같다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 되고 다음 날 아침 당김이 덜하다는 후기가 많고 재구매도 잦습니다.";
    const at = clauseBoundaries(s);
    // 컷 조각은 구분 공백을 품지 않는다 — 경계 앞 한 칸을 빼고 잘라야 splitUnits 와 같아진다
    const byPos = [];
    let start = 0;
    for (const pos of at) { byPos.push(s.slice(start, pos - 1)); start = pos; }
    byPos.push(s.slice(start));
    const units = splitUnits(s);
    expect(units.join(" ")).toBe(s);      // 컷의 계약
    expect(byPos.join(" ")).toBe(s);      // 위치로 자른 것도 같은 계약을 지킨다
    expect(units).toEqual(byPos);         // 조각이 글자 그대로 같다
  });
});

describe("buildImagePrompt — 화풍", () => {
  const cut = { idx: 0, sentence: "매일 아침 딸기를 갈아 씁니다.", shows: "딸기 과육이 우유에 섞이는 클로즈업" };
  const withStyle = (preset, note) => ({
    ...project,
    settings: { ...project.settings, style: note === undefined ? { preset } : { preset, note } },
  });

  // ★ 회귀의 방어선. 화풍을 도입하기 전 이 함수가 내던 문장 그대로다. 실사 프로젝트의
  //   그림이 달라지면 안 된다 — 사장님이 이미 완성한 영상을 다시 만들게 하는 일이다.
  it("실사는 화풍 도입 전과 글자 그대로 같은 프롬프트를 낸다", () => {
    const expected =
      "High-quality photographic still for a short-form video, vertical 9:16 composition. " +
      "Scene: 딸기 과육이 우유에 섞이는 클로즈업. " +
      "The video's subject is: 생딸기라떼. Keep this exact product/subject consistent in every scene. " +
      "Cinematic lighting, realistic, no text or letters in the image.";
    expect(buildImagePrompt(cut, project)).toBe(expected);          // 화풍을 안 고른 프로젝트
    expect(buildImagePrompt(cut, withStyle("photo"))).toBe(expected); // 실사를 고른 프로젝트
  });

  it("고른 화풍이 그림의 종류와 마감을 정한다", () => {
    const p = buildImagePrompt(cut, withStyle("anime"));
    expect(p).toContain("Anime-style animation still");
    expect(p).toContain("cel shading");
    expect(p).not.toContain("photographic still");
    expect(p).not.toContain("Cinematic lighting, realistic");
  });

  it("모든 컨셉이 서로 다른 프롬프트를 낸다", () => {
    const all = STYLE_PRESETS.map((s) => buildImagePrompt(cut, withStyle(s.id)));
    expect(new Set(all).size).toBe(STYLE_PRESETS.length);
  });

  // 가짜 모드 플레이스홀더가 프롬프트를 역파싱한다(lib/imagegen.js). 문형이 깨지면
  // 0원 확인이 조용히 쓸모없어진다 — 주석으로 적어 두는 것은 판정이 아니다.
  it("어떤 컨셉에서도 가짜 모드가 장면을 뽑아낼 수 있다", () => {
    const SCENE = /Scene:\s*(.+?)\.\s/;
    for (const s of STYLE_PRESETS) {
      const p = buildImagePrompt(cut, withStyle(s.id, "따뜻한 파스텔톤"));
      expect(p.match(SCENE)?.[1], `${s.id} 에서 장면을 못 뽑는다`).toBe("딸기 과육이 우유에 섞이는 클로즈업");
    }
  });

  it("보정 한 줄이 프롬프트에 실린다", () => {
    expect(buildImagePrompt(cut, withStyle("illust", "따뜻한 파스텔톤"))).toContain("따뜻한 파스텔톤");
  });

  // 보정은 우리 지시를 지울 수 없어야 한다. 위치가 그것을 보장한다 —
  // 금지 문구를 포함한 꼬리는 항상 코드가 보정 **뒤에** 붙인다.
  it("보정 뒤에 마감과 글자 금지가 온다", () => {
    const p = buildImagePrompt(cut, withStyle("illust", "따뜻한 파스텔톤"));
    expect(p.indexOf("따뜻한 파스텔톤")).toBeLessThan(p.indexOf("soft pastel palette"));
    expect(p.indexOf("따뜻한 파스텔톤")).toBeLessThan(p.indexOf("no text or letters"));
  });

  it("보정이 없으면 아무 절도 늘지 않는다", () => {
    expect(buildImagePrompt(cut, withStyle("anime", ""))).toBe(buildImagePrompt(cut, withStyle("anime")));
    expect(buildImagePrompt(cut, withStyle("anime"))).not.toContain("Style note");
  });

  // 전 컷 공통 보정과 컷 하나의 재생성 지시는 다른 것이다. 서로 덮으면 사장님이 고친 것이
  // 사라진다 — 한쪽은 화풍, 한쪽은 "이 컷만 이렇게".
  it("보정과 컷 수정 지시가 함께 실린다", () => {
    const p = buildImagePrompt({ ...cut, edit_instruction: "딸기를 더 크게" }, withStyle("illust", "따뜻한 파스텔톤"));
    expect(p).toContain("따뜻한 파스텔톤");
    expect(p).toContain("딸기를 더 크게");
  });

  it("모르는 화풍은 실사로 그린다 — 그림이 안 나오는 것보다 낫다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(buildImagePrompt(cut, withStyle("클레이애니"))).toBe(buildImagePrompt(cut, project));
  });
});

describe("화면 설계가 연출 바람을 받는다", () => {
  const cuts = [{ idx: 0, sentence: "검정에 빨강. 이 배색이 오래 사랑받았다." }];
  const withDirection = {
    ...project,
    briefing: {
      topic: "하이톱 농구화 광고",
      direction: "로우 앵글 트래킹, 급격한 크로스오버, 마찰 먼지, 역광 실루엣, 절정만 극단적 슬로모션",
    },
  };

  // ★ 이것이 없던 동안 사장님이 쓴 연출이 화면 설계에 한 글자도 도달하지 않았다.
  //   자료 원문은 대본에만 전달됐고, 거기서 낭독으로 변했다(2026-07-30 실제 생성물).
  //   그래서 화면은 전부 무난하고 움직임은 전부 "천천히"였다.
  it("연출 바람이 지시문에 실린다", () => {
    const user = buildShowsMessages(withDirection, cuts).messages[0].content;
    expect(user).toContain("역광 실루엣");
    expect(user).toContain("급격한 크로스오버");
  });

  it("연출 바람이 없으면 그 블록째 빠진다 — 지금 동작 그대로", () => {
    const user = buildShowsMessages(project, cuts).messages[0].content;
    expect(user).not.toContain("연출 바람");
  });

  it("연출 바람을 우선하라고 지시한다", () => {
    const { system } = buildShowsMessages(withDirection, cuts);
    expect(system).toContain("연출 바람");
  });

  // 사장님의 연출 바람이 못 그리는 것을 요구할 수도 있다("가격표가 보이게", "거울에 비치게").
  // 그때 따르면 이 저장소가 값을 치르며 배운 것을 되돌린다 — 금지는 연출 바람보다 위다.
  it("금지된 것은 연출 바람보다 위라고 못 박는다", () => {
    const { system } = buildShowsMessages(withDirection, cuts);
    const idx = system.indexOf("연출 바람");
    const near = system.slice(idx, idx + 500);
    expect(near).toMatch(/글자|거울|금지|따르지 않는다/);
  });
});

describe("화면 설계가 컷마다 속도를 답한다", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];

  it("속도를 닫힌 목록으로 요구한다", () => {
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toContain('"speed"');
    for (const id of ["static", "slow", "realtime", "fast", "extreme_slowmo"]) {
      expect(system, id).toContain(id);
    }
  });

  it("대비를 요구한다 — 빠른 컷이 있어야 느린 컷이 산다", () => {
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toMatch(/대비|같은 속도로 두지 않는다/);
  });
});

describe("클립 요청이 속도를 반영한다", () => {
  it("극단적 슬로모션이 클립 프롬프트에 실린다", () => {
    const p = buildClipPrompt({ motion: "미드솔이 눌린다", speed: "extreme_slowmo" });
    expect(p).toContain("extreme slow motion");
    expect(p).toContain("미드솔이 눌린다");
  });

  it("빠른 컷도 실린다", () => {
    expect(buildClipPrompt({ motion: "발이 방향을 튼다", speed: "fast" })).toContain("fast, explosive");
  });

  // 속도가 없던 옛 컷은 지금까지와 같은 프롬프트를 받아야 한다 — 클립을 다시 사게 하지 않는다
  it("속도가 없으면 문구가 늘지 않는다", () => {
    const before = buildClipPrompt({ motion: "천천히 다가간다" });
    expect(before).not.toContain("slow, deliberate");
    expect(before).toContain("천천히 다가간다");
  });
});

describe("이미지의 주제 앵커는 제품이다", () => {
  const cut = { idx: 0, sentence: "문장.", shows: "신발 클로즈업" };

  // ★ 자료가 기획서였을 때 topic 이 "신발을 주인공으로 한 감각적인 광고 영상" 이 됐고,
  //   그것이 "이 제품을 전 컷에서 일관되게 유지하라"의 대상으로 들어갔다(2026-07-30 실측).
  //   앵커가 기획 문구면 컷 간 제품 일관성이 그 자리에서 깨진다.
  it("초점의 대상을 주제보다 먼저 쓴다", () => {
    const p = {
      settings: { aspect_ratio: "9:16" },
      briefing: { topic: "신발을 주인공으로 한 감각적인 광고 영상", focus: { mode: "물건", subject: "검정+빨강 하이톱 농구화" } },
    };
    const prompt = buildImagePrompt(cut, p);
    expect(prompt).toContain("검정+빨강 하이톱 농구화");
    expect(prompt).not.toContain("감각적인 광고 영상");
  });

  it("초점이 없으면 주제로 떨어진다 — 지금 동작 그대로", () => {
    const p = { settings: { aspect_ratio: "9:16" }, briefing: { topic: "생딸기라떼" } };
    expect(buildImagePrompt(cut, p)).toContain("생딸기라떼");
  });

  // 사람 영상의 subject 는 인물이다. 그것을 "이 제품을 유지하라"의 대상으로 쓰면 틀린 지시가 된다.
  it("초점이 사람이면 주제를 쓴다", () => {
    const p = {
      settings: { aspect_ratio: "9:16" },
      briefing: { topic: "옷 수선집 이야기", focus: { mode: "사람", subject: "50대 남성 주인" } },
    };
    const prompt = buildImagePrompt(cut, p);
    expect(prompt).toContain("옷 수선집 이야기");
    expect(prompt).not.toContain("50대 남성 주인");
  });
});

describe("물건 초점이어도 제품이 쓰이는 모습을 보여준다", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];

  // ★ 실측: 초점이 물건("신발")이었더니 6컷 중 사람이 나오는 컷이 1개뿐이고
  //   나머지는 신발·발 클로즈업이었다. 광고에서 제품은 쓰이는 모습으로 팔린다.
  it("클로즈업이 절반을 넘지 않게, 대부분은 넓은 샷으로 지시한다", () => {
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toContain("절반을 넘지 않게");
    expect(system).toContain("넓은 샷");
    // 제품이 사람이 쓰는 장면 안에 있어야 한다는 것이 요점이다
    expect(system).toMatch(/사람이 쓰는|사람이 무엇을 하는지/);
  });
});

describe("이미지 프롬프트가 무대를 함께 준다", () => {
  const cut = { idx: 0, sentence: "문장.", shows: "선수의 발목 미디엄 샷" };
  const p = { settings: { aspect_ratio: "9:16" }, briefing: { topic: "농구화" } };

  it("무대가 프롬프트에 실린다", () => {
    const prompt = buildImagePrompt({ ...cut, environment: "실내 농구 코트, 야간, 강한 스포트라이트" }, p);
    expect(prompt).toContain("실내 농구 코트, 야간, 강한 스포트라이트");
  });

  it("무대가 없으면 문구가 늘지 않는다 — 옛 컷의 그림이 달라지지 않게", () => {
    expect(buildImagePrompt(cut, p)).not.toContain("Setting");
  });

  // 가짜 모드가 프롬프트에서 장면을 역파싱한다(lib/imagegen.js) — 무대를 끼워도 깨지지 않아야 한다
  it("무대를 넣어도 가짜 모드가 장면을 뽑아낼 수 있다", () => {
    const prompt = buildImagePrompt({ ...cut, environment: "실내 농구 코트, 야간" }, p);
    expect(prompt.match(/Scene:\s*(.+?)\.\s/)?.[1]).toBe("선수의 발목 미디엄 샷");
  });
});

describe("화면 설계가 무대를 하나 정한다", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];

  it("무대를 요구한다", () => {
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toContain('"environment"');
  });

  it("컷마다 장소·시간대를 새로 만들지 말라고 못 박는다", () => {
    const { system } = buildShowsMessages(project, cuts);
    expect(system).toMatch(/컷마다.*(장소|시간대|무대)|새로 만들지 않는다/);
  });
});

describe("지문이 스스로 모순되지 않는다", () => {
  // ★ 무대를 하나로 정하라면서 바로 아래에서 "조명을 컷에 맞게 적는다(골든아워·한낮·황혼)"고
  //   했다. 그것이 드리프트의 프롬프트 측 원인이었다 — 실측에서 한낮·노을·실내가 섞였다.
  it("시간대·날씨를 컷마다 적으라고 하지 않는다", () => {
    const { system } = buildShowsMessages(project, [{ idx: 0, sentence: "가." }]);
    expect(system).toContain("시간대·날씨는 shows 에 적지 않는다");
    // 무대 규칙과 shows 규칙이 같은 방향을 봐야 한다
    expect(system).toContain("컷마다 장소·시간대를 새로 만들지 않는다");
  });
});
