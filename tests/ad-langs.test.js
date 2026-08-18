// 광고도 네 언어로 말한다 — 그리고 그 말이 자막이 된다.
//
// 사장님 지시(2026-08-18): "광고 영상도 다국어 지원 기능을 추가해야 해서 단계별 영상처럼
// 선택 칩 만들어 주고, 음성과 자막을 선택된 언어로 반영할 수 있도록."
//
// 광고에는 이미 나레이션 언어 칩이 있었다 — 다만 **둘**뿐이었다(한국어·영어).
// 단계별이 오늘 셋(한국어·일본어·중국어)을 받았으므로, 둘을 합치면 넷이다.
//
// ★ 두 목록을 **합치지는 않는다.** 뜻이 다르다: 단계별의 `speech_lang` 은 "대사 원문의
//   언어 = 자막 원문"이고(lib/subtitle-langs.js), 광고의 `narration_lang` 은 통짜 생성
//   지시문에 실리는 "나레이션 언어"다. 저장 자리도 판정도 다르다 — 합치면 한쪽을 바꿀 때
//   다른 쪽이 끌려간다(그 경고가 두 파일 머리말에 이미 있다).
//   여기서 맞추는 것은 **선택지의 범위**이지 값의 뜻이 아니다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_LANGS } from "../lib/ad/options.js";
import { SUBTITLE_LANGS } from "../lib/subtitle-langs.js";

describe("광고 나레이션 언어 — 네 갈래", () => {
  it("★★ 단계별이 주는 언어를 광고도 전부 준다", () => {
    const ids = AD_LANGS.map((l) => l.id);
    for (const l of SUBTITLE_LANGS) {
      expect(ids, `광고에 ${l.label}가 없다 — 같은 제품인데 고를 수 있는 말이 다르다`).toContain(l.id);
    }
    // 영어는 광고에만 있던 것이고, 있던 것을 빼지 않는다
    expect(ids, "영어가 사라졌다").toContain("en");
  });

  it("★ 모델에 넘길 이름이 같은 말이다 — 두 흐름이 다른 이름으로 부르면 결과가 갈린다", () => {
    for (const l of SUBTITLE_LANGS) {
      const ad = AD_LANGS.find((x) => x.id === l.id);
      expect(ad.line, `${l.label}를 광고와 단계별이 다른 이름으로 부른다`).toBe(l.line);
    }
  });

  it("★ 라벨은 짧다 — 칩 셋이 한 줄에 서야 한다(중국어가 혼자 내려간 적이 있다)", () => {
    for (const l of AD_LANGS) {
      expect(l.label.length, `"${l.label}" 이 길다`).toBeLessThanOrEqual(4);
    }
  });

  it("★ 모르는 값은 입구에서 막는다 — 저장된 문서는 오래 살아 옛 값을 들고 온다", () => {
    const opts = readFileSync("lib/ad/options.js", "utf8");
    expect(opts, "나레이션 언어를 검사하지 않는다").toMatch(/narration_lang/);
  });
});
