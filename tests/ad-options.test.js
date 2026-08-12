// 옵션 세 축 — 화면이 그리는 목록이자 라우트가 검증하는 닫힌 목록이다.
// 두 벌이 되면 화면에는 있는데 서버가 거절하는 값이 생긴다(aspects.js 가 같은 이유로 표다).
import { describe, it, expect } from "vitest";
import {
  AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES,
  DEFAULT_AD_OPTIONS, normalizeAdOptions,
} from "../lib/ad/options.js";
import { STYLE_PRESETS } from "../lib/styles.js";

describe("광고 옵션", () => {
  it("세 축이 다 비어 있지 않다", () => {
    expect(AD_FORMATS.length).toBeGreaterThan(0);
    expect(AD_MOODS.length).toBeGreaterThan(0);
    expect(AD_LANGS.length).toBeGreaterThan(0);
  });

  it("포맷마다 시나리오 뼈대가 있다 — LLM 이 이 문구를 쓴다", () => {
    for (const f of AD_FORMATS) {
      expect(typeof f.beat).toBe("string");
      expect(f.beat.length).toBeGreaterThan(0);
    }
  });

  it("화풍은 styles.js 의 id 를 쓰되 문구는 따로 든다", () => {
    // id 는 공유한다 — 목록이 두 벌이 되면 화면과 서버가 갈린다
    for (const id of Object.keys(AD_STYLE_LINES)) {
      expect(STYLE_PRESETS.some((s) => s.id === id)).toBe(true);
    }
    // 문구는 갈라 둔다 — styles.js 것은 이미지 프롬프트용이라 영상에 그대로 실으면 어색하다
    const photo = STYLE_PRESETS.find((s) => s.id === "photo");
    expect(AD_STYLE_LINES.photo).not.toBe(`${photo.medium}. ${photo.finish}`);
  });

  it("styles.js 의 모든 화풍에 영상 문구가 있다 — 화면에 있는데 서버가 모르면 안 된다", () => {
    for (const s of STYLE_PRESETS) {
      expect(typeof AD_STYLE_LINES[s.id]).toBe("string");
    }
  });

  it("기본값이 전부 목록 안에 있다", () => {
    expect(AD_FORMATS.some((f) => f.id === DEFAULT_AD_OPTIONS.format)).toBe(true);
    expect(AD_MOODS.some((m) => m.id === DEFAULT_AD_OPTIONS.mood)).toBe(true);
    expect(AD_LANGS.some((l) => l.id === DEFAULT_AD_OPTIONS.narration_lang)).toBe(true);
    expect(typeof AD_STYLE_LINES[DEFAULT_AD_OPTIONS.style]).toBe("string");
  });

  it("normalizeAdOptions 는 빈 입력을 기본값으로 채운다", () => {
    expect(normalizeAdOptions({})).toEqual(DEFAULT_AD_OPTIONS);
    expect(normalizeAdOptions(undefined)).toEqual(DEFAULT_AD_OPTIONS);
  });

  it("모르는 값은 조용히 기본값이 되지 않고 던진다", () => {
    // ★ 고른 것과 만들어지는 것이 다르면 아무도 못 알아본다(styles.js 의 normalizeStyle 과 같은 판단)
    expect(() => normalizeAdOptions({ format: "없는포맷" })).toThrow();
    expect(() => normalizeAdOptions({ mood: "없는분위기" })).toThrow();
    expect(() => normalizeAdOptions({ narration_lang: "jp" })).toThrow();
    expect(() => normalizeAdOptions({ style: "없는화풍" })).toThrow();
  });

  it("import 문이 없다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/options.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});
