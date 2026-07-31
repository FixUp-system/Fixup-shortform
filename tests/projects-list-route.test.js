import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET } from "../app/api/projects/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const as = (id) => new Request("http://localhost/api/projects", {
  headers: { [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

describe("GET /api/projects", () => {
  beforeEach(() => resetMemoryStore());

  it("내 것만 준다", async () => {
    await createProject({ settings: {}, material: { text: "내 것", photos: [] }, ownerId: A });
    await createProject({ settings: {}, material: { text: "남의 것", photos: [] }, ownerId: B });

    const res = await GET(as(A), {});
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].title).toBe("내 것");
  });

  it("doc 통짜를 싣지 않는다", async () => {
    await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const body = await (await GET(as(A), {})).json();
    expect(body.projects[0]).not.toHaveProperty("cuts");
    expect(body.projects[0]).not.toHaveProperty("script");
  });
});
