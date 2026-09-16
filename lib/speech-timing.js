import { CHARS_PER_SEC } from "./script.js";

// 자막 시각을 **모델이 실제로 말한 때**에 맞춘다. 순수 함수다(네트워크 결과만 받는다).
//
// ★★ 왜: 우리 자막은 컷 경계 누적으로 시각을 잡는데(lib/subtitles.js 의 buildCues),
//   통짜로 굽는 영상은 모델이 자기 리듬으로 말한다. 2026-08-25 떡볶이 15초 실측:
//     계획 0.00s → 실제 0.03s  (+0.03)
//     계획 5.00s → 실제 6.47s  (+1.47)
//     계획 10.50s → 실제 10.09s (-0.41)
//     계획 13.50s → 실제 11.51s (-1.99)   ← 말이 끝난 뒤에 자막이 뜬다
//   **앞뒤로 흔들려 상수 보정이 안 된다.** 재는 수밖에 없다.
//   (buildCues 는 이 값을 이미 읽는다 — 2026-08-19 에 그 자리를 만들어 두었다.)
//
// ★★★ **글자는 whisper 에서 가져오지 않는다.** 같은 실측에서 모델이 대사를 바꿔 말했다:
//   "끓이기만 하면 돼요" → "끄기만 하면 돼요". 뜻이 달라지는데 그걸 자막으로 태우면
//   **화면에 오타가 박힌다.** whisper 는 "언제 말했나"만 답하고, "무엇을 말했나"는
//   시나리오(cut.sentence)가 답한다. 이 규율이 이 파일의 존재 이유다.

// 말하는 컷(문장)마다 whisper 조각에서 **처음 말한 때~마지막으로 말한 때**를 붙인다.
//
// ★★★ 2026-09-15 사장님 신고 — *"V라인 리프팅 디바이스 영상이 자막이 하나도 안 맞아."*
//   예전에는 **조각 하나 = 문장 하나**로 순서대로 짝지었다. 그런데 whisper(segment)는 문장이
//   아니라 **말이 쉬는 곳**에서 끊는다 — 쉼표마다 조각이 생긴다. 조각 하나가 더 생기면 그 뒤
//   문장이 전부 한 칸씩 밀리고, 마지막 문장은 자막이 없다. 떡볶이(08-25)는 쉼표가 적어
//   우연히 맞았고, 쉼표가 문장마다 있는 V라인 두 편에서 드러났다(tests/speech-timing.test.js).
//
// ★ 그래서 **순서는 지키되 단위를 글자로 바꾼다.** 원고를 공백·문장부호를 뺀 글자 줄로 보고,
//   조각들도 같은 자로 잰 글자 줄로 본다. 문장 경계가 들은 글자 줄의 어디에 떨어지는지
//   (전체 대비 비율)를 구하고, 그 자리의 시각을 조각 시각에서 읽는다.
//   · 경계가 조각 경계 가까이에 떨어지면 그 조각 경계에 **붙인다** — "V라인"↔"브이라인",
//     "3분"↔"삼 분" 같은 글자 수 차이가 경계를 조각 안으로 살짝 밀어 넣는 것을 흡수한다.
//     그래서 문장은 앞 조각의 끝에서 끝나고 다음 조각의 시작에서 시작한다(쉼 구간 제외).
//   · 조각 하나가 두 문장을 품으면 그 조각 안에서 글자 비례로 나눈다.
// ★ **글자 내용은 여전히 안 쓴다**(위 ★★★) — 조각의 글자 **개수**만 쓴다. 모델이 "끓이기"를
//   "끄기"로 말해도 한 글자 차이는 경계를 조금 옮길 뿐이고, 위의 붙이기가 그것을 받는다.
// ★ 믿을 수 없으면 **아무것도 안 붙인다** — 반쯤 맞은 시각은 통째로 밀린 자막을 만든다.
//   바닥(컷 경계·글자 비례)이 그보다 낫다:
//   · 들은 글자 수가 원고의 절반 미만이거나 두 배 초과(못 들었거나, 노랫말 같은 딴 말을 들었다)
//   · 조각에 글자가 없다 — 그때는 **개수가 같을 때만** 예전처럼 순서로 붙인다
export function alignSpeech(cuts, chunks) {
  const list = Array.isArray(cuts) ? cuts : [];
  const parts = (Array.isArray(chunks) ? chunks : [])
    .map((c) => ({ start: Number(c?.timestamp?.[0]), end: Number(c?.timestamp?.[1]), text: c?.text }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
  if (!list.length || !parts.length) return list;

  const speaking = [];
  list.forEach((cut, i) => {
    if (typeof cut?.sentence === "string" && cut.sentence.trim()) speaking.push(i);
  });
  if (!speaking.length) return list;

  const spans = spansFor(speaking.map((i) => list[i].sentence), parts);
  if (!spans) return list;

  const out = list.slice();
  speaking.forEach((i, k) => {
    const s = spans[k];
    if (!s || !(s.end > s.start)) return;
    // ★ sentence 는 손대지 않는다 — 위 ★★★ 참고.
    out[i] = { ...list[i], spoken_start: round2(s.start), spoken_seconds: round2(s.end - s.start) };
  });
  return out;
}

// 문장 경계가 조각 경계에 이만큼(글자) 가까우면 조각 경계에 붙인다.
// ★ 2 인 이유: 원고↔발음의 흔한 차이가 한두 글자다("V라인"→"브이라인" +1, "3분"→"삼분" +1,
//   "당겨 주는"→"당겨주는" 0). 더 넓히면 짧은 조각(쉼표 앞 두세 글자)의 경계를 잘못 집는다.
const SNAP_CHARS = 2;
// 들은 글자 ÷ 원고 글자가 이 밖이면 믿지 않는다.
// ★ 발음 차이로 생기는 어긋남은 몇 퍼센트다(V라인 두 편: 원고 대비 +2~3%). 4분의 1을 넘게
//   못 들었거나 절반을 넘게 더 들었으면 발음 차이가 아니라 **다른 말**이다(빠진 문장·노랫말).
const MIN_HEARD_RATIO = 0.75;
const MAX_HEARD_RATIO = 1.5;

// 시각은 **글자 수**로만 잰다 — 공백·문장부호·기호는 말하는 시간이 아니다.
function charCount(s) {
  return typeof s === "string" ? s.replace(/[\s\p{P}\p{S}]/gu, "").length : 0;
}

function spansFor(sentences, parts) {
  const hasText = parts.every((p) => charCount(p.text) > 0);
  if (!hasText) {
    // 묶을 자가 없다 — 개수가 같을 때만 예전처럼 순서로 붙인다.
    if (parts.length !== sentences.length) return null;
    return parts.map((p) => ({ start: p.start, end: p.end }));
  }

  const weights = sentences.map((s) => Math.max(charCount(s), 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const lens = parts.map((p) => charCount(p.text));
  const heard = lens.reduce((a, b) => a + b, 0);
  const ratio = heard / total;
  if (ratio < MIN_HEARD_RATIO || ratio > MAX_HEARD_RATIO) return null;

  // 조각 경계의 글자 위치: edges[j] = 조각 j 가 끝나는 자리(들은 글자 기준)
  const edges = [];
  let acc = 0;
  for (const len of lens) { acc += len; edges.push(acc); }

  // 들은 글자 위치 x 의 시각. side="start" 는 조각 경계에서 **다음 조각의 시작**,
  // side="end" 는 **앞 조각의 끝**을 준다 — 조각 사이 쉼은 어느 문장에도 안 들어간다.
  const bounds = [0, ...edges];                 // bounds[b] = 조각 b 가 시작하는 자리
  const timeAt = (x, side) => {
    // ① 가장 가까운 조각 경계에 붙일 수 있으면 붙인다
    let nearest = 0;
    for (let b = 1; b < bounds.length; b += 1) {
      if (Math.abs(x - bounds[b]) < Math.abs(x - bounds[nearest])) nearest = b;
    }
    if (Math.abs(x - bounds[nearest]) <= SNAP_CHARS) {
      if (side === "start") return nearest < parts.length ? parts[nearest].start : parts[parts.length - 1].end;
      return nearest > 0 ? parts[nearest - 1].end : parts[0].start;
    }
    // ② 아니면 x 를 품은 조각 안에서 글자 비례로 읽는다
    for (let j = 0; j < parts.length; j += 1) {
      if (x <= edges[j] || j === parts.length - 1) {
        const f = Math.min(Math.max((x - bounds[j]) / (edges[j] - bounds[j]), 0), 1);
        return parts[j].start + f * (parts[j].end - parts[j].start);
      }
    }
    return parts[parts.length - 1].end;
  };

  const spans = [];
  let before = 0;
  for (const w of weights) {
    const from = (before / total) * heard;
    const to = ((before + w) / total) * heard;
    spans.push({ start: timeAt(from, "start"), end: timeAt(to, "end") });
    before += w;
  }
  return spans;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// **언제 재야 하나** — 한 클립 안에 대사가 둘 이상일 때만이다.
//
// ★★ 컷별로 구우면 클립 하나에 대사 하나라 시작이 곧 컷 경계다 — 어긋날 자리가 없고
//   whisper 를 부르면 값만 나간다(lib/subtitles.js 의 buildCues 주석이 그 사정을 적는다).
//   한 클립에 여러 대사가 들어갈 때 비로소 모델이 자기 리듬으로 배치하고, 그때 어긋난다.
//
// ★ "통짜인가"라는 **구조 이름으로 묻지 않는다.** 담는 방식이 바뀌어도(클립 하나를
//   컷들에 어떻게 나눠 담든) "한 클립에 대사가 여럿인가"는 그대로 참이다.
export function needsSpeechProbe(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  const speaking = list.filter((c) => typeof c?.sentence === "string" && c.sentence.trim()).length;

  // ★★ 통짜 갈래(r2v) — 굽기 결과를 **첫 컷의 video 에만** 담는다(lib/reel/pipeline.js 의
  //   runReelOneShot). 나머지 컷은 대사를 지닌 채 video 가 없어서 아래의 "한 클립에 대사
  //   여럿" 셈으로는 안 잡힌다. 그런데 어긋남이 가장 큰 갈래가 바로 여기다 — 한 클립 안에서
  //   모델이 전부 말하기 때문이다.
  //   실측(2026-08-25): 재지 않으면 15초 영상에 18초·24초 자막이 생겨 **영상 밖으로 밀려난다.**
  // ★ `whole` 플래그가 "통짜로 구웠다"를 말한다 — 담는 방식을 다시 추측하지 않는다.
  if (list.some((c) => c?.video?.url && c?.video?.whole)) return speaking >= 2;

  const byClip = new Map();
  for (const c of list) {
    const url = c?.video?.url;
    if (!url) continue;
    if (!(typeof c?.sentence === "string" && c.sentence.trim())) continue;
    byClip.set(url, (byClip.get(url) || 0) + 1);
  }
  for (const n of byClip.values()) if (n >= 2) return true;
  return false;
}

// 낱말 길이가 글자 수 대비 이 배수를 넘으면 그 낱말이 쉼을 머금었다고 본다.
// 실측(2026-09-16): 정상 최장 2.3배, 병리적 7.6배.
const WORD_STRETCH_MAX = 3;

// 재 놓고 믿을 수 있는지까지 판정해서 돌려준다.
// ★ 이 판정이 없으면 드물게 나는 큰 어긋남이 한 편을 통째로 망친다 — 정렬 도구의 알려진
//   성질이다(중앙값 수십 ms, 드물게 수 초).
export function speechUnits(sentences, words, { seconds } = {}) {
  const list = Array.isArray(sentences) ? sentences : [];
  const parts = (Array.isArray(words) ? words : []).filter(
    (w) => Number.isFinite(w?.timestamp?.[0]) && Number.isFinite(w?.timestamp?.[1])
  );
  const heardText = parts.map((w) => w?.text || "").join(" ").trim();
  const heard = { chars: charCount(heardText), text: heardText };
  const bad = { units: list.map(() => ({ start: null, seconds: null, ok: false })), heard };
  if (!list.length || !parts.length) return bad;

  const wanted = list.reduce((a, s) => a + charCount(s), 0);
  if (!wanted) return bad;
  const ratio = heard.chars / wanted;
  if (ratio < MIN_HEARD_RATIO || ratio > MAX_HEARD_RATIO) return bad;

  const aligned = alignSpeech(list.map((sentence) => ({ sentence })), parts);
  const limit = Number(seconds) > 0 ? Number(seconds) : Infinity;
  let prevEnd = 0;
  const units = aligned.map((u) => {
    const start = Number(u.spoken_start);
    const dur = Number(u.spoken_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return { start: null, seconds: null, ok: false };
    if (start < prevEnd - 0.01 || start + dur > limit + 0.01) return { start: null, seconds: null, ok: false };
    const first = parts.find((w) => w.timestamp[0] >= start - 0.01);
    if (first && stretched(first)) return { start: null, seconds: null, ok: false };
    prevEnd = start + dur;
    return { start, seconds: dur, ok: true };
  });
  return { units, heard };
}

function stretched(word) {
  const chars = charCount(word?.text);
  if (!chars) return false;
  return (word.timestamp[1] - word.timestamp[0]) > (chars / CHARS_PER_SEC) * WORD_STRETCH_MAX;
}
