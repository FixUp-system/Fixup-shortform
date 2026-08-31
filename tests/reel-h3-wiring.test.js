// **단계별(reel)에도 기본(H3)을 배선한다** — 원클릭과 같은 이름·같은 화질(2026-08-31 사장님 지시).
//
// ★★ 전제가 바뀌었다 — **H3 는 소리를 낸다**(사장님 실측 확인, 2026-08-31).
//   나는 fal 스키마에 `generate_audio` 토글이 없고 출력 필드가 `video` 하나인 것을 보고
//   "소리가 없다"고 단정했는데 **틀렸다**: 토글이 없다는 것은 **항상 켜져 있다**는 뜻일 수
//   있고, mp4 자체가 오디오 트랙을 담는다. 스키마는 그것을 말해 주지 않는다.
//   → reel 이 서 있는 전제("클립이 직접 말한다", speaks:true)를 H3 도 만족한다.
//
// ⚠️ **아직 모르는 것**: H3 가 프롬프트의 따옴표 대사를 **그 글자 그대로** 말하는지는
//   실측된 적이 없다. Seedance 는 그렇게 동작한다(그 위에 자막 정렬이 서 있다).
//   H3 가 다르게 말하면 자막이 어긋난다 — 첫 한 편에서 눈으로 확인할 자리다.
//
// ★ 이 판이 지키는 것은 **배선의 완전성**이다. reel 에 모델을 더할 때 빠뜨리면 조용히
//   돈이 새는 자리가 넷이라고 코드가 이미 적어 두었다(lib/clip-limits.js 의 REEL_MODEL_IDS
//   주석): ① 클립 프로필 ② 통짜 상한 ③ 컷 최소 초 ④ 정가표.
//   그중 ④가 가장 위험하다 — 없으면 priceModel 이 **조용히 kling 값으로 떨어져** 원가의
//   몇 분의 일에 판다.
import { describe, it, expect } from "vitest";
import {
  I2V_MODELS, REEL_MODEL_IDS, isReelModel, DEFAULT_I2V_MODEL, LEGACY_I2V_MODEL,
  resolutionsForModel, secondsForModel, reelModelsForTier,
  clipProfileForProject, speaksFor, endpointForProject, refEndpointForProject,
  resolutionForProject, defaultResolutionForModel,
} from "../lib/clip-limits.js";
import { VIDEO_PRICE, REGEN_PRICE, videoPrice, regenPrice } from "../lib/pricing.js";

const P = (id, extra = {}) => ({ settings: { i2v_model: id, ...extra } });

describe("단계별 — 기본은 H3 다", () => {
  it("표에 있고 이름이 '기본' 이다", () => {
    const m = I2V_MODELS.find((x) => x.id === "minimax-h3");
    expect(m, "reel 표에 H3 가 없다").toBeTruthy();
    expect(m.label).toBe("기본");
  });

  it("★ 새로 만들면 기본(H3)으로 만든다", () => {
    expect(DEFAULT_I2V_MODEL).toBe("minimax-h3");
  });

  it("★★ 옛 문서의 폴백은 그대로 Kling 이다 — 건드리면 이미 만든 영상이 갈아탄다", () => {
    expect(LEGACY_I2V_MODEL).toBe("kling-v3");
  });

  it("★ 고를 수 있고, 2.0 은 빠졌다(숨김)", () => {
    expect(REEL_MODEL_IDS).toContain("minimax-h3");
    expect(REEL_MODEL_IDS).toContain("seedance-2.5");
    expect(REEL_MODEL_IDS, "2.0 이 아직 고를 수 있다").not.toContain("seedance-2.0");
    expect(isReelModel("minimax-h3")).toBe(true);
    expect(isReelModel("seedance-2.0")).toBe(false);
  });

  it("★ 기본이 프로보다 앞이다 — 원클릭과 같은 순서", () => {
    const ids = reelModelsForTier("pro").map((m) => m.id);
    expect(ids.indexOf("minimax-h3")).toBeLessThan(ids.indexOf("seedance-2.5"));
  });

  it("기본 등급도 기본(H3)은 쓴다 — 숨겼더니 빈 목록이 되면 안 된다", () => {
    expect(reelModelsForTier("basic").map((m) => m.id)).toEqual(["minimax-h3"]);
  });
});

describe("단계별 — 클립 프로필(①②③)", () => {
  const profile = () => clipProfileForProject(P("minimax-h3"));

  it("★★ 말한다 — reel 이 서 있는 전제다", () => {
    expect(speaksFor(profile())).toBe(true);
  });

  it("엔드포인트가 fal 경로와 글자 그대로 같다 — i2v · r2v", () => {
    expect(endpointForProject(P("minimax-h3"))).toBe("minimax/h3/image-to-video");
    expect(refEndpointForProject(P("minimax-h3"))).toBe("minimax/h3/reference-to-video");
  });

  it("★ 컷 길이 범위가 스키마 그대로다 — 5~15초", () => {
    expect(profile().min).toBe(5);
    expect(profile().max).toBe(15);
  });

  it("★ 고를 수 있는 길이는 15초 하나다 — 한 번에 그만큼이 최대다", () => {
    expect(secondsForModel("minimax-h3")).toEqual([15]);
  });

  it("★★ 모르는 필드를 안 보낸다 — H3 스키마에는 generate_audio 가 없다", () => {
    // 있는 줄 알고 보내면 거절될 수 있다(Kling 과 같은 판단). 소리는 끄고 켜는 것이
    // 아니라 **항상 켜져 있다**.
    expect(profile().extra ?? null).toBeNull();
  });
});

describe("단계별 — 화질은 768P·2K (원클릭과 같다)", () => {
  it("고를 수 있는 것은 768P·2K", () => {
    expect(resolutionsForModel("minimax-h3")).toEqual(["768P", "2K"]);
  });

  it("★ 기본 화질은 2K — 원클릭의 기본값과 같다", () => {
    expect(defaultResolutionForModel("minimax-h3")).toBe("2K");
  });

  it("★★ 720p 로 떨어지지 않는다 — H3 에는 그 값이 아예 없다", () => {
    // 저장값이 목록 밖이면(옛 값 720p 가 남아 있으면) 그 모델의 기본으로 간다.
    expect(resolutionForProject(P("minimax-h3", { resolution: "720p" }))).toBe("2K");
    expect(resolutionForProject(P("minimax-h3", { resolution: "2K" }))).toBe("2K");
    expect(resolutionForProject(P("minimax-h3", { resolution: "768P" }))).toBe("768P");
  });

  it("Seedance 쪽 화질은 한 글자도 안 바뀐다", () => {
    expect(resolutionsForModel("seedance-2.0")).toEqual(["480p", "720p", "1080p"]);
    expect(resolutionsForModel("seedance-2.5")).toEqual(["480p", "720p"]);
    expect(defaultResolutionForModel("seedance-2.0")).toBe("720p");
  });
});

describe("단계별 — 정가(④): 없으면 조용히 kling 값으로 판다", () => {
  it("★★ 정가표에 H3 가 있다 — 두 화질 다", () => {
    expect(VIDEO_PRICE["minimax-h3"], "정가표에 H3 가 없다").toBeTruthy();
    expect(VIDEO_PRICE["minimax-h3"]["768P"][15]).toBeDefined();
    expect(VIDEO_PRICE["minimax-h3"]["2K"][15]).toBeDefined();
  });

  it("★ kling 값으로 안 떨어진다 — 그것이 이 배선의 가장 위험한 구멍이다", () => {
    expect(videoPrice(15, "minimax-h3", "2K")).not.toBe(videoPrice(15, "kling-v3", "720p"));
    expect(videoPrice(15, "minimax-h3", "2K")).toBe(VIDEO_PRICE["minimax-h3"]["2K"][15]);
    expect(videoPrice(15, "minimax-h3", "768P")).toBe(VIDEO_PRICE["minimax-h3"]["768P"][15]);
  });

  it("2K 가 768P 보다 비싸다 — 화질이 값을 정한다", () => {
    expect(videoPrice(15, "minimax-h3", "2K")).toBeGreaterThan(videoPrice(15, "minimax-h3", "768P"));
  });

  // ★★ 2026-08-31 빌드가 잡은 진짜 버그 — `/create` 가 프리렌더에서 죽었다:
  //   `TypeError: Cannot read properties of undefined (reading '30')`.
  //   videoPrice 는 해상도를 못 찾으면 **전역 720p 열**로 떨어지는데, H3 에는 그 열이
  //   아예 없다(768P·2K) → `undefined[30]`. 이 함수는 **화면이 부르는 자리라 던지면 안
  //   된다**는 것이 제 주석에 적힌 계약이다(값이 틀리는 것보다 화면이 사라지는 것이 나쁘다).
  it("★★ 720p 가 없는 모델에도 안 던진다 — 그 모델의 열로 떨어진다", () => {
    expect(() => videoPrice(15, "minimax-h3", "720p")).not.toThrow();
    expect(() => videoPrice(15, "minimax-h3")).not.toThrow();
    expect(() => videoPrice(null, "minimax-h3", "720p")).not.toThrow();
    // 떨어지는 자리는 **그 모델의 기본 화질** 열이다(2K) — 임의의 첫 열이 아니다.
    expect(videoPrice(15, "minimax-h3", "720p")).toBe(VIDEO_PRICE["minimax-h3"]["2K"][15]);
  });

  it("★ 컷 다시 만들기도 제 값이 있다 — 없으면 kling 값(8)으로 샌다", () => {
    expect(REGEN_PRICE.clip["minimax-h3"]).toBeTruthy();
    expect(regenPrice("clip", 1, "minimax-h3", "2K"))
      .toBe(REGEN_PRICE.clip["minimax-h3"]["2K"]);
  });
});

describe("단계별 — 참조 사진 필드 이름이 모델마다 다르다", () => {
  // ★★ 이것이 이 배선에서 **조용히 죽는** 자리다. lib/i2v.js 가 `image_urls` 를 손으로
  //   적고 있었다 — Seedance 의 이름이다. H3 는 `reference_image_urls` 라, 그대로 두면
  //   사진이 통째로 무시된 채 값만 나간다(광고 축이 2026-08-21 에 겪고 표로 옮긴 그 일).
  it("★ 프로필이 필드 이름을 쥔다", () => {
    expect(clipProfileForProject(P("minimax-h3")).refsField).toBe("reference_image_urls");
    expect(clipProfileForProject(P("seedance-2.0")).refsField).toBe("image_urls");
  });

  it("★★ lib/i2v.js 가 그 이름을 손으로 적지 않는다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/i2v.js", import.meta.url), "utf8");
    expect(src, "i2v 가 image_urls 를 아직 손으로 적는다").not.toMatch(/\{\s*image_urls:/);
  });
});
