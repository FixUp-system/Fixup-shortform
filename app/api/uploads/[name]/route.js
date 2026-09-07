// 업로드 파일 서빙 — 비공개 버킷에서 받아 흘려준다.
//
// 소유자 검사: upload_owners 테이블 역조회. 업로드는 프로젝트가 생기기 전에 일어나서
// 파일명에서 프로젝트를 되짚을 수 없다 — 그래서 별도 원장이 필요하다(renders 와 다른 이유).
import { getStore } from "../../../../lib/store/index.js";
import { withUser } from "../../../../lib/auth/require-user.js";
// 이름 규약은 순수 모듈에, 실제로 줄이는 일은 서버 모듈에 — 카드도 앞엣것을 읽는다.
import { thumbKeyFor } from "../../../../lib/thumb-url.js";
import { makeThumb, THUMB_TYPE } from "../../../../lib/thumbs.js";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const BUCKET = "uploads";

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
  const wantsThumb = /[?&]t=1(&|$)/.test(String(req?.url || ""));
  if (wantsThumb) {
    const key = thumbKeyFor(name);
    try {
      const small = await getStore().getObject(BUCKET, key).catch(async () => {
        const orig = await getStore().getObject(BUCKET, name);
        const made = await makeThumb(orig);
        await getStore().putObject(BUCKET, key, made, THUMB_TYPE).catch((e) =>
          console.error(`작은 판 저장 실패(응답은 그대로 나간다): ${key} — ${e?.message || e}`)
        );
        return made;
      });
      return new Response(small, {
        headers: {
          "Content-Type": THUMB_TYPE,
          // 원본과 같은 규약 — 이름이 내용을 정하므로 오래 캐시해도 된다.
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } catch (e) {
      // 작은 판을 못 만들었다고 사진이 아예 안 보이면 안 된다 — 아래 원본 갈래로 떨어진다.
      console.error(`작은 판 실패, 원본으로 떨어진다: ${name} — ${e?.message || e}`);
    }
  }

  let buf;
  try {
    buf = await getStore().getObject(BUCKET, name);
  } catch (e) {
    // 없는 파일과 저장소 오류를 **사용자에게는** 구분해 주지 않는다 — 어느 쪽이든
    // "그 사진이 없다"이다. 대신 원인은 반드시 로그에 남긴다. 예전에는 빈 catch 라
    // env 누락도 Storage 장애도 똑같이 404 로만 보였고, 남는 기록이 한 줄도 없었다
    // ("원인은 서버 로그에 남는다"고 적어 뒀는데 남기는 코드가 없었다).
    console.error(`업로드 조회 실패: ${name} — ${e?.message || e}`);
    return new Response("파일을 찾을 수 없어요", { status: 404 });
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
