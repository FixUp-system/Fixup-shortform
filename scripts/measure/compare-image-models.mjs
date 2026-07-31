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
//
// 레퍼런스는 파일 경로가 아니라 **출처와 키**로 푼다 — 업로드는 Supabase Storage 로 갔고
// 아바타만 로컬 파일로 남았다. 여기서 readFileSync 로 경로를 읽던 시절 코드를 그대로 두면
// 사진 레퍼런스가 조용히 빠진 채 유료 호출이 나간다(아바타는 계속 읽혀서 절반만 동작한다).
// 그래서 lib/refs-io.js 를 쓰고, 하나라도 못 얻으면 아래에서 크게 경고한다.
import { readFileSync } from "fs";
import path from "path";
import { buildImagePrompt } from "../../lib/cuts.js";
import { resolveCutRefs } from "../../lib/cast.js";
import { AVATARS } from "../../lib/refs.js";
import { readRefBytes, toDataUri } from "../../lib/refs-io.js";

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

// lib/pipeline.js 가 refs 를 조립하는 규칙을 그대로 따른다 —
// 업로드는 photos[].url 의 마지막 조각이 key, 아바타는 AVATARS[].file 이 key 다.
// 그 함수는 export 되지 않아 여기 한 벌을 둔다. 규칙이 갈라지면 이 비교만 조용히 어긋난다.
async function loadRefs(cut) {
  const resolved = resolveCutRefs(cut, project).map((r) => ({
    kind: r.kind,
    who: r.who, // 첨부를 배역에 묶는 데 쓴다 — buildImagePrompt 가 읽는다
    source: r.from === "photo" ? "upload" : "avatar",
    key:
      r.from === "photo"
        ? (project.material?.photos || []).find((p) => p.id === r.id)?.url?.split("/").pop()
        : (AVATARS.find((a) => a.id === r.id) || {}).file,
  }));
  const refs = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    // 조용히 넘기지 않는다 — 사진 없이 유료 생성이 나가는 것을 사람이 알아채야 한다.
    if (bytes) refs.push({ ...r, bytes });
    else console.error(`   ⚠️ 레퍼런스를 못 읽었다: ${r.source}/${r.key || "(키 없음)"} — 이 장은 그것 없이 그려진다`);
  }
  if (resolved.length && refs.length < resolved.length) {
    console.error(`   ⚠️⚠️ 레퍼런스 ${resolved.length}장 중 ${refs.length}장만 실렸다. 업로드는 Storage 에 있다 —`);
    console.error(`        SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 넣고 다시 돌리는 편이 낫다(돈이 나가는 비교다).`);
  }
  return refs;
}

async function generate(endpointBase, prompt, refs, aspect_ratio) {
  const endpoint = refs.length ? `${endpointBase}/edit` : endpointBase;
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    input.image_urls = refs.map((r) => toDataUri(r.bytes, r.key));
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
  console.log(`\n━━ 컷${cut.idx + 1}`);
  const refs = await loadRefs(cut);
  const prompt = buildImagePrompt(cut, project, refs);

  console.log(`   레퍼런스 ${refs.length}장`);
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
