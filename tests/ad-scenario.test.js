// 자동 배치 — 값이 나가는 판정이라 LLM 에 통째로 안 맡긴다.
// 코드가 먼저 좁히고, 남는 결정 지점은 "사진 1장" 하나다.
import { describe, it, expect } from "vitest";
import { pickEndpointKind, buildScenarioMessages, validateScenario, generateScenario, pickEditedShots } from "../lib/ad/scenario.js";
import { SCENARIO_SCHEMA } from "../lib/ad/llm.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0-fast",
};

describe("자동 배치", () => {
  it("사진 0장이면 t2v 로 고정 — LLM 에 안 묻는다", () => {
    expect(pickEndpointKind(0, "i2v")).toBe("t2v");
    expect(pickEndpointKind(0, undefined)).toBe("t2v");
  });

  it("사진 2장 이상이면 r2v 로 고정 — i2v 는 1장만 받는다", () => {
    expect(pickEndpointKind(2, "i2v")).toBe("r2v");
    expect(pickEndpointKind(4, "t2v")).toBe("r2v");
  });

  it("사진 1장일 때만 LLM 의 선택을 받는다", () => {
    expect(pickEndpointKind(1, "i2v")).toBe("i2v");
    expect(pickEndpointKind(1, "r2v")).toBe("r2v");
  });

  it("★ 모르는 값은 r2v 로 떨어진다 — 안전한 쪽", () => {
    expect(pickEndpointKind(1, "x2v")).toBe("r2v");
    expect(pickEndpointKind(1, undefined)).toBe("r2v");
    expect(pickEndpointKind(1, "t2v")).toBe("r2v");   // 사진이 있는데 t2v 면 사진이 버려진다
  });
});

describe("시나리오 프롬프트", () => {
  it("고른 옵션이 전부 프롬프트에 실린다 — 하나라도 빠지면 아무도 못 알아본다", () => {
    const { system, messages } = buildScenarioMessages({
      settings, material: { text: "앰플 광고", photos: [] },
    });
    const all = system + JSON.stringify(messages);
    expect(all).toContain("15");
    expect(all).toContain("9:16");
    expect(all).toMatch(/Korean|한국어/);
    expect(all).toContain("앰플 광고");
    // 포맷의 뼈대·분위기·화풍 문구가 실린다
    expect(all).toMatch(/제품이 주인공/);
    expect(all).toMatch(/premium and restrained/);
    expect(all).toMatch(/live-action cinematic/);
  });
});

// ★ Task 20 — 사용자가 Claude 앱(Fable)에서 같은 소재로 직접 받아본 결과(로우앵글 푸시인·
// 슬로모션·명암 대비·정적 뒤 한 방 등)를 보고 "우리 SYSTEM 은 저걸 시키지 않는다"고
// 지적했다. 아래는 그 지적이 실제로 고쳐졌는지 SYSTEM 문구 자체를 잰다.
//
// ★ 각 단정의 "지키려는 것이 사라지면 이게 실패하는가": SYSTEM 에서 해당 요구·금지 문구를
// 지우면 정확히 그 test 만 실패한다 — 문구가 있는지 없는지를 직접 보므로 우회로가 없다.
describe("SYSTEM — 광고 CF 연출·촬영·조명·음향 감독", () => {
  const { system } = buildScenarioMessages({ settings, material: { text: "가", photos: [] } });

  it("화면에 글자·자막·로고를 넣으라고 요구하지 않는다 — 못 그리는 것을 애초에 요구하지 않는다", () => {
    // 금지 문구 자체는 있어야 하고(모델이 알아서 넣지 않도록),
    expect(system).toMatch(/글자를 넣으라고 요구하지 마라/);
    expect(system).toMatch(/자막|로고/); // "자막은 우리가 나중에 붙인다" 류 언급
    // SYSTEM 자신이 화면에 글자를 넣으라는 지시를 사장님에게 낸 적은 없다
    // (금지 문구를 뺀 나머지에서 "자막을 넣어라"·"로고를 띄워라" 류 적극 요구가 없는지)
    const withoutBanClause = system.replace(/화면에.*?요구하지 마라\.[^가-힣]*/s, "");
    expect(withoutBanClause).not.toMatch(/자막을 (넣|추가|삽입)/);
    expect(withoutBanClause).not.toMatch(/로고를 (띄우|넣)/);
  });

  it("장면마다 카메라·조명·모션·음향 넷을 요구한다", () => {
    expect(system).toMatch(/카메라/);
    expect(system).toMatch(/조명/);
    expect(system).toMatch(/모션/);
    expect(system).toMatch(/음향/);
    // 정적을 쓰는 자리 — 사용자가 지목한 "마지막에 모든 소리가 사라졌다가 한 방"의 근거
    expect(system).toMatch(/정적/);
  });

  it("카메라 지시가 앵글·움직임·렌즈감을 구체적으로 짚는다", () => {
    expect(system).toMatch(/앵글/);
    expect(system).toMatch(/움직임|트래킹|푸시인/);
  });

  it("컷 편집을 지시하지 말라고 한다 — v1 은 한 번의 생성으로 끝난다", () => {
    expect(system).toMatch(/컷 편집/);
  });

  it("만들 수 없는 것(모션그래픽·화면 분할)을 요구하지 말라고 한다", () => {
    expect(system).toMatch(/모션그래픽|화면 분할/);
  });

  it("되묻지 말고 합리적으로 채워 완성된 시나리오를 내라고 한다", () => {
    expect(system).toMatch(/되묻지/);
  });

  it("세로 화면 비율이면 세로 구도로 짜라고 한다", () => {
    expect(system).toMatch(/세로 구도|세로 프레임/);
  });

  it("길이 합이 주어진 초와 같아야 한다고 한다", () => {
    expect(system).toMatch(/합이 그 길이/);
  });
});

describe("옵션 검증 — 넷 다 같은 방식으로 실패한다", () => {
  // ★ 리뷰 지적: format·mood·narration_lang 은 못 찾으면 .label 접근에서 시끄럽게
  // 죽는데, style 만 AD_STYLE_LINES[style] 로 조회해 못 찾아도 undefined 로 조용히
  // 흘러갔다("화풍: undefined" 가 그대로 프롬프트에 실려 $3.63 이 나간다). 넷 다
  // 같은 방식(던진다)으로 맞춘다.
  const material = { text: "가", photos: [] };

  it("목록 밖 format 이면 던진다", () => {
    expect(() => buildScenarioMessages({ settings: { ...settings, format: "없는값" }, material })).toThrow();
  });

  it("목록 밖 mood 면 던진다", () => {
    expect(() => buildScenarioMessages({ settings: { ...settings, mood: "없는값" }, material })).toThrow();
  });

  it("목록 밖 narration_lang 이면 던진다", () => {
    expect(() => buildScenarioMessages({ settings: { ...settings, narration_lang: "없는값" }, material })).toThrow();
  });

  it("목록 밖 style 이면 던진다 — 조용히 undefined 로 흘러가지 않는다", () => {
    expect(() => buildScenarioMessages({ settings: { ...settings, style: "없는값" }, material })).toThrow();
  });

  it("★ style 이 프로토타입 키여도 던진다 — 자기 소유 키만 인정한다", () => {
    expect(() => buildScenarioMessages({ settings: { ...settings, style: "constructor" }, material })).toThrow();
    expect(() => buildScenarioMessages({ settings: { ...settings, style: "__proto__" }, material })).toThrow();
    expect(() => buildScenarioMessages({ settings: { ...settings, style: "toString" }, material })).toThrow();
    expect(() => buildScenarioMessages({ settings: { ...settings, style: "hasOwnProperty" }, material })).toThrow();
  });
});

describe("generateScenario — 주입한 callJson 으로 합성 전체를 돈 없이 잰다", () => {
  it("주입한 callJson 으로 돌고, stage·projectId 를 실어 보낸다", async () => {
    let seen;
    const out = await generateScenario({
      project: { id: "p1", settings, material: { text: "가", photos: [] } },
      deps: {
        callJson: async (args) => {
          seen = args;
          return { text: "P", shots: [{ beat: "가" }] };
        },
      },
    });
    expect(seen.stage).toBeTruthy();
    expect(seen.projectId).toBe("p1");
    // 사진 0장이라 t2v 로 고정 — pickEndpointKind 를 실제로 통과했다는 증거
    expect(out.endpoint).toBe("t2v");
  });

  it("LLM 답이 쓸 수 없으면(장면 없음) 던진다", async () => {
    await expect(
      generateScenario({
        project: { id: "p1", settings, material: { text: "가", photos: [] } },
        deps: { callJson: async () => ({ shots: [] }) },
      })
    ).rejects.toThrow();
  });
});

describe("시나리오 검증", () => {
  it("장면이 없으면 null 이다", () => {
    expect(validateScenario({ shots: [] }, 0)).toBe(null);
    expect(validateScenario(null, 0)).toBe(null);
  });

  it("장면과 본문을 받아 정리해서 돌려준다", () => {
    const out = validateScenario(
      { text: "전체 시나리오", shots: [{ beat: "등장", camera: "slow push-in", action: "병이 놓인다" }], endpoint: "i2v" },
      1
    );
    expect(out.shots.length).toBe(1);
    expect(out.text).toBe("전체 시나리오");
    expect(out.endpoint).toBe("i2v");
  });

  it("★ 사진 수가 LLM 선택을 이긴다", () => {
    const out = validateScenario(
      { text: "가", shots: [{ beat: "가" }], endpoint: "i2v" },
      3
    );
    expect(out.endpoint).toBe("r2v");
  });

  // ★ Task 20 — shots 항목에 lighting·sound·seconds 를 늘렸다. validateScenario 는
  // shots 를 그대로 옮기지(재구성하지) 않으므로 늘어난 필드가 저절로 통과해야 한다.
  // "지키려는 것이 사라지면 이게 실패하는가": validateScenario 가 shots 를
  // {beat, camera, action, line} 로 필드를 골라 다시 만드는 코드로 바뀌면(예: 옛 스키마 시절
  // 방어 코드를 되살리면) lighting·sound·seconds 가 잘려나가 이 test 가 실패한다.
  it("★ 늘어난 필드(lighting·sound·seconds)가 검증을 그대로 통과한다", () => {
    const raw = {
      text: "전체 시나리오",
      shots: [{
        beat: "등장", camera: "로우 앵글 슬로우 푸시인",
        lighting: "탑 라이트, 소프트, 어두운 배경 대비",
        action: "제품이 서서히 회전한다, 슬로모션",
        sound: "낮은 드럼, 정적 뒤 한 방",
        line: "대사", seconds: 8,
      }],
      endpoint: "r2v",
    };
    const out = validateScenario(raw, 0);
    expect(out.shots[0].lighting).toBe("탑 라이트, 소프트, 어두운 배경 대비");
    expect(out.shots[0].sound).toBe("낮은 드럼, 정적 뒤 한 방");
    expect(out.shots[0].seconds).toBe(8);
    // 기존 필드도 여전히 살아있다
    expect(out.shots[0].camera).toBe("로우 앵글 슬로우 푸시인");
    expect(out.shots[0].action).toBe("제품이 서서히 회전한다, 슬로모션");
  });
});

// ★ 컷 편집 — 사장님이 장면을 고치면 그 편집분을 프롬프트에 실어 전체를 다시 쓴다.
//
// 이 기능의 존재 이유는 "고쳤는데 영상은 그대로"를 막는 것이다. 영상에 닿는 것은
// scenario.text 하나뿐이라(lib/ad/generate.js 가 prompt 로 그것만 보낸다), 편집분이
// text 재생성에 실리지 않으면 화면만 바뀌고 결과는 안 바뀐다.
describe("컷 편집을 프롬프트에 싣는다", () => {
  const saved = [
    { beat: "등장", camera: "로우앵글", lighting: "탑라이트", action: "회전", sound: "드럼", line: "첫 대사", seconds: 5 },
    { beat: "클로즈업", camera: "매크로", lighting: "림라이트", action: "오빗", sound: "신스", line: "둘째 대사", seconds: 10 },
  ];
  const material = { text: "앰플 광고", photos: [] };

  it("고친 것이 없으면 프롬프트가 글자 그대로 지금과 같다 — 기존 흐름을 안 흔든다", () => {
    const before = buildScenarioMessages({ settings, material });
    const after = buildScenarioMessages({ settings, material, edits: [] });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(JSON.stringify(buildScenarioMessages({ settings, material, edits: undefined })))
      .toBe(JSON.stringify(before));
  });

  it("고친 장면만 프롬프트에 실린다 — 안 고친 장면은 모델이 자유롭게 다시 쓴다", () => {
    const edits = pickEditedShots(saved, [
      { ...saved[0], line: "고친 대사" },
      { ...saved[1] },
    ]);
    const all = JSON.stringify(buildScenarioMessages({ settings, material, edits }));
    expect(all).toContain("고친 대사");
    // 안 고친 2번 장면의 내용은 안 실린다
    // (2번의 beat "클로즈업"으로는 못 잰다 — 그 낱말은 포맷 hero 의 기본 문구에도 있다)
    expect(all).not.toContain("림라이트");
    expect(all).not.toContain("둘째 대사");
  });

  it("고친 장면은 몇 번째인지와 함께 '그대로 지킨다'로 실린다", () => {
    const edits = pickEditedShots(saved, [saved[0], { ...saved[1], beat: "고친 비트" }]);
    const all = JSON.stringify(buildScenarioMessages({ settings, material, edits }));
    expect(all).toContain("고친 비트");
    expect(all).toMatch(/2\s*번/);          // 몇 번째 장면인지
    expect(all).toMatch(/그대로 지킨다/);    // 지키라는 지시
  });

  it("★ 초는 편집으로 치지 않는다 — 화면이 안 여는 값이고, 합이 전체 길이를 깨면 안 된다", () => {
    // 초만 다르게 보내면 "고친 장면 없음"이다
    expect(pickEditedShots(saved, [{ ...saved[0], seconds: 99 }, saved[1]])).toEqual([]);
    // 다른 필드를 고치면서 초까지 보내도, 실리는 초는 저장된 값이다
    const edits = pickEditedShots(saved, [{ ...saved[0], seconds: 99, beat: "고친 비트" }, saved[1]]);
    expect(edits).toHaveLength(1);
    expect(edits[0].shot.seconds).toBe(5);
  });

  it("★ 장면을 늘리거나 줄여서 보내도 저장된 장면 수를 넘지 않는다 — 화면에 그런 길이 없다", () => {
    const tooMany = pickEditedShots(saved, [saved[0], saved[1], { beat: "몰래 넣은 장면" }]);
    expect(tooMany).toEqual([]);
    // 모자라게 보내면 온 만큼만 본다
    const fewer = pickEditedShots(saved, [{ ...saved[0], beat: "고침" }]);
    expect(fewer).toHaveLength(1);
    expect(fewer[0].n).toBe(1);
  });

  it("보낸 값이 shots 가 아니면 편집 없음으로 본다", () => {
    expect(pickEditedShots(saved, null)).toEqual([]);
    expect(pickEditedShots(saved, "가")).toEqual([]);
    expect(pickEditedShots(null, [{ beat: "가" }])).toEqual([]);
  });
});

// ★★ 이 영상의 **중심**(2026-08-19). 지금까지 시나리오는 카메라·조명·음향은 장면마다
// 상세히 정하면서 "무엇이 이 영상의 주인공인가"는 한 줄도 정하지 않았다. 그래서 제품과
// 인물이 섞여 나오고, 그림을 만들 때 무엇을 지켜야 하는지 아무도 모른 채로 흘러갔다
// (실측 2026-08-19: 딸기라떼 영상에서 컷마다 인물도 컵도 딴 것이 나왔다).
//
// ★ 컨셉(AD_FORMATS)과 다른 질문이다 — 컨셉은 "어떤 형식으로 보여줄까", focus 는
//   "무엇을 지켜야 하나"다. 제품 히어로 형식이어도 중심은 인물일 수 있다.
describe("focus — 이 영상의 중심", () => {
  const ok = (extra) => ({ text: "지시문", shots: [{ beat: "등장" }], ...extra });

  it("★ 모델이 낸 focus 가 통과한다 — validateScenario 는 최상위 칸을 열거해서 통과시킨다", () => {
    expect(validateScenario(ok({ focus: "person" }), 0).focus).toBe("person");
  });

  it("넷을 전부 통과시킨다", () => {
    for (const f of ["product", "person", "info", "place"]) {
      expect(validateScenario(ok({ focus: f }), 0).focus).toBe(f);
    }
  });

  // ★ 모르는 값에 **던지지 않는다.** 옵션(normalizeAdOptions)은 사장님이 고른 값이라
  //   던지는 것이 맞지만, 이건 모델이 낸 값이다 — 던지면 시나리오 한 편이 통째로 날아가고
  //   그 호출값은 이미 치렀다. 안전한 쪽(product)으로 떨어뜨린다.
  it("모르는 값·빠진 값은 product 로 떨어진다 — 시나리오를 통째로 잃지 않는다", () => {
    expect(validateScenario(ok({ focus: "무엇" }), 0).focus).toBe("product");
    expect(validateScenario(ok({}), 0).focus).toBe("product");
    expect(validateScenario(ok({ focus: 7 }), 0).focus).toBe("product");
  });
});

// 스키마가 막으면 SYSTEM 이 아무리 요구해도 모델이 못 낸다 — shows 가 그랬다(78ac723).
describe("SCENARIO_SCHEMA 가 focus 를 낼 길을 연다", () => {
  it("★ 최상위에 focus 가 있고 required 다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("focus");
    expect(SCENARIO_SCHEMA.required).toContain("focus");
  });
});

// SYSTEM 이 중심을 **먼저** 정하게 한다 — 장면을 다 짜고 나서 "그래서 중심이 뭐였지"를
// 뒤에 붙이면 그 값이 장면 구성에 아무 영향을 못 준다(순서가 곧 설계다).
describe("SYSTEM 이 중심을 먼저 정하라고 말한다", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;

  it("★ 넷을 이름으로 열거한다 — 코드가 그 값으로 갈라지므로 모델이 아무 말이나 내면 안 된다", () => {
    const s = sys();
    for (const f of ["product", "person", "info", "place"]) expect(s).toContain(f);
  });

  it("★ 중심을 먼저 정하고 장면을 짜라고 말한다 — 장면 설명보다 앞에 나온다", () => {
    const s = sys();
    expect(s).toMatch(/중심/);
    // 카메라 지시(장면 설계의 시작)보다 focus 얘기가 먼저 와야 한다
    expect(s.indexOf("중심")).toBeLessThan(s.indexOf("카메라"));
  });

  it("★ JSON 예시에 focus 칸이 있다 — 스키마만 열고 예시에 없으면 모델이 자주 빠뜨린다", () => {
    expect(sys()).toMatch(/"focus"/);
  });
});

// ★★ 목소리(2026-08-19). 지금까지 시나리오는 환경음·효과음은 장면마다 정하면서
// **목소리의 성질**(성별·나이·톤·속도)은 한 마디도 정하지 않았다. 그래서 seedance 가
// 기본값으로 읽고, 사장님이 "AI 가 읽어주는 느낌"이라고 하신 밋밋한 나레이션이 된다.
//
// ★ 단계별(lib/cast.js)은 인물마다 voice 를 정한다 — "목소리: 음색과 톤, 영어로".
//   통짜로 굽는 쪽에는 그 자리가 없었다.
// ★ 화자는 **하나**라 최상위에 둔다(shots 안이 아니다). 장면마다 다른 목소리를 지정하면
//   한 영상 안에서 사람이 바뀐다.
describe("voice — 나레이션 목소리", () => {
  const ok = (extra) => ({ text: "지시문", shots: [{ beat: "등장" }], focus: "product", ...extra });

  it("★ 모델이 낸 voice 가 통과한다", () => {
    const v = "a warm, unhurried woman in her late twenties, soft and close-mic";
    expect(validateScenario(ok({ voice: v }), 0).voice).toBe(v);
  });

  it("빠지면 빈 문자열이다 — 없으면 지시문에 아무 말도 안 붙는다(옛 문서와 같다)", () => {
    expect(validateScenario(ok({}), 0).voice).toBe("");
    expect(validateScenario(ok({ voice: 7 }), 0).voice).toBe("");
  });

  it("스키마가 voice 를 낼 길을 연다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("voice");
    expect(SCENARIO_SCHEMA.required).toContain("voice");
  });

  it("★ SYSTEM 이 목소리를 정하라고 말한다", () => {
    const s = buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
    expect(s).toMatch(/"voice"/);
    expect(s).toMatch(/목소리/);
  });
});

// ★★ 인물 레퍼런스(2026-08-19). 실측에서 인물이 전부 외국인이었고, "한국인"이라는 **말**만
// 넣는 것으로는 컷마다 다른 얼굴이 나오는 것을 못 막는다 — 얼굴을 고정하려면 **사진**이
// 있어야 한다. 단계별(lib/cast.js)은 아바타 풀에서 골라 컷마다 꽂는데 film 에는 그 단계가
// 없었다.
//
// ★ LLM 패스를 늘리지 않는다 — 시나리오 한 번 호출 안에서 컷마다 고르게 한다.
describe("avatar_id — 컷마다 인물 사진을 고른다", () => {
  const ok = (shots) => ({ text: "지시문", focus: "person", voice: "v", shots });

  it("★ 스키마의 shots 칸에 avatar_id 가 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties.shots.items.properties)).toContain("avatar_id");
  });

  it("★ required 다 — 빠뜨리면 사람 있는 컷과 없는 컷을 구분할 수 없다", () => {
    expect(SCENARIO_SCHEMA.properties.shots.items.required).toContain("avatar_id");
  });

  it("모델이 낸 avatar_id 가 컷에 그대로 남는다", () => {
    const out = validateScenario(ok([{ beat: "b", avatar_id: "av-woman-20s" }]), 0);
    expect(out.shots[0].avatar_id).toBe("av-woman-20s");
  });

  it("★ SYSTEM 이 아바타 목록을 id 와 함께 보여준다 — 목록을 모르면 못 고른다", () => {
    const s = buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
    for (const id of ["av-man-30s", "av-man-50s", "av-woman-20s"]) expect(s).toContain(id);
  });

  it("★ SYSTEM 이 같은 사람에게 같은 id 를 쓰라고 말한다 — 그것이 얼굴을 고정하는 규칙이다", () => {
    const s = buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
    expect(s).toMatch(/같은 사람.*같은/s);
  });

  it("★ SYSTEM 이 안 맞으면 비우라고 말한다 — 억지로 끼워 맞추면 엉뚱한 얼굴이 실린다", () => {
    const s = buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
    expect(s).toMatch(/빈 문자열|비운다/);
  });
});
