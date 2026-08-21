// reel 배선 — **새 장치를 만들지 않는다.**
//
// ★ 시나리오는 lib/ad/scenario.js, 컷 분할은 lib/cuts.js, 이미지는 lib/imagegen.js,
//   참조 적재는 lib/cut-refs.js, 굽기는 lib/i2v.js, 합성·자막은 lib/compose.js 를
//   그대로 쓴다. 두 벌이 되면 어느 쪽이 진짜인지 아무도 모르게 된다
//   (lib/film/pipeline.js 가 356줄로 끝난 이유가 이것이다).
import { getProject as getProjectImpl, updateProject as updateProjectImpl } from "../projects.js";
import { writeClipPromptBody } from "./clip-prompt.js";

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
