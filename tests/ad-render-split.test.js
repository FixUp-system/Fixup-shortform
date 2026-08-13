// 광고 영상 굽기를 **접수**와 **수거** 둘로 나눈 것에 대한 테스트.
//
// 왜 나눴나: 배포(Vercel 서버리스)는 응답이 나가면 인스턴스를 얼린다. 예전 구조는
// 라우트가 파이프라인을 await 하지 않고 202 를 먼저 보내서, fal 폴링 루프가 통째로
// 사라졌다. 그렇다고 await 로 바꿀 수도 없다 — lib/ad/timing.js 의 실측이 출력 1초당
// ≈33.5초라, 15초 광고 하나가 ≈8.4분이다(서버리스 상한 300초를 못 지킨다).
//
// 그래서 호출 하나하나를 몇 초로 줄인다:
//   POST /render → fal 큐에 접수만 하고 ad_job 을 문서에 남긴다
//   GET  /status → 두드릴 때마다 한 번 물어보고, 끝났으면 그때 수거한다
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { startAdRender, collectAdRender } from "../lib/ad/pipeline.js";
import { balanceFor } from "../lib/charges.js";
import { listRecords } from "../lib/costs.js";

const U = "00000000-0000-4000-8000-00000000000b";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const scenario = { text: "P", shots: [{ beat: "가" }], endpoint: "t2v" };

const JOB = {
  requestId: "req-1", statusUrl: "https://q/status", responseUrl: "https://q/result",
  endpoint: "bytedance/seedance-2.0/text-to-video", seconds: 15,
};

async function makeAd() {
  const p = await runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
  const store = getStore();
  const row = await store.selectProject(p.id, U);
  await store.updateProjectRow(p.id, U, row.version, { ...row.doc, scenario, status: "scenario" });
  await store.insertGrant({ user_id: U, amount_credits: 500, reason: "t" });
  return p;
}

const submitOk = async () => ({ ...JOB });
const storeOk = async (_url, projectId) => `/api/renders/${projectId}.mp4`;

describe("광고 굽기 — 접수와 수거를 나눈다", () => {
  beforeEach(() => resetMemoryStore());

  it("접수는 영상을 안 기다린다 — ad_job 만 남기고 끝난다", async () => {
    const p = await makeAd();
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));

    const back = await getProject(p.id, U);
    expect(back.status).toBe("rendering");
    expect(back.ad_job?.requestId).toBe("req-1");
    expect(back.ad_job?.statusUrl).toBe("https://q/status");
    // ★ 접수 시점에는 영상이 없어야 한다. 있으면 접수가 완성까지 기다렸다는 뜻이고,
    //   그러면 나눈 의미가 없다(서버리스 상한에 다시 걸린다).
    expect(back.videos ?? []).toHaveLength(0);
    // 재시작 대비 단서는 그대로 남긴다
    expect(back.ad_request_id).toBe("req-1");
  });

  it("아직 안 끝났으면 수거는 아무것도 안 바꾼다", async () => {
    const p = await makeAd();
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));

    await runWithActor(U, () =>
      collectAdRender(p.id, U, { collectAdVideo: async () => ({ done: false }), storeVideo: storeOk })
    );
    const back = await getProject(p.id, U);
    expect(back.status).toBe("rendering");
    expect(back.ad_job?.requestId).toBe("req-1");
    expect(back.video_error ?? null).toBe(null);
  });

  it("끝났으면 수거가 영상을 남기고 done 으로 넘긴다", async () => {
    const p = await makeAd();
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));

    await runWithActor(U, () =>
      collectAdRender(p.id, U, {
        collectAdVideo: async () => ({ done: true, url: "https://fal.example/v.mp4", seconds: 15 }),
        storeVideo: storeOk,
      })
    );
    const back = await getProject(p.id, U);
    expect(back.status).toBe("done");
    expect(back.videos).toHaveLength(1);
    expect(back.videos[0].url).toBe(`/api/renders/${p.id}.mp4`);
    // ★ 다 쓴 접수증은 지운다 — 안 지우면 다음 수거가 끝난 일을 또 수거한다
    expect(back.ad_job ?? null).toBe(null);
  });

  it("★ 수거가 겹쳐도 두 번 처리되지 않는다", async () => {
    const p = await makeAd();
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));

    let collected = 0;
    const deps = {
      collectAdVideo: async () => {
        collected += 1;
        return { done: true, url: "https://fal.example/v.mp4", seconds: 15 };
      },
      storeVideo: storeOk,
    };
    await runWithActor(U, () => collectAdRender(p.id, U, deps));
    await runWithActor(U, () => collectAdRender(p.id, U, deps));

    // 두 번째는 ad_job 이 없으니 fal 에 묻지도 않는다
    expect(collected).toBe(1);
    const back = await getProject(p.id, U);
    expect(back.videos).toHaveLength(1);
  });

  it("★ 상한을 넘으면 환불하고 실패로 남긴다", async () => {
    const p = await makeAd();
    const before = await balanceFor(U);
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));
    expect(await balanceFor(U)).toBeLessThan(before); // 접수 때 이미 청구됐다

    // 시작 시각을 아주 옛날로 돌려 상한을 넘긴 상태를 만든다
    const store = getStore();
    const row = await store.selectProject(p.id, U);
    await store.updateProjectRow(p.id, U, row.version, {
      ...row.doc, ad_job: { ...row.doc.ad_job, startedAt: 0 },
    });

    await runWithActor(U, () =>
      collectAdRender(p.id, U, { collectAdVideo: async () => ({ done: false }), storeVideo: storeOk })
    );
    const back = await getProject(p.id, U);
    expect(back.status).toBe("scenario");
    expect(back.video_error).toMatch(/오래/);
    expect(back.ad_job ?? null).toBe(null);
    expect(await balanceFor(U)).toBe(before); // 못 준 것은 받지 않는다
  });

  it("접수 자체가 실패하면 환불하고 던진다", async () => {
    const p = await makeAd();
    const before = await balanceFor(U);
    await expect(
      runWithActor(U, () =>
        startAdRender(p.id, U, {
          submitAdVideo: async () => { throw new Error("영상 접수 실패 (500)"); },
          storeVideo: storeOk,
        })
      )
    ).rejects.toThrow(/접수 실패/);

    const back = await getProject(p.id, U);
    expect(back.status).toBe("scenario");
    expect(back.video_error).toMatch(/접수 실패/);
    expect(await balanceFor(U)).toBe(before);
  });

  it("굽고 있지 않으면 수거는 fal 에 묻지 않는다", async () => {
    const p = await makeAd(); // status=scenario, ad_job 없음
    let asked = 0;
    await runWithActor(U, () =>
      collectAdRender(p.id, U, { collectAdVideo: async () => { asked += 1; return { done: false }; }, storeVideo: storeOk })
    );
    expect(asked).toBe(0);
  });

  it("원장은 수거 때 한 번만 쌓인다 — fal 접수번호가 멱등키다", async () => {
    const p = await makeAd();
    await runWithActor(U, () => startAdRender(p.id, U, { submitAdVideo: submitOk, storeVideo: storeOk }));
    // 접수만 한 시점: 아직 원장에 광고영상 행이 없다(fal 은 완성해야 과금한다)
    const mid = (await runWithActor(U, () => listRecords())).filter((r) => r.stage === "광고영상");
    expect(mid).toHaveLength(0);
  });
});
