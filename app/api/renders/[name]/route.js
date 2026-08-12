import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject } from "../../../../lib/projects.js";
import { getStore } from "../../../../lib/store/index.js";

// 파일명이 곧 프로젝트 id 다(lib/compose.js 가 `${projectId}.mp4` 로 올린다).
// 그래서 별도 매핑 없이 소유자를 검사할 수 있다(uploads 와 달리 upload_owners 가 필요 없다).
const UUID_MP4 = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.mp4$/;

export const GET = withUser(async (req, { params }, user) => {
  const { name } = await params;
  const m = UUID_MP4.exec(name);
  if (!m) return new Response("잘못된 파일명", { status: 400 });

  const project = await getProject(m[1], user.id);
  if (!project) return new Response("없음", { status: 404 });

  // ── 캐시 ────────────────────────────────────────────────────────────────
  //
  // 영상은 볼 때마다 전량이 나간다(실측 개당 8~13MB). 무료 플랜은 저장(1GB)보다
  // **전송이 먼저 찬다** — 그래서 같은 사람이 다시 볼 때의 전송을 0 으로 만든다.
  //
  // ★ ETag 는 render.ts 다. 라우트가 이미 getProject 를 불렀으니 왕복이 안 늘고,
  //   재합성하면 pipeline 이 ts 를 갱신하므로 캐시가 저절로 무효화된다.
  //   URL 은 /api/renders/<id>.mp4 로 늘 같아서 URL 만으로는 갱신을 알릴 수 없다.
  //
  // ★ private 이어야 한다 — 비공개 영상이 공유 캐시(CDN·프록시)에 남으면 안 된다.
  // ★ no-cache 는 "캐시하지 마라"가 아니라 "쓰기 전에 물어봐라"다. 재합성이 즉시
  //   반영되면서도, 안 바뀌었으면 304 로 끝나 본문이 안 나간다.
  //
  // ★ 이 판정을 getObject **앞**에 둔다. 뒤에 두면 이미 내려받은 뒤라 절감이 없다.
  const etag = project.render?.ts ? `"${project.render.ts}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
  }

  // 완성본은 renders 비공개 버킷에 있다 — 이 라우트가 소유자를 확인하고 흘려준다.
  // 서명 URL 을 프론트에 주지 않는 이유는 uploads 와 같다: 문서에 저장된 url 이
  // 영구히 유효해야 한다.
  try {
    const buf = await getStore().getObject("renders", name);
    return new Response(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-cache",
        ...(etag ? { ETag: etag } : {}),
      },
    });
  } catch {
    // 버킷에 없다 = 아직 이관되지 않았거나 지워진 것. 파일이 없던 때와 같은 답이다.
    return new Response("없음", { status: 404 });
  }
});
