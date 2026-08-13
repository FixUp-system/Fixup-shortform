// 낡은 클립을 다시 만드는 것도 **재생성이다** — 값을 받는다.
//
// 구멍이었다: 컷을 고치면 클립이 낡고, ⑤영상의 [남은 N개 만들기]가 그것들을 **무료로**
// 다시 만들었다(원가는 컷당 $0.42~$1.51 나간다). 컷별 [다시 만들기]는 값을 받는데
// 일괄 버튼은 안 받아, 값을 피하는 길이 화면에 그대로 있었다(2026-08-13 사용자 지적).
//
// 규칙은 컷별 재생성과 **똑같다**: 같은 값 · 같은 회차(clip_regen_count) · 같은 상한(3회).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject, updateProject } from "../lib/projects.js";
import { chargeVideo } from "../lib/charges.js";
import { REGEN_PRICE, MAX_REGEN_PER_CUT } from "../lib/pricing.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

vi.mock("../lib/pipeline.js", async (orig) => ({
  ...(await orig()),
  runVideoPipeline: vi.fn(async () => {}),
}));

const { POST } = await import("../app/api/projects/[id]/clips/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const req = () => ({ headers: new Headers({ [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 클립이 있고 **낡은** 컷을 만든다 — 그림이 클립보다 새로우면 낡음이다(lib/steps.js).
async function projectWithStaleClip(clipRegenCount = 0) {
  const p = await createProject({
    ownerId: A,
    settings: { target_seconds: 30, i2v_model: "kling-v3", aspect_ratio: "9:16" },
    material: { text: "자료", photos: [] },
  });
  await updateProject(p.id, A, (proj) => ({
    ...proj,
    status: "video",
    cuts: [{
      idx: 0, sentence: "가", seconds: 3,
      // 소리가 있어야 클립 길이를 안다(라우트의 전제)
      audio: { url: "https://x/a.m4a" },
      image: { url: "https://x/i.png" },
      // of 가 지금 각인과 다르면 낡음이다(lib/steps.js 의 isClipStale)
      video: { url: "https://x/v.mp4", of: "옛-각인" },
      clip_regen_count: clipRegenCount,
    }],
  }));
  return p;
}

describe("낡은 클립을 다시 만들면 값을 받는다", () => {
  beforeEach(() => {
    resetMemoryStore();
    delete process.env.SHOTFORM_FAKE;
  });

  const grant = (n) => getStore().insertGrant({ user_id: A, amount_credits: n, reason: "충전", granted_by: ADMIN });

  it("컷당 첫 회는 그대로 공짜다 — 컷별 [다시 만들기]와 같은 규칙", async () => {
    await grant(500);
    const p = await projectWithStaleClip(0);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });
    const before = await getStore().sumCharges(A);

    const res = await POST(req(), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    expect(await getStore().sumCharges(A), "첫 회인데 값을 받았다").toBe(before);
    // 다음 번이 유료가 되려면 회차가 올라야 한다
    expect((await getProject(p.id, A)).cuts[0].clip_regen_count).toBe(1);
  });

  it("둘째 회부터 컷별 재생성과 같은 값을 받는다", async () => {
    await grant(500);
    const p = await projectWithStaleClip(1);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });
    const before = await getStore().sumCharges(A);

    await POST(req(), ctx(p.id));
    expect(await getStore().sumCharges(A) - before).toBe(REGEN_PRICE.clip["kling-v3"]["720p"]);
  });

  it("상한을 넘기지 못한다 — 컷별과 같은 3회다", async () => {
    await grant(500);
    const p = await projectWithStaleClip(MAX_REGEN_PER_CUT);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });

    const res = await POST(req(), ctx(p.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/3회/);
  });

  it("크레딧이 모자라면 만들지 않는다", async () => {
    await grant(60);   // 정가 50 을 내고 나면 10 남는다 — 재생성 8 은 되지만…
    const p = await projectWithStaleClip(1);
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });
    await getStore().insertGrant({ user_id: A, amount_credits: -8, reason: "회수", granted_by: ADMIN });

    const res = await POST(req(), ctx(p.id));
    expect(res.status).toBe(402);
  });

  // 처음 만드는 컷(클립이 아예 없는 컷)은 정가에 포함이다 — 여기서 또 받으면 이중 청구다.
  it("아직 안 만든 컷은 공짜다 — 정가에 포함이다", async () => {
    await grant(500);
    const p = await createProject({
      ownerId: A,
      settings: { target_seconds: 30, i2v_model: "kling-v3" },
      material: { text: "자료", photos: [] },
    });
    await updateProject(p.id, A, (proj) => ({
      ...proj, status: "video",
      cuts: [{ idx: 0, sentence: "가", seconds: 3, image: { url: "https://x/i.png" } }],
    }));
    await chargeVideo({ userId: A, projectId: p.id, seconds: 30, model: "kling-v3" });
    const before = await getStore().sumCharges(A);

    await POST(req(), ctx(p.id));
    expect(await getStore().sumCharges(A)).toBe(before);
  });
});
