// 단가표는 prefix 매칭이라 "순서"가 곧 로직이다.
// 더 구체적인 prefix가 위에 있지 않으면 조용히 틀린 값이 기록된다 — 그걸 여기서 고정한다.
import { describe, it, expect } from "vitest";
import { estimateCost } from "../lib/costs";

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

  it("모르는 엔드포인트는 기본 단가로 떨어진다", () => {
    // 새 모델을 env로만 바꾸고 표에 안 넣으면 여기로 온다 — 값이 틀려도 조용하다.
    expect(estimateCost("fal-ai/wan/v2.5/image-to-video", 10)).toBe(1);
  });

  it("센트 단위로 반올림한다", () => {
    expect(estimateCost("fal-ai/kling-video/v3", 7)).toBe(0.88); // 0.882 → 0.88
  });
});

describe("단위", () => {
  it("글자당 단가는 1000자 기준으로 계산한다", () => {
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 165)).toBe(0.01); // 0.00825 → 0.01
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
    expect(estimateCost("fal-ai/ffmpeg-api/merge-audio-video", 30)).toBe(0.01); // 0.006 → 0.01
  });
});

describe("데이터 경로", () => {
  it("SHOTFORM_DATA_DIR 을 호출 시점에 읽는다", async () => {
    // 모듈 로드 때 경로를 고정하면 이 값을 무시하고 저장소의 data/ 에 쓴다.
    // 실제로 테스트가 data/costs.json 을 오염시킨 적이 있다.
    const { mkdtempSync, existsSync } = await import("fs");
    const { tmpdir } = await import("os");
    const path = (await import("path")).default;
    const { addRecord } = await import("../lib/costs.js");

    const dir = mkdtempSync(path.join(tmpdir(), "shotform-costs-"));
    const before = process.env.SHOTFORM_DATA_DIR;
    process.env.SHOTFORM_DATA_DIR = dir;
    try {
      await addRecord({ request_id: "t1", ts: Date.now(), endpoint: "x", est_cost_usd: 0 });
      expect(existsSync(path.join(dir, "costs.json"))).toBe(true);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_DATA_DIR;
      else process.env.SHOTFORM_DATA_DIR = before;
    }
  });
});
