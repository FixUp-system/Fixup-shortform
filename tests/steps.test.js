import { describe, it, expect } from "vitest";
import { STEPS, currentStepKey, isReachable, stepFromPathname, stepHref } from "../lib/steps.js";

describe("단계 정의", () => {
  it("로드맵 확정 순서를 따른다", () => {
    expect(STEPS.map((s) => s.key)).toEqual(["material", "script", "voice", "images", "video", "done"]);
  });

  it("stepHref는 1단계만 프로젝트 없이 열린다", () => {
    const [material, script] = STEPS;
    expect(stepHref(material, null)).toBe("/create");
    expect(stepHref(script, null)).toBeNull();
    expect(stepHref(script, "abc")).toBe("/create/abc/script");
  });
});

describe("stepFromPathname", () => {
  it("단계 경로를 그 단계로 읽는다", () => {
    expect(stepFromPathname("/create/abc/script").key).toBe("script");
    expect(stepFromPathname("/create/abc/images").key).toBe("images");
    expect(stepFromPathname("/create").key).toBe("material");
  });
  it("프로젝트 인덱스는 단계 미상 — ①자료로 오인하지 않는다", () => {
    // seg 없이 STEPS를 찾으면 seg:null인 자료가 매칭돼 가드가 통째로 무력화됐던 자리
    expect(stepFromPathname("/create/abc")).toBeUndefined();
  });
  it("모르는 경로는 undefined", () => {
    expect(stepFromPathname("/costs")).toBeUndefined();
    expect(stepFromPathname("/create/abc/없는단계")).toBeUndefined();
    expect(stepFromPathname("")).toBeUndefined();
  });
});

describe("currentStepKey", () => {
  it("프로젝트가 없으면 자료 단계", () => {
    expect(currentStepKey(null)).toBe("material");
  });
  it("대본 생성 전·후 모두 대본 단계", () => {
    expect(currentStepKey({ status: "draft" })).toBe("script");
    expect(currentStepKey({ status: "script" })).toBe("script");
  });
  it("컷이 시작되면 이미지 단계", () => {
    expect(currentStepKey({ status: "cuts" })).toBe("images");
  });
});

describe("isReachable", () => {
  it("자료 단계는 언제나 열려 있다", () => {
    expect(isReachable("material", null)).toBe(true);
  });
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script" };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "cuts" };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
});
