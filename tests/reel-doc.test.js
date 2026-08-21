// reel 문서의 모양과 잠금. **순수 함수다** — 화면도 이 파일을 import 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { emptyReel, reelOf, putReel, scenarioLock, isPromptsReady } from "../lib/reel/doc.js";

describe("순수 규율", () => {
  it("import 문이 없다 — 화면 번들에 fs 가 섞이면 안 된다", () => {
    const src = readFileSync("lib/reel/doc.js", "utf8");
    expect(src).not.toMatch(/^import /m);
  });
});

describe("문서 모양", () => {
  it("빈 문서는 draft 다", () => {
    expect(emptyReel().status).toBe("draft");
  });

  it("reelOf 는 없는 문서에도 빈 것을 준다", () => {
    expect(reelOf(null)).toEqual(emptyReel());
    expect(reelOf({})).toEqual(emptyReel());
  });

  it("putReel 은 덮어쓰지 않고 얹는다", () => {
    const p = putReel({ reel: { status: "draft", video: null } }, { status: "rendering" });
    expect(p.reel.status).toBe("rendering");
    expect(p.reel).toHaveProperty("video");
  });
});

describe("시나리오 잠금", () => {
  it("아무것도 안 만들었으면 안 잠근다", () => {
    expect(scenarioLock({ reel: emptyReel() })).toBe(null);
  });

  it("완성본이 있으면 잠근다", () => {
    const lock = scenarioLock({ reel: { ...emptyReel(), video: { url: "https://x/v.mp4" } } });
    expect(lock.reason).toBe("baked");
    expect(lock.message).toMatch(/새로 시작/);
  });

  it("굽는 중에도 잠근다 — 값은 이미 나갔다", () => {
    const lock = scenarioLock({ reel: { ...emptyReel(), status: "rendering" } });
    expect(lock.reason).toBe("rendering");
  });
});

describe("프롬프트가 다 찼는가", () => {
  it("한 컷이라도 비면 아니다", () => {
    expect(isPromptsReady([{ clip_prompt: "a" }, { clip_prompt: "" }])).toBe(false);
    expect(isPromptsReady([{ clip_prompt: "a" }, {}])).toBe(false);
  });

  it("전부 찼으면 맞다", () => {
    expect(isPromptsReady([{ clip_prompt: "a" }, { clip_prompt: "b" }])).toBe(true);
  });

  it("컷이 없으면 아니다 — 빈 배열로 굽기를 열지 않는다", () => {
    expect(isPromptsReady([])).toBe(false);
  });
});
