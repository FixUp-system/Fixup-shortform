// ★ 이 파일의 첫 단정 하나가 "SHOTFORM_FAKE=fal 에서 $3.63 이 안 나간다"의 증거다.
import { describe, it, expect, afterEach } from "vitest";
import { isFakeFor, estimateCost } from "../lib/costs.js";
import { adEndpoint, DEFAULT_AD_MODEL, adModel, AD_MODELS, adResolutionsFor } from "../lib/ad/models.js";

// AD_MODELS[].perSecUsd 가 숫자(해상도 무관)일 수도, 객체(해상도별)일 수도 있다
// (lib/ad/models.js 상단 주석 참고) — "이 모델·해상도의 실제 초당 단가"를 뽑는 헬퍼.
const perSecOf = (m, resolution) =>
  typeof m.perSecUsd === "number" ? m.perSecUsd : m.perSecUsd[resolution];

const T2V = adEndpoint(DEFAULT_AD_MODEL, "t2v");
// ★ Task 21 — 2.5 추가. 2.0 과 다른 원가표 행에 걸리는지가 이 파일의 핵심 관심사다.
const T2V_25 = adEndpoint("seedance-2.5", "t2v");
// ★ Task 24 — fast 티어(옛 기본 모델)도 별도 행에 걸리는지 계속 지킨다.
const T2V_FAST = adEndpoint("seedance-2.0-fast", "t2v");

describe("광고 모델과 비용 축", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("★ SHOTFORM_FAKE=fal 이면 seedance 는 가짜다 — 아니면 진짜 돈이 나간다", () => {
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor(T2V)).toBe(true);
  });

  it("SHOTFORM_FAKE 가 없으면 진짜다", () => {
    expect(isFakeFor(T2V)).toBe(false);
  });

  it("판정 방향은 그대로다 — 모르는 엔드포인트는 fal 축으로 안 떨어진다", () => {
    // fail-closed: SHOTFORM_FAKE=fal 에서 모르는 것은 "가짜"가 아니어야 예산 게이트가 산다
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor("누가봐도/모르는것")).toBe(false);
    expect(isFakeFor("openai/gpt-4o")).toBe(false);
  });

  it("SHOTFORM_FAKE=all 이면 셋 다 가짜다", () => {
    process.env.SHOTFORM_FAKE = "all";
    expect(isFakeFor(T2V)).toBe(true);
    expect(isFakeFor("fal-ai/nano-banana-2")).toBe(true);
    expect(isFakeFor("openai/gpt-4o")).toBe(true);
  });

  // ★ Task 24 — 기본 모델이 standard 다. resolution 을 안 넘기면(옛 호출부) 720p 로 잡힌다
  // (DEFAULT_AD_RESOLUTION 과 같은 값 — lib/costs.js 의 perSecFor 주석 참고).
  it("원가표가 seedance(기본=standard, 720p)를 기본 단가가 아니라 제 단가로 센다", () => {
    const perSec = perSecOf(adModel(DEFAULT_AD_MODEL), "720p");
    expect(estimateCost(T2V, 15)).toBeCloseTo(perSec * 15, 6);
    // 기본 단가($0.1/s)로 떨어지면 15초가 $1.5 로 기록돼 원장과 전역 상한이 함께 무력해진다
    expect(estimateCost(T2V, 15)).not.toBeCloseTo(0.1 * 15, 6);
  });

  it("엔드포인트 셋 다 같은 단가로 잡힌다 — 기본(standard, 720p)", () => {
    const perSec = perSecOf(adModel(DEFAULT_AD_MODEL), "720p");
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(estimateCost(adEndpoint(DEFAULT_AD_MODEL, kind), 1)).toBeCloseTo(perSec, 6);
    }
  });

  // ── Task 24 — 해상도가 원가표 셋째 축이다 ────────────────────────────
  it("★ standard 는 해상도마다 원가가 다르다 — 1080p 가 720p 보다, 720p 가 480p 보다 비싸다", () => {
    const c480 = estimateCost(T2V, 1, "480p");
    const c720 = estimateCost(T2V, 1, "720p");
    const c1080 = estimateCost(T2V, 1, "1080p");
    expect(c1080).toBeGreaterThan(c720);
    expect(c720).toBeGreaterThan(c480);
  });

  it("resolution 을 생략하면 720p 로 잡힌다 — 옛 문서·옛 호출부와 같은 값", () => {
    expect(estimateCost(T2V, 15)).toBeCloseTo(estimateCost(T2V, 15, "720p"), 6);
  });

  
  
  // ── Task 21 — Seedance 2.5 ────────────────────────────────────────────
  // ⑥ 가짜 모드가 2.5 엔드포인트도 fal 축으로 본다(`bytedance/` 접두사) — FAL_PREFIXES 는
  // "bytedance/" 전체를 걸어 뒀으니 "-2.5"도 자동으로 걸린다. 새 접두사를 안 더해도 되는
  // 이유를 실측으로 남긴다(2.0 을 더할 때는 이 규율이 없어서 실제로 구멍이었다).
  it("★ SHOTFORM_FAKE=fal 이면 2.5 도 가짜다 — bytedance/ 접두사 하나로 걸린다", () => {
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor(T2V_25)).toBe(true);
  });

  it("SHOTFORM_FAKE 가 없으면 2.5 도 진짜다", () => {
    expect(isFakeFor(T2V_25)).toBe(false);
  });

  // ⑤ 원가표가 2.5 를 2.0 의 단가가 아니라 제 단가로 센다 — 접두사 매칭 순서가 갈리면
  // "bytedance/seedance-2.0"(더 짧은 접두사)에 걸려 조용히 2.0 단가로 샐 수 있다.
  it("★ 원가표가 2.5 를 2.0 단가가 아니라 제 단가로 센다(720p 기준)", () => {
    const perSec25 = perSecOf(adModel("seedance-2.5"), "720p");
    const perSecStandard720 = perSecOf(adModel(DEFAULT_AD_MODEL), "720p");
    expect(estimateCost(T2V_25, 15)).toBeCloseTo(perSec25 * 15, 6);
    // 2.0 fast 단가로 떨어지면 15초가 $3.63 으로 기록돼 실제 원가($6.93)의 절반만 잡힌다
    expect(estimateCost(T2V_25, 15)).not.toBeCloseTo(0.2419 * 15, 6);
    // 2.0(standard) 단가로 떨어져도 안 된다 — 접두사가 "seedance-2.0" 을 먼저 물면 이 값이 나온다
    expect(estimateCost(T2V_25, 15)).not.toBeCloseTo(perSecStandard720 * 15, 6);
  });

  it("2.5 엔드포인트 셋 다 같은(2.5 전용, 720p) 단가로 잡힌다", () => {
    const perSec25 = perSecOf(adModel("seedance-2.5"), "720p");
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(estimateCost(adEndpoint("seedance-2.5", kind), 1)).toBeCloseTo(perSec25, 6);
    }
  });

  it("★ 2.5 도 해상도별로 원가가 다르다 — 720p 가 480p 보다 비싸다", () => {
    expect(estimateCost(T2V_25, 1, "720p")).toBeGreaterThan(estimateCost(T2V_25, 1, "480p"));
  });

  
  // 표 두 곳(lib/ad/models.js 의 perSecUsd · lib/costs.js 의 PRICE_TABLE)이 모델·해상도마다
  // 갈리지 않는지 — AD_MODELS 를 훑어 대조한다(둘 다 "같은 값이어야 한다" 주석이 붙어 있다).
  it("모델·해상도마다 perSecUsd 와 원가표(PRICE_TABLE) 단가가 같다", () => {
    for (const m of AD_MODELS) {
      if (typeof m.perSecUsd === "number") {
        const perSec = estimateCost(adEndpoint(m.id, "t2v"), 1);
        expect(perSec).toBeCloseTo(m.perSecUsd, 6);
        continue;
      }
      for (const r of adResolutionsFor(m.id)) {
        const perSec = estimateCost(adEndpoint(m.id, "t2v"), 1, r);
        expect(perSec, `${m.id}/${r} 단가가 갈린다`).toBeCloseTo(m.perSecUsd[r], 6);
      }
    }
  });
});
