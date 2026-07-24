# 대본 기획(분석) 단계 신설 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대본 생성 전에 자료를 분석해 앵글+비트시트(내부 밑그림)를 짜는 기획 단계를 넣어, 사실 나열이 아니라 인과·의미로 전개된 대본이 나오게 한다.

**Architecture:** 대본 route가 초안 전에 `기획` LLM 콜을 한 번 더 한다. 기획 결과(앵글·beats)를 초안 프롬프트에 실어 전개를 미리 정하고, 초안은 목소리만 입히고, 교정은 분량 가드로 못 깎게 막는다. 기획은 저장하지 않는 내부 밑그림이고, 실패하면 초안이 기존 경로로 폴백한다. 브리핑은 자료가 얕을 때 전개용 질문으로 재료를 더 캔다.

**Tech Stack:** Next.js 15 App Router, JavaScript(ESM), gpt-4o(`lib/llm.js` `callJson`, JSON 모드), Vitest.

## Global Constraints

- 새 사실 금지: 기획·초안·교정 어디서도 자료·브리핑에 없는 사실을 지어내지 않는다. 전개는 "자료가 함의하는 데까지만".
- 저장 스키마 불변: `project.script`는 `{paragraphs, coverage, version, briefing_version}` 그대로. 기획 결과는 저장하지 않는다(transient).
- 화면·라우트·게이트 신설 없음. 기획은 대본 route 내부 콜.
- 폴백 우선: 기획 실패는 502가 아니라 `plan=null`로 흡수. 대본이 아예 안 나오는 것보다 초안이라도 낫다.
- 브리핑 마찰 상한: 질문은 여전히 최대 3개(`validateBriefing` 캡 유지). 자료가 풍부하면 빈 배열이 정답.
- 브리핑 SYSTEM에 "훅"·"홍보" 문자열을 넣지 않는다(기존 테스트 `tests/briefing.test.js`가 부재를 단언).
- 테스트 실행: 파일 단위 `npx vitest run <path>`, 전체 `npm test`.

## 파일 구조

- `lib/validate.js` — `validatePlan(obj)` 추가(기획 응답 스키마 방어).
- `lib/script.js` — `PLAN_SYSTEM`+`buildPlanMessages()` 추가, `sourceBlock()` 헬퍼 추출(DRY), `buildScriptMessages()`에 `plan` 인자·SYSTEM 재조정, `EDIT_SYSTEM` 재조정, `editKeptContent()` 분량 바닥.
- `app/api/projects/[id]/script/route.js` — 초안 전 기획 콜 배선.
- `lib/briefing.js` — SYSTEM에 전개용 질문 부류 추가.
- `tests/validate.test.js` · `tests/script.test.js` · `tests/routes.test.js` · `tests/briefing.test.js` — 각 변경에 대응.

---

### Task 1: `validatePlan` — 기획 응답 스키마 방어

**Files:**
- Modify: `lib/validate.js`
- Test: `tests/validate.test.js`

**Interfaces:**
- Produces: `validatePlan(obj) -> {angle: string, beats: Array<{role: string, point: string, facts: string[]}>} | null`

- [ ] **Step 1: 실패 테스트 작성** — `tests/validate.test.js` 상단 import에 `validatePlan` 추가하고 파일 끝에 describe 블록 추가

`tests/validate.test.js`의 첫 줄을 다음으로 교체:
```js
import { validateScript, validateCuts, validateBriefing, validatePlan } from "../lib/validate.js";
```
파일 끝에 추가:
```js
describe("validatePlan", () => {
  const ok = {
    angle: "시럽을 쓰지 않는다",
    beats: [
      { role: "여는말", facts: ["시럽 안 씀"], point: "그래서 그날 단맛이 다르다" },
      { role: "희소성", facts: ["하루 40잔"], point: "적게 만들어 금방 떨어진다" },
    ],
  };
  it("정상 스키마를 통과시키고 다듬는다", () => {
    const r = validatePlan(ok);
    expect(r.angle).toBe("시럽을 쓰지 않는다");
    expect(r.beats).toHaveLength(2);
    expect(r.beats[0]).toEqual({ role: "여는말", facts: ["시럽 안 씀"], point: "그래서 그날 단맛이 다르다" });
  });
  it("angle이 비면 null", () => {
    expect(validatePlan({ ...ok, angle: "" })).toBeNull();
    expect(validatePlan({ ...ok, angle: undefined })).toBeNull();
  });
  it("beats가 비었거나 배열이 아니면 null", () => {
    expect(validatePlan({ ...ok, beats: [] })).toBeNull();
    expect(validatePlan({ ...ok, beats: "x" })).toBeNull();
  });
  it("beat에 role이나 point가 없으면 null", () => {
    expect(validatePlan({ angle: "a", beats: [{ role: "여는말", point: "" }] })).toBeNull();
    expect(validatePlan({ angle: "a", beats: [{ point: "전개" }] })).toBeNull();
  });
  it("facts가 없거나 배열이 아니면 빈 배열로 채운다", () => {
    const r = validatePlan({ angle: "a", beats: [{ role: "본문", point: "전개" }] });
    expect(r.beats[0].facts).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `validatePlan is not a function` (또는 import 오류)

- [ ] **Step 3: 최소 구현** — `lib/validate.js` 끝에 추가

```js
// 기획 응답 방어 — 앵글·비트 구조만 본다(전개 내용의 품질은 판정하지 않는다).
export function validatePlan(obj) {
  if (!obj || typeof obj.angle !== "string" || !obj.angle.trim()) return null;
  if (!Array.isArray(obj.beats) || obj.beats.length === 0) return null;
  const beats = [];
  for (const b of obj.beats) {
    if (typeof b?.role !== "string" || !b.role.trim()) return null;
    if (typeof b?.point !== "string" || !b.point.trim()) return null;
    const facts = Array.isArray(b.facts)
      ? b.facts.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim())
      : [];
    beats.push({ role: b.role.trim(), point: b.point.trim(), facts });
  }
  return { angle: obj.angle.trim(), beats };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS (validatePlan 5개 포함)

- [ ] **Step 5: 커밋**

```bash
git add lib/validate.js tests/validate.test.js
git commit -m "feat: 기획 응답 스키마 방어 validatePlan"
```

---

### Task 2: `buildPlanMessages` + `sourceBlock` 헬퍼 추출

**Files:**
- Modify: `lib/script.js`
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `project` 객체(`material.text`, `material.photos[]{filename}`, `briefing{topic,key_points,audience,takeaway,asked}`).
- Produces: `buildPlanMessages(project) -> {system, messages:[{role:"user", content}]}`; 내부 헬퍼 `sourceBlock(project) -> string`.

- [ ] **Step 1: 실패 테스트 작성** — `tests/script.test.js` import에 `buildPlanMessages` 추가하고 describe 추가

첫 import 줄을 교체:
```js
import { buildScriptMessages, buildScriptEditMessages, buildPlanMessages, editKeptContent, estimateSeconds } from "../lib/script.js";
```
파일 끝에 추가:
```js
describe("buildPlanMessages", () => {
  it("브리핑과 원문·사진을 담아 기획을 요청한다", () => {
    const { system, messages } = buildPlanMessages(project);
    expect(system).toContain("기획");
    expect(system).toContain("angle");
    expect(system).toContain("beats");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼 신메뉴");                 // 브리핑 주제
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서."); // 원문
    expect(user).toContain("라떼.jpg");
  });
  it("문장이 아니라 설계도를 요구한다 — 새 사실 금지를 지시한다", () => {
    const { system } = buildPlanMessages(project);
    expect(system).toContain("문장을 쓰지 않는다");
    expect(system).toContain("지어내지 않는다");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — `buildPlanMessages is not a function`

- [ ] **Step 3: 헬퍼 추출 + 구현** — `lib/script.js`

먼저 `buildScriptMessages` 안의 user 조립(현재 20~42행: `photoList` 선언부터 `[업로드된 사진]` 블록까지)을 `sourceBlock`으로 추출한다. `SYSTEM` 선언 아래(현행 17행 근처)에 헬퍼를 추가:
```js
// 브리핑 + 자료 원문 + 사진을 하나의 지문으로 — 기획·초안이 같은 원천을 본다(DRY).
function sourceBlock(project) {
  const { material, briefing } = project;
  const photoList = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = "";
  if (briefing) {
    const points = briefing.key_points.map((k) => `- ${k}`).join("\n");
    const answered = (briefing.asked || [])
      .filter((a) => a.answer)
      .map((a) => `- ${a.question} → ${a.answer}`)
      .join("\n");
    user += `[정리된 브리핑]
주제: ${briefing.topic}
핵심 내용:
${points}
보는 사람: ${briefing.audience || "(밝히지 않음)"}
보고 나면: ${briefing.takeaway || "(밝히지 않음)"}${answered ? `\n추가로 확인한 것:\n${answered}` : ""}

`;
  }
  user += `[자료 원문]
${material.text}
[업로드된 사진]
${photoList}`;
  return user;
}
```
그리고 `buildScriptMessages`를 헬퍼를 쓰도록 바꾼다(동작 동일 — 기존 테스트 유지):
```js
export function buildScriptMessages(project, instruction) {
  const { script } = project;
  let user = sourceBlock(project);
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
```
`buildScriptEditMessages` 위에 `PLAN_SYSTEM`+`buildPlanMessages`를 추가:
```js
// 기획(분석) — 대본을 쓰기 전에 앵글과 문단 구조를 정한다. 저장하지 않는 내부 밑그림.
const PLAN_SYSTEM = `너는 짧은 영상의 대본을 쓰기 전에 자료를 분석해 설계도를 짜는 기획자다.
문장을 쓰지 않는다 — 어떤 사실을 어떤 순서로, 어떤 인과·의미로 풀지만 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","beats":[{"role":"문단 역할","facts":["쓸 자료 사실"],"point":"그 사실을 어떤 인과·상황·의미로 풀지 한 문장"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- beats는 3~8개. 각 beat의 role은 그 문단이 하는 일(여는말·상황·본문·희소성·마무리 등, 자료에 맞는 다른 이름도 가능).
- point는 그 사실이 스스로 함의하는 데까지만 전개한다. 자료에 없는 새 주장을 지어내지 않는다.
  예: "시럽 안 씀 → 그날 딸기에 따라 단맛이 다름"은 자료가 함의하므로 좋다. "시럽 안 씀 → 건강에 좋음"은 새 주장이라 금지.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 beat를 만들지 않는다.
- 담담한 문체·금지어는 이 단계에서 신경 쓰지 않는다. 그건 대본 작가가 한다.`;

export function buildPlanMessages(project) {
  return { system: PLAN_SYSTEM, messages: [{ role: "user", content: sourceBlock(project) }] };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS (기존 buildScriptMessages 테스트 포함 전부 그린 — 헬퍼 추출은 동작 보존)

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 대본 기획 단계 buildPlanMessages + sourceBlock 추출"
```

---

### Task 3: 초안이 기획을 받아 전개하도록 — `buildScriptMessages(plan)` + SYSTEM 재조정

**Files:**
- Modify: `lib/script.js`
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `validatePlan`의 출력 형태 `{angle, beats:[{role, point, facts}]}` 또는 `null`.
- Produces: `buildScriptMessages(project, instruction, plan) -> {system, messages}` — `plan`이 있으면 앵글·beats를 프롬프트에 싣고, 없으면 기존과 동일.

- [ ] **Step 1: 실패 테스트 작성** — `tests/script.test.js`의 `describe("buildScriptMessages", ...)` 안에 추가

```js
  it("기획(plan)이 주어지면 앵글과 beats를 프롬프트에 싣는다", () => {
    const plan = { angle: "시럽을 안 쓴다", beats: [{ role: "여는말", facts: ["시럽 안 씀"], point: "그래서 단맛이 다르다" }] };
    const user = buildScriptMessages(project, undefined, plan).messages[0].content;
    expect(user).toContain("시럽을 안 쓴다");        // 앵글
    expect(user).toContain("그래서 단맛이 다르다");   // beat.point
  });
  it("기획이 없으면 오늘 형태 그대로 조립된다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).not.toContain("[기획");
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서.");
  });
  it("사실을 나열하지 말고 전개하라고 지시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("나열");
    expect(system).toContain("전개");
    expect(system).toContain("그래서 단맛이 다릅니다"); // 전개 예시(인과)
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "전개"`
Expected: FAIL — 프롬프트에 "나열"/"전개"·기획 블록이 아직 없음

- [ ] **Step 3: 구현** — `lib/script.js`

`SYSTEM` 상수를 아래 전체로 교체:
```js
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료와 [기획] 설계를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
목소리는 담담하게, 사실 위주로. 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- [기획]이 주어지면 그 앵글과 beats 순서를 따른다. 각 beat의 role을 문단 tag로, point의 전개를 문장으로 살린다.
- 사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 이어 전개한다("직접 삶습니다"에서 그치지 말고 "그래서 단맛이 다릅니다"까지). 단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 분량은 자료가 정한다 — 담긴 내용을 빠짐없이 (3~8문단). 군살(클리셰·광고 필러)은 빼되, 사실을 인과·의미로 전개하는 것은 군살이 아니다.
- 평서문 위주로 사실을 단언한다("시럽은 쓰지 않습니다"). "~해보세요"류 권유를 남발하지 않는다.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 첫 문단은 자료의 성격에 맞게 연다 — 단, 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예: "성수동에서 특별한 딸기라떼를 만나보세요. 신선함을 자랑합니다."
✓ 담담한 예: "카페 미영은 딸기라떼에 시럽을 쓰지 않습니다. 매일 아침 논산 설향 딸기를 직접 갈아요. 그래서 그날 딸기에 따라 단맛이 조금씩 다릅니다."`;
```
`buildScriptMessages`에 `plan` 인자와 기획 블록을 추가:
```js
export function buildScriptMessages(project, instruction, plan) {
  const { script } = project;
  let user = sourceBlock(project);
  if (plan) {
    const beats = plan.beats
      .map((b, i) => `${i + 1}. (${b.role}) 사실: ${(b.facts || []).join(", ") || "(원문에서 고르기)"} / 전개: ${b.point}`)
      .join("\n");
    user += `\n\n[기획 — 이 설계대로 쓴다]
앵글: ${plan.angle}
${beats}`;
  }
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS — 신규 3개 + 기존 buildScriptMessages 테스트 전부 그린(담담·성격·금지어·수정지시 유지)

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 초안이 기획을 받아 사실을 전개하도록 — 나열 금지·브레비티 재정의"
```

---

### Task 4: 교정 재조정 + `editKeptContent` 분량 바닥

**Files:**
- Modify: `lib/script.js`
- Test: `tests/script.test.js`

**Interfaces:**
- Produces: `editKeptContent(draft, edited) -> boolean` — 문단·coverage 개수에 더해 글자 수(공백 제외)가 초안의 80% 미만이면 false.

- [ ] **Step 1: 실패 테스트 작성** — `tests/script.test.js`의 `describe("editKeptContent", ...)`에 추가하고, `describe("buildScriptEditMessages", ...)`에도 한 줄 추가

`editKeptContent` describe에 추가:
```js
  it("글자 수가 초안의 80% 미만으로 줄면 거부한다(전개 뭉갬)", () => {
    const longDraft = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(50) }, { tag: "본문", text: "나".repeat(50) }],
      coverage: ["포인트1", "포인트2"],
    };
    const gutted = { // 문단·coverage는 지켰지만 글자 수 20 → 100의 20%
      paragraphs: [{ tag: "여는말", text: "가".repeat(10) }, { tag: "본문", text: "나".repeat(10) }],
      coverage: ["포인트1", "포인트2"],
    };
    expect(editKeptContent(longDraft, gutted)).toBe(false);
  });
  it("클리셰 제거 수준(80% 이상 유지)은 통과시킨다", () => {
    const longDraft = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(50) }, { tag: "본문", text: "나".repeat(50) }],
      coverage: ["포인트1"],
    };
    const trimmed = {
      paragraphs: [{ tag: "여는말", text: "가".repeat(45) }, { tag: "본문", text: "나".repeat(45) }],
      coverage: ["포인트1"],
    };
    expect(editKeptContent(longDraft, trimmed)).toBe(true);
  });
```
`buildScriptEditMessages` describe에 추가:
```js
  it("인과 전개를 뭉개지 말라고 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("뭉개지 않는다");
    expect(system).toContain("줄이지 않는다");
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/script.test.js -t "editKeptContent"`
Expected: FAIL — "80% 미만" 케이스가 현재는 true를 반환(글자 수 미검사)

- [ ] **Step 3: 구현** — `lib/script.js`

`EDIT_SYSTEM` 상수를 아래로 교체:
```js
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본에서 광고 티·상투어·무른 명령형을 걷어내고 담담한 평서문으로 다시 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["반영한 포인트"]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 인과 사슬을 단문으로 뭉개지 않는다. 사실 간 연결("그래서 …")과 문단의 전개를 그대로 살린다. 분량을 줄이지 않는다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 평서문으로 바꾼다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 문단 수와 구조, tag는 대본 그대로 유지한다. 클리셰 제거 외에 내용을 바꾸지 않는다.
- coverage는 대본의 것을 유지한다.`;
```
`editKeptContent`를 분량 바닥 포함으로 교체:
```js
// 교정본이 초안의 내용을 지켰는가 — 문단·coverage 개수에 더해 글자 수(공백 제외)가
// 초안의 80% 미만이면 전개가 뭉개진 것으로 보고 초안으로 폴백한다.
export function editKeptContent(draft, edited) {
  if (!edited) return false;
  if (edited.paragraphs.length < draft.paragraphs.length) return false;
  if ((edited.coverage?.length || 0) < (draft.coverage?.length || 0)) return false;
  const chars = (s) => s.paragraphs.map((p) => (p.text || "").replace(/\s/g, "").length).reduce((a, b) => a + b, 0);
  if (chars(edited) < chars(draft) * 0.8) return false;
  return true;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/script.test.js`
Expected: PASS — 신규 3개 + 기존 editKeptContent/edit 테스트 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 교정 분량 바닥(80%) + 인과 전개 보존 지시"
```

---

### Task 5: 대본 route에 기획 콜 배선 + route 테스트 갱신

**Files:**
- Modify: `app/api/projects/[id]/script/route.js`
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: `buildPlanMessages`, `validatePlan`, 갱신된 `buildScriptMessages(project, instruction, plan)`.
- Produces: route가 `plan → draft → edit` 순으로 `callJson`을 호출. 기획 실패 시 plan=null로 초안 폴백.

- [ ] **Step 1: 실패 테스트 작성** — `tests/routes.test.js`의 `describe("POST /api/projects/[id]/script (2단 생성)", ...)` 갱신

기존 3개 테스트는 이제 콜 순서 맨 앞에 기획 응답이 하나 더 온다. describe 블록을 아래로 교체:
```js
describe("POST /api/projects/[id]/script (기획→초안→교정)", () => {
  const plan = { angle: "시럽 안 씀", beats: [{ role: "여는말", facts: ["시럽 안 씀"], point: "그래서 단맛이 다름" }] };
  const cliche = { paragraphs: [{ tag: "여는말", text: "특별한 라떼를 만나보세요" }], coverage: ["시럽 안 씀"] };
  const plain = { paragraphs: [{ tag: "여는말", text: "시럽을 쓰지 않습니다" }], coverage: ["시럽 안 씀"] };

  it("기획→초안→교정을 거쳐 교정본을 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(plan).mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("시럽을 쓰지 않습니다");
  });

  it("기획이 실패해도(plan=null) 초안·교정으로 대본을 낸다", async () => {
    const p = await projectWithScript();
    // 기획 콜이 던지면 plan=null로 흡수되고, 다음 콜부터 초안·교정이 이어진다
    llmMock.callJson
      .mockRejectedValueOnce(new Error("기획 실패"))
      .mockResolvedValueOnce(cliche)
      .mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("시럽을 쓰지 않습니다");
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(plan).mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("특별한 라떼를 만나보세요");
  });

  it("교정본이 문단을 흘리면(스키마는 맞아도) 초안으로 폴백한다", async () => {
    const p = await projectWithScript();
    const draft2 = { paragraphs: [{ tag: "여는말", text: "특별한 라떼" }, { tag: "가격", text: "6500원입니다" }], coverage: ["가격", "위치"] };
    const shortEdit = { paragraphs: [{ tag: "여는말", text: "라떼입니다" }], coverage: ["가격"] };
    llmMock.callJson.mockResolvedValueOnce(plan).mockResolvedValueOnce(draft2).mockResolvedValueOnce(shortEdit);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs).toHaveLength(2);
    expect(saved.paragraphs[1].text).toBe("6500원입니다");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/routes.test.js -t "기획"`
Expected: FAIL — route가 아직 기획 콜을 하지 않아 콜 순서가 어긋남(초안이 plan 객체를 받아 스키마 불일치)

- [ ] **Step 3: 구현** — `app/api/projects/[id]/script/route.js` 전체 교체

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript, validatePlan } from "../../../../../lib/validate";
import { buildScriptMessages, buildScriptEditMessages, buildPlanMessages, editKeptContent } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));

  // 0단 기획 — 앵글·비트시트(내부 밑그림). 실패해도 던지지 않는다. plan=null이면 초안이 폴백 경로를 탄다.
  let plan = null;
  const planMsg = buildPlanMessages(project);
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    try {
      plan = validatePlan(await callJson({ system: planMsg.system, messages: planMsg.messages }));
    } catch {
      break;
    }
  }

  // 1단 초안 — 기획이 있으면 그 설계대로 전개한다
  const { system, messages } = buildScriptMessages(project, instruction, plan);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 사실·분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch {
      break;
    }
  }
  const script = editKeptContent(draft, edited) ? edited : draft;

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS — 기획 4개 시나리오 포함 전부 그린

- [ ] **Step 5: 커밋**

```bash
git add app/api/projects/[id]/script/route.js tests/routes.test.js
git commit -m "feat: 대본 route에 기획 콜 배선 — 실패 시 plan=null 폴백"
```

---

### Task 6: 브리핑 전개용 질문 (재료 확보)

**Files:**
- Modify: `lib/briefing.js`
- Test: `tests/briefing.test.js`

**Interfaces:**
- Produces: `buildBriefingMessages(project)`의 SYSTEM이 자료가 얕을 때 전개용 질문을 채우도록 지시(스키마·시그니처 불변).

- [ ] **Step 1: 실패 테스트 작성** — `tests/briefing.test.js`의 `describe("buildBriefingMessages", ...)`에 추가

```js
  it("자료가 얕으면 전개용 질문으로 채우라고 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("전개용");
    expect(system).toMatch(/왜 시작|반응|한 장면|남과 다른/);
  });
  it("전개용 소재는 취향과 다르다고 구분한다 — 여전히 훅·홍보는 없다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("소재");
    expect(system).not.toContain("훅");
    expect(system).not.toContain("홍보");
    expect(system).toContain("빈 배열이 정답"); // 풍부하면 여전히 빈 배열
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/briefing.test.js -t "전개용"`
Expected: FAIL — SYSTEM에 "전개용"·소재 지시가 아직 없음

- [ ] **Step 3: 구현** — `lib/briefing.js`의 `SYSTEM` 문자열 두 곳 수정

(1) 현재 규칙 목록에서 "자료가 짧아 빈칸이 많으면 남은 것을 반드시 묻는다. 반대로 자료에 이미 다 있으면 questions는 빈 배열이 정답이다 — 개수를 채우려 하지도, 있는 것을 되묻지도 않는다." 줄 **바로 다음에** 아래 두 줄을 삽입:
```
- 위 '빠진 사실' 질문으로 질문 슬롯이 남고 자료가 얕으면(3문단 분량의 대본을 전개하기에 사실·이야기가 부족하면), 남은 슬롯을 전개용 질문으로 채운다. 후보: 왜 시작했는지, 손님·이용자의 반응, 기억에 남는 구체적인 한 장면, 남과 다른 점. 이건 빠진 사실이 아니라 대본에 살을 줄 소재다.
- 자료가 이미 풍부해 대본을 전개할 재료가 충분하면 전개용 질문도 만들지 않는다. 질문은 어느 경우에도 최대 3개다.
```
(2) 기존 줄 "표현을 더 좋게 만드는 방법이나 취향은 묻지 않는다. 그건 조수가 알아서 할 몫이다." 를 아래로 교체:
```
- 표현을 더 좋게 만드는 방법이나 취향(말투를 어떻게 꾸밀지)은 묻지 않는다. 그건 조수 몫이다. 단, 위 전개용 소재(이야기·계기·반응·차이)는 취향이 아니라 대본의 재료이므로 묻는다.
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/briefing.test.js`
Expected: PASS — 신규 2개 + 기존 briefing 테스트 전부 그린(훅·홍보 부재, 3개 캡, 빈 배열이 정답 유지)

- [ ] **Step 5: 전체 회귀 + 커밋**

```bash
npm test
```
Expected: 전체 그린(기존 87 + 신규). 그 후:
```bash
git add lib/briefing.js tests/briefing.test.js
git commit -m "feat: 브리핑 전개용 질문 — 자료 얕을 때 재료 더 캐기"
```

---

## 라이브 검증 (구현 후, 별도)

단위 테스트는 배선·스키마·가드만 본다. 전개가 실제로 살아나 앙상함이 해소됐는지는 실측 자료로 확인한다:
- `.env.local`에 `OPENAI_API_KEY`가 있는 상태로 `npm run dev`.
- 빵집(144자)·딸기라떼(220자)·라떼아트(212자) 자료로 대본을 생성해 개편 전 저장본(`data/projects/*.json`)과 비교.
- 확인 항목: (a) 사실이 인과·의미로 전개되는가("직접 삶음 → 단맛 다름" 류), (b) 금지어 0 유지, (c) 새 사실이 끼지 않았는가, (d) 얕은 자료에서 전개용 질문이 뜨고 풍부한 자료에서는 빈 배열인가.
- 분량 바닥 0.8이 정상 교정을 잘못 폴백시키지 않는지 관찰. 오작동 시 열린 값(0.75 등)으로 조정.

## Self-Review 결과

- **스펙 커버리지:** 설계 A(Task 1·2·3·5), 설계 B(Task 3·4·5), 설계 C(Task 6) 전부 대응. 파이프라인 순서(기획→초안→교정)와 폴백은 Task 5 route가 구현.
- **플레이스홀더:** 없음 — 모든 코드·프롬프트·명령·기대출력 명시.
- **타입 일관성:** `validatePlan` 출력 `{angle, beats:[{role,point,facts}]}` → `buildScriptMessages(project, instruction, plan)`의 `plan.beats[].{role,point,facts}` 소비 → route가 동일 인자 순서로 호출. `buildPlanMessages(project)` 단일 인자. `editKeptContent(draft, edited)` 시그니처 불변.
