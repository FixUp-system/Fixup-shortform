import { getProject, updateProject } from "../../../../../lib/projects";
import { runCutsPipeline } from "../../../../../lib/pipeline";
import { currentStepKey } from "../../../../../lib/steps";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.script) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });

  // 멱등 가드 — 이미 ④에 컷이 하나라도 있으면(만드는 중이든 다 됐든) 다시 띄우지 않는다.
  // 아래에서 cuts:[]를 선저장하므로, 막지 않으면 돈 주고 만든 컷·이미지가 그 자리에서 지워지고
  // 파이프라인이 한 벌 더 돈다(컷당 ≈$0.08). 컷이 비어 있는 경우(=분할 실패)는 다시 시도를 허용한다.
  if (currentStepKey(project) === "images" && (project.cuts || []).length > 0) {
    return Response.json(
      { error: "이미 만든 컷이 있어요 — ④ 이미지에서 확인해 주세요" },
      { status: 409 }
    );
  }

  // 파이프라인보다 먼저 ④이미지 단계를 세운다 — 응답 직후 화면이 이동해도 가드가 통과하고,
  // 컷이 비어 있는 동안은 이미지 화면이 "컷을 나누는 중"으로 폴링한다.
  await updateProject(id, (proj) => ({ ...proj, status: "cuts", cuts: [], cuts_error: null }));

  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (로컬 node 서버 전제. 배포 시 잡 큐 이관)
  runCutsPipeline(id).catch(async (e) => {
    console.error("pipeline error:", e);
    // 컷 분할이 죽으면 cuts가 영영 비어 있다 — 화면이 5분을 기다리지 않게 실패를 남긴다
    await updateProject(id, (proj) => ({
      ...proj,
      cuts_error: e?.message || "컷을 나누지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
