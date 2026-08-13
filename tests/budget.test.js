// 예산 가드 — 기록이 아니라 "나가기 전에 막는 것"이 요점이다.
// 호출한 뒤에 재면 이미 돈이 나간 뒤다.
import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";

let costs;

async function fresh(env = {}) {
  // 원장이 store 로 옮겨가 임시 폴더로는 더 이상 격리되지 않는다 — 인메모리 store 는
  // 모듈 하나라 앞 테스트가 넣은 기록이 그대로 남고, 그러면 합계가 상한을 미리 넘겨
  // "막았어야 한다"와 "통과해야 한다"가 뒤바뀐다. 여기서 원장을 비운다.
  resetMemoryStore();
  process.env.SHOTFORM_FAKE = "off";
  delete process.env.SHOTFORM_FAKE_IMAGES;
  process.env.SHOTFORM_BUDGET_TOTAL_USD = env.total ?? "20";
  // 사용자 축은 이제 고정 상한이 아니라 **잔액**이다(크레딧). 이 파일이 보는 것은
  // 전역 축이므로, 예전에 SHOTFORM_BUDGET_USER_USD="1000" 으로 열어 두던 자리를
  // "넉넉한 충전"으로 바꾼다 — 충전이 없으면 사용자 축이 먼저 걸려 다른 축을 못 본다.
  for (const u of ["t-user", "local"]) {
    await memoryStore.insertGrant({ user_id: u, amount_credits: 1000, reason: "테스트", granted_by: "admin" });
  }
  costs = await import("../lib/costs.js?t=" + Date.now() + Math.random());
}

async function record(mod, { project_id, est_cost_usd }) {
  await mod.addRecord({
    request_id: String(Math.random()), ts: Date.now(), endpoint: "fal-ai/veo3.1",
    stage: "영상", user: "local", project_id,
    prompt: "-", duration: "1", aspect_ratio: "-",
    est_cost_usd, status: "done", video_url: "u",
  });
}

describe("누적 합계", () => {
  beforeEach(() => fresh());

  it("기록이 없으면 0이다", async () => {
    expect(await costs.spentTotal()).toBe(0);
    expect(await costs.spentForProject("p1")).toBe(0);
  });

  it("전체와 프로젝트별을 따로 센다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 1.5 });
    await record(costs, { project_id: "p2", est_cost_usd: 2 });
    expect(await costs.spentTotal()).toBe(3.5);
    expect(await costs.spentForProject("p1")).toBe(1.5);
  });

  it("project_id 없는 옛 기록도 전체에는 들어간다", async () => {
    await record(costs, { project_id: undefined, est_cost_usd: 1 });
    expect(await costs.spentTotal()).toBe(1);
    expect(await costs.spentForProject("p1")).toBe(0);
  });
});

describe("assertBudget", () => {
  beforeEach(() => fresh({ total: "10" }));

  // ★ assertBudget 이 사용자 축도 함께 보게 되면서 costActor() 를 부른다 — actor
  // 컨텍스트 없이 부르면 던진다(lib/actor.js). 이 describe 는 전역 축만
  // 보려는 것이므로 runWithActor 로 감싸고, 사용자 축은 fresh() 의 충전이 열어 둔다.

  it("여유가 있으면 통과한다", async () => {
    // veo3.1 $0.40/s × 5초 = $2.00
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      )
    ).resolves.toBeUndefined();
  });

  // ★ 프로젝트 축이 사라졌다. 요금은 크레딧이 맡고, 폭주 방어는 전역 상한이 맡는다.
  it("한 프로젝트가 옛 상한을 한참 넘겨도 전역 안이면 안 막힌다", async () => {
    await fresh({ total: "1000" });
    await record(costs, { project_id: "p1", est_cost_usd: 100 });
    await runWithActor("t-user", () =>
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ); // 던지지 않으면 통과다
  });

  it("전역 상한은 없다 — 프로젝트가 하나여도 안 막는다", async () => {
    await fresh({ total: "10" });
    await record(costs, { project_id: "p1", est_cost_usd: 9 });
    // 9 + 2 = 11 > 10. 축을 못 박는다 — 이름 없는 toThrow 는 엉뚱한 이유로도 통과한다
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      )
    ).resolves.toBeUndefined();
  });

  // ★ 2026-08-13: 전역 원가 상한을 걷어냈다. env 하나가 전사 공용이라 누가 쓰든 그 숫자에
  // 닿는 순간 모두가 멈췄다 — 크레딧을 내고 산 영상도 함께 죽는다. 요금은 크레딧이 맡고,
  // 여기 남은 그물은 **잔액 음수**와 **체험 한도** 둘이다.
  it("얼마가 쌓여도 원가 총액으로는 막지 않는다", async () => {
    await record(costs, { project_id: "p2", est_cost_usd: 9999 });
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      )
    ).resolves.toBeUndefined();
  });
});

// ★ Task 25 — 광고 경로는 프로젝트 축(폭주 방어)을 안 탄다. "빼는 방식은 명시적이어야
// 한다"는 요구대로 이름 있는 옵션(skipProjectAxis)으로 뺀다 — projectId 를 슬쩍 안 넘겨서
// 우연히 건너뛰게 하지 않는다. 이 describe 는 그 옵션 자체를 단위로 잰다(호출부 배선은
// tests/ad-generate.test.js·tests/ad-pipeline.test.js 몫).
describe("assertBudget — skipProjectAxis", () => {
  beforeEach(() => fresh({ total: "10", project: "3" }));

  it("★ skipProjectAxis:true 면 프로젝트 상한을 넘어도 통과한다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    // 2 + 2 = 4 > 3(프로젝트 상한) 인데 이 축을 뺐으니 통과해야 한다
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5, skipProjectAxis: true })
      )
    ).resolves.toBeUndefined();
  });

  // ★ 병합(2026-08-13): **프로젝트 축은 없다**(main 이 08-12 에 걷어냈다).
  // 크레딧을 내고 산 영상이 상한에 걸려 중간에 죽는 "돈은 있는데 못 만드는" 상태를 만들었다.
  // 광고 브랜치는 그 결정 이전 코드를 들고 왔고, 그쪽도 광고 경로에서 핀을 빼며 같은
  // 문제를 겪었다. skipProjectAxis 인자는 호출부를 안 흔들려고 남겨 두되 아무 일도 안 한다.
  it("프로젝트 상한은 없다 — 얼마가 쌓여도 프로젝트 때문에 막히지 않는다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    await expect(
      runWithActor("t-user", () =>
        costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      )
    ).resolves.toBeUndefined();
  });

  it("★ skipProjectAxis 여도 남은 그물(잔액)은 그대로 막는다", async () => {
    await memoryStore.insertGrant({ user_id: "t-user", amount_credits: -1001, reason: "테스트", granted_by: "admin" });
    // 9 + 2 = 11 > 10(전역 상한) — 프로젝트가 아니라 전역이 잡아야 한다
    await runWithActor("t-user", () =>
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5, skipProjectAxis: true })
    )
      .then(() => { throw new Error("막았어야 한다"); })
      .catch((e) => { expect(e.scope).toBe("user"); });
  });

  it("★ skipProjectAxis 여도 사용자 잔액이 음수면 그대로 막는다", async () => {
    await memoryStore.insertCharge({
      user_id: "t-user", project_id: "p1", kind: "video", credits: 2000, idem_key: "skip-axis-neg",
    });
    await runWithActor("t-user", () =>
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5, skipProjectAxis: true })
    )
      .then(() => { throw new Error("막았어야 한다"); })
      .catch((e) => { expect(e.scope).toBe("user"); });
  });
});

describe("가짜 모드", () => {
  it("가짜 모드에서는 재지도 막지도 않는다 — 0원이므로", async () => {
    await fresh({ total: "0" });
    process.env.SHOTFORM_FAKE = "all";
    const c = await import("../lib/costs.js?t=" + Date.now() + Math.random());
    await expect(
      c.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 100 })
    ).resolves.toBeUndefined();
  });
});

// 가드를 만들어도 부르지 않으면 아무것도 막지 않는다.
// 여기서 보는 것은 "던지는가"가 아니라 "fetch 가 안 불렸는가"다 — 그게 돈이 안 나갔다는 뜻이다.
const bust = () => "?t=" + Date.now() + Math.random();

// ★ 2026-08-13: 전역 원가 상한이 사라졌으니, 이 배선을 재는 방아쇠도 살아 있는 그물로
// 바꾼다 — **잔액이 음수면 fal 이 나가면 안 된다**. 재는 것(가드에 걸리면 fetch 를 안
// 부른다)은 그대로다.
describe("호출부 배선 — 가드에 걸리면 fal 로 나가지 않는다", () => {
  beforeEach(async () => {
    await fresh();
    // 넉넉한 충전을 회수해 잔액을 음수로 만든다(fresh 가 1000 을 넣는다)
    for (const u of ["t-user", "local"]) {
      await memoryStore.insertGrant({ user_id: u, amount_credits: -1001, reason: "테스트", granted_by: "admin" });
    }
  });

  it("이미지: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateImage } = await import("../lib/imagegen.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      runWithActor("t-user", () =>
        generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl })
      )
    ).rejects.toThrow(/크레딧이 모자라요/);
    expect(called).toBe(false);
  });

  it("목소리: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateSpeech } = await import("../lib/tts.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      runWithActor("t-user", () =>
        generateSpeech({ text: "가".repeat(500), voiceId: "v", projectId: "p1", fetchImpl })
      )
    ).rejects.toThrow(/크레딧이 모자라요/);
    expect(called).toBe(false);
  });

  it("영상: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateClip } = await import("../lib/i2v.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      runWithActor("t-user", () =>
        generateClip({ imageUrl: "u", seconds: 5, aspect_ratio: "9:16", projectId: "p1", fetchImpl })
      )
    ).rejects.toThrow(/크레딧이 모자라요/);
    expect(called).toBe(false);
  });
});

describe("비용 기록에 프로젝트가 남는다", () => {
  beforeEach(() => fresh({ total: "100" }));

  it("이미지 기록에 project_id 가 들어간다", async () => {
    const { generateImage } = await import("../lib/imagegen.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ images: [{ url: "https://x/y.png" }] }),
    });
    await runWithActor("t-user", () => generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl }));
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });

  it("목소리 기록에 project_id 가 들어간다", async () => {
    const { generateSpeech } = await import("../lib/tts.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ audio: { url: "https://x/y.mp3", duration: 3 } }),
    });
    await runWithActor("t-user", () => generateSpeech({ text: "가".repeat(500), voiceId: "v", projectId: "p1", fetchImpl }));
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });

  it("영상 기록에 project_id 가 들어간다", async () => {
    const { generateClip } = await import("../lib/i2v.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ video: { url: "https://x/y.mp4" } }),
    });
    await runWithActor("t-user", () => generateClip({ imageUrl: "u", seconds: 5, aspect_ratio: "9:16", projectId: "p1", fetchImpl }));
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });
});

// LLM 비용이 오랫동안 한 줄도 안 남았다. 비용 기록에는 fal 만 보이고,
// 대본을 열 번 다시 써도 0원으로 보였다 — 대본 한 편에 예닐곱 번을 부르는데도.
describe("LLM 비용도 기록한다", () => {
  beforeEach(() => fresh({ total: "100" }));

  it("usage 로 값을 재어 남긴다 — 입력과 출력 단가가 다르다", async () => {
    const { estimateLlmCost } = costs;
    // gpt-4o: 입력 $2.50/1M · 출력 $10/1M
    expect(estimateLlmCost("gpt-4o", { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(2.5);
    expect(estimateLlmCost("gpt-4o", { prompt_tokens: 0, completion_tokens: 1_000_000 })).toBe(10);
    // 센트로 반올림하면 한 호출이 0원이 되어 총합이 실제보다 작아진다
    expect(estimateLlmCost("gpt-4o", { prompt_tokens: 2000, completion_tokens: 300 })).toBeGreaterThan(0);
    // 모르는 모델도 0원으로 보이지 않게 기본 단가로 떨어진다
    expect(estimateLlmCost("모르는-모델", { prompt_tokens: 1_000_000, completion_tokens: 0 })).toBe(2.5);
  });

  it("callJson 이 호출마다 기록을 남긴다", async () => {
    const { callJson } = await import("../lib/llm.js" + bust());
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        model: "gpt-4o",
        usage: { prompt_tokens: 2000, completion_tokens: 400 },
        choices: [{ message: { content: '{"script":"원고"}' } }],
      }),
    });
    await runWithActor("t-user", () => callJson({ system: "s", messages: [{ role: "user", content: "u" }], apiKey: "k", fetchImpl, projectId: "p1", stage: "대본" }));
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });
});
