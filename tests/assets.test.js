import { describe, it, expect } from "vitest";
import { existsSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SUBTITLE_FONTS, toAss } from "../lib/subtitles.js";
import { SUBTITLE_LANGS, subtitleFontFor } from "../lib/subtitle-langs.js";

// 폰트 파일의 `name` 테이블에서 family(nameID 1)를 읽는다.
//
// ★ 이 검사가 정작 위험한 실패 모드를 잡는다: SUBTITLE_FONTS 의 family 가 파일 내부 이름과
// 한 글자라도 어긋나면 ffmpeg 는 오류 없이 **기본 폰트로 그린다**. 사장님이 "강조"를 골랐는데
// 완성본은 기본 글씨인 채로 나가고, 아무도 못 알아챈다.
//
// sfnt 구조: 12바이트 헤더 뒤에 16바이트짜리 테이블 디렉터리가 numTables 개.
// name 테이블은 format(2) + count(2) + stringOffset(2) 뒤에 12바이트 레코드가 count 개다.
function familyOf(file) {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  let name = null;
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    if (b.toString("ascii", p, p + 4) === "name") name = b.readUInt32BE(p + 8);
  }
  if (name === null) return null;

  const count = b.readUInt16BE(name + 2);
  const strings = name + b.readUInt16BE(name + 4);
  let fallback = null;
  for (let i = 0; i < count; i++) {
    const r = name + 6 + i * 12;
    const platform = b.readUInt16BE(r);
    if (b.readUInt16BE(r + 6) !== 1) continue;              // nameID 1 = family
    const len = b.readUInt16BE(r + 8);
    const at = strings + b.readUInt16BE(r + 10);
    const raw = b.subarray(at, at + len);
    // 플랫폼 1(Mac)은 1바이트, 그 밖(0 유니코드·3 윈도)은 UTF-16BE 다.
    // 둘 다 있으면 윈도 쪽이 정본이라 그때는 바로 돌려준다.
    const decoded =
      platform === 1
        ? raw.toString("latin1")
        : Buffer.from(raw).swap16().toString("utf16le");
    if (platform === 3) return decoded;
    fallback = fallback ?? decoded;
  }
  return fallback;
}

// ★ 폰트는 코드가 아니라 파일이다. 목록에만 있고 파일이 없으면 ffmpeg 가 조용히
// 기본 폰트로 그려 사장님이 고른 것과 다른 자막이 나온다 — 아무도 못 알아챈다.
describe("자막 폰트 파일", () => {
  const FILES = {
    basic: "assets/subtitle-font.otf",
    impact: "assets/subtitle-impact.ttf",
    soft: "assets/subtitle-soft.ttf",
  };
  // 브라우저 미리보기가 읽는 사본(app/globals.css 의 @font-face)
  const WEB_FILES = {
    basic: "public/fonts/subtitle-basic.otf",
    impact: "public/fonts/subtitle-impact.ttf",
    soft: "public/fonts/subtitle-soft.ttf",
  };

  for (const f of SUBTITLE_FONTS) {
    it(`${f.id}(${f.label}) 파일이 있다`, () => {
      const p = FILES[f.id];
      expect(p, `${f.id} 의 파일 경로가 목록에 없다`).toBeTruthy();
      expect(existsSync(p), `${p} 가 없다`).toBe(true);
      // 오류 HTML 을 받아 놓고 폰트라고 믿는 것을 막는다
      expect(statSync(p).size).toBeGreaterThan(50_000);
    });

    // ★ 파일이 있는 것으로는 모자란다 — 이름이 어긋나면 ffmpeg 가 조용히 기본 폰트로 그린다
    it(`${f.id} 의 내부 이름이 목록의 family 와 같다`, () => {
      expect(familyOf(FILES[f.id])).toBe(f.family);
    });

    // ★ 같은 폰트가 두 곳에 있다 — ffmpeg 는 assets/ 를, 브라우저 미리보기는 public/fonts/ 를
    // 읽는다. 나중에 한쪽만 바꾸면 오류 하나 없이 미리보기와 완성본의 글꼴이 갈린다
    // (이 기능이 막으려던 실패 모드 그 자체다). 바이트로 묶어 둔다.
    it(`${f.id} 의 assets/ 와 public/fonts/ 가 같은 파일이다`, () => {
      const sha = (p) => createHash("sha1").update(readFileSync(p)).digest("hex");
      expect(sha(WEB_FILES[f.id]), `${WEB_FILES[f.id]} 가 ${FILES[f.id]} 와 다르다`).toBe(sha(FILES[f.id]));
    });
  }
});

// ★★ 언어를 따라야 하는 것이 **둘**이다 — ASS 에 적히는 Fontname 과 ffmpeg 가 읽는 폰트
//    파일. 하나만 바꾸면 libass 가 오류 한 줄 없이 다른 폰트로 대체해 **한자·가나가 전부
//    두부(□)** 로 나간다. 이 검사가 그 둘을 한 자리에서 묶는다: ASS 가 부르는 이름이
//    실제로 그 언어의 폰트 파일 **안에 적힌 이름**이어야 한다.
describe("언어의 ASS 폰트 이름과 폰트 파일이 같은 것을 가리킨다", () => {
  for (const lang of SUBTITLE_LANGS) {
    it(`${lang.id}(${lang.label})`, () => {
      const { file } = subtitleFontFor(lang.id);
      expect(existsSync(file), `${file} 가 없다`).toBe(true);
      const style = toAss([], { width: 1080, height: 1920, lang: lang.id })
        .split("\n")
        .find((l) => l.startsWith("Style: Main"));
      const named = style.split(",")[1];
      expect(named, `${lang.id} 의 ASS 이름이 ${file} 의 내부 이름과 다르다 — 두부가 된다`)
        .toBe(familyOf(file));
    });
  }
});
