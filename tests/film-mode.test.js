import { describe, it, expect } from "vitest";
import { FILM_MODES, isFilmMode, filmMode, imagePlanFor, attachClauseFor } from "../lib/film/mode.js";

const SCENARIO = {
  text: "Vertical 9:16 ...",
  shots: [
    // ★ shows(영어 한 줄)가 이미지 프롬프트의 유일한 재료다(Task 3.5). 나머지 칸은 사장님이
    //   읽는 한국어라 프롬프트에서 걷혔다 — 그래서 픽스처에 shows 를 더했다.
    { beat: "가방에 달린 키링으로 시선을 끈다", shows: "a bunny keyring hanging on a tan handbag", camera: "slow push-in", lighting: "soft daylight", action: "keyring sways", line: "가방이 심심할 때 있잖아요", seconds: 5 },
    { beat: "손에 들어 크기를 보여준다", shows: "a hand lifting the small bunny charm to the lens", camera: "close-up", lighting: "window light", action: "hand lifts it", line: "얘를 데려왔어요", seconds: 5 },
    { beat: "가방에 달고 걸어 나간다", shows: "a woman walking out of a sunlit doorway with the bag", camera: "tracking", lighting: "golden hour", action: "walks out", line: "오늘부터 같이 다녀요", seconds: 5 },
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
    expect(plan[0].prompt).toContain("a bunny keyring hanging on a tan handbag");
  });

  it("★ 장면 순서 — 그 장면이 보여 주는 것(shows)이 프롬프트에 들어간다", () => {
    // 이것이 없으면 모델이 무엇을 그릴지 모른 채 그린다
    const plan = imagePlanFor("order", SCENARIO);
    expect(plan[0].prompt).toContain("a bunny keyring hanging on a tan handbag");
    expect(plan[1].prompt).toContain("a hand lifting the small bunny charm");
    // 그 장면의 것만 실린다 — 옆 장면 것이 섞이지 않는다
    expect(plan[0].prompt).not.toContain("a hand lifting the small bunny charm");
  });

  it("★ shows 가 없는 옛 문서는 beat 로 떨어진다 — 빈 프롬프트로 값을 치르지 않는다", () => {
    const old = { shots: [{ beat: "가방에 달린 키링으로 시선을 끈다", seconds: 5 }] };
    expect(imagePlanFor("order", old)[0].prompt).toContain("가방에 달린 키링으로 시선을 끈다");
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
    // 재료는 셋 다 shows 지만 **쥐어 주는 조각이 다르다** — 물건은 첫 장면, 사람은 마지막
    // 장면, 자리는 전부. 그래야 세 장이 같은 그림이 되지 않는다
    expect(subject).toContain("a bunny keyring hanging on a tan handbag");
    expect(person).toContain("a woman walking out of a sunlit doorway");
    expect(place).toContain("a bunny keyring hanging on a tan handbag");
    expect(place).toContain("a woman walking out of a sunlit doorway");
    expect(subject).not.toContain("a woman walking out of a sunlit doorway");
    // 한국어 필드는 어느 축에도 실리지 않는다 — 이미지 모델이 읽는 글이다
    for (const p of prompts) expect(p).not.toContain("가방에 달린 키링으로 시선을 끈다");
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
