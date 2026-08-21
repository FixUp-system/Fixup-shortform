import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { generateImage, imageResolutionFor } from "../../../../../lib/imagegen.js";
import { buildImagePrompt } from "../../../../../lib/cuts.js";
import { loadCutRefs } from "../../../../../lib/cut-refs.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { modelIdForProject, resolutionForProject } from "../../../../../lib/clip-limits.js";
import { fakeFal } from "../../../../../lib/fake.js";
import { reelOf, putReel, isImagesLocked, imageTriesLeft } from "../../../../../lib/reel/doc.js";

// 그림 만들기 — 컷마다 한 장. film 의 images 라우트와 같은 결이다: 동기로 기다린다
// (컷 서넛 × 한 장이라 서버리스 상한 안에서 끝나고, 기다리면 실패가 HTTP 로 보인다).
//
// ★ 프롬프트는 lib/cuts.js 의 buildImagePrompt 를 그대로 쓴다 — 그 함수가 컷의 shows·
//   environment·tone(시나리오 라우트가 컷에 옮겨 둔 값)과 project.cast(캐스팅) 를 읽는다.
//   새로 짓지 않는다 — 두 벌이면 화면 미리보기와 실제로 나가는 프롬프트가 갈린다.
// ★ 레퍼런스는 loadCutRefs — 클립 단계(lib/reel/pipeline.js)와 같은 함수다. 시나리오
//   라우트가 캐스팅(lib/cast.js)을 돌려 컷에 ref_ids 를 꽂아 두므로, 캐스팅이 사람·사물을
//   찾은 컷은 여기서도 참조를 받는다 — 못 찾은 컷은 던지지 않고 참조 없이 그린다
//   (loadCutRefs 의 규약, missing 은 로그로만 남는다).
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  const cuts = project.cuts || [];
  if (!cuts.length) return Response.json({ error: "시나리오를 먼저 만들어 주세요" }, { status: 400 });

  const { only } = (await req.json().catch(() => ({}))) || {};
  // ★ 배열이 아닌 값을 조용히 무시하면 전부 다시 그린다 — 컷당 $0.08 이 통째로 나간다.
  if (only !== undefined && !Array.isArray(only)) {
    return Response.json({ error: "다시 그릴 그림을 골라 주세요" }, { status: 400 });
  }
  const wanted = Array.isArray(only) && only.length ? new Set(only) : null;

  // ★★ 2026-08-21 리뷰 I7 — 그림에는 청구가 없다(정가는 클립 굽기에 붙는다). 그런데
  //   only 로 같은 컷을 무한히 다시 그릴 수 있었고(컷당 $0.08 이 매번 나가는데 크레딧은
  //   0), 동기 대기라 두 탭이면 파이프라인 둘이 같은 문서를 갈아 썼다. film 의
  //   isDrawLocked/MAX_FILM_IMAGE_TRIES 와 같은 처방 — 재진입 잠금 + 횟수 상한
  //   (lib/reel/doc.js 에 reel 전용 상수로 새로 뒀다, 이 흐름 소유라 허용됐다).
  const reel = reelOf(project);
  if (isImagesLocked(reel)) {
    return Response.json({ error: "이미 그리는 중이에요" }, { status: 409 });
  }
  const triesLeft = imageTriesLeft(reel);
  if (triesLeft <= 0) {
    return Response.json({ error: "그림을 너무 많이 다시 그렸어요" }, { status: 400 });
  }

  // 정가 게이트 — 그림도 영상 정가에 포함이다(/clips 와 같은 문). 살아 있는 청구가 있으면
  // 그냥 지나간다. 가짜 모드는 건너뛴다 — 0원이라 받을 것이 없다.
  if (!fakeFal()) {
    try {
      await requireVideoCharge({
        userId: user.id, projectId: id, seconds: project.settings?.target_seconds,
        model: modelIdForProject(project), resolution: resolutionForProject(project),
      });
    } catch (e) {
      if (e instanceof NoCredits) return Response.json({ error: e.message }, { status: 402 });
      throw e;
    }
  }

  const aspect_ratio = project.settings?.aspect_ratio || "9:16";
  const resolution = imageResolutionFor(project);
  const tries = Number(reel.imageTries) || 0;

  // 잠금은 **부르기 전에** 건다 — 부른 뒤에 걸면 그 사이에 들어온 둘째 요청이 통과한다.
  // 회차도 여기서 올린다(실패해도 회차는 먹는다 — 실패한 시도에도 그림값은 나갔을 수 있다).
  await updateProject(id, user.id, (p) =>
    putReel(p, { imagesDrawing: true, imagesAt: Date.now(), imageTries: tries + 1 }));

  const next = [];
  try {
    for (const cut of cuts) {
      const has = !!cut?.image?.url;
      const wantIt = wanted ? wanted.has(cut.idx) : !has;
      if (!wantIt) { next.push(cut); continue; }
      const { refs } = await loadCutRefs(cut, project);
      const prompt = buildImagePrompt(cut, project, refs);
      const out = await generateImage({ prompt, aspect_ratio, refs, projectId: id, resolution });
      next.push({ ...cut, image: { url: out.url, of: prompt } });
    }
  } catch (e) {
    // ★★ 2026-08-21 리뷰 I8 — 중간 실패가 앞 컷의 값을 버리고 있었다. `next` 는 try 를
    //   무사히 빠져나와야만 저장됐는데, 컷 4 에서 던지면 컷 1~3 의 그림(이미 $0.08 씩
    //   나갔다)이 그 자리에서 통째로 사라졌다. 여기까지 만든 것은 그대로 저장한다.
    await updateProject(id, user.id, (p) =>
      putReel({ ...p, cuts: next }, { imagesDrawing: false })).catch(() => {});
    return Response.json({ error: e?.message || "그림을 만들지 못했어요" }, { status: 400 });
  }

  await updateProject(id, user.id, (p) => putReel({ ...p, cuts: next }, { imagesDrawing: false }));
  return Response.json({ ok: true });
});
