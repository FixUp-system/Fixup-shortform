// 재생성 상한 **3회 통일** + reel 재생성 **청구** (2026-09-11 사장님 결정).
//
// ★★★ 원장 실측이 이 파일을 만들었다. reel 한 편은 설계보다 1.3× 들었고 그 초과는 **전부
//   "다시"** 에서 왔다 — 시나리오 다시 쓰기 20회 무료(한 편이 LLM 만 $4.22), 스토리보드
//   무료·무제한(편당 1.7장), 클립 재굽기 0원·무제한(삭제된 어느 편 클립만 $12.14).
//   광고는 정가를 매번 다시 받지만 횟수 상한이 없었다.
//
// ★ 규칙 하나: **어느 재생성이든 상한은 3회**다(시나리오·스토리보드·컷·광고). 무료 횟수는
//   종류마다 다르다 — 시나리오 3회(=상한, 유료 구간 없음) · 스토리보드 1회 · 컷 1회 · 광고 0회.
//   "첫 생성"은 재생성이 아니다. tries 가 첫 생성부터 세는 자리는 상한이 1+3 이다.
// ★ 단가는 원가에서 나와 이미 REGEN_PRICE 에 있다 — 이 파일이 새로 정하는 값은 없다.
//   빠져 있던 것은 (1) reel 이 chargeRegen 을 **안 부르던 것**, (2) 시나리오·그림 상한이
//   3이 아니던 것, (3) 광고에 상한이 없던 것, (4) 스토리보드 한 장의 단가(sheet).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { chargeVideo } from "../lib/charges.js";
import {
  REGEN_PRICE, FREE_REGEN_PER_CUT, MAX_REGEN_PER_CUT, MAX_SCENARIO_TRIES, MAX_SCENARIO_REWRITES,
  regenPrice,
} from "../lib/pricing.js";
import { MAX_REEL_IMAGE_TRIES } from "../lib/reel/doc.js";
import { modelIdForProject, resolutionForProject } from "../lib/clip-limits.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

// 굽기 자체는 안 돈다 — 재는 것은 **청구와 회차**다.
vi.mock("../lib/reel/pipeline.js", async (orig) => ({
  ...(await orig()),
  runReelClips: vi.fn(async () => {}),
  runReelOneShot: vi.fn(async () => {}),
}));
vi.mock("../lib/ad/pipeline.js", async (orig) => ({
  ...(await orig()),
  startAdRender: vi.fn(async () => {}),
}));
const { POST: CLIPS } = await import("../app/api/reel/[id]/clips/route.js");
const { POST: AD_RENDER } = await import("../app/api/ads/[id]/render/route.js");

const U = "00000000-0000-4000-8000-00000000cap3";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const H = new Headers({ [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" });
const req = () => ({ headers: H });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const grant = (n) => getStore().insertGrant({ user_id: U, amount_credits: n, reason: "충전", granted_by: ADMIN });
const charges = async (kind) => (await getStore().listCharges(U)).filter((c) => c.kind === kind);

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = (p) => strip(readFileSync(p, "utf8"));

describe("상한이 하나다 — 3회", () => {
  it("★★★ 컷·시나리오·스토리보드 상한이 같은 수(3)다", () => {
    expect(MAX_REGEN_PER_CUT).toBe(3);
    expect(MAX_SCENARIO_REWRITES).toBe(MAX_REGEN_PER_CUT);
    // tries 는 첫 생성부터 센다 — 그래서 상한은 "1 + 다시 쓰기 3회"다.
    expect(MAX_SCENARIO_TRIES).toBe(1 + MAX_SCENARIO_REWRITES);
    expect(MAX_REEL_IMAGE_TRIES).toBe(1 + MAX_REGEN_PER_CUT);
  });

  it("★★ 스토리보드 한 장의 재생성 단가가 있다 — 원가($0.401)를 밑돌지 않는다", () => {
    expect(REGEN_PRICE.sheet).toBeGreaterThanOrEqual(Math.ceil(0.401 / 0.06));
    expect(regenPrice("sheet", 0)).toBe(0);                 // 첫 다시 그리기는 공짜
    expect(regenPrice("sheet", FREE_REGEN_PER_CUT)).toBe(REGEN_PRICE.sheet);
  });

  it("★ 광고·reel 라우트가 같은 상수를 본다 — 숫자를 손으로 적지 않는다", () => {
    for (const p of ["app/api/reel/[id]/clips/route.js", "app/api/ads/[id]/render/route.js"]) {
      expect(src(p), `${p} 가 MAX_REGEN_PER_CUT 을 안 본다`).toMatch(/MAX_REGEN_PER_CUT/);
    }
    expect(src("app/api/reel/[id]/clips/route.js")).toMatch(/chargeRegen\(/);
    expect(src("app/api/reel/[id]/images/route.js")).toMatch(/chargeRegen\(/);
    expect(src("app/api/reel/[id]/images/route.js")).toMatch(/"sheet"/);
  });
});

// ── reel 컷 다시 굽기 — 값을 받고, 회차를 세고, 3회에 막는다 ───────────────────────
const CUT = (idx, stale) => ({
  idx,
  clip_prompt: stale ? "새 프롬프트" : "원래 프롬프트",
  image: { url: `https://fal/img${idx}.png`, of: "그림" },
  // 각인(of)이 지금 프롬프트와 다르면 낡은 컷이다 — lib/reel/steps.js 의 isReelClipStale.
  video: { url: `https://fal/cut${idx}.mp4`, of: "원래 프롬프트", imageOf: `https://fal/img${idx}.png` },
});

async function makeReel({ cuts, regenCount = 0 }) {
  const p = await runWithActor(U, () =>
    // ★ 모델을 적는다 — 안 적으면 modelIdForProject 가 옛 모델(kling)로 떨어져 8 크레딧을 받는다.
    //   라우트가 틀린 게 아니라 옛 문서의 정상 동작이다. 이 판이 재는 것은 2.0 720p 단가다.
    createProject({
      ownerId: U, kind: "reel", material: { text: "원두 광고", photos: [] },
      settings: { target_seconds: 60, i2v_model: "seedance-2.0", resolution: "720p" },
    })
  );
  await runWithActor(U, () => updateProject(p.id, U, (d) => ({
    ...d,
    scenario: { text: "시나리오", tries: 1 },
    cuts: cuts.map((c) => ({ ...c, clip_regen_count: regenCount })),
    reel: { status: "clips" },
  })));
  // 정가는 이미 냈다 — 이 파일이 재는 것은 그 뒤의 "다시"다.
  await runWithActor(U, () => chargeVideo({ userId: U, projectId: p.id, seconds: 60, model: "seedance-2.0", resolution: "720p" }));
  return p.id;
}

describe("reel 컷 다시 굽기", () => {
  beforeEach(async () => {
    resetMemoryStore();
    delete process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_NO_CREDITS;
    await memoryStore.insertProfile({ id: U, email: "c@x.kr", status: "approved", role: "user", tier: "pro" });
    await grant(10_000);
  });

  it("★★★ 첫 다시 굽기는 공짜지만 회차는 센다", async () => {
    const id = await makeReel({ cuts: [CUT(0, true), CUT(1, false)] });
    const res = await CLIPS(req(), ctx(id));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    const doc = await runWithActor(U, () => getProject(id, U));
    expect(doc.cuts[0].clip_regen_count, "낡은 컷의 회차").toBe(1);
    expect(doc.cuts[1].clip_regen_count, "안 낡은 컷은 안 굽고 안 센다").toBe(0);
    expect(await charges("regen_clip"), "첫 회는 공짜").toHaveLength(0);
  });

  it("★★★ 둘째 다시 굽기부터 REGEN_PRICE 만큼 받는다", async () => {
    const id = await makeReel({ cuts: [CUT(0, true)], regenCount: 1 });
    const res = await CLIPS(req(), ctx(id));
    expect(res.status).toBe(200);

    const rows = await charges("regen_clip");
    expect(rows).toHaveLength(1);
    expect(rows[0].credits).toBe(REGEN_PRICE.clip["seedance-2.0"]["720p"]);
    const doc = await runWithActor(U, () => getProject(id, U));
    // 라우트가 쓰는 판정 함수 둘로 다시 계산해도 같아야 한다 — 표와 라우트가 갈리면 여기서 잡힌다.
    expect(rows[0].credits).toBe(regenPrice("clip", 1, modelIdForProject(doc), resolutionForProject(doc)));
    expect(doc.cuts[0].clip_regen_count).toBe(2);
  });

  it("★★★ 3회를 다 썼으면 돈이 있어도 400 — 청구 앞에서 막는다", async () => {
    const id = await makeReel({ cuts: [CUT(0, true)], regenCount: MAX_REGEN_PER_CUT });
    const res = await CLIPS(req(), ctx(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/3회/);
    expect(await charges("regen_clip")).toHaveLength(0);
  });

  it("★★ 잔액이 모자라면 402 — 회차도 안 오른다", async () => {
    resetMemoryStore();
    await memoryStore.insertProfile({ id: U, email: "c@x.kr", status: "approved", role: "user", tier: "pro" });
    await grant(200);                                    // 정가(60초 720p)만 겨우
    const id = await makeReel({ cuts: [CUT(0, true)], regenCount: 1 });
    const res = await CLIPS(req(), ctx(id));
    expect(res.status).toBe(402);
    const doc = await runWithActor(U, () => getProject(id, U));
    expect(doc.cuts[0].clip_regen_count).toBe(1);
  });
});

// ── 광고 다시 굽기 — 정가는 매번 받고, 3회에 막는다 ──────────────────────────────
describe("광고 다시 굽기 상한", () => {
  const AD_H = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
  const post = () => new Request("http://x", { method: "POST", headers: AD_H });

  async function makeAd(rebakes) {
    const p = await runWithActor(U, () =>
      createProject({
        ownerId: U, kind: "ad", material: { text: "앰플 광고", photos: [] },
        settings: { seconds: 15, model: "minimax-h3", resolution: "2K", aspect_ratio: "9:16" },
      })
    );
    await runWithActor(U, () => updateProject(p.id, U, (d) => ({
      ...d,
      scenario: { text: "P", shots: [{ beat: "가" }], endpoint: "t2v", tries: 1 },
      status: "done",
      videos: [{ url: "https://fal/ad.mp4", seconds: 15, ts: 1 }],
      ad_bake_count: rebakes,
    })));
    return p.id;
  }

  beforeEach(async () => {
    resetMemoryStore();
    process.env.SHOTFORM_FAKE = "fal";
    delete process.env.SHOTFORM_NO_CREDITS;
    await memoryStore.insertProfile({ id: U, email: "c@x.kr", status: "approved", role: "user", tier: "pro" });
    await grant(10_000);
  });

  it("★★★ 다시 굽기 3회를 채웠으면 400", async () => {
    const id = await makeAd(MAX_REGEN_PER_CUT);
    const res = await AD_RENDER(post(), ctx(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/3회/);
  });

  it("★★ 2회까지 썼으면 시작되고 회차가 3이 된다", async () => {
    const id = await makeAd(MAX_REGEN_PER_CUT - 1);
    const res = await AD_RENDER(post(), ctx(id));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(202);
    const doc = await runWithActor(U, () => getProject(id, U));
    expect(doc.ad_bake_count).toBe(MAX_REGEN_PER_CUT);
  });
});
