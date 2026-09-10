import { withUser } from "../../../../lib/auth/require-user.js";
import { getProjectForViewing } from "../../../../lib/projects.js";
import { getStore } from "../../../../lib/store/index.js";
import { FILM_MODES } from "../../../../lib/film/mode.js";
import { cachedSignedUrl } from "../../../../lib/signed-url-cache.js";

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
  // ★ 손님(비로그인)도 본다(2026-08-27, lib/auth/guest.js) — 그래도 **프로젝트가 있어야**
  //   흘려준다. 파일명만 찍어 보는 길은 그대로 막혀 있다.
  const project = (await getProjectForViewing(m[1], user?.id ?? null))?.doc || null;
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
  // ★★★ 2026-09-10 **라이브 실측 뒤 고침** — 각인이 종류마다 **다른 자리**에 산다.
  //   배포하고 재 보니 주력 둘이 캐시를 전혀 안 타고 있었다(둘 다 `private, no-cache`):
  //     reel → 각인이 `reel.video.ts` 인데 여기서 `render.ts` 만 봤다
  //     ad   → `videos[0]` 에 각인이 **아예 없었다**(그래서 lib/ad/pipeline.js 에 적게 했다)
  //   각인이 없으면 캐시를 안 거는 규칙은 옳다(재굽기 때 옛 영상을 못 밀어낸다) — 틀린 것은
  //   **찾는 자리**였고, 그 탓에 절감이 단계별·film 에만 걸렸다.
  // ★ 순서대로 본다: film(방식별) → reel → 광고 → 단계별.
  const ts = mode
    ? project.films?.[mode]?.video?.ts
    : project.reel?.video?.ts ?? project.videos?.[0]?.ts ?? project.render?.ts;
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
    // ★ 같은 영상에는 **같은 주소**를 준다(2026-09-07, lib/signed-url-cache.js).
    //   서명을 매번 새로 만들면 주소가 요청마다 달라져 브라우저 캐시도 Storage 앞단 CDN 도
    //   전부 빗나간다 — 그 상태로 전송 할당량이 터져 프로젝트가 402 로 막혔다.
    //   위의 304 절감은 302 에 ETag 가 없어 프로덕션에서는 애초에 안 탄다. 실제로 무는 것은
    //   이 재사용이다.
    // ★ 무효화는 ts 다 — 다시 구우면 키가 바뀌어 새 주소가 나간다. ts 가 없으면(옛 문서)
    //   키를 안 만든다 = 재사용하지 않는다.
    // ★ 첨부(dl)는 서명 자체가 다르므로 키도 갈라 둔다 — 안 가르면 미리보기가 내려받기가 된다.
    const key = ts ? `renders|${name}|${ts}|${wantsDownload ? "dl" : "inline"}` : null;
    // ★★ 2026-09-10 — **302 자체를 캐시하게 한다.** 여기가 `no-store` 이던 동안 브라우저는
    //   같은 영상을 볼 때마다(그리고 `<video>` 가 되감기·이어보기로 다시 물을 때마다) 이 문을
    //   다시 두드렸고, 두드릴 때마다 찬 인스턴스에 닿으면 주소가 갈려 이미 받아 둔 3~13MB 가
    //   헛것이 됐다. 안 물으면 바이트가 아예 안 나간다 — 09-07 에 서비스를 죽인 그 전송이다.
    // ★ 초는 **표가 정한다**(lib/signed-url-cache.js). 여기서 상수로 적으면 "표가 29분째
    //   물고 있던 주소"에 30분짜리 캐시를 얹어 만료된 주소를 물리게 된다 — 그러면 영상이
    //   안 열린다(이 장치의 유일한 위험). 표는 남은 수명에서 여유를 두 겹 빼고 준다.
    // ★ maxAge 0 = "물고 있지 마라"(각인 없는 옛 문서). no-store 가 아니라 no-cache 인 것은
    //   이 라우트의 나머지 자리와 같은 말을 쓰기 위해서다 — 어차피 302 에는 검증자가 없어
    //   브라우저는 매번 다시 묻는다.
    const { url: signed, maxAge } = await cachedSignedUrl(key, SIGNED_URL_SECONDS, () =>
      store.signedObjectUrl("renders", name, SIGNED_URL_SECONDS, wantsDownload ? { download: name } : {})
    ).catch(() => ({ url: null, maxAge: 0 }));
    if (signed) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: signed,
          // ★ private 이어야 한다 — 서명 주소는 그 자체가 열쇠다. 공유 캐시(CDN·프록시)에
          //   남으면 로그인을 지나지 않고도 남의 영상에 닿는다.
          "Cache-Control": maxAge > 0 ? `private, max-age=${maxAge}` : "private, no-cache",
        },
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
}, { guest: true });
