// 접수증을 문서에 적기 전에 함수가 죽은 편 — **웹훅이 그 접수증을 되살린다**(2026-09-30 점검).
//
// ★★★ 무엇이 비어 있었나. 접수(fal)와 접수증 쓰기(updateProject)는 별개 걸음이다. 그 사이에
//   함수가 죽으면 fal 은 값을 받고 끝까지 굽는데 문서에는 요청 번호가 없다. 웹훅 주소에
//   projectId(`p`)를 실어 보내는 것이 바로 그 경우를 위한 장치였는데, 웹훅이 부르는 쓸기가
//   **접수증이 있는 행만** 골라서(lib/store/supabase.js 의 selectBakingProjects) 그 장치가
//   한 번도 일하지 못했다. fal 에는 요청 목록 API 가 없으니 그 편은 영영 미아였다.
//
// ★★★ 그리고 **이번 굽기의 웹훅**일 때만(리뷰가 잡았다). 같은 편의 **이전 굽기** 웹훅이
//   재시도로 늦게 도착한 순간 새 굽기가 접수 직전(접수증 없음)이면, 옛 요청 번호를 새 굽기의
//   접수증으로 착각한다 — 광고는 새 굽기가 영구 미아가 되거나 환불까지 나간다. 그래서 굽기마다
//   표식(bake)을 **접수 전에** 문서에 적고 웹훅 주소에 싣는다. 표식이 같을 때만 되살린다.
// ★ 되살리는 조건은 좁다 — "굽는 중인데 접수증이 없다"일 때만. 접수증이 있으면 정상 수거가
//   하고, ⑥완성 합성(reel 의 progress.phase "render")도 status 가 rendering 이라 **반드시**
//   걸러야 한다: 늦게 도착한 웹훅 재시도가 합성 중인 편을 ⑤로 되돌리면 안 된다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as projects from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { adoptOrphanReceipt } from "../lib/orphan-receipt.js";
import { adEndpoint } from "../lib/ad/models.js";
import { queueAppOf } from "../lib/clip-limits.js";

const OWNER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => resetMemoryStore());

async function make(kind, patch) {
  const p = await projects.createProject({ ownerId: OWNER, kind, settings: { seconds: 15 }, material: { text: "자료", photos: [] } });
  await projects.updateProject(p.id, OWNER, (d) => ({ ...d, ...patch }));
  return p.id;
}
const read = (id) => runWithActor(OWNER, () => projects.getProject(id, OWNER));

describe("광고 — 접수증을 되살려 정상 수거에 넘긴다", () => {
  const scenario = { text: "장면", endpoint: "t2v" };

  it("★★★ 굽는 중인데 접수증이 없으면 요청 번호로 접수증을 쓴다", async () => {
    const id = await make("ad", { status: "rendering", ad_job: null, bake_token: "t2", scenario });
    const out = await adoptOrphanReceipt(id, { requestId: "req-lost", bake: "t2" }, { now: () => 1234 });

    expect(out.adopted).toBe("ad");
    const doc = await read(id);
    const endpoint = adEndpoint(doc.settings?.model, "t2v");
    const app = queueAppOf(endpoint);
    expect(doc.ad_job).toEqual({
      requestId: "req-lost",
      statusUrl: `https://queue.fal.run/${app}/requests/req-lost/status`,
      responseUrl: `https://queue.fal.run/${app}/requests/req-lost`,
      endpoint, seconds: 15, startedAt: 1234,
    });
    expect(doc.ad_request_id).toBe("req-lost");
    expect(doc.status).toBe("rendering");      // 끝내는 것은 정상 수거·마무리의 일이다
  });

  it("접수증이 이미 있으면 손대지 않는다", async () => {
    const job = { requestId: "req-live", statusUrl: "s", responseUrl: "r", endpoint: "e", seconds: 15, startedAt: 1 };
    const id = await make("ad", { status: "rendering", ad_job: job, bake_token: "t2", scenario });
    const out = await adoptOrphanReceipt(id, { requestId: "req-other", bake: "t2" });
    expect(out.adopted).toBeUndefined();
    expect((await read(id)).ad_job).toEqual(job);
  });

  it("굽는 중이 아니면 손대지 않는다", async () => {
    const id = await make("ad", { status: "done", ad_job: null, bake_token: "t2", scenario });
    const out = await adoptOrphanReceipt(id, { requestId: "req-late", bake: "t2" });
    expect(out.adopted).toBeUndefined();
    expect((await read(id)).ad_job).toBeNull();
  });
});

describe("reel — 운영자 구조선과 같은 길로 붙인다", () => {
  it("★★★ ⑤영상 굽는 중인데 접수증이 없으면 그 요청 번호로 붙인다", async () => {
    const id = await make("reel", { reel: { status: "rendering", job: null, bakeToken: "t2" }, progress: { phase: "video", at: 1 } });
    const attach = vi.fn(async () => ({ attached: true }));
    const out = await adoptOrphanReceipt(id, { requestId: "req-lost", bake: "t2" }, { attachReel: attach });

    expect(out.adopted).toBe("reel");
    expect(attach).toHaveBeenCalledWith(id, OWNER, { requestId: "req-lost" }, { orphan: true });
  });

  it("★★★ ⑥완성 합성 중(phase render)이면 손대지 않는다 — 늦은 웹훅이 합성을 덮으면 안 된다", async () => {
    const id = await make("reel", { reel: { status: "rendering", job: null, bakeToken: "t2" }, progress: { phase: "render", at: 1 } });
    const attach = vi.fn(async () => ({ attached: true }));
    const out = await adoptOrphanReceipt(id, { requestId: "req-late", bake: "t2" }, { attachReel: attach });
    expect(out.adopted).toBeUndefined();
    expect(attach).not.toHaveBeenCalled();
  });

  it("접수증이 있으면 손대지 않는다 — 정상 수거의 일이다", async () => {
    const id = await make("reel", { reel: { status: "rendering", job: { requestId: "req-live" }, bakeToken: "t2" }, progress: { phase: "video", at: 1 } });
    const attach = vi.fn(async () => ({ attached: true }));
    await adoptOrphanReceipt(id, { requestId: "req-live", bake: "t2" }, { attachReel: attach });
    expect(attach).not.toHaveBeenCalled();
  });
});

describe("가리킬 것이 없으면 조용히 지나간다", () => {
  it("요청 번호가 없으면 아무것도 안 읽는다", async () => {
    const id = await make("ad", { status: "rendering", ad_job: null, bake_token: "t2", scenario: { endpoint: "t2v" } });
    expect((await adoptOrphanReceipt(id, { requestId: "", bake: "t2" })).adopted).toBeUndefined();
    expect((await read(id)).ad_job).toBeNull();
  });

  it("없는 편이면 던지지 않는다", async () => {
    const out = await adoptOrphanReceipt("33333333-3333-4333-8333-333333333333", { requestId: "req-x", bake: "t2" });
    expect(out.adopted).toBeUndefined();
  });
});

describe("★★★ 이전 굽기의 늦은 웹훅 — 표식이 다르면 되살리지 않는다(리뷰가 잡은 경합)", () => {
  it("광고: 새 굽기가 접수 직전인데 옛 굽기의 표식을 든 웹훅이 오면 손대지 않는다", async () => {
    const id = await make("ad", { status: "rendering", ad_job: null, bake_token: "t2", scenario: { endpoint: "t2v" } });
    const out = await adoptOrphanReceipt(id, { requestId: "req-old", bake: "t1" });
    expect(out.adopted).toBeUndefined();
    expect((await read(id)).ad_job).toBeNull();
  });

  it("광고: 표식이 없는 웹훅(이 수정 전에 접수된 굽기)은 되살리지 않는다", async () => {
    const id = await make("ad", { status: "rendering", ad_job: null, bake_token: "t2", scenario: { endpoint: "t2v" } });
    expect((await adoptOrphanReceipt(id, { requestId: "req-old", bake: null })).adopted).toBeUndefined();
  });

  it("reel: 표식이 다르면 구조선을 부르지 않는다", async () => {
    const id = await make("reel", { reel: { status: "rendering", job: null, bakeToken: null }, progress: { phase: "video", at: 1 } });
    const attach = vi.fn(async () => ({ attached: true }));
    await adoptOrphanReceipt(id, { requestId: "req-old", bake: "t1" }, { attachReel: attach });
    expect(attach).not.toHaveBeenCalled();
  });
});
