import { describe, it, expect, afterEach } from "vitest";
import { fakeLevel, fakeFal, fakeLlm } from "../lib/fake";

afterEach(() => {
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_FAKE_IMAGES;
});

describe("fakeLevel", () => {
  it("아무것도 없으면 off", () => {
    expect(fakeLevel()).toBe("off");
    expect(fakeFal()).toBe(false);
    expect(fakeLlm()).toBe(false);
  });

  it("SHOTFORM_FAKE=1 은 fal만 막는다", () => {
    process.env.SHOTFORM_FAKE = "1";
    expect(fakeLevel()).toBe("fal");
    expect(fakeFal()).toBe(true);
    expect(fakeLlm()).toBe(false);
  });

  it("SHOTFORM_FAKE=all 은 LLM까지 막는다", () => {
    process.env.SHOTFORM_FAKE = "all";
    expect(fakeLevel()).toBe("all");
    expect(fakeFal()).toBe(true);
    expect(fakeLlm()).toBe(true);
  });

  it("SHOTFORM_FAKE=fal 도 fal만 막는다", () => {
    // ★ 최종 리뷰 I3 — CLAUDE.md 의 실행 예시 `SHOTFORM_FAKE=fal npm run dev` 가
    // 실제로는 인식되지 않아 off(진짜, 돈이 나감)로 동작했다.
    process.env.SHOTFORM_FAKE = "fal";
    expect(fakeLevel()).toBe("fal");
    expect(fakeFal()).toBe(true);
    expect(fakeLlm()).toBe(false);
  });

  it("옛 이름 SHOTFORM_FAKE_IMAGES=1 도 그대로 인정한다", () => {
    // tests/vlm.test.js 가 이 이름을 쓰고 있었다 — 깨뜨리지 않는다
    process.env.SHOTFORM_FAKE_IMAGES = "1";
    expect(fakeLevel()).toBe("fal");
    expect(fakeFal()).toBe(true);
  });

  it("모르는 값은 off 로 본다", () => {
    // 오타로 무료인 줄 알고 돌리면 돈이 나간다 — 애매하면 진짜로 동작시킨다
    process.env.SHOTFORM_FAKE = "true";
    expect(fakeLevel()).toBe("off");
  });
});
