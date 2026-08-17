// ⑥완성 — 자막 언어를 고르고 번역을 검토한다. 소스를 직접 훑는다(선례: subtitle-ui.test.js).
// 이 저장소에는 화면 단위 테스트가 없다 — 이 기능의 실패 모드는 "화면이 값을 손으로 다시
// 적는 것"이거나 "낡은 것을 새것으로 속이는 것"이라 소스에서 잡힌다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SUBTITLE_LANGS } from "../lib/subtitle-langs.js";

const src = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("⑥완성 — 자막 언어 칩", () => {
  it("언어 목록을 lib/subtitle-langs 에서 가져온다 — 손으로 세 개를 다시 적지 않는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/subtitle-langs["']/);
    expect(src).toContain("SUBTITLE_LANGS");
  });

  it("언어 칩을 SUBTITLE_LANGS.map 으로 그린다", () => {
    expect(src).toMatch(/SUBTITLE_LANGS\.map\(/);
  });

  it("고르면 POST /api/projects/[id]/subtitle-lang 을 부른다", () => {
    expect(src).toMatch(/\/api\/projects\/\$\{id\}\/subtitle-lang/);
    // 언어를 몸통에 싣는다
    expect(src).toMatch(/lang:\s*\w+/);
  });

  // 라우트는 응답이 못 쓸 때 저장을 하지 않는다(502) — 화면이 그 실패를 낙관적으로
  // 덮어써 버리면 사장님은 "일본어가 저장됐다"고 착각한다.
  it("저장 실패를 다룬다 — 켜진 칩은 저장된 값에서만 나온다(낙관적으로 앞서가지 않는다)", () => {
    // 켜진 칩 판정이 project.settings.subtitle_lang(서버가 저장한 값)을 본다.
    expect(src).toMatch(/project\?\.settings\?\.subtitle_lang/);
    // 실패했을 때 사장님에게 말할 오류 자리가 있다.
    expect(src, "언어 저장 실패를 알리는 자리가 없다").toMatch(/언어(를|가).{0,20}(저장하지 못했|그대로)/);
  });
});

describe("⑥완성 — 일본어·중국어에서는 스타일 칩이 없다", () => {
  it("한국어일 때만 글꼴(스타일) 칩을 그린다", () => {
    const at = src.indexOf("SUBTITLE_FONTS.map(");
    expect(at, "글꼴 칩 자리를 못 찾았다").toBeGreaterThan(-1);
    // 그 자리 위쪽 가까이에 한국어 조건이 있어야 한다(감싸는 조건)
    const before = src.slice(Math.max(0, at - 1200), at);
    expect(before, "글꼴 칩이 한국어 조건으로 안 감싸져 있다").toMatch(/lang === ["']ko["']/);
  });

  // ★★ 2026-08-18 — 옛 계약은 "사라진 이유를 한 줄로 말한다"였다(`…는 폰트가 한 벌이라 글꼴
  //    칩을 감췄어요`). **사용자 지시로 걷었다**: "폰트가 한 벌"이라는 것은 우리 사정이고
  //    사장님이 알 일이 아니다 — 고를 것이 없으면 그 줄이 없는 것이 자연스럽다.
  //    (이 화면이 "뒷단 낱말을 화면까지 새어 나오게 하지 않는다"로 이미 두 번 고친 결이다.)
  it("★ 뒷단 사정을 문구로 흘리지 않는다 — 폰트가 한 벌이라는 말이 없다", () => {
    expect(src, "폰트 사정을 사장님 화면에 적었다").not.toMatch(/폰트가 한 벌/);
    // 조건부 자리 자체가 사라져야 한다 — 빈 문단만 남으면 간격이 어긋난다
    expect(src, "글꼴 칩 자리에 빈 갈래가 남았다").not.toMatch(/글꼴 칩을 감췄/);
  });
});

// ★★ 2026-08-18 사장님 지적: **중국어 칩만 혼자 다음 줄로 내려가 있었다.**
//    수치로 확인된 원인 — 조절판 총폭이 336px 로 못 박혀 있고(`.subpanel` 의 max-width),
//    칩이 들어갈 칸은 336 − 36(좌우 여백) − 52(라벨) − 14(간격) = **234px** 다.
//    그런데 `중국어(간체)` 칩 하나가 100px 을 넘어 세 칩 합이 그 칸을 넘겼다.
//    칩 하나만 줄바꿈되면 그 칩이 **다른 종류의 것**처럼 보인다(선택지가 셋인데 둘처럼 읽힌다).
describe("⑥완성 — 언어 칩 셋은 한 줄에 들어간다", () => {
  it("★ 언어 이름이 짧다 — 칸에 셋이 들어가야 한다", () => {
    // 라벨 길이가 이 줄바꿈의 실제 원인이었다. 언어를 더할 때도 이 자를 넘기면 안 된다.
    for (const l of SUBTITLE_LANGS) {
      expect(l.label.length, `언어 이름이 너무 길다: ${l.label} — 칩이 다음 줄로 내려간다`)
        .toBeLessThanOrEqual(4);
    }
  });

  it("★ 이 줄의 칩은 줄바꿈하지 않는다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css, "언어 칩 줄에 nowrap 규칙이 없다").toMatch(/\.sub-row \.chips[^}]*flex-wrap:\s*nowrap/);
  });
});

describe("⑥완성 — 컷마다 번역을 검토한다", () => {
  it("낡음 판정은 lib/translate 의 isSubtitleStale 하나를 쓴다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/translate["']/);
    expect(src).toContain("isSubtitleStale");
  });

  it("원문과 번역을 나란히 보여 준다", () => {
    expect(src).toMatch(/c\.sentence/);
    expect(src).toMatch(/subtitles\?\.\[lang\]|subtitles\?\.\w+\?\.\[lang\]/);
  });

  // ②대본 화면과 같은 손보기 방식 — contentEditable + onBlur. 새 편집 UI를 만들지 않는다.
  it("번역을 contentEditable 로 고친다 — 대본 화면과 같은 방식", () => {
    const translationBlock = src.slice(src.indexOf("isSubtitleStale("), src.length);
    expect(translationBlock).toMatch(/contentEditable/);
    expect(translationBlock).toMatch(/suppressContentEditableWarning/);
    expect(translationBlock).toMatch(/onBlur/);
  });

  // 고치면 of 를 지금 문장으로 다시 찍어야 isSubtitleStale 이 손으로 고친 번역을
  // 낡음으로 잡지 않는다(lib/translate.js 의 규칙 그대로).
  it("고친 번역을 저장할 때 subtitleLang·subtitleText 를 싣는다 — of 재각인은 라우트 몫", () => {
    expect(src).toMatch(/subtitleLang/);
    expect(src).toMatch(/subtitleText/);
  });

  it("낡은 컷에는 다시 번역 버튼을 준다", () => {
    expect(src).toMatch(/다시 번역/);
  });
});

describe("⑥완성 — 미리보기 자막이 고른 언어를 따른다", () => {
  // 미리보기가 buildCues 를 lang 없이 부르면 한국어 원문만 그린다 — 사장님이
  // 검토하는 것과 실제로 구워질 것이 달라진다(리뷰가 잡은 결함).
  it("buildCues 호출에 lang 을 싣는다", () => {
    const at = src.indexOf("buildCues([sampleCut]");
    expect(at, "미리보기 buildCues 호출을 못 찾았다").toBeGreaterThan(-1);
    const call = src.slice(at, src.indexOf(")", src.indexOf("]", at)) + 1);
    expect(call, "미리보기가 언어를 안 싣는다").toMatch(/lang/);
  });
});
