import { promises as fs } from "fs";
import path from "path";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(req, { params }) {
  const { name } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  const dir = path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads");
  try {
    const buf = await fs.readFile(path.join(dir, name));
    return new Response(buf, { headers: { "Content-Type": MIME[name.split(".").pop()] } });
  } catch {
    return new Response("없음", { status: 404 });
  }
}
