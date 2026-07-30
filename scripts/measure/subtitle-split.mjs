// 저장된 프로젝트 전부의 컷 문장에 자막 분할 전(그리디)·후(절 경계 우선)를 돌려 대조한다.
//
//   node scripts/measure/subtitle-split.mjs
//
// 0원이다 — fal 이나 OpenAI 를 부르지 않는다. data/ 는 읽기만 한다.
//
// compare-image-models.mjs 와 같은 골격: 순수 node, lib import 에 확장자를 붙인다.
//
// 세는 것: 조각 경계가 절 경계인 비율(전/후) · 줄 수 분포(세 줄 이상 0개가 목표) ·
// 조각 수 합계(늘지 않아야 한다) · 폭 표준편차 · 원문 보존(100% 여야 한다) ·
// 그리디(packWords) 로 떨어진 문장 수(전/후 조각이 완전히 같은 문장, 그 위 상한) ·
// 줄 초과 수(breakTwoLines 뒤에도 lineUnits 를 넘는 LINE 이 몇 개인가).
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

// ── "전" 재현 — lib/subtitles.js 의 packWords·sentenceRanges 를 그대로 베꼈다 (2026-07-30) ──
// 둘 다 export 되지 않는다. 실제 코드가 바뀌면 이 사본도 같이 바뀌어야
// 대조가 참으로 남는다 — 안 바뀌면 이 비교는 조용히 거짓말이 된다.
// sentenceRanges 도 사본이다 — 문장 경계 정규식이 바뀌면 "전" 쪽과 "후" 쪽 오프셋
// 해석이 같이 어긋난다(이쪽만 안 바뀌면 대조가 조용히 거짓말이 된다).
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

// breakTwoLines 는 \n 을 최대 하나만 넣으므로 split("\n").length 는 전(前)·후(後) 어느
// 쪽도 2를 못 넘는다 — "세 줄 이상 0개"는 그래서 항상 참이고, 무엇을 측정해도 실패할 수
// 없는 지표였다(FIX 4). 진짜 위험은 줄 수가 아니라 **폭**이다 — breakTwoLines 가 고른
// 자리 양쪽 LINE 중 하나가 lineUnits 를 넘으면 libass 가 렌더 시점에 그 LINE 을 또
// 줄바꿈해 세 줄이 된다. 이것만이 렌더에서 세 줄이 되는지를 실제로 가른다.
function overWidthLines(text, lineUnits) {
  const broken = breakTwoLines(text.trim(), lineUnits);
  return broken.split("\n").filter((line) => textUnits(line.trim()) > lineUnits).length;
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
  let overWidthCount = 0;
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
      overWidthCount += overWidthLines(shown, lineUnits);
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
    overWidthCount,
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

// FIX 3 — "후" 가 그리디(packWords)로 떨어진 문장 수의 **상한**이다. 조각 배열이 전(前)과
// 완전히 같으면(개수·문자열 전부) 새 알고리즘도 packWords 로 떨어졌을 가능성이 크다.
// 상한인 이유: 절 경계 우선 분할이 우연히 그리디와 같은 자리를 고르는 경우도 이 조건에
// 걸린다 — 그 경우는 폴백이 아니라 "절 경계가 마침 그리디 자리와 같았다"이다. 그래도
// 이것이 프로덕션 코드에 손대지 않고 셀 수 있는 자유로운(0원) 값이다.
let fallbackCount = 0;
for (let i = 0; i < sentences.length; i++) {
  const b = before.rows[i].pieces;
  const a = after.rows[i].pieces;
  if (b.length === a.length && b.every((p, idx) => p === a[idx])) fallbackCount++;
}

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

console.log(`\n지표\t전\t후`);
// FIX 4 — breakTwoLines 는 \n 을 최대 하나만 넣으므로 split("\n").length 는 전·후 어느
// 쪽도 3을 넘을 수 없다. 즉 "세 줄 이상 0개"는 실패할 수 없는 지표였다(공허하다) —
// 그 행은 지웠다. 대신 렌더에서 실제로 세 줄이 되는지를 가르는 값, LINE 폭 초과 수를 잰다.
console.log(`줄 폭 초과(렌더 시 재줄바꿈 위험)\t${before.overWidthCount}\t${after.overWidthCount}`);
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
console.log(
  `\n그리디(packWords) 로 떨어진 문장 수(상한)\t${fallbackCount}/${sentences.length}` +
    ` (${sentences.length ? ((fallbackCount / sentences.length) * 100).toFixed(1) : "0.0"}%)`
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
