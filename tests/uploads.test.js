// vitest.setup.js 가 SHOTFORM_STORE 를 세우는 것은 다음 태스크다.
// getStore() 는 명시적 env 없이는 던지므로(조용한 인메모리 폴백 금지) 여기서 켜 준다.
process.env.SHOTFORM_STORE = "memory";

import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const post = (await import("../app/api/uploads/route.js")).POST;
const get = (await import("../app/api/uploads/[name]/route.js")).GET;

beforeEach(() => resetMemoryStore());

function fileForm(bytes, type, name = "a.jpg") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return { formData: async () => form };
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
    const res = await get(new Request("http://x"), { params: Promise.resolve({ name }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("bytes");
  });

  it("없는 파일은 404 다 — 500 으로 새지 않는다", async () => {
    const res = await get(new Request("http://x"), {
      params: Promise.resolve({ name: "00000000-0000-0000-0000-000000000000.jpg" }),
    });
    expect(res.status).toBe(404);
  });

  it("잘못된 파일명은 400 이다", async () => {
    const res = await get(new Request("http://x"), { params: Promise.resolve({ name: "../secret" }) });
    expect(res.status).toBe(400);
  });
});
