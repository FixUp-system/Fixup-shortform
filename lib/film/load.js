// film 문서만 다루는 문 — 라우트 셋이 같은 판정을 쓴다.
//
// ★ 광고의 loadAd(app/api/ads/[id]/route.js)와 같은 규율이다: 종류가 다른 문서는 **404** 다.
//   판정을 라우트마다 손으로 적으면 언젠가 한 곳이 빠지고, 그 문으로 다른 종류의 문서가
//   이 경로의 청구·굽기에 흘러든다.
// ★ 라우트 파일이 아니라 lib 에 두는 이유: 라우트에서 export 하면(광고가 그렇게 한다)
//   부르는 쪽이 남의 라우트 모듈을 import 하게 된다. 여기는 새 경로라 처음부터 가른다.
// ⚠️ 화면("use client")은 이 파일을 import 하면 안 된다 — getProject 를 통해 fs 가 딸려 온다.
//   화면이 쓰는 순수 함수는 lib/film/mode.js·doc.js 쪽이다.
import { getProject } from "../projects.js";

export async function loadFilm(id, ownerId) {
  const project = await getProject(id, ownerId);
  return project && project.kind === "film" ? project : null;
}
