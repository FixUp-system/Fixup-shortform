import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { generateScenario, pickEditedShots, readPhotoVision } from "../../../../../lib/reel/scenario.js";
import { isNarrationSpeaker } from "../../../../../lib/cuts.js";
import { scenarioLock, putReel } from "../../../../../lib/reel/doc.js";
import { reelSceneCountRule } from "../../../../../lib/reel/scenario-rules.js";
// ★ 그 프로젝트 모델이 참조 이미지로 받는 가로세로비 한계 — 컷 수 후보를 좁히는 자다.
import { refAspectFor, clipProfileForProject } from "../../../../../lib/clip-limits.js";
import { reelConceptLine } from "../../../../../lib/reel/concepts.js";
import { narrationRuleLine } from "../../../../../lib/reel/narration.js";
import { MAX_SCENARIO_TRIES } from "../../../../../lib/pricing.js";
import {
  availableAvatars, buildCastMessages, resolveCastRefs, mergeCastIntoCuts, mergePropsIntoCuts,
} from "../../../../../lib/cast.js";
import { validateCast, validateProps } from "../../../../../lib/validate.js";
import { callJson as callCastJson } from "../../../../../lib/llm.js";

// ★ 2026-09-03 — **배포 기본 상한에 잘리던 자리다.** LLM 시나리오
//   상한이 없으면 함수가 조용히 끊기고, 그때 fal 은 계속 만들어 과금하는데 우리 문서에는
//   아무것도 안 남는다(사장님이 겪은 "계속 로딩 중"의 뿌리 중 하나다).
export const maxDuration = 300;

// 시나리오의 shot 하나가 컷 하나다 — 옮기는 것은 코드다(LLM 이 두 번 답하면 화면이 본
// 대사와 실제로 만들어지는 대사가 갈릴 수 있다, lib/cuts.js 의 shotsToCuts 와 같은 이유).
//
// ★★ reel 은 shotsToCuts(lib/cuts.js) 를 쓰지 않는다 — 그 함수는 옛 낭독 모델의 모양
//   (sentence·spoken_seconds)만 옮긴다. reel 은 lib/reel/clip-prompt.js 가 `cut.shows`·
//   `camera`·`lighting`·`action`·`sound` 를 직접 읽고(영상 프롬프트의 재료), 합성
//   (lib/compose.js)·자막(lib/subtitles.js)은 `cut.sentence`·`cut.seconds` 를 읽는다 —
//   두 소비자가 요구하는 필드가 shotsToCuts 의 출력보다 넓어서, 여기서 그 초과분을 더 옮긴다.
// ★ environment·tone 은 시나리오 전체에 하나뿐이다(사장님이 위에서 "영상 하나에 하나"로
//   못 박은 값). 컷마다 복사해 두는 이유는 lib/cuts.js 의 stageOf·clipContextClause 가
//   **컷 단위**로 읽기 때문이다(project.scenario 를 직접 안 본다) — 그림·클립 프롬프트가
//   "전 컷이 같은 무대·색"이라고 말하려면 그 값이 컷에도 있어야 한다.
// ★ export 하는 이유: 측정 스크립트가 같은 함수를 써야 한다.
//   2026-08-21 에 이것을 스크립트로 옆겨 적다가 speaker 한 줄을 빠뜨렸고,
//   그래서 전 컷이 화면 안 대사로 떨어졌다. 두 벌을 만들지 않는다.
export function buildReelCuts(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  const environment = typeof scenario?.environment === "string" ? scenario.environment.trim() : "";
  const tone = typeof scenario?.tone === "string" ? scenario.tone.trim() : "";
  return shots.map((s, i) => {
    const sentence = typeof s?.line === "string" ? s.line.trim() : "";
    const narration = Boolean(sentence) && isNarrationSpeaker(s?.speaker);
    return {
      idx: i,
      shows: typeof s?.shows === "string" ? s.shows.trim() : "",
      camera: typeof s?.camera === "string" ? s.camera.trim() : "",
      lighting: typeof s?.lighting === "string" ? s.lighting.trim() : "",
      action: typeof s?.action === "string" ? s.action.trim() : "",
      sound: typeof s?.sound === "string" ? s.sound.trim() : "",
      ...(environment ? { environment } : {}),
      ...(tone ? { tone } : {}),
      seconds: Math.round(Number(s?.seconds) || 0),
      sentence,
      ...(narration ? { narration: true } : {}),
    };
  });
}

// 화면 안에서 말하는 컷에 목소리를 붙인다 — **폴백 한 줄이다** (2026-08-21 리뷰 C5).
//
// ★★ 원래는 이것이 유일한 캐스팅이었다. 그런데 이것만으로는 컷에 `ref_ids` 가 안 생겨
//   `loadCutRefs` 가 항상 빈 배열을 돌려주고, 그러면 `generateClip` 이 `refList` 를 못 받아
//   **i2v 로 조용히 떨어진다** — "컷마다 참조를 들고 r2v 로 굽는다"는 이 흐름의 표제
//   기능이 한 번도 실행되지 않는다. 그래서 진짜 캐스팅(`runCasting`)을 먼저 돌리고,
//   **캐스팅이 안 덮은 컷만** 이 폴백으로 목소리 하나를 묶는다(호출부의 `cuts` 인자가
//   그 안 덮인 목록이다 — 재검토 N2, 아래 참고).
// ★ C3 정정 — 예전엔 `!voice` 도 함께 보고 통째로 [] 를 줬다. `validateScenario`
//   (lib/ad/scenario.js) 는 `voice: ""` 를 정상값으로 허용하므로, 그러면 화면 안 대사가
//   있는 조용한(목소리를 안 정한) 시나리오에서 speechFor 가 매치를 아예 못 찾아
//   **전 컷이 "No talking faces or lip sync." 로 구워졌다.** 이제는 화자만 있으면 캐스팅
//   항목을 만든다 — voice 가 비어도 buildClipPrompt 는 그 절을 그냥 안 붙일 뿐이다.
function buildReelCast(scenario, cuts) {
  const voice = typeof scenario?.voice === "string" ? scenario.voice.trim() : "";
  const speakingCuts = cuts.filter((c) => c.sentence && !c.narration).map((c) => c.idx);
  if (!speakingCuts.length) return [];
  return [{ id: "reel-voice", who: "", look: "", voice, cuts: speakingCuts }];
}

// 캐스팅이 찾은 사람·사물을 컷에 꽂는다 — **순수 함수**(네트워크 결과만 받는다).
// export 하는 이유: 이것이 r2v 를 켜는 유일한 근거라, 테스트가 이것을 직접 부른다
// (tests/reel-routes.test.js — "컷에 ref_ids 가 실제로 생기는가").
export function applyCasting(cuts, cast, props, photos, avatarIds) {
  const castWithRefs = resolveCastRefs(cast, photos, avatarIds);
  const withRefs = mergeCastIntoCuts(mergePropsIntoCuts(cuts, props), castWithRefs);
  return { cuts: withRefs, cast: castWithRefs };
}

// 진짜 캐스팅 — **단계별 파이프라인이 컷 분할 뒤에 하는 바로 그 일**이다
// (lib/pipeline.js 의 splitCuts 안, `buildCastMessages` → LLM → `resolveCastRefs` →
// `mergeCastIntoCuts`+`mergePropsIntoCuts`). 새 장치를 만들지 않는다 — 그대로 빌린다.
//
// ★ LLM 호출은 lib/llm.js 의 callJson 이다(lib/ad/llm.js 가 아니다) — 캐스팅은 시나리오
//   갈래와 무관한 기존 장치라, 단계별이 부르는 것과 같은 모듈을 그대로 쓴다.
async function runCasting(cuts, project, speakers) {
  const avatars = await availableAvatars();
  const photos = project.material?.photos || [];
  // 사물 사진만 캐스팅에 넘긴다 — 인물 사진은 resolveCastRefs 가 인물에 붙인다
  // (lib/pipeline.js 와 같은 판정: vision.person 이 아닌 사진만 사물이다).
  const things = photos.filter((p) => !p.vision?.person).map((p) => ({ id: p.id, what: p.vision?.what || "" }));
  const thingIds = things.map((t) => t.id);
  const msgs = buildCastMessages(cuts, avatars, "", things, { speakers });

  let cast = [];
  let props = [];
  try {
    const raw = await callCastJson({
      system: msgs.system, messages: msgs.messages, stage: "캐스팅", projectId: project.id,
    });
    cast = validateCast(raw, avatars.map((a) => a.id), cuts.length) || [];
    props = validateProps(raw, thingIds, cuts.length);
  } catch (e) {
    // ★ 캐스팅이 죽어도 시나리오 자체는 살린다 — 참조 없이(i2v 로) 계속 진행한다.
    //   앞서 컷 분할 값(LLM 호출)은 이미 나갔으므로, 여기서 던지면 그 값도 헛되이 버려진다.
    console.error("reel 캐스팅 실패 — 참조 없이 진행합니다:", e?.message);
  }
  return applyCasting(cuts, cast, props, photos, avatars.map((a) => a.id));
}

// 시나리오 + 컷 분할 — reel 은 방식이 하나뿐이라 film 처럼 갈릴 것이 없다.
//
// ★ 잠금 판정은 lib/reel/doc.js 의 scenarioLock 하나다 — 화면의 [다시 쓰기] 버튼도
//   같은 함수를 본다(브리프). 여기서 손으로 다시 계산하면 화면이 열어 준 버튼을
//   서버가 400 으로 막는 어긋남이 생긴다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project || project.kind !== "reel") {
    return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  }

  const lock = scenarioLock(project);
  if (lock) return Response.json({ error: lock.message }, { status: 400 });

  // ★★ 2026-08-21 리뷰 I5 — scenarioLock 은 "구운 완성본"과 "굽는 중"만 본다(film 과
  //   같은 결). 컷별 클립(컷당 12크레딧)은 그 사이에 있다 — 클립을 다 만든 뒤에도
  //   reel.status 는 "rendering" 이 아니므로 위 잠금을 그냥 지난다. 여기서 안 막으면
  //   시나리오를 다시 쓰는 순간 cuts 를 통째로 갈아 끼워, 이미 산 클립이 경고 없이
  //   사라진다. 그림($0.08)·clip_prompt(0원)는 막지 않는다 — film 도 그림은 "아직 값을
  //   안 치렀고 다시 그릴 수 있다"며 허용한다(같은 판단).
  if ((project.cuts || []).some((c) => c.video?.url)) {
    return Response.json(
      { error: "이미 만든 클립이 있어요 — 시나리오를 바꾸려면 새로 시작해 주세요" },
      { status: 400 }
    );
  }

  if (!project.material?.text?.trim()) {
    return Response.json({ error: "만들고 싶은 영상을 먼저 적어 주세요" }, { status: 400 });
  }

  // 무료지만 무제한은 아니다 — 광고·film 과 같은 상한(lib/pricing.js 하나, I5).
  const tries = Number(project.scenario?.tries) || 0;
  if (tries >= MAX_SCENARIO_TRIES) {
    return Response.json({ error: "시나리오를 너무 많이 다시 썼어요" }, { status: 400 });
  }

  // 사장님이 고친 컷 — 화면이 보낸 목록을 그대로 믿지 않고 저장된 시나리오와 대조해
  // 서버가 고른다(film 라우트와 같은 처방, lib/ad/scenario.js 의 pickEditedShots).
  const body = await req.json().catch(() => null);
  const edits = pickEditedShots(project.scenario?.shots, body?.shots);
  // ★★ 사장님이 **말로** 적은 수정 요청(2026-08-25). edits 와 다른 축이라 따로 나른다 —
  //   둘 다 올 수 있고, 없으면 지문이 예전과 글자 그대로다(lib/ad/scenario.js 의 note 블록).
  // ★ 길이를 여기서 자르지 않는다 — 자르는 자리는 지문을 조립하는 곳 하나다(slice(0,1000)).
  const note = typeof body?.note === "string" ? body.note : "";

  // 사진을 먼저 읽는다(film 라우트와 같은 이유) — 시나리오가 제품의 글자·색·크기를 알아야 한다.
  const seen = await readPhotoVision(project);

  let scenario;
  try {
    // ★★ reel 은 **자기 장면 수 규칙**을 들고 간다. 광고의 그 대목은 "한 번에 통째로
    //   만들어진다"를 근거로 다는데, reel 은 컷마다 따로 굽고 ffmpeg 가 잉는다 — 그 근거가
    //   여기서는 거짓이다. 그리고 그림은 **스토리보드 한 장**이라 컷 수가 곳 격자 칸 수이고,
    //   그 칸 수는 nano-banana 2 가 받는 프리셋 비율로만 떨어진다(lib/reel/scenario-rules.js).
    // ★ 길이는 settings.seconds 를 읽는다 — buildScenarioMessages 가 "길이: N초"를 쓸 때
    //   보는 그 값이다(app/api/reel/route.js 가 target_seconds 의 별칭으로 둔다). 둘을
    //   따로 읽으면 지시문 안에서 두 길이가 어긋난다.
    scenario = await generateScenario({
      project: seen,
      edits,
      note,
      // ★ 화질이 담을 수 있는 칸 수를 정한다(2026-08-25) — 480p 32컷 · 720p 15컷 ·
      //   1080p 6컷. 안 넘기면 720p 로 재서 1080p 프로젝트에 못 담는 수를 권한다.
      // ★★ 2026-08-31 — **모델이 못 받는 격자가 나오는 컷 수는 애초에 안 권한다**(사장님
      //   결정 A). 5 는 소수라 격자가 1행×5열 뿐이고 그 판은 비율 2.81 이라 H3 가 참조
      //   이미지로 안 받는다 → 그 프로젝트는 통짜로 못 가고 **컷별로 떨어졌다**(이음새를
      //   잃고 fal 호출이 1번 → 5번). 굽기 직전에 떨어뜨리는 것보다 여기가 뿌리다.
      // ★ 한계를 모르는 모델(Seedance)은 null 이라 목록이 **예전 그대로**다.
      sceneCountRule: reelSceneCountRule(
        seen?.settings?.seconds,
        seen?.settings?.resolution,
        seen?.settings?.aspect_ratio,
        refAspectFor(clipProfileForProject(seen)),
      ),
      // ★★ 컨셉 — 사장님이 고른 큰 범주가 여기서 **구성 한 줄**이 된다
      //   (2026-08-25, lib/reel/concepts.js). [알아서]면 null 이라 그 줄이 아예 안 실리고,
      //   그때는 모델이 소재를 읽고 스스로 구성한다.
      // ★ 이 키가 있으면 buildScenarioMessages 는 광고 포맷(AD_FORMATS) 조회를 건너뛴다 —
      //   reel 은 그 값을 안 쓰므로, 옛 프로젝트에 든 모르는 format 때문에 죽지 않는다.
      conceptLine: reelConceptLine(seen?.settings?.concept),
      // ★★ 2026-08-27 — 내레이션을 **한 벌**로 낸다(사장님 지시: "컷마다 음성이 끊기고
      //   그 컷을 설명할려고 해 … 영상 전체를 설명하는거야"). 이 줄이 있으면 시나리오가
      //   대사를 장면마다 흩지 않고 `narration` 한 벌로 낸다(lib/ad/scenario.js).
      // ★ **reel 만 넘긴다** — 광고 갈래는 이 키가 없어 글자 그대로 예전이다.
      // ★ 초를 모르면 빈 줄이라 갈래가 안 켜진다(narrationRuleLine) — 그때는 옛 길이다.
      narrationRule: narrationRuleLine(seen?.settings?.seconds, seen?.settings?.narration_lang),
    });
  } catch (e) {
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: 500 });
  }

  const cuts = buildReelCuts(scenario);
  const shots = Array.isArray(scenario.shots) ? scenario.shots : [];
  const speakers = shots.map((s) => s?.speaker || "");

  // ★★ C5 — 진짜 캐스팅을 돌린다.
  const casted = await runCasting(cuts, { ...seen, id }, speakers);

  // ★★ 2026-08-21 리뷰 N2 — 폴백을 **cast 가 비었을 때**가 아니라 **캐스팅이 안 덮은
  //   화면 안 대사 컷** 단위로 좁힌다. `validateCast` 는 `who` 없음·`cuts` 없음 항목을
  //   조용히 버리므로, 캐스팅이 사람을 찾긴 했는데 화면 안 대사 컷 일부만 덮는 경우가
  //   있다 — 그때 이전 처방(cast.length 로 통째로 켜고 끄기)은 안 덮인 컷을 그대로
  //   비워 뒀고, speechFor 가 거기서 매치를 못 찾아 **C3 이 고친 증상이 다른 입구로
  //   남아 있었다.** 진짜 cast 가 덮은 컷은 그대로 두고, 안 덮인 컷만 폴백이 맡는다 —
  //   두 목록이 서로 다른 컷 번호를 가리키므로 한 cast 배열에 같이 둬도 안 겹친다.
  const coveredIdx = new Set(casted.cast.flatMap((c) => c.cuts || []));
  const uncovered = casted.cuts.filter((c) => c.sentence && !c.narration && !coveredIdx.has(c.idx));
  const fallback = buildReelCast(scenario, uncovered);
  const cast = [...casted.cast, ...fallback];

  await updateProject(id, user.id, (p) => {
    const updated = {
      ...p,
      scenario: {
        ...scenario,
        // ★★ C4 — speechFor 의 내레이션 갈래(lib/cuts.js:1456)는 scenario.narrator_voice 를
        //   읽는데 validateScenario 는 그 필드를 안 만든다(voice 만 만든다). 광고형 시나리오는
        //   "내레이션" 화자인 컷이 기본이라, 안 채우면 그 컷 전부가 Voice: 절 없이 나가
        //   컷마다 목소리가 바뀐다 — 이 저장소의 정지 게이트(컷 간 목소리 일관성)가 정확히
        //   그 자리다. scenario.voice 를 그대로 별칭한다(한 영상에 화자는 하나라는 시나리오
        //   프롬프트의 전제와 일치한다).
        narrator_voice: scenario.voice,
        tries: tries + 1,
      },
      cuts: casted.cuts,
      cast,
      status: "scenario",
      // 읽은 사진값을 남긴다 — 안 남기면 다시 쓸 때마다 사진을 또 읽는다(사진당 값이 든다).
      ...(seen !== project ? { material: { ...p.material, photos: seen.material.photos } } : {}),
    };
    // ★★ 2026-08-21 리뷰 N3 — 시나리오를 다시 쓰면 그림 회차도 새로 시작한다. 컷이
    //   통째로 갈리므로(위 cuts 대체) 옛 그림은 어차피 다음 컷에 안 맞고 전부 다시
    //   그려야 하는데, imageTries 는 리셋 없이 프로젝트 수명 동안 계속 쌓이는 상수였다
    //   — 재작성을 몇 번 하는 사이에 상한(6회)을 다 쓰면 **정가는 냈는데 그림을 영영
    //   못 그리는** 프로젝트가 된다. film 은 반대로 "상한을 다 쓴 방식이 있으면 시나리오
    //   재작성을 막는다"(scenarioLock 의 images_exhausted)를 고르는데, 그건 film 이
    //   **두 방식을 나란히 비교**하는 게 목적이라 판이 섞이면 안 되기 때문이다(그림이
    //   남아 있어야 비교가 성립). reel 은 방식이 하나뿐이고 시나리오를 다시 쓰면 이전
    //   컷·그림이 애초에 전부 버려지므로 "비교할 옛 판"이 없다 — 재작성이 곧 새 시작이면,
    //   회차도 새 시작이어야 사장님이 값을 치르고도 그리지 못하는 막다른 길이 안 생긴다.
    //
    // ★★ 2026-08-21 재검토 B2 — 이 리셋이 총량 방어선을 20배로 열었다(시나리오 20판 ×
    //   그림 6회 × 컷 12개 × $0.08 ≈ $115, 전부 크레딧 0). `imageTries`(판별)만 리셋하고
    //   **`imageTriesTotal`(수명)은 여기서 절대 안 건드린다** — images 라우트만 그 값을
    //   올린다(lib/reel/doc.js 의 imageTriesLeftLifetime, MAX_REEL_IMAGE_TRIES_LIFETIME
    //   = 판당 상한의 4배). 재작성이 판별 상한은 새로 열어 주되, 수명 상한은 재작성으로
    //   못 피하게 남겨 둔다.
    return putReel(updated, { imageTries: 0, imagesDrawing: false, imagesAt: 0 });
  });
  return Response.json({ scenario, cuts: casted.cuts });
});
