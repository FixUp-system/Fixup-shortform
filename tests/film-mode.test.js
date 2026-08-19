import { describe, it, expect } from "vitest";
import { FILM_MODES, isFilmMode, filmMode, imagePlanFor, attachClauseFor } from "../lib/film/mode.js";

const SCENARIO = {
  text: "Vertical 9:16 ...",
  shots: [
    { beat: "가방에 달린 키링으로 시선을 끈다", camera: "slow push-in", lighting: "soft daylight", action: "keyring sways", line: "가방이 심심할 때 있잖아요", seconds: 5 },
    { beat: "손에 들어 크기를 보여준다", camera: "close-up", lighting: "window light", action: "hand lifts it", line: "얘를 데려왔어요", seconds: 5 },
    { beat: "가방에 달고 걸어 나간다", camera: "tracking", lighting: "golden hour", action: "walks out", line: "오늘부터 같이 다녀요", seconds: 5 },
  ],
};

describe("방식 표", () => {
  it("★ 방식은 둘뿐이다", () => {
    expect(FILM_MODES.map((m) => m.id)).toEqual(["order", "refs"]);
  });

  it("★ 모르는 방식은 던진다 — 조용히 떨어지면 고른 것과 다른 것이 구워진다", () => {
    expect(() => filmMode("nope")).toThrow();
    expect(isFilmMode("order")).toBe(true);
    expect(isFilmMode("nope")).toBe(false);
  });
});

describe("어떤 이미지를 만드는가", () => {
  it("★ 장면 순서 — 장면 수만큼 만든다", () => {
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan).toHaveLength(3);
    expect(plan[0].key).toBe("shot-1");
    // 그 장면의 말이 프롬프트에 실린다
    expect(plan[0].prompt).toContain("slow push-in");
    expect(plan[0].prompt).toContain("keyring sways");
  });

  it("★ 참고 그림 — 장면 수와 무관하게 축 셋이다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    expect(plan.map((p) => p.key)).toEqual(["subject", "person", "place"]);
  });

  it("★ 어느 방식이든 화면에 글자를 요구하지 않는다 — 자막은 우리가 태운다", () => {
    for (const mode of ["order", "refs"]) {
      for (const p of imagePlanFor(mode, SCENARIO)) {
        expect(p.prompt.toLowerCase()).toContain("no text");
      }
    }
  });

  it("★ 장면이 없으면 빈 계획이다 — 빈 프롬프트로 값을 치르지 않는다", () => {
    expect(imagePlanFor("order", { shots: [] })).toEqual([]);
  });
});

describe("그림을 뭐라고 부르는가", () => {
  it("★ 장면 순서 — 차례로 장면이라고 말한다", () => {
    expect(attachClauseFor("order")).toMatch(/in order|sequence/i);
  });

  it("★ 참고 그림 — 생김새 참조라고 말하고, 순서로 읽지 말라고 못 박는다", () => {
    const c = attachClauseFor("refs");
    expect(c).toMatch(/appearance|reference/i);
    expect(c).toMatch(/not.*(sequence|order)/i);
  });

  it("★ 둘이 서로 다른 말을 한다 — 같으면 실험이 성립하지 않는다", () => {
    expect(attachClauseFor("order")).not.toBe(attachClauseFor("refs"));
  });
});
