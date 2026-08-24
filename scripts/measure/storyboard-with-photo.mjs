// 탐침 A — **사장님이 올린 진짜 사진을 참조로** 스토리보드를 뽑는다.
//
// 재는 것 하나: **제품의 글자("Giants")가 칸에서 읽히는가.**
//   깨지면 스토리보드 방식은 글자 있는 제품에 안 맞는다는 뜻이고, 그것을 $0.16 으로 안다.
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/storyboard-with-photo.mjs <projectId> [해상도]
//   보기) … storyboard-with-photo.mjs 9e79e3c2-e303-4c0e-82b9-a5656e6def59 4K
//
// ★ 참조가 있으면 엔드포인트가 `/edit` 이다 — lib/imagegen.js:52 와 같은 규약.
// ★ 프롬프트는 프로덕션 조립기와 같은 모양으로 만든다(글자 금지 문장까지 그대로).
//   시나리오의 shows 가 글자를 요구하고 꼬리가 금지하는 **그 충돌 그대로** 보내는 것이 이 탐침의 요점이다.
// ⚠️ 진짜 호출이다. 원장은 안 거친다.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { AD_STYLE_LINES, AD_MOODS } from "../../lib/ad/options.js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");
const id = process.argv[2];
if (!id) throw new Error("프로젝트 id 를 넘겨라");
const resolution = process.argv[3] || "4K";

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await db.from("projects").select("doc").eq("id", id).single();
if (error) throw new Error(error.message);
const doc = data.doc;
const sc = doc.scenario || {};
const shots = sc.shots || [];
const st = doc.settings || {};

// ── 사진 바이트를 읽어 data URI 로 ─────────────────────────────────────────
const photos = doc.material?.photos || [];
if (!photos.length) throw new Error("올린 사진이 없다 — 이 탐침은 사진이 있어야 뜻이 있다");
const refs = [];
for (const p of photos) {
  const name = (p.url || "").split("/").pop();
  const { data: blob, error: e2 } = await db.storage.from("uploads").download(name);
  if (e2) { console.log(`⚠️ 사진을 못 읽었다: ${name} — ${e2.message}`); continue; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const ext = (name.split(".").pop() || "jpg").toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  refs.push(`data:${mime};base64,${buf.toString("base64")}`);
  console.log(`사진 실림: ${p.filename}  (${(buf.length / 1024).toFixed(0)} KB)  vision.lettering=${JSON.stringify(p.vision?.lettering)}`);
}
if (!refs.length) throw new Error("실을 사진이 하나도 없다");

// ── 프롬프트 조립 (탐침 2 와 같은 함수) ────────────────────────────────────
const PRESET_BY_PANELS = { 2: "1:1", 3: "16:9", 4: "21:9" };
const one = (v) => (typeof v === "string" ? v.trim() : "");
const n = shots.length;

const head =
  `A ${n}-panel storyboard laid out as a single wide strip, ${n} vertical 9:16 frames ` +
  `placed side by side in a row, in order from left to right, with a thin clean gap between panels.`;
const keep = [];
if (one(sc.look)) keep.push(`The subject looks the same in every panel: ${one(sc.look)}.`);
if (one(sc.wardrobe)) keep.push(`The person wears the same throughout: ${one(sc.wardrobe)}.`);
if (one(sc.environment)) keep.push(`The whole sequence takes place in ${one(sc.environment)}.`);
const panels = shots.map((s, i) => {
  const bits = [one(s.shows)];
  if (one(s.camera)) bits.push(one(s.camera));
  return `Panel ${i + 1}: ${bits.filter(Boolean).join(", ")}.`;
});
const mood = AD_MOODS.find((m) => m.id === st.mood)?.line || "";
const style = AD_STYLE_LINES[st.style] || "";
const tone = one(sc.tone);
const look = [mood, style, tone && `Color treatment: ${tone}`, `Consistent color grade across all ${n} panels.`]
  .filter(Boolean).join(". ");
// ★ 참조 사진이 있을 때의 문장 — lib/film/mode.js 가 쓰는 것과 같은 뜻이다.
const attach = `The attached photo is the real product. Reproduce it exactly as photographed in every panel.`;
const ban = "No text, no letters, no numbers, no labels or logos added anywhere in the image.";
const prompt = [head, keep.join(" "), panels.join("\n"), look, attach, ban].filter(Boolean).join("\n\n");

writeFileSync("photo-storyboard-prompt.txt", prompt);
console.log("\n── 보내는 프롬프트 ──────────────────────────────────────────");
console.log(prompt);
console.log("─────────────────────────────────────────────────────────────\n");

const aspect = PRESET_BY_PANELS[n];
if (!aspect) { console.log(`⚠️ 컷이 ${n}개 — 가로 한 줄 프리셋이 없다. 멈춘다.`); process.exit(0); }

const PRICE = { "0.5K": "$0.06", "1K": "$0.08", "2K": "$0.12", "4K": "$0.16" }[resolution] || "?";
console.log(`뽑는 중 — fal-ai/nano-banana-2/edit · aspect=${aspect} · ${resolution} (${PRICE}) · 참조 ${refs.length}장 …`);
const res = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
  body: JSON.stringify({ prompt, aspect_ratio: aspect, num_images: 1, resolution, image_urls: refs }),
});
if (!res.ok) { console.log(`거절 ${res.status}: ${(await res.text()).slice(0, 500)}`); process.exit(1); }
const img = (await res.json())?.images?.[0];
console.log(`성공 — ${img?.width ?? "?"}×${img?.height ?? "?"}`);
console.log(`URL: ${img?.url}`);
let k = 1; const stamp = () => `photo-sb-${String(k).padStart(2, "0")}.png`;
while (existsSync(stamp())) k += 1;
const out = stamp();
writeFileSync(out, Buffer.from(await (await fetch(img.url)).arrayBuffer()));
console.log(`내려받음: ${out}`);
