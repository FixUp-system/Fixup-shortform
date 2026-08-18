// 언어 목록 — 자막 글자와 **말하는 소리**가 같은 세 갈래를 쓴다.
//
// ⚠️ 2026-08-18 갱신. 옛 머리말은 "자막 언어는 글자의 언어이고 소리는 이 값을 모른다"였다.
//    그 문장은 자막 언어(settings.subtitle_lang) 하나만 있던 시절의 사실이다. 지금은 값이
//    둘이고 뜻이 다르다:
//      · settings.speech_lang    — 영상이 **말하는** 언어. 첫 화면에서 한 번 고른다.
//        Seedance 가 그 말로 말하고, 대사 원문이 그 언어로 쓰이며, **그 글자가 그대로 자막**이다.
//      · settings.subtitle_lang  — 화면에 태울 자막의 언어. 원문과 같으면 번역이 없고,
//        다르면 원문을 그 언어로 옮긴다(⑥완성에서 고른다).
//    목록을 함께 쓰는 이유는 셋이 같은 세 갈래이기 때문이고, **뜻이 같아서가 아니다**.
//    ⚠️ lib/ad/options.js 의 AD_LANGS(광고 나레이션 언어)와는 여전히 합치지 마라 — 그쪽은
//       광고 흐름 전용이고 여기와 저장 자리도 판정도 다르다.
//
// ⚠️ lib/ad/options.js 의 AD_LANGS 와 합치지 마라. 그쪽은 **나레이션 언어**(소리)이고
//    이쪽은 자막 언어(글자)다. 뜻이 달라 합치면 한쪽을 바꿀 때 다른 쪽이 끌려간다.
export const SUBTITLE_LANGS = [
  { id: "ko", label: "한국어", line: "Korean" },
  { id: "ja", label: "일본어", line: "Japanese" },
  // ★ 라벨은 **짧아야 한다** — 칩 셋이 234px 칸에 한 줄로 들어가야 하고, 하나만 다음 줄로
  //   내려가면 그 칩이 다른 종류처럼 보인다(2026-08-18 사장님 지적: 중국어만 혼자 내려갔다).
  //   "(간체)"를 뺀 자리는 `line` 이 대신 지킨다 — 모델에 나가는 이름은 그쪽이고, 중국어
  //   선택지가 하나뿐이라 화면에서 간체·번체를 가릴 일이 없다.
  { id: "zh", label: "중국어", line: "Simplified Chinese" },
];

export const DEFAULT_SUBTITLE_LANG = "ko";

// 말하는 언어 — 없으면 한국어다.
//
// ★ **없을 때 한국어**인 것이 이 기능의 안전장치다. 옛 프로젝트에는 이 값이 없고, 없으면
//   프롬프트가 지금까지와 **글자 그대로** 같아야 한다 — 한 글자라도 달라지면 각인이 흔들려
//   이미 산 영상이 낡고 재구매가 뜬다(컷당 8크레딧).
// ★ 모르는 값도 한국어다. 저장된 문서는 오래 살아 목록이 바뀌어도 옛 값을 그대로 들고 온다.
export const DEFAULT_SPEECH_LANG = "ko";

export function speechLangOf(project) {
  const id = project?.settings?.speech_lang;
  return isSubtitleLang(id) ? id : DEFAULT_SPEECH_LANG;
}

// 사장님 말로 부르는 이름("한국어"·"일본어"·"중국어") — 한국어로 쓰는 지문에 실린다.
export function langLabelOf(id) {
  return (SUBTITLE_LANGS.find((l) => l.id === id) || SUBTITLE_LANGS[0]).label;
}

// 모델에 넘길 이름("Korean"·"Japanese"·"Simplified Chinese").
export function langLineOf(id) {
  return (SUBTITLE_LANGS.find((l) => l.id === id) || SUBTITLE_LANGS[0]).line;
}

// ★ 언어가 폰트를 정한다. 일본어·중국어는 폰트가 한 벌뿐이라 스타일(기본·강조·부드럽게)을
//   고를 수 없다 — 화면이 그 언어에서 스타일 칩을 숨긴다.
// ★ family 는 **폰트 파일 내부 이름**이다(파일명이 아니다). Noto CJK OTF(OFL-1.1)의
//   name 테이블 nameID 1 을 직접 읽어 확인한 값 — 어긋나면 ffmpeg 가 조용히 기본 폰트로
//   굽는다(lib/subtitles.js:394).
const LANG_FONTS = {
  ja: { file: "assets/subtitle-ja.otf", family: "Noto Sans JP" },
  zh: { file: "assets/subtitle-zh.otf", family: "Noto Sans SC" },
};

// 한국어는 스타일이 폰트를 정하므로 여기서 기본값만 돌려준다(lib/subtitles.js 의 SUBTITLE_FONTS).
export function subtitleFontFor(langId) {
  return LANG_FONTS[langId] || { file: "assets/subtitle-font.otf", family: "Pretendard" };
}

export function isSubtitleLang(id) {
  return SUBTITLE_LANGS.some((l) => l.id === id);
}
