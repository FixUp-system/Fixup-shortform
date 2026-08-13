// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice, AD_VIDEO_PRICE, adVideoPrice, MAX_SCENARIO_TRIES } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";
import { AD_MODELS, DEFAULT_AD_MODEL, adSecondsFor } from "../lib/ad/models.js";

describe("가격표", () => {
  it("고를 수 있는 길이 전부에 값이 있다", () => {
    for (const s of TARGET_CHOICES) {
      expect(typeof VIDEO_PRICE[s]).toBe("number");
      expect(VIDEO_PRICE[s]).toBeGreaterThan(0);
    }
  });

  it("길이에 비례한다 — 원가가 컷 수에 비례하기 때문이다", () => {
    expect(VIDEO_PRICE[30]).toBeGreaterThan(VIDEO_PRICE[15]);
    expect(VIDEO_PRICE[60]).toBeGreaterThan(VIDEO_PRICE[45]);
  });

  it("videoPrice 는 목록 밖 값을 기본 길이(30초) 값으로 받는다", () => {
    expect(videoPrice(30)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(null)).toBe(VIDEO_PRICE[30]);
    expect(videoPrice(7)).toBe(VIDEO_PRICE[30]);
  });

  it("컷당 첫 재생성은 공짜, 그 뒤는 정가", () => {
    expect(FREE_REGEN_PER_CUT).toBe(1);
    expect(regenPrice("image", 0)).toBe(0);
    expect(regenPrice("image", 1)).toBe(REGEN_PRICE.image);
    expect(regenPrice("clip", 2)).toBe(REGEN_PRICE.clip);
    expect(regenPrice("voice", 1)).toBe(REGEN_PRICE.voice);
  });

  it("모르는 재생성 종류는 0 이 아니라 던진다 — 조용히 공짜가 되면 안 된다", () => {
    expect(() => regenPrice("사진", 1)).toThrow();
  });

  it("클립 재생성이 이미지보다 비싸다 — 실측 원가가 그렇다($0.42 대 $0.08)", () => {
    expect(REGEN_PRICE.clip).toBeGreaterThan(REGEN_PRICE.image);
  });

  it("기본 지급값이 30초 몇 편치는 된다", () => {
    expect(DEFAULT_GRANT).toBeGreaterThanOrEqual(VIDEO_PRICE[30] * 2);
  });
});

describe("광고 영상 정가", () => {
  // ★ Task 21 — 길이가 모델에 딸린다. 표가 모델 id → 길이 → 크레딧의 2단이 됐다.
  // lib/pricing.js 는 lib/ad/models.js 를 import 하지 못하므로(화면 번들 규율) 두 표가
  // 갈리지 않는지는 여기서 AD_MODELS 를 훑어 대조한다.
  it("모델마다 고를 수 있는 길이 전부에 값이 있다 — 두 표가 갈리지 않는다", () => {
    for (const m of AD_MODELS) {
      for (const s of adSecondsFor(m.id)) {
        expect(typeof AD_VIDEO_PRICE[m.id]?.[s]).toBe("number");
        expect(AD_VIDEO_PRICE[m.id][s]).toBeGreaterThan(0);
      }
    }
  });

  it("2.0/15초 = 65 · 2.5/15초 = 120 · 2.5/30초 = 240 — 원가 계산에서 뽑은 값", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"][15]).toBe(65);
    expect(AD_VIDEO_PRICE["seedance-2.5"][15]).toBe(120);
    expect(AD_VIDEO_PRICE["seedance-2.5"][30]).toBe(240);
  });

  it("길이에 비례한다 — 2.5 는 30초가 15초의 두 배 원가다(네이티브 단일 패스, 눈금 없음)", () => {
    expect(AD_VIDEO_PRICE["seedance-2.5"][30]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.5"][15]);
  });

  it("같은 길이라도 2.5 가 2.0 보다 비싸다 — 토큰당 단가·해상도가 더 크다", () => {
    expect(AD_VIDEO_PRICE["seedance-2.5"][15]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("★ 기존 영상 정가와 섞이지 않는다 — 표가 둘이다", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"][15]).not.toBe(VIDEO_PRICE[15]);
  });

  it("adVideoPrice(seconds, modelId) 가 모델·길이 조합대로 값을 낸다", () => {
    expect(adVideoPrice(15, "seedance-2.0-fast")).toBe(65);
    expect(adVideoPrice(15, "seedance-2.5")).toBe(120);
    expect(adVideoPrice(30, "seedance-2.5")).toBe(240);
  });

  // ③ 옛 문서 보호 — settings.model 이 없는 옛 광고 문서는 2.0 값으로 봐야 한다.
  // 반대로 두면 이미 만든 영상들이 갑자기 2.5 값으로 청구된다.
  it("★ 모델을 생략하면(옛 문서·옛 호출부) 2.0 값으로 본다", () => {
    expect(adVideoPrice(15)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15]);
    expect(adVideoPrice(15, undefined)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15]);
    expect(adVideoPrice(15, null)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15]);
  });

  // ④ 모르는 모델이 조용히 싼 값으로 새면 그 차액이 그대로 우리 돈이다 — regenPrice 와
  // 같은 원칙으로 던진다. "생략"(위 테스트)과 "값은 있는데 모르는 모델"을 가른다.
  it("★ 값이 있는데 모르는 모델은 던진다 — 조용히 2.0 값으로 떨어지면 안 된다", () => {
    // 메시지까지 확인한다 — 가드를 지워도 table 이 undefined 라 Object.keys(undefined) 가
    // 다른 TypeError 를 던져 toThrow() 만으로는 가드 자체가 있는지 못 가린다(우연히 초록).
    // 메시지 문구("모르는 광고 모델")로 **이 가드가 실제로 도는지**를 확인한다.
    expect(() => adVideoPrice(15, "seedance-3.0-오타")).toThrow(/모르는 광고 모델/);
    expect(() => adVideoPrice(30, "없는모델")).toThrow(/모르는 광고 모델/);
  });

  it("길이가 그 모델의 목록 밖이면 더 비싼 쪽으로 본다 — 싼 쪽으로 떨어지면 원가보다 적게 청구한다", () => {
    expect(adVideoPrice(999, "seedance-2.5")).toBe(AD_VIDEO_PRICE["seedance-2.5"][30]);
    expect(adVideoPrice(null, "seedance-2.0-fast")).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("시나리오 다시 쓰기 상한이 있다 — 무료·무제한이면 원가가 샌다", () => {
    expect(MAX_SCENARIO_TRIES).toBe(20);
  });
});
