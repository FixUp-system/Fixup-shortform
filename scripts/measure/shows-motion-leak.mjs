// shows 에 움직임이 섞이는 빈도를 재고, 걸러낼 규칙의 정밀도를 본다.
//
//   node scripts/measure/shows-motion-leak.mjs [반복]
//
// 화면 설계 패스만 반복해 부른다 — 이미지·클립·목소리를 부르지 않으므로 fal 비용이 0이고
// OpenAI 만 쓴다(편당 약 $0.005). 기존 프로젝트의 컷 문장을 자료로 재활용한다.
//
// 왜 필요한가: SHOWS_SYSTEM 에 "shows 에는 카메라 움직임을 적지 않는다"가 굵게 적혀 있는데도
// 지켜지지 않아 "자전거 바퀴가 천천히 회전한다"가 이미지 프롬프트로 갔다(2026-07-28 관통).
// 코드로 걸러야 하는데, 판정선을 감으로 정하면 정당한 상태 서술("작업대에 공구들이 놓여 있다")
// 까지 지운다. 그래서 분포를 먼저 센다.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const REPEATS = Number(process.argv[2]) || 3;
const DIR = "data/projects";

// 절이 무엇으로 끝나는지로만 판정한다.
// 절 안의 동사를 훑으면 "초등학생이 자전거를 타고 지나가며 손을 흔드는 풀 샷"을 오검출한다 —
// 지나가며·흔드는이 들어 있지만 명사로 끝나므로 구도 서술이다.
export const RULES = {
  구도: (s) => !/(다|요)$/.test(s),          // 명사구·관형형+명사
  결과상태: (s) => /(어|아|여)\s*있다$/.test(s), // "놓여 있다" — 정지 그림
  진행상: (s) => /고\s*있다$/.test(s),         // "돌고 있다" — 움직임
  속도부사: (s) => /(천천히|서서히|빠르게|점점|조금씩|서서|계속)/.test(s),
};

export function looksLikeMotion(clause) {
  const s = clause.trim();
  if (RULES.구도(s)) return false;
  if (RULES.결과상태(s)) return false;
  return RULES.진행상(s) || RULES.속도부사(s);
}

function clausesOf(shows) {
  return (shows || "").split(/,\s*/).map((c) => c.trim()).filter(Boolean);
}

// 기존 프로젝트에서 (원고, 컷 문장) 을 모은다 — 화면 설계 패스의 입력이다
function collectSources() {
  const out = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    const p = JSON.parse(readFileSync(path.join(DIR, f), "utf8"));
    const cuts = (p.cuts || []).filter((c) => c.sentence);
    if (!cuts.length || !p.briefing?.topic) continue;
    out.push({ id: p.id, project: p, cuts: cuts.map((c) => ({ sentence: c.sentence })) });
  }
  return out;
}

// lib/cuts.js 는 의존이 없는 순수 모듈이라 그대로 import 된다 — 재는 대상이 이 프롬프트다.
// lib/llm.js 는 확장자 없는 import 사슬(./fake → ./costs)이 있어 순수 node 에서 안 풀린다.
// 그래서 HTTP 만 여기서 직접 부른다(모델·temperature·response_format 은 llm.js 와 같게).
// ⚠️ 이 경로는 costs.json 에 기록을 남기지 않는다 — 아래 예상 비용으로 갈음한다.
const { buildShowsMessages } = await import("../../lib/cuts.js");

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

// validateShows 와 같은 판정을 하되 의존 없이 — shots 개수·shows 필수만 본다
function validateShows(obj, cutCount) {
  if (!obj || !Array.isArray(obj.shots) || obj.shots.length !== cutCount) return null;
  const out = [];
  for (const s of obj.shots) {
    const shows = typeof s?.shows === "string" ? s.shows.trim() : "";
    if (!shows) return null;
    out.push({ shows, motion: typeof s?.motion === "string" ? s.motion.trim() : "" });
  }
  return out;
}

const sources = collectSources();
if (!sources.length) {
  console.error("컷 문장이 있는 프로젝트가 없어요");
  process.exit(1);
}
console.log(`자료 ${sources.length}편 × ${REPEATS}회 = ${sources.length * REPEATS}회 호출`);
console.log(`예상 비용 약 $${(sources.length * REPEATS * 0.005).toFixed(2)} (OpenAI 만)\n`);

const rows = [];
for (let r = 0; r < REPEATS; r++) {
  for (const src of sources) {
    const shots = buildShowsMessages(src.project, src.cuts);
    let designed = null;
    try {
      designed = validateShows(await callShows(shots), src.cuts.length);
    } catch (e) {
      console.error(`  ${src.id.slice(0, 8)} 회차${r + 1} 실패: ${e.message}`);
      continue;
    }
    if (!designed) { console.error(`  ${src.id.slice(0, 8)} 회차${r + 1} 검증 실패`); continue; }
    designed.forEach((d, i) => rows.push({ src: src.id.slice(0, 8), round: r + 1, idx: i, shows: d.shows, motion: d.motion || "" }));
    process.stdout.write(".");
  }
}
console.log("\n");

const all = [];
for (const row of rows) for (const cl of clausesOf(row.shows)) all.push({ ...row, clause: cl });

const flagged = all.filter((c) => looksLikeMotion(c.clause));
console.log(`컷 ${rows.length}개 · 절 ${all.length}개 · 움직임 판정 ${flagged.length}개 (${(100 * flagged.length / all.length).toFixed(1)}%)\n`);

console.log("=== 움직임으로 판정된 절 (오검출이 있는지 눈으로 본다) ===");
for (const c of flagged) console.log(`  [${c.src} 회차${c.round} 컷${c.idx + 1}] ${c.clause}`);

// 판정되지 않은 종결형 절 — 여기에 놓친 움직임이 숨는다
const sentenceKept = all.filter((c) => !RULES.구도(c.clause) && !looksLikeMotion(c.clause));
console.log(`\n=== 문장으로 끝나지만 유지된 절 ${sentenceKept.length}개 (놓친 움직임이 있는지 본다) ===`);
for (const c of sentenceKept) console.log(`  ${c.clause}`);

const out = "data/shows-motion-leak.json";
writeFileSync(out, JSON.stringify({ repeats: REPEATS, rows, flagged: flagged.map((f) => f.clause) }, null, 1));
console.log(`\n원자료: ${out}`);
