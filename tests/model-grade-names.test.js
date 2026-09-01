// **모델을 등급 이름으로 부른다 — 기본 · 프로** (2026-08-31 사장님 지시)
//
// ★★★ 이것은 **2026-08-13 결정을 뒤집는 것**이다. 그때는 반대로 갔다:
//   "기본/저가"는 fal 의 모델 이름이 아니라 우리가 붙인 등급이라, 사장님이 고른 것과
//   fal 이 받는 것이 머릿속에서 이어지지 않는다 — 그래서 이름을 fal 과 글자 그대로 맞췄다
//   (tests/ad-two-models.test.js 의 "이름이 모델 이름 그대로다").
//
//   왜 다시 뒤집는가: 그 사이에 모델이 **셋**이 됐고(2.0 · 2.5 · H3) 이름이 계보가 다른
//   두 회사 것이 섞였다("2.0"·"2.5"·"H3"). 사장님에게 필요한 것은 어느 회사의 몇 번인지가
//   아니라 **무엇을 고르면 무엇이 달라지는가**다. 그래서 화면은 등급으로 부르고,
//   **fal 로 나가는 것은 여전히 id·엔드포인트**다(그 둘은 안 바뀐다 — 값이 걸린 자리는
//   전부 id 로 조회한다).
//
// ⚠️ 그때의 걱정은 유효하다 — 화면 이름과 fal 이 받는 것이 갈린다. 그래서 **id 는 그대로
//   두고**(seedance-2.5 · minimax-h3) 원가표·정가표·원장은 전부 id 로만 잰다.
import { describe, it, expect } from "vitest";
import {
  AD_MODELS, adModel, adResolutionsFor, isAdResolution, adDefaultResolution,
  DEFAULT_AD_MODEL, LEGACY_AD_MODEL, isAdModel,
} from "../lib/ad/models.js";
import { AD_VIDEO_PRICE, adVideoPrice } from "../lib/pricing.js";
import { modelsForTier } from "../lib/tiers.js";
import { I2V_MODELS } from "../lib/clip-limits.js";

describe("광고 — 이름이 등급이다", () => {
  it("H3 는 '기본' 이다", () => {
    const m = adModel("minimax-h3");
    expect(m.label).toBe("기본");
    expect(m.name).toBe("기본");
  });

  it("2.0 이 '프로' 다", () => {
    const m = adModel("seedance-2.0");
    expect(m.label).toBe("프로");
    expect(m.name).toBe("프로");
  });

  it("★ id 는 안 바뀐다 — fal 로 나가는 것도, 값을 조회하는 열쇠도 그대로다", () => {
    expect(AD_MODELS.map((m) => m.id).sort())
      .toEqual(["minimax-h3", "seedance-2.0", "seedance-2.5"]);
    expect(adModel("minimax-h3").endpoints.r2v).toBe("minimax/h3/reference-to-video");
  });
});

// ⚠️⚠️ 2026-09-01 — **등급이 뒤집혔다**(사장님 지시). 08-31 에는 2.5 가 프로였고
//   2.0 이 숨김이었다. 그날 하루의 실측이 그 판단을 뒤집었다:
//     · 2.5 는 참조 이미지에 **사람 얼굴이 있으면 아홉 번 전부 거절**했다
//       (크기·각도·장수·스타일·그리드 다섯 축을 다 재봤다. `partner_validation_failed`)
//     · 2.0 은 **같은 판을 첫 시도에 통과**시켰다(얼굴 넷짜리 브이로그 판, 재시도 0)
//     · 값도 싸고($4.55 대 $6.93) 빠르다(217초 대 396초)
//   ⚠️ 대가: 2.0 의 통짜 상한이 15초라 **30초가 사라졌다**.
//   ★ 2.5 는 `hidden` 이 아니라 **`retired`** 다 — 새로는 못 고르되
//     이미 그것으로 만든 문서는 다시 구워진다(08-31 에 2.0 을 숨겨 겪은 그 문제).
describe("광고 — 2.0 이 프로다", () => {
  it("★ 은퇴한 2.5 는 고르는 자리에 안 나온다 — 어느 등급에서도", () => {
    for (const tier of ["free", "pro"]) {
      const ids = modelsForTier(tier).map((m) => m.id);
      expect(ids, `${tier} 등급에 은퇴한 2.5 가 보인다`).not.toContain("seedance-2.5");
    }
  });

  it("★ 은퇴 모델은 관리자에게도 목록에 안 나온다", () => {
    const ids = modelsForTier("pro", { admin: true }).map((m) => m.id);
    expect(ids).not.toContain("seedance-2.5");
  });

  it("그래도 고를 것이 남는다 — 숨겼더니 빈 목록이 되면 안 된다", () => {
    expect(modelsForTier("free").length).toBeGreaterThan(0);
  });

  // ★★ 2026-08-31 사장님 지시 — **기본이 프로보다 앞이다.** 칩은 표 순서 그대로 그려지므로
  //   (components/AdOptionTray.jsx 의 modelsForTier(...).map) 순서를 표에서 정한다.
  //   싼 쪽·기본값이 먼저 오는 것이 고르는 순서와 맞다.
  it("★ 고르는 자리에서 기본이 프로보다 앞이다", () => {
    const ids = modelsForTier("pro").map((m) => m.id);
    expect(ids).toContain("minimax-h3");
    expect(ids).toContain("seedance-2.0");
    expect(ids.indexOf("minimax-h3"), "프로가 기본보다 앞에 있다")
      .toBeLessThan(ids.indexOf("seedance-2.0"));
  });

  it("★ 표 자체가 그 순서다 — 화면이 따로 정렬하지 않는다", () => {
    // ★ 2026-09-01 — 거르는 축이 둘이 됐다: `hidden`(아무도) · `retired`(새로는 못 고름).
    const open = AD_MODELS.filter((m) => !m.hidden && !m.retired).map((m) => m.id);
    expect(open).toEqual(["minimax-h3", "seedance-2.0"]);
  });

  it("★★ 표에서는 안 지운다 — 지우면 이미 2.0 으로 만든 문서가 값 조회에서 죽는다", () => {
    expect(AD_MODELS.some((m) => m.id === "seedance-2.5")).toBe(true);
    expect(isAdModel("seedance-2.5")).toBe(true);
    expect(adModel("seedance-2.5").id).toBe("seedance-2.5");
    expect(() => adVideoPrice(15, "seedance-2.5", "720p")).not.toThrow();
  });
});

describe("광고 — 새로 만들 때의 기본과 옛 문서의 폴백은 다른 축이다", () => {
  // ★ lib/clip-limits.js 의 DEFAULT_I2V_MODEL ↔ LEGACY_I2V_MODEL 과 같은 규율이다.
  //   한 상수가 둘을 겸하면, 기본을 옮기는 순간 **옛 문서의 해석까지 조용히 바뀐다**.
  it("새로 만들면 기본(H3)으로 만든다", () => {
    expect(DEFAULT_AD_MODEL).toBe("minimax-h3");
  });

  it("★ 모델을 안 든 옛 문서는 2.0 으로 본다 — 그때 그 모델로 만들어졌다", () => {
    expect(LEGACY_AD_MODEL).toBe("seedance-2.0");
    expect(adModel(undefined).id).toBe("seedance-2.0");
    expect(adModel("모르는모델").id).toBe("seedance-2.0");
  });

  it("★ 값도 같은 축을 본다 — 모델을 안 든 옛 문서는 2.0 720p 값이다", () => {
    expect(adVideoPrice(15, null, "720p")).toBe(AD_VIDEO_PRICE["seedance-2.0"][15]["720p"]);
  });
});

describe("광고 — 기본(H3)의 화질은 768P·2K 둘뿐이다", () => {
  // 2026-08-31 사장님 지시("768이랑 2k만 제공"). fal 스키마는 480P·768P·2K·4K 넷이고
  // 설명이 말한다: "480P and 768P are native generation modes; 2K and 4K upscale a
  // 768P base result." — 즉 2K·4K 는 768P 결과를 확대한 것이다.
  it("고를 수 있는 것은 768P·2K", () => {
    expect(adResolutionsFor("minimax-h3")).toEqual(["768P", "2K"]);
  });

  it("★ 4K·480P 는 못 고른다 — 서버도 같은 함수로 막는다", () => {
    expect(isAdResolution("4K", "minimax-h3")).toBe(false);
    expect(isAdResolution("480P", "minimax-h3")).toBe(false);
  });

  it("관리자에게도 4K 는 안 열린다 — 등급 축이 아니다", () => {
    expect(isAdResolution("4K", "minimax-h3", { admin: true })).toBe(false);
  });

  it("★★ 옛 4K 문서의 값은 남긴다 — 지우면 그 문서가 화면째 죽는다", () => {
    expect(AD_VIDEO_PRICE["minimax-h3"][15]["4K"]).toBeDefined();
    expect(() => adVideoPrice(15, "minimax-h3", "4K")).not.toThrow();
  });

  it("768P 에 값이 있다 — 새로 연 칸이라 값이 없으면 그 자리에서 던진다", () => {
    expect(AD_VIDEO_PRICE["minimax-h3"][15]["768P"]).toBeDefined();
  });

  it("기본 화질은 2K 다 — 지금까지 고르던 그 값이다", () => {
    expect(adDefaultResolution("minimax-h3")).toBe("2K");
  });
});

describe("단계별(reel) — 같은 등급 이름을 쓴다", () => {
  // ★★ 2026-08-31 — **배선이 끝나서 두 경로의 '기본'이 같은 모델이 됐다**(H3).
  //   그날 낮에는 이름만 바꿔 두고 "'기본'이 두 경로에서 다른 모델을 가리킨다"고 적어
  //   두었는데, 사장님이 H3 의 음성을 실측으로 확인해 주면서 배선이 열렸다.
  //   (배선 자체는 tests/reel-h3-wiring.test.js 가 잰다.)
  const byId = (id) => I2V_MODELS.find((m) => m.id === id);

  it("기본은 H3 다 — 광고와 같은 모델이다", () => {
    expect(byId("minimax-h3").label).toBe("기본");
  });

  it("2.0 이 '프로' 다", () => {
    expect(byId("seedance-2.0").label).toBe("프로");
  });

  // ★★ 2026-08-31 — 2.0 은 **숨긴 모델이 됐다**(REEL_MODEL_IDS 에서 빠졌다). 그래서
  //   등급 이름을 도로 뺐다 — 광고 표의 2.0 과 같은 규율이다: 이 이름이 보이는 곳은
  //   이미 그것으로 만든 옛 문서뿐이라 모델 이름이 맞다.
  it("★ 은퇴한 2.5 는 등급 이름을 안 받는다", () => {
    expect(byId("seedance-2.5").label).toBe("Seedance 2.5");
  });

  it("★ Kling 은 등급 이름을 안 받는다 — reel 이 안 여는 모델이라 두 등급 밖이다", () => {
    expect(byId("kling-v3").label).toBe("Kling v3");
  });
});
