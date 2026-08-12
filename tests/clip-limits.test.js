import { describe, it, expect } from "vitest";
import {
  CLIP_PROFILES, DEFAULT_CLIP_PROFILE,
  I2V_MODELS, I2V_MODEL_IDS, DEFAULT_I2V_MODEL, LEGACY_I2V_MODEL,
  modelIdForProject, endpointForProject, clipProfileForProject, clipLimitsForProject,
  profileFor, fitDurationFor, minSecondsFor, maxSecondsFor,
  speaksFor, projectSpeaks,
  I2V_STEPS, I2V_MAX_SECONDS, fitDuration,
} from "../lib/clip-limits";

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

// ⚠️ "기본 프로필"과 "이 프로젝트의 모델"은 다른 것이다.
//   DEFAULT_CLIP_PROFILE = **모르는 모델**이 떨어질 자리(LTX·열거 — 범위 모델에서도 유효한 값)
//   endpointForProject   = 이 프로젝트에서 **실제로 부를 모델**
describe("clipProfileForProject — 프로젝트가 정한다", () => {
  it("옛 프로젝트는 Kling 의 프로필이다 — 모르는 모델의 폴백이 아니다", () => {
    const old = { settings: {} };
    expect(clipProfileForProject(old)).toBe(profileFor("fal-ai/kling-video/v3/standard/image-to-video"));
    expect(maxSecondsFor(clipProfileForProject(old))).toBe(15);
    expect(clipProfileForProject(old)).not.toBe(DEFAULT_CLIP_PROFILE);
    expect(clipLimitsForProject(old)).toEqual({ min: 3, max: 15 });
  });

  // 엔드포인트가 두 군데 있으면 갈린다 — 갈리는 순간 Kling 을 부르면서 LTX 프로필을 쓰고,
  // `generate_audio:false` 가 빠져 오디오가 켜진 채 청구된다($0.084→$0.126).
  it("엔드포인트와 프로필이 같은 곳에서 나온다", () => {
    for (const p of [{ settings: {} }, { settings: { i2v_model: "seedance-2.0" } }]) {
      expect(clipProfileForProject(p)).toBe(profileFor(endpointForProject(p)));
    }
  });
});

// 화면(script·video 페이지)이 이 세 이름을 import 한다. 없애면 빌드가 깨진다.
//
// 이 값들은 **기본 모델의 프로필**에서 나온다. 폴백 프로필(LTX)이 아니다 —
// 그러면 화면이 상한 20 을 말하고 서버는 15 로 자른다(2026-07-30).
describe("하위호환 — 화면이 쓰는 이름은 기본 모델의 값이다", () => {
  const defaultEndpoint = I2V_MODELS.find((m) => m.id === DEFAULT_I2V_MODEL).endpoint;

  it("상한이 기본 모델(Seedance)의 것이다", () => {
    expect(I2V_MAX_SECONDS).toBe(maxSecondsFor(profileFor(defaultEndpoint)));
    expect(I2V_MAX_SECONDS).toBe(15);
  });

  // 눈금은 열거 모델에만 있다. 범위 모델에서 null 인 것이 정상이고, 그것을 모르고
  // `I2V_STEPS[0]` 로 하한을 읽으면 죽는다 — 하한은 minSecondsFor 로 읽는다.
  it("범위 모델에서는 눈금이 없다(null)", () => {
    expect(I2V_STEPS).toBe(null);
  });

  // 프로젝트가 무엇을 골랐든 이 함수는 기본 모델로 푼다 — 화면 폴백이라 상수여야 한다.
  it("fitDuration 은 기본 모델로 푼다", () => {
    expect(fitDuration(7)).toBe(7);
    expect(fitDuration(2)).toBe(minSecondsFor(profileFor(defaultEndpoint)));
  });
});

describe("영상 모델 표", () => {
  it("고를 수 있는 것은 둘이고 기본은 Seedance 다", () => {
    expect(I2V_MODEL_IDS).toEqual(["seedance-2.0", "kling-v3"]);
    expect(DEFAULT_I2V_MODEL).toBe("seedance-2.0");
    expect(LEGACY_I2V_MODEL).toBe("kling-v3");
  });

  it("표의 모든 항목이 사장님에게 보일 말과 엔드포인트를 가진다", () => {
    for (const m of I2V_MODELS) {
      expect(I2V_MODEL_IDS).toContain(m.id);
      expect(m.endpoint).toMatch(/\S/);
      expect(m.label).toMatch(/\S/);
      expect(m.hint).toMatch(/\S/);
    }
  });

  // ★★ 이 단정이 이 태스크의 전부다 — 옛 프로젝트가 조용히 모델을 갈아타면 안 된다
  it("i2v_model 이 없는 옛 프로젝트는 Kling 이다", () => {
    expect(modelIdForProject(undefined)).toBe("kling-v3");
    expect(modelIdForProject({})).toBe("kling-v3");
    expect(modelIdForProject({ settings: {} })).toBe("kling-v3");
    expect(endpointForProject({ settings: {} })).toBe(
      "fal-ai/kling-video/v3/standard/image-to-video"
    );
  });

  it("모르는 값도 Kling 으로 떨어진다 — 새 모델로 조용히 갈아타는 것보다 낫다", () => {
    expect(modelIdForProject({ settings: { i2v_model: "뒤죽박죽" } })).toBe("kling-v3");
    expect(modelIdForProject({ settings: { i2v_model: "constructor" } })).toBe("kling-v3");
  });

  it("고른 모델이 엔드포인트와 프로필을 정한다", () => {
    const p = { settings: { i2v_model: "seedance-2.0" } };
    expect(endpointForProject(p)).toBe("bytedance/seedance-2.0/image-to-video");
    expect(clipProfileForProject(p).min).toBe(4);
    expect(clipProfileForProject(p).max).toBe(15);
    expect(clipLimitsForProject(p)).toEqual({ min: 4, max: 15 });
  });

  // ★ 뒤집혔다 — 이 모델은 클립이 직접 말한다. 대신 우리 TTS 를 만들지 않는다
  //   (둘 다 만들면 소리가 두 겹이 된다). 판정은 speaksFor 가 쥔다.
  it("Seedance 는 오디오를 켠다 — 클립이 직접 말한다", () => {
    const profile = profileFor("bytedance/seedance-2.0/image-to-video");
    expect(profile.extra.generate_audio).toBe(true);
  });

  it("Seedance 는 4~15 정수를 받는다 — 눈금이 아니다", () => {
    const profile = profileFor("bytedance/seedance-2.0/image-to-video");
    expect(profile.steps).toBe(null);
    expect(fitDurationFor(profile, 2)).toBe(4);    // 바닥에 묶인다
    expect(fitDurationFor(profile, 7.2)).toBe(8);  // 올린다
    expect(fitDurationFor(profile, 99)).toBe(15);  // 상한에 묶인다
  });

  it("Kling 프로필은 그대로다 — 옛 영상이 달라지면 안 된다", () => {
    const profile = profileFor("fal-ai/kling-video/v3/standard/image-to-video");
    expect(profile.min).toBe(3);
    expect(profile.max).toBe(15);
    expect(profile.extra.generate_audio).toBe(false);
  });

  it("env 로는 모델이 바뀌지 않는다 — 원천은 프로젝트 하나다", () => {
    process.env.FAL_I2V_ENDPOINT = "fal-ai/ltx-2";
    try {
      expect(endpointForProject({ settings: { i2v_model: "seedance-2.0" } })).toBe(
        "bytedance/seedance-2.0/image-to-video"
      );
      expect(endpointForProject({ settings: {} })).toBe(
        "fal-ai/kling-video/v3/standard/image-to-video"
      );
    } finally {
      delete process.env.FAL_I2V_ENDPOINT;
    }
  });
});

describe("음성을 누가 만드는가 — 모델이 정한다", () => {
  it("Seedance 는 클립이 말한다", () => {
    expect(speaksFor(profileFor("bytedance/seedance-2.0/image-to-video"))).toBe(true);
  });

  // ★ Kling 은 오디오를 켜면 단가가 $0.084 → $0.126 이고 립싱크가 미검증이다
  it("Kling 은 말하지 않는다 — TTS 낭독 그대로다", () => {
    expect(speaksFor(profileFor("fal-ai/kling-video/v3/standard/image-to-video"))).toBe(false);
  });

  it("모르는 모델은 말하지 않는 쪽으로 떨어진다", () => {
    expect(speaksFor(profileFor("어디회사/새모델"))).toBe(false);
  });

  // ★ 오디오를 켜는 것과 말하는 것은 같은 스위치다 — 갈리면 무음 클립에 대사를 넣거나
  //    소리 나는 클립 위에 TTS 를 덧씌운다
  it("말하는 모델만 generate_audio 가 켜져 있다", () => {
    expect(profileFor("bytedance/seedance-2.0/image-to-video").extra.generate_audio).toBe(true);
    expect(profileFor("fal-ai/kling-video/v3/standard/image-to-video").extra.generate_audio).toBe(false);
  });

  // ★★ 모든 컷에 말할 사람과 대사가 있어야 한다 — 하나라도 비면 그 컷만 무음이 되어
  // 한 편 안에서 원고 일부가 안 들린다. 섞지 않는다.
  describe("projectSpeaks — 한 편 안에서 소리의 출처가 갈리지 않는다", () => {
    const seed = (cast, cuts) => ({ settings: { i2v_model: "seedance-2.0" }, cast, cuts });
    const person = (cuts) => [{ id: "c1", who: "20대 남성", voice: "중저음", cuts }];
    const cuts2 = [{ idx: 0, sentence: "가" }, { idx: 1, sentence: "나" }];

    it("모든 컷에 인물이 있으면 말한다", () => {
      expect(projectSpeaks(seed(person([0, 1]), cuts2))).toBe(true);
    });

    it("한 컷이라도 인물이 없으면 전체가 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0]), cuts2))).toBe(false);
    });

    it("한 컷이라도 대사가 비면 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0, 1]), [{ idx: 0, sentence: "가" }, { idx: 1, sentence: "  " }]))).toBe(false);
    });

    it("인물이 아예 없으면 말하지 않는다", () => {
      expect(projectSpeaks(seed([], cuts2))).toBe(false);
      expect(projectSpeaks({ settings: { i2v_model: "seedance-2.0" }, cuts: cuts2 })).toBe(false);
    });

    it("컷이 없으면 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0, 1]), []))).toBe(false);
    });

    // ★ 교차 상태 — Kling 으로 낭독까지 만든 뒤 클립에서 실패해 자동 환불되면 모델 잠금이
    //   풀려 Seedance 로 갈아탈 수 있다. 그때 컷에 남은 TTS 를 그대로 두고 말하게 하면
    //   한 편 안에서 소리의 출처가 갈린다.
    it("컷에 소리 파일이 하나라도 있으면 말하지 않는다", () => {
      const withAudio = [
        { idx: 0, sentence: "가", audio: { url: "https://f/a0.mp3", seconds: 3 } },
        { idx: 1, sentence: "나" },
      ];
      expect(projectSpeaks(seed(person([0, 1]), withAudio))).toBe(false);
      // 전부 TTS 인 경우도 마찬가지다 — 말하는 클립이 낭독 길이로 잘려 문장 끝이 사라진다
      const allAudio = cuts2.map((c) => ({ ...c, audio: { url: `https://f/a${c.idx}.mp3`, seconds: 3 } }));
      expect(projectSpeaks(seed(person([0, 1]), allAudio))).toBe(false);
    });

    it("소리 파일이 없으면 지금처럼 말한다", () => {
      // audio 키가 있어도 url 이 없으면(실패 흔적) 소리 파일이 아니다
      const noUrl = cuts2.map((c) => ({ ...c, audio: null }));
      expect(projectSpeaks(seed(person([0, 1]), noUrl))).toBe(true);
      expect(projectSpeaks(seed(person([0, 1]), cuts2))).toBe(true);
    });

    it("모델이 Kling 이면 인물이 다 있어도 말하지 않는다", () => {
      expect(projectSpeaks({ settings: { i2v_model: "kling-v3" }, cast: person([0, 1]), cuts: cuts2 })).toBe(false);
    });
  });
});
