// 자막 — 컷 경계가 곧 자막 경계다.
// cut.seconds 는 ③목소리에서 실측된 낭독 길이라, 자막이 화면에 머무는 시간이 그 값이다.
//
// 합성이 클립을 낭독 길이로 맞추므로(짧으면 tpad 로 늘리고 길면 trim 으로 자른다)
// 자막이 뜨는 자리도 낭독 길이로 누적하면 맞는다. 예전에는 둘이 갈라져 있어
// 자막이 갈수록 앞서고 마지막 몇 초는 말하는데 자막이 없었다.
//
// ASS 를 쓰는 이유: 위치·여백을 스타일 한 줄로 정할 수 있고 ffmpeg 의 subtitles 필터가
// 폰트 파일을 그대로 받는다. drawtext 로 문장마다 필터를 쌓는 것보다 단순하다.

import { clauseBoundaries } from "./clauses.js";

const round2 = (n) => Math.round(n * 100) / 100;

// 완성본에서 이 컷이 차지하는 시간 = **낭독 길이**.
//
// 예전에는 max(낭독, 클립)이었다. i2v 눈금(6·8·10…)이 올림이라 클립이 낭독보다 긴 것이
// 보통이고, 그 차이가 그대로 무음이 됐다(30초 요청에 완성본 32.8초, 정적 4.8초).
// 이제 합성이 남는 클립을 잘라내므로(lib/compose.js) 구간 길이는 낭독이다.
//
// 낭독이 없으면(목소리 실패) 클립 길이로 떨어진다 — 합성은 그래도 돌아야 한다.
export function cutSeconds(cut) {
  const spoken = Number(cut?.seconds) || 0;
  const clip = Number(cut?.video?.seconds) || 0;
  return spoken || clip;
}

// 컷 하나가 자막 여러 개를 낼 수 있다 — 세로 화면에서 자막이 세 줄을 넘으면 글자가 화면의
// 3분의 1을 먹기 때문이다. 컷·그림·클립은 그대로다(자막을 나누는 데는 값이 들지 않는다).
//
// opts(치수)를 주지 않으면 나누지 않는다. 폭 한계가 화면에서 파생되므로 치수 없이는 잴 수 없고,
// 그때는 예전 동작(컷당 자막 하나)이 맞다.
//
// 시간은 조각의 **공백 뺀 글자 수 비례**로 나눈다 — fal TTS 가 길이만 주고 단어별 시각은
// 주지 않기 때문이다(lib/tts.js). 근사지만 **마지막 조각의 끝을 컷의 끝에 못 박아** 오차가
// 컷 경계에서 리셋된다. 컷이 8초 이하라 상한도 작다. 예전에 자막이 갈수록 앞서던 결함은
// 컷 사이에서 값이 갈라져 생긴 것이고, 이 못이 그것을 컷 안에서 재현하지 않게 한다.
export function buildCues(cuts, opts) {
  const maxUnits = opts ? lineWidthUnits(opts) * MAX_SUBTITLE_LINES : Infinity;
  const lineUnits = opts ? lineWidthUnits(opts) : Infinity;

  let t = 0;
  const cues = [];
  for (const c of cuts || []) {
    // 자막이 머무는 시간은 낭독만큼이다 — 무음 구간까지 띄우면 말이 끝난 뒤에도 남는다
    const spoken = Number(c.seconds) || 0;
    // 낭독이 없으면(목소리 실패) 이 컷이 차지하는 시간을 나눠 쓴다 — 자막은 나와야 한다
    const span = spoken || cutSeconds(c);
    const text = (c.sentence || "").trim();
    if (text) {
      const pieces = splitSubtitleText(text, maxUnits);
      const weights = pieces.map((p) => p.replace(/\s/g, "").length);
      const total = weights.reduce((a, b) => a + b, 0);
      let acc = 0;
      pieces.forEach((piece, i) => {
        const shown = piece.trim();
        const share = total ? (weights[i] / total) * span : span / pieces.length;
        const start = t + acc;
        acc += share;
        // 마지막 조각의 끝은 컷의 끝에 못 박는다 — 비례 오차가 다음 컷으로 넘어가지 않게
        const end = i === pieces.length - 1 ? t + span : t + acc;
        if (shown) cues.push({ start: round2(start), end: round2(end), text: breakTwoLines(shown, lineUnits) });
      });
    }
    // 문장이 없어도 시간은 흐른다 — 건너뛰면 뒤 자막이 전부 밀린다
    t += cutSeconds(c);
  }
  return cues;
}

// 자막 스타일 — 글자 크기·여백은 화면에서 파생된다. 값을 두 곳에 두면 갈라지므로 여기 하나뿐이다.
// (toAss 가 쓰고, 폭 한계도 여기서 나온다.)
export function subtitleStyle({ width, height }) {
  return {
    fontSize: Math.round(height * 0.042),
    marginH: Math.round(width * 0.08),
    // 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
    marginV: Math.round(height * 0.18),
  };
}

// 자막 한 덩어리는 두 줄까지다. 세로 화면에서 한 줄이 한글 열한 자 남짓이라,
// 세 줄이 되면 글자가 화면 세로의 3분의 1을 먹는다(2026-07-29 실측: 컷 17개 중 16개가 두 줄 이상,
// 절반이 세 줄, 최악은 다섯 줄로 39%).
export const MAX_SUBTITLE_LINES = 2;

// 한 줄에 들어가는 폭 — 상수로 박지 않는다. 비율이 셋(9:16·1:1·16:9)이고 글자 크기·여백이
// 전부 화면에서 파생되므로, 한계도 같은 식에서 나와야 비율을 바꿨을 때 따라 움직인다.
export function lineWidthUnits({ width, height }) {
  const { fontSize, marginH } = subtitleStyle({ width, height });
  return (width - marginH * 2) / fontSize;
}

// 글자 수가 아니라 **폭**으로 센다 — "3,000원" 처럼 숫자가 섞이면 둘이 어긋난다.
// 근사지만 한쪽으로만 틀린다(실제보다 넓게 잡힌다) — 좁게 잡히면 세 줄로 넘치기 때문이다.
// 이모지도 실제 렌더에서는 한글급 전각 폭을 먹으므로 같은 쪽(넓게)으로 넣는다 —
// 반 칸으로 세면 실제보다 좁게 잡혀 역시 세 줄로 넘친다.
const WIDE = /[ᄀ-ᇿ㄰-㆏가-힯　-〿一-鿿！-｠\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
export function textUnits(text) {
  let u = 0;
  for (const ch of text || "") {
    if (ch === " ") u += 0.3;
    else if (WIDE.test(ch)) u += 1.0;
    else u += 0.5;
  }
  return u;
}

// 문장 끝에서 끊을 자리 — 마침표·느낌표·물음표 뒤. 범위는 서로 붙어 있어 빈틈이 없다.
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

// 한 구간을 어절 경계로 욕심껏 채운다. 낱말이 하나뿐이면 넘쳐도 그대로 둔다 —
// 글자 중간에서 자르면 말이 깨진다(컷 분할의 "못 쪼개는 문장은 통과시킨다"와 같은 결).
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
    // 첫 낱말은 무조건 담는다 — 한 낱말이 한계를 넘어도 그 자리에서 끊을 수는 없다
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

// 한 구간을 조각으로 나눈다 — **조각 수를 먼저 정하고 자리를 고른다.**
//
// 그리디(packWords)를 그만두는 이유: 두 줄이 꽉 차는 자리가 제품명 중간인지 관형어와 명사
// 사이인지 알지 못한다. 2026-07-30 완성본에서 "VT" / "PDRN 시카 엑소좀" 으로 갈리고
// "다음" / "날" 로 갈렸다.
//
// 조각 수는 ceil(폭/두줄폭) — **최소값이다.** 자막 개수가 늘면 화면이 산만해진다.
// 자리는 절 경계를 먼저 보고, 목표 폭(전체/n)에 가장 가까운 것을 순차로 고른다.
// 조합을 전수 탐색하지 않는다 — 어절 후보가 많은 긴 문장에서 폭발한다.
// pool 에서 조각 수 n 에 맞춰 자리를 고른다. 후보가 모자라거나(중간 조각) 마지막 조각이
// maxUnits 를 넘으면 null — "이 후보 풀로는 안 된다"는 뜻이고 부르는 쪽이 넓은 풀로
// 다시 시도하거나 그리디로 떨어진다.
function pickPositions(text, from, to, n, pool, clauseSet, maxUnits) {
  if (!pool.length) return null;
  const total = textUnits(text.slice(from, to).trim());
  const target = total / n;
  const picked = [];
  let start = from;
  for (let k = 1; k < n; k++) {
    // 남은 조각 수에 맞춰 이번 조각의 목표 끝을 정한다
    let best = null;
    let bestDiff = Infinity;
    let bestIsClause = false;
    for (const pos of pool) {
      if (pos <= start) continue;
      if (picked.length && pos <= picked[picked.length - 1]) continue;
      const w = textUnits(text.slice(start, pos).trim());
      if (w > maxUnits) break;                       // 더 가도 넘칠 뿐이다
      const diff = Math.abs(w - target);
      const isClause = clauseSet.has(pos);
      // 거리가 먼저다. 같은 거리면 절 경계가 이긴다 — 그것이 이 분할의 목적이다.
      if (diff < bestDiff || (diff === bestDiff && isClause && !bestIsClause)) {
        bestDiff = diff; best = pos; bestIsClause = isClause;
      }
    }
    if (best === null) return null;
    picked.push(best);
    start = best;
  }
  // 마지막 조각도 두 줄 안에 들어와야 한다 — 안 되면 이 풀로는 실패다
  if (textUnits(text.slice(start, to).trim()) > maxUnits) return null;
  return picked;
}

function splitBalanced(text, from, to, maxUnits) {
  const seg = text.slice(from, to);
  const total = textUnits(seg.trim());
  if (total <= maxUnits) return [[from, to]];

  const n = Math.ceil(total / maxUnits);
  const clauses = clauseBoundaries(seg).map((x) => from + x);
  const words = [...seg.matchAll(/\S+/g)].slice(1).map((t) => from + t.index);
  // 절 경계도 어절 시작 위치라 아래 wide 후보에 합쳐지면 "이게 절 경계였다"는 출처가
  // 사라진다. 그래서 따로 쥐어 뒀다가, 고르는 비교에서 (거리, 절 여부) 두 단계로 쓴다.
  const clauseSet = new Set(clauses);
  const widePool = [...new Set([...clauses, ...words])].sort((a, b) => a - b);
  // 절 경계가 n-1개 이상이면 절 경계만으로 먼저 시도한다. 모자라면 처음부터 어절
  // 경계까지 넓힌 풀을 쓴다.
  const firstPool = clauses.length >= n - 1 ? clauses : widePool;

  let picked = pickPositions(text, from, to, n, firstPool, clauseSet, maxUnits);
  // 절 경계만으로 시도했는데 실패했으면(후보가 나쁜 자리에 있어 끝 조각이 넘쳤거나
  // 후보가 모자랐다) 그리디로 바로 떨어지지 않는다 — 절 경계 사이에 있던 어절 경계가
  // 아직 후보로 한 번도 안 나와 봤을 수 있다. 폭을 넓혀 한 번 더 시도한다.
  if (picked === null && firstPool !== widePool) {
    picked = pickPositions(text, from, to, n, widePool, clauseSet, maxUnits);
  }
  if (picked === null) return packWords(text, from, to, maxUnits);

  const out = [];
  let a = from;
  for (const pos of picked) { out.push([a, pos]); a = pos; }
  out.push([a, to]);
  return out;
}

// 자막 한 덩어리가 두 줄을 넘지 않게 나눈다.
//
// 조각은 토큰을 다시 잇지 않고 **원본에서 slice** 한다 — 이어붙이면 원문과 글자 그대로 같다.
// 컷 분할이 같은 방법으로 원고 보존을 지킨다(lib/cuts.js). 원고 → 컷 → 자막까지 사슬이 이어진다.
//
// 나누는 순서: ① 한계 이하면 통째로 ② 문장 끝 ③ 그래도 넘치면 어절 경계.
export function splitSubtitleText(text, maxUnits) {
  const s = text || "";
  // 빈 글만 조각이 없다. 공백만 있는 글은 조각 하나로 돌려준다 —
  // 이어붙이면 원문과 같다는 보장은 조건 없이 참이어야 한다.
  if (!s) return [];
  if (textUnits(s.trim()) <= maxUnits) return [s];
  const out = [];
  for (const [from, to] of sentenceRanges(s)) {
    for (const [a, b] of splitBalanced(s, from, to, maxUnits)) out.push(s.slice(a, b));
  }
  return out;
}

// 한 줄을 넘치면 어절 경계에 줄바꿈을 넣는다. **두 줄 폭이 가장 비슷해지는 자리**를 고른다 —
// ASS 자동 줄바꿈에 맡기면 어색한 자리에서 끊기고("전문적인 장비" / "와 세제를"),
// 한 줄짜리 꼬리가 남는다.
export function breakTwoLines(text, lineUnits) {
  const s = text || "";
  if (textUnits(s) <= lineUnits) return s;
  const toks = [...s.matchAll(/\S+/g)];
  if (toks.length <= 1) return s;
  let best = null;
  let bestDiff = Infinity;
  for (let i = 1; i < toks.length; i++) {
    const at = toks[i].index;
    const diff = Math.abs(textUnits(s.slice(0, at).trim()) - textUnits(s.slice(at).trim()));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = at;
    }
  }
  return `${s.slice(0, best).trim()}\n${s.slice(best).trim()}`;
}

function assTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
export function toAss(cues, { width, height }) {
  const { fontSize, marginH, marginV } = subtitleStyle({ width, height });

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Pretendard,${fontSize},&H00FFFFFF,&H00000000,&H80000000,1,1,3,0,2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;

  const lines = (cues || [])
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Main,,0,0,0,,` +
        // 진짜 줄바꿈이 남으면 그 뒤가 다른 이벤트로 읽힌다
        String(c.text).replace(/\r?\n/g, "\\N")
    )
    .join("\n");

  return header + lines + "\n";
}
