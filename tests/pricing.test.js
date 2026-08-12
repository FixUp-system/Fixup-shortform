// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";

// 표가 길이 × 모델로 갈라진 뒤에도 아래 성질은 **모델마다** 그대로여야 한다.
const MODELS = ["seedance-2.0", "kling-v3"];
// 모델을 안 넘긴 호출이 떨어지는 자리(= 옛 프로젝트). lib/pricing.js 의 LEGACY_MODEL 과 같다.
const LEGACY = "kling-v3";

describe("가격표", () => {
  it("고를 수 있는 길이 전부에 값이 있다", () => {
    for (const m of MODELS) {
      for (const s of TARGET_CHOICES) {
        expect(typeof VIDEO_PRICE[m][s]).toBe("number");
        expect(VIDEO_PRICE[m][s]).toBeGreaterThan(0);
      }
    }
  });

  it("길이에 비례한다 — 원가가 컷 수에 비례하기 때문이다", () => {
    for (const m of MODELS) {
      expect(VIDEO_PRICE[m][30]).toBeGreaterThan(VIDEO_PRICE[m][15]);
      expect(VIDEO_PRICE[m][60]).toBeGreaterThan(VIDEO_PRICE[m][45]);
    }
  });

  it("videoPrice 는 목록 밖 값을 기본 길이(30초) 값으로 받는다", () => {
    for (const m of MODELS) {
      expect(videoPrice(30, m)).toBe(VIDEO_PRICE[m][30]);
      expect(videoPrice(null, m)).toBe(VIDEO_PRICE[m][30]);
      expect(videoPrice(7, m)).toBe(VIDEO_PRICE[m][30]);
    }
    // 모델을 안 넘긴 옛 호출도 같은 규칙을 옛 모델 표에서 탄다
    expect(videoPrice(null)).toBe(VIDEO_PRICE[LEGACY][30]);
  });

  it("컷당 첫 재생성은 공짜, 그 뒤는 정가", () => {
    expect(FREE_REGEN_PER_CUT).toBe(1);
    for (const m of MODELS) {
      expect(regenPrice("image", 0, m)).toBe(0);
      expect(regenPrice("image", 1, m)).toBe(REGEN_PRICE.image);
      expect(regenPrice("clip", 2, m)).toBe(REGEN_PRICE.clip[m]);
      expect(regenPrice("voice", 1, m)).toBe(REGEN_PRICE.voice);
    }
    expect(regenPrice("clip", 2)).toBe(REGEN_PRICE.clip[LEGACY]);
  });

  it("모르는 재생성 종류는 0 이 아니라 던진다 — 조용히 공짜가 되면 안 된다", () => {
    expect(() => regenPrice("사진", 1)).toThrow();
  });

  it("클립 재생성이 이미지보다 비싸다 — 실측 원가가 그렇다($0.42 대 $0.08)", () => {
    for (const m of MODELS) {
      expect(REGEN_PRICE.clip[m]).toBeGreaterThan(REGEN_PRICE.image);
    }
  });

  it("기본 지급값이 30초 몇 편치는 된다", () => {
    expect(DEFAULT_GRANT).toBeGreaterThanOrEqual(VIDEO_PRICE[LEGACY][30] * 2);
  });
});

describe("모델별 정가", () => {
  it("Seedance 는 원가 비례로 비싸다", () => {
    expect(videoPrice(15, "seedance-2.0")).toBe(80);
    expect(videoPrice(30, "seedance-2.0")).toBe(160);
    expect(videoPrice(45, "seedance-2.0")).toBe(240);
    expect(videoPrice(60, "seedance-2.0")).toBe(320);
  });

  it("Kling 정가는 그대로다 — 옛 프로젝트의 값이 바뀌면 안 된다", () => {
    expect(videoPrice(15, "kling-v3")).toBe(25);
    expect(videoPrice(30, "kling-v3")).toBe(50);
    expect(videoPrice(45, "kling-v3")).toBe(75);
    expect(videoPrice(60, "kling-v3")).toBe(100);
  });

  // ★★ 모델을 안 넘긴 옛 호출은 옛 프로젝트다 — Kling 으로 봐야 한다
  it("모델을 안 주면 Kling 값이다", () => {
    expect(videoPrice(30)).toBe(50);
    expect(videoPrice(30, undefined)).toBe(50);
    expect(videoPrice(30, "뒤죽박죽")).toBe(50);
  });

  it("길이를 모르면 30초 값으로 본다 — 모델별로", () => {
    expect(videoPrice(null, "seedance-2.0")).toBe(160);
    expect(videoPrice(7, "seedance-2.0")).toBe(160);
    expect(videoPrice(null, "kling-v3")).toBe(50);
  });

  it("클립 재생성도 모델을 탄다", () => {
    expect(regenPrice("clip", 1, "seedance-2.0")).toBe(25);
    expect(regenPrice("clip", 1, "kling-v3")).toBe(8);
    expect(regenPrice("clip", 1)).toBe(8);
  });

  it("이미지·목소리는 모델과 무관하다", () => {
    for (const m of ["seedance-2.0", "kling-v3", undefined]) {
      expect(regenPrice("image", 1, m)).toBe(2);
      expect(regenPrice("voice", 1, m)).toBe(1);
    }
  });

  it("컷마다 첫 회는 여전히 무료다", () => {
    expect(regenPrice("clip", 0, "seedance-2.0")).toBe(0);
    expect(regenPrice("image", 0, "seedance-2.0")).toBe(0);
  });

  // ★ 오타로 조용히 공짜가 되는 것이 이 표에서 가장 위험하다
  it("모르는 재생성 종류는 던진다", () => {
    expect(() => regenPrice("클립", 1, "seedance-2.0")).toThrow();
  });

  it("두 모델이 같은 길이 눈금을 덮는다 — 한쪽만 값이 빠지면 안 된다", () => {
    for (const m of ["seedance-2.0", "kling-v3"]) {
      expect(Object.keys(VIDEO_PRICE[m]).map(Number).sort((a, b) => a - b)).toEqual([15, 30, 45, 60]);
    }
    expect(Object.keys(REGEN_PRICE.clip).sort()).toEqual(["kling-v3", "seedance-2.0"]);
  });
});
