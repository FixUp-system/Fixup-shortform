// 광고 지문에서 **그림 단계 전용 규칙을 걷어낸 것**과 **사람 칸(cast)을 더한 것**을 잠근다.
//
// 왜 테스트가 필요한가: 이 저장소에서 판정하는 것은 테스트뿐이다(린터·타입체커가 없다).
// 그리고 이 변경은 "지문이 짧아졌다"가 눈으로 안 보이는 종류다 — film 쪽이 조용히 같이
// 짧아지면 그림 단계가 무엇을 그릴지 모른 채 돌아간다.
import { describe, it, expect } from "vitest";
import { buildScenarioMessages, validateScenario } from "../lib/ad/scenario.js";
import { SCENARIO_SCHEMA, scenarioSchemaFor } from "../lib/ad/llm.js";
import { withSpokenLines } from "../lib/ad/generate.js";
import { AD_FORMATS } from "../lib/ad/options.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0-fast",
};
const build = (kind, material = { text: "소재", photos: [] }) =>
  buildScenarioMessages({ kind, settings, material });

describe("광고 지문에서 그림 단계 전용 규칙을 걷어낸다", () => {
  // ★ 광고 굽기는 scenario.text 하나만 fal 에 넘긴다(lib/ad/generate.js). shows·avatar_id 는
  //   lib/film/mode.js 의 imagePlanFor 가 읽는 값이고 광고 화면도 안 그린다 —
  //   그런데 지문은 그 둘을 잘 쓰라고 1,289자를 들이고 있었다.
  it("kind:'ad' 지문에는 shows·avatar_id·transition 이 한 번도 안 나온다", () => {
    const { system } = build("ad");
    expect(system).not.toContain("shows");
    expect(system).not.toContain("avatar_id");
    expect(system).not.toContain("transition");
  });

  it("★ film 지문은 그대로다 — 광고만 걷어낸 것이지 둘 다가 아니다", () => {
    const { system } = build("film");
    expect(system).toContain("shows 는 정지 화면이다");
    expect(system).toContain("avatar_id");
    expect(system).toContain("transition");
  });

  it("광고 지문이 film 지문보다 실제로 짧다", () => {
    expect(build("ad").system.length).toBeLessThan(build("film").system.length);
  });

  // ★ 모르는 kind 는 **그림이 있는 쪽**으로 떨어진다. 반대로 두면 새 경로가 생겼을 때
  //   그림 단계가 조용히 재료를 잃는다(값은 이미 치른 뒤에).
  it("모르는 kind 는 예전(그림 있는 쪽) 지문을 받는다", () => {
    expect(build(undefined).system).toContain("avatar_id");
    expect(build("something-new").system).toContain("avatar_id");
  });
});

describe("스키마도 같은 갈래를 본다", () => {
  // ★★ 지문과 스키마가 갈리면 최악이다: 지문은 안 시키는데 스키마가 required 로 강제하면
  //   모델이 무엇을 적어야 할지 모른 채 칸을 지어내 채운다.
  it("광고 스키마의 장면에는 셋이 없다", () => {
    const shot = scenarioSchemaFor("ad").properties.shots.items;
    for (const f of ["shows", "avatar_id", "transition"]) {
      expect(shot.properties).not.toHaveProperty(f);
      expect(shot.required).not.toContain(f);
    }
  });

  it("★ film 스키마는 손대지 않은 그것 그대로다", () => {
    expect(scenarioSchemaFor("film")).toBe(SCENARIO_SCHEMA);
    expect(scenarioSchemaFor(undefined)).toBe(SCENARIO_SCHEMA);
  });

  it("걷어낸 것 말고는 광고도 그대로다 — 대사·화자·초는 남는다", () => {
    const shot = scenarioSchemaFor("ad").properties.shots.items;
    for (const f of ["beat", "camera", "lighting", "action", "sound", "seconds"]) {
      expect(shot.required).toContain(f);
    }
    expect(shot.properties).toHaveProperty("line");
    expect(shot.properties).toHaveProperty("say_as");
    expect(shot.required).toContain("speaker");
  });

  it("원본 스키마를 망가뜨리지 않는다 — 광고 스키마를 만들어도 SCENARIO_SCHEMA 는 그대로", () => {
    scenarioSchemaFor("ad");
    expect(SCENARIO_SCHEMA.properties.shots.items.properties).toHaveProperty("shows");
    expect(SCENARIO_SCHEMA.properties.shots.items.required).toContain("avatar_id");
  });
});

describe("사람 칸(cast) — 옷 칸이 사람까지 떠맡던 것", () => {
  // ★ 실측 2026-08-21(3/3 재현): cast 가 없을 때 wardrobe 가 "the climber…; the instructor…"
  //   로 두 사람을 한 칸에 우겨 넣었고, 그 값이 "the person wears ___" 틀에 들어가
  //   말이 안 되는 영어로 fal 에 나갔다.
  it("두 경로 다 cast 를 묻는다 — 사람은 그림 유무와 무관하다", () => {
    expect(build("ad").system).toContain("(cast)");
    expect(build("film").system).toContain("(cast)");
  });

  it("옷 칸에는 옷만 적으라고 못 박는다 — 두 칸이 같은 것을 말하면 갈린다", () => {
    expect(build("ad").system).toContain("**옷만 적는다**");
  });

  it("validateScenario 가 cast 를 실어 나른다", () => {
    const out = validateScenario(
      { text: "t", shots: [{ beat: "b" }], cast: "  a woman in her thirties  " },
      0
    );
    expect(out.cast).toBe("a woman in her thirties");
  });

  it("cast 가 없으면 빈 문자열 — 옛 문서가 예전처럼 흐른다", () => {
    expect(validateScenario({ text: "t", shots: [{ beat: "b" }] }, 0).cast).toBe("");
  });

  it("굽기 지시문에 사람 절이 붙는다 — 옷차림 절과 따로", () => {
    const prompt = withSpokenLines("base", [], "", {
      cast: "a woman in her early twenties, long dark hair, slim build",
      wardrobe: "a coral tank top and black leggings",
    });
    expect(prompt).toContain("The person, keep identical throughout: a woman in her early twenties");
    expect(prompt).toContain("the person wears a coral tank top");
  });

  it("★ cast 가 비면 그 줄이 통째로 없다 — 옛 문서의 지시문이 글자 그대로다", () => {
    expect(withSpokenLines("base", [], "", { wardrobe: "x" })).not.toContain("The person, keep identical");
    expect(withSpokenLines("base", [], "", {})).toBe("base");
  });
});

describe("사진이 인물 사진이면 그것을 알려 준다", () => {
  // ★ lib/vlm.js 는 person·who 를 이미 판정하는데 지문에는 lettering·what·scale 셋만
  //   싣고 있었다 — 판정해 놓고 절반을 안 쓰던 자리다.
  const withPhoto = (vision) =>
    build("ad", { text: "소재", photos: [{ url: "/api/uploads/a.jpg", vision }] }).messages[0].content;

  it("인물 사진이면 '인물 사진이다'와 누구인지가 실린다", () => {
    const user = withPhoto({ person: true, who: "20대 여성", what: "웃고 있는 사람" });
    expect(user).toContain("**인물 사진**");
    expect(user).toContain("20대 여성");
  });

  it("사물 사진이면 그 줄이 없다", () => {
    expect(withPhoto({ person: false, who: null, what: "분홍 키링" })).not.toContain("**인물 사진**");
  });

  it("★ 사람이라고 판정됐어도 who 가 비면 안 싣는다 — 빈 괄호를 만들지 않는다", () => {
    expect(withPhoto({ person: true, who: "", what: "사람" })).not.toContain("**인물 사진**");
  });

  it("사진이 없으면 지문이 예전과 글자 그대로다", () => {
    expect(build("ad").messages[0].content).not.toContain("**인물 사진**");
  });
});

describe("컨셉(포맷) 정의가 지문과 싸우지 않는다", () => {
  // ★ 다섯 중 넷이 지문이 명시로 금지한 것을 요구하고 있었다(컷·손·전환·로고).
  //   실측: story("설명하지 않는다")로 7회 주문했는데 7회 전부 설명 나레이션이 나왔다 —
  //   모델이 둘 중 하나를 버려야 했기 때문이다.
  const beats = AD_FORMATS.map((f) => f.beat).join("\n");

  it("컷 편집을 요구하지 않는다 — 편집 단계가 없다", () => {
    expect(beats).not.toContain("컷");
  });

  it("로고·엔딩 카드를 요구하지 않는다 — 글자는 우리가 나중에 태운다", () => {
    expect(beats).not.toContain("로고");
  });

  it("전환을 지시하지 않는다 — 이음은 모델이 만든다", () => {
    expect(beats).not.toContain("전환");
  });

  it("손 클로즈업을 요구하지 않는다 — 그 요구가 손 셋을 만들었다", () => {
    expect(beats).not.toContain("손이");
    expect(beats).not.toContain("손과");
  });

  it("다섯 개가 그대로 있고 id 도 안 바뀐다 — 저장된 프로젝트가 그 값을 들고 있다", () => {
    expect(AD_FORMATS.map((f) => f.id)).toEqual([
      "hero", "unboxing", "before_after", "story", "testimonial",
    ]);
    for (const f of AD_FORMATS) expect(f.beat.length).toBeGreaterThan(10);
  });
});

// (옛 "시나리오 확인 화면이 전역 값을 보여 준다" 묶음은 2026-08-21 에 옮겼다 —
//  tests/ad-scenario-globals.test.js 가 같은 것을 더 정확히 잰다: 화면이 그리는 칸 목록을
//  서버의 EDITABLE_GLOBAL_FIELDS 와 **대조**하므로 둘이 갈리는 것까지 잡는다.)

describe("★ user 메시지에도 광고에 없는 칸이 안 나온다", () => {
  // SYSTEM 만 검사하면 못 잡는다 — 사진 안내는 user 메시지에 실린다.
  // 실제로 `look 과 shows 에서는…` 한 줄이 광고 지문에도 그대로 나가고 있었다.
  const withPhoto = (kind) =>
    buildScenarioMessages({
      kind, settings, material: { text: "소재", photos: [{ url: "/a.jpg" }] },
    }).messages[0].content;

  it("광고 지문(user)에 shows 가 없다", () => {
    expect(withPhoto("ad")).not.toContain("shows");
  });

  it("film 지문(user)에는 그대로 있다 — 그쪽은 그 칸으로 그림을 만든다", () => {
    expect(withPhoto("film")).toContain("shows");
  });
});

describe("화질이 지문에 실린다", () => {
  const build = (resolution) =>
    buildScenarioMessages({
      kind: "ad", settings: { ...settings, resolution }, material: { text: "소재", photos: [] },
    }).messages[0].content;

  it("고른 화질이 값 그대로 실린다 — 두 표기 다", () => {
    expect(build("1080p")).toContain("화질: 1080p");
    expect(build("4K")).toContain("화질: 4K");
  });

  // ★ 480p 에서 "실오라기가 보이는 매크로"를 요구하면 뭉개진 화면이 되고, 그 요구를
  //   쓰느라 쓴 자리는 그대로 낭비다.
  it("낮은 화질에만 주의가 붙는다 — 두 표기 다", () => {
    for (const low of ["480p", "480P"]) expect(build(low)).toContain("화질이 낮다");
    for (const ok of ["720p", "1080p", "2K", "4K"]) expect(build(ok)).not.toContain("화질이 낮다");
  });

  it("★ 화질이 없는 옛 문서는 지문이 글자 그대로 예전과 같다", () => {
    expect(build(undefined)).not.toContain("화질:");
    expect(build(undefined)).not.toContain("화질이 낮다");
  });
});
