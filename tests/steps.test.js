import { describe, it, expect } from "vitest";
import { STEPS, currentStepKey, isReachable, areCutsStale, stepFromPathname, stepHref } from "../lib/steps.js";

describe("단계 정의", () => {
  it("구성이 빠져 6단계다 — 원고가 곧 설계다", () => {
    expect(STEPS.map((s) => s.key)).toEqual([
      "material", "script", "voice", "images", "video", "done",
    ]);
    expect(STEPS[1]).toMatchObject({ key: "script", label: "대본", seg: "script" });
  });

  it("목소리가 이미지 앞이다 — 낭독 길이가 컷 구조를 판정한다", () => {
    // TTS 실측이 cut.seconds 를 덮는다. 그 값이 10초를 넘으면 클립이 잘린다.
    // 이미지 값(컷당 후보 2장)을 치르기 전에 알아야 쪼갤 기회가 있다.
    const keys = STEPS.map((s) => s.key);
    expect(keys.indexOf("voice")).toBeLessThan(keys.indexOf("images"));
    expect(keys.indexOf("images")).toBeLessThan(keys.indexOf("video"));
  });

  it("준비 중 표시가 남아 있지 않다", () => {
    expect(STEPS.filter((s) => s.soon)).toEqual([]);
  });

  it("번호가 순서대로 붙어 있다", () => {
    expect(STEPS.map((s) => s.no)).toEqual(["①", "②", "③", "④", "⑤", "⑥"]);
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
  // status 는 "마지막으로 끝난 산출물", currentStepKey 는 "다음에 열릴 화면"이다
  it("분할이 끝나면 목소리 차례", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed })).toBe("voice");
  });
  it("목소리가 끝나면 이미지 차례", () => {
    expect(currentStepKey({ status: "voice", briefing: confirmed })).toBe("images");
  });
  it("뒤 단계 status 를 각각 읽는다", () => {
    // 이미지가 끝나도 완성은 사장님이 눌러야 시작된다 — 열려 있어야 할 화면은 ⑤영상이다
    expect(currentStepKey({ status: "images", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "video", briefing: confirmed })).toBe("video");
    expect(currentStepKey({ status: "done", briefing: confirmed })).toBe("done");
  });
  it("뒤 단계 판정을 앞보다 먼저 본다 — 앞서간 프로젝트를 끌어내리지 않는다", () => {
    // status 가 done 인데 cuts 조건에 먼저 걸려 되돌아가면, 완성본을 두고 뒤로 간다
    const finished = { status: "done", briefing: confirmed, cuts: [{ idx: 0 }] };
    expect(currentStepKey(finished)).toBe("done");
  });
  it("구성 시절 프로젝트도 status가 cuts면 목소리 차례 — 돈 주고 만든 컷에서 쫓아내지 않는다", () => {
    const old = { status: "cuts", briefing: confirmed, synopsis: { scenes: [] }, cuts: [{ id: "c1" }] };
    expect(currentStepKey(old)).toBe("voice");
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
  it("대본 승인 직후 status가 cuts로 서야 목소리 단계가 열린다", () => {
    // 라우트가 파이프라인보다 먼저 status:cuts를 세우는 이유 — script인 채로 오면 가드가 되돌린다
    const base = { briefing: { confirmed: true } };
    expect(isReachable("voice", { ...base, status: "script" })).toBe(false);
    expect(isReachable("voice", { ...base, status: "cuts", cuts: [] })).toBe(true); // 컷이 비어 있어도 열린다
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "voice", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
  it("영상 단계에 있으면 앞 단계가 전부 열려 있다", () => {
    const p = { briefing: { confirmed: true }, status: "images" };
    for (const k of ["material", "script", "voice", "images", "video"]) {
      expect(isReachable(k, p), k).toBe(true);
    }
    expect(isReachable("done", p)).toBe(false);
  });
});
