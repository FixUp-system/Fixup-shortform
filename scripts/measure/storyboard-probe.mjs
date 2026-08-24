// 일회용 탐침 — 스토리보드 한 장이 쓸 만한지만 본다. 앱 코드는 안 건드린다.
//
// 재는 것 셋:
//   ① 임의 비율("36:16")을 nano-banana-2 가 받는가 (안 받으면 프리셋으로 물러난다)
//   ② 칸 경계가 깨끗한가 (자를 때 옆 칸이 딸려오지 않는가)
//   ③ 칸 하나가 굽기 해상도(720×1280)보다 큰가
//
// ⚠️ 우리 예산·원장 층을 안 지난다(일회용이라 프로젝트 비용이 아니다). 값은 여기 적는다:
//    nano-banana-2 4K = $0.16 · 2K = $0.12 · 1K = $0.08
import { readFileSync, writeFileSync } from "fs";

const env = readFileSync(process.argv[2] || ".env.local", "utf8");
const KEY = (env.match(/^FAL_KEY=(.*)$/m) || [])[1]?.trim();
if (!KEY) throw new Error("FAL_KEY 를 못 찾았다");

// 가짜 관통에서 쓴 것과 같은 소재 — 비교가 되게.
// ★ 글자 금지는 우리 규율 그대로 싣는다.
const PROMPT = `A four-panel storyboard laid out as a single wide strip, four vertical 9:16 frames placed side by side in a row, in order from left to right, with a thin clean gap between panels.

The same young woman appears in every panel, wearing the same oatmeal-beige knit sweater, her hair tied back the same way. The same brown kraft coffee bag and the same white ceramic mug appear throughout.

Panel 1: she opens the front door and picks up a small parcel from the doorstep, morning light behind her.
Panel 2: close on her hands tearing the kraft bag open, coffee beans visible inside.
Panel 3: she pours hot water over a dripper, steam rising, shot from the side.
Panel 4: she holds the mug with both hands near a window and looks out, calm.

Warm and intimate, golden hour light, gentle handheld feel. Live-action cinematic footage, realistic lighting, shallow depth of field. Consistent color grade across all four panels.

No text, no letters, no numbers, no labels or logos anywhere in the image.`;

async function tryOne(aspect_ratio, resolution) {
  const body = { prompt: PROMPT, aspect_ratio, num_images: 1, resolution };
  const res = await fetch("https://fal.run/fal-ai/nano-banana-2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, aspect_ratio, resolution };
}

const attempts = [
  ["36:16", "4K"], // 4칸 × 9:16 = 정확한 값
  ["21:9", "4K"],  // 가까운 흔한 프리셋
  ["16:9", "4K"],  // 최후 폴백
];

let done = null;
for (const [ar, r] of attempts) {
  process.stdout.write(`시도: aspect_ratio=${ar} resolution=${r} … `);
  const out = await tryOne(ar, r);
  if (out.ok) {
    const data = JSON.parse(out.text);
    const url = data?.images?.[0]?.url;
    const w = data?.images?.[0]?.width, h = data?.images?.[0]?.height;
    console.log(`성공 — ${w}×${h}`);
    done = { ...out, url, w, h };
    break;
  }
  console.log(`거절 ${out.status}: ${out.text.slice(0, 160)}`);
}

if (!done) { console.log("\n세 번 다 거절됐다 — 비율/해상도 값을 다시 봐야 한다."); process.exit(1); }

console.log(`\nURL: ${done.url}`);
console.log(`쓴 비율: ${done.aspect_ratio} · 해상도 티어: ${done.resolution}`);
const panelW = Math.round(done.w / 4);
console.log(`칸 하나(추정): ${panelW} × ${done.h}   ← 굽기 해상도 720×1280 과 비교`);
console.log(panelW >= 720 && done.h >= 1280 ? "→ 칸이 굽기 해상도보다 크다 ✅" : "→ ⚠️ 칸이 굽기 해상도보다 작다");

const buf = Buffer.from(await (await fetch(done.url)).arrayBuffer());
writeFileSync("storyboard.png", buf);
console.log(`내려받음: storyboard.png (${(buf.length / 1024).toFixed(0)} KB)`);
