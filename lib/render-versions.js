// 완성본의 **이전 판** — 이름 규칙 한 벌.
//
// 🔍 왜 생겼나(2026-09-18 사장님 요청: "이전 영상도 보고 저장할 수 있었으면 좋겠다"):
//   완성본 파일 이름은 프로젝트마다 하나(`<id>.mp4`)라, 다시 구우면 그 자리를 덮어썼다.
//   그래서 "다시 만들면 지금 영상은 사라져요"가 화면에 서 있었다(2026-08-25부터).
//   이제 덮어쓰기 **직전**에 지금 파일을 `<id>-v<시각>.mp4` 로 옮겨 둔다.
//
// ★ 판 목록의 진실은 **저장소 한 곳**이다 — 프로젝트 문서에 따로 적지 않는다.
//   두 곳에 적으면 갈리고, 이 저장소는 그 사고를 이미 여러 번 겪었다.
// ★ 시각(ms)을 이름에 넣는 이유: 정렬과 표시가 파일 이름만으로 된다. 목록 라우트가
//   Storage 의 created_at 을 못 믿어도(복사로 만든 파일이라) 이 값은 우리가 적은 것이다.
// ★ 이 파일은 **순수 함수만** 둔다(import 없음) — 화면도 라우트도 같은 규칙을 본다.

// `<id>-v<밀리초>.mp4`
export function versionKey(projectId, ts) {
  return `${projectId}-v${Number(ts) || 0}.mp4`;
}

// 파일 이름에서 프로젝트 id 와 시각을 되찾는다. 판 이름이 아니면 null.
const VERSION_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-v(\d+)\.mp4$/;
export function parseVersionName(name) {
  const m = VERSION_NAME.exec(String(name || ""));
  return m ? { projectId: m[1], ts: Number(m[2]) } : null;
}

// 목록 — **새 것이 위**다. 사장님이 찾는 것은 대개 방금 덮어쓴 그 판이다.
export function sortVersions(list) {
  return [...(list || [])].sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
}
