// 가격표(파는 값)와 예산 안전핀(우리 지갑)이 어긋나면 산 영상이 중간에 죽는다.
// 실제로 그랬다 — 60초를 100크레딧에 팔면서 프로젝트 상한은 $5 였다(원가 ~$6.06).
//
// ★ 그래서 이 파일은 원가를 **손으로 적지 않는다.** 단가를 여기 베껴 두면 모델을 바꾸는 날
//   (FAL_I2V_ENDPOINT) 같은 결함이 그대로 재발하는데 테스트는 그린인 채다 — 가격표와 안전핀이
//   서로 모르는 것을 잡자던 테스트가 자기도 단가를 모르는 셈이 된다.
//   실물(PRICE_TABLE·활성 엔드포인트·클립 프로필)을 통해 잰다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FREE_TRIAL_USD, VIDEO_PRICE, MAX_REGEN_PER_CUT } from "../lib/pricing.js";
import { estimateCost } from "../lib/costs.js";
import { activeI2vEndpoint, activeClipProfile, minSecondsFor } from "../lib/clip-limits.js";
import { activeImageEndpoint } from "../lib/imagegen.js";

// LLM 만 손으로 든다 — 토큰 과금이라 PRICE_TABLE(단일 단가)에 없다. 편당 실측 ~$0.06.
const LLM_PER_VIDEO = 0.06;

// 최악의 컷 수 = 모델이 받는 **최소** 길이로 잘게 쪼갠 경우.
// 옛 가정 `seconds / 5` 는 최악을 과소평가했다 — Kling v3 는 3초까지 받아 60초가 20컷이다.
const worstCuts = (seconds) => Math.floor(seconds / minSecondsFor(activeClipProfile()));

// 컷 하나의 원가 = 클립(초당) + 이미지(장당). 둘 다 실물 단가표가 답한다.
const costPerCut = () =>
  estimateCost(activeI2vEndpoint(), minSecondsFor(activeClipProfile())) +
  estimateCost(activeImageEndpoint(), 1);

// 한 편의 기본 원가(최악의 컷 수 기준).
const costFor = (seconds) => LLM_PER_VIDEO + worstCuts(seconds) * costPerCut();

describe("체험 한도", () => {
  it("$0.50 다 — 편당 LLM 원가 ~$0.06 이니 대본 여덟 편쯤", () => {
    expect(FREE_TRIAL_USD).toBe(0.5);
  });

  it("편당 LLM 원가보다 넉넉하다 — 한 편도 못 만들면 체험이 아니다", () => {
    expect(FREE_TRIAL_USD).toBeGreaterThan(LLM_PER_VIDEO * 3);
  });
});

describe("예산 안전핀이 가격표를 견딘다", () => {
  // env 를 비워 기본값·기본 모델로 재고, 끝나면 되돌린다 — 다른 테스트가 값을 물려받으면 안 되고,
  // 머신마다 .env.local 이 달라 눈금·단가가 갈리면 안 된다.
  const saved = {};
  beforeEach(() => {
    for (const k of ["SHOTFORM_BUDGET_TOTAL_USD", "SHOTFORM_BUDGET_PROJECT_USD", "FAL_I2V_ENDPOINT", "FAL_IMAGE_ENDPOINT"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ★ 이 단정이 이번 결함을 다시 잡는다.
  it("가장 긴 영상의 원가가 프로젝트 상한 아래다", async () => {
    const { limitProject } = await import("../lib/costs.js");
    const longest = Math.max(...Object.keys(VIDEO_PRICE).map(Number));
    expect(costFor(longest)).toBeLessThan(limitProject());
  });

  it("재생성 최대치까지 얹어도 프로젝트 상한 아래다 — 재생성은 크레딧을 받고 하는 정상 사용이다", async () => {
    const { limitProject } = await import("../lib/costs.js");
    const longest = Math.max(...Object.keys(VIDEO_PRICE).map(Number));
    // 컷마다 MAX_REGEN_PER_CUT 회까지 다시 만들 수 있다(클립·이미지 둘 다 다시 나간다).
    const regenWorst = worstCuts(longest) * MAX_REGEN_PER_CUT * costPerCut();
    expect(costFor(longest) + regenWorst).toBeLessThan(limitProject());
  });

  it("전역 상한이 영상 여러 편을 견딘다 — 전 사용자 합계가 몇 편에서 멎으면 안 된다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal() / costFor(30)).toBeGreaterThan(50);
  });
});
