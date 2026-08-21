// 컷마다 프롬프트를 만들어 **문서에 저장한다** — 저장이 각인의 근거다.
import { describe, it, expect } from "vitest";
import { runReelPrompts } from "../lib/reel/pipeline.js";

function fixture() {
  const doc = {
    id: "pid",
    settings: { i2v_model: "seedance-2.0" },
    scenario: { environment: "a sunlit kitchen counter" },
    cuts: [
      { idx: 0, shows: "a hand reaching for the kettle" },
      { idx: 1, shows: "a mug on a wooden desk" },
    ],
  };
  return {
    doc,
    getProject: async () => doc,
    updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
  };
}

describe("runReelPrompts", () => {
  it("컷마다 본문을 저장한다", async () => {
    const f = fixture();
    await runReelPrompts("pid", "uid", {
      ...f,
      writeBody: async (cut) => `body for cut ${cut.idx}`,
    });
    expect(f.doc.cuts.map((c) => c.clip_prompt)).toEqual(["body for cut 0", "body for cut 1"]);
  });

  it("컷 순번과 앞 컷을 넘긴다", async () => {
    const f = fixture();
    const seen = [];
    await runReelPrompts("pid", "uid", {
      ...f,
      writeBody: async (cut, _project, opts) => { seen.push(opts); return "b"; },
    });
    expect(seen[0].sceneNo).toBe(1);
    expect(seen[0].sceneCount).toBe(2);
    expect(seen[0].prevShows).toBe("");
    expect(seen[1].sceneNo).toBe(2);
    expect(seen[1].prevShows).toBe("a hand reaching for the kettle");
  });

  it("이미 있는 프롬프트는 다시 만들지 않는다 — 각인이 흔들리면 산 클립이 낡는다", async () => {
    const f = fixture();
    f.doc.cuts[0].clip_prompt = "kept";
    let calls = 0;
    await runReelPrompts("pid", "uid", {
      ...f,
      writeBody: async () => { calls += 1; return "new"; },
    });
    expect(f.doc.cuts[0].clip_prompt).toBe("kept");
    expect(calls).toBe(1);
  });

  it("only 를 주면 그 컷만 다시 만든다", async () => {
    const f = fixture();
    f.doc.cuts[0].clip_prompt = "old0";
    f.doc.cuts[1].clip_prompt = "old1";
    await runReelPrompts("pid", "uid", {
      ...f, only: [1],
      writeBody: async (cut) => `fresh ${cut.idx}`,
    });
    expect(f.doc.cuts[0].clip_prompt).toBe("old0");
    expect(f.doc.cuts[1].clip_prompt).toBe("fresh 1");
  });

  it("컷이 없으면 던진다", async () => {
    const f = fixture();
    f.doc.cuts = [];
    await expect(
      runReelPrompts("pid", "uid", { ...f, writeBody: async () => "b" })
    ).rejects.toThrow(/컷/);
  });
});
