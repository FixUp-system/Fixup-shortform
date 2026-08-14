# 영상 프롬프트가 무대와 인물을 받는다 — 구현 계획 (A단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상(i2v) 프롬프트가 이 영상의 무대·인물·제품·화면비·톤을 받게 한다. 새 LLM 패스는 없다 — 이미 컷에 저장된 값을 싣기만 한다.

**Architecture:** 지금 그 절들은 `buildImagePrompt` 안에 **인라인**으로 조립돼 있다. 복사하면 두 벌이 되어 갈리므로, **고르는 로직(selection)을 순수 함수로 뽑아** 두 프롬프트가 같은 함수를 부르고, **문구(presentation)는 각자** 쓴다. 버그가 사는 곳은 "어느 인물이 이 컷인가"이지 문장 부호가 아니다.

**Tech Stack:** 순수 JavaScript(ESM) · vitest. 린터·타입체커 없음 — `npx vitest run` 이 유일한 관문이다.

**Spec:** `docs/superpowers/specs/2026-08-14-clip-prompt-context-design.md`

## Global Constraints

- **이미지 프롬프트 출력이 바이트 단위로 안 바뀐다.** 뽑아내기만 한다 — 한 글자라도 달라지면 이미 산 그림이 낡는다.
- `motion` · `speed` 를 **안 건드린다**(B단계 몫). 말하는 경로의 대사·목소리 문구도 그대로.
- 광고 경로(`lib/ad/*`)를 안 건드린다.
- `lib/cuts.js` 는 화면이 import 하는 사슬에 있다 — `fs` 에 닿는 import 를 더하지 마라.
- `git add -A` 금지(파일을 이름으로). `next.config.mjs` 커밋 금지.
- 유일한 관문은 `npx vitest run` — 전량을 돌린다.
- 값이 없으면 절을 넣지 않는다(빈 절이 프롬프트를 늘리지 않게).

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `lib/cuts.js` | 절의 **재료를 고르는** 순수 함수 신설 · `buildImagePrompt` 가 그것을 씀 | 1 |
| `lib/cuts.js` | `buildClipPrompt` 가 같은 재료를 실음 | 2 |
| `lib/steps.js` | `clipKey` 가 새로 실린 값을 각인에 넣음 | 3 |
| (코드 없음) | 원장으로 실측 | 4 |

---

### Task 1: 절의 재료를 고르는 함수를 뽑는다 — 출력은 한 글자도 안 바뀐다

**Files:**
- Modify: `lib/cuts.js` (`buildImagePrompt` 에서 선택 로직 추출)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Produces:
  - `stageOf(cut) → string` — 무대 원문(`cut.environment` 를 다듬은 것) 또는 `""`
  - `castLooksOf(cut, project) → string[]` — 이 컷에 배정된 인물의 `"who: look"` 목록
  - `subjectOf(project) → { anchor: string, look: string }` — 제품 앵커와 외형(없으면 빈 문자열)
  - `orientOf(project) → string` — `"vertical 9:16"` 등

**★ 이 태스크의 판정은 "출력이 안 바뀌었는가" 하나다.** 기능이 늘지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 에 추가한다. **먼저 지금 출력을 스냅샷으로 못 박는다** — 리팩터가
문구를 바꾸지 않았음을 이것으로 증명한다:

```js
// ★ 이 태스크는 기능을 안 늘린다. 선택 로직만 뽑아낸다.
//   문구가 한 글자라도 달라지면 이미 산 그림이 낡아 사장님에게 재구매가 제시된다
//   (buildImagePrompt 안의 stage·tone·noteClause 주석이 같은 규칙을 반복한다).
describe("buildImagePrompt — 재료를 뽑아내도 출력은 그대로다", () => {
  const rich = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "생딸기라떼", focus: { mode: "물건", subject: "생딸기라떼", look: "유리컵에 담긴 분홍 음료" } },
    cast: [{ who: "20대 여성", look: "긴 머리, 캐주얼한 옷차림", cuts: [0] }],
  };
  const cut = { idx: 0, shows: "여성이 컵을 든 미디엄 샷", environment: "실내 스튜디오, 한낮", tone: "따뜻한 색감" };

  it("풍부한 프로젝트의 프롬프트가 기대 문자열과 같다", () => {
    const p = buildImagePrompt(cut, rich);
    // 절이 다 실렸는지 문구 그대로 확인한다
    expect(p).toContain("vertical 9:16 composition");
    expect(p).toContain("Scene: 여성이 컵을 든 미디엄 샷.");
    expect(p).toContain(" Setting (same in every scene of this video): 실내 스튜디오, 한낮.");
    expect(p).toContain(" Characters in this frame (keep them identical across every scene) — 20대 여성: 긴 머리, 캐주얼한 옷차림.");
    expect(p).toContain(" The video's subject is: 생딸기라떼. Keep this exact product/subject consistent in every scene.");
    expect(p).toContain(" Its appearance, identical in every scene: 유리컵에 담긴 분홍 음료.");
    expect(p).toContain(" Overall look and color treatment, keep identical across all cuts: 따뜻한 색감.");
  });

  it("값이 없으면 절이 아예 안 붙는다", () => {
    const bare = { settings: { aspect_ratio: "9:16" }, briefing: {} };
    const p = buildImagePrompt({ idx: 0, shows: "빈 방" }, bare);
    expect(p).not.toContain("Setting (same in every scene");
    expect(p).not.toContain("Characters in this frame");
    expect(p).not.toContain("The video's subject is:");
    expect(p).not.toContain("Overall look and color treatment");
  });
});

describe("절의 재료를 고르는 함수", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "생딸기라떼", focus: { mode: "물건", subject: "생딸기라떼", look: "유리컵" } },
    cast: [
      { who: "20대 여성", look: "긴 머리", cuts: [0] },
      { who: "40대 남성", look: "짧은 머리", cuts: [1] },
      { who: "이름만", cuts: [0] }, // look 이 없으면 안 센다
    ],
  };

  it("이 컷에 배정된 인물만 고른다", () => {
    expect(castLooksOf({ idx: 0 }, project)).toEqual(["20대 여성: 긴 머리"]);
    expect(castLooksOf({ idx: 1 }, project)).toEqual(["40대 남성: 짧은 머리"]);
    expect(castLooksOf({ idx: 9 }, project)).toEqual([]);
  });

  // ★ 앵커는 **제품**이어야 한다 — topic 은 자료가 기획서면 기획 문구가 된다(주석의 실측).
  it("초점이 물건이면 그 대상이 제품이고, 사람 초점의 subject 는 안 쓴다", () => {
    expect(subjectOf(project).anchor).toBe("생딸기라떼");
    expect(subjectOf(project).look).toBe("유리컵");
    const person = { briefing: { topic: "사장님 이야기", focus: { mode: "사람", subject: "사장님", look: "앞치마" } } };
    expect(subjectOf(person).anchor).toBe("사장님 이야기"); // topic 으로 떨어진다
    expect(subjectOf(person).look).toBe("");               // 사람의 look 은 제품 외형이 아니다
  });

  it("무대와 화면비", () => {
    expect(stageOf({ environment: "  실내 스튜디오  " })).toBe("실내 스튜디오");
    expect(stageOf({})).toBe("");
    expect(orientOf({ settings: { aspect_ratio: "1:1" } })).toBe("square 1:1");
    expect(orientOf({ settings: { aspect_ratio: "16:9" } })).toBe("horizontal 16:9");
    expect(orientOf({ settings: {} })).toBe("horizontal 16:9"); // 지금 동작 그대로
  });
});
```

⚠️ `orientOf` 의 기본값은 **지금 코드가 하는 그대로**여야 한다. `buildImagePrompt` 의
삼항식을 읽고 확인한 뒤 테스트를 맞춘다 — 추측하지 마라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "재료를 고르는"`
Expected: FAIL — 함수가 없다.

- [ ] **Step 3: 구현한다**

`lib/cuts.js` 에 네 함수를 export 하고, `buildImagePrompt` 가 그것을 부르게 바꾼다.
**문구는 `buildImagePrompt` 안에 그대로 남긴다** — 함수는 재료만 돌려준다.

```js
// 절의 **재료**를 고르는 자리. 문구는 부르는 쪽이 쓴다.
//
// ★ 왜 재료만 나누는가: 버그가 사는 곳은 "어느 인물이 이 컷인가"·"무엇이 제품인가" 같은
//   선택이지 문장 부호가 아니다. 문구까지 공유하면 이미지와 영상이 같은 말을 해야 하는데,
//   둘은 보는 대상이 다르다(정지 화면 vs 이어지는 클립).
export function stageOf(cut) { … }
export function castLooksOf(cut, project) { … }
export function subjectOf(project) { … }
export function orientOf(project) { … }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 그린. **기존 이미지 프롬프트 테스트가 하나라도 깨지면 문구가 바뀐 것이다** —
고치지 말고 되돌린다.

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "refactor(cuts): 절의 재료를 고르는 자리를 뽑는다 — 출력은 그대로"
```

---

### Task 2: 영상 프롬프트가 그 재료를 싣는다

**Files:**
- Modify: `lib/cuts.js` (`buildClipPrompt`)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: Task 1 의 `stageOf` · `castLooksOf` · `subjectOf` · `orientOf`

**지금 나가는 실제 프롬프트**(fal 원장 실측):
```
빠른 속도로 도로를 질주한다. fast, explosive motion. The attached image is the first
frame — continue naturally from it. Keep the subject and style unchanged.
No text or letters. No talking faces or lip sync.
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("buildClipPrompt — 클립도 무대와 인물을 받는다", () => {
  const project = {
    settings: { aspect_ratio: "9:16", i2v_model: "kling-v3" },
    briefing: { topic: "스포츠카", focus: { mode: "물건", subject: "빨간 스포츠카", look: "매끈한 2도어 쿠페" } },
    cast: [{ who: "20대 남성", look: "검정 재킷", cuts: [0] }],
  };
  const cut = { idx: 0, motion: "빠른 속도로 도로를 질주한다", speed: "fast", environment: "해질녘 해안 도로", tone: "차가운 색감" };

  it("움직임이 맨 앞에 그대로 남는다 — 이 단계는 motion 을 안 건드린다", () => {
    expect(buildClipPrompt(cut, project).startsWith("빠른 속도로 도로를 질주한다. fast, explosive motion.")).toBe(true);
  });

  it("무대·인물·제품·톤·화면비가 실린다", () => {
    const p = buildClipPrompt(cut, project);
    expect(p).toContain("해질녘 해안 도로");
    expect(p).toContain("20대 남성: 검정 재킷");
    expect(p).toContain("빨간 스포츠카");
    expect(p).toContain("매끈한 2도어 쿠페");
    expect(p).toContain("차가운 색감");
    expect(p).toContain("vertical 9:16");
  });

  it("첫 프레임 유지와 금지문은 맨 뒤에 그대로 남는다", () => {
    const p = buildClipPrompt(cut, project);
    expect(p).toContain("The attached image is the first frame");
    expect(p).toContain("No text or letters.");
    expect(p.indexOf("The attached image")).toBeGreaterThan(p.indexOf("해질녘 해안 도로"));
  });

  // ★ 값이 없는 옛 컷의 프롬프트가 길어지면 안 된다
  it("값이 없으면 절이 안 붙는다 — 옛 컷은 지금과 같다", () => {
    const bare = { settings: {}, briefing: {} };
    const p = buildClipPrompt({ idx: 0, motion: "천천히 움직인다" }, bare);
    expect(p).not.toContain("Setting");
    expect(p).not.toContain("Characters");
    expect(p).not.toContain("subject is");
  });

  it("말하는 경로의 대사·목소리 문구가 안 바뀐다", () => {
    // 이 저장소의 speechFor 를 타는 픽스처로, 대사 문장이 그대로 실리는지만 본다
    // (자막이 태우는 원고와 갈리면 안 된다)
  });
});
```

⚠️ 마지막 테스트는 **그 파일에 이미 있는 말하는-경로 픽스처를 찾아** 채운다. 없으면
`speechFor` 가 무엇을 요구하는지 코드에서 확인하고 만든다 — 추측하지 마라.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "클립도 무대와"`

- [ ] **Step 3: 구현한다**

`buildClipPrompt` 에 절을 더한다. **순서가 뜻이다** — 움직임이 먼저, 맥락이 뒤,
첫 프레임 유지와 금지문이 맨 끝(코드가 마지막에 붙여 사장님 입력이 우리 지시를 못 지운다).

말하는 경로와 안 말하는 경로 **둘 다** 같은 절을 받아야 한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "feat(clip): 영상 프롬프트가 무대·인물·제품·톤·화면비를 받는다"
```

---

### Task 3: 각인이 새로 실린 값을 본다

**Files:**
- Modify: `lib/steps.js` (`clipKey`)
- Test: `tests/steps.test.js`

**배경.** `clipKey` 는 **프롬프트에 실리는 것**을 담아야 한다. 안 넣으면 무대를 고쳐도
클립이 안 낡아, 화면은 새 무대인데 영상은 옛 무대인 상태가 조용히 남는다.

⚠️ **넣으면 이미 산 클립이 낡는다.** 저장소는 이 자리에서 "있을 때만 덧붙인다"로 네 번
피해 왔다(`style_of` · 자막 위치 · `tone_of` · 해상도).

★ **이번에는 재 봤다(2026-08-14 실측):** 클립을 산 프로젝트 **3편 · 클립 7개**가 전부이고
셋 다 내부 QA다. 전부 다시 사도 몇 달러다. **각인을 제대로 넣는다** — 물려받은 두려움보다
실측이 앞선다. (낡음은 자동 청구가 아니다. 화면에 "다시 만들기"가 뜰 뿐이다.)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("clipKey — 프롬프트에 실리는 것은 각인에도 있다", () => {
  const base = { settings: { aspect_ratio: "9:16" }, briefing: {}, cast: [] };
  const cut = { idx: 0, image: { url: "u" }, seconds: 5, motion: "달린다" };

  it("무대를 바꾸면 클립이 낡는다", () => {
    const a = clipKey({ ...cut, environment: "해변" }, base);
    const b = clipKey({ ...cut, environment: "도심" }, base);
    expect(a).not.toBe(b);
  });

  it("톤을 바꾸면 낡는다", () => {
    expect(clipKey({ ...cut, tone: "따뜻" }, base)).not.toBe(clipKey({ ...cut, tone: "차갑" }, base));
  });

  it("이 컷의 인물이 바뀌면 낡는다", () => {
    const p1 = { ...base, cast: [{ who: "A", look: "긴 머리", cuts: [0] }] };
    const p2 = { ...base, cast: [{ who: "A", look: "짧은 머리", cuts: [0] }] };
    expect(clipKey(cut, p1)).not.toBe(clipKey(cut, p2));
  });

  it("제품 앵커가 바뀌면 낡는다", () => {
    const p1 = { ...base, briefing: { topic: "커피" } };
    const p2 = { ...base, briefing: { topic: "차" } };
    expect(clipKey(cut, p1)).not.toBe(clipKey(cut, p2));
  });

  // ★ 관계없는 값은 안 건드린다 — 다른 컷의 인물이 바뀌었다고 이 컷이 낡으면 안 된다
  it("다른 컷의 인물이 바뀌어도 이 컷은 안 낡는다", () => {
    const p1 = { ...base, cast: [{ who: "B", look: "x", cuts: [1] }] };
    const p2 = { ...base, cast: [{ who: "B", look: "y", cuts: [1] }] };
    expect(clipKey(cut, p1)).toBe(clipKey(cut, p2));
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js -t "clipKey"`

- [ ] **Step 3: 구현한다**

`clipKey` 에 무대·톤·인물·제품을 덧붙인다. **Task 1 의 함수를 쓴다** — 각인이 프롬프트와
다른 자를 쓰면 갈린다.

⚠️ `lib/steps.js` 가 `lib/cuts.js` 를 import 해도 되는지 **확인하라.** `steps.js` 는 화면이
읽는 파일이고 `cuts.js` 는 LLM 지문 수백 줄을 들고 있다 — 사슬이 무거워지면 화면 번들이
부푼다(`lib/clauses.js` 가 정확히 그 이유로 갈라져 있다). 무거우면 **재료 함수만 따로
가벼운 모듈로 옮기고** 양쪽이 그것을 읽게 하라. 판단 근거를 보고서에 적어라.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
⚠️ 기존 `clipKey` 테스트가 깨질 수 있다 — 각인 형식이 바뀌는 것이 이 태스크의 정의다.
그러나 **"옛 각인이 안 낡는다"를 지키던 테스트가 깨지면** 그것은 설계 결정과 부딪히는 것이니
고치기 전에 보고하라.

- [ ] **Step 5: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "fix(steps): 각인이 클립 프롬프트에 실리는 값을 본다"
```

---

### Task 4: 원장으로 실측한다 — 이 작업의 성적표

**Files:** 없음(코드 변경 없음)

**★ 이 태스크가 판정이다.** 테스트가 그린이어도 **실제로 나가는 문자열**이 안 바뀌면 헛일이다.

- [ ] **Step 1: 서버를 띄운다**

```bash
SHOTFORM_DEV_USER=<uuid> SHOTFORM_FAKE=fal SHOTFORM_DIST_DIR=.next-m npx next dev -p 3011
```
`SHOTFORM_FAKE=fal` 이라 이미지·클립은 가짜다 — **fal 비용 0원**, OpenAI 만 실제로 쓴다.

⚠️ 가짜 모드는 `addRecord` 앞에서 갈라져 **원장에 안 남는다**(CLAUDE.md). 그러므로 원장
대신 **서버 로그나 `buildClipPrompt` 를 직접 불러** 문자열을 확인한다. 저장된 실제 프로젝트
문서를 읽어 `buildClipPrompt(cut, project)` 를 돌려 보는 것이 가장 싸고 정확하다.

- [ ] **Step 2: 잰다**

| | 변경 전(실측) | 목표 |
|---|---|---|
| 영상 프롬프트 길이 | 196~215자 | 무대·인물·제품이 실린 만큼 |
| 무대 포함 | 0% | 값이 있는 컷 전부 |
| 인물 외형 포함 | 0% | 캐스팅이 붙은 컷 전부 |
| 이미지 프롬프트 | 300자+ | **바이트 동일**(안 바뀌어야 한다) |

- [ ] **Step 3: 보고한다**

변경 전후 문자열을 **나란히** 보고서에 적는다. 이 작업이 무엇을 바꿨는지는 그 두 줄이 말한다.

---

## 마무리

- wiki 반영(저장소 세션 마무리 규칙)
- **B단계로 넘어가기 전에 확인할 것**: `lib/cuts.js:361` 의 "카메라가 움직이거나 피사체가
  움직이거나 — 둘 다 넣지 않는다"의 **근거를 커밋 기록에서 찾는다.** 실측으로 정한 규칙이면
  뒤집을 때 같은 실패가 돌아온다. 그리고 `speedContrast()` 가 **호출처 0곳인 죽은 코드**다 —
  Motion Arc 강제의 입구가 이미 만들어져 있다.
