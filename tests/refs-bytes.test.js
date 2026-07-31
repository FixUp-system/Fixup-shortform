import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { readRefBytes } from "../lib/refs-io.js";

beforeEach(() => resetMemoryStore());

describe("레퍼런스 바이트 읽기", () => {
  it("업로드는 Storage 에서 읽는다", async () => {
    await getStore().putObject("uploads", "x.jpg", Buffer.from("up"), "image/jpeg");
    expect((await readRefBytes({ source: "upload", key: "x.jpg" })).toString()).toBe("up");
  });

  it("아바타는 로컬 assets 에서 읽는다 — 저장소에 커밋된 읽기 전용 자산이다", async () => {
    const buf = await readRefBytes({ source: "avatar", key: "man-30s.jpg" });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("없는 것은 null 이다 — 그림은 레퍼런스 없이라도 나와야 한다", async () => {
    expect(await readRefBytes({ source: "upload", key: "없음.jpg" })).toBeNull();
    expect(await readRefBytes({ source: "avatar", key: "없음.jpg" })).toBeNull();
  });
});
