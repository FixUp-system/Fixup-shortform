import { describe, it, expect } from "vitest";
import { scenarioSeconds, checkScenario } from "../lib/scenario-rules.js";

// Seedance(하한 4초) 30초 프로젝트. 소재는 베이커리 — 지문 예시와 안 겹친다.
const proj = (target = 30) => ({ settings: { i2v_model: "seedance-2.0", target_seconds: target } });
const shot = (seconds, line = "갓 구운 빵 냄새로 하루를 엽니다.", speaker = "30대 여성 사장") =>
  ({ beat: "가게를 연다", line, speaker, seconds });

describe("scenarioSeconds", () => {
  it("shot 초를 더한다", () => {
    expect(scenarioSeconds({ shots: [shot(5), shot(7)] })).toBe(12);
  });
  it("shots 가 없으면 0 이다", () => {
    expect(scenarioSeconds(null)).toBe(0);
    expect(scenarioSeconds({})).toBe(0);
  });
});

describe("checkScenario", () => {
  it("규칙을 다 지키면 통과한다", () => {
    const s = { shots: [shot(8), shot(8), shot(8), shot(6)] };
    expect(checkScenario(s, proj())).toEqual({ ok: true, problems: [] });
  });

  it("★ 초의 합이 목표와 다르면 걸린다", () => {
    const s = { shots: [shot(8), shot(8), shot(8), shot(4)] };
    const got = checkScenario(s, proj());
    expect(got.ok).toBe(false);
    expect(got.problems.join(" ")).toContain("28");
    expect(got.problems.join(" ")).toContain("30");
  });

  // 경계 — 정확히 8초는 통과한다(CONTENT_MAX_SECONDS 는 "초과"가 아니라 상한이다)
  it("★ 컷 하나가 8초를 넘으면 걸린다 — 정확히 8초는 통과", () => {
    expect(checkScenario({ shots: [shot(8), shot(8), shot(8), shot(6)] }, proj()).ok).toBe(true);
    const over = checkScenario({ shots: [shot(9), shot(8), shot(8), shot(5)] }, proj());
    expect(over.ok).toBe(false);
    expect(over.problems.join(" ")).toContain("8초");
  });

  // 경계 — 정확히 하한(Seedance 4)은 통과한다. 넘으면 fal 이 거절한다.
  it("★ 컷 하나가 모델 하한보다 짧으면 걸린다 — 정확히 4초는 통과", () => {
    expect(checkScenario({ shots: [shot(4), shot(8), shot(8), shot(6), shot(4)] }, proj()).ok).toBe(true);
    const under = checkScenario({ shots: [shot(3), shot(8), shot(8), shot(7), shot(4)] }, proj());
    expect(under.ok).toBe(false);
    expect(under.problems.join(" ")).toContain("4초");
  });

  it("★ 컷 개수가 길이÷하한을 넘으면 걸린다 — 15초·Seedance면 3개", () => {
    const three = { shots: [shot(5), shot(5), shot(5)] };
    expect(checkScenario(three, proj(15)).ok).toBe(true);
    const four = { shots: [shot(4), shot(4), shot(4), shot(3)] };
    expect(checkScenario(four, proj(15)).ok).toBe(false);
  });

  it("★ 대사가 있는 컷에 화자가 없으면 걸린다", () => {
    const s = { shots: [shot(8), { ...shot(8), speaker: "  " }, shot(8), shot(6)] };
    const got = checkScenario(s, proj());
    expect(got.ok).toBe(false);
    expect(got.problems.join(" ")).toContain("2번");
  });

  it("대사가 빈 컷은 화자를 요구하지 않는다 — 무음 컷이다", () => {
    const s = { shots: [shot(8), { ...shot(8), line: "", speaker: "" }, shot(8), shot(6)] };
    expect(checkScenario(s, proj()).ok).toBe(true);
  });

  it("★ 컷이 하나도 없으면 걸린다", () => {
    expect(checkScenario({ shots: [] }, proj()).ok).toBe(false);
    expect(checkScenario(null, proj()).ok).toBe(false);
  });

  it("Kling 프로젝트는 하한이 3초다 — 하한을 손으로 적지 않는다", () => {
    const p = { settings: { i2v_model: "kling-v3", target_seconds: 30 } };
    const s = { shots: [shot(3), shot(8), shot(8), shot(8), shot(3)] };
    expect(checkScenario(s, p).ok).toBe(true);
  });

  it("문제가 여럿이면 전부 모은다 — 하나 고치고 또 걸리는 일이 없게", () => {
    const s = { shots: [shot(20)] };
    const got = checkScenario(s, proj());
    expect(got.problems.length).toBeGreaterThanOrEqual(2);
  });
});
