// **자막은 파일 속 소리와 같아야 한다** (2026-09-03 사장님 신고).
//
// 사장님: *"자막 싱크가 살짝 안 맞고, 단계별 두 번째 영상은 아예 다른 자막이 나와."*
//
// ★★★ 증상 둘은 뿌리가 다르다.
//
// ① **아예 다른 자막** — 각인이 **본문만** 문다. 통짜로 구울 때 모델에는 말할 문장이
//    실려 나가는데(lib/reel/oneshot.js 의 `Says exactly`), 각인(`video.of`)으로 남는 것은
//    `scenario.text` 하나다. 그래서 내레이션을 고쳐도 **이미 구운 편이 낡음으로 안 잡히고**,
//    ⑥완성은 **지금 시나리오의** 내레이션을 자막으로 태운다 — 소리는 옛 문장, 자막은 새 문장.
//    → 고치는 방향은 "다시 굽게 만들기"가 아니다(한 편에 $4.5 다). **구울 때 말한 문장을
//      영상에 함께 적어 두고(`video.said`) 자막은 그것을 태운다.** 그러면 자막은 늘 파일
//      속 소리와 같고, 내레이션을 고쳐도 이미 산 편이 죽지 않는다.
//
// ② **싱크가 살짝 어긋남** — 잰 적이 없다. 한 벌 자막은 시각을 **글자 수 비례**로만 잡는데,
//    실제 낭독은 문장마다 속도가 다르다. whisper 로 잴 수는 있었지만 잰 값이 **컷에** 박혀
//    한 벌 자막이 읽을 자리가 없었고(render 라우트가 그래서 아예 안 쟀다), 그 저장 자리를
//    만드는 것은 *"실측으로 어긋남이 확인되기 전에는 만들지 않는다"* 로 미뤄 두었다
//    (tests/reel-narration-subtitles.test.js 머리말). **오늘 그 실측이 나왔다.**
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { narrationUnits, bakedNarration, narrationChanged } from "../lib/reel/narration.js";

// 소스 판 규율(OUTSTANDING §7-10): 줄 주석을 먼저 걷고 블록 주석을 걷는다.
const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const src = (p) => strip(readFileSync(p, "utf8"));

const SAID = "구울 때 말한 문장. 소리에 박힌 것은 이쪽이다.";
const NOW = "지금 시나리오의 문장. 자막이 이것을 태우면 안 된다.";

const doc = (over = {}) => ({
  scenario: { text: "t", narration: { text: NOW } },
  cuts: [{ video: { url: "u", seconds: 15 } }],
  ...over,
});
const baked = (said) => doc({ cuts: [{ video: { url: "u", seconds: 15, said } }] });

describe("① 자막 글자 — 구울 때 말한 문장을 태운다", () => {
  it("★★★ 영상에 적힌 말이 있으면 **그것**이 자막이다 — 지금 시나리오가 달라도", () => {
    const units = narrationUnits(baked(SAID), 15);
    expect(units.map((u) => u.sentence).join(" ")).toContain("구울 때 말한 문장");
    expect(units.map((u) => u.sentence).join(" ")).not.toContain("지금 시나리오");
  });

  it("★★ 적힌 말이 없으면 **예전 그대로** 지금 시나리오를 쓴다 — 옛 문서 회귀 0", () => {
    const units = narrationUnits(doc(), 15);
    expect(units.map((u) => u.sentence).join(" ")).toContain("지금 시나리오");
  });

  it("★ 빈 문자열은 '적힌 것'이 아니다 — 빈 자막을 태우면 자막이 통째로 사라진다", () => {
    const units = narrationUnits(baked("   "), 15);
    expect(units.map((u) => u.sentence).join(" ")).toContain("지금 시나리오");
  });

  it("★★ bakedNarration 이 그 판정을 **한 자리에서** 한다", () => {
    expect(bakedNarration(baked(SAID))?.text).toBe(SAID);
    expect(bakedNarration(doc())?.text).toBe(NOW);
  });

  it("★★ 바뀐 것을 **말해 줄 수 있다** — 화면이 '다시 만들어 주세요'를 띄울 근거다", () => {
    expect(narrationChanged(baked(SAID))).toBe(true);
    expect(narrationChanged(baked(NOW))).toBe(false);
    // 안 구운 프로젝트는 바뀐 것이 아니다 — 비교할 소리가 없다.
    expect(narrationChanged(doc({ cuts: [{}] }))).toBe(false);
  });
});

describe("① 굽기가 말한 문장을 **적어 둔다**", () => {
  const pipeline = src("lib/reel/pipeline.js");

  it("★★★ 통짜가 구운 영상에 said 를 함께 적는다", () => {
    expect(pipeline, "video 에 said 가 없다").toMatch(/said/);
    // 접수증(job)에도 실어야 한다 — 수거가 그 값으로 영상을 만든다.
    expect(pipeline).toMatch(/job:\s*\{[^}]*said|said,[\s\S]{0,200}job/);
  });
});

describe("② 자막 시각 — 잰 값이 한 벌에도 물린다", () => {
  it("★★★ 저장된 시각이 있으면 units 이 그것을 쓴다(글자 수 비례를 덮는다)", () => {
    const p = baked("짧다. 이 문장은 훨씬 더 길게 이어집니다.");
    p.reel = { narration_timing: [{ start: 1.5, seconds: 2 }, { start: 4, seconds: 6 }] };
    const units = narrationUnits(p, 15);
    expect(units[0].spoken_start).toBe(1.5);
    expect(units[0].spoken_seconds).toBe(2);
    expect(units[1].spoken_start).toBe(4);
  });

  it("★★ 저장된 시각이 없으면 **예전 그대로** 글자 수 비례다 — 회귀 0", () => {
    const units = narrationUnits(baked("짧다. 이 문장은 훨씬 더 길게 이어집니다."), 10);
    expect(units[0].spoken_start).toBeUndefined();
    expect(units.reduce((s, u) => s + u.seconds, 0)).toBeCloseTo(10, 5);
  });

  it("★ 개수가 어긋나면 **남는 문장은 안 건드린다** — 조각이 모자랄 때의 규율과 같다", () => {
    const p = baked("하나. 둘. 셋.");
    p.reel = { narration_timing: [{ start: 0.5, seconds: 1 }] };
    const units = narrationUnits(p, 9);
    expect(units[0].spoken_start).toBe(0.5);
    expect(units[1].spoken_start).toBeUndefined();
  });
});

describe("② 합성 전에 **한 벌도** 잰다", () => {
  const route = src("app/api/reel/[id]/render/route.js");

  it("★★★ 한 벌이 있어도 잰다 — '한 벌이면 건너뛴다'가 사라졌다", () => {
    expect(route, "아직 한 벌이면 재기를 건너뛴다").not.toMatch(/!units\s*&&\s*needsSpeechProbe/);
  });

  it("★★ 잰 것을 **한 벌 단위로** 문서에 남긴다 — 다시 합성할 때 또 재면 값이 두 번 나간다", () => {
    expect(route).toMatch(/narration_timing/);
  });

  it("★ 이미 잰 것이 있으면 다시 안 잰다", () => {
    expect(route).toMatch(/narration_timing/);
    expect(route).toMatch(/alignSpeech/);
  });
});

describe("① 화면이 **바뀐 사실**을 말해 준다", () => {
  const done = src("app/reel/[id]/done/page.js");

  it("★★ 완성 화면이 narrationChanged 를 읽는다 — 조용히 두면 '반영이 안 된다'로 읽힌다", () => {
    expect(done).toMatch(/narrationChanged\(/);
    expect(done).toMatch(/내레이션을 고치셨어요/);
  });

  it("★ 여기서 **다시 굽는 버튼을 열지 않는다** — 돈 나가는 자리는 영상 화면 하나다", () => {
    const at = done.indexOf("내레이션을 고치셨어요");
    expect(at).toBeGreaterThan(-1);
    expect(done.slice(at - 300, at + 300)).not.toMatch(/<button/);
  });
});
