// 완성본의 **표지 한 장** — 이름 규칙 한 벌 (2026-09-18 사장님 요청).
//
// 🔍 왜 생겼나(실측 최근 200편): 보관함 카드는 썸네일을 `doc.cuts[0].image.url` **한 곳**에서만
//   찾는다. 단계별은 스토리보드 그림이 컷마다 있어 채워지지만, **원클릭은 그림 단계가 아예 없어**
//   35편 전부가 빈 카드였다(그중 33편은 영상이 멀쩡히 있었다). film 7편도 같다.
//
// ★ 그래서 굽고 나서 **완성본의 첫 화면**을 한 장 떼어 `<id>-thumb.jpg` 로 둔다.
//   ffmpeg 는 이미 쓰고 있어 값이 0 이고, 한 장이 수십 KB 라 저장 부담도 작다.
// ★ 진실은 **저장소 하나**다 — 문서에 주소를 또 적지 않는다(판 목록과 같은 판단).
//   카드는 그림이 없을 때 이 규칙으로 주소를 지어 보고, 파일이 없으면 지금처럼 글자를 보여 준다.
// ★ 이 파일은 **순수 함수만** 둔다(import 없음) — 화면·라우트·굽기가 같은 규칙을 본다.

export function thumbName(projectId) {
  return `${projectId}-thumb.jpg`;
}

export function renderThumbUrl(projectId) {
  return `/api/renders/${thumbName(projectId)}`;
}

// 첫 화면 한 장을 뽑는 ffmpeg 인자.
// ★ 가로 480 으로 줄인다 — 카드가 화면에서 300~400px 다(components/ProjectCards.jsx 의 판단과 같다).
//   높이는 -2 로 두어 비율이 유지되고 짝수로 떨어진다(9:16·1:1·16:9 전부 안전하다).
// ★ 첫 프레임이 검은 편이 있다(페이드 인). 그래서 0.5초 지점을 집는다 — 영상이 그보다 짧으면
//   ffmpeg 가 마지막 프레임을 준다(`-frames:v 1` 이라 빈 파일이 되지 않는다).
export function thumbArgs({ src, out }) {
  return ["-y", "-ss", "0.5", "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out];
}
