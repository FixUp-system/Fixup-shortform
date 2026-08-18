// 자막 글자를 고르는 자도 **원문 언어**를 본다.
//
// 사장님 지적(2026-08-18): "일본어 자막을 한국어로 바꾸고 [영상에 적용]을 눌렀는데
// 영상에 반영이 안 돼."
//
// 원인은 `subtitleTextFor` 안의 이 한 줄이었다:
//   if (!lang || lang === "ko") return sentence;   // "한국어는 원문이다"
// 일본어로 말하는 영상에서 한국어 자막을 고르면, 번역본 대신 **원문(일본어 문장)**을
// 그대로 굽는다. 화면에는 한국어가 보이는데 영상에는 일본어가 박히니 "적용이 안 된다"다.
//
// ★★ 이건 오늘 아침 내가 만든 **짝 안 맞는 수정**이다. `isSubtitleStale` 에서 같은 ko 고정을
//    걷어내면서 이 함수를 놓쳤다. 그 자리 주석이 미리 경고하고 있었다 —
//    "판정 기준을 여기서 새로 만들지 않는다: isSubtitleStale 과 **같은 자**다.
//     한쪽만 고치면 화면은 '최신' 이라 하는데 완성본은 원문으로 구워진다."
//    지금 증상이 정확히 그 문장이다.
import { describe, it, expect } from "vitest";
import { subtitleTextFor, buildCues } from "../lib/subtitles.js";
import { isSubtitleStale } from "../lib/translate.js";
import { readFileSync } from "node:fs";

const jaCut = {
  sentence: "夏は、軽く。",
  seconds: 5,
  subtitles: { ko: { text: "여름은, 가볍게.", of: "夏は、軽く。" } },
};

describe("자막 글자 — 원문 언어를 본다", () => {
  it("★★ 일본어로 말한 영상의 한국어 자막은 번역본이다", () => {
    expect(subtitleTextFor(jaCut, "ko", "ja"), "원문(일본어)을 그대로 굽는다")
      .toBe("여름은, 가볍게.");
  });

  it("★★ 원문 언어를 고르면 원문 그대로다 — 번역을 찾지 않는다", () => {
    expect(subtitleTextFor(jaCut, "ja", "ja")).toBe("夏は、軽く。");
  });

  it("★ 번역이 낡았으면 원문으로 떨어진다 — 틀린 글자보다 낫다", () => {
    const edited = { ...jaCut, sentence: "夏は、もっと軽く。" };
    expect(subtitleTextFor(edited, "ko", "ja")).toBe("夏は、もっと軽く。");
  });

  it("★★ 두 판정이 같은 자를 쓴다 — 화면이 '최신'이라 할 때 구워지는 것도 번역이어야 한다", () => {
    // isSubtitleStale 이 거짓(=번역이 최신)이면 subtitleTextFor 는 반드시 번역을 준다
    expect(isSubtitleStale(jaCut, "ko", "ja")).toBe(false);
    expect(subtitleTextFor(jaCut, "ko", "ja")).not.toBe(jaCut.sentence);
  });

  it("★ 원문 언어를 안 넘기면 예전처럼 한국어다 — 옛 호출자가 안 깨진다", () => {
    const koCut = { sentence: "여름은, 가볍게.", subtitles: {} };
    expect(subtitleTextFor(koCut, "ko")).toBe("여름은, 가볍게.");
  });

  it("★★ 구워지는 자막(buildCues)까지 그 값이 간다 — 여기서 끊기면 화면만 맞다", () => {
    const cues = buildCues([{ ...jaCut, idx: 0 }], { width: 1080, height: 1920, lang: "ko", sourceLang: "ja" });
    expect(JSON.stringify(cues), "구워지는 글자가 아직 원문이다").toContain("여름은");
  });
});

// ★★ 굽는 쪽이 **말한 언어를 모르면** 두 가지가 한꺼번에 깨진다(2026-08-18 사장님 지적 둘):
//    ① "일본어 자막을 한국어로 바꿨는데 반영이 안 된다" — 원문 판정이 ko 고정이라 번역 대신
//       원문(일본어)을 구웠다
//    ② "최초에 일본어 자막이 깨지는 것 같다" — 언어를 **한 번도 안 골랐으면**
//       `settings.subtitle_lang` 이 undefined 라, 굽는 쪽이 한국어 폰트(Pretendard)로
//       일본어를 그린다. 글리프가 없으니 두부(□□□)가 된다.
//    둘 다 뿌리가 같다: 파이프라인이 `speech_lang` 을 굽는 쪽에 안 흘렸다.
describe("굽는 쪽이 말한 언어를 안다", () => {
  const src = readFileSync("lib/pipeline.js", "utf8");

  it("★★ 전체 합성이 말한 언어를 싣는다 — 안 고른 프로젝트도 제 폰트로 구워야 한다", () => {
    const call = src.slice(src.indexOf("const result = await compose({"), src.indexOf("const result = await compose({") + 1400);
    expect(call, "합성이 원문 언어를 안 받는다").toMatch(/sourceLang/);
    expect(call, "자막 언어가 안 골랐을 때 말한 언어로 안 떨어진다")
      .toMatch(/subtitle_lang\s*\|\|\s*speechLangOf|speechLangOf\([^)]*\)/);
  });

  it("★★ 자막만 다시 굽기도 같은 값을 받는다 — 여기만 빠지면 [영상에 적용]에서 깨진다", () => {
    const call = src.slice(src.indexOf("const result = await burn({"), src.indexOf("const result = await burn({") + 1400);
    expect(call, "다시 굽기가 원문 언어를 안 받는다").toMatch(/sourceLang/);
    expect(call, "자막 언어가 안 골랐을 때 말한 언어로 안 떨어진다").toMatch(/speechLangOf/);
  });
});
