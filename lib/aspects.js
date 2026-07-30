// 영상 사이즈 — 화면(클라이언트)과 합성(서버)이 함께 본다.
//
// lib/compose.js 에 두면 안 된다. 그 모듈은 fs·ffmpeg 를 끌고 오는데 "use client" 화면이
// import 하면 번들이 깨진다. (lib/voices.js·clip-limits.js·styles.js 가 같은 이유로 분리돼 있다.)
//
// 왜 표로 모으는가: 같은 목록이 다섯 곳에 흩어져 있었다 —
// 비율 닫힌 목록이 POST /cuts·POST /video·api/chat 에, 화면 라벨이 ②대본에,
// 픽셀 치수(SIZES)가 compose.js 에 따로. 하나를 늘리면 나머지를 찾아 고쳐야 했고,
// 빠뜨리면 화면에는 있는데 서버가 거절하거나 그 반대가 된다.
//
// 픽셀은 여기서 나온다. 세로(9:16)를 1080×1920 으로 두는 이유는 숏폼 업로드 규격이고,
// 자막 크기·여백이 이 치수에서 파생되기 때문이다(lib/subtitles.js).
export const ASPECTS = [
  { id: "9:16", label: "세로", note: "숏폼", width: 1080, height: 1920 },
  { id: "1:1", label: "정사각", note: "피드", width: 1080, height: 1080 },
  { id: "16:9", label: "가로", note: "유튜브", width: 1920, height: 1080 },
];

// 숏폼이 기본이다 — 이 제품이 만드는 것이 숏폼이다.
export const DEFAULT_ASPECT_ID = "9:16";

export function isAspect(id) {
  return ASPECTS.some((a) => a.id === id);
}

export function aspectFor(id) {
  return ASPECTS.find((a) => a.id === id) || ASPECTS.find((a) => a.id === DEFAULT_ASPECT_ID);
}

// 합성이 쓰는 픽셀 치수. 모르는 값이 오면 기본으로 떨어진다 —
// 여기서 멈추면 이미 값을 치른 클립이 있는데 완성본만 못 만드는 상태가 된다.
export function sizeFor(id) {
  const a = aspectFor(id);
  return [a.width, a.height];
}
