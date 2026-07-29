// 같은 컷을 두 이미지 모델로 만들어 나란히 놓는다.
//
//   node scripts/measure/compare-image-models.mjs <projectId> [모델A] [모델B]
//   기본값: A=fal-ai/nano-banana (지금), B=fal-ai/nano-banana-2 (후보)
//
// ⚠️ 유료다. 컷당 A 한 장 + B 한 장이다(4컷이면 약 $0.48).
//    사장님 승인 없이 돌리지 않는다.
//
// 왜 저장된 프로젝트를 안 고치는가: 컷별 재생성을 쓰면 이미지가 덮여 비교 대상이 사라진다.
// 여기서는 URL 만 출력하고 프로젝트 파일은 읽기만 한다.
//
// 왜 프롬프트를 베끼지 않는가: buildImagePrompt 가 바뀌면 비교가 조용히 어긋난다.
// 그래서 lib 을 그대로 import 한다(그러려고 lib 의 import 에 확장자를 붙였다).
//
// 비용 기록(costs.json)에는 남기지 않는다 — lib/costs.js 를 끌어오면 의존이 커진다.
// 대시보드와 대조할 때 이 몫을 빼고 본다.
import { readFileSync } from "fs";
import path from "path";
import { buildImagePrompt } from "../../lib/cuts.js";
import { resolveCutRefs, avatarFile } from "../../lib/cast.js";

const [projectId, modelA = "fal-ai/nano-banana", modelB = "fal-ai/nano-banana-2"] = process.argv.slice(2);
if (!projectId) {
  console.error("사용법: node scripts/measure/compare-image-models.mjs <projectId> [모델A] [모델B]");
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error("FAL_KEY 가 없다. .env.local 의 값을 환경변수로 넣고 돌린다.");
  process.exit(1);
}

const DATA = process.env.SHOTFORM_DATA_DIR || "data";
const project = JSON.parse(readFileSync(path.join(DATA, "projects", `${projectId}.json`), "utf8"));

// lib/pipeline.js 의 uploadsPath 와 같은 규칙. 그 함수는 export 되지 않아 여기 세 줄을 둔다.
const uploadsPath = (url) => {
  const name = url?.split("/").pop();
  return name ? path.join(DATA, "uploads", name) : null;
};

async function generate(endpointBase, prompt, refs, aspect_ratio) {
  const endpoint = refs.length ? `${endpointBase}/edit` : endpointBase;
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    input.image_urls = refs.map((r) => {
      const buf = readFileSync(r.path);
      const ext = r.path.split(".").pop();
      return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`;
    });
  }
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { error: `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` };
  const data = await res.json();
  return { url: data?.images?.[0]?.url || null, raw: Object.keys(data || {}) };
}

const aspect = project.settings?.aspect_ratio || "9:16";
console.log(`프로젝트 ${projectId} · 컷 ${(project.cuts || []).length}개 · ${aspect}`);
console.log(`A = ${modelA}\nB = ${modelB}\n`);

for (const cut of project.cuts || []) {
  if (cut.source === "photo") { console.log(`컷${cut.idx + 1} — 올린 사진 컷이라 건너뜀`); continue; }
  const refs = resolveCutRefs(cut, project)
    .map((r) => ({
      path: r.from === "photo"
        ? uploadsPath((project.material?.photos || []).find((p) => p.id === r.id)?.url)
        : avatarFile(r.id),
      kind: r.kind,
      who: r.who,
    }))
    .filter((r) => r.path);
  const prompt = buildImagePrompt(cut, project, refs);

  console.log(`\n━━ 컷${cut.idx + 1} · 레퍼런스 ${refs.length}장`);
  console.log(`   shows: ${cut.shows || "(없음)"}`);
  const a = await generate(modelA, prompt, refs, aspect);
  const b = await generate(modelB, prompt, refs, aspect);
  console.log(`   A: ${a.url || "실패 " + a.error}`);
  console.log(`   B: ${b.url || "실패 " + b.error}`);
}

console.log(`\n두 URL 을 나란히 열어 넷을 본다:`);
console.log(`  1. 제품이 레퍼런스와 같은 물건인가 (청록 띠·검정 캡·라벨 배치)`);
console.log(`  2. 인물 얼굴이 아바타와 같은 사람인가`);
console.log(`  3. 손·신체 오류가 있는가`);
console.log(`  4. shows 에 없는 사람이 덤으로 그려졌는가`);
console.log(`넷 중 셋 이상에서 B 가 낫거나 같으면 채택한다.`);
