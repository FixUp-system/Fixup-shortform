// 굽기 — 컷 그림 + 참조를 r2v 로 보내고, 각인을 남긴다.
import { describe, it, expect } from "vitest";
import { runReelClips } from "../lib/reel/pipeline.js";

function fixture() {
  const doc = {
    id: "pid",
    settings: { i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
    scenario: { environment: "a sunlit kitchen counter" },
    cuts: [
      { idx: 0, shows: "a hand reaching for the kettle", clip_prompt: "body0", seconds: 4, image: { url: "https://x/c0.png" } },
      { idx: 1, shows: "a mug on a wooden desk", clip_prompt: "body1", seconds: 4, image: { url: "https://x/c1.png" } },
    ],
  };
  return {
    doc,
    getProject: async () => doc,
    updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
    loadRefs: async () => ({ refs: [{ url: "https://x/face.png" }], resolved: [], missing: 0 }),
  };
}

describe("runReelClips", () => {
  it("컷 그림과 참조를 함께 넘긴다", async () => {
    const f = fixture();
    const seen = [];
    await runReelClips("pid", "uid", {
      ...f,
      makeClip: async (args) => { seen.push(args); return { url: "https://x/v.mp4", seconds: 4 }; },
    });
    expect(seen[0].imageUrl).toBe("https://x/c0.png");
    expect(seen[0].refs).toEqual([{ url: "https://x/face.png" }]);
  });

  it("저장된 프롬프트를 본문으로 쓰고 컷 순번·참조 문구를 붙인다", async () => {
    const f = fixture();
    const seen = [];
    await runReelClips("pid", "uid", {
      ...f,
      makeClip: async (args) => { seen.push(args); return { url: "https://x/v.mp4", seconds: 4 }; },
    });
    expect(seen[1].prompt.startsWith("body1")).toBe(true);
    expect(seen[1].prompt).toContain("This is scene 2 of 2.");
    expect(seen[1].prompt).toContain("The attached images show what this scene");
    expect(seen[1].prompt).not.toContain("first frame");
  });

  it("각인은 그 컷의 저장된 프롬프트다", async () => {
    const f = fixture();
    await runReelClips("pid", "uid", {
      ...f, makeClip: async () => ({ url: "https://x/v.mp4", seconds: 4 }),
    });
    expect(f.doc.cuts[0].video.of).toBe("body0");
    expect(f.doc.cuts[1].video.of).toBe("body1");
  });

  it("프롬프트가 빈 컷이 있으면 아예 시작하지 않는다 — 값이 나가기 전에 막는다", async () => {
    const f = fixture();
    f.doc.cuts[1].clip_prompt = "";
    let calls = 0;
    await expect(
      runReelClips("pid", "uid", { ...f, makeClip: async () => { calls += 1; return {}; } })
    ).rejects.toThrow(/영상 프롬프트/);
    expect(calls).toBe(0);
  });

  it("그림이 없는 컷이 있으면 아예 시작하지 않는다", async () => {
    const f = fixture();
    f.doc.cuts[0].image = null;
    let calls = 0;
    await expect(
      runReelClips("pid", "uid", { ...f, makeClip: async () => { calls += 1; return {}; } })
    ).rejects.toThrow(/그림/);
    expect(calls).toBe(0);
  });
});
