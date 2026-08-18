// 광고 영상 옵션 세 축 — 포맷·분위기·나레이션 언어. 화풍은 lib/styles.js 의 id 를 쓴다.
//
// ⚠️ 이 파일도 화면이 import 한다. **import 문을 두지 마라.**
//    그래서 styles.js 의 id 를 여기에 **글자로 적는다** — 목록이 갈릴 위험이 있지만,
//    tests/ad-options.test.js 가 두 목록이 어긋나는 순간 실패한다(코드가 판정한다).
//
// ⚠️ 아래 문구는 **초안이다.** styles.js 의 프리셋이 그랬듯 실제 결과를 나란히 보고
//    확정한다. 측정 없이 품질을 주장하지 않는다.

// 포맷 — 시나리오의 뼈대다. LLM 이 이 beat 에 맞춰 15초를 짠다. 가장 크게 작용하는 축.
export const AD_FORMATS = [
  { id: "hero", label: "제품 히어로",
    beat: "제품이 주인공이다. 등장 → 클로즈업 → 쓰는 순간 → 마무리 한 컷." },
  { id: "unboxing", label: "언박싱",
    beat: "손이 상자를 연다 → 꺼낸다 → 첫인상. 손과 제품이 화면을 채운다." },
  { id: "before_after", label: "비포·애프터",
    beat: "문제 상황을 먼저 보여준다 → 전환 → 달라진 결과. 대비가 분명해야 한다." },
  { id: "story", label: "브랜드 스토리",
    beat: "장면 몇 개로 분위기를 쌓고 마지막에 로고로 닫는다. 설명하지 않는다." },
  { id: "testimonial", label: "사용 후기",
    beat: "사람이 카메라를 보고 말한다. 나레이션이 주인공이고 화면은 그것을 받친다." },
];

// 분위기 — 음악·조명·편집 속도에 작용한다.
export const AD_MOODS = [
  { id: "bright", label: "밝고 경쾌한", line: "bright and upbeat, airy daylight, quick lively cuts" },
  { id: "premium", label: "고급스러운", line: "premium and restrained, soft directional light, slow deliberate camera" },
  { id: "dynamic", label: "역동적인", line: "energetic, punchy motion, fast camera moves and snappy transitions" },
  { id: "warm", label: "감성적인", line: "warm and intimate, golden hour light, gentle handheld feel" },
];

// 나레이션 언어 — **넷**이다(2026-08-18 사장님 지시로 일본어·중국어를 더했다).
// ⚠️ 별도 파라미터가 있는지 확인하지 못했다 — 지금은 프롬프트에 명시해서 넘긴다.
//
// ★ lib/subtitle-langs.js 의 SUBTITLE_LANGS 와 **합치지 않는다.** 뜻이 다르다:
//   그쪽은 단계별의 "대사 원문 = 자막 원문"이고 이쪽은 통짜 생성 지시문에 실리는
//   "나레이션 언어"다. 저장 자리도 판정도 다르다 — 합치면 한쪽을 바꿀 때 다른 쪽이 끌려간다.
//   맞추는 것은 **선택지의 범위와 모델에 넘길 이름**이지 값의 뜻이 아니다
//   (`line` 이 어긋나면 같은 언어를 두 흐름이 다른 말로 시켜 결과가 갈린다).
// ★ 라벨은 짧게. 칩 셋이 한 줄에 서야 하고, 하나만 다음 줄로 내려가면 다른 종류처럼 보인다
//   (실제로 "중국어(간체)"가 그렇게 내려간 적이 있다).
export const AD_LANGS = [
  { id: "ko", label: "한국어", line: "Korean" },
  // ★ 화면에서 숨긴다(2026-08-18 사용자 결정 — "일단 제외"). **지우지 않는 이유**는
  //   lib/ad/models.js 의 2.5 와 같다: 지우면 영어로 만든 옛 문서가 pick 에서 못 찾아
  //   기본값으로 조용히 갈아치워지거나 던진다. 고르는 길만 닫고 값·문구·검증은 살려 둔다.
  //   다시 열려면 이 hidden 한 줄만 지우면 된다.
  { id: "en", label: "영어", line: "English", hidden: true },
  { id: "ja", label: "일본어", line: "Japanese" },
  { id: "zh", label: "중국어", line: "Simplified Chinese" },
];

// 화풍 — id 는 lib/styles.js 와 같다. 문구만 영상용으로 다시 썼다.
// styles.js 의 medium/finish 는 **정지 이미지** 프롬프트용이라 영상에 그대로 실으면 어색하다
// ("High-quality photographic still" 을 영상에 요구하는 꼴이 된다).
export const AD_STYLE_LINES = {
  photo: "live-action cinematic footage, realistic lighting, shallow depth of field",
  illust: "hand-drawn 2D animated look, soft pastel palette, clean bold outlines",
  anime: "Japanese anime style animation, cel shading, vibrant colors",
  studio: "clean studio product footage, seamless pale backdrop, even softbox lighting",
  render3d: "stylized 3D-rendered animation, soft clay-like materials, rounded friendly forms, playful toy-set look",
  film: "35mm film-look footage, visible grain, warm halation, muted analog colors, soft natural light",
  // 렌즈 축. photo·film 줄과 낱말이 겹치지 않게 쓴다 — 겹치면 광고에서도 두 칩이 같은 말을
  // 한다. ⚠️ 눈으로 지키지 않는다: tests/ad-options.test.js 가 실사 촬영 계열
  // (photo·film·cinema) 끼리의 겹침을 styles.js 와 **같은 축으로** 판정한다.
  // 처음 문구는 "shallow focus with oval bokeh" 였고 photo 줄의 "shallow depth of field" 와
  // 실제로 겹쳐 있었다 — 정지 이미지 쪽은 코드가 재는데 영상 쪽은 아무도 안 재고 있었다.
  cinema: "anamorphic cinema camera work, long-lens compression, a melted background of oval bokeh, high-contrast key and deep shadows, measured dolly moves",
  scifi: "futuristic sci-fi cinematic aesthetic, sleek metallic surfaces, cool blue-teal palette, volumetric lighting",
};

export const DEFAULT_AD_OPTIONS = {
  format: "hero",
  mood: "premium",
  narration_lang: "ko",
  style: "photo",
};

// 모르는 값은 **던진다.** 조용히 기본값으로 떨어뜨리면 사장님이 고른 것과 만들어지는 것이
// 달라지고, 그 차이를 아무도 못 알아본다(lib/styles.js 의 normalizeStyle 과 같은 판단).
export function normalizeAdOptions(input) {
  const src = input || {};
  const pick = (list, key, fallback) => {
    const v = src[key];
    if (v === undefined || v === null) return fallback;
    if (!list.some((x) => x.id === v)) throw new Error(`모르는 ${key} 예요: ${v}`);
    return v;
  };
  const style = src.style === undefined || src.style === null ? DEFAULT_AD_OPTIONS.style : src.style;
  if (!Object.keys(AD_STYLE_LINES).includes(style)) throw new Error(`모르는 style 예요: ${style}`);
  return {
    format: pick(AD_FORMATS, "format", DEFAULT_AD_OPTIONS.format),
    mood: pick(AD_MOODS, "mood", DEFAULT_AD_OPTIONS.mood),
    narration_lang: pick(AD_LANGS, "narration_lang", DEFAULT_AD_OPTIONS.narration_lang),
    style,
  };
}
