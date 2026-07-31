import { describe, it, expect, afterEach } from "vitest";

const saved = { ...process.env };
afterEach(() => {
  process.env.SHOTFORM_STORE = saved.SHOTFORM_STORE;
  process.env.SUPABASE_URL = saved.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved.SUPABASE_SERVICE_ROLE_KEY;
});

describe("저장소 선택", () => {
  it("SHOTFORM_STORE=memory 일 때만 인메모리다", async () => {
    process.env.SHOTFORM_STORE = "memory";
    const { getStore } = await import("../lib/store/index.js?sel=1");
    const { memoryStore } = await import("../lib/store/memory.js");
    expect(getStore()).toBe(memoryStore);
  });

  it("★ env 가 없으면 조용히 인메모리로 떨어지지 않는다 — 던진다", async () => {
    delete process.env.SHOTFORM_STORE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getStore } = await import("../lib/store/index.js?sel=2");
    expect(() => getStore()).toThrow(/SUPABASE_URL/);
  });
});
