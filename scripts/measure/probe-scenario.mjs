// Task 20 실측 — 시나리오 SYSTEM 을 "광고 CF 연출·촬영·조명·음향 감독"으로 다시 쓴 것이
// 실제로 카메라·조명·음향 지시를 늘리고 글자 요구를 안 늘리는지, 문장으로 주장하지 않고
// 진짜 API 를 두 번 불러 나란히 본다.
//
//   node scripts/measure/probe-scenario.mjs
//
// .env.local 에서 CLAUDE_API_KEY 를 읽는다(scripts/measure/probe-claude.mjs 와 같은 방식).
// ⚠️ 진짜 돈이 나간다 — 승인된 예산은 ~$0.10(두 번 호출)이다. 원장(cost_records)은 안 거친다
// (probe-claude.mjs 와 같은 이유: 이 스크립트는 배선이 아니라 프롬프트 품질을 잰다).
import { readFile } from "fs/promises";
import { buildScenarioMessages } from "../../lib/ad/scenario.js";
import { SCENARIO_SCHEMA, CLAUDE_MODEL } from "../../lib/ad/llm.js";

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

// ★ 고치기 전 스냅샷 — lib/ad/scenario.js 20-35행(2026-08-13 편집 전, git show
// 6c5bb5b:lib/ad/scenario.js 로 재확인 가능)을 그대로 옮겼다. 파일은 이미 새 SYSTEM 으로
// 바뀌었으므로 "전"을 다시 살릴 방법이 이 리터럴뿐이다.
const OLD_SYSTEM = `너는 15초짜리 광고 영상의 연출자다.
사장님이 준 설명과 옵션을 읽고, 영상 생성 모델에 그대로 넘길 **하나의 지시문**을 쓴다.

지켜야 할 것:
- 전체 길이는 정확히 주어진 초 수다. 장면을 나눠도 합이 그 길이다
- 장면마다 카메라(앵글·움직임)·액션·분위기를 말로 적는다. "슬로우 푸시인", "로우 트래킹" 처럼 사람이 쓰는 말로 쓴다
- 나레이션은 주어진 언어로 쓴다. 대사는 짧게 — 15초에 두 문장을 넘기지 않는다
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다
- 사진이 주어졌으면 그 안의 제품·인물·로고를 지키라고 명시한다

JSON 으로만 답한다:
{
  "text": "모델에 넘길 지시문 전체 (영어로 쓴다)",
  "shots": [{ "beat": "이 장면이 하는 일(한국어)", "camera": "...", "action": "...", "line": "나레이션 대사" }],
  "endpoint": "i2v 또는 r2v (사진이 정확히 1장일 때만 의미가 있다)"
}`;

// ★ 고치기 전 스키마 — lib/ad/llm.js 의 SCENARIO_SCHEMA 가 편집 전에 갖고 있던 모양
// (beat·camera·action·line 만, required 없음). 새 스키마는 lib/ad/llm.js 에서 import 한다
// (실제로 배포될 것을 그대로 잰다 — 손으로 다시 옮겨 적어 드리프트가 생기지 않게).
const OLD_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beat: { type: "string" },
          camera: { type: "string" },
          action: { type: "string" },
          line: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    endpoint: { type: "string" },
  },
  required: ["text", "shots"],
  additionalProperties: false,
};

// 사용자가 Claude 앱(Fable)에서 직접 물어봤던 것과 같은 소재 — 농구화 광고·역동적·전연령·
// 15초·9:16·한국어. 같은 주문이라야 두 결과가 비교된다.
const settings = {
  seconds: 15, aspect_ratio: "9:16", narration_lang: "ko",
  format: "hero", style: "photo", mood: "dynamic",
};
const material = {
  text: "농구화 광고입니다. 역동적인 느낌으로, 전 연령이 볼 수 있게 만들어 주세요.",
  photos: [],
};

// 새 SYSTEM·user 메시지는 실제 buildScenarioMessages 를 그대로 부른다 — 배포될 것을 잰다.
const { system: NEW_SYSTEM, messages } = buildScenarioMessages({ settings, material });

async function callAnthropic({ label, system, schema }) {
  console.log(`\n${"=".repeat(70)}\n→ [${label}] POST https://api.anthropic.com/v1/messages (model=${CLAUDE_MODEL})`);
  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // ★★ thinking 필드를 아예 안 보낸다 — lib/ad/llm.js 와 같은 이유.
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema } },
    }),
  });
  const text = await res.text();
  console.log(`← [${label}] ${res.status} (${Math.round((Date.now() - started) / 1000)}초)`);
  if (!res.ok) throw new Error(`[${label}] 탐침 실패 (${res.status})\n${text.slice(0, 1000)}`);

  const data = JSON.parse(text);
  const block = Array.isArray(data.content) ? data.content.find((c) => c?.type === "text") : null;
  const raw = block?.text ?? "";
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.log(`  ⚠ JSON 파싱 실패 — stop_reason=${data.stop_reason}, 원문:`, raw.slice(0, 500));
  }

  const usage = data.usage || {};
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const costUsd = (inTok * 10 + outTok * 50) / 1e6; // lib/costs.js 의 claude-fable-5 단가와 같다

  return { label, stopReason: data.stop_reason, inTok, outTok, costUsd, parsed, raw };
}

// 장면마다 카메라·조명·음향 지시가 실제로 있는지 세고, 글자·자막·로고를 요구한 자리를 찾는다.
// ★ "있음" 판정은 필드가 존재하고 빈 문자열이 아닌 것을 기준으로 한다 — 있음/없음을 감이
//   아니라 값으로 센다.
const TEXT_ON_SCREEN_KEYWORDS = [
  "자막", "로고", "카피", "타이포", "워터마크",
  "text overlay", "on-screen text", "subtitle", "caption", "logo", "typograph", "watermark",
];

function analyze(result) {
  const shots = Array.isArray(result.parsed?.shots) ? result.parsed.shots : [];
  const hasVal = (v) => typeof v === "string" && v.trim().length > 0;
  const cameraCount = shots.filter((s) => hasVal(s?.camera)).length;
  const lightingCount = shots.filter((s) => hasVal(s?.lighting)).length;
  const soundCount = shots.filter((s) => hasVal(s?.sound)).length;
  const actionCount = shots.filter((s) => hasVal(s?.action)).length;
  const secondsVals = shots.map((s) => (typeof s?.seconds === "number" ? s.seconds : null));
  const secondsSum = secondsVals.every((v) => v !== null) && secondsVals.length > 0
    ? secondsVals.reduce((a, b) => a + b, 0)
    : null;

  const haystack = JSON.stringify(result.parsed || {});
  const textMentions = [];
  for (const kw of TEXT_ON_SCREEN_KEYWORDS) {
    const re = new RegExp(kw, "gi");
    let m;
    while ((m = re.exec(haystack))) {
      const start = Math.max(0, m.index - 30);
      textMentions.push({ keyword: kw, context: haystack.slice(start, m.index + kw.length + 30) });
    }
  }

  return {
    sceneCount: shots.length,
    cameraCount, lightingCount, soundCount, actionCount,
    secondsSum, secondsVals,
    textMentionCount: textMentions.length,
    textMentions,
  };
}

console.log("실행: Task 20 — 시나리오 SYSTEM 고치기 전/후 실측");
console.log("주문: 농구화 광고 · 역동적 · 전연령 · 15초 · 9:16 · 한국어");

const before = await callAnthropic({ label: "고치기 전", system: OLD_SYSTEM, schema: OLD_SCHEMA });
const after = await callAnthropic({ label: "고친 후", system: NEW_SYSTEM, schema: SCENARIO_SCHEMA });

for (const r of [before, after]) {
  console.log(`\n${"-".repeat(70)}\n[${r.label}] stop_reason=${r.stopReason} in=${r.inTok}tok out=${r.outTok}tok ≈$${r.costUsd.toFixed(4)}`);
  console.log(JSON.stringify(r.parsed, null, 2));
}

const a1 = analyze(before);
const a2 = analyze(after);

console.log(`\n${"=".repeat(70)}\n수치 비교 (감이 아니라 센 것)\n${"=".repeat(70)}`);
console.log(`                          고치기 전    고친 후`);
console.log(`장면 수                  ${String(a1.sceneCount).padEnd(13)}${a2.sceneCount}`);
console.log(`카메라 지시 있는 장면    ${String(`${a1.cameraCount}/${a1.sceneCount}`).padEnd(13)}${a2.cameraCount}/${a2.sceneCount}`);
console.log(`조명 지시 있는 장면      ${String(`${a1.lightingCount}/${a1.sceneCount}`).padEnd(13)}${a2.lightingCount}/${a2.sceneCount}`);
console.log(`음향 지시 있는 장면      ${String(`${a1.soundCount}/${a1.sceneCount}`).padEnd(13)}${a2.soundCount}/${a2.sceneCount}`);
console.log(`모션(action) 있는 장면   ${String(`${a1.actionCount}/${a1.sceneCount}`).padEnd(13)}${a2.actionCount}/${a2.sceneCount}`);
console.log(`장면 초 합 (목표 15)     ${String(a1.secondsSum ?? "필드 없음").padEnd(13)}${a2.secondsSum ?? "필드 없음"}`);
console.log(`글자·자막·로고 요구 자리 ${String(a1.textMentionCount).padEnd(13)}${a2.textMentionCount}`);
console.log(`총 비용                 $${before.costUsd.toFixed(4)} + $${after.costUsd.toFixed(4)} = $${(before.costUsd + after.costUsd).toFixed(4)}`);

if (a1.textMentionCount > 0) {
  console.log(`\n[고치기 전] 글자·자막·로고 언급 상세:`);
  for (const m of a1.textMentions) console.log(`  - "${m.keyword}": ...${m.context}...`);
}
if (a2.textMentionCount > 0) {
  console.log(`\n[고친 후] 글자·자막·로고 언급 상세 (0이어야 하는데 있다면 문제):`);
  for (const m of a2.textMentions) console.log(`  - "${m.keyword}": ...${m.context}...`);
}
