// ★ 양방향 격리 — 한쪽만 막으면 반대쪽으로 샌다.
// 이 저장소는 /clips·/voice 를 열어 둬서 환불된 프로젝트로 클립을 순지불 0 에 산 전례가 있다.
// 같은 실패 모양이라 여기서도 넓게 잰다.
//
// Task 7 은 격리의 절반이다: 기존 라우트(app/api/projects/[id]/**)가 광고 문서(kind:"ad")를
// 404 로 거절하는지 잰다. (반대쪽 — 광고 라우트가 기존 문서를 거절하는 것 — 은 다른 태스크가 잰다.)
//
// 두 그룹으로 나눠 잰다:
//   A — getProject(id, ownerId) 로 doc 통짜를 읽는 라우트. project.kind 를 바로 본다.
//   B — 2초마다 폴링하는 status 라우트. doc 통짜 대신 좁은 셀렉터(selectProjectProgress 등)를
//       쓰므로, 그 셀렉터가 kind 를 함께 실어야 가드를 걸 수 있다(lib/store/{memory,supabase}.js).
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

import { GET as getProjectRoute, PATCH as patchProjectRoute } from "../app/api/projects/[id]/route.js";
import { POST as scriptPOST } from "../app/api/projects/[id]/script/route.js";
import { POST as cutRegenPOST } from "../app/api/projects/[id]/cuts/[idx]/regen/route.js";
import { GET as statusGET } from "../app/api/projects/[id]/status/route.js";
import { GET as cutsStatusGET } from "../app/api/projects/[id]/cuts/status/route.js";
import { GET as voiceStatusGET } from "../app/api/projects/[id]/voice/status/route.js";
import { GET as clipsStatusGET } from "../app/api/projects/[id]/clips/status/route.js";
import { GET as renderStatusGET } from "../app/api/projects/[id]/render/status/route.js";

const U = "00000000-0000-4000-8000-00000000000a";
const run = (fn) => runWithActor(U, fn);

// tests/routes-auth.test.js 와 같은 요청 헬퍼 모양을 따른다.
const headersFor = (id, status = "approved") => ({
  [USER_HEADER]: id,
  [STATUS_HEADER]: status,
  [ROLE_HEADER]: "user",
});
const reqAs = (id = U) => new Request("http://localhost/api/projects/x", { headers: headersFor(id) });
const jsonReqAs = (id, body = {}) => ({ json: async () => body, headers: new Headers(headersFor(id)) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });

const makeAd = () => run(() => createProject({ material: { text: "광고 문서" }, ownerId: U, kind: "ad" }));
const makeOld = () => run(() => createProject({ material: { text: "옛 문서" }, ownerId: U }));

describe("기존 라우트는 광고 문서를 모른다 — A 그룹(getProject 로 doc 통짜를 읽는 라우트)", () => {
  beforeEach(() => resetMemoryStore());

  it("GET /api/projects/[id] — 광고 문서는 404", async () => {
    const p = await makeAd();
    const res = await getProjectRoute(reqAs(), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("GET /api/projects/[id] — 기존 문서는 그대로 200", async () => {
    const p = await makeOld();
    const res = await getProjectRoute(reqAs(), ctx(p.id));
    expect(res.status).toBe(200);
  });

  // PATCH 는 getProject 가 target_seconds 를 고칠 때만 불린다 — 그 자리만 막으면
  // material 만 고치는 본문은 가드를 안 거치고 광고 문서를 조용히 갱신할 수 있었다.
  // patchFn 안의 두 번째 가드가 그 구멍을 닫는다.
  it("PATCH /api/projects/[id] — target_seconds 없는 본문도 광고 문서면 404", async () => {
    const p = await makeAd();
    const res = await patchProjectRoute(jsonReqAs(U, { material: { text: "새 자료" } }), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("PATCH /api/projects/[id] — target_seconds 있는 본문도 광고 문서면 404", async () => {
    const p = await makeAd();
    const res = await patchProjectRoute(jsonReqAs(U, { settings: { target_seconds: 30 } }), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("PATCH /api/projects/[id] — 기존 문서는 그대로 200", async () => {
    const p = await makeOld();
    const res = await patchProjectRoute(jsonReqAs(U, { settings: { target_seconds: 30 } }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("POST /api/projects/[id]/script — 광고 문서는 404", async () => {
    const p = await makeAd();
    const res = await scriptPOST(jsonReqAs(U, {}), ctx(p.id));
    expect(res.status).toBe(404);
  });

  // regen 3형제는 getProject 호출이 `if (!fakeFal())` 안에 있고, 그 자리에 기존
  // `if (!project) 404` 가 없다(프로젝트가 없어도 400으로 흘러간다) — 그래도 project.kind
  // 는 이 자리에서 읽을 수 있으므로 광고 문서는 같은 자리에서 404 로 막는다.
  it("POST /api/projects/[id]/cuts/[idx]/regen — 광고 문서는 404", async () => {
    const p = await makeAd();
    const res = await cutRegenPOST(jsonReqAs(U, {}), idxCtx(p.id, 0));
    expect(res.status).toBe(404);
  });
});

describe("기존 라우트는 광고 문서를 모른다 — B 그룹(좁은 셀렉터로 폴링하는 status 라우트)", () => {
  beforeEach(() => resetMemoryStore());

  it.each([
    ["status", statusGET],
    ["cuts/status", cutsStatusGET],
    ["voice/status", voiceStatusGET],
    ["clips/status", clipsStatusGET],
    ["render/status", renderStatusGET],
  ])("%s — 광고 문서는 404", async (_name, handler) => {
    const p = await makeAd();
    const res = await handler(reqAs(), ctx(p.id));
    expect(res.status).toBe(404);
  });

  it("cuts/status — 기존 문서는 그대로 200", async () => {
    const p = await makeOld();
    const res = await cutsStatusGET(reqAs(), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it("render/status — 기존 문서는 그대로 200", async () => {
    const p = await makeOld();
    const res = await renderStatusGET(reqAs(), ctx(p.id));
    expect(res.status).toBe(200);
  });
});
