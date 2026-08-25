import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { generateImage, imageResolutionFor } from "../../../../../lib/imagegen.js";
import { buildImagePrompt } from "../../../../../lib/cuts.js";
import { loadCutRefs, loadStoryboardRefs } from "../../../../../lib/cut-refs.js";
import { requireVideoCharge, NoCredits } from "../../../../../lib/charges.js";
import { modelIdForProject, resolutionForProject } from "../../../../../lib/clip-limits.js";
import { fakeFal } from "../../../../../lib/fake.js";
import {
  reelOf, putReel, isImagesLocked, imageTriesLeft, imageTriesLeftLifetime, isReelRendering,
} from "../../../../../lib/reel/doc.js";
import {
  planReelImages, buildStoryboardPrompt, storyboardImageSize,
  cropStoryboardCells, saveStoryboardCells, fetchImageBytes,
} from "../../../../../lib/reel/storyboard.js";

// 만든 그림만 컷에 얹는다 — **컷 목록을 대체하지 않는다.** export 하는 이유: 이것이
// N1 의 수정 전부다("실패해도 뒤 컷이 살아남는가"), 테스트가 이것을 직접 부른다
// (tests/reel-routes.test.js).
export function mergeImages(cuts, made) {
  return (cuts || []).map((c) => (made.has(c.idx) ? { ...c, image: made.get(c.idx) } : c));
}

// 그림 만들기 — **스토리보드 한 장을 사서 칸을 자른다**(2026-08-25). film 의 images
// 라우트와 같은 결이다: 동기로 기다린다(호출이 한 번이라 서버리스 상한 안에서 끝나고,
// 기다리면 실패가 HTTP 로 보인다).
//
// ★★ 왜 한 장인가: 값이 한 자리 다르다 — 9컷이면 한 장 $0.401 대 컷별 아홉 장 $3.61
//   (2026-08-24 실측). 게다가 한 장에 함께 그려지므로 인물·옷·색이 저절로 같다.
// ★★ 갈래 판정은 lib/reel/storyboard.js 의 planReelImages **하나**다 — 여기서 격자 표를
//   다시 읽지 않는다. 컷 수가 격자 밖(5·7·8…)이거나 컷 하나만 다시 그리는 것(only)이면
//   **예전 방식(컷별)이 그대로 산다** — 던지지 않는다.
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

  // ★★ note — 사장님이 **말로** 고쳐 달라고 적은 것(2026-08-25).
  //   스토리보드 갈래에서만 쓴다 — 전체 한 장을 다시 그리는 요청이라 컷별에는 뜻이 없다.
  const { only, note, auto } = (await req.json().catch(() => ({}))) || {};
  // ★ 배열이 아닌 값을 조용히 무시하면 전부 다시 그린다 — 컷당 $0.08 이 통째로 나간다.
  if (only !== undefined && !Array.isArray(only)) {
    return Response.json({ error: "다시 그릴 그림을 골라 주세요" }, { status: 400 });
  }

  // 갈래와 대상은 순수 함수 하나가 정한다 — 라우트가 손으로 다시 세면 화면·측정과 갈린다.
  const plan = planReelImages(cuts, only);
  const targets = new Set(plan.targets);

  const reel = reelOf(project);
  // ★★ 2026-08-21 리뷰 N4 — 굽는 중에는 그리지 않는다. film 의 isDrawLocked 는 빌렸는데
  //   바로 옆의 `film.status === "rendering"` → 409(app/api/film/[id]/images/route.js)는
  //   안 빌렸다. 이미지·클립 라우트 둘 다 cuts 를 저장하므로, 그 사이 굽기가 끝나면
  //   마지막 쓰기가 이겨 방금 구운 클립이나 방금 그린 그림 한쪽이 조용히 사라진다.
  //   판정은 lib/reel/doc.js 의 isReelRendering 하나다(재검토가 요구한 "실행 가능한
  //   단정"의 대상 — 소스 문자열이 아니라 이 함수를 직접 불러 잰다).
  if (isReelRendering(reel)) {
    return Response.json({ error: "지금 영상을 만드는 중이에요" }, { status: 409 });
  }
  // ★★ 2026-08-21 리뷰 I7 — 그림에는 청구가 없다(정가는 클립 굽기에 붙는다). 그런데
  //   only 로 같은 컷을 무한히 다시 그릴 수 있었고(컷당 $0.08 이 매번 나가는데 크레딧은
  //   0), 동기 대기라 두 탭이면 파이프라인 둘이 같은 문서를 갈아 썼다. film 의
  //   isDrawLocked/MAX_FILM_IMAGE_TRIES 와 같은 처방 — 재진입 잠금 + 횟수 상한
  //   (lib/reel/doc.js 에 reel 전용 상수로 새로 뒀다, 이 흐름 소유라 허용됐다).
  if (isImagesLocked(reel)) {
    return Response.json({ error: "이미 그리는 중이에요" }, { status: 409 });
  }
  if (imageTriesLeft(reel) <= 0) {
    return Response.json({ error: "그림을 너무 많이 다시 그렸어요" }, { status: 400 });
  }
  // ★★ 2026-08-21 재검토 B2 — 시나리오판마다 리셋되는 imageTriesLeft 만으로는 재작성을
  //   반복해 상한을 우회할 수 있다(N3 가 리셋을 준 바로 그 자리). 절대 안 리셋되는
  //   프로젝트 수명 상한을 하나 더 본다 — lib/reel/doc.js 의 imageTriesLeftLifetime.
  if (imageTriesLeftLifetime(reel) <= 0) {
    return Response.json({ error: "이 프로젝트에서 그림을 너무 많이 다시 그렸어요 — 새로 시작해 주세요" }, { status: 400 });
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
  // ★ 수명 회차는 시나리오 재작성으로도 안 돌아온다(scenario 라우트가 이 필드는 안
  //   건드린다) — B2 의 총량 방어선이 실제로 총량이려면 이 카운터가 절대 안 줄어야 한다.
  const triesTotal = Number(reel.imageTriesTotal) || 0;

  // 잠금은 **부르기 전에** 건다 — 부른 뒤에 걸면 그 사이에 들어온 둘째 요청이 통과한다.
  // 회차도 여기서 올린다(실패해도 회차는 먹는다 — 실패한 시도에도 그림값은 나갔을 수 있다).
  await updateProject(id, user.id, (p) => putReel(p, {
    imagesDrawing: true, imagesAt: Date.now(), imageTries: tries + 1, imageTriesTotal: triesTotal + 1,
  }));

  // ★★ 2026-08-21 리뷰 N1 — **만든 것만** 모은다(idx → image). 실패해도 성공해도 이걸로
  //   p.cuts 를 병합한다 — 스냅샷(next=[...])으로 cuts 를 통째로 대체하면, 루프가
  //   중간에 던졌을 때 아직 안 지나온 컷들(이미 구운 클립·다른 필드까지)이 저장 자리에서
  //   통째로 사라진다. "수정 전에는 아예 저장을 안 해서 이 손실이 없었다 — 지금이 더
  //   나쁘다"는 지적을 그대로 받아, 성공 경로도 같은 병합형으로 통일한다.
  const made = new Map();
  let failure = null;

  if (plan.mode === "storyboard") {
    // ★★ 생성 호출이 **한 번**이다 — 그래서 원장·예산에도 한 번만 적힌다(generateImage 가
    //   호출마다 한 줄을 적는다). 칸으로 나누는 것은 그 뒤의 우리 일이라 값이 안 붙는다.
    // ★ 치수는 칸 수에서 역산한다 — 칸 하나가 굽기 해상도(720×1280)가 되도록
    //   (storyboardImageSize). 비율·해상도 축으로는 표현할 수 없어 imageSize 로 넘긴다.
    // ★★ 2026-08-25 — **레퍼런스를 싣는다.** 옛 주석은 "컷 하나의 참조를 통째로 실으면
    //   다른 칸까지 그 사진을 닮는다"였고 그래서 안 실었는데, 사장님이 제품 사진을
    //   첨부했더니 **완전히 다른 제품**이 그려졌다. 원인이 둘 겹쳐 있었다:
    //     ① 시나리오는 사진이 있으면 생김새를 **글로 안 쓴다**(lib/ad/scenario.js)
    //     ② 여기서 그 사진을 **안 실었다**
    //   → 제품을 정의하는 것이 아무것도 없어 모델이 지어낼 수밖에 없었다.
    // ★ 옛 걱정은 **인물 사진** 이야기다. 제품은 반대로 모든 칸에 같은 것이 나와야 맞으므로
    //   격자에서는 그 성질이 부작용이 아니라 목적이다 — 지문도 그렇게 말한다(refLine).
    // ★ 참조는 **프로젝트 전체의 합집합**이다(컷마다가 아니다) — 한 장에 다 그리기 때문이고,
    //   바이트는 키마다 한 번만 읽는다(loadStoryboardRefs).
    try {
      const { refs } = await loadStoryboardRefs(project);
      const prompt = buildStoryboardPrompt(project, cuts, plan.grid, note, refs);
      const out = await generateImage({
        prompt,
        aspect_ratio: plan.grid.canvas,
        projectId: id,
        resolution,
        refs,
        imageSize: storyboardImageSize(plan.grid, aspect_ratio),
      });
      // 여기서부터는 **우리 바이트**다 — 내려받아 자르고 우리 버킷에 둔다.
      // 어디에 왜 두는지는 lib/reel/storyboard.js 의 saveStoryboardCells 머리말에 있다.
      const cells = await cropStoryboardCells(await fetchImageBytes(out.url), plan.grid, { aspect: aspect_ratio });
      const urls = await saveStoryboardCells(cells, user.id);
      cuts.forEach((cut, i) => {
        if (!urls[i]) return;
        made.set(cut.idx, { url: urls[i], of: prompt, sheet: out.url, cell: i });
      });
    } catch (e) {
      failure = e;
    }
  } else {
    // ── 컷별 — 예전 방식 그대로다(격자 밖 칸 수 · 컷 하나만 다시 그리기 · 빈 칸 채우기).
    for (const cut of cuts) {
      if (!targets.has(cut.idx)) continue;
      try {
        const { refs } = await loadCutRefs(cut, project);
        const prompt = buildImagePrompt(cut, project, refs);
        const out = await generateImage({ prompt, aspect_ratio, refs, projectId: id, resolution });
        made.set(cut.idx, { url: out.url, of: prompt });
      } catch (e) {
        failure = e;
        break;
      }
    }
  }

  // ★ 병합은 **저장 시점의 최신 p.cuts** 위에서 한다(위 스냅샷 cuts 가 아니다) — updateProject
  //   가 CAS 재시도로 patchFn 을 다시 부를 수 있어(lib/projects.js), 그때마다 그 사이에
  //   들어온 다른 쓰기(예: 사장님이 clip_prompt 를 고친 것) 위에 이미지만 얹혀야 한다.
  // ★★ 자동 생성은 **한 번뿐**이다(2026-08-25). 그 사실을 문서에 남긴다 —
  //   화면의 ref 로만 막으면 새로고침 한 번에 그 기억이 사라져 또 나간다($0.401).
  //   ★ 성공·실패를 가리지 않고 적는다 — 실패했다고 자동으로 또 시도하면 같은 사유로
  //     계속 돈이 나간다. 다시 하는 것은 사장님의 버튼 몱이다.
  const merge = (p) => putReel(
    { ...p, cuts: mergeImages(p.cuts, made) },
    { imagesDrawing: false, ...(auto ? { autoImaged: true } : {}) },
  );

  if (failure) {
    await updateProject(id, user.id, merge).catch(() => {});
    return Response.json({ error: failure?.message || "그림을 만들지 못했어요" }, { status: 400 });
  }

  await updateProject(id, user.id, merge);
  return Response.json({ ok: true });
});
