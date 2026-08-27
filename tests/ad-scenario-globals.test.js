// 영상 전체 값(인물·무대·옷차림…)을 **사장님이 고칠 수 있는가**를 잠근다.
//
// ★ 왜 필요한가: 그전에는 고칠 수 있는 것이 장면 칸뿐이었다. AI 가 "20대 여성"으로
//   잡았는데 사장님이 40대 남성을 원하면 [다시 쓰기]로 통째로 새로 뽑는 수밖에 없었고,
//   그러면 마음에 들던 장면과 대사까지 다 바뀌었다. 영상 한 편이 $2~7 이라 시나리오
//   단계에서 맞추는 것이 가장 싼 길이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  EDITABLE_GLOBAL_FIELDS, pickEditedGlobals, buildScenarioMessages,
} from "../lib/ad/scenario.js";

const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "premium", model: "seedance-2.0",
};
const saved = {
  text: "base",
  angle: "처음 온 사람이 완주한다",
  cast: "a woman in her mid-twenties, black ponytail, lean build, bright expression",
  wardrobe: "coral tank top and black leggings",
  environment: "an indoor climbing gym at night",
  look: "",
  tone: "vivid saturated colors",
  voice: "an upbeat woman in her late twenties",
  shots: [{ beat: "벽 앞에 선다", seconds: 15 }],
};
const build = (globalEdits) =>
  buildScenarioMessages({ kind: "ad", settings, material: { text: "소재", photos: [] }, globalEdits })
    .messages[0].content;

describe("서버가 고친 값을 판정한다 — 화면 주장을 믿지 않는다", () => {
  // ★★ 2026-08-27 — 고칠 수 있는 칸이 **angle 하나**로 줄었다. cast·wardrobe·environment·
  //   look·tone·voice 는 광고 시나리오가 더는 만들지 않는 칸이다(전부 영상 프롬프트 text
  //   안으로 들어갔다). 목록에만 남기면 "화면에는 있는데 서버가 못 쓰는" 값이 된다.
  it("실제로 다른 칸만 고른다", () => {
    const out = pickEditedGlobals(saved, { ...saved, angle: "끝까지 혼자 오른다" });
    expect(Object.keys(out)).toEqual(["angle"]);
    expect(out.angle).toContain("혼자");
  });

  // ★ 안 고친 값까지 "이대로 쓴다"로 실으면 전체 재작성이 아니라 옛 시나리오의 번역이 된다.
  it("하나도 안 고쳤으면 빈 객체다", () => {
    expect(pickEditedGlobals(saved, { ...saved })).toEqual({});
  });

  it("앞뒤 공백만 다른 것은 고친 것이 아니다", () => {
    expect(pickEditedGlobals(saved, { ...saved, angle: `  ${saved.angle}  ` })).toEqual({});
  });

  // ★ 비운 것도 **사장님의 판단**이다 — "이 영상에는 사람이 안 나온다".
  it("값을 비운 것은 고친 것으로 본다", () => {
    expect(pickEditedGlobals(saved, { ...saved, angle: "" })).toEqual({ angle: "" });
  });

  it("빈 칸을 채운 것도 고친 것이다 — 비어 있는 칸이야말로 채우고 싶은 자리다", () => {
    expect(pickEditedGlobals({ ...saved, angle: "" }, { ...saved, angle: "새 이야기" }))
      .toEqual({ angle: "새 이야기" });
  });

  // ★ 걷어낸 칸은 **이제 목록 밖**이다 — 들어와도 안 받는다.
  it("걷어낸 칸(cast·wardrobe·environment·look·tone·voice)은 받지 않는다", () => {
    expect(pickEditedGlobals(saved, {
      ...saved, cast: "딴사람", wardrobe: "딴옷", environment: "딴곳",
      look: "딴것", tone: "딴색", voice: "딴목소리",
    })).toEqual({});
  });

  it("목록 밖의 칸은 받지 않는다 — 화면에 없는 것을 서버가 받으면 두 벌이 갈린다", () => {
    expect(pickEditedGlobals(saved, { ...saved, music: "loud rock", focus: "person" })).toEqual({});
  });

  it("문자열이 아닌 값은 무시한다", () => {
    expect(pickEditedGlobals(saved, { angle: {} })).toEqual({});
  });

  it("저장된 시나리오나 들어온 값이 없으면 빈 객체다 — 던지지 않는다", () => {
    expect(pickEditedGlobals(null, { angle: "x" })).toEqual({});
    expect(pickEditedGlobals(saved, null)).toEqual({});
    expect(pickEditedGlobals(saved, "nope")).toEqual({});
  });

  it("길이 상한이 있다", () => {
    const out = pickEditedGlobals(saved, { angle: "가".repeat(900) });
    expect(out.angle.length).toBe(400);
  });
});

describe("고친 값이 지문에 실린다", () => {
  it("고친 칸이 '이대로 쓴다'로 실린다", () => {
    const user = build({ cast: "a man in his forties" });
    expect(user).toContain("사장님이 직접 고친 값");
    expect(user).toContain("cast: a man in his forties");
    expect(user).toContain("고친 값 자체는 한 글자도 바꾸지 마라");
  });

  // ★ 빈 줄을 그냥 실으면 모델이 무슨 뜻인지 모른다 — 말로 적는다.
  it("비운 칸은 '해당 없음'이라고 말로 적는다", () => {
    expect(build({ cast: "" })).toContain("비웠다");
  });

  it("고친 것이 없으면 그 블록이 통째로 없다 — 지문이 글자 그대로 예전과 같다", () => {
    expect(build({})).not.toContain("사장님이 직접 고친 값");
    expect(build(undefined)).not.toContain("사장님이 직접 고친 값");
  });

  it("나머지를 고친 값에 맞춰 다시 쓰라고 말한다 — 지키기만 하면 장면이 어긋난 채 남는다", () => {
    expect(build({ environment: "a sunlit park" })).toContain("맞게 나머지를 다시 쓴다");
  });
});

describe("화면과 서버가 같은 목록을 본다", () => {
  // ⚠️ 화면은 lib/ad/scenario.js 를 import 할 수 없다(서버 전용 — vlm.js 를 통해 fs 가
  //   딸려 온다). 그래서 목록이 두 벌이고, 갈리면 "화면에는 있는데 서버가 버리는" 칸이
  //   생긴다(반대도 마찬가지다). 이 저장소가 AD_STYLE_LINES ↔ styles.js 를 대조하는 것과
  //   같은 자리다.
  const src = readFileSync(new URL("../app/ads/[id]/page.js", import.meta.url), "utf8");

  it("화면이 그리는 칸이 서버 목록과 정확히 같다", () => {
    const onScreen = [...src.matchAll(/\["[^"]+", "([a-z_]+)"\],/g)].map((m) => m[1]);
    expect(onScreen).toEqual(EDITABLE_GLOBAL_FIELDS);
  });

  it("화면이 전역 칸을 data-global 로 걷는다 — 장면(data-field) 수집과 섞이면 안 된다", () => {
    expect(src).toContain('attr="data-global"');
    expect(src).toMatch(/querySelectorAll\("\[data-global\]"\)/);
    expect(src).toMatch(/querySelectorAll\("\[data-shot\]"\)/);
  });

  it("화면이 shots 와 globals 를 함께 보낸다", () => {
    expect(src).toMatch(/JSON\.stringify\(\{ shots: edited\.shots, globals: edited\.globals \}\)/);
  });

  // ★ 편집 중에는 **일곱 칸을 다 편다** — 비어 있는 칸이야말로 사장님이 채우고 싶은 자리다.
  it("편집 중에는 빈 칸도 그린다", () => {
    expect(src).toMatch(/const rows = editing\s*\n?\s*\? all/);
  });

  // ★ 클릭 이벤트가 edited 자리로 들어가면 body 가 쓰레기가 된다. 이 파일의 주석이 이미
  //   경고하던 것인데 정작 두 자리가 그러고 있었다.
  it("makeScenario 를 onClick 에 직접 묶지 않는다", () => {
    // ★ 주석은 뺀다 — 이 파일에는 그렇게 하지 말라는 **경고 문구**가 주석으로 있다.
    //   문자열을 통째로 훑으면 그 경고가 걸려, 고쳐도 실패하는 시험이 된다(실제로 그랬다).
    // ★ 주석을 걷는다 — 이 화면에는 "그렇게 하지 마라"는 **경고 문구**가 JSX 주석으로
    //   들어 있다. 원문을 통째로 훑으면 그 경고가 걸려, 코드를 고쳐도 실패하는 시험이
    //   된다(실제로 그랬다). 여러 줄 JSX 주석까지 걷어야 잡힌다.
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");
    expect(code).not.toMatch(/onClick=\{makeScenario\}/);
    expect(code).toMatch(/onClick=\{\(\) => makeScenario\(\)\}/);
  });
});

describe("라우트가 globals 를 서버 판정으로 날라 준다", () => {
  const adRoute = readFileSync(new URL("../app/api/ads/[id]/scenario/route.js", import.meta.url), "utf8");
  const filmRoute = readFileSync(new URL("../app/api/film/[id]/scenario/route.js", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../lib/ad/pipeline.js", import.meta.url), "utf8");

  it("광고 라우트가 body.globals 를 넘긴다", () => {
    expect(adRoute).toContain("globals: body?.globals");
  });

  it("광고 파이프라인이 pickEditedGlobals 로 판정한다", () => {
    expect(pipeline).toContain("pickEditedGlobals(project.scenario, deps.globals)");
    expect(pipeline).toContain("globalEdits");
  });

  // ★ 화면은 아직 없지만 배선은 해 둔다 — 안 하면 "화면은 보내는데 서버가 버리는" 조용한
  //   실패가 나중에 생긴다. 두 경로가 같은 함수를 쓰는 이 파일의 규율 그대로다.
  it("film 라우트도 같은 함수를 쓴다", () => {
    expect(filmRoute).toContain("pickEditedGlobals(project.scenario, body?.globals)");
    expect(filmRoute).toContain("globalEdits");
  });
});
