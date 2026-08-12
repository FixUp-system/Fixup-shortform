// 같은 컷을 네 화풍으로 만들어 나란히 놓는다.
//
//   node scripts/measure/compare-style-presets.mjs <projectId> [컷번호] [--refs] [--note "보정"]
//
//   컷번호는 1부터. 안 주면 첫 AI 컷을 쓴다.
//   --refs 를 붙이면 그 컷의 레퍼런스(제품 사진·아바타)를 함께 보낸다.
//
// ⚠️ 유료다. 화풍당 한 장이라 기본 4장 ≈ $0.32. 사장님 승인 없이 돌리지 않는다.
//
// 왜 컷 하나를 고정하는가: 프리셋 사이의 **유일한 변수가 화풍**이어야 한다.
// 컷마다 돌리면 장면이 달라서 무엇이 화풍의 효과인지 못 가린다.
//
// 왜 --refs 를 따로 두는가: 실사 제품 사진을 첨부한 채 비실사 화풍을 고르면
// "제품 모양을 첨부와 똑같이"(buildImagePrompt)와 화풍 지시가 정면으로 부딪친다.
// 그 충돌은 우리가 아직 재 본 적이 없어서, 기본 비교와 섞지 않고 따로 잰다.
//
// 왜 프롬프트를 베끼지 않는가: buildImagePrompt 가 바뀌면 비교가 조용히 어긋난다.
// 그래서 lib 을 그대로 import 한다(그러려고 lib 의 import 에 확장자를 붙였다).
//
// 저장된 프로젝트는 읽기만 한다 — 컷별 재생성을 쓰면 이미지가 덮여 비교 대상이 사라진다.
// 비용 기록(costs.json)에는 남기지 않는다. 대시보드와 대조할 때 이 몫을 빼고 본다.
//
// 레퍼런스는 파일 경로가 아니라 **출처와 키**로 푼다 — 업로드는 Supabase Storage 로 갔고
// 아바타만 로컬 파일로 남았다. 경로를 readFileSync 하던 시절 코드를 두면 --refs 를 붙여도
// 사진이 조용히 빠진 채(아바타만 실린 채) 유료 호출이 나간다. lib/refs-io.js 가 그 자리다.
import { readFileSync } from "fs";
import path from "path";
import { buildImagePrompt } from "../../lib/cuts.js";
import { resolveCutRefs } from "../../lib/cast.js";
import { AVATARS } from "../../lib/refs.js";
import { readRefBytes, toDataUri } from "../../lib/refs-io.js";
import { STYLE_PRESETS } from "../../lib/styles.js";
import { runWithActor } from "../../lib/actor.js";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--note");

const [projectId, cutArg] = positional;
const withRefs = flag("--refs");
const note = value("--note") || "";

if (!projectId) {
  console.error('사용법: node scripts/measure/compare-style-presets.mjs <projectId> [컷번호] [--refs] [--note "보정"]');
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error("FAL_KEY 가 없다. .env.local 의 값을 환경변수로 넣고 돌린다.");
  process.exit(1);
}

const DATA = process.env.SHOTFORM_DATA_DIR || "data";
const project = JSON.parse(readFileSync(path.join(DATA, "projects", `${projectId}.json`), "utf8"));
const endpointBase = process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana-2";

// lib/pipeline.js 가 refs 를 조립하는 규칙을 그대로 따른다 —
// 업로드는 photos[].url 의 마지막 조각이 key, 아바타는 AVATARS[].file 이 key 다.
// 그 함수는 export 되지 않아 여기 한 벌을 둔다.
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
  const out = [];
  for (const r of resolved) {
    const bytes = await readRefBytes(r);
    // 조용히 넘기지 않는다 — 사진 없이 유료 생성이 나가는 것을 사람이 알아채야 한다.
    if (bytes) out.push({ ...r, bytes });
    else console.error(`⚠️ 레퍼런스를 못 읽었다: ${r.source}/${r.key || "(키 없음)"} — 이 비교는 그것 없이 나간다`);
  }
  if (resolved.length && out.length < resolved.length) {
    console.error(`⚠️⚠️ 레퍼런스 ${resolved.length}장 중 ${out.length}장만 실렸다. 업로드는 Storage 에 있다 —`);
    console.error(`     SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 넣고 다시 돌리는 편이 낫다(돈이 나가는 비교다).`);
  }
  return out;
}

const cuts = (project.cuts || []).filter((c) => c.source !== "photo");
const cut = cutArg ? cuts.find((c) => c.idx + 1 === Number(cutArg)) : cuts[0];
if (!cut) {
  console.error(`컷을 찾지 못했다. AI 컷 번호: ${cuts.map((c) => c.idx + 1).join(", ") || "없음"}`);
  process.exit(1);
}

// 측정이 낸 비용은 운영자 지출이다. uuid 가 아닌 문자열이라 사장님 계정과 별개
// 버킷이 된다 — 프롬프트를 재던 날 측정이 사장님의 사용자별 상한을 잡아먹으면
// 화면에서 영상이 안 만들어진다. 전역 상한에는 둘 다 함께 잡힌다.
const { refs, results, aspect, PER_IMAGE } = await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
  const refs = withRefs ? await loadRefs(cut) : [];

  async function generate(prompt, aspect_ratio) {
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
    return { url: data?.images?.[0]?.url || null };
  }

  const aspect = project.settings?.aspect_ratio || "9:16";
  const PER_IMAGE = 0.08; // lib/costs.js 의 nano-banana 2 단가(실청구로 확인). 여기서는 안내용이다

  console.log(`프로젝트 ${projectId} · 컷${cut.idx + 1} · ${aspect} · 모델 ${endpointBase}`);
  console.log(`shows: ${cut.shows || "(없음)"}`);
  console.log(`레퍼런스: ${refs.length}장${withRefs ? "" : " (--refs 를 붙이면 붙는다)"}`);
  if (note) console.log(`보정: ${note}`);
  console.log(`예상 비용: ${STYLE_PRESETS.length}장 × $${PER_IMAGE} = 약 $${(STYLE_PRESETS.length * PER_IMAGE).toFixed(2)}\n`);

  // 프롬프트가 코드로 판정할 수 있는 것은 여기까지다 — 가짜 모드가 장면을 뽑아내는 문형인가.
  // lib/imagegen.js 의 정규식과 같은 것을 쓴다.
  const SCENE = /Scene:\s*(.+?)\.\s/;
  const results = [];

  for (const s of STYLE_PRESETS) {
    const styled = {
      ...project,
      settings: { ...project.settings, style: { preset: s.id, note } },
    };
    const prompt = buildImagePrompt(cut, styled, refs);
    const sceneOk = SCENE.test(prompt);
    const out = await generate(prompt, aspect);
    results.push({ id: s.id, label: s.label, prompt, sceneOk, ...out });
    console.log(`━━ ${s.label} (${s.id})${sceneOk ? "" : "  ⚠️ 장면 역파싱 실패 — 가짜 모드가 깨진다"}`);
    console.log(`   ${prompt}`);
    console.log(`   → ${out.url || "실패 " + out.error}\n`);
  }

  console.log("┌ 결과 표");
  for (const r of results) {
    console.log(`│ ${r.label.padEnd(6)} ${r.url ? "✅" : "❌"} ${r.url || r.error}`);
  }
  console.log(`└ 성공 ${results.filter((r) => r.url).length}/${results.length} · 실제 비용 약 $${(results.filter((r) => r.url).length * PER_IMAGE).toFixed(2)}`);

  return { refs, results, aspect, PER_IMAGE };
});

console.log(`
네 장을 나란히 열어 **사람이** 본다. VLM 에게 시키지 않는다 — 틀린 가격을 여섯 번 "명확함"이라
칭찬한 전력이 있다. 코드가 판정한 것은 위의 성공 여부와 장면 역파싱뿐이다.

  1. 실사가 나머지 셋과 즉시 구별되는가
  2. 일러스트와 애니메이션이 서로 구별되는가 (둘이 같아 보이면 문구를 갈라야 한다)
  3. 네 장의 피사체·구도가 같은가 (화풍만 달라야 한다 — 장면까지 달라지면 프롬프트가 새는 것이다)
  4. 글자·숫자 무늬가 없는가
  5. SF 가 소재를 밀어내지 않았는가 (가게가 우주선이 되면 문구를 더 눌러야 한다)

어긋난 것이 있으면 lib/styles.js 의 medium·finish 를 고치고 다시 잰다.
스크립트를 고쳐 목표에 맞추지 않는다.`);
