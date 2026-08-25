// reel 이 고른 언어가 **음성까지** 간다.
//
// ★★ 축이 둘이다(2026-08-25 실측으로 드러난 결함):
//   · narration_lang — 시나리오가 대사를 어느 말로 쓸지 (reel/new 의 칩이 이 값에 저장됐다)
//   · speech_lang    — 영상이 어느 말로 말할지 (lib/cuts.js 의 buildClipPrompt 가 보는 값)
//   reel POST 는 앞의 것만 저장했고, 그래서 speechLangOf 가 기본값 "ko" 로 떨어졌다.
//   증상: 일본어를 골라도 클립 프롬프트가 `Says exactly, in Korean: "일본어 대사"` 가 된다 —
//   **모순된 지시가 나가고, 그것이 드러나는 자리는 돈을 치른 뒤다.**
// ★ 사장님 결정(2026-08-25): 칩 하나가 둘 다 정한다. 따로 고르게 하지 않는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const route = readFileSync("app/api/reel/route.js", "utf8");

describe("reel 이 고른 언어가 음성까지 간다", () => {
  it("speech_lang 을 저장한다", () => {
    expect(route).toContain("speech_lang");
  });

  // ★ 두 값이 **같은 원천**에서 나와야 한다 — 따로 읽으면 언젠가 갈린다.
  //   화면은 칩 하나만 보내므로 서버가 그것을 두 자리에 쓴다.
  it("narration_lang 과 같은 값을 쓴다 — 원천이 하나다", () => {
    const i = route.indexOf("speech_lang");
    expect(i).toBeGreaterThan(-1);
    const line = route.slice(i, route.indexOf("\n", i));
    expect(line, `speech_lang 줄: ${line}`).toMatch(/lang/);
  });

  // ★★ 모르는 값이 들어와도 던지지 않는다 — 이 저장소 규율(pickFocus·resolutionForProject).
  //   화면은 목록에서 고르지만 API 를 직접 두드리면 아무 값이나 온다.
  it("모르는 값은 걸러진다 — isSubtitleLang 로 판정한다", () => {
    expect(route).toContain("isSubtitleLang");
  });

  // ★★ 소스 검사만으로는 부족하다 — 이번 회차의 교훈(output_config 결함은
  //   전 스위트 그린인 채 진짜 경로만 죽어 있었다). 값이 **실제로 흘러가는지**를 재다.
  it("일본어·중국어 칩이 모델 이름까지 간다", async () => {
    const { normalizeAdOptions } = await import("../lib/ad/options.js");
    const { isSubtitleLang, DEFAULT_SPEECH_LANG, langLineOf } = await import("../lib/subtitle-langs.js");
    const speechOf = (id) => {
      const o = normalizeAdOptions({ format: "story", mood: "warm", style: "photo", narration_lang: id });
      return isSubtitleLang(o.narration_lang) ? o.narration_lang : DEFAULT_SPEECH_LANG;
    };
    expect(langLineOf(speechOf("ja"))).toBe("Japanese");
    expect(langLineOf(speechOf("zh"))).toBe("Simplified Chinese");
    expect(langLineOf(speechOf("ko"))).toBe("Korean");
  });

  // ⚠️ 알려진 구멍을 **못 박아 둔다** — SUBTITLE_LANGS 에 en 이 없어 영어를 골라도
  //   한국어로 떨어진다. 지금은 AD_LANGS 에서 hidden 이라 드러나지 않지만,
  //   **영어를 여는 날 같은 버그가 그대로 재현된다.** 그때 이 테스트가 울어
  //   SUBTITLE_LANGS 에 en 을 함께 더하라고 말해 준다.
  it("영어를 여는 날 음성 언어도 함께 열어야 한다", async () => {
    const { AD_LANGS } = await import("../lib/ad/options.js");
    const { isSubtitleLang } = await import("../lib/subtitle-langs.js");
    for (const l of AD_LANGS) {
      if (l.hidden) continue; // 화면에 안 뜨는 것은 고를 수 없다
      expect(isSubtitleLang(l.id), `${l.label}(${l.id}) 가 SUBTITLE_LANGS 에 없다`).toBe(true);
    }
  });
});
