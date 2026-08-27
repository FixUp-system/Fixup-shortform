// reel 배선 — **새 장치를 만들지 않는다.**
//
// ★ 시나리오는 lib/ad/scenario.js, 컷 분할은 lib/cuts.js, 이미지는 lib/imagegen.js,
//   참조 적재는 lib/cut-refs.js, 굽기는 lib/i2v.js, 합성·자막은 lib/compose.js 를
//   그대로 쓴다. 두 벌이 되면 어느 쪽이 진짜인지 아무도 모르게 된다
//   (lib/film/pipeline.js 가 356줄로 끝난 이유가 이것이다).
import { getProject as getProjectImpl, updateProject as updateProjectImpl } from "../projects.js";
import { writeClipPromptBody } from "./clip-prompt.js";
import { buildClipPrompt } from "../cuts.js";
import { loadCutRefs } from "../cut-refs.js";
import { toFalImageUrl } from "../refs-io.js";
import { generateClip } from "../i2v.js";
import { isPromptsReady } from "./doc.js";
import { isReelClipStale } from "./steps.js";
import { planReelBake, reelWholePrompt, buildOneShotPrompt, isReelOneShotStale, reelBakeCounts } from "./oneshot.js";
// ★ 심장박동은 단계별 흐름의 그 장치를 그대로 쓴다(새 타이머를 만들지 않는다) —
//   세는 규칙만 reel 것으로 갈아 끼운다(reelProgress).
import { startHeartbeat } from "../pipeline.js";

// ── 심장박동 ────────────────────────────────────────────────────────────
//
// **"살아 있다"를 문서에 남기는 유일한 채널이다.** 굽기는 fire-and-forget 이라 실패도
// 진행도 HTTP 로 안 보인다 — 함수가 응답 뒤에 얼어붙으면 오류를 적는 코드조차 안 돈다.
// 그때 화면이 "돌고 있다"와 "2분째 아무 일도 없다"를 가르는 근거가 이 표식 하나다.
//
// ★ 세는 단위는 reelBakeCounts 하나가 정한다 — 통짜는 컷이 여럿이어도 total 이 1 이다.
// ★ at 은 밖에서 받는다 — updateProject 는 낙관적 락이라 CAS 에 지면 같은 patchFn 을 다시
//   부른다. 안에서 Date.now() 를 부르면 시도마다 값이 달라져 순수 규약이 깨진다.
// ★ 컷은 건드리지 않는다 — progress 만 얹는다.
export function reelProgress(proj, phase, at) {
  const { done, total } = reelBakeCounts(proj);
  return { ...proj, progress: { at, phase, done, total } };
}

// 컷마다 영상 프롬프트를 만들어 **문서에 저장한다.**
//
// ★★ 저장이 각인의 근거다. LLM 은 부를 때마다 다른 문장을 내므로, 굽을 때 다시 부르면
//   이미 산 클립이 매번 낡는다(컷당 12크레딧). 그래서 이미 있는 칸은 건드리지 않는다 —
//   다시 만들려면 화면이 그 칸을 비우고(only) 부른다.
export async function runReelPrompts(projectId, ownerId, deps = {}) {
  const getProject = deps.getProject || getProjectImpl;
  const updateProject = deps.updateProject || updateProjectImpl;
  const writeBody = deps.writeBody || writeClipPromptBody;
  const only = Array.isArray(deps.only) && deps.only.length ? new Set(deps.only) : null;
  // ★★ 사장님이 **말로** 고쳐 달라고 적은 것(2026-08-25). 단위는 **전체 한 번**이다 —
  //   컷마다 **같은 말**을 실는다. 한 컷에만 실으면 "전체적으로 더 천천히" 같은 요청이
  //   그 컷만 다른 영상으로 만든다. 컷 하나만 손보는 것은 화면의 직접 편집이 맡는다.
  // ★ 안 넘기면 지문이 예전과 글자 그대로다(빈 값은 clip-prompt.js 의 line 이 버린다).
  const note = typeof deps.note === "string" ? deps.note : "";

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  const cuts = Array.isArray(project.cuts) ? project.cuts : [];
  if (!cuts.length) throw new Error("컷을 먼저 만들어 주세요");

  // ★ 순서대로 돈다(Promise.all 이 아니다) — 앞 컷의 shows 를 뒤 컷이 받는다.
  //   컷 수가 서넛이고 호출이 짧아 직렬로 잃는 시간이 작다.
  const next = [];
  for (const [i, cut] of cuts.entries()) {
    const has = typeof cut?.clip_prompt === "string" && cut.clip_prompt.trim();
    const wanted = only ? only.has(i) : !has;
    if (!wanted) { next.push(cut); continue; }

    const body = await writeBody(cut, project, {
      sceneNo: i + 1,
      sceneCount: cuts.length,
      // 앞 컷이 무엇을 보여 줬는가 — 모델이 자기 위치를 알게 하는 유일한 채널이다.
      prevShows: i > 0 ? (cuts[i - 1]?.shows || "") : "",
      projectId,
      note,
    });
    next.push({ ...cut, clip_prompt: body });
  }

  await updateProject(projectId, ownerId, (p) => ({ ...p, cuts: next }));
}

// 컷마다 굽는다 — **컷 그림 + 그 컷에 꽂힌 참조**를 함께 보낸다.
//
// ★★ 참조는 lib/cut-refs.js 의 loadCutRefs 를 그대로 쓴다 — 이미지 단계가 쓰는 그 함수다.
//   여기서 따로 모으면 "어느 사진이 어느 컷에 실렸나"의 답이 두 벌이 된다.
// ★ 각인(of)은 **저장된 clip_prompt** 다. 굽기 프롬프트 전체가 아니다 — 꼬리는 코드가
//   결정론으로 붙이므로 본문만 각인하면 충분하고, 꼬리 문구를 고칠 때 산 클립이 안 낡는다.
//   그림 축(imageOf)은 **별도 필드**다 — lib/reel/steps.js 의 isReelClipStale 머리말 참고
//   (of 의 형식을 바꾸면 이미 구운 클립이 통째로 낡는다).
//
// ★★ 2026-08-21 재검토 B3 — **컷마다 바로 저장한다**(끝에 한 번이 아니다). 예전에는
//   `next` 스냅샷을 루프 끝에서 한 번에 썼다 — 루프 중간에 다음 컷이 던지면(또는
//   서버리스가 도중에 얼면) **방금 구운 컷까지 저장 자리에서 통째로 사라졌다**(컷당
//   12크레딧 + fal 원가). 게다가 N5 의 건너뛰기가 들어온 지금은 더 나쁘다 — 버려진
//   클립이 문서에 없으니 **다음 실행이 그 컷을 다시 굽는다**(fal 원가 이중지출, 크레딧은
//   한 번만 받는다). N1(images 라우트)과 같은 처방을 여기 가장 비싼 경로에도 편다:
//   컷 하나가 끝날 때마다 **그 컷만** 병합해서 저장한다 — 스냅샷 대체가 아니다.
export async function runReelClips(projectId, ownerId, deps = {}) {
  const getProject = deps.getProject || getProjectImpl;
  const updateProject = deps.updateProject || updateProjectImpl;
  const makeClip = deps.makeClip || generateClip;
  const loadRefs = deps.loadRefs || loadCutRefs;

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  const cuts = Array.isArray(project.cuts) ? project.cuts : [];

  // ★★ 문 앞에서 다 본다. 컷 셋을 굽고 넷째에서 막히면 값은 이미 세 컷치가 나갔다.
  if (!isPromptsReady(cuts)) throw new Error("영상 프롬프트를 먼저 만들어 주세요");
  if (!cuts.every((c) => c?.image?.url)) throw new Error("그림을 먼저 만들어 주세요");

  // ★★ 문을 다 지난 뒤에 박동을 시작한다 — 게이트에서 되돌아가는 실행이 표식을 남기면
  //   그 표식이 굽기 문(POST /clips)의 잠금을 2분 동안 붙들어 사장님이 못 누른다.
  // ★ 시작할 때 한 번 찍는다. 첫 박동(30초 뒤)까지 표식이 없으면 그 틈에 두 번 눌려
  //   같은 컷에 파이프라인이 둘 뜬다(fal 원가 이중지출).
  // ★ finally 로 반드시 멈춘다 — 안 멈추면 끝난 실행이 계속 뛰어 잠금이 안 풀린다.
  const beatAt = Date.now();
  await updateProject(projectId, ownerId, (p) => reelProgress(p, "video", beatAt)).catch(() => {});
  const stopHeartbeat = startHeartbeat(projectId, ownerId, "video", {
    intervalMs: deps.heartbeatMs,
    patch: reelProgress,
    update: updateProject,
  });
  try {
  for (const [i, cut] of cuts.entries()) {
    // ★★ 2026-08-21 리뷰 N5 — 낡지 않은 완성 클립은 건너뛴다. 이게 없으면 재진입 잠금이
    //   막아도 성공해서 잠금이 풀린 **뒤에** 다시 누르면 전 컷이 fal 로 또 나가는데,
    //   살아 있는 청구가 있으면 requireVideoCharge 는 그냥 지나가 크레딧은 0 이다(순수
    //   이중지출). 판정은 화면과 같은 값 하나다(lib/reel/steps.js 의 isReelClipStale) —
    //   각인(clip_prompt·image.url)이 굽던 때와 같으면 다시 만들 이유가 없다.
    //   ⚠️ 낡은 컷을 다시 구울 때 돈을 받는 문제(단계별의 chargeRegen)는 이번 범위 밖이다
    //   — 제품 결정이라 최종 검토로 넘긴다. 지금은 순수 이중지출만 닫는다.
    if (cut.video?.url && !isReelClipStale(cut)) continue;
    const { refs } = await loadRefs(cut, project);
    const prompt = buildClipPrompt(cut, project, {
      body: cut.clip_prompt,
      sceneNo: i + 1,
      sceneCount: cuts.length,
      attach: "refs",
    });
    // ★★ 2026-08-25 — 컷 그림이 **두 갈래**다. 컷별로 그린 것은 fal CDN 주소지만,
    //   스토리보드에서 잘라낸 칸은 우리 비공개 버킷에 있다(lib/reel/storyboard.js).
    //   fal 은 그 주소를 못 읽으므로 바이트를 실어 보낸다 — 판정은 lib/refs-io.js 의
    //   toFalImageUrl 하나다(여기서 접두사를 손으로 적으면 규약이 두 벌이 된다).
    //   각인(video.imageOf)에는 **저장된 주소 그대로**를 적는다 — data URI 를 적으면
    //   각인이 매번 달라져 이미 구운 클립이 통째로 낡는다.
    const imageUrl = await toFalImageUrl(cut.image.url);
    const out = await makeClip({
      imageUrl,
      refs,
      seconds: cut.seconds,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      prompt,
      projectId,
      project,
    });
    const video = { url: out.url, seconds: out.seconds, of: cut.clip_prompt, imageOf: cut.image.url };
    // ★ 이 컷 하나만 병합한다 — p.cuts(저장 시점의 최신 값) 위에서 그 idx 만 덮는다.
    //   다른 컷(먼저 구운 것·아직 시도 전인 것)은 그대로 남는다.
    // ★ 컷을 저장할 때 박동도 함께 찍는다 — **쓰기가 늘지 않는다**(단계별 흐름의
    //   withProgress 와 같은 규약). 시각은 락 밖에서 잰다.
    const at = Date.now();
    await updateProject(projectId, ownerId, (p) =>
      reelProgress(
        { ...p, cuts: (p.cuts || []).map((c) => (c.idx === cut.idx ? { ...c, video } : c)) },
        "video",
        at
      )
    );
  }
  } finally {
    stopHeartbeat();
  }
}

// ── 통짜 굽기 (2026-08-25) ───────────────────────────────────────────────
//
// ★★ **스토리보드 한 장 + 프롬프트 하나 → r2v 한 번.** 15초 이하에서만 도는 길이다
//   (갈래 판정은 lib/reel/oneshot.js 의 planReelBake 하나 — 여기서 초를 다시 세지 않는다).
//
// ★ 새 장치를 만들지 않는다 — 굽는 것은 위 컷별과 **같은 generateClip** 이다. 다른 것은
//   무엇을 넘기느냐 하나다: 컷 그림이 아니라 **스토리보드 한 장을 참조로** 넘긴다
//   (r2v 는 `image_urls` 를 받고, 첫 프레임이 아니라 참조다 — lib/i2v.js).
// ★★ 호출이 **한 번**이라 assertBudget·addRecord 도 한 번이다(generateClip 이 호출마다
//   한 줄을 적는다). 정가·청구는 예전과 같은 자리(app/api/reel/[id]/clips/route.js)다.
//
// ★★ 결과 클립을 **첫 컷에만** 담는다. 왜 그 자리인가:
//   · lib/compose.js 는 `video.url` 이 있는 컷만 이어 붙인다(usable). 같은 클립을 컷마다
//     담으면 한 편이 컷 수만큼 반복돼 나간다 — 담을 수 있는 자리가 하나뿐이다.
//   · 그러면 ⑥완성(/render 의 composeVideo)과 보관함(lib/archive/video.js 의 reel 갈래 =
//     `doc.reel.video.url`)이 **손 안 대고** 그대로 돈다: 재료가 있는 컷이 하나뿐일 뿐이다.
//   · `whole: true` 를 적어 둔다 — "이 클립은 컷 하나가 아니라 한 편 전체다"를 문서에
//     남기는 유일한 채널이다(자막을 통짜 클립에 맞추는 작업이 이 표시를 읽을 자리다).
export async function runReelOneShot(projectId, ownerId, deps = {}) {
  const getProject = deps.getProject || getProjectImpl;
  const updateProject = deps.updateProject || updateProjectImpl;
  const makeClip = deps.makeClip || generateClip;
  const toFalUrl = deps.toFalUrl || toFalImageUrl;

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  // ★★ 문 앞에서 다 본다 — 값이 나가기 전이다.
  const plan = planReelBake(project);
  if (plan.mode !== "oneshot") throw new Error("스토리보드 한 장으로 만들 수 있는 영상이 아니에요");
  const body = reelWholePrompt(project);
  if (!body) throw new Error("영상 프롬프트를 먼저 만들어 주세요");

  const cuts = project.cuts;
  // 이미 구웠고 낡지 않았으면 다시 안 굽는다 — 살아 있는 청구가 있으면 requireVideoCharge 는
  // 그냥 지나가므로(크레딧 0), 이 검사가 없으면 다시 누를 때마다 fal 원가만 또 나간다
  // (컷별 갈래의 N5 건너뛰기와 같은 처방).
  if (cuts[0]?.video?.url && !isReelOneShotStale(project)) return;

  // ★★ 통짜는 **중간 저장이 아예 없다** — 한 번 굽는 데 몇 분이 걸리고 그 사이 문서에
  //   아무 일도 안 일어난다. 시계로 뛰는 이 박동이 없으면 정상으로 굽는 중인 실행이
  //   2분 뒤 화면에서 "멈췄어요"가 된다(그리고 굽기 문의 잠금도 함께 풀려 버린다).
  const beatAt = Date.now();
  await updateProject(projectId, ownerId, (p) => reelProgress(p, "video", beatAt)).catch(() => {});
  const stopHeartbeat = startHeartbeat(projectId, ownerId, "video", {
    intervalMs: deps.heartbeatMs,
    patch: reelProgress,
    update: updateProject,
  });
  try {
  const prompt = buildOneShotPrompt(plan.grid, plan.count, body);
  // 스토리보드는 fal 이 준 주소라 대개 그대로 읽힌다 — 우리 비공개 버킷에 있는 경우만
  // 바이트로 바뀐다. 판정은 lib/refs-io.js 의 toFalImageUrl 하나다.
  const sheetUrl = await toFalUrl(plan.sheet);
  const out = await makeClip({
    // ★ 첫 프레임이 **없다.** 스토리보드는 움직임의 출발 그림이 아니라 순서를 담은 참조다 —
    //   그것을 첫 프레임으로 주면 격자가 그대로 움직이는 분할 화면이 된다.
    imageUrl: null,
    refs: [{ url: sheetUrl }],
    seconds: plan.seconds,
    aspect_ratio: project.settings?.aspect_ratio || "9:16",
    prompt,
    projectId,
    project,
  });

  // 각인은 **저장된 주소·본문 그대로**다 — data URI 나 머리말을 적으면 각인이 매번 달라져
  // 이미 구운 편이 통째로 낡는다(컷별 갈래에서 이미 밟은 함정).
  const video = { url: out.url, seconds: out.seconds, of: body, imageOf: plan.sheet, whole: true };
  // ★★ 첫 컷에 담고 **나머지 컷의 옛 클립은 걷어낸다.** 걷지 않으면 lib/compose.js 가
  //   `video.url` 이 있는 컷을 전부 이어 붙여 완성본이 "한 편 + 옛 컷들"이 된다
  //   (컷별로 한 번 구운 뒤 통짜로 다시 굽는 프로젝트에서 실제로 그렇게 된다).
  //   ★ 컷 자체는 온전하다 — 문장·그림·초는 그대로 남는다(자막이 그것을 읽는다).
  const at = Date.now();
  await updateProject(projectId, ownerId, (p) =>
    reelProgress(
      {
        ...p,
        cuts: (p.cuts || []).map((c, i) => {
          if (i === 0) return { ...c, video };
          if (!c?.video) return c;
          const { video: _drop, ...rest } = c;
          return rest;
        }),
      },
      "video",
      at
    )
  );
  } finally {
    stopHeartbeat();
  }
}
