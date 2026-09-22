// **유료 재생성은 횟수로 막지 않는다** (2026-09-22 사장님 결정 — "재생성하면 크레딧을 또 받으면 된다").
//
// ★ 3회 상한에 걸려 "영상 다시 만들기"가 진행되지 않았다. 회차마다 값을 받는 자리라 횟수로
//   막을 이유가 없다. 다만 **값을 안 받는** 시나리오 다시 쓰기는 3회로 남긴다 — 풀면 LLM 이
//   무제한 무료가 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_REGEN_PER_CUT, MAX_SCENARIO_REWRITES, MAX_SCENARIO_TRIES, regenCountText, regenPrice,
} from "../lib/pricing.js";
import { MAX_REEL_IMAGE_TRIES, imageTriesLeft, imageTriesLeftLifetime, canDrawReelImages } from "../lib/reel/doc.js";

describe("상한", () => {
  it("★★★ 유료 재생성은 무제한이다", () => {
    expect(MAX_REGEN_PER_CUT).toBe(Infinity);
    expect(MAX_REEL_IMAGE_TRIES).toBe(Infinity);
  });
  it("★★★ 무료인 시나리오 다시 쓰기는 3회 그대로다", () => {
    expect(MAX_SCENARIO_REWRITES).toBe(3);
    expect(MAX_SCENARIO_TRIES).toBe(4);
  });
  it("★★ 스토리보드 다시 그리기가 몇 번째든 열려 있다", () => {
    const reel = { imageTries: 50, imageTriesTotal: 200 };
    expect(imageTriesLeft(reel) > 0).toBe(true);
    expect(imageTriesLeftLifetime(reel) > 0).toBe(true);
    expect(canDrawReelImages(reel)).toBe(true);
  });
  it("★★ 상한이 없어도 값은 그대로 받는다 — 첫 회만 무료", () => {
    expect(regenPrice("image", 0)).toBe(0);
    expect(regenPrice("image", 7)).toBeGreaterThan(0);
  });
});

describe("화면 표시 — 'Infinity' 가 박히면 안 된다", () => {
  it("★★★ 무제한이면 횟수만 말한다", () => {
    expect(regenCountText(2)).toBe("2회");
    expect(regenCountText(undefined)).toBe("0회");
  });

  const screens = [
    "app/create/[id]/images/page.js",
    "app/create/[id]/video/page.js",
    "app/create/[id]/voice/page.js",
    "app/reel/[id]/video/page.js",
  ];
  for (const f of screens) {
    it(`★★ ${f} 는 '/{MAX_REGEN_PER_CUT}' 를 직접 그리지 않는다`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/\}\/\{MAX_REGEN_PER_CUT\}|\}\/\$\{MAX_REGEN_PER_CUT\}/);
    });
  }
  it("★★ ③이미지(단계별 스토리보드)는 남은 횟수가 유한할 때만 적는다", () => {
    expect(readFileSync("app/reel/[id]/images/page.js", "utf8")).toMatch(/Number\.isFinite\(triesLeft\)/);
  });
});
