import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STYLE_PRESETS, DEFAULT_STYLE_ID, STYLE_NOTE_MAX,
  styleFor, activeStyle, styleKey, normalizeStyle,
} from "../lib/styles.js";

afterEach(() => vi.restoreAllMocks());

describe("STYLE_PRESETS — 화풍 표", () => {
  // 표를 쓰는 이유는 clip-limits 와 같다: 화풍이 프롬프트에 박혀 있으면 바꿀 자리가 없다.
  it("id 가 중복되지 않고 필요한 필드를 다 갖는다", () => {
    const ids = STYLE_PRESETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STYLE_PRESETS) {
      expect(s.label, `${s.id} 에 라벨이 없다`).toBeTruthy();
      expect(s.desc, `${s.id} 에 설명이 없다`).toBeTruthy();
      expect(s.medium, `${s.id} 에 medium 이 없다`).toBeTruthy();
      expect(s.finish, `${s.id} 에 finish 가 없다`).toBeTruthy();
    }
  });

  it("기본 화풍은 실사다 — 지금까지의 동작이 기본으로 남는다", () => {
    expect(DEFAULT_STYLE_ID).toBe("photo");
    expect(styleFor(DEFAULT_STYLE_ID).id).toBe("photo");
  });

  // 이 두 값이 이어 붙어 lib/cuts.js 의 현행 프롬프트가 된다. 글자가 하나라도 다르면
  // 실사 프로젝트의 그림이 지금과 달라진다 — buildImagePrompt 테스트가 완전일치로 잡는다.
  it("실사 프리셋의 문구는 현행 프롬프트의 조각과 같다", () => {
    const photo = styleFor("photo");
    expect(photo.medium).toBe("High-quality photographic still");
    expect(photo.finish).toBe("Cinematic lighting, realistic");
  });

  it("일러스트·애니메이션·SF 가 있고 서로 다른 문구를 쓴다", () => {
    for (const id of ["illust", "anime", "scifi"]) {
      expect(STYLE_PRESETS.some((s) => s.id === id), `${id} 프리셋이 없다`).toBe(true);
    }
    const mediums = STYLE_PRESETS.map((s) => s.medium);
    expect(new Set(mediums).size).toBe(mediums.length);
  });
});

describe("styleFor — 닫힌 목록", () => {
  // clip-limits.js 의 profileFor 와 같은 계약: 모르는 값은 조용히 통과시키지 않고
  // 눈에 띄게 경고한 뒤 기본으로 떨어진다.
  it("모르는 id 는 실사로 떨어지고 경고를 남긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(styleFor("클레이애니").id).toBe("photo");
    expect(warn).toHaveBeenCalled();
  });

  it("빈 값도 실사로 떨어진다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(styleFor(undefined).id).toBe("photo");
    expect(styleFor("").id).toBe("photo");
  });
});

describe("activeStyle — 프로젝트가 고른 화풍", () => {
  it("settings.style.preset 을 읽는다", () => {
    expect(activeStyle({ settings: { style: { preset: "anime" } } }).id).toBe("anime");
  });

  // 화풍을 도입하기 전에 만든 프로젝트다. 기본값을 저장하지 않고 파생하므로 여기로 온다.
  it("화풍을 고르지 않은 프로젝트는 실사다", () => {
    expect(activeStyle({ settings: { aspect_ratio: "9:16" } }).id).toBe("photo");
    expect(activeStyle({}).id).toBe("photo");
    expect(activeStyle(undefined).id).toBe("photo");
  });
});

describe("styleKey — 각인용 파생값", () => {
  // 낡음 판정이 이것을 image.style_of 와 비교한다(lib/steps.js). 프리셋과 보정 한 줄이
  // 함께 들어가야 "보정만 고쳤다"도 그림을 낡게 만든다.
  it("프리셋과 보정을 함께 담는다", () => {
    const a = styleKey({ settings: { style: { preset: "illust", note: "파스텔" } } });
    const b = styleKey({ settings: { style: { preset: "illust", note: "차가운 색" } } });
    const c = styleKey({ settings: { style: { preset: "anime", note: "파스텔" } } });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("화풍이 없는 프로젝트도 같은 키를 낸다 — 되물어도 답이 같다", () => {
    expect(styleKey({})).toBe(styleKey({ settings: {} }));
    expect(styleKey({})).toBe(styleKey({ settings: { style: { preset: "photo" } } }));
  });
});

describe("normalizeStyle — 저장 전 게이트", () => {
  it("목록 안의 프리셋을 통과시킨다", () => {
    expect(normalizeStyle({ preset: "scifi" })).toEqual({ preset: "scifi", note: "" });
  });

  // validate.js 의 focus.mode 와 같은 결이다 — 닫힌 목록은 코드가 판정한다.
  it("목록 밖 프리셋은 거절한다 — 조용히 기본으로 바꾸지 않는다", () => {
    expect(() => normalizeStyle({ preset: "클레이애니" })).toThrow();
    expect(() => normalizeStyle({ preset: "" })).toThrow();
    expect(() => normalizeStyle({})).toThrow();
  });

  it("보정 한 줄의 개행을 공백으로 눕히고 앞뒤를 다듬는다", () => {
    // 프롬프트는 한 줄이다. 개행이 들어가면 여러 문장처럼 부풀 자리가 생긴다.
    expect(normalizeStyle({ preset: "illust", note: " 따뜻한\n파스텔톤 " }).note)
      .toBe("따뜻한 파스텔톤");
  });

  it("상한을 넘는 보정은 거절한다 — 조용히 자르지 않는다", () => {
    // 자르면 사장님이 쓴 것과 그림에 실린 것이 달라지고, 그 차이를 아무도 알려주지 않는다.
    const long = "가".repeat(STYLE_NOTE_MAX + 1);
    expect(() => normalizeStyle({ preset: "photo", note: long })).toThrow();
    expect(normalizeStyle({ preset: "photo", note: "가".repeat(STYLE_NOTE_MAX) }).note.length)
      .toBe(STYLE_NOTE_MAX);
  });

  it("문자열이 아닌 보정은 거절한다", () => {
    expect(() => normalizeStyle({ preset: "photo", note: { 나쁜: "값" } })).toThrow();
    expect(() => normalizeStyle({ preset: "photo", note: 42 })).toThrow();
  });

  it("보정을 안 주면 빈 문자열이다", () => {
    expect(normalizeStyle({ preset: "anime" }).note).toBe("");
  });
});

describe("lib/styles.js 는 fs 를 끌고 오지 않는다", () => {
  // "use client" 화면(칩 UI)이 이것을 import 한다. costs.js 계열이 섞이면 번들에 fs 가
  // 들어가 빌드가 깨진다 — clip-limits.js·voices.js 가 분리된 것과 같은 이유다.
  it("import 가 없다", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("lib/styles.js", "utf8");
    const imports = [...src.matchAll(/^\s*import\s.+$/gm)].map((m) => m[0]);
    expect(imports).toEqual([]);
  });
});
