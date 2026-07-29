# 자막 두 줄 나누기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 컷의 문장을 자막 여러 조각으로 나눠 낭독 시간에 걸쳐 순차로 띄운다 — 자막이 두 줄을 넘지 않게.

**Architecture:** `lib/subtitles.js` 하나만 바꾼다. 폭 한계는 상수로 박지 않고 자막 스타일 식(글자 크기·여백)에서 뽑아, 화면 비율이 바뀌면 따라 움직인다. 조각은 토큰을 다시 잇지 않고 **원본 문자열에서 slice** 하므로 이어붙이면 원문과 글자 그대로 같다. 시간은 TTS 가 단어별 시각을 주지 않아 글자 수 비례로 나누되 **마지막 조각의 끝을 컷의 끝에 못 박아** 오차가 컷 경계에서 리셋된다.

**Tech Stack:** Next.js 15 App Router, ffmpeg(ASS 자막), vitest

설계 문서: `docs/superpowers/specs/2026-07-29-subtitle-two-line-design.md` (커밋 `15e2d94`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD` 로 브랜치도 확인한다
- 기존 테스트 **520개 그린이 하한선**
- **유료 API 를 한 번도 부르지 않는다.** 이 계획은 전부 순수 함수와 로컬 검증이다
- **`tests/subtitles.test.js` 의 기존 테스트 15개를 고치지 않는다.** 그중 6개가 `buildCues(cuts)` 를 **인자 하나로** 부른다 — 치수를 안 주면 나누지 않는 것이 이 계획의 하위호환 규칙이고, 그 테스트들이 그 규칙의 회귀 방어선이다
- **`toAss` 의 스타일 값(글자 크기 4.2% · 좌우 여백 8% · 세이프존 18%)을 바꾸지 않는다** — 이번에는 두 줄 규칙의 효과만 잰다
- **`cutSeconds` 를 고치지 않는다** — 한 컷이 차지하는 시간은 그대로 낭독 길이다
- **`lib/cuts.js` · `lib/pipeline.js` · `lib/tts.js` 를 고치지 않는다.** 특히 `splitClauses` 재사용은 설계에서 기각됐다(연결어미 닫힌 목록의 오검출을 자막의 잘은 단위가 못 걸러낸다)
- 테스트를 통과시키려고 프로덕션 코드를 맞추지 않는다. 반대도 마찬가지다. 테스트를 지우거나 skip 하지 않는다
- `npm run build` 를 돌리지 않는다 — dev 서버가 3000번에 떠 있고 `.next` 가 겹쳐 죽는다
- 한국어 주석·커밋 메시지는 기존 이력의 어조를 따른다(사장님이 읽는 말)

## 이 저장소의 규율

- 지켜져야 하는 것은 프롬프트가 아니라 **코드가 판정**한다
- **측정 없이 품질을 주장하지 않는다**
- 주석은 "무엇을 하는가"가 아니라 **"왜 이렇게 했는가"**를 적는다
- 숫자를 하드코딩하지 않는다 — 파생할 수 있으면 파생한다

---

## File Structure

**수정**
- `lib/subtitles.js` — 폭 재기(Task 1) · 조각 나누기와 줄바꿈(Task 2) · `buildCues` 다중 큐(Task 3)
- `lib/compose.js:179` — `buildCues` 에 치수를 넘긴다(Task 3)
- `tests/subtitles.test.js` — 새 describe 블록을 **더한다**. 기존 15개는 손대지 않는다

**건드리지 않음**
- `lib/cuts.js` · `lib/pipeline.js` · `lib/tts.js` · `lib/i2v.js` · `lib/imagegen.js` · `lib/validate.js`
- `lib/compose.js` 의 ffmpeg 필터 조립부

### 알아 둘 것 — 지금 `lib/subtitles.js` 의 모양

- `cutSeconds(cut)` — 낭독 길이(없으면 클립 길이). **안 건드린다**
- `buildCues(cuts)` — 컷당 큐 하나. `t += cutSeconds(c)` 로 누적하고 빈 문장은 큐를 안 만든다
- `toAss(cues, { width, height })` — 스타일 값을 **함수 안에서 직접** 계산한다:
  ```js
  const marginV = Math.round(height * 0.18);
  const marginH = Math.round(width * 0.08);
  const fontSize = Math.round(height * 0.042);
  ```
  그리고 큐 텍스트의 진짜 줄바꿈(`\n`)을 `\\N` 으로 바꾼다 — **이 배선이 이미 있으므로
  줄바꿈을 넣을 때 `toAss` 를 고칠 필요가 없다.**

---

## Task 1: 폭을 잰다 — 스타일에서 파생하고, 글자 수가 아니라 폭으로

**Files:**
- Modify: `lib/subtitles.js` (`toAss` 위쪽에 헬퍼 신설 + `toAss` 가 그 헬퍼를 쓰게)
- Test: `tests/subtitles.test.js` (파일 끝에 새 describe)

**Interfaces:**
- Produces:
  - `subtitleStyle({ width, height })` → `{ fontSize, marginH, marginV }` (전부 정수)
  - `lineWidthUnits({ width, height })` → `number` — 한 줄에 들어가는 **폭 단위**
  - `textUnits(text)` → `number` — 그 글의 폭 단위
  - `MAX_SUBTITLE_LINES` = `2`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 2번 줄 import 를 바꾼다:

```js
import { buildCues, toAss, cutSeconds, subtitleStyle, lineWidthUnits, textUnits, MAX_SUBTITLE_LINES } from "../lib/subtitles";
```

파일 끝에 더한다:

```js
describe("폭 재기 — 자막이 몇 자에서 넘치는가", () => {
  const V = { width: 1080, height: 1920 };   // 9:16
  const H = { width: 1920, height: 1080 };   // 16:9

  it("스타일 값이 지금 toAss 가 쓰던 것과 같다", () => {
    // 이 함수는 새 규칙이 아니라 toAss 안에 있던 셈을 꺼낸 것이다 — 값이 달라지면 안 된다
    expect(subtitleStyle(V)).toEqual({ fontSize: 81, marginH: 86, marginV: 346 });
    expect(subtitleStyle(H)).toEqual({ fontSize: 45, marginH: 154, marginV: 194 });
  });

  it("한 줄에 들어가는 한글은 9:16 에서 열한 자 남짓이다", () => {
    // (1080 - 86*2) / 81 = 11.2
    expect(lineWidthUnits(V)).toBeCloseTo(11.2, 1);
  });

  it("가로 영상은 한 줄이 훨씬 길다 — 한계가 비율을 따라간다", () => {
    // (1920 - 154*2) / 45 = 35.8
    expect(lineWidthUnits(H)).toBeCloseTo(35.8, 1);
    expect(lineWidthUnits(H)).toBeGreaterThan(lineWidthUnits(V));
  });

  it("한글은 한 칸, 숫자·영문은 반 칸, 공백은 그보다 좁게 센다", () => {
    expect(textUnits("가나다")).toBeCloseTo(3.0, 2);
    expect(textUnits("abc")).toBeCloseTo(1.5, 2);
    expect(textUnits("가 나")).toBeCloseTo(2.3, 2);
  });

  it("숫자가 섞이면 글자 수보다 좁다 — 글자 수로 재면 쓸데없이 나눈다", () => {
    const s = "바지 밑단은 3,000원";
    expect(s.length).toBe(13);
    expect(textUnits(s)).toBeLessThan(13);
  });

  it("두 줄이 한계다", () => {
    expect(MAX_SUBTITLE_LINES).toBe(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `subtitleStyle is not a function`

- [ ] **Step 3: 헬퍼를 만들고 `toAss` 가 그것을 쓰게 한다**

`lib/subtitles.js` 의 `function assTime(sec) {` **앞**에 넣는다:

```js
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
const WIDE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u303F\u4E00-\u9FFF\uFF01-\uFF60]/;
export function textUnits(text) {
  let u = 0;
  for (const ch of text || "") {
    if (ch === " ") u += 0.3;
    else if (WIDE.test(ch)) u += 1.0;
    else u += 0.5;
  }
  return u;
}
```

그리고 `toAss` 안의 세 줄을 헬퍼 호출로 바꾼다:

```js
export function toAss(cues, { width, height }) {
  const { fontSize, marginH, marginV } = subtitleStyle({ width, height });
```

(그 아래 `const header = ...` 부터는 그대로 둔다. 변수 이름이 같아 나머지는 손댈 것이 없다.)

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS — 새 6개와 **기존 toAss 테스트 5개가 함께** 그린이어야 한다.
기존 것이 깨지면 스타일 값이 달라진 것이다. **고치지 말고 보고하라.**

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (526개 — 520 + 새 6개)

- [ ] **Step 6: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat: 자막 폭을 스타일에서 파생해 잰다 — 글자 수가 아니라 폭으로

toAss 안에 흩어져 있던 글자 크기·여백 셈을 subtitleStyle 하나로 모았다. 폭 한계를 상수로
박지 않기 위해서다 — 비율이 셋이고 값이 전부 화면에서 파생되므로, 한계도 같은 식에서
나와야 비율을 바꿨을 때 따라 움직인다.

폭은 글자 수가 아니라 폭 단위로 센다. \"3,000원\" 처럼 숫자가 섞이면 글자 수와 실제 폭이
어긋나 쓸데없이 나누게 된다. 근사지만 한쪽으로만 틀리게 잡았다 — 좁게 잡히면 세 줄로 넘친다."
```

---

## Task 2: 조각으로 나누고 두 줄로 접는다

**Files:**
- Modify: `lib/subtitles.js` (Task 1 헬퍼 아래)
- Test: `tests/subtitles.test.js` (파일 끝에 새 describe)

**Interfaces:**
- Consumes: `textUnits`, `lineWidthUnits`, `MAX_SUBTITLE_LINES` (Task 1)
- Produces:
  - `splitSubtitleText(text, maxUnits)` → `string[]` — **원본을 이어 붙인 조각들**.
    `pieces.join("") === text` 가 항상 참이다(앞뒤 공백을 조각이 그대로 물고 있다)
  - `breakTwoLines(text, lineUnits)` → `string` — 한 줄을 넘으면 어절 경계에 **진짜 줄바꿈**(`\n`)을
    하나 넣는다. `toAss` 가 그것을 `\\N` 으로 바꾼다(그 배선은 이미 있다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 2번 줄 import 에 둘을 더한다:

```js
import { buildCues, toAss, cutSeconds, subtitleStyle, lineWidthUnits, textUnits, MAX_SUBTITLE_LINES, splitSubtitleText, breakTwoLines } from "../lib/subtitles";
```

파일 끝에 더한다:

```js
describe("splitSubtitleText — 두 줄을 넘으면 나눈다", () => {
  const MAX = 22.4;   // 9:16 두 줄

  it("한계 이하면 통째로 둔다", () => {
    const s = "화요일은 쉽니다.";
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });

  it("한 컷에 문장이 둘이면 문장 경계에서 갈린다", () => {
    const s = "운동화를 세탁소에 맡기는 일이 많아졌습니다. 집에서 관리하기 번거롭고, 세탁 후 변형되기 쉬운 탓입니다.";
    const out = splitSubtitleText(s, MAX);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].trim().endsWith("많아졌습니다.")).toBe(true);
  });

  it("한 문장이 길면 어절 경계에서 갈리고 어느 조각도 한계를 넘지 않는다", () => {
    const s = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다.";
    const out = splitSubtitleText(s, MAX);
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect(textUnits(p.trim())).toBeLessThanOrEqual(MAX);
  });

  it("이어붙이면 원문과 글자 그대로 같다 — 이것이 보장이다", () => {
    const s = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다. 그래서 많은 분들이 맡기러 오십니다.";
    expect(splitSubtitleText(s, MAX).join("")).toBe(s);
  });

  it("어절 경계가 없는 덩어리는 한계를 넘어도 그대로 둔다 — 글자 중간을 자르지 않는다", () => {
    const s = "아주아주아주긴한덩어리로이어져서끊을자리가전혀없는말입니다";
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });

  it("빈 글은 빈 배열", () => {
    expect(splitSubtitleText("", MAX)).toEqual([]);
    expect(splitSubtitleText(null, MAX)).toEqual([]);
  });
});

describe("breakTwoLines — 줄바꿈을 코드가 넣는다", () => {
  const LINE = 11.2;   // 9:16 한 줄

  it("한 줄에 들면 그대로 둔다", () => {
    expect(breakTwoLines("화요일은 쉽니다.", LINE)).toBe("화요일은 쉽니다.");
  });

  it("넘치면 어절 경계에 줄바꿈 하나를 넣는다", () => {
    const out = breakTwoLines("전문적인 장비와 세제를 사용하여", LINE);
    expect(out.split("\n")).toHaveLength(2);
    // 낱말 중간에서 끊기지 않는다
    for (const line of out.split("\n")) expect(line.trim()).toBe(line);
    expect(out.replace("\n", " ")).toBe("전문적인 장비와 세제를 사용하여");
  });

  it("두 줄 길이가 비슷해진다 — 자동 줄바꿈이 만드는 한 줄짜리 꼬리를 피한다", () => {
    const out = breakTwoLines("전문적인 장비와 세제를 사용하여", LINE);
    const [a, b] = out.split("\n").map(textUnits);
    expect(Math.abs(a - b)).toBeLessThan(LINE);
  });

  it("낱말이 하나면 넘쳐도 자르지 않는다", () => {
    const s = "아주아주아주긴한덩어리로이어져서";
    expect(breakTwoLines(s, LINE)).toBe(s);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `splitSubtitleText is not a function`

- [ ] **Step 3: 두 함수를 만든다**

`lib/subtitles.js` 의 `textUnits` **아래**에 넣는다:

```js
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

// 자막 한 덩어리가 두 줄을 넘지 않게 나눈다.
//
// 조각은 토큰을 다시 잇지 않고 **원본에서 slice** 한다 — 이어붙이면 원문과 글자 그대로 같다.
// 컷 분할이 같은 방법으로 원고 보존을 지킨다(lib/cuts.js). 원고 → 컷 → 자막까지 사슬이 이어진다.
//
// 나누는 순서: ① 한계 이하면 통째로 ② 문장 끝 ③ 그래도 넘치면 어절 경계.
export function splitSubtitleText(text, maxUnits) {
  const s = text || "";
  if (!s.trim()) return [];
  if (textUnits(s.trim()) <= maxUnits) return [s];
  const out = [];
  for (const [from, to] of sentenceRanges(s)) {
    for (const [a, b] of packWords(s, from, to, maxUnits)) out.push(s.slice(a, b));
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (536개 — 526 + 새 10개)

- [ ] **Step 6: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat: 자막을 두 줄 안에 들어가는 조각으로 나눈다

문장 끝을 먼저 보고, 그래도 넘치면 어절 경계로 욕심껏 채운다. 낱말이 하나뿐이면 넘쳐도
그대로 둔다 — 글자 중간에서 자르면 말이 깨진다.

조각은 토큰을 다시 잇지 않고 원본에서 slice 한다. 이어붙이면 원문과 글자 그대로 같다 —
컷 분할이 원고 보존을 지키는 방법과 같고, 이로써 원고에서 자막까지 사슬이 이어진다.

줄바꿈은 두 줄 폭이 가장 비슷해지는 자리에 넣는다. 자동 줄바꿈에 맡기면 어색한 자리에서
끊기고 한 줄짜리 꼬리가 남는다."
```

---

## Task 3: 컷 하나가 자막 여러 개를 낸다

**Files:**
- Modify: `lib/subtitles.js` (`buildCues`)
- Modify: `lib/compose.js` (지금 `:179`)
- Test: `tests/subtitles.test.js` (파일 끝에 새 describe)

**Interfaces:**
- Consumes: `splitSubtitleText`, `breakTwoLines`, `lineWidthUnits`, `MAX_SUBTITLE_LINES` (Task 1·2)
- Produces: `buildCues(cuts, opts)` — `opts` 는 `{ width, height }` 이고 **선택이다.**
  주지 않으면 나누지 않는다(컷당 큐 하나). 반환 형태는 지금과 같다: `{ start, end, text }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 파일 끝에 더한다:

```js
describe("buildCues — 컷 하나가 자막 여러 개를 낸다", () => {
  const V = { width: 1080, height: 1920 };
  const LONG = "세탁소에서는 전문적인 장비와 세제를 사용하여 운동화를 새것처럼 만들어줍니다.";

  it("치수를 주지 않으면 나누지 않는다 — 옛 호출을 그대로 받는다", () => {
    expect(buildCues([{ sentence: LONG, seconds: 6 }])).toEqual([
      { start: 0, end: 6, text: LONG },
    ]);
  });

  it("치수를 주면 한 컷이 여러 자막이 된다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    expect(cues.length).toBeGreaterThan(1);
  });

  it("마지막 자막의 끝이 컷의 끝과 정확히 같다 — 오차가 다음 컷으로 안 넘어간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }, { sentence: "화요일은 쉽니다.", seconds: 2 }], V);
    const first = cues.filter((c) => c.end <= 6);
    expect(first[first.length - 1].end).toBe(6);
    expect(cues[cues.length - 1].end).toBe(8);
  });

  it("자막끼리 겹치지 않고 시간이 뒤로만 간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }, { sentence: LONG, seconds: 6 }], V);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
    }
  });

  it("자막을 이어붙이면 컷 문장과 같다 — 줄바꿈과 공백만 다르다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    const joined = cues.map((c) => c.text.replace(/\n/g, " ")).join(" ").replace(/\s+/g, "");
    expect(joined).toBe(LONG.replace(/\s+/g, ""));
  });

  it("긴 조각에는 줄바꿈이 들어간다", () => {
    const cues = buildCues([{ sentence: LONG, seconds: 6 }], V);
    expect(cues.some((c) => c.text.includes("\n"))).toBe(true);
  });

  it("빈 문장은 큐를 안 만들되 시간은 흐른다 — 치수를 줘도 그대로다", () => {
    const cues = buildCues([{ sentence: "", seconds: 2 }, { sentence: "둘째", seconds: 3 }], V);
    expect(cues).toEqual([{ start: 2, end: 5, text: "둘째" }]);
  });

  it("낭독이 없으면 클립 길이를 나눠 쓴다 — 목소리가 실패해도 자막은 나온다", () => {
    const cues = buildCues([{ sentence: LONG, video: { seconds: 6 } }], V);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[cues.length - 1].end).toBe(6);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `치수를 주면 한 컷이 여러 자막이 된다` 에서 큐가 하나다

- [ ] **Step 3: `buildCues` 를 고친다**

`lib/subtitles.js` 의 `buildCues` 전체를 아래로 교체한다:

```js
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
```

> `buildCues` 는 `lineWidthUnits`·`MAX_SUBTITLE_LINES`·`splitSubtitleText`·`breakTwoLines`·
> `cutSeconds` 를 쓴다. 전부 같은 파일 안에 있으므로 import 를 더할 것이 없다.
> **선언 순서에 주의하라** — `buildCues` 가 파일 위쪽에 있고 헬퍼가 아래쪽에 있어도
> 함수 선언(`function`)과 `const` 초기화 시점 차이 때문에 문제가 생기지 않는지 확인하고,
> 걸리면 `buildCues` 를 헬퍼 아래로 옮겨라(옮기는 것 외의 변경은 하지 마라).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS — 새 8개와 **기존 buildCues 테스트 6개가 함께** 그린이어야 한다.
기존 것이 깨지면 하위호환이 깨진 것이다. **고치지 말고 보고하라.**

- [ ] **Step 5: 합성이 치수를 넘기게 한다**

`lib/compose.js` 의 지금 `:179` 한 줄을 바꾼다:

```js
  await writeFileImpl(assPath, toAss(buildCues(usable, { width, height }), { width, height }), "utf8");
```

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (544개 — 536 + 새 8개)

`tests/compose.test.js` 와 `tests/compose-live.test.js` 가 함께 그린이어야 한다.
**깨지면 고치지 말고 보고하라.**

- [ ] **Step 7: 커밋**

```bash
git add lib/subtitles.js lib/compose.js tests/subtitles.test.js
git commit -m "feat: 컷 하나가 자막 여러 개를 낸다 — 두 줄 안에서 순차로 바뀐다

컷·그림·클립은 그대로다. 자막을 나누는 데는 값이 들지 않는다.

시간은 조각의 글자 수 비례로 나눈다 — TTS 가 길이만 주고 단어별 시각은 주지 않는다.
근사지만 마지막 조각의 끝을 컷의 끝에 못 박아 오차가 컷 경계에서 리셋된다. 예전에 자막이
갈수록 앞서던 결함을 컷 안에서 재현하지 않기 위해서다.

치수를 주지 않으면 나누지 않는다 — 폭 한계가 화면에서 파생되므로 치수 없이는 잴 수 없고,
그때는 예전 동작이 맞다."
```

---

## Task 4: 실측 컷으로 눈으로 확인한다 — 0원, dev 서버가 필요 없다

**Files:** 없음 (검증). 발견한 것만 고친다.

**비용:** 없음. 이미 저장된 프로젝트 파일을 읽어 순수 함수만 돌린다.

- [ ] **Step 1: 지금 저장된 컷들의 자막 줄 수를 잰다**

`data/projects/` 에 2026-07-29 컷 분할 개편으로 만들어진 프로젝트들이 있다. 그 컷 문장을
새 함수로 돌려 **전후를 비교**한다.

```bash
cd /c/Users/fixup/shotform-video
node -e "
const fs=require('fs');
import('./lib/subtitles.js').then((S)=>{
  const V={width:1080,height:1920};
  const line=S.lineWidthUnits(V), max=line*S.MAX_SUBTITLE_LINES;
  const linesOf=(s)=>Math.max(1,Math.ceil(S.textUnits(s)/line));
  let before={}, after={}, pieces=0, cuts=0, broke=0;
  for(const f of fs.readdirSync('data/projects')){
    const p=JSON.parse(fs.readFileSync('data/projects/'+f,'utf8'));
    for(const c of p.cuts||[]){
      const t=(c.sentence||'').trim(); if(!t) continue;
      cuts++; const b=linesOf(t); before[b]=(before[b]||0)+1;
      const ps=S.splitSubtitleText(t,max); pieces+=ps.length;
      for(const q of ps){ const a=linesOf(q.trim()); after[a]=(after[a]||0)+1; if(a>2) broke++; }
    }
  }
  console.log('컷', cuts, '개 → 자막', pieces, '개 (컷당', (pieces/cuts).toFixed(1), '개)');
  console.log('전(컷 그대로):', JSON.stringify(before));
  console.log('후(나눈 뒤):  ', JSON.stringify(after));
  console.log('세 줄 이상 남은 것:', broke, '개');
});
"
```

- [ ] **Step 2: 목표와 대조한다**

| | 지금(2026-07-29 실측, 컷 17개) | 목표 |
|---|---|---|
| 두 줄 이상 | **16개 (94%)** | 세 줄 이상 **0개** |
| 3줄 | 9개 | 0 |
| 4~5줄 | 4개 | 0 |
| 컷당 자막 수 | 1개 | 2~3개 |

**세 줄 이상이 남으면** 어절 경계가 없어서인지(어쩔 수 없음) 아니면 나누기가 안 걸린 것인지
문장을 직접 보고 가른다. 후자면 결함이다 — **고치지 말고 보고하라.**

- [ ] **Step 3: 결과를 설계 문서에 남긴다**

`docs/superpowers/specs/2026-07-29-subtitle-two-line-design.md` 의 실측 표 아래에
"나눈 뒤" 줄을 더한다. 컷당 자막 수와 세 줄 잔존 수를 함께 적는다.

```bash
git add docs/superpowers/specs/2026-07-29-subtitle-two-line-design.md
git commit -m "docs: 자막 두 줄 나누기 실측 결과

[컷 N개 → 자막 M개 · 세 줄 이상 K개]"
```

- [ ] **Step 4: 실제 영상으로 보는 것은 별건이다**

이 확인은 글자 폭 셈이지 렌더가 아니다. **진짜로 화면에서 어떻게 보이는지는 합성을 한 번
돌려야 안다.** 그것은 유료(그림·목소리·클립)이므로 **사장님 승인 게이트**다. 이 계획은
여기서 멈춘다.

---

## 다음 — 이 계획이 하지 않는 것

- **단어별 타임스탬프** — ElevenLabs `with_timestamps` 계열로 옮기면 정확해지지만 엔드포인트를
  바꿔야 하고 값도 오른다. 비례 오차의 상한이 한 컷(8초 이하)이라 먼저 이대로 본다
- **글자 크기·여백 조정** — 81px 은 숏폼에서 의도된 크기다. 두 줄 규칙의 효과를 먼저 본다
- **한 줄 규칙** — 사장님이 두 줄로 정했다
- **자막 강조·애니메이션** — 시나리오 스펙의 뒷부분에 잡혀 있다
- **컷 분할 규칙 변경** — 다른 축이다(`2026-07-29-cut-split-inversion-design.md`)
