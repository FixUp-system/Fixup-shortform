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

describe("SYSTEM — 칸마다 언어를 못 박는다", () => {
  const system = () => buildScenarioMessages(project).system;

  // subject·look·narrator_voice 는 그림·영상 프롬프트에 **그대로** 실린다
  // (lib/cuts.js subjectOf · speechFor). 영어가 그 모델들의 말이다.
  it("★ 모델이 읽는 칸(focus·narrator_voice)을 영어로 요구한다", () => {
    expect(system(), "focus 를 영어로 쓰라는 지시가 없다").toMatch(/"focus"[\s\S]{0,400}영어/);
    expect(system(), "narrator_voice 를 영어로 쓰라는 지시가 없다").toMatch(/"narrator_voice"[\s\S]{0,300}영어/);
  });

  // ★ 대사만은 영상 모델이 읽는데도 한국어다 — 그 글자가 **그대로 자막이 된다**
  //   (ffmpeg 가 태운다, lib/subtitles.js). 이유를 지문에 적어 두지 않으면 "모델이 읽는
  //   칸은 영어"라는 큰 규칙에 끌려 영어 대사가 나오고, 사장님 영상에 영어 자막이 박힌다.
  it("★ 대사는 한국어를 못 박는다 — 이 글자가 그대로 자막이 된다", () => {
    expect(system()).toMatch(/"line"[\s\S]{0,200}한국어/);
    expect(system(), "왜 한국어여야 하는지(자막)를 안 적었다").toMatch(/자막/);
  });

  it("★ 사장님·다음 단계 LLM 이 읽는 칸은 한국어를 못 박는다", () => {
    for (const field of ['"topic"', '"angle"', '"beat"', '"speaker"']) {
      expect(system(), `${field} 에 한국어 표시가 없다`)
        .toMatch(new RegExp(`${field}[\\s\\S]{0,200}한국어`));
    }
  });

  // ★ 예시의 언어를 표시로 가른다: 영어 예시는 `e.g.`, 한국어 예시는 `예:`.
  //   둘을 같은 표시로 두면 이 그물이 영어 칸의 예시가 한국어로 되돌아간 것을 못 잡는다.
  it("★ 예시가 언어를 정한다 — `e.g.` 는 영어, `예:` 는 한국어다", () => {
    const s = system();

    const english = [...s.matchAll(/e\.g\.\s*((?:"[^"]*"(?:\s*[·,]\s*)?)+)/g)].map((m) => m[1]);
    expect(english.length, "영어 칸의 예시를 `e.g.` 로 든 자리가 없다").toBeGreaterThan(0);
    for (const v of english) {
      expect(v, `영어 칸의 예시에 한글이 남았다: ${v}`).not.toMatch(HANGUL);
    }

    const korean = [...s.matchAll(/예:\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(korean.length, "한국어 칸의 예시가 사라졌다").toBeGreaterThan(0);
    for (const v of korean) {
      expect(v, `한국어 칸의 예시가 한글이 아니다: ${v}`).toMatch(HANGUL);
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
