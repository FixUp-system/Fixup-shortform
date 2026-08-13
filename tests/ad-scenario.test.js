// 자동 배치 — 값이 나가는 판정이라 LLM 에 통째로 안 맡긴다.
// 코드가 먼저 좁히고, 남는 결정 지점은 "사진 1장" 하나다.
import { describe, it, expect } from "vitest";
import { pickEndpointKind, buildScenarioMessages, validateScenario, generateScenario } from "../lib/ad/scenario.js";

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
