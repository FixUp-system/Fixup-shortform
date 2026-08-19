import { withUser } from "../../../../../lib/auth/require-user.js";
import { loadFilm } from "../../../../../lib/film/load.js";
import { updateProject, getProject } from "../../../../../lib/projects.js";
import { generateScenario, pickEditedShots, readPhotoVision } from "../../../../../lib/ad/scenario.js";
import { MAX_SCENARIO_TRIES } from "../../../../../lib/pricing.js";
import { scenarioLock } from "../../../../../lib/film/doc.js";

// 시나리오 — 동기다(LLM 만 쓰고 몇 초면 끝난다).
//
// ★★ **이 라우트만 방식(mode)을 안 본다.** 시나리오는 두 방식이 **공유하는 하나**여야 한다:
//   방식마다 새로 쓰면 두 영상의 차이가 방식 때문인지 시나리오 때문인지 알 수 없게 되고,
//   그러면 이 기능(어느 방식이 나은가를 재는 것)이 통째로 무의미해진다.
//   그래서 결과는 films.* 가 아니라 문서 최상단 p.scenario 한 자리에 넣는다.
//
// ★ 광고의 runScenarioStep(lib/ad/pipeline.js)과 **같은 모양**이되 films 는 건드리지 않는다.
//   사진 읽기(describePhoto)는 여기서 하지 않는다 — 이 경로는 사장님 사진을 그림 만들기에서
//   **참조 바이트로** 직접 넘기므로(lib/film/pipeline.js), 글자를 받아쓰는 우회가 필요 없다.
export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await loadFilm(id, user.id);
  if (!project) return Response.json({ error: "찾을 수 없어요" }, { status: 404 });

  const tries = Number(project.scenario?.tries) || 0;
  // 무료지만 무제한은 아니다 — 광고와 같은 상한을 쓴다(값은 lib/pricing.js 하나).
  if (tries >= MAX_SCENARIO_TRIES) {
    return Response.json({ error: "시나리오를 너무 많이 다시 썼어요" }, { status: 400 });
  }

  // ★★ **한 편이라도 구웠으면 다시 못 쓴다.** 시나리오가 두 방식이 공유하는 하나라는
  //   것은 이 기능의 대전제인데(위 주석), 지금까지는 그 전제를 **아무도 지키지 않았다** —
  //   order 를 구운 뒤 시나리오를 고치고 refs 를 구우면 두 편이 서로 다른 판으로 구워지고,
  //   문서에는 그 사실조차 안 남는다. 그러면 두 영상의 차이가 방식 때문인지 시나리오
  //   때문인지 말할 수 없어 회차 둘(70 크레딧)이 통째로 못 쓰는 값이 된다.
  // ★ 무엇을 기준으로 잠그나: **영상**이다(그림이 아니다). 그림까지는 아직 값을 안 치렀고
  //   다시 그릴 수 있으니(6회) 여기서 막으면 공연한 막다른 길이다. 그림이 옛 판인 채로
  //   굽는 길은 굽기 라우트가 films[방식].scenarioTries 로 따로 막는다.
  // ★ 값싸게 간다 — 곧 시나리오 구조 자체가 바뀐다(장면 분할 폐지). 조건이 흔들린 것을
  //   알 수 있게만 하고, 되돌리는 장치는 만들지 않는다(새 프로젝트를 만들면 된다).
  // ★ 판정은 lib/film/doc.js 의 scenarioLock 하나다 — 화면(app/film/[mode]/page.js)의
  //   [다시 쓰기] 버튼도 같은 함수를 본다. 여기서 손으로 다시 계산하면 화면이 열어 준
  //   버튼을 서버가 400 으로 막는 어긋남이 생긴다(실제로 그랬다).
  const lock = scenarioLock(project);
  if (lock) return Response.json({ error: lock.message }, { status: 400 });

  // 사장님이 고친 컷 — 화면이 보낸 목록을 그대로 믿지 않고 저장된 시나리오와 대조해
  // **서버가** 고른다(lib/ad/scenario.js 의 pickEditedShots).
  const body = await req.json().catch(() => null);
  const edits = pickEditedShots(project.scenario?.shots, body?.shots);

  // ★★ 사진을 먼저 읽는다(2026-08-19). 이 자리에 원래 "사진 읽기는 여기서 하지 않는다 —
  //   이 경로는 사진을 그림 만들기에서 참조 바이트로 직접 넘기므로 우회가 필요 없다"고
  //   적혀 있었는데, 실측이 그 판단을 뒤집었다:
  //     · 시나리오가 사진을 못 봐서 제품의 글자("Giants")도 색도 크기도 모른 채 쓰였다
  //     · **굽기(r2v)에는 사장님 사진이 아예 안 간다** — films[].images(우리가 만든 그림)만
  //       참조로 간다. 즉 사진은 그림 단계에만 닿고 시나리오·영상에는 안 닿는다
  //   판정은 광고와 **같은 함수**다(readPhotoVision) — 두 벌이면 두 흐름이 갈린다.
  const seen = await readPhotoVision(project);

  let scenario;
  try {
    scenario = await generateScenario({ project: seen, edits });
  } catch (e) {
    return Response.json({ error: e?.message || "시나리오를 만들지 못했어요" }, { status: 500 });
  }

  await updateProject(id, user.id, (p) => ({
    ...p,
    scenario: { ...scenario, tries: (Number(p.scenario?.tries) || 0) + 1 },
    status: "scenario",
    // 읽은 사진값을 남긴다 — 안 남기면 다시 쓸 때마다 사진을 또 읽는다(사진당 값이 든다).
    // ★ readPhotoVision 은 읽은 것이 없으면 받은 project 를 그대로 돌려주므로,
    //   `seen !== project` 가 "새로 읽었다"의 판정이다(광고 파이프라인과 같다).
    ...(seen !== project ? { material: { ...p.material, photos: seen.material.photos } } : {}),
  }));
  return Response.json(await getProject(id, user.id));
});
