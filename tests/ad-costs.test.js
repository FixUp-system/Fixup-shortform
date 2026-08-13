// ★ 이 파일의 첫 단정 하나가 "SHOTFORM_FAKE=fal 에서 $3.63 이 안 나간다"의 증거다.
import { describe, it, expect, afterEach } from "vitest";
import { isFakeFor, estimateCost } from "../lib/costs.js";
import { adEndpoint, DEFAULT_AD_MODEL, adModel, AD_MODELS } from "../lib/ad/models.js";

const T2V = adEndpoint(DEFAULT_AD_MODEL, "t2v");
// ★ Task 21 — 2.5 추가. 2.0 과 다른 원가표 행에 걸리는지가 이 파일의 핵심 관심사다.
const T2V_25 = adEndpoint("seedance-2.5", "t2v");

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

  it("원가표가 seedance 를 기본 단가가 아니라 제 단가로 센다", () => {
    const perSec = adModel(DEFAULT_AD_MODEL).perSecUsd;
    expect(estimateCost(T2V, 15)).toBeCloseTo(perSec * 15, 6);
    // 기본 단가($0.1/s)로 떨어지면 15초가 $1.5 로 기록돼 원장과 전역 상한이 함께 무력해진다
    expect(estimateCost(T2V, 15)).not.toBeCloseTo(0.1 * 15, 6);
  });

  it("엔드포인트 셋 다 같은 단가로 잡힌다", () => {
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(estimateCost(adEndpoint(DEFAULT_AD_MODEL, kind), 1)).toBeCloseTo(0.2419, 6);
    }
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
  // "bytedance/seedance-2.0"(더 짧은 접두사)에 걸려 조용히 2.0 단가($0.2419)로 샐 수 있다.
  it("★ 원가표가 2.5 를 2.0 단가가 아니라 제 단가로 센다", () => {
    const perSec25 = adModel("seedance-2.5").perSecUsd;
    expect(estimateCost(T2V_25, 15)).toBeCloseTo(perSec25 * 15, 6);
    // 2.0 fast 단가로 떨어지면 15초가 $3.63 으로 기록돼 실제 원가($6.93)의 절반만 잡힌다
    expect(estimateCost(T2V_25, 15)).not.toBeCloseTo(0.2419 * 15, 6);
    // 2.0(비 fast) 단가로 떨어져도 안 된다 — 접두사가 "seedance-2.0" 을 먼저 물면 이 값이 나온다
    expect(estimateCost(T2V_25, 15)).not.toBeCloseTo(0.3024 * 15, 6);
  });

  it("2.5 엔드포인트 셋 다 같은(2.5 전용) 단가로 잡힌다", () => {
    const perSec25 = adModel("seedance-2.5").perSecUsd;
    for (const kind of ["t2v", "i2v", "r2v"]) {
      expect(estimateCost(adEndpoint("seedance-2.5", kind), 1)).toBeCloseTo(perSec25, 6);
    }
  });

  it("2.5 가 2.0 보다 초당 원가가 높다 — 토큰식·고해상도라 더 비싸다", () => {
    const perSec20 = adModel("seedance-2.0-fast").perSecUsd;
    const perSec25 = adModel("seedance-2.5").perSecUsd;
    expect(perSec25).toBeGreaterThan(perSec20);
  });

  // 표 두 곳(lib/ad/models.js 의 perSecUsd · lib/costs.js 의 PRICE_TABLE)이 모델마다 갈리지
  // 않는지 — AD_MODELS 를 훑어 대조한다(둘 다 "같은 값이어야 한다" 주석이 붙어 있다).
  it("모델마다 perSecUsd 와 원가표(PRICE_TABLE) 단가가 같다", () => {
    for (const m of AD_MODELS) {
      const perSec = estimateCost(adEndpoint(m.id, "t2v"), 1);
      expect(perSec).toBeCloseTo(m.perSecUsd, 6);
    }
  });
});
