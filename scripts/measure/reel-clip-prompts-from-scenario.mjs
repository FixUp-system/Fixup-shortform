// 컷마다 **실제로 나가는 영상 프롬프트**를 뽑는다 — 다른 서비스에서 그대로 시험해 보려고.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/reel-clip-prompts-from-scenario.mjs
//
// ★★ 파이프라인과 **같은 함수**를 쓴다(베끼지 않는다):
//   buildReelCuts(라우트) → buildClipPromptMessages(순수) → fable-5 → buildClipPrompt(꼬리)
// ⚠️ LLM 호출이 컷 수만큼 나간다(claude-fable-5, 몇 센트). 원장은 안 거친다 — 탐침 규약.
import { readFileSync, writeFileSync } from "fs";
import { buildReelCuts } from "../../app/api/reel/[id]/scenario/route.js";
import { buildClipPromptMessages, CLIP_PROMPT_SYSTEM } from "../../lib/reel/clip-prompt.js";
import { buildClipPrompt } from "../../lib/cuts.js";
import { CLAUDE_MODEL } from "../../lib/ad/llm.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!KEY) throw new Error("CLAUDE_API_KEY 를 못 찾았다");

const scenario = JSON.parse(readFileSync("reel-scenario.json", "utf8"));
const project = {
  scenario,
  settings: { format: "story", mood: "warm", narration_lang: "ko", style: "photo",
              seconds: 30, aspect_ratio: "9:16", target_seconds: 30 },
  material: { text: "", photos: [] },
  cast: [],
};
const cuts = buildReelCuts(scenario);
const n = cuts.length;

async function writeBody(cut, i) {
  const { system, messages } = (() => {
    const msgs = buildClipPromptMessages(cut, project, {
      sceneNo: i + 1, sceneCount: n,
      prevShows: i > 0 ? (cuts[i - 1]?.shows || "") : "",
    });
    return { system: CLIP_PROMPT_SYSTEM, messages: msgs.messages || msgs };
  })();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 2048, system, messages,
      output_config: { format: { type: "json_schema", schema: {
        type: "object", properties: { body: { type: "string" } }, required: ["body"], additionalProperties: false,
      } } },
    }),
  });
  if (!res.ok) throw new Error(`컷 ${i + 1} 실패 (${res.status}) ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.content.find((b) => b.type === "text").text).body;
}

const out = [];
for (const [i, cut] of cuts.entries()) {
  process.stdout.write(`컷 ${i + 1}/${n} 쓰는 중 …\n`);
  const body = await writeBody(cut, i);
  // ★ 꼬리는 코드가 붙인다 — 여기가 실제로 fal 에 나가는 문장 전체다.
  //   attach:"refs" 는 참조를 들고 r2v 로 갈 때다. 스토리보드+i2v 면 참조가 없으므로
  //   둘 다 뽑아 나란히 둔다(§4 의 갈림 그대로).
  const withRefs = buildClipPrompt({ ...cut, clip_prompt: body }, project, {
    body, sceneNo: i + 1, sceneCount: n, attach: "refs",
  });
  const plain = buildClipPrompt({ ...cut, clip_prompt: body }, project, {
    body, sceneNo: i + 1, sceneCount: n,
  });
  out.push({ n: i + 1, seconds: cut.seconds, shows: cut.shows, body, withRefs, plain });
}

writeFileSync("reel-clip-prompts.json", JSON.stringify(out, null, 2));
const txt = out.map((o) =>
  `${"═".repeat(76)}\n컷 ${o.n} · ${o.seconds}초\n${"═".repeat(76)}\n${o.plain}\n`
).join("\n");
writeFileSync("reel-clip-prompts.txt", txt);
console.log("\n저장: reel-clip-prompts.txt · reel-clip-prompts.json\n");
console.log(txt);
