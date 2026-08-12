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
});
