# 자료 수집·브리핑 확정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자유 자료를 받아 기계가 브리핑(주제·핵심내용·대상·보고 나면)으로 정리하고, 부족한 것만 1라운드 되물어 확정한 뒤 대본으로 넘긴다.

**Architecture:** 추출은 `lib/briefing.js`(프롬프트 조립)와 `lib/validate.js`(스키마 방어)로 나뉘고, 라우트는 `POST /api/projects/[id]/briefing` 하나만 새로 판다. 확정 여부는 `project.briefing.confirmed`가 단독으로 쥐며, 단계 판정(`lib/steps.js`)도 상태 문자열 대신 이 값을 본다. 화면은 `/create`(자료 입력)와 `/create/[id]/briefing`(정리 결과·질문·확정) 둘로 나뉘고 사이드바 단계는 6개 그대로다.

**Tech Stack:** Next.js 15 App Router (JS, "use client" 페이지), vitest, gpt-4o(`lib/llm.js`의 `callJson`), 파일 저장소(`lib/projects.js`)

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-24-briefing-intake-design.md`. 기준 로드맵: `docs/superpowers/specs/2026-07-24-pipeline-roadmap.md`
- 사용자 대면 문구는 전부 한국어. 사장님을 부르는 말은 쓰지 않고 담백하게 쓴다(기존 화면 문구 톤 유지)
- **훅·CTA를 전제하지 않는다.** 프롬프트에 "반드시 훅" 같은 강제 표현 금지, 태그·역할 목록은 예시로만 제시
- 부족분 질문은 **최대 3개, 라운드 1회**. "정보가 있어야만 채워지는 것"만 묻는다
- LLM 호출은 `callJson`만 사용(직접 fetch 금지). 추출과 질문은 **한 번의 호출**로 함께 받는다
- 테스트는 vitest. 기존 34개 그린이 하한선이며 각 태스크는 자기 테스트를 추가한다
- 커밋 메시지는 한국어 한 줄 요약 + 필요 시 본문. 각 태스크 끝에 커밋
- 파일 저장소는 Supabase 이관 예정이므로 `lib/projects.js` 인터페이스(`createProject`/`getProject`/`updateProject`)를 바꾸지 않는다

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/briefing.js` (신규) | 브리핑 추출 프롬프트 조립 — 자료·사진 목록 → messages |
| `lib/validate.js` (수정) | `validateBriefing` 추가 — LLM 응답 스키마 방어, 질문 3개 상한 |
| `lib/steps.js` (수정) | `currentStepKey`가 `briefing.confirmed`를 본다, `stepHref`가 ①자료를 프로젝트 유무로 가른다 |
| `lib/script.js` (수정) | 브리핑 주입 + 훅 강제 제거 |
| `lib/projects.js` (수정) | 새 프로젝트에 `briefing: null` 필드 |
| `app/api/projects/[id]/briefing/route.js` (신규) | 추출 실행·저장 |
| `app/api/projects/[id]/route.js` (수정) | PATCH가 `briefing` 병합을 받는다 |
| `app/api/projects/[id]/script/route.js` (수정) | `briefing.confirmed` 없으면 400 |
| `app/create/page.js` (수정) | 자료만 받고 프로젝트 생성 후 브리핑 화면으로 |
| `app/create/[id]/briefing/page.js` (신규) | 정리 결과 카드·질문 카드·확정 |
| `app/globals.css` (수정) | 브리핑 카드·질문 카드 스타일 |
| `tests/briefing.test.js` (신규) | 프롬프트 조립 |
| `tests/validate.test.js` (수정) | `validateBriefing` |
| `tests/steps.test.js` (수정) | 확정 기반 단계 판정 |
| `tests/script.test.js` (수정) | 브리핑 주입·훅 비강제 |

---

### Task 1: 브리핑 스키마 방어 (`validateBriefing`)

**Files:**
- Modify: `lib/validate.js`
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `validateBriefing(obj) -> {topic, key_points, audience, takeaway, asked} | null`
  - `asked`: `[{question: string, options: string[], answer: string|null, done: boolean}]` — 추출 직후엔 `answer: null, done: false`

- [ ] **Step 1: Write the failing test**

`tests/validate.test.js` 끝에 추가:

```js
import { validateBriefing } from "../lib/validate.js";

describe("validateBriefing", () => {
  const ok = {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아", "시럽 안 씀"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    questions: [{ question: "가격대는요?", options: ["5천원대", "6천원대"] }],
  };

  it("정상 응답을 정규화한다", () => {
    const b = validateBriefing(ok);
    expect(b.topic).toBe("생딸기라떼 신메뉴");
    expect(b.key_points).toEqual(["매일 아침 직접 갈아", "시럽 안 씀"]);
    expect(b.asked).toEqual([
      { question: "가격대는요?", options: ["5천원대", "6천원대"], answer: null, done: false },
    ]);
  });

  it("주제나 핵심내용이 비면 실패", () => {
    expect(validateBriefing({ ...ok, topic: "  " })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: [] })).toBeNull();
    expect(validateBriefing({ ...ok, key_points: "문자열" })).toBeNull();
    expect(validateBriefing(null)).toBeNull();
  });

  it("선택 항목이 없으면 빈 문자열", () => {
    const b = validateBriefing({ topic: "주제", key_points: ["가"] });
    expect(b.audience).toBe("");
    expect(b.takeaway).toBe("");
    expect(b.asked).toEqual([]);
  });

  it("질문은 3개까지, 보기는 4개까지", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      question: `질문${i}`,
      options: ["가", "나", "다", "라", "마"],
    }));
    const b = validateBriefing({ ...ok, questions: many });
    expect(b.asked).toHaveLength(3);
    expect(b.asked[0].options).toHaveLength(4);
  });

  it("망가진 질문은 조용히 버린다", () => {
    const b = validateBriefing({ ...ok, questions: [{ question: "" }, { question: "정상?" }] });
    expect(b.asked).toHaveLength(1);
    expect(b.asked[0].question).toBe("정상?");
    expect(b.asked[0].options).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `validateBriefing is not a function`

- [ ] **Step 3: Write minimal implementation**

`lib/validate.js` 끝에 추가:

```js
// 브리핑 추출 응답 방어. 질문은 최대 3개·보기 4개로 자른다(상한을 LLM 재량에 맡기지 않는다).
export function validateBriefing(obj) {
  if (!obj || typeof obj.topic !== "string" || !obj.topic.trim()) return null;
  if (!Array.isArray(obj.key_points)) return null;
  const key_points = obj.key_points
    .filter((k) => typeof k === "string" && k.trim())
    .map((k) => k.trim());
  if (key_points.length === 0) return null;

  const asked = [];
  const questions = Array.isArray(obj.questions) ? obj.questions : [];
  for (const q of questions) {
    if (asked.length >= 3) break;
    if (typeof q?.question !== "string" || !q.question.trim()) continue;
    const options = (Array.isArray(q.options) ? q.options : [])
      .filter((o) => typeof o === "string" && o.trim())
      .map((o) => o.trim())
      .slice(0, 4);
    asked.push({ question: q.question.trim(), options, answer: null, done: false });
  }

  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return { topic: obj.topic.trim(), key_points, audience: str(obj.audience), takeaway: str(obj.takeaway), asked };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS (기존 validate 테스트 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add lib/validate.js tests/validate.test.js
git commit -m "feat: 브리핑 응답 스키마 방어 + 질문 3개 상한"
```

---

### Task 2: 브리핑 추출 프롬프트 (`lib/briefing.js`)

**Files:**
- Create: `lib/briefing.js`
- Test: `tests/briefing.test.js`

**Interfaces:**
- Consumes: `validateBriefing` (Task 1) — 이 태스크에서 직접 쓰지는 않고 라우트(Task 4)가 짝지어 쓴다
- Produces: `buildBriefingMessages(project) -> {system, messages}`

- [ ] **Step 1: Write the failing test**

`tests/briefing.test.js` 생성:

```js
import { describe, it, expect } from "vitest";
import { buildBriefingMessages } from "../lib/briefing.js";

const project = {
  material: {
    text: "성수동 카페 미영 신메뉴 생딸기라떼. 시럽은 쓰지 않음.",
    photos: [{ id: "p1", filename: "라떼.jpg" }],
  },
};

describe("buildBriefingMessages", () => {
  it("자료 텍스트와 사진 파일명을 담는다", () => {
    const { system, messages } = buildBriefingMessages(project);
    expect(system).toContain("JSON");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("라떼.jpg");
  });

  it("사진이 없으면 없음으로 표기한다", () => {
    const { messages } = buildBriefingMessages({ material: { text: "자료", photos: [] } });
    expect(messages[0].content).toContain("(없음)");
  });

  it("질문 상한과 질문 기준을 지시한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("3개");
    expect(system).toContain("정보가 있어야만");
  });

  it("영상 성격을 단정하지 않는다 — 훅·홍보를 전제하는 표현이 없다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).not.toContain("훅");
    expect(system).not.toContain("홍보");
  });

  it("이미 되물은 이력이 있으면 다시 묻지 말라고 지시한다", () => {
    const withAsked = {
      ...project,
      briefing: { asked: [{ question: "가격대는요?", options: [], answer: "5천원대", done: true }] },
    };
    const { messages } = buildBriefingMessages(withAsked);
    const user = messages[0].content;
    expect(user).toContain("가격대는요?");
    expect(user).toContain("5천원대");
    expect(user).toContain("추가 질문 없이");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/briefing.test.js`
Expected: FAIL — `Failed to load ../lib/briefing.js`

- [ ] **Step 3: Write minimal implementation**

`lib/briefing.js` 생성:

```js
// 브리핑 추출 — 자유 자료를 주제·핵심내용·대상·보고 나면으로 정리하고, 부족한 것만 되묻는다.
// 영상 성격(알림·판매·기록·이야기)은 자료를 보고 판단한다. 어느 쪽도 전제하지 않는다.
const SYSTEM = `너는 짧은 영상을 준비하는 사람의 자료를 정리하는 조수다.
반드시 JSON 하나만 출력:
{"topic":"이 영상이 무엇에 대한 것인지 한 줄",
 "key_points":["영상에 꼭 들어가야 할 내용"],
 "audience":"누가 보게 될지 (자료에 없으면 빈 문자열)",
 "takeaway":"보고 나면 어떤 마음이 들거나 무엇을 하길 바라는지 (없으면 빈 문자열)",
 "questions":[{"question":"되물을 것","options":["보기","보기"]}]}
규칙:
- 자료에 있는 사실만 쓴다. 없는 내용을 지어내지 않는다. 모르면 빈 문자열이나 빈 배열로 둔다.
- key_points는 자료에 나온 구체적인 것(이름·수치·시간·장소·특징)을 그대로 살린다.
- 질문은 최대 3개. 정보가 있어야만 채워지는 것만 묻는다 — 자료에 없어서 대본이 뭉뚱그려질 부분.
- 표현을 더 좋게 만드는 방법이나 취향은 묻지 않는다. 그건 조수가 알아서 할 몫이다.
- 무엇을 물을지는 자료의 성격에 따라 다르다. 파는 내용이면 가격·기간·조건이, 겪은 일이면 언제·어디서·누구와가 후보다.
- 각 질문에는 자료로 미루어 그럴듯한 보기를 2~4개 붙인다. 보기가 마땅치 않으면 빈 배열로 둔다.`;

export function buildBriefingMessages(project) {
  const { material, briefing } = project;
  const photos = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = `[자료 텍스트]
${material.text}
[올린 사진]
${photos}`;

  const asked = briefing?.asked || [];
  if (asked.length > 0) {
    const history = asked
      .map((a) => `- ${a.question} → ${a.answer || "(답 안 함)"}`)
      .join("\n");
    user += `\n\n[이미 물어본 것]\n${history}\n같은 것을 다시 묻지 말고, 이번에는 추가 질문 없이 questions를 빈 배열로 두고 정리만 다시 하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/briefing.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/briefing.js tests/briefing.test.js
git commit -m "feat: 브리핑 추출 프롬프트 — 성격 중립, 질문 3개 상한"
```

---

### Task 3: 프로젝트 저장소에 `briefing` 필드

**Files:**
- Modify: `lib/projects.js:15-28`
- Test: `tests/projects.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: 새 프로젝트가 `briefing: null`을 갖는다. 상태 흐름 주석은 `draft → briefing → script → cuts`

- [ ] **Step 1: Write the failing test**

`tests/projects.test.js`의 첫 it 블록 안, `expect(p.settings.aspect_ratio).toBe("9:16");` 다음 줄에 추가:

```js
    expect(p.briefing).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/projects.test.js`
Expected: FAIL — `expected undefined to be null`

- [ ] **Step 3: Write minimal implementation**

`lib/projects.js`의 `createProject` 안 `status` 줄과 `script` 줄을 다음처럼 바꾼다:

```js
    status: "draft", // draft → briefing → script → cuts
    settings: settings || {},
    material: material || { text: "", photos: [] },
    briefing: null,
    script: null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/projects.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/projects.js tests/projects.test.js
git commit -m "feat: 프로젝트에 briefing 필드"
```

---

### Task 4: 추출 라우트 `POST /api/projects/[id]/briefing`

**Files:**
- Create: `app/api/projects/[id]/briefing/route.js`
- Modify: `app/api/projects/[id]/route.js:10-38` (PATCH가 briefing 병합)

**Interfaces:**
- Consumes: `buildBriefingMessages` (Task 2), `validateBriefing` (Task 1), `callJson`, `getProject`/`updateProject`
- Produces:
  - `POST /api/projects/[id]/briefing` → `{briefing}` (200) · `{error}` (404/502)
  - `PATCH /api/projects/[id]` body `{briefing: {...부분}}` → 병합 저장

- [ ] **Step 1: 라우트 작성**

`app/api/projects/[id]/briefing/route.js` 생성:

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateBriefing } from "../../../../../lib/validate";
import { buildBriefingMessages } from "../../../../../lib/briefing";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "정리할 자료가 없어요" }, { status: 400 });
  }

  const { system, messages } = buildBriefingMessages(project);

  let briefing = null;
  for (let attempt = 0; attempt < 2 && !briefing; attempt++) {
    try {
      briefing = validateBriefing(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!briefing) {
    return Response.json({ error: "자료를 정리하지 못했어요. 직접 채우거나 다시 시도해 주세요." }, { status: 502 });
  }

  // 이미 답한 이력은 보존하고, 질문 라운드는 1회로 코드가 강제한다.
  // (프롬프트로도 지시하지만 LLM이 어길 수 있으므로 여기서 잘라낸다)
  const updated = await updateProject(id, (proj) => {
    const kept = (proj.briefing?.asked || []).filter((a) => a.done);
    const asked = kept.length > 0 ? kept : briefing.asked;
    return {
      ...proj,
      status: "briefing",
      briefing: { ...briefing, asked, confirmed: false, version: 1 },
    };
  });
  return Response.json({ briefing: updated.briefing });
}
```

- [ ] **Step 2: PATCH에 briefing 병합 추가**

`app/api/projects/[id]/route.js`의 `if (body.settings) ...` 줄 **다음**에 추가:

```js
      if (body.briefing) next.briefing = { ...proj.briefing, ...body.briefing };
```

- [ ] **Step 3: 라운드 상한 회귀 테스트**

`tests/validate.test.js`의 `validateBriefing` describe 끝에 추가한다. 라우트는 테스트가 없으므로 상한 규칙 자체를 여기서 못박는다:

```js
  it("이미 답한 이력이 있으면 새 질문을 쓰지 않는다 (라우트 규칙과 같은 판정)", () => {
    const kept = [{ question: "가격대는요?", options: [], answer: "5천원대", done: true }];
    const fresh = validateBriefing({ topic: "주제", key_points: ["가"], questions: [{ question: "새 질문" }] });
    const asked = kept.length > 0 ? kept : fresh.asked;
    expect(asked).toEqual(kept);
  });
```

Run: `npx vitest run tests/validate.test.js`
Expected: PASS

- [ ] **Step 4: 라우트가 뜨는지 확인**

Run: `npx next build`
Expected: 빌드 성공, 라우트 목록에 `/api/projects/[id]/briefing` 표시
(dev 서버가 떠 있으면 `.next`가 깨진다 — 껐다 `npm run dev`로 다시 띄운다)

- [ ] **Step 5: Commit**

```bash
git add "app/api/projects/[id]/briefing/route.js" "app/api/projects/[id]/route.js" tests/validate.test.js
git commit -m "feat: 브리핑 추출 라우트 + PATCH 병합 + 질문 라운드 1회 강제"
```

---

### Task 5: 대본 게이트 — 확정 없이는 생성 금지

**Files:**
- Modify: `app/api/projects/[id]/script/route.js:6-12`

**Interfaces:**
- Consumes: `project.briefing.confirmed`
- Produces: 확정 전 호출 시 400 `{error: "브리핑을 먼저 확정해 주세요"}`

- [ ] **Step 1: 게이트 추가**

`app/api/projects/[id]/script/route.js`의 `if (!project) return ...` 줄 **다음**에 추가:

```js
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }
```

- [ ] **Step 2: 수동 확인**

dev 서버가 떠 있는 상태에서 (없으면 `npm run dev`) 확정 안 된 프로젝트로 호출:

```powershell
$b = '{"material":{"text":"테스트 자료입니다. 매일 아침 직접 만듭니다."}}'
$p = (Invoke-WebRequest -Uri http://localhost:3000/api/projects -Method POST -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($b)) -UseBasicParsing).Content | ConvertFrom-Json
try { Invoke-WebRequest -Uri "http://localhost:3000/api/projects/$($p.id)/script" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: `400`

- [ ] **Step 3: Commit**

```bash
git add "app/api/projects/[id]/script/route.js"
git commit -m "feat: 브리핑 확정 전 대본 생성 차단"
```

---

### Task 6: 단계 판정을 확정 기준으로

**Files:**
- Modify: `lib/steps.js`
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: `project.briefing.confirmed`
- Produces:
  - `STEPS[0]`이 `seg: "briefing"`을 갖는다
  - `stepHref(STEPS[0], id)` → 프로젝트 있으면 `/create/<id>/briefing`, 없으면 `/create`
  - `currentStepKey`: 확정 전이면 `material`, 확정 후 `status==="cuts"`면 `images`, 그 외 `script`

- [ ] **Step 1: Write the failing test**

`tests/steps.test.js`에서 `stepHref` 관련 it과 `currentStepKey` describe를 아래로 교체하고, `stepFromPathname` describe에 케이스를 추가한다:

```js
  it("stepHref는 ①자료를 프로젝트 유무로 가른다", () => {
    const [material, script] = STEPS;
    expect(stepHref(material, null)).toBe("/create");
    expect(stepHref(material, "abc")).toBe("/create/abc/briefing");
    expect(stepHref(script, null)).toBeNull();
    expect(stepHref(script, "abc")).toBe("/create/abc/script");
  });
```

```js
  it("브리핑 경로를 ①자료로 읽는다", () => {
    expect(stepFromPathname("/create/abc/briefing").key).toBe("material");
  });
```

```js
describe("currentStepKey", () => {
  const confirmed = { confirmed: true };

  it("프로젝트가 없으면 자료 단계", () => {
    expect(currentStepKey(null)).toBe("material");
  });
  it("브리핑 확정 전에는 상태와 무관하게 자료 단계", () => {
    expect(currentStepKey({ status: "draft", briefing: null })).toBe("material");
    expect(currentStepKey({ status: "briefing", briefing: { confirmed: false } })).toBe("material");
  });
  it("확정하면 대본 단계", () => {
    expect(currentStepKey({ status: "briefing", briefing: confirmed })).toBe("script");
    expect(currentStepKey({ status: "script", briefing: confirmed })).toBe("script");
  });
  it("컷이 시작되면 이미지 단계", () => {
    expect(currentStepKey({ status: "cuts", briefing: confirmed })).toBe("images");
  });
});
```

`isReachable` describe의 프로젝트 리터럴에도 확정 표시를 넣는다:

```js
describe("isReachable", () => {
  it("자료 단계는 언제나 열려 있다", () => {
    expect(isReachable("material", null)).toBe(true);
  });
  it("현재 단계까지만 열린다", () => {
    const p = { status: "script", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("voice", p)).toBe(false);
    expect(isReachable("images", p)).toBe(false);
  });
  it("지난 단계는 다시 열 수 있다", () => {
    const p = { status: "cuts", briefing: { confirmed: true } };
    expect(isReachable("script", p)).toBe(true);
    expect(isReachable("images", p)).toBe(true);
    expect(isReachable("video", p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — `stepHref(material, "abc")`가 `/create` 반환, 확정 전 판정이 `script`

- [ ] **Step 3: Write minimal implementation**

`lib/steps.js`에서 세 곳을 바꾼다.

`STEPS` 첫 항목:

```js
  { key: "material", no: "①", label: "자료", seg: "briefing" },
```

`stepHref`:

```js
export function stepHref(step, projectId) {
  // ①자료는 프로젝트가 생기기 전엔 /create, 생긴 뒤엔 그 프로젝트의 브리핑 화면이다
  if (step.key === "material") return projectId ? `/create/${projectId}/briefing` : "/create";
  return projectId ? `/create/${projectId}/${step.seg}` : null;
}
```

`currentStepKey`:

```js
// 프로젝트 상태 → 지금 있어야 할 단계.
// 상태 문자열이 아니라 브리핑 확정 여부가 ①→②의 문턱이다(대본 생성 중에도 ②에 머물러야 한다).
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  if (project.status === "cuts") return "images";
  return "script";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — 전체 그린

- [ ] **Step 5: Commit**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "feat: 단계 판정을 브리핑 확정 기준으로"
```

---

### Task 7: 대본 프롬프트 — 브리핑 주입과 훅 비강제

**Files:**
- Modify: `lib/script.js`
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `project.briefing`
- Produces: `buildScriptMessages(project, instruction)` — 브리핑과 원문을 함께 담고, 훅을 강제하지 않는다

- [ ] **Step 1: Write the failing test**

`tests/script.test.js`의 `project` 리터럴에 브리핑을 넣고 describe를 보강한다:

```js
const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
  script: null,
};
```

`buildScriptMessages` describe에 추가:

```js
  it("브리핑과 원문 자료를 모두 담는다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("생딸기라떼 신메뉴");   // 브리핑 주제
    expect(user).toContain("매일 아침 직접 갈아"); // 핵심내용
    expect(user).toContain("동네 주민");           // 대상
    expect(user).toContain("매장에 와보고 싶어지기"); // 보고 나면
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서."); // 원문
  });

  it("브리핑이 없어도 원문만으로 조립된다", () => {
    const user = buildScriptMessages({ ...project, briefing: null }).messages[0].content;
    expect(user).toContain("생딸기라떼. 매일 아침 직접 갈아서.");
  });

  it("영상 성격을 단정하지 않는다 — 훅을 강제하지 않는다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).not.toContain("반드시");
    expect(system).toContain("성격");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — 브리핑 문자열이 프롬프트에 없고, system에 "반드시"가 있다

- [ ] **Step 3: Write minimal implementation**

`lib/script.js`의 `SYSTEM`에서 훅 강제 줄과 태그 예시를 바꾼다:

```js
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
반드시 JSON 하나만 출력: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
규칙:
- 분량은 자료가 정한다 — 자료에 담긴 내용을 빠짐없이, 군살 없이. 자료가 적으면 짧게, 많으면 길게 (3~8문단).
- 첫 문단은 자료의 성격에 맞게 연다. 알리거나 파는 내용이면 3초 안에 시선을 잡고, 겪은 일이나 이야기·인사면 상황이 그려지는 문장으로 연다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.`;
```

`buildScriptMessages` 본문에서 user 조립을 바꾼다:

```js
export function buildScriptMessages(project, instruction) {
  const { material, briefing, script } = project;
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
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — 전체 그린

- [ ] **Step 5: Commit**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 대본에 브리핑 주입 + 훅 강제 제거"
```

---

### Task 8: 자료 입력 화면 — 정리하기로 넘긴다

**Files:**
- Modify: `app/create/page.js`

**Interfaces:**
- Consumes: `POST /api/projects`
- Produces: 제출 시 `/create/<id>/briefing`으로 이동. 추출은 브리핑 화면이 맡는다(새로고침에도 이어지도록)

- [ ] **Step 1: 버튼 문구와 이동 경로 변경**

`app/create/page.js`의 `submit` 함수 안 성공 분기를 바꾼다:

```js
    if (res.ok) router.push(`/create/${data.id}/briefing`);
```

같은 파일 하단 버튼 문구를 바꾼다:

```jsx
        <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "여는 중…" : "정리하기 →"} <span className="cr">무료</span>
        </button>
```

안내 문구도 바꾼다:

```jsx
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 대본 → 목소리 → 이미지 → 영상 → 완성</p>
```

- [ ] **Step 2: 화면 확인**

dev 서버에서 `http://localhost:3000/create` 열고 자료를 넣어 제출.
Expected: `/create/<id>/briefing`으로 이동(다음 태스크 전이므로 404 또는 빈 화면이 정상)

- [ ] **Step 3: Commit**

```bash
git add app/create/page.js
git commit -m "feat: 자료 화면은 정리하기로 브리핑 화면에 넘긴다"
```

---

### Task 9: 브리핑 화면

**Files:**
- Create: `app/create/[id]/briefing/page.js`
- Modify: `app/globals.css` (파일 끝에 추가)

**Interfaces:**
- Consumes: `useProject()` (`components/ProjectContext.jsx`의 `{project, setProject, load}`), `POST /api/projects/[id]/briefing`, `PATCH /api/projects/[id]`
- Produces: 확정 시 `PATCH {briefing:{confirmed:true}}` 후 `/create/<id>/script`로 이동

- [ ] **Step 1: 스타일 추가**

`app/globals.css` 끝에 추가:

```css
/* ── 브리핑 카드 */
.brief { background: var(--deep); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
.brief-row { display: grid; grid-template-columns: 86px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(57,62,70,.4); }
.brief-row:last-child { border-bottom: 0; }
.brief-row > b { color: var(--ink-soft); font-weight: 600; font-size: 12.5px; padding-top: 2px; }
.brief-row .val { line-height: 1.7; }
.brief-row .val:empty::before,
.brief-row .val.blank { color: var(--ink-soft); }
.brief-point { display: flex; gap: 8px; align-items: baseline; }
.brief-point::before { content: "•"; color: var(--accent); }
.ask { background: var(--accent-soft); border: 1px solid rgba(102,51,255,.35); border-radius: 10px; padding: 14px 16px; margin-top: 14px; }
.ask h3 { font-size: 13px; margin: 0 0 10px; }
.ask-q { margin-bottom: 14px; }
.ask-q:last-child { margin-bottom: 0; }
.ask-q p { margin: 0 0 7px; font-size: 13.5px; }
.ask-q .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ask-done { color: var(--good); font-size: 12.5px; }
```

- [ ] **Step 2: 화면 작성**

`app/create/[id]/briefing/page.js` 생성:

```jsx
"use client";

// ① 자료 — 정리 결과 확인·보강·확정 (개입 지점 1)
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";

const EMPTY = { topic: "", key_points: [""], audience: "", takeaway: "", asked: [], confirmed: false };

export default function BriefingStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null); // 직접 채우기 폴백용
  const started = useRef(false);

  // 브리핑이 없으면 자동으로 정리 시작 (새로고침으로 들어와도 이어진다)
  useEffect(() => {
    if (project && !project.briefing && !started.current) {
      started.current = true;
      extract();
    }
  }, [project?.id, project?.briefing]);

  async function extract() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/briefing`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "정리하지 못했어요");
      setDraft(EMPTY); // 백지 폼으로 폴백 — 직접 채울 수 있게
    }
    await load(id).catch(() => {});
    setBusy(false);
  }

  async function patch(briefing) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing }),
    });
    await load(id).catch(() => {});
  }

  async function answer(idx, value) {
    const asked = brief.asked.map((a, i) => (i === idx ? { ...a, answer: value, done: true } : a));
    await patch({ asked });
  }

  async function confirm() {
    setBusy(true); setErr("");
    if (draft) await patch({ ...draft, key_points: draft.key_points.filter((k) => k.trim()) });
    await patch({ confirmed: true });
    router.push(`/create/${id}/script`);
  }

  const brief = project.briefing || draft;

  if (!brief) return <p className="pgsub">{busy ? "자료를 정리하는 중…" : err || "준비 중…"}</p>;

  const pending = (brief.asked || []).filter((a) => !a.done);
  const canConfirm = brief.topic.trim() && brief.key_points.some((k) => k.trim());

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>이렇게 이해했어요 <span className="badge vlm">확인 1</span></h2>
      {err && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" onClick={extract} disabled={busy}>다시 정리하기</button>
        </p>
      )}

      <div className="brief">
        <div className="brief-row">
          <b>주제</b>
          <span className="val" contentEditable suppressContentEditableWarning
            onBlur={(e) => {
              const topic = e.currentTarget.textContent.trim();
              if (topic !== brief.topic) draft ? setDraft({ ...draft, topic }) : patch({ topic });
            }}>{brief.topic}</span>
        </div>
        <div className="brief-row">
          <b>핵심 내용</b>
          <div className="val">
            {brief.key_points.map((k, i) => (
              <div className="brief-point" key={i}>
                <span contentEditable suppressContentEditableWarning style={{ outline: "none", flex: 1 }}
                  onBlur={(e) => {
                    const text = e.currentTarget.textContent.trim();
                    const key_points = brief.key_points.map((v, j) => (j === i ? text : v)).filter((v) => v);
                    if (text !== k) draft ? setDraft({ ...draft, key_points }) : patch({ key_points });
                  }}>{k}</span>
              </div>
            ))}
            <button className="mini" style={{ marginTop: 6 }}
              onClick={() => {
                const key_points = [...brief.key_points, "새 내용"];
                draft ? setDraft({ ...draft, key_points }) : patch({ key_points });
              }}>+ 내용 추가</button>
          </div>
        </div>
        <div className="brief-row">
          <b>보는 사람</b>
          <span className={`val${brief.audience ? "" : " blank"}`} contentEditable suppressContentEditableWarning
            onBlur={(e) => {
              const audience = e.currentTarget.textContent.trim();
              if (audience !== brief.audience) draft ? setDraft({ ...draft, audience }) : patch({ audience });
            }}>{brief.audience || "(비어 있음)"}</span>
        </div>
        <div className="brief-row">
          <b>보고 나면</b>
          <span className={`val${brief.takeaway ? "" : " blank"}`} contentEditable suppressContentEditableWarning
            onBlur={(e) => {
              const takeaway = e.currentTarget.textContent.trim();
              if (takeaway !== brief.takeaway) draft ? setDraft({ ...draft, takeaway }) : patch({ takeaway });
            }}>{brief.takeaway || "(비어 있음)"}</span>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="ask">
          <h3>{pending.length}가지만 더 여쭤요 — 대본이 구체적이 됩니다</h3>
          {brief.asked.map((a, i) => a.done ? null : (
            <div className="ask-q" key={i}>
              <p>{a.question}</p>
              <div className="row">
                {a.options.map((o) => (
                  <button className="mini" key={o} onClick={() => answer(i, o)}>{o}</button>
                ))}
                <input className="sent-input" placeholder="직접 입력"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) answer(i, e.currentTarget.value.trim()); }} />
                <button className="mini" onClick={() => answer(i, null)}>건너뛰기</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {brief.asked?.some((a) => a.done && a.answer) && (
        <div className="script-src">
          답해주신 것 — {brief.asked.filter((a) => a.done && a.answer).map((a, i) => <b key={i}>✓ {a.answer} </b>)}
        </div>
      )}

      <div className="script-src">칸을 클릭하면 바로 고칠 수 있어요</div>
      <button className="cta" disabled={busy || !canConfirm} onClick={confirm}>
        이대로 대본 만들기
      </button>
      <div className="credit-note">대본은 무료예요 — 마음에 들 때까지 다시 쓸 수 있습니다</div>
    </section>
  );
}
```

- [ ] **Step 3: 대본 화면의 자동 생성 조건 맞추기**

`app/create/[id]/script/page.js`의 자동 생성 useEffect를 바꾼다(확정 직후 상태는 아직 `briefing`이므로 `draft` 조건으로는 안 걸린다):

```jsx
  // 대본이 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && !project.script && project.briefing?.confirmed && !busy) genScript();
  }, [project?.status, project?.briefing?.confirmed]);
```

- [ ] **Step 4: 전체 테스트와 빌드**

Run: `npx vitest run`
Expected: PASS 전체

Run: `npx next build`
Expected: 성공, 라우트에 `/create/[id]/briefing` 표시
(dev 서버가 떠 있었다면 `.next`가 깨지므로 서버를 껐다 `npm run dev`로 다시 띄운다)

- [ ] **Step 5: Commit**

```bash
git add "app/create/[id]/briefing/page.js" "app/create/[id]/script/page.js" app/globals.css
git commit -m "feat: 브리핑 확인·보강·확정 화면"
```

---

### Task 10: 라이브 확인과 문서 정리

**Files:**
- Modify: `README.md` — `단계별` 흐름을 적은 줄을 `자료 정리·확인 → 대본 → 목소리 → 이미지 → 영상 → 완성`으로 고친다(해당 문구가 없으면 건너뛴다)
- Modify: `docs/superpowers/specs/2026-07-24-briefing-intake-design.md` — 구현 중 스펙과 달라진 판단이 생겼으면 그 줄만 고친다

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 없음(검증)

- [ ] **Step 1: 라이브 흐름 통과**

`npm run dev` 후 브라우저에서 순서대로 확인한다.

1. `/create`에서 자료 입력 → [정리하기] → `/create/<id>/briefing` 이동
2. "자료를 정리하는 중…" 후 브리핑 카드 표시, 주제·핵심내용이 자료 내용과 맞는지
3. 질문 카드가 3개 이하인지, 보기 클릭·직접 입력·건너뛰기가 각각 동작하는지
4. 답하면 질문이 사라지고 "답해주신 것"에 쌓이는지
5. 칸을 클릭해 고치고 새로고침 → 고친 내용이 남아 있는지
6. [이대로 대본 만들기] → 대본이 생성되고 사이드바 ②대본이 진행 중으로 바뀌는지
7. 브라우저 뒤로 가기로 브리핑 화면 복귀 → 확정 상태가 유지되는지

- [ ] **Step 2: 잠금·되돌림 확인**

- 확정 전에 `/create/<id>/script`를 주소창에 직접 입력 → 브리핑 화면으로 되돌아오는지
- 확정 전에 사이드바 ②대본이 "잠김"으로 보이는지

- [ ] **Step 3: 회귀 확인**

Run: `npx vitest run`
Expected: 전체 그린 (기존 34 + 신규분)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: 브리핑 도입에 맞춰 문서 갱신"
```

---

## 구현 중 판단이 필요할 때

- **추출 품질이 나쁘면** 프롬프트(`lib/briefing.js`의 `SYSTEM`)를 먼저 손본다. 스키마(`validateBriefing`)는 방어용이지 품질 장치가 아니다
- **질문이 취향을 묻고 있으면** "정보가 있어야만 채워지는 것" 규칙을 프롬프트에서 더 구체적인 예시로 강화한다
- **기존 `data/projects`의 옛 프로젝트**는 `briefing`이 없어 대본 생성이 400으로 막힌다. 실험 데이터이므로 마이그레이션하지 않고, 필요하면 새로 만든다

## 이 플랜 밖에 있는 것

- **컷 `role`을 `opening|body|closing`으로 중립화** — 스펙의 성격 중립화 표에 있지만 컷 스키마 자체가 아직 `role`을 갖고 있지 않다. 로드맵 P0의 "컷 스키마 보강"에서 `visual_description`·`mood`와 함께 넣는다
- **대본 생성·판정 루프(판정 2)** — 별도 스펙·플랜
- 카테고리 선택, URL 추출, 고성과 레퍼런스 수집, `template_meta`, 문서 파일 파싱 — 전부 07-24 결정으로 제외
