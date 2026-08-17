import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitSentences, splitUnits, explodeLongRanges, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, stillOnly, clauseBoundaries, usableTone, usableTransition, allocateCutSeconds, fillSilentCuts, CONTENT_MAX_SECONDS, stageOf, castLooksOf, subjectOf, orientOf } from "../lib/cuts.js";
import { clipProfileForProject, minSecondsFor, maxSecondsFor } from "../lib/clip-limits.js";
import { STYLE_PRESETS } from "../lib/styles.js";
import { MOTION_AXES } from "../lib/motion.js";
// 언어 테스트가 샷 크기 낱말을 손으로 적지 않고 목록에서 끌어온다 — 지문과 판정기가 갈리면
// shotBalance 가 조용히 죽는다(2026-08-17 에 "한국어 섬"을 걷은 자리)
import { SHOT_SIZES } from "../lib/shots.js";
import { motionFields, motionRules, speedRule } from "../lib/cuts.js";
import { SPEEDS } from "../lib/speeds.js";
// 관통 테스트라 파일 경계를 넘는다 — 화면 설계(validate) → 그림 프롬프트(cuts) → 각인(steps).
import { validateShows } from "../lib/validate.js";
import { toneKey, clipKey } from "../lib/steps.js";

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

  it("모델이 만들 수 있는 길이를 사실로 알려 준다 — 그 프로젝트의 프로필에서 읽는다", () => {
    const seedance = { settings: { i2v_model: "seedance-2.0" } };
    const { system } = buildSplitMessages(["한 문장."], seedance);
    // **그 프로젝트가 쓰는 모델**의 하한·상한이어야 한다. 숫자를 프롬프트에 박으면 모델을
    // 바꿀 때 지시가 어긋난다. 이 테스트도 한때 LTX 상수(6·20)를 읽고 있었는데, 기본
    // 엔드포인트가 Kling(3~15)으로 바뀌자 코드는 맞고 테스트만 틀렸다 —
    // 읽는 곳을 코드와 같게 둔다.
    const profile = clipProfileForProject(seedance);
    expect(system).toContain(String(minSecondsFor(profile)));
    expect(system).toContain(String(maxSecondsFor(profile)));
  });

  it("길이를 맞추려고 장면을 붙이거나 끊지 말라고 못 박는다", () => {
    // 나누는 것은 시나리오다. 모델 길이는 목표가 아니라 고려할 사실이다.
    expect(buildSplitMessages(["한 문장."]).system).toContain("억지로");
  });

  it("화면이 바뀌는 자리에서 끊으라는 규칙은 그대로다", () => {
    expect(buildSplitMessages(["한 문장."]).system).toContain("화면이 바뀔 자리");
  });

  // 대본은 모델을 모르고 컷 분할부터 안다. 프로젝트가 모델을 바꾸면 이 문장이 따라 움직여야
  // 한다 — Kling 하한은 3초, Seedance 하한은 4초라 실제로 달라지는 문장이다.
  it("프로젝트의 모델에 따라 알려 주는 길이가 바뀐다", () => {
    const seedance = buildSplitMessages(["한 조각."], { settings: { i2v_model: "seedance-2.0" } }).system;
    expect(seedance).toContain("4~15초");

    const kling = buildSplitMessages(["한 조각."], { settings: { i2v_model: "kling-v3" } }).system;
    expect(kling).toContain("3~15초");
  });

  // ★★ project 를 안 넘긴 호출은 레거시(Kling)로 떨어진다 — generateClip 과 같은 규칙이다.
  // 옛 프로젝트가 조용히 다른 모델의 눈금으로 분할되면 안 된다.
  it("project 가 없으면 레거시(Kling) 눈금으로 알려 준다", () => {
    expect(buildSplitMessages(["한 조각."]).system).toContain("3~15초");
    expect(buildSplitMessages(["한 조각."], { settings: {} }).system).toContain("3~15초");
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

  it("화면 설계 목록에서 무음 컷이 자기 자리를 갖는다", () => {
    const cuts = [{ idx: 0, silent: true, sentence: "" }, { idx: 1, sentence: "말하는 컷." }];
    const { messages } = buildShowsMessages({ ...project }, cuts);
    expect(messages[0].content).toContain("(말 없는 장면)");
    expect(messages[0].content).toContain("말하는 컷.");
  });

  it("shows 작법을 지시한다 — 샷 크기·앵글·조명, 부정형 금지, 삽화 금지", () => {
    const { system } = buildShowsMessages(project, cuts);
    // 샷 크기 낱말도 영어다 — lib/shots.js 의 SHOT_SIZES 가 영어를 함께 보게 되면서
    // "한국어 섬"이 없어졌다(2026-08-17 언어 정책). 낱말은 아래 언어 절이 목록과 대조한다.
    for (const term of ["extreme close-up", "medium shot", "wide shot", "low angle", "golden hour"]) {
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

  // ★ 최종 리뷰가 찾은 문제(2026-08-14): 폴백 사슬의 마지막 칸이 `cut.sentence` 인데
  //   **무음 컷에는 문장이 없다.** 화면 설계가 통째로 실패하면(validateShows 는 shows 가
  //   한 칸이라도 비면 null 을 준다) 말하는 컷은 문장으로 내려앉지만 무음 컷은 빈손으로
  //   내려앉아 `Scene: .` 이 된다 — 주어 없는 그림 한 장($0.08)과 클립을 그걸로 산다.
  it("무음 컷은 화면 설계가 실패해도 그릴 대상이 남는다 — 문장이 없다", () => {
    const cut = { idx: 0, sentence: "", silent: true };
    const p = buildImagePrompt(cut, project);
    expect(p).not.toMatch(/Scene:\s*\./);
    expect(p).toContain("생딸기라떼"); // briefing.topic 이 마지막 버팀목이다
  });

  it("무음 컷도 shows 가 있으면 그것을 그대로 쓴다", () => {
    const cut = { idx: 0, sentence: "", silent: true, shows: "빈 매장 풀 샷" };
    expect(buildImagePrompt(cut, project)).toContain("빈 매장 풀 샷");
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

  // ★ 말하지 않는 모델에서는 지금 동작 그대로여야 한다 — 옛 각인이 통째로 낡으면
  // 이미 값을 치른 클립을 다시 사게 된다
  it("project 를 안 넘기면 예전과 같다 — 립싱크를 금지한다", () => {
    const p = buildClipPrompt({ motion: "카메라가 천천히 뒤로 물러난다" });
    expect(p).toContain("No talking faces or lip sync");
    expect(p).not.toContain("says");
  });

  // 픽스처는 Seedance 쪽과 **모델만** 다르다 — cuts 를 빼면 "프로필이 말하지 않아서"와
  // "컷이 없어서"가 섞여, 프로필이 speaks:true 로 잘못 뒤집혀도 이 테스트가 통과한다
  it("말하지 않는 모델(Kling)에서도 예전과 같다", () => {
    const kling = {
      settings: { i2v_model: "kling-v3" },
      cuts: [{ idx: 0, sentence: "안녕하세요" }],
      cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
    };
    const p = buildClipPrompt({ idx: 0, motion: "천천히", sentence: "안녕하세요" }, kling);
    expect(p).toContain("No talking faces or lip sync");
  });

  describe("말하는 모델(Seedance)", () => {
    // projectSpeaks 는 "모든 컷에 말할 사람과 대사가 있는가"를 보므로 cuts 도 있어야 한다
    const project = {
      settings: { i2v_model: "seedance-2.0" },
      cuts: [{ idx: 0, sentence: "안녕하세요" }],
      cast: [{ id: "c1", who: "20대 동양인 남성 농구 선수", voice: "중저음, 차분하고 단단한 톤", cuts: [0] }],
    };

    it("대사를 원문 그대로 싣는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "검정에 빨강. 이 배색이 제일 오래 사랑받았다.", motion: "천천히" }, project);
      expect(p).toContain("검정에 빨강. 이 배색이 제일 오래 사랑받았다.");
    });

    it("목소리와 인물을 함께 싣는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("중저음, 차분하고 단단한 톤");
      expect(p).toContain("20대 동양인 남성 농구 선수");
    });

    // ★★ 립싱크 금지가 남아 있으면 모델에게 반대되는 지시를 함께 준다
    it("립싱크 금지를 빼고 말하라고 한다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).not.toContain("No talking faces");
      expect(p).not.toContain("no lip sync");
    });

    // ★ 자막은 우리가 태운다 — 클립에 글자를 요구하지 않는다(한글이 변형된다)
    it("글자 금지는 그대로 남는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("No text or letters");
    });

    it("이 컷에 인물이 없으면 말하지 않는다", () => {
      const p = buildClipPrompt({ idx: 5, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("No talking faces or lip sync");
    });

    it("문장이 없으면 말하지 않는다", () => {
      const p = buildClipPrompt({ idx: 0, motion: "천천히" }, project);
      expect(p).toContain("No talking faces or lip sync");
    });

    // ★★ 2026-08-17 전제 정정 — 화면 밖 목소리는 **클립이 읽는다**(광고에서 흔한 기법).
    //    2026-08-16 웨이브는 미검증 능력이라 보고 이 컷을 침묵시켰다. 그 전제가 틀렸다.
    describe("★ 화면 밖 목소리(내레이션) 갈래", () => {
      const narrated = {
        ...project,
        scenario: { narrator_voice: "차분한 30대 남성, 낮고 단단한 톤" },
        cuts: [{ idx: 0, sentence: "안녕하세요", narration: true }],
      };
      const cut = { idx: 0, sentence: "안녕하세요", narration: true, motion: "천천히" };

      it("보이스오버로 읽게 하고 입모양은 요구하지 않는다", () => {
        const p = buildClipPrompt(cut, narrated);
        expect(p).toContain("A narrator speaks in voiceover, off-screen");
        expect(p).toContain("no one in frame speaks or moves their lips");
        // 화면에 사람이 없는데 립싱크를 시키면 모델이 없는 사람을 만들어 넣는다
        expect(p).not.toContain("speaks to the camera");
      });

      it("대사를 원문 그대로, 내레이터 목소리와 함께 싣는다", () => {
        const p = buildClipPrompt(cut, narrated);
        expect(p).toContain('Says exactly, in Korean: "안녕하세요"');
        expect(p).toContain("Voice: 차분한 30대 남성, 낮고 단단한 톤.");
        // 캐스팅 인물의 목소리가 아니다 — 화면에 없는 사람이다
        expect(p).not.toContain("중저음, 차분하고 단단한 톤");
        expect(p).not.toContain("20대 동양인 남성 농구 선수: ");
      });

      // 옛 프로젝트(narrator_voice 가 없다)도 대사는 실린다 — 목소리 절만 안 붙는다
      it("내레이터 목소리가 없으면 그 절만 빠진다", () => {
        const p = buildClipPrompt(cut, { ...narrated, scenario: null });
        expect(p).toContain("A narrator speaks in voiceover, off-screen");
        expect(p).toContain('Says exactly, in Korean: "안녕하세요"');
        expect(p).not.toContain("Voice:");
      });
    });
  });
});

describe("buildClipPrompt — 클립도 무대와 인물을 받는다", () => {
  const project = {
    settings: { aspect_ratio: "9:16", i2v_model: "kling-v3" },
    briefing: { topic: "스포츠카", focus: { mode: "물건", subject: "빨간 스포츠카", look: "매끈한 2도어 쿠페" } },
    cast: [{ who: "20대 남성", look: "검정 재킷", cuts: [0] }],
  };
  const cut = { idx: 0, motion: "빠른 속도로 도로를 질주한다", speed: "fast", environment: "해질녘 해안 도로", tone: "차가운 색감" };

  it("움직임이 맨 앞에 그대로 남는다 — 이 단계는 motion 을 안 건드린다", () => {
    expect(buildClipPrompt(cut, project).startsWith("빠른 속도로 도로를 질주한다. fast, explosive motion.")).toBe(true);
  });

  it("무대·인물·제품·톤이 실린다 — 화면비는 안 실린다(lib/i2v.js 가 API 필드로 이미 보낸다)", () => {
    const p = buildClipPrompt(cut, project);
    expect(p).toContain("해질녘 해안 도로");
    expect(p).toContain("20대 남성: 검정 재킷");
    expect(p).toContain("빨간 스포츠카");
    expect(p).toContain("매끈한 2도어 쿠페");
    expect(p).toContain("차가운 색감");
    expect(p).not.toContain("9:16");
    expect(p).not.toContain("Frame:");
  });

  it("첫 프레임 유지와 금지문은 맨 뒤에 그대로 남는다", () => {
    const p = buildClipPrompt(cut, project);
    expect(p).toContain("The attached image is the first frame");
    expect(p).toContain("No text or letters.");
    expect(p.indexOf("The attached image")).toBeGreaterThan(p.indexOf("해질녘 해안 도로"));
    // ★ 앞의 두 assertion은 맥락이 지시보다 "앞"이라는 것만 본다 — 프롬프트가 정말
    // 금지문에서 "끝나는지"는 안 본다. 나중에 누가 이 뒤에 절을 하나 더 붙이면
    // 위 assertion 은 여전히 통과하므로 여기서 끝을 못 박는다.
    expect(p.endsWith("No talking faces or lip sync.")).toBe(true);
  });

  // ★ 값이 없는 옛 컷의 프롬프트가 길어지면 안 된다 — not.toContain 은 몇 낱말만 가리키므로
  // 골든 문자열로 통째로 고정한다. 이 문자열은 이미 값을 치른 클립들이 각인(clipKey)될 때
  // 찍힌 값 그대로다 — 한 글자라도 바뀌면 그 클립들이 전부 낡아 다시 사게 된다.
  // (커밋 SHA 를 harness 에서 git show 로 불러와 비교하는 방식은 쓰지 않는다 — 이 브랜치가
  // squash 되거나 리베이스되면 그 커밋이 사라져, 회귀가 아닌 실패가 회귀처럼 보인다.)
  it("값이 없으면 절이 안 붙는다 — 옛 컷은 지금과 바이트 그대로 같다(골든 문자열)", () => {
    const bare = { settings: {}, briefing: {} };
    const p = buildClipPrompt({ idx: 0, motion: "천천히 움직인다" }, bare);
    expect(p).toBe(
      "천천히 움직인다. The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters. No talking faces or lip sync."
    );
  });

  it("말하는 경로의 대사·목소리 문구가 안 바뀐다", () => {
    // 말하는-경로 픽스처 — 위 "말하는 모델(Seedance)" 블록과 같은 형태다(projectSpeaks 는
    // 모든 컷에 말할 사람과 대사가 있어야 하므로 project.cuts 도 채운다).
    const speaking = {
      settings: { aspect_ratio: "9:16", i2v_model: "seedance-2.0" },
      briefing: { topic: "스포츠카", focus: { mode: "물건", subject: "빨간 스포츠카", look: "매끈한 2도어 쿠페" } },
      cuts: [{ idx: 0, sentence: "안녕하세요" }],
      cast: [{ id: "c1", who: "20대 동양인 남성 농구 선수", voice: "중저음, 차분하고 단단한 톤", look: "검정 재킷", cuts: [0] }],
    };
    const speakingCut = { idx: 0, sentence: "안녕하세요", motion: "천천히", environment: "해질녘 해안 도로", tone: "차가운 색감" };
    const p = buildClipPrompt(speakingCut, speaking);
    // 대사·목소리는 바이트 그대로 실린다 — 자막(ffmpeg)이 태우는 원고와 갈리면 안 된다
    expect(p).toContain('Says exactly, in Korean: "안녕하세요"');
    expect(p).toContain("중저음, 차분하고 단단한 톤");
    // 그리고 이 경로도 같은 맥락 절을 받는다 — 화면비는 여기도 안 실린다
    expect(p).toContain("해질녘 해안 도로");
    expect(p).toContain("차가운 색감");
    expect(p).not.toContain("9:16");
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

  // ★★ 최종 리뷰가 찾은 Critical(2026-08-14): 모델이 무음 컷을 하나라도 내면
  //   explodeLongRanges 가 빈 배열을 돌려주고, 파이프라인이 "분해 결과가 검사를 통과하지
  //   못해…"를 console.warn 하며 **분해 안 된 경계를 그대로 쓴다.** 8초 강제 분해가
  //   조용히 꺼진다 — 되묻기가 실패해서 만든 그 보장이, 새 기능을 쓰는 바로 그때 열린다.
  //   validateCutRanges 는 무음을 배웠는데 여기는 안 배웠고 둘은 같은 배열을 받는다.
  it("모델이 낸 무음 컷은 그대로 통과시킨다 — 분해 보장이 꺼지면 안 된다", () => {
    // 1~3 = 66자 = 12초(초과) · 사이에 무음 컷 하나
    const out = explodeLongRanges(
      [{ from: 1, to: 3 }, { silent: true }, { from: 4, to: 4 }],
      units
    );
    expect(out).toEqual([
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 },
      { silent: true },
      { from: 4, to: 4 },
    ]);
  });

  it("무음 컷은 조각을 먹지 않는다 — 맨 앞·맨 뒤에 와도 경계가 안 밀린다", () => {
    expect(explodeLongRanges([{ silent: true }, { from: 1, to: 1 }], [LONE]))
      .toEqual([{ silent: true }, { from: 1, to: 1 }]);
    expect(explodeLongRanges([{ from: 1, to: 1 }, { silent: true }], [LONE]))
      .toEqual([{ from: 1, to: 1 }, { silent: true }]);
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

describe("인물 외형이 레퍼런스 없이도 프롬프트에 닿는다", () => {
  // ★ 실측: 캐스팅이 "20대 남성 농구 선수"를 만들었는데 맞는 아바타가 없어 첨부가 비었고,
  //   컷마다 다른 사람이 그려졌다(한 컷은 여성 캐릭터). 사진이 없을 때 일관성을 만들 수 있는
  //   유일한 수단이 외형 서술이다 — 그것이 레퍼런스 첨부와 무관하게 실려야 한다.
  const p = {
    settings: { aspect_ratio: "9:16", style: { preset: "anime", note: "" } },
    briefing: { topic: "농구화" },
    cast: [
      { id: "c1", who: "20대 남성 농구 선수", look: "짧은 검은 머리, 마른 근육형, 검정 민소매 유니폼과 빨강 반바지", cuts: [0, 1] },
      { id: "c2", who: "40대 남성 코치", look: "회색 머리, 통통한 체형, 남색 트레이닝복", cuts: [1] },
    ],
  };

  it("그 컷에 나오는 인물의 외형만 실린다", () => {
    const first = buildImagePrompt({ idx: 0, sentence: "가.", shows: "선수 풀 샷" }, p);
    expect(first).toContain("짧은 검은 머리");
    expect(first).not.toContain("회색 머리");

    const second = buildImagePrompt({ idx: 1, sentence: "나.", shows: "선수와 코치 미디엄 샷" }, p);
    expect(second).toContain("짧은 검은 머리");
    expect(second).toContain("회색 머리");
  });

  it("외형이 없는 인물은 문구를 늘리지 않는다", () => {
    const noLook = { ...p, cast: [{ id: "c1", who: "선수", cuts: [0] }] };
    expect(buildImagePrompt({ idx: 0, sentence: "가.", shows: "선수" }, noLook)).not.toContain("Characters");
  });

  it("캐스팅이 없으면 지금 동작 그대로다", () => {
    const noCast = { settings: p.settings, briefing: p.briefing };
    expect(buildImagePrompt({ idx: 0, sentence: "가.", shows: "신발" }, noCast)).not.toContain("Characters");
  });

  it("가짜 모드가 장면을 뽑아내는 문형이 유지된다", () => {
    const prompt = buildImagePrompt({ idx: 0, sentence: "가.", shows: "선수 풀 샷" }, p);
    expect(prompt.match(/Scene:\s*(.+?)\.\s/)?.[1]).toBe("선수 풀 샷");
  });
});

describe("레퍼런스 지시가 화풍을 따른다", () => {
  const cut = { idx: 0, sentence: "가.", shows: "신발" };
  const styled = (preset) => ({
    settings: { aspect_ratio: "9:16", style: { preset, note: "" } },
    briefing: { topic: "농구화" },
  });

  it("실사에서는 똑같이 그리라고 한다", () => {
    const prompt = buildImagePrompt(cut, styled("photo"), [{ path: "/x/shoe.jpg", kind: "thing" }]);
    expect(prompt).toContain("exactly");
  });

  it("애니에서는 이 화풍으로 다시 그리라고 한다", () => {
    const prompt = buildImagePrompt(cut, styled("anime"), [{ path: "/x/shoe.jpg", kind: "thing" }]);
    expect(prompt).toContain("redraw");
    expect(prompt).not.toContain("exactly");
  });
});

describe("카메라 낱말은 그림 지시에서 지운다", () => {
  // ★ 실측(2026-07-30): shows 가 "로우 앵글 트래킹, 크로스오버로 방향을 트는 선수의 발"이었고
  //   "트래킹"이 그림 지시로 갔다. 정지 이미지 모델은 이동을 그릴 방법이 없어 이동을 **암시**하는
  //   그림을 만든다 — 그 컷에서 **다리가 셋** 나왔다(VLM 은 "오류 없음"으로 통과시켰다).
  //   예전에 "자전거 바퀴가 회전한다"가 페달에서 뗀 발을 만든 것과 같은 패턴이다.
  //
  //   절 전체를 버리지 않는다 — "로우 앵글"은 정당한 구도 서술이라 살려야 한다.
  it("절은 살리고 카메라 낱말만 지운다", () => {
    expect(stillOnly("로우 앵글 트래킹, 크로스오버로 방향을 트는 선수의 발"))
      .toBe("로우 앵글, 크로스오버로 방향을 트는 선수의 발");
  });

  it("여러 카메라 낱말을 지운다", () => {
    for (const [before, after] of [
      ["신발 클로즈업, 카메라가 오빗", "신발 클로즈업"],
      ["선수 풀 샷 팬", "선수 풀 샷"],
      ["발목 클로즈업 줌인", "발목 클로즈업"],
      ["코트 광각 달리 인", "코트 광각"],
      ["선수 미디엄 샷, 핸드헬드", "선수 미디엄 샷"],
    ]) {
      expect(stillOnly(before), before).toBe(after);
    }
  });

  it("낱말을 지우고 남는 것이 없으면 그 절을 버린다", () => {
    expect(stillOnly("트래킹, 선수 풀 샷")).toBe("선수 풀 샷");
  });

  // 2026-08-17 언어 정책으로 shows 가 영어로 나온다. 낱말 목록이 한국어 전용이던 동안
  // 영어 shows 는 카메라 절까지 **통째로** 그림 지시로 갔다 — 위 '다리가 셋'과 같은 자리다.
  describe("영어 shows", () => {
    it("카메라 절을 그림 지시에서 뺀다", () => {
      expect(stillOnly("close-up of the shoe. the camera slowly pushes in"))
        .toBe("close-up of the shoe");
      expect(stillOnly("tracking, full shot of the player")).toBe("full shot of the player");
      expect(stillOnly("the camera")).toBe("");
    });

    it("절은 살리고 카메라 낱말만 지운다 — 앵글은 정당한 구도 서술이다", () => {
      expect(stillOnly("low-angle tracking, feet turning on the crossover"))
        .toBe("low-angle, feet turning on the crossover");
    });

    // 지문의 ✓ 예시가 그대로 통과해야 한다 — 여기가 깎이면 시키는 대로 쓴 shows 가 망가진다
    it("지문이 요구한 형태는 건드리지 않는다", () => {
      for (const ok of [
        "a 7am kitchen, close-up of hands dropping whole strawberries into a blender, first light through the window",
        "an empty pre-dawn shop, full shot, chairs stacked on the tables",
        "close-up of a single ampoule bottle on a table, morning sunlight",
        "medium shot of a woman in her late 20s holding the ampoule bottle and looking at it, smiling",
        "sunlight comes through the window",
        "dust drifts in the light from the window",
        "the shoes are placed on a wooden bench",
      ]) {
        expect(stillOnly(ok), ok).toBe(ok);
      }
    });

    // 움직임은 축이 맡는다 — 축 예시에 있는 말이 shows 에 오면 그림 지시가 아니다
    it("움직임 서술은 뺀다 — 그것은 움직임 축의 자리다", () => {
      for (const s of [
        "the wheel slowly rotates",
        // 속도 부사만이 잡는 절 — 'stretch' 는 움직임 낱말 목록에 없다(한국어 SPEED_ADVERBS 와
        // 같은 자리다: "손이 키보드를 빠르게 치고 있다"를 부사가 잡는다)
        "the shadows slowly stretch across the floor",
        "people pass by outside the window",
        "the cup rises toward her mouth",
        "red puree slowly fills the clear cup",
      ]) {
        expect(stillOnly(s), s).toBe("");
      }
    });

    // 한국어 절과 영어 절은 규칙이 다르다(형태론이 다르다). 섞인 값은 지금까지처럼 한국어로 본다 —
    // 저장된 옛 shows("클로즈업 of hands …")가 그 모양이다
    it("한국어가 섞인 절은 한국어 규칙으로 본다", () => {
      const s = "아침 7시 주방, 클로즈업 of hands dropping strawberries";
      expect(stillOnly(s)).toBe(s);
    });

    // ★ D1(2026-08-17 리뷰 실측) — 한글이 **한 글자**만 섞여도 그 절이 한국어 규칙으로 가고,
    //   한국어 정지형 검사(`~다/요`)에 안 걸려 **무조건 살아남았다**. 사장님이 손으로 고친
    //   shows·모델이 낸 혼합값이 그 모양으로 온다. 게다가 지우는 정규식이 `pushes` 를
    //   못 잡아(`push(?:s|ed)?` — es 가 없었다) 카메라 이동이 그림 지시로 실렸다.
    it("한글이 섞여도 영어 카메라 이동은 새어 들어가지 않는다", () => {
      expect(stillOnly("클로즈업 of the shoe as the camera pushes in")).toBe("");
      expect(stillOnly("클로즈업 of hands, the camera pushes in")).toBe("클로즈업 of hands");
      // 혼합 절도 영어 움직임 검사를 받는다 — 한국어 종결이 아니어서 전부 통과하던 자리다
      expect(stillOnly("미디엄 샷 of a woman who runs")).toBe("");
    });

    // 방향어를 요구하는 낱말의 3인칭 단수형(-es)을 못 잡고 있었다
    it("pushes·crosses 같은 -es 형도 지운다", () => {
      expect(stillOnly("low-angle, the camera pushes in")).toBe("low-angle");
      expect(stillOnly("full shot, pushes in on the outsole")).toBe("full shot");
    });

    // ★ D2 — 낱말만 지웠더니 목적어가 남아 **비문**이 유료 프롬프트로 갔다.
    //   한국어는 이 자리에서 자가교정된다(`카메라가` 를 지워도 `다` 종결이라 정지형 검사로
    //   절이 통째로 빠진다). 영어는 EN_MOTION 이 **이미 지워진 동사**를 못 보므로 무력했다.
    //   가르는 규칙: 낱말을 지운 자리에 **머리를 잃은 기능어**가 남았는가(아래 주석 참고).
    it("낱말을 지워 비문이 되면 그 절을 통째로 버린다", () => {
      expect(stillOnly("wide shot of the court. the camera orbits around the players"))
        .toBe("wide shot of the court");
      expect(stillOnly("full shot. the camera cranes up over the rooftops")).toBe("full shot");
      expect(stillOnly("wide shot. tracking the runner along the fence")).toBe("wide shot");
    });

    // ★ 반대쪽 — 낱말만 지워도 **문장이 성립하는** 잔여물은 살린다. 둘을 가르는 것이
    //   이 규칙의 전부다(앵글·샷 크기를 잃으면 그림이 무난해진다).
    it("문장이 성립하는 잔여물은 살린다", () => {
      expect(stillOnly("low-angle tracking, feet turning on the crossover"))
        .toBe("low-angle, feet turning on the crossover");
      expect(stillOnly("handheld close-up of the hands")).toBe("close-up of the hands");
    });

    // 속도 부사 검사가 정지형 검사보다 **앞선다**(한국어와 같은 순서). 그 순서를 재는
    // 입력이 하나도 없어서 검사를 지워도 전부 그린이었다 — 관측 가능한 갈림을 박는다.
    it("속도 부사는 정지 서술이어도 버린다", () => {
      expect(stillOnly("there is slowly rising steam")).toBe("");
    });

    // 존재 서술(there is/are)은 움직임 낱말이 들어 있어도 정지 그림이다 —
    // 이 항목을 지워도 전부 그린이었다(한국어 '보인다'에 대응하는 자리다).
    it("존재 서술은 움직임 낱말이 있어도 살린다", () => {
      const s = "there is a road that runs past the shop";
      expect(stillOnly(s)).toBe(s);
    });
  });

  // 제품 용어와 겹치는 낱말을 지우면 정당한 화면이 망가진다
  it("정당한 화면은 건드리지 않는다", () => {
    for (const ok of [
      "아침 7시 주방, 딸기를 통째로 갈아 넣는 손 클로즈업, 창으로 든 새벽빛",
      "선수의 전신 풀 샷, 로우 앵글",
      "발목을 덮는 하이톱 클로즈업, 역광",
    ]) {
      expect(stillOnly(ok), ok).toBe(ok);
    }
  });
});

describe("제품 외형이 프롬프트에 실린다", () => {
  // ★ 실측: 제품 서술이 "검정+빨강 하이톱 농구화" 한 줄뿐이라 배색만 맞고 디자인은 모델이
  //   만들었다 — 아식스풍 줄무늬가 나왔다. 인물에 준 look 과 같은 방식이 필요하다.
  const cut = { idx: 0, sentence: "가.", shows: "신발 클로즈업" };
  const p = (focus) => ({ settings: { aspect_ratio: "9:16" }, briefing: { topic: "농구화", focus } });

  it("물건 초점의 외형을 앵커 뒤에 붙인다", () => {
    const prompt = buildImagePrompt(cut, p({
      mode: "물건", subject: "검정+빨강 하이톱 농구화",
      look: "검정 갑피에 빨강 스우시, 빨강 밑창, 발목을 덮는 하이톱, 흰 중창",
    }));
    expect(prompt).toContain("검정+빨강 하이톱 농구화");
    expect(prompt).toContain("빨강 스우시");
  });

  it("외형이 없으면 문구가 늘지 않는다", () => {
    const prompt = buildImagePrompt(cut, p({ mode: "물건", subject: "농구화" }));
    expect(prompt).toContain("농구화");
    expect(prompt).not.toContain("Its appearance");
  });

  // 사람 초점의 subject 는 제품이 아니다 — 그 외형을 "이 제품"이라 부르면 틀린 지시가 된다
  it("사람 초점에서는 쓰지 않는다", () => {
    const prompt = buildImagePrompt(cut, p({ mode: "사람", subject: "50대 주인", look: "반백 머리" }));
    expect(prompt).not.toContain("반백 머리");
  });
});

describe("톤·전환 필터", () => {
  // 문지기가 값을 버릴 때 console.warn 을 한 줄 남긴다(lib/cuts.js). 그 로그 자체는 아래
  // "버릴 때 흔적을 남긴다"에서 재고, 나머지 케이스가 테스트 출력을 뒤덮지 않게 여기서 막는다.
  // ⚠️ mockClear 가 필요하다 — 이미 spy 인 console.warn 에 다시 spyOn 하면 같은 mock 이
  //    돌아와 앞 테스트의 호출 기록이 그대로 남는다(그러면 "안 남긴다" 검사가 헛돈다).
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    console.warn.mockClear();
  });

  it("카메라 어휘가 든 톤은 안 쓴다", () => {
    // 정지 이미지 프롬프트에 카메라 지시가 새면 그림이 그것을 암시하게 그려진다
    expect(usableTone("천천히 줌 인하는 시네마틱 질감")).toBe("");
    expect(usableTone("카메라가 도는 느낌")).toBe("");
  });

  it("정상 톤은 온전히 쓴다", () => {
    // 과잉 필터로 정상값을 날리면 이 기능이 아무 일도 안 한다
    const t = "어두운 배경에 제품 색만 채도를 올린 시네마틱 광고 필름 질감";
    expect(usableTone(t)).toBe(t);
  });

  // 판정용 패턴이 넓으면 대가가 "낱말 하나"가 아니라 "값 통째"다 — tone 은 영상 전체에
  // 복사되므로 오검출 하나가 톤 레이어 전체를 0 으로 만든다
  it("카메라를 명사로 언급한 톤은 살린다", () => {
    const a = "필름 카메라 특유의 거친 입자감";
    const b = "빈티지 폴라로이드 카메라 톤";
    expect(usableTone(a)).toBe(a);
    expect(usableTone(b)).toBe(b);
  });

  it("질감 서술과 방향어 없는 낱말은 살린다", () => {
    // 핸드헬드는 카메라 이동이 아니라 질감이다. '줌'·'달리'는 방향어가 없으면 딴 뜻이다
    const a = "핸드헬드 다큐 질감의 거친 색보정";
    const b = "생기를 더해 줌";
    const c = "달리 보이는 진한 대비";
    expect(usableTone(a)).toBe(a);
    expect(usableTone(b)).toBe(b);
    expect(usableTone(c)).toBe(c);
  });

  it("움직임이 명확한 카메라 지시는 버린다", () => {
    expect(usableTone("트래킹으로 훑는 질감")).toBe("");
    expect(usableTone("오빗하는 광고 톤")).toBe("");
    expect(usableTone("크레인으로 올라가는 느낌")).toBe("");
    expect(usableTone("틸트 다운되는 어두운 화면")).toBe("");
  });

  it("참조어가 든 전환은 통째로 버린다", () => {
    // 이미지 모델은 '앞 컷'을 모른다 — 일부만 자르면 짧은 구도 서술의 뜻이 무너진다
    expect(usableTransition("앞 컷에서 이어지는 발 클로즈업")).toBe("");
    expect(usableTransition("앞의 컷과 같은 눈높이")).toBe("");
    expect(usableTransition("직전 컷과 같은 구도")).toBe("");
    expect(usableTransition("이전 장면의 손이 그대로")).toBe("");
    expect(usableTransition("앞 장면을 이어받아 잡은 풀 샷")).toBe("");
    expect(usableTransition("위와 같은 구도")).toBe("");
  });

  // transition 은 "이 컷이 시작하는 구도"라 카메라 어휘가 들어오기 딱 좋은 자리다
  it("카메라 움직임이 든 전환도 버린다", () => {
    expect(usableTransition("줌 인 상태에서 시작하는 아웃솔 클로즈업")).toBe("");
    expect(usableTransition("트래킹으로 들어온 발 클로즈업")).toBe("");
    expect(usableTransition("카메라가 물러난 자리에서 시작하는 풀 샷")).toBe("");
  });

  it("자기 완결적인 전환은 쓴다", () => {
    const t = "발 클로즈업, 아스팔트 위, 같은 눈높이";
    expect(usableTransition(t)).toBe(t);
  });

  // '방금'은 앞 컷 참조가 아니라 신선함 서술인 쪽이 훨씬 흔하다
  it("'방금'이 든 정상 전환은 살린다", () => {
    const a = "방금 구운 빵의 클로즈업";
    const b = "방금 내린 커피가 담긴 잔, 눈높이";
    expect(usableTransition(a)).toBe(a);
    expect(usableTransition(b)).toBe(b);
  });

  // ★ 2026-08-13 최종 리뷰 — 문지기 패턴의 전수 목록을 여기 못 박는다.
  //
  // 왜 목록째 박는가: 이 패턴은 각인(toneKey)의 일부다. 나중에 넓히거나 좁히면 이미 굳은
  // image.tone_of 가 새 판정과 어긋나 그 프로젝트 전 컷이 낡음으로 뒤집히고 사장님에게
  // 재구매가 제시된다(30초 한 편 ~$9). 목록이 곧 계약이다.
  describe("문지기 전수 목록", () => {
    // 막아야 하는 것 — 실제 카메라 움직임 지시
    const drop = [
      "카메라가 다가가며 차가워지는 색",
      "카메라가 도는 느낌",
      "천천히 줌 인하는 시네마틱 질감",
      "트래킹으로 훑는 질감",
      "오빗하는 광고 톤",
      "크레인으로 올라가는 느낌",
      "틸트 다운되는 어두운 화면",
      "틸트 다운하는 질감",
    ];
    // 살려야 하는 것 — 카메라·팬·달리·줌이 나오지만 움직임 지시가 아닌 정상값
    const keep = [
      "필름 카메라 특유의 거친 입자감",
      "빈티지 폴라로이드 카메라 톤",
      "핸드헬드 다큐 질감의 거친 색보정",
      "생기를 더해 줌",
      "달리 보이는 진한 대비",
      // 아래 셋이 이번에 살아난 것들이다(리뷰 실측에서 통째로 버려지고 있었다)
      "필름 카메라가 만든 거친 입자감",
      "팬 서비스 같은 화사한 톤",
      "달리 인상적인 대비",
      "달리 인식되는 색",
    ];
    const dropTransitions = [
      "줌 인 상태에서 시작하는 아웃솔 클로즈업",
      "트래킹으로 들어온 발 클로즈업",
      "카메라가 물러난 자리에서 시작하는 풀 샷",
    ];

    it("카메라 움직임 지시는 톤에서 전부 버린다", () => {
      for (const t of drop) expect(usableTone(t), t).toBe("");
    });

    it("카메라 낱말이 있어도 움직임 지시가 아니면 톤을 살린다", () => {
      for (const t of keep) expect(usableTone(t), t).toBe(t);
    });

    it("카메라 움직임 지시는 전환에서도 전부 버린다", () => {
      for (const t of dropTransitions) expect(usableTransition(t), t).toBe("");
      // 톤에서 버리는 것은 전환에서도 버린다 — 두 문지기가 같은 패턴을 본다
      for (const t of drop) expect(usableTransition(t), t).toBe("");
    });

    // ★ 한국어 판정 무변경 계약 — 위 drop·keep 목록이 곧 각인(toneKey)의 계약이다.
    //   2026-08-17 에 영어를 더했다. 더한 것뿐이므로 이 목록의 결과가 한 글자도 달라지면
    //   이미 굳은 image.tone_of 가 뒤집혀 재구매가 열린다. 각인까지 함께 못 박는다.
    it("한국어 값의 각인이 그대로다", () => {
      expect(toneKey({ tone: "필름 카메라가 만든 거친 입자감", transition: "방금 구운 빵의 클로즈업" }))
        .toBe("필름 카메라가 만든 거친 입자감\n방금 구운 빵의 클로즈업");
      expect(toneKey({ tone: "카메라가 도는 느낌", transition: "앞 컷에서 이어지는 발 클로즈업" })).toBe("");
      expect(toneKey({ tone: "달리 보이는 진한 대비", transition: "트래킹으로 들어온 발 클로즈업" }))
        .toBe("달리 보이는 진한 대비\n");
    });
  });

  // 2026-08-17 언어 정책 — tone·transition 이 영어로 나온다. 한국어 전용 정규식은 영어 값에
  // 아예 안 걸려, 카메라 움직임이 톤으로 전 컷에 실리고 앞 컷 참조가 그림 지시로 갔다.
  //
  // ★ 지금 넓히는 것이 공짜다: 이 브랜치는 미배포이고 라이브로 한 번도 안 돌렸으므로
  //   **영어 톤이 저장된 프로젝트가 하나도 없다** — 낡을 산출물이 없다. 한국어 판정은
  //   위 전수 목록이 무변경을 못 박는다.
  describe("영어 문지기 전수 목록", () => {
    // 지문이 요구하는 어휘에서 뽑았다 — 축 예시("slowly pulls back"·"orbits around, pulls
    // back, then pushes in again")와 tone·transition 의 ✗ 예시가 그 원천이다
    const dropTones = [
      "the camera pushes in as the color cools",
      "the color cools as the camera moves closer",   // 지문의 ✗ 예시 그대로
      "slowly pulls back, cinematic grain",
      "orbits around with a warm cast",
      "tracking texture across the asphalt",
      "zoom in on the cooling color",
      "dolly in to a tighter contrast",
      "tilt down into darkness",
      "pan up to a brighter tone",
      "a crane shot rising over the court",
    ];
    // 카메라·팬·달리 계열 낱말이 나오지만 움직임 지시가 아닌 정상값 — 대가가 "값 통째"라
    // 여기가 무너지면 톤 레이어 전체가 0 이 된다
    const keepTones = [
      "dark background with only the product color saturated, cinematic ad film grain",
      "faded film grain with a green cast, low-contrast documentary texture",
      "handheld documentary texture with rough grading",   // 핸드헬드는 질감이다
      "grain of a vintage polaroid camera",                // 카메라는 명사다
      "the grain a film camera leaves behind",
      "a panoramic warmth across the frame",               // 'pan' 이 낱말 안에 들어 있다
      "truck-stop neon spilling into the shadows",         // 'truck' 이 카메라가 아니다
      "a crane silhouetted against the dusk sky",          // 방향어 없는 crane 은 사물이다
    ];
    const dropTransitions = [
      "continues from the previous cut",                   // 지문의 ✗ 예시 그대로
      "same angle as the cut just before",                 // 지문의 ✗ 예시 그대로
      "picks up with the camera already moved in",         // 지문의 ✗ 예시 그대로
      "the previous shot's framing, held",
      "carrying over from the last shot",
      "same as above",
      "starting already zoomed in on the outsole",
    ];
    const keepTransitions = [
      "close-up of the feet on asphalt, at the same eye level",     // 지문의 ✓ 예시 그대로
      "medium shot with the bottle in hand cropped at the left edge, background blurred",
      "freshly baked bread in close-up",
      "the last light of the day on the wall",              // 'last' 가 컷 참조가 아니다
    ];

    it("영어 카메라 움직임 지시는 톤에서 버린다", () => {
      for (const t of dropTones) expect(usableTone(t), t).toBe("");
    });

    it("영어 정상 톤은 온전히 쓴다", () => {
      for (const t of keepTones) expect(usableTone(t), t).toBe(t);
    });

    it("영어 카메라 움직임 지시는 전환에서도 버린다", () => {
      for (const t of dropTones) expect(usableTransition(t), t).toBe("");
    });

    it("영어 앞 컷 참조는 전환에서 버린다", () => {
      for (const t of dropTransitions) expect(usableTransition(t), t).toBe("");
    });

    it("자기 완결적인 영어 전환은 쓴다", () => {
      for (const t of keepTransitions) expect(usableTransition(t), t).toBe(t);
    });

    // ★ D3(2026-08-17 리뷰 실측) — 방향어 절에 **카메라/피사체 구분이 없었다.** 피사체가
    //   방향으로 움직이는 정상 톤이 통째로 버려져 전 컷의 색·질감 레이어가 0 이 됐다.
    //   같은 형태인 "the dog runs across the yard" 는 통과했으니(run 은 목록 밖) 판정이
    //   일관되지도 않았다. 이제 **주어가 카메라인지**를 본다 — 방향어 동사 앞에 명사가
    //   오면 그 주어는 카메라가 아니다.
    const keepSubjectMotion = [
      "hard light from a low sun, shadows track across the floor",
      "cool grade, light pans across the wall",
      "the model pulls back her hair",
      "the dog runs across the yard",   // 판정이 일관되는지 — 위 셋과 같은 형태다
      "warm grade, the curtain lifts up in the draft",
    ];
    it("피사체가 방향으로 움직이는 톤은 살린다 — 주어가 카메라가 아니다", () => {
      for (const t of keepSubjectMotion) expect(usableTone(t), t).toBe(t);
      for (const t of keepSubjectMotion) expect(usableTransition(t), t).toBe(t);
    });

    // 좁힌 대책을 없애지 않았다는 못 — pan·truck·crane 에 방향어를 요구한 것 자체는 유효하다
    it("방향어 없는 일반명사는 그대로 통과한다", () => {
      for (const t of [
        "a crane by the harbor",
        "a pan of eggs on the stove",
        "a delivery truck parked outside",
        "film camera grain",
      ]) expect(usableTone(t), t).toBe(t);
    });

    // 주어가 없으면(값의 시작·구두점·-ly 부사 뒤) 그것은 카메라 지시다
    it("주어 없는 방향어 절은 여전히 버린다", () => {
      for (const t of [
        "pushes in on the outsole",
        "slowly tracks across the court",
        "warm grade, pans across the wall",
        "already zoomed in on the shoe",
      ]) expect(usableTone(t), t).toBe("");
    });
  });

  // 버려진 값이 지금까지 아무 데도 안 남았다 — 오검출 셋도 손으로 돌려 보고서야 드러났다.
  // 이 로그가 "얼마나 자주 터지는가"에 답하는 유일한 자리다.
  describe("버릴 때 흔적을 남긴다", () => {
    it("버려진 톤·전환은 값과 이유가 함께 남는다", () => {
      usableTone("카메라가 다가가며 차가워지는 색");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("카메라가 다가가며 차가워지는 색")
      );
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("카메라 움직임"));

      console.warn.mockClear();
      usableTransition("앞 컷에서 이어지는 발 클로즈업");
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("앞 컷을 가리키는"));
    });

    it("값이 애초에 없으면 남기지 않는다 — 그건 정상이다", () => {
      // 첫 컷에 전환이 없는 것이 정상이라, 여기서 경고를 내면 매 편마다 거짓 경고가 쌓인다
      usableTone(undefined);
      usableTone("  ");
      usableTransition(undefined);
      usableTransition(null);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("통과한 값도 남기지 않는다", () => {
      usableTone("필름 카메라가 만든 거친 입자감");
      usableTransition("발 클로즈업, 아스팔트 위, 같은 눈높이");
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(usableTone(undefined)).toBe("");
    expect(usableTransition(undefined)).toBe("");
    expect(usableTone("  ")).toBe("");
    expect(usableTransition("  ")).toBe("");
    expect(usableTone(null)).toBe("");
    expect(usableTransition(null)).toBe("");
    expect(usableTone(42)).toBe("");
    expect(usableTransition({ tone: "x" })).toBe("");
  });
});

describe("buildImagePrompt — 톤·전환", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "농구화" },
  };
  const cut = { idx: 1, shows: "제품이 놓여 있다", sentence: "문장" };

  it("두 값이 없으면 프롬프트가 글자 그대로 같다", () => {
    // 이 작업의 유일한 하드 제약 — 기존 프로젝트의 그림이 달라지면 안 된다.
    // ⚠️ 두 호출을 서로 비교하면 헛돈다(둘 다 새 코드를 지나므로, 값이 없어도 문장을
    //    무조건 붙이는 구현이면 양쪽이 똑같이 붙어 통과한다). 톤·전환을 넣기 **전** 문자열을
    //    상수로 박아 대조한다 — 위 "실사는 화풍 도입 전과 글자 그대로 같은 프롬프트를 낸다"와 같은 방식이다.
    const expected =
      "High-quality photographic still for a short-form video, vertical 9:16 composition. " +
      "Scene: 제품이 놓여 있다. " +
      "The video's subject is: 농구화. Keep this exact product/subject consistent in every scene. " +
      "Cinematic lighting, realistic, no text or letters in the image.";
    expect(buildImagePrompt(cut, project)).toBe(expected);
    expect(buildImagePrompt({ ...cut, tone: "", transition: "" }, project)).toBe(expected);
  });

  it("톤을 프롬프트에 싣는다", () => {
    const p = buildImagePrompt({ ...cut, tone: "채도를 올린 시네마틱 질감" }, project);
    expect(p).toContain("채도를 올린 시네마틱 질감");
  });

  it("전환을 프롬프트에 싣는다", () => {
    const p = buildImagePrompt({ ...cut, transition: "발 클로즈업, 같은 눈높이" }, project);
    expect(p).toContain("발 클로즈업, 같은 눈높이");
  });

  it("카메라 어휘가 든 톤은 안 싣는다", () => {
    const p = buildImagePrompt({ ...cut, tone: "천천히 줌 인하는 질감" }, project);
    expect(p).not.toContain("줌 인");
  });

  it("참조어가 든 전환은 안 싣는다", () => {
    const p = buildImagePrompt({ ...cut, transition: "앞 컷에서 이어지는 발" }, project);
    expect(p).not.toContain("앞 컷");
  });

  it("사용자 수정 지시는 톤·전환보다 뒤에 온다", () => {
    // 가장 강하게 반영되어야 하는 것은 사장님이 직접 적은 지시다 — 항상 끝이다
    const p = buildImagePrompt(
      { ...cut, tone: "채도를 올린 시네마틱 질감", transition: "발 클로즈업, 같은 눈높이", edit_instruction: "그림자를 더 깊게" },
      project,
    );
    expect(p.indexOf("채도를 올린 시네마틱 질감")).toBeLessThan(p.indexOf("그림자를 더 깊게"));
    expect(p.indexOf("발 클로즈업, 같은 눈높이")).toBeLessThan(p.indexOf("그림자를 더 깊게"));
  });
});

describe("SHOWS_SYSTEM — 톤·전환 규칙", () => {
  // 지문은 문자열이라 "무엇을 시켰는가"만 잴 수 있다. 그래도 잰다 — 규칙이 조용히 빠지는 것을 막는다.
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];
  const system = () => buildShowsMessages(project, cuts).system;
  // 아래 "✗ 예시" 테스트가 일부러 버려지는 값을 먹인다 — 문지기 경고로 출력이 덮이지 않게 한다
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("출력 형식에 tone 과 transition 이 있다", () => {
    expect(system()).toContain('"tone"');
    expect(system()).toContain('"transition"');
  });

  it("전환을 자기 완결적으로 쓰라고 시킨다", () => {
    // 이 지시가 없으면 모델이 "앞 컷에서 이어진다"를 쓰고 코드가 통째로 버린다(usableTransition)
    expect(system()).toContain("앞 컷");
    expect(system()).toMatch(/구도로 번역|그 자체로 읽히게/);
  });

  // ⚠️ 여기서 "첫 컷"만 찾으면 헛돈다 — 원래 지문에 "첫 컷은 스크롤을 멈추는 한 방이다"가
  //    이미 있어서 transition 규칙을 통째로 지워도 초록이었다. 새 문장의 고유 형태를 잡는다.
  it("첫 컷에는 전환이 없다고 알려 준다", () => {
    expect(system()).toMatch(/첫 컷에는\s*\*{0,2}\s*넣지 않는다/);
  });

  it("톤은 영상 하나에 하나다 — 컷마다 만들지 않게 한다", () => {
    expect(system()).toMatch(/전 컷이 이 하나를 공유|영상 하나의/);
  });

  // ★ tone 과 environment 가 겹치면 이 설계의 약한 고리가 된다 —
  //   장소·시간대·조명은 이미 environment 가 맡고 있고, 둘 다 전 컷에 복사된다.
  it("톤과 무대의 경계를 긋는다", () => {
    expect(system()).toMatch(/장소·시간대·조명은 environment/);
  });

  // 지문이 가르치는 ✓ 예시가 코드 문지기에 걸리면 지문이 스스로를 무효로 만든다.
  it("지문의 ✓ 예시가 코드 문지기를 통과한다", () => {
    const tone = "dark background with only the product color saturated, cinematic ad film grain";
    const transition = "close-up of the feet on asphalt, at the same eye level";
    expect(system()).toContain(tone);
    expect(system()).toContain(transition);
    expect(usableTone(tone)).toBe(tone);
    expect(usableTransition(transition)).toBe(transition);
  });

  // 지문이 가르치는 ✗ 예시는 지문에 실제로 들어 있어야 한다 — 빠지면 아무것도 안 가르친다.
  it("지문의 ✗ 예시가 지문에 들어 있다", () => {
    const bad = [
      "gym, hard spotlights",
      "the color cools as the camera moves closer",
      "continues from the previous cut",
      "same angle as the cut just before",
      "picks up with the camera already moved in",
    ];
    for (const t of bad) expect(system(), t).toContain(t);
  });

  // 문지기 계약은 따로 잰다 — 저장된 옛 한국어 값은 여전히 이 판정을 받는다.
  //
  // ⚠️ CAMERA_MOTION·CUT_REFERENCE 가 **한국어 전용 정규식**이라, 영어로 바뀐 새 값은 이
  //    그물에 안 걸린다(실측: usableTone("the camera pushes in as the color cools") 가 값을
  //    그대로 돌려준다). 그래서 위 ✗ 예시와 이 단언을 갈라 두었다 — 하나로 묶으면 영어
  //    예시를 문지기가 버린다는 **거짓**을 못 박게 된다.
  //    문지기를 영어까지 넓히는 일은 별개 태스크다(각인에 닿는 자리라 함께 손대면 굳은
  //    그림이 낡아 유료 재구매가 열린다).
  it("문지기는 한국어 카메라 움직임·앞 컷 참조를 통째로 버린다", () => {
    expect(usableTone("카메라가 다가가며 차가워지는 색")).toBe("");
    for (const t of ["앞 컷에서 이어진다", "직전 컷과 같은 각도", "이어받아 카메라가 다가간 상태로 시작"]) {
      expect(usableTransition(t), t).toBe("");
    }
  });

  // 카메라 어휘가 든 톤·전환은 usableTone/usableTransition 이 통째로 버린다 —
  // 지문이 먼저 막아야 버려지는 값이 준다.
  // ⚠️ "카메라 움직임"만 찾으면 헛돈다 — 기존 shows·motion 규칙에 이미 그 낱말이 있다.
  it("톤·전환에 카메라 움직임을 쓰지 말라고 한다", () => {
    expect(system()).toMatch(/한 낱말이라도 섞이면/);       // tone 쪽
    expect(system()).toMatch(/움직임은 움직임 축이 맡는다/); // transition 쪽
  });
});

// 관통 — 화면 설계 응답 하나가 그림 프롬프트와 각인까지 흐른다.
//
// 이 저장소는 태스크 경계에서 반복해 샜다(개별 리뷰는 다 통과인데 합쳐 봐야 드러난다).
// 그래서 이 테스트는 파일 하나를 보지 않고 값의 경로를 본다:
//   validateShows(응답) → 컷 → buildImagePrompt(그림 지시) → toneKey(각인)
// 핵심은 마지막 줄이다 — **프롬프트와 각인이 같은 것을 봐야 한다.** 갈리면 그림이 안 바뀌는데
// 낡았다고 나오거나(재구매 제시) 그림이 바뀌는데 안 낡았다고 나온다.
describe("관통: 화면 설계 → 그림 프롬프트 → 각인", () => {
  const proj = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "농구화" },
  };
  const cutOf = (shot, idx) => ({ ...shot, idx, sentence: idx === 0 ? "가" : "나" });
  // 아래 두 번째 테스트가 일부러 버려지는 톤·전환을 흘린다 — 문지기 경고를 삼킨다
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("화면 설계 응답 하나가 그림 프롬프트까지 관통한다", () => {
    const shots = validateShows(
      {
        tone: "채도를 올린 시네마틱 질감",
        environment: "실내 체육관, 야간",
        shots: [
          { shows: "제품이 놓여 있다" },
          { shows: "달리는 발", transition: "발 클로즈업, 아스팔트 위" },
        ],
      },
      2
    );
    expect(shots).toHaveLength(2);
    // 톤은 영상 하나의 값이라 전 컷에 복사된다. 전환은 컷 고유이고 첫 컷에는 없다.
    expect(shots[0].tone).toBe("채도를 올린 시네마틱 질감");
    expect(shots[1].tone).toBe("채도를 올린 시네마틱 질감");
    expect(shots[0].transition).toBeUndefined();

    const p0 = buildImagePrompt(cutOf(shots[0], 0), proj);
    const p1 = buildImagePrompt(cutOf(shots[1], 1), proj);

    // 톤은 두 컷에 똑같이 — 그것이 곧 영상의 일관성이다
    expect(p0).toContain("채도를 올린 시네마틱 질감");
    expect(p1).toContain("채도를 올린 시네마틱 질감");
    // 전환은 둘째 컷에만
    expect(p0).not.toContain("아스팔트");
    expect(p1).toContain("발 클로즈업, 아스팔트 위");
    // 무대도 전 컷에 같이 실린다(톤과 함께 복사되는 값)
    expect(p0).toContain("실내 체육관, 야간");
    expect(p1).toContain("실내 체육관, 야간");

    // 각인은 컷마다 다르다 — 전환이 다르기 때문이다
    // 둘 다 "" 면 not.toBe 가 먼저 실패하므로 "비어 있지 않다"를 따로 재지 않는다
    expect(toneKey(shots[0])).not.toBe(toneKey(shots[1]));
    expect(toneKey(shots[1])).toContain("발 클로즈업, 아스팔트 위");
  });

  // ★ 이 테스트의 핵심. 문지기가 버린 값은 프롬프트에도 없고 각인에도 없어야 한다 —
  // 둘이 갈리는 순간 낡음 판정이 거짓이 되고, 그 버튼은 유료 호출이다.
  it("걸러지는 톤·전환은 프롬프트와 각인에서 함께 사라진다", () => {
    const shots = validateShows(
      {
        // 카메라 움직임이 섞인 톤 — usableTone 이 통째로 버린다
        tone: "카메라가 다가가며 차가워지는 색",
        environment: "실내 체육관, 야간",
        shots: [
          { shows: "제품이 놓여 있다" },
          // 앞 컷을 가리키는 전환 — usableTransition 이 통째로 버린다
          { shows: "달리는 발", transition: "앞 컷에서 이어받아 같은 각도" },
        ],
      },
      2
    );
    // 저장되는 값 자체는 그대로다 — 사장님이 화면에서 보고 고칠 근거를 잃지 않는다
    expect(shots[0].tone).toBe("카메라가 다가가며 차가워지는 색");
    expect(shots[1].transition).toBe("앞 컷에서 이어받아 같은 각도");

    const p0 = buildImagePrompt(cutOf(shots[0], 0), proj);
    const p1 = buildImagePrompt(cutOf(shots[1], 1), proj);

    // 그림 지시에는 안 실린다
    expect(p0).not.toContain("카메라가 다가가며");
    expect(p1).not.toContain("카메라가 다가가며");
    expect(p0).not.toContain("Overall look and color treatment");
    expect(p1).not.toContain("앞 컷에서 이어받아");
    expect(p1).not.toContain("Compose the opening framing");

    // 각인에도 안 들어간다 — 둘 다 걸러졌으니 각인 자체가 비고,
    // 파이프라인은 빈 각인이면 image.tone_of 를 아예 안 붙인다(옛 그림 보호와 같은 자리다)
    expect(toneKey(shots[0])).toBe("");
    expect(toneKey(shots[1])).toBe("");
  });

  // 한쪽만 걸러지는 경우 — 살아남은 값은 프롬프트와 각인 양쪽에 그대로 있어야 한다
  it("한쪽만 걸러져도 프롬프트와 각인이 같은 것을 본다", () => {
    const shots = validateShows(
      {
        tone: "채도를 올린 시네마틱 질감",
        shots: [
          { shows: "제품이 놓여 있다" },
          { shows: "달리는 발", transition: "줌 인 상태로 시작하는 발 클로즈업" },
        ],
      },
      2
    );
    const p0 = buildImagePrompt(cutOf(shots[0], 0), proj);
    const p1 = buildImagePrompt(cutOf(shots[1], 1), proj);
    expect(p1).toContain("채도를 올린 시네마틱 질감");   // 톤은 산다
    expect(p1).not.toContain("줌 인");                    // 전환은 버려진다
    expect(toneKey(shots[1])).toBe("채도를 올린 시네마틱 질감\n");
    // 걸러진 전환 때문에 두 컷의 각인이 같아진다.
    // 프롬프트 전체는 shows 가 달라 같을 수 없으니, **전환 절이 양쪽 다 없다**로 좁혀 잰다 —
    // 각인이 같아진 것과 프롬프트가 전환을 안 실은 것이 같은 사실이어야 한다.
    expect(toneKey(shots[0])).toBe(toneKey(shots[1]));
    expect(p0).not.toContain("Compose the opening framing");
    expect(p1).not.toContain("Compose the opening framing");
  });
});

describe("allocateCutSeconds — 고른 초를 컷에 배분한다", () => {
  const profile = { min: 3, max: 15 }; // Kling v3 와 같은 모양

  it("여백을 컷에 나눠 얹어 합이 고른 초가 된다", () => {
    const cuts = [{ spoken_seconds: 4 }, { spoken_seconds: 3 }, { spoken_seconds: 3 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
    // 바닥(말하는 시간)보다 작아지지 않는다 — 말이 잘리면 안 된다
    out.forEach((s, i) => expect(s).toBeGreaterThanOrEqual(cuts[i].spoken_seconds));
  });

  it("모델 하한을 밑돌지 않는다", () => {
    const cuts = [{ spoken_seconds: 1 }, { spoken_seconds: 1 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    out.forEach((s) => expect(s).toBeGreaterThanOrEqual(3));
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
  });

  it("모델 상한을 넘지 않는다 — 넘길 여백은 버린다", () => {
    const cuts = [{ spoken_seconds: 2 }];
    const out = allocateCutSeconds(cuts, 60, profile);
    expect(out).toEqual([15]); // 상한에서 멈춘다. 합이 60 이 안 돼도 넘지 않는다
  });

  // ★ 말이 고른 초보다 길면 말이 이긴다 — 자르면 문장 끝이 사라진다
  it("말하는 시간의 합이 고른 초보다 크면 말을 따른다", () => {
    const cuts = [{ spoken_seconds: 9 }, { spoken_seconds: 9 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out).toEqual([9, 9]);
  });

  it("무음 컷(말하는 시간 0)은 여백만 받는다", () => {
    const cuts = [{ spoken_seconds: 0, silent: true }, { spoken_seconds: 6 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
    expect(out[0]).toBeGreaterThanOrEqual(3); // 하한은 받는다
  });

  it("컷이 없으면 빈 배열이다", () => {
    expect(allocateCutSeconds([], 15, profile)).toEqual([]);
    expect(allocateCutSeconds(null, 15, profile)).toEqual([]);
  });

  // ★ 컨트롤러 판단(2026-08-14): 배분은 고른 초가 있을 때만이 아니라 항상 돈다.
  // 자동 길이(고른 초 없음) 프로젝트에서는 spoken_seconds 합을 목표로 준다 —
  // 그러면 여분(target - 바닥합)이 0이라 라운드로빈이 아무것도 얹지 않는다(여백이 안 생긴다).
  //
  // ★★ 리뷰 지적(2026-08-14): "지금까지의 값과 같다"는 정확한 말이 아니다. secondsForText는
  // 2초까지 내려가는데 모델 하한(Kling 3·Seedance 4)은 그보다 높아서, 하한에 못 미치던 컷은
  // 여기서 **올라간다**(4/2/6 → 4/3/6, 아래 단언대로). 다만 이 상승은 무해하다 — i2v.js의
  // fitDurationFor가 어차피 클립 주문 시점에 같은 하한으로 올렸고(오늘도 그랬다), 과금은
  // cut.seconds가 아니라 target_seconds를 기준으로 매긴다. 그래서 증명하는 것은 "값이 예전과
  // 같다"가 아니라 "여백은 0이고, 하한 미만이던 컷만 하한으로 들어 올려진다"이다.
  it("자동 길이(목표=말하는 시간 합)는 여백을 안 만든다 — 하한 미만이던 컷만 하한으로 올라간다", () => {
    const cuts = [{ spoken_seconds: 4 }, { spoken_seconds: 2 }, { spoken_seconds: 6 }];
    const target = cuts.reduce((a, c) => a + c.spoken_seconds, 0); // 12
    const out = allocateCutSeconds(cuts, target, profile);
    expect(out).toEqual([4, 3, 6]);
  });
});

// ★★ 이것이 이 태스크의 핵심 보장이다(2026-08-14 재측정이 요구했다).
//   원고가 짧아지자 컷이 1개가 되고 배분이 거기에 15초를 다 줬다 — 이미지 한 장이 15초 머문다.
//   CONTENT_MAX_SECONDS 는 "이미지 한 장이 화면에 머무는 시간"인데 낭독 초로만 판정돼
//   배분된 초를 안 봤다. 모델이 지문을 따르든 말든 **코드가 채운다.**
describe("fillSilentCuts — 배분된 초가 8초를 넘는 컷이 남지 않는다", () => {
  const seedance = { min: 4, max: 15 };
  const kling = { min: 3, max: 15 };

  it("말하는 컷 하나에 15초가 배분되면 무음 컷으로 쪼갠다", () => {
    const cuts = [{ idx: 0, sentence: "짧은 원고입니다.", spoken_seconds: 6 }];
    const out = fillSilentCuts(cuts, 15, seedance);
    expect(out.length).toBeGreaterThan(1);
    const secs = allocateCutSeconds(out, 15, seedance);
    expect(secs.reduce((a, b) => a + b, 0)).toBe(15);
    secs.forEach((s) => expect(s).toBeLessThanOrEqual(CONTENT_MAX_SECONDS));
    // 원고는 한 글자도 안 바뀐다
    expect(out.filter((c) => !c.silent).map((c) => c.sentence).join(" ")).toBe("짧은 원고입니다.");
  });

  it("모델 하한이 개수의 천장이다 — 하한을 깨면서까지 쪼개지 않는다", () => {
    const cuts = [{ idx: 0, sentence: "문장.", spoken_seconds: 4 }];
    const out = fillSilentCuts(cuts, 15, seedance); // 하한 4 → 최대 3개
    expect(out.length).toBeLessThanOrEqual(3);
    const outK = fillSilentCuts(cuts, 15, kling);   // 하한 3 → 최대 5개
    expect(outK.length).toBeLessThanOrEqual(5);
  });

  it("이미 8초 이하로 나뉘어 있으면 아무것도 더하지 않는다", () => {
    const cuts = [
      { idx: 0, sentence: "가.", spoken_seconds: 5 },
      { idx: 1, sentence: "나.", spoken_seconds: 5 },
      { idx: 2, sentence: "다.", spoken_seconds: 5 },
    ];
    expect(fillSilentCuts(cuts, 15, seedance)).toHaveLength(3);
  });

  it("idx 를 다시 매긴다 — 캐스팅·화면 설계가 컷 번호로 짝을 짓는다", () => {
    const out = fillSilentCuts([{ idx: 0, sentence: "가.", spoken_seconds: 6 }], 15, seedance);
    expect(out.map((c) => c.idx)).toEqual(out.map((_, i) => i));
  });

  // ★ 리뷰 지적(2026-08-14): 못 내리는 컷 때문에 채우면 **8초는 그대로인 채 값만 나간다.**
  //   낭독 10초짜리는 어떻게 쪼개도 10초다(바닥이다). 그런데도 하나 넣으면 총 초가
  //   고른 초를 넘어(클립은 초당 과금) 이미지 $0.08 까지 더 사고 보장은 하나도 안 는다.
  it("바닥이 8초를 넘는 컷 때문에는 채우지 않는다 — 값만 나가고 보장은 그대로다", () => {
    const cuts = [
      { idx: 0, sentence: "끊을 자리가 없는 긴 문장.", spoken_seconds: 10 },
      { idx: 1, sentence: "짧다.", spoken_seconds: 2 },
    ];
    const out = fillSilentCuts(cuts, 20, seedance);
    expect(out).toHaveLength(2);
    expect(out.some((c) => c.silent)).toBe(false);
  });

  // ★ 리뷰 지적(2026-08-14): 채운 컷을 전부 끝에 붙이면 영상이 **언제나 침묵으로 끝난다.**
  //   말이 앞에서 끝나고 남은 초가 통째로 말 없는 화면이 된다. 짧은 원고가 이 함수가
  //   존재하는 이유라 그것은 가끔이 아니라 매번이다 — 말하는 컷 뒤에 돌아가며 끼운다.
  it("채운 컷을 말하는 컷 뒤에 하나씩 끼운다 — 끝에 몰아붙이지 않는다", () => {
    const cuts = [
      { idx: 0, sentence: "가.", spoken_seconds: 6 },
      { idx: 1, sentence: "나.", spoken_seconds: 6 },
    ];
    const out = fillSilentCuts(cuts, 24, seedance);
    expect(out.map((c) => !!c.silent)).toEqual([false, true, false, true]);
    expect(out.filter((c) => !c.silent).map((c) => c.sentence).join(" ")).toBe("가. 나.");
  });

  it("말하는 컷이 하나뿐이면 뒤로 갈 수밖에 없다 — 맨 앞에는 두지 않는다", () => {
    const out = fillSilentCuts([{ idx: 0, sentence: "가.", spoken_seconds: 6 }], 15, seedance);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].silent).toBeFalsy();          // 첫 화면은 가장 센 문장이 가진다
    expect(out.slice(1).every((c) => c.silent)).toBe(true);
  });

  // ★★ 재리뷰가 찾은 Critical(2026-08-14): 15초만 맞고 30·45·60초는 전부 **15초짜리로
  //   나가고 있었다.** 컷 하나가 모델 상한(15)에 걸려 멈추는데 그 컷이 "가장 긴 컷"이라
  //   콘텐츠 판정만으로는 더 넣을 이유가 안 생겼다 — 60초에 100크레딧을 낸 사장님이
  //   15초 영상을 받는다. 컷을 더 넣는 이유는 **둘**이고(길이 약속·콘텐츠 약속),
  //   여기서는 개수가 아니라 **합**을 단언한다.
  describe("고른 초를 실제로 채운다 — 15/30/45/60 전부", () => {
    for (const [name, profile] of [["Seedance", seedance], ["Kling", kling]]) {
      for (const spoken of [[6], [6, 6]]) {
        for (const target of [15, 30, 45, 60]) {
          it(`${name} ${target}초 · 낭독 ${spoken.join("+")}초 → 합이 ${target}초다`, () => {
            const cuts = spoken.map((s, i) => ({ idx: i, sentence: `문장${i}.`, spoken_seconds: s }));
            const out = fillSilentCuts(cuts, target, profile);
            const secs = allocateCutSeconds(out, target, profile);
            expect(secs.reduce((a, b) => a + b, 0)).toBe(target);
            // 8초 약속도 함께 지켜진다 — 이 조합에서는 지킬 수 있다(바닥이 전부 8초 이하다)
            secs.forEach((s) => expect(s).toBeLessThanOrEqual(CONTENT_MAX_SECONDS));
            // 원고는 한 글자도 안 바뀐다
            expect(out.filter((c) => !c.silent).map((c) => c.sentence))
              .toEqual(cuts.map((c) => c.sentence));
          });
        }
      }
    }
  });

  // ★★ 최종 리뷰가 찾은 문제(2026-08-14): 채우기가 **고른 초를 넘겨 버린다.**
  //   바닥이 섞인 배치(말하는 컷 5개 × 바닥 8초, 45초)에서 컷을 하나 더 넣으면
  //   바닥 합이 44 → 48 이 되어, 사장님이 산 45초를 3초 넘겨 우리가 문다(클립은 초당 과금).
  //   나아지는 것이 있어도 값을 더 쓰면서 사는 것이면 안 산다.
  it("채워서 고른 초를 넘기지 않는다 — 넘는 초는 사장님이 아니라 우리가 문다", () => {
    const cuts = [8, 8, 8, 8, 8].map((s, i) => ({ idx: i, sentence: `문장${i}.`, spoken_seconds: s }));
    const out = fillSilentCuts(cuts, 45, seedance);
    const secs = allocateCutSeconds(out, 45, seedance);
    expect(secs.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(45);
  });

  // ★ 제자리걸음 완화의 근거를 못 박는다(2026-08-14 실측). 배분이 남는 초를 앞에서부터
  //   얹으므로 첫 컷이 모델 상한(15)에 붙어 한 걸음 안 움직인다: 컷 4개 [15,15,15,15] 에서
  //   5개로 늘려도 [15,12,11,11,11] 이라 가장 긴 컷이 그대로 15다. 완화가 없으면 여기서
  //   멈춰 **정지 이미지 한 장이 15초 머문 채** 나간다.
  it("가장 긴 컷이 상한에 붙어 제자리여도 계속 걸어간다 — Seedance 60초·낭독 8초", () => {
    const cuts = [{ idx: 0, sentence: "문장.", spoken_seconds: 8 }];
    // 완화가 없을 때의 정지점을 먼저 확인한다: 4개일 때 전부 15초다
    const four = allocateCutSeconds(
      [cuts[0], { silent: true, spoken_seconds: 0 }, { silent: true, spoken_seconds: 0 }, { silent: true, spoken_seconds: 0 }],
      60, seedance
    );
    expect(four).toEqual([15, 15, 15, 15]);

    const out = fillSilentCuts(cuts, 60, seedance);
    const secs = allocateCutSeconds(out, 60, seedance);
    expect(secs.reduce((a, b) => a + b, 0)).toBe(60);
    secs.forEach((s) => expect(s).toBeLessThanOrEqual(CONTENT_MAX_SECONDS));
  });

  it("모델이 제안한 무음 컷은 그 자리를 지킨다", () => {
    const cuts = [
      { idx: 0, sentence: "가.", spoken_seconds: 6 },
      { idx: 1, sentence: "", silent: true, spoken_seconds: 0 },
      { idx: 2, sentence: "나.", spoken_seconds: 6 },
    ];
    const out = fillSilentCuts(cuts, 24, seedance);
    expect(out[0].sentence).toBe("가.");
    expect(out[1]).toMatchObject({ silent: true });
    expect(out.filter((c) => !c.silent).map((c) => c.sentence)).toEqual(["가.", "나."]);
  });
});

// ★ 이 태스크는 기능을 안 늘린다. 선택 로직만 뽑아낸다.
//   문구가 한 글자라도 달라지면 이미 산 그림이 낡아 사장님에게 재구매가 제시된다
//   (buildImagePrompt 안의 stage·tone·noteClause 주석이 같은 규칙을 반복한다).
describe("buildImagePrompt — 재료를 뽑아내도 출력은 그대로다", () => {
  const rich = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "생딸기라떼", focus: { mode: "물건", subject: "생딸기라떼", look: "유리컵에 담긴 분홍 음료" } },
    cast: [{ who: "20대 여성", look: "긴 머리, 캐주얼한 옷차림", cuts: [0] }],
  };
  const cut = { idx: 0, shows: "여성이 컵을 든 미디엄 샷", environment: "실내 스튜디오, 한낮", tone: "따뜻한 색감" };

  it("풍부한 프로젝트의 프롬프트가 기대 문자열과 같다", () => {
    const p = buildImagePrompt(cut, rich);
    // 절이 다 실렸는지 문구 그대로 확인한다
    expect(p).toContain("vertical 9:16 composition");
    expect(p).toContain("Scene: 여성이 컵을 든 미디엄 샷.");
    expect(p).toContain(" Setting (same in every scene of this video): 실내 스튜디오, 한낮.");
    expect(p).toContain(" Characters in this frame (keep them identical across every scene) — 20대 여성: 긴 머리, 캐주얼한 옷차림.");
    expect(p).toContain(" The video's subject is: 생딸기라떼. Keep this exact product/subject consistent in every scene.");
    expect(p).toContain(" Its appearance, identical in every scene: 유리컵에 담긴 분홍 음료.");
    expect(p).toContain(" Overall look and color treatment, keep identical across all cuts: 따뜻한 색감.");
  });

  it("값이 없으면 절이 아예 안 붙는다", () => {
    const bare = { settings: { aspect_ratio: "9:16" }, briefing: {} };
    const p = buildImagePrompt({ idx: 0, shows: "빈 방" }, bare);
    expect(p).not.toContain("Setting (same in every scene");
    expect(p).not.toContain("Characters in this frame");
    expect(p).not.toContain("The video's subject is:");
    expect(p).not.toContain("Overall look and color treatment");
  });
});

describe("절의 재료를 고르는 함수", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "생딸기라떼", focus: { mode: "물건", subject: "생딸기라떼", look: "유리컵" } },
    cast: [
      { who: "20대 여성", look: "긴 머리", cuts: [0] },
      { who: "40대 남성", look: "짧은 머리", cuts: [1] },
      { who: "이름만", cuts: [0] }, // look 이 없으면 안 센다
    ],
  };

  it("이 컷에 배정된 인물만 고른다", () => {
    expect(castLooksOf({ idx: 0 }, project)).toEqual(["20대 여성: 긴 머리"]);
    expect(castLooksOf({ idx: 1 }, project)).toEqual(["40대 남성: 짧은 머리"]);
    expect(castLooksOf({ idx: 9 }, project)).toEqual([]);
  });

  // ★ 앵커는 **제품**이어야 한다 — topic 은 자료가 기획서면 기획 문구가 된다(주석의 실측).
  it("초점이 물건이면 그 대상이 제품이고, 사람 초점의 subject 는 안 쓴다", () => {
    expect(subjectOf(project).anchor).toBe("생딸기라떼");
    expect(subjectOf(project).look).toBe("유리컵");
    const person = { briefing: { topic: "사장님 이야기", focus: { mode: "사람", subject: "사장님", look: "앞치마" } } };
    expect(subjectOf(person).anchor).toBe("사장님 이야기"); // topic 으로 떨어진다
    expect(subjectOf(person).look).toBe("");               // 사람의 look 은 제품 외형이 아니다
  });

  it("무대와 화면비", () => {
    expect(stageOf({ environment: "  실내 스튜디오  " })).toBe("실내 스튜디오");
    expect(stageOf({})).toBe("");
    expect(orientOf({ settings: { aspect_ratio: "1:1" } })).toBe("square 1:1");
    expect(orientOf({ settings: { aspect_ratio: "16:9" } })).toBe("horizontal 16:9");
    expect(orientOf({ settings: {} })).toBe("horizontal 16:9"); // 지금 동작 그대로
  });
});

// ★ 예시가 출력 언어를 정한다. 지시문에 "영어로 써라"라고만 적고 한국어 예시를 두면 둘이
//   싸우고 모델은 예시를 따른다 — 그래서 재는 것은 지시문이 아니라 **예시 값**이다.
//
// 값을 **따옴표 안에서만** 본다. 예시 옆의 괄호 설명("(그건 environment 다)")은 우리가
// 유지보수하는 한국어 글이고 모델이 베낄 값이 아니다.
//
// ★ **예외가 없다**(2026-08-17). 하나 있던 "한국어 섬"(샷 크기 낱말)은 걷었다 — 목록에서
//    끌어와 예외 처리하던 자리라, SHOT_SIZES 가 영어 낱말을 함께 보게 된 순간 그 예외가
//    설계대로 저절로 사라졌다. 이제 ✓·✗ 예시 값에 한국어가 한 글자라도 있으면 빨개진다.
describe("SHOWS_SYSTEM — 언어", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];
  const system = () => buildShowsMessages({ material: {}, briefing: {}, settings: {} }, cuts).system;

  // ✓/✗ 로 시작하는 줄에서 따옴표로 묶인 값만 뽑는다
  const examples = (mark) => {
    const out = [];
    for (const line of system().split("\n")) {
      if (!new RegExp(`^\\s*${mark}`).test(line)) continue;
      for (const m of line.matchAll(/"([^"]*)"/g)) out.push({ line: line.trim(), value: m[1] });
    }
    return out;
  };

  it("★ ✓ 예시 값이 영어다 — 예시가 출력 언어를 정한다", () => {
    const good = examples("✓");
    expect(good.length, "✓ 예시를 못 찾겠다").toBeGreaterThan(3);
    const korean = good.filter((e) => /[가-힣]/.test(e.value));
    expect(korean.map((e) => e.value), `아직 한국어 ✓ 예시가 ${korean.length}개다`).toEqual([]);
  });

  it("★ ✗ 예시 값도 영어다 — 못 쓸 형태도 그 언어로 보여야 한다", () => {
    const bad = examples("✗");
    expect(bad.length, "✗ 예시를 못 찾겠다").toBeGreaterThan(3);
    const korean = bad.filter((e) => /[가-힣]/.test(e.value));
    expect(korean.map((e) => e.value), `아직 한국어 ✗ 예시가 ${korean.length}개다`).toEqual([]);
  });

  it("어느 칸을 영어로 쓸지 이름으로 부른다", () => {
    const s = system();
    expect(s).toMatch(/shows[^\n]*tone[^\n]*environment[^\n]*transition[^\n]*움직임 축[^\n]*영어/);
  });

  it("움직임 축 예시도 영어다 — 여기가 한국어면 축만 한국어로 나온다", () => {
    for (const a of MOTION_AXES) {
      expect(/[가-힣]/.test(a.example), `${a.id}.example 이 한국어다`).toBe(false);
      if (a.bad) expect(/[가-힣]/.test(a.bad), `${a.id}.bad 가 한국어다`).toBe(false);
    }
  });

  // label·hint 는 반대로 한국어여야 한다 — label 은 사장님이 화면에서 읽는 이름이고
  // hint 는 우리가 유지보수하는 지시문이다. 셋을 한 언어로 맞추면 하나가 제 몫을 잃는다.
  it("축의 label·hint 는 한국어로 남는다", () => {
    for (const a of MOTION_AXES) {
      expect(/[가-힣]/.test(a.label), `${a.id}.label`).toBe(true);
      expect(/[가-힣]/.test(a.hint), `${a.id}.hint`).toBe(true);
    }
  });

  // 지문이 요구하는 낱말과 판정기가 아는 낱말이 같아야 한다 — 갈리면 shotBalance 가
  // 조용히 죽어 카탈로그 같은 컷 구성을 아무도 막지 않는다(그것이 이번에 닫은 구멍이다).
  it("샷 크기 낱말이 목록과 같다 — shotSizeOf 가 그것을 읽는다", () => {
    for (const s of SHOT_SIZES) {
      expect(system(), `${s.label} 가 지문에 없다`).toContain(s.words[0]);
      expect(/[가-힣]/.test(s.words[0]), `${s.label}.words[0] 이 아직 한국어다`).toBe(false);
    }
  });

  // gpt-4o 를 밀어붙이려 넣은 강조다. 지금 모델은 지시를 문자 그대로 따라 과하게 작동한다.
  // 걷은 것은 표시뿐이라 규칙 문장은 위 다른 테스트들이 계속 못 박고 있다.
  it("★ gpt-4o 시절의 과한 강조를 걷었다", () => {
    const s = system();
    expect((s.match(/★/g) || []).length, "★ 가 아직 남았다").toBe(0);
    expect((s.match(/\*\*반드시|절대/g) || []).length, "강조가 아직 남았다").toBe(0);
  });
});

describe("SHOWS_SYSTEM — 움직임 축", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];
  const system = () => buildShowsMessages({ material: {}, briefing: {}, settings: {} }, cuts).system;

  it("세 축이 전부 지문에 나온다", () => {
    for (const a of MOTION_AXES) {
      expect(system()).toContain(`${a.id}(${a.label})`);
    }
  });

  // 축 줄은 손으로 적은 것이 아니라 MOTION_AXES 에서 만들어진다 — hint 까지 그대로 실린다.
  // 목록에서 한 줄을 빼면 지문도 함께 줄어드는 것이 이 설계의 안전장치다.
  it("축 줄이 목록에서 만들어진다 — hint 가 그대로 실린다", () => {
    for (const a of MOTION_AXES) {
      expect(system()).toContain(`  · ${a.id}(${a.label}) — ${a.hint}`);
    }
  });

  // 출력 형식(JSON)도 목록에서 만들어진다 — 여기가 갈리면 모델이 축을 아예 안 답한다.
  it("출력 형식에 세 축이 필드로 들어 있다", () => {
    for (const a of MOTION_AXES) {
      expect(system()).toContain(`"${a.id}":"${a.label} 움직임 한 줄`);
    }
  });

  it("예시도 목록에서 만들어진다 — ✓ 예시가 축의 example 그대로다", () => {
    for (const a of MOTION_AXES) {
      expect(system()).toContain(`  ✓ ${a.id}: "${a.example}"`);
    }
    for (const a of MOTION_AXES.filter((x) => x.bad)) {
      expect(system()).toContain(`  ✗ ${a.id}: "${a.bad}"`);
    }
  });

  it("개수를 말하는 자리가 목록에서 나온다", () => {
    expect(system()).toContain(`아래 ${MOTION_AXES.length}개 축 중`);
  });

  it("옛 motion 필드를 더 이상 요구하지 않는다", () => {
    expect(system()).not.toContain("motion 은 그 정지 화면에서");
    expect(system()).not.toContain("둘 다 넣지 않는다");
    // ★ 지문 어디에도 motion 이 없어야 한다 — 한 군데라도 남으면 모델이 없는 필드를 답한다
    expect(system()).not.toMatch(/motion/i);
  });
});

// ★ 이 설계의 안전장치는 "무너지면 MOTION_AXES 에서 한 줄을 뺀다"이다.
//   그것이 참인지를 **주장하지 않고 실제로 실행해서** 확인한다 — 축을 뺀 목록으로 지문을
//   조립해 보고, 뺀 축의 흔적(id·label·hint·example)이 0건인지 본다.
//   "motion 이 없다"만 재는 단언으로는 이 회귀를 못 잡는다(남는 것은 motion 이 아니라 ambient 다).
describe("★ 축을 빼면 지문에서 그 축이 통째로 사라진다", () => {
  const gone = MOTION_AXES.find((a) => a.id === "ambient");
  const kept = MOTION_AXES.filter((a) => a.id !== "ambient");
  const rolled = [motionFields(kept), motionRules(kept), speedRule(kept)].join("\n");

  it("뺀 축의 id·label·hint·example 이 하나도 남지 않는다", () => {
    for (const trace of [gone.id, gone.label, gone.hint, gone.example]) {
      expect(rolled, trace).not.toContain(trace);
    }
  });

  it("남은 축은 출력 형식·규칙·예시에 그대로 있다", () => {
    for (const a of kept) {
      expect(rolled).toContain(`"${a.id}":`);
      expect(rolled).toContain(`· ${a.id}(${a.label})`);
      expect(rolled).toContain(`✓ ${a.id}: "${a.example}"`);
    }
  });

  it("개수를 말하는 자리도 함께 줄어든다", () => {
    expect(rolled).toContain(`아래 ${kept.length}개 축 중`);
    expect(rolled).toContain(`위 움직임 축 ${kept.length}개 전체에 걸리는 값이라`);
    expect(rolled).not.toContain(`${MOTION_AXES.length}개 축 중`);
  });

  it("축을 전부 빼도 던지지 않는다 — 되돌리기의 끝까지 간다", () => {
    expect(() => [motionFields([]), motionRules([]), speedRule([])].join("\n")).not.toThrow();
    expect(motionFields([])).toBe("");
  });
});

describe("speed — intensity 통합은 문구를 바꾸지 않는다", () => {
  const cuts = [{ idx: 0, sentence: "가." }, { idx: 1, sentence: "나." }];
  const system = () => buildShowsMessages({ material: {}, briefing: {}, settings: {} }, cuts).system;

  it("지문이 speed 를 '빠르고 센지'로 정의한다", () => {
    expect(system()).toContain("얼마나 빠르고 센지");
  });
  it("speed 가 축 전체에 걸린다고 알려 준다", () => {
    expect(system()).toContain(`위 움직임 축 ${MOTION_AXES.length}개 전체에 걸리는 값이라 컷 하나에 하나만 고른다`);
  });
  it("★ clip 문구는 그대로다 — 바뀌면 저장된 컷이 전부 낡는다", () => {
    expect(SPEEDS.map((s) => s.clip)).toEqual([
      "almost still, only the faintest drift",
      "slow, deliberate motion",
      "real-time speed, natural pacing",
      "fast, explosive motion",
      "extreme slow motion, time nearly frozen",
    ]);
  });
});

describe("buildClipPrompt — 움직임 축", () => {
  it("세 축이 목록 순서로 실린다", () => {
    const p = buildClipPrompt({
      ambient: "창밖으로 사람들이 지나간다",
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      speed: "slow",
    });
    const iCam = p.indexOf("천천히 뒤로 물러난다");
    const iSub = p.indexOf("컵을 들어 입으로 가져간다");
    const iAmb = p.indexOf("창밖으로 사람들이 지나간다");
    expect(iCam).toBeGreaterThan(-1);
    expect(iCam).toBeLessThan(iSub);
    expect(iSub).toBeLessThan(iAmb);
  });

  it("축 하나만 있어도 된다", () => {
    const p = buildClipPrompt({ camera: "천천히 다가간다" });
    expect(p).toContain("천천히 다가간다");
  });

  it("★ 축이 하나도 없으면 옛 motion 을 쓴다 — 저장된 프로젝트", () => {
    const p = buildClipPrompt({ motion: "천천히 회전한다" });
    expect(p).toContain("천천히 회전한다");
  });

  it("★ 축도 motion 도 없을 때만 폴백이 나온다", () => {
    expect(buildClipPrompt({})).toContain("거의 정지");
    expect(buildClipPrompt({ camera: "다가간다" })).not.toContain("거의 정지");
    expect(buildClipPrompt({ motion: "회전한다" })).not.toContain("거의 정지");
  });

  // 이음새 — 축 텍스트는 한국어 문장이라 마침표가 있을 수도 없을 수도 있다.
  // 둘 다 같은 모양("… . … . … .")으로 나와야 한다: 이중 공백도, 부유 마침표도 없다.
  it("★ 마침표가 없는 축들이 문장으로 갈린다 — 붙어 버리지 않는다", () => {
    const p = buildClipPrompt({
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
    });
    expect(p.startsWith("천천히 뒤로 물러난다. 컵을 들어 입으로 가져간다. ")).toBe(true);
  });

  it("★ 이미 마침표로 끝난 축이 마침표를 둘 만들지 않는다", () => {
    const p = buildClipPrompt({
      camera: "천천히 뒤로 물러난다.",
      subject: "컵을 들어 입으로 가져간다.",
    });
    expect(p.startsWith("천천히 뒤로 물러난다. 컵을 들어 입으로 가져간다. ")).toBe(true);
    expect(p).not.toContain("..");
  });

  it("★ 이중 공백도 부유 구분자도 없다", () => {
    const p = buildClipPrompt({
      camera: "천천히 뒤로 물러난다.",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "창밖으로 사람들이 지나간다.",
      speed: "slow",
    });
    expect(p).not.toMatch(/ {2}/);
    expect(p).not.toContain("..");
    expect(p).not.toMatch(/\.\s*\./);
  });
});

describe("buildClipPrompt — 옛 컷은 한 글자도 안 바뀐다", () => {
  it("축 없는 컷의 출력이 골든과 바이트 동일이다", () => {
    // 축을 넣기 **전** 코드로 이 입력을 실제로 실행해 얻은 출력이다(git show 로 잡지 않는다 —
    // squash-merge 되면 그 커밋이 도달 불가라 진짜 회귀와 구분이 안 된다).
    const GOLDEN =
      "천천히 회전한다. slow, deliberate motion. The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters. No talking faces or lip sync.";
    expect(buildClipPrompt({ motion: "천천히 회전한다", speed: "slow" })).toBe(GOLDEN);
  });
});

// ★★ 프롬프트와 각인이 **같은 정규화**를 본다 — 파일 경계를 넘는 관통 테스트다
//    (lib/motion.js 의 axesOf → lib/cuts.js buildClipPrompt · lib/steps.js clipKey).
//
// 터졌던 것: 프롬프트만 끝 마침표를 걷어내고 각인은 원문을 굳혀서, 저장된 축에 **마침표만**
// 더하면 프롬프트는 바이트 동일인데 각인만 갈렸다 → 거짓 낡음 → 유료 [다시 만들기]가 열려
// 픽셀이 같은 mp4 를 다시 산다.
describe("축 정규화 — 프롬프트와 각인이 같은 값을 본다", () => {
  const same = [
    ["끝 마침표", { camera: "천천히 물러난다" }, { camera: "천천히 물러난다." }],
    ["마침표 여럿", { camera: "천천히 물러난다" }, { camera: "천천히 물러난다..." }],
    ["앞뒤 공백", { camera: "천천히 물러난다" }, { camera: "  천천히 물러난다  " }],
    ["마침표 → 공백 → 마침표", { camera: "천천히 물러난다" }, { camera: "천천히 물러난다. ." }],
    ["축 여럿", { camera: "물러난다", subject: "컵을 든다" }, { camera: "물러난다.", subject: "컵을 든다. " }],
  ];

  for (const [what, a, b] of same) {
    it(`★ ${what}만 고치면 프롬프트도 각인도 바이트 동일이다`, () => {
      expect(buildClipPrompt(b)).toBe(buildClipPrompt(a));
      expect(clipKey(b)).toBe(clipKey(a));
    });
  }

  it("정말 다른 움직임은 둘 다 갈린다 — 정규화가 실제 변경을 삼키지 않는다", () => {
    const a = { camera: "천천히 물러난다" };
    const b = { camera: "빠르게 다가간다" };
    expect(buildClipPrompt(b)).not.toBe(buildClipPrompt(a));
    expect(clipKey(b)).not.toBe(clipKey(a));
  });

  it("걷어내면 빈 값이 되는 축은 프롬프트에서도 각인에서도 없는 것으로 본다", () => {
    expect(buildClipPrompt({ camera: ".", subject: "컵을 든다" }))
      .toBe(buildClipPrompt({ subject: "컵을 든다" }));
    expect(clipKey({ camera: ".", subject: "컵을 든다" }))
      .toBe(clipKey({ subject: "컵을 든다" }));
  });
});
