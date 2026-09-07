// 카드용 작은 그림의 **이름 규약** — 원본과 작은 판을 잇는 유일한 자리 (2026-09-07).
//
// ★★ 이 파일은 **순수하다(import 0).** 카드(클라이언트 컴포넌트)와 서빙 라우트가 함께 읽는다.
//   여기에 sharp 를 들이면 **클라이언트 번들에 sharp 가 실려 빌드가 깨진다.**
//   실제로 줄이는 일은 lib/thumbs.js 가 한다 — 그쪽은 서버에서만 불린다.
//
// ★ 왜 생겼나. 카드에서 영상을 뺐더니(90dafec) 카드의 얼굴이 **원본 업로드 사진**이 됐다.
//   실측 355장 평균 290KB 인데 카드는 화면에서 300~400px 다 — 전송이 영상에서 사진으로
//   옮겨간 것뿐이었다. sharp w480 webp 로 줄이면 실측 **14%**(1024×766 59KB → 8KB).

// 저장된 주소는 **안 바꾼다** — 그 문자열이 프로젝트 문서의 material.photos[].url 에
// 박혀 있다(app/api/uploads/route.js 머리말). 그래서 원본 주소에 표시만 얹는다.
export const THUMB_QUERY = "t=1";

// 버킷 안에서 작은 판이 갖는 이름. 확장자를 갈아 끼운다 —
// `<uuid>.jpg` → `<uuid>-t.webp`. 서빙 라우트의 파일명 정규식(`[a-z0-9-]+\.(jpg|png|webp)`)에
// 그대로 걸리는 모양이라 그 문을 손보지 않아도 된다.
export function thumbKeyFor(name) {
  return String(name).replace(/\.(jpg|jpeg|png|webp)$/i, "-t.webp");
}

// 카드가 쓸 주소. **우리 경로일 때만** 표시를 얹는다.
//
// ★ 실측으로 image_url 20개 중 **3개가 fal 주소**다(모델이 준 그림을 그대로 쓴다).
//   거기에 ?t=1 을 붙이면 우리가 모르는 서버의 캐시 키를 흔들 뿐 얻는 것이 없다.
//   서명이 실린 주소라면 서명을 깨뜨릴 수도 있다.
export function thumbUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/api/uploads/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${THUMB_QUERY}`;
}
