import { describe, it, expect, vi } from "vitest";
import { generateScenario } from "../lib/scenario.js";

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
  });

  it("★ 두 번째도 걸리면 그대로 돌려준다 — 코드가 초를 주무르지 않는다", async () => {
    const call = vi.fn(async () => bad);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
    expect(got.problems.length).toBeGreaterThan(0);
    // 초를 몰래 고치지 않았다
    expect(got.scenario.shots.map((s) => s.seconds)).toEqual([8, 8, 5, 4]);
  });

  it("★ 모양이 깨진 답은 다시 부른다", async () => {
    const call = vi.fn().mockResolvedValueOnce({ shots: [] }).mockResolvedValueOnce(good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
  });

  it("★ 두 번 다 모양이 깨지면 scenario 가 null 이다", async () => {
    const call = vi.fn(async () => ({ shots: [] }));
    const got = await generateScenario(project, { call });
    expect(got.scenario).toBe(null);
    expect(got.problems.length).toBeGreaterThan(0);
  });
});
