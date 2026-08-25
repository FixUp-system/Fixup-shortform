// **언제 재야 하나** — 통짜로 구웠을 때만이다.
//
// ★★ 컷별로 구우면 클립 하나에 대사 하나라 시작이 곧 컷 경계다 — 어긋날 자리가 없고
//   whisper 를 부르면 값만 나간다. 한 클립 안에 대사가 **둘 이상** 들어갈 때만 모델이
//   자기 리듬으로 배치하고, 그때 어긋난다(2026-08-25 실측: 최대 2초, 방향도 제각각).
// ★ 이 판정을 "통짜인가"라는 구조 이름으로 묻지 않는다 — 담는 방식이 바뀌어도
//   **한 클립에 대사가 여럿인가**는 그대로 참이다.
import { describe, it, expect } from "vitest";
import { needsSpeechProbe } from "../lib/speech-timing.js";

describe("needsSpeechProbe", () => {
  it("컷별로 구웠으면 잴 것이 없다 — 클립마다 대사 하나", () => {
    const cuts = [
      { sentence: "가", video: { url: "a.mp4" } },
      { sentence: "나", video: { url: "b.mp4" } },
    ];
    expect(needsSpeechProbe(cuts)).toBe(false);
  });

  it("한 클립에 대사가 둘 이상이면 재야 한다", () => {
    const cuts = [
      { sentence: "가", video: { url: "one.mp4" } },
      { sentence: "나", video: { url: "one.mp4" } },
    ];
    expect(needsSpeechProbe(cuts)).toBe(true);
  });

  it("대사가 하나뿐이면 안 잰다 — 어긋나도 그 하나가 컷 안에 있다", () => {
    const cuts = [
      { sentence: "가", video: { url: "one.mp4" } },
      { sentence: "", video: { url: "one.mp4" } },
    ];
    expect(needsSpeechProbe(cuts)).toBe(false);
  });

  it("구운 것이 없으면 안 잰다", () => {
    expect(needsSpeechProbe([{ sentence: "가" }])).toBe(false);
    expect(needsSpeechProbe([])).toBe(false);
    expect(needsSpeechProbe(null)).toBe(false);
  });
});

describe("통짜 갈래 — 클립이 하나고 대사는 여럿이다", () => {
  // ★★ r2v 통짜는 굽기 결과를 **첫 컷의 video** 에만 담는다(lib/reel/pipeline.js
  //   의 runReelOneShot). 나머지 컷은 대사를 지닌 채 video 가 없다 — 그래서
  //   "한 클립에 대사 여럿"으로 안 세졌고, 재야 할 자리를 놓쳤다.
  //   그 결과 뒤 자막이 **영상 밖으로 밀려난다**(15초 영상에 18·24초 자막).
  // ★ 판정은 `video.whole` 하나를 본다 — 통짜로 굼다는 것을 그 플래그가 말한다.
  it("통짜로 굼고 대사가 둘 이상이면 재야 한다", () => {
    const cuts = [
      { sentence: "가", video: { url: "one.mp4", whole: true } },
      { sentence: "" },
      { sentence: "나" },
    ];
    expect(needsSpeechProbe(cuts)).toBe(true);
  });

  it("통짜여도 대사가 하나면 안 재다", () => {
    const cuts = [
      { sentence: "가", video: { url: "one.mp4", whole: true } },
      { sentence: "" },
    ];
    expect(needsSpeechProbe(cuts)).toBe(false);
  });
});
