// 완성본의 **이전 판** — 2026-09-18 사장님 요청("이전 영상도 보고 저장할 수 있었으면 좋겠다").
//
// 🔍 그전: 완성본 이름이 프로젝트마다 하나(`<id>.mp4`)라 다시 구우면 덮어썼다. 그래서 ⑤영상에
//   "다시 만들면 지금 영상은 사라져요"가 서 있었다(2026-08-25부터).
// ★ 지키는 것 넷:
//   ① 덮어쓰기 **직전**에 지금 완성본을 `<id>-v<시각>.mp4` 로 남긴다
//   ② 남기기가 실패해도 **완성본 만들기는 그대로 간다**(이미 값을 치른 영상이다)
//   ③ 판도 같은 문(`/api/renders/<이름>`)으로 열린다 — 이름 검사가 막지 않는다
//   ④ 프로젝트를 지우면 판도 함께 지운다 — 안 그러면 문서 없는 파일이 저장소에 영영 남는다
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { versionKey, parseVersionName, sortVersions } from "../lib/render-versions.js";
import { archiveCurrentRender } from "../lib/compose.js";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const { GET: listRoute } = await import("../app/api/projects/[id]/renders/route.js");
const { DELETE: deleteProjectRoute } = await import("../app/api/projects/[id]/route.js");

const U = "00000000-0000-4000-8000-0000000000b1";
const ID = "11111111-2222-4333-8444-555555555555";
const headers = { [USER_HEADER]: U, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = (method = "GET") => new Request("http://localhost/x", { method, headers });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

describe("판 이름 규칙", () => {
  it("★★ 이름에 시각이 들어가고, 그 이름에서 프로젝트와 시각을 되찾는다", () => {
    const key = versionKey(ID, 1758000000000);
    expect(key).toBe(`${ID}-v1758000000000.mp4`);
    expect(parseVersionName(key)).toEqual({ projectId: ID, ts: 1758000000000 });
  });

  it("★★ 판이 아닌 이름은 안 받는다 — 원본(-raw)이 판 목록에 섞이면 안 된다", () => {
    expect(parseVersionName(`${ID}.mp4`)).toBeNull();
    expect(parseVersionName(`${ID}-raw.mp4`)).toBeNull();
    expect(parseVersionName("아무거나.mp4")).toBeNull();
  });

  it("★ 새 것이 위다", () => {
    const sorted = sortVersions([{ ts: 1 }, { ts: 3 }, { ts: 2 }]);
    expect(sorted.map((v) => v.ts)).toEqual([3, 2, 1]);
  });
});

describe("덮어쓰기 직전에 판을 남긴다", () => {
  it("★★★ 지금 완성본을 그대로 복사해 둔다", async () => {
    const put = [];
    const key = await archiveCurrentRender(ID, {
      getObjectImpl: async () => Buffer.from([1, 2, 3]),
      putObjectImpl: async (bucket, k, bytes, ct) => { put.push({ bucket, k, len: bytes.length, ct }); },
      now: () => 1758000000000,
    });
    expect(key).toBe(`${ID}-v1758000000000.mp4`);
    expect(put).toEqual([{ bucket: "renders", k: key, len: 3, ct: "video/mp4" }]);
  });

  it("★★★ 남길 완성본이 없으면(첫 굽기) 조용히 지나간다", async () => {
    const put = [];
    const key = await archiveCurrentRender(ID, {
      getObjectImpl: async () => { throw new Error("객체를 찾을 수 없어요"); },
      putObjectImpl: async (...a) => { put.push(a); },
    });
    expect(key).toBeNull();
    expect(put, "없는 파일을 판으로 올렸다").toHaveLength(0);
  });

  it("★★★ 저장이 실패해도 **던지지 않는다** — 값을 치른 완성본을 잃지 않는다", async () => {
    const key = await archiveCurrentRender(ID, {
      getObjectImpl: async () => Buffer.from([1]),
      putObjectImpl: async () => { throw new Error("스토리지 오류"); },
    });
    expect(key).toBeNull();
  });

  it("★★ 굽는 자리 **둘 다** 판을 남긴다 — 자막만 다시 굽는 길이 빠지면 그 길만 덮어쓴다", () => {
    const src = readFileSync("lib/compose.js", "utf8");
    expect(src.match(/await archiveCurrentRender\(projectId, \{ putObjectImpl \}\);/g) || []).toHaveLength(2);
  });
});

describe("GET /api/projects/[id]/renders", () => {
  // ★ id 는 createProject 가 만든다 — 인자로 주는 자리가 없다(lib/projects.js).
  let pid;
  beforeEach(async () => {
    resetMemoryStore();
    pid = (await runWithActor(U, () => createProject({ settings: {}, material: { text: "t", photos: [] }, ownerId: U }))).id;
  });

  it("★★★ 판만 돌려준다 — 완성본·원본은 목록이 아니다", async () => {
    const store = getStore();
    await store.putObject("renders", `${pid}.mp4`, Buffer.from([1]), "video/mp4");
    await store.putObject("renders", `${pid}-raw.mp4`, Buffer.from([1]), "video/mp4");
    await store.putObject("renders", versionKey(pid, 1000), Buffer.from([1, 2]), "video/mp4");
    await store.putObject("renders", versionKey(pid, 2000), Buffer.from([1, 2, 3]), "video/mp4");

    const res = await listRoute(req(), ctx(pid));
    expect(res.status).toBe(200);
    const { versions } = await res.json();
    expect(versions.map((v) => v.ts), "새 것이 위가 아니다").toEqual([2000, 1000]);
    expect(versions[0].url).toBe(`/api/renders/${pid}-v2000.mp4`);
    expect(versions[0].bytes).toBe(3);
  });

  it("★★ 남의 것·없는 것은 같은 404 다", async () => {
    const other = { ...headers, [USER_HEADER]: "00000000-0000-4000-8000-0000000000b2" };
    const res = await listRoute(new Request("http://localhost/x", { headers: other }), ctx(pid));
    expect(res.status).toBe(404);
  });
});

describe("판도 같은 문으로 열린다", () => {
  it("★★★ 파일 이름 검사가 `-v<시각>` 을 받는다 — 막히면 저장은 되는데 못 연다", () => {
    const src = readFileSync("app/api/renders/[name]/route.js", "utf8");
    expect(src).toMatch(/\(-raw\|-v\\\\d\+\)\?/);
  });
});

describe("프로젝트를 지우면 판도 지운다", () => {
  it("★★★ 문서가 없어지면 판은 목록에도 안 잡힌다 — 그 전에 함께 지운다", async () => {
    resetMemoryStore();
    const pid = (await runWithActor(U, () => createProject({ settings: {}, material: { text: "t", photos: [] }, ownerId: U }))).id;
    const store = getStore();
    await store.putObject("renders", `${pid}.mp4`, Buffer.from([1]), "video/mp4");
    await store.putObject("renders", versionKey(pid, 1000), Buffer.from([1]), "video/mp4");
    await store.putObject("renders", versionKey(pid, 2000), Buffer.from([1]), "video/mp4");

    const res = await runWithActor(U, () => deleteProjectRoute(req("DELETE"), ctx(pid)));
    expect(res.status).toBe(200);
    expect(await memoryStore.listObjects("renders", pid), "판이 저장소에 남았다").toHaveLength(0);
  });
});

describe("보관함 상세 — 이전 판 줄", () => {
  const page = readFileSync("app/archive/[id]/page.js", "utf8");

  it("★★★ 판 목록을 라우트에 묻는다 — 문서에 적어 두지 않는다(진실은 저장소 하나)", () => {
    expect(page).toContain("/renders`");
    expect(page, "문서에서 판 목록을 읽는다 — 두 곳이 갈린다").not.toMatch(/doc\.\w*[Vv]ersions/);
  });

  it("★★★ 줄마다 [보기]·[내려받기]가 있고, 판이 없으면 줄 자체를 안 그린다", () => {
    expect(page).toContain("versions.length > 0");
    expect(page).toContain(">보기</a>");
    expect(page).toMatch(/\?dl=1`} download>내려받기<\/a>/);
  });
});
