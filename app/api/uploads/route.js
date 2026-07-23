// 사진 업로드 — 실험 단계용 로컬 저장. 배포 시 Supabase Storage 이관.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;

function uploadsDir() {
  return path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads");
}

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
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), stored), Buffer.from(await file.arrayBuffer()));
  return Response.json({ id, filename: file.name, url: `/api/uploads/${stored}` });
}
