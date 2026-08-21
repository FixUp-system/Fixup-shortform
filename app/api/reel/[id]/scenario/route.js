import { withUser } from "../../../../../lib/auth/require-user.js";
import { getProject, updateProject } from "../../../../../lib/projects.js";
import { generateScenario, pickEditedShots, readPhotoVision } from "../../../../../lib/ad/scenario.js";
import { isNarrationSpeaker } from "../../../../../lib/cuts.js";
import { scenarioLock } from "../../../../../lib/reel/doc.js";

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
function buildReelCuts(scenario) {
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

// 화면 안에서 말하는 컷에 목소리를 붙인다 — lib/cuts.js 의 speechFor 가 project.cast 에서
// `cuts.includes(cut.idx)` 인 인물을 찾아 대사에 실을 목소리를 정한다.
//
// ★ reel 에는 캐스팅 단계가 없다(REEL_STEPS 에 없다 — ③목소리가 없는 것과 같은 이유로,
//   시나리오가 이미 "이 영상의 화자는 하나"(scenario.voice)라고 답했다). 그래서 인물별
//   캐스팅 대신 **화면 안에서 말하는 컷 전부**를 하나의 화자에 묶는 합성 캐스팅 한 줄을
//   만든다 — 시나리오 프롬프트가 이미 "한 영상에 화자는 하나다"를 못 박아 두었으므로
//   여러 인물을 구분할 필요가 없다. 이것이 없으면 speechFor 가 매치를 못 찾아 화면 안
//   대사가 조용히 사라진다(내레이션은 이 캐스팅과 무관하게 spokenOf 가 따로 처리한다).
function buildReelCast(scenario, cuts) {
  const voice = typeof scenario?.voice === "string" ? scenario.voice.trim() : "";
  const speakingCuts = cuts.filter((c) => c.sentence && !c.narration).map((c) => c.idx);
  if (!voice || !speakingCuts.length) return [];
  return [{ id: "reel-voice", who: "", look: "", voice, cuts: speakingCuts }];
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

  if (!project.material?.text?.trim()) {
    return Response.json({ error: "만들고 싶은 영상을 먼저 적어 주세요" }, { status: 400 });
  }

  // 사장님이 고친 컷 — 화면이 보낸 목록을 그대로 믿지 않고 저장된 시나리오와 대조해
  // 서버가 고른다(film 라우트와 같은 처방, lib/ad/scenario.js 의 pickEditedShots).
  const body = await req.json().catch(() => null);
  const edits = pickEditedShots(project.scenario?.shots, body?.shots);

  // 사진을 먼저 읽는다(film 라우트와 같은 이유) — 시나리오가 제품의 글자·색·크기를 알아야 한다.
  const seen = await readPhotoVision(project);

  let scenario;
  try {
    scenario = await generateScenario({ project: seen, edits });
  } catch (e) {
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: 500 });
  }

  const cuts = buildReelCuts(scenario);
  const cast = buildReelCast(scenario, cuts);

  await updateProject(id, user.id, (p) => ({
    ...p,
    scenario,
    cuts,
    cast,
    status: "scenario",
    // 읽은 사진값을 남긴다 — 안 남기면 다시 쓸 때마다 사진을 또 읽는다(사진당 값이 든다).
    ...(seen !== project ? { material: { ...p.material, photos: seen.material.photos } } : {}),
  }));
  return Response.json({ scenario, cuts });
});
