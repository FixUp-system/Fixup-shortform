# 대본 수미상관 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 30초 이상 대본이 첫 문장이 세운 자리로 돌아와 닫게 한다 — 지문만 고쳐서.

**Architecture:** `lib/script.js` 한 파일에 경계값·판정·문구를 한 자리로 만들고(`BOOKEND_MIN_CHARS`·`wantsBookend`·`bookendBlock`), 세 지문 조립 함수가 그것을 조건부로 붙인다. `SYSTEM`·`REWRITE_SYSTEM`·`EDIT_SYSTEM` **상수는 건드리지 않는다** — 상수는 길이를 모르므로 넣는 순간 15초짜리에도 걸린다.

**Tech Stack:** JavaScript(ESM) · vitest

## Global Constraints

- **새 npm 의존성 금지.**
- **`scriptFaults`·`repeatsWithin`·`weakOpening` 을 고치지 않는다.** 사용자가 "지문만" 으로 정했다. 새 결함 판정을 만들지 않는다.
- **15초 동작 불변.** 목표 자수가 120 이하인 프로젝트의 지문에는 수미상관 문구가 한 자도 들어가면 안 된다.
- 경계값은 `BOOKEND_MIN_CHARS = 120` 하나뿐이다. 다른 자리에 숫자를 다시 적지 않는다.
- 주석은 한국어. 이 저장소의 기존 주석 밀도를 따른다(왜 그렇게 했는지를 적는다).
- 문구는 `bookendBlock` 한 자리에만 둔다. 세 지문이 각자 문자열을 적지 않는다.
- 스펙: `docs/superpowers/specs/2026-08-13-script-bookend-design.md`

---

### Task 1: 경계·판정·문구를 한 자리에 만든다

**Files:**
- Modify: `lib/script.js` (`capacitySeconds` 끝나는 자리와 `buildScriptMessages` 사이, 현재 99~101행)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: 같은 파일의 `targetChars(project)` (이미 있다)
- Produces:
  - `BOOKEND_MIN_CHARS: number` — 120
  - `wantsBookend(project): boolean`
  - `bookendBlock(kind?: "write" | "rewrite" | "edit"): string` — 지문 뒤에 이어붙일 문자열. 기본값 `"write"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/script.test.js` 맨 아래에 더한다. 파일 위쪽 import 목록에 `BOOKEND_MIN_CHARS`, `wantsBookend`, `bookendBlock` 세 개를 추가하는 것도 이 단계다.

```js
describe("수미상관 — 짧은 편에는 걸지 않는다", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });

  it("15초짜리는 걸지 않는다", () => {
    expect(wantsBookend(withSeconds(15))).toBe(false);
  });

  it("30·45·60초는 건다", () => {
    for (const s of [30, 45, 60]) expect(wantsBookend(withSeconds(s))).toBe(true);
  });

  // 사장님이 길이를 안 고르면 자료가 길이를 정한다 — 고른 초만 보면 이 경로가 통째로 빠진다
  it("자동(길이 미선택)이면 자료 양으로 갈린다", () => {
    const few = { ...project, settings: { aspect_ratio: "9:16" }, briefing: { ...project.briefing, key_points: ["하나", "둘"], asked: [] } };
    const many = { ...project, settings: { aspect_ratio: "9:16" }, briefing: { ...project.briefing, key_points: ["하나", "둘", "셋", "넷", "다섯"], asked: [] } };
    expect(targetChars(few)).toBeLessThanOrEqual(BOOKEND_MIN_CHARS);
    expect(wantsBookend(few)).toBe(false);
    expect(targetChars(many)).toBeGreaterThan(BOOKEND_MIN_CHARS);
    expect(wantsBookend(many)).toBe(true);
  });

  // 사실 4개 × 30자 = 정확히 120자. 경계는 **넘어야** 켜진다(> 이지 >= 가 아니다).
  it("딱 120자면 끈다", () => {
    const exact = {
      ...project,
      settings: { aspect_ratio: "9:16" },
      briefing: { ...project.briefing, key_points: ["하나", "둘", "셋", "넷"], asked: [] },
    };
    expect(targetChars(exact)).toBe(BOOKEND_MIN_CHARS);
    expect(wantsBookend(exact)).toBe(false);
  });
});

describe("bookendBlock — 문구는 한 자리에만 있다", () => {
  it("세 종류 모두 같은 머리말을 단다", () => {
    for (const kind of ["write", "rewrite", "edit"]) {
      expect(bookendBlock(kind)).toContain("[구조 — 수미상관]");
    }
  });

  // 지난번 라이브에서 "신발에서 시작해 신발로 끝나는 구조가 이를 가능하게 합니다" 가 나왔다.
  // 연출 지시를 구조로 만들지 못하고 낭독해 버린 것이라, 이 금지가 빠지면 그대로 재발한다.
  it("구조를 낭독하지 말라는 금지가 들어 있다", () => {
    expect(bookendBlock("write")).toContain("구조를 입 밖에 내지 않는다");
    expect(bookendBlock("rewrite")).toContain("구조를 입 밖에 내지 않는다");
  });

  it("같은 말을 되풀이하지 말라고 시킨다 — 되풀이 결함으로 오인되는 자리다", () => {
    expect(bookendBlock("write")).toContain("같은 말을 되풀이하지 않는다");
  });

  it("되돌리기 몫은 세 가지 충돌을 덮는다", () => {
    const r = bookendBlock("rewrite");
    expect(r).toContain("마지막 문장도 새 첫 문장에 맞춰 함께 고친다");
    expect(r).toContain("'같은 말 되풀이'가 아니다");
    expect(r).toContain("닫는 문장은 남긴다");
  });

  it("교정 몫은 지우지 말라는 것 하나다", () => {
    const e = bookendBlock("edit");
    expect(e).toContain("군더더기가 아니다");
    expect(e).not.toContain("닫는 문장은 남긴다");
  });

  it("기본값은 write 다", () => {
    expect(bookendBlock()).toBe(bookendBlock("write"));
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — `wantsBookend is not defined` (또는 import 오류)

- [ ] **Step 3: 최소 구현**

`lib/script.js` 의 `capacitySeconds` 함수가 끝나는 자리(현재 99행 `}` 다음)와 `export function buildScriptMessages` 사이에 넣는다.

```js
// ── 수미상관 ────────────────────────────────────────────────────────────
// 연 자리로 돌아와 닫는다. **짧은 편에는 걸지 않는다** — 15초는 목표 83자에 컷 2개라,
// 강제하면 문장 넷 중 둘이 같은 얘기가 된다(사용자 결정).
//
// ★ SYSTEM·REWRITE_SYSTEM·EDIT_SYSTEM 상수에는 넣지 않는다. 상수는 길이를 모르므로
//   넣는 순간 15초짜리에도 걸린다. 지문(동적 user 내용)에 조건부로 붙인다.
// ★ 문구는 여기 한 자리뿐이다. 세 지문이 각자 적으면 언젠가 갈라진다.
export const BOOKEND_MIN_CHARS = 120;

// 고른 초가 아니라 **목표 자수**로 잰다 — 사장님이 길이를 안 고르면(자동) 자료가 길이를
// 정하므로, 고른 초만 보면 자동 모드가 통째로 빠진다.
// 15초=83자 · 30초=165자라 경계 120이 그 사이에 있다.
export function wantsBookend(project) {
  return targetChars(project) > BOOKEND_MIN_CHARS;
}

// 지문 뒤에 이어붙일 문구. kind 는 어느 지문에 붙느냐다 — 셋이 서로 다른 위험을 진다.
export function bookendBlock(kind = "write") {
  // 교정은 다시 쓰는 자리가 아니라 걷어내는 자리다. 되짚는 문장은 새 사실이 없어
  // 군더더기로 보이기 쉬우니, 지우지 말라는 것 하나만 말한다.
  if (kind === "edit") {
    return `\n\n[구조 — 수미상관] 마지막 문장이 첫 문장을 되짚고 있으면 그것은 군더더기가 아니다. 그대로 둔다 — 새 사실이 없다고 지우지 않는다.`;
  }

  const core = `\n\n[구조 — 수미상관] 연 자리로 돌아와 닫는다.
- 첫 문장은 지금 규칙대로 가장 센 사실로 연다. 다만 그 사실이 **무엇에 대한 이야기인지**(어떤 제품·어떤 가게)를 알 수 있게 한다. 소개 투로 열지 않는 것은 그대로다.
- 마지막 문장은 첫 문장이 세운 그 자리로 돌아온다. 같은 것을 다시 집되 **같은 말을 되풀이하지 않는다** — 다른 사실, 다른 각도로 집는다.
  ✗ 첫 문장 "3,000원짜리 앰플이 하루 만에 품절됐습니다." → 마지막 "3,000원짜리 앰플이 하루 만에 품절됐습니다."
  ✓ 마지막 "그 3,000원짜리는 오늘도 오후면 없습니다."
- ★ 구조를 입 밖에 내지 않는다. "…에서 시작해 …로 끝난다" 같은 말은 연출 지시를 낭독한 것이다. 구조는 글이 그렇게 되는 것이지 글이 말하는 것이 아니다.
  ✗ "신발에서 시작해 신발로 끝나는 구조가 이를 가능하게 합니다."`;

  if (kind !== "rewrite") return core;

  // 되돌리기 지문에는 REWRITE_SYSTEM 의 지시 셋과 정면으로 부딪히는 자리가 있다.
  // 덮어 주지 않으면 되돌리기가 수미상관을 스스로 부순다.
  return core + `
- '약한 오프닝'으로 첫 문장을 바꿨으면 **마지막 문장도 새 첫 문장에 맞춰 함께 고친다** — 첫 문장만 바꾸면 닫는 문장이 허공을 가리킨다.
- 여는 문장과 닫는 문장이 같은 것을 되짚는 것은 '같은 말 되풀이'가 아니다. 지우지 말고, 겹치는 낱말을 다른 말로 바꿔 쓴다.
- 분량을 줄일 때도 **닫는 문장은 남긴다.**`;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat(script): 수미상관 경계·판정·문구를 한 자리에 만든다"
```

---

### Task 2: 초안 지문에 붙인다

**Files:**
- Modify: `lib/script.js` (`buildScriptMessages`, 현재 101~126행)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `wantsBookend(project)`, `bookendBlock("write")` (Task 1)
- Produces: 없음 — `buildScriptMessages` 의 반환 모양은 그대로다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("buildScriptMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });

  it("30초면 지문에 수미상관이 실린다", () => {
    const user = buildScriptMessages(withSeconds(30)).messages[0].content;
    expect(user).toContain("[구조 — 수미상관]");
    expect(user).toContain("구조를 입 밖에 내지 않는다");
  });

  it("15초면 한 자도 안 들어간다 — 기존 동작 불변", () => {
    const user = buildScriptMessages(withSeconds(15)).messages[0].content;
    expect(user).not.toContain("수미상관");
  });

  // 상수에 넣으면 길이를 모르는 채로 늘 걸린다. 조건부라는 것을 못 박는다.
  it("SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptMessages(withSeconds(30)).system).not.toContain("수미상관");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js -t "buildScriptMessages — 수미상관"`
Expected: FAIL — `expected … to contain "[구조 — 수미상관]"`

- [ ] **Step 3: 최소 구현**

`buildScriptMessages` 안, `[분량]` 블록을 붙이는 템플릿 리터럴이 끝난 바로 다음 줄(현재 120행 `...이것들을 하느니 짧은 채로 둔다.\`;` 다음)에 한 줄을 넣는다. `[기존 원고]` 를 붙이는 `if` 보다 **위**다 — 수정 지시가 지문의 맨 끝에 오게 둔다.

```js
  if (wantsBookend(project)) user += bookendBlock("write");
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat(script): 초안 지문에 수미상관을 건다(30초 이상)"
```

---

### Task 3: 되돌리기 지문에 붙인다

**Files:**
- Modify: `lib/script.js` (`buildScriptRewriteMessages`, 현재 402~426행)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `wantsBookend(project)`, `bookendBlock("rewrite")` (Task 1)
- Produces: 없음 — 반환 모양 그대로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("buildScriptRewriteMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });
  const draft = { text: "3,000원짜리 앰플이 하루 만에 품절됐습니다. 시카가 진정시킵니다." };

  it("30초면 되돌리기 몫 셋이 실린다", () => {
    const c = buildScriptRewriteMessages(withSeconds(30), draft, ["약한 오프닝"]).messages[0].content;
    expect(c).toContain("마지막 문장도 새 첫 문장에 맞춰 함께 고친다");
    expect(c).toContain("'같은 말 되풀이'가 아니다");
    expect(c).toContain("닫는 문장은 남긴다");
  });

  it("15초면 한 자도 안 들어간다", () => {
    const c = buildScriptRewriteMessages(withSeconds(15), draft, ["약한 오프닝"]).messages[0].content;
    expect(c).not.toContain("수미상관");
  });

  it("REWRITE_SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptRewriteMessages(withSeconds(30), draft, ["분량 초과"]).system).not.toContain("수미상관");
  });

  // 지적 사유가 무엇이든 구조는 지켜야 한다 — '분량 초과' 로 줄일 때가 특히 위험하다
  it("어떤 결함으로 불렸든 실린다", () => {
    for (const f of ["약한 오프닝", "같은 말 되풀이", "분량 초과", "분량 미달"]) {
      expect(buildScriptRewriteMessages(withSeconds(45), draft, [f]).messages[0].content).toContain("[구조 — 수미상관]");
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js -t "buildScriptRewriteMessages — 수미상관"`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

`buildScriptRewriteMessages` 의 `return` 바로 앞(현재 425행 앞, `[아직 안 쓴 사실]` 을 붙이는 `if` 다음)에 넣는다.

```js
  // 구조는 지적 사유와 무관하게 지켜야 한다 — 특히 '분량 초과' 로 줄일 때 닫는 문장이 먼저 잘린다
  if (wantsBookend(project)) content += bookendBlock("rewrite");
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat(script): 되돌리기가 수미상관을 스스로 부수지 않게 한다"
```

---

### Task 4: 교정 지문에 붙인다

**Files:**
- Modify: `lib/script.js` (`buildScriptEditMessages`, 현재 152~162행)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `wantsBookend(project)`, `bookendBlock("edit")` (Task 1)
- Produces: 없음 — 반환 모양 그대로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("buildScriptEditMessages — 수미상관", () => {
  const withSeconds = (s) => ({ ...project, settings: { ...project.settings, target_seconds: s } });
  const draft = { text: "3,000원짜리 앰플이 하루 만에 품절됐습니다. 그 3,000원짜리는 오늘도 오후면 없습니다." };

  it("30초면 지우지 말라는 말이 실린다", () => {
    const c = buildScriptEditMessages(withSeconds(30), draft).messages[0].content;
    expect(c).toContain("군더더기가 아니다");
  });

  it("15초면 한 자도 안 들어간다", () => {
    const c = buildScriptEditMessages(withSeconds(15), draft).messages[0].content;
    expect(c).not.toContain("수미상관");
  });

  it("EDIT_SYSTEM 상수에는 들어가지 않는다", () => {
    expect(buildScriptEditMessages(withSeconds(30), draft).system).not.toContain("수미상관");
  });

  it("[분량] 은 그대로 남는다", () => {
    const c = buildScriptEditMessages(withSeconds(30), draft).messages[0].content;
    expect(c).toContain("[분량]");
    expect(c).toContain("[다듬을 원고]");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/script.test.js -t "buildScriptEditMessages — 수미상관"`
Expected: FAIL

- [ ] **Step 3: 최소 구현**

`buildScriptEditMessages` 를 통째로 바꾼다. 지금은 템플릿을 `return` 안에 바로 쓰고 있어 조건부로 덧붙일 자리가 없다 — 변수로 뺀다.

```js
export function buildScriptEditMessages(project, draft) {
  const target = targetChars(project);
  const now = (draft.text || "").replace(/\s/g, "").length;
  let content = `[다듬을 원고]\n${draft.text}\n\n[분량] 지금 공백 빼고 ${now}자, 목표 ${target}자. 이 범위를 벗어나지 않는다.`;
  // 되짚는 문장은 새 사실이 없어 군더더기로 보인다 — 걷어내지 말라고 못 박는다
  if (wantsBookend(project)) content += bookendBlock("edit");
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content }] };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/script.test.js`
Expected: PASS

- [ ] **Step 5: 전체 회귀를 돌린다**

Run: `npx vitest run`
Expected: 이 작업 전과 같은 수의 실패(0개). 새 테스트만큼 통과 수가 는다.

- [ ] **Step 6: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat(script): 교정이 되짚는 문장을 군더더기로 지우지 않게 한다"
```

---

## 라이브 검증 (유료 · 별도 승인 · 이 계획 밖)

지문이 조립되는 것까지가 0원으로 닫히는 범위다. **수미상관이 실제로 나오는지**는 대본을 한 번
생성해야 안다(Claude 호출, 수십 원 수준 — ②대본까지만 가면 이미지·영상 값은 안 나간다).

볼 것:
- 30초 편에서 마지막 문장이 첫 문장으로 돌아오는가
- **구조를 낭독하지 않는가** — 이번 지문이 막으려는 바로 그것
- 되풀이 결함으로 오판돼 되돌리기가 그 문장을 지우지 않는가 (`[대본 …] 결함` 로그 줄로 확인)
- 15초 편이 예전과 같은가
