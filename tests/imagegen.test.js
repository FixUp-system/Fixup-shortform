// generateImage — 레퍼런스가 실제로 실려 나가는지 본다.
// 이 함수에 직접 테스트가 없어서, 두 장을 보내는 변경이 조용히 틀릴 수 있었다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { generateImage } from "../lib/imagegen.js";

let dir, a, b;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "shotform-img-"));
  a = path.join(dir, "person.jpg"); writeFileSync(a, "AAA");
  b = path.join(dir, "thing.png");  writeFileSync(b, "BBB");
  process.env.SHOTFORM_DATA_DIR = dir;   // 비용 기록을 임시 폴더로
  process.env.SHOTFORM_BUDGET_TOTAL_USD = "100";
  process.env.SHOTFORM_BUDGET_PROJECT_USD = "100";
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_FAKE_IMAGES;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const ok = (seen) => async (url, init) => {
  seen.url = url;
  seen.body = JSON.parse(init.body);
  return { ok: true, json: async () => ({ images: [{ url: "https://f/out.png" }] }) };
};

describe("generateImage — 레퍼런스", () => {
  it("레퍼런스가 없으면 base 엔드포인트로 가고 image_urls 를 안 보낸다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl: ok(seen) });
    expect(seen.url).not.toContain("/edit");
    expect(seen.body.image_urls).toBeUndefined();
  });

  it("레퍼런스가 있으면 edit 엔드포인트로 간다 — base 모델은 image_urls 를 받지 않는다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }], fetchImpl: ok(seen) });
    expect(seen.url).toContain("/edit");
  });

  it("두 장을 순서대로 싣는다 — 인물과 사물을 함께 붙이는 자리다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }, { path: b, kind: "thing" }], fetchImpl: ok(seen) });
    expect(seen.body.image_urls).toHaveLength(2);
    expect(seen.body.image_urls[0]).toContain("image/jpeg");   // .jpg → jpeg
    expect(seen.body.image_urls[1]).toContain("image/png");
    expect(seen.body.image_urls[0]).toContain(Buffer.from("AAA").toString("base64"));
  });

  it("가짜 모드에서는 fal 을 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const got = await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }], fetchImpl: async () => { called = true; } });
    expect(called).toBe(false);
    expect(got.url).toContain("data:image/svg+xml");
    delete process.env.SHOTFORM_FAKE;
  });
});
