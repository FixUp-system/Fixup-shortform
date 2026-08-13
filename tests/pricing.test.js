// 가격표 — 이 저장소에서 값이 바뀔 것을 전제로 만든 유일한 자리다.
// 숫자 자체보다 "표 밖에 숫자가 없다"와 "경계에서 어느 쪽으로 떨어지나"를 못 박는다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, REGEN_PRICE, FREE_REGEN_PER_CUT, DEFAULT_GRANT, videoPrice, regenPrice, AD_VIDEO_PRICE, adVideoPrice, MAX_SCENARIO_TRIES } from "../lib/pricing.js";
import { TARGET_CHOICES } from "../lib/script.js";
import { AD_MODELS, DEFAULT_AD_MODEL, DEFAULT_AD_RESOLUTION, adSecondsFor, adResolutionsFor } from "../lib/ad/models.js";

// AD_VIDEO_PRICE 의 칸이 숫자(해상도 무관)일 수도, 객체(해상도별)일 수도 있다
// (lib/pricing.js 상단 주석 참고) — 테스트에서 "그 조합의 실제 가격"을 한 줄로 뽑는 헬퍼.
const cellPrice = (modelId, seconds, resolution) => {
  const cell = AD_VIDEO_PRICE[modelId][seconds];
  return typeof cell === "number" ? cell : cell[resolution];
};

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
  // ★ Task 24 — 해상도가 셋째 축이 됐다(칸이 숫자 또는 해상도별 객체). lib/pricing.js 는
  // lib/ad/models.js 를 import 하지 못하므로(화면 번들 규율) 두 표가 갈리지 않는지는
  // 여기서 AD_MODELS 를 훑어 대조한다.
  it("모델·길이·해상도 조합 전부에 값이 있다 — 두 표가 갈리지 않는다", () => {
    for (const m of AD_MODELS) {
      for (const s of adSecondsFor(m.id)) {
        const cell = AD_VIDEO_PRICE[m.id]?.[s];
        expect(cell, `${m.id}/${s} 칸이 없다`).toBeDefined();
        if (typeof cell === "number") {
          expect(cell).toBeGreaterThan(0);
          continue;
        }
        for (const r of adResolutionsFor(m.id)) {
          expect(typeof cell[r], `${m.id}/${s}/${r} 값이 없다`).toBe("number");
          expect(cell[r]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("2.0-fast/15초 = 65(기존값 유지) · 2.5/15초/720p = 120 · 2.5/30초/720p = 240 — 원가 계산에서 뽑은 값", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"][15]).toBe(65);
    expect(cellPrice("seedance-2.5", 15, "720p")).toBe(120);
    expect(cellPrice("seedance-2.5", 30, "720p")).toBe(240);
  });

  // ★ Task 24 — 기본 모델이 standard 다. standard/720p 는 fast 보다 비싸다(1080p 가
  // 열리는 값비싼 티어라 원가도 fast 보다 높다).
  it("★ 기본 모델(standard)이 fast 보다 비싸다 — 같은 720p·15초라도 티어가 다르다", () => {
    expect(adVideoPrice(15, "seedance-2.0", "720p")).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("★ standard 만 1080p 값이 있다 — 1080p 가 720p 보다 비싸다", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0"][15]["1080p"]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
  });

  it("길이에 비례한다 — 2.5 는 30초가 15초의 두 배 원가다(네이티브 단일 패스, 눈금 없음)", () => {
    expect(cellPrice("seedance-2.5", 30, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "720p"));
    expect(cellPrice("seedance-2.5", 30, "480p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "480p"));
  });

  it("해상도가 높을수록 비싸다 — 같은 길이·모델에서 480p < 720p", () => {
    expect(cellPrice("seedance-2.5", 15, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 15, "480p"));
    expect(cellPrice("seedance-2.5", 30, "720p")).toBeGreaterThan(cellPrice("seedance-2.5", 30, "480p"));
    expect(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0"][15]["480p"]);
  });

  it("같은 길이·해상도라도 2.5 가 2.0-fast 보다 비싸다 — 토큰당 단가·해상도가 더 크다", () => {
    expect(cellPrice("seedance-2.5", 15, "720p")).toBeGreaterThan(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("★ 기존 영상 정가와 섞이지 않는다 — 표가 둘이다", () => {
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"][15]).not.toBe(VIDEO_PRICE[15]);
  });

  it("adVideoPrice(seconds, modelId, resolution) 가 모델·길이·해상도 조합대로 값을 낸다", () => {
    expect(adVideoPrice(15, "seedance-2.0-fast")).toBe(65);
    expect(adVideoPrice(15, "seedance-2.0", "720p")).toBe(80);
    expect(adVideoPrice(15, "seedance-2.0", "1080p")).toBe(175);
    expect(adVideoPrice(15, "seedance-2.0", "480p")).toBe(35);
    expect(adVideoPrice(15, "seedance-2.5", "720p")).toBe(120);
    expect(adVideoPrice(30, "seedance-2.5", "720p")).toBe(240);
    expect(adVideoPrice(30, "seedance-2.5", "480p")).toBe(110);
  });

  // ③ 옛 문서 보호 — settings.model·settings.resolution 이 없는 옛 광고 문서는
  // 2.0(standard)·720p 값으로 봐야 한다. 반대로 두면 이미 만든 영상들이 갑자기 다른
  // 값으로 청구된다. ⚠️ 지금까지 만들어진 광고는 전부 실제로 fast 모델이었다(옛 기본값) —
  // 하지만 그 문서들은 settings.model 을 **명시 저장**했으므로(app/api/ads/route.js) 여기
  // "모델 생략" 경로를 타지 않는다. 이 폴백은 "정말 아무 값도 없는" 방어적 옛 문서용이다.
  it("★ 모델·해상도를 생략하면(옛 문서·옛 호출부) 기본 모델(standard)·720p 값으로 본다", () => {
    expect(adVideoPrice(15)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, undefined)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, null)).toBe(AD_VIDEO_PRICE[DEFAULT_AD_MODEL][15][DEFAULT_AD_RESOLUTION]);
    expect(adVideoPrice(15, "seedance-2.0")).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(adVideoPrice(15, "seedance-2.0", undefined)).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
    expect(adVideoPrice(15, "seedance-2.0", null)).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
  });

  // 해상도 무관 칸(fast)은 resolution 을 생략해도 값이 안 갈린다.
  it("해상도 무관 모델(fast)은 해상도를 뭘 줘도(또는 안 줘도) 값이 같다", () => {
    expect(adVideoPrice(15, "seedance-2.0-fast")).toBe(65);
    expect(adVideoPrice(15, "seedance-2.0-fast", "480p")).toBe(65);
    expect(adVideoPrice(15, "seedance-2.0-fast", "720p")).toBe(65);
  });

  // ④ 모르는 모델이 조용히 싼 값으로 새면 그 차액이 그대로 우리 돈이다 — regenPrice 와
  // 같은 원칙으로 던진다. "생략"(위 테스트)과 "값은 있는데 모르는 모델"을 가른다.
  it("★ 값이 있는데 모르는 모델은 던진다 — 조용히 기본값으로 떨어지면 안 된다", () => {
    // 메시지까지 확인한다 — 가드를 지워도 table 이 undefined 라 Object.keys(undefined) 가
    // 다른 TypeError 를 던져 toThrow() 만으로는 가드 자체가 있는지 못 가린다(우연히 초록).
    // 메시지 문구("모르는 광고 모델")로 **이 가드가 실제로 도는지**를 확인한다.
    expect(() => adVideoPrice(15, "seedance-3.0-오타")).toThrow(/모르는 광고 모델/);
    expect(() => adVideoPrice(30, "없는모델")).toThrow(/모르는 광고 모델/);
  });

  // ★ Task 24 — 해상도에도 같은 원칙: 값이 있는데 그 모델이 안 받는 해상도면 던진다.
  it("★ 값이 있는데 그 모델이 안 받는 해상도는 던진다 — standard 만 되는 1080p 를 fast 에 주면 안 된다", () => {
    expect(() => adVideoPrice(15, "seedance-2.0-fast", "1080p")).not.toThrow();
    // ↑ fast 칸은 해상도 무관(숫자)이라 지금 구현은 resolution 을 무시하고 65 를 낸다
    //   (해상도 유효성 자체는 라우트의 isAdResolution 이 400 으로 막는다 — 아래 대조).
    //   여기서는 "해상도별 표(2.5)"가 실제로 던지는지를 확인한다.
    expect(() => adVideoPrice(15, "seedance-2.5", "1080p")).toThrow(/그 해상도를 지원하지 않아요/);
    expect(() => adVideoPrice(15, "seedance-2.0", "4k")).toThrow(/그 해상도를 지원하지 않아요/);
  });

  it("길이가 그 모델의 목록 밖이면 더 비싼 쪽으로 본다 — 싼 쪽으로 떨어지면 원가보다 적게 청구한다", () => {
    expect(adVideoPrice(999, "seedance-2.5", "720p")).toBe(cellPrice("seedance-2.5", 30, "720p"));
    expect(adVideoPrice(null, "seedance-2.0-fast")).toBe(AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("시나리오 다시 쓰기 상한이 있다 — 무료·무제한이면 원가가 샌다", () => {
    expect(MAX_SCENARIO_TRIES).toBe(20);
  });
});
