// reel 이 Claude Fable 을 빌려 쓸 수 있는가 — 계약은 이제 **lib/reel/llm.js** 가 진다.
//
// ★★ 2026-08-28 머지(feat/scenario-prompt) — lib/ad/llm.js 가 **광고 전용으로 되돌아갔다.**
//   그러면서 우리가 만든 두 계약이 사라졌다:
//     · schema 기본값이 AD_SCENARIO_SCHEMA 다 — reel 은 이제 자기 스키마를 **명시로** 넘긴다
//       (lib/reel/scenario.js 의 REEL_SCENARIO_SCHEMA)
//     · 거절 문구가 stage 를 안 말한다("시나리오 생성이 거절됐어요"로 고정)
//   앞의 것은 reel 쪽에서 되찾았고(명시 전달), 뒤의 것은 **감수한다** — 거절은 드물고
//   문구가 덜 구체적일 뿐이라 값이나 정확성이 걸린 자리가 아니다.
// ★ 남는 계약은 하나다: **가짜 응답을 부르는 쪽이 정하는가.** 그것이 없으면 reel 의
//   0원 관통이 통째로 막힌다(컷 프롬프트 자리에 광고 시나리오가 온다).
//
// ★ 재는 것은 둘이다: 가짜 응답을 부르는 쪽이 정하는가 / 거절 문구가 stage 를 말하는가.
//   그리고 **안 넘기면 예전 그대로**여야 한다(광고 경로 회귀 0).
import { describe, it, expect } from "vitest";
import { callJson } from "../lib/reel/llm.js";
import { runWithActor } from "../lib/actor.js";

// 거절 문구 테스트는 진짜 경로(fakeLlm() 없음)를 타 assertBudget → costActor() 까지
// 간다. costActor() 는 actor 컨텍스트가 없으면 던진다(lib/actor.js) — 브리핑 원문에는
// 없던 감쌈이지만, tests/ad-llm.test.js 의 "⑥ stop_reason 거절 처리" 도 같은 이유로
// runWithActor 로 감싼다. 안 감싸면 항상 "actor 컨텍스트가 없어요"로 죽어 거절 문구
// 자체를 잴 수 없다.
const A = "00000000-0000-4000-8000-0000000000ad";

// 가짜 모드에서 돈다 — vitest.setup.js 가 SHOTFORM_FAKE 를 세우지 않으므로 여기서 세운다.
function withFake(fn) {
  const before = process.env.SHOTFORM_FAKE;
  process.env.SHOTFORM_FAKE = "all";
  return Promise.resolve(fn()).finally(() => {
    if (before === undefined) delete process.env.SHOTFORM_FAKE;
    else process.env.SHOTFORM_FAKE = before;
  });
}

describe("callJson 의 fake 인자", () => {
  it("넘기면 그 값을 돌려준다", async () => {
    await withFake(async () => {
      const out = await callJson({
        system: "s", messages: [{ role: "user", content: "m" }],
        stage: "영상프롬프트", fake: () => ({ body: "a still counter, slow push-in" }),
      });
      expect(out).toEqual({ body: "a still counter, slow push-in" });
    });
  });

  it("안 넘기면 예전 그대로 광고 시나리오를 준다", async () => {
    await withFake(async () => {
      const out = await callJson({ system: "s", messages: [{ role: "user", content: "m" }] });
      // fakeAdResponse 의 계약 — shots 배열과 text 를 갖는다
      expect(Array.isArray(out.shots)).toBe(true);
      expect(typeof out.text).toBe("string");
    });
  });
});
