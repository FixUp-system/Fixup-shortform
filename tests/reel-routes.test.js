// 라우트가 지켜야 할 계약 — 값이 나가는 문에 그물이 걸려 있는가.
//
// ★ 이 저장소에는 라우트 실행 인프라가 없다. 재는 것은 "그물을 불렀는가" 하나다
//   (경계값 자체는 lib 쪽 테스트가 이미 잰다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isStepDoc } from "../lib/projects.js";

const read = (p) => readFileSync(p, "utf8");
const clips = read("app/api/reel/[id]/clips/route.js");
const prompts = read("app/api/reel/[id]/prompts/route.js");
const scenario = read("app/api/reel/[id]/scenario/route.js");

const ALL = [
  ["clips", clips], ["prompts", prompts], ["scenario", scenario],
  ["images", read("app/api/reel/[id]/images/route.js")],
  ["render", read("app/api/reel/[id]/render/route.js")],
  ["status", read("app/api/reel/[id]/status/route.js")],
];

describe("모든 라우트", () => {
  for (const [name, src] of ALL) {
    it(`${name} 은 withUser 뒤에 있다 — 신원 검증을 스스로 적지 않는다`, () => {
      expect(src).toContain("withUser");
    });
  }
});

describe("값이 나가는 문", () => {
  it("굽기는 정가 게이트를 지난다", () => {
    expect(clips).toContain("requireVideoCharge");
  });

  it("굽기는 프롬프트가 다 찼는지 본다 — 화면과 같은 판정을 쓴다", () => {
    expect(clips).toContain("isPromptsReady");
  });
});

describe("시나리오", () => {
  it("잠금 판정을 lib 에서 가져온다 — 손으로 적으면 화면과 갈린다", () => {
    expect(scenario).toContain("scenarioLock");
  });
});

describe("프롬프트", () => {
  it("사장님이 고친 값을 저장하는 문이 있다", () => {
    expect(prompts).toMatch(/export const PATCH/);
  });

  it("만드는 문도 있다", () => {
    expect(prompts).toMatch(/export const POST/);
  });

  it("only 가 배열이 아니면 막는다 — 조용히 무시하면 전부 다시 만든다", () => {
    expect(prompts).toContain("Array.isArray(only)");
  });
});

// ★ 이 결정의 load-bearing 부분 — reel 프로젝트가 옛 단계별 흐름(isStepDoc)의 문을
//   지나면 안 된다. 그 문 뒤(/api/projects/[id]/clips 등)는 clip_prompt 를 모른 채
//   컷을 i2v 로 구우면서 크레딧까지 받는다. 소스 문자열이 아니라 **실제 함수 호출**로
//   잰다 — isStepDoc 은 순수 함수라 여기서 직접 부를 수 있다.
describe("종류 격리", () => {
  it("kind:\"reel\" 문서는 isStepDoc 이 아니다 — 옛 유료 라우트가 이 문서를 못 본다", () => {
    expect(isStepDoc({ kind: "reel" })).toBe(false);
  });

  it("옛 문서(kind 없음)는 여전히 isStepDoc 이다 — 회귀가 없다", () => {
    expect(isStepDoc({ cuts: [] })).toBe(true);
  });
});
