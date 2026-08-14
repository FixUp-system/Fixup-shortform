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
// 정가는 길이 × 모델로 갈린다. 이 파일의 라우트들은 모델을 안 넘기므로
// 레거시(Kling) 표를 읽는다 — lib/pricing.js 의 폴백이 가리키는 그 표다.
import { VIDEO_PRICE, REGEN_PRICE, MAX_REGEN_PER_CUT } from "../lib/pricing.js";
import { balanceFor, chargeVideo, refundVideo } from "../lib/charges.js";

// 라우트가 fire-and-forget 으로 띄우는 것들은 전부 모킹한다 — 진짜로 돌면 fal 로 나간다.
vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";

const pipelineMock = vi.hoisted(() => ({
  run: vi.fn(async () => {}),
  regen: vi.fn(async () => ({ idx: 0 })),
}));
// withProgress 는 **진짜를 쓴다** — 라우트가 시작 표식을 이것으로 짓는다(lib/pipeline.js).
// 여기서 흉내를 내면 표식의 모양이 두 벌이 되어 조용히 어긋난다.
vi.mock("../lib/pipeline.js", async (importOriginal) => ({
  withProgress: (await importOriginal()).withProgress,
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
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
    expect(runAutoPipeline).toHaveBeenCalledTimes(1);
  });

  it("길이가 길면 더 받는다", async () => {
    await grant(500);
    const p = await makeProject(60);
    await autoPOST(autoReq(), ctx(p.id));
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][60]);
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
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
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
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("이미지를 두 번 시작해도 한 번만 받는다 — 두 번째는 409 다", async () => {
    await grant(500);
    const p = await withCuts(30);
    await imagesPOST(post(), ctx(p.id));
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, cuts: proj.cuts.map((c) => ({ ...c, image: { url: "i0" } })),
    }));
    expect((await imagesPOST(post(), ctx(p.id))).status).toBe(409);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
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
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("환불된 프로젝트인데 잔액이 없으면 클립·목소리가 402 다", async () => {
    await grant(VIDEO_PRICE["kling-v3"]["720p"][30]);
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

  // 재생성도 **살아 있는 청구를 요구한다** — 그래서 정상 흐름 픽스처는 정가를 이미 낸
  // 프로젝트다. 여기서 재는 것은 그 위에 얹히는 **회차 값**이라, 기준선을 base 로 잡는다.
  async function paidCuts(granted, cut) {
    await grant(granted);
    const p = await withCuts(30, cut);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    return { p, base: await balanceFor(A) };
  }

  for (const [name, route, field, kind] of cases) {
    // 클립 정가만 모델을 탄다. 이 라우트들은 모델을 안 넘기므로 레거시(Kling) 값이다.
    const price = kind === "clip" ? REGEN_PRICE.clip["kling-v3"]["720p"] : REGEN_PRICE[kind];

    it(`${name} 재생성 — 정상(청구 살아 있는) 프로젝트는 첫 회가 공짜 그대로다`, async () => {
      const { p, base } = await paidCuts(500, { [field]: 0 });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(base);
    });

    it(`${name} 재생성 — 둘째부터 정가를 받는다`, async () => {
      const { p, base } = await paidCuts(500, { [field]: 1 });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(base - price);
    });

    it(`${name} 재생성 — 회차가 오르면 또 받는다(같은 컷이라도)`, async () => {
      const { p, base } = await paidCuts(500, { [field]: 1 });
      await route(post(), idxCtx(p.id, 0));
      await projects.updateProject(p.id, A, (proj) => ({
        ...proj, cuts: proj.cuts.map((c) => ({ ...c, [field]: 2 })),
      }));
      await route(post(), idxCtx(p.id, 0));
      expect(await balanceFor(A)).toBe(base - price * 2);
    });

    it(`${name} 재생성 — 모자라면 402 이고 청구도 시작도 없다`, async () => {
      const { p, base } = await paidCuts(VIDEO_PRICE["kling-v3"]["720p"][30] + price - 1, { [field]: 1 });
      expect(base).toBe(price - 1);
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(402);
      expect(await balanceFor(A)).toBe(base);
      expect(pipelineMock.regen).not.toHaveBeenCalled();
    });

    // 상한이 청구 뒤에 있으면 4회째가 **값을 받고 나서** 400 이 된다 — 내고 아무것도 못 받는다.
    it(`${name} 재생성 — 상한(3회)에 닿으면 청구 없이 400 이다`, async () => {
      const { p, base } = await paidCuts(500, { [field]: MAX_REGEN_PER_CUT });
      const res = await route(post(), idxCtx(p.id, 0));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/3회까지/);
      expect(await balanceFor(A)).toBe(base);
      expect(pipelineMock.regen).not.toHaveBeenCalled();
    });

    // 카운터는 시도 **전**에 오른다 — 되돌리지 않으면 재시도가 다음 회차 값을 또 낸다.
    // 자동 관통이 실패를 환불하는 것과 같은 정책이어야 한다.
    it(`${name} 재생성 — 실패하면 받은 값을 되돌린다`, async () => {
      const { p, base } = await paidCuts(500, { [field]: 1 });
      pipelineMock.regen.mockRejectedValueOnce(new Error("만들지 못했어요"));
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(400);
      expect(await balanceFor(A)).toBe(base);
    });

    it(`${name} 재생성 — 실패해도 그 회차를 두 번 되돌리지는 않는다`, async () => {
      const { p, base } = await paidCuts(500, { [field]: 1 });
      pipelineMock.regen.mockRejectedValue(new Error("만들지 못했어요"));
      await route(post(), idxCtx(p.id, 0));
      await route(post(), idxCtx(p.id, 0));   // 같은 회차 재시도 — 청구도 환불도 한 번씩이다
      expect(await balanceFor(A)).toBe(base);
      pipelineMock.regen.mockReset();
      pipelineMock.regen.mockImplementation(async () => ({ idx: 0 }));
    });

    // ★ 최종 리뷰 ① — 회차 가격만 보면 여기가 순지불 0 통로였다.
    // 실패 → 환불(잔액 복구) → 그림·컷은 남음 → 컷별 재생성(첫 회 무료) → /render(0원).
    // 잔액이 양수라 `balance < 0` 그물에도 안 걸린다.
    it(`${name} 재생성 — 환불된 프로젝트면 정가를 다시 받는다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: 0, image: { url: "i0" } });
      await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
      await refundVideo({ userId: A, projectId: p.id });
      expect(await balanceFor(A)).toBe(500);          // 되돌려받았다

      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);   // 첫 회는 여전히 공짜다
    });

    // ★ 게이트를 블록 맨 앞에 두면 이 조합에서만 옛 결함이 되살아난다 —
    // 정가를 받고 나서 상한으로 400. 드문 것과 없는 것은 다르다.
    it(`${name} 재생성 — 환불된 프로젝트라도 상한에 닿았으면 청구 없이 400 이다`, async () => {
      await grant(500);
      const p = await withCuts(30, { [field]: MAX_REGEN_PER_CUT, image: { url: "i0" } });
      await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
      await refundVideo({ userId: A, projectId: p.id });
      expect(await balanceFor(A)).toBe(500);

      const res = await route(post(), idxCtx(p.id, 0));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/3회까지/);
      expect(await balanceFor(A)).toBe(500);      // 정가도 회차 값도 안 나갔다
      expect(pipelineMock.regen).not.toHaveBeenCalled();
    });

    it(`${name} 재생성 — 환불된 프로젝트인데 잔액이 없으면 402 다`, async () => {
      await grant(VIDEO_PRICE["kling-v3"]["720p"][30]);
      const p = await withCuts(30, { [field]: 0, image: { url: "i0" } });
      await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
      await refundVideo({ userId: A, projectId: p.id });
      // 되돌려받은 크레딧을 다른 프로젝트에 썼다 — 잔액 0, 그림은 p 에 그대로 남아 있다
      const q = await makeProject(30);
      await chargeVideo({ userId: A, projectId: q.id, seconds: 30 });
      expect(await balanceFor(A)).toBe(0);

      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(402);
      expect(pipelineMock.regen).not.toHaveBeenCalled();
      expect(await balanceFor(A)).toBe(0);
    });
  }

  it("가짜 모드는 청구하지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await withCuts(30, { regen_count: 3 });
    expect((await cutRegenPOST(post(), idxCtx(p.id, 0))).status).toBe(200);
    expect(await balanceFor(A)).toBe(0);
  });
});

// ★ 화질이 **청구액까지** 관통하는지 — 가격표에 해상도 축이 생겨도 부르는 쪽이 안 넘기면
// 1080p 를 고른 사장님에게 720p 값만 걷힌다(원가는 2.25배라 그 차액이 그대로 우리 손해다).
// 재는 자리는 화면에 적히는 숫자가 아니라 **장부에서 실제로 빠져나간 크레딧**이다.
describe("화질이 청구액까지 관통한다", () => {
  beforeEach(reset);
  afterEach(restoreFake);

  // withCuts 와 같은 픽스처인데 모델·화질을 고른 프로젝트다.
  // (해상도를 받는 모델은 Seedance 하나다 — Kling 은 목록이 비어 있다.)
  async function pickedCuts({ model = "seedance-2.0", resolution, seconds = 30 } = {}, cut = {}) {
    const p = await projects.createProject({
      ownerId: A,
      settings: { aspect_ratio: "9:16", target_seconds: seconds, i2v_model: model, resolution },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "voice",
      cuts: [{
        idx: 0, sentence: "문장.", seconds: 3, state: "pending", regen_count: 0,
        audio: { url: "a0", seconds: 3 }, ...cut,
      }],
    }));
  }

  // 유료 입구 넷이 전부 같은 문(requireVideoCharge)을 쓰므로 넷 다 같은 값을 봐야 한다 —
  // 하나만 안 넘기면 그 문으로 들어온 사장님만 720p 값을 낸다.
  const gates = [
    ["자동 관통", (id) => autoPOST(autoReq(), ctx(id)), {}],
    ["이미지", (id) => imagesPOST(post(), ctx(id)), {}],
    ["목소리", (id) => voicePOST(post({ voiceLabel: "밝은 여성" }), ctx(id)), { audio: null }],
    ["클립", (id) => clipsPOST(post(), ctx(id)), { image: { url: "i0" } }],
  ];

  for (const [name, call, cut] of gates) {
    it(`${name} — 1080p 프로젝트는 1080p 정가를 낸다`, async () => {
      await grant(500);
      const p = await pickedCuts({ resolution: "1080p" }, cut);
      await call(p.id);
      // 720p 값(160)으로 걷히면 편당 200 크레딧을 우리가 떠안는다
      expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["seedance-2.0"]["1080p"][30]);
    });
  }

  it("480p 프로젝트는 480p 정가를 낸다 — 싼 쪽도 그대로 관통한다", async () => {
    await grant(500);
    const p = await pickedCuts({ resolution: "480p" }, { image: { url: "i0" } });
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(200);
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["seedance-2.0"]["480p"][30]);
  });

  // 저장값이 목록 밖이면 resolutionForProject 가 기본값(720p)으로 떨어뜨린다 —
  // 옛 해상도가 남아 있어도 표를 못 찾아 이상한 값이 걷히지 않는다.
  it("모르는 화질이 저장돼 있어도 기본값(720p) 정가다", async () => {
    await grant(500);
    const p = await pickedCuts({ resolution: "2160p" }, { image: { url: "i0" } });
    await clipsPOST(post(), ctx(p.id));
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["seedance-2.0"]["720p"][30]);
  });

  // Kling 에는 resolution 파라미터가 아예 없다 — 문서에 값이 남아 있어도 값이 안 바뀐다.
  it("해상도를 안 받는 모델은 저장값이 있어도 그 모델 값 그대로다", async () => {
    await grant(500);
    const p = await pickedCuts({ model: "kling-v3", resolution: "1080p" }, { image: { url: "i0" } });
    await clipsPOST(post(), ctx(p.id));
    expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["kling-v3"]["720p"][30]);
  });

  it("클립 재생성도 1080p 값이다", async () => {
    await grant(500);
    const p = await pickedCuts({ resolution: "1080p" }, { clip_regen_count: 1, image: { url: "i0" } });
    await chargeVideo({
      userId: A, projectId: p.id, seconds: 30, model: "seedance-2.0", resolution: "1080p",
    });
    const base = await balanceFor(A);
    expect((await clipRegenPOST(post(), idxCtx(p.id, 0))).status).toBe(200);
    expect(await balanceFor(A)).toBe(base - REGEN_PRICE.clip["seedance-2.0"]["1080p"]);
  });

  // 이미지·목소리 재생성은 모델도 해상도도 안 탄다(값이 하나다). 그러나 그 라우트도
  // **정가 게이트**를 지나므로, 환불된 프로젝트로 들어오면 거기서 1080p 정가를 받아야 한다.
  const regens = [
    ["컷", cutRegenPOST, "regen_count", REGEN_PRICE.image],
    ["목소리", voiceRegenPOST, "voice_regen_count", REGEN_PRICE.voice],
  ];
  for (const [name, route, field, price] of regens) {
    it(`${name} 재생성 — 값은 그대로지만 환불된 1080p 프로젝트의 정가는 1080p 다`, async () => {
      await grant(500);
      const p = await pickedCuts({ resolution: "1080p" }, { [field]: 1, image: { url: "i0" } });
      expect((await route(post(), idxCtx(p.id, 0))).status).toBe(200);
      expect(await balanceFor(A)).toBe(500 - VIDEO_PRICE["seedance-2.0"]["1080p"][30] - price);
    });
  }
});
