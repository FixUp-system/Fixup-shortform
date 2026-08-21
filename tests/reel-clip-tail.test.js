// 꼬리는 한 벌이다 — buildClipPrompt 가 두 흐름(단계별 i2v · reel r2v)을 다 낳는다.
//
// ★★ 가장 중요한 단정은 마지막 describe 다: opts 를 안 넘기면 **글자 그대로** 같다.
//    각인이 그 위에 서 있어서, 한 글자만 달라도 이미 산 클립이 전부 낡는다.
import { describe, it, expect } from "vitest";
import { buildClipPrompt } from "../lib/cuts.js";

// 말하는 컷 하나. 캐스팅(cast)이 이 컷을 물어 립싱크 갈래로 간다(내레이션이 아니다).
// ★ speechFor(lib/cuts.js) 는 cut.sentence 와 project.cast[].cuts 로 판정한다 —
//   대사 자리는 line 이 아니라 sentence 다.
const cut = {
  idx: 1,
  shows: "a mug on a wooden desk",
  sentence: "이거 하나면 아침이 달라져요",
  seconds: 4,
};
const project = {
  settings: { i2v_model: "seedance-2.0", speech_lang: "ko" },
  scenario: { environment: "a sunlit kitchen counter" },
  cuts: [cut],
  cast: [{ id: "c1", who: "민서", cuts: [1] }],
};

describe("reel 갈래 (opts 를 넘긴다)", () => {
  const out = buildClipPrompt(cut, project, {
    body: "the mug sits still as morning light creeps across the desk",
    sceneNo: 2,
    sceneCount: 4,
    attach: "refs",
  });

  it("LLM 본문이 맨 앞에 온다", () => {
    expect(out.startsWith("the mug sits still as morning light creeps across the desk")).toBe(true);
  });

  it("컷 순번을 모델에게 알린다", () => {
    expect(out).toContain("This is scene 2 of 4.");
  });

  it("첨부를 참조라고 말한다 — 첫 프레임이 아니다", () => {
    expect(out).toContain("The attached images show what this scene");
    expect(out).not.toContain("first frame");
  });

  it("대사가 원문 그대로 실린다 — ffmpeg 자막과 갈리면 안 된다", () => {
    expect(out).toContain('"이거 하나면 아침이 달라져요"');
  });

  it("금지문은 그대로 남는다", () => {
    expect(out).toContain("No text or letters.");
  });
});

describe("컷 순번은 둘 다 있을 때만 붙는다", () => {
  it("sceneCount 가 없으면 그 문장이 아예 없다", () => {
    const out = buildClipPrompt(cut, project, { body: "b", sceneNo: 2, attach: "refs" });
    expect(out).not.toContain("This is scene");
  });
});

describe("★ 옛 경로 회귀 0", () => {
  it("opts 를 안 넘긴 것과 빈 객체를 넘긴 것이 글자 그대로 같다", () => {
    expect(buildClipPrompt(cut, project, {})).toBe(buildClipPrompt(cut, project));
  });

  it("옛 경로는 여전히 첫 프레임이라고 말한다", () => {
    const out = buildClipPrompt(cut, project);
    expect(out).toContain("The attached image is the first frame — continue naturally from it.");
    expect(out).not.toContain("This is scene");
  });
});
