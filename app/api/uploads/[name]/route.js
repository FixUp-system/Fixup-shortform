// 업로드 파일 서빙 — 비공개 버킷에서 받아 흘려준다.
//
// 인증이 붙으면 여기가 소유자 검사 자리다. 지금은 이름만 알면 누구나 받을 수 있다.
import { getStore } from "../../../../lib/store/index.js";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const BUCKET = "uploads";

export async function GET(_req, { params }) {
  const { name } = await params;
  // 경로 조작 방지 — 버킷 키에 슬래시나 상위 경로가 들어가면 안 된다
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  let buf;
  try {
    buf = await getStore().getObject(BUCKET, name);
  } catch {
    // 없는 파일과 저장소 오류를 여기서는 구분하지 않는다 — 어느 쪽이든 사용자에게는
    // "그 사진이 없다"이고, 원인은 서버 로그에 남는다
    return new Response("파일을 찾을 수 없어요", { status: 404 });
  }
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[name.split(".").pop()],
      // 업로드는 내용이 바뀌지 않는다(이름이 UUID다) — 오래 캐시해도 된다
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
