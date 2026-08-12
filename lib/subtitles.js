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

// 완성본에서 이 컷이 차지하는 시간.
//
// ★★ 판정 기준은 **그 컷에 소리 파일이 있는가** 하나다. 프로젝트가 아니다.
//
// 소리 파일이 있으면 합성이 클립을 낭독 길이에 맞춰 자르므로(lib/compose.js 의 `fit`)
// 낭독이 기준이다. i2v 눈금 올림으로 클립이 낭독보다 긴 것이 보통이고, 예전에는 그 차이가
// 그대로 무음이었다(30초 요청에 완성본 32.8초, 정적 4.8초).
//
// 소리 파일이 없으면(클립이 스스로 말한다) 자를 수 없다 — 자르면 말이 잘린다. 그래서
// **받은 클립 길이**가 기준이다. 주문한 초로 자막을 깔면 컷마다 밀린다(Seedance 하한이
// 4초라 3초짜리 컷에서 반드시 벌어진다). 클립이 아직 없으면 추정으로 떨어진다 —
// 화면이 그래도 뭔가 보여야 한다.
//
// ⚠️ **buildFfmpegArgs 의 `fit` 판정과 같은 자를 써야 한다.** 한쪽이 프로젝트를 보고
// 한쪽이 컷을 보면, 모델만 Seedance 로 바뀌고 옛 Kling 클립이 남은 혼합 프로젝트에서
// 갈린다 — 합성은 그 컷을 낭독으로 자르는데 자막은 클립 길이로 흘러 컷마다 뒤로 밀린다.
export function cutSeconds(cut) {
  const clip = Number(cut?.video?.seconds) || 0;
  const spoken = Number(cut?.seconds) || 0;
  return cut?.audio?.url ? (spoken || clip) : (clip || spoken);
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
    // ★ 자막이 머무는 시간(span)과 흘러가는 시간(t)은 **같은 값**이어야 한다.
    //
    // 예전에는 span 만 `spoken || cutSeconds(c)` 로 따로 셌다. 말하지 않는 경로에서는
    // 그 식이 cutSeconds 와 같은 값이라(spoken || clip) 아무 차이가 없었지만, 말하는
    // 경로에서는 spoken(낭독 추정 3초)이 truthy 라 cutSeconds 까지 가지도 못하고 클립
    // 길이(4초)를 놓친다. 그러면 컷 안에서 자막이 1초 일찍 사라지고, 컷 사이에서는
    // 누적이 컷마다 1초씩 앞선다 — 컷 8개면 마지막에 7초다.
    //
    // 그래서 판정을 cutSeconds 하나로 모은다. 말하는 경로는 받은 클립 길이,
    // 그 밖은 낭독(없으면 클립)이다 — 목소리가 실패해도 자막은 나온다.
    const span = cutSeconds(c);
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
    t += span;
  }
  return cues;
}

// 자막이 설 자리 셋. ASS 의 Alignment 는 숫자패드 배치다 — 1~3 하단, 4~6 중간, 7~9 상단.
//
// 세로 여백은 자리마다 뜻이 다르다: 하단은 "바닥에서 얼마나 띄우나", 상단은 "천장에서
// 얼마나 내리나", 중간은 정렬이 이미 중앙이라 무의미해서 0 이다.
const POSITIONS = {
  // 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
  bottom: { alignment: 2, marginRatio: 0.18 },
  middle: { alignment: 5, marginRatio: 0 },
  // 상단 UI(시간·배터리·앱 헤더)를 피한다.
  top: { alignment: 8, marginRatio: 0.12 },
};
export const SUBTITLE_POSITIONS = Object.keys(POSITIONS);
export const DEFAULT_SUBTITLE_POSITION = "bottom";

// 자막 스타일 — 글자 크기·여백은 화면에서 파생된다. 값을 두 곳에 두면 갈라지므로 여기 하나뿐이다.
// (toAss 가 쓰고, 폭 한계도 여기서 나온다.)
//
// ★ 모르는 position 은 조용히 아래로 떨어진다. 던지면 합성이 통째로 죽는데, 자막 위치
//   하나 때문에 이미 값을 치른 클립을 못 쓰게 되는 것이 더 나쁘다.
//
// subtitle(사장님이 고른 설정)을 주면 **크기 배율만** 여기서 곱한다. 배율은 화면에서
// 파생된 글자 크기에 곱하는 것이라, 반올림한 뒤에 곱한다 — 곱하고 반올림하면 화면이 보여
// 준 크기(81)와 완성본의 크기가 한 픽셀씩 갈린다.
export function subtitleStyle({ width, height, position, subtitle }) {
  // hasOwn 으로 묻는다 — `POSITIONS[position]` 만 보면 "constructor"·"toString" 같은
  // 프로토타입 이름이 truthy 라 폴백을 뚫고 alignment=undefined·marginV=NaN 을 낳는다.
  const p = Object.hasOwn(POSITIONS, position) ? POSITIONS[position] : POSITIONS[DEFAULT_SUBTITLE_POSITION];
  // 설정을 안 주면 기본 배율 1 이라 지금과 같은 값이 나온다.
  const { size } = normalizeSubtitle(subtitle);
  return {
    fontSize: Math.round(Math.round(height * 0.042) * size),
    marginH: Math.round(width * 0.08),
    marginV: Math.round(height * p.marginRatio),
    alignment: p.alignment,
  };
}

// 자막 한 덩어리는 두 줄까지다. 세로 화면에서 한 줄이 한글 열한 자 남짓이라,
// 세 줄이 되면 글자가 화면 세로의 3분의 1을 먹는다(2026-07-29 실측: 컷 17개 중 16개가 두 줄 이상,
// 절반이 세 줄, 최악은 다섯 줄로 39%).
export const MAX_SUBTITLE_LINES = 2;

// 한 줄에 들어가는 폭 — 상수로 박지 않는다. 비율이 셋(9:16·1:1·16:9)이고 글자 크기·여백이
// 전부 화면에서 파생되므로, 한계도 같은 식에서 나와야 비율을 바꿨을 때 따라 움직인다.
//
// ★ subtitle(크기 배율)도 받는다 — 배율이 글자 크기를 바꾸므로 한 줄에 들어가는 칸 수도
// 그만큼 줄어든다. 안 받으면 크기 1.6 에서 11칸으로 끊어 놓고 실제로는 7칸만 들어가,
// libass 가 마진에서 다시 접어 세 줄이 된다 — MAX_SUBTITLE_LINES 가 조용히 무너진다.
export function lineWidthUnits({ width, height, subtitle }) {
  const { fontSize, marginH } = subtitleStyle({ width, height, subtitle });
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

// ASS 색은 &HAABBGGRR 다 — RGB 가 아니라 **BGR 역순**이고 앞이 알파(00 = 불투명).
// 뒤집으면 빨강이 파랑으로 나간다. 한 자리에서만 만든다.
export function assColor(hex) {
  const h = String(hex || "").replace("#", "").toUpperCase();
  const rr = h.slice(0, 2) || "FF";
  const gg = h.slice(2, 4) || "FF";
  const bb = h.slice(4, 6) || "FF";
  return `&H00${bb}${gg}${rr}`;
}

// 세이프존과 정렬은 position 이 정한다(기본 bottom) — subtitleStyle 이 유일한 자리다.
//
// subtitle(사장님이 ⑥완성에서 고른 설정)을 주면 폰트·색·크기·자유 위치가 실린다.
// ★ 안 주면 옛 경로 그대로다 — position 만 넘기던 옛 호출(lib/compose.js)이 살아 있어야
//   옛 프로젝트의 완성본이 지금과 똑같이 나온다.
export function toAss(cues, { width, height, position, subtitle }) {
  const { fontSize, marginH, marginV, alignment } = subtitleStyle({ width, height, position, subtitle });

  // 설정을 준 경우에만 자유 위치로 간다. 자유 위치는 \pos 로 절대 좌표를 준다 —
  // Alignment 만으로는 아홉 칸뿐이라 드래그한 자리를 실을 수 없다.
  //
  // ★★ \pos 를 쓰면 Alignment 는 **기준점**이 된다. 그래서 2(하단 중앙)로 고정하고
  // `pos.y` 의 뜻을 **글자 블록의 아랫변**으로 못박는다. 5(가운데)로 두면 같은 좌표라도
  // 블록 **중심**이 그 자리에 와서, 기본값 0.82 가 오늘보다 반 블록만큼 아래로 내려간다
  // (두 줄이면 ~97px, 틱톡 하단 UI 구역). 게다가 오프셋이 줄 수에 비례해 한 줄 컷과
  // 두 줄 컷의 자막이 세로로 덜컹거린다 — 하단 기준인 지금은 없는 현상이다.
  // 하단 기준이라야 기본값이 오늘과 **픽셀 동일**(1920-346 = 0.82*1920 = 1574)이다.
  const styled = subtitle != null;
  const s = normalizeSubtitle(subtitle);
  const font = SUBTITLE_FONTS.find((f) => f.id === s.font) || SUBTITLE_FONTS[0];
  const [px, py] = s.pos;
  const posTag = styled ? `{\\pos(${Math.round(width * px)},${Math.round(height * py)})}` : "";
  const styleAlign = styled ? 2 : alignment;
  // 외곽선은 사장님이 고르지 않는다 — 글자색의 반대 명도라야 어떤 배경에서도 읽힌다.
  const primary = assColor(s.color);
  const outline = assColor(outlineFor(s.color));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,${font.family},${fontSize},${primary},${outline},&H80000000,1,1,3,0,${styleAlign},${marginH},${marginH},${marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;

  const lines = (cues || [])
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Main,,0,0,0,,` +
        posTag +
        // 진짜 줄바꿈이 남으면 그 뒤가 다른 이벤트로 읽힌다
        String(c.text).replace(/\r?\n/g, "\\N")
    )
    .join("\n");

  return header + lines + "\n";
}

// ── 자막 설정 ────────────────────────────────────────────────────────────
//
// 사장님이 ⑥완성에서 고치는 값들이다. **자유롭되 코드가 막는다**(사용자 결정):
// 목록 밖 폰트·잘못된 색·범위 밖 크기·화면 밖 위치는 조용히 되돌린다.
// 던지지 않는 이유는 subtitleStyle 과 같다 — 자막 하나 때문에 합성이 통째로 죽으면 안 된다.

// 폰트는 assets/ 에 실제로 있는 파일만 고를 수 있다.
//
// ★ 이름이 **둘**이다. 뜻이 달라서 갈라 둔다:
// - `family` : **폰트 파일 내부 이름**이다. ffmpeg(ASS 의 Fontname)가 이 이름으로 파일을
//   찾으므로 **절대 바꾸면 안 된다.**
// - `cssFamily` : 브라우저의 @font-face 이름이다. CSS 패밀리 이름은 **대소문자를 안 가려**,
//   next/font/local 이 내는 `'pretendard'` 와 자막용 `Pretendard` 가 같은 가족이 된다.
//   그러면 어느 쪽이 이기는지가 빌드 산출물 순서에 달리고, 뒤집히면 **전 화면이 1.5MB
//   자막 OTF 를 받는다**(반대로는 자막 미리보기가 UI 폰트로 그려진다).
//   그래서 화면·@font-face 는 겹치지 않는 이름을 쓴다.
export const SUBTITLE_FONTS = [
  { id: "basic", label: "기본", family: "Pretendard", cssFamily: "Pretendard Subtitle" },
  { id: "impact", label: "강조", family: "Black Han Sans", cssFamily: "Black Han Sans Subtitle" },
  { id: "soft", label: "부드럽게", family: "Gowun Dodum", cssFamily: "Gowun Dodum Subtitle" },
];

// 한 줄이 차지하는 높이(글자 크기의 배수). 미리보기의 line-height 가 이 값이고,
// 옛 위치를 자유 위치로 옮길 때 글자 블록 높이도 여기서 나온다 — 두 곳에 적으면 갈린다.
export const SUBTITLE_LINE_HEIGHT = 1.25;

export const DEFAULT_SUBTITLE = { pos: [0.5, 0.82], font: "basic", color: "#FFFFFF", size: 1 };

// 화면 가장자리 안전 여백. 이보다 밖이면 잘리거나 UI 에 가린다.
const SAFE = 0.06;
// ★ 화면의 크기 슬라이더가 이 값을 그대로 쓴다 — 값을 두 곳에 두면 언젠가 갈라져,
// 사장님이 슬라이더 끝까지 밀었는데 저장은 다른 값이 되는 일이 생긴다.
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.6;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// 드래그가 만든 0.5000001 을 그대로 저장하면 각인이 달라져 눈에 안 보이는 재굽기가 뜬다 —
// 1080px 화면에서 소수 3자리는 1픽셀보다 잘다.
const q = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

export function clampPos(pos) {
  if (!Array.isArray(pos)) return [...DEFAULT_SUBTITLE.pos];
  const x = Number(pos[0]);
  const y = Number(pos[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [...DEFAULT_SUBTITLE.pos];
  return [q(clamp(x, SAFE, 1 - SAFE), 3), q(clamp(y, SAFE, 1 - SAFE), 3)];
}

// 옛 프로젝트가 쥔 자막 위치(위·중간·아래)를 자유 위치 비율(pos)로 옮긴다.
//
// ★★ 두 값의 **뜻이 다르다.** 새 `pos.y` 는 늘 글자 블록의 **아랫변**인데(toAss 가
// Alignment 2 로 못 박는다), 옛 marginV 는 자리마다 기준이 다르다:
//   아래(2) 바닥에서 아랫변까지 → 1 - 여백  (기본값 0.82 와 같아진다)
//   위(8)   천장에서 **윗변**까지 → 여백 + 글자 블록 높이
//   중간(5) 블록의 **중심**이 한가운데 → 0.5 + 블록 높이의 절반
// 그냥 marginV 를 y 로 쓰면 "위"에 두었던 자막이 [적용] 하는 순간 블록 하나만큼 위로,
// "중간"은 반 블록만큼 위로 튄다.
//
// 블록 높이는 한 줄로 잰다 — 옛 프로젝트에는 크기 배율이 없고, 자막이 한 줄인지 두 줄인지는
// 컷마다 다르다. 한 줄 기준이 어느 쪽으로도 반 줄 이상 틀리지 않는다.
export function posFromLegacyPosition(position) {
  const p = Object.hasOwn(POSITIONS, position) ? POSITIONS[position] : POSITIONS[DEFAULT_SUBTITLE_POSITION];
  const [x] = DEFAULT_SUBTITLE.pos;
  // 1000 은 비율을 읽어내려는 눈금일 뿐이다 — 값은 subtitleStyle 의 식에서 나온다.
  const H = 1000;
  const block = (subtitleStyle({ width: H, height: H }).fontSize * SUBTITLE_LINE_HEIGHT) / H;
  if (p.alignment === 8) return [x, q(p.marginRatio + block, 3)];
  if (p.alignment === 5) return [x, q(0.5 + block / 2, 3)];
  return [x, q(1 - p.marginRatio, 3)];
}

// ★ 배경 밝기를 재지 않는다 — 프레임을 뜯어야 해서 무겁다.
// 글자색의 반대 명도로 외곽선을 정하면(지금도 외곽선 두께 3) 어떤 배경에서도 읽힌다.
export function outlineFor(color) {
  const hex = String(color || "").replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  // 사람 눈이 느끼는 밝기(ITU-R BT.601)
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#FFFFFF";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeSubtitle(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const font = SUBTITLE_FONTS.some((f) => f.id === s.font) ? s.font : DEFAULT_SUBTITLE.font;
  const color = HEX.test(s.color || "") ? String(s.color).toUpperCase() : DEFAULT_SUBTITLE.color;
  // 빈칸·null 은 "안 골랐다"지 0 이 아니다. Number("") 가 0 이라, 그대로 두면 화면에서
  // 숫자 입력을 지우는 순간 자막이 최소 크기(0.7)로 튄다.
  const sizeNum = s.size === "" || s.size == null ? NaN : Number(s.size);
  const size = Number.isFinite(sizeNum) ? q(clamp(sizeNum, SIZE_MIN, SIZE_MAX), 2) : DEFAULT_SUBTITLE.size;
  return { pos: clampPos(s.pos), font, color, size };
}
