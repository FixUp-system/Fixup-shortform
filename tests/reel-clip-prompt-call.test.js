// fable 호출 — stage 를 말하고, 가짜 모드가 이 단계의 모양을 준다.
import { describe, it, expect } from "vitest";
import { writeClipPromptBody } from "../lib/reel/clip-prompt.js";

const cut = { idx: 0, shows: "a mug on a wooden desk" };
const project = { settings: {}, scenario: {} };

describe("writeClipPromptBody", () => {
  it("stage 를 영상프롬프트로 부른다", async () => {
    let seen = null;
    await writeClipPromptBody(cut, project, {
      callJsonImpl: async (args) => { seen = args; return { body: "b" }; },
    });
    expect(seen.stage).toBe("영상프롬프트");
  });

  it("이 단계의 가짜 응답을 넘긴다 — 광고 시나리오가 아니다", async () => {
    let seen = null;
    await writeClipPromptBody(cut, project, {
      callJsonImpl: async (args) => { seen = args; return { body: "b" }; },
    });
    expect(typeof seen.fake).toBe("function");
    expect(seen.fake()).toHaveProperty("body");
  });

  it("자기 스키마를 넘긴다 — SCENARIO_SCHEMA 가 아니다", async () => {
    let seen = null;
    await writeClipPromptBody(cut, project, {
      callJsonImpl: async (args) => { seen = args; return { body: "b" }; },
    });
    expect(seen.schema.required).toEqual(["body"]);
    expect(seen.schema.additionalProperties).toBe(false);
  });

  it("본문 문자열을 돌려준다", async () => {
    const out = await writeClipPromptBody(cut, project, {
      callJsonImpl: async () => ({ body: "  the mug sits still  " }),
    });
    expect(out).toBe("the mug sits still");
  });

  it("본문이 비면 던진다 — 빈 프롬프트로 값을 치르지 않는다", async () => {
    await expect(
      writeClipPromptBody(cut, project, { callJsonImpl: async () => ({ body: "   " }) })
    ).rejects.toThrow(/영상 프롬프트/);
  });

  it("body 가 아예 없어도 던진다", async () => {
    await expect(
      writeClipPromptBody(cut, project, { callJsonImpl: async () => ({}) })
    ).rejects.toThrow(/영상 프롬프트/);
  });
});
