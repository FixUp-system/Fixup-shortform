// lib/ad/llm.js — Claude Fable 호출. 실측(scripts/measure/probe-claude.mjs)에서 확인한
// 세 함정(usage 필드 이름·단가표 누락·응답 모양)이 실제로 지켜지는지 여기서 잰다.
//
// ★ 진짜 Claude 는 절대 안 부른다 — fetchImpl 주입으로 응답을 흉내 낸다.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { callJson, CLAUDE_MODEL } from "../lib/ad/llm.js";
import { validateScenario } from "../lib/ad/scenario.js";
import { runWithActor } from "../lib/actor.js";
import { estimateLlmCost, spentForProject } from "../lib/costs.js";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

const A = "00000000-0000-4000-8000-0000000000ad";

// 실측(scripts/measure/probe-claude.mjs, 2026-08-13)에서 그대로 옮긴 응답 모양 —
// content 배열에 thinking 블록이 먼저 오고, 실제 JSON 은 text 블록 안에 있다.
function anthropicFetch({ stopReason = "end_turn", inputTokens = 382, outputTokens = 636, text } = {}) {
  const payload =
    text ??
    JSON.stringify({
      text: "15초 프리미엄 앰플 광고 지시문",
      shots: [{ beat: "등장", camera: "슬로우 푸시인" }],
      endpoint: "r2v",
    });
  return async (url, init) => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: CLAUDE_MODEL,
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: payload },
      ],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
    text: async () => payload,
    // 마지막 호출의 요청 본문을 밖에서 검사할 수 있게 저장한다
    _init: init,
  });
}

// fetch 호출 인자를 붙잡아 두는 스파이 — thinking 필드 미전송 단정에 쓴다
function spyFetch(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}

describe("callJson — 정상 파싱", () => {
  it("content 배열의 text 블록에서 JSON을 꺼낸다 (thinking 블록은 건너뛴다)", async () => {
    const out = await runWithActor(A, () =>
      callJson({
        system: "s", messages: [{ role: "user", content: "u" }],
        fetchImpl: anthropicFetch(), apiKey: "test-key",
      })
    );
    expect(out.text).toContain("앰플");
    expect(Array.isArray(out.shots)).toBe(true);
    expect(out.shots.length).toBe(1);
  });

  it("깨진 JSON이면 1회 재시도한다", async () => {
    let i = 0;
    const fetchImpl = async () => {
      i++;
      const good = i > 1;
      return {
        ok: true,
        json: async () => ({
          model: CLAUDE_MODEL,
          content: [{ type: "text", text: good ? '{"text":"ok","shots":[{"beat":"a"}]}' : "깨짐{" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      };
    };
    const out = await runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl, apiKey: "k" }));
    expect(out.text).toBe("ok");
    expect(i).toBe(2);
  });

  it("두 번 다 실패하면 던진다", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        model: CLAUDE_MODEL,
        content: [{ type: "text", text: "x" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
    await expect(
      runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl, apiKey: "k" }))
    ).rejects.toThrow("LLM 응답 해석 실패");
  });
});

describe("① usage 필드 매핑 — input_tokens/output_tokens 를 놓치면 원가가 0이 된다", () => {
  beforeEach(() => resetMemoryStore());

  // ★ 이 자리에는 원래 "Anthropic 이름을 그대로 넘기면 0원이 된다"는 **대조군**이 있었다.
  //    본 파이프라인이 Claude 로 옮겨 오면서(2026-08-17 병합) estimateLlmCost 가 두 이름을
  //    함께 읽게 됐다 — 그 결함이 없어졌으므로 대조군도 성립하지 않는다.
  //    없어진 결함을 그대로 두면 테스트가 **되돌아가는 것을 지키는** 자가 된다.
  //    재는 것을 뒤집는다: 어느 공급자의 이름으로 와도 **0 이 아니다**.
  //    0 은 예산 가드가 못 보는 값이라, 이것이 지킬 값어치가 있는 쪽이다.
  it("usage 이름이 어느 쪽이든 원가가 0 이 아니다 — 0 은 예산 가드가 못 본다", () => {
    const anthropic = estimateLlmCost(CLAUDE_MODEL, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    const openai = estimateLlmCost(CLAUDE_MODEL, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
    expect(anthropic).toBeGreaterThan(0);
    expect(openai).toBeGreaterThan(0);
    // 같은 토큰 수면 이름이 달라도 같은 값이어야 한다 — 한쪽만 읽으면 여기서 갈린다
    expect(anthropic).toBe(openai);
  });

  it("callJson 을 실제로 부르면 project 비용이 0보다 커진다 — 매핑이 이뤄졌다는 증거", async () => {
    await runWithActor(A, () =>
      callJson({
        system: "s", messages: [{ role: "user", content: "u" }],
        fetchImpl: anthropicFetch({ inputTokens: 2000, outputTokens: 400 }),
        apiKey: "k", projectId: "p-usage",
      })
    );
    const spent = await spentForProject("p-usage");
    expect(spent).toBeGreaterThan(0);
    // 정확한 값까지 검증 — 매핑이 실제로 input_tokens→prompt_tokens 로 갔는지
    // (estimateLlmCost(claude-fable-5, {prompt_tokens:2000, completion_tokens:400}))
    expect(spent).toBeCloseTo(2000 * (10 / 1e6) + 400 * (50 / 1e6), 6);
  });
});

describe("② Fable 단가가 표에 있다 — gpt-4o 단가로 안 떨어진다", () => {
  it("claude-fable-5 의 출력 단가는 $50/1M 이다 (gpt-4o의 $10/1M 이 아니다)", () => {
    const fableCost = estimateLlmCost(CLAUDE_MODEL, { prompt_tokens: 0, completion_tokens: 1_000_000 });
    const gpt4oCost = estimateLlmCost("gpt-4o", { prompt_tokens: 0, completion_tokens: 1_000_000 });
    expect(fableCost).toBe(50);
    expect(gpt4oCost).toBe(10);
    expect(fableCost).not.toBe(gpt4oCost);
    // 표에 없었다면 LLM_DEFAULT(gpt-4o 단가)로 떨어져 이 값이 10이 됐을 것이다 — 5배 차이
    expect(fableCost).toBe(gpt4oCost * 5);
  });

  it("claude-fable-5 의 입력 단가는 $10/1M 이다", () => {
    expect(estimateLlmCost(CLAUDE_MODEL, { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(10);
  });
});

describe("③ thinking 필드를 보내지 않는다", () => {
  it("요청 본문에 thinking 키가 없다 — 있으면 Fable 이 400을 낸다", async () => {
    const fetch = spyFetch(async () => ({
      ok: true,
      json: async () => ({
        model: CLAUDE_MODEL,
        content: [{ type: "text", text: '{"text":"ok","shots":[]}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }));
    await runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl: fetch, apiKey: "k" }));
    expect(fetch.calls.length).toBe(1);
    const body = JSON.parse(fetch.calls[0].init.body);
    expect("thinking" in body).toBe(false);
  });

  it("요청 헤더가 anthropic-version·x-api-key 를 싣는다", async () => {
    const fetch = spyFetch(async () => ({
      ok: true,
      json: async () => ({
        model: CLAUDE_MODEL,
        content: [{ type: "text", text: '{"text":"ok","shots":[]}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }));
    await runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl: fetch, apiKey: "my-key" }));
    const { headers } = fetch.calls[0].init;
    expect(headers["x-api-key"]).toBe("my-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });
});

describe("④ 가짜 모드 — 광고가 쓸 수 있는 시나리오가 나온다", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("SHOTFORM_FAKE=all 이면 fetch 없이, 키 없이도 돈다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const out = await callJson({
      system: "s", messages: [], fetchImpl: () => { called = true; }, apiKey: undefined,
    });
    expect(called).toBe(false);
    expect(typeof out.text).toBe("string");
    expect(out.text.length).toBeGreaterThan(0);
    expect(Array.isArray(out.shots)).toBe(true);
    expect(out.shots.length).toBeGreaterThan(0);
  });

  it("★ validateScenario 가 가짜 응답을 실제로 통과시킨다 — lib/llm.js 의 빈 shots 문제가 없다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const raw = await callJson({ system: "s", messages: [], apiKey: undefined });
    const out = validateScenario(raw, 0);
    expect(out).not.toBe(null);
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.shots.length).toBeGreaterThan(0);
  });
});

describe("⑤ 키가 없으면 던진다", () => {
  it("CLAUDE_API_KEY·ANTHROPIC_API_KEY 둘 다 없으면 던진다 (가짜 모드가 아닐 때)", async () => {
    await expect(
      callJson({ system: "s", messages: [], fetchImpl: async () => { throw new Error("불리면 안 됨"); }, apiKey: undefined })
    ).rejects.toThrow("CLAUDE_API_KEY가 설정되지 않았어요");
  });
});

describe("⑥ stop_reason 거절 처리", () => {
  it("stop_reason이 end_turn·max_tokens가 아니면 사용자에게 보일 오류로 던진다", async () => {
    const fetch = spyFetch(anthropicFetch({ stopReason: "refusal" }));
    await expect(
      runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl: fetch, apiKey: "k" }))
    ).rejects.toThrow(/거절/);
    // 재시도하지 않는다 — 같은 이유로 다시 거절될 뿐이라 돈을 두 번 쓰지 않는다
    expect(fetch.calls.length).toBe(1);
  });

  it("max_tokens 로 잘리면(파싱 실패) 재시도하지, 거절로 취급하지 않는다", async () => {
    let i = 0;
    const fetchImpl = async () => {
      i++;
      return {
        ok: true,
        json: async () => ({
          model: CLAUDE_MODEL,
          content: [{ type: "text", text: i === 1 ? '{"text":"짤린 j' : '{"text":"ok","shots":[]}' }],
          stop_reason: i === 1 ? "max_tokens" : "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      };
    };
    const out = await runWithActor(A, () => callJson({ system: "s", messages: [], fetchImpl, apiKey: "k" }));
    expect(out.text).toBe("ok");
    expect(i).toBe(2);
  });
});

describe("가짜 판정이 게이트보다 먼저다 — SHOTFORM_FAKE=all 이면 예산도 안 본다", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("actor 컨텍스트 없이도 가짜 모드는 던지지 않는다 (costActor 를 안 부른다)", async () => {
    process.env.SHOTFORM_FAKE = "all";
    await expect(callJson({ system: "s", messages: [], apiKey: undefined })).resolves.toBeTruthy();
  });
});
