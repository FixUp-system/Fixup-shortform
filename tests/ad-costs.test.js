// ★ 이 파일의 첫 단정 하나가 "SHOTFORM_FAKE=fal 에서 $3.63 이 안 나간다"의 증거다.
import { describe, it, expect, afterEach } from "vitest";
import { isFakeFor, estimateCost } from "../lib/costs.js";
import { adEndpoint, DEFAULT_AD_MODEL, adModel } from "../lib/ad/models.js";

const T2V = adEndpoint(DEFAULT_AD_MODEL, "t2v");

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
});
