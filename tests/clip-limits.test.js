import { describe, it, expect, afterEach } from "vitest";
import {
  CLIP_PROFILES, DEFAULT_CLIP_PROFILE, profileFor, activeClipProfile,
  fitDurationFor, minSecondsFor, maxSecondsFor,
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
} from "../lib/clip-limits";

afterEach(() => { delete process.env.FAL_I2V_ENDPOINT; });

describe("profileFor — prefix 순서가 곧 로직이다", () => {
  it("Kling v3 을 고른다", () => {
    const p = profileFor("fal-ai/kling-video/v3/standard/image-to-video");
    expect(p.steps).toBe(null);
    expect(p.min).toBe(3);
    expect(p.max).toBe(15);
  });

  it("LTX 계열을 고른다 — 2.3 도 fast 도 같은 눈금이다", () => {
    for (const id of [
      "fal-ai/ltx-2.3/image-to-video/fast",
      "fal-ai/ltx-2.3/image-to-video",
      "fal-ai/ltx-2/image-to-video/fast",
    ]) {
      expect(profileFor(id).steps).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    }
  });

  // 왜 LTX 로 떨어뜨리는가: 대칭이 아니다. 범위 모델에 6·8 을 보내면 유효한 값이라 통과하고
  // 값만 조금 더 나가지만, 열거 모델에 7초를 보내면 422 로 죽는다(2026-07-28 에 네 컷 전부).
  it("모르는 모델은 기본 프로필(LTX)로 떨어진다", () => {
    for (const id of ["fal-ai/veo3.1/fast", "fal-ai/minimax/video", "", undefined, null]) {
      expect(profileFor(id)).toBe(DEFAULT_CLIP_PROFILE);
    }
    expect(DEFAULT_CLIP_PROFILE.steps).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it("표의 모든 프로필이 눈금을 한 종류만 갖는다", () => {
    for (const p of CLIP_PROFILES) {
      const isRange = p.steps === null;
      expect(isRange ? typeof p.min === "number" && typeof p.max === "number" : Array.isArray(p.steps)).toBe(true);
    }
  });
});

describe("fitDurationFor — 눈금 종류마다 다르게 올린다", () => {
  const ltx = profileFor("fal-ai/ltx-2.3/image-to-video/fast");
  const kling = profileFor("fal-ai/kling-video/v3/standard/image-to-video");

  it("열거 눈금은 다음 칸으로 올린다", () => {
    expect(fitDurationFor(ltx, 5)).toBe(6);
    expect(fitDurationFor(ltx, 6)).toBe(6);
    expect(fitDurationFor(ltx, 9)).toBe(10);
    expect(fitDurationFor(ltx, 25)).toBe(20);
  });

  // 임의 초라 낭독을 그대로 살 수 있다 — 이 프로필을 넣은 이유다.
  // 07-30 실측: 컷 6개 낭독 32초에 LTX 눈금으로 40초를 샀다(8초 = $0.32 가 잘려나갔다).
  it("범위 눈금은 정수로 올리고 하한·상한에 묶는다", () => {
    expect(fitDurationFor(kling, 7)).toBe(7);
    expect(fitDurationFor(kling, 6.2)).toBe(7);
    expect(fitDurationFor(kling, 2)).toBe(3);
    expect(fitDurationFor(kling, 0)).toBe(3);
    expect(fitDurationFor(kling, 20)).toBe(15);
  });

  it("내리지 않는다 — 내리면 소리가 그림보다 길어져 뒤가 잘린다", () => {
    for (const s of [3.1, 4, 5.5, 7.2]) {
      expect(fitDurationFor(kling, s)).toBeGreaterThanOrEqual(s);
      expect(fitDurationFor(ltx, s)).toBeGreaterThanOrEqual(s);
    }
  });

  it("하한·상한을 눈금 종류와 무관하게 읽는다", () => {
    expect(minSecondsFor(ltx)).toBe(6);
    expect(maxSecondsFor(ltx)).toBe(20);
    expect(minSecondsFor(kling)).toBe(3);
    expect(maxSecondsFor(kling)).toBe(15);
  });
});

describe("activeClipProfile — env 가 정한다", () => {
  it("env 를 비우면 기본 프로필이다", () => {
    expect(activeClipProfile()).toBe(DEFAULT_CLIP_PROFILE);
  });

  it("env 를 바꾸면 그 모델의 프로필이다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(maxSecondsFor(activeClipProfile())).toBe(15);
  });
});

// 화면(script·video 페이지)이 이 세 이름을 import 한다. 없애면 빌드가 깨진다.
describe("하위호환 — 화면이 쓰는 이름은 기본 프로필 값이다", () => {
  it("눈금 상수가 그대로다", () => {
    expect(I2V_STEPS).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
    expect(I2V_MAX_SECONDS).toBe(20);
  });

  it("fitDuration 은 env 와 무관하게 기본 프로필로 푼다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(fitDuration(7)).toBe(8); // 활성 프로필이면 7 이지만, 이 함수는 기본 프로필이다
  });
});
