// 단계 이동 — **다음은 오른쪽, 이전은 왼쪽**(2026-08-25 사장님 지시).
//
// ★ 다음(.fwd)은 이미 오른쪽이다 — app/globals.css 의 `.step-actions .fwd { margin-left: auto }`.
//   그래서 새로 만드는 것은 **이전으로 돌아가는 길** 하나다.
// ★★ 이전 단계 판정을 화면이 손으로 적지 않는다. 표(REEL_STEPS)가 순서를 쥐고 있으니
//   거기서 뽑는다 — 화면마다 적으면 단계가 늘거나 순서가 바뀔 때 그 화면만 낡는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_STEPS, reelPrevStep } from "../lib/reel/steps.js";

describe("reelPrevStep — 표가 순서를 쥔다", () => {
  it("첫 단계에는 이전이 없다", () => {
    expect(reelPrevStep(REEL_STEPS[0].key)).toBeNull();
  });

  it("둘째 단계의 이전은 첫 단계다", () => {
    expect(reelPrevStep(REEL_STEPS[1].key)?.key).toBe(REEL_STEPS[0].key);
  });

  it("마지막 단계의 이전은 그 앞이다", () => {
    const last = REEL_STEPS[REEL_STEPS.length - 1];
    expect(reelPrevStep(last.key)?.key).toBe(REEL_STEPS[REEL_STEPS.length - 2].key);
  });

  // ★ 모르는 값에 던지지 않는다 — 이 저장소 규율(pickFocus·resolutionForProject).
  it("모르는 단계면 null 이다", () => {
    expect(reelPrevStep("없는단계")).toBeNull();
    expect(reelPrevStep(undefined)).toBeNull();
  });
});

// ★★ 화면이 이전 버튼을 **어디에 어떤 이름으로** 두는지는 여기서 재지 않는다 —
//   tests/reel-button-places.test.js 로 옮겼다(2026-08-25 사장님 지시로 규칙이 바뀌었다:
//   이름은 늘 "이전으로", 자리는 맨 아래 왼쪽 끝, 그리는 곳은 components/ReelBack.jsx 하나).
//   여기 있던 단정들은 화면마다 손으로 적던 시절의 것이라 지금은 낡았다.
describe("버튼 모양", () => {
  // ★ 버튼처럼 보이는 링크에 밑줄이 그어지면 옆의 버튼과 다른 종류처럼 보인다.
  it(".mini 에 밑줄 해제가 있다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    // ⚠️ 2026-09-01 — 여기는 `css.indexOf(".mini {")` 였는데, 그 글자는 **`.home-header
    //   .mini {`** 에도 들어 있어서 훨씬 앞줄을 잡았다. 그리고 거기서 500 자 안에 있던
    //   `.project-card` 의 `text-decoration: none` 을 맞은 것으로 읽었다 — 즉 **엉뚱한
    //   규칙을 보고 통과**하고 있었다(`.project-card` 에 줄이 늘자 드러났다).
    //   맨 왼쪽에서 시작하는 `.mini` 규칙만 잡고, 창이 아니라 **규칙 끝**까지 본다.
    const at = css.indexOf("\n.mini {");
    expect(at, ".mini 규칙을 못 찾았다").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at) + 1)).toMatch(/text-decoration:\s*none/);
  });
});
