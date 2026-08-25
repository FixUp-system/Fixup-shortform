// 통짜(r2v) 갈래에서 **자막이 첫 문장 하나만 나왔다** (2026-08-25 사장님 실측).
//
// ★★ 원인: 합성이 자막 큐를 `usable` 로 만들었다.
//   `usable = cuts.filter(c => c.video?.url)` 는 **이어 붙일 클립**을 고르는 필터다 —
//   컷별 갈래에서는 컷마다 클립이 있으니 `cuts === usable` 이라 아무 문제가 없었다.
//   그런데 통짜는 **한 판을 통째로 굽고 그 한 편을 cut[0] 에만 담는다**(video.whole).
//   나머지 컷에는 클립이 없는 것이 정상인데, 그 필터가 자막까지 걸러 버려
//   6컷짜리 영상에 **자막이 컷 1 하나**만 깔렸다.
//
// ★ 붙이는 것과 말하는 것은 **다른 축**이다:
//     · 이어 붙일 것 = 클립이 있는 컷 (usable)
//     · 자막이 될 것 = 대사가 있는 컷 (통짜면 전부)
//   이 파일이 그 둘을 갈라 못 박는다.
import { describe, it, expect } from "vitest";
import { buildCues } from "../lib/subtitles.js";
import { subtitleCutsOf, composeSeconds } from "../lib/compose.js";

// 통짜 한 편 — 클립은 cut[0] 에만 있고 whole 표시가 붙는다(lib/reel/pipeline.js 의 runReelOneShot).
const wholeCuts = [
  { idx: 0, seconds: 3, sentence: "エスターバニーの限定キーリング!", video: { url: "https://f/one.mp4", seconds: 15, whole: true } },
  { idx: 1, seconds: 3, sentence: "Giantsコラボ、ここにしかない。" },
  { idx: 2, seconds: 2, sentence: "" },
  { idx: 3, seconds: 3, sentence: "バッグにつけて、" },
  { idx: 4, seconds: 3, sentence: "どこへでも一緒。" },
  { idx: 5, seconds: 3, sentence: "今だけ、限定です!" },
];

const opts = { width: 480, height: 854, lang: "ja", sourceLang: "ja" };

describe("통짜 갈래의 자막", () => {
  it("★★ 대사가 있는 컷이 **전부** 자막이 된다 — 클립이 있는 컷만이 아니다", () => {
    const cues = buildCues(wholeCuts, opts);
    // 무음 컷(idx 2)만 빠지고 다섯이 남는다.
    expect(cues).toHaveLength(5);
    expect(cues[0].text).toContain("エスターバニー");
    expect(cues[4].text).toContain("限定です");
  });

  it("★ 클립으로 거르면 첫 문장 하나만 남는다 — 이것이 사장님이 본 그 화면이다", () => {
    const usable = wholeCuts.filter((c) => c.video?.url);
    expect(buildCues(usable, opts)).toHaveLength(1);
  });

  it("시각이 컷 순서대로 누적된다 — 뒤 문장이 앞 문장보다 늦다", () => {
    const cues = buildCues(wholeCuts, opts);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start, `${i}번째 자막이 앞선다`).toBeGreaterThanOrEqual(cues[i - 1].start);
    }
  });
});

describe("합성이 두 축을 가른다", () => {
  // ★ 소스 문자열로 잰다 — composeVideo 는 ffmpeg·Storage 를 물어 여기서 못 부른다.
  //   지키려는 것은 "자막 큐를 usable 로 만들지 않는다" 하나다.
  const src = (() => {
    const raw = require("fs").readFileSync("lib/compose.js", "utf8");
    return raw
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
  })();

  it("★ buildCues 에 usable 을 그대로 넘기지 않는다", () => {
    expect(src, "자막이 클립 필터를 그대로 탄다").not.toMatch(/buildCues\(usable\b/);
  });

  it("★ 통짜를 알아보는 자리가 있다 — video.whole 이 그 표시다", () => {
    expect(src).toContain("whole");
  });

  it("이어 붙이는 것은 여전히 usable 이다 — 클립 없는 컷을 붙일 수는 없다", () => {
    expect(src).toMatch(/usable/);
  });
});

describe("통짜 갈래의 **시각과 길이**", () => {
  // ★★ 사장님 실측에서 reel.video.seconds 가 **29** 로 찍혔다(목표 15초).
  //   cutSeconds(컷1) 이 통짜 한 편의 길이(15)를 돌려주는데, 그 값이 "컷 1의 화면 시간"
  //   으로 쓰여 나머지 컷 초(14)가 그 위에 또 더해진 것이다 — 15 + 14 = 29.
  //   같은 값이 자막 누적에도 쓰여 **컷 2 자막이 15초부터** 시작한다(영상 밖이다).
  it("★ 총 길이는 **한 편의 길이**다 — 컷 초를 더하지 않는다", () => {
    expect(composeSeconds(wholeCuts, wholeCuts.filter((c) => c.video?.url))).toBe(15);
  });

  it("컷별 갈래는 예전 그대로 — 컷 초의 합이다", () => {
    const percut = [
      { idx: 0, seconds: 4, video: { url: "a", seconds: 4 } },
      { idx: 1, seconds: 5, video: { url: "b", seconds: 5 } },
    ];
    expect(composeSeconds(percut, percut)).toBe(9);
  });

  it("★★ 자막이 **영상 안에** 있다 — 마지막 자막이 15초를 안 넘는다", () => {
    const cues = buildCues(subtitleCutsOf(wholeCuts, wholeCuts.filter((c) => c.video?.url)), opts);
    for (const q of cues) {
      expect(q.start, `자막이 ${q.start}초에 시작한다 — 영상은 15초다`).toBeLessThan(15);
      expect(q.end, `자막이 ${q.end}초에 끝난다 — 영상은 15초다`).toBeLessThanOrEqual(15.01);
    }
  });

  it("★ 컷 초가 목표를 넘어도(반올림) 비례로 눌러 담는다", () => {
    // 이번 실측이 그랬다: 계획 초 합이 17 인데 실제 한 편은 15 초였다
    // (LLM 이 2.5 초를 내면 buildReelCuts 의 Math.round 가 3 으로 올린다).
    const planned = wholeCuts.reduce((s, c) => s + c.seconds, 0);
    expect(planned).toBe(17);
    const scaled = subtitleCutsOf(wholeCuts, wholeCuts.filter((c) => c.video?.url));
    const total = scaled.reduce((s, c) => s + (Number(c.seconds) || 0), 0);
    expect(total).toBeCloseTo(15, 5);
  });
});
