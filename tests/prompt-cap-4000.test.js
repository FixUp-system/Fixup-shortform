// **영상 프롬프트 상한 2000 → 4000** (2026-09-22).
//
// ★ 시나리오가 만드는 통짜 프롬프트가 이미 2,000자를 넘었다(실측 2,065~2,224자). 처음 굽기는
//   길이 검사가 없는데 고치는 문만 이 값을 봐서, 넘은 프롬프트는 한 글자를 고쳐도 400 이었다.
import { describe, it, expect } from "vitest";
import { LEDGER_PROMPT_MAX } from "../lib/costs.js";

describe("영상 프롬프트 상한", () => {
  it("★★★ 4000자다", () => {
    expect(LEDGER_PROMPT_MAX).toBe(4000);
  });
  it("★★ 09-22 에 실제로 막히던 길이(2,224자)가 들어간다 — 여유를 두고", () => {
    expect(2224 * 1.5).toBeLessThan(LEDGER_PROMPT_MAX);
  });
});
