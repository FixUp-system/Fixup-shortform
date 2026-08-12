// A/B — 브리핑 요약이 원고에 기여하는가.
// 같은 프로젝트(같은 브리핑·같은 목표 분량)에 원고만 두 번 뽑는다.
//   A: 지문 = 브리핑 요약 + 자료 원문      (현행)
//   B: 지문 = 자료 원문만                  (SHOTFORM_NO_BRIEFING=1로 서버 기동)
// 사용법:  node ab-briefing.mjs setup   → 프로젝트 생성 + A 변형 2회
//          node ab-briefing.mjs b       → 같은 프로젝트에 B 변형 2회 + 비교 출력
import { readFileSync, writeFileSync, existsSync } from "fs";
import { runWithActor } from "../../lib/actor.js";

const BASE = "http://localhost:3000";
const STATE = new URL("./ab-state.json", import.meta.url).pathname.replace(/^\//, "");
const REPEATS = 2;

const MATERIALS = {
  B: `연남동에서 6년째 하는 도자기 공방입니다. 원래는 제 그릇만 만들다가 3년 전부터 수업을 시작했어요.

물레는 안 가르치고 손으로만 빚습니다. 물레는 재미있어 보이지만 한 번 와서 가져갈 수 있는 게 거의 없어요. 손으로 빚으면 그날 만든 걸 그대로 구워서 보냅니다.

수업은 한 번에 한 명만 받습니다. 옆에 붙어서 봐야 하는데 여러 명이면 그게 안 돼서요. 수요일은 가마 굽는 날이라 쉽니다.

만든 건 2주 뒤에 택배로 보내드립니다. 유약 색은 다섯 가지 중에 고르시면 돼요.`,

  C: `동네에서 작은 세탁소를 합니다. 요즘은 운동화 세탁을 많이 맡기세요.`,

  D: `망원동에서 8년째 반찬가게를 합니다. 원래는 급식 조리사로 12년 일했어요. 아이들 반찬을 만들다 보니 우리 애들한테 못 먹일 건 남한테도 못 팔겠더라고요. 그만두고 가게를 낸 이유가 그겁니다.

메뉴는 매일 아침 여덟 가지만 만듭니다. 전날 남은 건 안 팝니다. 오후 다섯 시 넘어 남으면 근처 경로당에 드리거나 직원들이 나눠 갑니다. 그래서 재고가 안 남고, 대신 늦게 오시면 없습니다.

제일 많이 나가는 건 멸치볶음이에요. 국산 세멸만 쓰고, 물엿 대신 조청을 씁니다. 물엿을 쓰면 식고 나서 딱딱해지는데 조청은 하루가 지나도 부드러워요. 원가는 두 배 넘게 듭니다. 100g에 4,500원.

간은 일부러 싱겁게 합니다. 처음 오신 분들은 심심하다고 하시는데, 3주쯤 드시면 다른 데 반찬이 짜서 못 드시겠다고 다시 오세요. 저희 단골 여든 분 중에 절반이 그렇게 오신 분들입니다.

작년 겨울에 김장 김치를 200포기 담갔는데 이틀 만에 나갔어요. 그때 못 사신 분들이 올해는 예약을 받아 달라고 하셔서, 11월부터 예약을 받습니다.

가게는 망원시장 안쪽, 생선가게 옆 골목입니다. 아침 열 시부터 저녁 일곱 시까지 하고 일요일은 쉽니다. 포장만 되고 배달은 안 합니다 — 국물 있는 반찬은 흔들리면 맛이 달라져서요.`,
};

const strip = (s) => (s || "").replace(/[\s.,!?~'"·]/g, "");
const noSpace = (s) => (s || "").replace(/\s/g, "").length;

function lcs(a0, b0) {
  const a = strip(a0), b = strip(b0);
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

// 사실 포함률 — key_point가 원고 안에 얼마나 살아 있는가(핵심 낱말 기준, 원본 길이로 정규화)
function factCoverage(keyPoints, text) {
  const hit = keyPoints.filter((k) => lcs(k, text) / strip(k).length >= 0.6).length;
  return { hit, total: keyPoints.length, rate: +(hit / Math.max(1, keyPoints.length)).toFixed(2) };
}

function repeats(text) {
  const ss = (text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => strip(s).length >= 10);
  for (let i = 0; i < ss.length; i++)
    for (let j = i + 1; j < ss.length; j++) {
      const [s, l] = strip(ss[i]).length <= strip(ss[j]).length ? [ss[i], ss[j]] : [ss[j], ss[i]];
      if (lcs(s, l) / strip(l).length > 0.5) return true;
    }
  return false;
}

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

function measure(text, keyPoints) {
  const cov = factCoverage(keyPoints, text);
  return {
    chars: noSpace(text),
    seconds: +(noSpace(text) / 5.5).toFixed(1),
    sentences: (text.match(/[.!?]/g) || []).length,
    repeated: repeats(text),
    coverage: cov.rate,
    covered: `${cov.hit}/${cov.total}`,
    text,
  };
}

const mode = process.argv[2];

// 측정이 낸 비용은 운영자 지출이다. uuid 가 아닌 문자열이라 사장님 계정과 별개
// 버킷이 된다 — 프롬프트를 재던 날 측정이 사장님의 사용자별 상한을 잡아먹으면
// 화면에서 영상이 안 만들어진다. 전역 상한에는 둘 다 함께 잡힌다.
await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
if (mode === "setup") {
  const state = {};
  for (const [label, text] of Object.entries(MATERIALS)) {
    const p = await call("/api/projects", { method: "POST", body: JSON.stringify({ material: { text, photos: [] } }) });
    const b = await call(`/api/projects/${p.id}/briefing`, { method: "POST" });
    const brief = b.briefing || b;
    await call(`/api/projects/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ briefing: { asked: (brief.asked || []).map((a) => ({ ...a, answer: "", done: true })), confirmed: true } }),
    });
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      const sc = await call(`/api/projects/${p.id}/script`, { method: "POST", body: JSON.stringify({}) });
      runs.push(measure((sc.script || sc).text, brief.key_points));
    }
    state[label] = { id: p.id, keyPoints: brief.key_points, topic: brief.topic, A: runs };
    console.log(`${label}: 프로젝트 ${p.id} · 사실 ${brief.key_points.length}개 · A 변형 ${REPEATS}회 완료`);
  }
  writeFileSync(STATE, JSON.stringify(state, null, 1));
  console.log(`\n저장: ${STATE}\n이제 서버를 SHOTFORM_NO_BRIEFING=1 로 다시 띄우고  node ab-briefing.mjs b  를 실행하세요.`);
} else if (mode === "b") {
  if (!existsSync(STATE)) throw new Error("setup을 먼저 실행하세요");
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  for (const [label, s] of Object.entries(state)) {
    const runs = [];
    for (let i = 0; i < REPEATS; i++) {
      const sc = await call(`/api/projects/${s.id}/script`, { method: "POST", body: JSON.stringify({}) });
      runs.push(measure((sc.script || sc).text, s.keyPoints));
    }
    s.B = runs;
  }
  writeFileSync(STATE, JSON.stringify(state, null, 1));

  const avg = (rs, k) => +(rs.reduce((a, r) => a + r[k], 0) / rs.length).toFixed(2);
  console.log("\n자료  변형  사실포함률   글자   초    문장  되풀이");
  console.log("──────────────────────────────────────────────────────");
  for (const [label, s] of Object.entries(state)) {
    for (const v of ["A", "B"]) {
      const rs = s[v];
      const cov = rs.map((r) => r.covered).join(",");
      console.log(
        `${label}     ${v}     ${String(avg(rs, "coverage")).padEnd(5)} (${cov})   ${String(avg(rs, "chars")).padEnd(6)} ${String(avg(rs, "seconds")).padEnd(5)} ${String(avg(rs, "sentences")).padEnd(5)} ${rs.filter((r) => r.repeated).length}/${rs.length}`
      );
    }
  }
  console.log("\n── 원고 비교 ──");
  for (const [label, s] of Object.entries(state)) {
    console.log(`\n[${label}] 사실 ${s.keyPoints.length}개 · 주제: ${s.topic}`);
    console.log(` A(요약 있음): ${s.A[0].text}`);
    console.log(` B(원문만)  : ${s.B[0].text}`);
  }
} else {
  console.log("사용법: node ab-briefing.mjs setup | b");
}
});
