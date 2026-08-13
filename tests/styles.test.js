import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STYLE_PRESETS, DEFAULT_STYLE_ID, STYLE_NOTE_MAX,
  styleFor, activeStyle, styleKey, normalizeStyle, refHintFor,
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

  it("실사 밖의 컨셉들이 있고 서로 다른 문구를 쓴다", () => {
    for (const id of ["illust", "anime", "scifi", "studio", "render3d", "film"]) {
      expect(STYLE_PRESETS.some((s) => s.id === id), `${id} 프리셋이 없다`).toBe(true);
    }
    const mediums = STYLE_PRESETS.map((s) => s.medium);
    expect(new Set(mediums).size).toBe(mediums.length);
  });

  // ★ 시네마는 실사 셋 중 셋째다. photo(조명) · film(필름 질감) 과 **같은 매체**라
  //   구별 축이 문구에만 있다 — 낱말이 겹치는 순간 사장님이 고른 것과 나온 것이 같아지고
  //   칩 하나가 헛돈다(film 프리셋에 적어 둔 위험이 그대로 여기 온다).
  //   그래서 "겹치는 낱말이 없다"를 눈이 아니라 **코드가 판정한다.**
  it("시네마 프리셋이 있고 렌즈·카메라 축이다", () => {
    const cinema = STYLE_PRESETS.find((s) => s.id === "cinema");
    expect(cinema, "cinema 프리셋이 없다").toBeTruthy();
    expect(cinema.realistic).toBe(true);
  });

  // ★ 어디까지 겹침을 금지하는가 — 축을 여기서 못 박는다.
  //
  //   "전 프리셋 대 전 프리셋 무조건 금지"로 재면 안 된다. 그렇게 재면 anime 의
  //   "detailed painted background" 와 cinema 의 "melted background", studio 의
  //   "crisp focus on the subject" 같은 **정당한 낱말**까지 잡힌다 — 그 둘은 매체가 달라
  //   그림만 봐도 갈리므로 낱말이 같아도 두 칩이 같은 말을 하지 않는다.
  //
  //   진짜 위험은 **같은 것을 같은 매체로 찍었는데 문구로만 갈리는** 경우다. 그것이
  //   실사 촬영 계열 셋(photo·film·cinema)이다 — 셋 다 "진짜 장면을 카메라로 찍은 사진"이라
  //   구별 축이 오직 finish 문구에만 있다. 그래서 **이 셋끼리만 pairwise 로 금지**한다.
  //
  //   studio 는 realistic 이지만 여기서 뺀다: 같은 사진이어도 **찍는 대상이 다르다**
  //   (배경 없는 제품컷). 그래서 photo 와 "lighting" 을 나눠 써도 화면이 헷갈리지 않는다.
  const LIVE_CAPTURE = ["photo", "film", "cinema"];   // 같은 장면·같은 매체 — 문구로만 갈린다
  const NOT_LIVE_CAPTURE = ["studio"];                // 실사지만 찍는 대상이 다르다

  const finishWords = (s) => new Set(
    // ⚠️ 하이픈도 낱말 경계다. `[a-z][a-z-]*` 로 재면 "shallow-focus" 가 "shallow" 와
    //    다른 낱말이 되어, 같은 뜻을 하이픈으로 이어 붙이는 것만으로 판정이 통째로 뚫린다
    //    (리뷰 실증: cinema.finish 에 "film-grain" 을 박아도 전부 통과했다).
    String(s).toLowerCase().match(/[a-z]+/g)
      // 뜻이 없는 이음말은 구별 축이 아니다
      .filter((w) => !["a", "an", "and", "the", "with", "of", "in", "on"].includes(w))
  );

  it("실사 촬영 계열은 마감 낱말을 서로 하나도 안 나눈다", () => {
    for (let i = 0; i < LIVE_CAPTURE.length; i++) {
      for (let j = i + 1; j < LIVE_CAPTURE.length; j++) {
        const a = finishWords(STYLE_PRESETS.find((s) => s.id === LIVE_CAPTURE[i]).finish);
        const b = finishWords(STYLE_PRESETS.find((s) => s.id === LIVE_CAPTURE[j]).finish);
        const shared = [...a].filter((w) => b.has(w));
        expect(shared, `${LIVE_CAPTURE[i]} 와 ${LIVE_CAPTURE[j]} 가 낱말을 나눈다: ${shared.join(", ")}`)
          .toEqual([]);
      }
    }
  });

  // 실사 프리셋이 새로 생기면 **분류를 강제한다.** 안 그러면 다음 사람이 넷째 실사 칩을
  // 넣어도 가드가 조용히 그 칩을 안 보고 지나간다(지금 구멍이 그렇게 생겼다).
  it("모든 실사 프리셋이 둘 중 한 칸에 분류돼 있다", () => {
    for (const s of STYLE_PRESETS.filter((s) => s.realistic)) {
      expect(
        LIVE_CAPTURE.includes(s.id) || NOT_LIVE_CAPTURE.includes(s.id),
        `실사 프리셋 ${s.id} 를 분류하지 않았다 — 촬영 계열이면 LIVE_CAPTURE 에 넣어 겹침을 금지하고, 아니면 NOT_LIVE_CAPTURE 에 넣고 왜인지 적어라`
      ).toBe(true);
    }
  });

  // ★ "얕은 심도"는 render3d 의 변별 자질이다. cinema 가 같은 뜻을 다시 말하면
  //   (하이픈으로 적든 아니든) 두 칩이 같은 말을 한다 — cinema 는 "melted background" 로
  //   결과만 말하고 심도 낱말은 안 쓴다.
  it("시네마는 심도 낱말을 쓰지 않는다 — render3d 와 뜻이 겹치지 않게", () => {
    const cinema = finishWords(STYLE_PRESETS.find((s) => s.id === "cinema").finish);
    for (const w of ["shallow", "depth", "field", "defocus", "defocused"]) {
      expect(cinema.has(w), `cinema 가 심도 낱말 "${w}" 를 쓴다`).toBe(false);
    }
  });

  // ⚠️ 글자는 ffmpeg 가 태운다. 모델은 한글을 틀리게 쓴다("핑계다"→"핑게다" 실측).
  //    프롬프트가 글자를 **요구하면** 안 된다 — 못 그리는 것은 애초에 시키지 않는다.
  it("어떤 프리셋도 글자·자막을 요구하지 않는다", () => {
    // ⚠️ 부분일치로 재면 안 된다 — illust 의 "textured paper feel"(질감)이 "text" 에 걸린다.
    //    금지 대상은 **낱말**이다.
    const BANNED = /^(text|texts|letter|letters|lettering|typograph\w*|caption|captions|subtitle|subtitles|title|titles|font|fonts|signage|logo|logos)$/;
    for (const s of STYLE_PRESETS) {
      for (const w of `${s.medium} ${s.finish}`.toLowerCase().match(/[a-z][a-z-]*/g)) {
        expect(BANNED.test(w), `${s.id} 가 "${w}" 를 요구한다`).toBe(false);
      }
    }
  });

  // 화면 비율은 lib/aspects.js 가 정하는 **별개 축**이다. 프롬프트에 숫자 비율을 박으면
  // 두 벌이 되어 갈린다 — buildImagePrompt 가 이미 `${orient} composition` 을 붙인다.
  it("어떤 프리셋도 화면 비율을 박지 않는다", () => {
    for (const s of STYLE_PRESETS) {
      const t = `${s.medium} ${s.finish}`;
      expect(/\d+(\.\d+)?\s*:\s*\d+/.test(t), `${s.id} 에 숫자 비율이 있다`).toBe(false);
    }
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

  it("새 프리셋도 각인된다 — 시네마로 바꾸면 그림이 낡는다", () => {
    expect(styleKey({ settings: { style: { preset: "cinema", note: "" } } })).toBe("cinema|");
    expect(styleKey({ settings: { style: { preset: "cinema" } } }))
      .not.toBe(styleKey({ settings: { style: { preset: "photo" } } }));
  });

  it("화풍이 없는 프로젝트도 같은 키를 낸다 — 되물어도 답이 같다", () => {
    expect(styleKey({})).toBe(styleKey({ settings: {} }));
    expect(styleKey({})).toBe(styleKey({ settings: { style: { preset: "photo" } } }));
  });
});

describe("normalizeStyle — 저장 전 게이트", () => {
  it("목록 안의 프리셋을 통과시킨다", () => {
    expect(normalizeStyle({ preset: "scifi" })).toEqual({ preset: "scifi", note: "" });
    expect(normalizeStyle({ preset: "cinema" })).toEqual({ preset: "cinema", note: "" });
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

describe("레퍼런스 지시가 화풍마다 다르다", () => {
  // ★ "첨부와 똑같이 그려라"는 실사에서 맞는 말이지만 애니·일러스트와 정면으로 부딪친다.
  //   비실사에서는 복사가 아니라 재해석이어야 한다 — 형태·배색은 가져오고 화풍으로 다시 그린다.
  it("실사 계열은 똑같이 그리라고 한다", () => {
    for (const id of ["photo", "studio", "film", "cinema"]) {
      expect(styleFor(id).realistic, id).toBe(true);
    }
  });

  it("비실사는 다시 그리라고 한다", () => {
    for (const id of ["illust", "anime", "render3d", "scifi"]) {
      expect(styleFor(id).realistic, id).toBe(false);
    }
  });

  it("제품·인물 문구를 화풍에 맞춰 돌려준다", () => {
    expect(refHintFor(styleFor("photo"), "thing")).toContain("exactly");
    expect(refHintFor(styleFor("anime"), "thing")).toContain("redraw");
    expect(refHintFor(styleFor("photo"), "person")).toContain("same person");
    expect(refHintFor(styleFor("anime"), "person")).toContain("redraw");
    // 비실사에서 "사진을 붙이지 말라"를 못 박아야 반쯤 사진인 그림을 막는다
    expect(refHintFor(styleFor("illust"), "thing")).toContain("do not paste");
  });
});
