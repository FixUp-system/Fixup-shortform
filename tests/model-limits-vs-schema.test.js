// **모델이 받는 범위**를 우리 표가 사실대로 적고 있는가 (2026-09-03).
//
// ★★★ 왜 판으로 박는가 — 2.5 의 `minSeconds` 가 **15** 로 적혀 있었는데 fal 스키마는
//   4 부터 받는다. 그 항목에는 "미검증 — 문서에서 본 문자열이고 실제로 불러본 적이 없다"
//   는 주석이 붙어 있었고, 실제로 틀렸다. 그동안 2.5 로는 15초 아래를 시험할 수 없었고,
//   시험 한 번의 값이 필요 이상으로 비쌌다(480p 4초 ≈$0.82 vs 15초 ≈$3.08).
//
// ★★ 두 축을 섞지 않는다(lib/ad/models.js 머리말의 규율):
//     · `seconds`               = **우리가 제품으로 파는** 닫힌 목록 (정가가 있어야 한다)
//     · `minSeconds`·`maxSeconds` = **모델이 실제로 받는** 범위 (사실이라 스키마를 따른다)
//   그래서 여기서는 뒤엣것만 잰다 — 무엇을 팔지는 값을 정하는 결정이라 판이 못 정한다.
//
// ★ 값은 **fal OpenAPI 조회 결과**다(2026-09-03):
//     2.0 r2v — duration enum "4"~"15" · "Supports 4 to 15 seconds"
//     2.5 r2v — duration enum "4"~"30" · "Supports 4 to 30 seconds"
//   ⚠️ 네트워크를 타지 않는다 — 조회는 사람이 하고, 여기에는 그 결과를 적어 둔다.
//     스키마가 바뀌면 이 판이 아니라 **실제 조회**가 알려 준다(그때 이 표를 고친다).
import { describe, it, expect } from "vitest";
import { AD_MODELS, adModel } from "../lib/ad/models.js";

// 2026-09-03 조회 결과
const SCHEMA = {
  "seedance-2.0": { min: 4, max: 15 },
  "seedance-2.5": { min: 4, max: 30 },
};

describe("우리 표의 '모델이 받는 범위'가 스키마와 같다", () => {
  for (const [id, want] of Object.entries(SCHEMA)) {
    it(`★★★ ${id} — ${want.min}~${want.max}초`, () => {
      const m = adModel(id);
      expect(m.minSeconds, `${id} 의 minSeconds`).toBe(want.min);
      expect(m.maxSeconds, `${id} 의 maxSeconds`).toBe(want.max);
    });
  }
});

describe("두 축을 섞지 않는다", () => {
  it("★★★ 파는 길이는 전부 **받는 범위 안**이다 — 밖이면 fal 이 거절한다", () => {
    for (const m of AD_MODELS) {
      for (const s of m.seconds || []) {
        expect(s, `${m.id} 가 ${s}초를 파는데 받는 범위(${m.minSeconds}~${m.maxSeconds}) 밖이다`)
          .toBeGreaterThanOrEqual(m.minSeconds);
        expect(s, `${m.id} 가 ${s}초를 파는데 받는 범위 밖이다`).toBeLessThanOrEqual(m.maxSeconds);
      }
    }
  });

  it("★★ 받는 범위가 파는 목록보다 **넓거나 같다** — 좁으면 둘 중 하나가 틀린 것이다", () => {
    for (const m of AD_MODELS) {
      const sold = m.seconds || [];
      if (!sold.length) continue;
      expect(m.minSeconds, `${m.id}`).toBeLessThanOrEqual(Math.min(...sold));
      expect(m.maxSeconds, `${m.id}`).toBeGreaterThanOrEqual(Math.max(...sold));
    }
  });

  it("★ 파는 길이에는 **정가가 있어야 한다** — 없으면 adVideoPrice 가 그 자리에서 던진다", async () => {
    const { AD_VIDEO_PRICE } = await import("../lib/pricing.js");
    for (const m of AD_MODELS) {
      const table = AD_VIDEO_PRICE[m.id];
      if (!table) continue; // 옛 모델은 표에만 남아 있을 수 있다
      for (const s of m.seconds || []) {
        expect(table[s], `${m.id} 의 ${s}초에 정가가 없다`).toBeDefined();
      }
    }
  });
});
