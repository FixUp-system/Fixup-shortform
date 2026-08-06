// 라우트가 정가를 받는지, 두 번 받지 않는지, 회차대로 받는지.
//
// 게이트(막는가)는 tests/credits-gate.test.js 가 잰다. 여기서 보는 것은 **장부**다 —
// 얼마가 빠져나갔는가. 값은 lib/pricing.js 에서 읽는다(숫자를 여기 박으면 가격표가
// 바뀌는 날 테스트가 가격표를 이긴다).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
import { VIDEO_PRICE, REGEN_PRICE, MAX_REGEN_PER_CUT } from "../lib/pricing.js";
import { balanceFor, chargeVideo, refundVideo } from "../lib/charges.js";

// 라우트가 fire-and-forget 으로 띄우는 것들은 전부 모킹한다 — 진짜로 돌면 fal 로 나간다.
vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";

const pipelineMock = vi.hoisted(() => ({
  run: vi.fn(async () => {}),
  regen: vi.fn(async () => ({ idx: 0 })),
}));
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

import { POST as autoPOST } from "../app/api/projects/[id]/auto/route.js";
import { POST as imagesPOST } from "../app/api/projects/[id]/images/route.js";
import { POST as voicePOST } from "../app/api/projects/[id]/voice/route.js";
import { POST as clipsPOST } from "../app/api/projects/[id]/clips/route.js";
import { POST as cutRegenPOST } from "../app/api/projects/[id]/cuts/[idx]/regen/route.js";
import { POST as voiceRegenPOST } from "../app/api/projects/[id]/voice/[idx]/regen/route.js";
import { POST as clipRegenPOST } from "../app/api/projects/[id]/clips/[idx]/regen/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ORIG_FAKE = process.env.SHOTFORM_FAKE;

const headersFor = (id) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });
const post = (body) =>
  new Request("http://localhost/x", {
    method: "POST", headers: headersFor(A), body: JSON.stringify(body ?? {}),
  });
const autoReq = () => post({ voice_label: "차분한 여성" });

const grant = (n) =>
  getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

async function makeProject(seconds = 30) {
  return projects.createProject({
    ownerId: A,
    settings: { aspect_ratio: "9:16", target_seconds: seconds },
    material: { text: "자료", photos: [] },
  });
}

// 단계별 라우트의 기존 가드(컷 없음 400·소리 없음 400·이미 그림 409)를 통과하는 상태.
// 가드를 고치지 않고 픽스처를 실물에 맞춘다.
async function withCuts(seconds = 30, cut = {}) {
  const p = await makeProject(seconds);
  return projects.updateProject(p.id, A, (proj) => ({
    ...proj, status: "voice",
    cuts: [{
      idx: 0, sentence: "문장.", seconds: 3, state: "pending", regen_count: 0,
      audio: { url: "a0", seconds: 3 }, ...cut,
    }],
  }));
}

const reset = () => {
  resetMemoryStore();
  vi.clearAllMocks();
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_FAKE_IMAGES;
};
const restoreFake = () => {
  if (ORIG_FAKE === undefined) delete process.env.SHOTFORM_FAKE;
  else process.env.SHOTFORM_FAKE = ORIG_FAKE;
};

describe("자동 관통 청구", () => {
  beforeEach(reset);
  afterEach(restoreFake);

  it("정가를 받고 시작한다", async () => {
    await grant(500);
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(202);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
    expect(runAutoPipeline).toHaveBeenCalledTimes(1);
  });

  it("길이가 길면 더 받는다", async () => {
    await grant(500);
    const p = await makeProject(60);
    await autoPOST(autoReq(), ctx(p.id));
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[60]);
  });

  it("모자라면 402 이고 청구도 시작도 없다", async () => {
    await grant(10);
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(402);
    expect(await balanceFor(A)).toBe(10);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("두 번 눌러도 한 번만 받는다", async () => {
    await grant(500);
    const p = await makeProject(30);
    await autoPOST(autoReq(), ctx(p.id));
    // 두 번째는 멱등 가드에 걸려 409 — 그 전에 청구가 또 일어나면 안 된다
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(409);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("가짜 모드는 청구하지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await makeProject(30);
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(202);
    expect(await balanceFor(A)).toBe(0);
  });

  // 청구가 멱등 가드보다 앞이면, 환불 이력이 있는 완성 프로젝트에서 **새 회차를 받고 나서**
  // 409 를 준다 — 돈만 받고 아무것도 안 하는 응답이다. 선판정이 그 창을 닫는다.
  it("이미 완성한 프로젝트는 청구 없이 409 다", async () => {
    await grant(500);
    const p = await makeProject(30);
    await projects.updateProject(p.id, A, (proj) => ({ ...proj, render: { url: "/r.mp4" } }));
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(409);
    expect(await balanceFor(A)).toBe(500);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("이미 만드는 중인 프로젝트는 청구 없이 409 다", async () => {
    await grant(500);
    const p = await makeProject(30);
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, auto: { stage: "voice", state: "running", error: null },
    }));
    expect((await autoPOST(autoReq(), ctx(p.id))).status).toBe(409);
    expect(await balanceFor(A)).toBe(500);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });
});

describe("단계별 청구 — 정가는 그림에서 한 번", () => {
  beforeEach(reset);
  afterEach(restoreFake);

  it("자동 관통으로 이미 산 프로젝트는 이미지에서 또 받지 않는다", async () => {
    await grant(500);
    const p = await makeProject(30);
    await autoPOST(autoReq(), ctx(p.id));
    const after = await balanceFor(A);
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, sentence: "문장.", seconds: 3, state: "pending", regen_count: 0,
        audio: { url: "a0", seconds: 3 } }],
    }));
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(after);
  });

  it("단계별로 온 사장님도 같은 정가를 낸다", async () => {
    await grant(500);
    const p = await withCuts(30);
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("이미지를 두 번 시작해도 한 번만 받는다 — 두 번째는 409 다", async () => {
    await grant(500);
    const p = await withCuts(30);
    await imagesPOST(post(), ctx(p.id));
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, cuts: proj.cuts.map((c) => ({ ...c, image: { url: "i0" } })),
    }));
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(409);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("모자라면 402 이고 청구도 시작도 없다", async () => {
    await grant(10);
    const p = await withCuts(30);
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(402);
    expect(await balanceFor(A)).toBe(10);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("이미 산 프로젝트는 목소리·클립에서 또 받지 않는다 — 영상 정가에 포함이다", async () => {
    await grant(500);
    const p = await withCuts(30, { audio: null });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    const q = await withCuts(30, { image: { url: "i0" } });
    await chargeVideo({ userId: A, projectId: q.id, seconds: 30 });
    const after = await balanceFor(A);

    expect((await voicePOST(post({ voiceLabel: "밝은 여성" }), ctx(p.id))).status).toBe(200);
    expect((await clipsPOST(post(), ctx(q.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(after);
  });

  // ★ 여기가 구멍이었다. 실패 → 환불 → 그림·소리는 프로젝트에 그대로 남는다 →
  // /clips 에 문이 없으면 순지불 0 크레딧으로 완성본이 나온다.
  // `balance < 0` 그물은 잔액이 음수가 아니라 못 잡는다.
  it("환불된 프로젝트로 클립을 부르면 정가를 다시 받는다", async () => {
    await grant(500);
    const p = await withCuts(30, { image: { url: "i0" } });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    await refundVideo({ userId: A, projectId: p.id });
    expect(await balanceFor(A)).toBe(500);          // 되돌려받았다

    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE[30]);
  });

  it("환불된 프로젝트인데 잔액이 없으면 클립·목소리가 402 다", async () => {
    await grant(VIDEO_PRICE[30]);
    const p = await withCuts(30, { image: { url: "i0" } });
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    await refundVideo({ userId: A, projectId: p.id });
    // 되돌려받은 크레딧을 다른 프로젝트에 썼다 — 잔액 0, 그림은 p 에 그대로 남아 있다
    const q = await makeProject(30);
    await chargeVideo({ userId: A, projectId: q.id, seconds: 30 });
    expect(await balanceFor(A)).toBe(0);

    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
    expect(await balanceFor(A)).toBe(0);
  });

  it("정가를 안 낸 프로젝트는 목소리 시작도 402 다 — 걸어 들어올 문을 막는다", async () => {
    const p = await withCuts(30, { audio: null });
    expect((await voicePOST(post({ voiceLabel: "밝은 여성" }), ctx(p.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
    expect(await balanceFor(A)).toBe(0);
  });

  it("가짜 모드는 청구하지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await withCuts(30);
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(0);
  });
});

describe("재생성 청구 — 컷당 첫 회는 공짜", () => {
  beforeEach(reset);
  afterEach(restoreFake);

  // 회차는 **프로젝트 문서**가 센다(regen_count·voice_regen_count·clip_regen_count).
  // 청구 장부로 세면 첫 회가 행을 안 남겨 영원히 공짜가 된다.
  const cases = [
    ["컷", cutRegenPOST, "regen_count", "image"],
    ["목소리", voiceRegenPOST, "voice_regen_count", "voice"],
    ["클립", clipRegenPOST, "clip_regen_count", "clip"],
  ];

  for (const [name, route, field, kind] of cases) {
    it(`${name} 재생성 — 첫 회는 공짜다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 0 });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(500);
    });

    it(`${name} 재생성 — 둘째부터 정가를 받는다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 1 });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(500 - REGEN_PRICE[kind]);
    });

    it(`${name} 재생성 — 회차가 오르면 또 받는다(같은 컷이라도)`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 1 });
      await route(post(), idxCtx(p.id, 0));
      await projects.updateProject(p.id, A, (proj) => ({
        ...proj, cuts: proj.cuts.map((c) => ({ ...c, [field]: 2 })),
      }));
      await route(post(), idxCtx(p.id, 0));
      expect(await balanceFor(A)).toBe(500 - REGEN_PRICE[kind] * 2);
    });

    it(`${name} 재생성 — 모자라면 402 이고 청구도 시작도 없다`, async () => {
      await grant(REGEN_PRICE[kind] - 1);
      const p = await withCuts(30, { [field]: 1 });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(402);
      expect(await balanceFor(A)).toBe(REGEN_PRICE[kind] - 1);
      expect(pipelineMock.regen).not.toHaveBeenCalled();
    });

    // 상한이 청구 뒤에 있으면 4회째가 **값을 받고 나서** 400 이 된다 — 내고 아무것도 못 받는다.
    it(`${name} 재생성 — 상한(3회)에 닿으면 청구 없이 400 이다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: MAX_REGEN_PER_CUT });
      const res = await route(post(), idxCtx(p.id, 0));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/3회까지/);
      expect(await balanceFor(A)).toBe(500);
      expect(pipelineMock.regen).not.toHaveBeenCalled();
    });

    // 카운터는 시도 **전**에 오른다 — 되돌리지 않으면 재시도가 다음 회차 값을 또 낸다.
    // 자동 관통이 실패를 환불하는 것과 같은 정책이어야 한다.
    it(`${name} 재생성 — 실패하면 받은 값을 되돌린다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 1 });
      pipelineMock.regen.mockRejectedValueOnce(new Error("만들지 못했어요"));
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(400);
      expect(await balanceFor(A)).toBe(500);
    });

    it(`${name} 재생성 — 실패해도 그 회차를 두 번 되돌리지는 않는다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 1 });
      pipelineMock.regen.mockRejectedValue(new Error("만들지 못했어요"));
      await route(post(), idxCtx(p.id, 0));
      await route(post(), idxCtx(p.id, 0));   // 같은 회차 재시도 — 청구도 환불도 한 번씩이다
      expect(await balanceFor(A)).toBe(500);
      pipelineMock.regen.mockReset();
      pipelineMock.regen.mockImplementation(async () => ({ idx: 0 }));
    });
  }

  it("가짜 모드는 청구하지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await withCuts(30, { regen_count: 3 });
    expect((await cutRegenPOST(post(), idxCtx(p.id, 0))).status).toBe(200);
    expect(await balanceFor(A)).toBe(0);
  });
});
