import { describe, it, expect } from "vitest";
import { buildScenarioMessages, validateScenario } from "../lib/scenario.js";

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

  it("모르는 focus.mode 는 focus 를 통째로 비운다", () => {
    const got = validateScenario({ ...good, focus: { mode: "동물", subject: "고양이" } });
    expect(got.focus).toBe(null);
  });
});
