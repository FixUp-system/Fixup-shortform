// 단가표는 prefix 매칭이라 "순서"가 곧 로직이다.
// 더 구체적인 prefix가 위에 있지 않으면 조용히 틀린 값이 기록된다 — 그걸 여기서 고정한다.
import { describe, it, expect, beforeEach } from "vitest";
import { estimateCost, isFakeFor } from "../lib/costs";
import { resetMemoryStore } from "../lib/store/memory.js";

// 원장은 모듈 하나짜리 인메모리다 — 비우지 않으면 합계 단언이 "이 파일의 다른 테스트가
// 비용을 안 남긴다"는 우연에 기대게 된다. 그 우연은 테스트를 하나 더 쓰면 깨진다.
beforeEach(() => resetMemoryStore());

describe("estimateCost", () => {
  it("영상 모델별 단가를 초에 곱한다", () => {
    expect(estimateCost("fal-ai/kling-video/v3/standard/text-to-video", 5)).toBe(0.63);
    expect(estimateCost("fal-ai/veo3.1", 8)).toBe(3.2);
    expect(estimateCost("fal-ai/veo3.1/fast", 8)).toBe(1.2);
  });

  it("ltx-2.3이 ltx-2보다 먼저 매치된다", () => {
    // "fal-ai/ltx-2"는 "fal-ai/ltx-2.3"으로도 startsWith 매치된다.
    // 2.3 항목이 위에 있어야 일반 2.3이 0.04(2.0 가격)로 잘못 잡히지 않는다.
    expect(estimateCost("fal-ai/ltx-2.3/image-to-video", 10)).toBe(0.6);
    expect(estimateCost("fal-ai/ltx-2/text-to-video/fast", 10)).toBe(0.4);
  });

  it("ltx의 fast 계열은 일반보다 싸다", () => {
    expect(estimateCost("fal-ai/ltx-2.3/text-to-video/fast", 10)).toBe(0.4);
    expect(estimateCost("fal-ai/ltx-2.3/image-to-video/fast", 10)).toBe(0.4);
    expect(estimateCost("fal-ai/ltx-2.3/text-to-video", 10)).toBe(0.6);
  });

  it("이미지는 장당이다 — edit 계열도 같은 값으로 잡힌다", () => {
    // 단가가 imagegen.js 에 따로 박혀 있던 것을 표로 옮겼다. 두 곳에 두면 어긋나도 모른다.
    expect(estimateCost("fal-ai/nano-banana", 1)).toBe(0.04);
    expect(estimateCost("fal-ai/nano-banana/edit", 1)).toBe(0.04);
    expect(estimateCost("fal-ai/nano-banana", 2)).toBe(0.08);
  });

  it("모르는 엔드포인트는 기본 단가로 떨어진다", () => {
    // 새 모델을 env로만 바꾸고 표에 안 넣으면 여기로 온다 — 값이 틀려도 조용하다.
    expect(estimateCost("fal-ai/wan/v2.5/image-to-video", 10)).toBe(1);
  });

  it("센트로 뭉개지 않는다 — 소액 호출이 0원으로 사라진다", () => {
    // 센트 반올림 시절 TTS 네 건($0.002씩)이 전부 $0 으로 기록됐다.
    // 소리는 나왔는데 쓴 돈이 없는 것처럼 보였다 — 싼 항목은 부를수록 총합이 벌어진다.
    expect(estimateCost("fal-ai/kling-video/v3", 7)).toBe(0.882);
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 40)).toBeGreaterThan(0);
  });

  // Kling v3 Standard 는 오디오를 끄면 ＄0.084/s, 켜면 ＄0.126/s 다.
  // 오디오를 끄는 것이 코드 보장이므로(lib/clip-limits.js 의 프로필) standard 는 audio-off 값이다.
  // ⚠️ 더 구체적인 prefix 가 위에 있어야 한다 — 아래 두 값이 같아지면 순서가 뒤집힌 것이다.
  it("kling v3 standard 는 audio-off 단가로 잰다", () => {
    expect(estimateCost("fal-ai/kling-video/v3/standard/image-to-video", 7)).toBeCloseTo(0.588, 3);
    expect(estimateCost("fal-ai/kling-video/v3/pro/image-to-video", 7)).toBeCloseTo(0.882, 3);
  });
});

describe("단위", () => {
  it("글자당 단가는 1000자 기준으로 계산한다", () => {
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 165)).toBe(0.00825);
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 2000)).toBe(0.1);
  });

  it("minimax 는 영상(초당)과 음성(글자당)이 갈린다", () => {
    // "fal-ai/minimax" 가 speech 도 삼킨다 — speech 항목이 위에 있어야 한다
    expect(estimateCost("fal-ai/minimax/speech-02-hd", 1000)).toBe(0.1);
    expect(estimateCost("fal-ai/minimax/video-01", 10)).toBe(0.5);
  });

  it("i2v와 ffmpeg 단가가 표에 있다", () => {
    expect(estimateCost("fal-ai/ltx-2.3/image-to-video/fast", 10)).toBe(0.4);
    expect(estimateCost("fal-ai/ffmpeg-api/merge-videos", 30)).toBe(0);
    expect(estimateCost("fal-ai/ffmpeg-api/merge-audio-video", 30)).toBe(0.006);
  });
});

describe("데이터 경로", () => {
  it("★ 원장이 실제 저장소를 오염시키지 않는다 — 테스트는 인메모리다", async () => {
    const { getStore } = await import("../lib/store/index.js");
    const { memoryStore } = await import("../lib/store/memory.js");
    expect(getStore()).toBe(memoryStore);
  });
});

describe("원장 멱등성", () => {
  it("같은 request_id 를 두 번 넣어도 합계가 두 배가 되지 않는다", async () => {
    const { addRecord, spentTotal } = await import("../lib/costs.js");
    const rec = { request_id: "dup-1", ts: Date.now(), endpoint: "fal-ai/x", actor: "test", est_cost_usd: 0.5 };
    await addRecord(rec);
    await addRecord(rec);
    expect(await spentTotal()).toBe(0.5);
  });
});

describe("이미지 모델 단가 — prefix 순서가 뒤집히면 조용히 틀린다", () => {
  it("nano-banana 2 는 장당 $0.08 이다", () => {
    expect(estimateCost("fal-ai/nano-banana-2", 1)).toBeCloseTo(0.08, 4);
    expect(estimateCost("fal-ai/nano-banana-2/edit", 1)).toBeCloseTo(0.08, 4);
  });

  it("옛 nano-banana 는 여전히 장당 $0.04 다", () => {
    expect(estimateCost("fal-ai/nano-banana", 1)).toBeCloseTo(0.04, 4);
    expect(estimateCost("fal-ai/nano-banana/edit", 1)).toBeCloseTo(0.04, 4);
  });

  it("컷당 한 장이면 컷당 $0.08 이다", () => {
    // 예전에는 후보 2장 × $0.04 = $0.08 이었다. 모델을 올리고 장수를 줄여 같은 값이 된다.
    expect(estimateCost("fal-ai/nano-banana-2/edit", 1)).toBeCloseTo(
      estimateCost("fal-ai/nano-banana/edit", 2), 4
    );
  });
});

describe("Seedance 를 안전장치가 안다", () => {
  const SEEDANCE = "bytedance/seedance-2.0/image-to-video";

  // ★ 병합(2026-08-13): 단가를 **해상도별 표**가 쥔다(광고 브랜치가 fal 문서로 채웠다).
  // 해상도를 안 넘기면 720p 로 본다 — 옛 단일가(0.3024)와 0.3% 차이라 옛 계약을 이 값으로
  // 옮겼다. 같은 접두사를 두 줄로 두면 앞줄이 이겨 낮게 잡히므로 표는 한 줄뿐이다.
  it("원가를 해상도별 표로 센다 — 표에 없으면 조용히 기본 단가로 떨어진다", () => {
    expect(estimateCost(SEEDANCE, 10)).toBeCloseTo(3.034, 5);
    // 표에 없는 엔드포인트가 **0 이 아니라 기본 단가($0.1/s)** 로 떨어진다는 사실을 못 박는다.
    // 0 보다 나은 것이 아니다 — 3.024 를 1 로 재는 것도 똑같이 조용한 거짓말이고,
    // 그 값으로 전역 상한이 실제보다 세 배 느슨해진다. 이 테스트가 지키는 것이다.
    expect(estimateCost("bytedance/모르는모델", 10)).toBe(1);
  });

  it("Kling 원가는 그대로다", () => {
    expect(estimateCost("fal-ai/kling-video/v3/standard/image-to-video", 10)).toBeCloseTo(0.84, 5);
  });

  // ★★ 이것이 이 태스크에서 가장 위험한 자리다
  it("가짜 모드에서 Seedance 는 fal 로 본다 — 아니면 진짜 호출이 나간다", () => {
    const before = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "fal";
    try {
      expect(isFakeFor(SEEDANCE)).toBe(true);
      expect(isFakeFor("fal-ai/kling-video/v3/standard/image-to-video")).toBe(true);
      // ★ 방향은 그대로여야 한다 — 모르는 것은 fal 축으로 떨어지면 안 된다
      expect(isFakeFor("openai/gpt-4o")).toBe(false);
      expect(isFakeFor("모르는공급자/모델")).toBe(false);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = before;
    }
  });

  it("SHOTFORM_FAKE=all 이면 둘 다 가짜다", () => {
    const before = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "all";
    try {
      expect(isFakeFor(SEEDANCE)).toBe(true);
      expect(isFakeFor("openai/gpt-4o")).toBe(true);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = before;
    }
  });
});
