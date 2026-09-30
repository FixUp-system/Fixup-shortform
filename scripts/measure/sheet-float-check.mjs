// 판 자동 검사 — VLM 이 "받쳐지지 않고 떠 있는 소품"을 맞히는지 잰다(2026-09-30 롱폼 30~44초 시험).
//
// ★ 왜: 롱폼 구간 1·2·3 판의 칸 4 가 세 번 다 "아무도 안 든 우산"이었고, 사람이 보고서야 알았다.
//   판($0.83)이 H3($0.90)보다 싸니 판에서 걸러 다시 그리면 품질과 값을 같이 지킨다 — 다만
//   CLAUDE.md: "VLM 검수를 믿지 마라(틀린 가격을 칭찬했다)". 그래서 **도입 전에 정확도부터 잰다.**
// ★ 질문은 우산을 집지 않는다 — 서비스에서는 소품이 매번 다르다.
// ★ 정답(라벨)은 사람이 판을 보고 붙인 것이다(아래 LABELS). 판이 늘면 여기에 더한다.
//
//   node scripts/measure/sheet-float-check.mjs <작업폴더> [--gpt-runs 3] [--claude-runs 1]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { spawnSync } from "child_process";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const ffmpeg = (await import("ffmpeg-static")).default;

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.error("사용법: sheet-float-check.mjs <작업폴더> [--gpt-runs 3] [--claude-runs 1]"); process.exit(1); }
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? Number(rest[i + 1]) : d; };
const GPT_RUNS = opt("--gpt-runs", 3);
const CLAUDE_RUNS = opt("--claude-runs", 1);

// 판 파일 → 칸별 정답(true = 떠 있는 소품이 있다). 2×2 판, 칸 번호는 읽는 순서(왼→오, 위→아래).
// romance-busstop(2026-09-30) 라벨 — 사람이 판을 보고 붙였다:
//   seg1-sheet: 칸 4 — 팔짱 낀 두 사람 위에 우산, 남자 두 손은 주머니
//   seg2-sheet: 칸 4 — 버스에 오르는 뒷모습, 남자 오른손은 버스 문, 왼팔은 팔짱
//   seg3-sheet-v1: 칸 4 — 이슬비 속 뒷모습, 남자 왼손은 여자 손, 오른손은 아래
//   seg3-sheet: 네 칸 다 정상(인물 참조 + 칸 4 정면 구도로 다시 그린 판)
const LABELS = {
  "seg1-sheet.png": [false, false, false, true],
  "seg2-sheet.png": [false, false, false, true],
  "seg3-sheet-v1.png": [false, false, false, true],
  "seg3-sheet.png": [false, false, false, false],
};

const QUESTION = [
  "This is one panel of a film storyboard. Check it for one physical mistake only:",
  "is there any object that should be held by a hand or supported by something (an umbrella, cup, bag, phone, tool…)",
  "but is instead floating in the air — no hand is gripping it and nothing is supporting it?",
  "An open umbrella above people counts as floating unless you can see a hand holding its handle or shaft.",
  "A closed umbrella leaning against a table, wall or leg is supported, not floating.",
  'Answer JSON only: {"floating": true|false, "object": "what floats, or empty", "why": "one short sentence"}',
].join(" ");

const outDir = path.join(dir, "_sheet-check");
mkdirSync(outDir, { recursive: true });

function panels(file) {
  const out = [];
  const crops = [[0, 0], [1, 0], [0, 1], [1, 1]];
  crops.forEach(([cx, cy], i) => {
    const p = path.join(outDir, `${path.basename(file, ".png")}-p${i + 1}.jpg`);
    if (!existsSync(p)) {
      const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", file, "-vf", `crop=iw/2:ih/2:${cx}*iw/2:${cy}*ih/2,scale=540:-2`, "-q:v", "3", p]);
      if (r.status !== 0) throw new Error(`자르기 실패: ${file}`);
    }
    out.push(p);
  });
  return out;
}

const parse = (t) => {
  const s = String(t || "").replace(/^[^{]*/, "").replace(/[^}]*$/, "");
  return JSON.parse(s);
};

async function askGpt(jpg) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: QUESTION },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${readFileSync(jpg).toString("base64")}` } },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`gpt-4o ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return parse(d.choices?.[0]?.message?.content);
}

const claude = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
async function askClaude(jpg) {
  const d = await claude.messages.create({
    model: "claude-opus-5", max_tokens: 400,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: readFileSync(jpg).toString("base64") } },
      { type: "text", text: QUESTION },
    ] }],
  });
  return parse((d.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""));
}

const rows = [];
for (const [file, labels] of Object.entries(LABELS)) {
  const full = path.join(dir, file);
  if (!existsSync(full)) { console.log(`(없음 — 건너뜀) ${file}`); continue; }
  const ps = panels(full);
  for (const [i, jpg] of ps.entries()) {
    const row = { sheet: file, panel: i + 1, truth: labels[i], gpt: [], claude: [], notes: [] };
    for (let k = 0; k < GPT_RUNS; k++) {
      const a = await askGpt(jpg);
      row.gpt.push(a.floating === true);
      if (a.floating) row.notes.push(`gpt: ${a.object} — ${a.why}`);
    }
    for (let k = 0; k < CLAUDE_RUNS; k++) {
      const a = await askClaude(jpg);
      row.claude.push(a.floating === true);
      if (a.floating) row.notes.push(`claude: ${a.object} — ${a.why}`);
    }
    rows.push(row);
    const mark = (arr) => arr.map((b) => (b ? "떠" : "·")).join("");
    console.log(`${file} 칸${i + 1}  정답 ${row.truth ? "떠있음" : "정상  "}  gpt[${mark(row.gpt)}]  claude[${mark(row.claude)}]`);
  }
}

function score(key) {
  let tp = 0, fp = 0, fn = 0, tn = 0, unstable = 0;
  for (const r of rows) {
    const votes = r[key];
    if (!votes.length) continue;
    if (new Set(votes).size > 1) unstable++;
    const said = votes.filter(Boolean).length * 2 > votes.length; // 과반
    if (said && r.truth) tp++; else if (said) fp++; else if (r.truth) fn++; else tn++;
  }
  return { tp, fp, fn, tn, unstable };
}
const summary = { gpt: score("gpt"), claude: score("claude") };
console.log("\n요약(과반 판정) — tp: 떠 있는 것을 잡음 · fn: 놓침 · fp: 멀쩡한 것을 떠 있다고 함");
console.log(JSON.stringify(summary, null, 2));
writeFileSync(path.join(outDir, "result.json"), JSON.stringify({ question: QUESTION, rows, summary }, null, 2));
console.log(`\n자세한 답 — ${path.join(outDir, "result.json")}`);
