// ★★ **같은 입력, 모델만 바꾼다** — reel 이 seedance-2.0 으로 구운 그 프롬프트·그 스토리보드를
//   MiniMax H3 에 그대로 넘긴다(r2v).
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/bake-storyboard-h3.mjs [재료json] [해상도]
//
// 왜: 2026-08-28 실측에서 seedance-2.0 480p 결과에 결함 둘이 나왔다 —
//   ① 캔 로고의 **폰트가 다르다** ② 운동 장면에서 **바벨이 몸을 통과한다**.
//   사장님 물음: "모델의 차이일까 아님 프롬프트의 문제일까?"
//   프롬프트를 한 글자도 안 바꾸고 모델만 갈면 그 답이 갈린다.
//
// ⚠️ **완전한 대조는 아니다.** H3 는 2K·4K 만 있어 480p 로 못 맞춘다 — 화질이 함께 바뀐다.
//   그래서 "좋아졌다"가 모델 덕인지 화질 덕인지는 이 한 번으로 못 가른다.
//   다만 **바벨이 몸을 통과하는 것 같은 구조적 왜곡**은 화질과 별개라 판정에 쓸 수 있다.
//
// ⚠️ 진짜 호출이다(2K 15초 ≈$1.95 · 4K ≈$2.40).
//
// ★ 참조 규약이 Seedance 와 **다르다**(lib/ad/models.js 의 minimax-h3 항목):
//   필드가 `reference_image_urls` 이고(Seedance 는 `image_urls`), 프롬프트에서는
//   "Image 1, Image 2" 로 지칭한다. 상한은 스키마 maxItems 9.
import { readFileSync, writeFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 가 없어요");

const file = process.argv[2] || "h3-ab.json";
const resolution = process.argv[3] || "2K";
const { prompt, sheet, aspect, seconds } = JSON.parse(readFileSync(file, "utf8"));

// fal 공시 단가(lib/ad/models.js · lib/costs.js 와 같은 값이어야 한다)
const PER_SEC = { "480P": 0.05, "768P": 0.06, "2K": 0.13, "4K": 0.16 }[resolution];
if (!PER_SEC) throw new Error(`모르는 해상도: ${resolution}`);

console.log(`모델      : MiniMax H3 (r2v)`);
console.log(`참조      : 스토리보드 1장 — 첫 5장 무료라 참조 값은 0`);
console.log(`프롬프트  : ${prompt.length}자 — seedance 굽기에 나간 것과 **글자 그대로 같다**`);
console.log(`설정      : ${resolution} · ${seconds}초 · ${aspect}`);
console.log(`값        : $${(PER_SEC * seconds).toFixed(3)}`);
console.log(`\n굽는 중 … (출력 1초당 30초 안팎 걸린다)\n`);

const t0 = Date.now();
const res = await fetch("https://fal.run/minimax/h3/reference-to-video", {
  method: "POST",
  headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt,
    duration: seconds,
    aspect_ratio: aspect,
    resolution,
    reference_image_urls: [sheet],
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`실패 ${res.status}\n${text.slice(0, 800)}`);
  process.exit(1);
}
const data = JSON.parse(text);
const url = data?.video?.url || data?.url || "";
const took = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`끝났다 — ${took}초`);
console.log(`영상: ${url}`);
writeFileSync("h3-ab-out.json", JSON.stringify({ url, took, resolution, seconds, usd: PER_SEC * seconds, raw: data }, null, 2));
console.log(`\n(h3-ab-out.json 에 적었다)`);
