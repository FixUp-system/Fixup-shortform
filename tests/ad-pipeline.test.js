import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { runScenarioStep, runAdRenderPipeline } from "../lib/ad/pipeline.js";
import { balanceFor } from "../lib/charges.js";
import { AD_VIDEO_PRICE } from "../lib/pricing.js";

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
    expect(await balanceFor(U)).toBe(200 - AD_VIDEO_PRICE[15]);
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
});
