// 화풍 프리셋 — 화면(클라이언트)과 이미지 프롬프트(서버)가 함께 본다.
//
// lib/cuts.js 에 두면 안 된다. 그 모듈은 script.js 를 거쳐 무거운 사슬을 끌고 오고,
// "use client" 화면이 import 하면 번들이 부푼다.
// (lib/voices.js·lib/clip-limits.js 가 같은 이유로 분리돼 있다 — 여기도 import 가 없다.)
//
// 왜 표로 두는가: 화풍이 buildImagePrompt 안에 한 줄로 박혀 있었다.
// "High-quality photographic still … Cinematic lighting, realistic" — 사장님이 일러스트를
// 원해도 코드가 실사를 요구했다. 바꿀 자리가 아예 없던 것이 문제다.
//
// medium 은 **무엇으로 만든 그림인가**(사진·삽화·애니 스틸), finish 는 **마감**(빛·색·질감)이다.
// 둘로 가른 이유는 프롬프트에서 서로 다른 자리에 놓이기 때문이다 — medium 은 맨 앞에서
// 그림의 종류를 정하고, finish 는 장면 서술 뒤에서 마감을 지시한다.
//
// ⚠️ photo 를 뺀 세 문구는 **초안이다.** 실제 그림을 나란히 보고 확정한다
//    (scripts/measure/compare-style-presets.mjs). 측정 없이 품질을 주장하지 않는다.
export const STYLE_PRESETS = [
  {
    id: "photo",
    realistic: true,
    label: "실사",
    desc: "사진처럼 — 지금까지의 기본",
    // 이 두 값을 이어 붙이면 화풍을 도입하기 전의 프롬프트와 글자 그대로 같다.
    // tests/cuts.test.js 가 완전일치로 못 박는다 — 실사 프로젝트의 그림이 변하지 않는 증거다.
    medium: "High-quality photographic still",
    finish: "Cinematic lighting, realistic",
  },
  {
    id: "illust",
    realistic: false,
    label: "일러스트",
    desc: "손그림 삽화 — 따뜻하고 부드러운 느낌",
    medium: "Hand-drawn flat illustration",
    finish: "soft pastel palette, clean bold outlines, textured paper feel, warm storybook mood",
  },
  {
    id: "anime",
    realistic: false,
    label: "애니메이션",
    desc: "일본 애니메이션 한 장면 같은 느낌",
    medium: "Anime-style animation still",
    finish: "cel shading, vibrant colors, detailed painted background, 2D Japanese animation film look",
  },
  {
    id: "studio",
    realistic: true,
    // 실사와 같은 사진이지만 **마감이 반대다.** 실사는 "분위기 있는 사진"(Cinematic)이라
    // 배경 잡동사니가 화면 절반을 먹는다(07-30 실측: 세탁소 배경). 물건을 파는 영상에는
    // 배경이 비어 있는 제품컷이 필요하고, 지금까지 그것을 낼 방법이 없었다.
    //
    // 부수 효과: 배경이 단순해지면 글자 무늬 위험이 내려간다 — 실측에서 배경이 풍부한
    // 애니·SF가 글자를 가장 많이 그렸다.
    label: "제품컷",
    desc: "배경 없는 깔끔한 사진 — 물건을 파는 영상에",
    medium: "Clean studio product photograph",
    // 빼고 싶은 것을 말하지 않고 원하는 상태를 그대로 적는다(SHOWS_SYSTEM 과 같은 규율).
    // "잡동사니 없이"가 아니라 "비어 있는 배경"이다.
    finish: "seamless pale gradient backdrop, even softbox lighting, crisp focus on the subject, empty uncluttered surroundings",
  },
  {
    id: "render3d",
    realistic: false,
    label: "3D",
    desc: "점토 인형 같은 3D — 물건을 주인공으로",
    medium: "Stylized 3D rendered still",
    finish: "soft matte clay-like materials, rounded friendly forms, gentle global illumination, shallow depth of field, playful toy-set look",
  },
  {
    id: "film",
    realistic: true,
    // ⚠️ 넷 중 유일하게 실사와 **같은 매체**다. 구별이 되는지는 실측해야 안다 —
    // 안 되면 사장님이 고른 것과 나온 것이 같아 보이고, 칩 하나가 헛돈다.
    label: "필름",
    desc: "필름으로 찍은 느낌 — 따뜻하고 거친 질감",
    medium: "35mm film photograph",
    finish: "visible film grain, warm halation around highlights, muted analog color, soft natural window light",
  },
  {
    id: "scifi",
    realistic: false,
    label: "SF",
    // SF 는 그리는 방식이 아니라 소재라서 넷 중 가장 어긋나기 쉽다. 가게가 우주선이 되지는
    // 않는다 — 그래서 "촬영"이 아니라 "컨셉아트"로 기울여 두었다.
    desc: "미래적인 컨셉아트 — 금속·유리·차가운 빛",
    medium: "Futuristic sci-fi concept-art still",
    finish: "sleek metallic and glass surfaces, subtle holographic accents, cool blue-teal palette, cinematic volumetric lighting",
  },
];

// 옛 프로젝트와 미선택이 떨어질 자리. 실사인 이유는 지금까지의 동작이 실사였기 때문이다 —
// 화풍을 도입했다고 이미 만들어 둔 영상의 화풍이 달라지면 안 된다.
export const DEFAULT_STYLE_ID = "photo";

// 보정 한 줄의 상한. 프롬프트는 한 문장 열거라, 여기가 길어지면 우리 지시를 밀어낸다.
// 넘으면 자르지 않고 거절한다 — 자르면 사장님이 쓴 것과 그림에 실린 것이 달라진다.
export const STYLE_NOTE_MAX = 120;

export function styleFor(id) {
  const wanted = String(id || "");
  const found = STYLE_PRESETS.find((s) => s.id === wanted);
  if (!found && wanted) {
    console.warn(`[styles] 알 수 없는 화풍 "${wanted}" — 실사로 그린다.`);
  }
  return found || STYLE_PRESETS.find((s) => s.id === DEFAULT_STYLE_ID);
}

// 이 프로젝트가 고른 화풍. 값이 없으면 실사로 **파생**한다 —
// 생성 때 기본값을 저장해 두지 않는 이유는, 저장하면 기본값이 두 곳(코드와 데이터)에
// 살면서 어긋날 자리가 생기기 때문이다.
export function activeStyle(project) {
  return styleFor(project?.settings?.style?.preset);
}

// 낡음 판정이 쓰는 각인값(lib/steps.js 의 image.style_of). clipKey 와 같은 방식의 복합 키다.
//
// 보정 한 줄도 넣는다 — 프리셋은 그대로 두고 보정만 고쳐도 그림은 달라지므로,
// 그때 낡았다고 말하지 않으면 사장님이 고친 것이 반영되지 않은 채 남는다.
export function styleKey(project) {
  const style = activeStyle(project);
  const note = project?.settings?.style?.note;
  return `${style.id}|${typeof note === "string" ? note.trim() : ""}`;
}

// PATCH 가 저장 전에 지나는 게이트. settings 는 화이트리스트 없이 얕게 머지되므로
// 여기서 막지 않으면 아무 값이나 들어가고, 그 값으로 유료 호출이 나간다.
// 닫힌 목록을 코드가 판정하는 것은 validate.js 의 focus.mode 와 같은 결이다.
export function normalizeStyle(input) {
  const preset = input?.preset;
  if (!STYLE_PRESETS.some((s) => s.id === preset)) {
    throw new Error(`화풍 "${preset ?? ""}" 을 모릅니다. 고를 수 있는 것: ${STYLE_PRESETS.map((s) => s.id).join(", ")}`);
  }
  const raw = input?.note;
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    throw new Error("화풍 보정은 한 줄 글이어야 합니다.");
  }
  // 개행을 공백으로 눕힌다 — 프롬프트는 한 줄이고, 개행이 남으면 여러 문장처럼 부푼다.
  const note = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (note.length > STYLE_NOTE_MAX) {
    throw new Error(`화풍 보정은 ${STYLE_NOTE_MAX}자까지예요 (지금 ${note.length}자).`);
  }
  return { preset, note };
}

// 레퍼런스를 어떻게 쓰라고 할 것인가 — 화풍에 따라 갈린다.
//
// "첨부와 똑같이 그려라"는 실사에서 맞는 말이지만 애니·일러스트와 **정면으로 부딪친다.**
// 한쪽은 사진을 복사하라 하고 다른 쪽은 그림으로 그리라 하니, 반쯤 사진인 그림이 나온다.
//
// 비실사에서는 복사가 아니라 **재해석**이다: 형태·비율·배색은 첨부에서 가져오고, 그것을 이 화풍으로
// 다시 그린다. "사진을 붙이지 말라"를 못 박는 이유는 그 말이 없으면 모델이 첨부를 그대로 얹는다.
const REF_HINTS = {
  thing: {
    real: "Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).",
    drawn: "Take the product's shape, proportions and color layout from the attached reference, then redraw it fully in this style — do not paste or trace the photograph.",
  },
  person: {
    real: "Keep the same person (face, hair, build) as the attached reference — do not invent a different person.",
    drawn: "Take the person's hair, build and clothing from the attached reference, then redraw them fully in this style — recognizably the same person, but do not paste or trace the photograph.",
  },
};

export function refHintFor(style, kind) {
  const set = REF_HINTS[kind] || REF_HINTS.thing;
  return style?.realistic ? set.real : set.drawn;
}
