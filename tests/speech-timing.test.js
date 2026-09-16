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

  // ★ 들은 말이 원고보다 한참 적으면 **어느 문장을 못 들었는지 알 수 없다** — 앞에서부터
  //   붙이면 뒤가 통째로 틀린다. 전부 건드리지 않고 바닥(컷 경계·글자 비례)으로 흐른다.
  //   (2026-09-15 이전에는 앞 둘에 붙였다 — 순서 짝짓기 시절의 계약이었다.)
  it("들은 말이 원고보다 한참 적으면 아무 컷도 건드리지 않는다", () => {
    const out = alignSpeech(cuts, chunks.slice(0, 2));
    expect(out.every((c) => c.spoken_start === undefined)).toBe(true);
  });

  // ★ 모르는 값에 던지지 않는다 — 이 저장소 규율.
  it("조각이 없거나 이상하면 원본을 그대로 준다", () => {
    expect(alignSpeech(cuts, [])).toEqual(cuts);
    expect(alignSpeech(cuts, null)).toEqual(cuts);
    expect(alignSpeech(null, chunks)).toEqual([]);
  });
});

// ★★★ 2026-09-15 사장님 신고 — *"V라인 리프팅 디바이스 영상이 자막이 하나도 안 맞아."*
//
//   whisper 는 **문장이 아니라 말이 쉬는 곳**(쉼표)에서 조각을 끊는다. 순서로 짝지으면
//   문장 1 에 조각 1("…쿠션,")이, 문장 2 에 조각 2("위로 … 밴드.")가 붙어 **뒤가 전부 밀린다.**
//   운영 문서에 남은 값이 그 흔적이다(조각 끝 = 다음 조각 시작, 글자 대비 불가능하게 짧음):
//     3856b99d  [{start:1.16, seconds:2}, {start:3.16, seconds:4.32}]              — 2문장
//     115387f3  [{start:0.03, seconds:3.02}, {start:3.05, seconds:2.28}, {start:5.33, seconds:3.84}] — 3문장
//   아래 조각의 앞부분은 그 저장값 그대로이고, 저장되지 않은 뒷부분 조각은 같은 리듬으로 채웠다.
//   ★ 글자는 여전히 안 쓴다 — 조각 글자의 **개수**만 써서 조각을 문장에 묶는다.
describe("alignSpeech — 쉼표에서 끊긴 조각을 문장으로 묶는다", () => {
  it("2문장·4조각(3856b99d): 문장마다 자기 조각들의 처음~끝이다", () => {
    const units = [
      { sentence: "턱선을 감싸는 부드러운 쿠션, 위로 탄탄하게 당겨 주는 밴드." },
      { sentence: "하루 십 분, 집에서 완성하는 V라인 케어." },
    ];
    const parts = [
      { timestamp: [1.16, 3.16], text: " 턱선을 감싸는 부드러운 쿠션," },
      { timestamp: [3.16, 7.48], text: " 위로 탄탄하게 당겨주는 밴드." },
      { timestamp: [8.1, 9.2], text: " 하루 십분," },
      { timestamp: [9.2, 12.4], text: " 집에서 완성하는 브이라인 케어." },
    ];
    const out = alignSpeech(units, parts);
    expect(out[0].spoken_start).toBeCloseTo(1.16, 2);
    expect(out[0].spoken_seconds).toBeCloseTo(6.32, 2);   // 1.16 → 7.48
    expect(out[1].spoken_start).toBeCloseTo(8.1, 2);
    expect(out[1].spoken_seconds).toBeCloseTo(4.3, 2);    // 8.10 → 12.40
    expect(out[1].sentence).toBe("하루 십 분, 집에서 완성하는 V라인 케어.");
  });

  it("3문장·4조각(115387f3): 가운데 문장이 쉼표 조각 둘을 가진다", () => {
    const units = [
      { sentence: "턱선을 감싸는 새로운 V라인 케어." },
      { sentence: "탄탄한 밴드가 당겨 올리고, 부드러운 쿠션이 편안하게 받쳐줍니다." },
      { sentence: "매일 3분, 갸름한 라인의 시작." },
    ];
    const parts = [
      { timestamp: [0.03, 3.05], text: " 턱선을 감싸는 새로운 브이라인 케어." },
      { timestamp: [3.05, 5.33], text: " 탄탄한 밴드가 당겨 올리고," },
      { timestamp: [5.33, 9.17], text: " 부드러운 쿠션이 편안하게 받쳐줍니다." },
      { timestamp: [9.6, 12.9], text: " 매일 3분, 갸름한 라인의 시작." },
    ];
    const out = alignSpeech(units, parts);
    expect(out[0].spoken_start).toBeCloseTo(0.03, 2);
    expect(out[0].spoken_seconds).toBeCloseTo(3.02, 2);
    expect(out[1].spoken_start).toBeCloseTo(3.05, 2);
    expect(out[1].spoken_seconds).toBeCloseTo(6.12, 2);   // 3.05 → 9.17
    expect(out[2].spoken_start).toBeCloseTo(9.6, 2);
    expect(out[2].spoken_seconds).toBeCloseTo(3.3, 2);
  });

  it("조각 하나가 두 문장을 품으면 그 조각 안에서 글자 비례로 나눈다", () => {
    const units = [{ sentence: "가나다라." }, { sentence: "마바사아." }];
    const parts = [{ timestamp: [1, 5], text: "가나다라 마바사아" }];
    const out = alignSpeech(units, parts);
    expect(out[0].spoken_start).toBeCloseTo(1, 2);
    expect(out[0].spoken_seconds).toBeCloseTo(2, 2);
    expect(out[1].spoken_start).toBeCloseTo(3, 2);
    expect(out[1].spoken_seconds).toBeCloseTo(2, 2);
  });

  // ★ 조각에 글자가 없으면 묶을 자가 없다 — 개수가 같을 때만 예전처럼 순서로 붙인다.
  it("조각 글자가 없고 개수가 다르면 건드리지 않는다", () => {
    const units = [{ sentence: "하나, 둘." }, { sentence: "셋." }];
    const parts = [{ timestamp: [0, 1] }, { timestamp: [1, 2] }, { timestamp: [2, 3] }];
    const out = alignSpeech(units, parts);
    expect(out.every((u) => u.spoken_start === undefined)).toBe(true);
  });

  it("조각 글자가 없어도 개수가 같으면 순서로 붙인다", () => {
    const units = [{ sentence: "하나." }, { sentence: "둘." }];
    const parts = [{ timestamp: [0.5, 1] }, { timestamp: [1.5, 2] }];
    const out = alignSpeech(units, parts);
    expect(out[1].spoken_start).toBeCloseTo(1.5, 2);
  });

  // ★ 배경음악 가사처럼 원고에 없는 말을 잔뜩 들었으면 길이 비율이 무너진다 — 믿지 않는다.
  it("들은 글자가 원고보다 한참 많으면 건드리지 않는다", () => {
    const units = [{ sentence: "짧은 말." }, { sentence: "끝." }];
    const parts = [
      { timestamp: [0, 2], text: "짧은 말 그리고 원고에 전혀 없는 아주 긴 노랫말이 이어진다" },
      { timestamp: [2, 3], text: "끝" },
    ];
    const out = alignSpeech(units, parts);
    expect(out.every((u) => u.spoken_start === undefined)).toBe(true);
  });
});

import { speechUnits } from "../lib/speech-timing.js";

// 임계값 근거(2026-09-16 실측): 정상 최장 낱말은 글자수 대비 2.3배("올리고" 1.28초/3글자),
// 쉼을 머금은 낱말은 7.6배(whisper "하루" 2.78초/2글자). 그 사이인 3배를 잡았다.
describe("speechUnits — 재 놓고 못 믿으면 버린다", () => {
  const S = ["가나다라 마바사.", "아자차카 타파하."];

  it("정상이면 문장마다 시작~끝이 붙는다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [5.0, 5.5], text: "아자차카" }, { timestamp: [5.5, 6.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[0]).toEqual({ start: 1.0, seconds: 1.0, ok: true });
    expect(out.units[1]).toEqual({ start: 5.0, seconds: 1.0, ok: true });
    expect(out.heard.chars).toBe(14);
  });

  it("첫 낱말이 글자수 대비 3배를 넘게 길면 그 문장을 버린다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [2.0, 5.6], text: "아자차카" }, { timestamp: [5.6, 6.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[0].ok).toBe(true);
    expect(out.units[1]).toEqual({ start: null, seconds: null, ok: false });
  });

  it("영상 길이를 넘으면 버린다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [14.0, 16.5], text: "아자차카" }, { timestamp: [16.5, 17.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[1].ok).toBe(false);
  });

  it("들은 양이 원고의 0.75 배 미만이면 전부 버린다", () => {
    const words = [{ timestamp: [1.0, 1.5], text: "가나" }];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units.every((u) => u.ok === false)).toBe(true);
    expect(out.heard.chars).toBe(2);
  });

  it("낱말이 없으면 전부 버리고 들은 양은 0 이다", () => {
    const out = speechUnits(S, [], { seconds: 15 });
    expect(out.units).toHaveLength(2);
    expect(out.units.every((u) => u.ok === false)).toBe(true);
    expect(out.heard).toEqual({ chars: 0, text: "" });
  });

  // ★ 뒤 문장의 낱말 타임스탬프를 앞 문장보다 이르게 둔 것만 다르다 — 길이(1.0초씩,
  //   범위 안 15초), 낱말 길이(둘 다 0.5초/4글자, 임계 2.18초 미만), 들은 비율(14/14=1)은
  //   전부 정상이라 다른 세 판정에는 걸리지 않는다. 오직 시작 순서 역전만 이 케이스를 잡는다.
  it("문장 순서가 뒤바뀌면(시작이 앞 문장 끝보다 이르면) 뒤 문장을 버린다", () => {
    const words = [
      { timestamp: [5.0, 5.5], text: "가나다라" }, { timestamp: [5.5, 6.0], text: "마바사." },
      { timestamp: [1.0, 1.5], text: "아자차카" }, { timestamp: [1.5, 2.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[0]).toEqual({ start: 5.0, seconds: 1.0, ok: true });
    expect(out.units[1]).toEqual({ start: null, seconds: null, ok: false });
  });
});
