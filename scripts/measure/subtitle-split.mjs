// 저장된 프로젝트 전부의 컷 문장에 자막 분할 전(그리디)·후(절 경계 우선)를 돌려 대조한다.
//
//   node scripts/measure/subtitle-split.mjs
//
// 0원이다 — fal 이나 OpenAI 를 부르지 않는다. data/ 는 읽기만 한다.
//
// compare-image-models.mjs 와 같은 골격: 순수 node, lib import 에 확장자를 붙인다.
//
// 세는 것: 조각 경계가 절 경계인 비율(전/후) · 줄 수 분포(세 줄 이상 0개가 목표) ·
// 조각 수 합계(늘지 않아야 한다) · 폭 표준편차 · 원문 보존(100% 여야 한다).
import { readdirSync, readFileSync } from "fs";
import path from "path";
import {
  splitSubtitleText,
  lineWidthUnits,
  MAX_SUBTITLE_LINES,
  breakTwoLines,
  textUnits,
} from "../../lib/subtitles.js";
import { clauseBoundaries } from "../../lib/cuts.js";

const DATA = process.env.SHOTFORM_DATA_DIR || "data";

// ── "전" 재현 — lib/subtitles.js 의 packWords 를 그대로 베꼈다 (2026-07-30) ──
// packWords 는 export 되지 않는다. 실제 코드가 바뀌면 이 사본도 같이 바뀌어야
// 대조가 참으로 남는다 — 안 바뀌면 이 비교는 조용히 거짓말이 된다.
function sentenceRanges(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]+(\s+|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    out.push([start, end]);
    start = end;
  }
  if (start < text.length) out.push([start, text.length]);
  return out.length ? out : [[0, text.length]];
}

function packWords(text, from, to, maxUnits) {
  if (textUnits(text.slice(from, to).trim()) <= maxUnits) return [[from, to]];
  const seg = text.slice(from, to);
  const toks = [...seg.matchAll(/\S+/g)];
  if (toks.length <= 1) return [[from, to]];

  const out = [];
  let pieceStart = from;
  let cur = 0;
  for (const t of toks) {
    const w = textUnits(t[0]);
    if (cur > 0 && cur + 0.3 + w > maxUnits) {
      out.push([pieceStart, from + t.index]);
      pieceStart = from + t.index;
      cur = w;
    } else {
      cur = cur > 0 ? cur + 0.3 + w : w;
    }
  }
  out.push([pieceStart, to]);
  return out;
}

function splitSubtitleTextOld(text, maxUnits) {
  const s = text || "";
  if (!s) return [];
  if (textUnits(s.trim()) <= maxUnits) return [s];
  const out = [];
  for (const [from, to] of sentenceRanges(s)) {
    for (const [a, b] of packWords(s, from, to, maxUnits)) out.push(s.slice(a, b));
  }
  return out;
}
// ── 재현 끝 ──

// 조각 배열을 문장 안 오프셋으로 되짚는다(join("") 계약이므로 순서대로 누적하면 된다).
function pieceOffsets(sentence, pieces) {
  const offsets = [];
  let at = 0;
  for (const p of pieces) {
    offsets.push(at);
    at += p.length;
  }
  return offsets;
}

function lineCount(text, lineUnits) {
  const broken = breakTwoLines(text.trim(), lineUnits);
  return broken.split("\n").length;
}

// ── 프로젝트 전부에서 (sentence, aspect) 쌍을 모은다 ──
const files = readdirSync(path.join(DATA, "projects")).filter((f) => f.endsWith(".json"));

const sentences = [];
for (const f of files) {
  let project;
  try {
    project = JSON.parse(readFileSync(path.join(DATA, "projects", f), "utf8"));
  } catch {
    continue;
  }
  const cuts = Array.isArray(project.cuts) ? project.cuts : [];
  const aspect = project.settings?.aspect_ratio || "9:16";
  for (const cut of cuts) {
    const sentence = (cut?.sentence || "").trim();
    if (!sentence) continue;
    sentences.push({ project: f, sentence, aspect });
  }
}

const SIZES = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

function stats(mode) {
  const lineDist = {}; // lineCount → 개수
  let pieceTotal = 0;
  let clauseHits = 0;
  let clauseOpportunities = 0;
  let preserveOk = 0;
  let preserveFail = 0;
  const widths = [];
  const rows = [];

  for (const { project, sentence, aspect } of sentences) {
    const [width, height] = SIZES[aspect] || SIZES["9:16"];
    const lineUnits = lineWidthUnits({ width, height });
    const maxUnits = lineUnits * MAX_SUBTITLE_LINES;

    const pieces =
      mode === "old" ? splitSubtitleTextOld(sentence, maxUnits) : splitSubtitleText(sentence, maxUnits);

    const joined = pieces.join("");
    if (joined === sentence) preserveOk++;
    else preserveFail++;

    pieceTotal += pieces.length;

    const offsets = pieceOffsets(sentence, pieces);
    const boundaries = new Set(clauseBoundaries(sentence));

    const flags = [];
    for (let i = 0; i < pieces.length; i++) {
      const shown = pieces[i].trim();
      if (!shown) continue;
      widths.push(textUnits(shown));
      const lc = lineCount(shown, lineUnits);
      lineDist[lc] = (lineDist[lc] || 0) + 1;
      if (i > 0) {
        clauseOpportunities++;
        const isClause = boundaries.has(offsets[i]);
        if (isClause) clauseHits++;
        flags.push(isClause ? "" : "✗");
      } else {
        flags.push("");
      }
    }

    rows.push({ project, sentence, pieces, flags });
  }

  const mean = widths.reduce((a, b) => a + b, 0) / (widths.length || 1);
  const variance = widths.reduce((a, b) => a + (b - mean) ** 2, 0) / (widths.length || 1);
  const stdev = Math.sqrt(variance);

  return {
    lineDist,
    pieceTotal,
    clauseHits,
    clauseOpportunities,
    clauseRatio: clauseOpportunities ? clauseHits / clauseOpportunities : null,
    preserveOk,
    preserveFail,
    stdev,
    rows,
    sentenceCount: sentences.length,
  };
}

const before = stats("old");
const after = stats("new");

function fmtLineDist(dist) {
  const maxLine = Math.max(0, ...Object.keys(dist).map(Number));
  const cells = [];
  for (let i = 1; i <= Math.max(maxLine, 2); i++) cells.push(dist[i] || 0);
  return cells;
}

console.log(`저장된 프로젝트 ${files.length}개 · 문장 있는 컷 ${sentences.length}개\n`);

const maxLine = Math.max(
  2,
  ...Object.keys(before.lineDist).map(Number),
  ...Object.keys(after.lineDist).map(Number)
);
const header = ["줄수"].concat(Array.from({ length: maxLine }, (_, i) => `${i + 1}줄`));
console.log(header.join("\t"));
console.log(["전"].concat(Array.from({ length: maxLine }, (_, i) => before.lineDist[i + 1] || 0)).join("\t"));
console.log(["후"].concat(Array.from({ length: maxLine }, (_, i) => after.lineDist[i + 1] || 0)).join("\t"));

const threePlusBefore = Object.entries(before.lineDist)
  .filter(([k]) => Number(k) >= 3)
  .reduce((a, [, v]) => a + v, 0);
const threePlusAfter = Object.entries(after.lineDist)
  .filter(([k]) => Number(k) >= 3)
  .reduce((a, [, v]) => a + v, 0);

console.log(`\n지표\t전\t후`);
console.log(`세 줄 이상\t${threePlusBefore}\t${threePlusAfter}`);
console.log(`조각 수 합계\t${before.pieceTotal}\t${after.pieceTotal}`);
console.log(
  `절 경계 비율\t${before.clauseHits}/${before.clauseOpportunities}` +
    ` (${before.clauseRatio === null ? "N/A" : (before.clauseRatio * 100).toFixed(1) + "%"})` +
    `\t${after.clauseHits}/${after.clauseOpportunities}` +
    ` (${after.clauseRatio === null ? "N/A" : (after.clauseRatio * 100).toFixed(1) + "%"})`
);
console.log(`폭 표준편차\t${before.stdev.toFixed(2)}\t${after.stdev.toFixed(2)}`);
console.log(
  `원문 보존\t${before.preserveOk}/${before.preserveOk + before.preserveFail}` +
    `\t${after.preserveOk}/${after.preserveOk + after.preserveFail}`
);

console.log(`\n컷별 목록 (✗ = 그 자리가 절 경계가 아니다)\n`);
for (let i = 0; i < after.rows.length; i++) {
  const b = before.rows[i];
  const a = after.rows[i];
  console.log(`── ${a.project} · ${a.sentence.slice(0, 60)}${a.sentence.length > 60 ? "…" : ""}`);
  console.log(
    `   전: ` + b.pieces.map((p, idx) => `${b.flags[idx]}${p.trim()}`).join(" | ")
  );
  console.log(
    `   후: ` + a.pieces.map((p, idx) => `${a.flags[idx]}${p.trim()}`).join(" | ")
  );
}
