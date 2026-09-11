// 광고 경로의 파이프라인 — 청구 → 생성 → 저장, 실패하면 환불.
//
// 기존 lib/pipeline.js 를 부르지 않는다. 컷·이미지·낭독·합성이 없는 경로다.
import { randomUUID } from "node:crypto";
import { queueAppOf } from "../clip-limits.js";
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { chargeAd, refundAd } from "../charges.js";
import { MAX_SCENARIO_TRIES } from "../pricing.js";
import { readRefBytes } from "../refs-io.js";
import { generateScenario as defaultScenario, pickEditedShots, pickEditedGlobals } from "./scenario.js";
import { generateAdVideo as defaultGenerate, submitAdVideo as defaultSubmit, collectAdVideo as defaultCollect } from "./generate.js";
import { adRenderTimeoutMs, adGiveUpMs } from "./timing.js";
import { adEndpoint } from "./models.js";
import { addRecord, estimateCost, costActor } from "../costs.js";
import { hasRenderedAdVideo } from "./attempt.js";
import { fakeFal } from "../fake.js";
// 일시 오류와 확정 실패를 가른다 — 접수증을 지킬지 지울지가 여기서 갈린다(reel 과 같은 함수).
import { classifyFailure } from "../failure.js";
import { adSubtitleCuts } from "./subtitles.js";
import { burnSubtitles } from "../compose.js";
import { falHeaders } from "../fal-auth.js";

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
// ★★ fal 이 준 영상은 **자막 없는 원본**으로 저장한다(2026-08-18). 예전에는 이것이 곧
//   완성본이었는데, 이제 그 위에 우리가 자막을 태운다(burnAdSubtitles).
//   이름을 `-raw` 로 두는 이유는 ⑥완성과 **같은 규칙**을 쓰기 때문이다 — burnSubtitles 가
//   `/api/renders/<id>-raw.mp4` 를 읽어 `<id>.mp4` 로 굽는다(lib/compose.js).
//   덕분에 자막이 마음에 안 들 때 돌아갈 원본이 광고에도 생긴다.
async function storeVideoDefault(url, projectId, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`완성본을 내려받지 못했어요 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // ★★★ **빈 영상을 완성으로 기록하지 않는다**(2026-08-21 실측 사고).
  //   가짜 모드의 자리표시자(`data:video/mp4;base64,`)가 fetch 에서 **200 + 0바이트**로
  //   내려와 그대로 저장됐고, 자막 태우기는 빈 파일이라 실패했는데(설계대로 원본 폴백)
  //   status 는 `done` 이 됐다. 화면은 완성이라 말하고 브라우저는 416 을 냈다.
  //   ★ 진짜 모드에서도 같은 일이 난다 — fal CDN 이 200 에 빈 본문을 주면 똑같다.
  //     그때는 **돈이 나간 뒤**라 더 나쁘다. 던지면 failAndRefund 가 환불한다.
  //   ★ 가짜 모드는 **일부러** 빈 자리표시자를 쓴다(lib/ad/generate.js 의 FAKE_URL) —
  //     거기서 던지면 배선 확인 자체가 불가능해진다. 돈이 걸린 진짜 모드에서만 막는다.
  if (!fakeFal() && !bytes.length) throw new Error("영상 파일이 비어 있어요 — 저장하지 않았어요");
  const name = `${projectId}-raw.mp4`;
  await getStore().putObject(RENDERS_BUCKET, name, bytes, "video/mp4");
  return `/api/renders/${name}`;
}

// 자막을 태운다 — ⑥완성이 쓰는 장치를 **그대로** 쓴다(두 벌이면 폰트·줄바꿈·위치가 갈린다).
//
// ★★ 실패해도 던지지 않는다. 이 영상은 이미 값을 치렀다($3.63) — 자막을 못 태웠다고
//   완성본을 통째로 잃으면 안 된다. 그때는 **원본을 완성본으로** 쓴다(자막만 없는 영상이다).
// ★ 언어는 사장님이 고른 나레이션 언어다. 대사가 그 말로 쓰였으므로 자막의 원문도 그 말이고,
//   폰트도 그 언어를 따른다(안 맞추면 일본어에 한국어 폰트가 붙어 두부가 된다).
// ⚠️ 한계: 단계별은 낭독을 실제로 만들어 **실측 길이**로 자막을 맞추는데, 광고는 통짜
//   생성이라 실측이 없다. 시나리오가 적은 초로 맞추므로 말과 자막이 조금 어긋날 수 있다.
async function burnAdSubtitles(projectId, project, rawUrl, deps = {}) {
  const burn = deps.burn || burnSubtitles;
  const cuts = adSubtitleCuts(project?.scenario, rawUrl);
  if (!cuts.some((c) => c.sentence)) return { url: rawUrl, subtitled: false };
  const lang = project?.settings?.narration_lang || "ko";
  try {
    const out = await burn({
      projectId,
      cuts,
      lang,
      // 대사 원문이 곧 그 언어다 — 번역 단계가 없다(lib/subtitles.js subtitleTextFor)
      sourceLang: lang,
      subtitle: project?.settings?.subtitle,
      aspect_ratio: project?.settings?.aspect_ratio || "9:16",
    });
    return { url: out.url, subtitled: true };
  } catch (e) {
    console.error("광고 자막을 태우지 못했어요 — 원본을 완성본으로 씁니다:", e?.message);
    return { url: rawUrl, subtitled: false };
  }
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
  // 영상 전체 값(인물·무대·옷차림…)도 같은 방식으로 서버가 고른다.
  const globalEdits = pickEditedGlobals(project.scenario, deps.globals);

  // ★★★ **gpt-4o 사진 판정을 걷어냈다**(2026-08-27 사장님 확정).
  //   2026-08-18 에 넣었던 readPhotoVision 은 gpt-4o(lib/vlm.js)로 사진을 읽어 글자·색·
  //   크기를 **글로 옮기고**, 그 글만 지문에 실었다. 이제 사진 원본을 Fable 에 직접
  //   붙인다(lib/ad/scenario.js 의 photoBlocks) — Fable 5 는 비전 최고 성능 모델이라,
  //   더 잘 보는 모델 앞에 덜 보는 모델을 통역으로 세울 이유가 없다.
  //   ★ readPhotoVision 자체는 **안 지운다** — film 라우트가 아직 쓴다.
  const scenario = await make({ project, edits, globalEdits });
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

async function finishWithVideo(projectId, ownerId, rawUrl, seconds, deps = {}) {
  const now = deps.now || Date.now;
  const project = await getProject(projectId, ownerId).catch(() => null);
  const { url, subtitled } = await burnAdSubtitles(projectId, project, rawUrl, deps);
  // ★★ 각인은 **patchFn 밖에서** 찍는다. updateProject 는 낙관적 락이라 CAS 에 지면 같은
  //   patchFn 을 다시 부르는데, 안에서 now() 를 부르면 시도마다 값이 달라져 순수 규약이
  //   깨진다(lib/projects.js 가 못 박는 규칙 — 이 저장소가 이미 밟은 함정이다).
  const ts = now();
  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    // ★ 완성본은 자막본이고, 원본은 따로 남는다 — 화면이 둘을 구별해 쓸 수 있다.
    // ★★ `ts` 는 **각인**이다(2026-09-10). 완성본 주소는 다시 구워도 `<id>.mp4` 로 같아서
    //   이것 없이는 "다시 구웠다"를 알릴 방법이 없다 — 그래서 app/api/renders 가 각인이
    //   없는 편에는 캐시를 **아예 안 건다**. 광고만 이 값이 없어 절감에서 통째로 빠져 있었다.
    videos: [{ url, seconds, rawUrl, subtitled, ts }],
    status: "done", video_error: null, ad_job: null,
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
      await finishWithVideo(projectId, ownerId, await store(job.url, projectId), job.seconds, deps);
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
  // 굽고 있지 않으면 fal 에 묻지도 않는다.
  if (!job || project.status !== "rendering") return { changed: false };
  // 이미 "끝났다"고 적어 둔 편은 fal 에 다시 묻지 않는다 — 남은 것은 마무리뿐이다
  // (다시 물으면 원장에 같은 굽기가 또 쌓인다).
  if (job.ready) return { changed: false, ready: true };

  try {
    const got = await collect({ project, scenario: project.scenario, job });
    if (!got.done) {
      // 아직이다. 다만 영원히 기다리지는 않는다 — 상한은 길이에 비례한다(lib/ad/timing.js).
      // ★ 여기서는 실제 경과(now)로 잰다. 한 프로세스가 틱을 세던 시절과 달리 이제 요청이
      //   여러 번 나뉘어 들어오므로, 셀 수 있는 틱이 없다.
      //
      // ★★★ 2026-09-10 — 상한이 **두 단**이 됐다(안정성 리뷰 §2). 그전에는 대기 상한
      //   하나였고 넘기면 곧바로 던져서 `failAndRefund` 로 갔다 — **다 만들어진 영상을
      //   버리고 환불하는** 자리다(그 파일 머리말이 "가장 나쁜 실패"라 부른 그것).
      //   실제로 옛 상한(15초=780초)은 실측 분포 안쪽이었다(실물 895초).
      //     · 대기 상한   — 늦는다고 **알리기만** 한다. 접수증도 크레딧도 그대로 둔다.
      //     · 포기 상한   — 그때는 죽은 요청으로 보고 환불하고 접수증을 지운다.
      const waited = now() - Number(job.startedAt || 0);
      if (waited >= adGiveUpMs(job.seconds)) {
        throw new Error(`영상 생성이 너무 오래 걸려요 (${Math.round(adGiveUpMs(job.seconds) / 60000)}분 넘음)`);
      }
      if (waited >= adRenderTimeoutMs(job.seconds)) {
        // ★ `status` 는 그대로 `rendering` 이다 — 아직 굽는 중이고, 화면은 이 문구를
        //   경고 한 줄로만 그린다(app/ads/[id]/page.js). 재시도 버튼을 열지 않는다.
        await updateProject(projectId, ownerId, (p) =>
          p.ad_job ? { ...p, video_error: "영상이 예상보다 오래 걸리고 있어요 — 끝나는 대로 보관함에 담깁니다" } : p
        ).catch(() => {});
        return { changed: false, pending: true, late: true };
      }
      return { changed: false, pending: true };
    }
    // ★★★ 2026-09-08 — **여기서 영상을 내려받지 않는다.** 끝났다는 사실만 적는다.
    //   그전에는 이 자리에서 내려받기·저장·자막 굽기까지 했다. 그 일을 60초짜리 상태
    //   라우트가 했고 화면은 2초마다 두드리므로 **무거운 일이 수십 개 겹쳐** 인스턴스가
    //   메모리 초과로 죽었다(실측: 3분 21초에 OOM 70건·타임아웃 14건·성공 0건).
    //   마무리해야 ad_job 이 지워지는데 아무도 못 끝내니 문서는 영영 rendering 이었다 —
    //   fal 에는 영상이 있는데 화면만 "만드는 중"인 그 사고다.
    await updateProject(projectId, ownerId, (p) =>
      p.ad_job ? { ...p, ad_job: { ...p.ad_job, ready: { url: got.url, seconds: got.seconds } } } : p
    );
    return { changed: true, ready: true };
  } catch (e) {
    // ★★★ 2026-09-10 — **일시 오류는 접수증을 지킨다**(안정성 리뷰 §1). reel 은 09-02 에
    //   이 게이트를 받았는데(lib/reel/pipeline.js 의 같은 자리) 광고는 안 받아서, `catch`
    //   하나가 **어떤 오류든** 환불하고 `ad_job: null` 을 찍고 있었다.
    //   fal 에는 요청 목록 API 가 없으므로(09-10 실측 405/404) 그 순간 이미 값을 치른
    //   영상($6~13)을 되찾을 길이 사라지고, 환불로 회차가 풀려 **두 번째 굽기**가 열린다.
    //   네트워크가 한 번 흔들리는 것과 fal 이 "안 만든다"고 답하는 것은 다른 일이다.
    // ★ 1분 크론이 이 경로를 사람 없이 매분 두드리므로 노출이 크게 는다 — 같은 회차에 막는다.
    const failure = classifyFailure(e?.message || "");
    if (["network", "busy", "timeout", "provider"].includes(failure.code)) {
      return { changed: false, transient: true, error: e?.message };
    }
    await failAndRefund(projectId, ownerId, e);
    return { changed: true, error: e?.message };
  }
}

// 잠금 수명 — 이 시간이 지난 잠금은 죽은 것으로 보고 다른 요청이 다시 쥔다.
//
// ★ 수명이 **반드시** 있어야 한다. 이 사고에서 잠금을 쥘 인스턴스가 바로 그렇게 죽었다 —
//   수명이 없으면 죽은 판이 쥔 채로 그 편이 영영 마무리되지 않는다.
// ★ 마무리 라우트 상한(300초)보다 길게 잡는다. 짧으면 아직 살아서 굽고 있는 판 옆에서
//   두 번째가 같은 일을 시작한다(같은 이름으로 저장하므로 덮어쓰기 경합이 된다).
const FINISH_LEASE_MS = 6 * 60_000;

// ★★★ 잃어버린 영상을 도로 붙인다 — **운영자 전용 구조선**(2026-09-08 실물 사고에서 났다).
//
// 무슨 일이 있었나: 한 편이 fal 에서는 완성됐는데 우리 수거가 계속 죽어(메모리 초과) 문서에
// 못 붙었다. 그 사이 사장님이 시나리오에서 다시 진행해 **새 굽기가 접수**됐고, 그 순간
// 재시작 단서(ad_request_id)가 덮였다. 이미 값을 치른 영상이 fal 에만 남고 앱에서는 되찾을
// 길이 사라진 것이다.
//
// ★ **굽지 않는다.** 이미 만들어진 결과를 받아 오기만 하므로 이 길로는 값이 새로 나가지 않는다.
// ★ 마지막 걸음은 정상 마무리와 **같은 함수**(finishWithVideo)다 — 두 벌이면 파일 이름·자막·
//   ETag 가 갈린다.
// ★ 굽는 중이면 붙이지 않는다 — 도는 굽기를 덮으면 그 값이 사라진다.
// ★ 원장에는 한 줄 남긴다(fal 접수번호가 멱등키다). 값은 실제로 나갔으므로 장부가 그걸 알아야
//   한다. 크레딧(청구)은 손대지 않는다 — 그건 사장님이 낸 값이고, 이 함수는 우리 원가만 적는다.
export async function attachAdVideo(projectId, ownerId, { requestId, url } = {}, deps = {}) {
  const store = deps.storeVideo || storeVideoDefault;
  const fetchImpl = deps.fetchImpl || fetch;
  const now = deps.now || Date.now;

  const project = await getProject(projectId, ownerId).catch(() => null);
  if (!project) return { error: "프로젝트를 찾을 수 없어요" };
  // 도는 굽기를 덮지 않는다. 그 굽기가 끝나거나 실패로 정리된 뒤에 붙인다.
  if (project.status === "rendering") return { rendering: true, error: "지금 굽는 중이에요 — 끝난 뒤에 붙여 주세요" };

  let videoUrl = url || null;
  let seconds = Number(project.settings?.seconds) || 15;
  // 갈래(t2v·i2v·r2v)는 시나리오가 정한다 — 모르는 값이면 t2v 로 본다(원장 단가용이라
  // 틀려도 값이 안 나간다). 표는 lib/ad/models.js 하나다.
  const kind = ["t2v", "i2v", "r2v"].includes(project.scenario?.endpoint) ? project.scenario.endpoint : "t2v";
  const endpoint = adEndpoint(project.settings?.model, kind);

  if (!videoUrl) {
    if (!requestId) return { error: "fal 접수번호가 필요해요" };
    // 큐의 결과 주소 — 접수 때 받아 두는 response_url 과 같은 자리다. 여기서 조립하는 이유는
    // 그 값이 문서에서 이미 사라진 편을 되살리는 것이 이 함수의 목적이기 때문이다.
    const res = await fetchImpl(`https://queue.fal.run/${queueAppOf(endpoint)}/requests/${requestId}`, {
      headers: falHeaders(),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e?.message || "" }));
    if (!res.ok) {
      return { error: `fal 에서 결과를 받지 못했어요 (${res.status}) ${(await res.text?.().catch(() => "")).slice(0, 120)}` };
    }
    const data = await res.json();
    videoUrl = data?.video?.url || null;
    if (!videoUrl) return { error: "그 접수번호에는 영상이 없어요" };
  }

  const rawUrl = await store(videoUrl, projectId, fetchImpl);
  await addRecord({
    request_id: requestId || `attach:${projectId}:${now()}`, ts: now(), endpoint,
    stage: "광고영상", user: costActor(), project_id: projectId,
    prompt: String(project.scenario?.text || "-").slice(0, 300),
    duration: String(seconds), aspect_ratio: project.settings?.aspect_ratio,
    est_cost_usd: estimateCost(endpoint, seconds, project.settings?.resolution),
    status: "done", video_url: videoUrl,
  }).catch(() => {});
  await finishWithVideo(projectId, ownerId, rawUrl, seconds, deps);
  return { attached: true, url: videoUrl };
}

// ★★ 마무리 — 무거운 일(내려받기 · 저장 · 자막 굽기)은 **잠금을 쥔 하나만** 한다.
//
// 수거(collectAdRender)가 ad_job.ready 를 적어 두면 이 함수가 이어받는다. 부르는 자리는
// 전용 라우트(app/api/ads/[id]/finish/route.js, 상한 300초)다 — 상태 라우트가 아니다.
export async function finishAdRender(projectId, ownerId, deps = {}) {
  const store = deps.storeVideo || storeVideoDefault;
  const now = deps.now || Date.now;
  // 잠금 표식. 이겼는지는 **되돌아온 문서**로 판정한다 — patchFn 은 CAS 에 지면 다시
  // 불리므로(lib/projects.js) 그 안에서 세운 깃발은 못 믿는다.
  const token = deps.token || randomUUID();

  const project = await getProject(projectId, ownerId).catch(() => null);
  if (!project?.ad_job?.ready || project.status !== "rendering") return { nothing: true };

  const doc = await updateProject(projectId, ownerId, (p) => {
    const job = p.ad_job;
    if (!job?.ready) return p;
    const held = Number(job.finish?.at || 0);
    // 살아 있는 잠금이 있으면 손대지 않는다 — 그 판이 지금 굽고 있다
    if (held && now() - held < FINISH_LEASE_MS) return p;
    return { ...p, ad_job: { ...job, finish: { token, at: now() } } };
  });
  if (doc?.ad_job?.finish?.token !== token) return { skipped: true };

  const ready = doc.ad_job.ready;
  try {
    await finishWithVideo(projectId, ownerId, await store(ready.url, projectId), ready.seconds, deps);
    return { finished: true };
  } catch (e) {
    await failAndRefund(projectId, ownerId, e);
    return { error: e?.message };
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
    // ★ 마무리는 finishWithVideo 한 곳이다(2026-08-18). 여기서 videos 를 직접 쓰던 시절에는
    //   서버리스 경로(collectAdRender)와 **두 벌**이었고, 자막 굽기를 붙이자 이쪽만 안 태웠다.
    //   같은 일을 두 곳에서 하면 언젠가 갈린다 — 이 저장소가 반복해서 겪은 모양이다.
    await finishWithVideo(projectId, ownerId, await store(out.url, projectId), out.seconds, deps);
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
