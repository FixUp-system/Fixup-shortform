import { withUser } from "../../../../lib/auth/require-user.js";
import { getProjectForViewing } from "../../../../lib/projects.js";
import { getStore } from "../../../../lib/store/index.js";
import { FILM_MODES } from "../../../../lib/film/mode.js";

// 파일명이 곧 프로젝트 id 다(lib/compose.js 가 `${projectId}.mp4` 로 올린다).
// 그래서 별도 매핑 없이 소유자를 검사할 수 있다(uploads 와 달리 upload_owners 가 필요 없다).
//
// ★ `-raw` 갈래도 받는다 — 완성본 말고 **자막 없는 원본**(`${projectId}-raw.mp4`)이 있고,
// ⑥완성 화면의 미리보기가 그것을 재생한다. uuid 만 받던 때는 `r`·`w` 가 hex 가 아니라
// 400 이 나서, 자막 적용은 되는데 미리보기만 안 보였다.
// 소유자 검사는 어느 갈래든 **m[1](프로젝트 id)** 하나로 한다 — 원본도 같은 문을 지난다.
// 서명 수명 — 재생 중에 만료되면 영상이 중간에 끊긴다. 넉넉하되 짧게 둔다.
const SIGNED_URL_SECONDS = 60 * 30;

// ★ `-<방식>` 갈래도 받는다(2026-08-19) — 한 번에 굽는 영상은 **한 프로젝트에서 두 편**을
// 굽는다(order·refs). 이름이 `<id>.mp4` 하나면 나중 것이 앞 것을 덮어 비교 대상이 사라지므로
// 방식을 이름에 넣는다(lib/film/pipeline.js 의 filmVideoBase). 소유자 검사는 그대로
// **m[1](프로젝트 id)** 하나로 한다 — 광고 이름(`<id>.mp4`·`<id>-raw.mp4`)은 그대로 통과한다.
// ★ 방식 목록은 lib/film/mode.js 의 표에서 읽는다. 여기에 손으로 "order|refs" 를 적으면
//   표와 갈리고, 그러면 새 방식의 영상이 저장은 되는데 열리지 않는다.
const MODES = FILM_MODES.map((m) => m.id).join("|");
const RENDER_MP4 = new RegExp(
  `^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-(?:${MODES}))?(-raw)?\\.mp4$`
);

export const GET = withUser(async (req, { params }, user) => {
  const { name } = await params;
  const m = RENDER_MP4.exec(name);
  if (!m) return new Response("잘못된 파일명", { status: 400 });

  // ★ 소유자가 아니어도 재생된다(보관함 전체 공유) — 내부 팀이라 서로의 결과물을 본다.
  //   그래도 **로그인은 지난다**(withUser): 주소를 아는 아무나에게 열지는 않는다.
  //   프로젝트가 없으면 그대로 404 다 — 파일명만 찍어 보는 길은 여전히 막혀 있다.
  const project = (await getProjectForViewing(m[1], user.id))?.doc || null;
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
  // ★ film 문서에는 render 가 없다 — 방식별 영상은 films[방식].video 에 있다. 그래서
  //   이름에서 되찾은 방식으로 그 자리의 ts 를 읽는다(안 읽으면 이 경로의 영상만 304 를
  //   못 타 볼 때마다 전량이 다시 나간다). 광고 이름은 m[2] 가 없어 예전 자리를 그대로 본다.
  const mode = m[2] ? m[2].slice(1) : null;
  const ts = mode ? project.films?.[mode]?.video?.ts : project.render?.ts;
  const etag = ts ? `"${ts}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
  }

  // ★ 본문을 함수로 흘리지 않는다 — Vercel 함수의 응답 본문 상한이 4.5MB 인데 이
  // 영상은 개당 8~13MB 다(위 캐시 주석의 실측값). 소유자 검사까지는 함수가 하고,
  // 통과하면 **짧은 수명의 서명 URL 로 302** 를 보내 브라우저가 Storage 에서 직접 받는다.
  //
  // ★ 저장된 주소(/api/renders/<id>.mp4)는 그대로다 — 문서에 남은 url 이 영구히
  //   유효해야 한다는 규약을 지킨다. 서명은 이 문을 지날 때마다 새로 만든다.
  // ★ 서명을 못 만드는 저장소(메모리·로컬 개발)에서는 아래 기존 경로로 떨어진다.
  //   그래야 로컬에서 지금처럼 그대로 돌고, 테스트도 실제 바이트를 확인할 수 있다.
  // ★ ?dl=1 은 내려받기 링크만 붙인다. 302 뒤에는 다른 출처라 <a download> 가 안 먹어서,
  //   첨부로 내려줄지를 서명에 실어 Storage 가 정하게 한다(미리보기는 인라인이어야 한다).
  const store = getStore();
  if (typeof store.signedObjectUrl === "function") {
    const wantsDownload = new URL(req.url).searchParams.get("dl") === "1";
    const signed = await store
      .signedObjectUrl("renders", name, SIGNED_URL_SECONDS, wantsDownload ? { download: name } : {})
      .catch(() => null);
    if (signed) {
      return new Response(null, {
        status: 302,
        headers: { Location: signed, "Cache-Control": "private, no-store" },
      });
    }
  }

  // 완성본은 renders 비공개 버킷에 있다 — 이 라우트가 소유자를 확인하고 흘려준다.
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
