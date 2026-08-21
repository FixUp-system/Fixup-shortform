// 단계 표는 하나다 — 스테퍼·라우팅 가드·현재단계가 모두 이것을 본다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_STEPS, reelStepHref, isReelClipStale } from "../lib/reel/steps.js";

describe("순수 규율", () => {
  it("import 문이 없다", () => {
    expect(readFileSync("lib/reel/steps.js", "utf8")).not.toMatch(/^import /m);
  });
});

describe("표", () => {
  it("여섯 단계이고 목소리가 없다 — 클립이 직접 말한다", () => {
    expect(REEL_STEPS.map((s) => s.key)).toEqual([
      "material", "scenario", "images", "prompts", "video", "done",
    ]);
  });

  it("영상 프롬프트가 이미지와 영상 사이다 — 굽기 전이라 고치는 것이 공짜다", () => {
    const keys = REEL_STEPS.map((s) => s.key);
    expect(keys.indexOf("prompts")).toBeGreaterThan(keys.indexOf("images"));
    expect(keys.indexOf("prompts")).toBeLessThan(keys.indexOf("video"));
  });

  it("표를 밖에서 못 고친다", () => {
    expect(Object.isFrozen(REEL_STEPS)).toBe(true);
    expect(Object.isFrozen(REEL_STEPS[0])).toBe(true);
  });
});

describe("주소", () => {
  it("프로젝트가 있으면 그 프로젝트의 화면이다", () => {
    expect(reelStepHref(REEL_STEPS[1], "pid")).toBe("/reel/pid/scenario");
  });

  it("프로젝트가 없으면 만들기 전 화면이다", () => {
    expect(reelStepHref(REEL_STEPS[0], null)).toBe("/reel/new");
  });
});

describe("클립 낡음", () => {
  it("굽을 때 쓴 프롬프트와 지금 프롬프트가 다르면 낡았다", () => {
    expect(isReelClipStale({ clip_prompt: "b", video: { url: "u", of: "a" } })).toBe(true);
  });

  it("같으면 안 낡았다 — LLM 이 매번 달라도 저장된 값을 본다", () => {
    expect(isReelClipStale({ clip_prompt: "a", video: { url: "u", of: "a" } })).toBe(false);
  });

  it("아직 안 구웠으면 낡을 것이 없다", () => {
    expect(isReelClipStale({ clip_prompt: "a" })).toBe(false);
  });
});
