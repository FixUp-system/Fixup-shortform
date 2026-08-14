// 새 값은 다섯 라우트에 **전부** 실린다. 다섯이 서로 다른 것을 싣는 것이
// images_error 버그(2026-08-14)의 뿌리였다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "77777777-7777-7777-7777-777777777777";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const req = () => new Request("http://x/api", { headers: AUTH });

const routes = {
  status: (await import("../app/api/projects/[id]/status/route.js")).GET,
  cuts: (await import("../app/api/projects/[id]/cuts/status/route.js")).GET,
  voice: (await import("../app/api/projects/[id]/voice/status/route.js")).GET,
  clips: (await import("../app/api/projects/[id]/clips/status/route.js")).GET,
  render: (await import("../app/api/projects/[id]/render/status/route.js")).GET,
};

describe("상태 라우트가 심장박동을 실어 보낸다", () => {
  let id;
  beforeEach(async () => {
    resetMemoryStore();
    const p = await createProject({ ownerId: OWNER, settings: {} });
    id = p.id;
    await updateProject(id, OWNER, (proj) => ({
      ...proj,
      cuts: [{ idx: 0 }, { idx: 1 }],
      progress: { at: Date.now() - 5000, phase: "images", done: 1, total: 2 },
    }));
  });

  for (const [name, GET] of Object.entries(routes)) {
    it(`${name} 응답에 stalled_for_ms 와 progress 가 있다`, async () => {
      const res = await GET(req(), { params: Promise.resolve({ id }) });
      const body = await res.json();
      expect(body.stalled_for_ms, `${name} 이 stalled_for_ms 를 안 실었다`).toBeGreaterThanOrEqual(5000);
      expect(body.progress.phase).toBe("images");
      expect(body.progress.done).toBe(1);
      expect(body.progress.total).toBe(2);
    });
  }

  it("★ 컷 상태가 images_error 를 실어 보낸다 — 이 자리가 비어 있었다", async () => {
    await updateProject(id, OWNER, (proj) => ({ ...proj, images_error: "이미지 생성 실패 (429) x" }));
    const body = await (await routes.cuts(req(), { params: Promise.resolve({ id }) })).json();
    expect(body.images_error).toBe("이미지 생성 실패 (429) x");
  });

  it("progress 가 없는 옛 프로젝트는 stalled_for_ms 가 null 이다", async () => {
    const p = await createProject({ ownerId: OWNER, settings: {} });
    const body = await (await routes.status(req(), { params: Promise.resolve({ id: p.id }) })).json();
    expect(body.stalled_for_ms).toBeNull();
    expect(body.progress).toBeNull();
  });
});
