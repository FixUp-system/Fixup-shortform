// 게이트 — **막는가**. 얼마를 받는지는 tests/charge-routes.test.js 가 잰다.
//
// 게이트가 둘이다:
//   ① 시작 게이트 — 유료 흐름을 시작하기 전에 정가를 낼 수 있는지 본다(모자라면 402).
//   ② 호출 게이트 — fal 로 나가기 직전. 정가는 이미 받았으므로 여기서 다시 재지 않고,
//      **잔액이 음수인 채로 나가는 것**만 막는다(청구 없이 도는 경로의 그물).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { assertBudget, addRecord, spentForProject } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
// 정가는 길이 × 모델로 갈린다. 이 파일은 모델을 안 넘기는 경로만 재므로
// 레거시(Kling) 표를 읽는다 — 라우트가 폴백하는 표와 같은 자리다.
import { VIDEO_PRICE } from "../lib/pricing.js";
import { chargeVideo } from "../lib/charges.js";

// 라우트가 fire-and-forget 으로 부르는 오케스트레이터는 모킹한다 —
// 여기서 볼 것은 "시작을 막았는가"지 관통이 아니다.
vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";
import { POST as autoPOST } from "../app/api/projects/[id]/auto/route.js";

// 단계별 라우트도 같은 자를 쓴다 — 파이프라인은 전부 모킹한다.
const pipelineMock = vi.hoisted(() => ({ run: vi.fn(async () => {}), regen: vi.fn(async () => ({ idx: 0 })) }));
vi.mock("../lib/pipeline.js", () => ({
  runSplitPipeline: (...a) => pipelineMock.run(...a),
  runImagesPipeline: (...a) => pipelineMock.run(...a),
  runVoicePipeline: (...a) => pipelineMock.run(...a),
  runVideoPipeline: (...a) => pipelineMock.run(...a),
  runRenderPipeline: (...a) => pipelineMock.run(...a),
  regenCut: (...a) => pipelineMock.regen(...a),
  regenVoice: (...a) => pipelineMock.regen(...a),
  regenClip: (...a) => pipelineMock.regen(...a),
}));
import { POST as voicePOST } from "../app/api/projects/[id]/voice/route.js";
import { POST as imagesPOST } from "../app/api/projects/[id]/images/route.js";
import { POST as clipsPOST } from "../app/api/projects/[id]/clips/route.js";
import { POST as cutRegenPOST } from "../app/api/projects/[id]/cuts/[idx]/regen/route.js";
import { POST as voiceRegenPOST } from "../app/api/projects/[id]/voice/[idx]/regen/route.js";
import { POST as clipRegenPOST } from "../app/api/projects/[id]/clips/[idx]/regen/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ORIG = { ...process.env };

// 되돌릴 때 undefined 를 그대로 넣으면 문자열 "undefined" 가 된다 — 지워야 한다
const restore = (k) => {
  if (ORIG[k] === undefined) delete process.env[k];
  else process.env[k] = ORIG[k];
};

// PRICE_TABLE 에 실제로 있는 prefix 다($0.084/s) — 없는 문자열을 쓰면 기본 단가로 떨어진다
const KLING = "fal-ai/kling-video/v3/standard/image-to-video";

const grantTo = (user, n) =>
  getStore().insertGrant({ user_id: user, amount_credits: n, reason: "충전", granted_by: ADMIN });
const chargeTo = (user, n, key) =>
  getStore().insertCharge({
    user_id: user, project_id: "p", kind: "video", credits: n, idem_key: key,
  });

describe("호출 게이트 — 사용자 축은 잔액이다", () => {
  beforeEach(() => {
    resetMemoryStore();
    // 전역 상한은 이 테스트의 관심사가 아니다 — 넉넉히 열어 둔다
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "1000";
    delete process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_FAKE_IMAGES;
  });
  afterEach(() => {
    restore("SHOTFORM_BUDGET_TOTAL_USD");
    restore("SHOTFORM_FAKE");
    restore("SHOTFORM_FAKE_IMAGES");
  });

  it("잔액이 음수면 막는다 — 정가를 받고도 넘긴 경로가 계속 돌면 안 된다", async () => {
    await grantTo(A, 50);
    await chargeTo(A, 60, "over-1");
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "user" });
    });
  });

  it("정가를 다 쓴 잔액 0 은 통과한다 — 그 값은 시작 전에 이미 받았다", async () => {
    await grantTo(A, VIDEO_PRICE["kling-v3"][30]);
    await chargeTo(A, VIDEO_PRICE["kling-v3"][30], "paid-1");
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 })).resolves.toBeUndefined();
    });
  });

  it("남의 청구는 내 잔액을 안 갉아먹는다", async () => {
    await grantTo(A, 10);
    await chargeTo(B, 1000, "other-1");
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 })).resolves.toBeUndefined();
    });
  });

  it("전역 상한은 그대로 회사 안전핀이다 — 잔액이 넉넉해도 막힌다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "0.01";
    await grantTo(A, 1000);
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "total" });
    });
  });

  // ★ 프로젝트 축은 걷어냈다(2026-08-12) — 요금 상한처럼 굴어 정상 사용을 막았다.
  // 한 프로젝트가 아무리 써도 전역 안이면 지나가야 한다.
  it("프로젝트 축은 없다 — 한 프로젝트가 많이 써도 전역 안이면 지나간다", async () => {
    await grantTo(A, 1000);
    await runWithActor(A, async () => {
      // 같은 프로젝트로 여러 번 불러 누적을 옛 상한($30) 위로 올린다
      for (let i = 0; i < 80; i++) {
        await assertBudget({ projectId: "p1", endpoint: KLING, amount: 15 });
        await addRecord({
          request_id: `p1-${i}`, ts: Date.now(), endpoint: KLING, stage: "영상",
          user: A, project_id: "p1", prompt: "-", duration: "15", aspect_ratio: "-",
          est_cost_usd: 1.26, status: "done", video_url: "u",
        });
      }
      expect(await spentForProject("p1")).toBeGreaterThan(30);
      await expect(assertBudget({ projectId: "p1", endpoint: KLING, amount: 5 }))
        .resolves.toBeUndefined();
    });
  });
});

// ── 시작 게이트 — 유료 흐름을 **시작하기 전에** 정가를 낼 수 있는지 본다.
// 호출 게이트(위)만 있으면 자동 관통이 중간에 끊겨 "돈은 나갔는데 영상이 없다"가 남는다.
const headersFor = (id) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const autoReq = (id) =>
  new Request("http://localhost/api/projects/x/auto", {
    method: "POST", headers: headersFor(id), body: JSON.stringify({ voice_label: "차분한 여성" }),
  });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function makeProject(ownerId = A) {
  return projects.createProject({
    ownerId, settings: { aspect_ratio: "9:16", target_seconds: 30 },
    material: { text: "자료", photos: [] },
  });
}

describe("시작 게이트 — 자동 관통", () => {
  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });
  afterEach(() => restore("SHOTFORM_FAKE"));

  it("잔액이 없으면 402 이고 파이프라인이 안 불린다", async () => {
    const p = await makeProject();
    const res = await autoPOST(autoReq(A), ctx(p.id));
    expect(res.status).toBe(402);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("정가에 한 크레딧이라도 모자라면 402 — 반 편만 만들게 두지 않는다", async () => {
    const p = await makeProject();
    await grantTo(A, VIDEO_PRICE["kling-v3"][30] - 1);
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(402);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("정가가 있으면 202 로 시작한다", async () => {
    const p = await makeProject();
    await grantTo(A, VIDEO_PRICE["kling-v3"][30]);
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(202);
    expect(runAutoPipeline).toHaveBeenCalledTimes(1);
  });

  it("가짜 모드에서는 막지 않는다 — 0원이라 잴 것이 없다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await makeProject();
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(202);
  });

  // 402 를 받은 뒤에도 auto.state 는 그대로여야 한다 — 세워 두면 충전 후 다시 눌러도
  // "이미 만드는 중"(409)에 막혀 빠져나갈 문이 없다.
  it("402 를 받아도 auto running 을 세우지 않는다 — 충전 뒤 다시 누를 수 있어야 한다", async () => {
    const p = await makeProject();
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(402);
    expect((await projects.getProject(p.id, A)).auto?.state).not.toBe("running");
    await grantTo(A, 500);
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(202);
  });
});

describe("시작 게이트 — 단계별", () => {
  const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });
  const post = (url, body) =>
    new Request(url, { method: "POST", headers: headersFor(A), body: JSON.stringify(body ?? {}) });

  // 단계별 라우트의 기존 가드(400·409)를 전부 통과한 프로젝트 — 걸리는 곳이 크레딧뿐이게.
  async function projectWithAudio(cut = {}) {
    const p = await makeProject();
    return projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, text: "한 문장.", seconds: 3, audio: { url: "/a.mp3", seconds: 3 }, ...cut }],
    }));
  }

  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });
  afterEach(() => restore("SHOTFORM_FAKE"));

  it("정가가 없으면 이미지 시작이 402 이고 파이프라인이 안 불린다", async () => {
    await grantTo(A, VIDEO_PRICE["kling-v3"][30] - 1);
    const p = await projectWithAudio();
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("정가가 있으면 이미지 시작이 200 이다", async () => {
    await grantTo(A, VIDEO_PRICE["kling-v3"][30]);
    const p = await projectWithAudio();
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledTimes(1);
  });

  // 목소리·클립도 **살아 있는 청구를 요구한다.** 정가에 포함이라 값을 또 받지는 않지만,
  // 안 낸(또는 환불받은) 프로젝트가 이 문으로 걸어 들어오면 그 자리에서 정가를 받는다.
  // 문을 뺐더니 "실패 → 환불 → /clips" 로 순지불 0 완성본이 나왔다.
  it("정가를 안 낸 프로젝트는 목소리·클립 시작도 402 다", async () => {
    const p = await projectWithAudio({ audio: null });
    expect((await voicePOST(post("http://localhost/v", { voiceLabel: "밝은 여성" }), ctx(p.id))).status).toBe(402);
    const q = await projectWithAudio({ image: { url: "i0" } });
    expect((await clipsPOST(post("http://localhost/c"), ctx(q.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  // ★ 말하는 프로젝트(Seedance)의 돈 계약. ③목소리는 아무것도 사지 않으므로 문을 그냥 열고
  // (클립이 목소리를 만든다), 정가는 다음 문인 ④이미지가 받는다. 이 계약이 깨지는 두 방향을
  // 한 자리에서 잠근다: 안 사는 자리에서 받거나, 받는 자리를 열어 주거나.
  it("말하는 프로젝트 — /voice 는 잔액 0 에서도 200 이고 정가는 /images 가 받는다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "cuts",
      settings: { ...proj.settings, i2v_model: "seedance-2.0" },
      cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
      cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
    }));

    // 잔액 0 인데도 열린다 — 여기서 사는 것이 없다. 파이프라인도 안 돈다.
    expect((await voicePOST(post("http://localhost/v"), ctx(p.id))).status).toBe(200);
    expect(pipelineMock.run).not.toHaveBeenCalled();

    // 정가는 이 문이 받는다 — 모자라면 402(Seedance 30초 = 160 크레딧)
    await grantTo(A, VIDEO_PRICE["seedance-2.0"][30] - 1);
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();

    // 정가가 차면 통과한다 — 목소리를 건너뛴 것이 흐름을 막지 않는다
    await grantTo(A, 1);
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(200);
  });

  it("정가가 있으면 목소리·클립 시작이 200 이다", async () => {
    await grantTo(A, 500);
    const p = await projectWithAudio({ audio: null });
    expect((await voicePOST(post("http://localhost/v", { voiceLabel: "밝은 여성" }), ctx(p.id))).status).toBe(200);
    const q = await projectWithAudio({ image: { url: "i0" } });
    expect((await clipsPOST(post("http://localhost/c"), ctx(q.id))).status).toBe(200);
  });

  // 재생성도 **살아 있는 청구를 요구한다** — 정가를 낸 프로젝트로 픽스처를 만든다.
  // (안 낸/환불된 프로젝트가 재생성으로 걸어 들어오는 경우는 charge-routes 가 잰다)
  const paidProject = async (cut) => {
    const p = await projectWithAudio(cut);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    return p;
  };

  it("컷당 첫 재생성은 공짜라 잔액 0 이어도 200 이다", async () => {
    await grantTo(A, VIDEO_PRICE["kling-v3"][30]);          // 정가만 내고 잔액 0
    const p = await paidProject();
    expect((await cutRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(200);
    expect((await voiceRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(200);
    expect((await clipRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(200);
  });

  it("둘째 재생성부터는 잔액이 없으면 402 다", async () => {
    await grantTo(A, VIDEO_PRICE["kling-v3"][30]);          // 정가만 내고 잔액 0
    const p = await paidProject({ regen_count: 1, voice_regen_count: 1, clip_regen_count: 1 });
    expect((await cutRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await voiceRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await clipRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect(pipelineMock.regen).not.toHaveBeenCalled();
  });

  // 정가를 아예 안 낸 프로젝트는 재생성 입구에서도 막힌다 — 첫 회가 공짜라도 그렇다.
  // 이 문이 없으면 "실패 → 환불 → 컷별 재생성 → /render" 로 순지불 0 완성본이 나온다.
  it("정가를 안 낸 프로젝트는 첫 회 재생성도 402 다", async () => {
    const p = await projectWithAudio();
    expect((await cutRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await voiceRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await clipRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect(pipelineMock.regen).not.toHaveBeenCalled();
  });

  it("가짜 모드에서는 막지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await projectWithAudio({ regen_count: 1 });
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(200);
    expect((await cutRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(200);
  });
});
