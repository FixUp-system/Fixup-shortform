import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SUBTITLE_LANGS, subtitleFontFor } from "../lib/subtitle-langs.js";

// 폰트에 글리프가 없으면 ffmpeg 는 오류 없이 **두부(□)** 를 굽는다.
// 테스트가 그린인데 화면이 깨지는 것이 이 자리의 실패 방식이라, 코드가 판정한다.
function cmapCodes(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  let base = 0;
  if (u32(0) === 0x74746366) base = u32(12); // ttcf
  let cmapOff = 0;
  for (let i = 0; i < u16(base + 4); i++) {
    const rec = base + 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "cmap") cmapOff = u32(rec + 8);
  }
  if (!cmapOff) return null;
  const subs = [];
  for (let i = 0; i < u16(cmapOff + 2); i++) {
    const r = cmapOff + 4 + i * 8;
    subs.push({ plat: u16(r), enc: u16(r + 2), off: cmapOff + u32(r + 4) });
  }
  const pick = subs.find((s) => s.plat === 3 && s.enc === 10)
    || subs.find((s) => s.plat === 3 && s.enc === 1) || subs.find((s) => s.plat === 0);
  if (!pick) return null;
  const fmt = u16(pick.off);
  const has = new Set();
  if (fmt === 4) {
    const segX2 = u16(pick.off + 6);
    const endO = pick.off + 14, startO = endO + segX2 + 2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = u16(endO + i * 2), start = u16(startO + i * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) has.add(c);
    }
  } else if (fmt === 12) {
    for (let i = 0; i < u32(pick.off + 12); i++) {
      const g = pick.off + 16 + i * 12;
      const s = u32(g), e = u32(g + 4);
      for (let c = s; c <= e && c - s < 70000; c++) has.add(c);
    }
  } else return null;
  return has;
}

const NEED = {
  ko: [0xac00, 0xd7a3],                    // 가, 힣
  ja: [0x3042, 0x30a2, 0x6f22, 0x8a9e],    // あ, ア, 漢, 語
  zh: [0x56fd, 0x8f66, 0x8fd9, 0x6c49],    // 国, 车, 这, 汉
};

describe("자막 폰트가 그 언어를 실제로 덮는가", () => {
  for (const lang of ["ko", "ja", "zh"]) {
    it(`${lang} 폰트에 필요한 글자가 다 있다`, () => {
      const { file } = subtitleFontFor(lang);
      const set = cmapCodes(readFileSync(file));
      expect(set, `${file} cmap 파싱 실패`).toBeTruthy();
      for (const cp of NEED[lang]) {
        expect(set.has(cp), `${file} 에 U+${cp.toString(16)} 없음 — 두부가 된다`).toBe(true);
      }
    });
  }

  it("언어 목록과 폰트 대응이 짝이 맞는다", () => {
    for (const l of SUBTITLE_LANGS) {
      const f = subtitleFontFor(l.id);
      expect(f.file).toBeTruthy();
      expect(f.family).toBeTruthy();
    }
  });
});

// ★ 재배포하는 폰트는 라이선스를 동봉해야 한다(OFL-1.1 의 조건이다).
//   CJK 만 적어 두고 한국어 폰트를 빠뜨리면 "왜 절반만 있지"를 다음 사람이 다시 조사한다.
it("자막 폰트 다섯 개가 모두 라이선스 노트에 적혀 있다", () => {
  const note = readFileSync("assets/SUBTITLE-FONTS-LICENSE-NOTE.md", "utf8");
  for (const f of [
    "subtitle-font.otf", "subtitle-impact.ttf", "subtitle-soft.ttf",
    "subtitle-ja.otf", "subtitle-zh.otf",
  ]) {
    expect(note, `${f} 가 라이선스 노트에 없다`).toContain(f);
  }
});
