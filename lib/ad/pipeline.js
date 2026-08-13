// 광고 경로의 파이프라인 — 청구 → 생성 → 저장, 실패하면 환불.
//
// 기존 lib/pipeline.js 를 부르지 않는다. 컷·이미지·낭독·합성이 없는 경로다.
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { chargeAd, refundAd } from "../charges.js";
import { MAX_SCENARIO_TRIES } from "../pricing.js";
import { readRefBytes } from "../refs-io.js";
import { generateScenario as defaultScenario, pickEditedShots } from "./scenario.js";
import { generateAdVideo as defaultGenerate, submitAdVideo as defaultSubmit, collectAdVideo as defaultCollect } from "./generate.js";
import { adRenderTimeoutMs } from "./timing.js";
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

  // 사장님이 고친 컷 — 저장된 시나리오와 대조해 **서버가** 고른다. 화면이 보낸 목록을
  // 그대로 믿지 않는다(lib/ad/scenario.js 의 pickEditedShots 주석 참고).
  const edits = pickEditedShots(project.scenario?.shots, deps.edits);
  const scenario = await make({ project, edits });
  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    // ★ 직전 한 벌만 남긴다. prev 의 prev 를 지우지 않으면 다시 쓸 때마다 문서가 겹겹이
    //   불어난다(시나리오 하나가 4,000자다). 되돌리기는 한 걸음이면 충분하다 —
    //   그 이상은 사장님도 어디로 돌아가는지 모른다.
    scenario: {
      ...scenario,
      tries: (Number(p.scenario?.tries) || 0) + 1,
      ...(p.scenario ? { prev: { ...p.scenario, prev: undefined } } : {}),
    },
    status: "scenario",
    video_error: null,
  }));
}

// 되돌리기 — 직전 시나리오로 돌아간다.
//
// ★ LLM 을 안 부르므로 tries 를 올리지 않는다. 되돌리기가 회차를 먹으면 사장님은
// 되돌릴수록 다시 쓸 기회를 잃는다.
// ★ 되돌린 뒤에는 또 되돌릴 수 없다(prev 를 지운다) — 한 벌만 보관한다는 규칙 그대로다.
export async function undoScenario(projectId, ownerId) {
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  if (!project.scenario?.prev) throw new Error("되돌릴 것이 없어요");

  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    // tries 는 지금 값을 유지한다 — prev 가 들고 있던 옛 회차로 돌아가면 그 사이의
    // 다시 쓰기가 없던 일이 되어 상한을 우회하는 길이 된다.
    scenario: { ...p.scenario.prev, tries: p.scenario.tries, prev: undefined },
    status: "scenario",
    video_error: null,
  }));
}

// 굽기 앞에서 늘 같은 것을 본다 — 라우트·접수 둘이 같은 판정을 써야 한다.
async function loadRenderable(projectId, ownerId) {
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 시나리오 없이 굽지 않는다 — 그러면 무엇을 만드는지 아무도 모른다
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");
  return project;
}

async function readRefs(project) {
  // 레퍼런스 바이트는 여기서 읽는다 — generate 는 바이트만 받는다(imagegen 과 같은 규약)
  const refs = [];
  for (const photo of project.material?.photos || []) {
    const key = photo.url?.split("/").pop();
    const bytes = key ? await readRefBytes({ source: "upload", key }) : null;
    if (bytes) refs.push({ key, bytes });
  }
  return refs;
}

// 못 준 것은 받지 않는다. 지우지 않고 음수 행으로 되돌린다.
// ad_job 도 지운다 — 남겨 두면 실패한 접수를 다음 요청이 또 수거하려 든다.
async function failAndRefund(projectId, ownerId, e) {
  await refundAd({ projectId }).catch(() => {});
  await updateProject(projectId, ownerId, (p) => ({
    ...p, status: "scenario", ad_job: null,
    video_error: e?.message || "영상을 만들지 못했어요",
  })).catch(() => {});
}

async function finishWithVideo(projectId, ownerId, url, seconds) {
  await updateProject(projectId, ownerId, (p) => ({
    ...p, videos: [{ url, seconds }], status: "done", video_error: null, ad_job: null,
  }));
}

// ★★ 접수 — fal 큐에 넣고 접수증만 문서에 남긴다. 영상은 기다리지 않는다.
//
// 배포(Vercel 서버리스)는 응답이 나가면 인스턴스를 얼린다. 예전에는 라우트가 파이프라인
// 전체를 fire-and-forget 으로 띄우고 202 를 먼저 보내서, fal 폴링 루프가 통째로 사라졌다
// (시나리오는 동기라 멀쩡했고 영상만 안 나왔다). await 로 바꾸는 것도 답이 아니다 —
// lib/ad/timing.js 실측이 출력 1초당 ≈33.5초라 15초 광고가 ≈8.4분이고, 서버리스 상한은 300초다.
//
// ★ 청구는 여전히 접수 **앞**이다. 잔액 없이 fal 이 나가는 길을 안 만든다.
export async function startAdRender(projectId, ownerId, deps = {}) {
  const submit = deps.submitAdVideo || defaultSubmit;
  const store = deps.storeVideo || storeVideoDefault;
  const now = deps.now || Date.now;

  const project = await loadRenderable(projectId, ownerId);
  await chargeAd({
    userId: ownerId, projectId, seconds: project.settings?.seconds, model: project.settings?.model,
    resolution: project.settings?.resolution,
    openNewAttempt: hasRenderedAdVideo(project),
  });
  await updateProject(projectId, ownerId, (p) => ({
    ...p, status: "rendering", video_error: null, ad_job: null,
  }));

  try {
    const job = await submit({ project, scenario: project.scenario, refs: await readRefs(project) });

    // 가짜 모드는 큐를 안 탄다 — 그 자리에서 끝난다(배선과 상태 전이만 확인하는 모드다).
    if (job.fake) {
      await finishWithVideo(projectId, ownerId, await store(job.url, projectId), job.seconds);
      return { done: true };
    }

    await updateProject(projectId, ownerId, (p) => ({
      ...p,
      // 재시작 대비 단서는 예전 이름 그대로 남긴다(이미 보던 자리를 안 옮긴다)
      ad_request_id: job.requestId,
      // startedAt 이 상한의 기준점이다 — 수거 쪽이 실제 경과 시간으로 판정한다.
      ad_job: { ...job, startedAt: now() },
    }));
    return { done: false, requestId: job.requestId };
  } catch (e) {
    await failAndRefund(projectId, ownerId, e);
    throw e;
  }
}

// ★★ 수거 — 한 번만 물어본다. 화면이 /status 를 두드릴 때마다 불린다.
//
// **던지지 않는다.** 부르는 쪽이 상태 조회 라우트라, 여기서 던지면 화면이 상태조차 못 읽는다.
// 실패는 문서의 video_error 로 남고 화면은 그것을 읽는다.
export async function collectAdRender(projectId, ownerId, deps = {}) {
  const collect = deps.collectAdVideo || defaultCollect;
  const store = deps.storeVideo || storeVideoDefault;
  const now = deps.now || Date.now;

  const project = await getProject(projectId, ownerId).catch(() => null);
  const job = project?.ad_job;
  // 굽고 있지 않으면 fal 에 묻지도 않는다. ★ 이것이 겹친 수거를 막는 자리이기도 하다 —
  // 먼저 끝낸 쪽이 ad_job 을 지우므로 뒤따라온 쪽은 여기서 조용히 돌아간다.
  if (!job || project.status !== "rendering") return { changed: false };

  try {
    const got = await collect({ project, scenario: project.scenario, job });
    if (!got.done) {
      // 아직이다. 다만 영원히 기다리지는 않는다 — 상한은 길이에 비례한다(lib/ad/timing.js).
      // ★ 여기서는 실제 경과(now)로 잰다. 한 프로세스가 틱을 세던 시절과 달리 이제 요청이
      //   여러 번 나뉘어 들어오므로, 셀 수 있는 틱이 없다.
      const cap = adRenderTimeoutMs(job.seconds);
      if (now() - Number(job.startedAt || 0) >= cap) {
        throw new Error(`영상 생성이 너무 오래 걸려요 (${Math.round(cap / 60000)}분 넘음)`);
      }
      return { changed: false, pending: true };
    }
    await finishWithVideo(projectId, ownerId, await store(got.url, projectId), got.seconds);
    return { changed: true, done: true };
  } catch (e) {
    await failAndRefund(projectId, ownerId, e);
    return { changed: true, error: e?.message };
  }
}

// 접수부터 완성까지 한 호출 안에서 끝낸다. **서버리스에서는 못 쓴다**(위 주석 참고) —
// 로컬·측정 스크립트처럼 프로세스가 계속 사는 곳을 위한 경로다.
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
