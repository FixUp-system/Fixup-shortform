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

  it("★ 방식 표는 못 바꾼다 — 호출부가 늘리면 '둘뿐'이 런타임에 깨진다", () => {
    expect(Object.isFrozen(FILM_MODES)).toBe(true);
    expect(() => FILM_MODES.push({ id: "hack" })).toThrow();
    expect(FILM_MODES).toHaveLength(2);
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

  it("★ 장면 순서 — 그 장면이 하는 일(beat)이 프롬프트에 들어간다", () => {
    // beat 가 없으면 모델이 무엇을 그릴지 모른 채 조명만 보고 그린다
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan[0].prompt).toContain("가방에 달린 키링으로 시선을 끈다");
    expect(plan[1].prompt).toContain("손에 들어 크기를 보여준다");
    // 그 장면의 것만 실린다 — 옆 장면 것이 섞이지 않는다
    expect(plan[0].prompt).not.toContain("손에 들어 크기를 보여준다");
  });

  it("★ 참고 그림 — 장면 수와 무관하게 축 셋이다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    expect(plan.map((p) => p.key)).toEqual(["subject", "person", "place"]);
  });

  it("★ 참고 그림 — 세 축이 서로 다른 재료에서 나온다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    const prompts = plan.map((p) => p.prompt);
    // 셋이 같은 문자열을 받으면 세 장이 같은 그림이 되고 '생김새 참조 세 벌'이 무너진다
    expect(new Set(prompts).size).toBe(3);
    const [subject, person, place] = prompts;
    expect(subject).toContain("keyring sways"); // 물건 = action
    expect(person).toContain("가방에 달린 키링으로 시선을 끈다"); // 사람 = beat
    expect(place).toContain("golden hour"); // 자리 = lighting
    expect(place).not.toContain("keyring sways");
    expect(subject).not.toContain("golden hour");
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
    // 조기 반환이 두 방식을 함께 덮는다 — refs 도 축 셋을 빈 프롬프트로 만들지 않는다
    expect(imagePlanFor("refs", { shots: [] })).toEqual([]);
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
