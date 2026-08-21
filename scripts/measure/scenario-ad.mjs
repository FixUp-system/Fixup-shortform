// 광고 시나리오를 실제로 뽑아 **규칙 위반과 의도 반영**을 센다.
//
//   node scripts/measure/scenario-ad.mjs [반복]
//
// ⚠️ 진짜 돈이 나간다 — Claude 호출만 하고 fal 은 한 번도 안 부른다(영상·이미지 0).
//    회당 ≈$0.06. 원장(cost_records)은 안 거친다 — probe-claude.mjs 와 같은 규율이다.
//
// ★ 왜 scripts/measure/scenario.mjs 를 못 쓰나: 그쪽은 **컷 분할 경로**(lib/scenario.js)를
//   잰다. 통짜로 굽는 광고 경로(lib/ad/scenario.js)를 재는 자리는 여기가 처음이다.
//
// ★★ 이 스크립트는 **재는 대상을 베끼지 않는다** — 진짜 buildScenarioMessages·
//    validateScenario·scenarioSchemaFor 를 부르고 HTTP 한 겹만 갈아 끼운다.
import { readFile } from "fs/promises";
import { register } from "node:module";

// lib/* 에 확장자 없는 import(`./fake`)가 있어 순수 node 에서 안 풀린다(scenario.mjs 와 같은 방식).
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(spec, ctx, next) {" +
        " try { return await next(spec, ctx); } catch (e) {" +
        " if (spec.startsWith('.') && !/\\.[cm]?js$/.test(spec)) return await next(spec + '.js', ctx);" +
        " throw e; } }"
    )
);

const { buildScenarioMessages, validateScenario } = await import("../../lib/ad/scenario.js");
const { scenarioSchemaFor, CLAUDE_MODEL } = await import("../../lib/ad/llm.js");
const { withSpokenLines } = await import("../../lib/ad/generate.js");

async function loadEnvLocal() {
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) return;
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // 없으면 환경변수에 기대한다
  }
}
await loadEnvLocal();
const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("CLAUDE_API_KEY 가 필요해요 (.env.local 또는 환경변수)");

const REPEATS = Number(process.argv[2]) || 3;

// ── 소재
//
// ★ **예시 오염을 피한다**(스킬 measuring-llm-prompt-changes): 지문의 ✓/✗ 예시와 소재도
//   동사도 겹치면 모델이 예시를 베끼고, 그러면 개선인지 복사인지 못 가린다.
//   지문의 예시는 키링·야구단·토끼·카페·집 주방·제빵사다 — 전부 피했다.
// ★ **사람 중심 + 사진 없음 + format:story** 를 고른 이유가 셋 다 다르다:
//   · 사람 중심 — cast 가 없던 시절 wardrobe 가 사람을 떠맡던 자리다
//   · 사진 없음 — 얼굴을 고정할 참조가 없어 글이 유일한 재료인 최악의 조건이다
//   · story — beat 가 "설명하지 않는다"라, 나레이션 개수로 포맷 반영을 잴 수 있다
const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "story", style: "photo", mood: "dynamic",
};
const material = {
  text:
    "실내 클라이밍장 광고입니다. 처음 오는 사람도 한 시간이면 벽 하나를 완주합니다. " +
    "강사가 옆에 붙어서 발 놓을 자리를 알려 줍니다. 평일은 밤 열한 시까지 엽니다.",
  photos: [],
};

// ── 개선 전 기준선 (2026-08-21, 같은 소재·같은 스크립트 얼개로 3회 측정)
//
// ★ 왜 숫자를 박아 두나: 개선 전 코드는 이미 고쳐졌고, 되살려 재려면 8KB 짜리 지문 사본을
//   스크립트에 넣어야 한다(그러면 두 벌이 된다). 대신 **그때 실제로 나온 값**을 적어 둔다 —
//   이 줄들은 재현 기록이지 판정 기준이 아니다. 다시 재고 싶으면 git 으로 그 커밋을 꺼낸다.
const BEFORE = {
  systemChars: 8170,
  castFilled: "0/3 (칸 자체가 없었다)",
  wardrobeTwoPeople: "3/3 — 두 사람을 한 칸에 우겨 넣었다",
  narrationLines: "3/3 회차 모두 3줄 (format:story 의 '설명하지 않는다'가 무시됐다)",
};

// ── 판정 (코드가 센다 — 눈으로 읽고 좋아졌다고 말하지 않는다)
//
// ★ 옷 칸에 사람이 둘 이상 섞였는가. 개선 전에 3/3 으로 나온 모양이 전부
//   "A…; B…" 였다(세미콜론으로 두 사람을 잇는다). 역할 낱말이 함께 오면 더 확실하다.
const ROLE_WORDS = /\b(instructor|coach|staff|trainer|employee|the other|second person)\b/i;
function wardrobeHasTwoPeople(w) {
  const s = (w || "").trim();
  if (!s) return false;
  return s.includes(";") || ROLE_WORDS.test(s);
}

function judge(sc) {
  const shots = Array.isArray(sc?.shots) ? sc.shots : [];
  const secs = shots.reduce((a, s) => a + (Number(s.seconds) || 0), 0);
  const lines = shots.filter((s) => (s.line || "").trim()).length;
  const prompt = withSpokenLines(sc.text, shots, sc.voice, sc);
  const problems = [];
  if (secs !== settings.seconds) problems.push(`초 합계 ${secs}초 (목표 ${settings.seconds}초)`);
  if (!shots.length) problems.push("장면 0개");
  if (shots.length > 4) problems.push(`장면 ${shots.length}개 (지문은 넷을 넘기지 말라고 한다)`);
  if (wardrobeHasTwoPeople(sc.wardrobe)) problems.push("옷 칸에 사람이 둘 이상 섞였다");
  for (const s of shots) {
    if ((s.line || "").trim() && !(s.speaker || "").trim()) problems.push("대사가 있는데 화자가 없다");
  }
  // 사장님이 적은 사실이 대사에 남았는가 — 누락을 센다(의도 반영의 최소선).
  const spoken = shots.map((s) => s.line || "").join(" ");
  const facts = [
    { name: "한 시간/완주", re: /한 ?시간|완주/ },
    { name: "강사 코칭", re: /강사|알려|짚어|코칭/ },
    { name: "영업시간", re: /열한|11시|밤/ },
  ];
  const missed = facts.filter((f) => !f.re.test(spoken)).map((f) => f.name);
  return { secs, lines, shots: shots.length, prompt, problems, missed };
}

async function call() {
  const { system, messages } = buildScenarioMessages({ kind: "ad", settings, material });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // thinking 필드를 아예 안 보낸다 — lib/ad/llm.js 와 같은 이유(Fable 은 사고가 항상 켜져 있다).
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 8192, system, messages,
      output_config: { format: { type: "json_schema", schema: scenarioSchemaFor("ad") } },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`실패 (${res.status})\n${text.slice(0, 800)}`);
  const data = JSON.parse(text);
  const block = Array.isArray(data.content) ? data.content.find((c) => c?.type === "text") : null;
  const usage = data?.usage || {};
  return {
    system,
    scenario: validateScenario(JSON.parse(block?.text ?? "{}"), 0),
    cost: ((usage.input_tokens || 0) / 1e6) * 3 + ((usage.output_tokens || 0) / 1e6) * 15,
  };
}

console.log(`소재: ${material.text}`);
console.log(`설정: ${settings.seconds}초 · ${settings.aspect_ratio} · ${settings.format}/${settings.mood}/${settings.style} · 사진 0장\n`);

let total = 0;
const rows = [];
for (let r = 1; r <= REPEATS; r++) {
  const { system, scenario, cost } = await call();
  total += cost;
  const j = judge(scenario);
  rows.push({ scenario, j, systemChars: system.length });
  console.log(`${"=".repeat(72)}\n${r}회차 · 지문 ${system.length}자 · ≈$${cost.toFixed(4)}`);
  console.log(`  focus=${scenario.focus} · 장면 ${j.shots}개 · 초 합계 ${j.secs}초 · 대사 ${j.lines}줄`);
  console.log(`  cast      ${scenario.cast || "(빈칸)"}`);
  console.log(`  wardrobe  ${scenario.wardrobe || "(빈칸)"}${wardrobeHasTwoPeople(scenario.wardrobe) ? "   ← 두 사람 섞임" : ""}`);
  console.log(`  결함      ${j.problems.length ? j.problems.join(" · ") : "없음"}`);
  console.log(`  사실 누락 ${j.missed.length ? j.missed.join(" · ") : "없음"}`);
}

const filled = rows.filter((x) => (x.scenario.cast || "").trim()).length;
const dirty = rows.filter((x) => wardrobeHasTwoPeople(x.scenario.wardrobe)).length;
const clean = rows.filter((x) => x.j.problems.length === 0).length;
console.log(`\n${"=".repeat(72)}\n합계 ${REPEATS}회 · ≈$${total.toFixed(4)} (fal 호출 0)`);
console.log(`  지문 길이      ${rows[0].systemChars}자   (개선 전 ${BEFORE.systemChars}자)`);
console.log(`  cast 채움      ${filled}/${REPEATS}   (개선 전 ${BEFORE.castFilled})`);
console.log(`  옷 칸 오염     ${dirty}/${REPEATS}   (개선 전 ${BEFORE.wardrobeTwoPeople})`);
console.log(`  결함 없음      ${clean}/${REPEATS}`);
console.log(`  대사 줄 수     ${rows.map((x) => x.j.lines).join(",")}   (개선 전 ${BEFORE.narrationLines})`);
console.log(`\n── 마지막 회차의 최종 지시문 ──\n${rows.at(-1).j.prompt}`);
