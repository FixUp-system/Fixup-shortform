// GPT Image 2 로 이미지 모델을 갈아탄다 (2026-08-24 실측 기준).
//
// 이 파일이 지키는 것 넷:
//   1) 가짜 판정 축 — `openai/gpt-image*` 는 **fal 축**이다. 안 그러면 SHOTFORM_FAKE=fal 에서
//      진짜 돈이 나간다. 단 같은 `openai/` 를 쓰는 **LLM(gpt-4o)** 는 LLM 축 그대로여야 한다.
//   2) 단가 — quality 가 값을 정한다(해상도가 아니다). low $0.012 · medium $0.101 · high $0.401.
//   3) 요청 모양 — image_size 는 **{width,height} 객체**, aspect_ratio·resolution 은 보내면 422.
//   4) 기본 모델 — 코드 기본값과 .env.local.example 이 같아야 한다(갈리면 조용히 옛 모델).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { estimateCost, isFakeFor, IMAGE_RESOLUTION_MULTIPLIER } from "../lib/costs.js";
import { generateImage, activeImageEndpoint, DEFAULT_IMAGE_QUALITY } from "../lib/imagegen.js";
import { runWithActor } from "../lib/actor.js";
import { memoryStore } from "../lib/store/memory.js";

const GPT = "openai/gpt-image-2";

const ok = (seen) => async (url, init) => {
  seen.url = url;
  seen.body = JSON.parse(init.body);
  return { ok: true, json: async () => ({ images: [{ url: "https://f/out.png" }] }) };
};

// env 는 **전부 되돌린다** — 워커가 파일을 이어 도므로 하나라도 남기면 다음 파일이
// 그 값 위에서 돈다(가짜 모드가 새면 "돈이 안 나간다"를 지키는 단정이 거짓으로 통과한다).
const ENV_KEYS = ["FAL_IMAGE_ENDPOINT", "SHOTFORM_FAKE", "SHOTFORM_FAKE_IMAGES", "SHOTFORM_BUDGET_TOTAL_USD"];
const saved = {};
beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.SHOTFORM_BUDGET_TOTAL_USD = "100";
  return memoryStore.insertGrant({ user_id: "t-user", amount_credits: 1000, reason: "테스트", granted_by: "admin" });
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("가짜 판정 축 — openai/gpt-image* 는 fal 이다", () => {
  it("SHOTFORM_FAKE=fal 에서 gpt-image-2 는 가짜다 — 아니면 진짜 돈이 나간다", () => {
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor(GPT)).toBe(true);
    expect(isFakeFor(`${GPT}/edit`)).toBe(true);
  });

  it("★ 같은 openai/ 라도 gpt-4o(LLM)는 LLM 축 그대로다 — 접두사를 넓게 잡으면 안 된다", () => {
    process.env.SHOTFORM_FAKE = "fal";
    expect(isFakeFor("openai/gpt-4o")).toBe(false);
    process.env.SHOTFORM_FAKE = "all";
    expect(isFakeFor("openai/gpt-4o")).toBe(true);
  });
});

describe("단가 — quality 가 정한다(해상도가 아니다)", () => {
  it("low $0.012 · medium $0.101 · high $0.401 (2026-08-24 fal 공식표)", () => {
    expect(estimateCost(GPT, 1, "low")).toBe(0.012);
    expect(estimateCost(GPT, 1, "medium")).toBe(0.101);
    expect(estimateCost(GPT, 1, "high")).toBe(0.401);
  });

  it("/edit 도 같은 단가다 — 접두사가 같다", () => {
    expect(estimateCost(`${GPT}/edit`, 1, "high")).toBe(0.401);
  });

  it("모르는 값·생략은 가장 비싼 쪽으로 본다 — 내려 잡으면 예산 가드가 뚫린다", () => {
    expect(estimateCost(GPT, 1)).toBe(0.401);
    expect(estimateCost(GPT, 1, "auto")).toBe(0.401);
    // 기본값($0.1)으로 떨어지면 원장이 4배 적게 남는다 — 표에 없다는 뜻이다
    expect(estimateCost(GPT, 1)).not.toBe(0.1);
  });

  it("이미지 해상도 배수가 얹히지 않는다 — GPT 는 그 축이 아니다", () => {
    expect(estimateCost(GPT, 1, "2K")).toBe(0.401);
    expect(estimateCost(GPT, 1, "2K")).not.toBe(0.401 * IMAGE_RESOLUTION_MULTIPLIER["2K"]);
  });

  it("장 수만큼 곱해진다", () => {
    expect(estimateCost(GPT, 2, "high")).toBe(0.802);
  });
});

describe("기본 모델", () => {
  it("env 가 없으면 GPT Image 2 다", () => {
    expect(activeImageEndpoint()).toBe(GPT);
  });

  it("quality 기본은 high 다 (2026-08-24 실측에서 medium 보다 확실히 나았다)", () => {
    expect(DEFAULT_IMAGE_QUALITY).toBe("high");
  });

  it("★ .env.local.example 이 코드 기본값과 같다 — 갈리면 조용히 옛 모델로 돌아간다", () => {
    const ex = readFileSync(new URL("../.env.local.example", import.meta.url), "utf8");
    const line = ex.split(/\r?\n/).find((l) => l.startsWith("FAL_IMAGE_ENDPOINT="));
    expect(line).toBe(`FAL_IMAGE_ENDPOINT=${GPT}`);
  });
});

describe("요청 모양 — 모델마다 받는 필드가 다르다", () => {
  it("GPT 는 image_size 를 {width,height} 객체로 받는다 — 프리셋 문자열은 전부 1024 이하다", async () => {
    const seen = {};
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", resolution: "1K", fetchImpl: ok(seen) })
    );
    expect(seen.url).toBe(`https://fal.run/${GPT}`);
    expect(seen.body.image_size).toEqual({ width: 1080, height: 1920 });
    expect(seen.body.quality).toBe("high");
    // 보내면 422 로 거절된다
    expect(seen.body.aspect_ratio).toBeUndefined();
    expect(seen.body.resolution).toBeUndefined();
  });

  it("2K 는 두 배다 — 9:16 이면 2160×3840 (실측 성공한 치수)", async () => {
    const seen = {};
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", resolution: "2K", fetchImpl: ok(seen) })
    );
    expect(seen.body.image_size).toEqual({ width: 2160, height: 3840 });
  });

  it("긴 변이 3840 을 넘지 않는다 — 모델 상한이다", async () => {
    for (const [aspect, res] of [["16:9", "2K"], ["1:1", "2K"], ["9:16", "4K"]]) {
      const seen = {};
      await runWithActor("t-user", () =>
        generateImage({ prompt: "p", aspect_ratio: aspect, projectId: "p1", resolution: res, fetchImpl: ok(seen) })
      );
      const { width, height } = seen.body.image_size;
      expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
    }
  });

  it("레퍼런스가 있으면 /edit 이고 image_urls 를 싣는다", async () => {
    const seen = {};
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
        refs: [{ url: "https://fal.example/a.png" }], fetchImpl: ok(seen) })
    );
    expect(seen.url).toBe(`https://fal.run/${GPT}/edit`);
    expect(seen.body.image_urls).toEqual(["https://fal.example/a.png"]);
    expect(seen.body.image_size).toBeTruthy();
  });

  it("★ nano-banana 로 되돌리면 옛 모양 그대로다 — 갈래가 엔드포인트로 갈린다", async () => {
    process.env.FAL_IMAGE_ENDPOINT = "fal-ai/nano-banana-2";
    const seen = {};
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", resolution: "2K", fetchImpl: ok(seen) })
    );
    expect(seen.body).toEqual({ prompt: "p", aspect_ratio: "9:16", num_images: 1, resolution: "2K" });
    expect(seen.body.image_size).toBeUndefined();
    expect(seen.body.quality).toBeUndefined();
  });
});

describe("원장 — 실제로 나간 값과 장부가 같다", () => {
  it("high 한 장이면 $0.401 로 남는다", async () => {
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p-gpt", resolution: "2K", fetchImpl: ok({}) })
    );
    const row = (await memoryStore.allCosts()).find((r) => r.project_id === "p-gpt");
    expect(row.endpoint).toBe(GPT);
    expect(row.est_cost_usd).toBe(0.401);
  });

  it("quality 를 내리면 장부도 따라 내려간다", async () => {
    await runWithActor("t-user", () =>
      generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p-low", quality: "low", fetchImpl: ok({}) })
    );
    const row = (await memoryStore.allCosts()).find((r) => r.project_id === "p-low");
    expect(row.est_cost_usd).toBe(0.012);
  });
});
