# 자막 절 경계 분할 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자막 조각을 그리디로 채우지 않고, **조각 수를 먼저 정한 뒤 절 경계에서 고르게** 나눈다. 제품명과 붙어야 하는 말이 갈리지 않는다.

**Architecture:** `lib/cuts.js` 가 절 경계 **위치**를 내보내고(기존 `splitClauses` 는 그것을 써서 자르되 출력이 글자 그대로 같다), `lib/subtitles.js` 의 `packWords` 자리를 "조각 수 먼저 → 목표 폭에 가까운 절 경계 고르기 → 두 줄 초과 검사 → 폴백" 으로 바꾼다. 조각은 계속 원본에서 `slice` 하므로 원문 보존 사슬이 유지된다.

**Tech Stack:** Next.js 15 App Router, vitest, 순수 node 측정 스크립트

설계 문서: `docs/superpowers/specs/2026-07-30-subtitle-clause-split-design.md` (커밋 `58a0034`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD` 로 브랜치도 확인한다
- 기존 테스트 **581개 그린이 하한선**
- **유료 API 를 한 번도 부르지 않는다.** 이 계획은 전부 순수 함수와 로컬 측정이다
- **`tests/subtitles.test.js` 의 기존 테스트를 고치지 않는다.** 그중 여섯 개가 `buildCues(cuts)` 를 **인자 하나로** 부른다 — 치수를 안 주면 나누지 않는 하위호환의 방어선이다
- **`tests/cuts.test.js` 의 기존 테스트를 고치지 않는다.** Task 1 의 리팩터링이 컷 분할 동작을 바꾸지 않았다는 증거가 그것이다
- **`textUnits` · `subtitleStyle` · `lineWidthUnits` · `MAX_SUBTITLE_LINES` · `breakTwoLines` · `sentenceRanges` · `cutSeconds` 를 고치지 않는다** — 이번에는 조각 나누기 기준만 바꾼다
- **타이밍 배분(글자 수 비례 · 마지막 조각의 끝을 컷 끝에 못 박기)을 고치지 않는다**
- **자막 스타일 값(글자 크기 4.2% · 좌우 여백 8% · 세이프존 18%)을 바꾸지 않는다**
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
- `lib/cuts.js` — `clauseBoundaries` 를 내보내고 `splitClauses` 가 그것을 쓴다(Task 1)
- `lib/subtitles.js` — `packWords` 자리를 균형 분할로(Task 2). `splitSubtitleText` 의 호출 한 줄
- `tests/cuts.test.js` — 새 describe 를 **더한다**(Task 1)
- `tests/subtitles.test.js` — 새 describe 를 **더한다**(Task 2)

**신설**
- `scripts/measure/subtitle-split.mjs` — 저장된 프로젝트 전부에 전후를 돌려 센다(Task 3)

**건드리지 않음**
- `lib/compose.js` · `lib/pipeline.js` · `lib/steps.js` · `lib/clip-limits.js` · `lib/costs.js`
- `app/**` (화면은 자막을 만들지 않는다)

### 알아 둘 것 — 지금 코드의 모양

`lib/cuts.js` 의 `splitClauses(sentence)` (61행 부근):
- 토큰을 `/\S+/g` 로 훑으며, **어절이 절 어미로 끝나고**(`isClauseEnd`: 쉼표 또는
  `고·며·면·어서·아서·지만·는데`) **모인 조각이 6자 이상**(`MIN_UNIT_CHARS`, 공백 제외)이고
  **다음 낱말과의 공백이 정확히 한 칸**일 때만 자른다
- 조각은 `sentence.slice(start, tokenEnd)` — **원본에서 잘라낸다**
- 마지막 꼬리가 6자 미만이면 앞 조각에 ` ` 하나로 붙인다
- 자를 자리가 없으면 `[sentence]` 하나

`lib/subtitles.js` 의 `splitSubtitleText(text, maxUnits)` (154행 부근):
```js
  if (textUnits(s.trim()) <= maxUnits) return [s];
  const out = [];
  for (const [from, to] of sentenceRanges(s)) {
    for (const [a, b] of packWords(s, from, to, maxUnits)) out.push(s.slice(a, b));
  }
  return out;
```
`packWords(text, from, to, maxUnits)` 가 `[[a,b], …]` 범위를 돌려준다. **이 시그니처를 유지한
채 내용만 바꾸는 것이 이 계획의 요점이다** — 부르는 쪽과 `sentenceRanges` 는 그대로다.

폭 셈: `textUnits` — 공백 0.3 · 전각(한글·이모지) 1.0 · 그 외 0.5.
한 줄 폭 `lineWidthUnits({width:1080,height:1920})` = **11.21**, 두 줄 = **22.42**.

---

## Task 1: 절 경계 위치를 내보낸다 (순수 리팩터링)

**Files:**
- Modify: `lib/cuts.js` (`splitClauses` 와 그 위 헬퍼들, 61행 부근)
- Test: `tests/cuts.test.js` (새 describe 를 **더한다**)

**Interfaces:**
- Consumes: 없음 (`isClauseEnd` · `noSpace` · `MIN_UNIT_CHARS` 는 이미 이 파일에 있다)
- Produces: `export function clauseBoundaries(sentence) => number[]`
  — 오름차순 문자 인덱스. 각 값은 **뒤 조각이 시작하는 위치**다(그 앞이 앞 조각의 끝).
  자를 자리가 없으면 `[]`.
  `splitClauses(sentence)` 의 출력은 **바뀌지 않는다**.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 에 새 describe 를 더한다. 파일 위쪽 import 에 `clauseBoundaries` 를
넣는다(그 파일이 `lib/cuts.js` 에서 가져오는 형식을 그대로 따른다):

```js
describe("clauseBoundaries — 절 경계 위치", () => {
  // 위치만 돌려준다. 자막은 이 후보 중에서 폭을 보고 고른다 — 조각을 받으면 다시
  // 이어 붙였다 자르는 일이 생기고, 그때 원문 보존이 깨질 자리가 난다.
  it("연결어미와 쉼표 뒤를 후보로 돌려준다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const at = clauseBoundaries(s);
    expect(at.length).toBeGreaterThanOrEqual(2);
    // 각 위치는 뒤 조각의 시작이다 — 그 자리에서 자르면 앞이 어미로 끝난다
    expect(s.slice(0, at[0]).trim().endsWith("달아오르고")).toBe(true);
    expect(s.slice(at[0], at[1]).trim().endsWith("날,")).toBe(true);
  });

  it("오름차순이고 문장 안에 있다", () => {
    const s = "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    const at = clauseBoundaries(s);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    for (const x of at) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(s.length);
    }
  });

  it("자를 자리가 없으면 빈 배열이다", () => {
    expect(clauseBoundaries("환절기 아침입니다.")).toEqual([]);
    expect(clauseBoundaries("")).toEqual([]);
  });

  // 6자 하한이 오검출을 걸러 준다 — "라면"·"장면"처럼 어미가 아닌 것도 어절 끝에서는 걸린다
  it("앞 조각이 6자(공백 제외) 미만이면 후보가 아니다", () => {
    expect(clauseBoundaries("라면 먹고 갈래요?")).toEqual([]);
  });
});

describe("splitClauses 는 clauseBoundaries 위에서 그대로 돈다", () => {
  // 리팩터링이 컷 분할 동작을 바꾸지 않았다는 증거. splitUnits 가 splitClauses 를 쓴다.
  it("경계 위치로 자른 것과 splitUnits 의 조각이 같다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 되고 다음 날 아침 당김이 덜하다는 후기가 많고 재구매도 잦습니다.";
    const at = clauseBoundaries(s);
    const cuts = [0, ...at, s.length];
    const byPos = [];
    for (let i = 0; i < cuts.length - 1; i++) byPos.push(s.slice(cuts[i], cuts[i + 1]));
    // splitUnits 는 8초 초과 문장에서만 절을 나눈다 — 위 문장은 충분히 길다
    const units = splitUnits(s);
    expect(units.join("")).toBe(s);            // 원문 보존
    expect(byPos.join("")).toBe(s);            // 위치로 자른 것도 원문 보존
    expect(units.length).toBe(byPos.length);   // 같은 개수로 나뉜다
  });
});
```

> ⚠️ 마지막 테스트의 문장이 8초(공백 빼고 44자)를 확실히 넘는지 확인하라. `splitUnits` 는
> 8초 이하 문장을 나누지 않는다. 넘지 않으면 문장을 더 길게 만든다 — **테스트를 통과시키려고
> `splitUnits` 나 `CONTENT_MAX_SECONDS` 를 고치지 않는다.**
>
> 또한 `splitClauses` 의 **꼬리 붙임 규칙**(마지막 꼬리가 6자 미만이면 앞에 붙인다) 때문에
> 조각 수가 경계 수보다 하나 적어질 수 있다. 그 경우 위 `expect(units.length).toBe(byPos.length)`
> 가 실패하는데 **그것은 정상 동작이다** — 그때는 그 문장을 꼬리가 6자 이상인 것으로 바꿔라.
> 규칙을 고치지 마라.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /c/Users/fixup/shotform-video
npx vitest run tests/cuts.test.js
```

기대: `clauseBoundaries` 가 없어 실패(`does not provide an export named`).

- [ ] **Step 3: `lib/cuts.js` 를 고친다**

`splitClauses` **위에** 새 함수를 넣는다. 판정 규칙은 지금 `splitClauses` 안에 있는 것을
그대로 옮긴다(새로 만들지 않는다):

```js
// 절 경계 **위치**만 돌려준다. 각 값은 뒤 조각이 시작하는 문자 인덱스다.
//
// 왜 위치인가: 자막(lib/subtitles.js)이 이 후보 중에서 **폭을 보고** 고른다. 조각을 받으면
// 다시 이어 붙였다 자르는 일이 생기고, 그때 "이어붙이면 원문과 같다"가 깨질 자리가 난다.
//
// 판정은 splitClauses 가 쓰던 것 그대로다 — 목록도 하한도 여기 한 곳에만 있다.
export function clauseBoundaries(sentence) {
  const s = sentence || "";
  const tokens = [...s.matchAll(/\S+/g)];
  if (tokens.length === 0) return [];
  const out = [];
  let start = tokens[0].index;
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i];
    const tokenEnd = tok.index + tok[0].length;
    const next = tokens[i + 1];
    const sep = s.slice(tokenEnd, next.index);
    const buf = s.slice(start, tokenEnd);
    // 조각이 너무 짧으면 자르지 않고 계속 모은다. 공백이 한 칸이 아니면 자르지 않는다 —
    // 이었을 때 원래 모양을 복원할 수 없는 자리이기 때문이다.
    if (isClauseEnd(tok[0]) && noSpace(buf) >= MIN_UNIT_CHARS && sep === " ") {
      out.push(next.index);
      start = next.index;
    }
  }
  return out;
}
```

그리고 `splitClauses` 를 이 함수 위에서 돌게 바꾼다. **출력이 글자 그대로 같아야 한다** —
꼬리 붙임 규칙과 "자를 자리가 없으면 `[sentence]`" 를 그대로 유지한다:

```js
function splitClauses(sentence) {
  const at = clauseBoundaries(sentence);
  const tokens = [...(sentence || "").matchAll(/\S+/g)];
  if (tokens.length === 0) return [sentence];

  const parts = [];
  let start = tokens[0].index;
  for (const pos of at) {
    parts.push(sentence.slice(start, pos));
    start = pos;
  }
  // 마지막 조각 — 마지막 토큰 끝이 아니라 문장 끝까지 slice 한다(뒤에 남은 문장부호 등을 지키기 위해)
  const tail = sentence.slice(start);
  if (tail) {
    if (parts.length && noSpace(tail) < MIN_UNIT_CHARS) parts[parts.length - 1] += ` ${tail}`;
    else parts.push(tail);
  }
  return parts.length ? parts : [sentence];
}
```

> ⚠️ 지금 `splitClauses` 는 경계에서 `parts.push(buf)` 할 때 `buf = sentence.slice(start, tokenEnd)`
> 를 쓴다 — **토큰 끝까지**다. 위 새 코드는 `sentence.slice(start, pos)` — **다음 토큰 시작까지**다.
> 그 차이는 **경계 사이의 공백 한 칸**이고, 붙일 때 `parts.join("")` 이 원문과 같으려면
> 오히려 새 방식이 맞다. **하지만 기존 테스트가 앞의 모양(공백 없는 조각)을 단정하고 있을 수
> 있다.** `npx vitest run tests/cuts.test.js` 로 확인하고, **깨지면 고치지 말고 보고하라** —
> 어느 쪽이 맞는지는 사람이 정한다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/cuts.test.js
```

- [ ] **Step 5: 회귀를 확인한다**

```bash
npx vitest run
```

기대: 581 + 새것이 전부 그린. **`tests/cuts.test.js` · `tests/pipeline.test.js` 의 기존
테스트가 하나도 깨지지 않아야 한다** — 그것이 "컷 분할 동작이 그대로다"의 증거다.

- [ ] **Step 6: 커밋**

```bash
git rev-parse --abbrev-ref HEAD
git add lib/cuts.js tests/cuts.test.js
git commit -m "refactor: 절 경계 위치를 내보낸다 — 판정은 한 곳에

자막이 이 후보 중에서 폭을 보고 고른다. 조각을 받으면 다시 이어 붙였다 자르는 일이 생기고,
그때 '이어붙이면 원문과 같다'가 깨질 자리가 난다.

splitClauses 는 이 함수 위에서 그대로 돈다 — 닫힌 목록·6자 하한·공백 한 칸 제약·꼬리 붙임
규칙 전부 그대로다. 컷 분할 테스트가 그 불변을 지킨다."
```

---

## Task 2: 조각 수를 먼저 정하고 고르게 나눈다

**Files:**
- Modify: `lib/subtitles.js` (`packWords` 를 대신하는 함수, 124행 부근)
- Test: `tests/subtitles.test.js` (새 describe 를 **더한다**)

**Interfaces:**
- Consumes: Task 1 의 `clauseBoundaries` (`lib/cuts.js`) · 이 파일의 `textUnits`
- Produces: 내부 함수 하나. `splitSubtitleText(text, maxUnits)` 의 시그니처·반환 모양은 그대로

**import 방향은 확인해 두었다(2026-07-30).** `lib/subtitles.js` 는 지금 **아무것도 import 하지
않는다.** `lib/cuts.js` → `./script.js` → `./synopsis.js`(무-import) 와 `./clip-limits.js`(무-import)
뿐이라 **순환이 생기지 않는다.** 그래도 넣은 뒤 테스트가 순환을 알리면 멈추고 보고하라.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 에 새 describe 를 더한다. `splitSubtitleText` 는 이미 export 돼 있다:

```js
describe("자막을 절 경계에서 고르게 나눈다", () => {
  // 한 줄 11.21 · 두 줄 22.42 (1080×1920). 숫자를 박지 않고 같은 식에서 뽑는다.
  const MAX = lineWidthUnits({ width: 1080, height: 1920 }) * MAX_SUBTITLE_LINES;

  // 2026-07-30 완성본에서 눈으로 본 결함이다. ASS 에 "속당김이 심한 날, VT" 로 끝나고
  // 다음 자막이 "PDRN 시카 엑소좀" 으로 시작했다 — 제품명이 갈렸다.
  it("제품명을 가르지 않는다", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);                       // 원문 보존
    expect(pieces.some((p) => p.includes("VT PDRN"))).toBe(true);
    // "VT" 로 끝나는 조각이 있으면 제품명이 갈린 것이다
    expect(pieces.some((p) => p.trim().endsWith("VT"))).toBe(false);
  });

  it("관형어와 명사를 가르지 않는다 — 다음 날", () => {
    const s = "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);
    expect(pieces.some((p) => p.includes("다음 날"))).toBe(true);
    expect(pieces.some((p) => p.trim().endsWith("다음"))).toBe(false);
  });

  it("모든 조각이 두 줄 폭 안에 들어간다 — 세 줄이 되살아나지 않는다", () => {
    const samples = [
      "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.",
      "자기 전, 토너 후 2~3방울 얼굴에 펴 바르면 다음 날 아침 당김이 덜하다는 후기가 많습니다.",
      "특히 20대 후반에서 30대 초반 여성들이 많이 찾고 재구매도 잦습니다.",
      "30ml에 39,000원으로, 환절기 피부 고민을 덜어줍니다.",
    ];
    for (const s of samples) {
      for (const p of splitSubtitleText(s, MAX)) {
        expect(textUnits(p.trim()), `조각이 두 줄을 넘는다: ${p}`).toBeLessThanOrEqual(MAX);
      }
    }
  });

  it("조각 수는 최소다 — 자막이 산만해지지 않게", () => {
    const s = "볼이 빨갛게 달아오르고 속당김이 심한 날, VT PDRN 시카 엑소좀 앰플이 도움이 됩니다.";
    const need = Math.ceil(textUnits(s.trim()) / MAX);
    expect(splitSubtitleText(s, MAX).length).toBe(need);
  });

  // 절 경계가 없는 문장은 어절 경계로 떨어진다 — 그때도 원문과 두 줄 규칙은 지킨다.
  it("절 경계가 없으면 어절 경계로 나눈다", () => {
    const s = "환절기 아침 거울 속 얼굴이 조금씩 달라지는 것을 느끼는 사람들이 부쩍 늘었습니다";
    const pieces = splitSubtitleText(s, MAX);
    expect(pieces.join("")).toBe(s);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(textUnits(p.trim())).toBeLessThanOrEqual(MAX);
  });

  it("낱말 하나가 두 줄을 넘으면 그대로 둔다 — 글자 중간에서 자르지 않는다", () => {
    const s = "가".repeat(40);
    expect(splitSubtitleText(s, MAX)).toEqual([s]);
  });
});
```

**import 는 손댈 필요가 없다(2026-07-30 확인).** `tests/subtitles.test.js:2` 가 이미
`lineWidthUnits` · `textUnits` · `MAX_SUBTITLE_LINES` · `splitSubtitleText` · `breakTwoLines` 를
전부 가져온다. **export 를 새로 늘리지 않는다.**

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run tests/subtitles.test.js
```

기대: 제품명·다음 날·조각 수 테스트가 FAIL(지금 그리디가 그 자리를 가른다).

- [ ] **Step 3: 균형 분할 함수를 만든다** (`lib/subtitles.js`)

`lib/cuts.js` 에서 `clauseBoundaries` 를 import 한다(확장자를 붙인다 — 순수 node 측정
스크립트가 이 사슬을 읽는다):

```js
import { clauseBoundaries } from "./cuts.js";
```

`packWords` 를 **지우지 않는다** — 폴백으로 남긴다. 그 아래에 새 함수를 넣는다:

```js
// 한 구간을 조각으로 나눈다 — **조각 수를 먼저 정하고 자리를 고른다.**
//
// 그리디(packWords)를 그만두는 이유: 두 줄이 꽉 차는 자리가 제품명 중간인지 관형어와 명사
// 사이인지 알지 못한다. 2026-07-30 완성본에서 "VT" / "PDRN 시카 엑소좀" 으로 갈리고
// "다음" / "날" 로 갈렸다.
//
// 조각 수는 ceil(폭/두줄폭) — **최소값이다.** 자막 개수가 늘면 화면이 산만해진다.
// 자리는 절 경계를 먼저 보고, 목표 폭(전체/n)에 가장 가까운 것을 순차로 고른다.
// 조합을 전수 탐색하지 않는다 — 어절 후보가 많은 긴 문장에서 폭발한다.
function splitBalanced(text, from, to, maxUnits) {
  const seg = text.slice(from, to);
  const total = textUnits(seg.trim());
  if (total <= maxUnits) return [[from, to]];

  const n = Math.ceil(total / maxUnits);
  const clauses = clauseBoundaries(seg).map((x) => from + x);
  const words = [...seg.matchAll(/\S+/g)].slice(1).map((t) => from + t.index);
  // 절 경계가 모자라면 어절 경계로 메운다. 절 경계를 앞에 두어 같은 거리면 절이 이긴다.
  const pool = clauses.length >= n - 1 ? clauses : [...new Set([...clauses, ...words])].sort((a, b) => a - b);
  if (!pool.length) return packWords(text, from, to, maxUnits);

  const target = total / n;
  const picked = [];
  let start = from;
  for (let k = 1; k < n; k++) {
    // 남은 조각 수에 맞춰 이번 조각의 목표 끝을 정한다
    let best = null;
    let bestDiff = Infinity;
    for (const pos of pool) {
      if (pos <= start) continue;
      if (picked.length && pos <= picked[picked.length - 1]) continue;
      const w = textUnits(text.slice(start, pos).trim());
      if (w > maxUnits) break;                       // 더 가도 넘칠 뿐이다
      const diff = Math.abs(w - target);
      if (diff < bestDiff) { bestDiff = diff; best = pos; }
    }
    if (best === null) return packWords(text, from, to, maxUnits);
    picked.push(best);
    start = best;
  }
  // 마지막 조각도 두 줄 안에 들어와야 한다 — 안 되면 그리디로 떨어진다
  if (textUnits(text.slice(start, to).trim()) > maxUnits) {
    return packWords(text, from, to, maxUnits);
  }
  const out = [];
  let a = from;
  for (const pos of picked) { out.push([a, pos]); a = pos; }
  out.push([a, to]);
  return out;
}
```

`splitSubtitleText` 의 호출 한 줄을 바꾼다:

```js
    for (const [a, b] of splitBalanced(s, from, to, maxUnits)) out.push(s.slice(a, b));
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run tests/subtitles.test.js
```

기대: 새 6개와 **기존 것 전부** PASS. 기존 15개 중 여섯이 `buildCues(cuts)` 를 인자 하나로
부르는데, 그때 `maxUnits` 가 `Infinity` 라 이 함수는 첫 줄에서 통째로 돌려준다.

- [ ] **Step 5: 회귀를 확인한다**

```bash
npx vitest run
```

- [ ] **Step 6: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat: 자막을 절 경계에서 고르게 나눈다

그리디가 두 줄을 꽉 채우다 제품명 중간에서 끊었다 — 완성본에서 'VT' / 'PDRN 시카 엑소좀' 으로
갈리고 '다음' / '날' 로 갈렸다.

조각 수를 먼저 정하고(ceil, 최소) 목표 폭에 가까운 절 경계를 순차로 고른다. 조합을 전수
탐색하지 않는다 — 어절 후보가 많은 문장에서 폭발한다. 어떤 자리로도 두 줄에 안 들어가면
그리디로 떨어진다(packWords 를 폴백으로 남겼다)."
```

---

## Task 3: 저장된 프로젝트 전부로 재기 (0원)

**Files:**
- Create: `scripts/measure/subtitle-split.mjs`

**Interfaces:**
- Consumes: `splitSubtitleText` · `lineWidthUnits` · `MAX_SUBTITLE_LINES` · `breakTwoLines`
  (`lib/subtitles.js`) · `clauseBoundaries` (`lib/cuts.js`)
- Produces: CLI — `node scripts/measure/subtitle-split.mjs`

- [ ] **Step 1: 스크립트를 만든다**

`compare-image-models.mjs` 와 같은 골격이다(순수 node, 확장자 붙인 import, `data/` 는 읽기만).
**fal 이나 OpenAI 를 부르지 않는다 — 0원이다.**

세는 것:
- **조각 경계가 절 경계인 비율** — 각 조각의 시작 위치가 그 문장의 `clauseBoundaries` 에 있는가.
  이것이 사장님이 짚은 문제의 직접 지표다
- **줄 수 분포** — `breakTwoLines` 로 나눈 뒤 `\n` 수 + 1. **세 줄 이상이 0 이어야 한다**
- **조각 수 합계** — 늘지 않아야 한다
- **폭 표준편차** — 고르게 나뉘는지
- **원문 보존** — `pieces.join("") === sentence` 가 전 컷 참이어야 한다

지금 방식과 대조하려면 **같은 문장에 두 방식을 다 돌려야 한다.** `packWords` 는 export 되지
않았으므로, 스크립트 안에 **지금 그리디 규칙을 재현한 함수를 두고** "전"으로 삼는다.
그 재현이 실제 코드와 어긋나면 대조가 거짓이 되므로, 재현 함수 위에 **어디서 베낀
것인지(`lib/subtitles.js` 의 `packWords`)와 언제 베꼈는지**를 주석으로 적는다.

출력은 표 두 개(전/후)와 컷별 목록이다. 갈린 자리(`VT` 로 끝나는 조각처럼)를 눈으로 볼 수
있게 **경계가 절이 아닌 조각은 앞에 `✗` 를 붙인다.**

- [ ] **Step 2: 돌린다 — 0원이다**

```bash
cd /c/Users/fixup/shotform-video
node scripts/measure/subtitle-split.mjs
```

- [ ] **Step 3: 목표와 대조한다**

| 지표 | 목표 |
|---|---|
| 세 줄 이상 | **0개**(07-29 성과 유지) |
| 원문 보존 | **100%** |
| 조각 수 | 지금과 같거나 적다 |
| 절 경계 비율 | **올라간다**(이 작업의 목적) |

목표를 못 맞추면 **수치를 그대로 적고 보고한다.** 스크립트를 고쳐 목표에 맞추지 않는다.

- [ ] **Step 4: 결과를 남긴다**

`docs/superpowers/specs/2026-07-30-subtitle-clause-split-design.md` 에
`### 구현 뒤 실측` 절을 더한다 — 07-29 설계 문서에 같은 모양의 절이 있으니 그 형식을 따른다.
표본 수(저장된 컷 수)와 전후 표를 넣고, **글자 폭 셈이지 렌더가 아니라는 단서**를 적는다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/measure/subtitle-split.mjs docs/superpowers/specs/2026-07-30-subtitle-clause-split-design.md
git commit -m "docs: 자막 절 경계 분할 실측 — [수치]

저장된 프로젝트 전부(컷 N개)에 전후를 돌렸다. [절 경계 비율 · 줄 수 분포 · 조각 수]

글자 폭 셈이지 렌더가 아니다 — 실제 화면은 합성을 돌려야 알고 그것은 유료다."
```

---

## 검증 요약

| | 무엇으로 | 언제 |
|---|---|---|
| 절 경계 위치 정확도 | `tests/cuts.test.js` | Task 1 |
| 컷 분할 동작 불변 | 기존 `cuts`·`pipeline` 테스트가 그대로 그린 | Task 1 |
| 제품명·`다음 날` 보존 | `tests/subtitles.test.js` | Task 2 |
| 두 줄 초과 없음 · 조각 수 최소 · 폴백 | `tests/subtitles.test.js` | Task 2 |
| 하위호환(`buildCues(cuts)` 인자 하나) | 기존 여섯 테스트가 그대로 그린 | Task 2 |
| 전후 대조 | `scripts/measure/subtitle-split.mjs` | Task 3 |

**Task 1~3 전부 $0 이다.** 실제 렌더 확인은 다음 합성(유료)에서 따라온다.
