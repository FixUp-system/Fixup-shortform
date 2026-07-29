# 컷 분할 기본값 뒤집기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조각 하나 = 컷 하나가 기본이 되게 한다 — 8초를 넘으면서 두 조각 이상인 컷은 코드가 조각 경계에서 전부 푼다.

**Architecture:** LLM 에게 묻는 것은 그대로 두고(경계 번호), **받은 답을 코드가 되돌린다.** 되돌리기는 컷 객체가 아니라 **경계 범위**(`{from,to}`)를 다시 쓰는 것으로 한다 — 그러면 `validateCutRanges` 가 문장·초·idx 를 전부 다시 뽑아 주므로 재조립 코드가 필요 없고, 원고 보존 검사도 공짜로 한 번 더 받는다. 되묻기는 없앤다.

**Tech Stack:** Next.js 15 App Router, OpenAI(gpt-4o), vitest

설계 문서: `docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md` (커밋 `081405e`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD` 로 브랜치도 확인한다
- 기존 테스트 **512개 그린이 하한선**
- **유료 API(fal)를 한 번도 부르지 않는다.** Task 4 의 측정도 컷 분할까지만 돌리므로 OpenAI 만 쓴다(편당 약 $0.005)
- **프롬프트를 고치지 않는다** — `splitSystem()` 의 "8초를 넘지 않게 한다"는 그대로 둔다. 이번 변경은 코드 강제 하나의 효과만 재야 한다
- **`lib/validate.js` 의 `validateCutRanges` 를 고치지 않는다** — 원고 보존 보장의 심장이다
- **`splitUnits` 를 고치지 않는다** — 조각 정의는 그대로다
- 한국어 문구는 사장님이 읽는 말로. 커밋 메시지는 한국어, 기존 이력의 어조
- **테스트를 통과시키려고 프로덕션 코드를 맞추지 않는다.** 반대도 마찬가지다. 테스트를 지우거나 skip 하지 않는다
- `npm run build` 를 돌리지 않는다 — dev 서버가 3000번에 떠 있고 `.next` 가 겹쳐 죽는다

---

## File Structure

**수정**
- `lib/cuts.js` — `explodeLongRanges(ranges, units)` 신설 (Task 1)
- `lib/pipeline.js` — `defaultDeps.splitCuts` 의 되묻기 제거·분해 호출·로그 (Task 2) / `runVoicePipeline` 의 추정↔실측 로그 (Task 3)
- `tests/cuts.test.js` (Task 1) · `tests/pipeline.test.js` (Task 2, 3)
- `docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md` — 함수 이름 한 줄 정정 (Task 1)

**건드리지 않음**
- `lib/validate.js` · `lib/clip-limits.js` · `lib/compose.js` · `lib/subtitles.js` · `lib/script.js`
- `lib/cuts.js` 의 `splitUnits` · `splitClauses` · `splitSystem` · `SHOWS_SYSTEM` 본문

### 알아 둘 것 — `secondsForText` 의 성질

`lib/script.js:343`:

```js
export function secondsForText(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.min(15, Math.max(2, Math.round(chars / CHARS_PER_SEC)));  // CHARS_PER_SEC = 5.5
}
```

**공백을 빼고 세고, 2~15초로 묶인다.** 테스트 자료를 만들 때 이 셈을 그대로 쓴다 —
글자 22개 → 4초, 44개 → 8초, 66개 → 12초, 55개 → 10초.

---

## Task 1: 긴 컷을 조각 경계로 푸는 순수 함수

**Files:**
- Modify: `lib/cuts.js` (파일 끝, `splitUnits` 아래)
- Modify: `docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md` ("건드리는 곳" 절)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: `secondsForText`(이미 `lib/cuts.js:1` 에서 import 중), `CONTENT_MAX_SECONDS`(같은 파일 `:34`)
- Produces: `explodeLongRanges(ranges, units)` → `Array<{from:number,to:number}>`.
  입력이 배열이 아니면 빈 배열을 돌려준다. **1부터 시작하는 번호**를 쓴다(`validateCutRanges` 와 같은 규약)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 파일 끝에 더한다. 2번 줄의 import 에 `explodeLongRanges` 를 추가한다:

```js
import { splitSentences, splitUnits, explodeLongRanges, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, stillOnly } from "../lib/cuts.js";
```

그리고 파일 끝에:

```js
describe("explodeLongRanges — 8초를 넘고 두 조각 이상이면 푼다", () => {
  // secondsForText 는 공백을 빼고 5.5자/초로 센다(2~15초로 묶임).
  // 22자 → 4초, 44자 → 8초, 66자 → 12초, 55자 → 10초.
  const A = "가".repeat(22);
  const B = "나".repeat(22);
  const C = "다".repeat(22);
  const LONE = "라".repeat(55);   // 조각 하나로 10초 — 더 쪼갤 수 없다
  const units = [A, B, C, LONE];

  it("8초를 넘고 세 조각이면 조각 단위로 전부 푼다", () => {
    // 1~3 = 66자 = 12초
    const out = explodeLongRanges([{ from: 1, to: 3 }, { from: 4, to: 4 }], units);
    expect(out).toEqual([
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }, { from: 4, to: 4 },
    ]);
  });

  it("8초 이하면 묶음이 살아남는다 — 합치기가 없어지는 것이 아니라 예외가 된다", () => {
    // 1~2 = 44자 = 8초(초과 아님) · 3~4 = 77자 = 14초(초과)
    const out = explodeLongRanges([{ from: 1, to: 2 }, { from: 3, to: 4 }], units);
    expect(out).toEqual([
      { from: 1, to: 2 }, { from: 3, to: 3 }, { from: 4, to: 4 },
    ]);
  });

  it("조각 하나짜리는 8초를 넘어도 그대로 둔다 — 되물어도 답이 같다", () => {
    const out = explodeLongRanges([{ from: 4, to: 4 }], units);
    expect(out).toEqual([{ from: 4, to: 4 }]);
  });

  it("빈틈도 겹침도 만들지 않는다 — 원고 보존의 전제다", () => {
    const out = explodeLongRanges([{ from: 1, to: 3 }, { from: 4, to: 4 }], units);
    let expected = 1;
    for (const r of out) {
      expect(r.from).toBe(expected);
      expected = r.to + 1;
    }
    expect(expected).toBe(units.length + 1);
  });

  it("망가진 입력은 빈 배열로 떨어뜨린다 — 부르는 쪽이 폴백을 쥔다", () => {
    expect(explodeLongRanges(null, units)).toEqual([]);
    expect(explodeLongRanges([{ from: 0, to: 2 }], units)).toEqual([]);
    expect(explodeLongRanges([{ from: 1, to: 9 }], units)).toEqual([]);
    expect(explodeLongRanges([{ from: 2, to: 1 }], units)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — `explodeLongRanges is not a function`

- [ ] **Step 3: 함수를 만든다**

`lib/cuts.js` 의 `splitUnits` 함수 **아래**(지금 `:99` 다음, `splitSystem` 주석 앞)에 넣는다:

```js
// 받은 경계를 되돌린다 — 8초를 넘으면서 두 조각 이상인 컷은 조각 하나씩으로 푼다.
//
// 왜 컷이 아니라 경계를 다시 쓰는가: 이 결과를 validateCutRanges 에 다시 통과시키면
// 문장·초·idx 를 그 함수가 전부 다시 뽑아 준다. 재조립 코드를 두 벌 두지 않아도 되고,
// 빈틈·겹침·전량 사용 검사를 공짜로 한 번 더 받는다.
//
// 왜 강제로 푸는가: 판정만 하고 되묻는 방식은 실패했다 — 모델이 같은 답을 다시 냈고
// 코드가 받았다(2026-07-29 실측, 8초 초과 5건 중 4건이 "짧은 조각을 합친 것"이었다).
//
// 조각 하나로 이뤄진 컷은 8초를 넘어도 두고, 8초 이하 묶음도 그대로 둔다 —
// 합치기가 없어지는 것이 아니라 기본에서 예외로 내려오는 것이다.
export function explodeLongRanges(ranges, units) {
  if (!Array.isArray(ranges) || !Array.isArray(units)) return [];
  const out = [];
  let expected = 1;
  for (const r of ranges) {
    // 망가진 경계는 여기서 고치지 않는다 — 빈 배열로 떨어뜨리고 부르는 쪽이 폴백을 쓴다
    if (!Number.isInteger(r?.from) || !Number.isInteger(r?.to)) return [];
    if (r.from !== expected || r.to < r.from || r.to > units.length) return [];
    const seconds = secondsForText(units.slice(r.from - 1, r.to).join(" "));
    if (seconds > CONTENT_MAX_SECONDS && r.to > r.from) {
      for (let i = r.from; i <= r.to; i++) out.push({ from: i, to: i });
    } else {
      out.push({ from: r.from, to: r.to });
    }
    expected = r.to + 1;
  }
  // 원고를 끝까지 다 쓰지 않은 경계는 받지 않는다 — validateCutRanges 와 같은 규칙이다
  if (expected !== units.length + 1) return [];
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS

- [ ] **Step 5: 설계 문서의 함수 이름을 맞춘다**

설계 문서 "건드리는 곳" 절이 `explodeLongCuts(cuts, ranges, units)` 로 적혀 있다. 구현은 경계만
받는 쪽이 단순해서 이름과 인자가 달라졌다. `docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md` 에서
그 한 줄을 바꾼다:

```markdown
- `lib/cuts.js` — `explodeLongRanges(ranges, units)` 신설. 컷 객체가 아니라 **경계 범위**를 다시 쓴다 —
  결과를 `validateCutRanges` 에 다시 통과시키면 문장·초·idx 를 그 함수가 다시 뽑아 주고,
  빈틈·겹침 검사도 한 번 더 받는다. 순수 함수라 LLM 호출 없이 테스트한다
```

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (517개 — 512 + 새 테스트 5개)

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md
git commit -m "feat: 긴 컷을 조각 경계로 푸는 함수 — 컷이 아니라 경계를 다시 쓴다

8초를 넘으면서 두 조각 이상인 컷을 조각 하나씩으로 푼다. 조각 하나짜리는 8초를 넘어도
두고(되물어도 답이 같다), 8초 이하 묶음도 그대로 둔다 — 합치기가 없어지는 것이 아니라
기본에서 예외로 내려온다.

컷 객체가 아니라 경계를 다시 쓴 이유는 validateCutRanges 를 한 번 더 통과시키기 위해서다.
문장·초·idx 를 그 함수가 다시 뽑아 주므로 재조립 코드가 두 벌 생기지 않고, 빈틈·겹침
검사를 공짜로 받는다.

망가진 경계는 고치지 않고 빈 배열로 떨어뜨린다 — 폴백은 부르는 쪽이 쥔다."
```

---

## Task 2: 분할이 되묻기를 버리고 코드가 되돌린다

**Files:**
- Modify: `lib/pipeline.js` (`defaultDeps.splitCuts`, 지금 `:28`–`:63`)
- Test: `tests/pipeline.test.js` (`describe("컷 길이 — 쪼갤 수 있는데 안 쪼갰으면 다시 묻는다")`, 지금 `:620`–`:669` 를 통째로 바꾼다)

**Interfaces:**
- Consumes: `explodeLongRanges(ranges, units)` (Task 1)
- Produces: `defaultDeps.splitCuts(project)` — 반환 형태는 지금과 같다(컷 배열). 달라지는 것은
  **LLM 분할 호출이 컷당 한 번뿐**이라는 것과 **긴 컷이 분해되어 나온다**는 것

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js` 의 `describe("컷 길이 — 쪼갤 수 있는데 안 쪼갰으면 다시 묻는다", ...)`
블록 전체(`:620` 부터 `:669` 의 닫는 `});` 까지)를 아래로 **교체**한다.

```js
describe("컷 길이 — 쪼갤 수 있으면 코드가 되돌린다", () => {
  // 판정만 하고 되묻는 방식은 실패했다 — 모델이 같은 답을 다시 냈고 코드가 받았다.
  // 이제 되묻지 않고 그 자리에서 푼다.
  const LONG = "이 앰플은 PDRN과 엑소좀, 시카가 함께 들어 있어 자기 전에 토너를 바른 후, 2~3방울을 얼굴에 펴 바르고 자면 다음 날 아침 당김이 덜하다는 후기가 많습니다.";

  async function projectWithLongSentence() {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "앰플" }, script: { text: LONG },
    }));
  }

  const splitCallCount = () =>
    llmMock.callJson.mock.calls.filter((c) => c[0]?.stage === "컷 분할").length;

  it("한 컷에 다 몰아넣으면 되묻지 않고 코드가 푼다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    expect(units.length, "이 문장이 여러 조각으로 나뉘어야 이 테스트가 의미가 있다").toBeGreaterThan(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })   // 통째로 몰아넣은 답
      .mockResolvedValueOnce({ shots: [] })                               // 화면 설계
      .mockResolvedValueOnce({ cast: [] });                               // 캐스팅
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(splitCallCount(), "분할은 한 번만 묻는다").toBe(1);
    expect(cuts.length, "조각 수만큼 풀린다").toBe(units.length);
  });

  it("컷을 이어붙이면 원고와 같다 — 풀어도 보장은 그대로다", async () => {
    const p = await projectWithLongSentence();
    const units = splitUnits(LONG);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: units.length }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    const joined = cuts.map((c) => c.sentence).join(" ").replace(/\s/g, "");
    expect(joined).toBe(LONG.replace(/\s/g, ""));
  });

  it("쪼갤 수 없는 문장은 그대로 둔다 — 영영 실패하지 않게", async () => {
    const NO_BREAK = "아주아주아주긴한덩어리로이어져서끊을자리가전혀없는문장이길게이어지고또이어져서마침내끝납니다.";
    const p = await projects.createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: NO_BREAK },
    }));
    const units = splitUnits(NO_BREAK);
    expect(units.length, "이 문장은 나눌 자리가 없어야 한다").toBe(1);
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }] })
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts).toHaveLength(1);
    expect(cuts[0].seconds, "8초를 넘지만 더 쪼갤 수 없다").toBeGreaterThan(8);
    expect(splitCallCount()).toBe(1);
  });

  it("8초 이하로 묶은 답은 건드리지 않는다", async () => {
    const TWO = "매일 아침 딸기를 갈아 씁니다. 시럽은 쓰지 않습니다.";
    const p = await projects.createProject({ settings: {}, material: { text: "자료", photos: [] } });
    await projects.updateProject(p.id, (proj) => ({
      ...proj, briefing: { topic: "t" }, script: { text: TWO },
    }));
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 2 }] })   // 둘을 한 컷으로 — 8초 이하다
      .mockResolvedValueOnce({ shots: [] })
      .mockResolvedValueOnce({ cast: [] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts).toHaveLength(1);
    expect(cuts[0].seconds).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — 첫 테스트에서 분할 호출이 2회이고 컷이 1개다(되묻기가 아직 살아 있다)

- [ ] **Step 3: `splitCuts` 를 고친다**

`lib/pipeline.js` 의 6번 줄 import 에 `explodeLongRanges` 를 더한다:

```js
import { splitUnits, explodeLongRanges, buildSplitMessages, buildShowsMessages, buildImagePrompt, buildClipPrompt, CONTENT_MAX_SECONDS } from "./cuts";
```

그리고 `:35` 의 `// 8초를 넘으면서 **두 조각 이상**으로...` 주석부터 `:63` 의 `console.log(...)` 줄까지를
아래로 **교체**한다(`const split = buildSplitMessages(units);` 는 그대로 둔다):

```js
    // 받은 경계를 코드가 되돌린다 — 8초를 넘으면서 두 조각 이상인 컷은 조각 하나씩으로 푼다.
    // 되묻지 않는다: 실측에서 되물었더니 모델이 같은 답을 다시 냈고 코드가 받았다.
    // 값(시간·호출)을 치르고 결과가 덮이는 자리였다.
    const raw = await callJson({ system: split.system, messages: split.messages, stage: "컷 분할", projectId: project.id });
    let cuts = validateCutRanges(raw, units);
    let exploded = 0;
    if (cuts) {
      // 분해 결과를 같은 검사에 다시 통과시킨다 — 빈틈·겹침·전량 사용을 코드가 스스로 본다
      const after = validateCutRanges({ cuts: explodeLongRanges(raw?.cuts, units) }, units);
      if (after) {
        exploded = after.length - cuts.length;
        cuts = after;
      } else {
        // 분해는 개선이지 필수가 아니다 — 그것 때문에 분할이 실패하면 안 된다
        console.warn(`[분할 ${project.id.slice(0, 8)}] 분해 결과가 검사를 통과하지 못해 원래 경계를 쓴다`);
      }
    }
    // 경계를 못 받으면 조각 하나에 컷 하나 — 분할은 실패해도 대본은 살아 있다.
    // (이 폴백이 이제 기본값과 같은 모양이다)
    if (!cuts) {
      cuts = validateCutRanges({ cuts: units.map((_, i) => ({ from: i + 1, to: i + 1 })) }, units);
    }

    // 컷이 얼마나 긴지 남긴다. 막지는 않는다 — 못 쪼개는 문장도 있다.
    const over = cuts.filter((c) => c.seconds > CONTENT_MAX_SECONDS).length;
    console.log(`[분할 ${project.id.slice(0, 8)}] 조각 ${units.length}개 → 컷 ${cuts.length}개 · 분해 ${exploded}건 · 8초 초과 ${over}개`);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

`describe("defaultDeps.splitCuts — 두 패스")` 의 기존 테스트들이 함께 통과해야 한다.
특히 `"경계를 못 받으면 한 문장에 한 컷으로 떨어진다"` — 되묻기를 없앴어도 그 폴백은 그대로다.
**실패하면 고치지 말고 보고한다.** 계획이 틀렸다는 신호다.

- [ ] **Step 6: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js
git commit -m "feat: 분할이 되묻지 않고 코드가 그 자리에서 푼다

8초를 넘으면서 두 조각 이상인 컷을 조각 하나씩으로 되돌린다. 되묻기는 없앴다 —
실측에서 되물었더니 모델이 같은 답을 다시 냈고 코드가 받았다. 값을 치르고 결과가
덮이는 자리였다.

분해 결과를 validateCutRanges 에 다시 통과시킨다. 통과하지 못하면 원래 경계를 쓰고
경고만 남긴다 — 분해는 개선이지 필수가 아니라, 그것 때문에 분할이 실패하면 안 된다.

로그에 분해 건수를 더했다. 무엇이 되돌려졌는지 세지 못하면 효과를 잴 수 없다."
```

---

## Task 3: 추정과 실측이 얼마나 다른지 로그로 남긴다

분할 시점의 8초는 추정(초당 5.5자)이고 진짜 낭독 길이는 ③목소리에서 나온다. 이번에는 **재기만 한다** —
그 시점에 이미 소리를 샀기 때문에 컷을 쪼개면 유료로 다시 사야 하고 무효화 연쇄가 생긴다.

**Files:**
- Modify: `lib/pipeline.js` (`runVoicePipeline`, 지금 `:281`–`:311`)
- Test: `tests/pipeline.test.js` (`describe("runVoicePipeline — 컷마다 따로 읽힌다")` 안에 더한다)

**Interfaces:**
- Consumes: `CONTENT_MAX_SECONDS`(이미 `lib/pipeline.js:6` 에서 import 중)
- Produces: 없음(로그만). 저장되는 값과 흐름은 지금 그대로다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js` 의 `describe("runVoicePipeline — 컷마다 따로 읽힌다", ...)` 블록 안,
마지막 `it` 뒤에 더한다. 파일 첫 줄 import 에 `vi` 는 이미 들어 있다.

```js
  it("실측이 8초를 넘으면 추정과 나란히 로그로 남긴다 — 흐름은 막지 않는다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());
    const logs = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
    try {
      // 추정 6초짜리 컷을 9초로 읽어 온다
      await pipeline.runVoicePipeline(p.id, {
        speak: async () => ({ url: "http://a.mp3", seconds: 9 }),
      });
    } finally {
      spy.mockRestore();
    }
    expect(logs.some((l) => l.includes("추정") && l.includes("실측")), "긴 실측이 로그에 없다").toBe(true);
    const after = await projects.getProject(p.id);
    expect(after.status, "로그를 남겨도 흐름은 그대로 간다").toBe("voice");
    expect(after.cuts.find((c) => c.source === "ai").seconds, "실측이 추정을 덮는다").toBe(9);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `긴 실측이 로그에 없다`

- [ ] **Step 3: `runVoicePipeline` 에 로그를 더한다**

`lib/pipeline.js` 의 `runVoicePipeline` 안, `const { url, seconds } = await speak(...)` 줄
**바로 아래**에 넣는다:

```js
        // 분할이 쓴 8초는 추정(초당 5.5자)이고 이것이 실측이다. 얼마나 어긋나는지 남긴다.
        // 여기서 컷을 쪼개지는 않는다 — 이 시점엔 소리를 이미 샀고, 쪼개면 그것을 버리고
        // 유료로 다시 사야 한다. 추정이 얼마나 맞는지를 먼저 재고 그 수치로 다음을 정한다.
        if (seconds > CONTENT_MAX_SECONDS) {
          console.log(`[목소리 ${projectId.slice(0, 8)}] 추정 ${cut.seconds}초 → 실측 ${seconds}초 (컷${cut.idx + 1})`);
        }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js
git commit -m "feat: 낭독 실측이 8초를 넘으면 추정과 나란히 남긴다

분할이 쓰는 8초는 추정(초당 5.5자)이고 진짜 길이는 목소리에서 나온다. 얼마나 어긋나는지
세지 못하면 다음을 정할 수 없다.

여기서 컷을 쪼개지는 않는다 — 이 시점엔 소리를 이미 샀고, 쪼개면 그것을 버리고 유료로
다시 사야 한다. 무효화 연쇄도 생긴다. 이번엔 재기만 한다."
```

---

## Task 4: 좋아졌는지 잰다 — **0원, 사장님과 함께 본다**

**Files:** 없음 (측정). 발견한 것만 고친다.

**비용:** fal 호출 없음. OpenAI 만 쓴다 — 편당 약 $0.005, 9편이면 **$0.05 미만**.

- [ ] **Step 1: dev 서버가 떠 있는지 확인한다**

측정 스크립트는 `localhost:3000` 에 붙는다. 떠 있지 않으면 사장님께 알리고 띄워 달라고 한다
(`npm run dev`). **`npm run build` 를 돌리지 않는다.**

- [ ] **Step 2: 자료 3종 × 3회를 컷 분할까지 돌린다**

```bash
cd /c/Users/fixup/shotform-video
node scripts/measure/run-pipeline.mjs thin 3 30
node scripts/measure/run-pipeline.mjs tailor 3 30
node scripts/measure/run-pipeline.mjs workshop 3 30
```

`--cuts` 를 붙이지 않는다 — 붙이면 이미지가 돈다(가짜 모드가 아니면 유료다).

- [ ] **Step 3: 서버 로그에서 분할 줄을 모은다**

서버 콘솔에 컷 분할마다 이 모양이 남는다:

```
[분할 a1b2c3d4] 조각 8개 → 컷 7개 · 분해 1건 · 8초 초과 0개
```

9줄을 모아 표로 옮긴다 — 조각 수, 컷 수, 분해 건수, 8초 초과 수.

- [ ] **Step 4: 목표와 대조한다**

| | 지금(2026-07-29 실측) | 목표 |
|---|---|---|
| 8초 초과 컷 비율 | 50% | 한 자릿수 — 조각 자체가 8초를 넘는 것만 남는다 |
| 30초당 컷 수 | 4~5 | 6~8 |

**8초 초과가 안 떨어지면 채택하지 않는다.** 원인이 또 다른 곳에 있다는 뜻이고, 그것을 찾기 전에
다음으로 넘어가면 이번과 같은 일이 반복된다(직전 설계가 28% → 50% 로 악화됐다).

- [ ] **Step 5: 결과를 남긴다**

`docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md` 의 "어떻게 좋아졌다고 아는가" 절에
실측 표를 채운다. 8초 초과가 남았으면 **어떤 조각이 남겼는지**(문장이 길어서인지, 분해가 안 걸렸는지)를 함께 적는다.

```bash
git add docs/superpowers/specs/2026-07-29-cut-split-inversion-design.md
git commit -m "docs: 컷 분할 기본값 뒤집기 실측 결과

[9편 실측: 8초 초과 x% · 30초당 컷 y개 · 분해 z건]"
```

---

## 다음 — 이 계획이 하지 않는 것

- **켄번즈**(짧은 컷을 로컬 ffmpeg 로 0원에) — 이 측정이 끝난 뒤. 같이 넣으면 컷이 짧아진 효과와 싸진 효과가 섞인다
- **실측 기반 재분할** — Task 3 은 로그만이다. 소리를 버리는 결정은 그 수치를 보고 따로 한다
- **시나리오 신설** — 별도 스펙. `lib/cuts.js` 가 겹치므로 이 계획이 끝난 뒤에 한다
- **수정 범위 정리**(말은 원고에서·연출은 컷에서) — 별도 스펙. 원고 손 편집이 컷에 반영되지 않는 구멍(`app/api/projects/[id]/route.js`)을 함께 다룬다
