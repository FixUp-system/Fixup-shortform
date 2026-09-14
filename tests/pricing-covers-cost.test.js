// **정가가 1회 생성 원가를 덮는가** (2026-08-27 사장님 지시: "1회 생성 기준으로 갱신해줘
// 스토리보드 포함해서").
//
// 왜 판을 따로 두는가 — 옛 표는 **클립값만** 담고 있었고 그 사실이 주석에만 적혀 있었다.
// 주석은 단가가 바뀌어도 안 깨진다. 그래서 여기서 **lib/costs.js 로 원가를 다시 계산해**
// 대조한다: fal 단가를 고치는 날 이 판이 먼저 깨져서 가격표를 함께 고치게 만든다.
//
// ★★ 2026-09-14 새 단위(1크레딧 = 원가 $0.007) — 판정이 "원가를 덮는가"에서
//   **"원가에 비례하는가"** 로 바뀌었다. 표의 규칙이 "50 단위 **반올림**"이라 크레딧 × $0.007 은
//   원가보다 조금 낮을 수 있다(최대 25크레딧어치). 마진은 크레딧 수가 아니라 판매가(₩/크레딧)에
//   붙으므로 그것이 맞는 판정이다. 그래서 재는 것은 **양쪽 ±25크레딧 폭**이다:
//   아래만 재면 싸게 팔리는 칸을, 위만 재면 아무 큰 수를 못 잡는다.
//
// ⚠️ **1회 기준이다.** 다시 만들기(그림·영상·시나리오)는 이 표 밖이다 — reel 에는 지금
//   재생성 청구가 아예 없다. 그 구멍은 청구 자리에서 막을 일이지 이 판이 잴 일이 아니다.
import { describe, it, expect } from "vitest";
import { VIDEO_PRICE, AD_VIDEO_PRICE, REGEN_PRICE, videoPrice, adVideoPrice, priceLabel, formatCredits } from "../lib/pricing.js";
import { estimateCost } from "../lib/costs.js";

// 1크레딧이 대표하는 원가. lib/pricing.js 머리말의 그 값이다.
const CREDIT_USD = 0.007;
// 50 단위 반올림의 절반 — 이 폭 안에 들어와야 원가 비례다. (+부동소수 여유)
const HALF_STEP = 25 + 1e-6;

// 클립 엔드포인트 — lib/clip-limits.js 의 CLIP_PROFILES 와 같은 문자열이어야 한다.
// (여기서 그 파일을 import 하지 않는 이유: 단가는 **접두사**로 걸리므로 모델을 가리키는
//  문자열이면 충분하고, 프로필 표의 다른 값에 이 판이 딸려 흔들리지 않는 편이 낫다.)
const ENDPOINT = {
  "seedance-2.0": "bytedance/seedance-2.0/image-to-video",
  "seedance-2.5": "bytedance/seedance-2.5/image-to-video",
  "kling-v3": "fal-ai/kling-video/v3/standard/image-to-video",
  // ★ 2026-08-28 머지(feat/scenario-prompt)로 들어온 모델 — 이 표에 없으면
  //   estimateCost(undefined) 가 TypeError 로 죽어 **가격이 아니라 테스트가** 실패한다.
  //   값은 lib/ad/models.js 의 minimax-h3 endpoints.i2v 와 같아야 한다.
  "minimax-h3": "minimax/h3/image-to-video",
};

// 그림 — 흐름이 둘이라 **큰 쪽**이다(lib/pricing.js 의 VIDEO_PRICE 머리말 ②).
//   reel: 스토리보드 한 장 · 단계별: 컷마다 한 장(5초에 컷 하나로 본다)
const SHEET = estimateCost("openai/gpt-image-2", 1, "high");
const imageCost = (seconds) => Math.max(SHEET, 0.08 * Math.ceil(seconds / 5));

// 나머지 — LLM + TTS + 음성인식. 길이에 거의 안 딸린다.
const OTHER_USD = 0.30;

const oneRunCost = (model, resolution, seconds) =>
  estimateCost(ENDPOINT[model], seconds, resolution) + imageCost(seconds) + OTHER_USD;

describe("정가가 1회 생성 원가에 비례한다", () => {
  for (const [model, byRes] of Object.entries(VIDEO_PRICE)) {
    for (const [res, table] of Object.entries(byRes)) {
      for (const [secStr, credits] of Object.entries(table)) {
        const seconds = Number(secStr);
        const cost = oneRunCost(model, res, seconds);
        const need = cost / CREDIT_USD;

        it(`${model} ${res} ${seconds}초 — ${credits}크레딧이 원가 $${cost.toFixed(2)} 에 비례한다`, () => {
          expect(Math.abs(credits - need), `원가로는 ${need.toFixed(1)} 크레딧이다 — 50 단위 반올림 폭(±25)을 벗어났다`)
            .toBeLessThanOrEqual(HALF_STEP);
          expect(credits % 50, "50 단위가 아니다").toBe(0);
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

describe("광고 정가도 원가에 비례한다", () => {
  // ★ 이 흐름에는 **그림이 없다**(단일 클립 하나) — 그래서 그림값이 안 붙는다.
  //   ★ 2026-09-14 새 단위부터는 위 표와 **같은 판정**(±25크레딧 폭)을 건다 — 옛 값들이
  //   "올림 뒤 굳은" 상태였던 것을 새 단위로 다시 계산하면서 풀었다.
  const AD_OTHER_USD = 0.2;
  for (const [model, bySec] of Object.entries(AD_VIDEO_PRICE)) {
    for (const [secStr, cell] of Object.entries(bySec)) {
      const seconds = Number(secStr);
      const entries = typeof cell === "number" ? [["720p", cell]] : Object.entries(cell);
      for (const [res, credits] of entries) {
        it(`${model} ${res} ${seconds}초 — ${credits}크레딧이 원가에 비례한다`, () => {
          const cost = estimateCost(ENDPOINT[model], seconds, res) + AD_OTHER_USD;
          expect(Math.abs(credits - cost / CREDIT_USD)).toBeLessThanOrEqual(HALF_STEP);
          expect(credits % 50).toBe(0);
        });
      }
    }
  }
});

describe("재생성 값도 원가에 비례한다 (컷 하나 = 5초)", () => {
  // 10 단위 반올림 · 최소 10 — lib/pricing.js REGEN_PRICE 머리말의 규칙.
  const step10 = (usd) => Math.max(10, Math.round(usd / CREDIT_USD / 10) * 10);
  for (const [model, byRes] of Object.entries(REGEN_PRICE.clip)) {
    for (const [res, credits] of Object.entries(byRes)) {
      it(`클립 ${model} ${res} — ${credits}크레딧`, () => {
        expect(credits).toBe(step10(estimateCost(ENDPOINT[model], 5, res)));
      });
    }
  }
  it("스토리보드 한 장 · 이미지 한 장 · 목소리", () => {
    expect(REGEN_PRICE.sheet).toBe(step10(SHEET));
    expect(REGEN_PRICE.image).toBe(step10(0.08));
    expect(REGEN_PRICE.voice).toBe(10); // $0.002 는 계산하면 0 — 유료 구간에서 0 은 "무료"로 읽혀 최소 10
  });
});

describe("★ 사장님과 정한 단위 — 1,000크레딧 = 원클릭 기본·프로·단계별 한 편씩", () => {
  // 와디즈 리워드 문구가 이 약속 위에 서 있다. 가격표를 고쳐 이 합이 깨지면 리워드 설명이 거짓이 된다.
  it("H3 768P 15초 + 2.5 480p 15초 + reel 2.0 480p 15초 = 1,000", () => {
    const sum = adVideoPrice(15, "minimax-h3", "768P") + adVideoPrice(15, "seedance-2.5", "480p")
      + videoPrice(15, "seedance-2.0", "480p");
    expect(sum).toBe(1000);
  });
  it("천 단위 쉼표로 적는다", () => {
    expect(priceLabel(1550)).toBe("1,550 크레딧");
    expect(priceLabel(0)).toBe("무료");
    expect(formatCredits(-12500)).toBe("-12,500");
    expect(formatCredits(999)).toBe("999");
  });
});
