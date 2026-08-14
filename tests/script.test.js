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
  sayableFacts,
  buildScriptMessages,
  overTarget,
  underTarget,
  unusedFacts,
  weakOpening,
  scriptScore,
  secondsForText,
  targetChars,
  capacitySeconds,
  BOOKEND_MIN_CHARS,
  wantsBookend,
  bookendBlock,
  SPEECH_DENSITY,
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
  //
  // ★ 그 측정이 막은 것은 **"요약이 원문을 대신하는 것"** 이다. 그래서 금지는 요약 블록과
  //   내용 요약(topic·audience)에 걸린다 — 이 계약은 그대로다.
  //
  // ⚠️ takeaway(목적)는 2026-08-13 에 이 금지에서 빠졌다. 성격이 다르기 때문이다:
  //   요약은 **문장화될 재료**이고, 목적은 **무엇을 고를지의 과녁**이다(프롬프트가 "읽는
  //   말이 아니다"를 함께 말한다). key_points 도 같은 이유로 이미 [말할 것]으로 들어간다.
  //   ★ 다만 이것은 **아직 측정되지 않은 가정**이다 — 목적 한 줄이 원문을 밀어내지 않는지는
  //     A/B 로 재야 한다. 재서 밀어내는 것으로 나오면 이 자리를 되돌린다.
  it("브리핑 요약은 지문에 넣지 않는다 — 원문이 직접 닿아야 한다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).not.toContain("[정리된 브리핑]");
    expect(user).not.toContain("생딸기라떼 신메뉴"); // topic
    expect(user).not.toContain("동네 주민");         // audience
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

  // ★ 아래 targetChars 기대값은 모두 SPEECH_DENSITY(0.45)를 곱한 값이다.
  //   capacitySeconds·materialChars는 밀도와 무관하다(자료가 감당하는 길이는 자료만 본다) —
  //   그래서 이 describe 안에서도 capacitySeconds 검증 값만은 밀도 반영 전 그대로다.
  it("사장님이 고른 길이가 있으면 그것이 목표다", () => {
    const p = { ...withPoints(2), settings: { target_seconds: 30 } };
    expect(targetChars(p)).toBe(74); // 30초 × 5.5자 × 0.45 = 74.25 → 74
  });

  it("고른 길이는 자료가 얇아도 깎지 않는다 — 10초를 고른 사람에게 5초를 주면 실패다", () => {
    const p = { ...withPoints(1), settings: { target_seconds: 45 } };
    expect(targetChars(p)).toBe(111); // 45 × 5.5 × 0.45 = 111.375 → 111
  });

  it("목록에 없는 값은 무시하고 자동으로 돌아간다", () => {
    for (const bad of [7, "30", null, undefined]) {
      expect(targetChars({ ...withPoints(2), settings: { target_seconds: bad } })).toBe(27); // 60 × 0.45 = 27
    }
  });

  it("자료가 감당하는 길이는 고른 값과 무관하게 자료만 본다", () => {
    const p = { ...withPoints(2), settings: { target_seconds: 60 } };
    expect(capacitySeconds(p)).toBe(11); // 사실 2개 → 60자 → 11초(밀도 무관 — capacitySeconds는 자료만 본다)
  });

  it("사실 수에 비례하되 40초(220자, 밀도 반영 전) 상한 위에 밀도가 걸린다", () => {
    expect(targetChars(withPoints(20))).toBe(99); // 220 × 0.45 = 99
  });

  it("자료가 얇아도 최소 분량은 준다", () => {
    expect(targetChars(withPoints(1))).toBe(27); // 60 × 0.45 = 27
  });

  it("자료로 만들 수 있는 길이를 초로 돌려준다 — 사실 하나에 약 5초", () => {
    expect(capacitySeconds(withPoints(1))).toBe(11);  // 하한 60자(밀도 무관)
    expect(capacitySeconds(withPoints(4))).toBe(22);  // 120자
    expect(capacitySeconds(withPoints(20))).toBe(40); // 상한 220자
  });

  it("답을 받은 질문도 사실로 센다", () => {
    const p = {
      ...project,
      briefing: { key_points: ["ㄱ", "ㄴ"], asked: [{ question: "가격은?", answer: "5천원" }, { question: "언제?", answer: "" }] },
    };
    expect(targetChars(p)).toBe(41); // 사실 3개 × 30 = 90 → 90 × 0.45 = 40.5 → 41
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
    // 고정 +5자가 아니라 목표에 비례한 여유로 잰다 — 밀도로 목표가 작아지면(27자)
    // 고정 오프셋은 더 이상 "조금"이 아니게 된다.
    expect(overTarget(project, "가".repeat(Math.round(targetChars(project) * 1.05)))).toBe(false);
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

  // ⚠️ 2026-08-14 오전에 한 번 뒤집었다가 같은 날 되돌린 자리다.
  // 뒤집은 이유(15초 요청에 11초)는 진짜였지만, 원인은 판정이 아니라 **목표 자체**였다 —
  // 목표가 83자라 얕은 자료가 닿을 수 없었다. 밀도 계수로 목표를 37자로 내리면
  // 그 자료도 목표에 닿으므로, 지어내기 위험을 감수하며 판정을 열 이유가 없다.
  // (지어내기는 실측된 실패다: 두 줄짜리 자료에서 하한을 요구했더니 "직접 삶아 세탁"이 나왔다.)
  it("자료의 사실을 이미 다 썼으면 짧아도 잡지 않는다 — 지어내게 만들면 안 된다", () => {
    const usedAll = "매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다.";
    expect(unusedFacts(project, usedAll)).toEqual([]);
    expect(underTarget(project, usedAll)).toBe(false);
    expect(scriptFaults(project, { text: usedAll })).toEqual([]);
  });

  // 채울 재료가 없을 때 "채워라"고만 하면 지어낸다 — 무엇으로 채울지를 지문이 말해야 한다.
  // 안 쓴 사실이 있을 때와 없을 때가 서로 다른 말이어야 하는 자리다.
  it("안 쓴 사실이 없으면 되돌리기 지문이 '이미 쓴 사실을 더 깊이'로 안내한다", () => {
    const usedAll = "매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다.";
    const { messages } = buildScriptRewriteMessages(
      project, { text: usedAll }, ["분량 미달"]
    );
    const content = messages[0].content;
    expect(content).toContain("[더 깊이 갈 자리]");
    expect(content).not.toContain("[아직 안 쓴 사실]"); // 없는 것을 있다고 적지 않는다
    expect(content).toContain("지어내지");
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
    // 자료의 사실을 다 쓴 글이면 짧아도 미달로 잡히지 않는다(unusedFacts 기준으로 되돌아갔다) —
    // 목표(밀도 반영 27자) 안에 억지로 맞출 필요가 없다.
    const ok = "매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다.";
    expect(scriptFaults(project, { text: ok })).toEqual([]);
  });

  it("원고가 없으면 판정하지 않는다", () => {
    expect(scriptFaults(project, null)).toEqual([]);
    expect(scriptFaults(project, { text: "  " })).toEqual([]);
  });

  // 광고 실측(2026-08-14, 3편): 15초에 대사가 31~39자뿐이었다(밀도 37~47%).
  // 분할생성은 컷 초 = 낭독 초라 정의상 100% 였다 — 쉬는 자리가 구조적으로 없었다.
  it("고른 초에 밀도 계수를 곱해 목표를 낸다", () => {
    const p15 = { ...project, settings: { target_seconds: 15 } };
    const p30 = { ...project, settings: { target_seconds: 30 } };
    // 15 × 5.5 × 0.45 = 37.125 → 37
    expect(targetChars(p15)).toBe(37);
    expect(targetChars(p30)).toBe(74);
    expect(SPEECH_DENSITY).toBe(0.45);
  });

  // 자동 길이(자료가 정하는 쪽)에도 같은 밀도가 걸려야 한다 — 한쪽만 걸면 모드마다 다른 영상이 나온다
  it("길이를 안 고른 프로젝트에도 밀도가 걸린다", () => {
    const auto = { ...project, settings: {} };
    const withDensity = targetChars(auto);
    expect(withDensity).toBeGreaterThan(0);
    // 자료 기준 자수(사실 2개 → 하한 60자)에 0.45 를 곱한 값
    expect(withDensity).toBe(Math.round(60 * SPEECH_DENSITY));
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

  // 2026-08-14: "그럴 바에는 짧은 채로 둔다"를 지웠다. 그 한 줄이 얕은 자료에서
  // 빠져나갈 문이 되어 15초 요청에 11초가 나왔다. 지어내기 금지는 남기되(아래 두 줄),
  // 짧게 끝내는 것이 정답이라고는 더 이상 말하지 않는다.
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

describe("메타 문장·연출 어휘를 코드가 잡는다", () => {
  // ★ 지문에는 이미 금지가 있다 — "샷 크기·앵글·조명은 한 낱말도 넣지 않는다",
  //   "'강조·긴장' 같은 연출 단어는 넣지 않는다". 그리고 어겼다(2026-07-30 실제 생성물 3회).
  //   이 저장소의 규율대로 프롬프트를 더 붙이지 않고 코드가 판정한다.
  //   잡히면 되돌리기(≤3회)가 실패 사유를 받아 다시 쓴다 — 배선은 이미 있다.

  it("영상이 스스로를 설명하는 문장을 잡는다", () => {
    // 실제 생성물 그대로
    const cases = [
      "신발이 주인공이 되어 경기를 이끄는 순간, 그 감각이 자연스럽게 다가옵니다.",
      "이런 기능 덕분에 신발이 주인공이 되는 순간이 많습니다.",
      "이 광고는 20대 초반 남성을 위한 것입니다.",
      "시청자가 보고 신고 싶어지는 신발입니다.",
    ];
    for (const text of cases) {
      expect(scriptFaults(project, { text }), text).toContain("메타 문장");
    }
  });

  it("연출 지시를 낭독하는 문장을 잡는다", () => {
    const cases = [
      "공중에 뜬 모습은 극단적 슬로모션으로 강조됩니다.",
      "이 순간의 정적 속에서 긴장감이 흐릅니다.",
      "발목을 클로즈업으로 보여줍니다.",
      "로우 앵글로 신발을 담았습니다.",
      "카메라가 신발을 따라갑니다.",
      // ★ 카메라가 **움직이는** 문장은 연출이다(2026-08-14 보강)
      "카메라가 천천히 다가갑니다.",
      "카메라를 뒤로 물립니다.",
    ];
    for (const text of cases) {
      expect(scriptFaults(project, { text }), text).toContain("연출 어휘 낭독");
    }
  });

  // ⚠️ 넓게 잡으면 멀쩡한 원고를 계속 다시 쓰게 된다 — weakOpening 이 좁게 잡힌 것과 같은 이유.
  //   특히 제품 용어와 겹치는 낱말을 넣으면 정상 카피가 결함이 된다.
  it("정상 원고를 잡지 않는다", () => {
    const ok = [
      "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.",
      "발목을 덮는 하이톱이라 방향을 틀어도 발목이 덜 흔들립니다.",
      "착지할 때 미드솔이 눌리며 무릎에 오는 충격을 줄입니다.",
      // '실루엣'은 옷·신발의 정당한 제품 용어다 — 연출 어휘로 잡으면 안 된다
      "허리선을 올려서 실루엣이 길어 보입니다.",
      // '장면'·'셰이크'도 일상 낱말이다
      "기억에 남는 장면이 하나 있습니다.",
      "여름에는 셰이크가 제일 많이 나갑니다.",
      // '눈높이'는 응대 표현으로 쓰인다
      "손님 눈높이에 맞춰 설명해 드립니다.",
      // ★ '카메라'는 **제품 사양**이기도 하다(2026-08-14 실측으로 드러났다).
      //   핸드폰 광고에서 브리핑이 1번으로 뽑은 "카메라에 강점이 있는 핸드폰"이
      //   연출 어휘로 걸려 [말할 것] 목록에서 통째로 빠졌다.
      "이 핸드폰은 카메라가 좋습니다.",
      "카메라 가방도 함께 팝니다.",
      "카메라로 찍은 사진이 선명합니다.",
    ];
    for (const text of ok) {
      const faults = scriptFaults(project, { text });
      expect(faults, text).not.toContain("메타 문장");
      expect(faults, text).not.toContain("연출 어휘 낭독");
    }
  });

  it("되돌리기 지문이 무엇이 걸렸는지 함께 준다", () => {
    // 사유만 주면 모델이 어느 낱말인지 못 찾아 같은 것을 다시 쓴다
    const text = "공중에 뜬 모습은 극단적 슬로모션으로 강조됩니다.";
    const faults = scriptFaults(project, { text });
    const { messages } = buildScriptRewriteMessages(project, { text }, faults);
    expect(messages[0].content).toContain("슬로모션");
  });
});

describe("대본이 '말할 것'을 정리된 사실로 받는다", () => {
  // ★ 여기까지 대본이 받는 것은 자료 원문뿐이었다 — key_points 를 한 번도 보지 않았다.
  //   그래서 기획서 2000자를 던져 주고 "무엇을 말할지"는 모델이 스스로 골랐고,
  //   분량을 채우려 필러("이런 기능들이 모여", "직접 확인할 수 있습니다")를 썼다.

  const brief = (key_points) => ({
    material: { text: "자료 원문입니다.", photos: [] },
    briefing: { topic: "농구화", key_points, asked: [] },
    settings: { target_seconds: 30 },
  });

  it("사실만 골라 대본 지문에 넣는다", () => {
    const p = brief(["하이톱이 발목을 지지한다", "미드솔이 충격을 흡수한다"]);
    const user = buildScriptMessages(p).messages[0].content;
    expect(user).toContain("하이톱이 발목을 지지한다");
    expect(user).toContain("미드솔이 충격을 흡수한다");
  });

  // 실제로 이런 key_points 가 나왔다 — 네 개 전부 연출이고 제품 사실이 0개였다.
  it("연출 서술은 말할 것에서 뺀다 — 그것을 주면 낭독하라는 말이 된다", () => {
    const p = brief([
      "로우 앵글 트래킹과 약한 슬로모션으로 방향 전환을 강조",
      "극단적 슬로모션으로 점프슛을 하이라이트",
      "하이톱이 발목을 지지한다",
    ]);
    const user = buildScriptMessages(p).messages[0].content;
    expect(user).toContain("하이톱이 발목을 지지한다");
    expect(user).not.toContain("극단적 슬로모션");
    expect(user).not.toContain("로우 앵글");
  });

  it("사실이 하나도 안 남으면 블록째 뺀다 — 지금 동작 그대로", () => {
    const p = brief(["로우 앵글 트래킹으로 강조", "카메라가 따라간다"]);
    const user = buildScriptMessages(p).messages[0].content;
    expect(user).not.toContain("[말할 것");
  });

  it("sayableFacts 가 사실만 돌려준다", () => {
    expect(sayableFacts({ key_points: ["발목 지지", "로우 앵글 트래킹"] })).toEqual(["발목 지지"]);
    // ★ 제품 사양으로서의 카메라는 남는다 — 이것이 빠져서 대본이 가장 센 것을 못 봤다
    expect(sayableFacts({ key_points: ["카메라에 강점이 있는 핸드폰", "가벼운 무게"] }))
      .toEqual(["카메라에 강점이 있는 핸드폰", "가벼운 무게"]);
    expect(sayableFacts(null)).toEqual([]);
  });

  // 분량이 미달일 때 "아직 안 쓴 사실"로 연출을 넘기면, 되돌리기가 연출을 원고에 넣으려 한다
  it("안 쓴 사실에도 연출이 섞이지 않는다", () => {
    const p = brief(["하이톱이 발목을 지지한다", "극단적 슬로모션으로 하이라이트"]);
    expect(unusedFacts(p, "짧은 원고입니다.")).toEqual(["하이톱이 발목을 지지한다"]);
  });
});

// ── 수미상관 ──────────────────────────────────────────────────────────────
// 설계 docs/superpowers/specs/2026-08-13-script-bookend-design.md
// 연 자리로 돌아와 닫는다. 짧은 편(15초)에는 걸지 않는다 — 문장 넷 중 둘이 같은 얘기가 된다.

describe("수미상관 — 짧은 편에는 걸지 않는다", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });

  it("15초짜리는 걸지 않는다", () => {
    expect(wantsBookend(withSeconds(15))).toBe(false);
  });

  it("30·45·60초는 건다", () => {
    for (const s of [30, 45, 60]) expect(wantsBookend(withSeconds(s))).toBe(true);
  });

  // SPEECH_DENSITY 도입(2026-08-14, Task 1)으로 targetChars가 밀도만큼 줄었다.
  // wantsBookend가 BOOKEND_MIN_CHARS(밀도 반영 전 자수)를 그대로 비교하면 30·45초까지
  // 경계 아래로 내려가 수미상관을 조용히 잃는다 — 그래서 비교식도 같은 배수로 내린다
  // (BOOKEND_MIN_CHARS * SPEECH_DENSITY). 이 테스트는 그 배선이 유지됨을 못박는다:
  // 15초는 여전히 안 걸리고 30초는 여전히 걸린다.
  it("밀도 계수가 걸려도 15초는 여전히 안 걸리고 30초는 여전히 건다", () => {
    expect(targetChars(withSeconds(15))).toBeLessThanOrEqual(BOOKEND_MIN_CHARS * SPEECH_DENSITY);
    expect(wantsBookend(withSeconds(15))).toBe(false);
    expect(targetChars(withSeconds(30))).toBeGreaterThan(BOOKEND_MIN_CHARS * SPEECH_DENSITY);
    expect(wantsBookend(withSeconds(30))).toBe(true);
  });

  // 사장님이 길이를 안 고르면 자료가 길이를 정한다 — 고른 초만 보면 이 경로가 통째로 빠진다
  it("자동(길이 미선택)이면 자료 양으로 갈린다", () => {
    const few = { ...project, settings: { aspect_ratio: "9:16" }, briefing: { ...project.briefing, key_points: ["하나", "둘"], asked: [] } };
    const many = { ...project, settings: { aspect_ratio: "9:16" }, briefing: { ...project.briefing, key_points: ["하나", "둘", "셋", "넷", "다섯"], asked: [] } };
    expect(targetChars(few)).toBeLessThanOrEqual(BOOKEND_MIN_CHARS * SPEECH_DENSITY);
    expect(wantsBookend(few)).toBe(false);
    expect(targetChars(many)).toBeGreaterThan(BOOKEND_MIN_CHARS * SPEECH_DENSITY);
    expect(wantsBookend(many)).toBe(true);
  });

  // 사실 4개 × 30자 = 정확히 120자(밀도 반영 전). 밀도를 곱한 뒤에도(54자) 경계는
  // **넘어야** 켜진다(> 이지 >= 가 아니다) — wantsBookend 쪽 경계도 같은 배수로 내렸기 때문이다.
  it("딱 120자(밀도 반영 전)면 끈다", () => {
    const exact = {
      ...project,
      settings: { aspect_ratio: "9:16" },
      briefing: { ...project.briefing, key_points: ["하나", "둘", "셋", "넷"], asked: [] },
    };
    expect(targetChars(exact)).toBe(BOOKEND_MIN_CHARS * SPEECH_DENSITY);
    expect(wantsBookend(exact)).toBe(false);
  });
});

describe("bookendBlock — 문구는 한 자리에만 있다", () => {
  it("세 종류 모두 같은 머리말을 단다", () => {
    for (const kind of ["write", "rewrite", "edit"]) {
      expect(bookendBlock(kind)).toContain("[구조 — 수미상관]");
    }
  });

  // 지난번 라이브에서 "신발에서 시작해 신발로 끝나는 구조가 이를 가능하게 합니다" 가 나왔다.
  // 연출 지시를 구조로 만들지 못하고 낭독해 버린 것이라, 이 금지가 빠지면 그대로 재발한다.
  it("구조를 낭독하지 말라는 금지가 들어 있다", () => {
    expect(bookendBlock("write")).toContain("구조를 입 밖에 내지 않는다");
    expect(bookendBlock("rewrite")).toContain("구조를 입 밖에 내지 않는다");
  });

  it("같은 말을 되풀이하지 말라고 시킨다 — 되풀이 결함으로 오인되는 자리다", () => {
    expect(bookendBlock("write")).toContain("같은 말을 되풀이하지 않는다");
  });

  it("되돌리기 몫은 세 가지 충돌을 덮는다", () => {
    const r = bookendBlock("rewrite");
    expect(r).toContain("마지막 문장도 새 첫 문장에 맞춰 함께 고친다");
    expect(r).toContain("'같은 말 되풀이'가 아니다");
    expect(r).toContain("닫는 문장은 남긴다");
  });

  it("교정 몫은 지우지 말라는 것 하나다", () => {
    const e = bookendBlock("edit");
    expect(e).toContain("군더더기가 아니다");
    expect(e).not.toContain("닫는 문장은 남긴다");
  });

  it("기본값은 write 다", () => {
    expect(bookendBlock()).toBe(bookendBlock("write"));
  });
});

describe("buildScriptMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });

  it("30초면 지문에 수미상관이 실린다", () => {
    const user = buildScriptMessages(withSeconds(30)).messages[0].content;
    expect(user).toContain("[구조 — 수미상관]");
    expect(user).toContain("구조를 입 밖에 내지 않는다");
  });

  it("15초면 한 자도 안 들어간다 — 기존 동작 불변", () => {
    const user = buildScriptMessages(withSeconds(15)).messages[0].content;
    expect(user).not.toContain("수미상관");
  });

  // 상수에 넣으면 길이를 모르는 채로 늘 걸린다. 조건부라는 것을 못 박는다.
  it("SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptMessages(withSeconds(30)).system).not.toContain("수미상관");
  });

  // 수정 지시는 지문의 맨 끝이라야 한다 — 구조 설명이 그 뒤에 오면 지시가 묻힌다
  it("수정 지시가 수미상관 블록보다 뒤에 온다", () => {
    const p = { ...withSeconds(30), script: { text: "기존 원고입니다." } };
    const user = buildScriptMessages(p, "더 짧게").messages[0].content;
    expect(user.indexOf("[구조 — 수미상관]")).toBeLessThan(user.indexOf("[수정 지시]"));
  });
});

describe("buildScriptRewriteMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });
  const draft = { text: "3,000원짜리 앰플이 하루 만에 품절됐습니다. 시카가 진정시킵니다." };

  it("30초면 되돌리기 몫 셋이 실린다", () => {
    const c = buildScriptRewriteMessages(withSeconds(30), draft, ["약한 오프닝"]).messages[0].content;
    expect(c).toContain("마지막 문장도 새 첫 문장에 맞춰 함께 고친다");
    expect(c).toContain("'같은 말 되풀이'가 아니다");
    expect(c).toContain("닫는 문장은 남긴다");
  });

  it("15초면 한 자도 안 들어간다", () => {
    const c = buildScriptRewriteMessages(withSeconds(15), draft, ["약한 오프닝"]).messages[0].content;
    expect(c).not.toContain("수미상관");
  });

  it("REWRITE_SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptRewriteMessages(withSeconds(30), draft, ["분량 초과"]).system).not.toContain("수미상관");
  });

  // 지적 사유가 무엇이든 구조는 지켜야 한다 — '분량 초과' 로 줄일 때가 특히 위험하다
  it("어떤 결함으로 불렸든 실린다", () => {
    for (const f of ["약한 오프닝", "같은 말 되풀이", "분량 초과", "분량 미달"]) {
      expect(buildScriptRewriteMessages(withSeconds(45), draft, [f]).messages[0].content).toContain("[구조 — 수미상관]");
    }
  });
});

describe("buildScriptEditMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });
  const draft = { text: "3,000원짜리 앰플이 하루 만에 품절됐습니다. 그 3,000원짜리는 오늘도 오후면 없습니다." };

  it("30초면 지우지 말라는 말이 실린다", () => {
    const c = buildScriptEditMessages(withSeconds(30), draft).messages[0].content;
    expect(c).toContain("군더더기가 아니다");
  });

  it("15초면 한 자도 안 들어간다", () => {
    const c = buildScriptEditMessages(withSeconds(15), draft).messages[0].content;
    expect(c).not.toContain("수미상관");
  });

  it("EDIT_SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptEditMessages(withSeconds(30), draft).system).not.toContain("수미상관");
  });

  it("[분량] 은 그대로 남는다", () => {
    const c = buildScriptEditMessages(withSeconds(30), draft).messages[0].content;
    expect(c).toContain("[분량]");
    expect(c).toContain("[다듬을 원고]");
  });
});
