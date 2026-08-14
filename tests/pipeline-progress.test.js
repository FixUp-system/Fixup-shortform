import { describe, it, expect } from "vitest";
import { withProgress } from "../lib/pipeline.js";

// 단계별 끝남 판정 자체는 lib/progress.js 의 몫이다(tests/progress.test.js).
// 여기서는 그 판정을 문서 하나의 표식으로 접는 자리만 본다.
describe("심장박동 표식", () => {
  it("끝난 컷을 세어 done/total 을 적는다", () => {
    const proj = { cuts: [
      { idx: 0, image: { url: "a" } },
      { idx: 1, source: "photo" },
      { idx: 2 },
    ] };
    expect(withProgress(proj, "images", 111).progress)
      .toEqual({ at: 111, phase: "images", done: 2, total: 3 });
  });

  it("단계마다 다른 자로 센다", () => {
    const proj = { cuts: [{ idx: 0, audio: {} }, { idx: 1, voice_error: "x" }, { idx: 2 }] };
    expect(withProgress(proj, "voice", 1).progress.done).toBe(2);
    // 같은 컷을 영상 단계로 세면 하나도 안 끝난 것이다
    expect(withProgress(proj, "video", 1).progress.done).toBe(0);
  });

  it("모르는 단계는 던지지 않고 0 으로 센다", () => {
    expect(withProgress({ cuts: [{ idx: 0, image: {} }] }, "render", 1).progress)
      .toEqual({ at: 1, phase: "render", done: 0, total: 1 });
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
