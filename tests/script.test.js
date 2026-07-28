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
  underTarget,
  unusedFacts,
  weakOpening,
  scriptScore,
  secondsForText,
  targetChars,
  capacitySeconds,
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
  it("자료 원문과 사진이 지문에 들어간다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(system).toContain("대본");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서."); // 원문 그대로
    expect(user).toContain("라떼.jpg");
  });

  // A/B 측정: 요약을 함께 주면 모델이 원문 대신 요약을 문장화해 두 번 증류됐다.
  // 사장님이 한 말과 구체 수치가 사라지고, 얕은 자료에서는 금지어·환각까지 나왔다.
  it("브리핑 요약은 지문에 넣지 않는다 — 원문이 직접 닿아야 한다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).not.toContain("[정리된 브리핑]");
    expect(user).not.toContain("생딸기라떼 신메뉴"); // topic
    expect(user).not.toContain("동네 주민");         // audience
    expect(user).not.toContain("매장에 와보고 싶어지기"); // takeaway
  });

  it("되물어 받은 답은 넣는다 — 원문에 없는 사실이다", () => {
    const asked = {
      ...project,
      briefing: {
        ...project.briefing,
        asked: [
          { question: "가격은?", answer: "6,500원", done: true },
          { question: "언제부터?", answer: "  ", done: true }, // 답 없는 것은 빼고
        ],
      },
    };
    const user = buildScriptMessages(asked).messages[0].content;
    expect(user).toContain("추가로 확인한 것");
    expect(user).toContain("가격은? → 6,500원");
    expect(user).not.toContain("언제부터?");
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

  // 줄이는 과정에서 "그래서 가게를 냈습니다"가 잘려 계기가 붕 떴다
  it("버릴 때는 이야기 단위로 버리라고 지시한다 — 결론이 잘리면 안 된다", () => {
    for (const { system } of [
      buildScriptMessages(project),
      buildScriptRewriteMessages(project, { text: "원고" }, ["분량 초과"]),
    ]) {
      expect(system).toContain("이야기 단위로");
      expect(system).toContain("통째로");
    }
  });

  // 금지 12종이 행동 요청까지 막는 것으로 읽혔다 — 판매·알림 영상의 목적 자체를 지운다
  it("행동 요청 자체는 막지 않는다 — 관용구 대신 사실로 청하게 한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("행동을 청하는 것 자체는 금지가 아니다");
    expect(system).toContain("11월부터 예약 받습니다");
    // 교정 패스도 같은 오해를 하지 않아야 한다
    const edit = buildScriptEditMessages(project, { text: "원고" }).system;
    expect(edit).toContain("행동 정보 자체를 지우라는 뜻이 아니다");
  });

  it("핵심 개수에 상한을 둔다 — 분량을 채우려 자료를 긁어오는 걸 막는다", () => {
    // 개수 제한이 없으면 "N자를 채워라"가 "자료를 다 담아라"로 읽힌다.
    // 넷을 넘으면 각각이 얕아진다(실측: 코트 이야기가 4.7초, 우는 대목이 2.2초였다).
    const { system } = buildScriptMessages(project);
    expect(system).toContain("핵심은 셋을 넘기지 않는다");
    expect(system).toContain("넷을 넘기면");
  });

  it("첫 문장을 배경 설명으로 열지 말라고 못박는다", () => {
    // weakOpening() 은 연차·소개문만 잡는다. 배경 설명형("백화점에서는 …")은
    // 코드가 못 잡으므로 프롬프트가 예시로 막는다.
    const { system } = buildScriptMessages(project);
    expect(system).toContain("배경 설명으로도 열지 않는다");
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

  it("목표 분량을 하한과 함께 적는다 — 상한만 주면 짧은 쪽으로 도망간다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("[분량]");
    expect(user).toContain(`${targetChars(project)}자`);
    expect(user).toContain("아래로 내려가지 않는다");
    expect(user).toMatch(/지어내지도? 않는다/);
  });

  it("채우는 방향을 넓이가 아니라 깊이로 지시한다", () => {
    // 하한만 주면 자료의 사실을 더 끌어와 채운다 — 그러면 원문을 옮겨 적은 글이 된다.
    // 실측: 수선집 자료로 10문장 중 6개가 자료와 70% 이상 겹쳤다(2026-07-27).
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("깊이");
    expect(user).toContain("더 끌어와 채우지 않는다");
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

  it("사장님이 고른 길이가 있으면 그것이 목표다", () => {
    const p = { ...withPoints(2), settings: { target_seconds: 30 } };
    expect(targetChars(p)).toBe(165); // 30초 × 5.5자
  });

  it("고른 길이는 자료가 얇아도 깎지 않는다 — 10초를 고른 사람에게 5초를 주면 실패다", () => {
    const p = { ...withPoints(1), settings: { target_seconds: 45 } };
    expect(targetChars(p)).toBe(248);
  });

  it("목록에 없는 값은 무시하고 자동으로 돌아간다", () => {
    for (const bad of [7, "30", null, undefined]) {
      expect(targetChars({ ...withPoints(2), settings: { target_seconds: bad } })).toBe(60);
    }
  });

  it("자료가 감당하는 길이는 고른 값과 무관하게 자료만 본다", () => {
    const p = { ...withPoints(2), settings: { target_seconds: 60 } };
    expect(capacitySeconds(p)).toBe(11); // 사실 2개 → 60자 → 11초
  });

  it("사실 수에 비례하되 40초(220자)를 넘지 않는다", () => {
    expect(targetChars(withPoints(20))).toBe(220);
  });

  it("자료가 얇아도 최소 분량은 준다", () => {
    expect(targetChars(withPoints(1))).toBe(60);
  });

  it("자료로 만들 수 있는 길이를 초로 돌려준다 — 사실 하나에 약 5초", () => {
    expect(capacitySeconds(withPoints(1))).toBe(11);  // 하한 60자
    expect(capacitySeconds(withPoints(4))).toBe(22);  // 120자
    expect(capacitySeconds(withPoints(20))).toBe(40); // 상한 220자
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
    const user = buildScriptEditMessages(project, draft).messages[0].content;
    expect(user).toContain("특별한 딸기라떼를 만나보세요");
  });

  it("사실 유지·상투어 제거·새 사실 금지를 지시하고 같은 스키마를 요구한다", () => {
    const { system } = buildScriptEditMessages(project, draft);
    expect(system).toContain("빠뜨리지 않는다");
    expect(system).toContain("만나보세요");
    expect(system).toContain("더하지 않는다");
    expect(system).toContain('{"script"');
    expect(system).not.toContain('"paragraphs"');
  });

  // 교정이 174자를 206자로 불려 놓고도 통과했다 — editKeptContent는 줄어드는 것만 막는다
  it("목표 분량을 지문에 적고 늘리지 말라고 지시한다", () => {
    const { system, messages } = buildScriptEditMessages(project, draft);
    expect(messages[0].content).toContain("[분량]");
    expect(messages[0].content).toContain(`목표 ${targetChars(project)}자`);
    expect(system).toContain("줄이지도 늘리지도 않는다");
  });

  it("쪼개지 말고 하나로 이어진 글을 유지하라고 지시한다", () => {
    expect(buildScriptEditMessages(project, draft).system).toContain("장면·번호·소제목으로 쪼개지 않는다");
  });

  it("촬영 용어·명사형 카피도 걷어내라고 지시한다 — 교정이 두 번째 그물이다", () => {
    const { system } = buildScriptEditMessages(project, draft);
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

describe("scriptFaults — 원고가 스스로 판정되는 셋", () => {
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

  // 1.3배였을 때 30초 요청에 39초짜리가 결함 없음으로 통과했다 — 추정 오차(±15%)까지만 봐준다.
  // 관통에서도 그대로 재현됐다: 목표 165자에 200자(121%)가 "결함 없음"으로 나갔다.
  it("1.15배를 넘으면 잡는다", () => {
    const target = targetChars(project);
    expect(overTarget(project, "가".repeat(Math.round(target * 1.14)))).toBe(false);
    expect(overTarget(project, "가".repeat(Math.round(target * 1.2)))).toBe(true);
    expect(overTarget(project, "가".repeat(Math.round(target * 1.25)))).toBe(true);
  });

  // 10초를 고른 사장님에게 5초를 주면 자료 부족이 아니라 그냥 실패다
  it("채울 재료가 남아 있는데 짧으면 잡는다", () => {
    const half = "가".repeat(Math.round(targetChars(project) * 0.5)); // 자료의 사실을 하나도 안 씀
    expect(underTarget(project, half)).toBe(true);
    expect(scriptFaults(project, { text: half })).toContain("분량 미달");
  });

  // 두 줄짜리 자료에서 하한만 요구했더니 "직접 삶아 세탁"·"고객 만족도" 같은
  // 자료에 없는 말을 지어내 채웠다. 더 쓸 게 없으면 짧은 것이 정답이다.
  it("자료의 사실을 이미 다 썼으면 짧아도 잡지 않는다 — 지어내게 만들면 안 된다", () => {
    const usedAll = "매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다.";
    expect(unusedFacts(project, usedAll)).toEqual([]);
    expect(underTarget(project, usedAll)).toBe(false);
    expect(scriptFaults(project, { text: usedAll })).toEqual([]);
  });

  it("안 쓴 사실만 골라낸다", () => {
    const partial = "매일 아침 직접 갈아 만듭니다.";
    expect(unusedFacts(project, partial)).toEqual(["하루 40잔"]);
  });

  it("조금 모자란 것은 잡지 않는다 — 10초 요청에 8~9초는 정상 응답이다", () => {
    const near = "가".repeat(Math.round(targetChars(project) * 0.9));
    expect(underTarget(project, near)).toBe(false);
  });

  // "성수동에서 12년째 옷 수선집을 운영합니다" — 프롬프트로 두 번 금지했는데 두 번 다 나왔다
  it("연차나 소개로 여는 첫 문장을 잡는다", () => {
    expect(weakOpening("성수동에서 12년째 옷 수선집을 운영합니다. 손님이 울었습니다.")).toBe(true);
    expect(weakOpening("망원동에서 반찬가게를 운영합니다. 남은 건 팔지 않습니다.")).toBe(true);
    expect(scriptFaults(project, { text: "성수동에서 12년째 옷 수선집을 운영합니다. 매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다." }))
      .toContain("약한 오프닝");
  });

  it("사실로 여는 첫 문장은 잡지 않는다", () => {
    expect(weakOpening("물레는 가르치지 않습니다. 손으로 빚어야 그날 가져가시니까요.")).toBe(false);
    expect(weakOpening("작년 김장 김치 200포기가 이틀 만에 나갔습니다.")).toBe(false);
    expect(weakOpening("손님이 받아 가시면서 우셨습니다.")).toBe(false);
  });

  it("멀쩡하면 빈 배열", () => {
    // 목표(사실 2개 → 60자) 안에 드는 길이여야 한다 — 짧으면 이제 '분량 미달'로 잡힌다
    const ok = "매일 아침 딸기를 직접 갈아서 그날 쓸 만큼만 만듭니다. 그래서 하루 40잔이면 그날 치는 끝납니다. 오후 세 시쯤이면 대개 떨어집니다.";
    expect(scriptFaults(project, { text: ok })).toEqual([]);
  });

  it("원고가 없으면 판정하지 않는다", () => {
    expect(scriptFaults(project, null)).toEqual([]);
    expect(scriptFaults(project, { text: "  " })).toEqual([]);
  });
});

describe("scriptScore — 되돌리기를 받을지 가르는 자", () => {
  const target = targetChars(project); // 60자

  it("결함 개수를 먼저 본다", () => {
    const clean = { text: "가".repeat(target) };
    const broken = { text: "가".repeat(target * 2) }; // 분량 초과
    expect(scriptScore(project, clean)).toBeLessThan(scriptScore(project, broken));
  });

  it("결함 개수가 같으면 목표에 가까운 쪽이 낫다 — 절반 고쳐 온 것을 버리지 않게", () => {
    const far = { text: "가".repeat(target * 3) };   // 초과 1개
    const near = { text: "가".repeat(target * 2) };  // 초과 1개, 목표에 더 가깝다
    expect(scriptScore(project, near)).toBeLessThan(scriptScore(project, far));
  });
});

describe("buildScriptRewriteMessages", () => {
  const draft = { text: "늘어진 원고입니다. 늘어진 원고입니다." };

  it("원고와 지적된 문제, 목표 분량을 함께 준다", () => {
    const { system, messages } = buildScriptRewriteMessages(project, draft, ["같은 말 되풀이"]);
    const user = messages[0].content;
    expect(user).toContain("늘어진 원고입니다");
    expect(user).toContain("같은 말 되풀이");
    const target = targetChars(project);
    expect(user).toContain(`${Math.round(target * 0.9)}~${Math.round(target * 1.1)}자`);
    expect(system).toContain('{"script"');
  });

  it("이유마다 다른 처방을 준다", () => {
    const { system } = buildScriptRewriteMessages(project, draft, ["분량 초과"]);
    expect(system).toContain("같은 말 되풀이");
    expect(system).toContain("분량 초과");
    expect(system).toContain("가격·위치·영업시간부터 버린다");
    expect(system).toContain("지적되지 않은 자리는 그대로 둔다");
  });

  it("분량 미달에는 채우는 방법까지 지정한다 — 지어내기·되풀이로 채우면 안 된다", () => {
    const { system } = buildScriptRewriteMessages(project, draft, ["분량 미달"]);
    expect(system).toContain("분량 미달");
    expect(system).toContain("한 걸음 더");
    expect(system).toContain("짧은 채로 둔다");
  });

  it("분량 미달이면 아직 안 쓴 사실을 지문에 함께 준다 — 채우라고만 하면 지어낸다", () => {
    const user = buildScriptRewriteMessages(project, draft, ["분량 미달"]).messages[0].content;
    expect(user).toContain("[아직 안 쓴 사실]");
    expect(user).toContain("하루 40잔");
  });

  it("다른 이유일 때는 사실 목록을 붙이지 않는다", () => {
    const user = buildScriptRewriteMessages(project, draft, ["분량 초과"]).messages[0].content;
    expect(user).not.toContain("[아직 안 쓴 사실]");
  });

  // "안팎"이라고만 하면 얼마나 안팎인지가 모델 재량이 된다. 아래로 깎는 것도 잘못이라고 못 박는다
  it("사정권을 자릿수로 주고, 그 아래로 깎지 말라고 한다 — 진자 방지", () => {
    const { system, messages } = buildScriptRewriteMessages(project, draft, ["분량 초과"]);
    const target = targetChars(project);
    expect(messages[0].content).toContain(`${Math.round(target * 0.9)}~${Math.round(target * 1.1)}자`);
    expect(messages[0].content).toContain(`${Math.round(target * 0.9)}자 아래로 깎지 않는다`);
    expect(system).toContain("범위 아래로 내려가면 그것도 똑같이 잘못이다");
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

describe("지어내기의 선 — 감상은 되고 실적은 안 된다", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [] },
    briefing: { topic: "생딸기라떼", key_points: ["매일 아침 직접 간다"] },
  };

  it("감상·이유·의미는 허용한다고 명시한다", () => {
    // 사장님은 자료를 길게 주지 않는다. 짧은 자료를 영상으로 만들려면 이야기가 필요하다.
    const { system } = buildScriptMessages(project);
    expect(system).toContain("감상·이유·의미");
  });

  it("숫자·순위·실적은 자료에 있는 것만 쓰라고 못박는다", () => {
    // 확인할 수 있는데 확인하면 틀린 말은 사장님이 책임진다
    const { system } = buildScriptMessages(project);
    expect(system).toContain("숫자·순위·실적");
    expect(system).toContain("판매 1위");
    expect(system).toContain("후기 1,000건");
  });

  it("교정 패스도 수치를 새로 붙이지 못하게 막는다", () => {
    // 다듬는 과정에서 새로 들어오면 초안 규칙만으로는 못 잡는다
    const { system } = buildScriptEditMessages(project, { text: "원고" });
    expect(system).toContain("숫자·순위·실적을 새로 붙이지 않는다");
  });
});
