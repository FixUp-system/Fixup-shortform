// reel 도 **모델을 고른다** — 광고 화면과 같은 모양으로(2026-08-25 사장님 지시:
// "광고 영상에 맞추서 사이즈 칩이랑 모델 선택 칩 구성해줘. 모델선택은 똑같이 2.5는
// 프로 이상만 접근가능하도록").
//
// ★★ 그전에는 reel 에 모델 칸이 **아예 없었다.** 서버가 i2v_model 을 박아 버렸다
//   ("반영이 안 된다"가 아니라 고를 자리가 없었던 것이다).
//
// ★★★ **지금은 2.5 를 안 연다**(사장님이 B 를 골랐다). 배선은 다 깔되 목록에서 뺀다.
//   여는 조건이 넷인데 그중 정가가 사장님 결정 대기다:
//     ① CLIP_PROFILES 에 2.5 프로필(speaks·min·max·resolutions)
//     ② ONESHOT_MAX_SECONDS 를 모델이 정하게(2.5 는 30초)
//     ③ 2.5 는 컷 최소가 15초다 — 컷별로 떨어지면 3컷에 45초를 굽는다
//     ④ **VIDEO_PRICE 에 2.5 가 없다** — priceModel 이 조용히 kling-v3 값으로 떨어져
//        $13.87 굽고 50크레딧을 받는다. 이것이 열기 전에 반드시 정해야 할 값이다.
//   그래서 **화면에도 안 보이고 서버도 막는다** — 한쪽만 하면 이 저장소가 광고에서
//   실제로 겪은 사고(화면에서만 거르고 서버는 그대로 받아 API 로 뚫림)가 반복된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_MODEL_IDS, reelModelsForTier, isReelModel } from "../lib/clip-limits.js";
import { TIERS } from "../lib/tiers.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (p) => strip(readFileSync(p, "utf8"));

describe("reel 이 여는 모델", () => {
  it("★ 지금은 Seedance 2.0 하나다 — 2.5 는 아직 안 연다", () => {
    expect(REEL_MODEL_IDS).toEqual(["seedance-2.0"]);
  });

  it("★★ Kling v3 는 안 연다 — speaks:false 라 대사가 통째로 사라진다", () => {
    expect(REEL_MODEL_IDS).not.toContain("kling-v3");
    expect(isReelModel("kling-v3")).toBe(false);
  });

  it("등급이 더 열어 주지 못한다 — 프로도 2.5 를 못 고른다(아직)", () => {
    for (const t of TIERS) {
      const ids = reelModelsForTier(t.id).map((m) => m.id);
      expect(ids, `${t.id} 등급에 안 여는 모델이 있다`).toEqual(["seedance-2.0"]);
    }
  });

  it("등급이 모르는 값이어도 던지지 않는다 — 화면이 부르는 자리다", () => {
    expect(reelModelsForTier(undefined).map((m) => m.id)).toEqual(["seedance-2.0"]);
    expect(reelModelsForTier("없는등급").map((m) => m.id)).toEqual(["seedance-2.0"]);
  });

  it("고르는 값에는 라벨이 있다 — 칩에 쓴다", () => {
    for (const m of reelModelsForTier("pro")) {
      expect(m.label, `${m.id} 에 라벨이 없다`).toBeTruthy();
    }
  });
});

describe("배선 — 화면과 서버가 같은 판정을 본다", () => {
  it("화면이 등급으로 목록을 그린다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw).toContain("reelModelsForTier");
    expect(nw).toContain("useMe");
  });

  it("★ 라우트가 고른 값을 받고 **막는다** — 화면 필터는 가림막일 뿐이다", () => {
    const route = read("app/api/reel/route.js");
    expect(route).toContain("isReelModel");
    expect(route).toContain("tierAllowsModel");
    // 박아 넣던 옛 줄이 남아 있으면 고른 값이 조용히 버려진다.
    expect(route, "모델을 아직 박아 넣는다").not.toContain("i2v_model: DEFAULT_I2V_MODEL");
  });

  it("길이·화질이 **고른 모델**에서 나온다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw).toContain("secondsForModel(model)");
    expect(nw).toContain("resolutionsForModel(model)");
  });
});
