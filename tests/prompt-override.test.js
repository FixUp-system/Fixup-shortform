// ★ 이 파일이 지키는 것 하나: **덮어쓰기가 없으면 프롬프트가 글자 그대로 지금과 같다.**
// 본문/꼬리로 가르는 리팩터는 조용히 실패한다 — 문구가 한 글자 달라져도 테스트는 초록인데
// 앞으로 만들 그림이 달라진다. 그래서 기대값을 **손으로 적어** 못 박는다.
import { describe, it, expect } from "vitest";
import { buildClipPrompt, buildImagePrompt } from "../lib/cuts.js";
import { imageContextKey, clipKey, isImageStale, isClipStale } from "../lib/steps.js";

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
    expect(imageContextKey({ ...fullCut, image_prompt: "a red shoe" }, full))
      .toBe(`${IMG_BASE}|prompt:a red shoe`);
    expect(clipKey({ ...fullCut, clip_prompt: "it explodes" }, full))
      .toBe(`${CLIP_BASE}|prompt:it explodes`);
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
