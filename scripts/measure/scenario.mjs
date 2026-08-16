// ②시나리오가 규칙을 얼마나 지키는가 — 지문 품질을 문장으로 주장하지 않고 실제로 잰다.
//
//   node scripts/measure/scenario.mjs [반복] [길이초]
//   node scripts/measure/scenario.mjs 1 15      자료 3편 × 1회, 15초 (기본값)
//   node scripts/measure/scenario.mjs 3 30      자료 3편 × 3회, 30초
//
// ★ 왜 이 자리를 재는가: 이 파이프라인에서 **자동 장치가 하나도 없는 유일한 단계**가
//   시나리오다. 옛 원고에는 되돌리기 라운드와 채점(scriptScore)이 있었지만, 시나리오는
//   사람이 화면에서 보는 것 말고는 아무 장치가 없다. 그러니 지문이 좋은지 나쁜지를 아는
//   방법이 이 측정뿐이다.
//
// 재는 것:
//  ① **규칙 위반율** — checkScenario 의 problems 를 규칙별로 나눠 센다.
//     ★ generateScenario 는 **한 번 재시도**한다. 그래서 **1차 답과 최종 답을 따로** 센다 —
//       재시도가 실제로 고치는지가 이 수치의 핵심이다(고치지 않으면 값·시간만 치른다).
//  ② **장면 수 분포**와 **장면 길이 분포**
//  ③ **내레이션 비율** — speaker 가 "내레이션" 인 장면의 비율, 그리고 **narrator_voice 가
//     실제로 오는지**. 2026-08-17 에 전제가 정정됐다: Seedance 는 내레이션을 한다(광고에서
//     흔한 기법). 그래서 높은 비율은 이제 결함이 아니다 — 대신 내레이션이 있는데
//     narrator_voice 가 비면 **컷마다 다른 사람이 읽는다**(그것이 지금 재야 할 위험이다).
//  ④ 마지막에 **시나리오 하나를 통째로** 출력한다. 수치는 나쁜 장면을 보여 주지 않는다.
//
// ⚠️ 원장(cost_records)에 기록을 남기지 않는다 — motion-axes.mjs·shows-motion-leak.mjs 와
//    같은 규율이다. lib/llm.js 의 callJson 은 assertBudget·addRecord 를 물고 있어 측정이
//    사장님 계정의 그물(체험 한도·잔액)에 걸린다. generateScenario 가 call 을 주입받으므로
//    **재는 대상(생성·재시도 루프·검증·판정)은 진짜 코드 그대로**이고, HTTP 한 겹만 갈아
//    끼운다. 모델·temperature·response_format 은 llm.js 와 같게 맞춘다.
//    예상 비용은 usage 로 직접 계산해 출력한다(OpenAI 만 — **fal 호출 0, 이미지·영상·목소리
//    를 한 번도 안 부른다**).
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "fs";

// lib/* 에 확장자 없는 import(`./fake`)가 있어 순수 node 에서 안 풀린다.
// 재는 대상이 **진짜 generateScenario** 이므로 베끼지 않고 해석기를 한 겹 얹는다.
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

const { generateScenario, validateScenario } = await import("../../lib/scenario.js");
const { checkScenario } = await import("../../lib/scenario-rules.js");
const { DEFAULT_I2V_MODEL, minSecondsFor, clipProfileForProject } = await import("../../lib/clip-limits.js");

const REPEATS = Number(process.argv[2]) || 1;
const SECONDS = Number(process.argv[3]) || 15;

// 자료 셋 — run-pipeline.mjs 와 같은 소재를 쓴다(비교가 되게). 얕은 것·중간·긴 것 하나씩:
// 얕은 자료에서 지켜지는 규칙과 긴 자료에서 지켜지는 규칙이 다를 수 있어서다.
const MATERIALS = {
  shallow: `스포츠카를 광고하는 영상을 만들어줘. 스포츠카의 빠름과 역동적인 모습 그리고 멋있는 디자인을 강조하고 싶어`,

  workshop: `연남동에서 6년째 하는 도자기 공방입니다. 원래는 제 그릇만 만들다가 3년 전부터 수업을 시작했어요.
물레는 안 가르치고 손으로만 빚습니다. 손으로 빚으면 그날 만든 걸 그대로 구워서 보냅니다.
수업은 한 번에 한 명만 받습니다. 수요일은 가마 굽는 날이라 쉽니다.
만든 건 2주 뒤에 택배로 보내드립니다. 유약 색은 다섯 가지 중에 고르시면 돼요.`,

  tailor: `성수동에서 옷 수선집을 합니다. 12년 됐어요. 그전에는 백화점 수선실에서 8년 일했습니다.
백화점에선 손님 얼굴을 못 봤어요. 내가 고친 옷을 누가 어떻게 입는지 모르니까 재미가 없더라고요.
치수는 손님이 입은 채로 잽니다. 벗어놓고 재면 어깨가 어디서 떨어지는지 알 수가 없어요.
바지 밑단은 3,000원, 허리 줄이는 건 8,000원입니다. 재킷 어깨는 4만 원부터고요.
가게는 성수역 3번 출구에서 걸어서 5분, 세탁소 옆 골목입니다. 화요일은 쉽니다.`,
};

// 프로젝트 모양은 **새 프로젝트가 실제로 저장되는 모양**과 같게 만든다 —
// app/api/projects/route.js 가 i2v_model 을 DEFAULT_I2V_MODEL 로 명시 저장한다.
// 이 값이 빠지면 LEGACY(Kling, 하한 3초)로 떨어져 지문이 사장님이 보는 것과 달라진다.
function projectOf(key) {
  return {
    id: `measure-${key}`,
    settings: { target_seconds: SECONDS, aspect_ratio: "9:16", i2v_model: DEFAULT_I2V_MODEL },
    material: { text: MATERIALS[key], photos: [] },
  };
}

// 규칙을 problems 문구로 되짚는다. ★ 문구는 lib/scenario-rules.js 한 곳에서 나오므로
// 여기 정규식이 안 맞으면 그쪽이 바뀐 것이다 — 안 맞은 것은 "기타"로 그대로 출력한다
// (조용히 0으로 뭉개면 규칙이 하나 사라진 것을 못 본다).
const RULES = [
  ["합", /초의 합이/],
  ["장면 수 상한", /까지만 담을 수 있어요/],
  ["장면 길이 상한", /그림 한 장은/],
  ["장면 길이 하한", /짧은 장면을 만들지 못해요/],
  ["화자 없음", /말하는 사람이 없어요/],
  ["내레이터 목소리 없음", /내레이터 목소리가 비어 있어요/],
  ["장면 0개", /장면이 하나도 없어요/],
];

function ruleOf(problem) {
  for (const [name, re] of RULES) if (re.test(problem)) return name;
  return `기타: ${problem}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 한 겹 — 원장을 안 거친다(머리 주석 참고). usage 로 비용을 직접 잰다.
// ─────────────────────────────────────────────────────────────────────────────
const RATE = { in: 2.5 / 1e6, out: 10 / 1e6 }; // lib/costs.js 의 gpt-4o 단가와 같다
let usdTotal = 0;
let httpCalls = 0;

function makeCall(collector) {
  return async function call({ system, messages }) {
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
    httpCalls += 1;
    usdTotal += (data?.usage?.prompt_tokens || 0) * RATE.in + (data?.usage?.completion_tokens || 0) * RATE.out;
    const parsed = JSON.parse(data.choices[0].message.content);
    // 회차마다의 **원답**을 모은다 — generateScenario 는 최종 답만 돌려주므로
    // 1차 답을 따로 세려면 여기서 잡는 수밖에 없다(루프를 베끼지 않는 이유).
    collector.push(parsed);
    return parsed;
  };
}

const keys = Object.keys(MATERIALS);
const profile = clipProfileForProject(projectOf(keys[0]));
console.log(`시나리오 측정 — 자료 ${keys.length}편 × ${REPEATS}회 = ${keys.length * REPEATS}회`);
console.log(`목표 ${SECONDS}초 · 모델 ${DEFAULT_I2V_MODEL}(장면 하한 ${minSecondsFor(profile)}초) · fal 호출 0\n`);

const runs = [];
for (let r = 0; r < REPEATS; r++) {
  for (const key of keys) {
    const project = projectOf(key);
    const raws = [];
    let out = null;
    try {
      out = await generateScenario(project, { call: makeCall(raws) });
    } catch (e) {
      console.error(`  [${key} 회차${r + 1}] 실패: ${e.message}`);
      runs.push({ key, round: r + 1, failed: e.message });
      continue;
    }

    // 각 시도를 **같은 판정기**로 다시 본다 — 1차/최종을 따로 세기 위해서다.
    const attempts = raws.map((raw) => {
      const v = validateScenario(raw);
      if (!v) return { ok: false, problems: ["형식이 맞지 않았어요."], scenario: null };
      const c = checkScenario(v, project);
      return { ok: c.ok, problems: c.problems, scenario: v };
    });

    runs.push({
      key, round: r + 1,
      calls: out.calls,
      first: attempts[0] || null,
      final: attempts[attempts.length - 1] || null,
      scenario: out.scenario,
      problems: out.problems,
    });
    process.stdout.write(".");
  }
}
console.log("\n");

const ok = runs.filter((x) => !x.failed);
if (!ok.length) {
  console.error("성공한 회차가 없다 — 위 오류를 본다.");
  process.exitCode = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 규칙 위반율 — 1차 vs 최종
// ─────────────────────────────────────────────────────────────────────────────
function tally(stage) {
  const by = new Map();
  let violating = 0;
  for (const run of ok) {
    const a = run[stage];
    if (!a) continue;
    if (!a.ok) violating += 1;
    for (const p of a.problems) by.set(ruleOf(p), (by.get(ruleOf(p)) || 0) + 1);
  }
  return { violating, by };
}

const first = tally("first");
const final = tally("final");
const n = ok.length;
const pct = (x) => (n ? ((100 * x) / n).toFixed(0) : "0");

console.log("=== ① 규칙 위반율 (회차 " + n + ") ===");
console.log(`1차 답: 위반 ${first.violating}/${n} (${pct(first.violating)}%)`);
console.log(`최종 답: 위반 ${final.violating}/${n} (${pct(final.violating)}%)`);
console.log(`재시도가 실제로 돈 회차: ${ok.filter((x) => x.calls > 1).length}/${n}`);
const retried = ok.filter((x) => x.calls > 1);
const fixed = retried.filter((x) => x.final?.ok).length;
console.log(`  그중 재시도가 고친 회차: ${fixed}/${retried.length}` + (retried.length ? "" : " (재시도가 없었다)"));

console.log(`\n규칙별 위반 횟수 (같은 회차에서 여러 번 걸릴 수 있다):`);
const allRules = new Set([...first.by.keys(), ...final.by.keys()]);
if (!allRules.size) console.log(`   (없음 — 1차·최종 모두 규칙을 전부 지켰다)`);
for (const rule of allRules) {
  console.log(`   ${rule}: 1차 ${first.by.get(rule) || 0}회 → 최종 ${final.by.get(rule) || 0}회`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 장면 수·장면 길이 분포 (최종 답 기준)
// ─────────────────────────────────────────────────────────────────────────────
const finals = ok.map((x) => x.scenario).filter(Boolean);
const sceneCounts = finals.map((s) => s.shots.length);
const lengths = finals.flatMap((s) => s.shots.map((x) => x.seconds));
const hist = (arr) => {
  const m = new Map();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => `${v}:${c}개`).join(" · ");
};
const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "0");

console.log(`\n=== ② 장면 수·길이 분포 (최종 답 ${finals.length}편) ===`);
console.log(`장면 수: ${hist(sceneCounts)} · 평균 ${avg(sceneCounts)}개`);
console.log(`장면 길이(초): ${hist(lengths)} · 평균 ${avg(lengths)}초 · 총 장면 ${lengths.length}개`);

// ─────────────────────────────────────────────────────────────────────────────
// ③ 내레이션 비율
// ─────────────────────────────────────────────────────────────────────────────
const shots = finals.flatMap((s) => s.shots);
const speaking = shots.filter((s) => s.line);
const narration = shots.filter((s) => s.speaker === "내레이션");
const share = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "0.0");

console.log(`\n=== ③ 내레이션 비율 ===`);
console.log(`전체 장면 ${shots.length}개 중 내레이션 ${narration.length}개 (${share(narration.length, shots.length)}%)`);
console.log(`대사 있는 장면 ${speaking.length}개 중 내레이션 ${narration.length}개 (${share(narration.length, speaking.length)}%)`);
console.log(`무음 장면(line 없음): ${shots.length - speaking.length}개`);
const speakers = new Map();
for (const s of speaking) speakers.set(s.speaker || "(없음)", (speakers.get(s.speaker || "(없음)") || 0) + 1);
console.log(`화자: ${[...speakers.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") || "(없음)"}`);
// ★ 회차별로도 낸다 — 합계 하나로 뭉치면 "어떤 자료는 전부 내레이션"이 평균에 묻힌다.
//   실제로 그렇다: 사람 없는 소재(물건 광고)는 100%, 사장님 이야기는 0% 로 갈린다.
for (const run of ok) {
  const ss = run.scenario?.shots || [];
  const nn = ss.filter((s) => s.speaker === "내레이션").length;
  const nv = run.scenario?.narrator_voice || "";
  console.log(`   [${run.key} 회차${run.round}] ${nn}/${ss.length} (${share(nn, ss.length)}%) · focus ${run.scenario?.focus?.mode || "-"} · narrator_voice ${nv ? `"${nv}"` : "(없음)"}`);
}
// ★ 재는 것이 바뀌었다(2026-08-17) — 비율이 아니라 **내레이터 목소리의 유무**다.
//   비율이 높은 것은 정상(광고 기법)이고, 목소리가 비는 것이 컷마다 사람이 바뀌는 원인이다.
const needVoice = ok.filter((x) => (x.scenario?.shots || []).some((s) => s.line && /내레이[션터]|나레이[션터]/.test(String(s.speaker || "").replace(/\s+/g, ""))));
const gotVoice = needVoice.filter((x) => String(x.scenario?.narrator_voice || "").trim());
console.log(`\n내레이션이 있는 회차 ${needVoice.length}개 중 narrator_voice 가 온 회차 ${gotVoice.length}개`);
if (needVoice.length && gotVoice.length < needVoice.length) {
  console.log(`⚠️ 내레이션이 있는데 목소리가 빈 회차가 있다 — 그 편은 컷마다 다른 사람이 읽는다.`);
  console.log(`   화면에 칸이 있어 사장님이 채울 수 있고, 확정은 checkScenario 가 막는다.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 시나리오 하나를 통째로 — 수치는 나쁜 장면을 보여 주지 않는다
// ─────────────────────────────────────────────────────────────────────────────
const sample = ok.find((x) => x.scenario);
if (sample) {
  console.log(`\n=== ④ 시나리오 전체 (자료 ${sample.key} · 회차 ${sample.round}) ===`);
  console.log(`topic: ${sample.scenario.topic}`);
  console.log(`focus: ${JSON.stringify(sample.scenario.focus)}`);
  console.log(`angle: ${sample.scenario.angle}`);
  console.log(`narrator_voice: ${sample.scenario.narrator_voice || "(없음)"}`);
  sample.scenario.shots.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.seconds}초 · 화자 ${s.speaker || "(무음)"}`);
    console.log(`      beat: ${s.beat}`);
    console.log(`      line: ${s.line || "(없음)"}`);
  });
  console.log(`남은 problems: ${sample.problems.length ? sample.problems.join(" ") : "없음"}`);
}

console.log(`\nOpenAI 호출 ${httpCalls}회 · 실측 비용 $${usdTotal.toFixed(4)} (회차당 약 $${(usdTotal / Math.max(1, n)).toFixed(4)}) · fal $0`);

mkdirSync("data", { recursive: true });
const out = "data/scenario-measure.json";
writeFileSync(out, JSON.stringify({ repeats: REPEATS, seconds: SECONDS, runs, usd: usdTotal }, null, 1));
console.log(`원자료: ${out}`);
