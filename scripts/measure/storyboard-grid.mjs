// 게이트 D — **격자** 스토리보드 한 장. 가로 한 줄이 아니라 행이 둘 이상이다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/storyboard-grid.mjs [--dry]
//     --dry : 프롬프트만 조립해 보여 주고 **이미지는 안 뽑는다**(값 0).
//
// 재는 것 셋(이것이 45·60초의 전제다):
//   ① 읽기 순서 — 칸 1이 왼쪽 위에 오는가, 좌→우 위→아래로 흐르는가
//   ② 칸 경계 — 격자가 고르게 나뉘는가(한 칸이 더 크지 않은가)
//   ③ 칸 품질 — 잘라낸 칸이 굽기(720×1280)에 쓸 만한가
//
// ⚠️ 진짜 호출이다(4K $0.16). 원장은 안 거친다 — 탐침 1·2 와 같은 이유.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { AD_STYLE_LINES, AD_MOODS } from "../../lib/ad/options.js";
import { REEL_GRIDS } from "../../lib/reel/scenario-rules.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");
const dry = process.argv.includes("--dry");
// ★★ 모델만 갈아 끼운다 — 프롬프트는 글자 그대로 같다(한 번에 한 변수).
//   nano-banana-2 : aspect_ratio + resolution("4K")        · $0.16
//   gpt-image-2   : image_size + quality                    · low $0.012 · medium $0.101 · high $0.401
const gptIdx = process.argv.indexOf("--gpt");
const useGpt = gptIdx >= 0;
const qArg = process.argv[gptIdx + 1];
const quality = useGpt ? (qArg && !qArg.startsWith("--") ? qArg : "medium") : null;
const GPT_SIZE = { "9:16": "portrait_16_9", "3:4": "portrait_4_3", "4:5": "portrait_4_3",
                   "16:9": "landscape_16_9", "4:3": "landscape_4_3", "1:1": "square_hd" };

if (!existsSync("reel-scenario.json")) throw new Error("reel-scenario.json 이 없다 — reel-scene-count.mjs 를 먼저 돌려라");
const sc = JSON.parse(readFileSync("reel-scenario.json", "utf8"));
const shots = sc.shots || [];
const n = shots.length;
const grid = REEL_GRIDS[n];
if (!grid) throw new Error(`${n}칸은 격자 표에 없다`);

const settings = { format: "story", mood: "warm", narration_lang: "ko", style: "photo" };
const one = (v) => (typeof v === "string" ? v.trim() : "");

function buildGridPrompt() {
  // ★★ 판형 — 코드가 붙이는 유일한 자리(칸 수에서 나온다). 가로 한 줄과 다른 점은
  //   **읽는 순서를 말로 못 박는 것**이다. 행이 하나면 순서가 자명하지만 둘부터는 아니다.
  const head =
    `A ${n}-panel storyboard arranged as an even grid of ${grid.rows} rows by ${grid.cols} columns. ` +
    `Every panel is a vertical 9:16 frame and all panels are exactly the same size. ` +
    `The panels are read in order like a comic page: ` +
    `left to right across the top row first, then continuing left to right on the next row down. ` +
    `Panel 1 is the top-left corner and panel ${n} is the bottom-right corner. ` +
    `Thin clean even gaps separate the panels, and the grid fills the whole image edge to edge.`;

  const keep = [];
  if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
  if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
  if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);

  const panels = shots.map((s, i) => {
    const bits = [one(s.shows)];
    if (one(s.camera)) bits.push(one(s.camera));
    return `Panel ${i + 1}: ${bits.filter(Boolean).join(", ")}.`;
  });

  const mood = AD_MOODS.find((m) => m.id === settings.mood)?.line || "";
  const style = AD_STYLE_LINES[settings.style] || "";
  const tone = one(sc.tone);
  const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
    .filter(Boolean).join(". ");

  const ban = "No text, no letters, no numbers, no panel numbers, no labels or logos anywhere in the image.";
  return [head, keep.join(" "), panels.join("\n"), look, ban].filter(Boolean).join("\n\n");
}

const prompt = buildGridPrompt();
writeFileSync("storyboard-grid-prompt.txt", prompt);
console.log(`격자: ${grid.rows}×${grid.cols} · 캔버스 ${grid.canvas} · 4K`);
console.log("─".repeat(72));
console.log(prompt);
console.log("─".repeat(72));

if (dry) {
  console.log("\n--dry 라 여기서 멈춘다. 값 0. 뽑으려면 --dry 없이 다시 돌려라.");
  process.exit(0);
}

const endpoint = useGpt ? "openai/gpt-image-2" : "fal-ai/nano-banana-2";
// ★★ GPT 는 **크기를 격자에서 역산한다** — 칸 하나가 굽기 해상도(720×1280)가 되도록.
//   프리셋 문자열(portrait_16_9 등)은 전부 1024 이하라 쓸 수 없다(2026-08-24 실측).
//   그런데 image_size 에 **객체 {width,height}** 를 넘기면 fal 이 그대로 받고,
//   GPT Image 2 자체는 2160×3840(세로 4K)까지 난다. 긴 변 3840 이 상한이다.
const CELL = { w: 720, h: 1280 };
const want = { width: grid.cols * CELL.w, height: grid.rows * CELL.h };
const scale = Math.min(1, 3840 / Math.max(want.width, want.height));
const gptSize = { width: Math.round(want.width * scale / 8) * 8, height: Math.round(want.height * scale / 8) * 8 };
const input = useGpt
  ? { prompt, image_size: gptSize, num_images: 1, quality }
  : { prompt, aspect_ratio: grid.canvas, num_images: 1, resolution: "4K" };
const priced = useGpt ? ({ low: 0.012, medium: 0.101, high: 0.401 }[quality] ?? 0.101) : 0.16;
console.log(`
이미지 뽑는 중 — ${endpoint} · ${useGpt ? `${quality} ${gptSize.width}x${gptSize.height}` : "4K"} ($${priced}) …`);
const res = await fetch(`https://fal.run/${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify(input),
});
if (!res.ok) throw new Error(`실패 (${res.status}) ${(await res.text()).slice(0, 400)}`);
const url = (await res.json())?.images?.[0]?.url;
if (!url) throw new Error("이미지 주소를 못 받았다");
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const outName = process.env.OUT || (useGpt ? "storyboard-gpt.png" : "storyboard-grid.png");
writeFileSync(outName, buf);
console.log(`내려받음: ${outName} (${(buf.length / 1024).toFixed(0)} KB)`);
