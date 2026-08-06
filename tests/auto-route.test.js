import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";

// 라우트가 fire-and-forget 으로 부르는 오케스트레이터는 모킹한다 —
// 여기서 검증할 것은 가드·멱등·voice 배선이지 관통이 아니다(그건 tests/auto.test.js).
vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";
import { POST } from "../app/api/projects/[id]/auto/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

// 시작 게이트가 붙은 뒤로, 잔액이 영상 정가(30초 = 50 크레딧)에 못 미치면 402 다.
// 이 파일이 재는 것은 가드·멱등·voice 배선이므로 시작할 수 있는 상태를 만들어 두고 부른다 —
// 게이트를 끄는 것이 아니라 통과시켜 **그 뒤의** 판정을 본다.
// (게이트 자체는 tests/credits-gate.test.js 가 잰다.)
const grant = () =>
  getStore().insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: ADMIN });
const headersFor = (id) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const reqAs = (id, body = {}) =>
  new Request("http://localhost/api/projects/x/auto", {
    method: "POST", headers: headersFor(id), body: JSON.stringify(body),
  });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function makeProject(ownerId = A) {
  return projects.createProject({
    ownerId, settings: { aspect_ratio: "9:16", target_seconds: 30 },
    material: { text: "자료", photos: [] },
  });
}

describe("POST /api/projects/[id]/auto", () => {
  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); });

  it("시작하면 voice 를 배선하고 auto running 을 세운 뒤 202", async () => {
    const p = await makeProject();
    await grant();
    const res = await POST(reqAs(A, { voice_label: "밝은 여성" }), ctx(p.id));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ started: true });
    const saved = await projects.getProject(p.id, A);
    expect(saved.voice_id).toBe("Laura");           // lib/voices.js 실물 매핑
    expect(saved.voice_label).toBe("밝은 여성");
    expect(saved.auto).toEqual({ stage: "briefing", state: "running", error: null });
    expect(runAutoPipeline).toHaveBeenCalledWith(p.id, A);
  });

  it("모르는 voice_label 은 기본 목소리로 떨어진다 — 대화 LLM 이 목록 밖을 답해도 새지 않게", async () => {
    const p = await makeProject();
    await grant();
    await POST(reqAs(A, { voice_label: "우렁찬 외계인" }), ctx(p.id));
    expect((await projects.getProject(p.id, A)).voice_id).toBe("Sarah");
  });

  it("남의 프로젝트는 404 — 존재를 흘리지 않는다", async () => {
    const p = await makeProject(A);
    expect((await POST(reqAs(B), ctx(p.id))).status).toBe(404);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("이미 진행 중이면 409", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, auto: { stage: "voice", state: "running", error: null } }));
    await grant();
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(409);
  });

  it("이미 완성본이 있으면 409 — $2.59 를 두 번 사지 않는다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({ ...proj, render: { url: "/r.mp4" } }));
    await grant();
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(409);
  });

  // 가짜 합성(SHOTFORM_FAKE)은 일부러 파일을 안 만든다 — render = { fake: true } 뿐이다.
  // url 로 완성을 판독하면 가짜 완성 프로젝트가 관통을 처음부터 다시 돈다.
  it("가짜 완성(render.fake, url 없음)도 409 — 완성 이력은 render 객체 존재로 본다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({ ...proj, render: { fake: true, ts: 1 } }));
    await grant();
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(409);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("자료 없는 프로젝트는 400 — 빈 자료로 관통을 시작하지 않는다", async () => {
    const p = await projects.createProject({
      ownerId: A, settings: { aspect_ratio: "9:16", target_seconds: 30 },
      material: { text: "   ", photos: [] },
    });
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(400);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  // ★ 멱등 가드는 락 안(patchFn)에서 판정해야 한다. 읽고-나서-쓰면 [만들기] 동시 두 번에
  // 둘 다 통과해 $2.59 를 두 번 산다.
  it("동시에 두 번 눌러도 하나만 202 고 하나는 409 다", async () => {
    const p = await makeProject();
    await grant();
    const results = await Promise.all([
      POST(reqAs(A), ctx(p.id)),
      POST(reqAs(A), ctx(p.id)),
    ]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([202, 409]);
    expect(runAutoPipeline).toHaveBeenCalledTimes(1);
  });
});
