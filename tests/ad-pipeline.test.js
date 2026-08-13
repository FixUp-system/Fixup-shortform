import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { runScenarioStep, runAdRenderPipeline } from "../lib/ad/pipeline.js";
import { balanceFor } from "../lib/charges.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";
import { hasRenderedAdVideo } from "../lib/ad/attempt.js";

const U = "00000000-0000-4000-8000-00000000000a";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0-fast",
};

async function makeAd() {
  return runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
}
const scenario = { text: "P", shots: [{ beat: "가" }], endpoint: "t2v" };

describe("광고 파이프라인", () => {
  beforeEach(() => resetMemoryStore());

  it("시나리오를 만들면 문서에 남고 상태가 scenario 가 된다", async () => {
    const p = await makeAd();
    await runWithActor(U, () =>
      runScenarioStep(p.id, U, { generateScenario: async () => scenario })
    );
    const back = await getProject(p.id, U);
    expect(back.scenario.text).toBe("P");
    expect(back.scenario.tries).toBe(1);
    expect(back.status).toBe("scenario");
  });

  it("다시 쓰면 회차가 는다", async () => {
    const p = await makeAd();
    const deps = { generateScenario: async () => scenario };
    await runWithActor(U, () => runScenarioStep(p.id, U, deps));
    await runWithActor(U, () => runScenarioStep(p.id, U, deps));
    expect((await getProject(p.id, U)).scenario.tries).toBe(2);
  });

  it("상한을 넘으면 던진다", async () => {
    const p = await makeAd();
    const store = getStore();
    const row = await store.selectProject(p.id, U);
    await store.updateProjectRow(p.id, U, row.version, { ...row.doc, scenario: { ...scenario, tries: 20 } });
    await expect(
      runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }))
    ).rejects.toThrow();
  });

  it("성공하면 videos 에 한 개가 남고 done 이 된다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    await runWithActor(U, () =>
      runAdRenderPipeline(p.id, U, {
        generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
        storeVideo: async (url) => url,
      })
    );
    const back = await getProject(p.id, U);
    expect(back.videos.length).toBe(1);
    expect(back.status).toBe("done");
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });

  it("★ 실패하면 환불하고 scenario 로 되돌린다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    await expect(
      runWithActor(U, () =>
        runAdRenderPipeline(p.id, U, {
          generateAdVideo: async () => { throw new Error("fal 죽음"); },
        })
      )
    ).rejects.toThrow();
    const back = await getProject(p.id, U);
    expect(back.status).toBe("scenario");
    expect(back.video_error).toBeTruthy();
    expect(await balanceFor(U)).toBe(200);   // 못 준 것은 안 받는다
  });

  it("시나리오가 없으면 굽지 않는다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await expect(
      runWithActor(U, () => runAdRenderPipeline(p.id, U, { generateAdVideo: async () => ({ url: "x", seconds: 15 }) }))
    ).rejects.toThrow();
    expect(await balanceFor(U)).toBe(200);
  });

  // ★ 매출 누수 회귀(Task 17) — 첫 생성은 65 크레딧을 받는데, 성공한 뒤 [다시 만들기]는
  // 0 크레딧이었다. 그런데 fal 원가는 매번 나간다(readAdLedger 의 active 가 성공 뒤에도
  // 영원히 살아 있어서 chargeAd 가 `if (active) return 0` 로 안 받았다).
  // 이 테스트는 고치기 전에는 두 번째 balanceFor 단정에서 실패해야 한다(RED).
  it("★ 성공해서 done 이 된 뒤 다시 구우면 정가를 또 받는다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    const deps = {
      generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
      storeVideo: async (url) => url,
    };
    await runWithActor(U, () => runAdRenderPipeline(p.id, U, deps));
    expect((await getProject(p.id, U)).status).toBe("done");
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);

    // [다시 만들기] — 시나리오는 그대로고 영상만 새로 굽는다. fal 원가는 또 나간다.
    await runWithActor(U, () => runAdRenderPipeline(p.id, U, deps));
    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
    expect(back.videos.length).toBe(1); // 최신 한 편으로 덮어쓴다 — 회차 목록이 아니다
    // ★ 핵심 단정 — 정가를 또 받아 잔액이 두 번째로 준다
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15] * 2);
  });

  // ★ 한 번의 굽기 안에서는 여전히 한 번만 받는다 — openNewAttempt 를 더한 것이
  //   runAdRenderPipeline 안에서 chargeAd 를 두 번 부르게 만들지 않았는지 확인한다.
  it("한 번의 굽기 안에서는 여전히 한 번만 받는다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));
    await runWithActor(U, () =>
      runAdRenderPipeline(p.id, U, {
        generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
        storeVideo: async (url) => url,
      })
    );
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE["seedance-2.0-fast"][15]);
  });
});

// hasRenderedAdVideo — "이미 영상 있음" 판정을 한 곳에 두는 순수 헬퍼(lib/ad/attempt.js).
// 파이프라인과 라우트가 이 함수를 같이 불러 판정이 갈리지 않게 한다.
describe("hasRenderedAdVideo — 회차 판정 헬퍼", () => {
  it("videos[0].url 이 있으면 true", () => {
    expect(hasRenderedAdVideo({ videos: [{ url: "/api/renders/x.mp4" }] })).toBe(true);
  });
  it("videos 가 없거나 비어 있으면 false", () => {
    expect(hasRenderedAdVideo({})).toBe(false);
    expect(hasRenderedAdVideo({ videos: [] })).toBe(false);
    expect(hasRenderedAdVideo(null)).toBe(false);
  });
});

// storeVideoDefault(진짜 fal → 우리 renders 버킷) — deps.storeVideo 를 안 주입해서 재는 자리.
// 위 테스트들은 전부 storeVideo 를 주입해 이 함수를 건너뛰었다 — 그래서 이름을 무작위 uuid 로
// 짓던 버그(app/api/renders/[name]/route.js 가 파일명에서 프로젝트 id 를 되찾지 못해 404)를
// 어떤 테스트도 못 잡았다.
describe("광고 파이프라인 — storeVideoDefault", () => {
  beforeEach(() => resetMemoryStore());
  afterEach(() => vi.unstubAllGlobals());

  it("★ 완성본을 프로젝트 id 이름으로 renders 버킷에 올리고 그 URL 을 돌려준다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));

    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })));

    await runWithActor(U, () =>
      // storeVideo 를 안 준다 — 진짜 storeVideoDefault 경로를 부른다
      runAdRenderPipeline(p.id, U, {
        generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
      })
    );

    const back = await getProject(p.id, U);
    // ★ 가장 중요한 단정 — 파일명에서 뽑은 uuid 가 프로젝트 id 와 같아야
    // /api/renders/[name] 라우트(UUID_MP4 정규식으로 이름에서 id 를 되찾는다)가 소유자를 찾는다.
    // 무작위 이름이면 getProject(무작위id, ownerId) 가 null 이라 그 라우트는 404 를 낸다.
    expect(back.videos[0].url).toBe(`/api/renders/${p.id}.mp4`);

    const stored = await getStore().getObject("renders", `${p.id}.mp4`);
    expect(Buffer.from(stored)).toEqual(Buffer.from(bytes));
  });

  it("완성본을 못 내려받으면(res.ok===false) 던진다", async () => {
    const p = await makeAd();
    await getStore().insertGrant({ user_id: U, amount_credits: 200, reason: "t" });
    await runWithActor(U, () => runScenarioStep(p.id, U, { generateScenario: async () => scenario }));

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(
      runWithActor(U, () =>
        runAdRenderPipeline(p.id, U, {
          generateAdVideo: async () => ({ url: "https://fal.example/v.mp4", seconds: 15 }),
        })
      )
    ).rejects.toThrow();
  });
});
