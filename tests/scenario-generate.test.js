import { describe, it, expect, vi, afterEach } from "vitest";
import { buildScenarioMessages, generateScenario } from "../lib/scenario.js";
import { checkScenario } from "../lib/scenario-rules.js";
import { TARGET_CHOICES } from "../lib/script.js";
import { I2V_MODEL_IDS } from "../lib/clip-limits.js";

const project = {
  id: "aaaaaaaa-0000-4000-8000-000000000002",
  settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
  material: { text: "동네 카페를 소개하는 영상", photos: [] },
};
const shot = (seconds, line = "오늘도 문을 엽니다.") => ({ beat: "문을 연다", line, speaker: "20대 여성 바리스타", seconds });
const good = { topic: "카페 소개", focus: { mode: "물건", subject: "핸드드립 커피" }, angle: "아침의 준비", shots: [shot(8), shot(8), shot(8), shot(6)] };
const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] }; // 합 25 ≠ 30 (컷 길이는 전부 유효 — 합 규칙 하나만 어긴다)

describe("generateScenario", () => {
  it("첫 답이 규칙을 지키면 한 번만 부른다", async () => {
    const call = vi.fn(async () => good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(got.problems).toEqual([]);
    expect(got.scenario.shots).toHaveLength(4);
    // calls 는 반환 계약이다 — mock 호출 수만 세면 이 필드가 틀려도 아무도 모른다
    expect(got.calls).toBe(1);
  });

  // 원장에 남는 이름과 지문·주인이 실제로 실리는가.
  // stage 가 "대본" 으로 바뀌어도 위 테스트들은 전부 그린이다 — 그러면 돈이 어디로 갔는지
  // 원장이 거짓말을 한다.
  it("★ 부를 때 원장 이름(시나리오)·지문·프로젝트 id 를 함께 싣는다", async () => {
    const call = vi.fn(async () => good);
    await generateScenario(project, { call });
    const first = call.mock.calls[0][0];
    expect(first.stage).toBe("시나리오");
    expect(first.system).toBe(buildScenarioMessages(project).system);
    expect(first.projectId).toBe(project.id);
  });

  it("★ 규칙에 걸리면 사유를 붙여 한 번 더 부른다", async () => {
    const call = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    // 두 번째 호출에 사유가 실렸는가 — 무엇이 틀렸는지 모델이 알아야 고친다
    const second = call.mock.calls[1][0];
    const last = second.messages[second.messages.length - 1];
    expect(last.content).toContain("[다시]");
    expect(last.content).toContain("25");
    expect(got.problems).toEqual([]);
    expect(got.calls).toBe(2);
  });

  it("★ 두 번째도 걸리면 그대로 돌려준다 — 코드가 초를 주무르지 않는다", async () => {
    const call = vi.fn(async () => bad);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
    expect(got.problems.length).toBeGreaterThan(0);
    // 초를 몰래 고치지 않았다
    expect(got.scenario.shots.map((s) => s.seconds)).toEqual([8, 8, 5, 4]);
    expect(got.calls).toBe(2);
  });

  it("★ 모양이 깨진 답은 다시 부른다", async () => {
    const call = vi.fn().mockResolvedValueOnce({ shots: [] }).mockResolvedValueOnce(good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
    expect(got.calls).toBe(2);
  });

  // ★★ 2026-08-16 최종 리뷰가 must-fix 로 올린 자리 — 섞인 실패(모양 O·규칙 X → 모양 X).
  //    지우면 사장님은 **고칠 수 있었던 시나리오**를 잃고 화면에는 오류만 남는다.
  //    규칙 위반은 사장님이 화면에서 고칠 수 있고, 그것이 이 단계의 존재 이유다.
  it("★ 첫 답이 규칙만 어겼고 둘째 답의 모양이 깨지면, 첫 답을 지킨다", async () => {
    const call = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce({ shots: [] });
    const got = await generateScenario(project, { call });
    expect(got.scenario?.shots).toHaveLength(4);
    // 사유는 살아남은 시나리오와 짝이 맞아야 한다 — "형식이 맞지 않았어요"는 이 시나리오의 문제가 아니다
    expect(got.problems.length).toBeGreaterThan(0);
    expect(got.problems.join(" ")).not.toContain("형식");
    expect(got.calls).toBe(2);
  });

  it("★ 두 번 다 모양이 깨지면 scenario 가 null 이다", async () => {
    const call = vi.fn(async () => ({ shots: [] }));
    const got = await generateScenario(project, { call });
    expect(got.scenario).toBe(null);
    expect(got.problems.length).toBeGreaterThan(0);
    expect(got.calls).toBe(2);
  });
});

// SHOTFORM_FAKE=all 은 **돈 한 푼 안 쓰고 관통을 확인하는 유일한 길**이다. 여기서 막히면
// 그 길 자체가 없다 — 예전에 fakeResponse() 의 `shots: []` 가 502 를 냈다.
// 주입 없이 진짜 callJson 을 태운다: 가짜 판정(lib/fake.js)부터 값 만들기까지 통째로 잰다.
describe("가짜 모드(SHOTFORM_FAKE=all)에서 ②시나리오가 통과한다", () => {
  const prev = process.env.SHOTFORM_FAKE;
  afterEach(() => {
    if (prev === undefined) delete process.env.SHOTFORM_FAKE;
    else process.env.SHOTFORM_FAKE = prev;
  });

  // 길이 넷 × 모델 전부 — 하한이 모델마다 달라(Seedance 4 · Kling 3) 한 길이만 재면
  // 다른 모델에서 조용히 깨진다.
  for (const target of TARGET_CHOICES) {
    for (const i2v_model of I2V_MODEL_IDS) {
      it(`${target}초 · ${i2v_model}`, async () => {
        process.env.SHOTFORM_FAKE = "all";
        const p = { ...project, settings: { i2v_model, target_seconds: target } };
        const got = await generateScenario(p);
        expect(got.problems).toEqual([]);
        expect(got.calls).toBe(1);
        expect(got.scenario.shots.length).toBeGreaterThan(0);
        // 합이 정확히 목표다 — 1초만 새도 checkScenario 가 결함을 낸다
        expect(got.scenario.shots.reduce((a, s) => a + s.seconds, 0)).toBe(target);
        // 규칙 판정을 한 번 더 직접 태운다(problems 가 비었다는 것과 같은 말인지 못 박는다)
        expect(checkScenario(got.scenario, p).ok).toBe(true);
      });
    }
  }

  it("길이를 안 고른 프로젝트도 관통한다 — 합 규칙이 아예 안 걸린다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    const p = { ...project, settings: { i2v_model: "seedance-2.0" } };
    const got = await generateScenario(p);
    expect(got.problems).toEqual([]);
  });
});
