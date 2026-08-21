// 화면 계약 — 이 저장소에는 컴포넌트 렌더 인프라가 없어 **소스에서 잰다.**
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p) => readFileSync(p, "utf8");
const layout = read("app/reel/[id]/layout.js");
const prompts = read("app/reel/[id]/prompts/page.js");
const SCREENS = [
  ["briefing", read("app/reel/[id]/briefing/page.js")],
  ["scenario", read("app/reel/[id]/scenario/page.js")],
  ["images", read("app/reel/[id]/images/page.js")],
  ["prompts", prompts],
  ["video", read("app/reel/[id]/video/page.js")],
  ["done", read("app/reel/[id]/done/page.js")],
];

describe("폴링은 한 벌이다", () => {
  for (const [name, src] of SCREENS) {
    it(`${name} 은 setInterval 을 스스로 돌리지 않는다`, () => {
      expect(src).not.toContain("setInterval");
    });
  }
});

describe("단계 표는 하나다", () => {
  it("레이아웃이 표를 읽는다", () => {
    expect(layout).toContain("REEL_STEPS");
  });

  for (const [name, src] of SCREENS) {
    it(`${name} 은 단계 목록을 손으로 적지 않는다`, () => {
      // 화면이 자기 단계 배열을 들면 스테퍼와 가드가 갈린다.
      expect(src).not.toMatch(/\[\s*["']material["']\s*,/);
    });
  }
});

describe("영상 프롬프트 화면", () => {
  it("굽기 버튼 판정을 lib 에서 가져온다", () => {
    expect(prompts).toContain("isPromptsReady");
  });

  it("고친 값을 저장하는 문을 부른다", () => {
    expect(prompts).toContain("PATCH");
  });

  it("굽기 전이라는 것을 사장님에게 말한다", () => {
    expect(prompts).toMatch(/무료|0원|공짜|값이 들지/);
  });
});
