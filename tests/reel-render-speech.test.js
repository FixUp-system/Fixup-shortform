// ⑥완성 — 합성 전에 **말한 때**를 재서 자막에 반영한다(2026-08-25).
//
// ★ 자리가 여기인 이유: 굽기가 끝나야 잴 소리가 있고, 합성 전이어야 자막에 실린다.
// ★ 못 재도 합성은 그대로 간다 — 자막 하나 때문에 이미 값을 치른 한 편을 잃지 않는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const route = readFileSync("app/api/reel/[id]/render/route.js", "utf8");
const clean = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("합성 전에 시각을 잰다", () => {
  it("필요할 때만 잰다 — 판정을 순수 함수가 한다", () => {
    expect(clean).toContain("needsSpeechProbe");
  });

  it("whisper 를 부르고 컷에 붙인다", () => {
    expect(clean).toContain("probeSpeech");
    expect(clean).toContain("alignSpeech");
  });

  // ★★ 순서 — 재고(probe) → 붙이고(align) → 합성(composeVideo)이다.
  //   합성이 먼저면 잰 값이 자막에 못 실린다.
  // ★ import 줄은 뺀다 — 거기서는 순서가 무의미하고, 재려는 것은 **본문 순서**다.
  it("합성보다 앞에서 한다", () => {
    const body = clean.slice(clean.lastIndexOf("import "));
    const align = body.indexOf("alignSpeech(");
    const compose = body.indexOf("composeVideo(");
    expect(align, "alignSpeech 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(compose, "composeVideo 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(align, "재는 것이 합성보다 뒤에 있다").toBeLessThan(compose);
  });

  // ★ 잰 값은 **문서에도 남긴다** — 다시 합성할 때 또 재면 값이 두 번 나간다.
  it("잰 값을 문서에 저장한다", () => {
    expect(clean).toMatch(/updateProject[\s\S]{0,400}(spoken|timed|cuts)/);
  });
});
