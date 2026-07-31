// vitest.setup.js 가 SHOTFORM_STORE 를 세우는 것은 다음 태스크다.
// getStore() 는 명시적 env 없이는 던지므로(조용한 인메모리 폴백 금지) 여기서 켜 준다.
process.env.SHOTFORM_STORE = "memory";

import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const post = (await import("../app/api/uploads/route.js")).POST;
const get = (await import("../app/api/uploads/[name]/route.js")).GET;

beforeEach(() => resetMemoryStore());

// 라우트가 withUser 로 감싸인 뒤로는 신원 헤더가 없으면 500 이다(Task 9) —
// 여기서 만드는 요청은 전부 이 헤더를 실어 보낸다.
const OWNER = "44444444-4444-4444-4444-444444444444";
const AUTH_HEADERS = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };
const authReq = () => new Request("http://x", { headers: AUTH_HEADERS });

function fileForm(bytes, type, name = "a.jpg") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return { formData: async () => form, headers: new Headers(AUTH_HEADERS) };
}

describe("업로드", () => {
  it("올리면 Storage 에 들어가고 URL 형태가 유지된다", async () => {
    const res = await post(fileForm("hello", "image/jpeg"));
    const body = await res.json();
    expect(body.url).toMatch(/^\/api\/uploads\/[a-f0-9-]+\.jpg$/);
    const key = body.url.split("/").pop();
    expect((await getStore().getObject("uploads", key)).toString()).toBe("hello");
  });

  it("허용되지 않는 형식은 400 이다", async () => {
    const res = await post(fileForm("x", "image/gif"));
    expect(res.status).toBe(400);
  });

  it("올린 것을 다시 받는다", async () => {
    const body = await (await post(fileForm("bytes", "image/png", "a.png"))).json();
    const name = body.url.split("/").pop();
    const res = await get(authReq(), { params: Promise.resolve({ name }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("bytes");
  });

  it("없는 파일은 404 다 — 500 으로 새지 않는다", async () => {
    // 소유자 기록도 없다 — 주인 기록이 없는 옛 업로드는 404 로 막는다(Task 9).
    const res = await get(authReq(), {
      params: Promise.resolve({ name: "00000000-0000-0000-0000-000000000000.jpg" }),
    });
    expect(res.status).toBe(404);
  });

  it("잘못된 파일명은 400 이다", async () => {
    const res = await get(authReq(), { params: Promise.resolve({ name: "../secret" }) });
    expect(res.status).toBe(400);
  });
});
