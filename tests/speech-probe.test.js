// whisper 호출 — **언제 말했나**를 재는 유일한 자리.
//
// ★ 값이 나간다(fal-ai/whisper). 그래서 가짜 모드에서는 안 부르고, 원장에 남기고,
//   못 재도 **던지지 않는다**(자막이 옛 방식으로 흐를 뿐 영상은 이미 다 구웠다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { probeSpeech } from "../lib/speech-probe.js";

describe("probeSpeech", () => {
  it("가짜 모드에서는 부르지 않는다 — 값이 0 이라 잴 것이 없다", async () => {
    const prev = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "fal";
    let called = false;
    const out = await probeSpeech("https://x/a.mp4", { fetchImpl: async () => { called = true; } });
    expect(called).toBe(false);
    expect(out).toEqual([]);
    process.env.SHOTFORM_FAKE = prev;
  });

  // ★★ 못 재도 **던지지 않는다.** 여기서 던지면 이미 값을 다 치른 영상이
  //   "합성 실패"로 끝난다 — 자막 하나 때문에 한 편을 잃는다.
  it("실패해도 던지지 않고 빈 목록을 준다", async () => {
    const prev = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "off";
    const out = await probeSpeech("https://x/a.mp4", {
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "boom" }),
    });
    expect(out).toEqual([]);
    process.env.SHOTFORM_FAKE = prev;
  });

  it("조각을 그대로 돌려준다", async () => {
    const prev = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "off";
    const chunks = [{ timestamp: [0.1, 1.2], text: "a" }];
    const out = await probeSpeech("https://x/a.mp4", {
      fetchImpl: async () => ({ ok: true, json: async () => ({ chunks }) }),
    });
    expect(out).toEqual(chunks);
    process.env.SHOTFORM_FAKE = prev;
  });
});

describe("원장에 남는다", () => {
  const src = readFileSync("lib/speech-probe.js", "utf8");
  it("addRecord 로 기록한다 — 값이 나가는 호출은 전부 장부에 남는다", () => {
    expect(src).toContain("addRecord");
  });
  it("단가표에 whisper 가 있다", () => {
    expect(readFileSync("lib/costs.js", "utf8")).toContain("whisper");
  });
});
