// GET /api/projects/[id]/renders — 이 프로젝트의 **이전 판** 목록 (2026-09-18 사장님 요청).
//
// 완성본은 다시 구울 때마다 같은 이름을 덮어쓰므로, 덮어쓰기 직전에 `<id>-v<시각>.mp4` 로
// 남겨 둔다(lib/compose.js 의 archiveCurrentRender). 그 목록을 여기서 돌려준다.
//
// ★★ **문서에 판 목록을 적지 않는다.** 진실은 저장소 한 곳이다 — 문서에도 적으면 둘이 갈리고,
//   이 저장소는 그 사고를 이미 여러 번 겪었다(값이 사는 곳 규율).
// ★ 소유자 검사는 프로젝트로 한다 — 없는 것과 남의 것은 **같은 404** 다(다른 라우트와 같은 규칙).
// ★ 주소는 지금 쓰는 문 그대로다(`/api/renders/<이름>`) — 그 라우트가 서명 URL 로 302 를 보낸다.
import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject } from "../../../../../lib/projects.js";
import { getStore } from "../../../../../lib/store/index.js";
import { parseVersionName, sortVersions } from "../../../../../lib/render-versions.js";

export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id).catch(() => null);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  // ★ 접두사로 찾되 **이름 규칙으로 한 번 더 거른다** — 접두사만 보면 `<id>-raw.mp4` 같은
  //   다른 파일이 섞인다(원본은 판이 아니다).
  const found = await getStore().listObjects("renders", `${id}-v`).catch(() => []);
  const versions = sortVersions(
    found
      .map((o) => ({ parsed: parseVersionName(o.name), o }))
      .filter((x) => x.parsed && x.parsed.projectId === id)
      .map((x) => ({ url: `/api/renders/${x.o.name}`, ts: x.parsed.ts, bytes: x.o.size ?? null })),
  );
  return Response.json({ versions });
});
