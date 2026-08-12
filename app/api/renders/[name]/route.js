import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject } from "../../../../lib/projects.js";
import { getStore } from "../../../../lib/store/index.js";

// 파일명이 곧 프로젝트 id 다(lib/compose.js 가 `${projectId}.mp4` 로 올린다).
// 그래서 별도 매핑 없이 소유자를 검사할 수 있다(uploads 와 달리 upload_owners 가 필요 없다).
const UUID_MP4 = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.mp4$/;

export const GET = withUser(async (_req, { params }, user) => {
  const { name } = await params;
  const m = UUID_MP4.exec(name);
  if (!m) return new Response("잘못된 파일명", { status: 400 });

  const project = await getProject(m[1], user.id);
  if (!project) return new Response("없음", { status: 404 });

  // 완성본은 renders 비공개 버킷에 있다 — 이 라우트가 소유자를 확인하고 흘려준다.
  // 서명 URL 을 프론트에 주지 않는 이유는 uploads 와 같다: 문서에 저장된 url 이
  // 영구히 유효해야 한다.
  try {
    const buf = await getStore().getObject("renders", name);
    return new Response(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch {
    // 버킷에 없다 = 아직 이관되지 않았거나 지워진 것. 파일이 없던 때와 같은 답이다.
    return new Response("없음", { status: 404 });
  }
});
