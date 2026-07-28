// 예산 가드 — 기록이 아니라 "나가기 전에 막는 것"이 요점이다.
// 호출한 뒤에 재면 이미 돈이 나간 뒤다.
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let costs;

async function fresh(env = {}) {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  process.env.SHOTFORM_FAKE = "off";
  delete process.env.SHOTFORM_FAKE_IMAGES;
  process.env.SHOTFORM_BUDGET_TOTAL_USD = env.total ?? "20";
  process.env.SHOTFORM_BUDGET_PROJECT_USD = env.project ?? "5";
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
  beforeEach(() => fresh({ total: "10", project: "3" }));

  it("여유가 있으면 통과한다", async () => {
    // veo3.1 $0.40/s × 5초 = $2.00
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });

  it("이번 호출을 더해 프로젝트 상한을 넘으면 막는다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    // 2 + 2 = 4 > 3
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).rejects.toThrow(/예산 상한/);
  });

  it("다른 프로젝트가 쓴 것은 이 프로젝트 상한에 들어가지 않는다", async () => {
    await record(costs, { project_id: "p2", est_cost_usd: 2.9 });
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });

  it("전체 상한은 프로젝트를 가리지 않고 넘으면 막는다", async () => {
    await record(costs, { project_id: "p2", est_cost_usd: 9 });
    // 9 + 2 = 11 > 10
    await expect(
      costs.assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
    ).rejects.toThrow(/예산 상한/);
  });

  it("어느 상한에 걸렸는지 알려준다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2 });
    await costs
      .assertBudget({ projectId: "p1", endpoint: "fal-ai/veo3.1", amount: 5 })
      .then(() => { throw new Error("막았어야 한다"); })
      .catch((e) => { expect(e.scope).toBe("project"); });
  });

  it("projectId가 없으면 전체 상한만 본다", async () => {
    await record(costs, { project_id: "p1", est_cost_usd: 2.9 });
    await expect(
      costs.assertBudget({ endpoint: "fal-ai/veo3.1", amount: 5 })
    ).resolves.toBeUndefined();
  });
});

describe("가짜 모드", () => {
  it("가짜 모드에서는 재지도 막지도 않는다 — 0원이므로", async () => {
    await fresh({ total: "0", project: "0" });
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

describe("호출부 배선 — 가드에 걸리면 fal 로 나가지 않는다", () => {
  beforeEach(() => fresh({ total: "0.01", project: "0.01" }));

  it("이미지: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateImage } = await import("../lib/imagegen.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });

  it("목소리: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateSpeech } = await import("../lib/tts.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateSpeech({ text: "가".repeat(500), voiceId: "v", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });

  it("영상: 상한을 넘으면 fetch 를 부르지 않는다", async () => {
    const { generateClip } = await import("../lib/i2v.js" + bust());
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    await expect(
      generateClip({ imageUrl: "u", seconds: 5, aspect_ratio: "9:16", projectId: "p1", fetchImpl })
    ).rejects.toThrow(/예산 상한/);
    expect(called).toBe(false);
  });
});

describe("비용 기록에 프로젝트가 남는다", () => {
  beforeEach(() => fresh({ total: "100", project: "100" }));

  it("이미지 기록에 project_id 가 들어간다", async () => {
    const { generateImage } = await import("../lib/imagegen.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ images: [{ url: "https://x/y.png" }] }),
    });
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl });
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });

  it("목소리 기록에 project_id 가 들어간다", async () => {
    const { generateSpeech } = await import("../lib/tts.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ audio: { url: "https://x/y.mp3", duration: 3 } }),
    });
    await generateSpeech({ text: "가".repeat(500), voiceId: "v", projectId: "p1", fetchImpl });
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });

  it("영상 기록에 project_id 가 들어간다", async () => {
    const { generateClip } = await import("../lib/i2v.js" + bust());
    const fetchImpl = async () => ({
      ok: true, json: async () => ({ video: { url: "https://x/y.mp4" } }),
    });
    await generateClip({ imageUrl: "u", seconds: 5, aspect_ratio: "9:16", projectId: "p1", fetchImpl });
    expect(await costs.spentForProject("p1")).toBeGreaterThan(0);
  });
});
