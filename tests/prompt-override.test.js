// ★ 이 파일이 지키는 것 하나: **덮어쓰기가 없으면 프롬프트가 글자 그대로 지금과 같다.**
// 본문/꼬리로 가르는 리팩터는 조용히 실패한다 — 문구가 한 글자 달라져도 테스트는 초록인데
// 앞으로 만들 그림이 달라진다. 그래서 기대값을 **손으로 적어** 못 박는다.
import { describe, it, expect } from "vitest";
import { buildClipPrompt, buildImagePrompt } from "../lib/cuts.js";

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

// 영상 프롬프트는 갈래가 셋이다(내레이션 / 화면 안 대사 / 무음). 본문을 갈라내는 리팩터는
// 셋 다 지나가므로 셋 다 못 박는다 — 하나만 고정하면 나머지 둘이 조용히 달라진다.
//
// ★ 말하는 갈래 둘을 보려면 프로젝트가 **말하는 프로젝트**여야 한다(projectSpeaks):
//   말하는 모델(seedance-2.0)이고, 말하는 컷 전부에 대사와 말할 사람(또는 내레이션 표시)이
//   있어야 한다. settings 가 비면 옛 프로젝트로 보아 Kling(말하지 않음)으로 떨어져
//   대사 갈래가 아예 안 열린다 — 그러면 셋이 아니라 하나만 재는 테스트가 된다.
describe("영상 프롬프트 — 본문과 꼬리", () => {
  it("★ 무음 컷 — 지금과 글자 그대로 같다", () => {
    const c = { idx: 0, motion: "slow push-in", silent: true };
    expect(buildClipPrompt(c, { settings: {} })).toBe(
      "slow push-in. The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters. No talking faces or lip sync."
    );
  });

  it("★ 내레이션 컷 — 지금과 글자 그대로 같다", () => {
    const c = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
    const p = {
      settings: { i2v_model: "seedance-2.0" },
      scenario: { narrator_voice: "calm low male voice" },
      cuts: [c],
    };
    expect(buildClipPrompt(c, p)).toBe(
      "slow push-in. A narrator speaks in voiceover, off-screen — no one in frame speaks or moves their lips. " +
      "Voice: calm low male voice. Says exactly, in Korean: \"핑계 대지 마세요\". " +
      "The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters."
    );
  });

  it("★ 화면 안 대사 컷 — 지금과 글자 그대로 같다", () => {
    const c = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요" };
    const p = {
      settings: { i2v_model: "seedance-2.0" },
      cast: [{ who: "코치", look: "wiry coach in a grey tracksuit", voice: "gravelly veteran voice", cuts: [0] }],
      cuts: [c],
    };
    expect(buildClipPrompt(c, p)).toBe(
      "slow push-in. 코치 speaks to the camera with natural lip sync. " +
      "Voice: gravelly veteran voice. Says exactly, in Korean: \"핑계 대지 마세요\". " +
      "Characters in this frame: 코치: wiry coach in a grey tracksuit. " +
      "The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters."
    );
  });

  // 위 셋은 절이 대부분 비어 있다(움직임 축·속도·무대·제품·톤이 없다). 빈 절끼리는 순서가
  // 뒤바뀌어도 이어 붙인 결과가 같아서, 경계를 잘못 그어도 초록이 나온다.
  // (이미지 쪽 Task 1 에서 뮤테이션으로 실측됐다 — 절을 전부 채운 테스트만이 순서 오류를
  //  잡았다.) 그래서 절을 **전부 채운** 컷 하나를 같이 못 박는다.
  it("★ 절이 전부 있는 컷도 지금과 글자 그대로 같다", () => {
    const c = {
      idx: 1,
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "김이 천천히 피어오른다",
      // 축이 있으면 옛 motion 은 지지 않는다 — 그 우선순위까지 함께 못 박는다.
      motion: "무시되는 옛 지문",
      speed: "fast",
      environment: "a narrow morning cafe counter",
      tone: "soft daylight pastel",
      sentence: "한 모금이면 충분해요",
    };
    const p = {
      settings: { i2v_model: "seedance-2.0" },
      scenario: { focus: { mode: "물건", subject: "walnut espresso tamper", look: "walnut handle with steel base" } },
      cast: [{ who: "barista", look: "short-haired barista in a linen apron", voice: "warm alto voice", cuts: [1] }],
      cuts: [c],
    };
    expect(buildClipPrompt(c, p)).toBe(
      "천천히 뒤로 물러난다. 컵을 들어 입으로 가져간다. 김이 천천히 피어오른다. " +
      "fast, explosive motion. barista speaks to the camera with natural lip sync. " +
      "Voice: warm alto voice. Says exactly, in Korean: \"한 모금이면 충분해요\". " +
      "Setting: a narrow morning cafe counter. " +
      "Characters in this frame: barista: short-haired barista in a linen apron. " +
      "The subject is: walnut espresso tamper. Its appearance: walnut handle with steel base. " +
      "Color treatment, keep identical across all cuts: soft daylight pastel. " +
      "The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters."
    );
  });

  // ★ 대사 절이 꼬리에 남아야 하는 이유 — 같은 문자열을 ffmpeg 가 자막으로 태운다
  //   (lib/subtitles.js). 본문에 있으면 사장님이 본문을 갈아 끼울 때 들리는 말과 화면의
  //   자막이 갈린다. 위 전문 고정이 이미 자리를 못 박지만, 그 자리가 **왜** 거기인지는
  //   전문만 보고는 안 읽히므로 따로 한 줄 세운다.
  it("★ 대사 절이 꼬리에 남는다 — 자막과 갈리면 안 된다", () => {
    const c = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
    const p = {
      settings: { i2v_model: "seedance-2.0" },
      scenario: { narrator_voice: "calm low male voice" },
      cuts: [c],
    };
    expect(buildClipPrompt(c, p)).toContain('Says exactly, in Korean: "핑계 대지 마세요"');
  });

  // 절이 전부 찬 컷을 **내레이션 갈래에도** 따로 둔다. 위의 것은 화면 안 대사 갈래라,
  // 내레이션 return 의 절 순서는 아무도 재지 않았다 — 리뷰 실측: `${context}` 를 문장
  // 맨 끝으로 옮겨도 전체가 초록이었다. 갈래마다 이어 붙이는 문자열이 따로 있으므로
  // 그물도 갈래마다 있어야 한다.
  it("★ 절이 전부 있는 내레이션 컷도 지금과 글자 그대로 같다", () => {
    const c = {
      idx: 1,
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "김이 천천히 피어오른다",
      speed: "fast",
      environment: "a narrow morning cafe counter",
      tone: "soft daylight pastel",
      sentence: "한 모금이면 충분해요",
      narration: true,
    };
    const p = {
      settings: { i2v_model: "seedance-2.0" },
      scenario: {
        narrator_voice: "calm low male voice",
        focus: { mode: "물건", subject: "walnut espresso tamper", look: "walnut handle with steel base" },
      },
      // 화면 밖 목소리라도 화면에는 사람이 있을 수 있다 — 인물 절이 비지 않게 캐스팅을 둔다.
      cast: [{ who: "barista", look: "short-haired barista in a linen apron", voice: "warm alto voice", cuts: [1] }],
      cuts: [c],
    };
    expect(buildClipPrompt(c, p)).toBe(
      "천천히 뒤로 물러난다. 컵을 들어 입으로 가져간다. 김이 천천히 피어오른다. " +
      "fast, explosive motion. A narrator speaks in voiceover, off-screen — no one in frame speaks or moves their lips. " +
      "Voice: calm low male voice. Says exactly, in Korean: \"한 모금이면 충분해요\". " +
      "Setting: a narrow morning cafe counter. " +
      "Characters in this frame: barista: short-haired barista in a linen apron. " +
      "The subject is: walnut espresso tamper. Its appearance: walnut handle with steel base. " +
      "Color treatment, keep identical across all cuts: soft daylight pastel. " +
      "The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters."
    );
  });

  // ★ 본문의 폴백 문구 — 움직임 축 셋과 옛 `motion` 이 **전부 빈** 컷이 타는 자리다
  //   (옛 프로젝트, 또는 화면 설계가 통째로 실패한 경우).
  //
  // ⚠️ 이 문자열은 각인(lib/steps.js 의 clipKey)에 그대로 들어간다. 바뀌면 그런 컷들의
  //    **살아 있는 클립이 통째로 낡아 유료 재구매가 열린다**(Seedance 30초 한 편 ~$9).
  //    문구를 고칠 이유는 앞으로 생긴다 — 움직임 축을 영어로 옮기는 작업이 이 한국어
  //    폴백까지 함께 "영문화"할 자리다. 그때 이 테스트가 빨개져야 값을 치르는 결정임이
  //    보인다.
  //
  // 기대값을 lib/cuts.js 에서 import 하지 않고 **손으로 적는** 이유: 상수를 끌어오면
  // 동어반복이라 문구가 바뀌어도 늘 초록이다.
  it("★ 축도 motion 도 없는 컷의 폴백 문구는 각인에 들어간다 — 바뀌면 클립을 다시 산다", () => {
    expect(buildClipPrompt({ idx: 0 }, { settings: {} })).toBe(
      "거의 정지 상태, 아주 느린 카메라 이동. " +
      "The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters. No talking faces or lip sync."
    );
  });
});
