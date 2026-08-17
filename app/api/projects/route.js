import { createProject, listProjects } from "../../../lib/projects";
import { isAspect, DEFAULT_ASPECT_ID } from "../../../lib/aspects";
import { TARGET_CHOICES } from "../../../lib/script";
import { normalizeStyle, normalizePromptNote } from "../../../lib/styles";
import { ownedPhotoKeys } from "../../../lib/refs-io.js";
import { withUser } from "../../../lib/auth/require-user.js";
import { DEFAULT_I2V_MODEL, I2V_MODEL_IDS, isResolutionFor } from "../../../lib/clip-limits";

// 내 프로젝트 목록 — doc 통짜를 안 실어 보낸다(listProjects 가 이미 요약해서 준다).
export const GET = withUser(async (_req, _ctx, user) => {
  return Response.json({ projects: await listProjects(user.id) });
});

export const POST = withUser(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.material?.text !== "string") {
    return Response.json({ error: "material.text가 필요해요" }, { status: 400 });
  }
  // 원하는 길이는 사장님이 고른다. 고르지 않으면(null) 자료가 담은 사실 수로 정한다.
  // 목록에 없는 값은 조용히 무시한다 — 400으로 막으면 자료를 다 쓰고 되돌아가야 한다.
  const target = TARGET_CHOICES.includes(body?.settings?.target_seconds)
    ? body.settings.target_seconds
    : null;
  // 영상 컨셉은 자료를 넣는 화면에서 함께 고른다. 길이와 달리 조용히 무시하지 않는다 —
  // 고른 컨셉과 그림에 실리는 컨셉이 달라지면 아무도 못 알아본다.
  // 400 이어도 써 둔 자료는 화면에 남으므로(로컬 state) 되돌아가 다시 쓸 일이 없다.
  let style;
  if (body?.settings?.style !== undefined) {
    try {
      style = normalizeStyle(body.settings.style);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }
  // ★ 영상 모델은 길이·사이즈와 다르다 — 조용히 접으면 그 방향이 **비싼 쪽**이라
  // (Seedance 30초 160 vs Kling 50) 오타 하나가 청구를 3배로 만들고, 400 을 아무도
  // 못 봤으니 알아챌 방법이 없다. PATCH 는 이미 400 을 준다 — 두 입구가 같은 자를 쓴다.
  if (
    body?.settings?.i2v_model !== undefined &&
    !I2V_MODEL_IDS.includes(body.settings.i2v_model)
  ) {
    return Response.json({ error: "그 영상 모델은 몰라요" }, { status: 400 });
  }
  // 영상 사이즈도 자료를 넣는 화면에서 고른다. 길이와 같은 종류의 값이다 —
  // 모르는 값은 조용히 기본(세로)으로 떨어진다: 이 값으로 유료 호출이 나가지만, 목록 밖
  // 값은 우리 화면에서 나올 수 없고(닫힌 칩) 400 으로 막으면 자료를 다시 써야 한다.
  const aspect = isAspect(body?.settings?.aspect_ratio)
    ? body.settings.aspect_ratio
    : DEFAULT_ASPECT_ID;
  // 생성 시에도 같은 구멍이 있다 — 남의 업로드 키를 처음부터 material.photos 에 심을 수
  // 있었다(PATCH 와 같은 이유, 리뷰 I2).
  if (
    Array.isArray(body.material.photos) &&
    !(await ownedPhotoKeys(body.material.photos, user.id))
  ) {
    return Response.json({ error: "본인이 올린 사진만 쓸 수 있어요" }, { status: 400 });
  }
  const settings = {
    aspect_ratio: aspect,
    target_seconds: target,
    // ★ 기본값을 **명시 저장**한다. 값이 없는 것은 "안 골랐다"가 아니라 "이 기능 전에
    //   만들어졌다"는 뜻이고, 그런 프로젝트는 Kling 으로 돈다(lib/clip-limits.js).
    //   모르는 값은 위에서 400 으로 막았다 — 조용히 접으면 방향이 비싼 쪽이라
    //   오타 하나가 청구를 3배로 만든다.
    i2v_model: body.settings?.i2v_model ?? DEFAULT_I2V_MODEL,
    ...(style ? { style } : {}),
  };
  // ★ 화질. 이 settings 는 **명시 화이트리스트**라(PATCH 처럼 통짜 머지가 아니다) 여기
  // 적지 않으면 만들 때 고른 화질이 **말없이 사라진다** — 사장님은 1080p 를 골랐다고
  // 믿는데 720p 로 만들어진다.
  //
  // ★ 판정은 PATCH 와 **같은 자**다(isResolutionFor). 목록이 모델마다 다르므로
  //   지금 만들어지는 settings(=고른 모델이 들어 있는 그것)를 그대로 물어본다.
  //   모르는 값을 조용히 접지 않는 이유는 모델과 같다 — 접히는 방향이 비싼 쪽이고,
  //   모델에 없는 값을 저장하면 그대로 fal 유료 호출로 나가 거절당한다.
  //
  // ★ **안 보내면 아무것도 안 넣는다.** 기본값을 박으면 "미선택"과 "720p 명시"가
  //   구분되지 않고, 각인(lib/steps.js)이 그 차이를 본다.
  if (body?.settings?.resolution !== undefined) {
    if (!isResolutionFor(body.settings.resolution, { settings })) {
      return Response.json({ error: "그 화질은 몰라요" }, { status: 400 });
    }
    settings.resolution = body.settings.resolution;
  }
  // ★ 공통 지시(모든 이미지·영상에 함께 보내는 지시)도 **만들 때** 받는다(2026-08-18) —
  //   ①자료에서 따로 받던 칸을 첫 화면으로 모았다. 위 화질과 같은 이유로 여기 적지 않으면
  //   사장님이 적은 지시가 **말없이 사라진다**(이 settings 는 명시 화이트리스트다).
  //
  // ★ 판정은 PATCH 와 **같은 자**다(normalizePromptNote) — 상한을 넘으면 자르지 않고 400 이고,
  //   정규화한 값을 **되돌려 담는다**. 저장되는 값과 프롬프트가 읽는 값이 갈리면, 각인이
  //   그 차이를 보고 거짓 낡음으로 유료 [다시 만들기]를 연다(lib/cuts.js promptNoteOf).
  // ★ 안 보내면 아무것도 안 넣는다 — 화질과 같은 규칙이다.
  for (const [key, label] of [["image_note", "이미지 지시"], ["clip_note", "영상 지시"]]) {
    if (body?.settings?.[key] === undefined) continue;
    try {
      settings[key] = normalizePromptNote(body.settings[key], label);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }
  const project = await createProject({
    settings,
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
    ownerId: user.id,
  });
  return Response.json(project);
});
