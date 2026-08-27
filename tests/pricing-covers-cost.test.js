// **정가가 1회 생성 원가를 덮는가** (2026-08-27 사장님 지시: "1회 생성 기준으로 갱신해줘
// 스토리보드 포함해서").
//
// 왜 판을 따로 두는가 — 옛 표는 **클립값만** 담고 있었고 그 사실이 주석에만 적혀 있었다.
// 주석은 단가가 바뀌어도 안 깨진다. 그래서 여기서 **lib/costs.js 로 원가를 다시 계산해**
// 대조한다: fal 단가를 고치는 날 이 판이 먼저 깨져서 가격표를 함께 고치게 만든다.
//
// ★ 재는 것은 두 방향이다:
//   ① **밑돌지 않는다** — 밑돌면 팔수록 손해다.
//   ② **5크레딧 넘게 더 받지 않는다** — 위로도 조인다. 아래만 재면 아무 큰 수나 통과한다.
//     (표의 관례가 "5의 배수로 올림"이라 정확히 그 폭 안에 들어와야 한다.)
//
// ⚠️ **1회 기준이다.** 다시 만들기(그림·영상·시나리오)는 이 표 밖이다 — reel 에는 지금
//   재생성 청구가 아예 없다. 그 구멍은 청구 자리에서 막을 일이지 이 판이 잴 일이 아니다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, AD_VIDEO_PRICE, videoPrice } from "../lib/pricing.js";
import { estimateCost } from "../lib/costs.js";

// 1크레딧이 대표하는 원가. lib/pricing.js 머리말의 그 값이다.
const CREDIT_USD = 0.06;

// 클립 엔드포인트 — lib/clip-limits.js 의 CLIP_PROFILES 와 같은 문자열이어야 한다.
// (여기서 그 파일을 import 하지 않는 이유: 단가는 **접두사**로 걸리므로 모델을 가리키는
//  문자열이면 충분하고, 프로필 표의 다른 값에 이 판이 딸려 흔들리지 않는 편이 낫다.)
const ENDPOINT = {
  "seedance-2.0": "bytedance/seedance-2.0/image-to-video",
  "seedance-2.5": "bytedance/seedance-2.5/image-to-video",
  "kling-v3": "fal-ai/kling-video/v3/standard/image-to-video",
};

// 그림 — 흐름이 둘이라 **큰 쪽**이다(lib/pricing.js 의 VIDEO_PRICE 머리말 ②).
//   reel: 스토리보드 한 장 · 단계별: 컷마다 한 장(5초에 컷 하나로 본다)
const SHEET = estimateCost("openai/gpt-image-2", 1, "high");
const imageCost = (seconds) => Math.max(SHEET, 0.08 * Math.ceil(seconds / 5));

// 나머지 — LLM + TTS + 음성인식. 길이에 거의 안 딸린다.
const OTHER_USD = 0.30;

const oneRunCost = (model, resolution, seconds) =>
  estimateCost(ENDPOINT[model], seconds, resolution) + imageCost(seconds) + OTHER_USD;

describe("정가가 1회 생성 원가를 덮는다", () => {
  for (const [model, byRes] of Object.entries(VIDEO_PRICE)) {
    for (const [res, table] of Object.entries(byRes)) {
      for (const [secStr, credits] of Object.entries(table)) {
        const seconds = Number(secStr);
        const cost = oneRunCost(model, res, seconds);
        const need = cost / CREDIT_USD;

        it(`${model} ${res} ${seconds}초 — ${credits}크레딧이 $${cost.toFixed(2)} 를 덮는다`, () => {
          expect(credits, `밑돈다: ${need.toFixed(1)} 크레딧이 필요하다`).toBeGreaterThanOrEqual(need);
        });

        it(`${model} ${res} ${seconds}초 — 5크레딧 넘게 더 받지 않는다`, () => {
          expect(credits, `너무 높다: ${need.toFixed(1)} 이면 충분하다`).toBeLessThan(need + 5);
        });
      }
    }
  }

  it("★ 스토리보드 한 장이 실제로 값에 들어 있다 — 이것이 빠져 있던 것이 이번 갱신의 이유다", () => {
    // 클립값만으로 매긴 값(옛 표의 방식)보다 반드시 커야 한다.
    const clipOnly = estimateCost(ENDPOINT["seedance-2.0"], 15, "720p") / CREDIT_USD;
    expect(videoPrice(15, "seedance-2.0", "720p")).toBeGreaterThan(clipOnly);
    expect(SHEET).toBeGreaterThan(0);
  });
});

describe("광고 정가도 원가를 덮는다", () => {
  // ★ 이 흐름에는 **그림이 없다**(단일 클립 하나) — 그래서 ② 가 안 붙는다.
  //   위 표와 달리 위쪽은 안 조인다: 기존 값들이 5의 배수로 올린 뒤 그대로 굳었고,
  //   내리는 것은 값 정책이라 여기서 강제할 일이 아니다.
  const AD_OTHER_USD = 0.2;
  for (const [model, bySec] of Object.entries(AD_VIDEO_PRICE)) {
    for (const [secStr, cell] of Object.entries(bySec)) {
      const seconds = Number(secStr);
      const entries = typeof cell === "number" ? [["720p", cell]] : Object.entries(cell);
      for (const [res, credits] of entries) {
        it(`${model} ${res} ${seconds}초 — ${credits}크레딧이 원가를 덮는다`, () => {
          const cost = estimateCost(ENDPOINT[model], seconds, res) + AD_OTHER_USD;
          expect(credits).toBeGreaterThanOrEqual(cost / CREDIT_USD);
        });
      }
    }
  }
});
