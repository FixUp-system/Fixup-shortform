// ⚠️⚠️ 2026-09-01 — **단계별의 기본이 H3 → 2.0 으로 바뀌었다**(사장님 지시).
//   08-31 에는 H3 가 기본이었다. 그날 실측이 뒤집었다: 2.5 는 참조 이미지에 얼굴이
//   있으면 **아홉 번 전부 거절**했고, 2.0 은 **같은 판을 첫 시도에 통과**시켰다.
//   브이로그처럼 인물이 주인공인 영상은 판에 얼굴이 있어야 하는데 그 조건을
//   만족하는 모델이 2.0 뿐이었다.
//   ★ **원클릭은 안 바뀐다** — 그쪽 기본은 여전히 H3 다(표가 다르다).
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
import { REEL_MODEL_IDS, reelModelsForTier, reelAllowsModel, isReelModel } from "../lib/clip-limits.js";
import { TIERS } from "../lib/tiers.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (p) => strip(readFileSync(p, "utf8"));

describe("reel 이 여는 모델", () => {
  // ★★ 2026-08-31 — **기본(H3)이 들어오고 2.0 이 빠졌다**(사장님 지시). 위 머리말의 조건
  //   넷을 H3 에 대해 이번에 다 채웠다(프로필·통짜 상한·컷 최소·정가).
  //   2.0 을 뺀 것은 **고르는 자리에서만**이다 — 이미 2.0 으로 만든 문서는 그대로 돈다.
  it("★ 기본(2.0)과 프로(2.5) 둘이다 — 기본이 앞이다", () => {
    expect(REEL_MODEL_IDS).toEqual(["seedance-2.0", "seedance-2.5"]);
  });

  it("★★ Kling v3 는 안 연다 — speaks:false 라 대사가 통째로 사라진다", () => {
    expect(REEL_MODEL_IDS).not.toContain("kling-v3");
    expect(isReelModel("kling-v3")).toBe(false);
  });

  it("★ 기본 등급은 기본(2.0)만 — 프로(2.5)는 프로 등급부터다", () => {
    expect(reelModelsForTier("basic").map((m) => m.id)).toEqual(["seedance-2.0"]);
  });

  it("★ 프로는 둘 다 고른다", () => {
    expect(reelModelsForTier("pro").map((m) => m.id)).toEqual(["seedance-2.0", "seedance-2.5"]);
  });

  it("등급이 모르는 값이면 기본 등급으로 본다 — 던지지 않는다(화면이 부르는 자리다)", () => {
    expect(reelModelsForTier(undefined).map((m) => m.id)).toEqual(["seedance-2.0"]);
    expect(reelModelsForTier("없는등급").map((m) => m.id)).toEqual(["seedance-2.0"]);
  });

  it("★ 등급 표와 갈리지 않는다 — 프로가 여는 것 중 reel 이 여는 것만 나온다", () => {
    for (const t of TIERS) {
      const ids = reelModelsForTier(t.id).map((m) => m.id);
      for (const id of ids) {
        expect(t.models, `${t.id} 등급이 ${id} 를 안 여는데 나온다`).toContain(id);
        expect(REEL_MODEL_IDS, `reel 이 ${id} 를 안 여는데 나온다`).toContain(id);
      }
    }
  });

  it("고르는 값에는 라벨이 있다 — 칩에 쓴다", () => {
    for (const m of reelModelsForTier("pro")) {
      expect(m.label, `${m.id} 에 라벨이 없다`).toBeTruthy();
    }
  });
});

// ★★★ 2026-09-02 — **원클릭의 은퇴 표시가 단계별을 막았다.**
//
// 08-31 에 2.0 을 **원클릭 표**(AD_MODELS)에서 `hidden: true` 로 은퇴시켰다(480p 에서 캔
// 로고의 폰트가 바뀌고 바벨이 몸을 통과했다). 09-01 에는 **단계별** 기본을 2.5 → 2.0 으로
// 바꿨다(2.5 가 얼굴 있는 참조를 아홉 번 전부 거절했고 2.0 은 첫 시도에 통과했다).
// 각각은 맞는 결정인데 **단계별 서버가 원클릭 표를 봤다** — tierAllowsModel 은 AD_MODELS 를
// 거르므로 은퇴 표시가 그대로 걸렸고, 그 표시는 등급·역할보다 강해서 **관리자도 못 뚫었다.**
// 결과: 단계별 영상을 **아무도** 못 만들었다(기본값을 그대로 두면 곧바로 403).
//
// 그래서 단계별은 **단계별 표로 판정한다** — 화면이 쓰는 reelModelsForTier 와 **같은 함수**다.
// 표가 둘인데 문이 하나면 반드시 갈린다(이 저장소의 "값이 사는 곳" 규율).
describe("단계별 게이트 — 화면과 서버가 같은 표를 본다", () => {
  it("★★★ 화면이 보여주는 모델은 서버가 반드시 통과시킨다 — 두 표가 갈리면 여기서 빨강", () => {
    for (const tier of [...TIERS.map((t) => t.id), undefined, "없는등급"]) {
      for (const m of reelModelsForTier(tier)) {
        expect(
          reelAllowsModel(tier, m.id),
          `${tier} 화면에 ${m.id} 가 보이는데 서버가 막는다`,
        ).toBe(true);
      }
    }
  });

  it("★★ 원클릭에서 은퇴시킨 2.0 이 단계별을 막지 않는다 — 이것이 09-02 의 버그였다", () => {
    expect(reelAllowsModel("basic", "seedance-2.0")).toBe(true);
    expect(reelAllowsModel("pro", "seedance-2.0")).toBe(true);
  });

  it("★ 2.5 는 프로부터다 — 기본 등급은 서버가 막는다(가림막이 아니라 잠금이다)", () => {
    expect(reelAllowsModel("basic", "seedance-2.5")).toBe(false);
    expect(reelAllowsModel("pro", "seedance-2.5")).toBe(true);
  });

  it("★★ 관리자는 등급을 안 탄다 — 원클릭 세 라우트와 **같은 축**이다", () => {
    expect(reelAllowsModel("basic", "seedance-2.5", { admin: true })).toBe(true);
    expect(reelModelsForTier("basic", { admin: true }).map((m) => m.id)).toEqual([...REEL_MODEL_IDS]);
  });

  it("★ reel 이 안 여는 모델은 **관리자도** 못 쓴다 — 통과시키면 값이 나간 뒤 fal 이 던진다", () => {
    expect(reelAllowsModel("pro", "kling-v3", { admin: true })).toBe(false);
    expect(reelAllowsModel("pro", "minimax-h3", { admin: true })).toBe(false);
    expect(reelAllowsModel("pro", "없는-모델", { admin: true })).toBe(false);
  });

  it("★ 기본값이 닫힌 쪽이다 — admin 을 안 넘기면 덜 열어 주는 방향으로 틀린다", () => {
    expect(reelAllowsModel("basic", "seedance-2.5")).toBe(false);
  });
});

describe("배선 — 화면과 서버가 같은 판정을 본다", () => {
  it("화면이 등급으로 목록을 그린다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw).toContain("reelModelsForTier");
    expect(nw).toContain("useMe");
  });

  // ★★ 2026-09-02 — 화면도 **같은 축**을 봐야 한다. 서버만 관리자를 통과시키면 운영자가
  //   자기 화면에서 그 모델을 고를 수가 없다(원클릭은 AdOptionTray 가 이미 넘긴다:
  //   `modelsForTier(tier, { admin })`). 안 넘기면 덜 열어 주는 쪽으로 조용히 틀린다.
  it("★ 화면도 관리자 축을 본다 — 원클릭(AdOptionTray)과 같은 모양이다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw, "관리자 인자를 안 넘긴다").toMatch(/reelModelsForTier\([^)]*admin/);
    expect(nw, "관리자 판정을 me 에서 읽지 않는다").toContain("isAdmin");
  });

  it("★ 라우트가 고른 값을 받고 **막는다** — 화면 필터는 가림막일 뿐이다", () => {
    const route = read("app/api/reel/route.js");
    expect(route).toContain("isReelModel");
    expect(route).toContain("reelAllowsModel");
    // ★★ 2026-09-02 — **원클릭 표로 판정하면 안 된다.** tierAllowsModel 은 AD_MODELS 를
    //   거르므로 원클릭에서 은퇴시킨 모델(2.0)이 단계별까지 막힌다. 그 표시는 등급·역할보다
    //   강해서 관리자도 못 뚫는다 — 실제로 단계별 생성이 통째로 막혔다.
    expect(route, "원클릭 표로 판정한다 — 은퇴 표시가 단계별을 막는다").not.toContain("tierAllowsModel");
    // ★ 관리자는 등급을 안 탄다 — 원클릭 세 라우트와 같은 축. 안 넘기면 조용히 닫힌 쪽으로 틀린다.
    expect(route, "관리자 인자를 안 넘긴다").toMatch(/reelAllowsModel\([^)]*admin/);
    // 박아 넣던 옛 줄이 남아 있으면 고른 값이 조용히 버려진다.
    expect(route, "모델을 아직 박아 넣는다").not.toContain("i2v_model: DEFAULT_I2V_MODEL");
  });

  it("길이·화질이 **고른 모델**에서 나온다", () => {
    const nw = read("app/reel/new/page.js");
    expect(nw).toContain("secondsForModel(model)");
    expect(nw).toContain("resolutionsForModel(model)");
  });
});
