// 광고 하위 단계 표 — lib/ad/steps.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_STEPS, adStepIndex } from "../lib/ad/steps.js";

describe("AD_STEPS", () => {
  it("네 단계를 status 키 그대로 갖는다 — draft·scenario·rendering·done", () => {
    expect(AD_STEPS.map((s) => s.key)).toEqual(["draft", "scenario", "rendering", "done"]);
  });

  it("import 문이 없다 — 화면이 이 파일을 읽어도 번들에 fs 가 안 섞여야 한다", () => {
    const src = readFileSync("lib/ad/steps.js", "utf8");
    // lib/ad/models.js·options.js 와 같은 규율. 주석에 "import"라는 낱말이 있어도
    // 실제 import 문(줄 시작이 import)만 판정한다.
    const importLines = src.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(importLines).toEqual([]);
  });

  it("시나리오 단계만 사람을 기다린다(waits) — 나머지 셋은 자동으로 흐른다", () => {
    const waiting = AD_STEPS.filter((s) => s.waits);
    expect(waiting.map((s) => s.key)).toEqual(["scenario"]);
  });

  it("href 를 두지 않는다 — 이동이 아니라 표시다", () => {
    for (const s of AD_STEPS) expect(s).not.toHaveProperty("href");
  });
});

describe("adStepIndex", () => {
  it("각 status 를 자기 자리로 판정한다", () => {
    expect(adStepIndex("draft")).toBe(0);
    expect(adStepIndex("scenario")).toBe(1);
    expect(adStepIndex("rendering")).toBe(2);
    expect(adStepIndex("done")).toBe(3);
  });

  it("모르는/없는 status 는 첫 단계(입력)로 떨어진다", () => {
    expect(adStepIndex(undefined)).toBe(0);
    expect(adStepIndex(null)).toBe(0);
    expect(adStepIndex("이상한값")).toBe(0);
  });
});
