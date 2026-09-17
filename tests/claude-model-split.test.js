// 어느 자리가 어느 Claude 모델을 쓰는가 — 2026-09-17 사장님 결정.
//
// ★ **Fable 5 는 시나리오 생성에만** 쓴다(사진을 직접 보고 장면을 짜는 자리 · 결과 품질을 가장 크게
//   좌우한다). 번역·영상 프롬프트는 이미 만들어진 글을 옮기거나 다듬는 일이라 **Opus 5**(단가 절반)다.
// ★ 지키는 것 셋:
//   ① 모델 인자를 안 넘기면 여전히 Fable 5 — 시나리오 세 경로가 안 바뀐다
//   ② 넘긴 모델이 **요청 본문과 원가 장부에 똑같이** 들어간다 — 갈리면 원가가 엉뚱한 단가 줄에 붙는다
//   ③ 번역·영상 프롬프트 세 자리가 Opus 5 를 넘긴다 / 시나리오 세 자리는 안 넘긴다
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { listRecords, estimateLlmCost } from "../lib/costs.js";
import { callJson, CLAUDE_MODEL } from "../lib/ad/llm.js";
import { TEXT_MODEL, TRANSLATE_MODEL } from "../lib/reel/llm.js";
import { MODEL as OPUS } from "../lib/llm.js";

const U = "00000000-0000-4000-8000-0000000000c1";

function fakeAnthropic(sent) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body.model);
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        stop_reason: "end_turn",
        usage: { input_tokens: 1000, output_tokens: 1000 },
        content: [{ type: "text", text: JSON.stringify({ ko: "번역" }) }],
      }),
    };
  };
}

describe("Claude 모델 나누기", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ 번역·프롬프트용 모델은 Opus 5 이고, 기본(시나리오)은 Fable 5 다", () => {
    expect(TEXT_MODEL).toBe(OPUS);
    expect(OPUS).toBe("claude-opus-5");
    expect(CLAUDE_MODEL).toBe("claude-fable-5");
  });

  it("★★★ 모델을 안 넘기면 Fable 5 로 부르고 장부에도 Fable 5 로 남는다", async () => {
    const sent = [];
    await runWithActor(U, () => callJson({
      system: "s", messages: [{ role: "user", content: "x" }], apiKey: "k",
      fetchImpl: fakeAnthropic(sent), stage: "광고 시나리오", schema: { type: "object", additionalProperties: false },
    }));
    expect(sent).toEqual(["claude-fable-5"]);
    const rows = await listRecords();
    expect(rows[0].endpoint).toBe("anthropic/claude-fable-5");
  });

  it("★★★ Opus 5 를 넘기면 **요청과 장부가 같은 모델**이고, 원가는 Fable 의 절반이다", async () => {
    const sentFable = [];
    const sentOpus = [];
    await runWithActor(U, () => callJson({
      system: "s", messages: [{ role: "user", content: "x" }], apiKey: "k",
      fetchImpl: fakeAnthropic(sentFable), stage: "지문 번역", schema: { type: "object", additionalProperties: false },
    }));
    await runWithActor(U, () => callJson({
      system: "s", messages: [{ role: "user", content: "x" }], apiKey: "k", model: TEXT_MODEL,
      fetchImpl: fakeAnthropic(sentOpus), stage: "지문 번역", schema: { type: "object", additionalProperties: false },
    }));
    expect(sentOpus).toEqual(["claude-opus-5"]);
    const rows = await listRecords();
    const opus = rows.find((r) => r.endpoint === "anthropic/claude-opus-5");
    const fable = rows.find((r) => r.endpoint === "anthropic/claude-fable-5");
    expect(opus, "장부에 Opus 줄이 없다 — 요청과 장부가 갈렸다").toBeTruthy();
    expect(Number(opus.est_cost_usd)).toBeCloseTo(Number(fable.est_cost_usd) / 2, 6);
  });

  it("★★ 영상 프롬프트 두 자리는 Opus 5 를 넘긴다", () => {
    for (const f of ["lib/reel/whole-prompt.js", "lib/reel/clip-prompt.js"]) {
      expect(readFileSync(f, "utf8"), `${f} 가 Opus 를 안 넘긴다 — Fable 로 불린다`).toContain("model: TEXT_MODEL");
    }
  });

  // ★★★ 2026-09-17 저녁 사장님 결정 — **번역은 Sonnet 5.** 옮기기만 하는 일이라 판단·창작이 거의 없다.
  it("★★★ 번역 두 자리(지문·자막)는 Sonnet 5 를 넘긴다", () => {
    expect(readFileSync("lib/reel/translate.js", "utf8"), "지문 번역이 Sonnet 을 안 넘긴다").toContain("model: TRANSLATE_MODEL");
    expect(readFileSync("app/api/projects/[id]/subtitle-lang/route.js", "utf8"), "자막 번역이 Sonnet 을 안 넘긴다").toContain("model: SONNET_MODEL");
    expect(TRANSLATE_MODEL).toBe("claude-sonnet-5");
  });

  it("★★★ Sonnet 5 원가는 단가표에서 온다 — 없으면 gpt-4o 단가로 떨어진다", () => {
    expect(estimateLlmCost("claude-sonnet-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(12, 6);
    expect(estimateLlmCost("claude-opus-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(30, 6);
  });

  // ★ 2026-09-17 저녁 — 시나리오도 **수정일 때만** Opus 5 로 간다(tests/scenario-revise.test.js 가 동작을 잰다).
  //   여기서는 "새로 쓰기에는 모델을 안 넘긴다"만 본다 — 넘기는 자리는 revising 갈래 하나여야 한다.
  it("★★ 시나리오는 **수정 갈래에서만** 모델을 넘긴다 — 새로 쓰기는 Fable 5 그대로다", () => {
    for (const f of ["lib/ad/scenario.js", "lib/reel/scenario.js"]) {
      const src = readFileSync(f, "utf8");
      const passes = [...src.matchAll(/model:\s*(TEXT_MODEL|OPUS_MODEL)/g)];
      expect(passes.length, `${f} 가 모델을 넘기는 자리가 하나가 아니다`).toBe(1);
      expect(src, `${f} 가 수정 갈래 밖에서 모델을 넘긴다`).toMatch(/\.\.\.\(revising \? \{ model: (TEXT_MODEL|OPUS_MODEL) \} : \{\}\)/);
    }
    expect(readFileSync("lib/film/scenario.js", "utf8"), "film 이 모델을 바꿨다").not.toMatch(/model:\s*(TEXT_MODEL|OPUS|"claude-opus)/);
  });
});
