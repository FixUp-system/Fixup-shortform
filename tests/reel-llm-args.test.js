// lib/ad/llm.js 를 다른 단계가 빌려 쓸 수 있는가 — 두 자리가 광고 전용으로 박혀 있었다.
//
// ★ 재는 것은 둘이다: 가짜 응답을 부르는 쪽이 정하는가 / 거절 문구가 stage 를 말하는가.
//   그리고 **안 넘기면 예전 그대로**여야 한다(광고 경로 회귀 0).
import { describe, it, expect } from "vitest";
import { callJson } from "../lib/ad/llm.js";
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

describe("거절 문구", () => {
  // 거절은 stop_reason 이 end_turn·max_tokens 밖일 때다. fetchImpl 로 그 응답을 만든다.
  const refused = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        model: "claude-fable-5", stop_reason: "refusal",
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });

  it("stage 를 말한다", async () => {
    await expect(
      runWithActor(A, () =>
        callJson({
          system: "s", messages: [{ role: "user", content: "m" }],
          stage: "영상프롬프트", apiKey: "test-key", fetchImpl: refused,
        })
      )
    ).rejects.toThrow(/영상프롬프트 생성이 거절됐어요/);
  });

  it("stage 를 안 넘기면 기본값(광고 시나리오)을 말한다", async () => {
    await expect(
      runWithActor(A, () =>
        callJson({
          system: "s", messages: [{ role: "user", content: "m" }],
          apiKey: "test-key", fetchImpl: refused,
        })
      )
    ).rejects.toThrow(/광고 시나리오 생성이 거절됐어요/);
  });
});
