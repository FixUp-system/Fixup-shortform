# LLM 을 Claude 로 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 글을 쓰는 모델을 OpenAI gpt-4o 에서 Claude Opus 5 로 옮긴다. 사장님 입장에서는 아무것도 안 바뀐다 — 바뀌는 것은 그 글을 누가 쓰느냐다.

**Architecture:** `lib/llm.js` 의 `callJson` 하나가 LLM 호출 다섯 자리(대본·컷 분할·화면 설계·캐스팅·브리핑)를 전부 받으므로 그 함수만 바꾸면 다섯이 함께 옮겨간다. `app/api/chat/route.js` 는 `callJson` 의 복제라 같은 방식으로 따라간다. SDK 를 쓰되 `fetch` 옵션으로 기존 `fetchImpl` 주입을 그대로 살린다.

**Tech Stack:** `@anthropic-ai/sdk`(설치 완료) · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-llm-to-claude-design.md` 의 "지켜야 할 것"을 그대로 옮긴다.

- ★★ **`temperature` 를 보내면 Claude Opus 5 는 400 이다.** `callJson` 의 인자에서 **지운다** — 남겨 두면 다음 사람이 넘겼다가 라이브에서 죽는다
- ★★ **`fetchImpl` 주입을 깨지 않는다.** SDK 클라이언트의 `fetch` 옵션으로 넘긴다(`node_modules/@anthropic-ai/sdk/client.d.ts:103` 의 `fetch?: Fetch`)
- ★ **호출처 다섯 자리의 시그니처를 바꾸지 않는다** — `lib/script-gen.js:18` · `lib/pipeline.js:38,94,130` · `lib/briefing-extract.js:9`
- ★ **`lib/vlm.js` 를 건드리지 않는다** — 이미지 검수는 gpt-4o vision 그대로다. 그래서 `estimateLlmCost` 는 **OpenAI 와 Anthropic 두 usage 모양을 동시에** 받아야 한다
- **가짜 모드 판정(`isFakeFor`)을 건드리지 않는다** — `anthropic/…` 은 `fal-ai/`·`bytedance/` 가 아니라 `fakeLlm()` 축으로 떨어지고 그것이 맞다
- 원장 기록의 자리(JSON 파싱 **앞**)와 필드 모양(`duration` 의 `N+Mtok` 표기 포함)을 유지한다
- `assertBudget` 의 `amount: 0` 규칙을 유지한다 — LLM 은 부른 뒤에야 토큰을 안다
- **`chat` 라우트에 가짜 모드를 붙이지 않는다** — 알려진 함정이지만 이번 범위가 아니다
- 새 npm 의존성 금지(`@anthropic-ai/sdk` 는 이미 들어와 있다)
- **예상 못 한 실패는 고치지 말고 보고한다**

**모델과 값 (여러 태스크가 쓴다 — 글자 그대로):**

| | 값 |
|---|---|
| 모델 id | `claude-opus-5` |
| 원장 엔드포인트 | `anthropic/claude-opus-5` |
| 입력 단가 | $5 / 1M |
| 출력 단가 | $25 / 1M |
| `max_tokens` | `16000` |
| 키 | `process.env.CLAUDE_API_KEY \|\| process.env.ANTHROPIC_API_KEY` |

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라(문서 숫자는 낡는다). 매 태스크 끝에서 유지되거나 늘어야 한다.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

## ★ 병렬 가능 여부

**Task 1 과 Task 2 는 동시에 돌려도 된다** — 파일이 갈린다.

| Task | 파일 |
|---|---|
| 1 | `lib/costs.js` · `tests/costs.test.js` |
| 2 | `lib/llm.js` · `tests/llm.test.js` (Task 1 의 `estimateLlmCost` 를 쓰지만 시그니처가 안 바뀌어 기다릴 필요 없다) |
| 3 | `tests/llm-gate.test.js` · `tests/chat-ledger.test.js` · `tests/budget*.test.js` · `tests/pipeline.test.js` · `tests/routes.test.js` (Task 2 뒤) |
| 4 | `app/api/chat/route.js` · `tests/chat-generate.test.js` (Task 2 뒤) |
| 5 | `.env.local.example` · `README.md` · `CLAUDE.md` (아무 때나) |
| 6 | 실측 (전부 끝난 뒤, 유료) |

병렬로 돌릴 때는 **각자 자기 테스트 파일만** 돌린다(`npx vitest run` 전체 금지). 전체 테스트는 컨트롤러가 마지막에 한 번 돌린다.

---

### Task 1: 원가표가 Claude 를 안다

**Files:**
- Modify: `lib/costs.js:85-102`(`LLM_PRICE` · `LLM_DEFAULT` · `estimateLlmCost`)
- Test: `tests/costs.test.js`

**Interfaces:**
- Produces: `estimateLlmCost(model, usage)` 가 **OpenAI 와 Anthropic 두 usage 모양을 모두** 받는다.
  `claude-opus-5` 는 입력 $5/1M · 출력 $25/1M

★ `lib/vlm.js` 가 gpt-4o 로 남으므로 두 모양이 **동시에 살아 있다.** 한쪽으로 갈아치우면 이미지 검수 원가가 0 이 된다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/costs.test.js` 에 describe 를 더한다(상단 import 에 `estimateLlmCost` 가 없으면 더한다):

```js
describe("LLM 원가 — 두 공급자의 usage 모양", () => {
  it("Claude 는 input_tokens·output_tokens 로 잰다", () => {
    // 1000 입력 · 500 출력 = 1000*5/1e6 + 500*25/1e6 = 0.005 + 0.0125
    expect(estimateLlmCost("claude-opus-5", { input_tokens: 1000, output_tokens: 500 }))
      .toBeCloseTo(0.0175, 6);
  });

  // ★ vlm.js 가 gpt-4o 로 남는다 — 이 모양이 죽으면 이미지 검수 원가가 0 이 된다
  it("gpt-4o 는 prompt_tokens·completion_tokens 로 잰다 — 그대로다", () => {
    expect(estimateLlmCost("gpt-4o", { prompt_tokens: 1000, completion_tokens: 500 }))
      .toBeCloseTo(0.0075, 6);
  });

  it("모르는 모델은 기본 단가로 떨어진다", () => {
    expect(estimateLlmCost("모르는모델", { input_tokens: 1000, output_tokens: 0 })).toBeGreaterThan(0);
  });

  it("usage 가 없으면 0 이다 — 던지지 않는다", () => {
    expect(estimateLlmCost("claude-opus-5", undefined)).toBe(0);
    expect(estimateLlmCost("claude-opus-5", {})).toBe(0);
  });

  it("6자리까지 남긴다 — 센트로 자르면 한 호출이 0 이 되어 총합이 작아진다", () => {
    // 입력 1토큰 = 0.000005
    expect(estimateLlmCost("claude-opus-5", { input_tokens: 1, output_tokens: 0 })).toBe(0.000005);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: FAIL — Claude 케이스가 0 이다(`input_tokens` 를 안 읽고 `claude-opus-5` 단가도 없다). gpt-4o 케이스는 **지금도 통과한다** — 그것이 지켜야 할 계약이다.

- [ ] **Step 3: 가격표와 판독을 고친다**

`lib/costs.js` 의 해당 블록을 갈아낀다:

```js
// LLM 은 입력·출력 단가가 달라 PRICE_TABLE(단일 단가)에 담기지 않는다.
// 그래서 여기서 따로 잰다.
//
// ⚠️ 단가는 문서 기준 추정이고 실청구로 검증하지 않았다(fal 단가표와 같은 처지다).
//    gpt-4o        : 입력 $2.50/1M · 출력 $10.00/1M
//    claude-opus-5 : 입력 $5.00/1M · 출력 $25.00/1M
const LLM_PRICE = {
  "gpt-4o": { in: 2.5 / 1e6, out: 10 / 1e6 },
  "claude-opus-5": { in: 5 / 1e6, out: 25 / 1e6 },
};
const LLM_DEFAULT = { in: 2.5 / 1e6, out: 10 / 1e6 };

// ★ usage 의 이름이 공급자마다 다르다 — OpenAI 는 prompt/completion, Anthropic 은
//   input/output 이다. **둘 다 받는다**: 대본 계열은 Claude 로 옮겼지만 이미지 검수
//   (lib/vlm.js)는 gpt-4o 로 남아 두 모양이 동시에 살아 있다. 한쪽으로 갈아치우면
//   남은 쪽의 원가가 조용히 0 이 되고, 0 은 예산 가드가 못 보는 값이다.
export function estimateLlmCost(model, usage) {
  const p = LLM_PRICE[model] || LLM_DEFAULT;
  const inTok = Number(usage?.input_tokens ?? usage?.prompt_tokens) || 0;
  const outTok = Number(usage?.output_tokens ?? usage?.completion_tokens) || 0;
  // 센트 단위로 자르면 한 호출이 0원이 되어 총합이 실제보다 작아진다 — 6자리까지 남긴다
  return Math.round((inTok * p.in + outTok * p.out) * 1e6) / 1e6;
}
```

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/costs.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 두 모양이 실제로 다 사는지 변이로 확인한다**

`usage?.input_tokens ?? usage?.prompt_tokens` 를 잠깐 `usage?.input_tokens` 로 바꾸고 돌린다.
Expected: "gpt-4o 는 prompt_tokens·completion_tokens 로 잰다" 가 FAIL.
**이것이 이 태스크에서 가장 중요한 확인이다** — 확인했으면 되돌린다(편집기로).

★ 되돌릴 때 `git checkout` 을 쓰지 마라 — 이 파일의 미커밋 작업까지 사라진다.

- [ ] **Step 6: 커밋**

```bash
git add lib/costs.js tests/costs.test.js
git commit -m "feat(costs): LLM 원가가 Claude 를 안다 — usage 이름 두 벌을 함께 받는다

OpenAI 는 prompt/completion, Anthropic 은 input/output 으로 토큰을 센다.
대본 계열은 Claude 로 옮기지만 이미지 검수는 gpt-4o 로 남아 두 모양이 동시에
살아 있다 — 한쪽으로 갈아치우면 남은 쪽 원가가 조용히 0 이 되고, 0 은 예산
가드가 못 보는 값이다."
```

---

### Task 2: `callJson` 이 Claude 를 부른다 ★ 이 계획의 핵심

**Files:**
- Modify: `lib/llm.js:33-78`(`callJson`)
- Test: `tests/llm.test.js`

**Interfaces:**
- Produces: `callJson({ system, messages, fetchImpl, apiKey, stage, projectId })`.
  **`temperature` 인자가 사라진다.** 반환값·던지는 오류 문구는 그대로

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/llm.test.js` 의 `fakeFetch` 가 OpenAI 응답 모양(`choices[0].message.content`)을 만든다. **Anthropic 모양으로 바꾸고**, 요청 본문을 잡는 헬퍼를 더한다:

```js
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
```

그리고 describe 를 더한다:

```js
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
```

★ 위 두 테스트는 `memoryStore.allCosts()` 로 원장을 읽는다 — `tests/chat-ledger.test.js:51` 이 쓰는 방식과 같다. 이 파일 상단에 `import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";` 가 없으면 더한다.

기존 describe 셋(정상 파싱 · 1회 재시도 · 두 번 실패 시 throw)은 **그대로 둔다** — `fakeFetch` 가 새 모양을 내므로 자동으로 새 계약을 잰다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/llm.test.js`
Expected: FAIL — 지금은 `api.openai.com` 으로 가고 `choices[0].message.content` 를 읽으므로 새 응답 모양에서 파싱이 죽는다.

- [ ] **Step 3: `callJson` 을 갈아낀다**

`lib/llm.js` 상단 import 에 더한다:

```js
import Anthropic from "@anthropic-ai/sdk";
```

그리고 `callJson` 을 갈아낀다. **바뀌는 것은 요청·응답 판독뿐이고, 가짜 판정·예산 게이트·원장 기록의 순서와 자리는 그대로다**:

```js
// Claude JSON 호출 헬퍼 — 파싱 실패 시 1회 재시도.
//
// stage·projectId 는 비용 기록용이다. 오랫동안 LLM 비용이 한 줄도 안 남아, 비용 기록에는
// fal 만 보이고 대본을 열 번 다시 써도 0원으로 보였다. 대본 한 편에 되돌리기·교정까지
// 예닐곱 번을 부르므로 적은 돈이 아니다.
//
// ★ temperature 인자가 없다. Claude Opus 5 는 temperature·top_p·top_k 를 받으면 **400** 이다.
//   되돌리기의 다양성이 그 값에 기대고 있었을 수 있어, 전환 뒤 실측한다(계획의 Task 6).
//
// ★ SDK 를 쓰되 fetch 를 주입한다 — 이 저장소의 테스트는 fetchImpl 로 실제 요청을 잡는다.
export async function callJson({ system, messages, fetchImpl = fetch, apiKey, stage = "대본", projectId }) {
  // 키 검사보다 먼저 본다 — 완전 가짜 모드는 API 키 없이도 돌아야 한다
  if (fakeLlm()) return fakeResponse();
  // ★ 기본값을 인자 자리에 두지 않는다 — 그러면 모듈이 로드되는 시점의 env 로 굳는다.
  //   테스트가 env 를 세웠다 지우므로 부를 때마다 읽어야 한다.
  const key = apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("CLAUDE_API_KEY가 설정되지 않았어요");

  // ★ 오랫동안 LLM 이 예산 그물 밖에 있었다 — 기록은 남기는데(아래 addRecord) 한도를
  // 안 봤다. 그래서 크레딧 0 인 채로 [대본 다시 쓰기] 를 무한히 누를 수 있었다.
  //
  // ★ amount 는 0 이다. fal 은 나가기 전에 값을 알지만 LLM 은 토큰 수를 **호출한 뒤에야**
  // 안다(estimateLlmCost 가 usage 를 받는다). 없는 숫자를 지어내지 않고 "이미 넘었는가"만
  // 판정한다 — 넘침은 최대 한 번이고, 그 한 번은 원장에 남아 다음 호출이 막는다.
  await assertBudget({ projectId, endpoint: `anthropic/${MODEL}`, amount: 0 });

  const client = new Anthropic({ apiKey: key, fetch: fetchImpl });

  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    });
    // 파싱에 실패해 재시도하더라도 호출한 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    const model = data?.model || MODEL;
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `anthropic/${model}`,
      stage, user: costActor(), project_id: projectId,
      prompt: (messages?.[0]?.content || "").slice(0, 300),
      duration: `${data?.usage?.input_tokens ?? 0}+${data?.usage?.output_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(model, data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
    try {
      return JSON.parse(textOf(data));
    } catch {
      // 재시도
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
```

파일 위쪽(`fakeResponse` 아래)에 상수와 판독 헬퍼를 둔다:

```js
// ★ 모델 문자열을 한 곳에 둔다 — 원장 엔드포인트와 요청이 갈리면 원가가 엉뚱한 줄에 붙는다.
//   export 하는 이유는 app/api/chat/route.js 가 같은 값을 써야 하기 때문이다(Task 4).
export const MODEL = "claude-opus-5";

// Opus 5 는 사고가 기본으로 켜져 있고 max_tokens 가 **사고 + 본문의 합계 상한**이다.
// 낮게 잡으면 대본이 중간에 잘린다. 스트리밍 없이 안전한 값으로 시작한다.
export const MAX_TOKENS = 16000;

// Claude 응답의 content 는 블록 배열이다. 텍스트 블록만 이어 붙인다 —
// 사고 블록이 섞여 들어와도 JSON.parse 가 그것을 먹지 않게 한다.
// export 하는 이유는 MODEL 과 같다 — chat 라우트가 같은 판독을 쓴다.
export function textOf(data) {
  return (data?.content || [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("");
}
```

★ `client.messages.create` 는 오류를 **던진다**(SDK 가 상태코드를 예외로 바꾼다). 지금 코드의 `if (!res.ok) throw` 자리는 필요 없다 — SDK 예외가 그대로 위로 올라간다. 오류 문구가 달라지므로, 그 문구를 재는 테스트가 있으면 **고치지 말고 보고하라.**

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/llm.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ temperature 금지를 변이로 확인한다**

`client.messages.create({...})` 에 `temperature: 0.4` 를 잠깐 더하고 돌린다.
Expected: "temperature 를 보내지 않는다" 가 FAIL.
확인했으면 되돌린다(편집기로).

- [ ] **Step 6: 커밋**

```bash
git add lib/llm.js tests/llm.test.js
git commit -m "feat(llm): 대본 계열이 Claude Opus 5 로 나간다

callJson 하나가 LLM 호출 다섯 자리(대본·컷분할·화면설계·캐스팅·브리핑)를 전부
받으므로 이 함수만 바꾸면 다섯이 함께 옮겨간다. 호출처는 한 줄도 안 고쳤다.

★ temperature 인자를 지웠다 — Opus 5 는 받으면 400 이다. 되돌리기 다양성이 그
값에 기대고 있었을 수 있어 전환 뒤 실측한다.

★ SDK 를 쓰되 fetch 를 주입한다. 이 저장소의 테스트는 fetchImpl 로 실제 요청을
잡는데 SDK 가 fetch 옵션을 받아 그 구조가 그대로 산다."
```

---

### Task 3: OpenAI 모양을 기대하던 다른 테스트들

**Files:**
- Modify: `tests/llm-gate.test.js` · `tests/chat-ledger.test.js` · `tests/budget.test.js` · `tests/budget-http.test.js` · `tests/pipeline.test.js` · `tests/routes.test.js` (있는 것만)

**Interfaces:**
- Consumes: Task 2 의 새 `callJson`

★ 이 태스크는 **값을 바꾸는 것이 아니라 모양을 맞추는 것**이다. 기대 숫자가 달라지면 그것은 회귀다.

- [ ] **Step 1: 깨지는 것을 전부 센다**

Run: `npx vitest run tests/llm-gate.test.js tests/chat-ledger.test.js tests/budget.test.js tests/budget-http.test.js tests/pipeline.test.js tests/routes.test.js`

깨진 파일과 이유를 목록으로 적어라(보고서에 넣는다). 두 종류로 갈린다:
- **응답 모양**: `choices[0].message.content` 를 만드는 가짜 fetch → Anthropic 블록 배열로
- **엔드포인트 문자열**: 원장에 심는 `endpoint: "openai/gpt-4o"` → `"anthropic/claude-opus-5"`

- [ ] **Step 2: 파일마다 고치고 그 파일만 돌린다**

각 파일에서:
- 가짜 fetch 가 만드는 응답을 Task 2 Step 1 의 모양으로 바꾼다(`content: [{type:"text", text}]` · `usage: {input_tokens, output_tokens}`)
- 원장에 직접 심는 `endpoint` 문자열을 `anthropic/claude-opus-5` 로 바꾼다.
  ★ 단 **`lib/vlm.js` 를 재는 자리는 `openai/gpt-4o` 그대로 둔다** — 이미지 검수는 안 옮겼다
- `temperature` 를 단정하는 자리가 있으면 지운다

고칠 때마다 그 파일만 돌린다: `npx vitest run tests/<파일>`

★ **기대 숫자(원가·잔액·호출 횟수)를 바꾸지 마라.** 바꿔야만 통과한다면 그것은 회귀이므로 **고치지 말고 보고하라.**

- [ ] **Step 3: 여섯 파일을 함께 돌린다**

Run: `npx vitest run tests/llm-gate.test.js tests/chat-ledger.test.js tests/budget.test.js tests/budget-http.test.js tests/pipeline.test.js tests/routes.test.js`
Expected: PASS 전부

- [ ] **Step 4: 커밋**

```bash
git add tests/
git commit -m "test: OpenAI 모양을 기대하던 테스트를 Anthropic 모양으로

응답 블록 배열·usage 이름·원장 엔드포인트 문자열만 바꿨다. 기대 숫자는 한 군데도
안 건드렸다 — 바꿔야 통과하는 자리가 있었다면 그것은 회귀다.

vlm(이미지 검수)을 재는 자리는 openai/gpt-4o 그대로 뒀다."
```

---

### Task 4: 대화 화면도 Claude 로

**Files:**
- Modify: `app/api/chat/route.js:72-110` 부근
- Test: `tests/chat-generate.test.js`(있으면) · `tests/chat-ledger.test.js`

**Interfaces:**
- Consumes: Task 2 가 만든 `MODEL`·`MAX_TOKENS` 와 같은 값

★ 이 라우트는 `callJson` 의 **복제**다(같은 재시도 2회, 파싱 **앞** 원장 기록, 같은 JSON 파싱). 스트리밍이 아니다.

- [ ] **Step 1: 지금 화면을 읽는다**

Run: `sed -n '1,130p' app/api/chat/route.js`

`SYSTEM_PROMPT`·`messages` 매핑(`m.role === "me" ? "user" : "assistant"`)·오류 문구·원장 기록 자리를 확인한다. **아래 코드를 그 파일의 실제 이름에 맞춰 쓴다.**

- [ ] **Step 2: 실패 테스트를 확인/보강한다**

`tests/chat-generate.test.js` 가 있으면 그 파일의 가짜 fetch 를 Anthropic 모양으로 바꾼다(Task 2 Step 1 과 같은 모양). 없으면 `tests/chat-ledger.test.js` 가 이 라우트의 원장 기록을 재고 있으니 그쪽을 본다.

Run: `npx vitest run tests/chat-generate.test.js tests/chat-ledger.test.js`
Expected: FAIL — 아직 OpenAI 로 나간다.

- [ ] **Step 3: 라우트를 갈아낀다**

`app/api/chat/route.js` 상단에 import 를 더하고:

```js
import Anthropic from "@anthropic-ai/sdk";
```

호출부를 갈아낀다. **재시도 2회·파싱 앞 기록·502 문구는 그대로 유지한다**:

```js
  const client = new Anthropic({ apiKey });

  // 1회 재시도 포함 — JSON 파싱 실패 방어
  for (let attempt = 0; attempt < 2; attempt++) {
    let data;
    try {
      data = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({
          role: m.role === "me" ? "user" : "assistant",
          content: m.text,
        })),
      });
    } catch (e) {
      // SDK 가 상태코드를 예외로 바꾼다 — 기존 !res.ok 자리와 같은 역할이다
      console.error("Claude error:", e?.status, String(e?.message).slice(0, 500));
      return Response.json(
        { error: "대화 모델 호출에 실패했어요. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    }
    // 파싱에 실패해 재시도하더라도 부른 값은 치렀다 — 그래서 파싱 앞에서 기록한다
    // (lib/llm.js 와 같은 규칙).
    const model = data?.model || "claude-opus-5";
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `anthropic/${model}`,
      stage: "대화", user: costActor(), project_id: null,
      prompt: "", duration: `${data?.usage?.input_tokens ?? 0}+${data?.usage?.output_tokens ?? 0}tok`,
      // … 이하 기존 필드 그대로
```

그리고 텍스트 판독을 `data?.choices?.[0]?.message?.content` 에서 `textOf(data)` 로 바꾼다.

★ **`MODEL`·`MAX_TOKENS`·`textOf` 는 Task 2 가 `lib/llm.js` 에서 export 한다.** 이 파일은 그것들을 import 해 쓴다 — 위 코드의 `"claude-opus-5"`·`16000` 리터럴을 `MODEL`·`MAX_TOKENS` 로 바꿔라:

```js
import { MODEL, MAX_TOKENS, textOf } from "../../../lib/llm";
```

경로 깊이는 그 파일의 다른 import 를 보고 맞춰라. 모델 문자열이 두 군데가 되면 한쪽만 바꾸는 날이 오고, 그때 원장 엔드포인트와 실제 요청이 갈린다.

★ `apiKey` 를 읽는 자리도 `CLAUDE_API_KEY || ANTHROPIC_API_KEY` 로 맞춘다.

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/chat-generate.test.js tests/chat-ledger.test.js`
Expected: PASS 전부

- [ ] **Step 5: OpenAI 자취가 남았는지 센다**

Run: `grep -rn "api.openai.com\|gpt-4o\|OPENAI_API_KEY" lib app --include=*.js | grep -v node_modules`

남아야 하는 것은 **`lib/vlm.js` 와 `lib/costs.js` 의 gpt-4o 가격표뿐**이다. 그 밖에 남으면 보고하라.

- [ ] **Step 6: 커밋**

```bash
git add "app/api/chat/route.js" tests/
git commit -m "feat(chat): 대화 화면도 Claude 로

callJson 을 안 거치고 OpenAI 를 직접 부르던 여섯 번째 자리다. 스트리밍이 아니라
callJson 의 복제라 같은 방식으로 옮겼다 — 재시도 2회, 파싱 앞 원장 기록, 502 문구
그대로다.

가짜 모드가 이 자리에 안 먹는 것은 알려진 함정이지만 이번에 고치지 않았다.
옮기는 것과 가짜 모드를 붙이는 것을 섞으면 무엇이 달라졌는지 못 가른다."
```

---

### Task 5: 문서와 env

**Files:**
- Modify: `.env.local.example` · `README.md` · `CLAUDE.md`

- [ ] **Step 1: env 예시를 고친다**

`.env.local.example` 에 `CLAUDE_API_KEY` 를 더한다. `OPENAI_API_KEY` 는 **지우지 마라** — `lib/vlm.js` 가 아직 쓴다. 두 줄이 왜 다 필요한지 한 줄 주석을 붙인다:

```
# 대본·컷분할·화면설계·캐스팅·브리핑·대화 (lib/llm.js)
CLAUDE_API_KEY=
# 이미지 검수·사진 설명만 (lib/vlm.js). 아직 gpt-4o vision 이다
OPENAI_API_KEY=
```

- [ ] **Step 2: README 와 CLAUDE.md 를 고친다**

Run: `grep -n "gpt-4o\|OPENAI\|OpenAI" README.md CLAUDE.md`

나오는 자리를 사실에 맞게 고친다. 특히 `CLAUDE.md` 의 실행 절에 `SHOTFORM_FAKE=fal npm run dev # fal 만 가짜, OpenAI는 진짜` 같은 문구가 있으면 **"OpenAI" 를 "LLM(Claude·OpenAI)" 로** 고친다 — 이제 진짜로 나가는 LLM 이 둘이다.

★ 문서를 새로 쓰지 마라. **틀린 문장만** 고친다.

- [ ] **Step 3: 커밋**

```bash
git add .env.local.example README.md CLAUDE.md
git commit -m "docs: LLM 공급자가 둘이 됐다 — 어느 키가 무엇을 부르는지 적는다

대본 계열은 Claude, 이미지 검수는 아직 gpt-4o vision 이다. 키를 하나만 넣으면
절반이 죽는데 그 사실이 어디에도 안 적혀 있었다."
```

---

### Task 6: ★ 실측 — 없으면 끝난 것이 아니다

**Files:** 없음(측정만). 결과는 보고서와 `docs/` 에 남긴다.

**⚠️ 유료다.** 이 태스크는 **컨트롤러가 사용자 승인을 받은 뒤에** 실행한다. 서브에이전트가 임의로 돌리지 마라.

이 저장소의 원칙이 "측정 없이 품질을 주장하지 않는다" 이고, 공급자를 통째로 바꾸는 것은 프롬프트 수정보다 큰 변경이다.

- [ ] **Step 1: 전체 테스트가 그린인지 먼저 확인한다**

Run: `npx vitest run`
Expected: 시작 시 센 수에서 늘어난 만큼, 전부 그린. 빨간 것이 있으면 **여기서 멈춘다.**

- [ ] **Step 2: 되돌리기 다양성을 잰다**

Run: `node scripts/measure/run-pipeline.mjs tailor 3 30`

서버 로그의 `[대본 xxxxxxxx]` 가 라운드별 글자 수·결함·점수·채택 여부를 남긴다. 볼 것:
- **되돌리기 회차별 결과가 실제로 갈리는가** — `temperature: 0.4` 가 사라진 자리다. 세 회차가 거의 같은 문장을 내면 그 루프가 무의미해진 것이다
- 채택 여부(`scriptScore` 가 낮아질 때만 채택)가 실제로 바뀌는 회차가 있는가

- [ ] **Step 3: 대본 품질을 전환 전과 비교한다**

같은 자료로 잰 결함 수와 목표 길이와의 거리를 gpt-4o 시절 기록과 비교한다. 기록이 없으면 **지금 것을 기준선으로 남기고 그렇게 적는다** — 없는 비교를 지어내지 마라.

- [ ] **Step 4: 결과를 적는다**

관측한 수치를 보고서에 적는다. 판정은 셋 중 하나다:
- **다양성이 유지됐다** → 프롬프트를 건드리지 않는다(사용자 결정: 없는 문제를 미리 막지 않는다)
- **다양성이 무너졌다** → 되돌리기 계열 프롬프트에 다양성 지시를 더하는 **후속 작업을 제안**한다. 이 태스크에서 고치지 마라 — 측정과 수정을 한 태스크에 섞으면 무엇이 효과였는지 못 가른다
- **잘림·파싱 실패가 나왔다** → `MAX_TOKENS` 를 올리는 것이 답인지 판단하고 보고한다

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert` 가 가능하다. 의존은 이렇다:

- **Task 3·4 는 Task 2 에 의존한다**(새 요청/응답 모양)
- **Task 2 는 Task 1 에 의존한다** — 엄밀히는 시그니처가 안 바뀌어 따로 돌지만, Task 1 없이 Task 2 만 되돌리면 원가가 두 이름을 다 읽는 채로 남는다(무해하다)

**Task 2 만 되돌리면** 대본은 gpt-4o 로 돌아가는데 Task 3 이 고친 테스트는 Anthropic 모양을 기대해 빨개진다. 둘을 함께 되돌려라.

**Task 1 을 되돌리면** Claude 원가가 조용히 0 이 된다 — 예산 가드가 못 보는 값이다. Task 2 와 함께 되돌려라.
