// 자막 글꼴 — **파일과 표와 CSS 가 함께 있어야 한다**(2026-08-25 사장님 지시로 셋 추가).
//
// ★★ 이 저장소가 경고하는 함정: 파일 없이 목록만 늘리면 libass 가 그 글꼴을 못 찾아
//   **조용히 기본 폰트로 굽는다**(lib/compose.js 의 fontsDir 주석). 화면 미리보기는
//   브라우저 폰트로 그럴듯하게 보이므로 눈으로도 안 잡힌다 — 그래서 테스트가 잡는다.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { SUBTITLE_FONTS } from "../lib/subtitles.js";

const css = readFileSync("app/globals.css", "utf8");

describe("글꼴마다 네 자리가 맞는다", () => {
  for (const f of SUBTITLE_FONTS) {
    it(`${f.label}(${f.id}) — 파일이 있다`, () => {
      const hit = ["ttf", "otf"].map((e) => `public/fonts/subtitle-${f.id}.${e}`).find(existsSync);
      expect(hit, `public/fonts/subtitle-${f.id}.{ttf,otf} 가 없다`).toBeTruthy();
    });

    it(`${f.label}(${f.id}) — @font-face 가 있다`, () => {
      expect(css, `CSS 에 ${f.cssFamily} 선언이 없다`).toContain(f.cssFamily);
    });

    it(`${f.label}(${f.id}) — 외곽선 두께가 정해져 있다`, () => {
      // rim 은 글꼴마다 다르다 — 획이 가는 글꼴은 외곽선이 두꺼우면 뭉갠다.
      expect(typeof f.rim, `${f.id} 에 rim 이 없다`).toBe("number");
      expect(f.rim).toBeGreaterThan(0);
    });
  }

  it("고를 수 있는 글꼴이 여섯이다", () => {
    expect(SUBTITLE_FONTS.length).toBe(6);
  });

  // ★ id 가 곧 파일 이름이다 — 겹치면 한쪽이 다른 쪽 파일을 가리킨다.
  it("id 가 겹치지 않는다", () => {
    const ids = SUBTITLE_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("굽기도 그 글꼴을 찾는다", () => {
  // ★★ **버즛이 둘이다.** 브라우저는 public/fonts 를 읽고(@font-face),
  //   ffmpeg 는 assets/ 폴더를 통째로 받아 글꼴 **이름**으로 찾는다
  //   (lib/compose.js 의 fontsDir ← lib/subtitle-langs.js 의 subtitleFontFor).
  //   한쪽에만 넣으면 **미리보기는 맞고 영상은 기본 폰트로 구워진다** —
  //   눈으로는 안 잡힌다. 실제로 그럴 뻔했다(2026-08-25).
  for (const f of SUBTITLE_FONTS) {
    it(`${f.label}(${f.id}) — assets/ 에도 파일이 있다`, () => {
      const hit = ["ttf", "otf"].map((e) => `assets/subtitle-${f.id}.${e}`).find(existsSync);
      // 기본(basic)은 예외다 — 그 파일 이름은 subtitle-font.otf 다.
      if (f.id === "basic") return expect(existsSync("assets/subtitle-font.otf")).toBe(true);
      expect(hit, `assets/subtitle-${f.id}.{ttf,otf} 가 없다 — 영상은 기본 폰트로 구워진다`).toBeTruthy();
    });
  }
});
