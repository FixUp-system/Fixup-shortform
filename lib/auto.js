// 자동 관통 — 빠른 생성이 단계별 파이프라인을 검토 게이트 없이 끝까지 민다.
// 단계 함수는 lib/pipeline.js 의 것을 무수정 재사용한다. 이 파일이 하는 일은 셋뿐이다:
// 게이트를 순서대로 눌러 주는 것, 실패 컷을 1회 재시도하고 강행하는 것, 진행을 auto 로 남기는 것.
//
// 실패 정책(스펙 확정): 재시도 1회 후 강행. VLM 물림(needs_attention)은 그대로 통과 —
// 이 저장소는 VLM 을 믿지 않는다(명백한 오류를 아홉 번 통과시켰다).
import { getProject, updateProject } from "./projects";
import { refundVideo } from "./charges.js";
import { extractBriefing } from "./briefing-extract";
import { generateScript } from "./script-gen";
import {
  runSplitPipeline, runVoicePipeline, runImagesPipeline, runVideoPipeline,
  runRenderPipeline, regenVoice, regenCut, regenClip,
} from "./pipeline";

const defaultDeps = {
  extractBriefing, generateScript,
  runSplitPipeline, runVoicePipeline, runImagesPipeline, runVideoPipeline, runRenderPipeline,
  regenVoice, regenCut, regenClip,
};

export async function runAutoPipeline(projectId, ownerId, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const setAuto = (patch) =>
    updateProject(projectId, ownerId, (p) => ({ ...p, auto: { ...p.auto, ...patch } }));
  // 실패 컷만 1회 재시도한다. regen 은 3회 상한을 스스로 세므로 여기서는 세지 않는다.
  // 재시도 실패는 삼킨다 — 강행이 정책이고, 남은 실패는 완성본에서 그 컷이 빠지는 것으로 나타난다.
  const retryEach = async (pred, regen) => {
    const project = await getProject(projectId, ownerId);
    for (const cut of project?.cuts || []) {
      if (pred(cut)) await regen(projectId, ownerId, cut.idx).catch((e) =>
        console.error(`[자동 ${projectId.slice(0, 8)}] 컷${cut.idx + 1} 재시도 실패:`, e?.message));
    }
  };

  try {
    // ① 브리핑 — 추출 후 자동 확정. asked 질문은 답 없이 두고 develop 라운드는 없다.
    await setAuto({ stage: "briefing", state: "running", error: null });
    let project = await getProject(projectId, ownerId);
    if (!project) throw new Error("프로젝트를 찾을 수 없어요");
    const briefing = await d.extractBriefing(project);
    if (!briefing) throw new Error("자료를 정리하지 못했어요");
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "briefing",
      briefing: { ...briefing, confirmed: true, version: 1 },
    }));

    // ② 대본 — 승인 없이 채택. 버전 부여는 script 라우트와 같은 규칙.
    await setAuto({ stage: "script" });
    project = await getProject(projectId, ownerId);
    const script = await d.generateScript(project, projectId);
    if (!script) throw new Error("대본 생성에 실패했어요");
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "script",
      script: { ...script, version: (p.script?.version || 0) + 1, briefing_version: p.briefing?.version || 1 },
    }));

    // ③ 컷 — 선저장(cuts 라우트와 같은 순서: status 를 먼저 세워야 화면 가드가 통과한다)
    await setAuto({ stage: "cuts" });
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "cuts", cuts: [], cuts_error: null,
      cuts_script_version: p.script?.version || 1,
    }));
    await d.runSplitPipeline(projectId, ownerId);
    project = await getProject(projectId, ownerId);
    if (!(project?.cuts || []).length) throw new Error("컷을 나누지 못했어요");

    // ④ 목소리 — voice_id 는 auto 라우트가 대화에서 받은 것을 이미 세워 두었다
    await setAuto({ stage: "voice" });
    await d.runVoicePipeline(projectId, ownerId);
    await retryEach((c) => c.voice_error, d.regenVoice);

    // ⑤ 이미지 — needs_attention 은 통과. 그림 자체가 없는 컷만 다시 산다.
    //    source:"photo" 컷은 생성 대상이 아니다(processCut 이 바로 done 으로 보낸다).
    await setAuto({ stage: "images" });
    await d.runImagesPipeline(projectId, ownerId);
    await retryEach((c) => c.source !== "photo" && !c.image?.url, d.regenCut);

    // ⑥ 클립 — 그림은 있는데 클립이 없는 컷만
    await setAuto({ stage: "clips" });
    await d.runVideoPipeline(projectId, ownerId);
    await retryEach((c) => c.image?.url && !c.video?.url, d.regenClip);

    // ⑦ 합성 — 클립 없는 컷은 합성이 이미 거른다(lib/compose.js 의 usable 필터).
    //    전부 없으면 합성을 부르지 않는다: 빈 완성본은 "결과가 나왔다"는 거짓말이다.
    project = await getProject(projectId, ownerId);
    if (!(project?.cuts || []).some((c) => c.video?.url)) {
      throw new Error("클립이 하나도 만들어지지 않았어요");
    }
    await setAuto({ stage: "render" });
    await d.runRenderPipeline(projectId, ownerId);

    await setAuto({ state: "done", error: null });
  } catch (e) {
    await setAuto({ state: "failed", error: e?.message || "자동 생성에 실패했어요" }).catch(() => {});
    // 완성본을 못 준 값은 되돌린다 — 지우지 않고 장부에 음수 행으로 남긴다.
    // 가짜 모드는 애초에 청구가 없어 refundVideo 가 조용히 지나간다.
    await refundVideo({ userId: ownerId, projectId }).catch((err) =>
      console.error(`[자동 ${projectId.slice(0, 8)}] 환불 실패:`, err?.message));
    throw e;
  }
}
