// LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(addRecord) 한도를 안 봤다.
// 그래서 [대본 다시 쓰기] 를 계속 눌러도 청구가 0 이었다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";

// ★ assertBudget 을 **감싸서** 본다 — 진짜 판정은 그대로 돌리고 "불렸는가"만 잰다.
// 가짜 모드 절이 재려는 것은 결과가 아니라 **순서**다(가짜 판정이 게이트보다 먼저인가).
const costsMock = vi.hoisted(() => ({ assertBudget: vi.fn() }));
vi.mock("../lib/costs.js", async (importOriginal) => {
  const actual = await importOriginal();
  costsMock.assertBudget.mockImplementation(actual.assertBudget);
  return { ...actual, assertBudget: (...a) => costsMock.assertBudget(...a) };
});

const { callJson } = await import("../lib/llm.js");
const { extractBriefing } = await import("../lib/briefing-extract.js");
const { BudgetExceeded, assertBudget } = await import("../lib/costs.js");
const { FREE_TRIAL_USD } = await import("../lib/pricing.js");

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
  beforeEach(() => { resetMemoryStore(); costsMock.assertBudget.mockClear(); });
  afterEach(() => vi.unstubAllEnvs());

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

  // ★ 여기서 재는 것은 "돌아간다"가 아니라 **순서**다 — 가짜 판정이 게이트보다 앞이라
  // 게이트를 **아예 안 부른다**. 결과만 보면 게이트를 지워도, 게이트를 앞으로 옮겨도
  // 똑같이 초록이라 아무것도 못 잡는다.
  it("SHOTFORM_FAKE=all 이면 게이트를 부르지도 않는다 — 0 원이라 잴 것이 없다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    const f = okFetch();
    await expect(call(f)).resolves.toBeTruthy();
    expect(f).not.toHaveBeenCalled();                     // 가짜 응답이라 fetch 자체가 없다
    expect(costsMock.assertBudget).not.toHaveBeenCalled(); // 가짜 판정이 게이트보다 먼저다
  });

  // ★★ 하필 이 모드가 이 저장소가 "비용 배선을 검증하려면" 이라고 지정한 모드다(CLAUDE.md).
  // fal 만 가짜이고 **OpenAI 는 진짜로 나간다** — 그러니 게이트도 진짜로 살아 있어야 한다.
  // 예전 `assertBudget` 첫 줄 `if (fakeFal()) return;` 은 이 모드에서 게이트를 통째로 껐다.
  it("SHOTFORM_FAKE=fal 이면 LLM 게이트는 **살아 있다** — OpenAI 는 진짜로 나간다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    vi.stubEnv("SHOTFORM_FAKE", "fal");
    const f = okFetch();
    await expect(call(f)).rejects.toThrow(BudgetExceeded);
    expect(f).not.toHaveBeenCalled();
  });
});

// 가짜 판정의 축이 둘이다 — 어느 공급자로 나가는가에 따라 물어야 할 것이 다르다.
describe("assertBudget 의 가짜 판정은 엔드포인트로 갈린다", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllEnvs());

  const guard = (endpoint, amount) =>
    runWithActor(A, () => assertBudget({ endpoint, amount }));

  it("fal 모드에서 fal 경로는 그대로 건너뛴다 — 진짜 0 원이다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "fal");
    await expect(guard("fal-ai/nano-banana-2", 1)).resolves.toBeUndefined();
  });

  it("fal 모드에서 openai 경로는 막는다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    vi.stubEnv("SHOTFORM_FAKE", "fal");
    await expect(guard("openai/gpt-4o", 0)).rejects.toThrow(BudgetExceeded);
  });

  it("all 모드에서는 둘 다 건너뛴다", async () => {
    await spend(FREE_TRIAL_USD * 10);
    vi.stubEnv("SHOTFORM_FAKE", "all");
    await expect(guard("fal-ai/nano-banana-2", 1)).resolves.toBeUndefined();
    await expect(guard("openai/gpt-4o", 0)).resolves.toBeUndefined();
  });

  // ★ 방향이 중요하다 — 모르는 엔드포인트는 **막는 쪽**으로 떨어져야 한다.
  // "openai/ 인가"로 갈랐을 때는 접두사를 안 붙인 새 LLM 호출부가 fal 축으로 떨어져
  // `SHOTFORM_FAKE=fal` 에서 게이트가 통째로 꺼졌다(fal 모드는 OpenAI 가 진짜로 나간다).
  it("fal 모드에서 모르는 엔드포인트는 막는다 — fail-closed", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    vi.stubEnv("SHOTFORM_FAKE", "fal");
    await expect(guard("anthropic/claude", 0)).rejects.toThrow(BudgetExceeded);
    await expect(guard("", 0)).rejects.toThrow(BudgetExceeded);
  });

  it("가짜 모드가 아니면 둘 다 막는다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    await expect(guard("fal-ai/nano-banana-2", 1)).rejects.toThrow(BudgetExceeded);
    await expect(guard("openai/gpt-4o", 0)).rejects.toThrow(BudgetExceeded);
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
