// 사진 업로드 — Supabase Storage 비공개 버킷.
//
// URL 형태(/api/uploads/<uuid>.<ext>)를 바꾸지 않는다. 이 문자열이 프로젝트 문서의
// material.photos[].url 에 박히기 때문이다. 서명 URL 을 프론트에 직접 주면 만료되는데
// 문서에 박힌 값은 안 바뀐다 — 그러면 과거 프로젝트의 사진이 조용히 깨진다.
import { randomUUID } from "crypto";
import { getStore } from "../../../lib/store/index.js";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "uploads";

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "file 필드가 필요해요" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return Response.json({ error: "jpg/png/webp만 올릴 수 있어요" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "10MB 이하만 올릴 수 있어요" }, { status: 400 });

  const id = randomUUID();
  const stored = `${id}.${ext}`;
  try {
    await getStore().putObject(BUCKET, stored, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return Response.json({ error: `파일을 저장하지 못했어요: ${e.message}` }, { status: 500 });
  }
  return Response.json({ id, filename: file.name, url: `/api/uploads/${stored}` });
}
