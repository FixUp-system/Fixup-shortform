// 자막이 **한 벌**에서 나온다.
//
// ★★ 2026-08-27 — 새 길에서는 내레이션이 `shots[].line` 이 아니라 `scenario.narration` 에
//   산다. 그래서 컷의 `sentence` 가 비고, 손대지 않으면 **완성본에 자막이 통째로 사라진다.**
//   자막 원천을 한 벌로 옮기는 것이 이 파일이 지키는 계약이다.
//
// ★ 시각은 **글자 수 비례**다. 한 벌이 되면 문장이 이어지므로 컷 경계와 어긋날 자리가
//   애초에 없어진다 — whisper 정렬(lib/speech-timing.js)은 "한 클립에 대사가 여럿일 때
//   모델이 자기 리듬으로 배치한다"를 고치는 장치였고, 그 어긋남의 단위가 컷이었다.
//   ⚠️ 새 길에 whisper 를 붙이려면 **컷과 개수가 다른 문장 단위의 저장 자리**가 필요하다 —
//     실측으로 어긋남이 확인되기 전에는 만들지 않는다(Task 8 에서 눈으로 본다).
import { describe, it, expect } from "vitest";
import { narrationUnits } from "../lib/reel/narration.js";
import { subtitleCutsOf } from "../lib/compose.js";
import { buildCues } from "../lib/subtitles.js";

const TEXT = "오늘도 수고했어요. 끓이기만 하면 돼요. 집에서, 간편하게.";
const doc = (over) => ({ scenario: { text: "t", ...over } });

describe("자막 단위 — narrationUnits", () => {
  it("한 벌을 문장으로 나눈다", () => {
    const units = narrationUnits(doc({ narration: { text: TEXT } }), 15);
    expect(units.map((u) => u.sentence)).toEqual([
      "오늘도 수고했어요.", "끓이기만 하면 돼요.", "집에서, 간편하게.",
    ]);
  });

  it("나눈 초의 합이 전체와 같다 — 자막이 영상 밖으로 안 나간다", () => {
    const units = narrationUnits(doc({ narration: { text: TEXT } }), 15);
    expect(units.reduce((s, u) => s + u.seconds, 0)).toBeCloseTo(15, 5);
  });

  // ⚠️ 위 TEXT 는 세 문장이 **공백 뺀 9자로 우연히 같다** — 비례를 재려면 길이가 확실히
  //   다른 글이어야 한다(그 실수를 여기서 한 번 했다).
  it("초를 **글자 수 비례**로 나눈다 — 긴 문장이 오래 머문다", () => {
    const units = narrationUnits(doc({ narration: { text: "짧다. 이 문장은 훨씬 더 길게 이어집니다." } }), 10);
    expect(units[1].seconds).toBeGreaterThan(units[0].seconds);
  });

  it("★한 벌이 없으면 null 이다 — 옛 길이 그대로 돈다", () => {
    expect(narrationUnits(doc({}), 15)).toBe(null);
    expect(narrationUnits(null, 15)).toBe(null);
  });

  it("초를 모르면 null 이다 — 시각을 지어내지 않는다", () => {
    expect(narrationUnits(doc({ narration: { text: TEXT } }), 0)).toBe(null);
  });
});

describe("합성이 그 단위를 쓴다 — subtitleCutsOf", () => {
  const cuts = [
    { idx: 0, seconds: 5, sentence: "", video: { url: "https://x/v.mp4", seconds: 15 } },
    { idx: 1, seconds: 5, sentence: "" },
    { idx: 2, seconds: 5, sentence: "" },
  ];
  const usable = [cuts[0]];

  it("한 벌 단위를 주면 그것이 자막 원천이다", () => {
    const units = narrationUnits(doc({ narration: { text: TEXT } }), 15);
    expect(subtitleCutsOf(cuts, usable, units)).toBe(units);
  });

  it("★안 주면 예전 그대로다 — 옛 문서·컷별 갈래가 그 길로 간다", () => {
    const was = subtitleCutsOf(cuts, usable);
    expect(subtitleCutsOf(cuts, usable, null)).toEqual(was);
    expect(subtitleCutsOf(cuts, usable, [])).toEqual(was);
  });
});

describe("자막이 실제로 만들어진다", () => {
  it("★한 벌에서 큐가 나온다 — 이것이 없으면 완성본에 자막이 통째로 없다", () => {
    const units = narrationUnits(doc({ narration: { text: TEXT } }), 15);
    const cues = buildCues(units, { width: 1080, height: 1920 });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.map((c) => c.text).join(" ")).toContain("오늘도 수고했어요");
    // 마지막 큐가 영상 밖으로 나가지 않는다
    expect(cues[cues.length - 1].end).toBeLessThanOrEqual(15.01);
  });

  it("★글자는 시나리오 것이다 — 모델이 잘못 말해도 화면에는 원문이 박힌다", () => {
    const units = narrationUnits(doc({ narration: { text: "끓이기만 하면 돼요." } }), 5);
    const cues = buildCues(units, { width: 1080, height: 1920 });
    expect(cues.map((c) => c.text).join("")).toContain("끓이기만");
  });
});
