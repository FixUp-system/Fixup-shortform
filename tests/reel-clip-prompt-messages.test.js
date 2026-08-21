// 영상 프롬프트 LLM 이 받는 것 — 그리고 **안 받는 것**.
//
// ★ 대사를 안 준다. 대사는 코드가 꼬리에 원문 그대로 붙이므로, LLM 이 보면 본문에 섞어
//   써서 같은 말이 두 번 실리거나 다듬어져 자막과 갈린다.
import { describe, it, expect } from "vitest";
import { CLIP_PROMPT_SYSTEM, buildClipPromptMessages } from "../lib/reel/clip-prompt.js";

const cut = {
  idx: 1,
  shows: "a mug on a wooden desk",
  camera: "slow push-in, eye level",
  lighting: "soft window light from the left",
  action: "steam rises from the mug",
  sound: "a kettle clicking off in the next room",
  sentence: "이거 하나면 아침이 달라져요",
};
const project = {
  settings: { i2v_model: "seedance-2.0" },
  scenario: { environment: "a sunlit kitchen counter", tone: "warm, film-like grain" },
};

describe("system", () => {
  it("글자가 보이는 장면을 적지 말라고 한다", () => {
    expect(CLIP_PROMPT_SYSTEM).toMatch(/글자/);
  });

  it("JSON 한 벌만 내라고 한다", () => {
    expect(CLIP_PROMPT_SYSTEM).toMatch(/"body"/);
  });

  it("★ 금지 목록을 쌓지 않는다 — 짧게 유지한다", () => {
    // fable 은 지시가 과하게 박히면 품질이 떨어진다. 임계는 감이 아니라 규율이다:
    // 지금 길이를 상한으로 못 박아 두어 다음 사람이 조용히 늘리지 못하게 한다.
    expect(CLIP_PROMPT_SYSTEM.length).toBeLessThan(1200);
  });
});

describe("메시지", () => {
  const [msg] = buildClipPromptMessages(cut, project, {
    sceneNo: 2, sceneCount: 4, prevShows: "a hand reaching for the kettle",
  });

  it("컷의 재료를 싣는다", () => {
    expect(msg.content).toContain("a mug on a wooden desk");
    expect(msg.content).toContain("slow push-in, eye level");
    expect(msg.content).toContain("soft window light from the left");
    expect(msg.content).toContain("steam rises from the mug");
    expect(msg.content).toContain("a kettle clicking off in the next room");
  });

  it("컷 순번과 앞 컷을 싣는다", () => {
    expect(msg.content).toContain("2 / 4");
    expect(msg.content).toContain("a hand reaching for the kettle");
  });

  it("무대와 색 처리를 싣는다", () => {
    expect(msg.content).toContain("a sunlit kitchen counter");
    expect(msg.content).toContain("warm, film-like grain");
  });

  it("★ 대사는 싣지 않는다", () => {
    expect(msg.content).not.toContain("이거 하나면 아침이 달라져요");
  });

  it("값이 없는 칸은 줄째로 빠진다 — 빈 줄을 남기면 모델이 지어내 채운다", () => {
    const [bare] = buildClipPromptMessages({ idx: 0, shows: "an empty desk" }, {}, {});
    expect(bare.content).toContain("an empty desk");
    expect(bare.content).not.toContain("undefined");
    // "카메라: " 처럼 라벨만 남은 줄이 없어야 한다
    expect(bare.content).not.toMatch(/: *$/m);
  });
});
