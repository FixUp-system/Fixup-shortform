// 롱폼 1단계 — 15초 두 구간을 **구간 1 → 확인 ① → 구간 2 → 확인 ②** 로 굽고 잇는다.
//   (스펙 docs/superpowers/specs/2026-09-30-longform-design.md · 계획 …/plans/2026-09-30-longform-30s-probe.md)
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs plan <작업폴더> --input <입력.json> [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg1 <작업폴더> [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg2 <작업폴더> [--yes] [--anchor-at 7] [--voice-at "A=1.2-2.5+9.7-11;B=6.8-8.2"] [--no-last] [--sheet-only]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs cast <작업폴더> [--only A] [--redo] [--frame-at "A=1.5"] [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs extend <작업폴더> --brief "방향" [--add 1] [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg3 <작업폴더> [seg2 와 같은 옵션] [--anchor-seg 1] [--cast-at "A=1@8.5;B=1@4.5:300,230,468,760"]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs join <작업폴더>
//
// ★★ 2026-09-30 구간 N개 — extend 가 구운 구간 뒤에 구간을 더하고(인물 잠금 · 장소·옷은 구간별),
//   seg<n> 이 그 구간을 굽는다. 이름은 "2seg" 로 남았지만 구간 수는 run.json 이 정한다.
// ★★★ 2026-09-30 실사 순서: plan → **cast**(인물별 H3 글만 5초 → 얼굴·목소리 참조) → seg1… → join.
//   판(GPT Image)은 기본으로 끈다(--sheet 로만 켠다) — 그림 모델에서 출발한 참조가 AI 질감을 대물림했다.
//
// ★★★ 유료 단계(plan·seg1·seg2)는 --yes 없이 안 돈다. 먼저 --yes 없이 돌려 어림값을 보고,
//   사장님 승인을 받은 뒤 --yes 를 붙인다. seg1 과 seg2 는 **따로** 승인한다.
// ★★ SHOTFORM_FAKE=all 이면 네 단계가 0원으로 관통한다(--yes 가 필요 없다) — 배선을 먼저 본다.
// ★ 확인 ① 사이에 run.json 의 구간 2 샷(shows·line 등)을 고칠 수 있다. 인물·무대·의상·
//   목소리를 고치면 seg2 가 거부한다(고정 블록 잠금).
// ★ 측정이 낸 값은 운영자 지출이다 — SHOTFORM_MEASURE_USER(크레딧 가진 uuid)로 돈다. 비우면
//   "admin" 이고, admin 은 체험 한도($0.5)에 막힐 수 있다(CLAUDE.md 크레딧 절).
// ⚠️ H3 영상은 원장(cost_records)에 안 남는다 — fal 을 직접 부른다(기존 측정 스크립트와 같다).
//   시나리오·사진 판정·판 그림은 lib 을 거치므로 남는다. 대조할 때 이 차이를 안다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

// env 를 세운 뒤에 lib 을 부른다 — 모듈이 import 시점에 env 를 읽을 수 있다.
const { runWithActor } = await import("../../lib/actor.js");
const { fakeFal, fakeLlm } = await import("../../lib/fake.js");
const { describePhoto } = await import("../../lib/vlm.js");
const { hasFaceRisk } = await import("../../lib/photos.js");
const { generateImage, imageResolutionFor } = await import("../../lib/imagegen.js");
const { resolutionForProject, seedForProject } = await import("../../lib/clip-limits.js");
const { storyboardGridFor, storyboardImageSize, buildStoryboardPrompt } = await import("../../lib/reel/storyboard.js");
const { buildReelCuts } = await import("../../app/api/reel/[id]/scenario/route.js");
const { generateLongformScenario, checkStoredScenario, extendLongformScenario } = await import("../../lib/longform/scenario.js");
const { buildBible, segmentCharacters, segmentBible, buildFixedBlock, segmentLook } = await import("../../lib/longform/bible.js");
const { buildSegmentPrompt, segmentShots, segmentSeconds } = await import("../../lib/longform/segment-prompt.js");
const { segmentRefs } = await import("../../lib/longform/refs.js");
const { frameAtArgs, lastFrameArgs, concatList, joinArgs, runFfmpeg, voiceClipArgs, castFrameArgs } = await import("../../lib/longform/ffmpeg.js");
const { parseVoiceAt } = await import("../../lib/longform/voice-ref.js");
const { parseCastAt, sheetCastLines } = await import("../../lib/longform/cast.js");
const { buildCastingPrompt, castingVoiceSeconds, CASTING_SECONDS } = await import("../../lib/longform/casting.js");
const { H3_T2V } = await import("../../lib/longform/plan.js");
const { h3Body, submitH3, waitH3 } = await import("../../lib/longform/h3.js");
const { gate, checkBibleLock, stageCostUsd, stageIsFree, parseAnchorAt, segOf } = await import("../../lib/longform/run-state.js");

const [stage, runDir, ...rest] = process.argv.slice(2);
if (!stage || !runDir) {
  console.error("사용법: longform-2seg.mjs <plan|extend|seg<n>|join> <작업폴더> [--input 입력.json] [--brief 방향] [--yes] [--anchor-at 초]");
  process.exit(1);
}
const flag = (n) => rest.includes(n);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const die = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

mkdirSync(runDir, { recursive: true });
const statePath = path.join(runDir, "run.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
// ★★ 가짜 여부는 **그 단계가 부르는 것**으로 가른다(최종 리뷰: FAKE=fal 에서 H3 가 진짜로 나갔다).
const free = stageIsFree(stage, { fal: fakeFal(), llm: fakeLlm() });
const bakes = segOf(stage) > 0 || stage === "cast";
if (bakes && !fakeFal() && !process.env.FAL_KEY) die("FAL_KEY 가 없어요(.env.local)");

// 스크립트 안에서 쓰는 프로젝트 모양 — lib 들이 읽는 칸만 채운다. 저장하지 않는다.
// ★ seg 를 주면 그 구간의 장소·옷(segment_looks)으로 덮는다 — 판 지문(buildStoryboardPrompt)이
//   scenario.environment·wardrobe 를 "전 칸 공통"으로 싣기 때문이다. 안 덮으면 몽타주 구간의
//   판이 비 오는 정류장·카디건으로 그려진다.
function projectOf(seg) {
  const look = seg ? segmentLook(state.scenario, seg) : null;
  return {
    id: state.runId,
    settings: { ...state.settings, i2v_model: "minimax-h3" },
    material: { text: state.input?.text || "", photos: state.photos || [] },
    scenario: look ? { ...state.scenario, environment: look.environment, wardrobe: look.wardrobe } : state.scenario,
    cast: (state.scenario?.characters || []).map((c) => ({ id: c.key, who: c.who, look: c.look, voice: c.voice, cuts: [] })),
  };
}

function photosWithBytes() {
  return (state.photos || []).map((p) => ({ ...p, bytes: readFileSync(p.path) }));
}

function printDropped(dropped) {
  for (const d of dropped) {
    const why = d.reason === "face" ? "사람 얼굴이 있어 참조로 안 보낸다(초상 정책)" : "참조 자리(9장)가 모자라 뺐다";
    console.log(`   ⚠ 빠짐 — ${d.kind}${d.id ? ` ${d.id}` : ""}: ${why}`);
  }
}

async function download(url, out) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`영상을 못 받았어요 (${r.status}) ${url}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

async function runPlan() {
  const inputPath = opt("--input");
  if (!inputPath) die("plan 은 --input 입력.json 이 필요해요(scripts/measure/longform-2seg.example.json 참고)");
  state.runId ||= randomUUID();
  state.input = JSON.parse(readFileSync(inputPath, "utf8"));
  state.settings = {
    aspect_ratio: state.input.aspect || "9:16",
    style: state.input.style || "photo",
    mood: state.input.mood || "premium",
    narration_lang: "ko",
    seconds: 30,
    target_seconds: 30,
    resolution: state.input.resolution || "768P",
  };
  state.photos = [];
  for (const [i, ph] of (state.input.photos || []).entries()) {
    const bytes = readFileSync(ph.path);
    const key = path.basename(ph.path);
    const vision = await describePhoto({ photoBytes: bytes, photoKey: key, projectId: state.runId });
    const judged = vision.person || vision.what || vision.lettering;
    state.photos.push({ id: `p${i + 1}`, path: ph.path, key, role: ph.role, ...(judged ? { vision } : {}) });
  }
  state.scenario = await generateLongformScenario({ project: projectOf(), segmentCount: 2 });
  state.bible = buildBible(state.scenario, { style: state.settings.style });
  state.segments = [{ seg: 1 }, { seg: 2 }];
  save();

  // ⏸ 멈춤 0 — 굽기 전에 두 구간의 지문 전문을 보여 준다(0원).
  const photos = photosWithBytes();
  for (const seg of [1, 2]) {
    const anchor = seg === 2 ? { keys: segmentCharacters(state.scenario, 1) } : null;
    const last = seg === 2 ? {} : null;
    const { refs, dropped, extraUsd } = segmentRefs({ sheet: {}, photos, anchor, last });
    const grid = storyboardGridFor(segmentShots(state.scenario, seg).length, { resolution: state.settings.resolution, aspect: state.settings.aspect_ratio });
    const prompt = buildSegmentPrompt({ scenario: state.scenario, seg, bible: state.bible, refs, grid });
    writeFileSync(path.join(runDir, `seg${seg}.prompt.txt`), prompt);
    const seconds = segmentSeconds(state.scenario, seg);
    console.log(`\n구간 ${seg} — ${seconds}초 · 참조 ${refs.length}장(${refs.map((r) => r.kind).join(", ")}) · 추가 참조값 $${extraUsd.toFixed(2)}`);
    console.log(`   출연: ${segmentCharacters(state.scenario, seg).join(", ") || "(없음)"}`);
    console.log(`   지문: ${path.join(runDir, `seg${seg}.prompt.txt`)}`);
    printDropped(dropped);
    console.log(`   어림: $${stageCostUsd(`seg${seg}`, { resolution: state.settings.resolution, seconds, extraRefUsd: extraUsd }).toFixed(2)}`);
  }
  console.log(`\n고정 블록:\n${state.bible}`);
  console.log(`\n⏸ 멈춤 0 — 두 지문을 읽고, 괜찮으면 seg1 을 돌려요(먼저 --yes 없이 → 어림값 확인 → 승인 → --yes).`);
}

// 캐스팅이 인물 전원 몫으로 끝났나 — 끝났으면 모든 구간이 그 얼굴·목소리를 쓴다(lib/longform/casting.js).
function castingReady() {
  const chars = state.scenario?.characters || [];
  return chars.length > 0 && chars.every((c) => {
    const x = state.casting?.[c.key];
    return x?.image && x?.voice && existsSync(x.image) && existsSync(x.voice);
  });
}

// 캐스팅 — 인물마다 H3 글만 5초 클립 → 얼굴 프레임(cast-<key>.jpg) · 목소리(voice-<key>.mp3).
//   --only A,B 로 일부만 · --redo 로 이미 만든 인물도 다시 · --frame-at "A=1.5;B=4" 로 프레임만 다시 고른다(0원).
async function runCast() {
  const chars = state.scenario.characters || [];
  const only = (opt("--only") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const targets = chars.filter((c) => !only.length || only.includes(c.key));
  const frameAt = Object.fromEntries((opt("--frame-at") || "").split(";").filter(Boolean).map((p) => p.split("=").map((x) => x.trim())));
  const voiceSeconds = castingVoiceSeconds(chars.length);
  state.casting ||= {};
  await Promise.all(targets.map(async (c) => {
    const x = (state.casting[c.key] ||= {});
    const video = path.join(runDir, `casting-${c.key}.mp4`);
    if (flag("--redo")) { delete x.job; delete x.video; }
    if (!x.video) {
      if (!x.job) {
        x.prompt = buildCastingPrompt(c);
        const body = h3Body({ prompt: x.prompt, seconds: CASTING_SECONDS, aspect: state.settings.aspect_ratio, resolution: state.settings.resolution, textOnly: true });
        // ★★★ 접수증을 기다리기 전에 적는다 — 끊겨도 다시 돌리면 이어 기다린다(구간과 같은 규약).
        x.job = fakeFal() ? { fake: true } : await submitH3(body, { endpoint: H3_T2V });
        save();
        console.log(`캐스팅 ${c.key} 접수 — ${x.job.requestId || "(가짜)"}`);
      }
      if (x.job.fake) copyFileSync(path.join("public", "samples", "reel-15s.mp4"), video);
      else await download(await waitH3(x.job), video);
      x.video = video;
      save();
    }
    const at = Number(frameAt[c.key] ?? x.frameAt ?? 1);
    x.image = path.join(runDir, `cast-${c.key}.jpg`);
    x.voice = path.join(runDir, `voice-${c.key}.mp3`);
    rmSync(x.image, { force: true });
    rmSync(x.voice, { force: true });
    await runFfmpeg(castFrameArgs({ input: video, at, crop: null, out: x.image }));
    await runFfmpeg(voiceClipArgs({ input: video, ranges: [[0, voiceSeconds]], out: x.voice }));
    if (!existsSync(x.image) || !existsSync(x.voice)) die(`캐스팅 ${c.key} 의 프레임·목소리를 못 뽑았어요`);
    Object.assign(x, { frameAt: at, voiceSeconds });
    save();
    console.log(`캐스팅 ${c.key} — 영상 ${video} · 프레임 ${at}초 · 목소리 ${voiceSeconds}초`);
  }));
  console.log("\n⏸ 캐스팅 클립을 보고 고른다 — 다시 뽑으려면 cast --only A --redo --yes, 프레임만 바꾸려면 cast --frame-at \"A=2\" --yes(0원).");
  console.log("   괜찮으면 seg1 부터 굽는다 — 모든 구간이 이 얼굴·목소리를 참조로 쓴다(판은 기본으로 꺼져 있다).");
}

async function runSegment(seg) {
  const s = state.segments[seg - 1];
  const scn = state.scenario;
  // ★★ 2026-09-30 구간 N개 — 인물·목소리·화풍·색감은 잠그고(고정 블록), 장소·옷은 구간이 정한다.
  const bible = segmentBible(scn, { style: state.settings.style, seg });
  if (seg >= 2) {
    const lock = checkBibleLock(state, buildFixedBlock(scn, { style: state.settings.style }));
    if (!lock.ok) die(lock.reason);
  }

  if (!s.job) {
    const project = projectOf(seg);
    const photos = photosWithBytes();

    // ★★ 최종 리뷰(2026-09-30) — **0원 단계를 판 구매($0.83) 앞에 둔다.** 예전에는 판을 먼저
    //   사고 닻을 뽑아서, --anchor-at 오타나 추출 실패로 죽으면 다시 돌릴 때 판을 또 샀다.

    // 닻 — 구간 2 부터. 기본은 **바로 앞 구간**의 가운데. 출연자 전원이 보이는 초를 골라 --anchor-at 으로,
    //   다른 구간에서 뽑으려면 --anchor-seg <n> 으로 준다(예: 구간 3 인데 얼굴이 잘 보이는 건 구간 1).
    let anchor = null;
    let last = null;
    if (seg >= 2) {
      const from = Number(opt("--anchor-seg") || seg - 1);
      if (!(Number.isInteger(from) && from >= 1 && from < seg)) die(`--anchor-seg 는 1~${seg - 1} 이어야 해요`);
      const pick = parseAnchorAt(opt("--anchor-at"), segmentSeconds(scn, from));
      if (!pick.ok) die(pick.reason);
      const prev = path.join(runDir, `seg${from}.mp4`);
      const aPath = path.join(runDir, `anchor-seg${seg}.jpg`);
      const lPath = path.join(runDir, `last-seg${seg}.jpg`);
      // 옛 프레임을 먼저 지운다 — 추출이 조용히 실패하면 지난번 닻을 읽게 된다.
      rmSync(aPath, { force: true });
      rmSync(lPath, { force: true });
      await runFfmpeg(frameAtArgs({ input: prev, at: pick.at, out: aPath }));
      // 마지막 프레임은 늘 **바로 앞 구간**의 끝이다 — 이어지는 자리가 거기다.
      await runFfmpeg(lastFrameArgs({ input: path.join(runDir, `seg${seg - 1}.mp4`), out: lPath }));
      if (!existsSync(aPath) || !existsSync(lPath)) die(`닻·마지막 프레임을 못 뽑았어요 — seg${from}.mp4 와 --anchor-at 을 확인해요`);
      anchor = { bytes: readFileSync(aPath), key: "anchor.jpg", keys: segmentCharacters(scn, from) };
      s.anchorSeg = from;
      // --no-last: 직전 프레임을 싣지 않는다. 실제 구간 1(romance-busstop)의 끝 프레임이 **아무도 안 든
      //   우산**이었다 — "이어 가라"로 실으면 결함이 구간 2 로 넘어간다. 인물은 닻이 붙든다.
      last = flag("--no-last") ? null : { bytes: readFileSync(lPath), key: "last.jpg" };
      s.anchorAt = pick.at;
      s.noLast = flag("--no-last");
    }

    // 목소리 — 구간 2 부터. **늘 구간 1** 에서 H3 가 낸 인물별 목소리를 잘라 reference_audio_urls 로
    //   싣는다(lib/longform/voice-ref.js 머리말) — 목소리의 원본은 하나여야 구간이 늘어도 안 흔들린다.
    //   판 구매 앞(0원 단계)에 둔다 — 오타로 죽어도 판값이 안 나간다.
    let voices = [];
    // ★★★ 캐스팅(cast 단계)이 있으면 그 목소리를 **구간 1 부터** 싣는다 — 목소리의 원본이 캐스팅 클립이다.
    if (castingReady()) {
      for (const c of scn.characters) {
        const v = state.casting[c.key];
        voices.push({ key: c.key, bytes: readFileSync(v.voice), seconds: v.voiceSeconds });
      }
      console.log(`   목소리 — 캐스팅 ${voices.map((v) => `${v.key} ${v.seconds}초`).join(" · ")}`);
    } else if (seg >= 2) {
      const vp = parseVoiceAt(opt("--voice-at"), { keys: (scn.characters || []).map((c) => c.key) });
      if (!vp.ok) die(vp.reason);
      for (const v of vp.voices) {
        const vPath = path.join(runDir, `voice-${v.key}.mp3`);
        rmSync(vPath, { force: true });
        await runFfmpeg(voiceClipArgs({ input: path.join(runDir, "seg1.mp4"), ranges: v.ranges, out: vPath }));
        if (!existsSync(vPath)) die(`${v.key} 목소리를 못 잘랐어요 — --voice-at 을 확인해요`);
        voices.push({ key: v.key, bytes: readFileSync(vPath), seconds: v.seconds });
        console.log(`   목소리 ${v.key} — ${v.seconds}초 (${vPath})`);
      }
      s.voiceAt = vp.voices.map(({ key, ranges }) => ({ key, ranges }));
    }

    // 인물 참조 — 판과 H3 에 인물 얼굴 이미지를 싣는다(lib/longform/cast.js 머리말). --cast-at 으로 한 번
    //   정하면 run.json 에 남아 **이후 모든 구간이 같은 것을 쓴다.** 판 구매 앞(0원 단계)에 둔다.
    let cast = [];
    if (castingReady()) {
      // ★★★ 캐스팅(cast 단계)의 실사 프레임 — 그림 모델에서 출발한 참조는 AI 질감을 대물림한다(casting.js).
      for (const c of scn.characters) cast.push({ key: c.key, bytes: readFileSync(state.casting[c.key].image) });
      console.log(`   인물 — 캐스팅 ${cast.map((c) => c.key).join(" · ")}`);
    } else {
      const given = opt("--cast-at");
      const cp = given ? parseCastAt(given, { keys: (scn.characters || []).map((c) => c.key), segments: state.segments.length }) : { ok: true, cast: state.castAt || [] };
      if (!cp.ok) die(cp.reason);
      for (const c of cp.cast) {
        if (c.seg >= seg) die(`인물 ${c.key} 의 참조는 이미 구운 앞 구간에서만 뽑아요(구간 ${c.seg} → 지금 구간 ${seg})`);
        const cPath = path.join(runDir, `cast-${c.key}.jpg`);
        rmSync(cPath, { force: true });
        await runFfmpeg(castFrameArgs({ input: path.join(runDir, `seg${c.seg}.mp4`), at: c.at, crop: c.crop, out: cPath }));
        if (!existsSync(cPath)) die(`인물 ${c.key} 이미지를 못 뽑았어요 — --cast-at 을 확인해요`);
        cast.push({ key: c.key, bytes: readFileSync(cPath) });
        console.log(`   인물 ${c.key} — 구간 ${c.seg} ${c.at}초${c.crop ? " (잘라냄)" : ""} (${cPath})`);
      }
      if (given) { state.castAt = cp.cast; save(); }
    }

    // 판 — 단계별과 같은 지문·같은 크기 규칙을 쓴다. 칸을 잘라 버킷에 올리는 일은 안 한다
    //   (drawStoryboardSheet 의 뒤 절반) — H3 에는 판 한 장의 주소만 있으면 된다.
    // ★★ 산 판은 **바로 적어 두고**, 다시 돌리면 그것을 쓴다(접수 전에 죽어도 판값이 두 번 안 나간다).
    // ★ 격자는 판을 재사용할 때도 필요하다 — 지문 머리말이 격자 배치(행·열)를 말한다.
    // ★★★ 2026-09-30 — 판은 **기본으로 끈다**(--sheet 로만 켠다). GPT Image 판이 AI 질감의 입구였다.
    //   이미 산 판이 있는 구간(옛 회차)은 그대로 쓴다.
    const useSheet = flag("--sheet") || Boolean(s.sheet);
    if (flag("--sheet-only") && !useSheet) die("--sheet-only 는 --sheet 와 함께 써요(판은 기본으로 꺼져 있어요)");
    const cuts = buildReelCuts({ ...scn, shots: segmentShots(scn, seg) });
    const grid = useSheet ? storyboardGridFor(cuts.length, { resolution: state.settings.resolution, aspect: state.settings.aspect_ratio }) : null;
    if (!useSheet) {
      console.log(`구간 ${seg} — 판 없이 굽는다(구도는 지문의 샷 설명이 정한다)`);
    } else if (s.sheet) {
      console.log(`구간 ${seg} — 이미 그린 판을 다시 쓴다(${s.sheet})`);
    } else {
      const boardRefs = photos.filter((p) => !hasFaceRisk(p)).map((p) => ({ bytes: p.bytes, key: p.key, photo_id: p.id, kind: "thing" }));
      // 인물 참조는 사진 **뒤에** 싣고, 번호도 그 뒤부터 센다(판 지문의 "Attached reference image n" 규약).
      const castRefs = cast.map((c) => ({ bytes: c.bytes, key: `cast-${c.key}.jpg`, kind: "person" }));
      const castLines = sheetCastLines(cast, { startAt: boardRefs.length + 1 });
      const sheetPrompt = [buildStoryboardPrompt(project, cuts, grid, "", boardRefs), castLines].filter(Boolean).join("\n\n");
      writeFileSync(path.join(runDir, `seg${seg}-sheet.prompt.txt`), sheetPrompt);
      const sheet = await generateImage({
        prompt: sheetPrompt,
        aspect_ratio: grid.canvas,
        projectId: state.runId,
        resolution: imageResolutionFor(project),
        refs: [...boardRefs, ...castRefs],
        imageSize: storyboardImageSize(grid, state.settings.aspect_ratio, resolutionForProject(project)),
      });
      s.sheet = sheet.url;
      save();
    }

    // --sheet-only: 판까지만 사고 멈춘다 — 사장님이 판을 보고 나서 H3($0.90)를 산다.
    //   실제 구간 1 의 떠 있는 우산은 **판에서 이미** 그렇게 그려져 있었다(영상은 판을 따랐을 뿐).
    //   다시 돌리면 적어 둔 판을 쓰므로 판값이 두 번 안 나간다.
    if (flag("--sheet-only")) {
      const sheetPath = path.join(runDir, `seg${seg}-sheet.png`);
      if (!fakeFal()) await download(s.sheet, sheetPath);
      console.log(`\n⏸ 판만 그렸어요 — ${fakeFal() ? s.sheet : sheetPath}`);
      console.log("   판을 보고 괜찮으면 --sheet-only 없이 같은 명령으로 다시 돌려요(판은 다시 안 산다).");
      return;
    }

    const { refs, audios, dropped, extraUsd } = segmentRefs({ sheet: useSheet ? { url: s.sheet } : null, photos, cast, anchor, last, voices });
    const prompt = buildSegmentPrompt({ scenario: scn, seg, bible, refs, audios, grid });
    writeFileSync(path.join(runDir, `seg${seg}.prompt.txt`), prompt);
    printDropped(dropped);
    const seconds = segmentSeconds(scn, seg);
    const body = h3Body({
      prompt, seconds,
      aspect: state.settings.aspect_ratio,
      resolution: state.settings.resolution,
      refs,
      audios,
      seed: seedForProject({ settings: { i2v_model: "minimax-h3" } }, state.runId),
    });
    Object.assign(s, { bible, prompt, seconds, dropped, extraUsd, refCount: refs.length, audioCount: audios.length });

    // ★★★ 접수증을 **기다리기 전에** 적는다 — 끊겨도 다시 돌리면 재접수 없이 이어 기다린다.
    s.job = fakeFal() ? { fake: true } : await submitH3(body);
    save();
    console.log(`구간 ${seg} 접수 — ${s.job.requestId || "(가짜)"} · ${seconds}초 · ${state.settings.resolution}`);
  } else {
    console.log(`구간 ${seg} — 이미 접수된 것(${s.job.requestId || "가짜"})을 이어서 기다린다. 새 돈이 안 나간다.`);
  }

  const out = path.join(runDir, `seg${seg}.mp4`);
  if (s.job.fake) {
    copyFileSync(path.join("public", "samples", "reel-15s.mp4"), out);
  } else {
    const url = await waitH3(s.job, {
      onTick: (st, ms) => console.log(`   … ${st} · ${Math.round(ms / 1000)}초`),
    });
    await download(url, out);
    s.videoUrl = url;
  }
  s.video = out;
  save();
  console.log(`구간 ${seg} 끝 — ${out}`);
  if (seg === 1) {
    console.log("\n⏸ 확인 ① — 구간 1 만 본다: ① 한국어로 말하나 ② 대사를 글자 그대로 말하나 ③ 한 장면에서 여러 인물이 대화하나.");
    console.log("   막히면 여기서 멈춘다. 통과하면 run.json 의 구간 2 샷만 손보고(선택), 출연자 전원이 보이는 초를 골라 seg2 --anchor-at <초>.");
  } else if (seg < state.segments.length) {
    console.log(`\n다음: seg${seg + 1} (먼저 --sheet-only 로 판을 본다)`);
  } else {
    console.log("\n다음: join (0원) — 또는 extend 로 구간을 더한다");
  }
}

// 이어 쓰기 — 구운 구간은 그대로 두고 시나리오 뒤에 구간을 더한다(lib/longform/scenario.js 의
//   extendLongformScenario). 끝나면 새 구간의 샷을 보여 준다 — 판을 사기 전에 사람이 읽는다.
async function runExtend() {
  const add = Number(opt("--add") || 1);
  if (!(Number.isInteger(add) && add >= 1 && add <= 4)) die("--add 는 1~4 여야 해요");
  const before = state.segments.length;
  state.scenario = await extendLongformScenario({ state, brief: opt("--brief") || "", addSegments: add });
  for (let n = before + 1; n <= before + add; n++) state.segments.push({ seg: n });
  save();
  for (let n = before + 1; n <= before + add; n++) {
    console.log(`\n구간 ${n} — ${segmentSeconds(state.scenario, n)}초`);
    const look = segmentLook(state.scenario, n);
    console.log(`   장소: ${look.environment || "(앞과 같음)"}\n   옷: ${look.wardrobe || "(앞과 같음)"}`);
    for (const s of segmentShots(state.scenario, n)) {
      const vo = s.voiceover === true || !(s.on_screen || []).includes(s.speaker_id);
      const said = s.line ? `  「${s.speaker_id}: ${s.line}」${vo ? " (내레이션)" : ""}` : "";
      const who = (s.on_screen || []).join(",") || "사람 없음";
      console.log(`   · ${s.seconds}초 [${who}] ${s.shows}${said}`);
    }
  }
  console.log(`\n⏸ 새 구간을 읽고, 괜찮으면 seg${before + 1} --sheet-only 로 판부터 본다.`);
}

async function runJoin() {
  const list = path.join(runDir, "concat.txt");
  const files = state.segments.map((x) => path.resolve(runDir, `seg${x.seg}.mp4`));
  writeFileSync(list, concatList(files));
  const total = state.segments.reduce((t, x) => t + segmentSeconds(state.scenario, x.seg), 0);
  const out = path.join(runDir, `longform-${total}s.mp4`);
  await runFfmpeg(joinArgs({ list, out }));
  console.log(`이어 붙였다 — ${out} (구간 ${files.length}개)`);
  console.log("\n⏸ 확인 — 보고 듣는다: 인물 유지 · 목소리 유지 · 이음새 · 이야기가 한 편인가.");
}

// ── 관문 ────────────────────────────────────────────────────────────────
if (segOf(stage)) {
  const seg = segOf(stage);
  if (state.scenario && seg <= (state.segments || []).length) {
    // ★★★ 최종 리뷰(2026-09-30) — 확인 ① 뒤 run.json 편집을 **굽기 전에 다시 잰다.** 안 재면
    //   구간 2 를 27초로 고쳐도 통과하고 H3 가 조용히 15초로 잘랐다. 어림값도 틀렸다.
    const chk = checkStoredScenario(state);
    if (!chk.ok) die(`run.json 의 시나리오가 규칙을 어겨요 — ${chk.errors.join(" · ")}`);
    const sheet = flag("--sheet") || Boolean(state.segments[seg - 1]?.sheet);
    const est = stageCostUsd(stage, { resolution: state.settings.resolution, seconds: segmentSeconds(state.scenario, seg), sheet: sheet && !state.segments[seg - 1]?.sheet });
    console.log(`어림 — 구간 ${seg}: 약 $${est.toFixed(2)} (${sheet ? "판 + " : "판 없이 · "}H3 ${state.settings.resolution} · 참조 추가분은 굽기 직전에 다시 말한다)`);
  }
} else if (stage === "plan") {
  console.log(`어림 — plan: 약 $${stageCostUsd("plan").toFixed(2)} (시나리오 한 번 + 사진 판정 장당 ~$0.003)`);
} else if (stage === "extend") {
  console.log(`어림 — extend: 약 $${stageCostUsd("extend").toFixed(2)} 이하 (시나리오 이어 쓰기 한 번)`);
} else if (stage === "cast" && state.scenario) {
  const n = opt("--only") ? opt("--only").split(",").length : (state.scenario.characters || []).length;
  console.log(`어림 — cast: 약 $${stageCostUsd("cast", { resolution: state.settings.resolution, characters: n }).toFixed(2)} (인물 ${n}명 × ${CASTING_SECONDS}초 · 이미 만든 인물은 0원)`);
}
const g = gate(state, stage, { yes: flag("--yes") || free });
if (!g.ok) die(g.reason);

await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
  if (stage === "plan") await runPlan();
  else if (stage === "extend") await runExtend();
  else if (stage === "cast") await runCast();
  else if (segOf(stage)) await runSegment(segOf(stage));
  else if (stage === "join") await runJoin();
});
