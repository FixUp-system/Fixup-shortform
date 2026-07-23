import { describe, it, expect } from "vitest";
import { callJson } from "../lib/llm.js";

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
    const out = await callJson({
      system: "s", messages: [{ role: "user", content: "u" }],
      fetchImpl: fakeFetch([{ content: '{"a":1}' }]),
      apiKey: "test",
    });
    expect(out.a).toBe(1);
  });
  it("첫 응답이 깨진 JSON이면 1회 재시도한다", async () => {
    const out = await callJson({
      system: "s", messages: [],
      fetchImpl: fakeFetch([{ content: "깨짐{" }, { content: '{"b":2}' }]),
      apiKey: "test",
    });
    expect(out.b).toBe(2);
  });
  it("두 번 다 실패하면 throw", async () => {
    await expect(
      callJson({ system: "s", messages: [], fetchImpl: fakeFetch([{ content: "x" }]), apiKey: "test" })
    ).rejects.toThrow();
  });
});
