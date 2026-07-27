import { describe, it, expect } from "vitest";
import { STEPS, currentStepKey, isReachable, stepFromPathname, stepHref } from "../lib/steps.js";

describe("단계 정의", () => {
  it("로드맵 확정 순서를 따른다", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "material", "synopsis", "script", "voice", "images", "video", "done",
    ]);
  });

  it("stepHref는 ①자료를 프로젝트 유무로 가른다", () => {
    const [material, , script] = STEPS;
    expect(stepHref(material, null)).toBe("/create");
    expect(stepHref(material, "abc")).toBe("/create/abc/briefing");
    expect(stepHref(script, null)).toBeNull();
    expect(stepHref(script, "abc")).toBe("/create/abc/script");
  });
});

describe("stepFromPathname", () => {
  it("단계 경로를 그 단계로 읽는다", () => {
    expect(stepFromPathname("/create/abc/script").key).toBe("script");
    expect(stepFromPathname("/create/abc/images").key).toBe("images");
    expect(stepFromPathname("/create").key).toBe("material");
  });
  it("프로젝트 인덱스는 단계 미상 — ①자료로 오인하지 않는다", () => {
    // seg 없이 STEPS를 찾으면 seg:null인 자료가 매칭돼 가드가 통째로 무력화됐던 자리
    expect(stepFromPathname("/create/abc")).toBeUndefined();
  });
  it("브리핑 경로를 ①자료로 읽는다", () => {
    expect(stepFromPathname("/create/abc/briefing").key).toBe("material");
  });
  it("모르는 경로는 undefined", () => {
    expect(stepFromPathname("/costs")).toBeUndefined();
    expect(stepFromPathname("/create/abc/없는단계")).toBeUndefined();
    expect(stepFromPathname("")).toBeUndefined();
  });
});

describe("currentStepKey", () => {
  const confirmed = { confirmed: true };
  const synopsis = { angle: "각도", scenes: [{ id: "s1" }], version: 1 };

  it("프로젝트가 없으면 자료 단계", () => {
    expect(currentStepKey(null)).toBe("material");
  });
  it("브리핑 확정 전에는 상태와 무관하게 자료 단계", () => {
    expect(currentStepKey({ status: "draft", briefing: null })).toBe("material");
    expect(currentStepKey({ status: "briefing", briefing: { confirmed: false } })).toBe("material");
  });
  it("확정하면 구성 단계", () => {
    expect(currentStepKey({ status: "briefing", briefing: confirmed })).toBe("synopsis");
  });
  it("구성이 서면 대본 단계", () => {
    expect(currentStepKey({ status: "synopsis", briefing: confirmed, synopsis })).toBe("script");
    expect(currentStepKey({ status: "script", briefing: confirmed, synopsis })).toBe("script");
  });
  it("컷이 시작되면 이미지 단계", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed, synopsis })).toBe("images");
  });
  it("구성이 없어도 status가 cuts면 이미지 단계 — 구성 도입 전 프로젝트를 쫓아내지 않는다", () => {
    // synopsis 없이 "synopsis"를 돌려주면 레이아웃이 아직 없는 화면으로 replace 해 404에 갇힌다
    const old = { status: "cuts", briefing: confirmed, cuts: [{ id: "c1" }] };
    expect(currentStepKey(old)).toBe("images");
  });
  it("대본을 고쳐 status가 script로 내려가면 컷이 남아 있어도 대본 단계 — 컷을 다시 뽑을 수 있다", () => {
    const p = { status: "script", briefing: confirmed, synopsis, cuts: [{ id: "c1" }] };
    expect(currentStepKey(p)).toBe("script");
  });
  it("구성을 고치면 남은 컷은 낡은 것으로 본다", () => {
    const p = { status: "synopsis", briefing: confirmed, synopsis, cuts: [{ id: "c1" }] };
    expect(currentStepKey(p)).toBe("script");
  });
  it("구성도 컷도 없으면 구성 단계", () => {
    expect(currentStepKey({ status: "briefing", briefing: confirmed })).toBe("synopsis");
  });
});

describe("구성 단계", () => {
  const confirmed = { briefing: { confirmed: true } };

  it("단계가 7개이고 ②가 구성이다", () => {
    expect(STEPS).toHaveLength(7);
    expect(STEPS[1]).toMatchObject({ key: "synopsis", label: "구성", seg: "synopsis" });
    expect(STEPS[2]).toMatchObject({ key: "script", label: "대본" });
  });

  it("브리핑만 확정됐으면 구성 단계다", () => {
    expect(currentStepKey(confirmed)).toBe("synopsis");
  });

  it("구성이 생기면 대본 단계다", () => {
    expect(currentStepKey({ ...confirmed, synopsis: { scenes: [] } })).toBe("script");
  });

  it("구성 없이 대본 단계에 갈 수 없다", () => {
    expect(isReachable("script", confirmed)).toBe(false);
    expect(isReachable("synopsis", confirmed)).toBe(true);
  });

  it("경로에서 구성 단계를 찾는다", () => {
    expect(stepFromPathname("/create/abc/synopsis")?.key).toBe("synopsis");
  });
});

describe("isReachable", () => {
  it("자료 단계는 언제나 열려 있다", () => {
    expect(isReachable("material", null)).toBe(true);
  });
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script", briefing: { confirmed: true }, synopsis: { scenes: [] } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("대본 승인 직후 status가 cuts로 서야 ⑤이미지가 열린다", () => {
    // 라우트가 파이프라인보다 먼저 status:cuts를 세우는 이유 — script인 채로 오면 가드가 되돌린다
    const base = { briefing: { confirmed: true }, synopsis: { scenes: [] } };
    const before = { ...base, status: "script" };
    const after = { ...base, status: "cuts", cuts: [] };
    expect(isReachable("images", before)).toBe(false);
    expect(isReachable("images", after)).toBe(true); // 컷이 아직 비어 있어도 열린다
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "cuts", briefing: { confirmed: true }, synopsis: { scenes: [] } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
});
