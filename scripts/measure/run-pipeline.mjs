// 자료 → 브리핑 → 원고 → 컷 → 화면까지 실제로 태우고 지표를 뽑는다.
//
//   node scripts/measure/run-pipeline.mjs [자료키] [반복] [초]
//   node scripts/measure/run-pipeline.mjs tailor 3 30    수선집 자료, 3회, 30초 목표
//   node scripts/measure/run-pipeline.mjs thin           두 줄짜리 자료, 1회, 자동 길이
//
// 서버가 localhost:3000에 떠 있어야 한다. 이미지 비용을 안 쓰려면 SHOTFORM_FAKE_IMAGES=1로 띄운다.
// 컷까지 보려면 --cuts를 붙인다(이미지 생성이 돌므로 가짜 이미지 모드 권장).
const BASE = process.env.MEASURE_BASE || "http://localhost:3000";

const MATERIALS = {
  thin: `동네에서 작은 세탁소를 합니다. 요즘은 운동화 세탁을 많이 맡기세요.`,

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

const CHARS_PER_SEC = 5.5;
const key = process.argv[2] || "tailor";
const reps = Number(process.argv[3]) || 1;
const seconds = Number(process.argv[4]) || null;
const withCuts = process.argv.includes("--cuts");

const noSpace = (s) => (s || "").replace(/\s/g, "").length;
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

function repeats(text) {
  const ss = (text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => strip(s).length >= 10);
  for (let i = 0; i < ss.length; i++)
    for (let j = i + 1; j < ss.length; j++) if (ratio(ss[i], ss[j]) > 0.5) return true;
  return false;
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
  const b = await call(`/api/projects/${p.id}/briefing`, { method: "POST" });
  const brief = b.briefing || b;
  // 질문에는 답하지 않고 건너뛴다 — 답을 넣으면 사실 수가 늘어 목표 길이가 달라진다
  const asked = (brief.asked || []).map((a) => ({ ...a, answer: "", done: true }));
  await call(`/api/projects/${p.id}`, { method: "PATCH", body: JSON.stringify({ briefing: { asked, confirmed: true } }) });

  const sc = await call(`/api/projects/${p.id}/script`, { method: "POST", body: JSON.stringify({}) });
  const script = (sc.script || sc).text;

  console.log(`\n[${p.id.slice(0, 8)}] 사실 ${brief.key_points.length}개 · 질문 ${(brief.asked || []).length}개`);
  (brief.asked || []).forEach((a) => console.log(`   Q: ${a.question}`));
  const target = seconds ? Math.round(seconds * CHARS_PER_SEC) : null;
  console.log(`원고 ${noSpace(script)}자 ≈ ${(noSpace(script) / CHARS_PER_SEC).toFixed(1)}초` +
    (target ? ` · 목표 ${target}자(${Math.round(noSpace(script) / target * 100)}%)` : "") +
    ` · 되풀이 ${repeats(script) ? "있음" : "없음"}`);
  console.log(`첫 문장: ${script.split(/(?<=[.!?])\s+/)[0]}`);
  console.log(`--- 원고 ---\n${script}`);

  if (!withCuts) return;

  await call(`/api/projects/${p.id}/cuts`, { method: "POST", body: JSON.stringify({ aspect_ratio: "9:16" }) });
  let cuts = [];
  for (let i = 0; i < 40; i++) {
    const st = await call(`/api/projects/${p.id}/cuts/status`);
    cuts = st.cuts || [];
    if (st.cuts_error) { console.log(`컷 오류: ${st.cuts_error}`); break; }
    if (cuts.length && cuts.every((c) => c.state === "done" || c.state === "needs_attention")) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const intact = cuts.length > 0 &&
    cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "") === script.replace(/\s/g, "");
  console.log(`--- 컷 ${cuts.length}개 · 무결성 ${intact ? "✅ 원고와 일치" : "❌ 어긋남"} ---`);
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
console.log(`자료 ${key} · ${reps}회 · 목표 ${seconds ? seconds + "초" : "자동"}`);
for (let i = 0; i < reps; i++) {
  try { await once(text); } catch (e) { console.log(`실패: ${e.message}`); }
}
