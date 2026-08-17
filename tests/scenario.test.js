import { describe, it, expect } from "vitest";
import { buildScenarioMessages, validateScenario, fakeScenario } from "../lib/scenario.js";
import { checkScenario } from "../lib/scenario-rules.js";

const project = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  settings: { i2v_model: "seedance-2.0", target_seconds: 30, aspect_ratio: "9:16" },
  material: { text: "동네 베이커리를 소개하는 영상을 만들고 싶어요. 새벽 4시부터 굽습니다.", photos: [] },
};

describe("buildScenarioMessages", () => {
  it("사장님 설명을 그대로 싣는다", () => {
    const m = buildScenarioMessages(project);
    expect(m.messages[0].content).toContain("새벽 4시부터 굽습니다");
  });

  it("★ 길이·화면비·모델 하한을 사실로 알려 준다", () => {
    const m = buildScenarioMessages(project);
    const all = m.system + m.messages[0].content;
    expect(all).toContain("30");      // 목표 길이
    expect(all).toContain("9:16");    // 화면비
    expect(all).toContain("하한 4초"); // Seedance 하한
  });

  // ★ 광고 지문은 "컷 편집을 지시하지 마라"였다. 여기서는 정확히 뒤집힌다.
  it("★ 장면을 나누라고 요구한다 — 광고 지문과 반대다", () => {
    const m = buildScenarioMessages(project);
    expect(m.system).toMatch(/장면.*나눈다|장면으로 나눈/);
    expect(m.system).not.toContain("컷 편집을 지시하지 마라");
  });

  it("★ 되묻지 말라고 못박는다", () => {
    expect(buildScenarioMessages(project).system).toContain("되묻지");
  });

  it("★ 글자를 화면에 넣으라고 요구하지 말라고 못박는다", () => {
    expect(buildScenarioMessages(project).system).toContain("글자");
  });

  // 화면 설계가 2패스에서 답한다 — 시나리오가 미리 답하면 두 벌이 된다
  it("★ 카메라·조명을 시나리오에서 묻지 않는다", () => {
    const s = buildScenarioMessages(project).system;
    expect(s).not.toContain('"camera"');
    expect(s).not.toContain('"lighting"');
  });
});

// ★★ 2026-08-17 언어 정책 — **이미지·영상 모델이 읽는 말은 영어, 사장님과 다음 단계 LLM 이
//    읽는 말은 한국어다.** 번역 단계를 새로 두지 않고 지문 하나로 가른다.
//
// ★ 지시와 **예시**를 따로 재는 이유: 프롬프트 안의 예시 값이 출력 언어를 정하는 가장 강한
//   신호다. "영어로 써라" 옆에 한국어 예시가 남아 있으면 모델은 예시를 따르고, 그러면 지시와
//   예시가 서로 싸운다. 그래서 예시의 언어를 따로 못 박는다.
const HANGUL = /[가-힣]/;

// ★★ 이 그물을 **창(`{0,N}`)으로 짜면 아무것도 안 잰다.** 실제로 그랬다(2026-08-17 변이 실험):
//
//   `/"line"[\s\S]{0,200}한국어/` 는 `line` 칸이 영어로 뒤집혀도 초록이었다 — 12자 뒤
//   **이웃 칸**인 `"speaker": "… (한국어, …)"` 에 맞기 때문이다. `{0,400}` 짜리는 더 넓어서
//   `focus.subject`·`look` 을 한국어로 되돌려도 옆줄 `narrator_voice` 의 "영어로"에 맞았다.
//   창은 이웃 칸을 덮으니 "**어느 칸이** 무슨 말인가"를 원리적으로 못 가른다.
//
//   그래서 아래는 칸 하나를 **잘라 내서** 잰다:
//   - 스키마는 `"칸": "설명"` 의 설명 하나만 뽑는다(값에 따옴표가 없어 그 칸에서 끊긴다)
//   - 규칙은 `- ` 로 시작하는 줄 하나 + 딸린 이어짐만 뽑고, 언어 낱말은 **한 문장 안**
//     (마침표·줄바꿈을 넘지 않고)에서 칸 이름 **바로 뒤**의 것만 읽는다
//
// ★ 규칙 줄과 스키마 줄을 **따로** 잰다(cast.test.js 가 먼저 쓴 방식). 한 덩어리로 재면
//   규칙의 언어 블록을 8줄 통째로 지워도 스키마 줄에 맞아 초록이다 — 그것도 겪었다.
//   규칙에서 사라지면 "왜 이 칸이 그 말인가"가 지문에서 사라진다.

// 칸별 언어. 값이 왜 그 말인지는 lib/scenario.js 상단 주석과 같다.
const LANG = {
  // 영어 — 그림·영상 모델에 그대로 실린다(lib/cuts.js subjectOf · speechFor)
  subject: "영어",
  look: "영어",
  narrator_voice: "영어",
  // music — 영상 하나에 하나인 배경음악(2026-08-18). 전 컷 클립 프롬프트에 같은 글자로
  // 실리므로(lib/cuts.js clipContextClause) narrator_voice 와 같은 대우다.
  music: "영어",
  // 한국어 — 사장님이 읽고 고치고, 다음 단계 LLM 도 한국어로 읽는다.
  // speaker 는 "내레이션"이라는 **그 낱말**이 판정에 쓰인다(isNarrationSpeaker)
  topic: "한국어",
  angle: "한국어",
  beat: "한국어",
  speaker: "한국어",
  // 대사만은 영상 모델이 읽는데도 한국어다 — 그 글자가 **그대로 자막이 된다**
  // (lib/subtitles.js 가 ffmpeg 로 태운다). 영어가 되면 사장님 영상에 영어 자막이 박힌다
  line: "한국어",
};
const OPPOSITE = { 영어: "한국어", 한국어: "영어" };
const ENGLISH_FIELDS = Object.keys(LANG).filter((f) => LANG[f] === "영어");

// 스키마의 한 칸 설명만 떼어 온다 — 이웃 칸으로 넘어가지 않는다.
function schemaField(system, name) {
  const at = system.indexOf("JSON 으로만 답한다:");
  expect(at, "JSON 스키마 블록이 사라졌다").toBeGreaterThan(-1);
  const m = system.slice(at).match(new RegExp(`"${name}":\\s*"([^"]*)"`));
  expect(m, `스키마에 "${name}" 칸이 없다`).toBeTruthy();
  return m[1];
}

// 규칙 목록을 블록으로 자른다 — 규칙은 `- ` 로 시작하고 들여쓴 줄이 그 뒤에 딸린다.
// (스키마 줄도 들여쓰여 있지만 그 앞의 안 들여쓴 줄에서 블록이 닫히므로 섞이지 않는다)
function ruleBlocks(system) {
  const blocks = [];
  let cur = null;
  for (const l of system.split("\n")) {
    if (l.startsWith("- ")) blocks.push((cur = [l]));
    else if (cur && l.startsWith("  ")) cur.push(l);
    else cur = null;
  }
  return blocks.map((b) => b.join("\n"));
}

// 칸 이름 **바로 뒤**(같은 문장 안)의 언어 낱말. 게으른 창인 이유: 욕심쟁이면
// `subject 는 한국어로, narrator_voice 는 영어로` 에서 subject 가 뒤쪽 "영어"에 맞아
// 되돌린 칸이 그대로 초록이 된다. 마침표·줄바꿈을 넘지 않는 이유도 같다 — 넘으면
// 이웃 문장·이웃 칸의 언어 낱말을 읽는다.
function declarations(system, field) {
  const re = new RegExp(`${field}[^.\\n]{0,40}?(영어|한국어)`, "g");
  return ruleBlocks(system).flatMap((b) =>
    [...b.matchAll(re)].map((m) => ({ block: b, lang: m[1] })));
}

// 블록 안의 예시 값. `e.g.`/`예:` 같은 **표시로 가르지 않는다** — 되돌리는 사람이 표시까지
// 함께 바꾸는 것은 자연스러운 편집이고, 그러면 되돌린 칸이 그물에서 사라진다(다른 블록에
// 남은 `e.g.` 하나가 "영어 예시가 있다"를 계속 만족시켰다). 값 자체의 한글 유무로 잰다.
function quotedExamples(block) {
  return [...block.matchAll(/"([^"]{2,})"/g)].map((m) => m[1]);
}

describe("SYSTEM — 칸마다 언어를 못 박는다", () => {
  const system = () => buildScenarioMessages(project).system;

  // 양방향이다: 영어여야 할 칸이 한국어라고 적혀도, 한국어여야 할 칸이 영어라고 적혀도 빨강.
  it.each(Object.entries(LANG))('★ 스키마의 "%s" 칸이 %s 를 못 박는다', (field, want) => {
    const desc = schemaField(system(), field);
    expect(desc, `"${field}" 칸에 ${want} 표시가 없다: ${desc}`).toContain(want);
    expect(desc, `"${field}" 칸이 ${OPPOSITE[want]} 라고 말한다: ${desc}`)
      .not.toContain(OPPOSITE[want]);
  });

  // 스키마에만 적혀 있으면 안 된다 — 규칙에서 사라지면 이유가 사라지고, 규칙만 읽고
  // 채우는 모델은 언어를 모른 채 답한다.
  it.each(Object.entries(LANG))("★ 규칙 줄도 %s 의 언어(%s)를 말한다", (field, want) => {
    const found = declarations(system(), field);
    expect(found.length, `규칙 목록에 ${field} 의 언어를 말하는 줄이 없다`).toBeGreaterThan(0);
    for (const { lang, block } of found) {
      expect(lang, `${field} 를 ${lang} 로 쓰라고 적혀 있다:\n${block}`).toBe(want);
    }
  });

  // ★ 대사가 왜 한국어인지를 **그 칸 안쪽**에 적어 둔다. 파일 어디에나 있는 `/자막/` 로
  //   재면 안 된다 — 옛 그물이 무관한 줄("자막·로고는 우리가 나중에 따로 붙인다")에 맞아,
  //   line 칸을 통째로 영어로 뒤집어도 초록이었다.
  it("★ 대사가 왜 한국어인지(자막)를 대사 칸 안쪽에 적는다", () => {
    const s = system();
    expect(schemaField(s, "line"), "스키마의 line 칸이 이유(자막)를 말하지 않는다")
      .toMatch(/자막/);
    const rule = declarations(s, "line").map((d) => d.block).join("\n");
    expect(rule, "대사 규칙이 이유(자막)를 말하지 않는다").toMatch(/자막/);
  });

  // ★ 언어를 정하는 가장 강한 신호는 지시문이 아니라 예시 값이다. "영어로 써라" 옆에
  //   한국어 예시가 남아 있으면 모델은 예시를 따른다. 그래서 지시와 예시를 따로 잰다.
  //   양쪽을 다 잰다 — 영어 칸 규칙의 예시는 영어, 나머지 규칙의 예시는 한국어다
  //   (한국어 예시가 영문화되는 쪽이 지금까지 통째로 빠져 있었다).
  it("★ 예시가 언어를 정한다 — 영어 칸 규칙은 영어 예시, 나머지는 한국어 예시다", () => {
    const english = [];
    const korean = [];
    for (const b of ruleBlocks(system())) {
      const bucket = ENGLISH_FIELDS.some((f) => b.includes(f)) ? english : korean;
      bucket.push(...quotedExamples(b));
    }

    expect(english.length, "영어 칸 규칙에 예시가 하나도 없다").toBeGreaterThan(0);
    for (const v of english) {
      expect(v, `영어 칸 규칙의 예시에 한글이 남았다: ${v}`).not.toMatch(HANGUL);
    }

    expect(korean.length, "한국어 칸 규칙의 예시가 사라졌다").toBeGreaterThan(0);
    for (const v of korean) {
      expect(v, `한국어 칸 규칙의 예시가 한글이 아니다: ${v}`).toMatch(HANGUL);
    }
  });

  // ★ 이 지문은 gpt-4o 를 밀어붙이려 쓴 글이었다. 저장소는 claude-opus-5 로 갈아탔고
  //   (lib/llm.js) Opus 5 는 지시를 훨씬 문자 그대로 따른다 — 남은 강조가 과하게 작동한다.
  //   걷어낸 것은 **강조 표시뿐**이고 요구사항은 한 줄도 안 바뀌었다(위 테스트들이 그것을 잰다).
  it("★ gpt-4o 시절의 과한 강조를 걷었다", () => {
    const shouts = system().match(/반드시|절대|무조건/g) || [];
    expect(shouts, `강조가 아직 ${shouts.length}군데다`).toHaveLength(0);
  });
});

// SHOTFORM_FAKE=all 이 받는 답. 규칙을 실제로 통과해야 하고(합·하한·상한·화자),
// 검증기를 통과해 라우트가 저장하는 모양이어야 한다.
describe("fakeScenario — 가짜 모드", () => {
  it("★ checkScenario 를 통과한다", () => {
    const got = validateScenario(fakeScenario(project));
    expect(checkScenario(got, project)).toEqual({ ok: true, problems: [] });
  });

  // ★ 이 값이 **저장까지 살아남는지**(validateScenario → PATCH)를 가짜 관통으로 보려면
  //   값이 있어야 한다. 그 이상은 못 본다 — 가짜 화자가 화면 속 인물이라 내레이션 장면이
  //   없고, 화면의 칸도 숨겨지고 컷도 narration 표시를 안 받아 클립 프롬프트·각인에 안 닿는다.
  it("★ narrator_voice 를 들고 있다", () => {
    expect(validateScenario(fakeScenario(project)).narrator_voice).not.toBe("");
  });
});

describe("validateScenario — 모양만 본다", () => {
  const good = {
    topic: "동네 베이커리 소개",
    focus: { mode: "물건", subject: "갓 구운 식빵", look: "황금빛 겉면" },
    angle: "새벽의 노동을 보여 주고 끝에 갓 나온 빵으로 마무리한다",
    shots: [
      { beat: "새벽 주방에 불이 켜진다", line: "새벽 네 시, 하루가 시작됩니다.", speaker: "40대 남성 제빵사", seconds: 8 },
      { beat: "반죽을 치댄다", line: "", speaker: "", seconds: 7 },
    ],
  };

  it("갖춘 답을 통과시킨다", () => {
    const got = validateScenario(good);
    expect(got.shots).toHaveLength(2);
    expect(got.shots[0].seconds).toBe(8);
    expect(got.angle).toContain("새벽의 노동");
  });

  it("★ seconds 를 숫자로 만든다 — 모델이 문자열로 답한다", () => {
    const got = validateScenario({ ...good, shots: [{ ...good.shots[0], seconds: "8" }] });
    expect(got.shots[0].seconds).toBe(8);
  });

  it("shots 가 없으면 null 이다", () => {
    expect(validateScenario({ ...good, shots: [] })).toBe(null);
    expect(validateScenario({ ...good, shots: "여덟" })).toBe(null);
    expect(validateScenario(null)).toBe(null);
  });

  it("beat 가 빈 shot 은 통째로 버린다 — 무엇을 하는 장면인지 모르면 화면을 못 그린다", () => {
    const got = validateScenario({ ...good, shots: [good.shots[0], { beat: "  ", line: "가", speaker: "나", seconds: 5 }] });
    expect(got.shots).toHaveLength(1);
  });

  // 변이 실험에서 이 자리를 재는 테스트가 없다는 것이 드러나 더한다.
  // 말 없는 장면에 화자만 남으면 checkScenario 가 "대사 없는데 화자가 있다"로 헷갈린다 —
  // 모델은 line 을 비우면서 speaker 를 지우는 것을 자주 잊는다.
  it("★ 대사가 없으면 화자를 지운다", () => {
    const got = validateScenario({
      ...good,
      shots: [{ beat: "카페 문이 열린다", line: "", speaker: "내레이션", seconds: 6 }],
    });
    expect(got.shots[0].speaker).toBe("");
  });

  // ★★ 2026-08-17 — narrator_voice 를 여기서 버리면 화면의 칸이 "고칠 수 있는 척하는 칸"이
  //    된다(라우트의 PATCH 가 이 함수를 통과시킨 값만 저장한다). Task 5 가 네 필드로 겪은 자리다.
  it("★ narrator_voice 를 보존한다", () => {
    const got = validateScenario({ ...good, narrator_voice: "  차분한 30대 남성, 낮고 단단한 톤  " });
    expect(got.narrator_voice).toBe("차분한 30대 남성, 낮고 단단한 톤");
  });

  it("narrator_voice 가 없으면 빈 문자열이다 — 없는 것과 빈 것을 가르지 않는다", () => {
    expect(validateScenario(good).narrator_voice).toBe("");
    expect(validateScenario({ ...good, narrator_voice: 42 }).narrator_voice).toBe("");
  });

  it("모르는 focus.mode 는 focus 를 통째로 비운다", () => {
    const got = validateScenario({ ...good, focus: { mode: "동물", subject: "고양이" } });
    expect(got.focus).toBe(null);
  });

  // ★★ 2026-08-17 언어 정책이 **낡음을 만들지 않는다**는 근거. 정책은 앞으로 LLM 이 낼 값만
  //    바꾸고, 이미 저장된 한국어 값은 그대로 읽혀야 한다 — 검증기가 값의 언어를 보는 순간
  //    옛 프로젝트의 focus 가 통째로 null 이 되고, 그러면 각인이 움직여 값을 치른 그림·클립이
  //    한꺼번에 낡는다. 위 `good` 픽스처의 subject·look·narrator_voice 가 다 한국어인 것도
  //    같은 것을 재고 있다 — 여기서는 그것을 이름으로 못 박는다.
  it("★ 검증기는 값의 언어를 보지 않는다 — 한국어든 영어든 그대로 살아남는다", () => {
    const ko = validateScenario({ ...good, narrator_voice: "차분한 30대 남성" });
    expect(ko.focus).toEqual({ mode: "물건", subject: "갓 구운 식빵", look: "황금빛 겉면" });
    expect(ko.narrator_voice).toBe("차분한 30대 남성");

    const en = validateScenario({
      ...good,
      focus: { mode: "물건", subject: "a freshly baked loaf", look: "golden-brown crust" },
      narrator_voice: "calm man in his 30s, low and steady tone",
    });
    expect(en.focus).toEqual({ mode: "물건", subject: "a freshly baked loaf", look: "golden-brown crust" });
    expect(en.narrator_voice).toBe("calm man in his 30s, low and steady tone");
    // mode 는 갈래 이름이라 영어가 아니다 — FOCUS_MODES 가 한국어 낱말로 판정한다
    expect(en.focus.mode).toBe("물건");
  });
});

// ★ 가짜 모드가 내는 답도 언어 정책을 따라야 한다. 여기가 한국어로 남으면 $0 관통에서
//   눈에 보이는 것이 진짜 모드와 다르고, 그러면 관통이 정책을 한 번도 안 재는 셈이다.
describe("fakeScenario — 언어 정책", () => {
  it("★ 모델이 읽는 칸은 영어, 사장님이 읽는 칸은 한국어다", () => {
    const f = fakeScenario(project);
    expect(f.focus.subject, "모델이 읽는 subject 가 한국어다").not.toMatch(HANGUL);
    expect(f.narrator_voice, "모델이 읽는 narrator_voice 가 한국어다").not.toMatch(HANGUL);
    // 사장님·다음 단계 LLM 이 읽는 칸은 한국어 그대로다
    expect(f.topic).toMatch(HANGUL);
    expect(f.angle).toMatch(HANGUL);
    expect(f.shots[0].beat).toMatch(HANGUL);
    expect(f.shots[0].speaker).toMatch(HANGUL);
    // 대사는 자막이 된다 — 한국어다
    expect(f.shots[0].line).toMatch(HANGUL);
  });
});
