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

// ── 한 벌이 있으면 재지 않는다 ─────────────────────────────────────────────
//
// ★★ 2026-08-28 실측 — 내레이션이 **한 벌**이 된 뒤로 이 재기가 헛돈다.
//   whisper 가 잰 시각은 컷에 박히는데(spoken_start), 자막은 이제 한 벌 단위에서
//   나온다(lib/compose.js 의 subtitleCutsOf 가 narrationUnits 를 먼저 본다) — 그래서
//   **잰 값을 읽는 자리가 아예 없다.**
// ★ 그런데도 불린다: needsSpeechProbe 는 "대사가 있는 컷이 둘 이상인가"를 보는데,
//   시나리오가 한 벌을 컷 line 에 조각내 적어 두면(에너지 음료 실측: 컷 다섯) 참이 된다.
// ★ 값은 작다($0.0006/초 × 15초 ≈ $0.009). 막는 이유는 값보다 **뜻**이다 — 쓰지 않을
//   값을 재려고 fal 을 부르고 몇 초를 기다린다.
// ★ 컷 line 자체는 **지우지 않는다** — 한 벌이 어떤 이유로 빠졌을 때 옛 길(컷 자막)로
//   떨어지는 안전망이다.
// ★★★ 2026-09-03 뒤집힘 — **한 벌도 잰다.** 위 서사는 기록으로 둔다.
//   그때 판단("잰 값을 읽는 자리가 없으니 재지 마라")은 맞았고, 달라진 것은 **자리를
//   만들었다**는 것이다: `reel.narration_timing` 이 문장 단위로 시각을 든다
//   (lib/reel/narration.js 의 narrationUnits 가 그것을 units 에 얹는다).
//   그 자리를 만드는 것은 *"실측으로 어긋남이 확인되기 전에는 만들지 않는다"* 로 미뤄
//   두었는데, 2026-09-03 에 사장님이 *"자막 싱크가 살짝 안 맞아"* 로 그 실측을 주었다.
describe("한 벌도 시각을 잰다", () => {
  it("★한 벌 판정이 재기 판정보다 **앞**에 있다", () => {
    const body = clean.slice(clean.lastIndexOf("import "));
    const units = body.indexOf("narrationUnits(");
    const probe = body.indexOf("needsSpeechProbe(");
    expect(units, "narrationUnits 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(probe, "needsSpeechProbe 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(units, "한 벌 계산이 재기 판정보다 뒤에 있다").toBeLessThan(probe);
  });

  it("★★ 한 벌이면 **한 벌 단위로** 재고, 그 값을 문서에 남긴다", () => {
    expect(clean, "한 벌을 정렬하지 않는다").toMatch(/alignSpeech\(units,/);
    expect(clean, "잰 값을 남기는 자리가 없다").toMatch(/narration_timing/);
  });

  it("★★ 옛 문서·컷별 갈래는 **예전 그대로** 컷에 박는다 — 회귀 0", () => {
    expect(clean).toContain("needsSpeechProbe(cuts)");
    expect(clean, "컷 정렬이 사라졌다").toMatch(/alignSpeech\(cuts,/);
  });

  it("★ 문장이 하나면 안 잰다 — 시작이 곧 영상 시작이라 어긋날 자리가 없다", () => {
    expect(clean).toMatch(/units\.length\s*>\s*1/);
  });
});
