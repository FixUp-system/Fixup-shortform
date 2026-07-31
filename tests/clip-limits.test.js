import { describe, it, expect, afterEach } from "vitest";
import {
  CLIP_PROFILES, DEFAULT_CLIP_PROFILE, DEFAULT_I2V_ENDPOINT,
  profileFor, activeClipProfile, activeI2vEndpoint,
  fitDurationFor, minSecondsFor, maxSecondsFor,
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration, activeClipLimits,
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

  // 주석이 아니라 코드가 판정한다. 넓은 prefix 가 위에 오면 아래의 구체적인 항목이 조용히
  // 가려지고, 그러면 눈금·오디오 플래그·단가가 함께 틀린다. 이 저장소가 같은 함정에
  // 두 번 걸렸다(nano-banana vs -2, ltx-2 vs ltx-2.3).
  it("뒤 항목이 앞 항목의 prefix 확장이 아니다 — 가려지는 항목이 없다", () => {
    for (let i = 0; i < CLIP_PROFILES.length; i++) {
      for (let j = i + 1; j < CLIP_PROFILES.length; j++) {
        expect(CLIP_PROFILES[j].prefix.startsWith(CLIP_PROFILES[i].prefix)).toBe(false);
      }
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

// ⚠️ "기본 프로필"과 "기본 엔드포인트"는 다른 것이다.
//   DEFAULT_CLIP_PROFILE  = **모르는 모델**이 떨어질 자리(LTX·열거 — 범위 모델에서도 유효한 값)
//   DEFAULT_I2V_ENDPOINT  = env 가 없을 때 **실제로 부를 모델**(Kling v3)
describe("activeClipProfile — env 가 정한다", () => {
  it("env 를 비우면 기본 엔드포인트(Kling)의 프로필이다 — 모르는 모델의 폴백이 아니다", () => {
    expect(activeClipProfile()).toBe(profileFor(DEFAULT_I2V_ENDPOINT));
    expect(maxSecondsFor(activeClipProfile())).toBe(15);
    expect(activeClipProfile()).not.toBe(DEFAULT_CLIP_PROFILE);
  });

  // 기본값이 두 군데 있으면 갈린다 — 갈리는 순간 Kling 을 부르면서 LTX 프로필을 쓰고,
  // `generate_audio:false` 가 빠져 오디오가 켜진 채 청구된다($0.084→$0.126).
  it("엔드포인트와 프로필이 같은 곳에서 나온다", () => {
    expect(activeI2vEndpoint()).toBe(DEFAULT_I2V_ENDPOINT);
    process.env.FAL_I2V_ENDPOINT = "fal-ai/ltx-2.3/image-to-video/fast";
    expect(activeI2vEndpoint()).toBe("fal-ai/ltx-2.3/image-to-video/fast");
    expect(activeClipProfile()).toBe(profileFor(activeI2vEndpoint()));
  });

  it("env 를 바꾸면 그 모델의 프로필이다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(maxSecondsFor(activeClipProfile())).toBe(15);
  });
});

// 화면(script·video 페이지)이 이 세 이름을 import 한다. 없애면 빌드가 깨진다.
//
// 이 값들은 **기본 엔드포인트의 프로필**에서 나온다. 폴백 프로필(LTX)이 아니다 —
// 그러면 화면이 상한 20 을 말하고 서버는 15 로 자른다(2026-07-30).
describe("하위호환 — 화면이 쓰는 이름은 기본 엔드포인트의 값이다", () => {
  it("상한이 기본 엔드포인트(Kling)의 것이다", () => {
    expect(I2V_MAX_SECONDS).toBe(maxSecondsFor(profileFor(DEFAULT_I2V_ENDPOINT)));
    expect(I2V_MAX_SECONDS).toBe(15);
  });

  // 눈금은 열거 모델에만 있다. 범위 모델에서 null 인 것이 정상이고, 그것을 모르고
  // `I2V_STEPS[0]` 로 하한을 읽으면 죽는다 — 하한은 minSecondsFor 로 읽는다.
  it("범위 모델에서는 눈금이 없다(null)", () => {
    expect(I2V_STEPS).toBe(null);
  });

  it("fitDuration 은 env 와 무관하게 기본 엔드포인트로 푼다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/ltx-2.3/image-to-video/fast";
    expect(fitDuration(7)).toBe(7); // 활성(LTX) 이면 8 이지만, 이 함수는 상수여야 한다
  });
});

describe("activeClipLimits — 화면에 실어 보낼 값", () => {
  it("env 를 비우면 기본 엔드포인트(Kling)의 하한·상한이다", () => {
    expect(activeClipLimits()).toEqual({ min: 3, max: 15 });
  });

  it("모르는 모델이면 폴백 프로필(LTX)의 하한·상한이다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/무엇인지-모르는-모델";
    expect(activeClipLimits()).toEqual({ min: 6, max: 20 });
  });

  it("env 를 바꾸면 그 모델의 값이다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/kling-video/v3/standard/image-to-video";
    expect(activeClipLimits()).toEqual({ min: 3, max: 15 });
  });
});
