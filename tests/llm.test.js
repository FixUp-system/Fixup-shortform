import { describe, it, expect, afterEach } from "vitest";
import { callJson } from "../lib/llm.js";
import { runWithActor } from "../lib/actor.js";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";

// Anthropic Messages API 응답 모양. content 는 블록 배열이고 텍스트는 .text 에 있다.
function fakeFetch(responses) {
  let i = 0;
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? "{}"), init });
    const r = responses[Math.min(i++, responses.length - 1)];
    const payload = {
      id: "msg_test", type: "message", role: "assistant",
      model: "claude-opus-5",
      content: [{ type: "text", text: r.content ?? "" }],
      stop_reason: r.stop_reason ?? "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  impl.calls = calls;
  return impl;
}

describe("callJson", () => {
  it("정상 JSON을 파싱해 돌려준다", async () => {
    const out = await runWithActor("t-user", () => callJson({
      system: "s", messages: [{ role: "user", content: "u" }],
      fetchImpl: fakeFetch([{ content: '{"a":1}' }]),
      apiKey: "test",
    }));
    expect(out.a).toBe(1);
  });
  it("첫 응답이 깨진 JSON이면 1회 재시도한다", async () => {
    const out = await runWithActor("t-user", () => callJson({
      system: "s", messages: [],
      fetchImpl: fakeFetch([{ content: "깨짐{" }, { content: '{"b":2}' }]),
      apiKey: "test",
    }));
    expect(out.b).toBe(2);
  });
  it("두 번 다 실패하면 throw", async () => {
    // ★ runWithActor 로 감싼다 — 감싸지 않으면 예산 게이트(costActor)가 먼저 던져,
    // "해석 실패"를 재는 이 테스트가 엉뚱한 이유로 통과한다.
    await expect(
      runWithActor("t-user", () =>
        callJson({ system: "s", messages: [], fetchImpl: fakeFetch([{ content: "x" }]), apiKey: "test" }))
    ).rejects.toThrow("LLM 응답 해석 실패");
  });
});

describe("SHOTFORM_FAKE=all", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; });

  it("API 키 없이도, 네트워크 없이도 돈다", async () => {
    // 완전 가짜 모드의 전제다 — 키가 없어도 흐름을 끝까지 클릭할 수 있어야 한다
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const out = await callJson({
      system: "s", messages: [],
      fetchImpl: () => { called = true; },
      apiKey: undefined,
    });
    expect(called).toBe(false);
    expect(out.topic).toBeTruthy();
  });

  it("검증기 셋이 요구하는 키를 모두 담는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const out = await callJson({ system: "s", messages: [], apiKey: undefined });
    // 어느 호출부가 받아도 통과하도록 — 프롬프트로 갈라 주지 않는다
    expect(typeof out.topic).toBe("string");
    expect(Array.isArray(out.key_points)).toBe(true);
    expect(Array.isArray(out.cuts)).toBe(true);   // 빈 배열 → 문장당 한 컷 폴백
    expect(Array.isArray(out.shots)).toBe(true);  // 빈 배열 → 화면 설계 없이 진행
    // ★ 시나리오(validateScenario)는 이 응답으로 통과하지 못한다 — 장면 초의 합이 사장님이
    //   고른 길이와 같아야 해서 상수 하나로는 못 맞춘다(lib/llm.js 의 fakeResponse 주석).
    expect(out).not.toHaveProperty("script"); // 원고는 걷어냈다(2026-08-16)
  });
});

describe("Claude 로 나간다", () => {
  it("Anthropic 메시지 엔드포인트로 가고 모델이 claude-opus-5 다", async () => {
    const f = fakeFetch([{ content: '{"a":1}' }]);
    await runWithActor("t-user", () => callJson({
      system: "s", messages: [{ role: "user", content: "u" }], fetchImpl: f, apiKey: "test",
    }));
    expect(f.calls[0].url).toContain("api.anthropic.com");
    expect(f.calls[0].body.model).toBe("claude-opus-5");
  });

  // ★★ temperature 를 보내면 Claude Opus 5 는 400 이다
  it("temperature 를 보내지 않는다", async () => {
    const f = fakeFetch([{ content: "{}" }]);
    await runWithActor("t-user", () => callJson({ system: "s", messages: [], fetchImpl: f, apiKey: "test" }));
    expect(f.calls[0].body.temperature).toBeUndefined();
    expect(f.calls[0].body.top_p).toBeUndefined();
    expect(f.calls[0].body.top_k).toBeUndefined();
  });

  it("system 은 messages 가 아니라 별도 필드다", async () => {
    const f = fakeFetch([{ content: "{}" }]);
    await runWithActor("t-user", () => callJson({
      system: "너는 편집자다", messages: [{ role: "user", content: "u" }], fetchImpl: f, apiKey: "test",
    }));
    expect(f.calls[0].body.system).toBe("너는 편집자다");
    expect(f.calls[0].body.messages).toHaveLength(1);
    expect(f.calls[0].body.messages[0].role).toBe("user");
  });

  // ★ Opus 5 는 사고가 기본으로 켜져 있고 max_tokens 가 사고+본문의 합계 상한이다
  it("max_tokens 를 넉넉히 준다 — 낮으면 대본이 중간에 잘린다", async () => {
    const f = fakeFetch([{ content: "{}" }]);
    await runWithActor("t-user", () => callJson({ system: "s", messages: [], fetchImpl: f, apiKey: "test" }));
    expect(f.calls[0].body.max_tokens).toBe(16000);
  });

  it("키는 CLAUDE_API_KEY 를 먼저 본다", async () => {
    const before = { c: process.env.CLAUDE_API_KEY, a: process.env.ANTHROPIC_API_KEY };
    process.env.CLAUDE_API_KEY = "claude-key";
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const f = fakeFetch([{ content: "{}" }]);
      await runWithActor("t-user", () => callJson({ system: "s", messages: [], fetchImpl: f }));
      expect(f.calls.length).toBe(1); // 키가 없다고 던지지 않았다
    } finally {
      if (before.c === undefined) delete process.env.CLAUDE_API_KEY; else process.env.CLAUDE_API_KEY = before.c;
      if (before.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = before.a;
    }
  });

  it("키가 아예 없으면 CLAUDE_API_KEY 를 말하며 던진다", async () => {
    const before = { c: process.env.CLAUDE_API_KEY, a: process.env.ANTHROPIC_API_KEY };
    delete process.env.CLAUDE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        runWithActor("t-user", () => callJson({ system: "s", messages: [], fetchImpl: fakeFetch([{ content: "{}" }]) }))
      ).rejects.toThrow(/CLAUDE_API_KEY/);
    } finally {
      if (before.c !== undefined) process.env.CLAUDE_API_KEY = before.c;
      if (before.a !== undefined) process.env.ANTHROPIC_API_KEY = before.a;
    }
  });

  it("원장에 anthropic/claude-opus-5 로 남고 원가가 0 이 아니다", async () => {
    resetMemoryStore();
    await runWithActor("t-user", () => callJson({
      system: "s", messages: [], fetchImpl: fakeFetch([{ content: "{}" }]), apiKey: "test",
    }));
    const rows = await memoryStore.allCosts();
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe("anthropic/claude-opus-5");
    // usage 가 input 100 · output 50 이므로 100*5/1e6 + 50*25/1e6 = 0.00175
    expect(rows[0].est_cost_usd).toBeCloseTo(0.00175, 6);
    expect(rows[0].stage).toBe("대본");
  });

  // ★ 파싱에 실패해 재시도해도 부른 값은 치렀다 — 기록이 두 줄이어야 한다
  it("파싱 실패로 재시도해도 매 호출이 원장에 남는다", async () => {
    resetMemoryStore();
    await runWithActor("t-user", () => callJson({
      system: "s", messages: [],
      fetchImpl: fakeFetch([{ content: "깨짐{" }, { content: '{"b":2}' }]),
      apiKey: "test",
    }));
    expect(await memoryStore.allCosts()).toHaveLength(2);
  });
});
