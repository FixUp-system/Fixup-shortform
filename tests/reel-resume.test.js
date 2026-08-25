// 사이드바 「영상 만들기」 — **작업 중이던 프로젝트로 되돌아간다**(2026-08-25 사장님 지적).
//
// ★★ 사장님이 겪은 것: 시나리오까지 만들어 놓고 「영상 만들기」를 눌렀더니 진행 사항이
//   사라졌다. 링크가 `/reel/new` 고정이라 **새 프로젝트 화면**으로 갔기 때문이다.
//   (문서는 안 지워졌다 — 보관함에 그대로 있다. 다만 돌아갈 길이 사이드바에 없었다.)
//
// ★ 옆의 둘은 이미 이 규칙이다: makeHref(project) · makeAdHref(adProject).
//   reel 만 못 하던 이유는 프로젝트가 레이아웃 안에서만 살았기 때문인데,
//   오늘 공급자를 루트로 올리면서 그 이유가 사라졌다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_STEPS, currentReelStepKey, reelStepHref } from "../lib/reel/steps.js";
import { makeReelHref } from "../lib/reel/resume.js";

describe("makeReelHref — 이어서 할 곳", () => {
  it("프로젝트가 없으면 새로 시작 화면이다", () => {
    expect(makeReelHref(null)).toBe("/reel/new");
    expect(makeReelHref({})).toBe("/reel/new");
  });

  // ★★ 판정을 새로 만들지 않는다 — 지금 어느 단계인가는 currentReelStepKey 하나가 안다.
  //   화면이 손으로 세면 단계가 늘 때 여기만 낡는다.
  it("시나리오까지 했으면 그 다음 단계로 간다", () => {
    const project = { id: "abc", scenario: { text: "t" }, cuts: [{ idx: 0 }] };
    const key = currentReelStepKey(project);
    const step = REEL_STEPS.find((s) => s.key === key);
    expect(makeReelHref(project)).toBe(reelStepHref(step, "abc"));
  });

  it("갓 만든 프로젝트는 첫 단계로 간다", () => {
    const project = { id: "abc" };
    expect(makeReelHref(project)).toContain("/reel/abc/");
  });
});

describe("사이드바가 그것을 쓴다", () => {
  const src = readFileSync("components/Sidebar.jsx", "utf8");
  it("makeReelHref 를 부른다", () => {
    expect(src).toContain("makeReelHref");
  });
  it("/reel/new 를 손으로 박아 두지 않는다", () => {
    const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(clean).not.toMatch(/const makeReelHref = "\/reel\/new"/);
  });
});
