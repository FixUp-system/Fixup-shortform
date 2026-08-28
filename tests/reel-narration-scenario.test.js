// 시나리오가 내레이션을 **한 벌**로 낸다.
//
// ★★ 2026-08-27 — 지금 지시문은 *"각 장면의 대사는 그 자리가 흐르는 대로 따옴표로 원문
//   그대로 넣는다"* 라고 시킨다. 그래서 모델이 **장면 하나 = 문장 하나**로 읽고 장면
//   경계에서 말이 끊긴다. 게다가 그 문장들이 각각 그 컷을 설명하는 말이라 한 사람의
//   이어지는 말이 아니라 **캡션 여럿**이 된다.
//
// ★★ **갈래는 부르는 쪽이 켠다**(`narrationRule`). 이 지시문은 광고 갈래와 **공유**되므로,
//   플래그 없이 부르면 광고는 글자 그대로 예전이어야 한다 — 이 저장소가 sceneCountRule·
//   conceptLine·note 에 세 번 쓴 처방과 같다(선택 인자 하나).
import { describe, it, expect } from "vitest";
import { buildScenarioMessages, validateScenario } from "../lib/ad/scenario.js";
import { SCENARIO_SCHEMA } from "../lib/ad/llm.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const material = { text: "떡볶이 밀키트", photos: [] };

// ★ 갈래는 **줄 하나로** 켠다 — sceneCountRule·conceptLine 과 같은 처방이다.
//   길이 상한이 목표 초에서 나오므로(15초 → 82자) boolean 으로는 그 값을 못 싣는다.
//   줄을 만드는 것은 lib/reel/narration.js 의 narrationRuleLine 이다(tests/reel-narration).
const RULE = "내레이션 한 벌은 15초에 **82자**까지다 — 넘으면 말이 화면보다 길어 뒤가 잘린다";
const sys = (opts) => buildScenarioMessages({ settings, material }, opts).system;

describe("모델이 낼 수 있는 모양 — SCENARIO_SCHEMA", () => {
  it("narration 칸이 있다 — 없으면 additionalProperties:false 가 잘라 낸다", () => {
    const n = SCENARIO_SCHEMA.properties.narration;
    expect(n).toBeTruthy();
    expect(n.properties.text.type).toBe("string");
    expect(n.properties.say_as.type).toBe("string");
  });

  it("★필수가 아니다 — 광고 갈래는 안 내도 된다(회귀 0)", () => {
    expect(SCENARIO_SCHEMA.required).not.toContain("narration");
  });
});

describe("지시문 — narrationRule 을 켰을 때", () => {
  it("영상 전체를 설명하는 **하나의 이어지는 말**이라고 못 박는다", () => {
    const s = sys({ narrationRule: RULE });
    expect(s).toMatch(/narration/);
    expect(s).toMatch(/하나의 이어지는 말|한 사람이 이어서/);
    expect(s).toMatch(/장면을 하나씩 짚지 마라|그 컷을 설명하지/);
  });

  it("길이 상한을 목표 초에서 알려 준다 — 말이 화면보다 길면 뒤가 잘린다", () => {
    // 15초 × 5.5 = 82자
    expect(sys({ narrationRule: RULE })).toContain("82");
  });

  it("장면 서술과 지시문에 대사를 흩지 말라고 한다", () => {
    const s = sys({ narrationRule: RULE });
    expect(s).toMatch(/대사를 넣지 마라|따옴표 대사를 흩지/);
  });

  it("★옛 규칙이 그 자리에서 사라진다 — 두 규칙이 함께 있으면 모델이 둘 다 한다", () => {
    expect(sys({ narrationRule: RULE })).not.toContain("각 장면의 대사는 그 자리가 흐르는 대로");
  });
});

describe("★회귀 0 — narrationRule 을 안 켰을 때", () => {
  it("옛 규칙이 글자 그대로 그대로다", () => {
    expect(sys()).toContain("각 장면의 대사는 그 자리가 흐르는 대로");
  });

  // ⚠️ `"narration"` 만으로는 못 잰다 — 목소리 규칙의 **나쁜 예시**로 그 낱말이 이미 있다
  //   (129행: ✗ "따뜻한 목소리" · "narration"). 스키마 키 모양으로 좁힌다.
  it("새 규칙이 한 글자도 안 붙는다", () => {
    const s = sys();
    expect(s).not.toMatch(/하나의 이어지는 말/);
    expect(s).not.toContain('"narration":');
  });

  it("빈 옵션·키 없음이 같은 글을 낸다", () => {
    expect(sys({})).toBe(sys());
    expect(sys({ narrationRule: "" })).toBe(sys());
  });
});

describe("저장 — validateScenario", () => {
  const raw = {
    text: "A quiet kitchen.",
    shots: [{ beat: "b", shows: "s", seconds: 15 }],
    focus: "product", voice: "", music: "", tone: "", look: "", wardrobe: "", environment: "", angle: "",
  };

  it("한 벌을 살려서 저장한다 — 안 하면 조용히 사라진다", () => {
    const out = validateScenario({ ...raw, narration: { text: "오늘도 수고했어요.", say_as: "" } }, 0);
    expect(out.narration).toEqual({ text: "오늘도 수고했어요.", say_as: "" });
  });

  it("읽는 표기도 함께 지킨다", () => {
    const out = validateScenario({ ...raw, narration: { text: "Giants 에디션이에요.", say_as: "자이언츠 에디션이에요." } }, 0);
    expect(out.narration.say_as).toBe("자이언츠 에디션이에요.");
  });

  it("★없으면 키 자체가 없다 — 옛 문서가 그대로 옛 길로 간다", () => {
    expect(validateScenario(raw, 0).narration).toBe(undefined);
    expect("narration" in validateScenario(raw, 0)).toBe(false);
  });

  it("글이 비었거나 문자열이 아니면 안 만든다 — 빈 한 벌로 새 길에 들어가지 않는다", () => {
    expect(validateScenario({ ...raw, narration: { text: "   " } }, 0).narration).toBe(undefined);
    expect(validateScenario({ ...raw, narration: { text: 42 } }, 0).narration).toBe(undefined);
    expect(validateScenario({ ...raw, narration: "오늘도" }, 0).narration).toBe(undefined);
  });
});
