// 호출 게이트 — fal 로 나가기 직전. 잔액을 넘으면 요청 자체가 안 나가야 한다.
// 옛 quick-create-budget.test.js 가 지키던 자리다(t2v 와 함께 삭제됐다).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { assertBudget } from "../lib/costs.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";

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
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const ORIG = { ...process.env };

// 되돌릴 때 undefined 를 그대로 넣으면 문자열 "undefined" 가 된다 — 지워야 한다
const restore = (k) => {
  if (ORIG[k] === undefined) delete process.env[k];
  else process.env[k] = ORIG[k];
};

// PRICE_TABLE 에 실제로 있는 prefix 다($0.084/s) — 없는 문자열을 쓰면 기본 단가로 떨어진다
const KLING = "fal-ai/kling-video/v3/standard/image-to-video";

describe("호출 게이트 — 사용자 축은 잔액이다", () => {
  beforeEach(() => {
    resetMemoryStore();
    // 전역·프로젝트 상한은 이 테스트의 관심사가 아니다 — 넉넉히 열어 둔다
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "1000";
    process.env.SHOTFORM_BUDGET_PROJECT_USD = "1000";
    delete process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_FAKE_IMAGES;
  });
  afterEach(() => {
    restore("SHOTFORM_BUDGET_TOTAL_USD");
    restore("SHOTFORM_BUDGET_PROJECT_USD");
    restore("SHOTFORM_FAKE");
    restore("SHOTFORM_FAKE_IMAGES");
  });

  it("충전이 없으면 첫 호출부터 막는다 — 옛 고정 상한($5)이 남아 있으면 통과해 버린다", async () => {
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "user" });
    });
  });

  it("충전이 있으면 그 안에서 통과한다", async () => {
    await getStore().insertGrant({ user_id: A, amount_usd: 10, reason: "충전", granted_by: ADMIN });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .resolves.toBeUndefined();
    });
  });

  it("쓴 만큼 줄어들어 결국 막힌다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 1, reason: "충전", granted_by: ADMIN });
    // ★ 스토어의 비용 기록 메서드 이름은 insertCost 다
    await store.insertCost({
      request_id: "spent-1", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: A, est_cost_usd: 0.95, status: "done",
    });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "user" });
    });
  });

  it("남의 지출은 내 잔액을 안 갉아먹는다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_usd: 1, reason: "충전", granted_by: ADMIN });
    await store.insertCost({
      request_id: "other-1", ts: 1, endpoint: "fal-ai/x", stage: "영상",
      actor: "00000000-0000-4000-8000-00000000000b", est_cost_usd: 0.95, status: "done",
    });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .resolves.toBeUndefined();
    });
  });

  it("전역 상한은 그대로 회사 안전핀이다 — 잔액이 넉넉해도 막힌다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "0.01";
    await getStore().insertGrant({ user_id: A, amount_usd: 1000, reason: "충전", granted_by: ADMIN });
    await runWithActor(A, async () => {
      await expect(assertBudget({ endpoint: KLING, amount: 5 }))
        .rejects.toMatchObject({ name: "BudgetExceeded", scope: "total" });
    });
  });
});

// ── 시작 게이트 — 유료 흐름을 **시작하기 전에** 잔액을 본다.
// 호출 게이트(위)는 fal 로 나가기 직전에 끊는다. 그것만 있으면 자동 관통이 중간에
// 끊겨 "돈은 나갔는데 영상이 없다"가 남는다. 그래서 입구에서도 한 번 본다.
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

  it("한 편치가 모자라면 402 — 반 편만 있는 상태로 시작시키지 않는다", async () => {
    const p = await makeProject();
    await getStore().insertGrant({ user_id: A, amount_usd: 1.0, reason: "충전", granted_by: ADMIN });
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(402);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("한 편치가 있으면 202 로 시작한다", async () => {
    const p = await makeProject();
    await getStore().insertGrant({ user_id: A, amount_usd: 10, reason: "충전", granted_by: ADMIN });
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
    await getStore().insertGrant({ user_id: A, amount_usd: 10, reason: "충전", granted_by: ADMIN });
    expect((await autoPOST(autoReq(A), ctx(p.id))).status).toBe(202);
  });
});

describe("시작 게이트 — 단계별", () => {
  const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });
  const post = (url, body) =>
    new Request(url, { method: "POST", headers: headersFor(A), body: JSON.stringify(body ?? {}) });

  // 단계별 라우트의 기존 가드(400·409)를 전부 통과한 프로젝트 — 걸리는 곳이 크레딧뿐이게.
  async function projectWithAudio() {
    const p = await makeProject();
    return projects.updateProject(p.id, A, (proj) => ({
      ...proj, status: "voice",
      cuts: [{ idx: 0, text: "한 문장.", seconds: 3, audio: { url: "/a.mp3", seconds: 3 } }],
    }));
  }

  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });
  afterEach(() => restore("SHOTFORM_FAKE"));

  it("잔액이 사실상 0 이면 목소리·이미지·영상 시작이 전부 402 다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, cuts: [{ idx: 0, text: "한 문장.", seconds: 3 }],
    }));
    expect((await voicePOST(post("http://localhost/v", { voiceLabel: "밝은 여성" }), ctx(p.id))).status).toBe(402);

    const q = await projectWithAudio();
    expect((await imagesPOST(post("http://localhost/i"), ctx(q.id))).status).toBe(402);
    expect((await clipsPOST(post("http://localhost/c"), ctx(q.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("잔액이 사실상 0 이면 컷·목소리·클립 재생성도 402 다", async () => {
    const p = await projectWithAudio();
    expect((await cutRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await voiceRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect((await clipRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(402);
    expect(pipelineMock.regen).not.toHaveBeenCalled();
  });

  it("조금이라도 남아 있으면 통과한다 — 단계별은 화면에서 보고 있으니 한 편치를 요구하지 않는다", async () => {
    await getStore().insertGrant({ user_id: A, amount_usd: 0.5, reason: "충전", granted_by: ADMIN });
    const p = await projectWithAudio();
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(200);
    expect((await clipRegenPOST(post("http://localhost/r"), idxCtx(p.id, 0))).status).toBe(200);
  });

  it("가짜 모드에서는 막지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await projectWithAudio();
    expect((await imagesPOST(post("http://localhost/i"), ctx(p.id))).status).toBe(200);
  });
});

// /clips 만 하한이 다르다. 이 라우트는 runVideoPipeline 을 fire-and-forget 으로 띄우고
// 클립이 편당 원가의 81% 다 — "잔액이 0 이 아닌가"(0.01)로는 컷 중간에 끊기는 것을 못 막는다.
// 그래서 need = **남은 컷 값의 견적**이다.
describe("시작 게이트 — /clips 는 남은 컷 값을 요구한다", () => {
  const post = () => new Request("http://localhost/c", { method: "POST", headers: headersFor(A) });

  // 활성 모델(Kling v3, $0.084/s)에서 5초 컷 하나가 $0.42 다. 아래 금액은 그 눈금에서 골랐다 —
  // 값을 코드에 박지 않고 라우트가 lib/costs·lib/clip-limits 로 계산하므로, 모델이 바뀌면
  // 이 테스트가 먼저 깨져서 알려 준다(그게 이 자리의 값어치다).
  const bareCut = (idx) => ({
    idx, sentence: "문장", seconds: 5,
    image: { url: `i${idx}` }, audio: { url: `a${idx}`, seconds: 5 },
  });
  const liveCut = (idx) => ({
    ...bareCut(idx),
    video: { url: `v${idx}`, seconds: 5, truncated: false, of: `i${idx}|5|` },
  });
  const withCuts = async (cuts) => {
    const p = await makeProject();
    return projects.updateProject(p.id, A, (proj) => ({ ...proj, status: "video", cuts }));
  };
  const grant = (usd) =>
    getStore().insertGrant({ user_id: A, amount_usd: usd, reason: "충전", granted_by: ADMIN });

  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); delete process.env.SHOTFORM_FAKE; });
  afterEach(() => restore("SHOTFORM_FAKE"));

  it("컷 셋을 감당 못 하는 잔액이면 402 이고 파이프라인이 안 불린다", async () => {
    // 셋이면 ~$1.26 인데 $0.5 뿐이다. 옛 하한(0.01)이었으면 통과해 컷 중간에 끊겼다.
    await grant(0.5);
    const p = await withCuts([bareCut(0), bareCut(1), bareCut(2)]);
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(402);
    expect(pipelineMock.run).not.toHaveBeenCalled();
  });

  it("컷 셋을 감당하는 잔액이면 200 으로 시작한다", async () => {
    await grant(2);
    const p = await withCuts([bareCut(0), bareCut(1), bareCut(2)]);
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledTimes(1);
  });

  it("살아 있는 클립은 값을 안 매긴다 — 남은 컷 하나치만 요구한다", async () => {
    // 같은 $0.5 다. 앞 테스트에서는 402 였고 여기서는 통과해야 한다 —
    // 파이프라인이 살아 있는 클립을 건너뛰므로 그 둘에는 값이 들지 않는다.
    await grant(0.5);
    const p = await withCuts([liveCut(0), liveCut(1), bareCut(2)]);
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(200);
    expect(pipelineMock.run).toHaveBeenCalledTimes(1);
  });

  // 낭독 전이라 seconds 가 없는 컷이 섞일 수 있다(라우트는 컷 하나에만 audio 를 요구한다).
  // 그때 모델 바닥(3초)으로 어림하면 늘 모자라게 잡힌다 — 콘텐츠 상한(8초)으로 넉넉히 잡는다.
  it("seconds 가 없는 컷도 값으로 센다 — 넉넉한 쪽으로 어림한다", async () => {
    await grant(0.5);
    const p = await withCuts([
      { idx: 0, sentence: "문장", audio: { url: "a0" }, image: { url: "i0" } },
      { idx: 1, sentence: "문장", image: { url: "i1" } },
    ]);
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(402);
  });

  it("가짜 모드에서는 막지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = await withCuts([bareCut(0), bareCut(1), bareCut(2)]);
    expect((await clipsPOST(post(), ctx(p.id))).status).toBe(200);
  });
});
