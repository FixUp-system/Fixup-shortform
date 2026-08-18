// 영상이 **무슨 말로 말하는가** — 첫 화면에서 한 번 정한다.
//
// 사장님 지시(2026-08-18): "자막에서 제공하는 일본어와 중국어 음성을 추가할 예정이고,
// 처음 자료 부분에서 사용자에게 선택하게 할 거야. seedance 에서 제공하는 음성을 쓰는
// 거니까 앞단에서 언어를 설정해야 하는 게 맞는 것 같아. 해당 언어로 선택했을 시에
// 해당 자막이 맞게 선택되도록."
//
// ★★ 이 기능의 핵심은 값 하나가 **두 가지를 동시에 정한다**는 것이다:
//    ① 클립이 내는 **소리**의 언어(Seedance 가 그 말로 말한다)
//    ② 대사 원문의 언어 — 그리고 그 글자가 **그대로 자막이 된다**
//    그래서 "말하는 언어 = 자막 원문 언어"이고, 둘을 따로 두면 소리와 글자가 갈린다.
//
// ⚠️ 그 등식이 기존 코드의 전제를 깬다. `isSubtitleStale` 은 "한국어는 원문이 곧 자막"이라
//    **ko 를 글자 그대로 박아** 두고 있었다. 일본어로 말하는 영상에서는 ja 가 원문이므로,
//    그 자리는 이제 프로젝트가 정한 원문 언어를 봐야 한다.
//
// ⚠️ 옛 프로젝트에는 이 값이 없다 — 없으면 한국어다. 그래야 지금까지 만든 영상의
//    프롬프트가 **글자 그대로** 같고, 각인이 흔들려 재구매가 뜨지 않는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildClipPrompt } from "../lib/cuts.js";
import { isSubtitleStale } from "../lib/translate.js";
import { DEFAULT_SPEECH_LANG, speechLangOf } from "../lib/subtitle-langs.js";

// 말하는 컷이어야 언어 문구가 나온다 — 무음 컷에는 대사 절 자체가 없다.
const cut = { idx: 0, sentence: "여름은, 가볍게.", motion: "slow push-in" };
const projectWith = (lang) => ({
  settings: { i2v_model: "seedance-2.0", ...(lang ? { speech_lang: lang } : {}) },
  cast: [{ who: "코치", look: "wiry coach in a grey tracksuit", voice: "gravelly veteran voice", cuts: [0] }],
  cuts: [cut],
});

describe("말하는 언어 — 값 하나", () => {
  it("★ 기본은 한국어이고, 없으면 한국어다", () => {
    expect(DEFAULT_SPEECH_LANG).toBe("ko");
    expect(speechLangOf(projectWith(null))).toBe("ko");
    expect(speechLangOf(projectWith("ja"))).toBe("ja");
    // 모르는 값은 한국어로 — 저장된 문서는 오래 살아 옛 값을 들고 온다
    expect(speechLangOf({ settings: { speech_lang: "fr" } })).toBe("ko");
  });

  it("★★ 클립 프롬프트가 그 언어로 말하라고 시킨다", () => {
    expect(buildClipPrompt(cut, projectWith("ja")), "일본어를 골랐는데 한국어로 말한다")
      .toContain("in Japanese");
    expect(buildClipPrompt(cut, projectWith("zh"))).toContain("in Simplified Chinese");
  });

  it("★★ 안 고른 프로젝트의 프롬프트는 글자 그대로 같다 — 산 영상이 낡지 않는다", () => {
    expect(buildClipPrompt(cut, projectWith(null))).toBe(buildClipPrompt(cut, projectWith("ko")));
    expect(buildClipPrompt(cut, projectWith(null))).toContain("in Korean");
  });
});

describe("자막 — 말한 언어가 원문이다", () => {
  const c = { sentence: "夏は、軽く。", subtitles: {} };

  it("★★ 원문 언어는 번역이 필요 없다", () => {
    expect(isSubtitleStale(c, "ja", "ja"), "일본어로 말한 영상인데 일본어 자막을 번역하려 든다")
      .toBe(false);
  });

  it("★★ 다른 언어는 번역이 필요하다 — 한국어도 예외가 아니다", () => {
    expect(isSubtitleStale(c, "ko", "ja"), "원문이 일본어인데 한국어를 원문 취급한다").toBe(true);
    expect(isSubtitleStale(c, "zh", "ja")).toBe(true);
  });

  it("★ 원문 언어를 안 넘기면 예전처럼 한국어다 — 옛 호출자가 안 깨진다", () => {
    expect(isSubtitleStale({ sentence: "가", subtitles: {} }, "ko")).toBe(false);
  });
});

describe("화면과 배선", () => {
  const first = readFileSync("app/create/page.js", "utf8");
  const route = readFileSync("app/api/projects/route.js", "utf8");
  const done = readFileSync("app/create/[id]/done/page.js", "utf8");
  const scenario = readFileSync("lib/scenario.js", "utf8");

  it("★ 첫 화면에서 고른다", () => {
    expect(first, "첫 화면에 언어를 고르는 자리가 없다").toMatch(/speech_lang/);
  });

  it("★★ 라우트가 그 값을 받는다 — 화이트리스트라 안 적으면 말없이 사라진다", () => {
    expect(route, "라우트가 speech_lang 을 안 받는다").toMatch(/speech_lang/);
  });

  it("★★ 시나리오가 그 언어로 대사를 쓴다", () => {
    expect(scenario, "대사 언어가 한국어로 박혀 있다").toMatch(/speechLangOf|speech_lang/);
  });

  it("★★ ⑥완성의 기본 자막이 말한 언어다", () => {
    expect(done, "말한 언어와 무관하게 한국어 자막이 기본이다").toMatch(/speechLangOf/);
  });
});
