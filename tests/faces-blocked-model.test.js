// **얼굴을 무조건 막는 모델이 지금은 하나도 없다** (2026-09-03 사장님 지시로 뒤집힘).
//
// ★★★ 이 파일은 원래 "2.5 는 얼굴을 무조건 막는다"를 지켰다. 근거는 08-31~09-01 실측
//   (5건 → 8건 전부 거절)이었는데, **그 실측은 격자 방식이 틀렸던 것이다**:
//     · 그때: 판 전체 · 27×27 · 2px · **시안 반투명** → 전부 거절
//     · 09-03: **얼굴에만 · 흰색 · 불투명 10×10** → **2.0 과 2.5 둘 다 통과**
//   그래서 `facesInRefs: false` 를 걷어냈고, 얼굴은 굽기 직전에 코드가 가린다
//   (lib/reel/face-grid.js). 이 파일이 지금 지키는 것은 **그 뒤집힘 자체**다 —
//   되돌리려면 격자 배선을 함께 봐야 한다는 사실을 판으로 남긴다.
// ★ 재시도 길(reel.face_safe)은 **그대로 산다** — 격자로도 안 되는 편이 나오면 그때
//   얼굴을 낮춰 다시 그린다. 두 겹이지 한 겹이 아니다.
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
  it("★★★ 2.5 도 이제 안 막는다 — 격자로 통과시킨다(09-03 실측)", () => {
    expect(blocksFacesInRefs(proj("seedance-2.5"))).toBe(false);
  });

  // ★ 지금은 **어느 모델도** 무조건 막지 않는다. 다시 막는 모델이 생기면 그 자리에
  //   격자 배선(lib/reel/face-grid.js)이 왜 안 통했는지도 함께 적어야 한다.
  it("★★ 무조건 막는 모델이 하나도 없다", () => {
    for (const m of ["seedance-2.5", "seedance-2.0", "minimax-h3"]) {
      expect(blocksFacesInRefs(proj(m)), `${m} 이 막는다`).toBe(false);
    }
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
  it("★★★ 2.5 도 이제 **얼굴을 그대로 그린다** — 가리는 일은 격자가 한다", () => {
    const out = buildStoryboardPrompt(proj("seedance-2.5"), CUTS, GRID, "", []);
    expect(out, "아직도 판에서 얼굴을 빼고 있다").not.toMatch(/face cropped outside the frame/);
  });

  it("★★ 그래도 **한 번 거절당하면** 그때는 뺀다 — 재시도 길은 살아 있다", () => {
    const out = buildStoryboardPrompt(proj("seedance-2.5", { reel: { face_safe: true } }), CUTS, GRID, "", []);
    expect(out).toMatch(/face cropped outside the frame/);
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
