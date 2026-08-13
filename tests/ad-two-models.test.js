// 광고 모델은 **둘뿐이다** — 2.0 과 2.5 (2026-08-13 사용자 결정).
//
// 그전에는 셋이었다: 기본(2.0 standard) · 저가(2.0 fast) · 2.5. "기본/저가"라는 이름은
// fal 의 모델 이름이 아니라 우리가 붙인 등급이라, 사장님이 고른 것과 fal 이 받는 것이
// 머릿속에서 이어지지 않았다. 이제 이름도 값도 fal 과 **글자 그대로** 맞춘다.
import { describe, it, expect } from "vitest";
import { AD_MODELS, adModel, adResolutionsFor, adEndpoint, DEFAULT_AD_MODEL } from "../lib/ad/models.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

describe("광고 모델은 2.0 과 2.5 둘뿐이다", () => {
  it("표에 둘만 있다", () => {
    expect(AD_MODELS.map((m) => m.id).sort()).toEqual(["seedance-2.0", "seedance-2.5"]);
  });

  it("fast 티어는 없다 — 등급이 아니라 모델로 고른다", () => {
    expect(AD_MODELS.some((m) => m.id.includes("fast"))).toBe(false);
    expect(AD_VIDEO_PRICE["seedance-2.0-fast"]).toBeUndefined();
  });

  it("이름이 모델 이름 그대로다 — 우리가 붙인 등급이 아니다", () => {
    for (const m of AD_MODELS) {
      expect(m.label, `${m.id} 의 이름이 등급이다`).not.toMatch(/기본|저가/);
      expect(m.label).toMatch(/2\.0|2\.5/);
    }
  });
});

describe("해상도는 모델이 실제로 지원하는 것만", () => {
  it("2.0 은 480p·720p·1080p", () => {
    expect(adResolutionsFor("seedance-2.0")).toEqual(["480p", "720p", "1080p"]);
  });

  it("2.5 는 480p·720p — 1080p 는 없다", () => {
    expect(adResolutionsFor("seedance-2.5")).toEqual(["480p", "720p"]);
  });
});

describe("고른 것이 fal 이 받는 것과 글자 그대로 같다", () => {
  // 엔드포인트는 fal 문서의 모델 경로 그대로여야 한다 — 한 글자만 달라도 404 인데,
  // 그때는 이미 값을 치른 뒤다.
  it("엔드포인트가 모델 id 를 그대로 담는다", () => {
    for (const m of AD_MODELS) {
      const version = m.id.replace("seedance-", "");
      for (const kind of ["t2v", "i2v", "r2v"]) {
        const e = adEndpoint(m.id, kind);
        expect(e, `${m.id}/${kind}`).toMatch(new RegExp(`^bytedance/seedance-${version.replace(".", "\.")}/`));
        // 등급 세그먼트가 끼면 다른 모델을 부르는 것이다
        expect(e, `${m.id}/${kind} 에 fast 가 섞였다`).not.toContain("/fast/");
      }
    }
  });

  it("가격표의 해상도 칸이 모델의 해상도 목록과 정확히 같다", () => {
    for (const m of AD_MODELS) {
      for (const sec of m.seconds) {
        const cell = AD_VIDEO_PRICE[m.id]?.[sec];
        expect(cell, `${m.id} ${sec}초 값이 없다`).toBeTruthy();
        expect(Object.keys(cell).sort(), `${m.id} ${sec}초의 해상도가 어긋난다`)
          .toEqual([...m.resolutions].sort());
      }
    }
  });

  it("기본 모델은 2.0 이다", () => {
    expect(DEFAULT_AD_MODEL).toBe("seedance-2.0");
    expect(adModel(DEFAULT_AD_MODEL).resolutions).toContain("1080p");
  });
});
