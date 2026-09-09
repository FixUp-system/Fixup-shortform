// 업로드 파일 서빙 — 비공개 버킷에서 받아 흘려준다.
//
// 소유자 검사: upload_owners 테이블 역조회. 업로드는 프로젝트가 생기기 전에 일어나서
// 파일명에서 프로젝트를 되짚을 수 없다 — 그래서 별도 원장이 필요하다(renders 와 다른 이유).
import { getStore } from "../../../../lib/store/index.js";
import { withUser } from "../../../../lib/auth/require-user.js";
// 이름 규약은 순수 모듈에, 실제로 줄이는 일은 서버 모듈에 — 카드도 앞엣것을 읽는다.
import { thumbKeyFor } from "../../../../lib/thumb-url.js";
import { makeThumb, THUMB_TYPE } from "../../../../lib/thumbs.js";
// 손님 보관함 스위치 — 캐시 문을 여기에 묶는다(아래 thumbCacheControl 주석).
import { guestArchiveOn } from "../../../../lib/auth/guest.js";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const BUCKET = "uploads";

// 작은 판의 캐시 문 — **엣지가 쥘 수 있게 하되, 그 문을 스위치에 묶는다** (2026-09-09).
//
// ★★★ 왜. 사장님이 "렌더링이 너무 느리다"고 해서 라이브를 쟀다: 표지 12장을 브라우저처럼
//   6개씩 받으면 **6.9초**(24장이면 ~14초). 응답이 `private` 라 **CDN 이 하나도 못 쥐고**
//   (`X-Vercel-Cache: MISS` 가 몇 번을 불러도 그대로), 그때마다 함수가 뜨고 Postgres 를
//   한 번 조회하고 Storage 를 한 번 내려받는다 — **방문 한 번에 그 왕복이 25번**이다.
//   ★ 속도만의 문제가 아니다. 2026-09-07 에 서비스를 죽인 전송량 모양이 그대로 남아
//     있었다 — 파일만 작아졌지(19KB) 방문마다 Supabase 에서 새로 꺼낸다.
//
// ★★★ 그런데 `public` 은 아무 때나 켜면 안 된다. **엣지에 남은 사본은 로그인 벽을 안 지난다.**
//   그래서 이미 손님에게 열려 있을 때만 연다:
//     스위치 ON  → 이 라우트는 손님 GET 을 허용한다(withUser 의 guest 옵션 · lib/auth/guest.js).
//                  누구나 이미 받을 수 있으니 엣지가 쥔다고 **새로 열리는 것이 없다.**
//     스위치 OFF → 로그인 벽이 살아 있다 → `private` 를 지킨다.
// ★ 판정을 **요청자가 아니라 서버 스위치**로 한다. 사람마다 갈리면 `Vary` 없이는 엣지가
//   남의 사본을 내주고, `Vary` 를 붙이면 캐시가 사실상 안 먹는다. 그래서 Vary 를 안 단다.
// ★ 원본(`?t=1` 없음)은 스위치와 무관하게 `private` 다 — 랜딩이 쓰는 것은 작은 판뿐이라
//   여는 이득이 없고, 여는 범위는 좁을수록 좋다.
function thumbCacheControl() {
  const shared = guestArchiveOn() ? "public" : "private";
  return `${shared}, max-age=31536000, immutable`;
}

// 없는 파일의 404 — **잠깐만** 엣지가 쥔다.
//
// ★ 09-07 에 못 옮긴 파일이 많아(표지 주소가 있는 25편 중 스무 편) 방문마다 그 스무 번을
//   다시 두드리는 것 자체가 느림이다. 한 번 없던 파일은 대개 다음에도 없다.
// ★★ 그런데 **오래 쥐면 안 된다.** 그 파일들은 되찾을 대상이고(옛 Supabase 에 531MB 가
//   잠겨 있다), 404 가 캐시에 박히면 되살아난 사진이 그만큼 가려진다. 그래서 분 단위다.
// ★ 손님 보관함이 꺼져 있으면 캐시 지시를 아예 안 단다 — 로그인 벽 뒤의 응답이다.
function notFound() {
  return new Response("파일을 찾을 수 없어요", {
    status: 404,
    headers: guestArchiveOn() ? { "Cache-Control": "public, max-age=300" } : {},
  });
}

// user 는 이제 안 쓴다 — withUser 는 그대로 둔다(로그인 자체는 여전히 문이다).
export const GET = withUser(async (req, { params }) => {
  const { name } = await params;
  // 경로 조작 방지 — 버킷 키에 슬래시나 상위 경로가 들어가면 안 된다
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  // ★ 소유자 대조를 걷어냈다(보관함 전체 공유) — 남이 만든 영상의 재료 사진도 보여야
  //   상세 화면이 온전하다. 대신 **주인 기록이 없는 파일은 여전히 안 연다**: 그 검사가
  //   남아 있어야 아무 이름이나 찍어 보는 길(존재 확인)이 막힌다. 로그인은 지난다.
  const owner = await getStore().findUploadOwner(name);
  if (!owner) {
    return new Response("파일을 찾을 수 없어요", { status: 404 });
  }
  // ★ ?t=1 이면 **카드용 작은 판**을 준다 (2026-09-07).
  //
  //   카드에서 영상을 뺀 뒤 카드의 얼굴이 원본 사진이 됐는데, 실측 355장 평균 290KB 다
  //   (카드는 화면에서 300~400px). 보관함 한 번 훑으면 5.8MB 가 나갔다.
  //
  //   ★★ **만든 것을 저장한다.** 그때그때 줄이기만 하면 Supabase 전송은 **안 준다** —
  //     함수가 원본을 여전히 내려받기 때문이다(줄어드는 것은 Vercel 쪽뿐).
  //     저장해 두면 다음 요청부터 작은 것만 오간다. 덤으로 **백필 스크립트가 필요 없다**:
  //     옛 사진도 처음 보일 때 저절로 최적화된다.
  //   ★ 저장에 실패해도 이번 응답은 그대로 나간다 — 사진 한 장을 못 보여줄 이유가 아니다.
  //   ★ 주소를 안 바꾸는 이유는 이 파일 머리말과 같다(문서에 박힌 url 이 영구히 유효해야 한다).
  // ★★★ 2026-09-09 — **헛걸음 하나를 걷어냈다.** 그전에는 죽은 파일 하나에 Storage 를
  //   **세 번** 두드렸다: 작은 판(1) → 없으니 원본(2) → 그것도 없어 예외가 위로 튀고
  //   바깥 갈래가 **원본을 또**(3). 원본이 한 번 없었으면 두 번째도 없다.
  //   라이브 실측으로 그 값이 보였다 — **404 가 성공보다 2.7배 느리다**(3.34초 vs 1.22초).
  //   표지 주소가 있는 25편 중 스무 편이 이것이라(09-07 파일 미이관) 랜딩 느림의 큰 몫이고,
  //   그동안 브라우저 연결 슬롯을 잡아 **살아 있는 표지까지 뒤로 민다.**
  //   지금은 어느 길로 가도 최대 두 번이고, 작은 판이 이미 있으면 **한 번**이다.
  const wantsThumb = /[?&]t=1(&|$)/.test(String(req?.url || ""));
  // 원본을 이미 손에 넣었으면 아래에서 다시 받지 않는다(작은 판만 실패한 경우).
  let orig = null;
  if (wantsThumb) {
    const key = thumbKeyFor(name);
    let small = await getStore().getObject(BUCKET, key).catch(() => null);
    if (!small) {
      orig = await getStore().getObject(BUCKET, name).catch((e) => {
        console.error(`업로드 조회 실패: ${name} — ${e?.message || e}`);
        return null;
      });
      // ★ 원본이 없으면 아래 갈래도 **반드시** 실패한다 — 한 번 더 두드리지 않는다.
      if (!orig) return notFound();
      small = await makeThumb(orig).catch((e) => {
        // 작은 판을 못 만들었다고 사진이 아예 안 보이면 안 된다 — 원본으로 떨어진다.
        console.error(`작은 판 실패, 원본으로 떨어진다: ${name} — ${e?.message || e}`);
        return null;
      });
      if (small) {
        await getStore().putObject(BUCKET, key, small, THUMB_TYPE).catch((e) =>
          console.error(`작은 판 저장 실패(응답은 그대로 나간다): ${key} — ${e?.message || e}`)
        );
      }
    }
    if (small) {
      return new Response(small, {
        headers: {
          "Content-Type": THUMB_TYPE,
          // 이름이 내용을 정하므로(UUID) 오래 캐시해도 된다. 남은 문제는 **누가** 쥐느냐다.
          "Cache-Control": thumbCacheControl(),
        },
      });
    }
  }

  let buf = orig;
  if (!buf) {
    // 없는 파일과 저장소 오류를 **사용자에게는** 구분해 주지 않는다 — 어느 쪽이든
    // "그 사진이 없다"이다. 대신 원인은 반드시 로그에 남긴다. 예전에는 빈 catch 라
    // env 누락도 Storage 장애도 똑같이 404 로만 보였고, 남는 기록이 한 줄도 없었다
    // ("원인은 서버 로그에 남는다"고 적어 뒀는데 남기는 코드가 없었다).
    buf = await getStore().getObject(BUCKET, name).catch((e) => {
      console.error(`업로드 조회 실패: ${name} — ${e?.message || e}`);
      return null;
    });
    if (!buf) return notFound();
  }
  // ★ ?dl=1 이면 **내려받기**로 준다(2026-08-27 사장님 요청: 이미지 다운로드 버튼).
  //   같은 출처라 <a download> 만으로도 대개 되지만, 이 헤더가 있어야 파일 이름이
  //   버킷 키(uuid)가 아니라 우리가 정한 이름으로 저장된다(완성본 라우트와 같은 처방).
  //   ★ `new URL(req.url)` 로 파싱하지 않는다 — 주소가 상대경로인 요청(테스트 픽스처가
  //     그렇다)에서 **던진다**. 사진 한 장을 흘려주는 자리가 파라미터 하나 때문에 500 이
  //     되면 안 된다. 있는지만 보면 되는 값이라 글자로 찾는다.
  const wantsDownload = /[?&]dl=1(&|$)/.test(String(req?.url || ""));
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[name.split(".").pop()],
      ...(wantsDownload ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
      // 업로드는 내용이 바뀌지 않는다(이름이 UUID다) — 오래 캐시해도 된다
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}, { guest: true });
