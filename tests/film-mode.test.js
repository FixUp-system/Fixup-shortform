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

  it("★ 참고 그림 — 세 축이 서로 다른 그림이 된다", () => {
    const plan = imagePlanFor("refs", SCENARIO);
    const prompts = plan.map((p) => p.prompt);
    // 셋이 같은 문자열을 받으면 세 장이 같은 그림이 되고 '생김새 참조 세 벌'이 무너진다
    expect(new Set(prompts).size).toBe(3);
    const [subject, person, place] = prompts;

    // ★ 물건과 자리는 shows 에서 재료를 받는다 — 무엇을 그릴지가 장면에 적혀 있다.
    expect(subject).toContain("a bunny keyring hanging on a tan handbag");
    expect(place).toContain("a bunny keyring hanging on a tan handbag");

    // ★★ 사람 축은 **장면 재료를 안 받는다**(2026-08-19). 장면을 통째로 주면
    //   "초상을 그려라"면서 잔·카운터·역광까지 들어간다(실측). 대신 배경을 지우는
    //   말(plain neutral background)로 사람만 남긴다.
    expect(person).toMatch(/portrait/i);
    expect(person).toMatch(/plain neutral background|no props/i);
    expect(person).not.toContain("a woman walking out of a sunlit doorway");
    expect(subject).not.toContain("a woman walking out of a sunlit doorway");

    // 한국어 필드는 어느 축에도 실리지 않는다 — 이미지 모델이 읽는 글이다
    for (const p of prompts) expect(p).not.toContain("가방에 달린 키링으로 시선을 끈다");
  });

  // ★ 판정을 "no text" 문자열에서 **의미**로 옮겼다(2026-08-19). 옛 문구
  //   "No text or letters anywhere in the image." 는 화면에 얹는 자막뿐 아니라
  //   **제품에 인쇄된 글자까지** 지웠다(실측). 막아야 하는 것은 모델이 **새로 얹는**
  //   글자이므로, 문자열을 고정하면 그 구분을 못 하게 된다.
  it("★ 어느 방식이든 모델이 글자를 새로 얹는 것을 막는다 — 자막은 우리가 태운다", () => {
    for (const mode of ["order", "refs"]) {
      for (const p of imagePlanFor(mode, SCENARIO)) {
        expect(p.prompt).toMatch(/do not add any text|no added text/i);
        expect(p.prompt).toMatch(/caption|title/i);
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

// ★★ 실측 2026-08-19(에스더버니 키링, 사진 1장 첨부) — 그림 넉 장에서 셋이 드러났다.
//
//  ② 제품에 인쇄된 글자가 지워졌다. NO_TEXT 가 "이미지 안 **어디에도** 글자 없음"이라
//     화면에 얹는 자막뿐 아니라 **제품 자체의 인쇄**까지 지우라고 말하고 있었다.
//  ③ 인물이 전부 외국인이었다. shows 는 "a stylish young woman" 이라고만 하고 국적을
//     안 적는다. 시나리오의 voice 에는 "Korean woman" 이 있는데 그림 쪽으로 안 간다.
//  ④ 첫 컷이 올린 사진과 달랐다. shows 의 연출 지시(어두운 벨벳·빔라이트)가 강해서
//     모델이 **제품 생김새까지** 재해석했다. 참조가 있으면 참조가 이겨야 한다.
describe("그림 프롬프트 — 참조가 이기고, 제품 글자는 남고, 사람은 한국인이다", () => {
  const sc = (extra) => ({ ...SCENARIO, focus: "product", ...extra });

  // ② 새로 얹는 글자만 금지한다
  it("★ 제품에 인쇄된 글자는 지키라고 말한다", () => {
    const p = imagePlanFor("order", sc())[0].prompt;
    expect(p).toMatch(/printed on|on the product|part of the product/i);
  });

  it("★ 그래도 화면에 글자를 얹는 것은 여전히 막는다 — 자막은 우리가 따로 태운다", () => {
    const p = imagePlanFor("order", sc())[0].prompt;
    expect(p).toMatch(/do not add|no added|caption|title/i);
  });

  it("'어디에도 글자 없음'이라고는 말하지 않는다 — 그 문구가 제품 인쇄를 지웠다", () => {
    for (const mode of ["order", "refs"]) {
      for (const item of imagePlanFor(mode, sc())) {
        expect(item.prompt).not.toContain("No text or letters anywhere in the image.");
      }
    }
  });

  // ③ 사람이 나오면 한국인이다
  it("★ 나레이션 언어가 한국어면 인물을 한국인으로 적는다", () => {
    const p = imagePlanFor("order", sc(), { narrationLang: "ko" }).map((x) => x.prompt).join("\n");
    expect(p).toMatch(/Korean/);
  });

  it("나레이션 언어를 안 주면 국적을 안 적는다 — 옛 호출부가 안 바뀐다", () => {
    const p = imagePlanFor("order", sc()).map((x) => x.prompt).join("\n");
    expect(p).not.toMatch(/Korean/);
  });

  it("★ 참고 그림의 인물 축도 같은 국적을 받는다", () => {
    const plan = imagePlanFor("refs", sc({ focus: "person" }), { narrationLang: "ko" });
    expect(plan.find((p) => p.key === "person").prompt).toMatch(/Korean/);
  });

  // ④ 참조가 있으면 참조가 이긴다
  it("★ 참조 사진이 있으면 생김새는 참조를 따르고 연출만 글이 정한다고 말한다", () => {
    const p = imagePlanFor("order", sc(), { hasPhoto: true })[0].prompt;
    expect(p).toMatch(/reference/i);
    expect(p).toMatch(/exactly|identical|do not redesign|do not reinterpret/i);
  });

  it("참조가 없으면 그 말을 안 붙인다 — 있지도 않은 것을 따르라고 하지 않는다", () => {
    const p = imagePlanFor("order", sc())[0].prompt;
    expect(p).not.toMatch(/attached reference photo/i);
  });
});

// film 도 같은 함수를 쓰지만 인자 하나가 빠지면 광고에서만 실린다 — 그 구멍을 막는다.
describe("buildFilmPrompt 가 음악·색처리·외형도 싣는다", () => {
  // ★ music 은 2026-08-19 에 지시문에서 걷어냈다 — 시나리오 칸은 남지만 프롬프트에는 안 간다.
  it("★ 색처리·외형은 실리고 음악은 안 실린다", () => {
    const sc = { ...SCENARIO, music: "slow piano", tone: "warm grain", look: "pink bunny, palm-sized" };
    const p = buildFilmPrompt(sc, "order");
    expect(p).toContain("warm grain");
    expect(p).toContain("pink bunny, palm-sized");
    expect(p).not.toContain("slow piano");
  });
});

// ★ 옷차림은 **사람이 나오는 그림에만** 붙는다 — 제품 클로즈업에 옷 얘기가 들어가면
//   모델이 없는 사람을 그려 넣는다(같은 이유로 인물 사진도 그 컷에만 넘긴다).
describe("wardrobe 가 사람 있는 그림에만 붙는다", () => {
  const sc = {
    ...SCENARIO,
    focus: "product",
    wardrobe: "casual denim jacket and a baseball cap",
    shots: [
      { beat: "제품만", shows: "a product on velvet", avatar_id: "", seconds: 5 },
      { beat: "여성", shows: "a woman holding it", avatar_id: "av-woman-20s", seconds: 5 },
    ],
  };

  it("★ 사람이 있는 컷에는 붙는다", () => {
    const plan = imagePlanFor("order", sc);
    expect(plan[1].prompt).toContain("casual denim jacket");
  });

  it("★ 사람이 없는 컷에는 안 붙는다", () => {
    const plan = imagePlanFor("order", sc);
    expect(plan[0].prompt).not.toContain("casual denim jacket");
  });

  it("wardrobe 가 없으면 아무 컷에도 안 붙는다 — 옛 문서 회귀 0", () => {
    const plan = imagePlanFor("order", { ...sc, wardrobe: "" });
    for (const p of plan) expect(p.prompt).not.toMatch(/wearing/i);
  });
});

// 굽기 지시문에도 실린다 — 영상에서 옷이 바뀌면 그림을 맞춰도 소용없다.
describe("buildFilmPrompt 가 옷차림을 싣는다", () => {
  it("★ 실린다", () => {
    const p = buildFilmPrompt({ ...SCENARIO, wardrobe: "casual denim jacket" }, "order");
    expect(p).toContain("casual denim jacket");
  });
});

describe("무대와 이음이 프롬프트에 실린다", () => {
  const sc = {
    ...SCENARIO,
    environment: "a sunlit minimal cafe, late afternoon",
    shots: [
      { beat: "1", shows: "the product on a table", avatar_id: "", transition: "", seconds: 5 },
      { beat: "2", shows: "a hand lifting it", avatar_id: "", transition: "pulls back from the macro", seconds: 5 },
    ],
  };

  it("★ 무대는 **모든** 그림에 붙는다 — 그것이 무대가 하나라는 뜻이다", () => {
    for (const p of imagePlanFor("order", sc)) expect(p.prompt).toContain("sunlit minimal cafe");
  });

  it("★ 이음은 그 컷에만 붙는다", () => {
    const plan = imagePlanFor("order", sc);
    expect(plan[1].prompt).toContain("pulls back from the macro");
    expect(plan[0].prompt).not.toContain("pulls back");
  });

  it("값이 없으면 안 붙는다 — 옛 문서 회귀 0", () => {
    for (const p of imagePlanFor("order", SCENARIO)) {
      expect(p.prompt).not.toMatch(/takes place in|continues from/i);
    }
  });

  it("★ 굽기 지시문에도 무대가 실린다", () => {
    expect(buildFilmPrompt(sc, "order")).toContain("sunlit minimal cafe");
  });
});

// ★★ refs 갈래의 구멍 셋(2026-08-19 사장님 지적: "참고 그림으로 만들면 마지막에 인물
// 옷이 갑자기 바뀐다"). order 를 기준으로 축을 붙이면서 refs 를 끝까지 안 훑었다.
//
//  ① focus=product 면 축이 제품·제품·자리라 **사람 그림이 한 장도 없다**. avatarId 를
//     넘기는 자리도 person 계열뿐이라 아바타 사진이 fal 에 안 갔다 — 영상에서 사람이
//     나올 때마다 모델이 새로 그려 얼굴도 옷도 컷마다 바뀐다.
//  ② STAGE(무대)가 person 계열에만 붙어 제품·자리 축은 무대를 몰랐다.
//  ③ WEAR(옷차림)도 마찬가지.
describe("참고 그림 — 사람이 나오면 인물 축을 확보한다", () => {
  const base = {
    ...SCENARIO,
    focus: "product",
    environment: "a sunlit minimal cafe",
    wardrobe: "casual denim jacket",
  };
  const withPerson = { ...base, shots: base.shots.map((s, i) => ({ ...s, avatar_id: i === 1 ? "av-woman-20s" : "" })) };
  const noPerson = { ...base, shots: base.shots.map((s) => ({ ...s, avatar_id: "" })) };

  it("★ 사람이 나오면 넉 장이 되고 인물 축이 생긴다", () => {
    const plan = imagePlanFor("refs", withPerson);
    expect(plan).toHaveLength(4);
    expect(plan.map((p) => p.key)).toContain("person");
  });

  it("★ 그 인물 축이 아바타 사진을 받는다 — 이것이 없어서 옷이 바뀌었다", () => {
    const person = imagePlanFor("refs", withPerson).find((p) => p.key === "person");
    expect(person.avatarId).toBe("av-woman-20s");
  });

  it("★ 인물 축에 옷차림이 붙는다", () => {
    const person = imagePlanFor("refs", withPerson).find((p) => p.key === "person");
    expect(person.prompt).toContain("casual denim jacket");
  });

  it("★ 사람이 안 나오면 예전처럼 세 장이다 — 쓸데없는 $0.08 을 안 쓴다", () => {
    expect(imagePlanFor("refs", noPerson)).toHaveLength(3);
  });

  it("★ 무대는 **모든** 축에 붙는다 — 그것이 무대가 하나라는 뜻이다", () => {
    for (const p of imagePlanFor("refs", withPerson)) {
      expect(p.prompt, p.key).toContain("sunlit minimal cafe");
    }
  });

  it("★ focus 가 person·place 여도 모든 축에 무대가 붙는다", () => {
    for (const f of ["person", "place", "info"]) {
      for (const p of imagePlanFor("refs", { ...withPerson, focus: f })) {
        expect(p.prompt, `${f}/${p.key}`).toContain("sunlit minimal cafe");
      }
    }
  });
});

// ★★ 그림에 안 실리던 둘(2026-08-19). 시나리오가 정해서 굽기 지시문에는 갔는데
// 그림 프롬프트에는 안 갔다 — 그림 색이 이미 제각각인데 영상에서 통일하라고 하는 셈이다.
describe("색 처리와 제품 외형이 그림에도 실린다", () => {
  const sc = (extra) => ({
    ...SCENARIO,
    focus: "product",
    tone: "warm muted film tones, gentle grain",
    look: "pink plush bunny keyring, palm-sized",
    ...extra,
  });

  it("★ tone 이 **모든** 그림에 붙는다 — 그림끼리 색이 다르면 영상에서 못 맞춘다", () => {
    for (const mode of ["order", "refs"]) {
      for (const p of imagePlanFor(mode, sc())) {
        expect(p.prompt, `${mode}/${p.key}`).toContain("warm muted film tones");
      }
    }
  });

  it("★ 사진이 없으면 제품 외형(look)이 붙는다 — 그때는 글이 유일한 재료다", () => {
    const p = imagePlanFor("order", sc(), { hasPhoto: false })[0];
    expect(p.prompt).toContain("pink plush bunny keyring, palm-sized");
  });

  it("★ 사진이 있으면 안 붙는다 — 사진이 더 나은 재료이고, 글이 사진과 다투면 진다", () => {
    const p = imagePlanFor("order", sc(), { hasPhoto: true })[0];
    expect(p.prompt).not.toContain("pink plush bunny keyring, palm-sized");
  });

  it("값이 없으면 안 붙는다 — 옛 문서 회귀 0", () => {
    for (const p of imagePlanFor("order", SCENARIO)) {
      expect(p.prompt).not.toMatch(/color treatment/i);
    }
  });
});

// ★★ 자리 축이 장소가 아니라 제품을 그렸다(2026-08-19 실측). 재료가 첫 장면 shows
// ("the pink plush bunny keyring … standing upright on a white cafe table")라 제품
// 서술이 통째로 들어갔고, 그 그림에 없던 리본까지 새로 생겼다.
// environment 를 넣을 때 이 축의 재료를 안 바꿨다 — 무대가 있으면 무대를 써야 한다.
describe("자리 축은 무대를 재료로 쓴다", () => {
  const sc = (extra) => ({
    ...SCENARIO,
    focus: "product",
    environment: "a sunlit outdoor cafe terrace on a city street, midday",
    ...extra,
  });

  it("★ 무대가 있으면 무대를 재료로 쓴다 — 제품 서술을 안 받는다", () => {
    const place = imagePlanFor("refs", sc()).find((p) => p.key.startsWith("place"));
    expect(place.prompt).toContain("sunlit outdoor cafe terrace");
    expect(place.prompt).not.toContain("a bunny keyring hanging on a tan handbag");
  });

  it("★ 무대가 없으면 예전처럼 첫 장면을 쓴다 — 옛 문서가 안 죽는다", () => {
    const place = imagePlanFor("refs", { ...SCENARIO, focus: "product" }).find((p) => p.key.startsWith("place"));
    expect(place.prompt).toContain("a bunny keyring hanging on a tan handbag");
  });

  it("★ focus=place 의 두 축도 무대를 쓴다", () => {
    const plan = imagePlanFor("refs", sc({ focus: "place" }));
    for (const p of plan.filter((x) => x.key.startsWith("place"))) {
      expect(p.prompt, p.key).toContain("sunlit outdoor cafe terrace");
    }
  });
});

// ★★ 참고 그림 축도 **얼굴 사진을 받아야 한다**(실측 2026-08-20).
//
// 떡볶이 실측에서 그림 넉 장에 여자가 **셋** 나왔다 — person 축은 아바타 얼굴,
// subject 와 subject-in-use 는 각자 지어낸 다른 얼굴에 다른 옷이었다. 그 넷이 그대로
// 영상 모델의 참조로 들어가므로(lib/film/pipeline.js) 컷마다 얼굴이 바뀐다.
//
// 원인은 2026-08-19 에 person 축을 끼워 넣으면서 **얼굴 사진을 그 축에만** 붙인 것이다.
// 나머지 축의 재료(shows)에는 사람 묘사가 그대로 들어 있는데 참조가 없었다.
//
// 판정은 장면 순서 방식과 **같은 자**를 쓴다: 그 축의 재료가 된 장면에 avatar_id 가
// 있으면 사람이 나오는 것이고, 그러면 얼굴 사진과 옷차림이 함께 붙는다.
// 자리 축(place)은 예외다 — "empty of people" 이라 얼굴이 끼면 지시가 서로 싸운다.
describe("참고 그림 축이 얼굴 사진을 받는다", () => {
  const sc = {
    ...SCENARIO,
    focus: "product",
    wardrobe: "comfy oversized tee and lounge pants",
    shots: [
      { shows: "a woman holding the meal kit box, her face clearly visible", avatar_id: "av-woman-20s", seconds: 4 },
      { shows: "the tteokbokki simmering in a pot", avatar_id: "", seconds: 4 },
      { shows: "the same woman mid-bite at her table", avatar_id: "av-woman-20s", seconds: 4 },
    ],
  };
  const axis = (plan, key) => plan.find((p) => p.key === key);

  it("★ 제품 축의 재료 장면에 사람이 있으면 얼굴 사진을 받는다", () => {
    expect(axis(imagePlanFor("refs", sc), "subject").avatarId).toBe("av-woman-20s");
  });

  it("★ 제품사용 축도 자기 재료 장면의 얼굴을 받는다", () => {
    expect(axis(imagePlanFor("refs", sc), "subject-in-use").avatarId).toBe("av-woman-20s");
  });

  it("★ 얼굴을 받는 축은 옷차림도 함께 받는다 — 얼굴만 같고 옷이 바뀌면 소용없다", () => {
    const plan = imagePlanFor("refs", sc);
    expect(axis(plan, "subject").prompt).toContain("comfy oversized tee");
    expect(axis(plan, "subject-in-use").prompt).toContain("comfy oversized tee");
  });

  it("★ 재료 장면에 사람이 없으면 얼굴도 옷차림도 안 붙는다 — 없는 사람이 그려진다", () => {
    // 첫 장면·끝 장면 둘 다 사람이 없는 시나리오
    const noPeople = { ...sc, shots: [sc.shots[1], { ...sc.shots[1], shows: "a close-up of the sauce" }] };
    const plan = imagePlanFor("refs", noPeople);
    for (const key of ["subject", "subject-in-use"]) {
      expect(axis(plan, key).avatarId).toBeFalsy();
      expect(axis(plan, key).prompt).not.toMatch(/wearing/i);
    }
  });

  it("★ 자리 축은 얼굴을 안 받는다 — '사람 없는 곳'과 싸운다", () => {
    expect(axis(imagePlanFor("refs", sc), "place").avatarId).toBeFalsy();
  });
});
