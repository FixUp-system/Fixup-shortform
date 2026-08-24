// 탐침 4 — 스토리보드 칸이 **영상 모델에 어떻게 전달되는지** 굽기 직전까지 본다.
//
// 굽지 않는다. fal 은 한 번도 안 부른다. 값은 fable5 호출 컷 수만큼(몇 센트)뿐이다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/reel-clip-prompts.mjs
//
// 보여 주는 것 셋:
//   ① 영상 프롬프트 LLM(claude-fable-5)이 쓴 **본문**
//   ② 코드가 붙인 **꼬리**까지 합친 최종 프롬프트  ← 실제로 fal 에 나가는 그 문자열
//   ③ 그 호출에 **무엇이 참조로 실리는가** (컷 그림 + ref_ids)
//
// ★ 프로덕션과 같은 함수를 쓴다: lib/reel/clip-prompt.js 의 writeClipPromptBody,
//   lib/cuts.js 의 buildClipPrompt. 새로 짓지 않는다.
// ⚠️ 원장(cost_records)은 안 거친다 — 탐침 1~3 과 같은 이유.
import { readFileSync, existsSync } from "fs";
import { writeClipPromptBody } from "../../lib/reel/clip-prompt.js";
import { buildClipPrompt, isNarrationSpeaker } from "../../lib/cuts.js";
import { SCENARIO_SCHEMA, CLAUDE_MODEL } from "../../lib/ad/llm.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const CLAUDE_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!CLAUDE_KEY) throw new Error("CLAUDE_API_KEY 를 못 찾았다");
if (!existsSync("probe-scenario.json")) throw new Error("probe-scenario.json 이 없다");

const scenario = JSON.parse(readFileSync("probe-scenario.json", "utf8"));

// ── 컷 만들기 ──────────────────────────────────────────────────────────────
// ⚠️⚠️ app/api/reel/[id]/scenario/route.js 의 buildReelCuts 를 **글자 그대로** 옮긴 것이다
//    (그 함수는 export 가 아니라 import 할 수 없다).
//    ★ 처음에 옮길 때 `speaker` 줄을 빠뜨려 **전 컷이 화면 안 대사로 떨어졌다** —
//      제품 클로즈업에까지 립싱크가 붙어 "프로덕션 버그"로 오해할 뻔했다.
//      옮겨 적기는 이렇게 조용히 틀린다. 그쪽이 바뀌면 여기도 반드시 본다.
const shots = scenario.shots || [];
const environment = typeof scenario?.environment === "string" ? scenario.environment.trim() : "";
const tone = typeof scenario?.tone === "string" ? scenario.tone.trim() : "";
const cuts = shots.map((s, i) => {
  const sentence = typeof s?.line === "string" ? s.line.trim() : "";
  const narration = Boolean(sentence) && isNarrationSpeaker(s?.speaker);
  return {
    idx: i,
    shows: typeof s?.shows === "string" ? s.shows.trim() : "",
    camera: typeof s?.camera === "string" ? s.camera.trim() : "",
    lighting: typeof s?.lighting === "string" ? s.lighting.trim() : "",
    action: typeof s?.action === "string" ? s.action.trim() : "",
    sound: typeof s?.sound === "string" ? s.sound.trim() : "",
    ...(environment ? { environment } : {}),
    ...(tone ? { tone } : {}),
    seconds: Math.round(Number(s?.seconds) || 0),
    sentence,
    ...(narration ? { narration: true } : {}),
  };
});
console.log("컷별 화자 판정 —");
for (const [i, c] of cuts.entries()) {
  console.log(`  [${i + 1}] speaker=${JSON.stringify(shots[i]?.speaker)} → ${c.narration ? "내레이션(화면 밖)" : "화면 안 대사"}`);
}
console.log();

// 합성 cast — buildReelCast 와 **같은 규칙**이다:
//   speakingCuts = 대사가 있고 내레이션이 아닌 컷.  비면 **빈 배열**을 낸다.
// ★ 내레이션 컷은 cast 를 안 본다 — speechFor 가 scenario.narrator_voice 를 읽는다.
//   그래서 이 시나리오(전 컷 내레이션)에서는 cast 가 비어도 목소리가 실린다.
const speakingCuts = cuts.filter((c) => c.sentence && !c.narration).map((c) => c.idx);
const cast = speakingCuts.length
  ? [{ id: "reel-voice", who: "", look: "", voice: scenario.voice || "", cuts: speakingCuts }]
  : [];
const project = {
  settings: { i2v_model: "seedance-2.0", speech_lang: "ko", aspect_ratio: "9:16", resolution: "480p" },
  // narrator_voice 는 시나리오 라우트가 저장할 때 채운다(scenario/route.js) — 그대로 재현한다.
  scenario: { ...scenario, narrator_voice: scenario.voice },
  cuts,
  cast,
};
console.log(`cast — 화면 안 대사 컷 ${speakingCuts.length}개 → ${cast.length ? "합성 항목 1개" : "빈 배열(내레이션뿐)"}
`);

// ── fable5 를 직접 부르는 주입 구현 ────────────────────────────────────────
// writeClipPromptBody 의 callJsonImpl 자리에 넣는다 — 그래야 assertBudget→costActor
// (uuid 요구)를 안 지난다. 보내는 몸통은 lib/ad/llm.js 와 같은 모양이다.
async function callJsonDirect({ system, messages, schema }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 4096, system, messages,
      output_config: { format: { type: "json_schema", schema: schema || SCENARIO_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`LLM 실패 (${res.status}) ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse((data.content || []).find((c) => c?.type === "text")?.text ?? "{}");
}

// ── 돈다 ───────────────────────────────────────────────────────────────────
console.log(`컷 ${cuts.length}개 — 영상 프롬프트를 만든다(claude-fable-5, 컷당 몇 센트)\n`);

for (const [i, cut] of cuts.entries()) {
  const body = await writeClipPromptBody(cut, project, {
    sceneNo: i + 1,
    sceneCount: cuts.length,
    prevShows: i > 0 ? cuts[i - 1].shows : "",
    callJsonImpl: callJsonDirect,
  });
  cut.clip_prompt = body;

  const full = buildClipPrompt(cut, project, {
    body, sceneNo: i + 1, sceneCount: cuts.length, attach: "refs",
  });

  console.log("═".repeat(78));
  console.log(`컷 ${i + 1} / ${cuts.length}   (${cut.seconds}초)`);
  console.log("═".repeat(78));
  console.log("\n▌① LLM 이 쓴 본문\n");
  console.log(body);
  console.log("\n▌② 실제로 fal 에 나가는 최종 프롬프트\n");
  console.log(full);
  console.log("\n▌③ 이 호출에 실리는 것\n");
  console.log(`   엔드포인트  bytedance/seedance-2.0/reference-to-video   (refs 가 있을 때)`);
  console.log(`   image_urls  [0] 스토리보드에서 잘라낸 칸 ${i + 1}  (cut${i + 1}.jpg, 1728×3072)`);
  console.log(`               [1..] cut.ref_ids 로 붙는 인물·제품 참조 — 이 탐침에는 없음`);
  console.log(`   duration    ${cut.seconds}초  ·  aspect 9:16  ·  resolution 480p`);
  console.log();
}

console.log("═".repeat(78));
console.log("굽지 않았다. fal 은 한 번도 안 불렀다.");
