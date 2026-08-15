// 움직임 세 축(카메라·피사체·배경)이 지문 → 응답 → 프롬프트 → 각인까지 실제로 흐르는지 잰다.
//
//   node scripts/measure/motion-axes.mjs [반복] [자료편수]
//   node scripts/measure/motion-axes.mjs 3 4     자료 4편 × 3회 (기본값)
//   node scripts/measure/motion-axes.mjs 0       ①만 — LLM 을 한 번도 안 부른다(완전 0원)
//
// 두 가지를 잰다.
//
//  ① **옛 컷이 안 낡는가** (0원) — 저장된 프로젝트를 전건 읽어 컷마다 buildClipPrompt·clipKey 를
//     두 번 낸다: 있는 그대로 한 번, **세 축을 지운 컷으로** 한 번. 두 출력이 바이트 동일이면
//     그 컷은 이 브랜치로 **안 바뀐 것**이다(축이 없을 때 축 절이 안 붙는다는 성질을 직접 잰다).
//     ★ 옛 코드를 `git show` 로 잡지 않는 이유: 이 브랜치가 squash-merge 되면 그 커밋이
//     도달 불가가 되어 진짜 회귀와 구분 안 되는 실패로 터진다.
//     저장된 컷에는 아직 축이 없으므로 **바뀐 컷은 0이어야 한다.** 하나라도 나오면 결함이다.
//     폴백("거의 정지 상태, 아주 느린 카메라 이동")이 나오는 컷 수도 같이 센다.
//
//  ② **모델이 실제로 세 축을 답하는가** (OpenAI 만, 편당 약 $0.005) — 저장된 프로젝트의 컷을
//     자료로 화면 설계 패스만 반복해 부른다. 이미지·클립·목소리를 부르지 않으므로 **fal 비용이
//     0이다.** 축 분포·컷당 축 개수·ambient 채움률·motionVariety 재시도 횟수를 낸다.
//     ★ ambient 는 이번에 새로 여는 축이라 모델이 그냥 무시할 수 있다 — 그것이 이 측정의 핵심이다.
//     ★ 표본 1회로 결론 내지 않는다(LLM 변동이 차이보다 클 수 있다). 기본이 3회인 이유다.
//
// 마지막에 축이 실린 컷 하나의 **최종 클립 프롬프트 전체**를 출력한다 — 이음새·이중 공백·
// 부유 구분자는 수치가 아니라 눈으로 본다.
//
// ⚠️ 이 경로는 원장(cost_records)에 기록을 남기지 않는다. lib/llm.js 의 callJson 은
//    assertBudget·addRecord 를 물고 있어 측정이 사장님 계정의 그물에 걸린다 —
//    shows-motion-leak.mjs 가 같은 이유로 HTTP 를 직접 부른다. 예상 비용으로 갈음한다.
//    (모델·temperature·response_format 은 llm.js 와 같게 맞춘다.)
//
// ⚠️ 저장은 2026-07-31 에 Supabase 로 이관됐다 — data/projects 를 읽던 옛 측정 스크립트와
//    다르게 여기서는 DB 를 직접 읽는다. 소유자와 무관하게 **전건**을 봐야 하므로
//    store 의 listProjects(ownerId) 가 아니라 service_role 클라이언트로 직접 훑는다.
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// lib/validate.js 는 확장자 없는 import(`./script`)가 있어 순수 node 에서 안 풀린다.
// 재는 대상이 **진짜 validateShows** 이므로 베끼지 않고 해석기를 한 겹 얹는다.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(spec, ctx, next) {" +
        " try { return await next(spec, ctx); } catch (e) {" +
        " if (spec.startsWith('.') && !/\\.[cm]?js$/.test(spec)) return await next(spec + '.js', ctx);" +
        " throw e; } }"
    )
);

try {
  process.loadEnvFile(".env.local");
} catch {
  // 이미 env 가 세워져 있으면 그대로 쓴다
}

const { buildClipPrompt, buildShowsMessages } = await import("../../lib/cuts.js");
const { clipKey } = await import("../../lib/steps.js");
const { MOTION_AXES, axesOf, motionVariety } = await import("../../lib/motion.js");
const { validateShows } = await import("../../lib/validate.js");
const { shotBalance } = await import("../../lib/shots.js");
const { speedContrast } = await import("../../lib/speeds.js");

const REPEATS = process.argv[2] === undefined ? 3 : Number(process.argv[2]);
const SOURCES_MAX = Number(process.argv[3]) || 4;
const FALLBACK = "거의 정지 상태, 아주 느린 카메라 이동";
const AXIS_IDS = MOTION_AXES.map((a) => a.id);

function withoutAxes(cut) {
  const c = { ...cut };
  for (const id of AXIS_IDS) delete c[id];
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 저장된 프로젝트 전건 — 옛 컷이 안 낡는가
// ─────────────────────────────────────────────────────────────────────────────
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (.env.local)");
  return createClient(url, key, { auth: { persistSession: false } });
}

// PostgREST 행 상한(기본 1000)에 말없이 잘리지 않도록 페이지로 훑는다 —
// 이 저장소는 합계가 조용히 일부만 더해진 사고를 겪었다(lib/costs.js sum_costs 주석).
async function allProjects() {
  const out = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("projects")
      .select("id, doc")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`프로젝트 목록 실패: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

const projects = await allProjects();

let cutCount = 0;
let axisCutCount = 0;
let fallbackCount = 0;
const changed = [];
const projectsWithCuts = [];

for (const row of projects) {
  const doc = row.doc || {};
  const cuts = Array.isArray(doc.cuts) ? doc.cuts : [];
  if (cuts.length) projectsWithCuts.push({ id: row.id, doc, cuts });
  for (const [i, cut] of cuts.entries()) {
    cutCount += 1;
    if (axesOf(cut).length) axisCutCount += 1;
    const bare = withoutAxes(cut);
    const p = buildClipPrompt(cut, doc);
    const pBare = buildClipPrompt(bare, doc);
    const k = clipKey(cut, doc);
    const kBare = clipKey(bare, doc);
    if (p !== pBare || k !== kBare) {
      changed.push({ project: row.id.slice(0, 8), cut: i + 1, prompt: p !== pBare, key: k !== kBare });
    }
    if (p.includes(FALLBACK)) fallbackCount += 1;
  }
}

console.log(`\n=== ① 저장된 프로젝트 (0원) ===`);
console.log(`프로젝트 ${projects.length}편 · 컷 ${cutCount}개`);
console.log(`축을 가진 컷: ${axisCutCount}개`);
console.log(`★ 바뀐 컷: ${changed.length}개  (0이어야 정상 — 저장된 컷에는 아직 축이 없다)`);
for (const c of changed) {
  console.log(`   [${c.project} 컷${c.cut}] 프롬프트${c.prompt ? " 바뀜" : " 같음"} · 각인${c.key ? " 바뀜" : " 같음"}`);
}
console.log(`폴백("${FALLBACK}")이 나오는 컷: ${fallbackCount}개 (${cutCount ? ((100 * fallbackCount) / cutCount).toFixed(1) : "0.0"}%)`);

console.log(`컷이 있는 프로젝트: ${projectsWithCuts.length}편`);

if (changed.length) {
  console.error(`\n⚠️ "옛 컷은 안 낡는다" 제약이 깨졌다. 여기서 멈춘다.`);
  process.exitCode = 2;
}

// ★ process.exit() 를 쓰지 않는다 — supabase 클라이언트가 살아 있는 상태에서 강제 종료하면
//   libuv 가 핸들 정리 중에 assert 로 죽어(윈도우 실측) 측정이 실패한 것처럼 보인다.
if (REPEATS && !changed.length) await measureShows();

async function measureShows() {

// ─────────────────────────────────────────────────────────────────────────────
// ② 화면 설계 패스 — 모델이 세 축을 답하는가 (OpenAI 만)
// ─────────────────────────────────────────────────────────────────────────────
const sources = projectsWithCuts
  .filter((p) => p.doc.briefing?.topic && p.cuts.some((c) => c.sentence))
  .map((p) => ({ id: p.id, project: p.doc, cuts: p.cuts.filter((c) => c.sentence).map((c) => ({ sentence: c.sentence, silent: c.silent })) }))
  .filter((p) => p.cuts.length >= 2)
  .slice(0, SOURCES_MAX);

if (!sources.length) {
  console.error("컷 문장이 있는 프로젝트가 없어요");
  process.exitCode = 1;
  return;
}

console.log(`\n=== ② 화면 설계 패스 (OpenAI 만, fal 0원) ===`);
console.log(`자료 ${sources.length}편 × ${REPEATS}회 = ${sources.length * REPEATS}회 (재시도 제외)`);
console.log(`예상 비용 약 $${(sources.length * REPEATS * 0.005).toFixed(2)}\n`);

async function callShows({ system, messages }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`LLM 호출 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// lib/pipeline.js 의 재시도 루프를 **그대로** 옮긴다 — 재는 대상이 그 루프의 동작이다.
// (거기서 바뀌면 여기도 바뀌어야 한다. 옮겨 적은 자리는 이 함수 하나뿐이다.)
async function designShows(src) {
  const shots = buildShowsMessages(src.project, src.cuts);
  let designed = null;
  let redoReason = null;
  let calls = 0;
  const redos = [];
  for (let i = 0; i < 2; i++) {
    const msgs = redoReason
      ? [...shots.messages, { role: "user", content: `[다시] ${redoReason}\n같은 형식으로 전부 다시 낸다.` }]
      : shots.messages;
    calls += 1;
    const got = validateShows(await callShows({ system: shots.system, messages: msgs }), src.cuts.length);
    if (got) designed = got;
    if (!got) { redoReason = "형식이 맞지 않았다"; redos.push({ round: i + 1, why: redoReason, motion: false }); continue; }
    const shot = shotBalance(got);
    const speed = speedContrast(got);
    const move = motionVariety(got);
    if (shot.ok && speed.ok && move.ok) { redoReason = null; break; }
    redoReason = [shot.reason, speed.reason, move.reason].filter(Boolean).join(" 그리고 ");
    if (i === 0) redos.push({ round: 1, why: redoReason, motion: !move.ok });
  }
  return { designed, redoReason, calls, redos };
}

const rounds = [];
const rows = [];
let motionRedos = 0;
let anyRedos = 0;
const redoLog = [];
let sampleCut = null;
let sampleProject = null;

for (let r = 0; r < REPEATS; r++) {
  const stat = { round: r + 1, cuts: 0, byAxis: Object.fromEntries(AXIS_IDS.map((id) => [id, 0])), none: 0, axisTotal: 0, failed: 0 };
  for (const src of sources) {
    let got = null;
    try {
      got = await designShows(src);
    } catch (e) {
      console.error(`  ${src.id.slice(0, 8)} 회차${r + 1} 실패: ${e.message}`);
      stat.failed += 1;
      continue;
    }
    if (got.redos.length) anyRedos += got.redos.length;
    for (const d of got.redos) {
      if (d.motion) motionRedos += 1;
      // 사유를 그대로 남긴다 — 개수만 세면 "무엇이 되돌렸는지"를 못 본다
      redoLog.push(`[${src.id.slice(0, 8)} 회차${r + 1}] ${d.why}`);
    }
    if (!got.designed) { console.error(`  ${src.id.slice(0, 8)} 회차${r + 1} 검증 실패`); stat.failed += 1; continue; }
    got.designed.forEach((d, i) => {
      const axes = axesOf(d);
      stat.cuts += 1;
      stat.axisTotal += axes.length;
      if (!axes.length) stat.none += 1;
      for (const a of axes) stat.byAxis[a.id] += 1;
      rows.push({ src: src.id.slice(0, 8), round: r + 1, idx: i, shows: d.shows, speed: d.speed || "", axes });
      if (!sampleCut && axes.length >= 2) {
        // 각인·프롬프트가 보는 것과 같은 컷 모양으로 만든다(원본 컷 + 설계 결과)
        sampleCut = { ...src.project.cuts?.[i], ...d };
        sampleProject = src.project;
      }
    });
    process.stdout.write(".");
  }
  rounds.push(stat);
}
console.log("\n");

console.log("=== 축 분포 (회차별) ===");
for (const s of rounds) {
  const pct = (n) => (s.cuts ? ((100 * n) / s.cuts).toFixed(0) : "0");
  console.log(
    `회차${s.round}: 컷 ${s.cuts}개` +
      AXIS_IDS.map((id) => ` · ${id} ${s.byAxis[id]}(${pct(s.byAxis[id])}%)`).join("") +
      ` · 축 없음 ${s.none}` +
      ` · 컷당 평균 ${s.cuts ? (s.axisTotal / s.cuts).toFixed(2) : "0"}축` +
      (s.failed ? ` · 실패 ${s.failed}편` : "")
  );
}
const total = rounds.reduce((a, s) => a + s.cuts, 0);
const sum = Object.fromEntries(AXIS_IDS.map((id) => [id, rounds.reduce((a, s) => a + s.byAxis[id], 0)]));
const none = rounds.reduce((a, s) => a + s.none, 0);
const axisTotal = rounds.reduce((a, s) => a + s.axisTotal, 0);
console.log(
  `합계: 컷 ${total}개` +
    AXIS_IDS.map((id) => ` · ${id} ${sum[id]}(${total ? ((100 * sum[id]) / total).toFixed(1) : "0"}%)`).join("") +
    ` · 축 없음 ${none} · 컷당 평균 ${total ? (axisTotal / total).toFixed(2) : "0"}축`
);

// 컷당 축 개수 분포 — 평균만 보면 "세 축 중 하나만 늘 채운다"를 못 본다
const perCut = [0, 0, 0, 0];
for (const row of rows) perCut[row.axes.length] += 1;
console.log(`컷당 축 개수: 0축 ${perCut[0]} · 1축 ${perCut[1]} · 2축 ${perCut[2]} · 3축 ${perCut[3]}`);
console.log(`\n재시도: 총 ${anyRedos}회 (그중 motionVariety 가 사유에 든 것 ${motionRedos}회)`);
for (const line of redoLog) console.log(`   ${line}`);

// ─────────────────────────────────────────────────────────────────────────────
// ③ 축이 실린 컷 하나의 최종 클립 프롬프트 — 이음새를 눈으로 본다
// ─────────────────────────────────────────────────────────────────────────────
if (sampleCut) {
  console.log(`\n=== ③ 축이 실린 컷의 최종 클립 프롬프트 ===`);
  console.log(`축: ${JSON.stringify(axesOf(sampleCut), null, 0)}`);
  console.log(`---`);
  console.log(buildClipPrompt(sampleCut, sampleProject));
  console.log(`---`);
  console.log(`각인: ${clipKey(sampleCut, sampleProject)}`);
  const p = buildClipPrompt(sampleCut, sampleProject);
  const flaws = [];
  if (/ {2}/.test(p)) flaws.push("이중 공백");
  if (/\.\./.test(p)) flaws.push("마침표 둘");
  if (/(^|\s)\.\s/.test(p)) flaws.push("부유 마침표");
  console.log(flaws.length ? `⚠️ 이음새 결함: ${flaws.join(" · ")}` : `이음새 자동 검사: 이상 없음(그래도 위 문자열을 눈으로 본다)`);
} else {
  console.log(`\n⚠️ 축이 둘 이상 실린 컷이 한 번도 안 나왔다 — 세 축 설계가 도달하지 않았다는 뜻이다.`);
}

mkdirSync("data", { recursive: true });
const out = "data/motion-axes.json";
writeFileSync(
  out,
  JSON.stringify({ repeats: REPEATS, stored: { projects: projects.length, cuts: cutCount, axisCuts: axisCutCount, changed: changed.length, fallback: fallbackCount }, rounds, rows, redos: { total: anyRedos, motion: motionRedos, log: redoLog } }, null, 1)
);
console.log(`\n원자료: ${out}`);
}
