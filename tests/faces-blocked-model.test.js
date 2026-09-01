// **얼굴을 무조건 막는 모델에서는 처음부터 얼굴 없이 그린다** (2026-09-01 사장님 지시).
//
// ★★★ 그전 설계는 "자연스럽게 먼저 써 보고 걸리면 낮춘다"(재시도 우선)였다. 거절이
//   0원이라 성립하던 순서인데, **2.5 에 대해서는 이제 결과를 안다** — 08-31 실측 5건이
//   전부 거절이었다(큰 얼굴 · 작게 · 단독 인물 카드 · 배경에 2% · 얼굴 없음만 통과).
//   알면서 시도하면 **판을 두 번 그린다($0.401 낭비 + 실패 한 번)**.
//
// ★★ 다른 모델까지 막지 않는다 — 그것이 이 파일의 절반이다.
//   · H3 는 **한 번도 안 재봤다**. 미리 막으면 되는 것까지 잃는다.
//   · 2.0 은 **얼굴 넷짜리 판을 실제로 통과**시켰다(78cc092e).
//   모르는 것과 되는 것을 아는 것과 같이 다루면 안 된다.
import { describe, it, expect } from "vitest";
import { blocksFacesInRefs, refAspectFor, clipProfileForProject } from "../lib/clip-limits.js";
import { buildStoryboardPrompt } from "../lib/reel/panels.js";

const GRID = { rows: 2, cols: 3, canvas: "1:1" };
const CUTS = [{ idx: 0, shows: "a young woman lifts the toast toward her mouth" }];
const proj = (model, extra = {}) => ({
  settings: { i2v_model: model, aspect_ratio: "9:16", resolution: "720p" },
  ...extra,
});

describe("얼굴을 막는 모델을 표가 안다", () => {
  it("★★★ 2.5 는 막는다 — 실측 5건", () => {
    expect(blocksFacesInRefs(proj("seedance-2.5"))).toBe(true);
  });

  it("★★ H3 는 **모른다** — 미검증이라 미리 막지 않는다", () => {
    expect(blocksFacesInRefs(proj("minimax-h3"))).toBe(false);
  });

  it("★★ 2.0 은 얼굴 든 판을 실제로 통과시켰다 — 막으면 되는 것을 잃는다", () => {
    expect(blocksFacesInRefs(proj("seedance-2.0"))).toBe(false);
  });

  it("★ 모르는 모델도 안 막는다", () => {
    expect(blocksFacesInRefs(proj("something-new"))).toBe(false);
    expect(blocksFacesInRefs({})).toBe(false);
  });
});

describe("판 지문이 그 표를 따른다", () => {
  it("★★★ 2.5 는 **거절당하기 전에** 이미 얼굴을 뺀다", () => {
    const out = buildStoryboardPrompt(proj("seedance-2.5"), CUTS, GRID, "", []);
    expect(out, "판을 두 번 그리게 된다").toMatch(/face cropped outside the frame/);
  });

  it("★★ H3 는 예전 그대로다 — 처음에는 자연스럽게 쓴다", () => {
    const out = buildStoryboardPrompt(proj("minimax-h3"), CUTS, GRID, "", []);
    expect(out).not.toMatch(/face cropped outside the frame/);
  });

  it("★★ H3 도 **한 번 거절당하면** 그때부터 뺀다 — 재시도 길은 그대로 산다", () => {
    const out = buildStoryboardPrompt(proj("minimax-h3", { reel: { face_safe: true } }), CUTS, GRID, "", []);
    expect(out).toMatch(/face cropped outside the frame/);
  });
});

describe("판 비율 — 2.5 도 걸린다", () => {
  // 1행×5열 · 9:16 = 2.8125. 실측: 2.5 가 그 판을 **초상 문구로** 거절했고,
  // 컷만 4개(2×2 · 0.56)로 줄이자 통과했다.
  it("★★★ 2.5 에 한계가 생겼다 — 그래서 5컷이 후보에서 빠진다", () => {
    expect(refAspectFor(clipProfileForProject(proj("seedance-2.5")))).toEqual({ min: 0.4, max: 2.5 });
  });
});
