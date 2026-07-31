import { describe, it, expect, afterEach } from "vitest";
import { callJson } from "../lib/llm.js";
import { runWithActor } from "../lib/actor.js";

function fakeFetch(responses) {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      json: async () => ({ choices: [{ message: { content: r.content } }] }),
      text: async () => r.content || "",
    };
  };
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
    await expect(
      callJson({ system: "s", messages: [], fetchImpl: fakeFetch([{ content: "x" }]), apiKey: "test" })
    ).rejects.toThrow();
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
    expect(out.script).toBeTruthy();
  });

  it("검증기 네 개가 요구하는 키를 모두 담는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const out = await callJson({ system: "s", messages: [], apiKey: undefined });
    // 어느 호출부가 받아도 통과하도록 — 프롬프트로 갈라 주지 않는다
    expect(typeof out.topic).toBe("string");
    expect(Array.isArray(out.key_points)).toBe(true);
    expect(out.script.replace(/\s/g, "").length).toBeGreaterThanOrEqual(20);
    expect(Array.isArray(out.cuts)).toBe(true);   // 빈 배열 → 문장당 한 컷 폴백
    expect(Array.isArray(out.shots)).toBe(true);  // 빈 배열 → 화면 설계 없이 진행
  });
});
