// ★ 이 파일이 지키는 것 하나: **덮어쓰기가 없으면 프롬프트가 글자 그대로 지금과 같다.**
// 본문/꼬리로 가르는 리팩터는 조용히 실패한다 — 문구가 한 글자 달라져도 테스트는 초록인데
// 앞으로 만들 그림이 달라진다. 그래서 기대값을 **손으로 적어** 못 박는다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildClipPrompt, buildImagePrompt, promptBodyOf } from "../lib/cuts.js";
// 상한 숫자를 이 파일에 적지 않는다 — 원장이 자르는 자리 하나에서 온다(Ruling 11).
import { LEDGER_PROMPT_MAX } from "../lib/costs.js";
import { imageContextKey, clipKey, isImageStale, isClipStale } from "../lib/steps.js";
import { normalizePromptNote, PROMPT_NOTE_MAX, STYLE_NOTE_MAX } from "../lib/styles.js";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

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

// 여기서 처음으로 **동작이 바뀐다.** 위의 전문 고정들은 그대로 초록이어야 한다 —
// 덮어쓰기가 없는 프롬프트는 글자 하나도 달라지지 않는다는 것이 이 기능의 첫 계약이다.
describe("컷별 프롬프트 덮어쓰기", () => {
  it("★ 덮어써도 꼬리는 남는다 — 글자 금지가 지워지지 않는다", () => {
    const c = { ...cut, image_prompt: "A huge neon sign that says SALE in big letters" };
    const out = buildImagePrompt(c, project, []);
    expect(out).toContain("A huge neon sign that says SALE in big letters");
    expect(out, "글자 금지가 사라졌다 — 사장님 입력이 우리 계약을 지웠다").toContain("no text or letters in the image");
  });

  // ★ 판형은 지금 **본문 문형 안에** 있다(`${orient} composition`). 본문을 통째로 갈아
  //   끼우면 함께 사라지므로 덮어쓰기 경로에서 다시 붙인다 — 판형이 틀리면 합성이 깨진다.
  it("★ 덮어쓰면 판형이 꼬리에 붙는다 — 본문이 통째로 갈렸으므로", () => {
    const c = { ...cut, image_prompt: "A cat" };
    expect(buildImagePrompt(c, project, [])).toContain("vertical 9:16 composition");
  });

  // 절 순서까지 못 박는다 — toContain 만으로는 판형이 꼬리 어디에 붙든 초록이다.
  it("★ 이미지 덮어쓰기 전문 — 본문만 갈리고 꼬리는 그대로다", () => {
    const c = { ...cut, image_prompt: "A cat" };
    expect(buildImagePrompt(c, project, [])).toBe(
      "A cat. vertical 9:16 composition. " +
      "Cinematic lighting, realistic, no text or letters in the image. " +
      "Overall look and color treatment, keep identical across all cuts: high-contrast night film grain."
    );
  });

  it("★ 영상 덮어쓰기 — 대사는 사장님이 못 지운다", () => {
    const c = { idx: 0, sentence: "핑계 대지 마세요", narration: true, clip_prompt: "the shoe explodes" };
    const p = {
      ...project,
      settings: { ...project.settings, i2v_model: "seedance-2.0" },
      scenario: { ...project.scenario, narrator_voice: "calm low male voice" },
      cuts: [c],
    };
    const out = buildClipPrompt(c, p);
    expect(out).toContain("the shoe explodes");
    expect(out).toContain('Says exactly, in Korean: "핑계 대지 마세요"');
  });

  // ★ 영상 쪽에는 판형을 **붙이지 않는다** — 클립 프롬프트에는 애초에 판형 절이 없고
  //   (lib/i2v.js 가 aspect_ratio 를 별도 요청 필드로 보낸다), 없던 절을 여기서 만들면
  //   덮어쓴 컷만 프롬프트 모양이 달라진다.
  it("★ 영상 덮어쓰기 전문 — 판형이 붙지 않고 꼬리만 남는다", () => {
    const c = { idx: 0, motion: "slow push-in", clip_prompt: "the shoe explodes" };
    expect(buildClipPrompt(c, { settings: { aspect_ratio: "9:16" } })).toBe(
      "the shoe explodes. The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters. No talking faces or lip sync."
    );
  });

  // ★ 이음매 마침표 — 축 이음매(clipPromptBody)와 같은 문제다. 없으면 두 지시가 한 문장으로
  //   붙어 읽힌다("the shoe explodes The attached image is the first frame …").
  //   정규화는 promptOverride 한 자리라 이미지·영상이 함께 고쳐진다 — **둘 다** 잰다.
  it("★ 마침표 없는 덮어쓰기에는 마침표가 붙는다 — 두 지시가 한 문장으로 붙으면 안 된다", () => {
    expect(buildImagePrompt({ ...cut, image_prompt: "a cat on a red sofa" }, project, []))
      .toContain("a cat on a red sofa. vertical 9:16 composition.");
    expect(buildClipPrompt({ idx: 0, clip_prompt: "the shoe explodes" }, { settings: {} }))
      .toContain("the shoe explodes. The attached image");
  });

  it("★ 이미 마침표로 끝나면 그대로 둔다 — '..' 가 되면 안 된다", () => {
    const img = buildImagePrompt({ ...cut, image_prompt: "a cat on a red sofa." }, project, []);
    expect(img).toContain("a cat on a red sofa. vertical 9:16 composition.");
    expect(img).not.toContain("..");
    const clip = buildClipPrompt({ idx: 0, clip_prompt: "the shoe explodes." }, { settings: {} });
    expect(clip).toContain("the shoe explodes. The attached image");
    expect(clip).not.toContain("..");
  });

  it("★ 물음표·느낌표로 끝나도 붙이지 않는다 — 문장은 이미 닫혀 있다", () => {
    expect(buildImagePrompt({ ...cut, image_prompt: "why not a cat?" }, project, []))
      .toContain("why not a cat? vertical 9:16 composition.");
    expect(buildClipPrompt({ idx: 0, clip_prompt: "it explodes!" }, { settings: {} }))
      .toContain("it explodes! The attached image");
    // 전각 부호 — 사장님은 한국어로 쓴다. 한글 입력에서 이 부호들이 섞여 나온다.
    expect(buildClipPrompt({ idx: 0, clip_prompt: "신발이 터진다。" }, { settings: {} }))
      .toContain("신발이 터진다。 The attached image");
    expect(buildClipPrompt({ idx: 0, clip_prompt: "신발이 터진다！" }, { settings: {} }))
      .toContain("신발이 터진다！ The attached image");
    expect(buildClipPrompt({ idx: 0, clip_prompt: "신발이 터질까？" }, { settings: {} }))
      .toContain("신발이 터질까？ The attached image");
  });

  // ★ 이것이 "원래대로" 버튼의 구현이다 — 별도 필드를 두지 않는다. 사장님이 칸을 비우면
  //   코드가 만든 본문으로 돌아간다.
  it("빈 문자열·공백은 덮어쓰기가 아니다 — 코드가 만든 본문으로 돌아간다", () => {
    expect(buildImagePrompt({ ...cut, image_prompt: "   " }, project, []))
      .toBe(buildImagePrompt(cut, project, []));
    expect(buildImagePrompt({ ...cut, image_prompt: "" }, project, []))
      .toBe(buildImagePrompt(cut, project, []));
  });

  it("빈 문자열·공백은 영상에서도 덮어쓰기가 아니다", () => {
    const c = { idx: 0, motion: "slow push-in" };
    expect(buildClipPrompt({ ...c, clip_prompt: "   " }, { settings: {} }))
      .toBe(buildClipPrompt(c, { settings: {} }));
  });

  // 문자열이 아닌 값(옛 문서·잘못된 저장)이 본문을 "undefined" 로 갈아 끼우면 안 된다.
  it("문자열이 아닌 값은 덮어쓰기가 아니다", () => {
    expect(buildImagePrompt({ ...cut, image_prompt: { text: "A cat" } }, project, []))
      .toBe(buildImagePrompt(cut, project, []));
    const c = { idx: 0, motion: "slow push-in" };
    expect(buildClipPrompt({ ...c, clip_prompt: 7 }, { settings: {} }))
      .toBe(buildClipPrompt(c, { settings: {} }));
  });
});

// ── 덮어쓰기와 각인 ────────────────────────────────────────────────────────
//
// 위까지는 "프롬프트가 어떻게 만들어지는가"였고, 여기부터는 **"고치면 산출물이 낡는가"**다.
// 덮어쓰기를 프롬프트에만 실으면 사장님이 프롬프트를 고쳐도 화면은 조용하다 — 이미 만든
// 그림·클립이 옛 프롬프트로 만들어진 것인데 "최신"으로 보인다. 화면과 실물이 갈린다.
//
// 반대 방향이 더 비싸다: 안 실리는 것을 각인에 담으면 **거짓 낡음이 유료 버튼을 연다**
// (그림 컷당 $0.08, Seedance 30초 한 편 ~$9). 그래서 이 그물의 첫 줄은 "덮어쓰기가 없는
// 컷의 각인은 글자 그대로 그대로다"이다.
describe("덮어쓰기와 각인", () => {
  // 절이 **전부 채워진** 컷이다. 절이 빈 픽스처는 순서 오류를 못 잡는다(Task 1 실측) —
  // 빈 문자열끼리는 붙이는 차례가 뒤바뀌어도 이어 붙인 결과가 같다.
  // ★ 대사 갈래를 열려면 말하는 모델(seedance-2.0)이어야 하고 cuts 에 그 컷이 있어야 한다.
  const full = {
    settings: { i2v_model: "seedance-2.0" },
    scenario: {
      narrator_voice: "calm low male voice",
      focus: { mode: "물건", subject: "walnut espresso tamper", look: "walnut handle with steel base" },
    },
    cast: [{ who: "barista", look: "short-haired barista in a linen apron", voice: "warm alto voice", cuts: [1] }],
  };
  const fullCut = {
    idx: 1,
    shows: "the tamper resting beside a portafilter",
    environment: "a narrow morning cafe counter",
    tone: "soft daylight pastel",
    camera: "천천히 뒤로 물러난다",
    subject: "컵을 들어 입으로 가져간다",
    // 움직임 셋째 축은 background 가 아니라 ambient 다.
    ambient: "김이 천천히 피어오른다",
    speed: "fast",
    seconds: 5,
    sentence: "한 모금이면 충분해요",
    narration: true,
    image: { url: "https://img/1.png" },
  };
  full.cuts = [fullCut];

  // 기대값을 함수에서 만들지 않고 **손으로 적는다** — 구현으로 기대값을 만들면 동어반복이라
  // 항목을 빼도 순서를 바꿔도 늘 초록이다.
  const IMG_BASE =
    "stage:a narrow morning cafe counter" +
    "|cast:barista: short-haired barista in a linen apron" +
    "|subject:walnut espresso tamper:walnut handle with steel base";
  const CLIP_BASE =
    "https://img/1.png|5||fast|한 모금이면 충분해요|calm low male voice||narration" +
    "|stage:a narrow morning cafe counter" +
    "|cast:barista: short-haired barista in a linen apron" +
    "|subject:walnut espresso tamper:walnut handle with steel base" +
    "|tone:soft daylight pastel" +
    '|motion:[{"id":"camera","text":"천천히 뒤로 물러난다"},{"id":"subject","text":"컵을 들어 입으로 가져간다"},{"id":"ambient","text":"김이 천천히 피어오른다"}]';

  it("★ 덮어쓰기가 없는 컷의 각인은 글자 그대로 그대로다", () => {
    // 이 단언이 지키는 것: 지금 저장된 산출물이 통째로 낡아 재구매가 제시되지 않는다.
    // 절이 전부 찬 컷으로 재는 이유는 위 픽스처 주석에 있다.
    expect(imageContextKey(fullCut, full)).toBe(IMG_BASE);
    expect(clipKey(fullCut, full)).toBe(CLIP_BASE);
    const bare = { idx: 0, shows: "a shoe" };
    expect(imageContextKey(bare, project)).not.toContain("prompt:");
    expect(clipKey(bare, project)).not.toContain("prompt:");
  });

  // ★ Task 5 와의 계약: 각인 항목 차례는 **기존 → prompt → imgnote/clipnote** 다.
  //   prompt 가 맨 뒤에 붙어 있어야 Task 5 가 그 뒤에 이어 붙일 수 있다. 차례가 갈리면
  //   같은 값인데 각인 문자열이 달라져 병합 시점에 산출물이 낡는다 — 그래서 toContain 이
  //   아니라 **전문**으로 못 박는다.
  it("★ 덮어쓰기 각인은 기존 항목 맨 뒤에 붙는다 — 다음 태스크가 그 뒤에 잇는다", () => {
    // 마침표는 promptOverride 가 채운 것이다 — 각인은 **프롬프트에 실제로 실리는 값**을 담는다.
    expect(imageContextKey({ ...fullCut, image_prompt: "a red shoe" }, full))
      .toBe(`${IMG_BASE}|prompt:a red shoe.`);
    expect(clipKey({ ...fullCut, clip_prompt: "it explodes" }, full))
      .toBe(`${CLIP_BASE}|prompt:it explodes.`);
  });

  // ★ 이 파일의 불변을 한 줄로: **프롬프트가 같으면 각인도 같다.**
  //   각인이 `trim()` 만 보던 동안 이것이 깨져 있었다 — 사장님이 이미 적은 덮어쓰기 끝에
  //   마침표만 더하면 나가는 프롬프트는 한 글자도 안 바뀌는데 각인이 갈려 **거짓 낡음**이
  //   유료 [다시 만들기]를 열었다(그림 컷당 $0.08, Seedance 30초 한 편 ~$9).
  //   프롬프트 단언과 각인 단언을 **나란히** 두는 이유가 그것이다 — 둘이 같이 움직여야 한다.
  it("★ 마침표만 더한 덮어쓰기는 프롬프트도 각인도 같다 — 거짓 낡음이 유료 버튼을 열면 안 된다", () => {
    const a = { ...fullCut, image_prompt: "a red shoe", clip_prompt: "it explodes" };
    const b = { ...fullCut, image_prompt: "a red shoe.", clip_prompt: "it explodes." };
    expect(buildImagePrompt(a, full, [])).toBe(buildImagePrompt(b, full, []));
    expect(imageContextKey(a, full)).toBe(imageContextKey(b, full));
    expect(buildClipPrompt(a, full)).toBe(buildClipPrompt(b, full));
    expect(clipKey(a, full)).toBe(clipKey(b, full));
    // 앞뒤 공백도 마찬가지다 — promptOverride 가 떼므로 프롬프트가 안 갈린다.
    const c = { ...fullCut, image_prompt: "  a red shoe.  ", clip_prompt: "  it explodes.  " };
    expect(imageContextKey(c, full)).toBe(imageContextKey(b, full));
    expect(clipKey(c, full)).toBe(clipKey(b, full));
  });

  // 반대 방향 — 정규화가 **다른 내용까지** 같게 만들면 고쳐도 안 낡는다.
  it("★ 내용이 다른 덮어쓰기는 여전히 각인이 갈린다", () => {
    expect(imageContextKey({ ...fullCut, image_prompt: "a red shoe" }, full))
      .not.toBe(imageContextKey({ ...fullCut, image_prompt: "a red shoe!" }, full));
    expect(clipKey({ ...fullCut, clip_prompt: "it explodes." }, full))
      .not.toBe(clipKey({ ...fullCut, clip_prompt: "it melts." }, full));
  });

  it("★ 덮어쓰면 각인이 바뀐다 — 고쳤는데 조용히 지나가지 않는다", () => {
    const bare = { idx: 0, shows: "a shoe" };
    const edited = { ...bare, image_prompt: "a red shoe" };
    expect(imageContextKey(edited, project)).not.toBe(imageContextKey(bare, project));
    const cbare = { idx: 0, image: { url: "u" }, seconds: 5, motion: "slow" };
    expect(clipKey({ ...cbare, clip_prompt: "it explodes" }, project)).not.toBe(clipKey(cbare, project));
  });

  // 덮어쓰기를 **고치면** 각인이 또 달라져야 한다 — 한 번 붙고 마는 표식이면
  // 두 번째 수정부터 조용해진다.
  it("★ 덮어쓰기를 고치면 각인도 따라 바뀐다", () => {
    const a = imageContextKey({ ...fullCut, image_prompt: "a red shoe" }, full);
    const b = imageContextKey({ ...fullCut, image_prompt: "a blue shoe" }, full);
    expect(a).not.toBe(b);
    const c = clipKey({ ...fullCut, clip_prompt: "it explodes" }, full);
    const d = clipKey({ ...fullCut, clip_prompt: "it melts" }, full);
    expect(c).not.toBe(d);
  });

  // ★ 프롬프트가 안 갈리는 값은 각인도 안 갈려야 한다. lib/cuts.js 의 promptOverride 가
  //   공백을 떼고 문자열이 아닌 값을 무시하므로, 그런 값으로 각인만 달라지면 프롬프트가
  //   똑같은데 낡았다고 말하게 된다 — 그 버튼은 유료다.
  it("★ 공백뿐인 값·문자열 아닌 값은 각인을 안 건드린다 — 프롬프트가 안 갈리므로", () => {
    expect(imageContextKey({ ...fullCut, image_prompt: "   " }, full)).toBe(IMG_BASE);
    expect(imageContextKey({ ...fullCut, image_prompt: "" }, full)).toBe(IMG_BASE);
    expect(imageContextKey({ ...fullCut, image_prompt: { text: "a cat" } }, full)).toBe(IMG_BASE);
    expect(clipKey({ ...fullCut, clip_prompt: "   " }, full)).toBe(CLIP_BASE);
    expect(clipKey({ ...fullCut, clip_prompt: 7 }, full)).toBe(CLIP_BASE);
  });

  // 각인은 값을 담는 것으로 끝이 아니다 — 낡음 판정이 실제로 그것을 띄워야 화면에
  // [다시 만들기]가 뜬다.
  it("★ 덮어쓴 컷의 그림이 낡음으로 뜬다", () => {
    const shows = "a shoe";
    const cutWithImage = {
      idx: 0,
      shows,
      image: { url: "u", of: shows, context_of: imageContextKey({ idx: 0, shows }, project) },
      image_prompt: "a red shoe",
    };
    expect(isImageStale(cutWithImage, project)).toBe(true);
    // 그리고 안 고친 컷은 낡지 않는다 — 거짓 낡음이 유료 버튼을 열면 안 된다.
    const { image_prompt, ...untouched } = cutWithImage;
    expect(isImageStale(untouched, project)).toBe(false);
  });

  it("★ 덮어쓴 컷의 클립이 낡음으로 뜬다", () => {
    const base = { idx: 0, image: { url: "u" }, seconds: 5, motion: "slow" };
    const edited = { ...base, clip_prompt: "it explodes" };
    const withVideo = { ...edited, video: { url: "v", of: clipKey(base, project) } };
    expect(isClipStale(withVideo, project)).toBe(true);
    const { clip_prompt, ...untouched } = withVideo;
    expect(isClipStale(untouched, project)).toBe(false);
  });
});

// ── 프로젝트 공통 지시 (settings.image_note · settings.clip_note) ───────────
//
// 컷별 덮어쓰기는 **한 컷**을 갈아 끼우고, 이 둘은 **전 컷**에 실린다. 사장님이 밖에서
// 써 온 프롬프트를 그대로 넣는 자리다.
//
// ★ 그래서 자리가 본문 안이 아니다 — 본문은 컷별 덮어쓰기가 통째로 대체하므로, 공통
//   지시를 본문에 넣으면 덮어쓴 그 컷만 조용히 공통 지시를 잃는다. 화면에 적는 말이
//   "모든 이미지에 함께 보낼 지시"인데 거짓말이 된다. 본문과 계약 꼬리 **사이**다.
describe("프로젝트 공통 지시", () => {
  it("★ 화풍 보정보다 넉넉하다 — 밖에서 써 온 프롬프트가 들어가야 한다", () => {
    // 이 단언이 지키는 것: style.note 를 재사용하지 않기로 한 이유 그 자체다.
    // 상한이 120 이면 붙여넣기부터 거절당한다(밖에서 써 온 프롬프트는 300~800자다).
    expect(PROMPT_NOTE_MAX).toBeGreaterThan(STYLE_NOTE_MAX);
    expect(normalizePromptNote("a".repeat(400), "영상 지시")).toHaveLength(400);
  });

  it("개행을 눕히고 앞뒤를 걷는다 — 프롬프트는 한 줄이다", () => {
    expect(normalizePromptNote("  hand-held\n  documentary feel  ", "영상 지시"))
      .toBe("hand-held documentary feel");
  });

  it("너무 길면 던지고, 이름이 문구에 들어간다", () => {
    expect(() => normalizePromptNote("가".repeat(PROMPT_NOTE_MAX + 1), "영상 지시"))
      .toThrow(/영상 지시.*자까지/);
  });

  it("값이 없으면 빈 문자열이다 — 문자열이 아니면 던진다", () => {
    expect(normalizePromptNote(undefined, "영상 지시")).toBe("");
    expect(normalizePromptNote(null, "영상 지시")).toBe("");
    expect(() => normalizePromptNote(7, "이미지 지시")).toThrow(/이미지 지시/);
  });

  it("★ 클립 프롬프트에 실리고, 꼬리보다 앞이다", () => {
    const p = { settings: { clip_note: "hand-held documentary feel" } };
    const out = buildClipPrompt({ idx: 0, motion: "slow push-in", silent: true }, p);
    expect(out).toContain("hand-held documentary feel");
    expect(out.indexOf("hand-held")).toBeLessThan(out.indexOf("The attached image is the first frame"));
  });

  it("★ 이미지 프롬프트에도 실리고, 글자 금지보다 앞이다", () => {
    const p = { ...project, settings: { ...project.settings, image_note: "shot on 35mm film" } };
    const out = buildImagePrompt(cut, p, []);
    expect(out).toContain("shot on 35mm film");
    expect(out.indexOf("35mm")).toBeLessThan(out.indexOf("no text or letters"));
  });

  // ★★ 이 파일의 다른 어떤 단언도 이것을 대신하지 못한다. 컷별 덮어쓰기(Task 3)는 본문을
  //    **통째로** 대체하므로, 공통 지시가 본문 안에 있으면 덮어쓴 컷에서만 사라진다 —
  //    전 컷에 실린다는 약속이 컷 하나에서 조용히 깨진다.
  it("★ 덮어쓴 컷에도 프로젝트 공통 지시가 남는다", () => {
    const p = { ...project, settings: { ...project.settings, image_note: "shot on 35mm film" } };
    expect(buildImagePrompt({ ...cut, image_prompt: "a cat" }, p, [])).toContain("shot on 35mm film");
  });

  it("★ 덮어쓴 컷에도 영상 공통 지시가 남는다", () => {
    const p = { settings: { clip_note: "hand-held documentary feel" } };
    expect(buildClipPrompt({ idx: 0, clip_prompt: "the shoe explodes" }, p))
      .toContain("hand-held documentary feel");
  });

  // 말하는 갈래 둘(내레이션·화면 안 대사)도 각자 이어 붙이는 문자열이 따로다 —
  // 한 갈래만 재면 나머지가 조용히 빠진다(이 파일이 이미 두 번 겪은 자리다).
  it("★ 대사 갈래 둘에도 실린다 — 갈래마다 이어 붙이는 문자열이 따로다", () => {
    const c = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
    const narr = {
      settings: { i2v_model: "seedance-2.0", clip_note: "hand-held documentary feel" },
      scenario: { narrator_voice: "calm low male voice" },
      cuts: [c],
    };
    const outN = buildClipPrompt(c, narr);
    expect(outN).toContain("hand-held documentary feel");
    expect(outN.indexOf("hand-held")).toBeLessThan(outN.indexOf("The attached image is the first frame"));

    const c2 = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요" };
    const on = {
      settings: { i2v_model: "seedance-2.0", clip_note: "hand-held documentary feel" },
      cast: [{ who: "코치", look: "wiry coach in a grey tracksuit", voice: "gravelly veteran voice", cuts: [0] }],
      cuts: [c2],
    };
    const outS = buildClipPrompt(c2, on);
    expect(outS).toContain("hand-held documentary feel");
    expect(outS.indexOf("hand-held")).toBeLessThan(outS.indexOf("The attached image is the first frame"));
  });

  it("★ 없으면 프롬프트도 각인도 글자 그대로 그대로다", () => {
    const bare = { idx: 0, motion: "slow", image: { url: "u" } };
    expect(buildClipPrompt(bare, { settings: {} })).toBe(buildClipPrompt(bare, {}));
    expect(clipKey(bare, { settings: {} })).not.toContain("clipnote:");
    expect(imageContextKey(cut, project)).not.toContain("imgnote:");
    // 빈 문자열·공백뿐인 값도 "없음"이다 — 그런 값으로 프롬프트가 갈리면 산 산출물이 낡는다.
    expect(buildImagePrompt(cut, { ...project, settings: { ...project.settings, image_note: "   " } }, []))
      .toBe(buildImagePrompt(cut, project, []));
    expect(buildClipPrompt(bare, { settings: { clip_note: "" } })).toBe(buildClipPrompt(bare, { settings: {} }));
  });

  // ★ Ruling 2 — 각인 항목은 prompt **뒤**다. Task 4 가 앞자리 차례를 전문으로 못 박았으니
  //   새 항목은 그 뒤에 이어 붙어야 한다. 차례가 갈리면 같은 값인데 각인 문자열이 달라져
  //   살아 있는 산출물이 통째로 낡는다(그림 컷당 $0.08, Seedance 30초 한 편 ~$9).
  describe("공통 지시와 각인", () => {
    const full = {
      settings: { i2v_model: "seedance-2.0" },
      scenario: {
        narrator_voice: "calm low male voice",
        focus: { mode: "물건", subject: "walnut espresso tamper", look: "walnut handle with steel base" },
      },
      cast: [{ who: "barista", look: "short-haired barista in a linen apron", voice: "warm alto voice", cuts: [1] }],
    };
    const fullCut = {
      idx: 1,
      shows: "the tamper resting beside a portafilter",
      environment: "a narrow morning cafe counter",
      tone: "soft daylight pastel",
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "김이 천천히 피어오른다",
      speed: "fast",
      seconds: 5,
      sentence: "한 모금이면 충분해요",
      narration: true,
      image: { url: "https://img/1.png" },
    };
    full.cuts = [fullCut];
    const noted = (extra) => ({ ...full, settings: { ...full.settings, ...extra } });

    // 손으로 적는다 — 구현으로 기대값을 만들면 동어반복이라 차례를 바꿔도 늘 초록이다.
    const IMG_BASE =
      "stage:a narrow morning cafe counter" +
      "|cast:barista: short-haired barista in a linen apron" +
      "|subject:walnut espresso tamper:walnut handle with steel base";
    const CLIP_BASE =
      "https://img/1.png|5||fast|한 모금이면 충분해요|calm low male voice||narration" +
      "|stage:a narrow morning cafe counter" +
      "|cast:barista: short-haired barista in a linen apron" +
      "|subject:walnut espresso tamper:walnut handle with steel base" +
      "|tone:soft daylight pastel" +
      '|motion:[{"id":"camera","text":"천천히 뒤로 물러난다"},{"id":"subject","text":"컵을 들어 입으로 가져간다"},{"id":"ambient","text":"김이 천천히 피어오른다"}]';

    it("★ 공통 지시 각인은 prompt 뒤에 붙는다", () => {
      expect(imageContextKey(fullCut, noted({ image_note: "shot on 35mm film" })))
        .toBe(`${IMG_BASE}|imgnote:shot on 35mm film.`);
      expect(imageContextKey({ ...fullCut, image_prompt: "a red shoe" }, noted({ image_note: "shot on 35mm film" })))
        .toBe(`${IMG_BASE}|prompt:a red shoe.|imgnote:shot on 35mm film.`);
      expect(clipKey(fullCut, noted({ clip_note: "hand-held documentary feel" })))
        .toBe(`${CLIP_BASE}|clipnote:hand-held documentary feel.`);
      expect(clipKey({ ...fullCut, clip_prompt: "it explodes" }, noted({ clip_note: "hand-held documentary feel" })))
        .toBe(`${CLIP_BASE}|prompt:it explodes.|clipnote:hand-held documentary feel.`);
    });

    it("★ 공통 지시가 없으면 각인이 글자 그대로 그대로다 — 있을 때만 붙는다", () => {
      expect(imageContextKey(fullCut, full)).toBe(IMG_BASE);
      expect(clipKey(fullCut, full)).toBe(CLIP_BASE);
      // 빈 값·공백뿐인 값·문자열 아닌 값도 붙지 않는다(프롬프트가 안 갈리므로).
      expect(imageContextKey(fullCut, noted({ image_note: "   " }))).toBe(IMG_BASE);
      expect(clipKey(fullCut, noted({ clip_note: 7 }))).toBe(CLIP_BASE);
    });

    // ★ Ruling 7 — 프롬프트와 각인이 **같은 값**을 읽는다. 한쪽에만 정규화를 넣으면
    //   프롬프트가 같은데 각인만 갈려 거짓 낡음이 유료 버튼을 연다(Task 4 에서 겪었다).
    it("★ 프롬프트가 같으면 각인도 같다 — 앞뒤 공백은 양쪽 다 걷는다", () => {
      const a = noted({ image_note: "shot on 35mm film", clip_note: "hand-held documentary feel" });
      const b = noted({ image_note: "  shot on 35mm film  ", clip_note: "  hand-held documentary feel  " });
      expect(buildImagePrompt(fullCut, a, [])).toBe(buildImagePrompt(fullCut, b, []));
      expect(imageContextKey(fullCut, a)).toBe(imageContextKey(fullCut, b));
      expect(buildClipPrompt(fullCut, a)).toBe(buildClipPrompt(fullCut, b));
      expect(clipKey(fullCut, a)).toBe(clipKey(fullCut, b));
    });

    it("★ 공통 지시를 고치면 산출물이 낡는다 — 고쳤는데 조용히 지나가지 않는다", () => {
      const a = noted({ image_note: "shot on 35mm film", clip_note: "hand-held documentary feel" });
      const b = noted({ image_note: "shot on 16mm film", clip_note: "locked-off tripod feel" });
      expect(imageContextKey(fullCut, a)).not.toBe(imageContextKey(fullCut, b));
      expect(clipKey(fullCut, a)).not.toBe(clipKey(fullCut, b));
      expect(imageContextKey(fullCut, a)).not.toBe(imageContextKey(fullCut, full));
      expect(clipKey(fullCut, a)).not.toBe(clipKey(fullCut, full));
    });

    // ★ 끝 부호도 덮어쓰기와 **같은 규칙**이다(lib/clauses.js closeSentence).
    //   고치기 전에는 조립이 마침표를 무조건 붙여 "shot on 35mm film.." · "Use warm light!."
    //   가 그대로 나갔다. 규칙을 **판독 함수 안**에 두면 프롬프트도 각인도 같은 정규화된
    //   값을 보므로 Ruling 7 이 지켜진다 — 두 단언을 나란히 두는 이유가 그것이다.
    it("★ 마침표만 더한 공통 지시는 프롬프트도 각인도 같다 — 거짓 낡음이 유료 버튼을 열면 안 된다", () => {
      const a = noted({ image_note: "shot on 35mm film", clip_note: "hand-held documentary feel" });
      const b = noted({ image_note: "shot on 35mm film.", clip_note: "hand-held documentary feel." });
      expect(buildImagePrompt(fullCut, a, [])).toBe(buildImagePrompt(fullCut, b, []));
      expect(imageContextKey(fullCut, a)).toBe(imageContextKey(fullCut, b));
      expect(buildClipPrompt(fullCut, a)).toBe(buildClipPrompt(fullCut, b));
      expect(clipKey(fullCut, a)).toBe(clipKey(fullCut, b));
      // 그리고 실제로 ".." 가 아니다 — 위 단언은 둘이 같다고만 말한다.
      expect(buildImagePrompt(fullCut, b, [])).toContain("shot on 35mm film. Cinematic lighting");
      expect(buildImagePrompt(fullCut, b, [])).not.toContain("..");
      expect(buildClipPrompt(fullCut, b)).toContain("hand-held documentary feel. The attached image");
      expect(buildClipPrompt(fullCut, b)).not.toContain("..");
    });

    it("★ 물음표·느낌표·전각 부호로 끝나면 마침표를 안 붙인다 — 문장은 이미 닫혀 있다", () => {
      const img = buildImagePrompt(fullCut, noted({ image_note: "Use warm light!" }), []);
      expect(img).toContain("Use warm light! Cinematic lighting");
      expect(img).not.toContain("!.");
      const q = buildImagePrompt(fullCut, noted({ image_note: "why not warm light?" }), []);
      expect(q).toContain("why not warm light? Cinematic lighting");
      expect(q).not.toContain("?.");
      // 전각 — 사장님은 한국어로 쓴다. 한글 입력에서 이 부호들이 섞여 나온다.
      for (const note of ["따뜻한 빛으로。", "따뜻한 빛으로！", "따뜻한 빛으로？"]) {
        const clip = buildClipPrompt(fullCut, noted({ clip_note: note }));
        expect(clip).toContain(`${note} The attached image`);
        expect(clip).not.toContain(`${note}.`);
        // 각인도 같은 값을 본다 — 한쪽만 정규화하면 거짓 낡음이 된다.
        expect(clipKey(fullCut, noted({ clip_note: note }))).toBe(`${CLIP_BASE}|clipnote:${note}`);
      }
    });

    // 갈래마다 이어 붙이는 문자열이 따로라 부호도 갈래마다 재야 한다 — 한 갈래만 재면
    // 나머지에서 ".." 가 조용히 남는다.
    it("★ 영상 세 갈래 전부에서 부호가 겹치지 않는다", () => {
      const note = { clip_note: "hand-held documentary feel." };
      // 무음
      const silent = { idx: 0, motion: "slow push-in", silent: true };
      expect(buildClipPrompt(silent, { settings: { ...note } }))
        .toContain("hand-held documentary feel. The attached image");
      // 내레이션
      const nc = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
      const np = { settings: { i2v_model: "seedance-2.0", ...note }, scenario: { narrator_voice: "calm low male voice" }, cuts: [nc] };
      expect(buildClipPrompt(nc, np)).toContain("hand-held documentary feel. The attached image");
      expect(buildClipPrompt(nc, np)).not.toContain("..");
      // 화면 안 대사
      const sc = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요" };
      const sp = {
        settings: { i2v_model: "seedance-2.0", ...note },
        cast: [{ who: "코치", look: "wiry coach in a grey tracksuit", voice: "gravelly veteran voice", cuts: [0] }],
        cuts: [sc],
      };
      expect(buildClipPrompt(sc, sp)).toContain("hand-held documentary feel. The attached image");
      expect(buildClipPrompt(sc, sp)).not.toContain("..");
    });

    // 상자가 둘인 이유 — 영상 지시(움직임·립싱크·시간)가 이미지 프롬프트에 실리면
    // 정지 화면 설계가 망가진다(stillOnly 가 코드로 막고 있는 바로 그것이다).
    it("★ 두 칸은 서로의 프롬프트에 새지 않는다", () => {
      const p = noted({ image_note: "shot on 35mm film", clip_note: "hand-held documentary feel" });
      const img = buildImagePrompt(fullCut, p, []);
      expect(img).toContain("shot on 35mm film");
      expect(img).not.toContain("hand-held documentary feel");
      const clip = buildClipPrompt(fullCut, p);
      expect(clip).toContain("hand-held documentary feel");
      expect(clip).not.toContain("shot on 35mm film");
    });
  });
});

// ── 저장 경로 (PATCH /api/projects/[id]) ───────────────────────────────────
//
// 위까지는 "덮어쓰기가 있으면 어떻게 되는가"였고, 여기부터는 **"어떻게 저장되는가"**다.
// 읽는 쪽(프롬프트·각인)은 다 만들어져 있었는데 저장할 길이 없었다 — 컷 화이트리스트가
// `.trim()` 이 참일 때만 담아서, 값은 들어가고 **비우기가 아예 안 됐다.**
//
// ★ 비우기가 곧 "원래대로" 버튼의 구현이다(별도 필드를 두지 않기로 한 설계).
//   그래서 빈 값은 빈 문자열로 **남으면 안 되고 필드가 지워져야** 한다 — 이 저장소는
//   "옛 컷과 글자 그대로 같은 모양"을 각인의 전제로 쓴다. 빈 문자열로 남으면 각인에는
//   안 잡히지만(promptOverride 가 공백을 덮어쓰기로 안 본다) 컷 모양이 옛 컷과 달라진다.
const { PATCH } = await import("../app/api/projects/[id]/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const P = "p-prompt";

const patchReq = (cut) =>
  new Request(`http://localhost/api/projects/${P}`, {
    method: "PATCH",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ cut }),
  });
const patchCut = (cut) => PATCH(patchReq(cut), { params: Promise.resolve({ id: P }) });
const savedCuts = async () => (await memoryStore.selectProject(P, A)).doc.cuts;

describe("PATCH /api/projects/[id] — 컷별 프롬프트 덮어쓰기", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProject(
      {
        id: P, created_ts: 1, status: "draft", settings: { target_seconds: 15 },
        script: { text: "첫 문장. 둘째 문장." },
        cuts: [
          { idx: 0, sentence: "첫 문장.", shows: "a shoe on wet asphalt" },
          { idx: 1, sentence: "둘째 문장.", shows: "a shoe in the air" },
        ],
      },
      A
    );
  });

  it("★ 값을 보내면 컷에 담긴다 — 앞뒤 공백은 걷힌다", async () => {
    expect((await patchCut({ idx: 0, image_prompt: "  a red shoe  " })).status).toBe(200);
    expect((await savedCuts())[0].image_prompt).toBe("a red shoe");
  });

  it("영상 덮어쓰기도 같은 자리다 — 두 칸이 함께 열려야 한다", async () => {
    expect((await patchCut({ idx: 0, clip_prompt: "  it explodes  " })).status).toBe(200);
    expect((await savedCuts())[0].clip_prompt).toBe("it explodes");
  });

  // ★★ 이 태스크의 존재 이유. 빈 문자열로 **남기면** 안 된다 — `in` 으로 잰다.
  it("★ 빈 값을 보내면 필드가 지워진다 — 그것이 '원래대로' 버튼이다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    // 먼저 실제로 담겼는지 본다 — 안 그러면 담기지도 않는 구현에서 이 단언이 헛돈다.
    expect((await savedCuts())[0].image_prompt).toBe("a red shoe");
    await patchCut({ idx: 0, image_prompt: "" });
    const cut = (await savedCuts())[0];
    expect("image_prompt" in cut, "필드가 남아 있다 — 지워져야 한다").toBe(false);
  });

  it("공백뿐인 값도 지운다 — promptOverride 가 덮어쓰기로 안 보는 값이다", async () => {
    await patchCut({ idx: 0, clip_prompt: "it explodes" });
    expect((await savedCuts())[0].clip_prompt).toBe("it explodes");
    await patchCut({ idx: 0, clip_prompt: "   " });
    const cut = (await savedCuts())[0];
    expect("clip_prompt" in cut).toBe(false);
  });

  // 지운 뒤의 컷은 **옛 컷과 글자 그대로 같은 모양**이어야 한다. 각인만 같아서는 부족하다 —
  // 다른 코드가 컷 모양을 통째로 비교하는 자리가 있다.
  it("★ 지우고 나면 컷이 손대기 전과 글자 그대로 같다", async () => {
    const before = (await savedCuts())[0];
    await patchCut({ idx: 0, image_prompt: "a red shoe", clip_prompt: "it explodes" });
    expect((await savedCuts())[0]).not.toEqual(before);
    await patchCut({ idx: 0, image_prompt: "", clip_prompt: "" });
    expect((await savedCuts())[0]).toEqual(before);
  });

  // ★ 위 단언들은 **저장소를 지나온 뒤**를 본다 — 두 저장소 다 JSON 으로 옮기므로
  //   `image_prompt: undefined` 라는 키가 살아 있어도 직렬화에서 조용히 사라진다.
  //   즉 머지에서 delete 를 빼도 위 단언은 전부 초록이다(뮤테이션 실측).
  //   그래서 **라우트가 저장소에 건네는 그 객체**를 잡아 잰다 — 지우는 것은 delete 뿐이다.
  //   값이 undefined 인 키를 남겨 두면 저장소 구현이 바뀌는 날(예: jsonb 직접 머지)
  //   컷 모양이 옛 컷과 달라지고, 이 저장소는 그 모양을 각인의 전제로 쓴다.
  it("★ 저장소에 건네는 컷에 빈 키가 남지 않는다 — undefined 를 남기면 안 된다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    let handed;
    const orig = memoryStore.updateProjectRow.bind(memoryStore);
    const spy = vi.spyOn(memoryStore, "updateProjectRow").mockImplementation(async (id, o, v, doc) => {
      handed = doc.cuts.find((c) => c.idx === 0);
      return orig(id, o, v, doc);
    });
    try {
      await patchCut({ idx: 0, image_prompt: "" });
    } finally {
      spy.mockRestore();
    }
    expect(Object.keys(handed), "undefined 인 키가 남아 있다").not.toContain("image_prompt");
  });

  it("다른 컷은 안 건드린다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    expect((await savedCuts())[1].image_prompt).toBeUndefined();
    expect((await savedCuts())[1].shows).toBe("a shoe in the air");
  });

  // 비우기는 **보낸 컷만**이다 — 지우기가 컷 전체를 훑으면 남의 덮어쓰기가 함께 사라진다.
  it("비우기도 보낸 컷만 지운다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    await patchCut({ idx: 1, image_prompt: "a blue shoe" });
    await patchCut({ idx: 0, image_prompt: "" });
    const cuts = await savedCuts();
    expect("image_prompt" in cuts[0]).toBe(false);
    expect(cuts[1].image_prompt).toBe("a blue shoe");
  });

  // 문자열이 아닌 값은 **아무 일도 안 일어나는 것**이 맞다 — 지우지도 담지도 않는다.
  // 담으면 그 값이 그대로 유료 호출로 나가고(이 파일 위쪽 promptOverride 참고),
  // 지우면 잘못 보낸 한 번이 사장님이 적어 둔 프롬프트를 날린다.
  it("★ 비문자열은 담지도 지우지도 않는다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    for (const bad of [7, { text: "a cat" }, ["a cat"], null]) {
      expect((await patchCut({ idx: 0, image_prompt: bad })).status).toBe(200);
      expect((await savedCuts())[0].image_prompt, `${JSON.stringify(bad)} 가 값을 건드렸다`)
        .toBe("a red shoe");
    }
  });

  // 기존 화이트리스트 항목 — 머지 방식을 바꿨으니 함께 잰다.
  it("기존 화이트리스트 항목이 그대로 동작한다", async () => {
    await patchCut({ idx: 0, shows: "  a shoe in the rain  ", motion: "slow push-in", speed: "fast", camera: "천천히 뒤로" });
    const cut = (await savedCuts())[0];
    expect(cut.shows).toBe("a shoe in the rain");
    expect(cut.motion).toBe("slow push-in");
    expect(cut.speed).toBe("fast");
    expect(cut.camera).toBe("천천히 뒤로");
  });

  // ★ 문장을 고치면 원고가 따라온다 — "컷을 이어붙이면 원고와 글자 그대로 같다"가
  //   이 파이프라인의 유일한 구조적 보장이다. 비우기 머지가 이 자리를 지나간다.
  it("★ sentence 를 고치면 script.text 가 따라온다", async () => {
    await patchCut({ idx: 0, sentence: "고친 문장." });
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.script.text).toBe("고친 문장. 둘째 문장.");
  });

  // 프롬프트만 고치는 저장은 원고를 건드리면 안 된다 — 건드리면 ②대본에 거짓 경고가 뜨고
  // 그 안내의 버튼은 유료 호출이다.
  it("프롬프트만 고치면 원고는 그대로다", async () => {
    await patchCut({ idx: 0, image_prompt: "a red shoe" });
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.script.text).toBe("첫 문장. 둘째 문장.");
  });
});

// ── 본문 판정 한 자리 (promptBodyOf) ──────────────────────────────────────
//
// 화면이 텍스트칸에 앉힐 씨앗을 얻는 유일한 길이다. 조립 함수
// (imagePromptBody·imagePromptTail·clipPromptBody)는 계속 감춘 채 **판정만** 열었다 —
// promptOverride 와 같은 성질이다(조립은 비공개, 판정은 공유).
//
// ★ 여기서 재는 불변 하나: **전체 프롬프트는 언제나 본문으로 시작한다.**
//   이것이 있어야 화면이 `full.slice(body.length)` 로 꼬리를 떼어 "이 뒤는 코드가 붙여요"로
//   보여 줄 수 있다. 깨지면 화면이 꼬리를 잘못 잘라 사장님이 보는 것과 나가는 것이 갈린다.
describe("promptBodyOf — 본문 판정 한 자리", () => {
  const speaks = { settings: { i2v_model: "seedance-2.0", aspect_ratio: "9:16" } };
  // 영상 세 갈래 — 무음 / 내레이션 / 화면 안 대사. 갈래마다 이어 붙이는 문자열이 따로라
  // 한 갈래만 재면 나머지에서 불변이 조용히 깨진다.
  const silentCut = { idx: 0, motion: "slow push-in", silent: true };
  const narratedCut = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
  const narratedProject = { ...speaks, scenario: { narrator_voice: "calm low male voice" }, cuts: [narratedCut] };
  const spokenCut = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요" };
  const spokenProject = {
    ...speaks,
    cast: [{ who: "코치", look: "wiry coach in a grey tracksuit", voice: "gravelly veteran voice", cuts: [0] }],
    cuts: [spokenCut],
  };

  it("덮어쓰기가 없으면 코드가 만든 본문을 낸다 — 그 본문이 프롬프트의 앞머리다", () => {
    const body = promptBodyOf("image", cut, project);
    expect(body).toBe("High-quality photographic still for a short-form video, vertical 9:16 composition. Scene: close-up of the shoe on wet asphalt. The video's subject is: black high-top basketball shoe. Keep this exact product/subject consistent in every scene. Its appearance, identical in every scene: black upper with red sole.");
  });

  it("덮어쓰기가 있으면 그 값이 본문이다 — 판형은 코드가 다시 붙인다", () => {
    const over = { ...cut, image_prompt: "a red shoe in the rain" };
    expect(promptBodyOf("image", over, project))
      .toBe("a red shoe in the rain. vertical 9:16 composition.");
  });

  it("영상 본문은 움직임과 속도뿐이다 — 대사·목소리는 꼬리다", () => {
    expect(promptBodyOf("clip", { idx: 0, motion: "slow push-in", speed: "fast" }, speaks))
      .toBe("slow push-in. fast, explosive motion.");
    expect(promptBodyOf("clip", { ...spokenCut, clip_prompt: "the shoe explodes" }, spokenProject))
      .toBe("the shoe explodes.");
  });

  it("★ 이미지 프롬프트는 언제나 본문으로 시작한다 — 덮어쓰기 유무 모두", () => {
    for (const c of [cut, { ...cut, image_prompt: "a red shoe in the rain" }, { ...cut, image_prompt: "끝에 부호 없음" }]) {
      const body = promptBodyOf("image", c, project);
      for (const refs of [[], [{ kind: "person", who: "barista" }, { kind: "thing" }]]) {
        expect(buildImagePrompt(c, project, refs).startsWith(body), `본문으로 시작하지 않는다: ${body}`).toBe(true);
      }
    }
  });

  it("★ 영상 프롬프트도 세 갈래 전부에서 본문으로 시작한다", () => {
    const cases = [
      [silentCut, { ...speaks }],
      [narratedCut, narratedProject],
      [spokenCut, spokenProject],
    ];
    for (const [c, p] of cases) {
      for (const over of [null, "the shoe explodes in slow motion", "부호 없이 끝나는 덮어쓰기"]) {
        const cc = over ? { ...c, clip_prompt: over } : c;
        const body = promptBodyOf("clip", cc, p);
        expect(buildClipPrompt(cc, p).startsWith(body), `본문으로 시작하지 않는다: ${body}`).toBe(true);
      }
    }
  });

  // ★ 화면이 텍스트칸에 앉히는 것은 **사장님이 저장한 날 글자**다(정규화 전). 화면이 꼬리를
  //   그 길이로 떼어 내므로, 날 글자도 프롬프트의 앞머리여야 한다 — 아니면 화면이 꼬리를
  //   한 글자 어긋나게 잘라 보여 준다. 여기서 재지 않으면 그 어긋남이 조용히 산다.
  it("★ 사장님이 저장한 날 글자도 프롬프트의 앞머리다 — 부호를 코드가 채워도", () => {
    const raw = "  끝에 부호 없는 덮어쓰기  ";
    const img = { ...cut, image_prompt: raw };
    expect(buildImagePrompt(img, project, []).startsWith(raw.trim())).toBe(true);
    const clip = { idx: 0, motion: "slow push-in", clip_prompt: raw };
    expect(buildClipPrompt(clip, speaks).startsWith(raw.trim())).toBe(true);
  });

  it("모르는 갈래는 던진다 — 조용히 이미지 본문을 내면 영상에 판형이 실린다", () => {
    expect(() => promptBodyOf("audio", cut, project)).toThrow();
  });
});

// ── 길이 상한 (Ruling 11) ────────────────────────────────────────────────
//
// ★ 상한은 **원장이 프롬프트를 자르는 자리**(LEDGER_PROMPT_MAX)다. 그 위로 쓰면 원장에
//   안 남아 "무엇을 보냈는가"를 확인할 채널이 막힌다. 숫자를 여기 손으로 적지 않는다 —
//   두 벌이면 값이 갈리는 날 이 테스트가 거짓 초록이 된다.
describe("PATCH — 컷별 덮어쓰기 길이 상한", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await memoryStore.insertProject(
      {
        id: P, created_ts: 1, status: "draft", settings: { target_seconds: 15 },
        cuts: [{ idx: 0, sentence: "첫 문장.", shows: "a shoe on wet asphalt" }],
      },
      A
    );
  });

  for (const key of ["image_prompt", "clip_prompt"]) {
    it(`${key} 상한까지는 담긴다`, async () => {
      const at = "a".repeat(LEDGER_PROMPT_MAX);
      expect((await patchCut({ idx: 0, [key]: at })).status).toBe(200);
      expect((await savedCuts())[0][key]).toBe(at);
    });

    it(`★ ${key} 상한을 넘으면 400 — 값이 저장되지 않는다`, async () => {
      const over = "a".repeat(LEDGER_PROMPT_MAX + 1);
      const res = await patchCut({ idx: 0, [key]: over });
      expect(res.status).toBe(400);
      const { error } = await res.json();
      // 문구는 normalizePromptNote 의 어조다 — 상한과 지금 글자 수를 함께 말한다.
      expect(error).toContain(String(LEDGER_PROMPT_MAX));
      expect(error).toContain(String(over.length));
      expect((await savedCuts())[0][key]).toBeUndefined();
    });

    it(`${key} 상한은 공백을 걷은 뒤로 잰다 — 앞뒤 공백 때문에 거절당하지 않는다`, async () => {
      const at = `  ${"a".repeat(LEDGER_PROMPT_MAX)}  `;
      expect((await patchCut({ idx: 0, [key]: at })).status).toBe(200);
    });
  }

  // 넘는 값이 하나라도 있으면 **아무것도 저장하지 않는다** — 절반만 저장되면 사장님은
  // 거절 문구를 보면서 다른 칸이 바뀐 것을 모른다.
  it("★ 한 칸이 넘으면 같은 요청의 다른 값도 저장되지 않는다", async () => {
    const res = await patchCut({ idx: 0, image_prompt: "a".repeat(LEDGER_PROMPT_MAX + 1), shows: "새 화면" });
    expect(res.status).toBe(400);
    expect((await savedCuts())[0].shows).toBe("a shoe on wet asphalt");
  });
});
