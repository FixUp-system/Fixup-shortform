// 소리만 뽑아 data URI 로 준다 — 측정기(Scribe)가 mp4 를 안 받는다.
// 실측 2026-09-16: fal 이 mp4 URL 에 422 unsupported_audio_format 을 돌려줬다.
import { describe, it, expect } from "vitest";
import { extractAudioDataUri, AUDIO_DATA_URI_MAX } from "../lib/speech-audio.js";

const deps = (bytes) => ({
  projectId: "p1",
  downloadImpl: async (_url, dest) => dest,
  mkdtempImpl: async () => "/tmp/x",
  runFfmpeg: async () => ({ ok: true }),
  readFileImpl: async () => Buffer.from(bytes),
  rmImpl: async () => {},
});

describe("extractAudioDataUri", () => {
  it("오디오를 data URI 로 준다", async () => {
    const out = await extractAudioDataUri("https://fal/x_video.mp4", deps("hello"));
    expect(out).toBe(`data:audio/mp4;base64,${Buffer.from("hello").toString("base64")}`);
  });

  it("ffmpeg 가 죽으면 null 이다 — 던지지 않는다", async () => {
    const out = await extractAudioDataUri("https://fal/x_video.mp4", {
      ...deps("hello"),
      runFfmpeg: async () => { throw new Error("ffmpeg exit 1"); },
    });
    expect(out).toBeNull();
  });

  it("상한을 넘으면 null 이다", async () => {
    const big = "a".repeat(AUDIO_DATA_URI_MAX);
    const out = await extractAudioDataUri("https://fal/x_video.mp4", deps(big));
    expect(out).toBeNull();
  });

  it("주소가 없으면 부르지 않는다", async () => {
    let called = false;
    const out = await extractAudioDataUri("", { ...deps("x"), runFfmpeg: async () => { called = true; } });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it("임시 폴더는 실패해도 지운다", async () => {
    let removed = false;
    await extractAudioDataUri("https://fal/x_video.mp4", {
      ...deps("hello"),
      rmImpl: async () => { removed = true; },
      runFfmpeg: async () => { throw new Error("boom"); },
    });
    expect(removed).toBe(true);
  });
});
