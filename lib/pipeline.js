// 컷 파이프라인 — 컷 분할 후 컷별 독립·병렬 이미지 생성 + VLM 선별. 실패는 컷 단위로 격리.
import path from "path";
import { getProject, updateProject } from "./projects";
import { callJson } from "./llm";
import { validateCutRanges, validateShows } from "./validate";
import { splitSentences, buildSplitMessages, buildShowsMessages, buildImagePrompt } from "./cuts";
import { generateImage } from "./imagegen";
import { selectCandidate } from "./vlm";
import { generateSpeech } from "./tts";
import { generateClip } from "./i2v";

function uploadsPath(url) {
  // "/api/uploads/x.jpg" → 로컬 파일 경로
  const name = url?.split("/").pop();
  if (!name) return null;
  return path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads", name);
}

// export 하는 이유는 하나다 — splitCuts가 두 패스를 실제로 맞물리는 유일한 자리인데,
// 파이프라인 테스트는 전부 splitCuts를 주입해 우회한다.
//
// 1패스는 경계만 받아 코드가 원고를 자른다(승인된 문장이 글자 그대로 살아남는다).
// 2패스는 그 컷들에 화면을 붙인다. 2패스가 실패해도 컷은 남는다 —
// shows 없는 컷은 buildImagePrompt가 문장으로 폴백하므로 그림은 나온다(품질만 떨어진다).
export const defaultDeps = {
  splitCuts: async (project) => {
    const sentences = splitSentences(project.script?.text);
    if (sentences.length === 0) throw new Error("컷 분할 실패");

    const split = buildSplitMessages(sentences);
    let cuts = null;
    for (let i = 0; i < 2 && !cuts; i++) {
      cuts = validateCutRanges(await callJson({ system: split.system, messages: split.messages }), sentences);
    }
    // 경계를 못 받으면 한 문장에 한 컷 — 분할은 실패해도 대본은 살아 있다
    if (!cuts) {
      cuts = validateCutRanges({ cuts: sentences.map((_, i) => ({ from: i + 1, to: i + 1 })) }, sentences);
    }

    const photoIds = (project.material?.photos || []).map((p) => p.id);
    const shots = buildShowsMessages(project, cuts);
    let designed = null;
    for (let i = 0; i < 2 && !designed; i++) {
      designed = validateShows(
        await callJson({ system: shots.system, messages: shots.messages }),
        cuts.length,
        photoIds
      );
    }
    if (!designed) return cuts;
    return cuts.map((c, i) => ({ ...c, ...designed[i] }));
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
  // 화면 기준은 여기서 한 번만 정한다 — 그림(프롬프트)과 심사(VLM)가 갈라져 서로 다른 기준을
  // 보게 됐던 자리다. 조회식이 두 곳에 복제되면 그 결함이 그대로 재발한다.
  // 컷이 shows를 쥐므로 scene은 구성 시절 프로젝트의 폴백으로만 남는다.
  const scene = cut.shows
    ? { shows: cut.shows }
    : Number.isInteger(cut.scene_idx)
    ? project.synopsis?.scenes?.[cut.scene_idx]
    : null;

  try {
    let note = "";
    for (let round = 0; round < 2; round++) {
      let prompt = buildImagePrompt(cut, project);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
      ]);
      // 그림을 장면의 '보여줌'으로 그렸으니 심사도 같은 장면을 쥐고 해야 한다
      const verdict = await deps.select({
        cut,
        scene,
        candidates,
        refImagePath: refImagePath || undefined,
      });
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

// ④목소리 — 컷마다 문장을 읽힌다.
// 컷별로 나눠 읽는 이유는 길이를 알아야 하기 때문이다: 이 길이가 곧 클립 길이(⑤)이자
// 자막 타이밍(⑥)이 된다. 실패한 컷은 표시만 남기고 단계는 넘어간다 —
// 사장님이 그 컷만 다시 만들 수 있어야 하기 때문이다.
export async function runVoicePipeline(projectId, deps = {}) {
  const speak = deps.speak || generateSpeech;
  const project = await getProject(projectId);
  const cuts = project?.cuts || [];

  await Promise.all(
    cuts.map(async (cut) => {
      try {
        const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id });
        await updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) =>
            c.idx === cut.idx
              // 추정 seconds 를 실측으로 덮는다 — 여기가 이 파이프라인의 핵심이다
              ? { ...c, audio: { url, seconds }, seconds, voice_error: null }
              : c
          ),
        }));
      } catch (e) {
        await updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) =>
            c.idx === cut.idx ? { ...c, voice_error: e?.message || "읽지 못했어요" } : c
          ),
        })).catch(() => {});
      }
    })
  );

  await updateProject(projectId, (proj) => ({ ...proj, status: "voice" }));
}

// 컷 하나만 다시 읽는다 — 상한(3회)은 이미지 재생성과 같은 방식으로 락 안에서 센다
export async function regenVoice(projectId, idx, deps = {}) {
  const speak = deps.speak || generateSpeech;
  let exceeded = false;
  await updateProject(projectId, (proj) => {
    const target = proj.cuts?.find((c) => c.idx === idx);
    if (!target || (target.voice_regen_count || 0) >= 3) {
      exceeded = true;
      return proj;
    }
    return {
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx ? { ...c, voice_regen_count: (c.voice_regen_count || 0) + 1 } : c
      ),
    };
  });
  if (exceeded) throw new Error("목소리 다시 만들기는 컷당 3회까지예요");

  const project = await getProject(projectId);
  const cut = project.cuts.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");

  try {
    const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id });
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx ? { ...c, audio: { url, seconds }, seconds, voice_error: null } : c
      ),
    }));
  } catch (e) {
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === idx ? { ...c, voice_error: e?.message } : c)),
    })).catch(() => {});
    throw e;
  }
  return (await getProject(projectId)).cuts.find((c) => c.idx === idx);
}

// ⑤영상 — 컷 이미지를 시작 프레임으로 클립을 만든다.
// 길이는 ④에서 실측된 낭독 길이를 따르되, i2v 상한(10초)을 넘으면 잘린다.
// cut.seconds 는 덮어쓰지 않는다 — 소리가 13초인데 그림이 10초인 상태를 그대로 두고,
// 합성이 마지막 프레임 정지로 늘려 맞춘다.
export async function runVideoPipeline(projectId, deps = {}) {
  const clip = deps.clip || generateClip;
  const project = await getProject(projectId);
  const cuts = project?.cuts || [];
  const aspect_ratio = project?.settings?.aspect_ratio || "9:16";

  await Promise.all(
    cuts.map(async (cut) => {
      const setCut = (patch) =>
        updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)),
        }));

      // 이미지 단계에서 실패한 컷이 남아 있을 수 있다 — 없는 그림으로 클립을 부르지 않는다
      if (!cut.image?.url) {
        await setCut({ video_error: "이미지가 없어 클립을 만들지 못했어요" }).catch(() => {});
        return;
      }
      try {
        const { url, seconds, truncated } = await clip({
          imageUrl: cut.image.url, seconds: cut.seconds, aspect_ratio,
        });
        await setCut({ video: { url, seconds, truncated }, video_error: null });
      } catch (e) {
        await setCut({ video_error: e?.message || "클립을 만들지 못했어요" }).catch(() => {});
      }
    })
  );

  await updateProject(projectId, (proj) => ({ ...proj, status: "video" }));
}

// 컷 하나만 다시 만든다 — 상한 3회
export async function regenClip(projectId, idx, deps = {}) {
  const clip = deps.clip || generateClip;
  let exceeded = false;
  await updateProject(projectId, (proj) => {
    const target = proj.cuts?.find((c) => c.idx === idx);
    if (!target || (target.clip_regen_count || 0) >= 3) {
      exceeded = true;
      return proj;
    }
    return {
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx ? { ...c, clip_regen_count: (c.clip_regen_count || 0) + 1 } : c
      ),
    };
  });
  if (exceeded) throw new Error("영상 다시 만들기는 컷당 3회까지예요");

  const project = await getProject(projectId);
  const cut = project.cuts.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");
  if (!cut.image?.url) throw new Error("이미지가 없어 클립을 만들 수 없어요");

  try {
    const { url, seconds, truncated } = await clip({
      imageUrl: cut.image.url,
      seconds: cut.seconds,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
    });
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx ? { ...c, video: { url, seconds, truncated }, video_error: null } : c
      ),
    }));
  } catch (e) {
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === idx ? { ...c, video_error: e?.message } : c)),
    })).catch(() => {});
    throw e;
  }
  return (await getProject(projectId)).cuts.find((c) => c.idx === idx);
}
