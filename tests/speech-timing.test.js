// 자막 시각 — **모델이 실제로 말한 때**에 맞춘다(2026-08-25 실측).
//
// ★★ 왜 필요한가: 우리 자막은 컷 경계 누적으로 시각을 잡는데(lib/subtitles.js 의 buildCues),
//   모델은 자기 리듬으로 말한다. 떡볶이 15초 영상 실측:
//     계획 0.00s → 실제 0.03s  (+0.03)
//     계획 5.00s → 실제 6.47s  (+1.47)
//     계획 10.50s → 실제 10.09s (-0.41)
//     계획 13.50s → 실제 11.51s (-1.99)   ← 말이 끝난 뒤에 자막이 뜬다
//   **앞뒤로 흔들려 상수 보정이 안 된다.** 재는 수밖에 없다.
//
// ★★★ **글자는 whisper 에서 가져오지 않는다.** 같은 실측에서 모델이 대사를 바꿔 말했다:
//   "끓이기만 하면 돼요" → "끄기만 하면 돼요"(뜻이 달라진다).
//   whisper 는 **언제 말했나**만 답한다. 무엇을 말했나는 시나리오가 답한다.
import { describe, it, expect } from "vitest";
import { alignSpeech } from "../lib/speech-timing.js";

// whisper 응답 모양(fal-ai/whisper, chunk_level: "segment")
const chunks = [
  { timestamp: [0.03, 3.09], text: " 오늘도 수고했어요." },
  { timestamp: [6.47, 7.55], text: " 끄기만 하면 돼요." },
  { timestamp: [10.09, 11.51], text: " 그 맛 그대로" },
  { timestamp: [11.51, 14.51], text: " 집에서 간편하게" },
];

describe("alignSpeech — 말하는 컷에 시각을 붙인다", () => {
  const cuts = [
    { idx: 0, sentence: "오늘도 수고했어요." },
    { idx: 1, sentence: "" },                       // 말 없는 컷
    { idx: 2, sentence: "끓이기만 하면 돼요." },
    { idx: 3, sentence: "" },
    { idx: 4, sentence: "그 맛, 그대로." },
    { idx: 5, sentence: "집에서, 간편하게." },
  ];

  it("말하는 컷에만 시각이 붙는다", () => {
    const out = alignSpeech(cuts, chunks);
    expect(out[0].spoken_start).toBeCloseTo(0.03, 2);
    expect(out[2].spoken_start).toBeCloseTo(6.47, 2);
    expect(out[4].spoken_start).toBeCloseTo(10.09, 2);
    expect(out[5].spoken_start).toBeCloseTo(11.51, 2);
  });

  it("말 없는 컷은 건드리지 않는다", () => {
    const out = alignSpeech(cuts, chunks);
    expect(out[1].spoken_start).toBeUndefined();
    expect(out[3].spoken_start).toBeUndefined();
  });

  it("얼마나 말했는지도 적는다", () => {
    const out = alignSpeech(cuts, chunks);
    expect(out[0].spoken_seconds).toBeCloseTo(3.06, 1);
  });

  // ★★★ 이것이 이 함수의 핵심 계약이다.
  it("글자는 시나리오 것을 지킨다 — whisper 가 잘못 들은 말로 덮지 않는다", () => {
    const out = alignSpeech(cuts, chunks);
    expect(out[2].sentence).toBe("끓이기만 하면 돼요.");   // whisper 는 "끄기만"이라고 했다
    expect(out[4].sentence).toBe("그 맛, 그대로.");        // 쉼표도 그대로
  });

  // ★ 못 들은 말이 있으면 그 컷은 그냥 둔다 — 옛 방식(컷 경계)으로 흐른다.
  it("조각이 모자라면 남는 컷은 그대로다", () => {
    const out = alignSpeech(cuts, chunks.slice(0, 2));
    expect(out[0].spoken_start).toBeCloseTo(0.03, 2);
    expect(out[2].spoken_start).toBeCloseTo(6.47, 2);
    expect(out[4].spoken_start).toBeUndefined();
  });

  // ★ 모르는 값에 던지지 않는다 — 이 저장소 규율.
  it("조각이 없거나 이상하면 원본을 그대로 준다", () => {
    expect(alignSpeech(cuts, [])).toEqual(cuts);
    expect(alignSpeech(cuts, null)).toEqual(cuts);
    expect(alignSpeech(null, chunks)).toEqual([]);
  });
});
