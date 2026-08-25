// 가격표(파는 값)와 예산 안전핀(우리 지갑)이 어긋나면 산 영상이 중간에 죽는다.
// 실제로 그랬다 — 60초를 100크레딧에 팔면서 프로젝트 상한은 $5 였다(원가 ~$6.06).
//
// ★ 그래서 이 파일은 원가를 **손으로 적지 않는다.** 단가를 여기 베껴 두면 모델을 바꾸는 날
//   (FAL_I2V_ENDPOINT) 같은 결함이 그대로 재발하는데 테스트는 그린인 채다 — 가격표와 안전핀이
//   서로 모르는 것을 잡자던 테스트가 자기도 단가를 모르는 셈이 된다.
//   실물(PRICE_TABLE·활성 엔드포인트·클립 프로필)을 통해 잰다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FREE_TRIAL_USD } from "../lib/pricing.js";
import { estimateCost } from "../lib/costs.js";
import { endpointForProject, clipProfileForProject, minSecondsFor } from "../lib/clip-limits.js";
import { activeImageEndpoint } from "../lib/imagegen.js";

// LLM 만 손으로 든다 — 토큰 과금이라 PRICE_TABLE(단일 단가)에 없다. 편당 실측 ~$0.06.
const LLM_PER_VIDEO = 0.06;

// ★ 모델이 **프로젝트마다** 다르다(i2v_model). 전역 "활성 엔드포인트"는 더 이상 없다.
// 여기서 재는 것은 **모델을 안 고른 프로젝트**, 즉 옛 프로젝트가 떨어지는 자리(Kling v3)다
// — 이 파일의 원래 사건(60초 한 편이 안전핀을 넘김)이 그 모델에서 났다.
const LEGACY_PROJECT = {}; // settings.i2v_model 없음 → LEGACY_I2V_MODEL(kling-v3)

// 최악의 컷 수 = 모델이 받는 **최소** 길이로 잘게 쪼갠 경우.
// 옛 가정 `seconds / 5` 는 최악을 과소평가했다 — Kling v3 는 3초까지 받아 60초가 20컷이다.
const worstCuts = (seconds) =>
  Math.floor(seconds / minSecondsFor(clipProfileForProject(LEGACY_PROJECT)));

// 컷 하나의 원가 = 클립(초당) + 이미지(장당). 둘 다 실물 단가표가 답한다.
const costPerCut = () =>
  estimateCost(
    endpointForProject(LEGACY_PROJECT),
    minSecondsFor(clipProfileForProject(LEGACY_PROJECT))
  ) + estimateCost(activeImageEndpoint(), 1);

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
    for (const k of ["SHOTFORM_BUDGET_TOTAL_USD", "FAL_I2V_ENDPOINT", "FAL_IMAGE_ENDPOINT"]) {
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

  // ★ 프로젝트 축은 사라졌다. 옛 상한($30)은 Seedance 60초 한 편($19.2)에 재생성 몇 번이면
  // 닿아 "돈은 있는데 못 만드는" 상태를 만들었다 — 요금은 크레딧이, 폭주 방어는 전역 상한이 맡는다.
  it("프로젝트 축은 사라졌다 — 폭주 방어는 전역 상한이 맡는다", async () => {
    const costs = await import("../lib/costs.js");
    expect(costs.limitProject).toBeUndefined();
  });

  it("전역 상한은 그대로다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal()).toBe(300);
  });

  // ⚠️ 2026-08-24 — 이 눈금이 **이미지 모델을 GPT Image 2 로 바꾸면서 움직였다.**
  //   장당 $0.08(nano 1K) → $0.401(GPT high) 이라 최악의 컷 수 기준 30초 한 편 원가가
  //   ~$5.9 → ~$6.6 이 됐고, $300 상한이 견디는 편수가 **50편 아래(실측 45.5편)** 로
  //   내려왔다. 이 테스트는 "몇 편에서 멎으면 안 된다"를 지키자는 것이지 50 이라는 숫자
  //   자체가 계약은 아니라서, **상한을 올리지 않고** 눈금을 40 으로 내려 기록한다 —
  //   상한($300)을 올리는 것은 지출 가능액을 늘리는 결정이라 사장님 몫이다.
  //   (원래 사건은 $20 상한이 **여섯 편**에서 멎은 것이었다. 지금은 그 자리와 멀다.)
  it("전역 상한이 영상 여러 편을 견딘다 — 전 사용자 합계가 몇 편에서 멎으면 안 된다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal() / costFor(30)).toBeGreaterThan(40);
  });
});
