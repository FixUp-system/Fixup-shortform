import { getProject, updateProject } from "../../../../lib/projects.js";
import { isAspect } from "../../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../../lib/ad/options.js";
import { isAdSeconds } from "../../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../../lib/refs-io.js";
import { withUser } from "../../../../lib/auth/require-user.js";

const MAX_PHOTOS = 4;

// 광고 문서만 다룬다. 기존 문서는 **404** 다 — 양방향 격리의 한쪽이다.
// (반대쪽은 app/api/projects/[id]/** 가 kind:"ad" 를 404 로 거절한다.)
export async function loadAd(id, ownerId) {
  const project = await getProject(id, ownerId);
  return project && project.kind === "ad" ? project : null;
}

export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  return Response.json(project);
});

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await loadAd(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  // 굽는 중에는 못 고친다 — 고치면 시나리오가 버려지는데 그 시나리오로 이미 값이 나갔다
  if (project.status === "rendering") {
    return Response.json({ error: "만드는 중이라 고칠 수 없어요" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);

  let options;
  try {
    options = normalizeAdOptions({ ...project.settings, ...(body?.settings || {}) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  const seconds = body?.settings?.seconds ?? project.settings.seconds;
  if (!isAdSeconds(seconds)) return Response.json({ error: "그 길이는 아직 안 돼요" }, { status: 400 });
  const aspect = body?.settings?.aspect_ratio ?? project.settings.aspect_ratio;
  if (!isAspect(aspect)) return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });

  let photos = project.material.photos;
  if (body?.material?.photos !== undefined) {
    photos = Array.isArray(body.material.photos) ? body.material.photos : [];
    if (photos.length > MAX_PHOTOS) {
      return Response.json({ error: `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요` }, { status: 400 });
    }
    if (!(await ownedPhotoKeys(photos, user.id))) {
      return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
    }
  }
  const text = typeof body?.material?.text === "string" ? body.material.text.slice(0, 4000) : project.material.text;

  // ★ 고치면 시나리오를 버리고 draft 로 되돌린다.
  //   낡은 시나리오로 굽는 길을 아예 막는다 — 그래서 낡음 판정을 새로 만들 필요가 없다.
  const updated = await updateProject(id, user.id, (p) => ({
    ...p,
    settings: { ...p.settings, ...options, seconds, aspect_ratio: aspect },
    material: { ...p.material, text, photos },
    scenario: null,
    status: "draft",
    video_error: null,
  }));
  return Response.json(updated);
});
