// 업로드 파일 서빙 — 비공개 버킷에서 받아 흘려준다.
//
// 소유자 검사: upload_owners 테이블 역조회. 업로드는 프로젝트가 생기기 전에 일어나서
// 파일명에서 프로젝트를 되짚을 수 없다 — 그래서 별도 원장이 필요하다(renders 와 다른 이유).
import { getStore } from "../../../../lib/store/index.js";
import { withUser } from "../../../../lib/auth/require-user.js";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const BUCKET = "uploads";

export const GET = withUser(async (_req, { params }, user) => {
  const { name } = await params;
  // 경로 조작 방지 — 버킷 키에 슬래시나 상위 경로가 들어가면 안 된다
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  // 주인 기록이 없는 파일은 열지 않는다 — 옛 업로드는 백필(Task 13)이 채운다.
  const owner = await getStore().findUploadOwner(name);
  if (owner !== user.id) {
    return new Response("파일을 찾을 수 없어요", { status: 404 });
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
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[name.split(".").pop()],
      // 업로드는 내용이 바뀌지 않는다(이름이 UUID다) — 오래 캐시해도 된다
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
