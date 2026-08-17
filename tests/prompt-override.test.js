// ★ 이 파일이 지키는 것 하나: **덮어쓰기가 없으면 프롬프트가 글자 그대로 지금과 같다.**
// 본문/꼬리로 가르는 리팩터는 조용히 실패한다 — 문구가 한 글자 달라져도 테스트는 초록인데
// 앞으로 만들 그림이 달라진다. 그래서 기대값을 **손으로 적어** 못 박는다.
import { describe, it, expect } from "vitest";
import { buildImagePrompt } from "../lib/cuts.js";

const project = {
  scenario: { focus: { mode: "물건", subject: "black high-top basketball shoe", look: "black upper with red sole" } },
  settings: { aspect_ratio: "9:16" },
};
const cut = { idx: 0, shows: "close-up of the shoe on wet asphalt", tone: "high-contrast night film grain" };

describe("이미지 프롬프트 — 본문과 꼬리", () => {
  it("★ 덮어쓰기가 없으면 지금과 글자 그대로 같다", () => {
    expect(buildImagePrompt(cut, project, [])).toBe(
      "High-quality photographic still for a short-form video, vertical 9:16 composition. " +
      "Scene: close-up of the shoe on wet asphalt. " +
      "The video's subject is: black high-top basketball shoe. " +
      "Keep this exact product/subject consistent in every scene. " +
      "Its appearance, identical in every scene: black upper with red sole. " +
      "Cinematic lighting, realistic, no text or letters in the image. " +
      "Overall look and color treatment, keep identical across all cuts: high-contrast night film grain."
    );
  });

  // 위 컷은 절이 절반쯤 비어 있다(무대·인물·보정·레퍼런스·전환·수정지시가 전부 없다).
  // 그 자리들이 바로 본문과 꼬리의 경계가 지나는 곳이라, 비어 있으면 경계를 잘못 그어도
  // 초록이 나온다 — 붙이는 순서가 뒤바뀌어도 빈 문자열끼리는 티가 안 난다.
  // 그래서 절을 **전부 채운** 컷 하나를 같이 못 박는다.
  it("★ 절이 전부 있는 컷도 지금과 글자 그대로 같다", () => {
    const full = {
      scenario: { focus: { mode: "물건", subject: "walnut espresso tamper", look: "walnut handle with steel base" } },
      settings: { aspect_ratio: "16:9", style: { note: "warm amber grade" } },
      cast: [{ who: "barista", look: "short-haired barista in a linen apron", cuts: [2] }],
    };
    const fullCut = {
      idx: 2,
      shows: "the tamper resting beside a portafilter",
      environment: "a narrow morning cafe counter",
      tone: "soft daylight pastel",
      transition: "wide shot pulling back from the counter",
      edit_instruction: "make the steel base brighter",
    };
    const refs = [{ kind: "person", who: "barista" }, { kind: "thing" }];
    expect(buildImagePrompt(fullCut, full, refs)).toBe(
      "High-quality photographic still for a short-form video, horizontal 16:9 composition. " +
      "Scene: the tamper resting beside a portafilter. " +
      "Setting (same in every scene of this video): a narrow morning cafe counter. " +
      "Characters in this frame (keep them identical across every scene) — barista: short-haired barista in a linen apron. " +
      "The video's subject is: walnut espresso tamper. " +
      "Keep this exact product/subject consistent in every scene. " +
      "Its appearance, identical in every scene: walnut handle with steel base. " +
      "Style note: warm amber grade. " +
      "Cinematic lighting, realistic, no text or letters in the image. " +
      "Attached reference images, in order: [1] barista. " +
      "Draw each of these people as the person in their own numbered image — do not swap them between roles. " +
      "Keep the same person (face, hair, build) as the attached reference — do not invent a different person. " +
      "Use the attached reference only for what the subject looks like — never for its camera angle, its framing, or how much of the frame it fills. " +
      "Keep it at natural real-world size relative to the people and surroundings, and let the scene description alone decide the shot. " +
      "Only the described people appear in this frame — no other people, including in the background. " +
      "Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging). " +
      "Use the attached reference only for what the subject looks like — never for its camera angle, its framing, or how much of the frame it fills. " +
      "Keep it at natural real-world size relative to the people and surroundings, and let the scene description alone decide the shot. " +
      "Overall look and color treatment, keep identical across all cuts: soft daylight pastel. " +
      "Compose the opening framing as: wide shot pulling back from the counter. " +
      "Important correction requested by the user, apply it strictly: make the steel base brighter."
    );
  });
});
