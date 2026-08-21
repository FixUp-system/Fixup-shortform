// MiniMax H3 추가 — **값이 정확히 표기되고 트래킹되는가**를 잠근다(사장님 요구 2026-08-21).
//
// 이 저장소에서 값이 갈리면 조용히 손해가 난다: 모델 표(화면이 보여 주는 값) · 원가표
// (예산 가드와 원장) · 가격표(크레딧 청구) 셋이 **같은 값을 들어야** 한다. 셋을 손으로
// 맞춰 두었으니, 어긋나는 순간 여기서 실패해야 한다.
import { describe, it, expect } from "vitest";
import {
  AD_MODELS, adModel, adEndpoint, isAdModel, adSecondsFor, isAdSeconds,
  adResolutionsFor, isAdResolution, adDefaultResolution, isAdminOnlyResolution,
} from "../lib/ad/models.js";
import { AD_VIDEO_PRICE, adVideoPrice } from "../lib/pricing.js";
import { estimateCost, isFakeFor } from "../lib/costs.js";
import { buildFalInput } from "../lib/ad/generate.js";
import { buildScenarioMessages } from "../lib/ad/scenario.js";
import { modelsForTier } from "../lib/tiers.js";

const H3 = "minimax-h3";
const settingsFor = (model, over = {}) => ({
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model, ...over,
});

describe("H3 모델 표", () => {
  it("표에 있고 라우트가 닫힌 목록으로 받는다", () => {
    expect(isAdModel(H3)).toBe(true);
    expect(adModel(H3).name).toBe("MiniMax H3");
  });

  // ★ **`/lora` 가 아니다.** 그쪽은 required 가 ["prompt","loras"] 라 학습된 어댑터 없이는
  //   호출 자체가 안 된다(학습 $0.015 × steps). 실수로 그 경로를 적으면 첫 호출에서
  //   422 가 나는데, 그때는 이미 크레딧을 받은 뒤다.
  it("엔드포인트가 fal 경로와 글자 그대로 같고 /lora 가 아니다", () => {
    expect(adEndpoint(H3, "t2v")).toBe("minimax/h3/text-to-video");
    expect(adEndpoint(H3, "i2v")).toBe("minimax/h3/image-to-video");
    expect(adEndpoint(H3, "r2v")).toBe("minimax/h3/reference-to-video");
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(adEndpoint(H3, kind)).not.toContain("/lora");
    }
  });

  it("사장님이 정한 대로 2K 가 기본이고 4K 를 고를 수 있다", () => {
    expect(adDefaultResolution(H3)).toBe("2K");
    expect(adResolutionsFor(H3)).toEqual(["2K", "4K"]);
  });

  it("15초 하나다 — 스키마 상한이 15초라 30초를 못 만든다", () => {
    expect(adSecondsFor(H3)).toEqual([15]);
    expect(isAdSeconds(30, H3)).toBe(false);
    expect(adModel(H3).maxSeconds).toBe(15);
  });

  // ★ Seedance 의 해상도 문자열을 H3 에 주면 안 된다 — 표기가 다르다(720p vs 2K).
  //   같은 필드(settings.resolution)에 두 표기가 섞여 살기 때문에, 목록이 모델별로
  //   갈려 있지 않으면 그대로 fal 에 나가 422 가 난다.
  it("Seedance 해상도는 H3 가 안 받고, 그 반대도 안 받는다", () => {
    expect(isAdResolution("720p", H3)).toBe(false);
    expect(isAdResolution("2K", "seedance-2.0")).toBe(false);
  });

  it("기본 등급이 쓸 수 있다 — 원가가 가장 싸서 좁힐 이유가 없다", () => {
    expect(modelsForTier("basic").map((m) => m.id)).toContain(H3);
  });
});

describe("값이 세 표에서 같은가 — 갈리면 조용히 손해가 난다", () => {
  // ★ 모델 표(화면) ↔ 원가표(예산 가드·원장). 원가표가 낮으면 가드가 뚫린다.
  it("모델 표의 perSecUsd 와 원가표(lib/costs.js)가 초당 같은 값을 낸다", () => {
    for (const m of AD_MODELS) {
      for (const [res, perSec] of Object.entries(m.perSecUsd || {})) {
        const endpoint = m.endpoints.r2v;
        const oneSecond = estimateCost(endpoint, 1, res);
        expect(oneSecond, `${m.id} ${res} 의 원가가 표와 다르다`).toBeCloseTo(perSec, 6);
      }
    }
  });

  // ★ 모델 표 ↔ 가격표(크레딧). 가격이 없으면 adVideoPrice 가 던져 화면이 죽는다.
  it("고를 수 있는 모든 조합에 크레딧 가격이 있다 — 관리자 전용도 포함", () => {
    for (const m of AD_MODELS) {
      for (const sec of m.seconds) {
        for (const res of [...m.resolutions, ...(m.adminResolutions || [])]) {
          const price = adVideoPrice(sec, m.id, res);
          expect(price, `${m.id} ${sec}초 ${res} 가격이 없다`).toBeGreaterThan(0);
        }
      }
    }
  });

  // ★ 크레딧이 원가보다 적으면 팔수록 손해다. 1크레딧 ≈ $0.06 이 이 저장소의 환산이고,
  //   가격표는 그보다 **올려** 잡는다(5크레딧 단위 올림).
  it("크레딧 정가가 원가보다 낮지 않다 — 팔수록 손해인 칸이 없다", () => {
    const CREDIT_USD = 0.06;
    for (const m of AD_MODELS) {
      for (const sec of m.seconds) {
        for (const res of [...m.resolutions, ...(m.adminResolutions || [])]) {
          // ★ 부동소수 오차를 반올림으로 걷는다 — 1.04×15 가 15.600000000000001 이 된다.
          const costUsd = Math.round(m.perSecUsd[res] * sec * 1e6) / 1e6;
          const credits = adVideoPrice(sec, m.id, res);
          expect(credits * CREDIT_USD, `${m.id} ${sec}초 ${res} 가 원가($${costUsd.toFixed(2)})보다 싸다`)
            .toBeGreaterThanOrEqual(costUsd);
        }
      }
    }
  });

  it("H3 값이 실제로 이 숫자다 — fal 공시 단가에서 계산한 그대로", () => {
    expect(AD_VIDEO_PRICE[H3][15]["2K"]).toBe(35); // $0.13 × 15 = $1.95
    expect(AD_VIDEO_PRICE[H3][15]["4K"]).toBe(40); // $0.16 × 15 = $2.40
  });

  // ★★ 이 목록에 없으면 그 모델이 **fal 이 아닌 것으로 판정돼** 가짜 모드에서 진짜
  //   호출이 나간다 — 0원인 줄 알고 돌리다 값이 나가는 자리다.
  it("가짜 모드가 H3 를 fal 로 알아본다", () => {
    expect(isFakeFor("minimax/h3/reference-to-video")).toBe(isFakeFor("bytedance/seedance-2.0/reference-to-video"));
  });
});

describe("2.5 의 1080p — 관리자 전용", () => {
  it("일반 사용자에게는 목록에 없고 관리자에게만 있다", () => {
    expect(adResolutionsFor("seedance-2.5")).not.toContain("1080p");
    expect(adResolutionsFor("seedance-2.5", { admin: true })).toContain("1080p");
    expect(isAdminOnlyResolution("1080p", "seedance-2.5")).toBe(true);
  });

  it("★ 넘기는 것을 잊으면 닫히는 쪽으로 틀린다 — 안전한 방향", () => {
    expect(isAdResolution("1080p", "seedance-2.5")).toBe(false);
  });

  it("값은 정확히 표기된다 — 관리자가 만들어도 청구·기록이 똑같이 돈다", () => {
    // $1.04/s × 15 = $15.60 · × 30 = $31.20
    expect(adVideoPrice(15, "seedance-2.5", "1080p")).toBe(260);
    expect(adVideoPrice(30, "seedance-2.5", "1080p")).toBe(520);
    expect(estimateCost("bytedance/seedance-2.5/reference-to-video", 15, "1080p")).toBeCloseTo(15.6, 4);
  });
});

describe("fal 입력이 모델마다 다르게 조립된다", () => {
  const scenario = { text: "base", shots: [], voice: "" };
  const refs = [{ key: "a.jpg", bytes: Buffer.from("x") }, { key: "b.jpg", bytes: Buffer.from("y") }];

  it("H3 는 reference_image_urls 로 넘긴다 — image_urls 가 아니다", () => {
    const input = buildFalInput({ settings: settingsFor(H3, { resolution: "2K" }), scenario, refs, kind: "r2v", seconds: 15 });
    expect(input.reference_image_urls).toHaveLength(2);
    expect(input.image_urls).toBeUndefined();
    expect(input.image_url).toBeUndefined();
    expect(input.resolution).toBe("2K");
  });

  it("H3 는 한 장이어도 배열이다 — image_url(단수) 자체가 스키마에 없다", () => {
    const input = buildFalInput({ settings: settingsFor(H3), scenario, refs: [refs[0]], kind: "i2v", seconds: 15 });
    expect(input.reference_image_urls).toHaveLength(1);
    expect(input.image_url).toBeUndefined();
  });

  it("★ Seedance 는 예전 그대로다 — 손댄 것은 H3 갈래뿐이다", () => {
    const r2v = buildFalInput({ settings: settingsFor("seedance-2.0", { resolution: "720p" }), scenario, refs, kind: "r2v", seconds: 15 });
    expect(r2v.image_urls).toHaveLength(2);
    expect(r2v.reference_image_urls).toBeUndefined();
    const i2v = buildFalInput({ settings: settingsFor("seedance-2.0"), scenario, refs: [refs[0]], kind: "i2v", seconds: 15 });
    expect(i2v.image_url).toBeTruthy();
    expect(i2v.image_urls).toBeUndefined();
  });

  it("t2v 는 양쪽 다 참조를 안 싣는다", () => {
    for (const model of [H3, "seedance-2.0"]) {
      const input = buildFalInput({ settings: settingsFor(model, { resolution: undefined }), scenario, refs: [], kind: "t2v", seconds: 15 });
      expect(input.reference_image_urls).toBeUndefined();
      expect(input.image_urls).toBeUndefined();
    }
  });

  // ★ duration 은 **안 바꿨다**(검증된 동작을 스키마를 근거로 미검증으로 만들지 않는다).
  //   이 시험은 그 결정을 못 박는다 — 누가 문자열로 바꾸면 여기서 걸린다.
  it("duration 은 양쪽 다 숫자 그대로 나간다", () => {
    for (const model of [H3, "seedance-2.0", "seedance-2.5"]) {
      const input = buildFalInput({ settings: settingsFor(model, { resolution: undefined }), scenario, refs: [], kind: "t2v", seconds: 15 });
      expect(input.duration).toBe(15);
    }
  });
});

describe("H3 지문 토막 — 참조를 이름으로 가리키게 한다", () => {
  const build = (model, photos) =>
    buildScenarioMessages({ kind: "ad", settings: settingsFor(model), material: { text: "소재", photos } }).messages[0].content;

  it("H3 + 사진이 있으면 Image 1 로 가리키라고 말한다", () => {
    const user = build(H3, [{ url: "/api/uploads/a.jpg" }]);
    expect(user).toContain("Image 1");
  });

  it("사진이 두 장이면 Image 2 까지 알려 준다", () => {
    expect(build(H3, [{ url: "/a.jpg" }, { url: "/b.jpg" }])).toContain("Image 2");
  });

  // ★ 가리킬 것이 없는데 지칭 규칙만 남으면 모델이 없는 Image 1 을 지어낸다.
  it("사진이 없으면 그 줄이 통째로 없다", () => {
    expect(build(H3, [])).not.toContain("Image 1");
  });

  it("★ Seedance 지문은 그대로다 — 그쪽은 넣으면 알아서 쓴다", () => {
    expect(build("seedance-2.0", [{ url: "/a.jpg" }])).not.toContain("Image 1");
  });
});
