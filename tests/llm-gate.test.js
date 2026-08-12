// LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(addRecord) 한도를 안 봤다.
// 그래서 [대본 다시 쓰기] 를 계속 눌러도 청구가 0 이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { callJson } from "../lib/llm.js";
import { extractBriefing } from "../lib/briefing-extract.js";
import { BudgetExceeded } from "../lib/costs.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";

async function spend(usd) {
  // 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  await memoryStore.insertCost({
    request_id: `r-${Date.now()}-${Math.random()}`, ts: Date.now(),
    endpoint: "openai/gpt-4o", stage: "대본", user: A, project_id: null,
    est_cost_usd: usd, status: "done",
  });
}

const okFetch = () =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 10 },
      choices: [{ message: { content: '{"ok":true}' } }],
    }),
  }));

const call = (fetchImpl) =>
  runWithActor(A, () =>
    callJson({ system: "s", messages: [{ role: "user", content: "m" }], fetchImpl, apiKey: "k" })
  );

describe("callJson 이 한도를 본다", () => {
  beforeEach(() => resetMemoryStore());

  it("한도 아래면 부른다", async () => {
    const f = okFetch();
    await expect(call(f)).resolves.toEqual({ ok: true });
    expect(f).toHaveBeenCalled();
  });

  // ★ 막는 것이 기록보다 먼저다 — 돈이 나간 뒤에 막으면 막은 것이 아니다.
  it("한도를 넘으면 OpenAI 를 **안 부른다**", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    const f = okFetch();
    await expect(call(f)).rejects.toThrow(BudgetExceeded);
    expect(f).not.toHaveBeenCalled();
  });

  it("가짜 모드는 한도와 무관하게 돈다 — 0 원이라 잴 것이 없다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    const f = okFetch();
    await expect(call(f)).resolves.toBeTruthy();
    expect(f).not.toHaveBeenCalled();   // 가짜 응답이라 fetch 자체가 없다
    vi.unstubAllEnvs();
  });
});

// ★ 브리핑은 체험 사장님이 대본보다 **먼저** 밟는 첫 LLM 호출이다. 추출 루프의 catch 가
// 예산 오류까지 삼키면 라우트가 null 을 받아 502 "자료를 정리하지 못했어요" 를 낸다 —
// 한도에 걸린 사장님이 402 "체험분을 다 썼어요" 대신 고장 화면을 본다.
// lib/script-gen.js 의 세 catch 와 같은 처방이다.
describe("브리핑 추출이 예산 오류를 안 삼킨다", () => {
  const project = { id: "p1", material: { text: "자료", photos: [] }, briefing: null };

  it("예산 오류는 그대로 올라온다 — null 이 아니다", async () => {
    const llm = vi.fn(async () => { throw new BudgetExceeded(1, 1, "trial"); });
    await expect(extractBriefing(project, { llm })).rejects.toThrow(BudgetExceeded);
    expect(llm).toHaveBeenCalledTimes(1);   // 막힌 뒤 두 번째 시도를 하지 않는다
  });

  it("그 밖의 일시적 실패는 여전히 삼키고 null 이다", async () => {
    const llm = vi.fn(async () => { throw new Error("일시적 실패"); });
    await expect(extractBriefing(project, { llm })).resolves.toBeNull();
    expect(llm).toHaveBeenCalledTimes(2);
  });
});
