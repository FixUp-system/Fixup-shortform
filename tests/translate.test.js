import { describe, it, expect } from "vitest";
import { buildTranslateMessages, validateTranslation, isSubtitleStale } from "../lib/translate.js";

const cuts = [
  { idx: 0, sentence: "이 스포츠카는 빠릅니다." },
  { idx: 1, sentence: "디자인도 아름답습니다." },
];

describe("buildTranslateMessages", () => {
  it("컷 문장을 번호와 함께 싣고 목표 언어를 말한다", () => {
    const { system, messages } = buildTranslateMessages(cuts, "ja");
    expect(system).toContain("Japanese");
    const user = messages[0].content;
    expect(user).toContain("이 스포츠카는 빠릅니다.");
    expect(user).toContain("디자인도 아름답습니다.");
  });

  // ★ 자막은 화면에 박히는 글자다 — 길이가 넘치면 잘린다
  it("자막용이라는 것과 길이 제약을 지시한다", () => {
    const { system } = buildTranslateMessages(cuts, "zh");
    expect(system).toContain("자막");
    expect(system).toContain("Simplified Chinese");
  });

  it("모르는 언어는 던진다 — 조용히 한국어로 떨어지면 안 된다", () => {
    expect(() => buildTranslateMessages(cuts, "fr")).toThrow();
  });
});

describe("validateTranslation — 개수가 안 맞으면 통째로 버린다", () => {
  it("컷 수만큼 오면 받는다", () => {
    expect(validateTranslation({ lines: ["速い", "美しい"] }, 2)).toEqual(["速い", "美しい"]);
  });

  // 짝이 밀리면 엉뚱한 컷에 엉뚱한 자막이 붙는다 — 개수가 다르면 통째로 버린다
  it("개수가 다르면 null", () => {
    expect(validateTranslation({ lines: ["速い"] }, 2)).toBe(null);
    expect(validateTranslation({ lines: ["a", "b", "c"] }, 2)).toBe(null);
  });

  it("빈 줄이 섞이면 null", () => {
    expect(validateTranslation({ lines: ["速い", "  "] }, 2)).toBe(null);
    expect(validateTranslation(null, 2)).toBe(null);
  });
});

describe("isSubtitleStale — 각인으로 판정한다", () => {
  it("원고를 고치면 번역이 낡는다", () => {
    const cut = { sentence: "고친 문장입니다.", subtitles: { ja: { text: "速い", of: "옛 문장입니다." } } };
    expect(isSubtitleStale(cut, "ja")).toBe(true);
  });

  it("각인이 맞으면 안 낡았다", () => {
    const cut = { sentence: "그대로입니다.", subtitles: { ja: { text: "速い", of: "그대로입니다." } } };
    expect(isSubtitleStale(cut, "ja")).toBe(false);
  });

  it("번역이 아예 없으면 낡은 것으로 본다 — 만들어야 한다", () => {
    expect(isSubtitleStale({ sentence: "가.", subtitles: {} }, "ja")).toBe(true);
  });

  it("한국어는 번역이 없어도 안 낡았다 — 원문이 곧 자막이다", () => {
    expect(isSubtitleStale({ sentence: "가." }, "ko")).toBe(false);
  });
});
