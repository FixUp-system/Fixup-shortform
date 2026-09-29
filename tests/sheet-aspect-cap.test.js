// **스토리보드 판에도 가로세로 한계가 있다** (2026-09-29 실측).
//
// ★★★ 사장님 신고 — 백설공주 편(장면 7개 · 480p · 9:16)이 그림 단계에서 죽었다:
//   `422 · loc:["body","image_size"]` ·
//   *"Requested image_size aspect ratio 3.93:1 exceeds the maximum supported 3:1."*
//   7 은 소수라 격자가 **1행 7열**밖에 없고, 그 판은 (7×9)/(1×16) = **3.94:1** 이다.
//
// ★★ 우리는 상한을 **둘만** 보고 있었다: 판 긴 변(STORYBOARD_MAX_SIDE)과 영상 모델의
//   참조 비율(refAspect). **그림 모델 자신의 한계(1:3~3:1)는 아무도 안 봤다** —
//   그래서 480p 에서 7 이 "쓸 수 있는 컷 수"로 시나리오에 권해졌고, 그 시나리오가
//   그림 단계에서 죽었다(시나리오·캐스팅 값은 이미 치른 뒤다).
// ★ 고치는 자리는 **격자를 고르는 한 곳**이다 — 그러면 컷 수 목록(reelCutChoicesFor)도
//   함께 고쳐진다. 두 곳에 적으면 언젠가 갈린다.
import { describe, it, expect } from "vitest";
import {
  reelGridFor, reelCutChoicesFor, sheetAspectFor, SHEET_MAX_ASPECT,
} from "../lib/reel/scenario-rules.js";

const at = (n, resolution = "480p") => reelGridFor(n, { resolution, aspect: "9:16" });

describe("판 비율 상한", () => {
  it("★★★ 그림 모델의 한계와 같은 값이다(3:1)", () => {
    expect(SHEET_MAX_ASPECT).toBe(3);
  });

  it("★★★ 7컷 480p — 1행 7열(3.94:1)은 이제 안 고른다", () => {
    expect(at(7)).toBe(null);
  });

  it("★★ 5컷은 그대로 된다 — 2.81:1 이라 한계 안이다(이미 만들어 본 편들이 이 모양)", () => {
    const g = at(5);
    expect(g).toEqual(expect.objectContaining({ rows: 1, cols: 5 }));
    expect(sheetAspectFor(g, "9:16")).toBeCloseTo(2.8125, 3);
  });

  it("★★ 고를 수 있는 컷 수에서 7이 빠진다 — 애초에 안 권한다", () => {
    const choices = reelCutChoicesFor("480p", "9:16");
    expect(choices).not.toContain(7);
    expect(choices).toContain(6);
    expect(choices).toContain(8);
  });

  it("★★ 세로로 긴 판도 같은 한계다 — 1:3 보다 길쭉하면 안 된다", () => {
    for (let n = 3; n <= 40; n++) {
      for (const aspect of ["9:16", "16:9", "1:1"]) {
        const g = reelGridFor(n, { resolution: "480p", aspect });
        if (!g) continue;
        const r = sheetAspectFor(g, aspect);
        expect(r <= SHEET_MAX_ASPECT && r >= 1 / SHEET_MAX_ASPECT, `${n}컷 ${aspect} → ${r}`).toBe(true);
      }
    }
  });

  it("★ 720p 는 예전 그대로다 — 거기서는 긴 변 상한이 먼저 막고 있었다", () => {
    expect(reelGridFor(7, { resolution: "720p", aspect: "9:16" })).toBe(null);
    expect(reelGridFor(6, { resolution: "720p", aspect: "9:16" })).toEqual(
      expect.objectContaining({ rows: 2, cols: 3 })
    );
  });
});
