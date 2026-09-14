// `/reel/new` 에 **앞으로 걸을 여섯 줄**을 세운다 (회귀 닫기 · 2026-09-15).
//
// ★★★ 왜 생겼나: 2026-09-14 에 사이드바의 reel 단계 목록을 걷었다(`154700b`). 그 목록이
//   `/reel/new` 에서 **유일하게 단계를 보여 주던 것**이었다 — 그 화면은
//   `app/reel/[id]/layout.js` 의 **형제**라 걸음 띠가 애초에 안 붙는다.
//   그래서 `/reel/new` 는 단계가 **아무것도** 안 보이는데 `/ads/new` 는 ①~④를 보여 준다.
//   2026-09-01 사장님 지적이 정확히 이 대비였고, 09-15 에 프로덕션에서 다시 걸렸다.
//
// ★ **사이드바로 되돌리지 않는다**(Ruling 20) — 그러면 "같은 말이 두 곳"이 복귀한다.
//   단계는 띠가 말한다. `/reel/new` 에도 띠 모양을 세우되, **눌리지 않는** 상태로 둔다.
//
// ★★★ 순진하게 가드만 풀면 틀린다 — 앞 세션이 브라우저로 재서 적어 둔 함정 셋:
//   ⓐ `isReelStepReachable("scenario", null)` 이 **true** 라 ②가 안 잠긴다
//   ⓑ `reelStepHref(step, undefined)` 가 `/reel/undefined/scenario` 라는 **깨진 링크**를 그린다
//   ⓒ 도드라지는 줄이 ①이 아니라 **②**다(`reelStepFromPathname("/reel/new")` 가 undefined →
//      `currentReelStepKey(null)` = "scenario")
//   그래서 "아직 시작 안 했다"를 **판정으로 유도하지 말고 명시로 받는다**.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REEL_STEPS } from "../lib/reel/steps.js";
import { ReelStepPreview } from "../components/reel/StepStack.jsx";

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const stack = strip(readFileSync("components/reel/StepStack.jsx", "utf8"));
const page = strip(readFileSync("app/reel/new/page.js", "utf8"));

describe("/reel/new — 앞으로 걸을 길을 보여 준다", () => {
  it("★★★ 그 화면이 미리보기 띠를 **실제로 쓴다** — 이름만 있으면 화면은 그대로 비어 있다", () => {
    expect(page, "미리보기를 import 하지 않았다").toMatch(/import\s*\{[^}]*ReelStepPreview[^}]*\}/);
    expect(page, "미리보기를 그리지 않았다").toMatch(/<ReelStepPreview\s*\/?>/);
  });

  it("★★★ 미리보기는 **띠와 같은 틀**이다 — 모양이 두 벌이 되면 한쪽만 고쳐진다", () => {
    const at = stack.indexOf("function ReelStepPreview");
    expect(at, "미리보기 출구가 없다").toBeGreaterThan(-1);
    const body = stack.slice(at, stack.indexOf("\n}", at));
    expect(body, "띠 겉틀(.rs-strip)을 안 쓴다").toContain("rs-strip");
    // 알약을 손으로 또 그리면 두 벌이 된다 — 띠가 쓰는 조각을 나눠 써야 한다.
    expect(body, "알약 조각을 나눠 쓰지 않는다 — 모양이 두 벌이 된다").toMatch(/Pill|stepPill/);
  });

  it("★★★ 미리보기에는 **링크가 하나도 없다** — 아직 갈 영상이 없다", () => {
    const at = stack.indexOf("function ReelStepPreview");
    const body = stack.slice(at, stack.indexOf("\n}", at));
    expect(body, "미리보기가 링크를 그린다 — /reel/undefined/… 로 간다").not.toMatch(/<Link[\s>]/);
    expect(body, "미리보기가 주소를 만든다 — 프로젝트 id 가 없다").not.toContain("reelStepHref");
  });

  it("★★★ 도드라지는 줄은 **①이다** — 판정에 맡기면 ②가 열린다(함정 ⓒ)", () => {
    const at = stack.indexOf("function ReelStepPreview");
    const body = stack.slice(at, stack.indexOf("\n}", at));
    // 지금 단계를 **짐작하지 않는다** — 그 둘을 부르는 순간 ②로 떨어진다.
    expect(body, "currentReelStepKey 로 지금 단계를 짐작한다 — ②가 열린다")
      .not.toContain("currentReelStepKey");
    expect(body, "주소로 지금 단계를 짐작한다 — /reel/new 는 못 알아본다")
      .not.toContain("reelStepFromPathname");
    // 도달 판정도 부르지 않는다 — isReelStepReachable("scenario", null) 이 true 라
    // ②가 안 잠긴다(함정 ⓐ).
    expect(body, "도달 판정을 부른다 — ②가 안 잠긴다").not.toContain("isReelStepReachable");
  });

  it("★★★ 여섯 줄 전부를 **표에서** 센다 — 손으로 적으면 표와 갈린다", () => {
    const at = stack.indexOf("function ReelStepPreview");
    const body = stack.slice(at, stack.indexOf("\n}", at));
    expect(body, "REEL_STEPS 를 안 읽는다").toContain("REEL_STEPS");
    expect(REEL_STEPS.length, "단계 수가 여섯이 아니다 — 띠 모양을 다시 봐라").toBe(6);
  });

  it("★★ 값·크레딧을 말하지 않는다 — 돈이 나가는 자리는 ⑤ 하나다", () => {
    const at = stack.indexOf("function ReelStepPreview");
    const body = stack.slice(at, stack.indexOf("\n}", at));
    expect(body, "화면이 값을 말한다").not.toContain("크레딧");
  });

  // ★ 모양이 아니라 **값**으로도 잰다 — 소스 문자열만 재면 갈래가 죽어도 초록일 수 있다.
  it("★★★ 미리보기가 돌려주는 줄은 여섯이고, 첫 줄만 지금이다", () => {
    const el = ReelStepPreview();
    const 줄들 = el.props.children;
    expect(Array.isArray(줄들), "줄을 배열로 안 그린다").toBe(true);
    expect(줄들.length, "여섯 줄이 아니다").toBe(REEL_STEPS.length);
    const cls = (n) => String(n.props.className || "");
    expect(cls(줄들[0]), "① 이 지금 줄이 아니다").toContain("is-now");
    for (let i = 1; i < 줄들.length; i++) {
      expect(cls(줄들[i]), `${i + 1}번째 줄이 잠기지 않았다`).toContain("is-todo");
      expect(cls(줄들[i]), `${i + 1}번째 줄이 지금 줄로 섰다`).not.toContain("is-now");
    }
  });
});
