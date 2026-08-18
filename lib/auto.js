// 자동 관통 — 빠른 생성이 단계별 파이프라인을 검토 게이트 없이 끝까지 민다.
// 단계 함수는 lib/pipeline.js 의 것을 무수정 재사용한다. 이 파일이 하는 일은 셋뿐이다:
// 게이트를 순서대로 눌러 주는 것, 실패 컷을 1회 재시도하고 강행하는 것, 진행을 auto 로 남기는 것.
//
// 실패 정책(스펙 확정): 재시도 1회 후 강행. VLM 물림(needs_attention)은 그대로 통과 —
// 이 저장소는 VLM 을 믿지 않는다(명백한 오류를 아홉 번 통과시켰다).
import { getProject, updateProject } from "./projects";
import { refundVideo } from "./charges.js";
import { generateScenario } from "./scenario.js";
import { scenarioCutsKey } from "./steps.js";
import {
  runSplitPipeline, runVoicePipeline, runImagesPipeline, runVideoPipeline,
  runRenderPipeline, regenVoice, regenCut, regenClip,
} from "./pipeline";

const defaultDeps = {
  generateScenario,
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
    // ① 시나리오 — 만들고 그 자리에서 확정한다. 브리핑 추출과 대본 생성이 있던 두 자리다
    //    (2026-08-16). 시나리오가 자료를 직접 읽어 장면·대사·초를 내놓으므로 중간 산출물이
    //    필요 없어졌다. 사람이 보는 검토가 없는 경로라 **확정을 코드가 대신 찍는다** —
    //    단계별 흐름에서 그것은 사장님이 ②화면에서 누르는 자리다.
    await setAuto({ stage: "scenario", state: "running", error: null });
    let project = await getProject(projectId, ownerId);
    if (!project) throw new Error("프로젝트를 찾을 수 없어요");
    const { scenario, problems = [], photos } = await d.generateScenario(project);
    if (!scenario) throw new Error("시나리오를 만들지 못했어요");
    // ★ 규칙 위반이 남았으면 **여기서 멈춘다.** 단계별 흐름에서는 사장님이 화면에서 고쳐
    //   확정하지만(라우트가 확정을 막는다), 빠른 생성에는 그 자리가 없다 — 그냥 밀면
    //   초 합이 어긋난 시나리오가 그대로 컷이 되어 **주문한 길이와 다른 영상**이 나오고,
    //   "검토 없이 끝까지 만들어 준다"는 약속이 거짓이 된다. generateScenario 는 이미
    //   한 번 되물었으므로, 여기 남은 문제는 다시 부른다고 사라지는 것이 아니다.
    if (problems.length) throw new Error(`시나리오가 규칙에 맞지 않아요 — ${problems.join(" ")}`);
    await updateProject(projectId, ownerId, (p) => ({
      ...p, scenario: { ...scenario, confirmed: true },
      // ★ 시나리오가 읽은 사진값을 남긴다(2026-08-18) — 안 남기면 바로 뒤 컷 분할이 같은
      //   사진을 다시 읽어 사진당 값이 두 번 든다(splitCuts 는 이미 본 사진만 건너뛴다).
      ...(photos ? { material: { ...p.material, photos } } : {}),
    }));

    // ② 컷 — 선저장(cuts 라우트와 같은 순서: status 를 먼저 세워야 화면 가드가 통과한다)
    await setAuto({ stage: "cuts" });
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "cuts", cuts: [], cuts_error: null,
      // 어느 시나리오에서 나온 컷인지 각인한다 — 라우트(POST /cuts)와 같은 값이어야
      // 낡음 판정(areCutsStale)이 자동 관통으로 만든 컷을 곧바로 낡았다고 하지 않는다.
      cuts_scenario_of: scenarioCutsKey(p.scenario),
    }));
    await d.runSplitPipeline(projectId, ownerId);
    project = await getProject(projectId, ownerId);
    if (!(project?.cuts || []).length) throw new Error("컷을 나누지 못했어요");

    // ③ 목소리 — voice_id 는 auto 라우트가 대화에서 받은 것을 이미 세워 두었다
    await setAuto({ stage: "voice" });
    await d.runVoicePipeline(projectId, ownerId);
    await retryEach((c) => c.voice_error, d.regenVoice);

    // ④ 이미지 — needs_attention 은 통과. 그림 자체가 없는 컷만 다시 산다.
    //    source:"photo" 컷은 생성 대상이 아니다(processCut 이 바로 done 으로 보낸다).
    await setAuto({ stage: "images" });
    await d.runImagesPipeline(projectId, ownerId);
    await retryEach((c) => c.source !== "photo" && !c.image?.url, d.regenCut);

    // ⑤ 클립 — 그림은 있는데 클립이 없는 컷만
    await setAuto({ stage: "clips" });
    await d.runVideoPipeline(projectId, ownerId);
    await retryEach((c) => c.image?.url && !c.video?.url, d.regenClip);

    // ⑥ 합성 — 클립 없는 컷은 합성이 이미 거른다(lib/compose.js 의 usable 필터).
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
