# 말의 밀도와 여백 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 고른 초가 영상 길이의 **주문값**이 되게 하고, 원고는 그 시간을 다 채우지 않게 한다(밀도 45%).

**Architecture:** `cut.seconds` 하나가 지금 **주문 초·합성 기준·자막 span** 셋을 동시에 쥐고 있다. 그 값의 의미를 "낭독 시간"에서 "**이 컷이 화면에 있는 시간**"으로 옮기고, 말하는 시간을 `cut.spoken_seconds` 로 분리한다. 클립 주문 초가 `cut.seconds` 를 따라가므로(`lib/i2v.js`) 컷 초만 올리면 두 모델 모두 그 길이만큼 움직임을 만든다.

**Tech Stack:** 순수 JavaScript(ESM) · Next.js 15 App Router · vitest. 린터·타입체커 없음 — **판정하는 것은 `npx vitest run` 뿐이다.**

**Spec:** `docs/superpowers/specs/2026-08-14-density-and-silence-design.md`

## Global Constraints

- **작업 위치**: 이 워크트리(`.claude/worktrees/voice-consistency-gate`). `main` 에 직접 쓰지 않는다. 푸시·PR 은 사용자가 요청할 때만.
- **`git add -A` 금지.** 각 커밋에서 파일을 이름으로 지정한다. `next.config.mjs` 는 커밋돼 있지만 로컬 수정이 있을 수 있다.
- **전부 그린이 유일한 관문**: `npx vitest run`. 태스크마다 전체를 돌린다(파일 하나만 돌리면 옆에서 깨진 것을 놓친다).
- **화면 파일(`app/**`)을 손댔으면 한 번 굽는다**: `SHOTFORM_DIST_DIR=.next-verify npx next build`
- **밀도 계수는 `lib/script.js` 의 `SPEECH_DENSITY` 한 자리에만 둔다.** 다른 파일에 0.45 를 적지 않는다.
- **무음 컷이 없는 프로젝트의 동작은 지금과 글자 그대로 같아야 한다** — 회귀 0.
- **구조적 보장 유지**: 문장을 가진 컷의 `sentence` 를 이어붙이면 원고와 글자 그대로 같다.
- **광고 경로(`lib/ad/*`)를 건드리지 않는다.** `lib/pricing.js` 정가표를 건드리지 않는다.
- **유료 생성(fal)은 사용자 승인 없이 실행하지 않는다.** 측정은 `SHOTFORM_FAKE=fal` 로 돈다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `lib/script.js` | 원고 목표 자수(밀도 계수 포함)·미달/초과 판정 | 1 |
| `lib/validate.js` | 컷 객체 생성 — `sentence` · `spoken_seconds` · `silent` | 2, 8 |
| `lib/cuts.js` | `allocateCutSeconds` (컷 초 배분) · 분할 지문 · 화면 설계 지문 | 3, 8 |
| `lib/pipeline.js` | 분할 뒤 배분 적용 · 낭독 실측 반영 · TTS 루프 | 3, 4, 8 |
| `lib/subtitles.js` | 자막 span(말하는 시간) 과 누적(화면 시간) 분리 | 5 |
| `lib/clip-limits.js` | `projectSpeaks` — 무음 컷을 판정에서 제외 | 7 |
| `lib/steps.js` | 단계 표가 프로젝트를 받아 목록을 낸다 | 9 |
| `app/create/[id]/voice/page.js` | Seedance 통과 화면 제거 | 9 |

`lib/compose.js` 는 **고치지 않는다** — `wantSeconds: c.seconds` 를 이미 읽으므로 2·3번이 끝나면 저절로 맞는다. 태스크 6 의 측정으로 확인한다.

---

### Task 0: 유지하기로 한 미커밋 작업을 먼저 커밋한다

**Files:**
- Commit only: `app/create/[id]/script/page.js` · `scripts/measure/run-pipeline.mjs`

**배경.** 2026-08-14 오전 작업이 미커밋으로 남아 있다. 설계 문서가 그 처분을 표로 정해 두었는데, **유지하기로 한 둘**이 아직 커밋되지 않았다. 먼저 커밋해 깨끗한 바닥을 만든다 — 그래야 Task 1 의 되돌리기가 무엇을 되돌리는지 diff 에서 분명해진다.

- [ ] **Step 1: 무엇이 미커밋인지 확인한다**

Run: `git status --short`
Expected: `lib/script.js` · `tests/script.test.js` · `app/create/[id]/script/page.js` · `scripts/measure/run-pipeline.mjs` 넷이 M 으로 보인다. 앞의 둘은 Task 1 이 다루므로 **지금 커밋하지 않는다.**

- [ ] **Step 2: 화면 변경을 커밋한다**

```bash
git add "app/create/[id]/script/page.js"
git commit -m "feat(script-ui): 대본 화면의 설명을 걷어내고 화면 설명을 기본으로 편다"
```

- [ ] **Step 3: 측정 자료를 커밋한다**

```bash
git add scripts/measure/run-pipeline.mjs
git commit -m "test(measure): 15초 요청에 11초를 만든 자료를 shallow 로 등록한다"
```

- [ ] **Step 4: 확인한다**

Run: `git status --short && npx vitest run`
Expected: `lib/script.js` · `tests/script.test.js` 둘만 M 으로 남고, 테스트는 전부 그린.

---

### Task 1: 밀도 계수 — 원고 목표를 낮춘다

**Files:**
- Modify: `lib/script.js` (`targetChars` · `underTarget` · `REWRITE_SYSTEM`)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces: `SPEECH_DENSITY` (number, 0.45) · `targetChars(project) → number` (밀도 반영된 자수)

**배경 — 먼저 읽어라.** 2026-08-14 오전에 이 파일에 미커밋 변경이 있다. `underTarget` 에서 재료 검사를 걷어냈고 `REWRITE_SYSTEM` 에서 "그럴 바에는 짧은 채로 둔다"를 지웠다. **그 둘은 이 태스크에서 되돌린다** — 목표가 83자에서 37자로 내려가면 얕은 자료도 대개 목표에 닿으므로, 지어내기 위험(이 저장소가 실측한 실패)을 다시 질 이유가 없다. `[더 깊이 갈 자리]` 블록은 **유지한다**.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/script.test.js` 의 `describe("scriptFaults …")` 안, 2026-08-14 오전에 추가된 `it("자료의 사실을 다 썼어도 목표에 크게 못 미치면 잡는다 …")` 를 **통째로 아래로 바꾼다**(옛 규칙으로 되돌아가는 것이다):

```js
  // ⚠️ 2026-08-14 오전에 한 번 뒤집었다가 같은 날 되돌린 자리다.
  // 뒤집은 이유(15초 요청에 11초)는 진짜였지만, 원인은 판정이 아니라 **목표 자체**였다 —
  // 목표가 83자라 얕은 자료가 닿을 수 없었다. 밀도 계수로 목표를 37자로 내리면
  // 그 자료도 목표에 닿으므로, 지어내기 위험을 감수하며 판정을 열 이유가 없다.
  // (지어내기는 실측된 실패다: 두 줄짜리 자료에서 하한을 요구했더니 "직접 삶아 세탁"이 나왔다.)
  it("자료의 사실을 이미 다 썼으면 짧아도 잡지 않는다 — 지어내게 만들면 안 된다", () => {
    const usedAll = "매일 아침 직접 갈아 만듭니다. 하루 40잔이면 끝납니다.";
    expect(unusedFacts(project, usedAll)).toEqual([]);
    expect(underTarget(project, usedAll)).toBe(false);
    expect(scriptFaults(project, { text: usedAll })).toEqual([]);
  });
```

그리고 `describe("scriptFaults …")` 끝에 밀도 테스트를 **새로 추가한다**:

```js
  // 광고 실측(2026-08-14, 3편): 15초에 대사가 31~39자뿐이었다(밀도 37~47%).
  // 분할생성은 컷 초 = 낭독 초라 정의상 100% 였다 — 쉬는 자리가 구조적으로 없었다.
  it("고른 초에 밀도 계수를 곱해 목표를 낸다", () => {
    const p15 = { ...project, settings: { target_seconds: 15 } };
    const p30 = { ...project, settings: { target_seconds: 30 } };
    // 15 × 5.5 × 0.45 = 37.125 → 37
    expect(targetChars(p15)).toBe(37);
    expect(targetChars(p30)).toBe(74);
    expect(SPEECH_DENSITY).toBe(0.45);
  });

  // 자동 길이(자료가 정하는 쪽)에도 같은 밀도가 걸려야 한다 — 한쪽만 걸면 모드마다 다른 영상이 나온다
  it("길이를 안 고른 프로젝트에도 밀도가 걸린다", () => {
    const auto = { ...project, settings: {} };
    const withDensity = targetChars(auto);
    expect(withDensity).toBeGreaterThan(0);
    // 자료 기준 자수(사실 2개 → 하한 60자)에 0.45 를 곱한 값
    expect(withDensity).toBe(Math.round(60 * SPEECH_DENSITY));
  });
```

`tests/script.test.js` 상단 import 에 `SPEECH_DENSITY` 를 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — `SPEECH_DENSITY` 가 export 되지 않아 `undefined`, `targetChars(p15)` 는 83 을 돌려준다.

- [ ] **Step 3: 구현한다**

`lib/script.js` 의 `targetChars` 위에 계수를 추가하고 두 갈래 모두에 곱한다:

```js
// ★ 말의 밀도 — **영상 길이를 말로 다 채우지 않는다.**
//
// 근거는 광고 3편 전수 확인이다(2026-08-14): 15초 주문에 대사가 31~39자(밀도 37~47%)뿐이고
// 나머지는 화면과 소리가 채웠다. 4초 장면에 "하루의 끝, 지친 피부에게."(12자 = 2.2초)를
// 싣고 1.8초는 펌프 클릭음과 피아노다.
//
// 분할생성은 컷 초 = 그 문장의 낭독 시간이라 **정의상 밀도 100%** 였다 — 쉬는 자리가
// 구조적으로 없었고, 그것이 "그냥 정보를 읽는 느낌"의 뿌리다.
//
// ⚠️ 표본이 광고 3편뿐이라 임계값 근거로는 얇다(이 저장소 규율: 임계는 실측 분포에서 뽑는다).
//    실측 범위 37~47% 의 가운데인 45% 로 시작하고, **분할생성 실측이 쌓이면 다시 뽑는다.**
//    값을 바꾸는 곳이 여기 하나뿐이라 다시 뽑는 비용은 작다.
export const SPEECH_DENSITY = 0.45;

export function targetChars(project) {
  const chosen = project?.settings?.target_seconds;
  if (TARGET_CHOICES.includes(chosen)) {
    return Math.round(chosen * CHARS_PER_SEC * SPEECH_DENSITY);
  }
  return Math.round(materialChars(project) * SPEECH_DENSITY);
}
```

`underTarget` 을 옛 모양으로 되돌린다(주석에 왜 되돌렸는지 남긴다):

```js
// 미달 판정에 글자 수만 쓰면 안 된다. 두 줄짜리 자료에서 하한을 요구했더니 모델이
// 자료에 없는 말("직접 삶아 세탁", "고객 만족도가 높습니다")을 지어내 채웠다.
// 물어야 할 것은 "짧은가"가 아니라 "채울 재료가 남았는가"다.
//
// ⚠️ 2026-08-14 오전에 이 검사를 걷어냈다가 같은 날 되돌렸다. 걷어낸 이유(15초 요청에
// 11초가 나왔다)는 진짜였지만 원인이 여기가 아니었다 — **목표가 83자라 얕은 자료가 닿을
// 수 없었던 것**이고, 밀도 계수(SPEECH_DENSITY)가 목표를 37자로 내려 그 원인을 없앴다.
// 길이는 이제 원고가 아니라 컷 초 배분이 진다(lib/cuts.js 의 allocateCutSeconds).
export function underTarget(project, text) {
  const chars = (text || "").replace(/\s/g, "").length;
  if (chars >= targetChars(project) * UNDER_LIMIT) return false;
  return unusedFacts(project, text).length > 0;
}
```

`REWRITE_SYSTEM` 의 '분량 미달' 항목을 되돌린다 — 오전에 추가한 ①②·✗✓ 예시 블록을 지우고 아래 세 줄로 되돌린다:

```
- '분량 미달'로 지적됐으면: 지문의 [아직 안 쓴 사실]을 원고에 넣어 채운다. 그것이 채울 재료다.
  다 넣고도 모자라면 이미 쓴 사실의 결과·이유·의미까지 한 걸음 더 간다.
  없는 사실을 지어내거나 같은 말을 되풀이해 늘리지 않는다 — 그럴 바에는 짧은 채로 둔다.
```

`buildScriptRewriteMessages` 의 `[더 깊이 갈 자리]` 블록은 **그대로 둔다**(판정과 무관하게 옳은 지시다).

`tests/script.test.js` 에서 오전에 고쳤던 `it("분량 미달에는 채우는 방법까지 지정한다 …")` 도 옛 단정으로 되돌린다:

```js
  it("분량 미달에는 채우는 방법까지 지정한다 — 지어내기·되풀이로 채우면 안 된다", () => {
    const { system } = buildScriptRewriteMessages(project, draft, ["분량 미달"]);
    expect(system).toContain("분량 미달");
    expect(system).toContain("한 걸음 더");
    expect(system).toContain("짧은 채로 둔다");
  });
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부. ⚠️ `targetChars` 를 쓰는 다른 테스트(수미상관 `wantsBookend` 등)가 깨질 수 있다 — `BOOKEND_MIN_CHARS = 120` 경계가 밀도 때문에 움직인다. 깨지면 **테스트를 고치지 말고 멈추고 보고한다**: 30초 목표가 165자→74자가 되어 수미상관이 어느 길이에도 안 걸리게 된다면 그것은 이 계획이 놓친 결정이다.

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat(script): 말의 밀도 계수 — 15초를 말로 다 채우지 않는다"
```

---

### Task 2: 컷이 "말하는 시간"과 "화면에 있는 시간"을 따로 갖는다

**Files:**
- Modify: `lib/validate.js:31` (`validateCutRanges`)
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: `secondsForText(text) → number` (`lib/script.js`, 기존)
- Produces: 컷 객체에 `spoken_seconds: number` 추가. `seconds` 는 이 태스크에서 **아직 낭독 값 그대로** 둔다(배분은 Task 3).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 의 `validateCutRanges` describe 에 추가:

```js
  // ★ 값 하나가 두 가지 뜻을 겸하고 있었다: cut.seconds 가 "낭독 시간"이면서 동시에
  //   "이 컷이 화면에 있는 시간"이었다. 여백을 넣으려면 둘이 갈라져야 한다 —
  //   자막은 말하는 동안만 떠야 하고, 클립은 화면 시간만큼 주문해야 한다.
  it("말하는 시간을 spoken_seconds 로 따로 적는다", () => {
    const cuts = validateCutRanges(
      { cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] },
      ["매일 아침 직접 갈아 만듭니다.", "하루 40잔이면 끝납니다."]
    );
    expect(cuts).toHaveLength(2);
    for (const c of cuts) {
      expect(c.spoken_seconds).toBe(secondsForText(c.sentence));
      expect(c.spoken_seconds).toBeGreaterThan(0);
    }
  });
```

`tests/validate.test.js` 상단에 `import { secondsForText } from "../lib/script.js";` 를 더한다(이미 있으면 두지 않는다).

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `c.spoken_seconds` 가 `undefined`.

- [ ] **Step 3: 구현한다**

`lib/validate.js:31` 을 바꾼다:

```js
    // 초는 LLM에게 묻지 않는다 — 자른 글자수가 곧 낭독 시간이다.
    //
    // ★ 값이 둘이다(2026-08-14). spoken_seconds 는 **말하는 시간**이고 seconds 는
    //   **이 컷이 화면에 있는 시간**이다. 지금은 같은 값으로 시작하지만,
    //   allocateCutSeconds(lib/cuts.js)가 고른 초를 배분하면서 seconds 만 커진다.
    //   그 차이가 여백이다 — 자막은 spoken_seconds 만큼만 뜨고(lib/subtitles.js),
    //   클립은 seconds 만큼 주문된다(lib/i2v.js).
    const spoken = secondsForText(sentence);
    out.push({
      idx: out.length, sentence,
      spoken_seconds: spoken,
      seconds: spoken,
      source: "ai", regen_count: 0,
    });
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부(추가만 했으므로 회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add lib/validate.js tests/validate.test.js
git commit -m "feat(cuts): 말하는 시간과 화면에 있는 시간을 나눈다"
```

---

### Task 3: 고른 초를 컷에 배분한다

**Files:**
- Modify: `lib/cuts.js` (`allocateCutSeconds` 신설)
- Modify: `lib/pipeline.js:41-60` (`splitCuts` 가 배분을 적용)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: `cut.spoken_seconds` (Task 2) · `minSecondsFor(profile) → number` · `maxSecondsFor(profile) → number` · `clipProfileForProject(project) → profile` (`lib/clip-limits.js`, 기존 import)
- Produces: `allocateCutSeconds(cuts, targetSeconds, profile) → number[]` — 컷 순서대로의 화면 시간(정수 초)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 에 describe 를 새로 추가:

```js
describe("allocateCutSeconds — 고른 초를 컷에 배분한다", () => {
  const profile = { min: 3, max: 15 }; // Kling v3 와 같은 모양

  it("여백을 컷에 나눠 얹어 합이 고른 초가 된다", () => {
    const cuts = [{ spoken_seconds: 4 }, { spoken_seconds: 3 }, { spoken_seconds: 3 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
    // 바닥(말하는 시간)보다 작아지지 않는다 — 말이 잘리면 안 된다
    out.forEach((s, i) => expect(s).toBeGreaterThanOrEqual(cuts[i].spoken_seconds));
  });

  it("모델 하한을 밑돌지 않는다", () => {
    const cuts = [{ spoken_seconds: 1 }, { spoken_seconds: 1 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    out.forEach((s) => expect(s).toBeGreaterThanOrEqual(3));
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
  });

  it("모델 상한을 넘지 않는다 — 넘길 여백은 버린다", () => {
    const cuts = [{ spoken_seconds: 2 }];
    const out = allocateCutSeconds(cuts, 60, profile);
    expect(out).toEqual([15]); // 상한에서 멈춘다. 합이 60 이 안 돼도 넘지 않는다
  });

  // ★ 말이 고른 초보다 길면 말이 이긴다 — 자르면 문장 끝이 사라진다
  it("말하는 시간의 합이 고른 초보다 크면 말을 따른다", () => {
    const cuts = [{ spoken_seconds: 9 }, { spoken_seconds: 9 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out).toEqual([9, 9]);
  });

  it("무음 컷(말하는 시간 0)은 여백만 받는다", () => {
    const cuts = [{ spoken_seconds: 0, silent: true }, { spoken_seconds: 6 }];
    const out = allocateCutSeconds(cuts, 15, profile);
    expect(out.reduce((a, b) => a + b, 0)).toBe(15);
    expect(out[0]).toBeGreaterThanOrEqual(3); // 하한은 받는다
  });

  it("컷이 없으면 빈 배열이다", () => {
    expect(allocateCutSeconds([], 15, profile)).toEqual([]);
    expect(allocateCutSeconds(null, 15, profile)).toEqual([]);
  });
});
```

`tests/cuts.test.js` 상단 import 에 `allocateCutSeconds` 를 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — `allocateCutSeconds is not a function`.

- [ ] **Step 3: 구현한다**

`lib/cuts.js` 의 `explodeLongRanges` 아래에 추가한다:

```js
// 고른 초를 컷에 배분한다 — **여백이 여기서 생긴다.**
//
// 지금까지 컷 초는 낭독 시간이었다(그래서 영상 길이 = 원고 길이였고, 원고가 63자면
// 15초를 골라도 11초가 나왔다). 이제 고른 초가 주문값이고, 말하는 시간은 **바닥**이다.
//
// 규칙 셋이 순서대로다:
//  1) 바닥 = max(말하는 시간, 모델 하한) — 자르면 문장 끝이 사라진다
//  2) 남는 초를 컷마다 한 초씩 돌아가며 얹는다 — 균등이 아니라 라운드로빈이라
//     나머지가 어디로 갈지가 결정적이다(같은 입력이면 늘 같은 결과)
//  3) 모델 상한에 닿은 컷은 건너뛴다. 전부 상한이면 거기서 멈춘다 —
//     합이 고른 초에 못 미쳐도 상한을 넘기지 않는다(넘기면 fal 이 거절한다)
//
// ★ 반환은 초 배열이고 컷을 고치지 않는다 — 부르는 쪽이 문서에 반영한다.
export function allocateCutSeconds(cuts, targetSeconds, profile) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (!list.length) return [];
  const min = minSecondsFor(profile);
  const max = maxSecondsFor(profile);
  const out = list.map((c) => {
    const spoken = Math.ceil(Number(c?.spoken_seconds) || 0);
    return Math.min(max, Math.max(min, spoken));
  });
  const target = Math.round(Number(targetSeconds) || 0);
  let left = target - out.reduce((a, b) => a + b, 0);
  // 남으면 얹는다. 모자라면 아무것도 하지 않는다 — 바닥 아래로는 깎지 않는다.
  let guard = 0;
  while (left > 0 && guard++ < 10000) {
    const before = left;
    for (let i = 0; i < out.length && left > 0; i++) {
      if (out[i] < max) { out[i] += 1; left -= 1; }
    }
    if (left === before) break; // 전부 상한 — 더 얹을 자리가 없다
  }
  return out;
}
```

`lib/pipeline.js` 의 `splitCuts` 에서 컷이 확정된 뒤(폴백까지 끝난 자리, `cuts` 가 최종값이 된 직후) 배분을 적용한다. `updateProject` 로 저장하기 **전**이다:

```js
  // ★ 고른 초를 컷에 배분한다 — 여기서 영상 길이가 정해진다(원고가 아니라).
  //   고른 초가 없으면(자동 길이) 원고 추정을 그대로 쓴다 — 주문값이 없으니 배분할 것도 없다.
  const targetSeconds = project?.settings?.target_seconds;
  if (TARGET_CHOICES.includes(targetSeconds)) {
    const allocated = allocateCutSeconds(cuts, targetSeconds, clipProfileForProject(project));
    cuts = cuts.map((c, i) => ({ ...c, seconds: allocated[i] }));
  }
```

`lib/pipeline.js` 상단 import 에 `allocateCutSeconds` 를 `./cuts` 에서, `TARGET_CHOICES` 를 `./script` 에서, `clipProfileForProject` 를 `./clip-limits.js` 에서 더한다(`projectSpeaks` 가 이미 그 파일에서 온다).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js lib/pipeline.js tests/cuts.test.js
git commit -m "feat(cuts): 고른 초를 컷에 배분한다 — 여백이 생긴다"
```

---

### Task 4: 낭독 실측이 화면 시간을 덮지 않게 한다

**Files:**
- Modify: `lib/pipeline.js:393-410` (TTS 루프의 저장)
- Test: `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `cut.seconds`(배분된 화면 시간) · `cut.spoken_seconds`
- Produces: TTS 실측이 `spoken_seconds` 에 들어가고, 실측이 화면 시간보다 길면 `seconds` 가 그만큼 올라간다

**배경.** 지금은 TTS 실측이 `cut.seconds` 를 덮어쓴다. 그대로 두면 Task 3 의 배분이 ③목소리에서 지워져 Kling 경로가 다시 원고 길이로 돌아간다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

⚠️ **먼저 기존 테스트를 고쳐야 한다.** `tests/pipeline.test.js:451` 의
`it("컷마다 audio를 채우고 seconds를 실측으로 덮어쓴다", …)` 가 지금 동작(실측이 `seconds` 를 덮음)을 못 박고 있다. **그것이 이 태스크가 없애는 동작이다.** 그 테스트를 아래로 바꾼다:

```js
  it("컷마다 audio를 채우고 말하는 시간을 실측으로 덮는다", async () => {
    const p = await withCuts([
      { idx: 0, sentence: "첫 문장", spoken_seconds: 3, seconds: 8, state: "done", image: { url: "i0" } },
      { idx: 1, sentence: "둘째 문장", spoken_seconds: 9, seconds: 9, state: "done", image: { url: "i1" } },
    ]);

    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async ({ text }) => ({ url: "a/" + text, seconds: 4.3 }),
    });

    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.status).toBe("voice");
    expect(saved.cuts[0].audio).toEqual({ url: "a/첫 문장", seconds: 4.3, of: "첫 문장" });
    // ★ 2026-08-14: 실측이 덮는 것은 **말하는 시간**이다. 화면에 있는 시간(seconds)은
    //   allocateCutSeconds 가 배분한 값이라 지킨다 — 덮으면 여백이 통째로 사라진다.
    expect(saved.cuts[0].spoken_seconds).toBe(4.3);
    expect(saved.cuts[0].seconds).toBe(8);   // 배분된 여백이 살아 있다
    // 말이 화면 시간보다 길면 화면 시간이 따라 올라간다 — 말은 자르지 않는다
    expect(saved.cuts[1].spoken_seconds).toBe(4.3);
    expect(saved.cuts[1].seconds).toBe(9);
  });
```

그리고 같은 describe 에 경계 하나를 더한다:

```js
  // 말이 배분된 화면 시간보다 길면 화면 시간이 말을 따라간다
  it("실측이 화면 시간보다 길면 화면 시간을 늘린다", async () => {
    const p = await withCuts([{ idx: 0, sentence: "긴 문장", spoken_seconds: 3, seconds: 4 }]);
    await pipeline.runVoicePipeline(p.id, OWNER, {
      speak: async () => ({ url: "a", seconds: 9 }),
    });
    const saved = await projects.getProject(p.id, OWNER);
    expect(saved.cuts[0].spoken_seconds).toBe(9);
    expect(saved.cuts[0].seconds).toBe(9);
  });
```

`withCuts` 는 그 describe 안(`tests/pipeline.test.js:445`)에 이미 있는 헬퍼다 — 새로 만들지 마라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `seconds` 가 3(실측)으로 덮여 8 이 아니다.

- [ ] **Step 3: 구현한다**

`lib/pipeline.js` 의 TTS 루프에서 컷을 저장하는 자리를 바꾼다. `seconds: seconds` 로 덮던 것을:

```js
        // ★ 실측이 덮는 것은 **말하는 시간**이다(2026-08-14).
        //   화면에 있는 시간(seconds)은 allocateCutSeconds 가 정한 값이라 지킨다 —
        //   여기서 덮으면 배분된 여백이 통째로 사라지고 영상이 다시 원고 길이가 된다.
        //   다만 말이 화면 시간보다 길면 화면 시간이 따라 올라간다. 말은 자르지 않는다.
        spoken_seconds: seconds,
        seconds: Math.max(Number(cut.seconds) || 0, seconds),
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js
git commit -m "fix(voice): 낭독 실측이 배분된 화면 시간을 덮지 않게 한다"
```

---

### Task 5: 자막이 여백에 떠 있지 않게 한다

**Files:**
- Modify: `lib/subtitles.js:62-80` (`buildCues`)
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Consumes: `cutSeconds(cut) → number`(화면 시간, 기존) · `cut.spoken_seconds`
- Produces: 자막 span 은 말하는 시간, 컷 사이 누적은 화면 시간

**배경.** `buildCues` 는 자막이 머무는 시간과 흘러가는 시간을 **같은 값(`cutSeconds`)** 으로 쓴다. 지금까지는 둘이 같아서 맞았다. 여백이 생기면 5초 컷에 2.2초 대사일 때 자막이 2.8초 동안 말 없이 떠 있는다.

⚠️ `cutSeconds` 자체는 **고치지 않는다.** 그것은 "이 컷이 완성본에서 차지하는 시간"이고 `lib/compose.js` 의 `fit` 판정과 같은 자를 써야 한다(파일 주석에 못 박혀 있다).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/subtitles.test.js` 에 추가:

```js
  // ★ 여백에는 자막이 없다(2026-08-14). 컷이 5초인데 대사가 2초면 자막은 2초만 뜬다.
  //   컷 사이 누적은 여전히 화면 시간(5초)이라야 다음 컷이 제자리에서 시작한다.
  it("자막은 말하는 동안만 뜨고, 다음 컷은 화면 시간 뒤에 시작한다", () => {
    const cuts = [
      { idx: 0, sentence: "짧게 말합니다.", spoken_seconds: 2, seconds: 5, video: { seconds: 5 } },
      { idx: 1, sentence: "다음 문장입니다.", spoken_seconds: 2, seconds: 5, video: { seconds: 5 } },
    ];
    const cues = buildCues(cuts);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBe(2);   // 5 가 아니다 — 뒤 3초는 여백이다
    expect(cues[1].start).toBe(5); // 누적은 화면 시간
    expect(cues[1].end).toBe(7);
  });

  // spoken_seconds 가 없는 옛 문서는 지금처럼 화면 시간을 쓴다 — 회귀 0
  it("옛 컷(spoken_seconds 없음)은 지금과 같게 흐른다", () => {
    const cuts = [{ idx: 0, sentence: "옛 컷입니다.", seconds: 4, video: { seconds: 4 } }];
    const cues = buildCues(cuts);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBe(4);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `cues[0].end` 가 5 로 나온다.

- [ ] **Step 3: 구현한다**

`lib/subtitles.js` 의 `buildCues` 안에서 `span` 을 둘로 가른다:

```js
    // ★ 두 값이 다르다(2026-08-14). 자막이 머무는 시간은 **말하는 시간**이고,
    //   컷 사이 누적은 **화면에 있는 시간**이다. 여백에는 자막이 없다.
    //   옛 문서(spoken_seconds 없음)는 둘이 같아 지금과 똑같이 흐른다 — 회귀 0.
    const held = cutSeconds(c);                                  // 화면 시간 — 누적에 쓴다
    const spokenRaw = Number(c?.spoken_seconds) || 0;
    const span = spokenRaw > 0 ? Math.min(spokenRaw, held) : held; // 자막이 머무는 시간
```

그리고 이 블록 안에서 자막 시각을 계산할 때는 `span` 을, 컷을 넘길 때 `t` 에 더하는 값은 `held` 를 쓴다. 마지막 조각의 끝을 못 박는 자리도 `t + span` 이다(컷 끝이 아니라 **말 끝**이다):

```js
        const end = i === pieces.length - 1 ? t + span : t + acc;
```

`t += ...` 자리를 찾아 `held` 로 바꾼다(지금 `t += span` 또는 `t += cutSeconds(c)` 로 되어 있다).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "fix(subtitles): 여백에는 자막이 뜨지 않는다"
```

---

### Task 6: 측정 체크포인트 — 여기서 멈추고 잰다

**Files:** 없음(코드 변경 없음)

**이 태스크는 구현이 아니라 관문이다.** Task 1~5 로 밀도·길이·자막이 갖춰졌다. 무음 컷을 얹기 전에 **여기까지가 실제로 값을 내는지** 확인한다. 이 저장소 규율이다: 측정 없이 품질을 주장하지 않는다.

- [ ] **Step 1: 서버를 띄운다**

```bash
SHOTFORM_DEV_USER=<uuid> SHOTFORM_FAKE=fal SHOTFORM_DIST_DIR=.next-m npx next dev -p 3011
```

`SHOTFORM_DEV_USER` 값은 `.env.local` 40행에 주석으로 있다. `SHOTFORM_FAKE=fal` 이라 이미지·클립·TTS 는 가짜다 — **fal 비용 0원**, OpenAI 만 실제로 쓴다.

- [ ] **Step 2: 잰다**

```bash
MEASURE_BASE=http://localhost:3011 SHOTFORM_MEASURE_USER=<uuid> \
  node scripts/measure/run-pipeline.mjs shallow 3 15 --cuts
```

`shallow` 는 실제로 11초를 만든 자료다(스포츠카 한 줄 지시문). **3회 이상** — 표본 1회로 결론 내지 않는다.

- [ ] **Step 3: 표를 채운다**

| 재는 것 | 변경 전 | 목표 | 실측 |
|---|---|---|---|
| 원고 자수 / 목표 자수 | 60~77% | 90~110% | |
| 컷 초 합 / 고른 초 | 60~77% | **95~105%** | |
| 밀도(말하는 초 / 컷 초 합) | 100% | **40~50%** | |
| 지어낸 사실(숫자·실적·수상) | 0건 | **0건** | |

- [ ] **Step 4: 판정하고 보고한다**

- 컷 초 합이 고른 초에 닿지 않으면 **Task 3 의 배분에 결함이 있다** — Task 7 로 넘어가지 말고 보고한다
- 밀도가 40% 아래면 원고가 너무 짧다 — `SPEECH_DENSITY` 재검토가 필요하다고 보고한다
- 지어낸 사실이 나오면 **Task 1 의 되돌리기가 부족한 것**이다. 멈추고 보고한다

측정 결과를 사용자에게 보고하고 **Task 7 로 진행할지 확인을 받는다.** 서버를 끈다.

---

### Task 7: `projectSpeaks` 가 무음 컷을 건너뛴다

**Files:**
- Modify: `lib/clip-limits.js` (`projectSpeaks`)
- Test: `tests/clip-limits.test.js`

**Interfaces:**
- Consumes: `cut.silent` (Task 8 에서 채워지지만 **판정이 먼저다** — 순서를 바꾸면 무음 컷이 생기는 순간 모든 Seedance 프로젝트가 TTS 로 떨어진다)
- Produces: `projectSpeaks(project) → boolean` — 무음 컷을 판정 대상에서 제외

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/clip-limits.test.js` 의 `projectSpeaks` describe 에 추가:

```js
  // ★ "말할 사람이 없는 컷"과 "말하지 않기로 한 컷"은 다르다.
  //   앞엣것은 사고(제품 클로즈업에 대사가 배정 안 됨)라 전체를 TTS 로 보내야 하고,
  //   뒤엣것은 연출이라 나머지 컷의 목소리를 뺏으면 안 된다.
  //   가르지 않으면 무음 컷 하나 때문에 모든 Seedance 프로젝트가 TTS 로 떨어진다.
  it("의도한 무음 컷은 판정에서 건너뛴다", () => {
    const project = {
      settings: { i2v_model: "seedance-2.0" },
      cuts: [
        { idx: 0, sentence: "", silent: true },
        { idx: 1, sentence: "말하는 컷입니다." },
      ],
      cast: [{ who: "20대 남성", cuts: [1] }],
    };
    expect(projectSpeaks(project)).toBe(true);
  });

  it("무음 컷만 있으면 말하지 않는다", () => {
    const project = {
      settings: { i2v_model: "seedance-2.0" },
      cuts: [{ idx: 0, sentence: "", silent: true }],
      cast: [{ who: "20대 남성", cuts: [] }],
    };
    expect(projectSpeaks(project)).toBe(false);
  });

  // 사고는 그대로 사고다 — 문장은 있는데 말할 사람이 없으면 전체 TTS
  it("캐스팅이 안 된 말하는 컷은 여전히 전체를 TTS 로 보낸다", () => {
    const project = {
      settings: { i2v_model: "seedance-2.0" },
      cuts: [
        { idx: 0, sentence: "말하는 컷입니다." },
        { idx: 1, sentence: "이 컷은 배정이 없습니다." },
      ],
      cast: [{ who: "20대 남성", cuts: [0] }],
    };
    expect(projectSpeaks(project)).toBe(false);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: FAIL — 첫 테스트가 `false` 를 받는다(빈 문장이 조건을 깬다).

- [ ] **Step 3: 구현한다**

`lib/clip-limits.js` 의 `projectSpeaks` 마지막 부분을 바꾼다:

```js
  // ★ 무음 컷은 판정에서 뺀다(2026-08-14). 연출로 말하지 않기로 한 컷이므로
  //   "말할 사람이 없다"와 다르다. 가르지 않으면 무음 컷 하나가 나머지 컷의
  //   목소리까지 TTS 로 끌어내린다.
  const speaking = cuts.filter((c) => !c?.silent);
  if (!speaking.length) return false;
  return speaking.every((cut) =>
    typeof cut?.sentence === "string" && cut.sentence.trim() !== "" &&
    cast.some((p) => Array.isArray(p?.cuts) && p.cuts.includes(cut.idx))
  );
```

⚠️ 앞쪽의 `if (!cuts.length || !cast.length) return false;` 와 `if (cuts.some((c) => c.audio?.url)) return false;` 는 **그대로 둔다**(소리 파일이 이미 있는 교차 상태 방어다).

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add lib/clip-limits.js tests/clip-limits.test.js
git commit -m "feat(speaks): 의도한 무음 컷을 판정에서 건너뛴다"
```

---

### Task 8: 무음 컷 — 컷 분할이 정한다

**Files:**
- Modify: `lib/validate.js` (`validateCutRanges` 가 `silent` 항목을 받는다)
- Modify: `lib/cuts.js` (`splitSystem` 지문 · `buildShowsMessages` 목록)
- Modify: `lib/pipeline.js` (TTS 루프가 무음 컷을 건너뛴다)
- Test: `tests/validate.test.js` · `tests/cuts.test.js` · `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `validateCutRanges(obj, sentences)` (Task 2)
- Produces: 컷 객체에 `silent: true` · `sentence: ""` · `spoken_seconds: 0`

**설계 — 구조적 보장을 지키는 방법.** 무음 컷은 **문장을 소비하지 않는다.** LLM 응답에서 `silent: true` 인 항목은 `from`/`to` 를 갖지 않고, 나머지 항목들이 원고의 모든 문장을 빈틈없이 덮어야 한다는 규칙은 그대로다. 그래서 **문장을 가진 컷을 이어붙이면 원고와 글자 그대로 같다** 는 보장이 유지된다.

**개수 상한은 코드가 쥔다 — 최대 1개.** 광고 실측에서도 편당 최대 1개였다(12장면 중 2개, 각 편 1개 이하). 지문으로만 말하면 모델이 분량을 무음으로 때운다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 에 추가:

```js
  // ★ 무음 컷은 문장을 소비하지 않는다 — 그래서 "컷을 이어붙이면 원고와 같다"가 유지된다
  it("무음 컷을 받되 문장 덮기 규칙은 그대로다", () => {
    const cuts = validateCutRanges(
      { cuts: [{ silent: true }, { from: 1, to: 1 }, { from: 2, to: 2 }] },
      ["첫 문장입니다.", "둘째 문장입니다."]
    );
    expect(cuts).toHaveLength(3);
    expect(cuts[0]).toMatchObject({ idx: 0, silent: true, sentence: "", spoken_seconds: 0 });
    expect(cuts.filter((c) => !c.silent).map((c) => c.sentence).join(" "))
      .toBe("첫 문장입니다. 둘째 문장입니다.");
  });

  it("무음 컷이 둘 이상이면 통째로 버린다 — 분량을 무음으로 때우지 못하게", () => {
    expect(validateCutRanges(
      { cuts: [{ silent: true }, { from: 1, to: 1 }, { silent: true }] },
      ["첫 문장입니다."]
    )).toBe(null);
  });

  it("무음 컷만 있으면 버린다 — 원고가 통째로 사라진다", () => {
    expect(validateCutRanges({ cuts: [{ silent: true }] }, ["첫 문장입니다."])).toBe(null);
  });
```

`tests/cuts.test.js` 에 추가:

```js
  it("분할 지문이 무음 컷을 최대 하나로 못 박는다", () => {
    const { system } = buildSplitMessages({ ...project }, ["문장 하나."]);
    expect(system).toContain("무음");
    expect(system).toContain("하나");
  });

  it("화면 설계 목록에서 무음 컷이 자기 자리를 갖는다", () => {
    const cuts = [{ idx: 0, silent: true, sentence: "" }, { idx: 1, sentence: "말하는 컷." }];
    const { messages } = buildShowsMessages({ ...project }, cuts);
    expect(messages[0].content).toContain("(말 없는 장면)");
    expect(messages[0].content).toContain("말하는 컷.");
  });
```

⚠️ `project` 는 그 파일에 이미 있는 프로젝트 픽스처 이름으로 바꾼다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/cuts.test.js`
Expected: FAIL — `silent` 항목이 `from`/`to` 정수 검사에서 `null` 로 떨어진다.

- [ ] **Step 3: 구현한다**

`lib/validate.js` 의 `validateCutRanges` 루프를 고친다. 루프 앞에 상한 검사를 두고, 루프 안에서 `silent` 를 먼저 처리한다:

```js
  // ★ 무음 컷 — 연출로 말하지 않는 컷(2026-08-14). 문장을 소비하지 않으므로
  //   "컷을 이어붙이면 원고와 같다"는 보장이 유지된다.
  //   개수를 코드가 쥔다: 최대 하나. 지문으로만 말하면 분량을 무음으로 때운다
  //   (광고 실측에서도 편당 하나 이하였다).
  const silentCount = obj.cuts.filter((c) => c?.silent === true).length;
  if (silentCount > 1) return null;
  if (silentCount === obj.cuts.length) return null; // 원고가 통째로 사라진다
```

루프 안, `Number.isInteger` 검사 **앞**에:

```js
    if (c?.silent === true) {
      out.push({
        idx: out.length, sentence: "", silent: true,
        spoken_seconds: 0, seconds: 0,
        source: "ai", regen_count: 0,
      });
      continue; // expected 를 올리지 않는다 — 문장을 안 먹었다
    }
```

`lib/cuts.js` 의 `splitSystem` 이 만드는 지문 끝에 한 문단을 더한다:

```
- **말 없는 장면을 하나까지 넣을 수 있다.** 원고의 문장을 쓰지 않고 화면만 보여주는 컷이다.
  넣으려면 그 항목에 from·to 대신 {"silent": true} 를 적는다. 열거나 닫는 자리에 어울린다.
  **하나를 넘기지 마라** — 넘기면 응답 전체가 버려진다. 필요 없으면 넣지 않아도 된다.
```

`lib/cuts.js` 의 `buildShowsMessages` 에서 목록을 만드는 줄을 바꾼다:

```js
  const list = cuts.map((c, i) => `${i + 1}. ${c.silent ? "(말 없는 장면)" : c.sentence}`).join("\n");
```

`lib/pipeline.js` 의 TTS 루프가 무음 컷을 건너뛰게 한다. `cuts.map(async (cut) => {` 바로 뒤에:

```js
      // 무음 컷은 읽을 것이 없다 — 빈 문자열을 TTS 에 보내면 값만 나가고 소리가 안 온다
      if (cut?.silent || !String(cut?.sentence || "").trim()) return;
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS 전부.

- [ ] **Step 5: 커밋**

```bash
git add lib/validate.js lib/cuts.js lib/pipeline.js tests/validate.test.js tests/cuts.test.js tests/pipeline.test.js
git commit -m "feat(cuts): 말 없는 장면을 하나까지 — 컷 분할이 정한다"
```

---

### Task 9: Seedance 에서 ③목소리 단계를 숨긴다

**Files:**
- Modify: `lib/steps.js` (`stepsFor` 신설 · `currentStepKey`)
- Modify: `app/create/[id]/voice/page.js` (통과 화면 제거)
- Modify: `app/create/[id]/layout.js:8,27` — `STEPS` import 를 `stepsFor` 로 바꾸고 `STEPS.find(...)` 를 `stepsFor(project).find(...)` 로 바꾼다 (이 저장소에서 `STEPS` 를 읽는 화면은 이 파일 하나다 — `grep -rn "STEPS" app/ components/` 로 확인했다)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: `projectSpeaks(project) → boolean` (Task 7)
- Produces: `stepsFor(project) → Step[]` — 말하는 프로젝트에서는 `voice` 가 빠진 목록

⚠️ **`STEPS` 상수는 지우지 않는다.** 프로젝트가 없을 때(`/create`) 쓰는 기본 목록이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/steps.test.js` 에 추가:

```js
describe("stepsFor — 말하는 프로젝트에는 목소리 단계가 없다", () => {
  const speaking = {
    settings: { i2v_model: "seedance-2.0" },
    cuts: [{ idx: 0, sentence: "말하는 컷입니다." }],
    cast: [{ who: "20대 남성", cuts: [0] }],
  };
  const tts = { settings: { i2v_model: "kling-v3" }, cuts: [{ idx: 0, sentence: "컷." }], cast: [] };

  it("Seedance 프로젝트에서는 voice 가 빠진다", () => {
    expect(stepsFor(speaking).map((s) => s.key)).toEqual(
      ["material", "script", "images", "video", "done"]
    );
  });

  it("Kling 프로젝트는 지금과 같다", () => {
    expect(stepsFor(tts).map((s) => s.key)).toEqual(
      ["material", "script", "voice", "images", "video", "done"]
    );
  });

  it("프로젝트가 없으면 기본 목록이다", () => {
    expect(stepsFor(null).map((s) => s.key)).toEqual(STEPS.map((s) => s.key));
  });

  // ★ 화면이 여는 문과 가드가 닫는 문이 갈리면 안 된다(2026-08-13 에 겪은 결함).
  //   숨긴 단계로 보내 놓고 가드가 되돌리면 사장님은 버튼이 고장난 것으로 본다.
  it("말하는 프로젝트는 컷이 끝나면 목소리가 아니라 이미지로 간다", () => {
    expect(currentStepKey({ ...speaking, briefing: { confirmed: true }, status: "cuts" }))
      .toBe("images");
  });

  it("TTS 프로젝트는 지금처럼 목소리로 간다", () => {
    expect(currentStepKey({ ...tts, briefing: { confirmed: true }, status: "cuts" }))
      .toBe("voice");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — `stepsFor is not a function`.

- [ ] **Step 3: 구현한다**

`lib/steps.js` 에 추가한다(`STEPS` 정의 바로 아래):

```js
// 이 프로젝트가 실제로 지나는 단계.
//
// ★ 말하는 모델(Seedance)에서는 ③목소리에 **할 일이 없다** — 클립이 목소리를 함께
//   만들므로 그 화면은 "다음으로" 버튼 하나였다. 사장님에게는 눌러야 할 것 같은
//   죽은 단계였다(2026-08-14 사용자 지적).
//
// ⚠️ 스테퍼·라우팅 가드·currentStepKey 가 **모두 이 함수를 본다.** 한 곳이라도 STEPS 를
//    직접 읽으면 화면이 여는 문과 가드가 닫는 문이 갈린다(2026-08-13 에 겪은 결함이다).
export function stepsFor(project) {
  if (!project || !projectSpeaks(project)) return STEPS;
  return STEPS.filter((s) => s.key !== "voice");
}
```

`lib/steps.js` 상단에 `import { projectSpeaks } from "./clip-limits.js";` 를 더한다.

⚠️ **`lib/steps.js` 는 화면("use client")이 import 하는 파일이다.** `lib/clip-limits.js` 도 순수 데이터·순수 함수라 `fs` 를 끌지 않는다 — 사슬이 안전한지 확인하고, 아니면 멈추고 보고한다.

`currentStepKey` 의 `cuts` 갈래를 고친다:

```js
  // 말하는 프로젝트에는 목소리 단계가 없다 — 컷이 끝나면 바로 이미지다
  if (project.status === "cuts") return projectSpeaks(project) ? "images" : "voice";
```

`app/create/[id]/voice/page.js` 의 `if (projectSpeaks(project)) { ... }` 블록(212~233행)을 **지운다.** 대신 그 자리에서 ④이미지로 보낸다:

```js
  // 말하는 프로젝트에는 이 단계가 없다(lib/steps.js 의 stepsFor). 주소를 직접 치고
  // 들어온 경우만 여기 닿으므로, 화면을 보여주지 말고 제자리로 보낸다.
  if (projectSpeaks(project)) {
    router.replace(`/create/${project.id}/images`);
    return null;
  }
```

`app/create/[id]/layout.js` 를 고친다. 8행의 import 에 `stepsFor` 를 더하고, 27행을 바꾼다:

```js
    const target = stepsFor(project).find((s) => s.key === currentStepKey(project));
```

그리고 그 파일이 사이드바를 그리려고 `STEPS` 를 순회하는 자리도 `stepsFor(project)` 로 바꾼다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
그리고 화면을 고쳤으므로: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: 둘 다 통과.

- [ ] **Step 5: 커밋**

```bash
git add lib/steps.js app/create/\[id\]/voice/page.js tests/steps.test.js
git commit -m "feat(steps): 말하는 프로젝트에서 목소리 단계를 숨긴다"
```

---

### Task 10: 길이를 코드가 강제한다 — **측정이 요구한 추가 태스크**

> ★ 이 태스크는 계획에 없었다. **Task 6 측정이 만들어 냈다.** 실행 순서는 6 → **10** → 7 → 8 → 9 다.

**Files:**
- Modify: `lib/script.js` (`editKeptContent`)
- Modify: 되돌리기 라운드에서 스키마 거절을 다루는 자리 (`app/api/projects/[id]/script/route.js` 또는 `lib/llm.js` — `grep -rn "스키마 거절"` 로 찾는다)
- Test: `tests/script.test.js` · 해당 라우트 테스트

**측정이 보여 준 것(2026-08-14, shallow 자료 3회, 목표 15초 = 37자):**

```
[b52c32e1] 교정 41자 → 최종 106자      ← 41자면 목표 밴드(33~43) 안인데 버려졌다
[39db25fb] 교정 108자 → 최종 147자
[39db25fb] 1회차 스키마 거절 → 중단     ← 되돌리기가 3회 중 1회만 쓰고 포기
```

원고가 목표의 286%·397%인 채로 채택돼, 15초 요청에 19초·27초가 나왔다.

**원인 1 — `editKeptContent` 가 목표를 모른다.**

```js
export function editKeptContent(draft, edited) {
  return chars(edited) >= chars(draft) * 0.8;
}
```

교정이 원고를 뭉텅 지우는 것을 막는 가드다. **원래 문맥에서는 옳았다** — 교정은 다듬는 자리지 줄이는
자리가 아니었고, 목표가 83자일 때는 초안도 그 근처라 큰 축소가 곧 파괴였다. 밀도로 목표가 37자가 되자
초안이 목표의 3~4배가 되고, **목표에 맞추려는 정상적인 큰 축소가 파괴로 오판**된다.

**원인 2 — 스키마 거절이 라운드를 통째로 포기시킨다.** 되돌리기 3회가 보장이 아니라 상한일 뿐이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/script.test.js` 에 추가한다:

```js
describe("editKeptContent — 큰 축소가 늘 파괴인 것은 아니다", () => {
  // ⚠️ 2026-08-14 측정이 만든 테스트다. 실측 로그:
  //   [b52c32e1] 교정 41자 → 최종 106자  — 41자는 목표 밴드 안인데 가드가 버렸다.
  // 가드 자체는 옳다(교정이 원고를 뭉텅 지우면 안 된다). 빠진 것은 **목표를 함께 보는 것**이다.
  const at = (secs) => ({ ...project, settings: { target_seconds: secs } });

  it("초안이 목표를 크게 넘을 때, 밴드 안으로 데려온 교정은 받는다", () => {
    const p = at(15);                       // 목표 37자
    const draft = { text: "가".repeat(106) };
    const edited = { text: "나".repeat(41) }; // 밴드(31~43) 안
    expect(editKeptContent(draft, edited, p)).toBe(true);
  });

  it("초안이 이미 밴드 안이면 큰 축소는 여전히 파괴다", () => {
    const p = at(15);
    const draft = { text: "가".repeat(40) };  // 이미 밴드 안
    const edited = { text: "나".repeat(12) };
    expect(editKeptContent(draft, edited, p)).toBe(false);
  });

  it("초안이 넘쳐도 목표 아래로 깎아 오면 받지 않는다", () => {
    const p = at(15);
    const draft = { text: "가".repeat(106) };
    const edited = { text: "나".repeat(10) }; // 밴드 아래
    expect(editKeptContent(draft, edited, p)).toBe(false);
  });

  // 프로젝트를 안 넘기면 옛 규칙 그대로다 — 호출처를 다 못 고쳤을 때 조용히 느슨해지지 않게
  it("프로젝트 없이 부르면 옛 80% 규칙만 쓴다", () => {
    expect(editKeptContent({ text: "가".repeat(100) }, { text: "나".repeat(85) })).toBe(true);
    expect(editKeptContent({ text: "가".repeat(100) }, { text: "나".repeat(41) })).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js -t "editKeptContent"`
Expected: FAIL — 첫 테스트가 `false` 를 받는다(41 < 106 × 0.8).

- [ ] **Step 3: 구현한다**

```js
// 교정본을 받을 것인가.
//
// 기본 규칙은 "많이 줄었으면 교정이 원고를 뭉텅 지운 것"이다. 교정은 다듬는 자리지 줄이는
// 자리가 아니기 때문이다.
//
// ⚠️ 그 규칙만으로는 부족하다(2026-08-14 측정). 밀도 계수가 목표를 낮추면서 초안이 목표의
// 3~4배로 나오는 일이 흔해졌고, 그때 **목표에 맞추려는 정상적인 큰 축소**가 파괴로 오판됐다:
//   [b52c32e1] 교정 41자(목표 밴드 안) → 버려지고 106자가 남았다 → 15초 요청에 19초
// 그래서 목표를 함께 본다. 판정의 순서가 곧 의미다:
//   1) 조금만 줄었으면 받는다(옛 규칙 그대로)
//   2) 초안이 이미 밴드 안인데 크게 줄었으면 파괴다 — 줄일 이유가 없었다
//   3) 초안이 밴드를 넘었고 교정이 밴드 아래로 안 떨어뜨렸으면 받는다 — 교정이 제 일을 한 것이다
export function editKeptContent(draft, edited, project) {
  if (!edited?.text) return false;
  const chars = (s) => (s?.text || "").replace(/\s/g, "").length;
  const d = chars(draft);
  const e = chars(edited);
  if (e >= d * 0.8) return true;
  // 목표를 모르면 옛 규칙에서 멈춘다 — 호출처를 다 못 고쳤을 때 조용히 느슨해지면 안 된다
  if (!project) return false;
  const t = targetChars(project);
  if (d <= t * LENGTH_SLACK) return false;
  return e >= t * UNDER_LIMIT;
}
```

호출처에 `project` 를 넘기도록 고친다(`grep -rn "editKeptContent" app/ lib/`).

- [ ] **Step 4: 스키마 거절이 라운드를 포기시키지 않게 한다**

`grep -rn "스키마 거절"` 로 자리를 찾는다. 되돌리기 응답이 스키마에 안 맞으면 지금은 루프를 **중단**한다.
그 라운드를 **한 번 다시 시도**하고, 그래도 안 되면 그 라운드만 버리고 **남은 라운드를 계속 돈다.**
로그 문구도 무슨 일이 있었는지 그대로 적는다(`스키마 거절 → 재시도` · `스키마 거절 2회 → 이 라운드 버림`).

⚠️ 재시도는 유료 호출이다. **라운드당 한 번만** 재시도한다 — 무한 재시도를 만들지 마라.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 그린.

- [ ] **Step 6: 커밋**

```bash
git add lib/script.js tests/script.test.js <호출처 파일들>
git commit -m "fix(script): 목표를 넘긴 초안을 밴드로 데려온 교정을 버리지 않는다"
```

- [ ] **Step 7: 다시 잰다 — Task 6 과 같은 방법으로**

컷 초 합이 고른 초의 95~105% 에 들어오는지 3회 이상 확인한다. 안 들어오면 멈추고 보고한다.

---

## 마무리 — 전체 측정

Task 6 과 같은 방법으로 다시 재고, **무음 컷 비율**을 표에 더한다(목표: 광고 실측 17% 근처). 결과를 사용자에게 보고하고 wiki 에 반영한다(저장소 세션 마무리 규칙).

⚠️ **라이브 fal 검증은 사용자 승인 없이 하지 않는다.** 가짜 모드로는 클립 길이가 실제로 주문한 대로 오는지 확인할 수 없으므로, 승인을 받으면 15초 한 편(Kling ≈$1.26 / Seedance ≈$4.54)으로 확인한다.
