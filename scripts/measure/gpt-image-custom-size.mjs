// fal 의 openai/gpt-image-2 가 **커스텀 크기**를 받는가 — 프리셋 문자열 대신 {width,height}.
//
// ★ 배경: 프리셋 여섯은 전부 1024 이하였다(실측). 그런데 GPT Image 2 자체는 2160×3840
//   (세로 4K)까지 낸다 — 즉 1024 제한은 **모델이 아니라 fal 래퍼**일 수 있다.
//   되면 3×3 격자에서 칸이 720×1280 = 굽기와 정확히 같아진다.
import { readFileSync } from "fs";
import sharp from "sharp";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.FAL_KEY;

const TRIES = [
  { label: "객체 {2160x3840}", body: { image_size: { width: 2160, height: 3840 } } },
  { label: "객체 {1536x2048}", body: { image_size: { width: 1536, height: 2048 } } },
  { label: "문자열 2160x3840", body: { image_size: "2160x3840" } },
];

for (const t of TRIES) {
  try {
    const res = await fetch("https://fal.run/openai/gpt-image-2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
      body: JSON.stringify({ prompt: "a plain red apple on a white table", num_images: 1, quality: "low", ...t.body }),
    });
    if (!res.ok) { console.log(`${t.label.padEnd(20)} 거절 ${res.status} ${(await res.text()).slice(0, 140)}`); continue; }
    const img = (await res.json())?.images?.[0];
    const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
    const m = await sharp(buf).metadata();
    const cw = Math.floor(m.width / 3), ch = Math.floor(m.height / 3);
    console.log(`${t.label.padEnd(20)} ✅ ${m.width}x${m.height} · 3×3 칸 ${cw}x${ch} · 굽기 대비 ${(cw / 720).toFixed(2)}배`);
  } catch (e) { console.log(`${t.label.padEnd(20)} 오류 ${e.message.slice(0, 80)}`); }
}
