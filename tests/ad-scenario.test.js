// 자동 배치 — 값이 나가는 판정이라 LLM 에 통째로 안 맡긴다.
// 코드가 먼저 좁히고, 남는 결정 지점은 "사진 1장" 하나다.
import { describe, it, expect } from "vitest";
import { pickEndpointKind, buildScenarioMessages, validateScenario } from "../lib/ad/scenario.js";

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
