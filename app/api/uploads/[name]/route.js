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
}
