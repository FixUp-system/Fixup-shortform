// 탐침 5 — **내가 쓴 프롬프트로** 스토리보드를 뽑는다.
//
// my-prompt.txt 를 읽어 그대로 보낸다. 조립도 안 하고 손도 안 댄다.
// 프롬프트를 고쳐 가며 여러 번 돌려 보는 자리다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/storyboard-my-prompt.mjs [모델] [크기] [품질]
//
//   모델   nb  = nano-banana-2 (기본)   ·  gpt = gpt-image-2
//   크기   nb  : auto 21:9 16:9 3:2 4:3 5:4 1:1 4:5 3:4 2:3 …   (기본 16:9)
//          gpt : square_hd square portrait_4_3 portrait_16_9 landscape_4_3 landscape_16_9
//                                                              (기본 landscape_16_9)
//   품질   nb  : 0.5K 1K 2K 4K           (기본 4K)
//          gpt : auto low medium high    (기본 medium)
//
//   보기)  … storyboard-my-prompt.mjs
//          … storyboard-my-prompt.mjs nb 21:9 4K
//          … storyboard-my-prompt.mjs gpt landscape_16_9 low
//
// 값(장당): nb 0.5K $0.06 · 1K $0.08 · 2K $0.12 · 4K $0.16
//           gpt low $0.012 · medium $0.101 · high $0.401
// ⚠️ 진짜 호출이다. 원장(cost_records)은 안 거친다 — 다른 탐침과 같은 이유.
import { readFileSync, writeFileSync, existsSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

const FILE = "my-prompt.txt";
if (!existsSync(FILE)) {
  // 처음이면 지금까지 조립된 프롬프트를 씨앗으로 깔아 준다 — 빈 파일보다 고치기 쉽다.
  const seed = existsSync("probe-storyboard-prompt.txt")
    ? readFileSync("probe-storyboard-prompt.txt", "utf8")
    : "여기에 프롬프트를 적으세요.\n";
  writeFileSync(FILE, seed);
  console.log(`${FILE} 을 만들었습니다 — 열어서 고친 뒤 다시 돌리세요.`);
  console.log(`(씨앗으로 지금까지 조립된 프롬프트를 넣어 뒀습니다)`);
  process.exit(0);
}

const prompt = readFileSync(FILE, "utf8").trim();
if (!prompt) throw new Error(`${FILE} 이 비어 있다`);

const model = (process.argv[2] || "nb").toLowerCase();
const isGpt = model === "gpt";
const size = process.argv[3] || (isGpt ? "landscape_16_9" : "16:9");
const qual = process.argv[4] || (isGpt ? "medium" : "4K");

const PRICE = isGpt
  ? { low: "$0.012", medium: "$0.101", high: "$0.401", auto: "?" }[qual] || "?"
  : { "0.5K": "$0.06", "1K": "$0.08", "2K": "$0.12", "4K": "$0.16" }[qual] || "?";

const endpoint = isGpt ? "openai/gpt-image-2" : "fal-ai/nano-banana-2";
const input = isGpt
  ? { prompt, image_size: size, quality: qual, num_images: 1 }
  : { prompt, aspect_ratio: size, resolution: qual, num_images: 1 };

console.log(`프롬프트 ${prompt.length}자 (${FILE})`);
console.log(`모델 ${endpoint} · 크기 ${size} · 품질 ${qual} · 값 ${PRICE}\n`);
console.log("─".repeat(74));
console.log(prompt.length > 600 ? prompt.slice(0, 600) + "\n… (생략)" : prompt);
console.log("─".repeat(74) + "\n");

const res = await fetch(`https://fal.run/${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify(input),
});
if (!res.ok) {
  console.log(`거절 ${res.status}: ${(await res.text()).slice(0, 500)}`);
  console.log("\n★ 422 면 위 메시지가 **받는 값 목록**을 알려 준다 — 그대로 골라 다시 돌리면 된다.");
  process.exit(1);
}
const data = await res.json();
const img = data?.images?.[0];
console.log(`성공 — ${img?.width ?? "?"}×${img?.height ?? "?"}`);
console.log(`URL: ${img?.url}`);

// 덮어쓰지 않는다 — 프롬프트를 고쳐 가며 여러 번 돌리는 자리라 이전 판이 남아야 비교가 된다.
let n = 1;
const stamp = () => `my-${model}-${String(n).padStart(2, "0")}.png`;
while (existsSync(stamp())) n += 1;
const out = stamp();
writeFileSync(out, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
console.log(`내려받음: ${out}`);
