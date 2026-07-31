import { promises as fs } from "fs";
import path from "path";
import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject } from "../../../../lib/projects.js";

// 파일명이 곧 프로젝트 id 다(lib/compose.js:184 가 `${projectId}.mp4` 로 쓴다).
// 그래서 별도 매핑 없이 소유자를 검사할 수 있다(uploads 와 달리 upload_owners 가 필요 없다).
const UUID_MP4 = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.mp4$/;

export const GET = withUser(async (_req, { params }, user) => {
  const { name } = await params;
  const m = UUID_MP4.exec(name);
  if (!m) return new Response("잘못된 파일명", { status: 400 });

  const project = await getProject(m[1], user.id);
  if (!project) return new Response("없음", { status: 404 });

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
});
