import { getProject, getProjectForViewing, updateProject } from "../../../../lib/projects.js";
import { isAspect } from "../../../../lib/aspects.js";
import { normalizeAdOptions } from "../../../../lib/ad/options.js";
import {
  isAdSeconds, isAdModel, adSecondsFor, LEGACY_AD_MODEL,
  isAdResolution, adResolutionsFor, DEFAULT_AD_RESOLUTION, adRefMax,
} from "../../../../lib/ad/models.js";
import { ownedPhotoKeys } from "../../../../lib/refs-io.js";
import { getStore } from "../../../../lib/store/index.js";
import { tierOf, tierAllowsModel } from "../../../../lib/tiers.js";
import { withUser } from "../../../../lib/auth/require-user.js";
import { MAX_MATERIAL_TEXT } from "../../../../lib/material.js";


// 광고 문서만 다룬다. 기존 문서는 **404** 다 — 양방향 격리의 한쪽이다.
// (반대쪽은 app/api/projects/[id]/** 가 kind:"ad" 를 404 로 거절한다.)
export async function loadAd(id, ownerId) {
  const project = await getProject(id, ownerId);
  return project && project.kind === "ad" ? project : null;
}

// 읽기 전용 갈래 — **소유자를 안 따진다**(보관함 전체 공유).
//
// loadAd 를 안 고친다: 그 함수는 render·scenario 등 **값이 나가는 라우트 넷**이 함께
// 쓴다(app/api/ads/[id]/render/route.js 외). 거기서 소유자가 빠지면 남의 프로젝트로
// 돈이 나간다. 그래서 읽는 자리만 별도 이름으로 가른다.
async function loadAdForViewing(id, viewerId) {
  const viewed = await getProjectForViewing(id, viewerId);
  if (!viewed || viewed.doc.kind !== "ad") return null;
  return { project: viewed.doc, mine: viewed.mine, editable: viewed.editable };
}

// ★ 손님(비로그인)도 읽는다(lib/auth/guest.js) — mine 은 늘 false 다.
export const GET = withUser(async (_req, { params }, user) => {
  const { id } = await params;
  const viewed = await loadAdForViewing(id, user?.id ?? null);
  if (!viewed) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });
  // mine — 화면이 쓰기 버튼을 그릴지 정하는 근거다(만든 사람이 누구인지는 안 준다).
  return Response.json({ ...viewed.project, mine: viewed.mine, editable: viewed.editable });
}, { guest: true });

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
  // ★ 모델을 바꿀 수 있다. 옛 문서(모델 없음)는 **그 문서가 만들어진 모델**로 본다 —
  // lib/ad/models.js 의 adModel() 과 같은 폴백이지만, "모르는지"는 못 가리는 그 함수 대신
  // isAdModel 로 가른다.
  // ★★ 2026-08-31 — 여기는 **LEGACY_AD_MODEL** 이다(DEFAULT 가 아니다). 기본이 H3 로
  //   옮겨 가면서 갈렸는데, 이 자리는 새로 만드는 곳이 아니라 **이미 있는 문서를 고치는**
  //   곳이다. DEFAULT 로 두면 모델을 안 든 옛 문서가 H3 로 읽혀, 그 문서의 720p·15초가
  //   H3 목록에 없다는 이유로 **손도 못 대고 400** 이 된다.
  const model = body?.settings?.model ?? project.settings.model ?? LEGACY_AD_MODEL;
  if (!isAdModel(model)) return Response.json({ error: "그 영상 모델은 몰라요" }, { status: 400 });

  // ★★ 등급 문 — **세 번째 자리**다(2026-08-20). 만들기·굽기에 이미 달았지만, 여기가
  //   빠지면 기본 등급 사장님이 2.0 으로 만든 뒤 PATCH 로 2.5 로 바꿔 둘 수 있다.
  //   굽기가 막으므로 돈은 안 나가지만, 사장님은 **고를 수 있다고 믿고 시나리오까지 만든 뒤**
  //   굽기에서야 거절당한다 — 그 자리에서 할 수 있는 일이 없다.
  // ★ 값이 실제로 안 바뀌는 요청은 지나간다(model 을 안 보내면 project 의 것이 그대로다).
  //   등급이 내려간 뒤에도 옛 문서를 열고 다른 칸을 고칠 수는 있어야 한다.
  if (body?.settings?.model !== undefined) {
    // ★ 관리자는 등급을 안 탄다(2026-08-21) — 만들기·굽기와 같은 판정이다.
    const tier = tierOf((await getStore().findProfiles([user.id])).get(user.id));
    if (!tierAllowsModel(tier, model, { admin: user.role === "admin" })) {
      return Response.json({ error: "지금 등급에서는 고를 수 없는 모델이에요" }, { status: 403 });
    }
  }

  // ★ 모델을 바꾸면 길이도 **그 모델 기준으로 다시** 본다 — 2.5→2.0 으로 바꾸는데
  // 길이가 그대로 30초면 400 이어야 한다(2.0 은 15초뿐이다).
  const seconds = body?.settings?.seconds ?? project.settings.seconds;
  if (!isAdSeconds(seconds, model)) {
    return Response.json({ error: `이 모델은 ${adSecondsFor(model).join("·")}초만 만들 수 있어요` }, { status: 400 });
  }

  // ★ Task 24 — 해상도도 모델을 바꾸면 **그 모델 기준으로 다시** 본다(길이와 같은 규칙).
  // standard·1080p 로 만든 뒤 모델만 fast 로 되돌리면 400 이어야 한다(fast 는 1080p 가
  // 없다). 옛 문서(settings.resolution 없음)는 720p 로 본다.
  const resolution = body?.settings?.resolution ?? project.settings.resolution ?? DEFAULT_AD_RESOLUTION;
  if (!isAdResolution(resolution, model)) {
    return Response.json(
      { error: `이 모델은 ${adResolutionsFor(model).join("·")} 만 만들 수 있어요` },
      { status: 400 }
    );
  }
  const aspect = body?.settings?.aspect_ratio ?? project.settings.aspect_ratio;
  if (!isAspect(aspect)) return Response.json({ error: "그 화면 비율은 몰라요" }, { status: 400 });

  let photos = project.material.photos;
  if (body?.material?.photos !== undefined) {
    photos = Array.isArray(body.material.photos) ? body.material.photos : [];
    // ★ 상한은 **이 프로젝트가 고른 모델**이 정한다(2026-08-28). body 에 모델이 함께
    //   왔으면 그 값으로 잰다 — 모델과 사진을 한 번에 바꿀 때 옛 모델의 상한으로 재면
    //   2.5(30장)로 갈아타면서 올린 사진이 거절된다.
    const photoMax = adRefMax(body?.settings?.model || project.settings?.model);
    if (photos.length > photoMax) {
      return Response.json({ error: `사진은 ${photoMax}장까지 올릴 수 있어요` }, { status: 400 });
    }
    if (!(await ownedPhotoKeys(photos, user.id))) {
      return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
    }
  }
  const text = typeof body?.material?.text === "string" ? body.material.text.slice(0, MAX_MATERIAL_TEXT) : project.material.text;

  // ★ 고치면 시나리오를 버리고 draft 로 되돌린다.
  //   낡은 시나리오로 굽는 길을 아예 막는다 — 그래서 낡음 판정을 새로 만들 필요가 없다.
  //   모델 변경도 같은 규칙을 탄다: 시나리오가 버려지므로 낡은(다른 모델의) 시나리오로
  //   굽는 일이 없고, 다음 굽기의 청구는 항상 "지금" settings.model 로 다시 계산된다
  //   (app/api/ads/[id]/render/route.js·lib/ad/pipeline.js 가 project 를 매번 새로 읽는다) —
  //   그래서 굽고 나서 모델을 바꾸는 것을 따로 잠그지 않았다(보고서 참고).
  const updated = await updateProject(id, user.id, (p) => ({
    ...p,
    settings: { ...p.settings, ...options, seconds, aspect_ratio: aspect, model, resolution },
    material: { ...p.material, text, photos },
    scenario: null,
    status: "draft",
    video_error: null,
  }));
  return Response.json(updated);
});
