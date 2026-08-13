// 광고 경로의 파이프라인 — 청구 → 생성 → 저장, 실패하면 환불.
//
// 기존 lib/pipeline.js 를 부르지 않는다. 컷·이미지·낭독·합성이 없는 경로다.
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { chargeAd, refundAd } from "../charges.js";
import { MAX_SCENARIO_TRIES } from "../pricing.js";
import { readRefBytes } from "../refs-io.js";
import { generateScenario as defaultScenario } from "./scenario.js";
import { generateAdVideo as defaultGenerate } from "./generate.js";
import { hasRenderedAdVideo } from "./attempt.js";

const RENDERS_BUCKET = "renders";

// fal 산출물은 기본이 publicly readable 이다 — 우리 비공개 버킷으로 옮긴다.
// 미공개 캠페인 영상이면 URL 이 새는 것만으로 사고다.
//
// ★ 이름을 무작위로 지으면 안 된다 — app/api/renders/[name]/route.js 는 "파일명이 곧
// 프로젝트 id 다"를 전제로 이름에서 id 를 되찾아 소유자를 검사한다(lib/compose.js 도
// `${projectId}.mp4` 로 짓는다). 무작위 이름을 쓰면 그 라우트가 getProject(무작위id, ownerId)
// 를 불러 null 을 받고 404 를 낸다 — 겉보기엔 URL 이 저장돼 있어 멀쩡해 보이지만 못 연다.
// 다시 만들면 같은 이름을 덮어쓴다 — 그것이 기존 규약이고, 라우트가 id 로 찾으므로 이름이
// 하나여야 한다(회차마다 새 파일을 만들지 않는다).
async function storeVideoDefault(url, projectId, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`완성본을 내려받지 못했어요 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = `${projectId}.mp4`;
  await getStore().putObject(RENDERS_BUCKET, name, bytes, "video/mp4");
  return `/api/renders/${name}`;
}

export async function runScenarioStep(projectId, ownerId, deps = {}) {
  const make = deps.generateScenario || defaultScenario;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  const tries = Number(project.scenario?.tries) || 0;
  // 무료지만 무제한은 아니다 — 라우트가 청구 앞에서 보는 상한과 같은 값이다
  if (tries >= MAX_SCENARIO_TRIES) throw new Error("시나리오를 너무 많이 다시 썼어요");

  const scenario = await make({ project });
  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    scenario: { ...scenario, tries: (Number(p.scenario?.tries) || 0) + 1 },
    status: "scenario",
    video_error: null,
  }));
}

export async function runAdRenderPipeline(projectId, ownerId, deps = {}) {
  const make = deps.generateAdVideo || defaultGenerate;
  const store = deps.storeVideo || storeVideoDefault;

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 시나리오 없이 굽지 않는다 — 그러면 무엇을 만드는지 아무도 모른다
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");

  // ★ 청구가 생성 앞이다. 잔액 없이 fal 이 나가는 길을 안 만든다.
  // ★ 이미 영상을 낸 프로젝트([다시 만들기])면 새 회차를 연다 — 판정은 project(이 함수
  //   진입 시점, 아직 mutate 하기 전)에서 lib/ad/attempt.js 로 한다. 라우트의 잔액 검사와
  //   같은 판정을 써야 한다(두 곳이 갈리면 여기서 못 받았는데 라우트는 통과시킨다).
  // ★ Task 21 — model 을 넘긴다. 여기가 chargeAd 의 유일한 실제 호출부라, 이걸 안 넘기면
  //   project.settings.model 이 무엇이든(2.5 를 골랐어도) 항상 2.0 값으로 청구된다 —
  //   app/api/ads/[id]/render/route.js 의 잔액 검사(같은 project.settings.model 을 읽는다)
  //   와 어긋나지 않도록 같은 필드를 그대로 넘긴다.
  // ★ Task 25 — resolution 도 같은 이유로 넘긴다. 여기가 안 넘기면 chargeAd·adVideoPrice
  //   가 생략을 720p 로 해석해 1080p 를 고른 사장님에게도 항상 720p 값만 차감된다 —
  //   라우트의 잔액 검사(같은 project.settings.resolution 을 읽는다, Task 24)는 이미
  //   1080p 값을 요구하므로 여기서 안 맞추면 게이트와 실제 청구가 갈린다.
  await chargeAd({
    userId: ownerId, projectId, seconds: project.settings?.seconds, model: project.settings?.model,
    resolution: project.settings?.resolution,
    openNewAttempt: hasRenderedAdVideo(project),
  });
  await updateProject(projectId, ownerId, (p) => ({ ...p, status: "rendering", video_error: null }));

  try {
    // 레퍼런스 바이트는 여기서 읽는다 — generate 는 바이트만 받는다(imagegen 과 같은 규약)
    const refs = [];
    for (const photo of project.material?.photos || []) {
      const key = photo.url?.split("/").pop();
      const bytes = key ? await readRefBytes({ source: "upload", key }) : null;
      if (bytes) refs.push({ key, bytes });
    }
    // ★ Task 23 — fal 이 이제 큐 API(queue.fal.run)라 접수와 완성 사이에 폴링이 낀다.
    // 그 도중 서버가 재시작되면 폴링 루프 자체가 사라진다. request_id 를 문서에 남겨
    // 두면(이어붙이기 자체는 이번 범위 밖이다) 나중에 이어붙일 단서가 생긴다 — 안
    // 남기면 그 길이 영영 막힌다. 실패해도 원래 흐름을 막지 않는다(.catch) — 이건
    // 어디까지나 재시작 대비용이지, 못 남긴다고 영상 생성 자체를 실패시킬 이유는 없다.
    const out = await make({
      project, scenario: project.scenario, refs,
      onRequestId: (requestId) =>
        updateProject(projectId, ownerId, (p) => ({ ...p, ad_request_id: requestId })).catch(() => {}),
    });
    const url = await store(out.url, projectId);
    await updateProject(projectId, ownerId, (p) => ({
      ...p, videos: [{ url, seconds: out.seconds }], status: "done", video_error: null,
    }));
  } catch (e) {
    // 못 준 것은 받지 않는다. 지우지 않고 음수 행으로 되돌린다.
    // ★ 환불이 실패해도 원래 오류를 삼키지 않는다 — catch 는 여기서만 끝내고 e 는 그대로 던진다.
    await refundAd({ projectId }).catch(() => {});
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "scenario", video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
    throw e;
  }
}
