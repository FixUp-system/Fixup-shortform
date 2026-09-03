// 옵션 세 축 — 화면이 그리는 목록이자 라우트가 검증하는 닫힌 목록이다.
// 두 벌이 되면 화면에는 있는데 서버가 거절하는 값이 생긴다(aspects.js 가 같은 이유로 표다).
import { describe, it, expect } from "vitest";
import {
  AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES,
  DEFAULT_AD_OPTIONS, normalizeAdOptions,
} from "../lib/ad/options.js";
import { STYLE_PRESETS } from "../lib/styles.js";
import { readFileSync } from "node:fs";

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

  // ★ 정지 이미지 쪽(tests/styles.test.js)에는 겹침 가드가 있는데 영상 쪽에는 없었다 —
  //   그래서 AD_STYLE_LINES.cinema 가 photo 줄의 "shallow" 를 그대로 쓰고 있었고,
  //   주석·보고서는 "안 겹치게 썼다"고 말하고 있었다. **눈이 판정하면 이렇게 된다.**
  //
  //   축은 styles.js 쪽과 같다: 실사 촬영 계열 셋(photo·film·cinema)만 pairwise 로 금지한다.
  //   셋 다 "진짜 장면을 카메라로 찍은 영상"이라 구별이 문구에만 있다. studio 는 실사지만
  //   찍는 대상이 다르고(배경 없는 제품컷), 비실사는 매체부터 갈리므로 뺀다.
  const AD_LIVE_CAPTURE = ["photo", "film", "cinema", "vlog"];

  it("영상 문구도 실사 촬영 계열끼리 낱말을 안 나눈다", () => {
    const words = (s) => new Set(
      // 하이픈도 낱말 경계다 — "film-look" 을 통짜로 두면 같은 뜻을 하이픈으로 피해 갈 수 있다
      String(s).toLowerCase().match(/[a-z]+/g)
        .filter((w) => ![
          "a", "an", "and", "the", "with", "of", "in", "on",
          // 여덟 줄이 전부 **영상**이라 매체 일반명사는 구별 정보가 0 이다.
          // (styles.js 쪽에서 "still" 이 그렇듯, 여기서는 이것이 그 자리다)
          "footage",
        ].includes(w))
    );
    for (let i = 0; i < AD_LIVE_CAPTURE.length; i++) {
      for (let j = i + 1; j < AD_LIVE_CAPTURE.length; j++) {
        const a = words(AD_STYLE_LINES[AD_LIVE_CAPTURE[i]]);
        const b = words(AD_STYLE_LINES[AD_LIVE_CAPTURE[j]]);
        const shared = [...a].filter((w) => b.has(w));
        expect(shared, `${AD_LIVE_CAPTURE[i]} 와 ${AD_LIVE_CAPTURE[j]} 가 낱말을 나눈다: ${shared.join(", ")}`)
          .toEqual([]);
      }
    }
  });

  // styles.js 가 실사 프리셋을 새로 들이면 여기 축도 같이 늘어야 한다 — 안 그러면
  // 새 칩이 조용히 가드 밖에 남는다(정지 이미지 쪽과 짝이 되는 단정이다).
  it("영상 축이 styles.js 의 실사 분류와 어긋나지 않는다", () => {
    for (const id of AD_LIVE_CAPTURE) {
      expect(STYLE_PRESETS.find((s) => s.id === id)?.realistic, `${id} 가 실사가 아니다`).toBe(true);
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

  it("★ 프로토타입 키도 모르는 값이다 — 대괄호 접근의 구멍", () => {
    // style 은 Object.keys 로만 검증해야 한다. AD_STYLE_LINES[style] 로 검사하면
    // Object.prototype 의 멤버(constructor, toString 등)가 truthy 여서 통과해 버린다.
    // 그 값이 저장되면 뒤에서 AD_STYLE_LINES["constructor"] 가 함수를 주고, 프롬프트에 붙으면 터진다.
    for (const bad of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(() => normalizeAdOptions({ style: bad })).toThrow();
    }
  });

  it("세 축도 프로토타입 키를 안 통과시킨다 — 회귀 방지", () => {
    // format, mood, narration_lang 은 list.some() 로 검사해서 이미 안전하다.
    // 회귀 방지로 확인한다.
    for (const bad of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(() => normalizeAdOptions({ format: bad })).toThrow();
      expect(() => normalizeAdOptions({ mood: bad })).toThrow();
      expect(() => normalizeAdOptions({ narration_lang: bad })).toThrow();
    }
  });

  it("import 문이 없다", async () => {
    const { readFile } = await import("fs/promises");
    const src = await readFile(new URL("../lib/ad/options.js", import.meta.url), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});


// ── 흐름은 갈리지 않는다 — 화풍 줄은 한 벌이다 ──────────────────────────────
//
// ★★★ 2026-09-03 하루에 두 번 뒤집힌 자리다. 판을 남겨 두는 이유는 **되돌린 사실 자체**를
//   지키기 위해서다 — 다시 가르려면 근거가 새로 있어야 한다.
//
//   ① `hyper-realistic detail` 이 초상 거절의 원인이라 보고 단계별에서만 뺐다.
//   ② **실측으로 반증**: 완전히 빼고 같은 판으로 다시 구웠는데 똑같이 422($0).
//      거절 위치가 `body.image_urls` 라 처음부터 글이 아니라 그림을 가리키고 있었다.
//   ③ 판에 흰 격자를 덧그리는 방법이 통했다(6×6·굵기12·불투명100% + 억제 힌트).
//      4초 480p·15초 720p 두 번 다 통과, 출력물에 격자 흔적 0.
//   ④ 뺄 이유가 사라져 **사장님 지시로 되돌렸다** — 세 흐름이 같은 표를 쓴다.
describe("화풍 줄 — 흐름이 갈리지 않는다", () => {
  const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

  it("★★ 실사 줄에 그 낱말이 있다 — 되돌린 상태다", () => {
    expect(AD_STYLE_LINES.photo).toMatch(/hyper-realistic detail/);
  });

  it("★★★ 세 흐름이 **같은 표**를 읽는다 — 한 곳만 갈면 화풍이 조용히 어긋난다", () => {
    for (const p of ["lib/reel/scenario.js", "lib/reel/panels.js", "lib/ad/scenario.js", "lib/film/scenario.js"]) {
      const src = strip(readFileSync(p, "utf8"));
      expect(src, `${p} 가 표를 안 읽는다`).toMatch(/AD_STYLE_LINES\[/);
    }
  });
});
