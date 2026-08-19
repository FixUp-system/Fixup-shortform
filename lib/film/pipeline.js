// 한 번에 굽는 경로 — 이미지 만들기와 굽기.
//
// ★ 새 장치를 만들지 않는다. 시나리오는 lib/ad/scenario.js, 이미지는 lib/imagegen.js,
//   굽기는 lib/ad/generate.js, 자막은 lib/ad/subtitles.js + lib/compose.js 를 그대로 쓴다.
//   두 벌이 되면 어느 쪽이 진짜인지 아무도 모르게 된다.
import { getProject, updateProject } from "../projects.js";
import { generateImage } from "../imagegen.js";
import { readRefBytes } from "../refs-io.js";
import { submitAdVideo, withSpokenLines } from "../ad/generate.js";
import { imagePlanFor, attachClauseFor, filmMode } from "./mode.js";
import { filmOf, putFilm } from "./doc.js";

// 굽기 프롬프트 = 시나리오 지문 + 붙인 그림을 뭐라고 부르는지 + 대사 못 박기.
//
// ★ 대사(withSpokenLines)는 광고와 **같은 함수**다. 2026-08-19 실측으로 대사를 안 실으면
//   모델이 자기가 지어낸 말을 하고 자막과 전혀 다른 영상이 나온다는 것이 확인됐다.
export function buildFilmPrompt(scenario, mode) {
  filmMode(mode);
  const base = typeof scenario?.text === "string" ? scenario.text : "";
  const withAttach = [base, "", attachClauseFor(mode)].join("\n");
  return withSpokenLines(withAttach, scenario?.shots);
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

  const plan = imagePlanFor(mode, project.scenario);
  if (!plan.length) throw new Error("만들 그림이 없어요");

  // 한 번만 읽는다 — 계획이 여러 장이어도 같은 사진들이다(장마다 다시 읽으면 저장소를 헛되이 친다)
  const refs = await readPhotoRefs(project);

  const images = [];
  for (const item of plan) {
    const out = await make({
      prompt: item.prompt,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      refs,
      projectId,
    });
    images.push({ key: item.key, url: out.url, of: item.prompt });
  }
  await updateProject(projectId, ownerId, (p) => putFilm(p, mode, { images, status: "images", error: null }));
}

// 굽기 접수 — 광고와 같은 이유로 접수와 수거를 나눈다(서버리스는 응답이 나가면 얼린다).
export async function startFilmRender(projectId, ownerId, mode, deps = {}) {
  const submit = deps.submitAdVideo || submitAdVideo;
  const now = deps.now || Date.now;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  const film = filmOf(project, mode);
  // ★ 그림 없이 굽지 않는다. 참조 없이 r2v 로 나가면 이 경로의 뜻이 사라지는데 값은 그대로 든다.
  if (!film.images?.length) throw new Error("먼저 그림을 만들어 주세요");

  const scenario = { ...project.scenario, text: buildFilmPrompt(project.scenario, mode), endpoint: "r2v" };
  const job = await submit({
    project, scenario,
    // 우리가 만든 그림은 fal 공개 주소다 — 내려받았다 다시 올릴 이유가 없어 {url} 로 넘긴다
    refs: film.images.map((im) => ({ url: im.url })),
  });

  if (job.fake) {
    await updateProject(projectId, ownerId, (p) => putFilm(p, mode, { status: "done", video: { url: job.url, seconds: job.seconds } }));
    return { done: true };
  }
  await updateProject(projectId, ownerId, (p) =>
    putFilm(p, mode, { status: "rendering", job: { ...job, startedAt: now() }, error: null }));
  return { done: false, requestId: job.requestId };
}
