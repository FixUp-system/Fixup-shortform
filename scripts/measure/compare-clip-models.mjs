// 같은 이미지·같은 움직임 지시를 두 클립 모델에 보내 나란히 놓는다.
//
//   node scripts/measure/compare-clip-models.mjs <projectId> <컷번호> [모델A] [모델B]
//   기본값: A=fal-ai/ltx-2.3/image-to-video/fast (지금)
//           B=fal-ai/kling-video/v3/standard/image-to-video (후보)
//
// ⚠️ 유료다. 컷 하나에 A 1개 + B 1개다(7초 컷이면 약 ＄0.91).
//    사장님 승인 없이 돌리지 않는다.
//
// 왜 같은 이미지여야 하는가: 이미지가 다르면 무엇이 효과였는지 못 가린다. 페달 사건에서
// 배운 것이다 — 클립을 다섯 번 다시 만들었지만 결함은 이미지 단계의 것이었다.
//
// 왜 저장된 프로젝트를 안 고치는가: 컷별 [다시 만들기]를 쓰면 클립이 덮여 비교 대상이 사라진다.
// 여기서는 URL 만 출력하고 프로젝트 파일은 읽기만 한다.
//
// 비용 기록(costs.json)에는 남기지 않는다 — lib/costs.js 를 끌어오면 의존이 커진다.
// 대시보드와 대조할 때 이 몫을 빼고 본다.
import { readFileSync } from "fs";
import path from "path";
import { buildClipPrompt } from "../../lib/cuts.js";
import { profileFor, fitDurationFor } from "../../lib/clip-limits.js";
import { runWithActor } from "../../lib/actor.js";
import { axesOf, motionAxisFor } from "../../lib/motion.js";

const [projectId, cutArg, modelA = "fal-ai/ltx-2.3/image-to-video/fast",
       modelB = "fal-ai/kling-video/v3/standard/image-to-video"] = process.argv.slice(2);
if (!projectId || !cutArg) {
  console.error("사용법: node scripts/measure/compare-clip-models.mjs <projectId> <컷번호> [모델A] [모델B]");
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error("FAL_KEY 가 없다. .env.local 의 값을 환경변수로 넣고 돌린다.");
  process.exit(1);
}

const DATA = process.env.SHOTFORM_DATA_DIR || "data";
const project = JSON.parse(readFileSync(path.join(DATA, "projects", `${projectId}.json`), "utf8"));
const cut = (project.cuts || [])[Number(cutArg) - 1];
if (!cut) { console.error(`컷 ${cutArg} 이 없다 (컷 ${(project.cuts || []).length}개)`); process.exit(1); }
if (!cut.image?.url) { console.error(`컷 ${cutArg} 에 이미지가 없다 — ④이미지를 먼저 만든다`); process.exit(1); }

const aspect = project.settings?.aspect_ratio || "9:16";
const prompt = buildClipPrompt(cut);

async function generate(endpoint) {
  const profile = profileFor(endpoint);
  const duration = fitDurationFor(profile, cut.seconds);
  const input = { image_url: cut.image.url, prompt, duration, aspect_ratio: aspect, ...(profile.extra || {}) };
  // fetch·res.json() 이 던지는 예외를 잡아야 한다 — A 다음에 B 를 부르는 순차 호출이라,
  // A 가 fal 에 이미 접수(과금)된 뒤 소켓만 끊기면 여기서 죽어 B 가 아예 안 불리고,
  // 재실행하면 이미 낸 A 값을 또 낸다.
  try {
    const res = await fetch(`https://fal.run/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { duration, error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}` };
    const data = await res.json();
    return { duration, url: data?.video?.url || null };
  } catch (err) {
    return { duration, error: String(err?.message || err) };
  }
}

console.log(`프로젝트 ${projectId} · 컷 ${cutArg} · 낭독 ${cut.seconds}초 · ${aspect}`);
// 머리말은 **실제로 보낸 지시**와 같아야 한다 — 순서도 buildClipPrompt 와 같다
// (축 → 옛 motion → 기본값). 이름표는 MOTION_AXES 에서 온다: 목록에서 축 한 줄을 빼면
// 여기서도 함께 사라진다.
const axes = axesOf(cut);
if (axes.length) {
  for (const a of axes) console.log(`${motionAxisFor(a.id)?.label}: ${a.text}`);
} else {
  console.log(`움직임: ${cut.motion || "(없음 — 기본값)"}`);
}
console.log(`화면:   ${cut.shows || "(없음)"}`);
console.log(`이미지: ${cut.image.url}\n`);

// 측정이 낸 비용은 운영자 지출이다. uuid 가 아닌 문자열이라 사장님 계정과 별개
// 버킷이 된다 — 프롬프트를 재던 날 측정이 사장님의 사용자별 상한을 잡아먹으면
// 화면에서 영상이 안 만들어진다. 전역 상한에는 둘 다 함께 잡힌다.
await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
  for (const [tag, endpoint] of [["A", modelA], ["B", modelB]]) {
    const r = await generate(endpoint);
    console.log(`${tag} ${endpoint}`);
    console.log(`   ${r.duration}초 · ${r.url || "실패 " + r.error}\n`);
  }
});

console.log(`두 영상을 나란히 열어 넷을 본다:`);
console.log(`  1. 지시한 움직임이 실제로 일어나는가`);
console.log(`  2. 시키지 않은 움직임이 있는가 (페달 없이 굴러가던 그 결함)`);
console.log(`  3. 손·신체가 움직이는 동안 무너지지 않는가`);
console.log(`  4. 첫 프레임이 우리가 만든 이미지와 같은가`);
console.log(`판정은 사장님이 한다 — VLM 에 묻지 않는다(07-29 에 결함 넷을 전부 통과시켰다).`);
