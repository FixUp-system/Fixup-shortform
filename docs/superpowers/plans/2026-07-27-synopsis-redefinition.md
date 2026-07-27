# 대본 재정의 (구성/대본 분리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상의 구성(앵글 + 장면 목록)을 저장되는 별도 게이트로 세우고, 대본을 그 장면에 1:1로 종속시킨다.

**Architecture:** 지금 `script` 라우트 안에서 매번 새로 짜이고 버려지던 기획(`buildPlanMessages`)을 `synopsis`라는 저장되는 물건으로 승격한다. 대본은 장면 개수와 순서를 그대로 따르는 문장 배열로 얇아지고(`tag`·`coverage` 삭제), 컷은 장면에서 갈라져 나와 이미지 프롬프트의 원천이 나레이션 문장이 아니라 `scene.shows`가 된다.

**Tech Stack:** Next.js App Router (JS, ESM), vitest, OpenAI/Anthropic 어댑터(`lib/llm.js`)

**Spec:** `docs/superpowers/specs/2026-07-27-synopsis-redefinition-design.md`

## Global Constraints

- 모든 주석·프롬프트·UI 문구는 한국어. 기존 파일의 주석 밀도와 어조를 따른다.
- 테스트는 `vitest`. 전체 실행은 `npm test`, 단일 파일은 `npx vitest run tests/<파일>`.
- 검증기(`lib/validate.js`)는 **스키마 방어만** 한다 — 내용 품질을 판정하지 않는다. 기존 `validatePlan`의 주석이 명시한 원칙이다.
- LLM 호출은 `callJson({ system, messages })` 하나만 쓴다. 실패 시 최대 2회 시도.
- 화면 라벨: 구성 → 대본. 코드 명칭 `script`는 나레이션을 가리키는 것으로 유지한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 를 넣는다.
- 푸시하지 않는다. 배포는 사용자가 요청할 때만.

## 스펙에서 벗어난 판단 두 가지 (구현자는 그대로 따를 것)

1. **장면 개수 하한.** 스펙 §4는 `scenes` 3~8개를 검증기에서 강제하라고 했으나, 검증기는 상한(8)과 비어있지 않음만 본다. 하한 3은 프롬프트가 지시한다. 이유: 얕은 자료(예: 37자짜리 필라테스 자료)에서 장면이 2개만 나오면 검증기가 전부 거절해 진행 자체가 막힌다. 예전 `validatePlan`은 하한이 없었고 실패해도 폴백 경로가 있었지만, 이제 구성 실패는 곧 진행 불가다. 하한 미달은 라이브 검증(Task 9)에서 눈으로 본다.
2. **장면 직접 편집.** 스펙 §7은 구성 화면을 "텍스트 형태로 표시"까지만 적었다. 오타 하나 고치려고 유료 재생성을 돌리는 건 낭비이므로 `script_paragraph`와 대칭인 `synopsis_scene` PATCH를 Task 5에 넣는다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/synopsis.js` (신규) | 구성 프롬프트. 자료·브리핑 → 앵글 + 장면 목록 |
| `lib/script.js` (수정) | 나레이션 프롬프트·교정 프롬프트·낭독 시간 근사. `buildPlanMessages` 삭제 |
| `lib/validate.js` (수정) | `validatePlan` → `validateSynopsis`, `validateScript`에 장면 수 강제, `validateCuts`에 `scene_idx` |
| `lib/cuts.js` (수정) | 컷 분할 프롬프트에 구성 주입, 이미지 프롬프트 원천을 `scene.shows`로 |
| `lib/steps.js` (수정) | 6단계 → 7단계, 문턱에 구성 추가 |
| `app/api/projects/[id]/synopsis/route.js` (신규) | 구성 생성·재생성 |
| `app/api/projects/[id]/script/route.js` (수정) | 기획 생성 삭제, 구성 필수 |
| `app/api/projects/[id]/route.js` (수정) | `synopsis_scene` PATCH |
| `app/create/[id]/synopsis/page.js` (신규) | 구성 게이트 화면 |
| `app/create/[id]/script/page.js` (수정) | `tag`·`coverage` 제거, stale 기준을 구성으로 |

`lib/synopsis.js`를 새 파일로 가르는 이유: `lib/script.js`가 세 프롬프트(기획·대본·교정)를 이미 들고 124줄이다. 구성 프롬프트가 여기 더 들어가면 한 파일이 두 게이트를 담게 된다. 구성과 대본은 서로 다른 게이트이고 따로 바뀐다.

`sourceBlock`(자료·브리핑을 지문으로 만드는 함수)은 두 파일이 모두 쓴다. `lib/briefing.js`로 옮기지 않고 `lib/synopsis.js`에서 `export`해 `lib/script.js`가 가져다 쓴다 — 지문의 주인은 구성 단계이고, 대본은 그것을 빌려 쓰는 쪽이다.

---

## Task 1: 구성 검증기

**Files:**
- Modify: `lib/validate.js:62-76` (`validatePlan` 삭제 후 `validateSynopsis` 추가)
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `validateSynopsis(obj, photoIds) → { angle: string, scenes: Array<{role, shows, says, seconds, facts: string[], ref_photo_id?}> } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 끝에 추가. 파일 맨 위 import 줄의 `validatePlan`을 `validateSynopsis`로 바꾼다.

```js
describe("validateSynopsis", () => {
  const scene = () => ({
    role: "여는말",
    shows: "유리잔 속 딸기 과육이 우유와 섞이는 클로즈업",
    says: "오늘 이 한 잔은 어제와 맛이 다르다",
    seconds: 3,
    facts: ["논산 설향"],
  });
  const ok = (over = {}) => ({ angle: "매일 맛이 다른 라떼", scenes: [scene(), scene(), scene()], ...over });

  it("정상 응답을 통과시킨다", () => {
    const s = validateSynopsis(ok(), []);
    expect(s.angle).toBe("매일 맛이 다른 라떼");
    expect(s.scenes).toHaveLength(3);
    expect(s.scenes[0].shows).toContain("클로즈업");
    expect(s.scenes[0].seconds).toBe(3);
  });

  it("angle이 없으면 null", () => {
    expect(validateSynopsis({ scenes: [scene()] }, [])).toBeNull();
  });

  it("shows가 없으면 null — 화면 근거가 이 필드 하나뿐이다", () => {
    const bad = ok();
    delete bad.scenes[1].shows;
    expect(validateSynopsis(bad, [])).toBeNull();
  });

  it("says가 없으면 null", () => {
    const bad = ok();
    bad.scenes[1].says = "   ";
    expect(validateSynopsis(bad, [])).toBeNull();
  });

  it("seconds가 범위 밖이면 null", () => {
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: 1 }] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: 16 }] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: [{ ...scene(), seconds: "셋" }] }), [])).toBeNull();
  });

  it("장면이 없거나 8개를 넘으면 null", () => {
    expect(validateSynopsis(ok({ scenes: [] }), [])).toBeNull();
    expect(validateSynopsis(ok({ scenes: Array.from({ length: 9 }, scene) }), [])).toBeNull();
  });

  it("장면이 2개여도 통과한다 — 하한은 프롬프트가 지시하고 검증기는 막지 않는다", () => {
    expect(validateSynopsis(ok({ scenes: [scene(), scene()] }), [])).not.toBeNull();
  });

  it("없는 ref_photo_id는 조용히 제거한다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), ref_photo_id: "없는id" }] }), ["p1"]);
    expect(s.scenes[0].ref_photo_id).toBeUndefined();
  });

  it("있는 ref_photo_id는 남긴다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), ref_photo_id: "p1" }] }), ["p1"]);
    expect(s.scenes[0].ref_photo_id).toBe("p1");
  });

  it("facts가 없으면 빈 배열로 채운다", () => {
    const s = validateSynopsis(ok({ scenes: [{ ...scene(), facts: undefined }] }), []);
    expect(s.scenes[0].facts).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `validateSynopsis is not a function` (또는 import 오류). 기존 `validatePlan` 테스트도 함께 깨진다.

- [ ] **Step 3: 검증기를 구현한다**

`lib/validate.js`의 `validatePlan` 함수 전체(주석 포함)를 아래로 교체한다.

```js
// 구성 응답 방어 — 스키마만 본다(장면 내용의 품질은 판정하지 않는다).
// 장면 수 하한(3)은 프롬프트가 지시한다. 얕은 자료에서 2장면이 나왔다고 진행 자체를 막으면
// 사장님이 아무것도 못 하게 된다. 상한만 둔다.
export function validateSynopsis(obj, photoIds = []) {
  if (!obj || typeof obj.angle !== "string" || !obj.angle.trim()) return null;
  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0 || obj.scenes.length > 8) return null;
  const scenes = [];
  for (const s of obj.scenes) {
    if (typeof s?.role !== "string" || !s.role.trim()) return null;
    if (typeof s?.shows !== "string" || !s.shows.trim()) return null;
    if (typeof s?.says !== "string" || !s.says.trim()) return null;
    const seconds = Number(s.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    const facts = Array.isArray(s.facts)
      ? s.facts.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim())
      : [];
    const scene = { role: s.role.trim(), shows: s.shows.trim(), says: s.says.trim(), seconds, facts };
    // 없는 레퍼런스는 조용히 제거 — validateCuts와 같은 방식
    if (s.ref_photo_id && photoIds.includes(s.ref_photo_id)) scene.ref_photo_id = s.ref_photo_id;
    scenes.push(scene);
  }
  return { angle: obj.angle.trim(), scenes };
}
```

- [ ] **Step 4: 기존 `validatePlan` 테스트를 지운다**

`tests/validate.test.js`의 `describe("validatePlan", …)` 블록 전체를 삭제한다. 그 안의 케이스(angle 누락, role/point 누락, facts 필터)는 위 `validateSynopsis` 테스트가 이미 덮는다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/validate.js tests/validate.test.js
git commit -m "$(cat <<'EOF'
feat: validatePlan을 validateSynopsis로 승격 — shows·seconds 추가

장면 수 하한은 검증기가 아니라 프롬프트가 지시한다.
얕은 자료에서 2장면이 나왔다고 진행을 막으면 사장님이 아무것도 못 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 구성 프롬프트

**Files:**
- Create: `lib/synopsis.js`
- Modify: `lib/script.js:20-45` (`sourceBlock` 이동 — 삭제하고 `lib/synopsis.js`에서 import)
- Test: `tests/synopsis.test.js` (신규)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `buildSynopsisMessages(project, instruction) → { system: string, messages: [{role:"user", content:string}] }`
  - `sourceBlock(project) → string` (`lib/script.js`가 import해 쓴다)
  - `synopsisBlock(synopsis) → string` — 구성을 지문에 적는 표기. Task 3의 `buildScriptMessages`가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/synopsis.test.js` 신규 생성.

```js
import { describe, it, expect } from "vitest";
import { buildSynopsisMessages } from "../lib/synopsis.js";

const project = {
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: {
    topic: "생딸기라떼 신메뉴",
    key_points: ["매일 아침 직접 갈아"],
    audience: "동네 주민",
    takeaway: "매장에 와보고 싶어지기",
    asked: [],
    confirmed: true,
  },
};

describe("buildSynopsisMessages", () => {
  it("자료와 브리핑이 지문에 들어간다", () => {
    const { messages } = buildSynopsisMessages(project);
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("매일 아침 직접 갈아");
    expect(user).toContain("라떼.jpg");
  });

  it("shows와 says를 갈라서 요구한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain('"shows"');
    expect(system).toContain('"says"');
    expect(system).toContain('"seconds"');
  });

  it("says에 완성 문장을 쓰지 말라고 지시한다 — 문장은 대본 단계의 일이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("완성된 낭독 문장을 쓰지 마라");
  });

  it("shows를 추상어로 쓰지 말라고 지시한다 — 이미지 프롬프트의 원천이다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("추상어");
  });

  it("기법 서술과 광고 형용사를 금지한다", () => {
    const { system } = buildSynopsisMessages(project);
    expect(system).toContain("희소성을 강조한다");
    expect(system).toContain("특별한");
  });

  it("수정 지시가 있으면 기존 구성과 함께 지문에 붙는다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn, "더 짧게");
    const user = messages[0].content;
    expect(user).toContain("기존앵글");
    expect(user).toContain("기존화면");
    expect(user).toContain("더 짧게");
  });

  it("수정 지시가 없으면 기존 구성을 붙이지 않는다 — 처음부터 다시 짠다", () => {
    const withSyn = {
      ...project,
      synopsis: { angle: "기존앵글", scenes: [{ role: "여는말", shows: "기존화면", says: "기존요지", seconds: 3, facts: [] }] },
    };
    const { messages } = buildSynopsisMessages(withSyn);
    expect(messages[0].content).not.toContain("기존앵글");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/synopsis.test.js`
Expected: FAIL — `Cannot find module '../lib/synopsis.js'`

- [ ] **Step 3: `lib/synopsis.js`를 만든다**

```js
// 구성(시놉시스) — 영상이 어떤 장면들로 어떻게 흘러갈지 정한다. 사장님이 승인하는 게이트.
// 낭독 문장은 여기서 쓰지 않는다. 문장은 대본 단계(lib/script.js)의 일이다.
const SYNOPSIS_SYSTEM = `너는 짧은 영상의 구성을 짜는 기획자다. 자료를 읽고 이 영상이 어떤 장면들로 어떻게 흘러갈지 정한다.
출력은 JSON 하나로 한다: {"angle":"이 영상이 진짜 말하는 한 가지","scenes":[{"role":"장면이 하는 일","shows":"화면에 보이는 것","says":"할 말의 요지","seconds":초,"facts":["쓰는 자료 사실"],"ref_photo_id":"이 장면에 사진 속 피사체가 나오면 그 사진 id(없으면 생략)"}]}
규칙:
- angle은 자료에서 가장 구체적이고 센 사실로 잡는다. 광고 문구가 아니다.
- scenes는 3~8개. role은 그 장면이 하는 일(여는말·상황·근거·전개·희소성·마감 등).
- shows는 카메라가 잡는 것을 눈에 보이게 적는다 — 피사체·행동·화면 크기. 추상어로 쓰지 않는다.
  ✗ "정성이 느껴지는 장면" / "분위기 있는 컷"
  ✓ "아침 7시 주방, 논산 설향 딸기를 통째로 갈아 넣는 손 클로즈업"
- says는 할 말의 요지다. 완성된 낭독 문장을 쓰지 마라 — 문장은 다음 단계가 쓴다.
  '강조한다·유도한다·차별화·소개한다' 같은 기법 서술이나 광고 형용사('특별한'·'완벽한'·'다양한')로 쓰지 않는다. 실제로 칠 사실로 적는다.
  ✗ "희소성을 강조한다" / "방문을 유도한다"
  ✓ "오전 11시 지나면 그날 치는 끝" / "성수역 3번 출구 2분, 지금 갈 수 있다"
- 여는말 장면의 shows와 says는 스크롤을 멈추게 할 가장 센 한 방으로 잡는다.
- seconds는 그 장면에 몇 초를 쓸지 배분한다(2~15). 전체 합이 15~40초가 되게 한다.
- facts는 자료·브리핑에 실제로 있는 것만 담는다. 담을 사실이 없으면 그 장면을 만들지 않는다.
- 자료가 함의하는 데까지만. 새 사실을 지어내지 않는다.`;

// 브리핑 + 자료 원문 + 사진을 하나의 지문으로 — 구성·대본이 같은 원천을 본다(DRY).
export function sourceBlock(project) {
  const { material, briefing } = project;
  const photoList = material.photos.map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
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

// 구성을 지문에 적을 때의 표기 — 대본·컷 단계도 같은 표기를 쓴다(사장님이 본 것과 같은 모양).
export function synopsisBlock(synopsis) {
  const scenes = synopsis.scenes
    .map((s, i) => `${i + 1}. (${s.role}) 약 ${s.seconds}초 / 보여줌: ${s.shows} / 할 말: ${s.says}${s.facts.length ? ` / 사실: ${s.facts.join(", ")}` : ""}`)
    .join("\n");
  return `앵글: ${synopsis.angle}\n${scenes}`;
}

export function buildSynopsisMessages(project, instruction) {
  let user = sourceBlock(project);
  // 수정 지시가 있을 때만 기존 구성을 보여준다. 지시가 없으면 처음부터 다시 짠다.
  if (project.synopsis && instruction) {
    user += `\n\n[기존 구성]\n${synopsisBlock(project.synopsis)}
[수정 지시] ${instruction}\n지시를 반영해 구성 전체를 다시 출력하라.`;
  }
  return { system: SYNOPSIS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: `lib/script.js`의 `sourceBlock`을 지우고 import로 바꾼다**

`lib/script.js`의 20~45줄(`// 브리핑 + 자료 원문 …` 주석부터 `sourceBlock` 함수 끝 `}`까지)을 삭제하고, 파일 맨 위(1줄 주석 아래)에 추가한다.

```js
import { sourceBlock } from "./synopsis";
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/synopsis.test.js tests/script.test.js`
Expected: `tests/synopsis.test.js` PASS. `tests/script.test.js`는 사진 표기가 `- 라떼.jpg`에서 `- id:p1 라떼.jpg`로 바뀌었으나 기존 단언이 `toContain("라떼.jpg")`이므로 그대로 통과한다. 실패한다면 그 단언만 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/synopsis.js lib/script.js tests/synopsis.test.js
git commit -m "$(cat <<'EOF'
feat: 구성 프롬프트 신설 — shows와 says를 가른다

shows는 이미지 프롬프트의 원천이 되므로 추상어를 금지하고,
says는 요지로만 두어 완성 문장은 대본 단계가 쓰게 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 대본을 구성에 종속시킨다

검증기와 프롬프트를 함께 바꾼다. 검증기만 `tag`를 버리면 프롬프트가 계속 `tag`를 요구해 모든 응답이 거절되므로 둘은 함께 움직여야 한다.

**Files:**
- Modify: `lib/validate.js:2-14` (`validateScript`)
- Modify: `lib/script.js` (`SYSTEM`, `buildScriptMessages`, `EDIT_SYSTEM`, `buildScriptEditMessages`, `buildPlanMessages`·`PLAN_SYSTEM` 삭제)
- Test: `tests/validate.test.js`, `tests/script.test.js`

**Interfaces:**
- Consumes: `synopsisBlock(synopsis)` (Task 2)
- Produces:
  - `validateScript(obj, sceneCount) → { paragraphs: [{text: string}] } | null`
  - `buildScriptMessages(project, instruction) → { system, messages }` — **`plan` 인자 삭제**, `project.synopsis`를 읽는다
  - `buildScriptEditMessages(draft) → { system, messages }`
  - `editKeptContent(draft, edited) → boolean` (변경 없음)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js`의 `describe("validateScript", …)` 블록 전체를 아래로 교체한다.

```js
describe("validateScript", () => {
  const ok = { paragraphs: [{ text: "첫 문장" }, { text: "둘째 문장" }] };

  it("장면 수와 문단 수가 같으면 통과한다", () => {
    const s = validateScript(ok, 2);
    expect(s.paragraphs).toHaveLength(2);
    expect(s.paragraphs[0]).toEqual({ text: "첫 문장" });
  });

  it("tag를 요구하지 않고, 있어도 버린다 — 역할은 장면이 갖는다", () => {
    const s = validateScript({ paragraphs: [{ tag: "훅", text: "문장" }] }, 1);
    expect(s.paragraphs[0]).toEqual({ text: "문장" });
  });

  it("coverage를 반환하지 않는다 — 사실 추적은 scene.facts가 한다", () => {
    const s = validateScript({ paragraphs: [{ text: "문장" }], coverage: ["ㄱ"] }, 1);
    expect(s.coverage).toBeUndefined();
  });

  it("문단 수가 장면 수와 다르면 null — 1:1 종속을 지키는 유일한 장치다", () => {
    expect(validateScript(ok, 3)).toBeNull();
    expect(validateScript(ok, 1)).toBeNull();
  });

  it("sceneCount를 안 주면 null — 조용히 검사를 건너뛰지 않는다", () => {
    expect(validateScript(ok)).toBeNull();
    expect(validateScript(ok, 0)).toBeNull();
  });

  it("빈 문장이 있으면 null", () => {
    expect(validateScript({ paragraphs: [{ text: "  " }] }, 1)).toBeNull();
  });

  it("paragraphs가 없으면 null", () => {
    expect(validateScript({}, 1)).toBeNull();
    expect(validateScript(null, 1)).toBeNull();
  });
});
```

`tests/script.test.js`는 다음처럼 손본다.

1. 맨 위 import에서 `buildPlanMessages`를 뺀다.
2. 픽스처 `project`에 구성을 추가한다.

```js
const synopsis = {
  angle: "매일 맛이 다른 라떼",
  scenes: [
    { role: "여는말", shows: "딸기 과육이 우유에 섞이는 클로즈업", says: "오늘 한 잔은 어제와 다르다", seconds: 3, facts: ["매일 아침 직접"] },
    { role: "마감", shows: "카페 외관", says: "성수역 3번 출구 2분", seconds: 4, facts: [] },
  ],
};
const project = { /* 기존 그대로 */ synopsis, script: null };
```

3. `describe("buildPlanMessages", …)` 블록 전체를 삭제한다.
4. 아래 테스트를 추가한다.

```js
describe("buildScriptMessages — 구성 종속", () => {
  it("구성이 지문에 들어간다", () => {
    const user = buildScriptMessages(project).messages[0].content;
    expect(user).toContain("매일 맛이 다른 라떼");
    expect(user).toContain("오늘 한 잔은 어제와 다르다");
  });

  it("shows도 문맥으로 주되 나레이션으로 옮기지 말라고 지시한다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(messages[0].content).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(system).toContain("나레이션으로 옮기지 않는다");
  });

  it("장면과 같은 개수·순서를 요구한다", () => {
    expect(buildScriptMessages(project).system).toContain("같은 개수·같은 순서");
  });

  it("출력 스키마에 tag와 coverage가 없다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).not.toContain('"tag"');
    expect(system).not.toContain("coverage");
  });
});
```

5. 기존 `buildScriptMessages`/`buildScriptEditMessages` 테스트에서 `tag`·`coverage`에 기대는 단언을 지운다. 구체적으로 `tests/script.test.js:33`의 `withScript` 픽스처는 `{ paragraphs: [{ text: "기존문장" }] }`로, `:107`·`:155`의 `coverage` 필드는 삭제한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/script.test.js`
Expected: FAIL — `validateScript`가 아직 2번째 인자를 무시하고, `SYSTEM`에 `"tag"`가 남아 있다.

- [ ] **Step 3: `validateScript`를 고친다**

`lib/validate.js` 맨 위 `validateScript` 전체를 교체한다.

```js
// LLM 응답 스키마 방어 — 실패 시 null 반환 (호출측이 재시도 판단)
// sceneCount는 필수다. 문단이 장면과 1:1로 맞물리지 않으면 뒤의 컷·이미지가 전부 어긋난다.
export function validateScript(obj, sceneCount) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) return null;
  if (!obj || !Array.isArray(obj.paragraphs) || obj.paragraphs.length !== sceneCount) return null;
  const paragraphs = [];
  for (const p of obj.paragraphs) {
    if (typeof p?.text !== "string" || !p.text.trim()) return null;
    paragraphs.push({ text: p.text });
  }
  return { paragraphs };
}
```

- [ ] **Step 4: 대본 프롬프트를 고친다**

`lib/script.js`에서 `SYSTEM` 상수를 교체한다.

```js
const SYSTEM = `너는 짧은 영상의 대본 작가다. 확정된 [구성]의 장면마다 실제 낭독할 문장을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
숏폼이다 — 군더더기 없이, 짧고 힘있게. 다만 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- paragraphs는 구성의 장면과 같은 개수·같은 순서다. 장면 하나에 문단 하나. 합치거나 나누지 않는다.
- 각 장면의 '할 말'은 너에게 주는 지시다. 그 표현을 그대로 옮기지 말고 실제 대사로 실현한다.
- 각 장면의 '보여줌'은 화면 설명이다. 나레이션으로 옮기지 않는다 — 보이는 것을 말로 반복하지 않는다.
- '강조·유도·차별화·소개·훅·긴장' 같은 연출·기법 단어는 나레이션에 절대 넣지 않는다.
- 사실을 나열하지 않는다. 각 사실을 그 결과·상황·의미로 이어 전개한다("직접 삶습니다"에서 그치지 말고 "그래서 단맛이 다릅니다"까지). 단, 자료가 함의하는 데까지만 — 새 사실을 지어내지 않는다.
- 첫 문단은 스크롤을 멈추게 할 가장 센 한 방으로 연다 — 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 과장·허위 금지 — 구성·자료에 없는 사실을 만들지 않는다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예(기법 전사): "한정된 수량으로 희소성을 강조합니다."
✓ 짧고 센 예: "오전 11시부터, 하루 40잔. 지나면 없습니다."`;
```

`buildScriptMessages`를 교체한다.

```js
export function buildScriptMessages(project, instruction) {
  const { script, synopsis } = project;
  let user = sourceBlock(project);
  if (synopsis) {
    user += `\n\n[구성 — 이 설계대로 쓴다]\n${synopsisBlock(synopsis)}`;
  }
  if (script && instruction) {
    user += `\n\n[기존 대본]\n${script.paragraphs.map((p, i) => `${i + 1}. ${p.text}`).join("\n")}
[수정 지시] ${instruction}\n지시를 반영해 대본 전체를 다시 출력하라. 장면 개수는 그대로 유지한다.`;
  }
  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}
```

맨 위 import를 고친다.

```js
import { sourceBlock, synopsisBlock } from "./synopsis";
```

`PLAN_SYSTEM` 상수와 `buildPlanMessages` 함수를 통째로 삭제한다(그 위의 `// 기획(분석) — …` 주석 포함).

- [ ] **Step 5: 교정 프롬프트에서 `tag`·`coverage`를 걷어낸다**

`lib/script.js`의 `EDIT_SYSTEM`에서 두 줄을 고친다.

```js
출력은 JSON 하나로 한다: {"paragraphs":[{"text":"문장"}]}
```

그리고 마지막 두 규칙을

```js
- 문단 수와 순서를 대본 그대로 유지한다. 군더더기·기법 서술 제거 외에 내용을 바꾸지 않는다.`;
```

로 바꾼다(`tag는 대본 그대로 유지` 문구와 `- coverage는 대본의 것을 유지한다.` 줄을 없앤다).

`buildScriptEditMessages`를 교체한다.

```js
export function buildScriptEditMessages(draft) {
  const body = draft.paragraphs.map((p, i) => `${i + 1}. ${p.text}`).join("\n");
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: `[다듬을 대본]\n${body}` }] };
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/script.test.js`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/validate.js lib/script.js tests/validate.test.js tests/script.test.js
git commit -m "$(cat <<'EOF'
feat: 대본을 구성의 장면에 1:1 종속시킨다

문단 수가 장면 수와 다르면 검증기가 거절한다 — 어긋나면 뒤의 컷·이미지가 전부 밀린다.
tag는 scene.role이, coverage는 scene.facts가 대신하므로 삭제.
기획(buildPlanMessages)은 구성으로 승격돼 사라진다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 구성 라우트 신설 · 대본 라우트 개편

**Files:**
- Create: `app/api/projects/[id]/synopsis/route.js`
- Modify: `app/api/projects/[id]/script/route.js`
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: `buildSynopsisMessages` (Task 2), `validateSynopsis` (Task 1), `validateScript(obj, sceneCount)`·`buildScriptMessages(project, instruction)` (Task 3)
- Produces:
  - `POST /api/projects/[id]/synopsis` → `{ synopsis }` / 400 / 502
  - `POST /api/projects/[id]/script` → `{ script }` / 400 / 502. 저장 형태 `{ paragraphs, version, synopsis_version }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js` 맨 위 import 목록에 추가한다.

```js
const { POST: synopsisPOST } = await import("../app/api/projects/[id]/synopsis/route.js");
```

`projectWithScript()` 픽스처를 교체한다(구성이 생겼고 대본이 얇아졌다).

```js
const SYN = {
  angle: "앵글",
  scenes: [{ role: "여는말", shows: "화면", says: "요지", seconds: 3, facts: [] }],
  version: 1,
  briefing_version: 2,
};

async function projectWithScript() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    status: "script",
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
    synopsis: SYN,
    script: { paragraphs: [{ text: "안녕" }], version: 1, synopsis_version: 1 },
  }));
}

async function projectWithBriefing() {
  const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
  return updateProject(p.id, (proj) => ({
    ...proj,
    briefing: { topic: "주제", key_points: ["ㄱ"], asked: [], confirmed: true, version: 2 },
  }));
}
```

새 describe 블록을 추가한다.

```js
const synOut = (n = 1) => ({
  angle: "매일 맛이 다른 라떼",
  scenes: Array.from({ length: n }, (_, i) => ({
    role: `역할${i}`, shows: `화면${i}`, says: `요지${i}`, seconds: 3, facts: [],
  })),
});

describe("POST /api/projects/[id]/synopsis", () => {
  it("브리핑이 확정되지 않았으면 400", async () => {
    const p = await createProject({ settings: {}, material: { text: "자료", photos: [] } });
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("구성을 저장하고 version을 올린다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValueOnce(synOut(3));
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = (await getProject(p.id)).synopsis;
    expect(saved.scenes).toHaveLength(3);
    expect(saved.version).toBe(1);
    expect(saved.briefing_version).toBe(2);
  });

  it("다시 만들면 version이 오른다", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue(synOut(3));
    await synopsisPOST(patchReq({}), ctx(p.id));
    await synopsisPOST(patchReq({ instruction: "더 짧게" }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.version).toBe(2);
  });

  it("두 번 다 스키마가 깨지면 502", async () => {
    const p = await projectWithBriefing();
    llmMock.callJson.mockResolvedValue({ angle: "", scenes: [] });
    const res = await synopsisPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/projects/[id]/script — 구성 종속", () => {
  it("구성이 없으면 400", async () => {
    const p = await projectWithBriefing();
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(400);
    expect(llmMock.callJson).not.toHaveBeenCalled();
  });

  it("기획을 새로 짜지 않는다 — 초안·교정 두 번만 부른다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "문장" }] });
    await scriptPOST(patchReq({ instruction: "더 짧게" }), ctx(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(2);
  });

  it("문단 수가 장면 수와 다르면 재시도하고, 계속 다르면 502", async () => {
    const p = await projectWithScript(); // 장면 1개
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "가" }, { text: "나" }] });
    const res = await scriptPOST(patchReq({}), ctx(p.id));
    expect(res.status).toBe(502);
  });

  it("synopsis_version을 붙여 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValue({ paragraphs: [{ text: "문장" }] });
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.synopsis_version).toBe(1);
    expect(saved.version).toBe(2);
  });
});
```

기존 `describe("POST /api/projects/[id]/script"…)` 안의 교정 폴백 테스트(`:185`, `:218` 근처)는 픽스처에서 `tag`·`coverage`를 지우고, 장면 수에 맞춰 문단 수를 맞춘다. 예: `:218`의 `draft2`가 문단 2개이므로 그 테스트에서만 구성을 장면 2개로 만든 프로젝트를 쓴다.

```js
async function projectWith2Scenes() {
  const p = await projectWithScript();
  return updateProject(p.id, (proj) => ({
    ...proj,
    synopsis: { ...SYN, scenes: [SYN.scenes[0], { role: "가격", shows: "가격표", says: "6500원", seconds: 3, facts: [] }] },
  }));
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — `Cannot find module '../app/api/projects/[id]/synopsis/route.js'`

- [ ] **Step 3: 구성 라우트를 만든다**

`app/api/projects/[id]/synopsis/route.js`

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateSynopsis } from "../../../../../lib/validate";
import { buildSynopsisMessages } from "../../../../../lib/synopsis";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));
  const photoIds = (project.material?.photos || []).map((p) => p.id);
  const { system, messages } = buildSynopsisMessages(project, instruction);

  let synopsis = null;
  for (let attempt = 0; attempt < 2 && !synopsis; attempt++) {
    try {
      synopsis = validateSynopsis(await callJson({ system, messages }), photoIds);
    } catch {
      break;
    }
  }
  if (!synopsis) {
    return Response.json({ error: "구성 만들기에 실패했어요. 다시 시도해 주세요." }, { status: 502 });
  }

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "synopsis",
    synopsis: {
      ...synopsis,
      version: (proj.synopsis?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ synopsis: updated.synopsis });
}
```

- [ ] **Step 4: 대본 라우트를 고친다**

`app/api/projects/[id]/script/route.js` 전체를 교체한다.

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import { buildScriptMessages, buildScriptEditMessages, editKeptContent } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }
  // 구성이 곧 설계도다. 없으면 대본이 따를 장면이 없다.
  if (!project.synopsis) {
    return Response.json({ error: "구성을 먼저 만들어 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));
  const sceneCount = project.synopsis.scenes.length;

  // 1단 초안 — 구성의 장면 수·순서를 그대로 따른다
  const { system, messages } = buildScriptMessages(project, instruction);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }), sceneCount);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하거나 분량을 흘리면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }), sceneCount);
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
      synopsis_version: proj.synopsis?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add "app/api/projects/[id]/synopsis/route.js" "app/api/projects/[id]/script/route.js" tests/routes.test.js
git commit -m "$(cat <<'EOF'
feat: 구성 라우트 신설 · 대본 라우트에서 기획 생성 삭제

대본 재생성이 더 이상 기획을 새로 짜지 않는다 — 사장님이 고른 방향이 흔들리지 않는다.
수정 지시와 beat시트가 경합하던 문제가 여기서 사라진다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 장면 직접 편집 (PATCH)

**Files:**
- Modify: `app/api/projects/[id]/route.js:32-42` (`script_paragraph` 블록 옆에 추가)
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: Task 4의 저장 형태
- Produces: `PATCH /api/projects/[id]` 가 `{ synopsis_scene: { idx, shows?, says? } }` 를 받는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js`의 PATCH describe 블록에 추가한다.

```js
describe("PATCH synopsis_scene", () => {
  it("장면의 shows·says를 고친다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: "고친화면", says: "고친요지" } }), ctx(p.id));
    const s = (await getProject(p.id)).synopsis.scenes[0];
    expect(s.shows).toBe("고친화면");
    expect(s.says).toBe("고친요지");
    expect(s.role).toBe("여는말"); // 나머지 필드는 건드리지 않는다
  });

  it("직접 편집은 version을 올리지 않는다 — 사장님이 고친 것이 stale 경고를 띄우면 안 된다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 0, shows: "고친화면" } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.version).toBe(1);
  });

  it("범위 밖 idx는 아무것도 바꾸지 않는다", async () => {
    const p = await projectWithScript();
    await PATCH(patchReq({ synopsis_scene: { idx: 9, shows: "엉뚱" } }), ctx(p.id));
    expect((await getProject(p.id)).synopsis.scenes[0].shows).toBe("화면");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js -t "synopsis_scene"`
Expected: FAIL — `expected '화면' to be '고친화면'`

- [ ] **Step 3: PATCH에 블록을 추가한다**

`app/api/projects/[id]/route.js`의 `script_paragraph` 블록 바로 아래에 넣는다.

```js
      // 장면 직접 편집. version을 올리지 않는다 — 사장님이 손으로 고친 것을
      // "구성이 바뀌었다"로 알리면 대본 화면에 거짓 경고가 뜨고, 그 버튼은 유료 호출이다.
      if (body.synopsis_scene && proj.synopsis && Number.isInteger(body.synopsis_scene.idx)) {
        const { idx, shows, says } = body.synopsis_scene;
        next.synopsis = {
          ...proj.synopsis,
          scenes: proj.synopsis.scenes.map((s, i) =>
            i !== idx ? s : {
              ...s,
              ...(typeof shows === "string" && shows.trim() ? { shows: shows.trim() } : {}),
              ...(typeof says === "string" && says.trim() ? { says: says.trim() } : {}),
            }
          ),
        };
      }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/api/projects/[id]/route.js" tests/routes.test.js
git commit -m "$(cat <<'EOF'
feat: 장면 직접 편집 PATCH — 오타 하나에 유료 재생성을 돌리지 않게

script_paragraph와 대칭. 직접 편집은 version을 올리지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 단계 7개로

**Files:**
- Modify: `lib/steps.js:5-12` (`STEPS`), `lib/steps.js:31-38` (`currentStepKey`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: `project.synopsis` 유무
- Produces: `STEPS`에 `{ key: "synopsis", seg: "synopsis" }` 추가. `currentStepKey`가 `"synopsis"`를 반환할 수 있다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/steps.test.js`에 추가한다.

```js
describe("구성 단계", () => {
  const confirmed = { briefing: { confirmed: true } };

  it("단계가 7개이고 ②가 구성이다", () => {
    expect(STEPS).toHaveLength(7);
    expect(STEPS[1]).toMatchObject({ key: "synopsis", label: "구성", seg: "synopsis" });
    expect(STEPS[2]).toMatchObject({ key: "script", label: "대본" });
  });

  it("브리핑만 확정됐으면 구성 단계다", () => {
    expect(currentStepKey(confirmed)).toBe("synopsis");
  });

  it("구성이 생기면 대본 단계다", () => {
    expect(currentStepKey({ ...confirmed, synopsis: { scenes: [] } })).toBe("script");
  });

  it("구성 없이 대본 단계에 갈 수 없다", () => {
    expect(isReachable("script", confirmed)).toBe(false);
    expect(isReachable("synopsis", confirmed)).toBe(true);
  });

  it("경로에서 구성 단계를 찾는다", () => {
    expect(stepFromPathname("/create/abc/synopsis")?.key).toBe("synopsis");
  });
});
```

파일 맨 위 import에 `isReachable`, `stepFromPathname`이 없으면 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — `expected 6 to be 7`

- [ ] **Step 3: `lib/steps.js`를 고친다**

`STEPS`를 교체한다.

```js
export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "synopsis", no: "②", label: "구성", seg: "synopsis" },
  { key: "script", no: "③", label: "대본", seg: "script" },
  { key: "voice", no: "④", label: "목소리", seg: "voice", soon: true },
  { key: "images", no: "⑤", label: "이미지", seg: "images" },
  { key: "video", no: "⑥", label: "영상", seg: "video", soon: true },
  { key: "done", no: "⑦", label: "완성", seg: "done", soon: true },
];
```

`currentStepKey`를 교체한다.

```js
// 프로젝트 상태 → 지금 있어야 할 단계.
// 문턱은 상태 문자열이 아니라 산출물의 유무다 — 브리핑 확정 → 구성 → 대본 순.
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  if (!project.synopsis) return "synopsis";
  if (project.status === "cuts") return "images";
  return "script";
}
```

`isReachable`은 그대로 둔다 — `STEPS` 순서를 읽으므로 자동으로 맞는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "$(cat <<'EOF'
feat: 구성 단계를 ②로 끼워 넣어 7단계로

문턱은 상태 문자열이 아니라 산출물의 유무다 — 브리핑 확정 → 구성 → 대본.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 컷이 장면에서 갈라져 나오게

**Files:**
- Modify: `lib/cuts.js` 전체
- Modify: `lib/validate.js` (`validateCuts` 시그니처)
- Modify: `app/api/projects/[id]/cuts/route.js` 또는 `lib/pipeline.js` 중 `validateCuts`를 부르는 곳
- Test: `tests/cuts.test.js`, `tests/validate.test.js`

**Interfaces:**
- Consumes: `project.synopsis.scenes` (Task 1), `project.script.paragraphs` (Task 3)
- Produces:
  - `buildCutsMessages(project) → { system, messages }` — 구성을 함께 주입
  - `validateCuts(obj, photoIds, sceneCount) → Array<{idx, scene_idx, sentence, seconds, source, regen_count, ref_photo_id?}> | null`
  - `buildImagePrompt(cut, project)` — 시그니처 그대로. 내부에서 `project.synopsis.scenes[cut.scene_idx].shows`를 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js`의 픽스처를 고치고 테스트를 추가한다.

```js
const project = {
  settings: { aspect_ratio: "9:16" },
  material: { text: "자료", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  briefing: { topic: "생딸기라떼" },
  synopsis: {
    angle: "매일 맛이 다른 라떼",
    scenes: [
      { role: "여는말", shows: "딸기 과육이 우유에 섞이는 클로즈업", says: "오늘 한 잔은 다르다", seconds: 3, facts: [] },
      { role: "마감", shows: "성수역 3번 출구에서 카페까지 걷는 시점 샷", says: "도보 2분", seconds: 4, facts: [] },
    ],
  },
  script: { paragraphs: [{ text: "요즘 이거 모르면 손해" }, { text: "성수역 3번 출구 2분입니다" }] },
};

describe("buildCutsMessages — 구성 주입", () => {
  it("장면의 보여줌이 지문에 들어간다", () => {
    const user = buildCutsMessages(project).messages[0].content;
    expect(user).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(user).toContain("성수역 3번 출구에서 카페까지 걷는 시점 샷");
  });

  it("문단이 장면 번호와 함께 붙는다", () => {
    const user = buildCutsMessages(project).messages[0].content;
    expect(user).toContain("장면 0");
    expect(user).toContain("요즘 이거 모르면 손해");
  });

  it("컷이 장면 경계를 넘지 말라고 지시하고 scene_idx를 요구한다", () => {
    const { system } = buildCutsMessages(project);
    expect(system).toContain("scene_idx");
    expect(system).toContain("장면 경계를 넘지 않는다");
  });
});

describe("buildImagePrompt — 화면 근거", () => {
  it("나레이션 문장이 아니라 장면의 보여줌을 쓴다", () => {
    const cut = { idx: 0, scene_idx: 0, sentence: "요즘 이거 모르면 손해", seconds: 3 };
    const p = buildImagePrompt(cut, project);
    expect(p).toContain("딸기 과육이 우유에 섞이는 클로즈업");
    expect(p).not.toContain("요즘 이거 모르면 손해");
  });

  it("구성이 없는 옛 프로젝트는 문장으로 폴백한다", () => {
    const cut = { idx: 0, sentence: "옛 문장", seconds: 3 };
    const p = buildImagePrompt(cut, { ...project, synopsis: undefined });
    expect(p).toContain("옛 문장");
  });
});
```

`tests/validate.test.js`의 `validateCuts` 블록에 추가한다.

```js
it("scene_idx가 범위 밖이면 null", () => {
  const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 5 }] };
  expect(validateCuts(obj, [], 2)).toBeNull();
});

it("scene_idx가 없으면 null — 컷은 반드시 어느 장면의 것인지 밝힌다", () => {
  const obj = { cuts: [{ sentence: "가", seconds: 3 }] };
  expect(validateCuts(obj, [], 2)).toBeNull();
});

it("scene_idx를 컷에 남긴다", () => {
  const obj = { cuts: [{ sentence: "가", seconds: 3, scene_idx: 1 }] };
  expect(validateCuts(obj, [], 2)[0].scene_idx).toBe(1);
});
```

기존 `validateCuts` 테스트들은 세 번째 인자와 `scene_idx: 0`을 픽스처에 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/validate.test.js`
Expected: FAIL — `buildImagePrompt`가 아직 `cut.sentence`를 쓴다

- [ ] **Step 3: `lib/cuts.js`를 고친다**

`CUTS_SYSTEM`과 `buildCutsMessages`를 교체한다.

```js
// 컷 분할: 구성의 장면을 화면 단위로 쪼갠다. 컷의 화면 근거는 나레이션 문장이 아니라 장면의 '보여줌'이다.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.
const CUTS_SYSTEM = `너는 숏폼 영상 편집자다. 확정된 구성의 장면을 컷으로 나눈다.
반드시 JSON 하나만 출력: {"cuts":[{"scene_idx":이 컷이 속한 장면 번호,"sentence":"컷의 나레이션 문장","seconds":초(2~15),"ref_photo_id":"이 컷에 사진 속 피사체가 나오면 참조할 사진 id(없으면 생략)"}]}
규칙:
- 컷은 장면 경계를 넘지 않는다. 한 장면의 나레이션을 그 장면 안에서만 나누고, scene_idx로 어느 장면의 것인지 밝힌다.
- 한 장면이 짧으면 컷 하나로 두어도 된다. 억지로 쪼개지 않는다.
- 각 컷의 seconds는 그 문장을 자연스러운 속도로 읽는 실제 소요 시간으로 잡는다.
- 모든 컷의 화면은 AI가 새로 그린다. 업로드 사진을 화면에 그대로 넣지 않는다.
- 컷에 사진 속 피사체(제품·장소·인물)가 등장하면 ref_photo_id로 그 사진을 지정 — 그 외형을 참조해 그린다(일관성의 기준).`;

export function buildCutsMessages(project) {
  const { material, script, synopsis } = project;
  const photos = material.photos.map((p) => `- id:${p.id} 파일명:${p.filename}`).join("\n") || "(없음)";
  const scenes = (synopsis?.scenes || [])
    .map((s, i) => `장면 ${i} (${s.role}) 약 ${s.seconds}초 / 보여줌: ${s.shows}`)
    .join("\n");
  const lines = script.paragraphs.map((p, i) => `장면 ${i}: ${p.text}`).join("\n");
  const user = `[구성]
앵글: ${synopsis?.angle || "(없음)"}
${scenes}
[대본 — 장면별 나레이션]
${lines}
[업로드 사진 목록]
${photos}`;
  return { system: CUTS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

`buildImagePrompt`의 `Scene:` 부분을 고친다. 함수 앞부분에 한 줄을 넣고 템플릿을 바꾼다.

```js
export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  // 화면 근거는 장면의 '보여줌'이다. 나레이션 문장은 귀로 듣는 것이지 그릴 대상이 아니다.
  // 구성이 없는 옛 프로젝트는 예전처럼 문장으로 폴백한다.
  const scene = project.synopsis?.scenes?.[cut.scene_idx];
  const shows = scene?.shows || cut.sentence;
  // 주제 앵커 — 장면이 제품을 직접 안 담아도(가격·위치 장면 등) 전 컷이 같은 대상을 그리게 한다.
  const subject = project.briefing?.topic
    ? ` The video's subject is: ${project.briefing.topic}. Keep this exact product/subject consistent in every scene.`
    : "";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${shows}.${subject} Cinematic lighting, realistic, no text or letters in the image.`;
  if (cut.ref_photo_id) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
    p += ` Important correction requested by the user, apply it strictly: ${cut.edit_instruction}.`;
  }
  return p;
}
```

- [ ] **Step 4: `validateCuts`에 `scene_idx`를 더한다**

`lib/validate.js`의 `validateCuts` 시그니처와 루프를 고친다.

```js
export function validateCuts(obj, photoIds, sceneCount) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) return null;
  if (!obj || !Array.isArray(obj.cuts) || obj.cuts.length === 0) return null;
  const out = [];
  for (const c of obj.cuts) {
    if (typeof c?.sentence !== "string" || !c.sentence.trim()) return null;
    const seconds = Number(c.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    // 컷은 반드시 어느 장면의 것인지 밝힌다 — 이미지 프롬프트가 그 장면의 shows를 읽는다
    const sceneIdx = Number(c.scene_idx);
    if (!Number.isInteger(sceneIdx) || sceneIdx < 0 || sceneIdx >= sceneCount) return null;
    // 모든 컷은 AI 생성. 사진은 화면에 직접 쓰지 않는다.
    // 구모델이 photo 컷을 내놔도 그 사진을 레퍼런스로 승격해, 사진이 결과에 반영되되 항상 생성을 거친다.
    const cut = { idx: out.length, scene_idx: sceneIdx, sentence: c.sentence, seconds, source: "ai", regen_count: 0 };
    const ref = c.ref_photo_id || c.photo_id;
    if (ref && photoIds.includes(ref)) cut.ref_photo_id = ref; // 없는 레퍼런스는 조용히 제거
    out.push(cut);
  }
  return out;
}
```

- [ ] **Step 5: 호출처와 가드를 고친다**

호출처는 `lib/pipeline.js:22` 한 곳이다. `defaultDeps.splitCuts`를 교체한다.

```js
  splitCuts: async (project) => {
    const { system, messages } = buildCutsMessages(project);
    const photoIds = project.material.photos.map((p) => p.id);
    const sceneCount = project.synopsis?.scenes?.length || 0;
    for (let i = 0; i < 2; i++) {
      const cuts = validateCuts(await callJson({ system, messages }), photoIds, sceneCount);
      if (cuts) return cuts;
    }
    throw new Error("컷 분할 실패");
  },
```

`app/api/projects/[id]/cuts/route.js:9`의 대본 가드 바로 아래에 구성 가드를 더한다.

```js
  if (!project.synopsis) return Response.json({ error: "구성을 먼저 만들어 주세요" }, { status: 400 });
```

`tests/validate.test.js:2`의 import에서 `validatePlan`을 `validateSynopsis`로 바꾸는 것을 잊지 않는다(Task 1에서 이미 했다면 그대로 둔다).

- [ ] **Step 6: 통과를 확인한다**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/validate.js app lib/pipeline.js tests/cuts.test.js tests/validate.test.js
git commit -m "$(cat <<'EOF'
feat: 이미지 프롬프트의 원천을 나레이션 문장에서 scene.shows로

대본이 짧고 세지면 화면 근거도 함께 얇아지던 문제를 여기서 끊는다.
컷은 장면 경계를 넘지 않고 scene_idx로 소속을 밝힌다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 화면

**Files:**
- Create: `app/create/[id]/synopsis/page.js`
- Modify: `app/create/[id]/script/page.js:96-118`
- Test: 없음 (이 저장소는 화면 테스트가 없다 — `npm test` 회귀와 육안 확인으로 대신한다)

**Interfaces:**
- Consumes: `POST …/synopsis`, `PATCH { synopsis_scene }` (Task 4·5), `currentStepKey` (Task 6)
- Produces: `/create/[id]/synopsis` 경로

- [ ] **Step 1: 구성 화면을 만든다**

`app/create/[id]/synopsis/page.js` — 대본 화면(`app/create/[id]/script/page.js`)의 구조를 그대로 따른다. 자동 생성 1회 가드(`autoGenFor`)를 반드시 옮긴다. 없으면 StrictMode에서 두 번 호출돼 과금이 두 배가 된다.

```jsx
"use client";

// ② 구성 — 영상이 어떤 장면으로 어떻게 흘러갈지. 사장님이 승인하는 첫 게이트.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";

export default function SynopsisStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  // 자동 생성이 한 번만 돌게 막는다 — busy는 비동기라 effect가 두 번 불리면 과금이 두 배가 된다.
  const autoGenFor = useRef(null);

  useEffect(() => {
    if (project && !project.synopsis && project.briefing?.confirmed && autoGenFor.current !== id) {
      autoGenFor.current = id;
      gen();
    }
  }, [project?.status, project?.briefing?.confirmed, id]);

  async function gen(instr) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/synopsis`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instr ? { instruction: instr } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "구성 만들기 실패");
    await load(id).catch(() => {});
    setBusy(false); setInstruction("");
  }

  async function editScene(idx, field, value) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ synopsis_scene: { idx, [field]: value } }),
    });
    await load(id).catch(() => {});
  }

  if (!project.synopsis) {
    if (err) {
      return (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" disabled={busy} onClick={() => gen()}>다시 만들기</button>
        </p>
      );
    }
    return <p className="pgsub">구성을 짜는 중…</p>;
  }

  const { angle, scenes } = project.synopsis;
  const total = scenes.reduce((a, s) => a + s.seconds, 0);
  // 브리핑을 고쳐 다시 확정하면 버전이 오른다 — 지금 구성이 그 이전 것인지 알려주기만 한다
  const stale =
    project.briefing?.version && project.synopsis.briefing_version &&
    project.synopsis.briefing_version !== project.briefing.version;

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>구성을 확인해 주세요 <span className="badge vlm">승인 게이트 1</span></h2>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
      {stale && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          브리핑이 바뀌었어요 — 지금 구성은 바뀌기 전 내용이에요{" "}
          <button className="mini" disabled={busy} onClick={() => gen()}>구성 다시 만들기</button>
        </p>
      )}
      <div className="script-box">
        <p><b>이 영상이 말하는 한 가지</b><br />{angle}</p>
        {scenes.map((s, i) => (
          <p key={i}>
            <span className="tag">{i + 1}. {s.role} · 약 {s.seconds}초</span><br />
            <b>보여줌</b>{" "}
            <span
              contentEditable suppressContentEditableWarning style={{ outline: "none" }}
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== s.shows) editScene(i, "shows", v);
              }}
            >{s.shows}</span><br />
            <b>할 말</b>{" "}
            <span
              contentEditable suppressContentEditableWarning style={{ outline: "none" }}
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== s.says) editScene(i, "says", v);
              }}
            >{s.says}</span>
          </p>
        ))}
      </div>
      <div className="script-src">
        {scenes.length}장면 · 약 {total}초 예정 · 글을 클릭하면 바로 고칠 수 있어요
        {" "}(초는 배분 계획이고, 실제 길이는 목소리를 입힐 때 정해져요)
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "flex-end" }}>
        <textarea
          className="sent-input"
          style={{ flex: 1, minHeight: 96, padding: "13px 15px", fontSize: 14, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
          placeholder="고치고 싶은 곳을 적어주세요 — 예: 가격 장면을 앞으로"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <button className="mini" disabled={busy || !instruction.trim()} onClick={() => gen(instruction)}>
          이대로 고치기
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="mini" disabled={busy} onClick={() => gen()}>처음부터 다시</button>
        <button disabled={busy} onClick={() => router.push(`/create/${id}/script`)}>
          이 구성으로 대본 쓰기 →
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 대본 화면을 고친다**

`app/create/[id]/script/page.js`에서 다섯 곳을 고친다.

1. 헤더 주석과 제목의 게이트 번호: `// ② 대본` → `// ③ 대본`, `<span className="badge vlm">승인 게이트 1</span>` → `승인 게이트 2`.

2. stale 판정을 구성 기준으로 바꾼다(86~88줄).

```js
  // 구성을 다시 만들면 버전이 오른다 — 지금 대본이 그 이전 것인지 알려주기만 한다
  const staleScript =
    project.synopsis?.version && project.script.synopsis_version &&
    project.script.synopsis_version !== project.synopsis.version;
```

3. stale 안내 문구를 바꾼다.

```jsx
          구성이 바뀌었어요 — 지금 대본은 바뀌기 전 내용이에요{" "}
```

4. 문단 렌더에서 `p.tag` 대신 장면의 역할을 쓴다(100~104줄).

```jsx
        {project.script.paragraphs.map((p, i) => (
          <p key={i}>
            <span className="tag">{project.synopsis?.scenes?.[i]?.role || `${i + 1}`}</span>
```

5. `coverage` 블록(116~118줄)을 통째로 지운다.

- [ ] **Step 3: 회귀를 확인한다**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 4: 육안으로 확인한다**

Run: `npm run dev`

새 프로젝트를 만들어 자료를 넣고 브리핑을 확정한 뒤 확인한다.

- 사이드바에 ①자료 ②구성 ③대본 … ⑦완성 7개가 보인다
- ②구성이 자동으로 생성되고 앵글 + 장면 목록이 뜬다
- 장면의 "보여줌"을 클릭해 고치면 새로고침해도 남아 있다
- "이 구성으로 대본 쓰기"를 누르면 ③대본으로 넘어가고 문단 수가 장면 수와 같다
- ②로 돌아가 "처음부터 다시"를 누른 뒤 ③으로 가면 "구성이 바뀌었어요" 안내가 뜬다

- [ ] **Step 5: 커밋**

```bash
git add "app/create/[id]/synopsis/page.js" "app/create/[id]/script/page.js"
git commit -m "$(cat <<'EOF'
feat: 구성 게이트 화면 신설 · 대본 화면을 구성 기준으로

문단의 역할 라벨은 장면에서 가져오고, coverage 블록은 걷어낸다.
stale 기준이 브리핑에서 구성으로 바뀐다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 라이브 검증

**Files:**
- Modify: `.superpowers/sdd/live-verify.mjs`

**Interfaces:**
- Consumes: Task 1~3의 모든 export
- Produces: 사람이 읽는 검증 출력 (자동 판정 아님)

- [ ] **Step 1: 스크립트를 고친다**

import를 바꾼다.

```js
import { buildSynopsisMessages } from "../../lib/synopsis.js";
import { buildScriptMessages, buildScriptEditMessages, editKeptContent } from "../../lib/script.js";
import { validateBriefing, validateSynopsis, validateScript } from "../../lib/validate.js";
```

기획 블록(`// 2) 기획` 부분)을 구성으로 바꾼다.

```js
  // 2) 구성 — shows/says가 갈라져 나오는지, says가 완성 문장이 아닌지 눈으로 본다
  const sMsg = buildSynopsisMessages(project);
  const synopsis = validateSynopsis(await callJson({ system: sMsg.system, messages: sMsg.messages }), []);
  if (!synopsis) { console.log("\n-- 구성: 실패(스키마)"); continue; }
  project.synopsis = { ...synopsis, version: 1, briefing_version: 1 };
  const total = synopsis.scenes.reduce((a, s) => a + s.seconds, 0);
  console.log(`\n-- 구성: 앵글="${synopsis.angle}" · 장면 ${synopsis.scenes.length}개 · 합 ${total}초${synopsis.scenes.length < 3 ? "  ⚠ 장면 3개 미만" : ""}`);
  synopsis.scenes.forEach((s, i) => {
    console.log(`    ${i + 1}.(${s.role}) ${s.seconds}초`);
    console.log(`       보여줌: ${s.shows}`);
    console.log(`       할 말 : ${s.says}${/[.!?]$|다\.$|요\.$/.test(s.says) ? "  ⚠ 완성 문장처럼 보임" : ""}`);
  });
```

초안·교정 블록에서 `plan` 인자를 빼고 `validateScript`에 장면 수를 넘긴다.

```js
  const n = synopsis.scenes.length;
  const dMsg = buildScriptMessages(project);
  const draft = validateScript(await callJson({ system: dMsg.system, messages: dMsg.messages }), n);
  if (!draft) { console.log("-- 초안: 실패(장면 수 불일치 가능)"); continue; }
  printScript("초안", draft);

  const eMsg = buildScriptEditMessages(draft);
  const edited = validateScript(await callJson({ system: eMsg.system, messages: eMsg.messages }), n);
  const final = editKeptContent(draft, edited) ? edited : draft;
  printScript(edited ? (final === edited ? "교정 채택" : "교정 폐기→초안") : "교정 실패→초안", final);
  console.log(`  금지어: ${scanBanned(final).join(", ") || "0"} · 권유형 ${softImperatives(final)}회 · 문단 ${final.paragraphs.length}/${n}`);
```

`printScript`에서 `p.tag`를 인덱스로 바꾼다.

```js
function printScript(label, s) {
  console.log(`  [${label}] 문단 ${s?.paragraphs?.length ?? 0} · 공백제외 ${chars(s)}자`);
  (s?.paragraphs || []).forEach((p, i) => console.log(`    ${i + 1}. ${p.text}`));
}
```

- [ ] **Step 2: 실제로 태운다**

Run: `node .superpowers/sdd/live-verify.mjs`

자료 4건(빵집·딸기라떼·라떼아트·필라테스)에 대해 아래를 **눈으로** 확인하고 결과를 `.superpowers/sdd/progress.md`에 적는다.

- ⓐ `shows`가 실제로 그릴 수 있는 화면인가 — 피사체·행동·화면 크기가 있는가, "정성이 느껴지는" 같은 추상어가 아닌가
- ⓑ `says`가 완성 낭독 문장이 아닌가 (⚠ 표시가 몇 개 뜨는가)
- ⓒ 문단 수가 장면 수와 일치하는가 (`문단 N/N`)
- ⓓ 금지어가 0인가 — 07-26 개편의 성과를 깨지 않았는가
- ⓔ 얕은 자료(필라테스 37자)에서 장면이 3개 미만으로 나오는가 (⚠ 표시)

ⓔ에서 장면이 1개만 나온다면 프롬프트의 `scenes는 3~8개` 지시를 강화하거나(예: "자료가 얕아도 최소 3장면") 사용자에게 보고한다. 검증기를 고쳐 막지는 않는다.

- [ ] **Step 3: 전체 회귀**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 4: 커밋**

```bash
git add .superpowers/sdd/live-verify.mjs .superpowers/sdd/progress.md
git commit -m "$(cat <<'EOF'
test: 라이브 검증을 구성 단계까지 확장

shows가 그릴 수 있는 화면인지, says가 완성 문장이 아닌지,
문단 수가 장면 수를 지키는지를 자료 4건으로 눈으로 본다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `npm test` 전부 그린
- `node .superpowers/sdd/live-verify.mjs` 4건에서 ⓐ~ⓓ 통과, ⓔ 결과가 `progress.md`에 기록됨
- `npm run dev`에서 자료 → 구성 → 대본 → 이미지까지 실제로 한 번 통과
- 푸시하지 않음 (배포는 사용자 요청 시)
