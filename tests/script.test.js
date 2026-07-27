import { describe, it, expect } from "vitest";
import {
  buildScriptMessages,
  buildScriptEditMessages,
  buildScriptRewriteMessages,
  editKeptContent,
  estimateSeconds,
  copyRatio,
  repeatsWithin,
  paragraphsToRewrite,
  mergeRewrite,
  secondsForText,
  syncSceneSeconds,
} from "../lib/script.js";

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

describe("buildScriptMessages — 밀도와 카피톤", () => {
  // 라이브 3건에서 낭독 길이가 구성 배분의 60·74·64%에 그쳤고, 모자란 자리를
  // "그날의 손맛 그대로"·"집중과 몰입의 시간" 같은 명사형 카피가 채웠다.
  it("장면에 배분된 초를 문장 분량으로 채우라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("초당 5.5자");
    expect(system).toContain("분량");
  });

  // 카피톤을 막았더니 모델이 '할 말'을 조사만 바꿔 그대로 옮기는 쪽으로 도망갔다.
  it("'할 말'을 조사만 바꿔 전사하지 말라고 대조 예시로 못박는다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("나쁜 예(할 말 전사)");
  });

  it("낭독 어체를 '~합니다'로 못박는다 — 초안·교정 둘 다", () => {
    for (const { system } of [
      buildScriptMessages(project),
      buildScriptEditMessages({ paragraphs: [{ text: "문장" }] }),
    ]) {
      expect(system).toContain("합니다");
      expect(system).toContain("어체");
    }
  });

  it("명사형 카피로 끝맺지 말라고 지시한다 — 초안·교정 둘 다", () => {
    for (const { system } of [
      buildScriptMessages(project),
      buildScriptEditMessages({ paragraphs: [{ text: "문장" }] }),
    ]) {
      expect(system).toContain("명사");
      expect(system).toContain("당신의 손에");
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

describe("copyRatio", () => {
  it("수사만 덧대고 사실을 더하지 않은 문장은 임계 위다", () => {
    // 라이브에서 실제로 나온 쌍 — 대본 단계가 아무 일도 하지 않았다
    expect(copyRatio("이곳은 동네 작은 세탁소다", "이곳은 평범한 동네에 자리한 작은 세탁소입니다.")).toBeGreaterThan(0.5);
  });

  it("사실을 한 걸음 전개한 문장은 임계 아래다", () => {
    expect(copyRatio("물레 없이 손으로만 빚는다", "물레는 가르치지 않습니다. 손으로 빚어야 그날 만든 것을 가져갑니다.")).toBeLessThan(0.5);
  });

  it("짧은 할 말을 문장으로 실현하면서 사실을 더하면 임계 아래다", () => {
    // 할 말을 명사구로 줄인 뒤 생긴 자리 — 낱말이 다 들어가도 문장이 제 몫을 말하면 전사가 아니다
    expect(
      copyRatio("남은 음식은 경로당에 기부", "남은 음식은 경로당에 기부하거나 직원들이 나눕니다. 오후 다섯 시가 넘으면 남은 음식이 없습니다.")
    ).toBeLessThan(0.5);
  });

  it("한쪽이 비면 0 — 판정하지 않는다", () => {
    expect(copyRatio("", "아무 문장")).toBe(0);
    expect(copyRatio(null, "아무 문장")).toBe(0);
    expect(copyRatio("할 말", "")).toBe(0);
  });
});

describe("repeatsWithin", () => {
  it("같은 말을 두 번 하면 잡는다", () => {
    // 라이브에서 분량을 채우라니까 나온 문단
    expect(repeatsWithin("손님들이 운동화를 맡기기 위해 세탁소를 방문합니다. 최근 들어 많은 손님들이 운동화를 맡기고 있습니다.")).toBe(true);
  });

  it("서로 다른 사실을 말하면 잡지 않는다", () => {
    expect(repeatsWithin("물레는 가르치지 않습니다. 수요일은 가마를 굽느라 쉽니다.")).toBe(false);
  });

  it("문장이 하나뿐이면 잡지 않는다", () => {
    expect(repeatsWithin("운동화가 하루에 열 켤레씩 들어옵니다.")).toBe(false);
  });

  it("아주 짧은 문장은 세지 않는다 — 맞장구가 겹쳐 보인다", () => {
    expect(repeatsWithin("네. 네.")).toBe(false);
  });
});

describe("paragraphsToRewrite", () => {
  const syn = {
    scenes: [
      { says: "이곳은 동네 작은 세탁소다", shows: "세탁소 외관 풀 샷" },
      { says: "운동화를 많이 맡긴다", shows: "세제를 넣는 손 클로즈업, 조작 패널을 누르는 모습" },
    ],
  };

  it("할 말 전사를 이유와 함께 지목한다", () => {
    const script = {
      paragraphs: [
        { text: "이곳은 평범한 동네에 자리한 작은 세탁소입니다." },
        { text: "요즘은 흰 운동화가 하루에 열 켤레씩 들어옵니다." },
      ],
    };
    expect(paragraphsToRewrite(syn, script)).toEqual([{ idx: 0, reason: "할 말 전사" }]);
  });

  it("보여줌을 읊은 문단도 지목한다 — 할 말만 보면 이 경로가 열린다", () => {
    const script = {
      paragraphs: [
        { text: "흰 운동화가 하루에 열 켤레씩 들어옵니다." },
        { text: "세제를 넣고 조작 패널을 누릅니다." },
      ],
    };
    expect(paragraphsToRewrite(syn, script)).toEqual([{ idx: 1, reason: "화면 설명 전사" }]);
  });

  it("같은 말을 되풀이한 문단도 지목한다", () => {
    const script = {
      paragraphs: [
        { text: "흰 운동화가 하루에 열 켤레씩 들어옵니다." },
        { text: "손님들이 운동화를 맡기러 자주 오십니다. 요즘 손님들이 운동화를 맡기러 자주 옵니다." },
      ],
    };
    expect(paragraphsToRewrite(syn, script)).toEqual([{ idx: 1, reason: "같은 말 되풀이" }]);
  });

  it("멀쩡하면 빈 배열", () => {
    const script = {
      paragraphs: [
        { text: "흰 운동화가 하루에 열 켤레씩 들어옵니다." },
        { text: "하루면 다 마릅니다." },
      ],
    };
    expect(paragraphsToRewrite(syn, script)).toEqual([]);
  });

  it("구성이나 대본이 없으면 빈 배열 — 옛 프로젝트를 건드리지 않는다", () => {
    expect(paragraphsToRewrite(null, { paragraphs: [{ text: "문장" }] })).toEqual([]);
    expect(paragraphsToRewrite(syn, null)).toEqual([]);
  });
});

describe("mergeRewrite", () => {
  // 풍부한 자료(반찬가게)에서 6문단 중 5문단이 전사로 지목됐는데, 채택 조건이 "지목 개수 감소"라
  // 두 문단이 제대로 고쳐져 와도 통째로 버려졌다. 문단 단위로 좋아진 것만 받는다.
  const syn = {
    scenes: [
      { says: "작년 김장 김치 200포기가 이틀 만에 완판", shows: "포장된 김치 클로즈업" },
      { says: "늦게 오면 반찬이 없다", shows: "텅 빈 진열대 풀 샷" },
    ],
  };
  const draft = {
    paragraphs: [
      { text: "작년 김장 김치는 200포기가 이틀 만에 완판되었습니다." }, // 전사
      { text: "늦게 오시면 반찬이 없습니다." },                          // 전사
    ],
  };
  const targets = [{ idx: 0, reason: "할 말 전사" }, { idx: 1, reason: "할 말 전사" }];

  it("고쳐진 문단만 갈아 끼우고 여전히 전사인 문단은 초안을 지킨다", () => {
    const rewritten = {
      paragraphs: [
        { text: "작년 겨울에 담근 김치는 이틀 만에 동났습니다." },   // 고쳐짐
        { text: "늦게 오시면 반찬이 없습니다." },                     // 그대로 전사
      ],
    };
    const merged = mergeRewrite(syn, draft, rewritten, targets);
    expect(merged.paragraphs[0].text).toBe("작년 겨울에 담근 김치는 이틀 만에 동났습니다.");
    expect(merged.paragraphs[1].text).toBe("늦게 오시면 반찬이 없습니다.");
  });

  it("지목하지 않은 문단은 모델이 건드렸어도 초안을 지킨다", () => {
    const rewritten = { paragraphs: [{ text: "작년 겨울에 담근 김치는 이틀 만에 동났습니다." }, { text: "멋대로 바꾼 문장입니다." }] };
    const merged = mergeRewrite(syn, draft, rewritten, [{ idx: 0, reason: "할 말 전사" }]);
    expect(merged.paragraphs[1].text).toBe("늦게 오시면 반찬이 없습니다.");
  });

  it("문단 수가 어긋나면 통째로 버린다", () => {
    const merged = mergeRewrite(syn, draft, { paragraphs: [{ text: "하나뿐" }] }, targets);
    expect(merged).toEqual(draft);
  });

  it("되돌리기가 없으면 초안 그대로", () => {
    expect(mergeRewrite(syn, draft, null, targets)).toEqual(draft);
  });
});

describe("secondsForText · syncSceneSeconds", () => {
  it("문장 길이를 초로 환산하고 2~15초로 묶는다", () => {
    expect(secondsForText("가".repeat(55))).toBe(10);
    expect(secondsForText("가")).toBe(2);        // 하한
    expect(secondsForText("가".repeat(200))).toBe(15); // 상한
  });

  it("장면의 초를 그 장면 문장 길이로 맞춘다", () => {
    const syn = { angle: "앵글", version: 3, scenes: [{ says: "ㄱ", seconds: 8 }, { says: "ㄴ", seconds: 8 }] };
    const script = { paragraphs: [{ text: "가".repeat(55) }, { text: "나".repeat(11) }] };
    const next = syncSceneSeconds(syn, script);
    expect(next.scenes.map((s) => s.seconds)).toEqual([10, 2]);
    // 사장님이 승인한 구성이 바뀐 게 아니다 — 버전을 올리면 대본 화면에 거짓 경고가 뜬다
    expect(next.version).toBe(3);
    expect(next.angle).toBe("앵글");
  });

  it("문단이 없는 장면의 초는 건드리지 않는다", () => {
    const syn = { scenes: [{ says: "ㄱ", seconds: 8 }, { says: "ㄴ", seconds: 7 }] };
    const next = syncSceneSeconds(syn, { paragraphs: [{ text: "가".repeat(55) }] });
    expect(next.scenes.map((s) => s.seconds)).toEqual([10, 7]);
  });
});

describe("buildScriptRewriteMessages", () => {
  const draft = { paragraphs: [{ text: "베낀 문장" }, { text: "괜찮은 문장" }] };

  const targets = [{ idx: 0, reason: "할 말 전사" }];

  it("지목한 문단 번호·이유와 그 장면의 할 말·보여줌을 지문에 담는다", () => {
    const { system, messages } = buildScriptRewriteMessages(project, draft, targets);
    const user = messages[0].content;
    expect(user).toContain("1번");                 // 사람이 세는 번호
    expect(user).toContain("할 말 전사");           // 무엇이 잘못됐는지 알려야 같은 자리로 안 돌아온다
    expect(user).toContain("베낀 문장");
    expect(user).toContain("오늘 한 잔은 어제와 다르다");           // 1번 장면의 할 말
    expect(user).toContain("딸기 과육이 우유에 섞이는 클로즈업");   // 1번 장면의 보여줌
    expect(system).toContain("전사");
  });

  it("지목하지 않은 문단은 그대로 두라고 지시한다", () => {
    const user = buildScriptRewriteMessages(project, draft, targets).messages[0].content;
    expect(user).toContain("괜찮은 문장");
    expect(user).toContain("그대로");
  });

  it("이유마다 다른 처방을 준다 — 되풀이는 지우고 화면 설명은 말하지 않는다", () => {
    const { system } = buildScriptRewriteMessages(project, draft, targets);
    expect(system).toContain("화면 설명 전사");
    expect(system).toContain("같은 말 되풀이");
    expect(system).toContain("짧아지는 편이 낫다");
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
