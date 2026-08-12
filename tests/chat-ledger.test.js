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

  // ★ 파싱 앞에서 기록한다 — 이 태스크의 불변식이다.
  //
  // 응답이 스키마에 안 맞으면 라우트는 한 번 더 부른다(`route.js` 의 attempt 루프).
  // 기록이 파싱 **뒤**로 가면 그 재시도 경로에서 **이미 치른 첫 호출이 원장에서 사라진다** —
  // 이 태스크가 없애려던 "보이지 않는 지출"이 하필 두 배로 쓴 경로에서만 부활한다.
  // 그래서 재는 것은 결과가 아니라 **순서**다: 두 번 부르면 두 줄이다.
  it("파싱에 실패해 두 번 불러도 두 줄 다 남는다 — 부른 값은 치렀다", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...okBody, choices: [{ message: { content: "JSON 아님" } }] }),
    }));
    vi.stubGlobal("fetch", f);
    const res = await POST(req(), {});
    expect(res.status).toBe(502);          // 두 번 다 해석 실패
    expect(f).toHaveBeenCalledTimes(2);    // 두 번 부르고 두 번 다 돈이 나갔다
    const mine = (await memoryStore.allCosts()).filter((r) => r.actor === A);
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.est_cost_usd > 0)).toBe(true);
  });

  // ★★ 이 라우트는 raw fetch 라 **가짜 모드가 안 먹는다** — `SHOTFORM_FAKE=fal` 로 띄워도
  // 대화는 진짜 OpenAI 로 나가 진짜 돈이 든다. 그러니 그 모드에서 게이트가 꺼지면 안 된다.
  //
  // ⚠️ 솔직히 적어 둔다: 이 절은 바로 위 402 테스트와 **거의 중복**이다. 지금 축
  // (`fal-ai/` 인가)에서는 엔드포인트 문자열을 어떻게 바꿔도 LLM 축으로 떨어져 결과가 같다.
  // 축을 옛것(`openai/` 인가)으로 되돌려도 이 절은 그냥 통과한다 — **축을 무는 진짜 못은
  // `tests/llm-gate.test.js` 의 "fal 모드에서 모르는 엔드포인트는 막는다"** 쪽이다.
  // 그래도 남겨 둔다: 이 라우트만은 그 모드에서 진짜 돈이 나가는 유일한 자리라, 이 경로가
  // fal 모드에서 막힌다는 사실 자체를 눈에 보이게 두는 값이 있다.
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
