// 컷 파이프라인 — 컷 분할 후 컷별 독립·병렬 이미지 생성 + VLM 선별. 실패는 컷 단위로 격리.
import { getProject, updateProject } from "./projects";
import { callJson } from "./llm";
import { validateShows, validateCast, validateProps } from "./validate";
import { shotsToCuts, buildShowsMessages, buildImagePrompt, buildClipPrompt, CONTENT_MAX_SECONDS } from "./cuts";
import { buildCastMessages, mergePropsIntoCuts, resolveCastRefs, resolveCutRefs, mergeCastIntoCuts, availableAvatars } from "./cast";
import { generateImage, imageResolutionFor } from "./imagegen";
import { selectCandidate, describePhoto } from "./vlm";
import { generateSpeech } from "./tts";
import { generateClip } from "./i2v";
import { composeVideo, burnSubtitles } from "./compose";
import { clipKey, renderKey, renderKeyBody, subtitleHead, isClipStale, toneKey, imageContextKey } from "./steps.js";
import { styleKey } from "./styles.js";
import { speedContrast } from "./speeds.js";
import { shotBalance } from "./shots.js";
import { motionVariety } from "./motion.js";
import { readRefBytes } from "./refs-io.js";
import { isCutDone } from "./progress.js";
import { AVATARS } from "./refs.js";
// 재생성 상한. 라우트가 청구 앞에서 같은 값을 본다 — 숫자를 두 군데 두지 않는다.
import { MAX_REGEN_PER_CUT } from "./pricing.js";
// 클립이 직접 말하는 프로젝트인가 — 목소리 파이프라인이 이 판정으로 통째로 비켜선다.
import { projectSpeaks } from "./clip-limits.js";

// export 하는 이유는 하나다 — splitCuts가 두 패스를 실제로 맞물리는 유일한 자리인데,
// 파이프라인 테스트는 전부 splitCuts를 주입해 우회한다.
//
// 1패스는 시나리오의 장면을 컷으로 옮긴다(사장님이 화면에서 승인한 그대로 — 코드가 옮긴다).
// 2패스는 그 컷들에 화면을 붙인다. 2패스가 실패해도 컷은 남는다 —
// shows 없는 컷은 buildImagePrompt가 문장으로 폴백하므로 그림은 나온다(품질만 떨어진다).
export const defaultDeps = {
  splitCuts: async (project, ownerId) => {
    // ★ 시나리오가 컷의 원본이다(2026-08-16). 원고를 잘라 만들던 자리다.
    //   시나리오가 컷과 그 초를 **화면에서 사장님이 보고 확정한 값**으로 이미 정했으므로
    //   splitUnits·validateCutRanges·explodeLongRanges·fillSilentCuts·allocateCutSeconds 를
    //   이 경로에서 쓰지 않는다 — 다시 자르거나 다시 배분하면 승인한 것과 달라진다.
    const scenario = project?.scenario;
    // 사장님 화면에 그대로 뜨는 문구다(cuts_error) — "컷 분할 실패"는 무엇을 해야 할지를 안 알려 준다.
    if (!scenario?.shots?.length) throw new Error("시나리오가 없어요");
    let cuts = shotsToCuts(scenario);
    // beat·speaker 는 컷에 저장하지 않는다(shotsToCuts 머리말 참고) — 여기서 지문에만 싣는다.
    const beats = scenario.shots.map((s) => s?.beat || "");
    const speakers = scenario.shots.map((s) => s?.speaker || "");

    // 컷이 얼마나 긴지 남긴다. 막지는 않는다 — 시나리오가 이미 길이 관문을 통과했다.
    const over = cuts.filter((c) => c.seconds > CONTENT_MAX_SECONDS).length;
    console.log(`[분할 ${project.id.slice(0, 8)}] 시나리오 장면 ${cuts.length}개 → 컷 ${cuts.length}개 · 8초 초과 ${over}개`);

    // 사진 판정 — 올린 사진에 사람이 담겼는지 본다. 아직 안 본 사진만.
    const photos = [];
    for (const p of project.material?.photos || []) {
      const key = p.url?.split("/").pop();
      if (p.vision || !key) { photos.push(p); continue; }
      const photoBytes = await readRefBytes({ source: "upload", key });
      // 볼 파일이 없으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치를 이유가 없다
      if (!photoBytes) { photos.push(p); continue; }
      const vision = await describePhoto({ photoBytes, photoKey: key, projectId: project.id });
      // 판정이 성공했을 때만 저장한다. 사람도 아니고 무엇인지도 못 알아낸 답(실패)은
      // 저장하면 그 결과가 굳어 다음 실행이 다시 보지 않는다 — 실패는 흘려보낸다.
      // { person:false, what:"화장품 병" } 처럼 사람이 아니라고 "알아낸" 것은 성공이다.
      const judged = vision.person || vision.what;
      photos.push(judged ? { ...p, vision } : p);
    }

    // 화면 설계 — 컷마다 무엇을 보여줄지. 사람도 사진도 여기서 고르지 않는다.
    // 시나리오가 정한 전달 방식(angle)과 장면이 하는 일(beat)을 함께 넘긴다 —
    // 이것이 없으면 화면 설계가 컷마다 딴 이야기를 만들고, 대사의 삽화가 된다.
    const shots = buildShowsMessages(
      { ...project, material: { ...project.material, photos } },
      cuts,
      { angle: scenario.angle, beats }
    );
    // 코드가 셋을 판정하고, 어긋나면 사유를 주고 한 번 더 부른다.
    //  ① 속도 대비 — 전 컷이 같은 속도면 늘어진다
    //  ② 샷 분포 — 클로즈업이 절반을 넘으면 제품에 붙어 카탈로그가 된다
    //  ③ 축 쏠림 — 전 컷이 카메라만(혹은 피사체만) 움직이면 단조롭다
    // 판정만 하고 강제하지 않으면 안 된다 — 이 저장소가 컷 길이에서 이미 겪었다.
    //
    // 다만 어긋난다고 화면 설계를 버리지는 않는다: 아쉬운 화면이 화면 없는 것보다 낫고,
    // 사장님이 ②대본에서 손으로 고칠 수 있다. 그래서 마지막 응답은 판정과 무관하게 받는다.
    let designed = null;
    let redoReason = null;
    for (let i = 0; i < 2; i++) {
      const msgs = redoReason
        ? [...shots.messages, { role: "user", content: `[다시] ${redoReason}\n같은 형식으로 전부 다시 낸다.` }]
        : shots.messages;
      const got = validateShows(
        await callJson({ system: shots.system, messages: msgs, stage: "화면 설계", projectId: project.id }),
        cuts.length
      );
      if (got) designed = got; // 형식이 맞은 마지막 응답을 쥔다
      if (!got) { redoReason = "형식이 맞지 않았다"; continue; }
      // 샷 분포를 먼저 본다 — 화면이 무엇을 담는지가 속도보다 앞이다
      const shot = shotBalance(got);
      const speed = speedContrast(got);
      const move = motionVariety(got);
      if (shot.ok && speed.ok && move.ok) { redoReason = null; break; }
      redoReason = [shot.reason, speed.reason, move.reason].filter(Boolean).join(" 그리고 ");
    }
    if (designed && redoReason) {
      console.warn(`[화면 ${project.id.slice(0, 8)}] 판정 미달로 남았다 — ${redoReason}`);
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
    // ★ 초점은 시나리오가 답한다 — 브리핑을 보던 자리다(아래 lead 와 **둘**이었다).
    //   한쪽만 옮기면 제품 재질문이 영영 안 걸리거나 주인공이 사라진다.
    const wantsThing = scenario.focus?.mode === "물건" && things.length > 0;

    const { cast, props } = await (async () => {
      // 갈래가 '사람'일 때만 초점을 넘긴다 — 물건·정보 영상에 억지 주인공이 생기지 않게.
      const focus = scenario.focus;
      const lead = focus?.mode === "사람" ? focus.subject : "";
      // 시나리오가 컷마다 정한 화자를 함께 넘긴다 — 화면 설명만 보고 뽑으면 말하는 사람이
      // 빠지고, 그러면 그 대사가 소리로 안 나온다(projectSpeaks 가 그 자리에서 떨어진다).
      const msgs = buildCastMessages(withShows, avatars, lead, things, { speakers });
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
    await updateProject(project.id, ownerId, (proj) => ({
      ...proj,
      cast: castWithRefs,
      material: { ...proj.material, photos },
    }));

    // 사물 사진이 몇 컷에 붙었는지 남긴다 — 낱말로 세지 않고 캐스팅이 답한 컷 번호로 센다.
    // "제품이 보이는 컷"이라 쓰지 않는다: 사물 사진이 꼭 제품이라는 보장이 없다.
    // 지금은 막지 않는다: 표본이 모자라 임계를 감으로 박으면 거짓 경고가 유료 호출을 부른다.
    if (things.length) {
      const shown = new Set(props.flatMap((p) => p.cuts)).size;
      // 한 컷에 사물이 둘 이상 몰린 컷 수도 함께 남긴다 — 사진이 여러 장일 때 어느 사진이
      // 사물 자리(resolveCutRefs 의 things[0])를 차지하는지가 아직 미해결이라, 실측 표본을
      // 쌓아 두려는 것이다.
      const perCut = new Map();
      for (const p of props) for (const idx of p.cuts || []) perCut.set(idx, (perCut.get(idx) || 0) + 1);
      const crowded = [...perCut.values()].filter((n) => n > 1).length;
      console.log(`[사물 ${project.id.slice(0, 8)}] 사물 사진이 붙은 컷 ${shown}/${withShows.length} (사물 2개 이상 몰린 컷 ${crowded}개)`);
    }

    // 사물을 먼저 꽂고 인물을 그 뒤에 꽂는다 — ref_ids 앞자리가 사물이어야 한다
    return mergeCastIntoCuts(mergePropsIntoCuts(withShows, props), castWithRefs);
  },
  genImage: generateImage,
  select: selectCandidate,
};

// ── 심장박동 ────────────────────────────────────────────────────────────────
//
// 왜 필요한가: 생성 라우트는 파이프라인을 await 하지 않고 응답한다(서버리스에서 응답을
// 먼저 돌려줘야 하기 때문이다). 그래서 응답 뒤 함수가 얼면 catch 조차 돌지 않고 컷이
// generating 인 채로 남는다 — 오류 필드도 비어 있어 화면에서 보면 "영원히 만드는 중"이다.
//
// 파이프라인이 컷마다 이미 저장을 하므로, 그 저장에 "언제·어느 단계·몇 개째"를 얹는다.
// **쓰기 횟수는 늘지 않는다.** 진척이 멈추면 그것이 곧 죽었다는 신호다.
//
// ★ at 은 이 함수 밖에서 받는다. updateProject 는 낙관적 락이라 CAS 에 지면 같은 patchFn 을
//   다시 부른다(lib/projects.js) — patchFn 안에서 Date.now() 를 부르면 시도마다 값이 달라져
//   "부작용 없는 patchFn" 규약이 깨진다.
//
// ★ done 은 밖에서 세어 넘기지 않고 **문서에서 판다.** 밖에서 세면 CAS 재시도로 문서가
//   바뀌었을 때 옛 숫자가 저장된다. 파생값은 파생값답게 그 자리에서 만든다.
//
// ★ 끝남 판정은 여기 두지 않고 lib/progress.js 한 벌을 쓴다 — 화면도 같은 자로 세야 한다.
//
// ★ 규약: **컷을 건드리는 저장을 새로 만들면 반드시 withProgress 로 감싼다** —
//   안 감싸면 그 자리에서 표식이 안 찍혀, 진척이 멈춘 것처럼 읽힌다.
export function withProgress(proj, phase, at) {
  const cuts = proj?.cuts || [];
  return {
    ...proj,
    progress: {
      at,
      phase,
      done: cuts.filter((c) => isCutDone(c, phase)).length,
      total: cuts.length,
    },
  };
}

async function processCut(projectId, ownerId, cut, project, deps) {
  // ★ 이 자리가 통째로 직렬인 것은 아니다 — 컷들의 AI 호출은 여전히 동시에 돈다.
  // 줄을 서는 것은 아래 setCut 의 **저장뿐**이다(2026-07-31, lib/projects.js 의 writeQueues).
  // 한 프로세스 안에서 같은 프로젝트의 저장은 하나씩 나가므로 여기서 나던 충돌이 0이 됐다
  // (실측: 컷 12개에서 진 횟수 28 → 0).
  //
  // 그 줄은 **정확성의 근거가 아니다.** 프로세스가 여럿이면 서로의 줄을 모른다 —
  // 그때 갱신 유실을 막는 것은 여전히 낙관적 재시도다: 읽은 버전이 그대로면 쓰고,
  // 남이 먼저 썼으면 다시 읽어 최대 5회까지 시도한다. 5회 안에 못 이기면 이 갱신은
  // 던진다(조용히 사라지지는 않는다).
  // patchFn 이 동기 순수 함수여야 하는 이유도 이것이다 — 재시도마다 다시 불린다.
  const setCut = (patch) => {
    // 시각은 락 밖에서 잰다 — 위 withProgress 주석 참고
    const at = Date.now();
    return updateProject(projectId, ownerId, (proj) =>
      withProgress(
        { ...proj, cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)) },
        "images",
        at
      )
    );
  };

  if (cut.source === "photo") {
    await setCut({ state: "done" });
    return;
  }
  await setCut({ state: "generating" });
  // 컷이 고른 레퍼런스를 출처와 키로 푼다 — 어디서 읽을지는 lib/refs-io.js 가 안다.
  // 바이트를 여기서 미리 읽는 이유: 그림(프롬프트)과 심사(VLM)가 같은 것을 봐야 하고,
  // 두 번 읽으면 그 사이에 달라질 수 있다.
  const resolved = resolveCutRefs(cut, project).map((r) => ({
    kind: r.kind,
    who: r.who, // 첨부를 배역에 묶는 데 쓴다 — 익명으로 보내면 모델이 배역을 뒤바꾼다
    source: r.from === "photo" ? "upload" : "avatar",
    key:
      r.from === "photo"
        ? (project.material?.photos || []).find((p) => p.id === r.id)?.url?.split("/").pop()
        : (AVATARS.find((a) => a.id === r.id) || {}).file,
  }));
  // 못 얻은 레퍼런스는 버리되 **조용히 버리지는 않는다.**
  //
  // ★ readRefBytes 는 모든 실패를 null 로 뭉갠다(Storage 장애·env 누락·권한). 그리고
  // 여기 아래에서 컷당 $0.08 짜리 생성이 그대로 나간다 — 사장님이 올린 제품 사진 없이.
  // 바뀌기 전 `.filter(r => r.path)` 는 **모르는 아바타 id 일 때만** 버렸지 I/O 실패로는
  // 절대 안 버렸으니, "뜻이 유지된다"는 말은 사실이 아니었다.
  // 막지는 않는다(레퍼런스 없이도 그림은 나와야 한다는 것이 이 저장소의 결정이다).
  // 다만 몇 장 중 몇 장이 실렸는지가 로그에 남아야 한다 — 측정 스크립트와 같은 문구다.
  const refs = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    if (bytes) refs.push({ ...r, bytes });
    else console.error(`⚠️ 레퍼런스를 못 읽었다: ${r.source}/${r.key || "(키 없음)"} — 컷${cut.idx + 1}은 그것 없이 그려진다`);
  }
  if (resolved.length && refs.length < resolved.length) {
    console.error(`⚠️⚠️ 컷${cut.idx + 1} 레퍼런스 ${resolved.length}장 중 ${refs.length}장만 실렸다 — 그대로 유료 생성이 나간다($0.08).`);
    console.error(`     업로드는 Storage 에 있다. SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 확인할 것.`);
  }
  // 화면 기준은 여기서 한 번만 정한다 — 그림(프롬프트)과 심사(VLM)가 갈라져 서로 다른 기준을
  // 보게 됐던 자리다. 조회식이 두 곳에 복제되면 그 결함이 그대로 재발한다.
  // 컷이 shows를 쥐므로 scene은 구성 시절 프로젝트의 폴백으로만 남는다.
  const scene = cut.shows
    ? { shows: cut.shows }
    : Number.isInteger(cut.scene_idx)
    ? project.synopsis?.scenes?.[cut.scene_idx]
    : null;

  // 값을 치른 그림은 **판정과 무관하게 남긴다.**
  //
  // ★ 실측(2026-07-31): 검수가 400 으로 던지면서 아래 catch 로 빠졌고, 방금 $0.08 을 치른
  // 그림이 프로젝트에 안 남았다. 화면에는 옛 그림이 그대로여서 "다시 만들기를 눌렀는데
  // 아무것도 안 변했다"로 보였다(실제로 그렇게 헷갈렸다). fal 에는 남아 있고 비용 기록에
  // URL 도 있었지만 화면에서 닿을 방법이 없었다 — 조용한 실패에 돈까지 붙은 모양이다.
  //
  // 검수가 **물린 것**과 **답을 못 한 것**을 구분한다:
  //   passed=false → 판정이 있다(그림이 나쁘다)
  //   passed=null  → 판정이 없다(검수가 죽었다) — 그림에 대해 아는 것이 없다
  // 어느 쪽이든 state 는 needs_attention 이라 사장님이 보고 정한다. 이 저장소는 VLM 을
  // 믿지 않는다(아홉 번 통과시켰다) — 물렸다고 그림을 버릴 근거가 그만큼 약하다.
  let bought = null;
  const engraved = (url) => {
    // 무대·인물 외형·제품 외형 — 프롬프트에 실린 그대로 각인한다(lib/steps.js
    // imageContextKey). 여기서 안 찍으면 판정만 있고 찍는 쪽이 없어, 방금 산 그림이
    // 저장되자마자 낡음이 되어 ④화면이 그 자리에서 재구매를 권한다.
    const base = { url, of: cut.shows || "", style_of: styleKey(project), context_of: imageContextKey(cut, project) };
    // 빈 각인은 안 붙인다 — undefined 가 아니게 되는 순간 판정에 들어와,
    // 진행 중인 옛 프로젝트가 전부 낡음으로 뒤집힌다.
    const tk = toneKey(cut);
    return tk ? { ...base, tone_of: tk } : base;
  };
  try {
    let note = "";
    for (let round = 0; round < 2; round++) {
      let prompt = buildImagePrompt(cut, project, refs);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      // 컷당 한 장. 예전에는 후보 2장을 뽑아 VLM 이 골랐는데, 모델을 한 세대 올리면서
      // 장수를 줄여 컷당 값을 그대로 뒀다($0.04×2 → $0.08×1).
      // 배열로 두는 이유는 검수(deps.select)와 아래 선택 코드를 그대로 쓰기 위해서다.
      const candidates = [
        // ★ 해상도는 영상 화질을 따라간다(lib/imagegen.js 의 imageResolutionFor) —
        //   이 그림이 클립의 첫 프레임이라 둘이 어긋나면 손해가 양쪽으로 난다.
        await deps.genImage({
          prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId,
          resolution: imageResolutionFor(project),
        }),
      ];
      // 값은 여기서 이미 나갔다 — 검수를 부르기 **전에** 쥔다.
      bought = candidates[candidates.length - 1]?.url || bought;
      // 그림을 장면의 '보여줌'으로 그렸으니 심사도 같은 장면을 쥐고 해야 한다.
      // 검수는 레퍼런스 한 장만 봐도 된다 — 업로드 우선 정렬이라 사장님이 올린 것이 먼저다
      const verdict = await deps.select({
        cut,
        scene,
        candidates,
        refImage: refs[0] || null,
        projectId,
      });
      if (verdict.passed) {
        await setCut({
          state: "done",
          // 이 그림이 무엇을 보고 그려졌는지 — 화면 설명을 고치면 이 값이 안 맞는다.
          // 화풍은 컷 밖(settings)에 있어 따로 각인한다. 한 필드에 합치면 화풍을 도입하기
          // 전에 만든 그림의 각인이 전부 불일치가 되어 옛 프로젝트가 통째로 낡는다.
          image: engraved(candidates[verdict.selectedIndex].url),
          vlm: { passed: true, note: verdict.note },
        });
        return;
      }
      note = verdict.note; // 자동 보정 재시도 (크레딧 개념 없음 — 비용기록만 쌓임)
    }
    await setCut({
      state: "needs_attention",
      vlm: { passed: false, note },
      ...(bought ? { image: engraved(bought) } : {}),
    });
  } catch (e) {
    // 그림 생성 자체가 죽었으면 bought 가 비어 남길 것이 없다 — 그때만 옛 그림이 남는다.
    await setCut({
      state: "needs_attention",
      vlm: { passed: bought ? null : false, note: bought ? `검수를 못 했다 — ${e.message}` : e.message },
      ...(bought ? { image: engraved(bought) } : {}),
    });
  }
}

// 분할 — 원고를 컷으로 자르고 화면을 붙인다. OpenAI 만 쓰므로 fal 비용이 없다.
// 그래서 대본 승인에 이어 붙일 수 있고, 덕분에 목소리가 이미지 앞에 설 수 있다.
export async function runSplitPipeline(projectId, ownerId, deps = defaultDeps) {
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 대본 필수 검증은 라우트(POST /cuts)에서 수행 — 주입 deps 테스트는 대본 없이 컷 분할 가능
  const cuts = await deps.splitCuts(project, ownerId);
  await updateProject(projectId, ownerId, (proj) => ({
    ...proj,
    status: "cuts",
    cuts: cuts.map((c) => ({ ...c, state: "pending" })),
  }));
}

// 이미지 — 컷마다 후보 2장을 뽑아 VLM 이 고른다. 실패는 컷 단위로 격리된다.
// 컷이 이미 있고 낭독 길이가 확정된 뒤라는 전제다.
export async function runImagesPipeline(projectId, ownerId, deps = defaultDeps) {
  const saved = await getProject(projectId, ownerId);
  if (!saved) throw new Error("프로젝트를 찾을 수 없어요");
  await Promise.all(saved.cuts.map((cut) => processCut(projectId, ownerId, cut, saved, deps)));
  // 컷 하나가 needs_attention 이어도 단계는 넘어간다 — 그 컷만 다시 만들 수 있어야 한다
  await updateProject(projectId, ownerId, (proj) => ({ ...proj, status: "images" }));
}

// instruction: 사용자가 "이렇게 고쳐주세요"로 준 구체 지시(선택). 컷에 저장해 프롬프트에 강하게 반영한다.
export async function regenCut(projectId, ownerId, idx, deps = defaultDeps, instruction = null) {
  const project = await getProject(projectId, ownerId);
  const cut = project?.cuts?.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");
  // 3회 상한 판정·카운트 증가를 락 안(patchFn)에서 함께 수행 — TOCTOU 제거
  const note = typeof instruction === "string" && instruction.trim() ? instruction.trim() : null;
  let exceeded = false;
  await updateProject(projectId, ownerId, (proj) => {
    // ★ 시도마다 초기화한다. updateProject 는 낙관적 락이라 CAS 에 지면 같은 patchFn 을
    // 다시 부르는데, 이 변수가 래치로 남으면 **버려진 시도가 세운 true** 가 다음 시도까지
    // 살아남는다. 그러면 재시도가 성공해 카운트를 올려놓고도 오류를 던진다.
    exceeded = false;
    const target = proj.cuts.find((c) => c.idx === idx);
    if (!target || target.regen_count >= MAX_REGEN_PER_CUT) {
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
  const fresh = await getProject(projectId, ownerId);
  await processCut(projectId, ownerId, fresh.cuts.find((c) => c.idx === idx), fresh, deps);
  return (await getProject(projectId, ownerId)).cuts.find((c) => c.idx === idx);
}

// ④목소리 — 컷마다 문장을 읽힌다.
// 컷별로 나눠 읽는 이유는 길이를 알아야 하기 때문이다: 이 길이가 곧 클립 길이(⑤)이자
// 자막 타이밍(⑥)이 된다. 실패한 컷은 표시만 남기고 단계는 넘어간다 —
// 사장님이 그 컷만 다시 만들 수 있어야 하기 때문이다.
export async function runVoicePipeline(projectId, ownerId, deps = {}) {
  const speak = deps.speak || generateSpeech;
  const project = await getProject(projectId, ownerId);
  const cuts = project?.cuts || [];

  // ★ 말하는 모델에서는 클립이 목소리를 만든다 — 여기서 또 만들면 소리가 두 겹이 된다.
  // 합성은 컷 단위로 판정해서 audio 가 있으면 그것을 쓰므로(lib/compose.js), 소리를 만들면
  // 화면은 클립 입모양인데 들리는 소리는 TTS 가 되어 립싱크가 어긋난다.
  //
  // 단계를 없애지 않는 이유는 Kling·LTX 경로가 그대로 쓰기 때문이다.
  // status 는 그대로 올린다 — 그것이 다음 화면(④이미지)이 열리는 유일한 신호다(lib/steps.js).
  if (projectSpeaks(project)) {
    await updateProject(projectId, ownerId, (proj) => ({ ...proj, status: "voice" }));
    return;
  }

  await Promise.all(
    cuts.map(async (cut) => {
      // 무음 컷은 읽을 것이 없다 — 빈 문자열을 TTS 에 보내면 값만 나가고 소리가 안 온다
      if (cut?.silent || !String(cut?.sentence || "").trim()) return;
      try {
        const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id, projectId });
        // 분할이 쓴 8초는 추정(초당 5.5자)이고 이것이 실측이다. 얼마나 어긋나는지 남긴다.
        // 여기서 컷을 쪼개지는 않는다 — 이 시점엔 소리를 이미 샀고, 쪼개면 그것을 버리고
        // 유료로 다시 사야 한다. 추정이 얼마나 맞는지를 먼저 재고 그 수치로 다음을 정한다.
        if (seconds > CONTENT_MAX_SECONDS) {
          console.log(`[목소리 ${projectId.slice(0, 8)}] 추정 ${cut.seconds}초 → 실측 ${seconds}초 (컷${cut.idx + 1})`);
        }
        // 시각은 락 밖에서 잰다 — withProgress 주석 참고
        const at = Date.now();
        await updateProject(projectId, ownerId, (proj) =>
          withProgress({
            ...proj,
            cuts: proj.cuts.map((c) =>
              c.idx === cut.idx
                ? {
                    ...c,
                    audio: { url, seconds, of: cut.sentence || "" },
                    // ★ 실측이 덮는 것은 **말하는 시간**이다(2026-08-14).
                    //   화면에 있는 시간(seconds)은 allocateCutSeconds 가 정한 값이라 지킨다 —
                    //   여기서 덮으면 배분된 여백이 통째로 사라지고 영상이 다시 원고 길이가 된다.
                    //   다만 말이 화면 시간보다 길면 화면 시간이 따라 올라간다. 말은 자르지 않는다.
                    spoken_seconds: seconds,
                    seconds: Math.max(Number(c.seconds) || 0, seconds),
                    voice_error: null,
                  }
                : c
            ),
          }, "voice", at)
        );
      } catch (e) {
        const at = Date.now();
        await updateProject(projectId, ownerId, (proj) =>
          withProgress({
            ...proj,
            cuts: proj.cuts.map((c) =>
              c.idx === cut.idx ? { ...c, voice_error: e?.message || "읽지 못했어요" } : c
            ),
          }, "voice", at)
        ).catch(() => {});
      }
    })
  );

  await updateProject(projectId, ownerId, (proj) => ({ ...proj, status: "voice" }));
}

// 컷 하나만 다시 읽는다 — 상한(3회)은 이미지 재생성과 같은 방식으로 락 안에서 센다.
// ★ 여기는 일부러 심장박동(withProgress)을 안 찍는다 — 낭독을 넣으면서 voice_error 를 같은
//   patch 에서 지우므로 done 이 중간에 내려앉을 수 없고, 파이프라인 진척과도 무관하다.
export async function regenVoice(projectId, ownerId, idx, deps = {}) {
  const speak = deps.speak || generateSpeech;
  let exceeded = false;
  await updateProject(projectId, ownerId, (proj) => {
    exceeded = false; // 재시도마다 초기화 — regenCut 과 같은 이유(낙관적 락의 버려진 시도)
    const target = proj.cuts?.find((c) => c.idx === idx);
    if (!target || (target.voice_regen_count || 0) >= MAX_REGEN_PER_CUT) {
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

  const project = await getProject(projectId, ownerId);
  const cut = project.cuts.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");

  try {
    const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id, projectId });
    await updateProject(projectId, ownerId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? {
              ...c,
              audio: { url, seconds, of: cut.sentence || "" },
              // ★ 재생성도 마찬가지다(2026-08-14) — 이미 산 클립의 화면 시간을
              //   말하는 시간으로 되돌리면 완성 길이가 줄어든다. runVoicePipeline 과 같은 규칙.
              spoken_seconds: seconds,
              seconds: Math.max(Number(c.seconds) || 0, seconds),
              voice_error: null,
            }
          : c
      ),
    }));
  } catch (e) {
    await updateProject(projectId, ownerId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === idx ? { ...c, voice_error: e?.message } : c)),
    })).catch(() => {});
    throw e;
  }
  return (await getProject(projectId, ownerId)).cuts.find((c) => c.idx === idx);
}

// ⑤영상 — 컷 이미지를 시작 프레임으로 클립을 만든다.
// 길이는 ④에서 실측된 낭독 길이를 따르되, i2v 상한(10초)을 넘으면 잘린다.
// cut.seconds 는 덮어쓰지 않는다 — 소리가 13초인데 그림이 10초인 상태를 그대로 두고,
// 합성이 마지막 프레임 정지로 늘려 맞춘다.
export async function runVideoPipeline(projectId, ownerId, deps = {}) {
  const clip = deps.clip || generateClip;
  const project = await getProject(projectId, ownerId);
  const cuts = project?.cuts || [];
  const aspect_ratio = project?.settings?.aspect_ratio || "9:16";

  await Promise.all(
    cuts.map(async (cut) => {
      const setCut = (patch) => {
        // 시각은 락 밖에서 잰다 — withProgress 주석 참고
        const at = Date.now();
        return updateProject(projectId, ownerId, (proj) =>
          withProgress(
            { ...proj, cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)) },
            "video",
            at
          )
        );
      };

      // 이미지 단계에서 실패한 컷이 남아 있을 수 있다 — 없는 그림으로 클립을 부르지 않는다
      if (!cut.image?.url) {
        await setCut({ video_error: "이미지가 없어 클립을 만들지 못했어요" }).catch(() => {});
        return;
      }
      // 살아 있는 클립은 다시 사지 않는다 — 클립이 한 편에서 가장 비싼 단계다(전체의 88%).
      // 낡은 것(그림·낭독이 바뀐 뒤)은 건너뛰지 않는다. 그 판정은 isClipStale 이 이미 한다.
      // 이것이 있어야 부분 실패 뒤 [영상 만들기]를 다시 눌러도 성공분을 또 사지 않는다.
      if (cut.video?.url && !isClipStale(cut, project)) return;
      try {
        const { url, seconds, truncated } = await clip({
          imageUrl: cut.image.url, seconds: cut.seconds, aspect_ratio, projectId,
          prompt: buildClipPrompt(cut, project),
          // 어느 모델로 만들지는 프로젝트가 정한다 — 안 넘기면 레거시(Kling)로 떨어진다
          project,
        });
        // 각인은 지금 프로젝트에서 판다 — 말하는 모델이면 대사·목소리까지 들어간다(clipKey).
        await setCut({ video: { url, seconds, truncated, of: clipKey(cut, project) }, video_error: null });
      } catch (e) {
        await setCut({ video_error: e?.message || "클립을 만들지 못했어요" }).catch(() => {});
      }
    })
  );

  await updateProject(projectId, ownerId, (proj) => ({ ...proj, status: "video" }));
}

// 컷 하나만 다시 만든다 — 상한 3회.
// ★ regenVoice 와 같은 이유로 심장박동을 안 찍는다 — 클립과 video_error 를 한 patch 에서
//   함께 쓰므로 done 이 중간에 내려앉지 않는다.
export async function regenClip(projectId, ownerId, idx, deps = {}) {
  const clip = deps.clip || generateClip;
  let exceeded = false;
  await updateProject(projectId, ownerId, (proj) => {
    exceeded = false; // 재시도마다 초기화 — regenCut 과 같은 이유(낙관적 락의 버려진 시도)
    const target = proj.cuts?.find((c) => c.idx === idx);
    if (!target || (target.clip_regen_count || 0) >= MAX_REGEN_PER_CUT) {
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

  const project = await getProject(projectId, ownerId);
  const cut = project.cuts.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");
  if (!cut.image?.url) throw new Error("이미지가 없어 클립을 만들 수 없어요");

  try {
    const { url, seconds, truncated } = await clip({
      imageUrl: cut.image.url,
      seconds: cut.seconds,
      aspect_ratio: project.settings?.aspect_ratio || "9:16",
      prompt: buildClipPrompt(cut, project),
      projectId,
      // 재생성도 같은 모델로 돈다 — 여기를 빠뜨리면 재생성만 Kling 이 된다
      project,
    });
    await updateProject(projectId, ownerId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, video: { url, seconds, truncated, of: clipKey(cut, project) }, video_error: null }
          : c
      ),
    }));
  } catch (e) {
    await updateProject(projectId, ownerId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === idx ? { ...c, video_error: e?.message } : c)),
    })).catch(() => {});
    throw e;
  }
  return (await getProject(projectId, ownerId)).cuts.find((c) => c.idx === idx);
}

// ⑥완성 — 클립을 이어붙이고 소리와 자막을 얹는다.
// 실패해도 앞 단계 산출물은 그대로 남는다(합성만 다시 하면 된다).
export async function runRenderPipeline(projectId, ownerId, deps = {}) {
  const compose = deps.compose || composeVideo;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");

  const result = await compose({
    projectId,
    cuts: project.cuts || [],
    // ★ 프로젝트는 넘기지 않는다 — 합성은 "이 컷의 소리가 어디에 있는가"를 **컷 단위**로
    // 판정한다(c.audio?.url). 프로젝트 하나로 정하면 모델만 Seedance 로 바뀌고 옛 Kling
    // 클립이 남은 혼합 프로젝트에서 컷마다 어긋난다(lib/compose.js).
    aspect_ratio: project.settings?.aspect_ratio || "9:16",
    subtitlePosition: project.settings?.subtitle_position,
    // ★ 사장님이 ⑥완성에서 고른 자막 설정을 반드시 함께 싣는다. 안 실으면 전체 재합성이
    // 기본 흰 Pretendard·옛 위치로 만들어 놓고, 각인(renderKey)에는 subtitle 이 들어가 있어
    // **"설정대로 만들었다"고 찍힌다** — 설정이 조용히 사라지고 낡음으로도 안 잡힌다.
    // undefined(한 번도 안 고친 프로젝트)면 옛 경로 그대로다(lib/subtitles.js 의 toAss).
    subtitle: project.settings?.subtitle,
    // ★ 자막 언어도 같은 이유로 반드시 싣는다. 안 실으면 일본어를 고른 프로젝트를 다시
    //   합칠 때 조용히 한국어로 나가는데, 각인(subtitleHead)에는 언어가 들어 있어
    //   "그 언어로 만들었다"고 찍힌다 — 낡음으로도 안 잡힌다.
    lang: project.settings?.subtitle_lang,
  });

  await updateProject(projectId, ownerId, (proj) => ({
    ...proj,
    status: "done",
    // 이 완성본이 어떤 소리·클립·문장으로 만들어졌는지 — 컷을 고치면 이 값이 안 맞는다
    render: { ...result, ts: Date.now(), of: renderKey(project) },
    render_error: null,
  }));
  return result;
}

// ⑥완성 — **자막만** 다시 굽는다. 클립·소리·그림은 그대로라 fal 지출이 0원이다.
//
// runRenderPipeline 과 갈라 둔 이유는 값이 아니라 시간이다. 전체 합성은 컷마다 클립을
// 내려받아 잇지만(수십 초~몇 분), 이쪽은 원본 하나를 받아 필터 한 번을 건다. 사장님이
// 자막을 옮길 때마다 클립을 다시 받게 하면 조절이 조절이 아니게 된다.
//
// ⚠️ 원본(renders/{id}-raw.mp4)이 있어야 부를 수 있다 — 원본을 남기기 전에 만든 옛
// 완성본에는 없다. 판정은 라우트가 먼저 하고(400), 여기서도 한 번 더 막는다.
export async function runSubtitlePipeline(projectId, ownerId, deps = {}) {
  const burn = deps.burn || burnSubtitles;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  if (!project.render?.rawUrl) {
    throw new Error("자막만 다시 구울 수 없어요 — 완성본을 한 번 만들어 주세요");
  }

  const result = await burn({
    projectId,
    cuts: project.cuts || [],
    subtitle: project.settings?.subtitle,
    // ★ 옛 필드도 함께 태운다 — composeVideo 와 같은 자여야 한다. 안 태우면 settings.subtitle
    // 이 없는 옛 'top' 프로젝트가 자막만 다시 구울 때 조용히 아래로 내려가는데, 각인 머리는
    // 그대로 "top" 이라 낡음으로도 안 잡힌다(지금은 화면이 PATCH 를 먼저 해서 안 밟을 뿐,
    // 계약을 호출 순서가 지키게 두지 않는다).
    subtitlePosition: project.settings?.subtitle_position,
    // 자막 언어 — 언어를 바꾸면 각인이 달라져 이 경로로 다시 굽힌다(로컬 ffmpeg, 0원).
    lang: project.settings?.subtitle_lang,
    aspect_ratio: project.settings?.aspect_ratio || "9:16",
  });

  await updateProject(projectId, ownerId, (proj) => {
    // 자막만 다시 구웠으므로 각인의 **머리(자막 설정)만** 갈아 끼운다.
    // 몸통(소리|클립|문장)은 옛 완성본이 실제로 나온 자리 그대로여야 한다 —
    // 지금 컷 기준으로 통째로 덮으면, 낡은 원본에 자막만 얹은 파일이 "최신" 으로 찍혀
    // 경고가 사라지고 사장님이 옛 클립짜리 mp4 를 내려받는다.
    // 정상 흐름(몸통이 이미 같은 경우)에서는 renderKey(project) 와 값이 같다.
    // 각인이 아예 없는 옛 완성본은 "낡지 않았다"가 계약이라 지금 값을 몸통으로 쓴다.
    const body = renderKeyBody(proj.render?.of ?? renderKey(project));
    const head = subtitleHead(project);
    return {
      ...proj,
      status: "done",
      // 각인을 새로 찍는다 — 안 찍으면 방금 반영한 자막이 계속 "낡음"으로 보인다.
      // 앞선 render 값(seconds 등)을 통째로 덮지 않고 얹는다: burnSubtitles 는 원본을
      // 안 건드리므로 rawUrl 은 그대로다.
      render: { ...proj.render, ...result, ts: Date.now(), of: head ? `${head}\n${body}` : body },
      render_error: null,
    };
  });
  return result;
}
