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
    // ★★ 2026-09-01 사장님 지시 — **브이로그**. 기존 여덟 칩이 전부 "잘 찍은 광고" 쪽이라
    //   "직접 찍은 느낌"을 낼 자리가 없었다(photo=cinematic · studio=스튜디오 · film=아날로그).
    //   apob 의 실제 프롬프트가 쓴 표현이 우리에게 빠져 있던 것이다:
    //   *"Realistic smartphone vlog image quality, slight handheld imperfection,
    //     natural autofocus, no commercial polish"* — 마지막 구절이 핵심이다.
    // ★ `realistic: true` 다 — 사진 계열이라 인물·제품 규칙이 실사와 같은 축으로 돈다.
    id: "vlog",
    realistic: true,
    label: "브이로그",
    desc: "직접 찍은 느낌 — 손에 든 카메라, 자연광",
    medium: "Candid smartphone vlog photo",
    finish: "bright available daylight, offhand composition, unretouched skin, no commercial polish",
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
    id: "cinema",
    realistic: true,
    // ★ 실사 매체가 이것으로 **셋째**다(photo·film·cinema). film 에 적어 둔 위험이 그대로
    //   여기 온다 — 구별이 안 되면 칩만 늘고 그림은 같다. 그래서 축을 못 박는다:
    //
    //     photo  = **빛**   — 분위기 있는 조명(Cinematic lighting)
    //     film   = **질감** — 필름 입자·할레이션·아날로그 색
    //     cinema = **렌즈** — 초점거리·심도·프레이밍, 즉 카메라가 만드는 화면 문법
    //                        **그리고 그 렌즈에 딸린 고대비 조명까지**(아래 참고)
    //
    //   ⚠️ 축이 완전히 배타적이지는 않다 — 솔직하게 적는다. cinema 의 마지막 절
    //   "high-contrast key and deep shadow falloff" 는 렌즈가 아니라 **빛**이다.
    //   그래도 남겨 둔 이유: 긴 렌즈로 배경만 뭉개고 조명을 안 정하면 모델이 평평한 빛을
    //   기본으로 물고 와 "그냥 배경 흐린 사진"이 된다. 라벨·설명("명암이 강한")과
    //   chat 라우트의 선택 기준도 이미 명암을 약속하고 있다. 즉 cinema 는 **렌즈가 중심이고
    //   그에 딸린 고대비 조명까지**이고, photo 는 빛 **하나뿐**이라는 것이 실제 구별이다.
    //   (겹치는 것은 축의 가장자리이고, 낱말은 여전히 하나도 안 겹친다.)
    //
    //   낱말을 나눠 쓰면 축이 무너진다. tests/styles.test.js 가 실사 촬영 계열
    //   (photo·film·cinema) **서로 간에** 겹치는 낱말이 하나도 없음을 코드로 판정한다
    //   (눈으로 지킬 수 있는 계약이 아니다).
    //
    //   왜 필요한가: 광고 경로(lib/ad/scenario.js)는 장면마다 카메라(렌즈·앵글·움직임)를
    //   요구하는데 단계별 경로는 shows/motion/speed/environment/tone 뿐이라 렌즈감이 통째로
    //   비어 있었다. 그 자리를 화풍 한 칩으로 연다.
    label: "시네마",
    desc: "영화 카메라로 찍은 화면 — 렌즈로 깊이를 만들고 명암이 강한",
    // 매체 이름에 카메라를 박는다. 앞자리(medium)가 "무엇으로 찍었는가"를 정하는 자리다.
    medium: "Anamorphic cinema camera frame",
    // ⚠️ 화면 비율은 여기 안 적는다 — lib/aspects.js 가 정하는 별개 축이다. 숫자 비율을
    //    박으면 두 벌이 되어 갈린다(buildImagePrompt 가 이미 `${orient} composition` 을 붙인다).
    //    "영화적 프레이밍"은 **느낌**으로만 적는다 — off-center framing 이 그것이다.
    // ⚠️ 심도 낱말을 아예 안 쓴다. 처음에는 render3d 의 "shallow depth of field" 를 피해
    //    "shallow-focus" 로 적었는데, 그것은 하이픈으로 판정을 피해 간 것이지 중복을 없앤 게
    //    아니었다 — 뜻이 같으면 "얕은 심도"가 더는 render3d 의 변별 자질이 아니게 된다.
    //    지금은 **결과**를 적는다: "melted background"(뭉갠 배경)가 얕은 심도를 말 없이 말한다.
    finish: "long-lens compression, a melted background of oval anamorphic bokeh with faint horizontal flares, deliberate off-center framing, high-contrast key and deep shadow falloff",
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

// 프로젝트 공통 지시의 상한. 화풍 보정(STYLE_NOTE_MAX = 120)과 **다른 값이다** —
// 그쪽은 "보정 한 줄"이고 이쪽은 밖에서 써 온 프롬프트 통짜라 300~800자가 예사다.
// 120 을 올려서 재사용하지 않는다: 그 숫자에는 근거가 바로 위에 적혀 있고, 화풍 보정을
// 600자로 열어 주는 것은 이 작업이 요청받은 일이 아니다.
export const PROMPT_NOTE_MAX = 600;

// 프로젝트 공통 지시(이미지·영상)의 게이트. PATCH 가 저장 전에 지난다 —
// settings 는 화이트리스트 없이 얕게 머지되므로 여기서 안 막으면 아무 값이나 들어가고
// 그 값이 그대로 유료 호출로 나간다(normalizeStyle 과 같은 이유다).
//
// ★ 상자를 둘로 나눈 이유: 영상 지시(움직임·립싱크·시간)를 이미지 프롬프트에 붙이면
//   정지 화면 설계가 망가진다. 그것이 해로운 것은 추측이 아니라 이 저장소가 이미 코드로
//   막고 있는 일이다 — stillOnly() 가 shows 에서 움직임 서술을 걸러낸다(lib/cuts.js).
// ★ label 은 오류 문구에 들어갈 이름이다("이미지 지시"/"영상 지시"). 함수를 두 벌 두면
//   상한이 갈린다 — 이 저장소가 "값이 두 군데면 갈린다"로 반복해 겪은 자리다.
// ★ 넘으면 자르지 않고 거절한다 — 자르면 사장님이 쓴 것과 실제로 나간 프롬프트가 달라진다
//   (STYLE_NOTE_MAX 와 같은 규칙이다).
export function normalizePromptNote(raw, label) {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error(`${label}는 글이어야 합니다.`);
  const note = raw.replace(/\s+/g, " ").trim();
  if (note.length > PROMPT_NOTE_MAX) {
    throw new Error(`${label}는 ${PROMPT_NOTE_MAX}자까지예요 (지금 ${note.length}자).`);
  }
  return note;
}

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

// 레퍼런스가 **구도까지** 끌고 오는 것을 막는 공통 꼬리.
//
// ★ 실측(2026-07-31, 농구화 광고 cut2): 카탈로그 제품컷(흰 배경·정측면·화면 가득·정지)을
// 붙였더니 그 사진의 구도가 그대로 따라왔다 — 체육관 안인데 신발만 측면으로 화면 하단을
// 가득 채우고 정지해 있었다. 화풍은 지켜졌는데(애니로 다시 그렸다) 각도·크기가 새어 들어와
// 동작 컷이 "제품 사진 위에 사람이 얹힌" 구성이 됐다. 레퍼런스를 붙이기 전 같은 shows 로
// 나온 그림은 몸이 대각선으로 기울어 동작을 짊어지고 있었다.
//
// 이게 왜 영상까지 가는가: 그 그림이 클립의 첫 프레임이다. 몸이 자세만 취하고 있으면
// i2v 는 움직일 것을 신발에서 찾는다 — 몸은 굳고 발만 움직이는 영상이 된다.
// "자전거 바퀴가 회전한다"가 페달에서 뗀 발을 만든 것과 같은 계열의 누출이다.
//
// 가져올 것은 **정체성**이고, 구도는 shows 가 쥔다.
//
// ⚠️ "exactly" 를 쓰지 않는다 — 비실사 화풍에서 그 낱말이 프롬프트에 들어가면 안 된다
//    (tests/cuts.test.js "애니에서는 이 화풍으로 다시 그리라고 한다").
const REF_FRAMING =
  "Use the attached reference only for what the subject looks like — never for its camera angle, its framing, or how much of the frame it fills. Keep it at natural real-world size relative to the people and surroundings, and let the scene description alone decide the shot.";

// ★ 첨부가 둘 이상이면 **어느 장인지 번호로 가리킨다**(2026-08-18 실측으로 드러난 결함).
//   "the attached reference"/"the attached reference image" 는 첨부가 한 장일 때만 무엇을
//   가리키는 말이다. 제품 사진 + 인물 아바타 두 장을 보낸 컷에서, 바로 앞 문장이 이름을
//   붙여 준 것은 사람뿐이었고 제품 결속은 단수로 남아 아무것도 가리키지 못했다 —
//   그 컷만 전혀 다른 제품이 그려졌다.
export function refHintFor(style, kind, which = null) {
  const set = REF_HINTS[kind] || REF_HINTS.thing;
  const body = style?.realistic ? set.real : set.drawn;
  return which
    ? body.replace(/the attached reference( image)?/, `attached image [${which}]`)
    : body;
}

// 구도 금지 꼬리는 **레퍼런스마다가 아니라 컷마다 한 번**이다. 인물·물건 힌트가 각자
// 달고 있던 시절에는 두 종류가 함께 있는 컷에서 같은 문장이 두 번 실렸다.
export function refFraming() {
  return REF_FRAMING;
}
