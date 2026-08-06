import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getProjectRoute, PATCH as patchProjectRoute } from "../app/api/projects/[id]/route.js";
import { POST as scriptPOST } from "../app/api/projects/[id]/script/route.js";
import { POST as cutsPOST } from "../app/api/projects/[id]/cuts/route.js";
import { POST as imagesPOST } from "../app/api/projects/[id]/images/route.js";
import { POST as clipsPOST } from "../app/api/projects/[id]/clips/route.js";
import { POST as renderPOST } from "../app/api/projects/[id]/render/route.js";
import { POST as cutRegenPOST } from "../app/api/projects/[id]/cuts/[idx]/regen/route.js";
import { POST as voiceRegenPOST } from "../app/api/projects/[id]/voice/[idx]/regen/route.js";
import { POST as clipRegenPOST } from "../app/api/projects/[id]/clips/[idx]/regen/route.js";
import { POST as autoPOST } from "../app/api/projects/[id]/auto/route.js";
import { GET as cutsStatusGET } from "../app/api/projects/[id]/cuts/status/route.js";
import { GET as voiceStatusGET } from "../app/api/projects/[id]/voice/status/route.js";
import { GET as clipsStatusGET } from "../app/api/projects/[id]/clips/status/route.js";
import { GET as renderStatusGET } from "../app/api/projects/[id]/render/status/route.js";

// ★ 이 파일은 lib/pipeline.js 를 모킹하지 않는다(routes.test.js 와 다르다) — 진짜 소유자
// 검사를 확인하려는 것이라, 모킹하면 규모 있는 되돌림(라우트가 하드코딩된 옛 값으로 돌아가는
// 것)을 규제할 수 없다.

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const headersFor = (id, status = "approved") => ({
  [USER_HEADER]: id,
  [STATUS_HEADER]: status,
  [ROLE_HEADER]: "user",
});

const reqAs = (id) => new Request("http://localhost/api/projects/x", { headers: headersFor(id) });
// json() 이 있는 요청 — POST/PATCH 라우트용
const jsonReqAs = (id, body = {}) => ({ json: async () => body, headers: new Headers(headersFor(id)) });

const ctx = (id) => ({ params: Promise.resolve({ id }) });
const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });

const make = (ownerId) =>
  createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId });

// 시작 게이트가 붙은 뒤로, 영상 정가가 없는 사용자는 소유자 검사 뒤에서 402 다.
// 여기서 재려는 것은 소유자 격리지 크레딧이 아니므로 부르는 쪽을 충전해 두고 부른다 —
// 가드를 끄는 것이 아니라 통과시켜 **그 뒤의** 격리가 실제로 막는지를 본다.
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const grant = (userId) =>
  getStore().insertGrant({ user_id: userId, amount_credits: 500, reason: "충전", granted_by: ADMIN });

describe("프로젝트 라우트 인증", () => {
  beforeEach(() => resetMemoryStore());

  it("주인은 읽는다", async () => {
    const p = await make(A);
    const res = await getProjectRoute(reqAs(A), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("남은 404 다 — 존재 여부를 흘리지 않는다", async () => {
    const p = await make(A);
    const res = await getProjectRoute(reqAs(B), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("신원 헤더가 없으면 500 이다", async () => {
    const p = await make(A);
    const bare = new Request("http://localhost/api/projects/x");
    const res = await getProjectRoute(bare, ctx(p.id));
    expect(res.status).toBe(500);
  });

  it("미승인은 403 이다", async () => {
    const p = await make(A);
    const pendingReq = new Request("http://localhost/api/projects/x", {
      headers: headersFor(A, "pending"),
    });
    const res = await getProjectRoute(pendingReq, ctx(p.id));
    expect(res.status).toBe(403);
  });
});

// ★ 리뷰 I1 — routes.test.js 는 pipeline.js 를 모킹해 소유자 배선을 못 잡는다(하드코딩된
// 옛 자리표시자로 돌아가도 같은 OWNER 값이면 통과했다). 여기서는 진짜 저장소·진짜 pipeline
// 을 쓰고, "다른 사람 id 로 부르면 어떻게 되는가"를 라우트마다 한 줄씩 확인한다.
describe("변이 라우트 — 남의 id 로 부르면 실패한다", () => {
  beforeEach(() => resetMemoryStore());

  it("PATCH /api/projects/[id] — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await patchProjectRoute(jsonReqAs(B, { script_text: "훔친 편집" }), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST script — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await scriptPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST cuts — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await cutsPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST images — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await imagesPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST clips — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await clipsPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST render — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await renderPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("POST auto — 남의 id 는 404", async () => {
    const p = await make(A);
    const res = await autoPOST(jsonReqAs(B, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  // regen 3개는 라우트 자체가 소유자를 먼저 확인하지 않는다 — pipeline.js 안의
  // getProject(id, ownerId) 가 null 을 주고, 컷을 못 찾아 "컷을 찾을 수 없어요"로 던지며
  // 라우트가 그것을 400 으로 감싼다. 200(성공)이 아니라는 것, 그리고 A 의 컷이 안 건드려진다는
  // 것을 함께 본다.
  it("POST cuts/[idx]/regen — 남의 id 는 400 이고 남의 컷을 못 건드린다", async () => {
    const p = await make(A);
    await updateProject(p.id, A, (proj) => ({
      ...proj, cuts: [{ idx: 0, sentence: "문장", regen_count: 0 }],
    }));
    await grant(B);
    const res = await cutRegenPOST(jsonReqAs(B, {}), idxCtx(p.id, 0));
    expect(res.status).toBe(400);
    const after = await getProjectRoute(reqAs(A), ctx(p.id)).then((r) => r.json());
    expect(after.cuts[0].regen_count).toBe(0);
  });

  it("POST voice/[idx]/regen — 남의 id 는 400 이고 남의 컷을 못 건드린다", async () => {
    const p = await make(A);
    await updateProject(p.id, A, (proj) => ({
      ...proj, cuts: [{ idx: 0, sentence: "문장", voice_regen_count: 0 }],
    }));
    await grant(B);
    const res = await voiceRegenPOST(jsonReqAs(B, {}), idxCtx(p.id, 0));
    expect(res.status).toBe(400);
    const after = await getProjectRoute(reqAs(A), ctx(p.id)).then((r) => r.json());
    expect(after.cuts[0].voice_regen_count).toBe(0);
  });

  it("POST clips/[idx]/regen — 남의 id 는 400 이고 남의 컷을 못 건드린다", async () => {
    const p = await make(A);
    await updateProject(p.id, A, (proj) => ({
      ...proj,
      cuts: [{ idx: 0, sentence: "문장", clip_regen_count: 0, image: { url: "i" } }],
    }));
    await grant(B);
    const res = await clipRegenPOST(jsonReqAs(B, {}), idxCtx(p.id, 0));
    expect(res.status).toBe(400);
    const after = await getProjectRoute(reqAs(A), ctx(p.id)).then((r) => r.json());
    expect(after.cuts[0].clip_regen_count).toBe(0);
  });
});

// ★ 최종 리뷰 I2 — PATCH 가 material.photos 를 통째로 머지해서 남의 업로드 키를 자기
// 프로젝트에 심을 수 있었다. pipeline.js 가 그 키로 원본 바이트를 읽어 VLM 판정을 태우고
// 결과가 doc 에 저장돼 화면에 샌다. 소유자 검사가 실제로 거부하는지, 자기 키는 통과하는지를
// 함께 잰다.
describe("PATCH /api/projects/[id] — material.photos 소유자 검사", () => {
  beforeEach(() => resetMemoryStore());

  it("남의 업로드 키를 심으려 하면 거부된다", async () => {
    const p = await make(A);
    await memoryStore.insertUploadOwner("b-secret.jpg", B);
    const res = await patchProjectRoute(
      jsonReqAs(A, { material: { photos: [{ url: "/api/uploads/b-secret.jpg" }] } }),
      ctx(p.id)
    );
    expect(res.status).toBe(400);
  });

  it("주인 기록이 없는 키(백필 전 옛 업로드)도 거부한다", async () => {
    const p = await make(A);
    const res = await patchProjectRoute(
      jsonReqAs(A, { material: { photos: [{ url: "/api/uploads/no-owner.jpg" }] } }),
      ctx(p.id)
    );
    expect(res.status).toBe(400);
  });

  it("자기 업로드 키는 통과한다", async () => {
    const p = await make(A);
    await memoryStore.insertUploadOwner("a-mine.jpg", A);
    const res = await patchProjectRoute(
      jsonReqAs(A, { material: { photos: [{ url: "/api/uploads/a-mine.jpg" }] } }),
      ctx(p.id)
    );
    expect(res.status).toBe(200);
  });
});

// ★ 리뷰 I2 — 2초마다 불리는 status 폴링 라우트 4개가 tests/ 전체에서 한 번도 안 불렸다.
// withUser 를 벗겨도 빌드만 통과하면 아무도 못 잡는 상태였다. 넷 다 같은 자로 잰다:
// 주인 200 · 남의 id 404 · 헤더 없음 500.
describe("status 폴링 라우트 — 신원을 본다", () => {
  beforeEach(() => resetMemoryStore());

  it.each([
    ["cuts/status", cutsStatusGET],
    ["voice/status", voiceStatusGET],
    ["clips/status", clipsStatusGET],
    ["render/status", renderStatusGET],
  ])("%s — 주인 200 · 남의 id 404 · 헤더 없음 500", async (_name, handler) => {
    const p = await make(A);

    const ok = await handler(reqAs(A), ctx(p.id));
    expect(ok.status).toBe(200);

    const denied = await handler(reqAs(B), ctx(p.id));
    expect(denied.status).toBe(404);

    const bare = new Request("http://localhost/api/projects/x");
    const bareRes = await handler(bare, ctx(p.id));
    expect(bareRes.status).toBe(500);
  });
});
