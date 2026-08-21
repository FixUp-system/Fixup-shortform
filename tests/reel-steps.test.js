// 단계 표는 하나다 — 스테퍼·라우팅 가드·현재단계가 모두 이것을 본다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { REEL_STEPS, reelStepHref, isReelClipStale } from "../lib/reel/steps.js";

describe("순수 규율", () => {
  // ★★ 2026-08-21 리뷰 C1 — 처음엔 이 단정이 import 문 자체를 전부 금지했다
  //   (`not.toMatch(/^import /m)`). 진짜 목적은 "사슬 끝에 fs·env 가 안 닿는 것"인데,
  //   그 규칙을 너무 넓게 써서 lib/reel/steps.js 가 lib/reel/doc.js 의
  //   canBakeReelClips 를 못 빌리고(스스로도 순수하다) 판정을 두 벌(다른 이름으로
  //   복제) 두게 만들었다. **film 은 이미 이 모양이다** — lib/film/steps.js:14 의
  //   `import { filmOf } from "./doc.js"`. 순수→순수 import 는 이 저장소의 정상
  //   관용구다. 그래서 "같은 lib/reel 안의(상대경로 "./"로 시작하는) 순수 모듈
  //   import"만 허용하고, 그 밖(react·next·외부 패키지 등 사슬에 fs 가 닿을 수 있는
  //   것)은 여전히 막는다.
  it("fs·env 로 이어지는 import 가 없다 — 같은 lib/reel 안의 순수 모듈만 허용", () => {
    const src = readFileSync("lib/reel/steps.js", "utf8");
    const specs = [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];?\s*$/gm)].map((m) => m[1]);
    for (const spec of specs) {
      expect(spec, `허용 밖의 import: ${spec} — 상대경로("./"로 시작)만 허용된다`).toMatch(/^\.\//);
    }
  });

  it("doc.js 도 순수하다 — steps.js 가 그 사슬 끝에서 fs 를 물지 않는다", () => {
    // steps.js 가 doc.js 를 불러도, doc.js 자체가 fs 를 끌면 결국 화면 번들이 깨진다.
    // tests/reel-doc.test.js 가 doc.js 의 순수성을 따로 못 박지만, 여기서도 확인해
    // 둔다 — steps.js 를 읽는 사람이 "이 import 가 안전한가"를 doc.js 까지 가서
    // 다시 확인하지 않아도 되게.
    expect(readFileSync("lib/reel/doc.js", "utf8")).not.toMatch(/^import /m);
  });
});

describe("표", () => {
  it("여섯 단계이고 목소리가 없다 — 클립이 직접 말한다", () => {
    expect(REEL_STEPS.map((s) => s.key)).toEqual([
      "material", "scenario", "images", "prompts", "video", "done",
    ]);
  });

  it("영상 프롬프트가 이미지와 영상 사이다 — 굽기 전이라 고치는 것이 공짜다", () => {
    const keys = REEL_STEPS.map((s) => s.key);
    expect(keys.indexOf("prompts")).toBeGreaterThan(keys.indexOf("images"));
    expect(keys.indexOf("prompts")).toBeLessThan(keys.indexOf("video"));
  });

  it("표를 밖에서 못 고친다", () => {
    expect(Object.isFrozen(REEL_STEPS)).toBe(true);
    expect(Object.isFrozen(REEL_STEPS[0])).toBe(true);
  });
});

describe("주소", () => {
  it("프로젝트가 있으면 그 프로젝트의 화면이다", () => {
    expect(reelStepHref(REEL_STEPS[1], "pid")).toBe("/reel/pid/scenario");
  });

  it("프로젝트가 없으면 만들기 전 화면이다", () => {
    expect(reelStepHref(REEL_STEPS[0], null)).toBe("/reel/new");
  });
});

describe("클립 낡음", () => {
  it("굽을 때 쓴 프롬프트와 지금 프롬프트가 다르면 낡았다", () => {
    expect(isReelClipStale({ clip_prompt: "b", video: { url: "u", of: "a" } })).toBe(true);
  });

  it("같으면 안 낡았다 — LLM 이 매번 달라도 저장된 값을 본다", () => {
    expect(isReelClipStale({ clip_prompt: "a", video: { url: "u", of: "a" } })).toBe(false);
  });

  it("아직 안 구웠으면 낡을 것이 없다", () => {
    expect(isReelClipStale({ clip_prompt: "a" })).toBe(false);
  });
});
