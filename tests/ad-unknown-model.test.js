// ★ 모델 목록에서 사라진 id 를 가진 **옛 문서가 화면을 죽였다**(2026-08-13 실측).
//
//   Error: 모르는 광고 모델이에요: seedance-2.0-fast
//       at adVideoPrice (lib/pricing.js)
//       at AdDetailPage (app/ads/[id]/page.js)
//
// 렌더 도중 던져서 **화면 전체가 통째로** 죽었다("Application error"). 보관함에서 그
// 프로젝트를 누르면 아무것도 못 본다 — 시나리오도, 완성본도.
//
// 2026-08-13 에 모델을 2.0·2.5 둘로 정리하며 "기본/저가" 등급 id 가 사라졌고, 그 id 로
// 만든 문서가 남아 있었다. 모델 목록은 앞으로도 바뀐다 — 같은 일이 또 난다.
//
// ★ 어디를 고치는가: **청구는 그대로 엄격하게 둔다.** 모르는 모델에 값을 매기면 틀린
//   금액이 빠져나간다 — 던지는 것이 맞다. 견뎌야 하는 것은 **화면**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { adVideoPrice } from "../lib/pricing.js";
import { adModel, isAdModel } from "../lib/ad/models.js";

const detail = readFileSync("app/ads/[id]/page.js", "utf8");
const GONE = "seedance-2.0-fast"; // 실제로 문서에 남아 있던 id

describe("사라진 모델 id — 값 매기기는 여전히 엄격하다", () => {
  it("★ adVideoPrice 는 그대로 던진다 — 모르는 모델에 값을 매기면 틀린 금액이 나간다", () => {
    expect(() => adVideoPrice(15, GONE, "720p")).toThrow();
  });

  it("서버는 그 모델을 안 받는다 — 새로 만들 수는 없다", () => {
    expect(isAdModel(GONE)).toBe(false);
  });

  it("adModel 은 예전처럼 기본 모델로 떨어진다 — 라벨·힌트는 보여야 한다", () => {
    expect(adModel(GONE)).toBeTruthy();
    expect(adModel(GONE).label).toBeTruthy();
  });
});

describe("사라진 모델 id — 화면은 죽지 않는다", () => {
  it("★ 가격을 구하다 던져도 화면이 살아남는다 — try 로 감싼다", () => {
    // 렌더 중 던지면 React 가 화면 전체를 버린다. 값을 못 구하는 것과 화면이 사라지는
    // 것은 전혀 다른 일이다.
    expect(detail, "가격 계산이 보호되지 않는다").toMatch(/try\s*\{[\s\S]{0,200}adVideoPrice/);
  });

  it("값을 모르면 그렇게 말한다 — 숫자를 지어내지 않는다", () => {
    expect(detail).toMatch(/가격을 알 수 없|가격을 모/);
  });

  it("★ 값을 모르면 유료 버튼을 잠근다 — 얼마 나갈지 모르는 채로 누르게 하지 않는다", () => {
    // [이대로 만들기]는 크레딧이 나가는 문이다. 정가를 못 구한 상태에서 열어 두면
    // 사장님은 얼마가 빠져나갈지 모른 채 누르게 된다.
    expect(detail).toMatch(/disabled=\{[^}]*price\s*===\s*null|disabled=\{[^}]*!price/);
  });
});
