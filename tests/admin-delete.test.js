// **운영자는 남의 영상도 지운다** (2026-09-03 사장님 지시).
//
// ★★ 그전에는 지우기만 소유자 전용으로 남아 있었다. 읽기·고치기는 08-27·09-01 에
//   운영자에게 열렸는데(ownerScope), 지우기는 라우트가 `getStore().deleteProject(id, user.id)`
//   로 **스토어를 직접** 불러 그 판정을 아예 안 지났다. 그 파일 머리말이 "열려면 그때
//   따로 연다"고 적어 두었고, 지금이 그때다.
//
// ★★★ 이 판은 **라우트를 실제로 부른다.** 소스 문자열로 재면 "역할을 읽는다"까지만 알 수
//   있고 정작 **남의 것이 지워지는가**는 모른다 — 권한은 그 결과가 전부다.
// ⚠️ 위험한 방향의 권한이라 **양쪽을 다 잰다**: 운영자는 되고, **일반 사용자는 안 된다**.
//   뒤엣것이 깨지면 아무나 남의 영상을 지운다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
import { DELETE } from "../app/api/projects/[id]/route.js";

const OWNER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";

const headersFor = (id, role) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const del = (id, as, role) =>
  DELETE(new Request(`http://localhost/api/projects/${id}`, { method: "DELETE", headers: headersFor(as, role) }),
    { params: Promise.resolve({ id }) });

async function makeOwned() {
  const p = await projects.createProject({
    ownerId: OWNER, settings: { aspect_ratio: "9:16" }, material: { text: "남의 영상", photos: [] },
  });
  return p.id;
}

beforeEach(() => resetMemoryStore());

describe("DELETE /api/projects/[id] — 누가 지울 수 있나", () => {
  it("★★★ 운영자는 **남의 영상도** 지운다", async () => {
    const id = await makeOwned();
    const res = await del(id, ADMIN, "admin");
    expect(res.status).toBe(200);
    // 진짜로 사라졌는가 — 응답 코드만 보면 '지웠다고 답했다'까지만 안다.
    const left = await getStore().selectProject(id, null);
    expect(left, "200 을 답했는데 문서가 남아 있다").toBeFalsy();
  });

  it("★★★ 일반 사용자는 남의 영상을 **못 지운다** — 이 줄이 깨지면 아무나 지운다", async () => {
    const id = await makeOwned();
    const res = await del(id, OTHER, "user");
    expect(res.status).toBe(404);
    const left = await getStore().selectProject(id, null);
    expect(left, "남의 영상이 지워졌다").toBeTruthy();
  });

  it("★★ 자기 영상은 그대로 지운다 — 원래 되던 것이 안 깨졌는가", async () => {
    const id = await makeOwned();
    const res = await del(id, OWNER, "user");
    expect(res.status).toBe(200);
    expect(await getStore().selectProject(id, null)).toBeFalsy();
  });

  it("★★ 없는 영상은 운영자에게도 404 다 — 존재 여부를 흘리지 않는다", async () => {
    const res = await del("00000000-0000-4000-8000-00000000dead", ADMIN, "admin");
    expect(res.status).toBe(404);
  });
});

describe("판정이 한 곳이다 — 라우트가 스토어를 직접 부르지 않는다", () => {
  it("★★★ 라우트는 lib/projects 의 문을 지난다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/projects/[id]/route.js", "utf8")
      .replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src, "스토어를 직접 불러 ownerScope 를 건너뛴다")
      .not.toMatch(/getStore\(\)\.deleteProject\(/);
    expect(src).toMatch(/deleteProjectDoc\(/);
  });

  it("★★ 스토어 둘이 **같은 규약**을 쓴다 — null 이면 소유자를 안 가린다", async () => {
    const { readFileSync } = await import("node:fs");
    for (const p of ["lib/store/memory.js", "lib/store/supabase.js"]) {
      const src = readFileSync(p, "utf8");
      const fn = src.slice(src.indexOf("deleteProject(id, ownerId)"));
      const body = fn.slice(0, 500);
      expect(body, `${p} 의 지우기가 null 규약을 안 따른다`)
        .toMatch(/ownerId !== null|byOwner\(/);
    }
  });
});

describe("모르면 안 넓힌다 — 컨텍스트 없이 운영자가 되지 않는다", () => {
  it("★★★ 역할 컨텍스트가 없으면 남의 것을 못 지운다(스크립트·단위 테스트가 그 자리다)", async () => {
    const id = await makeOwned();
    // 라우트를 안 거치고 직접 부른다 = actor 컨텍스트가 없다.
    const gone = await projects.deleteProject(id, OTHER);
    expect(gone, "컨텍스트 없이 남의 것이 지워졌다").toBe(false);
    expect(await getStore().selectProject(id, null)).toBeTruthy();
  });
});
