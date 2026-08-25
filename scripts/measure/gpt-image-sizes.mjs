// openai/gpt-image-2 의 image_size 프리셋이 실제로 몇 픽셀인가 — **크기만** 잰다.
//
//   node scripts/measure/gpt-image-sizes.mjs
//
// ★ 프롬프트를 짧게 둔다 — 크기는 프롬프트와 무관하고, quality 는 low 라 개당 $0.012 다.
//   목적 하나: 스토리보드 칸이 굽기(720×1280)보다 커질 수 있는 프리셋이 있는가.
import { readFileSync } from "fs";
import sharp from "sharp";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

const SIZES = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];
const NEED = [720, 1280];
console.log(`프리셋 ${SIZES.length}개 × $0.012 = $${(SIZES.length * 0.012).toFixed(3)}\n`);

for (const image_size of SIZES) {
  try {
    const res = await fetch("https://fal.run/openai/gpt-image-2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
      body: JSON.stringify({ prompt: "a plain red apple on a white table", image_size, num_images: 1, quality: "low" }),
    });
    if (!res.ok) { console.log(`${image_size.padEnd(16)} 실패 ${res.status} ${(await res.text()).slice(0, 80)}`); continue; }
    const img = (await res.json())?.images?.[0];
    // ★ 응답에 width/height 가 없다(실측) — 바이트를 받아 직접 재는 것이 유일한 길이다.
    const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
    const meta = await sharp(buf).metadata();
    const w = meta.width, h = meta.height;
    // 3×3 격자로 나눴을 때 칸이 굽기보다 큰가
    const cw = Math.floor(w / 3), ch = Math.floor(h / 3);
    const ok = cw >= NEED[0] && ch >= NEED[1];
    console.log(`${image_size.padEnd(16)} ${String(w + "x" + h).padEnd(12)} 3×3 칸 ${String(cw + "x" + ch).padEnd(11)} ${(cw / NEED[0]).toFixed(2)}배 ${ok ? "✅" : "✗"}`);
  } catch (e) {
    console.log(`${image_size.padEnd(16)} 오류 ${e.message.slice(0, 60)}`);
  }
}
