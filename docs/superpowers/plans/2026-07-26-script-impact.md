# 대본 임팩트 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기획 `point`를 임팩트 의도로 살리고, 초안이 그걸 전사(transcribe) 말고 실현(realize)하게 하며, 어조를 숏폼답게 풀고, 교정이 그 임팩트를 못 깎게 가드를 완화한다.

**Architecture:** 전부 `lib/script.js`의 프롬프트 상수(PLAN_SYSTEM·SYSTEM·EDIT_SYSTEM)와 `editKeptContent` 한 함수만 바꾼다. route 로직·저장 스키마·기획 JSON 스키마는 불변. 실제 품질은 구현 뒤 `node .superpowers/sdd/live-verify.mjs`로 라이브 재검증한다.

**Tech Stack:** Next.js 15 App Router, JavaScript(ESM), gpt-4o(`lib/llm.js`), Vitest.

## Global Constraints

- 새 사실 금지: 기획·초안·교정 어디서도 자료·브리핑에 없는 사실을 지어내지 않는다("자료가 함의하는 데까지만").
- 거짓·과장 금지는 유지. 어조를 살린다는 건 훅·리듬·구체성이지 상투어 부활이 아니다.
- 광고 필러어 금지 목록은 세 프롬프트 모두에서 유지: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 기획 JSON 스키마 `{angle, beats:[{role, facts, point}]}` 불변 — `point`에 무엇을 담으라 지시하느냐만 바뀐다. `validatePlan`은 손대지 않는다.
- `project.script` 저장 스키마 불변. route 로직·화면·게이트 불변.
- 테스트 실행: 파일 단위 `npx vitest run tests/script.test.js`, 전체 `npm test`.
- ⚠️ 이 개편은 기존 테스트 2건을 **의도적으로 뒤집는다**: script.test.js의 "담담한 목소리를 지시한다"의 톤 단언(담담→숏폼 어조)과 "coverage가 줄면 거부한다"(거부→채택). 해당 태스크에서 교체한다.

## 파일 구조

- `lib/script.js` — PLAN_SYSTEM(Task 1), SYSTEM + 주입 라벨(Task 2), EDIT_SYSTEM(Task 3), editKeptContent(Task 4). 네 부분은 서로 독립.
- `tests/script.test.js` — 각 태스크가 대응 단언을 추가/수정/삭제.

---

### Task 1: 기획 point를 임팩트 의도로 (설계 A)

**Files:**
- Modify: `lib/script.js` (PLAN_SYSTEM, 현재 66-75행)
- Test: `tests/script.test.js` (describe "buildPlanMessages")

**Interfaces:**
- Produces: `PLAN_SYSTEM` 상수 문구 변경. `buildPlanMessages`/스키마 시그니처 불변.

- [ ] **Step 1: 실패 테스트 작성** — `tests/script.test.js`의 `describe("buildPlanMessages", ...)` 안에 추가

```js
  it("point를 연출 의도로 지시하고 기법 서술을 금지한다", () => {
    const { system } = buildPlanMessages(project);
    expect(system).toContain("연출 의도");
    expect(system).toContain("강조한다");   // 금지 예로 이름을 올려 못 쓰게 한다
    expect(system).toContain("스크롤");     // 여는말 = 스크롤 멈출 한 방
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "연출 의도"`
Expected: FAIL — PLAN_SYSTEM에 "연출 의도"·"스크롤"이 아직 없음

- [ ] **Step 3: 구현** — `lib/script.js`의 `PLAN_SYSTEM`을 아래 전체로 교체

```js
const PLAN_SYSTEM = `너는 짧은 영상의 대본을 쓰기 전에 자료를 분석해 설계도를 짜는 기획자다.
문장을 쓰지 않는다 — 어떤 사실을 어떤 순서로 배치하고, 각 비트가 시청자에게 어떤 임팩트를 줄지만 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","beats":[{"role":"문단 역할","facts":["쓸 자료 사실"],"point":"이 비트가 시청자에게 줄 임팩트를 구체적으로"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- beats는 3~8개. 각 beat의 role은 그 문단이 하는 일(여는말·상황·본문·희소성·마무리 등). 여는말 beat의 point는 스크롤을 멈추게 할 가장 센 한 방으로 잡는다.
- point는 연출 의도다. '강조한다·유도한다·차별화·소개한다' 같은 기법 서술이나 광고 형용사('특별한'·'완벽한'…)로 쓰지 않는다. 실제로 칠 사실·훅·장면으로 적는다.
  ✗ "희소성을 강조한다" / "방문을 유도한다"
  ✓ "오전 11시 지나면 그날 치는 끝" / "성수역 3번 출구 2분, 지금 갈 수 있다"
- point의 임팩트도 자료가 함의하는 데까지만. 자료에 없는 새 주장을 지어내지 않는다.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 beat를 만들지 않는다.`;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS — 신규 1개 + 기존 buildPlanMessages 테스트("문장을 쓰지 않는다"·"지어내지 않는다"·angle·beats·원천) 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 기획 point를 임팩트 의도로 — 기법 서술·광고어 원천 차단"
```

---

### Task 2: 초안 — 전사 말고 실현 + 숏폼 어조 (설계 B)

**Files:**
- Modify: `lib/script.js` (SYSTEM 2-18행, buildScriptMessages의 beats 주입 라벨 52행)
- Test: `tests/script.test.js` (describe "buildScriptMessages")

**Interfaces:**
- Produces: `SYSTEM` 문구 변경 + 주입 블록 라벨 "전개:" → "연출 의도:". `buildScriptMessages(project, instruction, plan)` 시그니처·분기 불변.

- [ ] **Step 1: 테스트 수정·추가** — `tests/script.test.js`

(1) 기존 "담담한 목소리를 지시하고 상투어를 금지한다" 테스트(현재 58-64행)의 **톤 단언을 교체**한다. `expect(system).toMatch(/담담|평서문/);` 한 줄을 아래로 바꾸고, it 제목도 바꾼다:
```js
  it("숏폼 어조(짧고 힘있게·훅)를 지시하고 상투어를 금지한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toMatch(/짧고 힘있게|훅|리듬/);
    expect(system).toContain("특별한");     // 금지 목록에 이름을 올려 못 쓰게 한다
    expect(system).toContain("만나보세요");
    expect(system).toContain("쓰지 않는다"); // 금지 지시문
  });
```
(2) 기존 "대조 예시를 톤 참고용으로만 제시한다" 테스트(현재 66-68행)의 **예시 단언을 교체**한다:
```js
  it("대조 예시를 톤 참고용으로만 제시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("베끼지 말 것");
    expect(system).toContain("지나면 없습니다"); // 짧고 센 예
  });
```
(3) `describe("buildScriptMessages", ...)` 안에 **신규 테스트 2개 추가**:
```js
  it("기획 point를 전사 말고 실현하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("실현");
    expect(system).toContain("강조");  // '강조·유도…' 연출 단어를 나레이션에 넣지 말라
    expect(system).toContain("옮기지 마"); // point 표현을 문장에 옮기지 마라
  });
  it("첫 문단을 스크롤 멈출 한 방으로 열라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("스크롤");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "실현"`
Expected: FAIL — SYSTEM에 "실현"·전사금지 지시가 아직 없음. (톤·예시 교체 테스트도 이 시점엔 실패)

- [ ] **Step 3: 구현** — `lib/script.js`

(1) `SYSTEM` 상수를 아래 전체로 교체:
```js
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료와 [기획] 설계를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 훅과 리듬을 살린다. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- [기획]이 주어지면 그 앵글과 beats 순서를 따른다. 각 beat의 role을 문단 tag로 쓴다.
- 기획의 point는 너에게 주는 연출 지시다. 그 표현을 문장에 옮기지 마라. 그 의도를 실제 대사로 실현한다. '강조·유도·차별화·소개·훅·긴장' 같은 연출·기법 단어는 나레이션에 절대 넣지 않는다.
- 사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 이어 전개한다("직접 삶습니다"에서 그치지 말고 "그래서 단맛이 다릅니다"까지). 단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 분량은 자료가 정한다 — 담긴 내용을 빠짐없이 (3~8문단). 군살(클리셰·광고 필러)은 빼되, 사실을 인과·의미로 전개하는 것은 군살이 아니다.
- 첫 문단은 자료의 성격에 맞되, 스크롤을 멈추게 할 가장 센 한 방으로 연다 — 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예(기법 전사): "한정된 수량으로 희소성을 강조합니다."
✓ 짧고 센 예: "오전 11시부터, 하루 40잔. 지나면 없습니다."`;
```
(2) `buildScriptMessages`의 beats 주입 라벨을 바꾼다 — 현재 52행 `/ 전개: ${b.point}` 를 `/ 연출 의도: ${b.point}` 로:
```js
    const beats = plan.beats
      .map((b, i) => `${i + 1}. (${b.role}) 사실: ${(b.facts || []).join(", ") || "(원문에서 고르기)"} / 연출 의도: ${b.point}`)
      .join("\n");
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS — 신규 2 + 교체 2 + 기존(자료 포함·성격 중립·나열 금지 전개·기획 주입·폴백) 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 초안 전사 금지 + 숏폼 어조 — point는 실현, 첫 문단은 훅"
```

---

### Task 3: 교정 — 평평하게 말고 날카롭게 (설계 C-1)

**Files:**
- Modify: `lib/script.js` (EDIT_SYSTEM 82-90행)
- Test: `tests/script.test.js` (describe "buildScriptEditMessages")

**Interfaces:**
- Produces: `EDIT_SYSTEM` 문구 변경. `buildScriptEditMessages(draft)` 시그니처 불변.

- [ ] **Step 1: 실패 테스트 작성** — `tests/script.test.js`의 `describe("buildScriptEditMessages", ...)`에 추가

```js
  it("평탄화 말고 날카롭게·임팩트 보존을 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toMatch(/날카롭|임팩트|평탄/);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "평탄화"`
Expected: FAIL — EDIT_SYSTEM에 날카롭게·임팩트 보존 지시가 아직 없음

- [ ] **Step 3: 구현** — `lib/script.js`의 `EDIT_SYSTEM`을 아래 전체로 교체

```js
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본을 숏폼답게 날카롭게 다듬는다 — 광고 티·상투어·무른 명령형·기법 서술을 걷어낸다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["반영한 포인트"]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 인과 사슬을 단문으로 뭉개지 않는다. 사실 간 연결("그래서 …")과 문단의 전개를 그대로 살린다. 분량을 줄이지 않는다.
- 임팩트를 깎지 않는다. 평탄하게 되쓰지 마라 — 여는말이 무디면 더 세게 punch-up 한다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 사실 진술로 바꾼다. '강조·유도·차별화' 같은 기법 서술이 있으면 실제 사실로 되살린다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 문단 수와 구조, tag는 대본 그대로 유지한다. 군더더기·기법 서술 제거 외에 내용을 바꾸지 않는다.
- coverage는 대본의 것을 유지한다.`;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS — 신규 1 + 기존 edit 테스트("빠뜨리지 않는다"·"만나보세요"·"더하지 않는다"·"paragraphs"·"뭉개지 않는다"·"줄이지 않는다") 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 교정을 숏폼답게 날카롭게 — 임팩트 보존·평탄화 금지"
```

---

### Task 4: editKeptContent — coverage 개수 검사 제거 (설계 C-2)

**Files:**
- Modify: `lib/script.js` (editKeptContent 101-110행)
- Test: `tests/script.test.js` (describe "editKeptContent")

**Interfaces:**
- Produces: `editKeptContent(draft, edited) -> boolean` — 판정이 (null / 문단 감소 / 글자 80% 미만) 셋으로 축소. coverage 개수 검사 삭제.

- [ ] **Step 1: 테스트 뒤집기** — `tests/script.test.js`의 `describe("editKeptContent", ...)`

기존 "coverage가 줄면 거부한다" 테스트(현재 151-154행)를 **삭제하고** 아래로 교체한다(같은 edited 객체, 이제 채택 기대):
```js
  it("coverage가 줄어도 문단·글자바닥을 지키면 채택한다", () => {
    const edited = { paragraphs: [{ tag: "여는말", text: "고친1" }, { tag: "본문", text: "고친2" }], coverage: ["포인트1"] };
    expect(editKeptContent(draft, edited)).toBe(true);
  });
```
나머지 테스트(문단 다 지키면 채택 / 문단 줄면 거부 / null 거부 / 글자 80% 미만 거부 / 80% 이상 통과)는 그대로 둔다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "coverage가 줄어도"`
Expected: FAIL — 현재 구현은 coverage 감소 시 false를 반환해 새 기대(true)와 어긋남

- [ ] **Step 3: 구현** — `lib/script.js`의 `editKeptContent`를 아래로 교체(주석 포함)

```js
// 교정본이 초안의 내용을 지켰는가 — 문단 수가 줄거나 글자 수(공백 제외)가 초안의 80% 미만이면
// 전개가 뭉개진 것으로 보고 초안으로 폴백한다. coverage 개수는 보지 않는다: 교정이 coverage를
// 정당하게 재도출하므로 개수 감소를 사실 유실로 볼 수 없다(라이브가 정상 교정을 3/4 폐기해 반증).
export function editKeptContent(draft, edited) {
  if (!edited) return false;
  if (edited.paragraphs.length < draft.paragraphs.length) return false;
  const chars = (s) => s.paragraphs.map((p) => (p.text || "").replace(/\s/g, "").length).reduce((a, b) => a + b, 0);
  if (chars(edited) < chars(draft) * 0.8) return false;
  return true;
}
```

- [ ] **Step 4: 전체 회귀 + 커밋**

Run: `npm test`
Expected: 전체 그린(9 파일). editKeptContent 6케이스 포함, routes.test.js의 "교정본이 문단을 흘리면 초안 폴백"은 문단 수 감소로 여전히 폴백(coverage 아님)해 그린.
그 후:
```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: editKeptContent coverage 개수 검사 제거 — 정상 교정 폐기 방지"
```

---

## 라이브 재검증 (구현 후, 별도)

`node .superpowers/sdd/live-verify.mjs`(기존 하네스 재사용)로 같은 4개 자료(빵집·딸기라떼·라떼아트·필라테스)를 다시 태워 확인한다:

- (a) 기법 서술("강조합니다/유도합니다/차별화됩니다")이 나레이션에서 사라졌는가.
- (b) 금지 필러어 0 유지 — 특히 빵집 "특별한" 재발 없음.
- (c) 교정본이 대부분 채택되는가(coverage 폐기 해소 — 개편 전 4건 중 3건 폐기였음).
- (d) 어조가 짧고 세게 착지하는가(임팩트), 그러면서 거짓·과장·새 사실이 없는가.
- (e) 전개용 질문·앙상함 해소는 유지되는가(회귀 없음).

수치 목표가 아니라 개편 전 출력과의 대비로 판정한다. (d)에서 상투어가 재발하면 어조 완화를 되짚고, (b)에서 필러어가 새면 초안·기획 프롬프트를 다시 조인다.

## Self-Review 결과

- **스펙 커버리지:** 설계 A(Task 1), B(Task 2 — SYSTEM 전사금지·숏폼어조·주입 라벨), C-1(Task 3 — EDIT_SYSTEM), C-2(Task 4 — editKeptContent). 라이브 재검증 절 포함. route 불변이라 route 태스크 없음.
- **플레이스홀더:** 없음 — 모든 프롬프트 전체 문구·테스트·명령·기대출력 명시.
- **의도적 테스트 반전 2건 명시:** 톤 단언(Task 2), coverage 거부→채택(Task 4). 각 태스크 Step에서 교체.
- **타입 일관성:** 스키마·시그니처 전부 불변(`buildPlanMessages`/`buildScriptMessages`/`buildScriptEditMessages`/`editKeptContent`/`validatePlan`). 프롬프트 문자열과 가드 한 줄만 변경.
