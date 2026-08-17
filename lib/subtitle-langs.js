// 자막 언어 — **글자의 언어**다. 소리(나레이션·TTS·클립 발음)는 이 값을 모른다.
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
