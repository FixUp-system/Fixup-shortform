import { describe, it, expect } from "vitest";
import { withProgress } from "../lib/pipeline.js";

describe("심장박동 표식", () => {
  it("이미지 단계는 그림이 있거나 내 사진인 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [
      { idx: 0, image: { url: "a" } },
      { idx: 1, source: "photo" },
      { idx: 2 },
    ] };
    expect(withProgress(proj, "images", 111).progress)
      .toEqual({ at: 111, phase: "images", done: 2, total: 3 });
  });

  it("목소리 단계는 낭독이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [{ idx: 0, audio: {} }, { idx: 1, voice_error: "x" }, { idx: 2 }] };
    expect(withProgress(proj, "voice", 1).progress.done).toBe(2);
  });

  it("영상 단계는 클립이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    const proj = { cuts: [{ idx: 0, video: {} }, { idx: 1, video_error: "x" }, { idx: 2 }] };
    expect(withProgress(proj, "video", 1).progress.done).toBe(2);
  });

  it("원래 문서를 안 건드린다 — 새 객체를 돌려준다", () => {
    const proj = { cuts: [], status: "images" };
    const next = withProgress(proj, "images", 5);
    expect(proj.progress).toBeUndefined();
    expect(next.status).toBe("images");
  });

  it("컷이 없어도 안 던진다", () => {
    expect(withProgress({}, "images", 7).progress).toEqual({ at: 7, phase: "images", done: 0, total: 0 });
  });
});
