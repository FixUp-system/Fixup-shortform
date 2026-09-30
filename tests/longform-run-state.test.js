// 단계 관문 — 돈이 나가는 자리를 코드가 지킨다(CLAUDE.md: 유료 생성은 승인 먼저).
import { describe, it, expect } from "vitest";
import {
  gate, checkBibleLock, stageCostUsd, h3SecondUsd, SCENARIO_USD, SHEET_USD,
  stageIsFree, parseAnchorAt,
} from "../lib/longform/run-state.js";

const planned = { scenario: { shots: [] }, segments: [{ seg: 1 }, { seg: 2 }] };

describe("관문 — 순서", () => {
  it("plan 전에는 굽지 못한다", () => {
    expect(gate({}, "seg1", { yes: true })).toEqual({ ok: false, reason: expect.stringMatching(/plan 을 먼저/) });
  });

  it("★ 구간 1 없이 구간 2 를 못 굽는다 — 확인 ① 을 건너뛰지 않는다", () => {
    expect(gate(planned, "seg2", { yes: true }).reason).toMatch(/확인 ①/);
  });

  it("두 구간이 다 있어야 잇는다", () => {
    expect(gate(planned, "join", {}).ok).toBe(false);
  });

  it("모르는 단계", () => expect(gate(planned, "seg3", {}).ok).toBe(false));
});

describe("관문 — 돈", () => {
  it("★★★ 유료 단계는 --yes 없이 안 돈다", () => {
    expect(gate(planned, "seg1", {}).reason).toMatch(/--yes/);
    expect(gate({}, "plan", {}).reason).toMatch(/--yes/);
  });

  it("--yes 면 돈다", () => expect(gate(planned, "seg1", { yes: true })).toEqual({ ok: true }));

  it("★★★ 접수만 되고 결과가 없으면 --yes 없이 **이어 기다린다** — 새 돈이 안 나간다", () => {
    const s = { ...planned, segments: [{ seg: 1, job: { statusUrl: "S" } }, { seg: 2 }] };
    expect(gate(s, "seg1", {})).toEqual({ ok: true, resume: true });
  });

  it("★ 이미 구운 구간은 다시 굽지 않는다 — 다시 누르면 값이 두 번 나간다", () => {
    const s = { ...planned, segments: [{ seg: 1, job: {}, video: "seg1.mp4" }, { seg: 2 }] };
    expect(gate(s, "seg1", { yes: true }).reason).toMatch(/이미 구웠어요/);
  });

  it("잇기는 0원이라 --yes 가 필요 없다", () => {
    const s = { ...planned, segments: [{ seg: 1, video: "a" }, { seg: 2, video: "b" }] };
    expect(gate(s, "join", {})).toEqual({ ok: true });
  });
});

describe("최종 리뷰에서 잡힌 것", () => {
  it("★★★ 접수했거나 구운 구간이 있으면 plan 을 다시 못 돌린다 — 접수증이 지워져 값이 두 번 나간다", () => {
    const withJob = { scenario: {}, segments: [{ seg: 1, job: { statusUrl: "S" } }, { seg: 2 }] };
    const out = gate(withJob, "plan", { yes: true });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/새 작업 폴더/);
    const withVideo = { scenario: {}, segments: [{ seg: 1, video: "a" }, { seg: 2 }] };
    expect(gate(withVideo, "plan", { yes: true }).ok).toBe(false);
  });

  it("아직 아무것도 안 구웠으면 plan 을 다시 돌려도 된다", () => {
    expect(gate(planned, "plan", { yes: true })).toEqual({ ok: true });
  });

  it("★★ 가짜 여부는 단계마다 그 단계가 부르는 것을 본다 — FAKE=fal 에서 H3 는 가짜여야 한다", () => {
    // plan 은 LLM 을, seg 는 fal(판·H3)을 부른다. join 은 로컬이다.
    expect(stageIsFree("plan", { fal: true, llm: false })).toBe(false);
    expect(stageIsFree("seg1", { fal: true, llm: false })).toBe(true);
    expect(stageIsFree("seg2", { fal: false, llm: true })).toBe(false);
    expect(stageIsFree("join", { fal: false, llm: false })).toBe(true);
  });

  it("★★ 닻 초는 판을 사기 **전에** 거른다 — 숫자이고 0 이상 · 구간 길이 미만", () => {
    expect(parseAnchorAt(undefined, 14)).toEqual({ ok: true, at: 7 });
    expect(parseAnchorAt("5", 14)).toEqual({ ok: true, at: 5 });
    expect(parseAnchorAt("abc", 14).ok).toBe(false);
    expect(parseAnchorAt("-1", 14).ok).toBe(false);
    expect(parseAnchorAt("14", 14).reason).toMatch(/0 이상 14초 미만/);
  });
});

describe("고정 블록 잠금", () => {
  it("구간 1 을 굽기 전에는 잠기지 않는다", () => {
    expect(checkBibleLock(planned, "아무거나")).toEqual({ ok: true });
  });

  it("같은 블록이면 통과", () => {
    const s = { segments: [{ bible: "B" }, {}] };
    expect(checkBibleLock(s, "B")).toEqual({ ok: true });
  });

  it("★★★ 한 글자라도 다르면 막고, 무엇만 고칠 수 있는지 말한다", () => {
    const s = { segments: [{ bible: "B" }, {}] };
    const out = checkBibleLock(s, "B ");
    expect(out.ok).toBe(false);
    // 2026-09-30 — 장소·옷은 구간마다 바뀔 수 있게 풀었다(tests/longform-extend.test.js).
    expect(out.reason).toMatch(/본문·대사·장소·옷만/);
  });
});

describe("값 어림", () => {
  it("H3 초당 값은 모델 표에서 읽는다", () => {
    expect(h3SecondUsd("768P")).toBe(0.06);
    expect(h3SecondUsd("2K")).toBe(0.13);
    expect(() => h3SecondUsd("720p")).toThrow(/모르는 화질/);
  });

  it("plan 은 시나리오 한 번", () => expect(stageCostUsd("plan", {})).toBe(SCENARIO_USD));

  it("구간은 판 + 영상 + 참조 추가분", () => {
    expect(stageCostUsd("seg1", { resolution: "768P", seconds: 14, extraRefUsd: 0.16 }))
      .toBeCloseTo(SHEET_USD + 0.06 * 14 + 0.16, 6);
  });

  it("잇기는 0원", () => expect(stageCostUsd("join", {})).toBe(0));
});
