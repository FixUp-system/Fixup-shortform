import { describe, it, expect } from "vitest";
import { STEPS, currentStepKey, isReachable, areCutsStale, stepFromPathname, stepHref } from "../lib/steps.js";

describe("단계 정의", () => {
  it("구성이 빠져 6단계다 — 원고가 곧 설계다", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "material", "script", "voice", "images", "video", "done",
    ]);
    expect(STEPS[1]).toMatchObject({ key: "script", label: "대본", seg: "script" });
  });

  it("stepHref는 ①자료를 프로젝트 유무로 가른다", () => {
    const [material, script] = STEPS;
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
    expect(stepFromPathname("/create/abc")).toBeUndefined();
  });
  it("브리핑 경로를 ①자료로 읽는다", () => {
    expect(stepFromPathname("/create/abc/briefing").key).toBe("material");
  });
  it("없어진 구성 경로는 어떤 단계도 아니다", () => {
    expect(stepFromPathname("/create/abc/synopsis")).toBeUndefined();
  });
  it("모르는 경로는 undefined", () => {
    expect(stepFromPathname("/costs")).toBeUndefined();
    expect(stepFromPathname("")).toBeUndefined();
  });
});

describe("currentStepKey", () => {
  const confirmed = { confirmed: true };

  it("프로젝트가 없으면 자료 단계", () => {
    expect(currentStepKey(null)).toBe("material");
  });
  it("브리핑 확정 전에는 상태와 무관하게 자료 단계", () => {
    expect(currentStepKey({ status: "draft", briefing: null })).toBe("material");
    expect(currentStepKey({ status: "briefing", briefing: { confirmed: false } })).toBe("material");
  });
  it("확정하면 바로 대본 단계 — 구성 게이트가 사라졌다", () => {
    expect(currentStepKey({ status: "briefing", briefing: confirmed })).toBe("script");
  });
  it("컷이 시작되면 이미지 단계", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed })).toBe("images");
  });
  it("구성 시절 프로젝트도 status가 cuts면 이미지 단계 — 돈 주고 만든 컷에서 쫓아내지 않는다", () => {
    const old = { status: "cuts", briefing: confirmed, synopsis: { scenes: [] }, cuts: [{ id: "c1" }] };
    expect(currentStepKey(old)).toBe("images");
  });
  it("대본을 고쳐 status가 script로 내려가면 컷이 남아 있어도 대본 단계 — 컷을 다시 뽑을 수 있다", () => {
    const p = { status: "script", briefing: confirmed, cuts: [{ id: "c1" }] };
    expect(currentStepKey(p)).toBe("script");
  });
});

describe("areCutsStale — 낡음의 방향이 뒤집혔다", () => {
  // 예전에는 대본이 구성에 대해 낡았다. 이제는 컷이 원고에 대해 낡는다.
  const cuts = [{ idx: 0 }];

  it("두 버전이 같으면 낡지 않았다", () => {
    expect(areCutsStale({ script: { version: 2 }, cuts, cuts_script_version: 2 })).toBe(false);
  });

  it("원고를 다시 쓰면 남은 컷은 낡은 것으로 본다", () => {
    expect(areCutsStale({ script: { version: 3 }, cuts, cuts_script_version: 2 })).toBe(true);
  });

  it("손으로 고친 원고는 version이 그대로다 — 거짓 경고를 띄우지 않는다", () => {
    // PATCH script_text는 version을 올리지 않는다. 사장님이 직접 고친 것에
    // "컷 다시 만들기"(유료 호출)를 권하면 안 된다.
    expect(areCutsStale({ script: { version: 2, text: "고친 원고" }, cuts, cuts_script_version: 2 })).toBe(false);
  });

  it("원고 도입 전에 만들어진 컷은 낡은 것으로 본다", () => {
    expect(areCutsStale({ script: { version: 1 }, cuts })).toBe(true);
  });

  it("컷이 없거나 원고가 없으면 판정하지 않는다", () => {
    expect(areCutsStale({ script: { version: 1 }, cuts: [] })).toBe(false);
    expect(areCutsStale({ cuts })).toBe(false);
    expect(areCutsStale(null)).toBe(false);
  });
});

describe("isReachable", () => {
  it("자료 단계는 언제나 열려 있다", () => {
    expect(isReachable("material", null)).toBe(true);
  });
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("대본 승인 직후 status가 cuts로 서야 이미지 단계가 열린다", () => {
    // 라우트가 파이프라인보다 먼저 status:cuts를 세우는 이유 — script인 채로 오면 가드가 되돌린다
    const base = { briefing: { confirmed: true } };
    expect(isReachable("images", { ...base, status: "script" })).toBe(false);
    expect(isReachable("images", { ...base, status: "cuts", cuts: [] })).toBe(true); // 컷이 비어 있어도 열린다
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "cuts", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
});
