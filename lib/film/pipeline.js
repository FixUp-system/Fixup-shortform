// 한 번에 굽는 경로 — 이미지 만들기와 굽기.
//
// ★ 새 장치를 만들지 않는다. 시나리오는 lib/ad/scenario.js, 이미지는 lib/imagegen.js,
//   굽기는 lib/ad/generate.js, 자막은 lib/ad/subtitles.js + lib/compose.js 를 그대로 쓴다.
//   두 벌이 되면 어느 쪽이 진짜인지 아무도 모르게 된다.
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { generateImage } from "../imagegen.js";
import { readRefBytes } from "../refs-io.js";
import { submitAdVideo, collectAdVideo, withSpokenLines } from "../ad/generate.js";
import { adRenderTimeoutMs } from "../ad/timing.js";
import { adSubtitleCuts } from "../ad/subtitles.js";
import { burnSubtitles } from "../compose.js";
import { refundAd } from "../charges.js";
import { imagePlanFor, anchorPlanFor, attachClauseFor, filmMode, isFilmMode, filmVideoBase } from "./mode.js";
import { filmOf, putFilm } from "./doc.js";

// ★ 파일 이름 규칙은 lib/film/mode.js 로 옮겼다(2026-08-19) — 지우기 라우트도 같은 규칙이
//   필요한데(app/api/projects/[id]/route.js), 그쪽이 이 파일을 import 하면 ffmpeg·fal 이
//   딸려 온다. 여기서 다시 내보내 옛 부르는 자리를 그대로 둔다.
export { filmVideoBase };

// 굽기 프롬프트 = 시나리오 지문 + 붙인 그림을 뭐라고 부르는지 + 대사 못 박기.
//
// ★ 대사(withSpokenLines)는 광고와 **같은 함수**다. 2026-08-19 실측으로 대사를 안 실으면
//   모델이 자기가 지어낸 말을 하고 자막과 전혀 다른 영상이 나온다는 것이 확인됐다.
// ★ 앵커 유무는 **문서의 그림 목록**에서 읽는다(scenario.focus 로 추론하지 않는다).
//   판정의 근거는 "무엇을 실제로 fal 에 보냈는가"여야 한다 — images 는 굽기가
//   refs 로 그대로 넘기는 바로 그 목록이다.
export function buildFilmPrompt(scenario, mode, images) {
  filmMode(mode);
  const base = typeof scenario?.text === "string" ? scenario.text : "";
  const hasAnchor = Array.isArray(images) && images[0]?.key === "anchor";
  const withAttach = [base, "", attachClauseFor(mode, { hasAnchor })].join("\n");
  return withSpokenLines(withAttach, scenario?.shots, scenario?.voice);
}

// 사장님이 올린 사진의 바이트를 읽는다.
//
// ★ lib/ad/pipeline.js 의 readRefs 와 **같은 규약**이다: photos[].url 의 마지막 조각이
//   저장소 키이고, 바이트를 못 얻은 것은 버린다(참조 하나가 없다고 그림을 못 만들 이유가
//   없다 — readRefBytes 는 없으면 던지지 않고 null 을 준다).
async function readPhotoRefs(project) {
  const refs = [];
  for (const photo of project.material?.photos || []) {
    const key = photo.url?.split("/").pop();
    const bytes = key ? await readRefBytes({ source: "upload", key }) : null;
    if (bytes) refs.push({ key, bytes });
  }
  return refs;
}

// 실패를 **문서에** 남긴다.
//
// ★★ 던지고 끝내면 안 되는 이유: 그림 만들기는 장수 × 수 초라 라우트가 응답을 기다릴 수
//   없어 fire-and-forget 이 된다. 그러면 그 예외는 어디에도 안 닿고, 화면은 status 를 보고
//   영원히 "만드는 중"이다 — 사장님은 무엇이 잘못됐는지 알 길이 없다. 광고가 같은 이유로
//   video_error 를 문서에 적는다(lib/ad/pipeline.js failAndRefund).
// ★ 문서에 적는 것과 던지는 것은 배타적이지 않다 — 부르는 쪽이 동기면 응답으로도 알려야 한다.
// ★ 남기기 자체가 실패해도 원래 오류를 삼키지 않는다(.catch).
async function failFilm(projectId, ownerId, mode, e, fallback) {
  await updateProject(projectId, ownerId, (p) =>
    putFilm(p, mode, { status: "error", error: e?.message || fallback })).catch(() => {});
}

// 이미지 — 방식이 정한 계획대로 만든다. 사장님이 올린 사진은 **참조로 함께** 넘긴다
// (lib/imagegen.js 가 refs 를 받으면 edit 계열 엔드포인트로 간다).
//
// ★★ 이 자리에서 refs 를 안 넘기면, 이미지 모델은 제품이 실제로 어떻게 생겼는지 모른 채
//   글로 쓰인 프롬프트만 보고 그린다. 2026-08-19 실측에서 참조 사진은 **라벤더** 토끼인데
//   프롬프트가 "cream-white" 를 시켜 크림색 토끼가 나왔다. 글로 다투게 두지 않고 **그림으로
//   주면** 그 사고가 구조적으로 안 난다.
// ★ 사진이 없는 프로젝트도 있다 — 그때는 빈 배열이고, imagegen 이 base 엔드포인트로 간다.
export async function runFilmImages(projectId, ownerId, mode, deps = {}) {
  const make = deps.generateImage || generateImage;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");

  // ★ 사진을 **계획보다 먼저** 읽는다(2026-08-19). 계획이 "참조 사진이 있는가"를 알아야
  //   하기 때문이다 — 있으면 "생김새는 참조를 따르고 글은 연출만 정한다"를 프롬프트에
  //   붙인다. readPhotoRefs 는 못 읽은 사진을 조용히 버릴 뿐 던지지 않으므로 try 밖이어도
  //   안전하다(한 번만 읽는다 — 계획이 여러 장이어도 같은 사진들이다).
  const refs = await readPhotoRefs(project);

  // ★ 나레이션 언어를 함께 넘긴다 — 사람이 나오는 그림의 국적이 그 값에서 온다.
  //   실측 2026-08-19: 안 넘기던 시절에는 한국어 광고인데 인물이 전부 외국인이었다.
  const plan = imagePlanFor(mode, project.scenario, {
    narrationLang: project.settings?.narration_lang,
    hasPhoto: refs.length > 0,
  });
  if (!plan.length) throw new Error("만들 그림이 없어요");

  try {

    const aspect = project.settings?.aspect_ratio || "9:16";
    const images = [];

    // ★★ 장면 순서 방식은 **앵커를 먼저** 만든다(2026-08-19). 이 방식은 컷마다 독립으로
    //   그리기 때문에 인물도 제품도 컷마다 딴 것이 된다 — 앵커 한 장을 먼저 만들어
    //   장면 그림 **전부**가 그것을 참조하게 한다(직전 그림이 아니다: 오차가 누적된다).
    // ★ 참고 그림 방식에는 안 붙인다 — 그 방식은 세 축 자체가 앵커다.
    // ★ 우리가 만든 그림은 fal 공개 주소라 {url} 로 넘긴다(사장님 사진은 바이트다).
    //   readPhotoRefs 와 같은 배열에 섞이지만 lib/ad/generate.js 의 refUri 가 둘 다 받는다.
    // ★★ 사진이 있으면 앵커를 **안 만든다**(2026-08-19 사장님 결정). 사장님이 올린
    //   사진이 제품의 **진실**이고, 앵커는 그 사진을 참조로 AI 가 그린 그림이라 한 다리
    //   건넌 것이다. 장면 그림에 둘 다 넘기면 조금만 달라도 두 참조 사이에서 흔들린다 —
    //   사진이 있으면 사진이 더 나은 앵커다. 값($0.08)도 아낀다.
    // ⚠️ 남는 한계: focus 가 person·place 인데 올린 사진이 **제품 사진**이면 인물·공간을
    //   고정할 것이 없어진다. 올린 사진에 무엇이 찍혔는지는 이 코드가 모른다 — 알려면
    //   사진을 읽는 단계가 하나 더 필요하고, 지금은 여기서 멈춘다.
    const anchor = mode === "order" && refs.length === 0 ? anchorPlanFor(project.scenario, { narrationLang: project.settings?.narration_lang }) : null;
    let sceneRefs = refs;
    if (anchor) {
      const out = await make({ prompt: anchor.prompt, aspect_ratio: aspect, refs, projectId });
      images.push({ key: anchor.key, url: out.url, of: anchor.prompt });
      sceneRefs = [...refs, { url: out.url }];
    }

    for (const item of plan) {
      const out = await make({
        prompt: item.prompt,
        aspect_ratio: aspect,
        refs: sceneRefs,
        projectId,
      });
      images.push({ key: item.key, url: out.url, of: item.prompt });
    }
    // ★★ **어느 판의 시나리오로 그렸는지**를 함께 적는다(2026-08-19). 이 숫자 하나가
    //   없으면 시나리오를 다시 쓴 뒤에도 굽기가 열려 옛 그림으로 값이 나가고, 두 방식을
    //   서로 다른 판으로 구워도 문서에 그 사실이 안 남는다 — 그러면 "차이는 방식 때문"이
    //   라는 이 기능의 대전제를 나중에 아무도 확인할 수 없다. 문은 굽기 라우트가 연다.
    const scenarioTries = Number(project.scenario?.tries) || 0;
    await updateProject(projectId, ownerId, (p) =>
      putFilm(p, mode, { images, status: "images", error: null, scenarioTries }));
  } catch (e) {
    await failFilm(projectId, ownerId, mode, e, "그림을 만들지 못했어요");
    throw e;
  }
}

// 굽기 접수 — 광고와 같은 이유로 접수와 수거를 나눈다(서버리스는 응답이 나가면 얼린다).
export async function startFilmRender(projectId, ownerId, mode, deps = {}) {
  const submit = deps.submitAdVideo || submitAdVideo;
  const now = deps.now || Date.now;
  // ★★ 어느 청구 회차로 이 편을 샀는가. 라우트가 **chargeAd 의 반환값에서** 받아 넘긴다
  //   (lib/charges.js — 자기가 쓴 번호를 아는 함수는 그것뿐이다. 나중에 장부에 물어보면
  //   그 사이에 옆 방식이 연 회차가 나온다). 이것을 안 적어 두면 수거 실패 때 refundAd 가
  //   "살아 있는 **마지막** 회차"를 되돌리는데, 이 경로는 한 프로젝트에서 두 편을 굽는다 —
  //   order 가 실패했는데 refs 의 값이 돌아가는 사고가 난다.
  const attempt = deps.attempt ?? null;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  const film = filmOf(project, mode);
  // ★ 그림 없이 굽지 않는다. 참조 없이 r2v 로 나가면 이 경로의 뜻이 사라지는데 값은 그대로 든다.
  if (!film.images?.length) throw new Error("먼저 그림을 만들어 주세요");

  try {
    const scenario = { ...project.scenario, text: buildFilmPrompt(project.scenario, mode, film.images), endpoint: "r2v" };
    const job = await submit({
      project, scenario,
      // 우리가 만든 그림은 fal 공개 주소다 — 내려받았다 다시 올릴 이유가 없어 {url} 로 넘긴다
      refs: film.images.map((im) => ({ url: im.url })),
    });

    if (job.fake) {
      // ★ error: null 을 함께 지운다 — 앞 회차 실패가 남아 있으면 done 인데 error 가 붙은
      //   모순 상태가 되고, 화면이 어느 쪽을 믿어야 할지 모른다.
      await updateProject(projectId, ownerId, (p) =>
        putFilm(p, mode, { status: "done", video: { url: job.url, seconds: job.seconds }, error: null }));
      return { done: true };
    }
    await updateProject(projectId, ownerId, (p) =>
      putFilm(p, mode, { status: "rendering", job: { ...job, startedAt: now(), attempt }, error: null }));
    return { done: false, requestId: job.requestId };
  } catch (e) {
    await failFilm(projectId, ownerId, mode, e, "영상을 만들지 못했어요");
    throw e;
  }
}

// ── 수거와 자막 ───────────────────────────────────────────────────────────

const RENDERS_BUCKET = "renders";

// fal 산출물은 기본이 publicly readable 이다 — 우리 비공개 버킷으로 옮긴다.
// 광고의 storeVideoDefault 와 같은 일이고, 다른 것은 이름뿐이다.
//
// ⚠️ **시그니처가 광고와 다르다**: 여기는 3번째가 `mode` 이고 광고는 `fetchImpl` 이다
//   (광고에는 방식이 없다). 그래서 주입 이름도 `deps.storeFilmVideo` 로 갈라 둔다 —
//   같은 이름이면 광고의 기본값을 주입했을 때 mode 가 fetch 자리로 들어간다.
async function storeFilmVideoDefault(url, projectId, mode, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`완성본을 내려받지 못했어요 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = `${filmVideoBase(projectId, mode)}-raw.mp4`;
  await getStore().putObject(RENDERS_BUCKET, name, bytes, "video/mp4");
  return `/api/renders/${name}`;
}

// 자막을 태운다 — 광고와 **같은 장치**(adSubtitleCuts + burnSubtitles)를 그대로 쓴다.
//
// ★★ 실패해도 던지지 않는다. 이 영상은 이미 값을 치렀다 — 자막을 못 태웠다고 완성본을
//   통째로 잃으면 안 된다. 그때는 **원본을 완성본으로** 쓴다(자막만 없는 멀쩡한 영상이다).
// ★ 언어는 사장님이 고른 나레이션 언어이고, 원문도 같은 값이다(번역 단계가 없다).
async function burnFilmSubtitles(projectId, mode, project, rawUrl, deps = {}) {
  const burn = deps.burn || burnSubtitles;
  const cuts = adSubtitleCuts(project?.scenario, rawUrl);
  // 대사가 하나도 없으면 태울 것이 없다 — 빈 자막은 검은 띠만 깜빡인다
  if (!cuts.some((c) => c.sentence)) return { url: rawUrl, subtitled: false };
  const lang = project?.settings?.narration_lang || "ko";
  try {
    const out = await burn({
      projectId: filmVideoBase(projectId, mode),
      cuts,
      lang,
      sourceLang: lang,
      subtitle: project?.settings?.subtitle,
      aspect_ratio: project?.settings?.aspect_ratio || "9:16",
    });
    return { url: out.url, subtitled: true };
  } catch (e) {
    console.error("자막을 태우지 못했어요 — 원본을 완성본으로 씁니다:", e?.message);
    return { url: rawUrl, subtitled: false };
  }
}

// 수거가 실패했을 때 — **이 방식의 회차만** 되돌리고, 실패를 문서에 남긴다.
//
// ★ job.attempt 가 없는 옛 문서(이 태스크 이전에 접수된 것)는 attempt 없이 부르게 되고,
//   그때는 refundAd 가 예전처럼 살아 있는 마지막 회차를 되돌린다 — 하나뿐이면 그것이 맞다.
// ★ job 을 지운다 — 남겨 두면 다음 폴링이 실패한 접수를 또 수거하려 든다(광고와 같다).
async function failFilmRender(projectId, ownerId, mode, job, e) {
  await refundAd({ projectId, attempt: job?.attempt || null }).catch(() => {});
  await updateProject(projectId, ownerId, (p) =>
    putFilm(p, mode, {
      status: "error", job: null, error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
}

// ★★ 수거 — 한 번만 물어본다. 화면이 /status 를 두드릴 때마다 불린다.
//
// **던지지 않는다.** 부르는 쪽이 상태 조회 라우트라, 여기서 던지면 화면이 상태조차 못 읽는다
// (광고의 collectAdRender 와 같은 규율이다). 실패는 문서의 films[mode].error 로 남는다.
//
// ⚠️ 남는 성질: 아무도 안 두드리면 수거도 안 된다. 창을 닫으면 fal 에서는 완성되지만 우리
//    문서는 rendering 인 채로 있다가 다음에 그 화면을 열 때 수거된다(광고와 같다).
export async function collectFilmRender(projectId, ownerId, mode, deps = {}) {
  // ★ 모르는 방식에도 던지지 않는다 — filmOf 는 던진다. 상태 조회가 부르는 자리라
  //   여기서 예외가 새면 화면이 통째로 못 읽는다.
  if (!isFilmMode(mode)) return { changed: false };

  const collect = deps.collectAdVideo || collectAdVideo;
  const store = deps.storeFilmVideo || storeFilmVideoDefault;
  const now = deps.now || Date.now;

  const project = await getProject(projectId, ownerId).catch(() => null);
  if (!project) return { changed: false };

  const film = filmOf(project, mode);
  const job = film.job;
  // 굽고 있지 않으면 fal 에 묻지도 않는다. ★ 겹친 수거를 막는 자리이기도 하다 —
  // 먼저 끝낸 쪽이 job 을 지우므로 뒤따라온 쪽은 여기서 조용히 돌아간다.
  if (!job || film.status !== "rendering") return { changed: false };

  try {
    const got = await collect({ project, scenario: project.scenario, job });
    if (!got.done) {
      // 아직이다. 다만 영원히 기다리지는 않는다 — 상한은 길이에 비례한다(lib/ad/timing.js).
      // 실제 경과(now)로 잰다: 요청이 여러 번 나뉘어 들어와 셀 수 있는 틱이 없다.
      const cap = adRenderTimeoutMs(job.seconds);
      if (now() - Number(job.startedAt || 0) >= cap) {
        throw new Error(`영상 생성이 너무 오래 걸려요 (${Math.round(cap / 60000)}분 넘음)`);
      }
      return { changed: false, pending: true };
    }

    const rawUrl = await store(got.url, projectId, mode);
    const { url, subtitled } = await burnFilmSubtitles(projectId, mode, project, rawUrl, deps);
    await updateProject(projectId, ownerId, (p) =>
      putFilm(p, mode, {
        // 완성본은 자막본이고 원본은 따로 남는다 — 화면이 둘을 구별해 쓸 수 있다.
        status: "done",
        // ★ ts — app/api/renders/[name] 의 ETag 가 읽는 값이다. 없으면 이 경로의 영상만
        //   304 를 못 타 볼 때마다 전량이 다시 나간다(광고는 project.render.ts 를 쓴다).
        video: { url, seconds: got.seconds, rawUrl, subtitled, ts: now() },
        job: null, error: null,
      }));
    return { changed: true, done: true };
  } catch (e) {
    await failFilmRender(projectId, ownerId, mode, job, e);
    return { changed: true, error: e?.message || "영상을 만들지 못했어요" };
  }
}
