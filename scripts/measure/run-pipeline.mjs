// 자료 → 시나리오 → 컷 → 화면까지 실제로 태우고 지표를 뽑는다.
//
//   node scripts/measure/run-pipeline.mjs [자료키] [반복] [초]
//   node scripts/measure/run-pipeline.mjs tailor 3 30    수선집 자료, 3회, 30초 목표
//   node scripts/measure/run-pipeline.mjs thin           두 줄짜리 자료, 1회
//
// 서버가 localhost:3000에 떠 있어야 한다. 이미지 비용을 안 쓰려면 SHOTFORM_FAKE_IMAGES=1로 띄운다.
// 컷까지 보려면 --cuts를 붙인다(이미지 생성이 돌므로 가짜 이미지 모드 권장).
//
// ★ 2026-08-16 — 흐름이 바뀌었다. 브리핑·원고 라우트가 없어지고 **시나리오 하나**가 그
//   자리를 대신한다. 그래서 여기서 재던 원고 지표(글자 수·되풀이·목표 대비 %)도 함께
//   사라졌다 — 잴 원고가 없다. 시나리오 자체의 품질은 scripts/measure/scenario.mjs 가 잰다.
//   여기는 **관통**(자료에서 컷·화면까지 실제로 나오는가)을 재는 자리로 남는다.
//
// ★ 길이를 반드시 고른다(기본 15초). 시나리오 확정 라우트가 target_seconds 없는 프로젝트를
//   막는다 — "영상 길이를 먼저 골라 주세요". 옛 "자동 길이"는 원고 시절의 개념이다.
import { runWithActor } from "../../lib/actor.js";

const BASE = process.env.MEASURE_BASE || "http://localhost:3000";

const MATERIALS = {
  thin: `동네에서 작은 세탁소를 합니다. 요즘은 운동화 세탁을 많이 맡기세요.`,

  // ★ 실제로 15초 요청에 11초를 만든 자료다(프로젝트 5d8a9a1e, 2026-08-14).
  //
  // thin 과 다른 점이 측정에서 결정적이다: thin 은 자료에 **안 쓴 사실이 남아** 옛 판정
  // (unusedFacts > 0)에서도 '분량 미달'이 걸렸다. 이 자료는 사실이 셋뿐이고 셋 다 뭉뚱그린
  // 형용사라 원고가 한 문장에 다 써 버린다 — 그 순간 unusedFacts 가 0이 되어 옛 판정이
  // 통째로 빠졌고, 63자(76%)가 결함 없음으로 통과했다.
  //
  // 즉 "자료가 얕다"에는 두 종류가 있다. **덜 쓴 얕음**(thin)과 **다 쓰고도 모자란
  // 얕음**(shallow). 뒤엣것을 재는 자료가 없어서 이 구멍이 안 보였다.
  shallow: `스포츠카를 광고하는 영상을 만들어줘. 스포츠카의 빠름과 역동적인 모습 그리고 멋있는 디자인을 강조하고 싶어`,

  workshop: `연남동에서 6년째 하는 도자기 공방입니다. 원래는 제 그릇만 만들다가 3년 전부터 수업을 시작했어요.

물레는 안 가르치고 손으로만 빚습니다. 물레는 재미있어 보이지만 한 번 와서 가져갈 수 있는 게 거의 없어요. 손으로 빚으면 그날 만든 걸 그대로 구워서 보냅니다.

수업은 한 번에 한 명만 받습니다. 옆에 붙어서 봐야 하는데 여러 명이면 그게 안 돼서요. 수요일은 가마 굽는 날이라 쉽니다.

만든 건 2주 뒤에 택배로 보내드립니다. 유약 색은 다섯 가지 중에 고르시면 돼요.`,

  tailor: `성수동에서 옷 수선집을 합니다. 12년 됐어요. 그전에는 백화점 수선실에서 8년 일했습니다.

백화점에선 손님 얼굴을 못 봤어요. 옷만 왔다 갔다 했죠. 내가 고친 옷을 누가 어떻게 입는지 모르니까 재미가 없더라고요. 그만두고 가게를 냈습니다.

치수는 손님이 입은 채로 잽니다. 벗어놓고 재면 어깨가 어디서 떨어지는지 알 수가 없어요. 5분이면 되는 일인데 이걸 안 하는 집이 많습니다.

바지 밑단은 3,000원, 허리 줄이는 건 8,000원입니다. 재킷 어깨는 4만 원부터고요. 어깨는 소매를 뜯어야 해서 사흘 걸립니다.

작년에 어떤 손님이 20년 된 아버지 코트를 들고 오셨어요. 안감이 다 삭아서 통째로 갈았습니다. 그거 하나에 이틀이 걸렸는데, 받아 가시면서 우시더라고요. 그런 일이 가끔 있습니다.

가게는 성수역 3번 출구에서 걸어서 5분, 세탁소 옆 골목입니다. 화요일은 쉽니다.`,

  rich: `망원동에서 8년째 반찬가게를 합니다. 원래는 급식 조리사로 12년 일했어요. 아이들 반찬을 만들다 보니 우리 애들한테 못 먹일 건 남한테도 못 팔겠더라고요. 그만두고 가게를 낸 이유가 그겁니다.

메뉴는 매일 아침 여덟 가지만 만듭니다. 전날 남은 건 안 팝니다. 오후 다섯 시 넘어 남으면 근처 경로당에 드리거나 직원들이 나눠 갑니다. 그래서 재고가 안 남고, 대신 늦게 오시면 없습니다.

제일 많이 나가는 건 멸치볶음이에요. 국산 세멸만 쓰고, 물엿 대신 조청을 씁니다. 물엿을 쓰면 식고 나서 딱딱해지는데 조청은 하루가 지나도 부드러워요. 원가는 두 배 넘게 듭니다. 100g에 4,500원.

간은 일부러 싱겁게 합니다. 처음 오신 분들은 심심하다고 하시는데, 3주쯤 드시면 다른 데 반찬이 짜서 못 드시겠다고 다시 오세요. 저희 단골 여든 분 중에 절반이 그렇게 오신 분들입니다.

작년 겨울에 김장 김치를 200포기 담갔는데 이틀 만에 나갔어요. 그때 못 사신 분들이 올해는 예약을 받아 달라고 하셔서, 11월부터 예약을 받습니다.

가게는 망원시장 안쪽, 생선가게 옆 골목입니다. 아침 열 시부터 저녁 일곱 시까지 하고 일요일은 쉽니다. 포장만 되고 배달은 안 합니다 — 국물 있는 반찬은 흔들리면 맛이 달라져서요.`,
};

const key = process.argv[2] || "tailor";
const reps = Number(process.argv[3]) || 1;
const seconds = Number(process.argv[4]) || 15;
const withCuts = process.argv.includes("--cuts");

const strip = (s) => (s || "").replace(/[\s.,!?~'"·]/g, "");

// 최장 공통 부분수열 / 결과물 길이 — "이 문장이 제 몫을 얼마나 말하는가"(lib/script.js와 같은 자)
function ratio(src, text) {
  const a = strip(src), b = strip(text);
  if (Math.min(a.length, b.length) < 8) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return +(prev[b.length] / b.length).toFixed(2);
}

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

async function once(text) {
  const p = await call("/api/projects", {
    method: "POST",
    body: JSON.stringify({ material: { text, photos: [] }, settings: { target_seconds: seconds } }),
  });
  const sc = await call(`/api/projects/${p.id}/scenario`, { method: "POST", body: JSON.stringify({}) });
  const scenario = sc.scenario;
  const problems = sc.problems || [];

  console.log(`\n[${p.id.slice(0, 8)}] ${scenario.topic}`);
  console.log(`focus ${scenario.focus?.mode || "-"}/${scenario.focus?.subject || "-"} · angle ${scenario.angle}`);
  const total = scenario.shots.reduce((a, s) => a + s.seconds, 0);
  console.log(`장면 ${scenario.shots.length}개 · 초 합 ${total}(목표 ${seconds}) · 규칙 ${problems.length ? `걸림: ${problems.join(" ")}` : "이상 없음"}`);
  scenario.shots.forEach((s, i) => {
    console.log(`  [${i + 1}] ${s.seconds}초 · ${s.speaker || "(무음)"} — ${s.beat}`);
    console.log(`      ${s.line || "(대사 없음)"}`);
  });

  if (!withCuts) return;

  // 컷은 **확정된** 시나리오에서만 나온다(cuts 라우트가 그것으로 막는다).
  // 규칙에 걸린 시나리오는 확정이 400 이라 여기서 멈춘다 — 사장님도 같은 자리에서 멈춘다.
  await call(`/api/projects/${p.id}/scenario`, {
    method: "PATCH",
    body: JSON.stringify({ scenario, confirmed: true }),
  });

  await call(`/api/projects/${p.id}/cuts`, { method: "POST", body: JSON.stringify({ aspect_ratio: "9:16" }) });
  let cuts = [];
  for (let i = 0; i < 40; i++) {
    const st = await call(`/api/projects/${p.id}/cuts/status`);
    cuts = st.cuts || [];
    if (st.cuts_error) { console.log(`컷 오류: ${st.cuts_error}`); break; }
    if (cuts.length && cuts.every((c) => c.state === "done" || c.state === "needs_attention")) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  // 무결성의 원본이 원고에서 **시나리오**로 옮겨졌다 — 컷 문장은 장면의 line 그대로여야
  // 한다(lib/cuts.js 의 shotsToCuts). 어긋나면 사장님이 확정한 대사가 아닌 것이 낭독된다.
  const lines = scenario.shots.map((s) => s.line || "").join("").replace(/\s/g, "");
  const intact = cuts.length > 0 && cuts.map((c) => c.sentence || "").join("").replace(/\s/g, "") === lines;
  console.log(`--- 컷 ${cuts.length}개 · 무결성 ${intact ? "✅ 시나리오 대사와 일치" : "❌ 어긋남"} ---`);
  for (const c of cuts) {
    console.log(`  [${c.idx}] ${c.seconds}초 · 화면전사 ${ratio(c.shows, c.sentence)} · ${c.state || "-"}`);
    console.log(`    문장: ${c.sentence}`);
    console.log(`    화면: ${c.shows || "(없음 — 폴백)"}`);
  }
}

const text = MATERIALS[key];
if (!text) {
  console.log(`자료키: ${Object.keys(MATERIALS).join(", ")}`);
  process.exit(1);
}
console.log(`자료 ${key} · ${reps}회 · 목표 ${seconds}초`);
// 측정이 낸 비용은 운영자 지출이다. uuid 가 아닌 문자열이라 사장님 계정과 별개
// 버킷이 된다 — 프롬프트를 재던 날 측정이 사장님의 사용자별 상한을 잡아먹으면
// 화면에서 영상이 안 만들어진다. 전역 상한에는 둘 다 함께 잡힌다.
await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
  for (let i = 0; i < reps; i++) {
    try { await once(text); } catch (e) { console.log(`실패: ${e.message}`); }
  }
});
