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
import { generateClip } from "../i2v.js";
import { isPromptsReady } from "./doc.js";
import { isReelClipStale } from "./steps.js";

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
    const out = await makeClip({
      imageUrl: cut.image.url,
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
    await updateProject(projectId, ownerId, (p) => ({
      ...p,
      cuts: (p.cuts || []).map((c) => (c.idx === cut.idx ? { ...c, video } : c)),
    }));
  }
}
