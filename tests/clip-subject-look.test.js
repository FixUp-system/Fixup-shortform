import { describe, it, expect } from "vitest";
import { buildClipPrompt, buildImagePrompt, subjectOf } from "../lib/cuts.js";
import { clipKey, imageContextKey } from "../lib/steps.js";

// 클립 프롬프트에서 **제품 절**(앵커+외형)을 걷어낸 것을 못 박는다.
//
// 왜 걷어냈나 — 두 단계가 받는 것이 다르다(2026-08-18 실측, 프로젝트 1f9f66f8…):
//   · 이미지 생성은 사장님 참조 **사진 바이트**를 함께 받는다 → 묘사가 틀려도 사진이 이긴다
//   · 클립 생성(i2v)은 사진이 안 간다. **이미지 한 장 + 글로 쓴 묘사**뿐 → 묘사가 이미지를 이긴다
// 그래서 라벤더 토끼가 첫 프레임에 있는데 프롬프트가 "cream-white plush bunny" 라고 말하니
// 5초 뒤 크림색 토끼로 다시 그려졌다. 게다가 바로 뒤에 붙는
// `Keep the subject and style unchanged.` 와 **정면으로 모순**이다.
//
// ★ 앵커까지 뺀 이유(외형만이 아니다):
//   ① 사고를 낸 문장의 절반이 앵커였다 — 앵커 자체가 구도를 주장했다("an Esther Bunny plush
//      keyring **clipped onto a woman's handbag strap**"). 사장님이 `edit_instruction` 으로
//      인형을 지운 컷에 그 문장이 실려, 없어야 할 인형이 만들어져 들어갔다.
//   ② 앵커는 **영상 한 편에 하나**이고 컷마다 갈리지 않는다. i2v 는 이미 그 컷의 실제
//      프레임을 받으므로, 프레임에 없는 물건을 "이 영상의 피사체는 X 다"라고 말하는 것은
//      곧 X 를 그려 넣으라는 지시다.
//   ③ 앵커는 초점이 물건이 아니면 `topic` 으로 떨어진다 — 자료가 기획서면
//      "신발을 주인공으로 한 감각적인 광고 영상" 같은 문구가 피사체 이름이 된다.
//   ④ 앵커가 이미지 프롬프트에서 하던 일(전 컷 일관성)은 클립에서는 이미
//      `Keep the subject and style unchanged.` 와 **첫 프레임 그 자체**가 한다.
//
// ⚠️ 이미지 프롬프트는 그대로다 — 그림을 그릴 때는 묘사가 있어야 하고, 참조 사진과 함께
//    가므로 안전하다.
const 제품 = {
  settings: { aspect_ratio: "9:16", i2v_model: "kling-v3" },
  scenario: {
    topic: "키링 광고",
    focus: { mode: "물건", subject: "an Esther Bunny plush keyring clipped onto a woman's handbag strap", look: "small cream-white plush bunny charm, pastel pink satin ribbon" },
  },
  cast: [{ who: "20대 여성", look: "검정 코트", cuts: [0] }],
};
const 컷 = { idx: 0, motion: "가방을 들어 올린다", environment: "현관 앞", tone: "차가운 색감", shows: "가방 클로즈업" };

describe("클립 프롬프트 — 제품 절을 싣지 않는다", () => {
  it("외형(look)이 안 실린다", () => {
    const p = buildClipPrompt(컷, 제품);
    expect(p).not.toContain("Its appearance");
    expect(p).not.toContain("cream-white plush bunny charm");
  });

  it("앵커(anchor)도 안 실린다 — 구도를 주장하는 문장이 여기 있었다", () => {
    const p = buildClipPrompt(컷, 제품);
    expect(p).not.toContain("The subject is:");
    expect(p).not.toContain("clipped onto a woman's handbag strap");
  });

  it("남는 지시는 첫 프레임 유지 한 줄이다", () => {
    const p = buildClipPrompt(컷, 제품);
    expect(p).toContain("The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged.");
  });

  it("무대·인물·톤은 이번 범위 밖이라 그대로 실린다", () => {
    const p = buildClipPrompt(컷, 제품);
    expect(p).toContain("Setting: 현관 앞.");
    expect(p).toContain("Characters in this frame: 20대 여성: 검정 코트.");
    expect(p).toContain("Color treatment, keep identical across all cuts: 차가운 색감.");
  });

  it("제품만 바꿔도 클립 프롬프트가 글자 그대로 같다", () => {
    const 다른제품 = { ...제품, scenario: { ...제품.scenario, focus: { mode: "물건", subject: "라벤더 토끼", look: "검은 리본" } } };
    expect(buildClipPrompt(컷, 다른제품)).toBe(buildClipPrompt(컷, 제품));
  });
});

describe("이미지 프롬프트 — 제품 묘사는 그대로다", () => {
  it("앵커와 외형이 둘 다 실린다", () => {
    const p = buildImagePrompt(컷, 제품);
    expect(p).toContain("The video's subject is: an Esther Bunny plush keyring clipped onto a woman's handbag strap.");
    expect(p).toContain("Its appearance, identical in every scene: small cream-white plush bunny charm, pastel pink satin ribbon.");
  });

  it("제품을 바꾸면 그림 각인이 낡는다 — 이미지 쪽은 안 건드렸다", () => {
    const 다른제품 = { ...제품, scenario: { ...제품.scenario, focus: { mode: "물건", subject: "라벤더 토끼", look: "검은 리본" } } };
    expect(imageContextKey(컷, 다른제품)).not.toBe(imageContextKey(컷, 제품));
    expect(imageContextKey(컷, 제품)).toContain("subject:");
  });

  it("subjectOf 자체는 그대로다 — 뺀 것은 클립 쪽 소비자뿐이다", () => {
    expect(subjectOf(제품).anchor).toBe("an Esther Bunny plush keyring clipped onto a woman's handbag strap");
    expect(subjectOf(제품).look).toBe("small cream-white plush bunny charm, pastel pink satin ribbon");
  });
});

// ★ 이 저장소의 불변: **프롬프트에 실리는 것만 각인에 담는다.**
//   한쪽만 고치면 "프롬프트는 같은데 낡았다고 하는 자리"가 생기고 그 버튼은 유료다
//   (컷당 8크레딧 · Seedance 30초 한 편 ~$9).
describe("clipKey 와 buildClipPrompt 가 같은 기준을 본다", () => {
  it("각인에도 제품이 안 담긴다", () => {
    const k = clipKey({ ...컷, image: { url: "u" }, seconds: 5 }, 제품);
    expect(k).not.toContain("subject:");
    expect(k).not.toContain("Esther Bunny");
  });

  it("제품만 바꾸면 프롬프트도 각인도 안 갈린다 — 거짓 낡음이 안 생긴다", () => {
    const 다른제품 = { ...제품, scenario: { ...제품.scenario, focus: { mode: "물건", subject: "라벤더 토끼", look: "검은 리본" } } };
    const c = { ...컷, image: { url: "u" }, seconds: 5 };
    expect(buildClipPrompt(c, 다른제품)).toBe(buildClipPrompt(c, 제품));
    expect(clipKey(c, 다른제품)).toBe(clipKey(c, 제품));
  });

  it("주제(topic)만 있는 프로젝트도 마찬가지다 — 앵커 폴백이 각인·프롬프트 어디에도 안 샌다", () => {
    const 기획서 = { settings: {}, briefing: { topic: "신발을 주인공으로 한 감각적인 광고 영상" } };
    const 무주제 = { settings: {}, briefing: {} };
    const c = { idx: 0, image: { url: "u" }, seconds: 5, motion: "달린다" };
    expect(buildClipPrompt(c, 기획서)).toBe(buildClipPrompt(c, 무주제));
    expect(clipKey(c, 기획서)).toBe(clipKey(c, 무주제));
  });

  // 무대·인물·톤은 그대로 각인된다 — 이번 변경이 그 넷 중 하나만 걷었다는 보장이다
  it("무대·인물·톤 각인은 살아 있다", () => {
    const c = { ...컷, image: { url: "u" }, seconds: 5 };
    expect(clipKey(c, 제품)).toContain("stage:현관 앞");
    expect(clipKey(c, 제품)).toContain("cast:20대 여성: 검정 코트");
    expect(clipKey(c, 제품)).toContain("tone:차가운 색감");
  });
});
