import { createProject } from "../../../lib/projects";
import { TARGET_CHOICES } from "../../../lib/script";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string") {
    return Response.json({ error: "material.text가 필요해요" }, { status: 400 });
  }
  // 원하는 길이는 사장님이 고른다. 고르지 않으면(null) 자료가 담은 사실 수로 정한다.
  // 목록에 없는 값은 조용히 무시한다 — 400으로 막으면 자료를 다 쓰고 되돌아가야 한다.
  const target = TARGET_CHOICES.includes(body?.settings?.target_seconds)
    ? body.settings.target_seconds
    : null;
  const project = await createProject({
    // 비율은 9:16으로 시작하고 대본 승인 직전에 고른다 — docs/…/2026-07-24-pipeline-roadmap.md
    settings: { aspect_ratio: "9:16", target_seconds: target },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
  });
  return Response.json(project);
}
