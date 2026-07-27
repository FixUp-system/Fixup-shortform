import { promises as fs } from "fs";
import path from "path";

// 완성본 내려받기. 파일명 가드는 uploads 와 같은 방식 —
// 정규식을 통과한 이름만 경로에 붙인다(.. 가 섞이면 여기서 걸린다).
export async function GET(req, { params }) {
  const { name } = await params;
  if (!/^[a-z0-9-]+\.mp4$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  const dir = path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "renders");
  try {
    const buf = await fs.readFile(path.join(dir, name));
    return new Response(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch {
    return new Response("없음", { status: 404 });
  }
}
