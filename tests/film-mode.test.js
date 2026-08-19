import { describe, it, expect } from "vitest";
import { FILM_MODES, isFilmMode, filmMode, imagePlanFor, attachClauseFor } from "../lib/film/mode.js";
import { buildFilmPrompt } from "../lib/film/pipeline.js";

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

// ★ film 도 목소리를 실어야 한다 — buildFilmPrompt 가 withSpokenLines 를 부르면서
//   voice 를 안 넘기면 광고에서만 나가고 이 경로는 예전 그대로다(같은 함수를 쓰는데
//   인자 하나가 빠져서 절반만 도는 모양은 이 저장소가 여러 번 겪었다).
describe("buildFilmPrompt 가 목소리를 싣는다", () => {
  it("★ scenario.voice 가 지시문에 실린다", () => {
    const sc = { ...SCENARIO, voice: "a calm man in his thirties, close-mic" };
    for (const mode of ["order", "refs"]) {
      expect(buildFilmPrompt(sc, mode)).toContain("a calm man in his thirties");
    }
  });

  it("voice 가 없으면 예전 그대로다", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).not.toMatch(/Voice:/);
  });
});

// ★★ 참고 그림 축이 focus 를 따른다(2026-08-19). 지금까지는 무엇이 중심이든 늘
// 제품·사람·자리 세 장이었다 — 인물이 주인공인 영상에도 제품 컷을 그리고, 공간이
// 주인공인 영상에도 인물 초상을 그렸다. 장당 $0.08 이 그렇게 나갔다.
//
// ★ 장수는 셋 그대로다. 늘리면 돈이 는다 — 무엇을 그릴지만 바꾼다.
describe("참고 그림 — focus 가 세 축을 정한다", () => {
  const withFocus = (f) => ({ ...SCENARIO, focus: f });

  it("★ 어느 focus 든 세 장이다 — 장수는 돈이다", () => {
    for (const f of ["product", "person", "place", "info"]) {
      expect(imagePlanFor("refs", withFocus(f))).toHaveLength(3);
    }
  });

  it("★ focus 마다 축이 다르다 — 같으면 이 갈래가 아무 일도 안 하는 것이다", () => {
    const keys = (f) => imagePlanFor("refs", withFocus(f)).map((p) => p.key).join(",");
    expect(keys("product")).not.toBe(keys("person"));
    expect(keys("person")).not.toBe(keys("place"));
  });

  it("★ 중심이 인물이면 인물을 두 장 그린다", () => {
    const plan = imagePlanFor("refs", withFocus("person"));
    expect(plan.filter((p) => p.key.startsWith("person"))).toHaveLength(2);
  });

  it("★ 중심이 제품이면 제품을 두 장 그린다", () => {
    const plan = imagePlanFor("refs", withFocus("product"));
    expect(plan.filter((p) => p.key.startsWith("subject"))).toHaveLength(2);
  });

  it("★ 중심이 공간이면 공간을 두 장 그린다", () => {
    const plan = imagePlanFor("refs", withFocus("place"));
    expect(plan.filter((p) => p.key.startsWith("place"))).toHaveLength(2);
  });

  it("info 와 옛 문서(focus 없음)는 지금까지의 세 축 그대로다 — 고정할 대상이 없다", () => {
    for (const sc of [withFocus("info"), SCENARIO]) {
      expect(imagePlanFor("refs", sc).map((p) => p.key)).toEqual(["subject", "person", "place"]);
    }
  });

  // ── 오늘 실측에서 눈으로 본 결함 둘 ──────────────────────────────────────
  //
  // 딸기라떼 실측(2026-08-19)에서 그대로 나온 프롬프트:
  //   [person] "A portrait of the person in: She smiles and sets the glass down, the pink
  //             drink centered and glowing on the marble counter with soft sun flare behind."
  //   [place]  "The place, empty of people, in: <네 장면 전부 — 사람 묘사 포함>"
  // 초상화를 그리라면서 잔·카운터·역광을 다 넣고, 사람 없는 곳이라면서 사람 묘사를 재료로
  // 다 받았다. B 방식에만 있는 결함이라 두 방식 비교까지 오염시킨다.
  it("★ 사람 축은 장면 전체를 재료로 받지 않는다 — 초상에 배경·소품이 딸려 들어간다", () => {
    const person = imagePlanFor("refs", withFocus("person")).find((p) => p.key === "person");
    expect(person.prompt).not.toContain("a woman walking out of a sunlit doorway with the bag");
  });

  it("★ 자리 축은 '사람 없는 곳'이라면서 사람 묘사를 재료로 넣지 않는다", () => {
    const place = imagePlanFor("refs", withFocus("place")).find((p) => p.key.startsWith("place"));
    expect(place.prompt).toMatch(/empty of people|no people/i);
    expect(place.prompt).not.toContain("a woman walking out of a sunlit doorway");
  });
});

// ★★ 앵커가 생기면서 "첫 이미지 = 첫 장면"이 **거짓**이 됐다(2026-08-19).
//
// 장면 순서 방식의 문구는 "첨부 이미지가 이 영상의 장면들이다, 순서대로 — 첫 이미지를
// 첫 장면에" 였다. 그런데 이제 **첫 이미지는 앵커**(생김새 참조)다. 그대로 두면 모델이
// 앵커를 1번 장면으로 그리고, 실제 1번 장면이 2번으로 밀린다 — 장면이 통째로 어긋난다.
//
// ★ 앵커가 **있을 때만** 그렇게 말해야 한다. focus 가 info 이거나 옛 문서면 앵커가
//   없으므로 예전 문구가 맞다. 그래서 판정을 문구에 넘긴다(hasAnchor).
describe("붙인 그림을 뭐라고 부르는가 — 앵커가 있으면 세는 법이 다르다", () => {
  it("★ 앵커가 있으면 첫 이미지가 장면이 아니라고 말한다", () => {
    const c = attachClauseFor("order", { hasAnchor: true });
    expect(c).toMatch(/first (attached )?image/i);
    expect(c).toMatch(/not a scene|appearance reference/i);
  });

  it("★ 앵커가 있으면 장면은 **두 번째 이미지부터**라고 말한다", () => {
    expect(attachClauseFor("order", { hasAnchor: true })).toMatch(/second image/i);
  });

  it("★ 앵커가 없으면 예전 문구 그대로다 — info·옛 문서는 안 바뀐다", () => {
    expect(attachClauseFor("order")).toBe(attachClauseFor("order", { hasAnchor: false }));
    expect(attachClauseFor("order")).toMatch(/first image for the first scene/i);
  });

  it("참고 그림 방식은 앵커 인자와 무관하다 — 그 방식에는 앵커가 없다", () => {
    expect(attachClauseFor("refs", { hasAnchor: true })).toBe(attachClauseFor("refs"));
  });

  it("★ 두 문구는 여전히 다르다", () => {
    expect(attachClauseFor("order", { hasAnchor: true })).not.toBe(attachClauseFor("refs"));
  });
});

// buildFilmPrompt 가 **문서의 그림 목록**을 보고 판정해야 한다 — scenario.focus 로
// 추론하면 그림을 그린 뒤 시나리오가 바뀌었을 때 어긋난다(잠금이 막지만, 판정의 근거는
// "무엇을 실제로 보냈는가"여야 한다).
describe("buildFilmPrompt 가 앵커 유무를 그림 목록에서 읽는다", () => {
  const withAnchor = [{ key: "anchor" }, { key: "shot-1" }];
  const noAnchor = [{ key: "shot-1" }];

  it("★ 첫 그림이 anchor 면 그렇게 말한다", () => {
    expect(buildFilmPrompt(SCENARIO, "order", withAnchor)).toMatch(/second image/i);
  });

  it("★ 앵커가 없으면 예전 문구다", () => {
    expect(buildFilmPrompt(SCENARIO, "order", noAnchor)).toMatch(/first image for the first scene/i);
  });

  it("그림 목록을 안 주면 예전 문구다 — 옛 호출부가 안 죽는다", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).toMatch(/first image for the first scene/i);
  });
});
