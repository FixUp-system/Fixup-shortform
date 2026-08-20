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

  // ★ 의도가 뒤집혔다(2026-08-19). 통짜로 굽는 모델에 연출을 장면마다 못 박으면 자유도가
  //   줄고 결과가 뻣뻣해진다 — 사장님 원칙: "한 번에 생성하니 통제를 자제한다".
  //   컷 칸은 **사장님이 화면에서 읽고 고치는 값**으로 남고, 지시문 강제만 걷었다.
  it("★ 연출을 장면마다 강제하지 않는다 — 통짜 모델의 자유도를 뺏지 않는다", () => {
    expect(system).not.toMatch(/반드시 말로 적는다/);
    // 컷 칸 자체는 남는다 — 화면이 보여 주고 사장님이 고친다
    expect(system).toMatch(/camera/);
    expect(system).toMatch(/lighting/);
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

// ★★ 단계별에 쌓인 것을 옮긴다(2026-08-19 사장님 지시 — "단계별에서 겪은 시행착오를
// 여기서 다시 반복하는 건 너무 비효율적이다"). lib/scenario.js·lib/cuts.js 를 훑어
// 광고·film 에 없는 축을 찾았다.
describe("단계별에서 옮겨 온 축들", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
  const ok = (extra) => ({ text: "t", focus: "product", voice: "v", shots: [{ beat: "b" }], ...extra });

  // B. 음악 — 영상 하나에 하나. lib/cuts.js:1552 가 전 컷에 같은 글자로 싣는다.
  describe("music", () => {
    it("★ 스키마에 있다", () => {
      expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("music");
      expect(SCENARIO_SCHEMA.required).toContain("music");
    });
    it("모델이 낸 값이 통과한다", () => {
      expect(validateScenario(ok({ music: "slow piano, sparse and calm" }), 0).music).toBe("slow piano, sparse and calm");
    });
    it("빠지면 빈 문자열이다 — 정적이 연출인 경우도 있다", () => {
      expect(validateScenario(ok({}), 0).music).toBe("");
    });
    it("★ SYSTEM 이 영상 하나에 하나라고 말한다 — 장면마다 다르면 경계에서 곡이 바뀐다", () => {
      expect(sys()).toMatch(/음악/);
      expect(sys()).toMatch(/하나/);
    });
    it("★ SYSTEM 이 가사 있는 음악을 막는다 — 낭독과 겹쳐 둘 다 안 들린다", () => {
      expect(sys()).toMatch(/가사/);
    });
  });

  // C. 톤(색 처리) — lib/cuts.js:1536 이 전 컷에 같은 글자로 싣는다.
  describe("tone", () => {
    it("★ 스키마에 있다", () => {
      expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("tone");
    });
    it("모델이 낸 값이 통과한다", () => {
      expect(validateScenario(ok({ tone: "warm film grain, muted shadows" }), 0).tone).toBe("warm film grain, muted shadows");
    });
    it("빠지면 빈 문자열이다", () => {
      expect(validateScenario(ok({}), 0).tone).toBe("");
    });
  });

  // E. look — 제품 외형 전용 칸. 단계별은 focus.look 에 색·부위·소재와 **크기·비례**를 적는다.
  describe("look", () => {
    it("★ 스키마에 있다", () => {
      expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("look");
    });
    it("모델이 낸 값이 통과한다", () => {
      expect(validateScenario(ok({ look: "pink plush bunny, palm-sized" }), 0).look).toBe("pink plush bunny, palm-sized");
    });
    it("★ SYSTEM 이 크기·비례까지 적으라고 말한다 — 모르면 컷마다 다른 크기로 나온다", () => {
      expect(sys()).toMatch(/크기/);
    });
  });

  // D. speaker — 누가 말하는가. 단계별은 컷마다 적는다("내레이션" 또는 인물).
  describe("speaker", () => {
    it("★ shots 칸에 있다", () => {
      expect(Object.keys(SCENARIO_SCHEMA.properties.shots.items.properties)).toContain("speaker");
    });
    it("모델이 낸 값이 컷에 남는다", () => {
      expect(validateScenario(ok({ shots: [{ beat: "b", speaker: "내레이션" }] }), 0).shots[0].speaker).toBe("내레이션");
    });
    it("★ SYSTEM 이 화면 밖 목소리를 '내레이션'으로 적으라고 말한다 — 그 글자가 판정에 쓰인다", () => {
      expect(sys()).toMatch(/내레이션/);
    });
  });

  // F. 대사 규칙 — **걷어냈다**(2026-08-19). 무음 컷을 부추겼고, 실측에서 대사가 이어지는
  //    광고가 가장 자연스러웠다. 아래 "통짜 생성에는 통제를 자제한다" 가 그 자리를 잰다.
  it("★ 대사 규칙이 없다 — 그 문장이 무음 컷을 부추겼다", () => {
    expect(sys()).not.toMatch(/쉬는 자리|말로 다 채우지/);
  });
});

// ★★ 그림 실측이 두 번 잡은 것(2026-08-19, 에스더버니 키링 두 회차).
//
//  ① 매크로 컷이 **두 번 연속** 실패했다. 1회차는 금속 고리가 화면을 가렸고("stitching,
//     the bunny charm's face, the metal clasp catching warm light" — 초점 대상 셋),
//     2회차는 아예 **3분할 콜라주**로 나왔다("details ...: pink satin ribbon, soft fur
//     fibers glowing at the edges, ..." — 디테일 나열). 나열이 원인이다.
//  ② avatar_id 를 적은 컷에 얼굴이 안 나와 인물 사진이 쓰이지 않았다. shows 가
//     "clipping the keyring onto the handle" 로 손동작에 집중해 모델이 손만 그렸다.
//     사진값($0.08)을 넘기고 안 쓰는 셈이다.
describe("그림 실측이 잡은 shows 규칙", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;

  it("★ 한 장면에 초점 대상은 하나라고 말한다", () => {
    expect(sys()).toMatch(/초점.*하나|하나.*초점/s);
  });

  it("★ 디테일 나열을 막고 그 결과(분할·콜라주)를 이유로 든다 — 이유가 있어야 지켜진다", () => {
    expect(sys()).toMatch(/나열/);
    expect(sys()).toMatch(/분할|콜라주/);
  });

  it("★ 인물 사진을 적은 컷은 얼굴이 보이게 쓰라고 말한다 — 안 그러면 그 사진이 안 쓰인다", () => {
    const s = sys();
    expect(s).toMatch(/얼굴/);
    expect(s).toMatch(/avatar_id/);
  });
});

// ★★ shows 는 **정지 화면**이다(2026-08-19 실측). shot-4 의 shows 에 "gently swaying"
// (흔들린다)이 들어가 이미지가 **모션 블러로 흔들린 채** 생성됐다. 그 이미지는 굽기에
// 참조로 가고 프롬프트는 "Keep each scene faithful to its image" 라고 말하므로,
// 흔들림이 영상까지 따라간다.
//
// ★ 단계별은 아예 칸을 나눠 막는다(lib/cuts.js:417 "shows 에는 카메라 움직임을 적지
//   않는다 — shows 로 만드는 것은 클립의 첫 프레임이 될 정지 화면이다"). 그것으로도 새서
//   scripts/measure/shows-motion-leak.mjs 로 누출을 측정한다. 여기는 action 칸이 따로
//   있는데도 shows 정의에 "정지"라는 말이 없어 움직임이 섞였다.
describe("shows 는 정지 화면이다", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;

  it("★ shows 가 정지 화면이라고 못 박는다", () => {
    expect(sys()).toMatch(/정지/);
  });

  it("★ 움직임은 action 칸이 받는다고 말한다 — 갈 곳을 알려 줘야 안 섞인다", () => {
    expect(sys()).toMatch(/shows[\s\S]{0,400}action/);
  });

  it("★ 그 결과(흔들린 그림)를 이유로 든다 — 이유 없는 금지는 안 지켜진다", () => {
    expect(sys()).toMatch(/흔들|블러/);
  });
});

// ★★ 인물 옷차림(2026-08-19 사장님 지적: "키링과 모델의 옷 스타일이 매치가 안 되는 느낌").
//
// 실측: 제품은 야구단 굿즈(Giants 유니폼을 입은 분홍 토끼 — 스포티·캐주얼)인데 모델이
// 베이지 코트에 정장 바지를 입고 나왔다. shows 에 옷차림이 **한 마디도 없어서** 모델이
// mood(premium — "고급스러운")만 보고 알아서 입혔다.
//
// ★ 영상 하나에 **하나**다 — 컷마다 다르게 적으면 인물이 옷을 갈아입는다.
//   music·tone 과 같은 성질이라 최상위에 둔다.
describe("wardrobe — 인물 옷차림", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
  const ok = (extra) => ({ text: "t", focus: "product", voice: "v", shots: [{ beat: "b" }], ...extra });

  it("★ 스키마에 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("wardrobe");
    expect(SCENARIO_SCHEMA.required).toContain("wardrobe");
  });

  it("모델이 낸 값이 통과한다", () => {
    expect(validateScenario(ok({ wardrobe: "casual baseball cap and denim jacket" }), 0).wardrobe)
      .toBe("casual baseball cap and denim jacket");
  });

  it("사람이 안 나오는 영상은 빈 문자열이다", () => {
    expect(validateScenario(ok({}), 0).wardrobe).toBe("");
  });

  it("★ SYSTEM 이 **제품과 어울리게** 정하라고 말한다 — 그것이 톤이 깨지던 자리다", () => {
    const s = sys();
    expect(s).toMatch(/옷차림/);
    expect(s).toMatch(/어울리/);
  });

  it("★ SYSTEM 이 영상 하나에 하나라고 말한다 — 컷마다 다르면 옷을 갈아입는다", () => {
    expect(sys()).toMatch(/옷차림[\s\S]{0,300}하나/);
  });
});

// ★★ 무대와 이음(2026-08-19 사장님 지적: "장소 전환이 이질적이다, 스튜디오에서 거리로
// 이동할 수 있긴 한데 부자연스럽다"). 실측 시나리오가 컷마다 다른 장소를 지정했다 —
// 어두운 스튜디오 → 매크로 → 한국 거리 → 카페. 15초 안에 세 곳을 점프한다.
//
// ★ 단계별에는 둘 다 있다(lib/cuts.js:366): environment("이 영상의 무대 — 장소·시간대·
//   조명 한 줄", **하나만** 정한다) · transition("이 컷이 시작하는 구도 — 첫 컷에는
//   넣지 않는다"). 사장님이 원한 것은 이동 금지가 아니라 **이어지는 느낌**이라 둘 다 옮긴다.
describe("environment · transition", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
  const ok = (extra) => ({ text: "t", focus: "product", voice: "v", shots: [{ beat: "b" }], ...extra });

  it("★ environment 가 스키마에 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("environment");
    expect(SCENARIO_SCHEMA.required).toContain("environment");
  });

  it("모델이 낸 무대가 통과한다", () => {
    expect(validateScenario(ok({ environment: "a sunlit cafe, late afternoon" }), 0).environment)
      .toBe("a sunlit cafe, late afternoon");
  });

  it("★ SYSTEM 이 무대를 하나만 정하라고 말한다", () => {
    expect(sys()).toMatch(/무대/);
    expect(sys()).toMatch(/무대[\s\S]{0,300}하나/);
  });

  it("★ transition 이 컷 칸에 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties.shots.items.properties)).toContain("transition");
  });

  it("모델이 낸 이음이 컷에 남는다", () => {
    const out = validateScenario(ok({ shots: [{ beat: "b", transition: "pulls back from the close-up" }] }), 0);
    expect(out.shots[0].transition).toBe("pulls back from the close-up");
  });

  it("★ SYSTEM 이 첫 컷에는 이음을 넣지 말라고 말한다 — 이어올 앞 컷이 없다", () => {
    expect(sys()).toMatch(/첫 (장면|컷)[\s\S]{0,120}(넣지|없다|비운다)/);
  });

  it("★ SYSTEM 이 장소를 옮길 때 이어지게 하라고 말한다 — 이동 금지가 아니다", () => {
    expect(sys()).toMatch(/이어지|이어서|이어진/);
  });
});

// ★ 무대도 제품과 어울려야 한다 — wardrobe 에는 그 말을 넣었는데 environment 에는
//   "하나로 묶어라"만 있었다. 야구단 굿즈에 미니멀 화이트 카페가 나와도 규칙 위반이
//   아니었다(2026-08-19).
describe("environment 도 제품과 어울려야 한다", () => {
  it("★ SYSTEM 이 무대를 제품과 어울리게 정하라고 말한다", () => {
    const s = buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
    const at = s.indexOf("무대를 정한다");
    expect(at).toBeGreaterThan(-1);
    // ★ 범위 600자 — 이 절에 "사장님이 적으셨으면 그곳이다" 규칙이 더해져 길어졌다.
    expect(s.slice(at, at + 600)).toMatch(/어울리|어울려/);
  });
});

// ★★ 참조 사진이 있으면 제품 생김새를 글로 다시 적지 않는다(2026-08-19 실측).
//
// 사고: look 이 "with a pink satin ribbon" 이라고만 하고 **위치를 안 적어** 모델이
// 리본을 고리에도 목에도 새로 달았다. 원본은 귀에 작은 리본 두 개뿐이다.
// 앞 회차의 look 에는 "on its ear" 가 있었는데 이번에 빠졌다 — 규칙이 없어서다.
//
// ★ 참조 사진이 있으면 **사진이 진실**이다. 글로 또 묘사하면 글이 이긴다
//   (CLAUDE.md 실측: "참조 사진은 라벤더 토끼·검은 리본인데 프롬프트가 cream-white 를
//   시켜 크림색 토끼가 나왔다").
describe("제품 생김새는 사진이 정한다", () => {
  // ★ 사진 유무는 프로젝트마다 다르므로 SYSTEM(고정)이 아니라 **user 메시지**에 붙는다.
  const sys = (photos) =>
    buildScenarioMessages({ settings, material: { text: "소재", photos } }).messages[0].content;
  const withPhoto = [{ id: "p", url: "/api/uploads/a.jpg", vision: { what: "분홍 토끼", lettering: "Giants" } }];

  it("★ 사진이 있으면 생김새를 다시 적지 말라고 말한다", () => {
    const s = sys(withPhoto);
    expect(s).toMatch(/사진이 있으면[\s\S]{0,300}(다시 적|재서술|묘사하지)/);
  });

  it("★ 사진이 없으면 부위마다 **위치**를 적으라고 말한다 — 안 적으면 모델이 아무 데나 단다", () => {
    expect(sys([])).toMatch(/어디에|위치/);
  });

  it("사진이 없는 프로젝트의 지문은 예전과 같다 — 사진 규칙이 안 붙는다", () => {
    expect(sys([])).not.toMatch(/사진이 있으면 제품의 생김새/);
  });
});

// ★★ 이야기(2026-08-19 사장님 요청: "마스코트가 키링으로 변해서 야구장에서 응원하고
// 일상에서도 함께한다 — 이런 시나리오를 원한다. 이 형식 틀에 갇히나?").
//
// 갇혔다. 지금 SYSTEM 이 요구하는 것은 전부 **"어떻게 찍나"**(카메라·조명·음향·무대·
// 색감·옷차림)이고, **"무슨 이야기인가"**를 적는 자리가 없었다. beat 는 장면 단위라
// 전체 서사를 담지 못한다. 그래서 format(hero — "등장→클로즈업→쓰는 순간→마무리")의
// 틀이 그대로 나왔다.
//
// ★ 단계별에는 그 칸이 있다(lib/scenario.js): angle — "이 영상을 어떻게 전달하는가 —
//   무엇을 중심에 두고 어떤 흐름으로 가는가".
describe("angle — 무슨 이야기인가", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
  const ok = (extra) => ({ text: "t", focus: "product", voice: "v", shots: [{ beat: "b" }], ...extra });

  it("★ 스키마에 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties)).toContain("angle");
    expect(SCENARIO_SCHEMA.required).toContain("angle");
  });

  it("모델이 낸 이야기가 통과한다", () => {
    const a = "마스코트가 키링으로 변해 야구장과 일상을 함께한다";
    expect(validateScenario(ok({ angle: a }), 0).angle).toBe(a);
  });

  it("★ SYSTEM 이 **먼저** 이야기를 정하라고 말한다 — 장면보다 앞에 나온다", () => {
    const s = sys();
    expect(s).toMatch(/흐름|이야기/);
    expect(s.indexOf("이야기")).toBeLessThan(s.indexOf("카메라"));
  });

  it("★ SYSTEM 이 사장님이 적은 이야기를 살리라고 말한다 — 틀이 이야기를 덮으면 안 된다", () => {
    expect(sys()).toMatch(/사장님이 적은|사장님의 이야기|적어 주신/);
  });
});

// ★★ 변신을 막던 규칙(2026-08-19). look 이 "사진 그대로 끝까지 유지"라 마스코트에서
// 키링으로 **변하는** 연출과 정면으로 부딪혔다. 리본 문제를 고치려고 조인 것이 이야기를
// 막았다 — 지켜야 할 것은 "지어내지 않는 것"이지 "변하지 않는 것"이 아니다.
describe("변하는 연출을 막지 않는다", () => {
  const sys = (photos) =>
    buildScenarioMessages({ settings, material: { text: "소재", photos } }).messages[0].content;
  const withPhoto = [{ id: "p", url: "/api/uploads/a.jpg", vision: { what: "분홍 토끼", lettering: "Giants" } }];

  it("★ 제품이 변하는 연출이면 무엇에서 무엇으로 변하는지 적으라고 말한다", () => {
    expect(sys(withPhoto)).toMatch(/변하|변신/);
  });

  it("생김새를 지어내지 말라는 규칙은 그대로다 — 둘은 다른 얘기다", () => {
    expect(sys(withPhoto)).toMatch(/다시 적지 마라|지어내지/);
  });
});

// ★★ 소재에 적힌 것이 광고 관습보다 우선한다(2026-08-19 사장님 지적: "집 주방인데
// 스튜디오 느낌이 왜 섞이나 — 사용자가 '생활감 있는 집'이라고 적을 리 없다").
//
// 실측: 소재가 "20대 여성이 퇴근하고 집에서 조리해 먹는"인데 environment 가
// "a bright tidy home kitchen … clean pale counter **like a studio backdrop**" 이 됐다.
// "제품이 주인공"이라는 말이 세 겹(SYSTEM 의 "광고 CF 감독" · format=hero ·
// focus=product)으로 쌓여 제품 촬영 관습을 끌어온 것이다.
//
// ★ angle 에는 "사장님이 적어 주신 이야기가 있으면 그것이 이야기다"를 넣었는데
//   environment·wardrobe 에는 같은 문장이 없었다.
describe("소재에 적힌 것이 광고 관습을 이긴다", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;

  it("★ 무대 — 사장님이 장소를 적었으면 그곳이라고 말한다", () => {
    const s = sys();
    const at = s.indexOf("무대를 정한다");
    expect(s.slice(at, at + 600)).toMatch(/적으셨|적어 주신|적은 곳|그곳/);
  });

  it("★ 무대 — 광고 관습으로 스튜디오화하지 말라고 말한다", () => {
    const s = sys();
    const at = s.indexOf("무대를 정한다");
    expect(s.slice(at, at + 600)).toMatch(/스튜디오/);
  });

  it("★ 옷차림도 같다 — 사장님이 적었으면 그것이다", () => {
    const s = sys();
    const at = s.indexOf("옷차림도 정한다");
    expect(s.slice(at, at + 500)).toMatch(/적으셨|적어 주신|적은/);
  });
});

// ★★ 발음 표기와 자막 표기를 나눈다(2026-08-19 사장님 요청).
//
// 실측: "에스더버니" → **"에스터버리"**, "Giants 에디션" → **"지에이턴스 에디전"**.
// 뒤엣것은 소재를 고쳐 대사를 한글("자이언츠")로 쓰면서 사라졌다 — **표기를 바꾸면
// 발음이 바뀐다**는 것이 실측으로 확인됐다.
//
// ★ 그런데 line 하나가 **자막 글자**이자 **읽을 글자**라, 발음을 고치려고 표기를 바꾸면
//   자막에도 그 표기가 박힌다("에스더 버니"). 그래서 나눈다.
describe("say_as — 읽는 표기를 자막과 나눈다", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;
  const ok = (shots) => ({ text: "t", focus: "product", voice: "v", shots });

  it("★ shots 칸에 say_as 가 있다", () => {
    expect(Object.keys(SCENARIO_SCHEMA.properties.shots.items.properties)).toContain("say_as");
  });

  it("모델이 낸 값이 컷에 남는다", () => {
    const out = validateScenario(ok([{ beat: "b", line: "에스더버니 키링", say_as: "에스더 버니 키링" }]), 0);
    expect(out.shots[0].say_as).toBe("에스더 버니 키링");
  });

  it("★ SYSTEM 이 **필요할 때만** 적으라고 말한다 — 늘 적으면 자막과 갈릴 위험만 는다", () => {
    const s = sys();
    expect(s).toMatch(/say_as/);
    expect(s).toMatch(/say_as[\s\S]{0,400}(필요할 때|어려운|틀리게)/);
  });

  it("★ SYSTEM 이 자막은 line 을 쓴다고 말한다 — 둘이 다른 값이라는 것이 핵심이다", () => {
    const s = sys();
    const at = s.indexOf("say_as");
    expect(s.slice(at - 200, at + 500)).toMatch(/자막/);
  });
});

// ★★ 통짜로 굽는 모델에는 **통제를 자제한다**(2026-08-19 사장님 원칙).
//
// "대사 규칙 같은 것들은 영상을 **분할 생성**할 때 생기는 문제를 해결하려고 넣은 것이다.
//  지금은 한 번에 생성하니 최대한 통제를 자제하는 게 맞다 — 시나리오를 벗어나거나,
//  제품을 변형시키거나, 인물 일관성이 깨지는 것만 빼고."
//
// 그 원칙으로 걷어내는 둘:
//  ① 대사 규칙 — "말로 다 채우지 마라"가 **무음 컷을 부추겼다**. 실측에서 어제 광고
//     (대사 연속)가 가장 자연스러웠고, 무음 컷이 하나 낀 것이 중간, 오늘 것이 가장
//     어색했다.
//  ② 장면 분할 표기와 연출 강제 — 통짜인데 "Scene N (0-4s)" 로 쪼개고 카메라·조명·
//     모션·음향을 장면마다 강제한다. 모델은 그 초를 **안 지키면서 경계만** 만든다(실측).
//     계획서 Task 4 가 같은 얘기다.
describe("통짜 생성에는 통제를 자제한다", () => {
  const sys = () => buildScenarioMessages({ settings, material: { text: "소재", photos: [] } }).system;

  it("★ 대사 규칙이 사라진다 — 무음 컷을 부추기던 문장", () => {
    expect(sys()).not.toMatch(/말로 다 채우지|쉬는 자리/);
  });

  it("★ 장면마다 초를 적으라고 하지 않는다 — 모델이 안 지키면서 경계만 만든다", () => {
    expect(sys()).not.toMatch(/각 장면에 대략 몇 초/);
  });

  it("★ 카메라·조명·모션·음향을 '반드시' 적으라고 강제하지 않는다", () => {
    expect(sys()).not.toMatch(/반드시 말로 적는다/);
    expect(sys()).not.toMatch(/빠뜨리면 모델 재량이 되어 밋밋해진다/);
  });

  it("★ 지시문을 **하나로 이어지는 흐름**으로 쓰라고 말한다", () => {
    expect(sys()).toMatch(/흐름|이어지/);
  });

  // ── 지켜야 할 것은 그대로 남는다 ─────────────────────────────────────
  it("★ 대사를 지시문에 그대로 적는 규칙은 남는다 — 시나리오 이탈을 막는 자리다", () => {
    expect(sys()).toMatch(/대사는 지시문\(text\) 안에도 그대로 적는다/);
  });

  it("★ 전체 길이 규칙은 남는다 — 15초짜리를 만들어야 한다", () => {
    expect(sys()).toMatch(/전체 길이는 정확히/);
  });

  it("★ 제품·인물 규칙은 남는다", () => {
    const s = sys();
    expect(s).toMatch(/look/);        // 제품 외형
    expect(s).toMatch(/avatar_id/);   // 인물 사진
    expect(s).toMatch(/wardrobe/);    // 옷차림
  });

  it("★ 컷 칸(camera·lighting·action·sound)은 스키마에 남는다 — 화면이 보여 주고 사장님이 고친다", () => {
    const cols = Object.keys(SCENARIO_SCHEMA.properties.shots.items.properties);
    for (const k of ["camera", "lighting", "action", "sound"]) expect(cols).toContain(k);
  });
});
