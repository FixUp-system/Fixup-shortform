// 컷 파이프라인 — 컷 분할 후 컷별 독립·병렬 이미지 생성 + VLM 선별. 실패는 컷 단위로 격리.
import path from "path";
import { getProject, updateProject } from "./projects";
import { callJson } from "./llm";
import { validateCuts } from "./validate";
import { buildCutsMessages, buildImagePrompt } from "./cuts";
import { generateImage } from "./imagegen";
import { selectCandidate } from "./vlm";

function uploadsPath(url) {
  // "/api/uploads/x.jpg" → 로컬 파일 경로
  const name = url?.split("/").pop();
  if (!name) return null;
  return path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads", name);
}

const defaultDeps = {
  splitCuts: async (project) => {
    const { system, messages } = buildCutsMessages(project);
    const photoIds = project.material.photos.map((p) => p.id);
    for (let i = 0; i < 2; i++) {
      const cuts = validateCuts(await callJson({ system, messages }), photoIds);
      if (cuts) return cuts;
    }
    throw new Error("컷 분할 실패");
  },
  genImage: generateImage,
  select: selectCandidate,
};

async function processCut(projectId, cut, project, deps) {
  // 갱신 직렬화는 updateProject 내부 프로젝트별 락이 담당 (PATCH 라우트와도 자동 직렬화)
  const setCut = (patch) =>
    updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)),
    }));

  if (cut.source === "photo") {
    await setCut({ state: "done" });
    return;
  }
  await setCut({ state: "generating" });
  const refPhoto = project.material.photos.find((p) => p.id === cut.ref_photo_id);
  const refImagePath = refPhoto ? uploadsPath(refPhoto.url) : undefined;

  try {
    let note = "";
    for (let round = 0; round < 2; round++) {
      let prompt = buildImagePrompt(cut, project);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
      ]);
      const verdict = await deps.select({ cut, candidates, refImagePath: refImagePath || undefined });
      if (verdict.passed) {
        await setCut({ state: "done", image: { url: candidates[verdict.selectedIndex].url }, vlm: { passed: true, note: verdict.note } });
        return;
      }
      note = verdict.note; // 자동 보정 재시도 (크레딧 개념 없음 — 비용기록만 쌓임)
    }
    await setCut({ state: "needs_attention", vlm: { passed: false, note } });
  } catch (e) {
    await setCut({ state: "needs_attention", vlm: { passed: false, note: e.message } });
  }
}

export async function runCutsPipeline(projectId, deps = defaultDeps) {
  const project = await getProject(projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 대본 필수 검증은 라우트(POST /cuts)에서 수행 — 주입 deps 테스트는 대본 없이 컷 분할 가능
  const cuts = await deps.splitCuts(project);
  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "cuts",
    cuts: cuts.map((c) => ({ ...c, state: "pending" })),
  }));
  const saved = await getProject(projectId);
  await Promise.all(saved.cuts.map((cut) => processCut(projectId, cut, saved, deps)));
}

// instruction: 사용자가 "이렇게 고쳐주세요"로 준 구체 지시(선택). 컷에 저장해 프롬프트에 강하게 반영한다.
export async function regenCut(projectId, idx, deps = defaultDeps, instruction = null) {
  const project = await getProject(projectId);
  const cut = project?.cuts?.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");
  // 3회 상한 판정·카운트 증가를 락 안(patchFn)에서 함께 수행 — TOCTOU 제거
  const note = typeof instruction === "string" && instruction.trim() ? instruction.trim() : null;
  let exceeded = false;
  await updateProject(projectId, (proj) => {
    const target = proj.cuts.find((c) => c.idx === idx);
    if (!target || target.regen_count >= 3) {
      exceeded = true;
      return proj;
    }
    return {
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, regen_count: c.regen_count + 1, ...(note ? { edit_instruction: note } : {}) }
          : c
      ),
    };
  });
  if (exceeded) throw new Error("재생성은 컷당 3회까지예요");
  const fresh = await getProject(projectId);
  await processCut(projectId, fresh.cuts.find((c) => c.idx === idx), fresh, deps);
  return (await getProject(projectId)).cuts.find((c) => c.idx === idx);
}
