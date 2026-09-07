// 단계별 영상에서 1080p 를 뺀다 — 2026-09-07 사장님 지시.
//
// ★ "기본" 은 이 저장소에서 **모델 등급 이름**이다 — `label: "기본"` 인 것은
//   `seedance-2.0` 이고 주석이 "단계별의 기본"이라고 못 박아 두었다(lib/clip-limits.js).
//   그리고 `clip-limits` 에서 1080p 를 여는 프로필은 **그 하나뿐**이다.
//
// ★ 축이 갈려 있다 — **광고는 영향받지 않는다.** 광고의 해상도 목록은
//   `lib/ad/models.js` 의 독립된 표이고 거기 1080p 는 가격까지 붙어 있다(관리자 전용).
//   그래서 이 판은 clip 축만 잰다.
//
// ★ 옛 프로젝트가 안 깨진다 — `resolutionForProject` 는 **목록 밖 저장값을 그 모델의
//   기본으로 떨어뜨린다**(2026-08-31 에 그렇게 고쳐 두었다). 실측으로 프로덕션에
//   1080p 로 저장된 프로젝트는 **0건**이지만, 그래도 떨어지는 자리를 판으로 잡아 둔다.
import { describe, it, expect } from "vitest";
import { resolutionsForModel, resolutionForProject, defaultResolutionForModel } from "../lib/clip-limits";

describe("단계별 — 1080p 를 안 연다", () => {
  it("★ 기본 모델(seedance-2.0)의 화질 목록에 1080p 가 없다", () => {
    expect(resolutionsForModel("seedance-2.0")).not.toContain("1080p");
  });

  it("480p·720p 는 그대로다 — 고를 것을 통째로 없애는 것이 아니다(회귀 방어)", () => {
    expect(resolutionsForModel("seedance-2.0")).toEqual(["480p", "720p"]);
  });

  it("기본 화질은 여전히 720p 다", () => {
    expect(defaultResolutionForModel("seedance-2.0")).toBe("720p");
  });

  it("★ clip 축의 **어느 모델도** 1080p 를 안 연다", () => {
    for (const id of ["seedance-2.0", "seedance-2.5", "minimax-h3", "kling-v3"]) {
      expect(resolutionsForModel(id), `${id} 가 1080p 를 연다`).not.toContain("1080p");
    }
  });

  it("★ 1080p 로 저장된 옛 프로젝트는 720p 로 떨어진다 — 깨지지 않는다", () => {
    const old = { settings: { i2v_model: "seedance-2.0", resolution: "1080p" } };
    expect(resolutionForProject(old)).toBe("720p");
  });
});
