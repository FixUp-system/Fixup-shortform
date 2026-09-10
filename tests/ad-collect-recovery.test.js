// 원클릭 수거 — **접수증을 함부로 지우지 않는다** (2026-09-10 안정성 리뷰 §1·§2).
//
// ★★★ 무엇이 어긋나 있었나. reel 은 2026-09-02 에 "일시 오류면 접수증을 지킨다"로
//   고쳐졌는데(lib/reel/pipeline.js 의 classifyFailure 게이트), **광고는 안 고쳐졌다.**
//   `collectAdRender` 의 `catch (e)` 하나가 **어떤 오류든** `failAndRefund` 로 보내고
//   그 안에서 `ad_job: null` 을 찍는다.
//
// ⚠️ 그것이 왜 치명적인가: **fal 에는 요청 목록 API 가 없다**(2026-09-10 실측 405/404).
//   접수증을 지우는 순간 이미 값을 치른 영상($6~13)을 되찾을 길이 **아예 사라진다**.
//   그리고 환불로 `alreadyChargedAd` 가 풀려 사장님이 [다시 만들기] 를 누르면 **두 번째
//   굽기**가 나간다 — 한 편에 두 번 지불이다.
//
// ★★★ 상한도 실물과 어긋나 있었다. `adRenderTimeoutMs(15)` 는 **780초**인데,
//   프로덕션에 멈춰 있던 광고 둘은 `ad_job.seconds = 15` 인데 fal 추론이 **701초·895초**
//   걸렸다(2026-09-10 실측 · 그 편들의 requestId 로 직접 물었다). 즉 상한이 실측 분포
//   **안쪽**에 있다. 그 상한을 넘기면 지금 코드는 다 만들어진 영상을 버리고 환불한다 —
//   `lib/ad/timing.js` 머리말이 스스로 *"가장 나쁜 실패"* 라고 부르는 그것이다.
//   ★ 지금까지 안 터진 이유는 **아무도 안 물어봐서**다. 1분 크론이 붙으면 정각에 터진다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { startAdRender, collectAdRender } from "../lib/ad/pipeline.js";
import { adRenderTimeoutMs, adGiveUpMs } from "../lib/ad/timing.js";
import { balanceFor } from "../lib/charges.js";

const U = "00000000-0000-4000-8000-00000000000d";
const SETTINGS = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const scenario = { text: "P", shots: [{ beat: "가" }], endpoint: "t2v" };
const JOB = {
  requestId: "req-keep", statusUrl: "https://q/status", responseUrl: "https://q/result",
  endpoint: "bytedance/seedance-2.0/text-to-video", seconds: 15,
};

async function submitted() {
  const p = await runWithActor(U, () =>
    createProject({ settings: SETTINGS, material: { text: "앰플 광고", photos: [] }, ownerId: U, kind: "ad" })
  );
  const store = getStore();
  const row = await store.selectProject(p.id, U);
  await store.updateProjectRow(p.id, U, row.version, { ...row.doc, scenario, status: "scenario" });
  await store.insertGrant({ user_id: U, amount_credits: 500, reason: "t" });
  await runWithActor(U, () =>
    startAdRender(p.id, U, { submitAdVideo: async () => ({ ...JOB }), storeVideo: async () => "x" })
  );
  return p;
}

const startedAt = async (id) => Number((await getProject(id, U)).ad_job.startedAt);

describe("일시 오류 — 접수증이 산다", () => {
  beforeEach(() => resetMemoryStore());

  // fal 쪽 **결론이 아닌** 실패들. 다음 회차가 같은 접수증으로 다시 걷을 수 있어야 한다.
  const transient = [
    ["네트워크", "fetch failed"],
    ["혼잡", "영상 생성 실패 (429) too many requests"],
    ["시간 초과", "영상 생성 실패 (504) gateway timeout"],
    ["제공자 5xx", "영상 생성 실패 (503) unavailable"],
  ];

  for (const [name, msg] of transient) {
    it(`★★★ ${name} — ad_job 이 남고 **환불하지 않는다**`, async () => {
      const p = await submitted();
      const before = await balanceFor(U);

      await runWithActor(U, () =>
        collectAdRender(p.id, U, { collectAdVideo: async () => { throw new Error(msg); } })
      );

      const doc = await getProject(p.id, U);
      expect(doc.ad_job?.requestId, "접수증을 지웠다 — 되찾을 길이 없어진다").toBe("req-keep");
      expect(doc.status, "굽는 중이 아니게 됐다").toBe("rendering");
      expect(await balanceFor(U), "일시 오류에 환불했다 — 재시도가 두 번째 굽기를 연다").toBe(before);
    });
  }

  it("★★ 확정 실패(422)는 **그대로 환불하고 접수증을 지운다** — 되찾을 것이 없다", async () => {
    const p = await submitted();
    const before = await balanceFor(U);

    await runWithActor(U, () =>
      collectAdRender(p.id, U, {
        collectAdVideo: async () => { throw new Error("영상 생성 실패 (422) content_policy_violation"); },
      })
    );

    const doc = await getProject(p.id, U);
    expect(doc.ad_job, "확정 실패인데 접수증이 남았다 — 다음 회차가 헛돈다").toBeFalsy();
    expect(doc.video_error, "사장님께 사유가 안 간다").toBeTruthy();
    expect(await balanceFor(U), "확정 실패인데 환불을 안 했다").toBeGreaterThan(before);
  });
});

describe("상한 — 오래 걸린다고 다 만들어진 영상을 버리지 않는다", () => {
  beforeEach(() => resetMemoryStore());

  it("★★★ 실측(15초 광고가 895초)보다 상한이 **넉넉하다**", () => {
    // 2026-09-10 실측: 프로덕션 광고 둘(seconds=15)의 fal 추론이 701초·895초.
    // 상한은 그 **위**여야 한다 — 밑이면 정상으로 구워진 편을 실패로 판정한다.
    expect(adRenderTimeoutMs(15)).toBeGreaterThan(895_000);
    expect(adGiveUpMs(15), "포기 상한이 대기 상한보다 짧다").toBeGreaterThan(adRenderTimeoutMs(15));
  });

  it("★★★ 대기 상한을 넘겨도 **접수증을 지키고 환불하지 않는다** — 알리기만 한다", async () => {
    const p = await submitted();
    const before = await balanceFor(U);
    const t0 = await startedAt(p.id);

    await runWithActor(U, () =>
      collectAdRender(p.id, U, {
        collectAdVideo: async () => ({ done: false }),
        now: () => t0 + adRenderTimeoutMs(15) + 1,
      })
    );

    const doc = await getProject(p.id, U);
    expect(doc.ad_job?.requestId, "늦는다고 접수증을 버렸다").toBe("req-keep");
    expect(await balanceFor(U), "늦는다고 환불했다 — 재시도가 두 번째 굽기를 연다").toBe(before);
    expect(doc.video_error, "오래 걸린다는 것을 사장님께 안 알렸다").toMatch(/오래/);
    expect(doc.status, "아직 굽는 중이다").toBe("rendering");
  });

  it("★★★ **포기 상한**을 넘기면 그때는 환불하고 접수증을 지운다", async () => {
    // 언젠가는 끝내야 한다 — 안 그러면 죽은 접수증을 크론이 영원히 두드린다.
    const p = await submitted();
    const before = await balanceFor(U);
    const t0 = await startedAt(p.id);

    await runWithActor(U, () =>
      collectAdRender(p.id, U, {
        collectAdVideo: async () => ({ done: false }),
        now: () => t0 + adGiveUpMs(15) + 1,
      })
    );

    const doc = await getProject(p.id, U);
    expect(doc.ad_job, "포기했는데 접수증이 남았다").toBeFalsy();
    expect(await balanceFor(U), "포기했는데 환불을 안 했다").toBeGreaterThan(before);
  });
});
