// 가격표(파는 값)와 예산 안전핀(우리 지갑)이 어긋나면 산 영상이 중간에 죽는다.
// 실제로 그랬다 — 60초를 100크레딧에 팔면서 프로젝트 상한은 $5 였다(원가 ~$6.06).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FREE_TRIAL_USD, VIDEO_PRICE } from "../lib/pricing.js";

// 원가 공식 — lib/pricing.js 주석의 실측값(편당 $0.06 + 컷당 $0.50, 컷 ≈ 5초)
const costFor = (seconds) => 0.06 + 0.5 * (seconds / 5);

describe("체험 한도", () => {
  it("$0.50 다 — 편당 LLM 원가 ~$0.06 이니 대본 여덟 편쯤", () => {
    expect(FREE_TRIAL_USD).toBe(0.5);
  });

  it("편당 LLM 원가보다 넉넉하다 — 한 편도 못 만들면 체험이 아니다", () => {
    expect(FREE_TRIAL_USD).toBeGreaterThan(0.06 * 3);
  });
});

describe("예산 안전핀이 가격표를 견딘다", () => {
  // env 를 비워 기본값을 재고, 끝나면 되돌린다 — 다른 테스트가 값을 물려받으면 안 된다.
  const saved = {};
  beforeEach(() => {
    for (const k of ["SHOTFORM_BUDGET_TOTAL_USD", "SHOTFORM_BUDGET_PROJECT_USD"]) {
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
    const cuts = longest / 5;
    const regenWorst = cuts * 3 * 0.5;   // 컷당 3회(MAX_REGEN_PER_CUT) × 컷당 $0.50
    expect(costFor(longest) + regenWorst).toBeLessThan(limitProject());
  });

  it("전역 상한이 영상 여러 편을 견딘다 — 전 사용자 합계가 몇 편에서 멎으면 안 된다", async () => {
    const { limitTotal } = await import("../lib/costs.js");
    expect(limitTotal() / costFor(30)).toBeGreaterThan(50);
  });
});
