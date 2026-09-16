// 표에 없는 엔드포인트는 기본가로 떨어진다 — merge-audios 가 $1.7 로 찍힌 전례가 있다.
import { describe, it, expect } from "vitest";
import { estimateCost } from "../lib/costs.js";

describe("Scribe 단가", () => {
  it("15초가 1센트 미만이다", () => {
    const usd = estimateCost("fal-ai/elevenlabs/speech-to-text/scribe-v2", 15);
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(0.01);
  });
});
