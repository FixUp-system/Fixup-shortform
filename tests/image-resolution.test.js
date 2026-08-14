// ★ 이미지 해상도가 **영상 화질을 따라간다**(2026-08-14 사용자 결정).
//
// 지금까지 이미지는 resolution 을 아예 안 보내 늘 기본값(1K)이었다. 그런데 이 이미지는
// 클립의 **첫 프레임**으로 들어간다 — 1080p 클립에 1K 이미지를 넣으면 그것이 상한이 되고,
// 480p 클립에 2K 를 넣으면 줄여서 버린다(그리고 값은 1.5배 낸다).
//
// fal 문서 실측: nano-banana-2 는 resolution "0.5K|1K|2K|4K" 를 받고
// 2K 는 표준가의 **1.5배**다($0.08 → $0.12). aspect_ratio 는 그대로 쓴다.
import { describe, it, expect } from "vitest";
import { imageResolutionFor } from "../lib/imagegen.js";
import { IMAGE_RESOLUTION_MULTIPLIER, estimateCost } from "../lib/costs.js";


const project = (resolution, model = "seedance-2.0") => ({
  settings: { i2v_model: model, resolution },
  cuts: [],
});

describe("이미지 해상도 — 영상 화질을 따라간다", () => {
  it("480p·720p 영상은 1K 그대로 — 값이 안 오른다", () => {
    expect(imageResolutionFor(project("480p"))).toBe("1K");
    expect(imageResolutionFor(project("720p"))).toBe("1K");
  });

  it("★ 1080p 영상은 2K — 1K 가 상한이 되지 않게", () => {
    expect(imageResolutionFor(project("1080p"))).toBe("2K");
  });

  it("화질 축이 없는 옛 프로젝트도 1K 로 떨어진다 — 던지지 않는다", () => {
    expect(imageResolutionFor(project(undefined))).toBe("1K");
    expect(imageResolutionFor({})).toBe("1K");
    expect(imageResolutionFor(null)).toBe("1K");
  });
});

describe("이미지 해상도 — 원가가 배수를 반영한다", () => {
  it("★ 2K 는 1.5배로 잡힌다 — 안 그러면 실제로 나간 돈보다 장부가 적다", () => {
    const one = estimateCost("fal-ai/nano-banana-2", 1);
    const two = estimateCost("fal-ai/nano-banana-2", 1, "2K");
    expect(one).toBeCloseTo(0.08, 4);
    expect(two).toBeCloseTo(0.12, 4);
  });

  it("배수표가 문서값 그대로다 — 0.5K 0.75 · 1K 1 · 2K 1.5 · 4K 2", () => {
    expect(IMAGE_RESOLUTION_MULTIPLIER).toEqual({ "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 });
  });

  it("모르는 값은 1배로 본다 — 옛 기록이 갑자기 커지지 않게", () => {
    expect(estimateCost("fal-ai/nano-banana-2", 1, "없는값")).toBeCloseTo(0.08, 4);
  });
});
