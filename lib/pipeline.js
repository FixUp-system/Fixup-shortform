// 컷 파이프라인 — 컷 분할 후 컷별 독립·병렬 이미지 생성 + VLM 선별. 실패는 컷 단위로 격리.
import path from "path";
import { getProject, updateProject } from "./projects";
import { callJson } from "./llm";
import { validateCutRanges, validateShows, validateCast, validateProps } from "./validate";
import { splitSentences, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt } from "./cuts";
import { buildCastMessages, mergePropsIntoCuts, resolveCastRefs, resolveCutRefs, mergeCastIntoCuts, availableAvatars, avatarFile } from "./cast";
import { generateImage } from "./imagegen";
import { selectCandidate, describePhoto } from "./vlm";
import { generateSpeech } from "./tts";
import { generateClip } from "./i2v";
import { composeVideo } from "./compose";
import { clipKey, renderKey } from "./steps.js";

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
      cuts = validateCutRanges(await callJson({ system: split.system, messages: split.messages, stage: "컷 분할", projectId: project.id }), sentences);
    }
    // 경계를 못 받으면 한 문장에 한 컷 — 분할은 실패해도 대본은 살아 있다
    if (!cuts) {
      cuts = validateCutRanges({ cuts: sentences.map((_, i) => ({ from: i + 1, to: i + 1 })) }, sentences);
    }

    // 사진 판정 — 올린 사진에 사람이 담겼는지 본다. 아직 안 본 사진만.
    const photos = [];
    for (const p of project.material?.photos || []) {
      const photoPath = uploadsPath(p.url);
      // 볼 파일이 없으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치를 이유가 없다
      if (p.vision || !photoPath) { photos.push(p); continue; }
      const vision = await describePhoto({ photoPath, projectId: project.id });
      photos.push({ ...p, vision });
    }

    // 화면 설계 — 컷마다 무엇을 보여줄지. 사람도 사진도 여기서 고르지 않는다.
    const shots = buildShowsMessages({ ...project, material: { ...project.material, photos } }, cuts);
    let designed = null;
    for (let i = 0; i < 2 && !designed; i++) {
      designed = validateShows(
        await callJson({ system: shots.system, messages: shots.messages, stage: "화면 설계", projectId: project.id }),
        cuts.length
      );
    }
    // 화면 설계가 실패해도 컷은 남는다 — 캐스팅은 문장으로라도 돈다
    const withShows = designed ? cuts.map((c, i) => ({ ...c, ...designed[i] })) : cuts;

    // 캐스팅 — 화면을 읽고 인물과 그 인물이 나오는 컷을 받는다.
    // 화면 설계 뒤에 도는 것이 요점이다: shows 에 "주인이 손님에게" 처럼 답이 적혀 있다.
    const avatars = await availableAvatars();
    // 사물 사진만 캐스팅에 넘긴다 — 인물 사진은 resolveCastRefs 가 인물에 붙인다.
    // 판정이 없는 사진은 사물로 본다: 모르는 것을 얼굴로 쓰지 않는 것이 인물 쪽 원칙이고,
    // 여기서는 그 반대편이라 "사람이라고 확인된 것만" 뺀다.
    const things = photos.filter((p) => !p.vision?.person).map((p) => ({ id: p.id, what: p.vision?.what || "" }));
    const thingIds = things.map((t) => t.id);
    // 초점이 물건이면 제품이 어느 컷에도 안 보인다는 답은 명백한 오답이다 — 그때만 다시 묻는다.
    const wantsThing = project.briefing?.focus?.mode === "물건" && things.length > 0;

    const { cast, props } = await (async () => {
      // 갈래가 '사람'일 때만 초점을 넘긴다 — 물건·정보 영상에 억지 주인공이 생기지 않게.
      const focus = project.briefing?.focus;
      const lead = focus?.mode === "사람" ? focus.subject : "";
      const msgs = buildCastMessages(withShows, avatars, lead, things);
      let last = { cast: [], props: [] };
      for (let i = 0; i < 2; i++) {
        try {
          const raw = await callJson({ system: msgs.system, messages: msgs.messages, stage: "캐스팅", projectId: project.id });
          const got = validateCast(raw, avatars.map((a) => a.id), withShows.length);
          const gotProps = validateProps(raw, thingIds, withShows.length);
          // 빈 답으로 앞선 답을 덮지 않는다 — 제품을 얻으려다 인물을 잃던 자리다.
          // validateCast 는 스키마만 맞으면 빈 배열을 주고, 빈 배열은 truthy 다.
          if (got?.length) last.cast = got;
          if (gotProps.length) last.props = gotProps;
          // 물건 영상인데 제품이 한 컷도 안 잡혔으면 한 번 더 — 그 외에는 첫 답을 쓴다
          if (got && !(wantsThing && last.props.length === 0)) break;
        } catch (e) {
          // 이 회차만 무효다. 앞 회차에서 얻은 것은 지킨다.
          console.error("캐스팅 실패:", e?.message);
        }
      }
      return last;
    })().catch(() => ({ cast: [], props: [] }));

    const castWithRefs = resolveCastRefs(cast, photos, avatars.map((a) => a.id));
    await updateProject(project.id, (proj) => ({
      ...proj,
      cast: castWithRefs,
      material: { ...proj.material, photos },
    }));

    // 제품이 몇 컷에 보이는지 남긴다 — 낱말로 세지 않고 캐스팅이 답한 컷 번호로 센다.
    // 지금은 막지 않는다: 표본이 모자라 임계를 감으로 박으면 거짓 경고가 유료 호출을 부른다.
    if (things.length) {
      const shown = new Set(props.flatMap((p) => p.cuts)).size;
      console.log(`[사물 ${project.id.slice(0, 8)}] 제품이 보이는 컷 ${shown}/${withShows.length}`);
    }

    // 사물을 먼저 꽂고 인물을 그 뒤에 꽂는다 — ref_ids 앞자리가 사물이어야 한다
    return mergeCastIntoCuts(mergePropsIntoCuts(withShows, props), castWithRefs);
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
  // 컷이 고른 레퍼런스를 실제 파일 경로로 푼다 — 경로를 아는 것은 이 자리뿐이다
  const refs = resolveCutRefs(cut, project)
    .map((r) => ({
      path: r.from === "photo"
        ? uploadsPath((project.material?.photos || []).find((p) => p.id === r.id)?.url)
        : avatarFile(r.id),
      kind: r.kind,
      who: r.who, // 첨부를 배역에 묶는 데 쓴다 — 익명으로 보내면 모델이 배역을 뒤바꾼다
    }))
    .filter((r) => r.path);
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
      let prompt = buildImagePrompt(cut, project, refs);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId }),
      ]);
      // 그림을 장면의 '보여줌'으로 그렸으니 심사도 같은 장면을 쥐고 해야 한다.
      // 검수는 레퍼런스 한 장만 봐도 된다 — 업로드 우선 정렬이라 사장님이 올린 것이 먼저다
      const verdict = await deps.select({
        cut,
        scene,
        candidates,
        refImagePath: refs[0]?.path,
        projectId,
      });
      if (verdict.passed) {
        await setCut({
          state: "done",
          // 이 그림이 무엇을 보고 그려졌는지 — 화면 설명을 고치면 이 값이 안 맞는다
          image: { url: candidates[verdict.selectedIndex].url, of: cut.shows || "" },
          vlm: { passed: true, note: verdict.note },
        });
        return;
      }
      note = verdict.note; // 자동 보정 재시도 (크레딧 개념 없음 — 비용기록만 쌓임)
    }
    await setCut({ state: "needs_attention", vlm: { passed: false, note } });
  } catch (e) {
    await setCut({ state: "needs_attention", vlm: { passed: false, note: e.message } });
  }
}

// 분할 — 원고를 컷으로 자르고 화면을 붙인다. OpenAI 만 쓰므로 fal 비용이 없다.
// 그래서 대본 승인에 이어 붙일 수 있고, 덕분에 목소리가 이미지 앞에 설 수 있다.
export async function runSplitPipeline(projectId, deps = defaultDeps) {
  const project = await getProject(projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 대본 필수 검증은 라우트(POST /cuts)에서 수행 — 주입 deps 테스트는 대본 없이 컷 분할 가능
  const cuts = await deps.splitCuts(project);
  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "cuts",
    cuts: cuts.map((c) => ({ ...c, state: "pending" })),
  }));
}

// 이미지 — 컷마다 후보 2장을 뽑아 VLM 이 고른다. 실패는 컷 단위로 격리된다.
// 컷이 이미 있고 낭독 길이가 확정된 뒤라는 전제다.
export async function runImagesPipeline(projectId, deps = defaultDeps) {
  const saved = await getProject(projectId);
  if (!saved) throw new Error("프로젝트를 찾을 수 없어요");
  await Promise.all(saved.cuts.map((cut) => processCut(projectId, cut, saved, deps)));
  // 컷 하나가 needs_attention 이어도 단계는 넘어간다 — 그 컷만 다시 만들 수 있어야 한다
  await updateProject(projectId, (proj) => ({ ...proj, status: "images" }));
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
        const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id, projectId });
        await updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) =>
            c.idx === cut.idx
              // 추정 seconds 를 실측으로 덮는다 — 여기가 이 파이프라인의 핵심이다
              ? { ...c, audio: { url, seconds, of: cut.sentence || "" }, seconds, voice_error: null }
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
    const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id, projectId });
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, audio: { url, seconds, of: cut.sentence || "" }, seconds, voice_error: null }
          : c
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
          imageUrl: cut.image.url, seconds: cut.seconds, aspect_ratio, projectId,
          prompt: buildClipPrompt(cut),
        });
        await setCut({ video: { url, seconds, truncated, of: clipKey(cut) }, video_error: null });
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
      prompt: buildClipPrompt(cut),
      projectId,
    });
    await updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, video: { url, seconds, truncated, of: clipKey(cut) }, video_error: null }
          : c
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

// ⑥완성 — 클립을 이어붙이고 소리와 자막을 얹는다.
// 실패해도 앞 단계 산출물은 그대로 남는다(합성만 다시 하면 된다).
export async function runRenderPipeline(projectId, deps = {}) {
  const compose = deps.compose || composeVideo;
  const project = await getProject(projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  const result = await compose({
    projectId,
    cuts: project.cuts || [],
    aspect_ratio: project.settings?.aspect_ratio || "9:16",
  });

  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "done",
    // 이 완성본이 어떤 소리·클립·문장으로 만들어졌는지 — 컷을 고치면 이 값이 안 맞는다
    render: { ...result, ts: Date.now(), of: renderKey(project) },
    render_error: null,
  }));
  return result;
}
