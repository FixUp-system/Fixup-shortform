// /api/chat 은 lib/llm.js 를 안 거치고 OpenAI 를 직접 부른다 — 그래서 이 지출만
// 원장에 안 남았다. 우리 비용 화면에 존재하지 않는 유일한 지출이었다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { FREE_TRIAL_USD } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";
const { POST } = await import("../app/api/chat/route.js");

const req = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ messages: [{ role: "me", text: "안녕" }] }),
  });

async function spend(usd) {
  // 스토어 메서드는 insertCost 다(addRecord 는 lib/costs.js 의 감싼 이름).
  await memoryStore.insertCost({
    request_id: `r-${Date.now()}-${Math.random()}`, ts: Date.now(),
    endpoint: "openai/gpt-4o", stage: "대화", user: A, project_id: null,
    est_cost_usd: usd, status: "done",
  });
}

const okBody = {
  model: "gpt-4o",
  usage: { prompt_tokens: 100, completion_tokens: 50 },
  // ask 는 message 가 문자열이어야 라우트가 받는다 — 아니면 재시도로 넘어가 502 다
  // (그러면 호출이 두 번이라 원장 행도 두 줄이다).
  choices: [{ message: { content: '{"action":"ask","message":"네"}' } }],
};

describe("POST /api/chat", () => {
  beforeEach(() => {
    resetMemoryStore();
    vi.unstubAllGlobals();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("부른 값을 원장에 남긴다 — 안 남기면 우리 비용 화면에서 안 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => okBody })));
    const res = await POST(req(), {});
    expect(res.status).toBe(200);
    // 스토어의 읽기 메서드는 allCosts 다. 사용자 필드는 `actor` 로 저장된다.
    const rows = await memoryStore.allCosts();
    const mine = rows.filter((r) => r.actor === A);
    expect(mine).toHaveLength(1);
    expect(mine[0].endpoint).toMatch(/gpt-4o/);
    expect(mine[0].est_cost_usd).toBeGreaterThan(0);
  });

  // ★ 막는 것이 부르는 것보다 먼저다.
  it("한도를 넘으면 OpenAI 를 안 부르고 402 다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    const f = vi.fn(async () => ({ ok: true, json: async () => okBody }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req(), {});
    expect(res.status).toBe(402);
    expect(f).not.toHaveBeenCalled();
  });

  // ★★ 이 라우트는 raw fetch 라 **가짜 모드가 안 먹는다** — `SHOTFORM_FAKE=fal` 로 띄워도
  // 대화는 진짜 OpenAI 로 나가 진짜 돈이 든다. 그러니 그 모드에서 게이트가 꺼지면 안 된다.
  // 우리가 넘기는 "openai/gpt-4o" 가 LLM 축으로 제대로 떨어지는지를 여기서 못 박는다.
  it("SHOTFORM_FAKE=fal 이어도 게이트는 살아 있다 — 대화는 진짜로 나간다", async () => {
    await spend(FREE_TRIAL_USD + 0.01);
    vi.stubEnv("SHOTFORM_FAKE", "fal");
    const f = vi.fn(async () => ({ ok: true, json: async () => okBody }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req(), {});
    expect(res.status).toBe(402);
    expect(f).not.toHaveBeenCalled();
  });

  it("응답에도 서버 로그에도 API 키가 없다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "" })));
    const body = await (await POST(req(), {})).text();
    expect(body).not.toContain("test-key");
    expect(spy.mock.calls.flat().map(String).join(" ")).not.toContain("test-key");
    spy.mockRestore();
  });
});
