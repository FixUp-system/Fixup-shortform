# 대본 생성 품질 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대본에서 AI 티·광고 상투어를 걷어내고 담담한 사실 위주 목소리로 만든다 — 담담 프롬프트(1단) + 자기 교정 패스(2단).

**Architecture:** `lib/script.js`의 초안 프롬프트(SYSTEM)를 담담 문체·금지어·대조 예시로 다시 쓰고, 초안을 받아 상투어만 걷어내는 `buildScriptEditMessages(draft)`를 새로 만든다. 라우트는 초안 생성 → 교정 패스 순으로 LLM을 두 번 부르고, 교정이 실패하면 초안으로 폴백한다. 스키마·파이프라인은 바뀌지 않는다.

**Tech Stack:** Next.js 15 App Router (JS), vitest, gpt-4o(`lib/llm.js`의 `callJson`), 파일 저장소(`lib/projects.js`)

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-24-script-quality-design.md`
- 프롬프트·주석은 한국어. 사용자 대면 문구도 한국어
- **금지어(정확히)**: 특별한 · 만나보세요 · 경험해보세요 · 자랑합니다 · 다양한 · 완벽한 · 놓치지 마세요 · 최고의 · 진정한 · 잊지 못할 · 지금 바로 · 함께하세요, 그리고 "~해보세요"류 무른 명령형 남발
- **교정 패스 입력은 초안뿐** — 원문 자료를 다시 주지 않는다. 초안의 사실을 하나도 빠뜨리지 않고, 새 사실을 더하지 않는다
- 교정이 실패(빈 JSON·스키마 불일치·오류)하면 **초안으로 폴백**한다 — 대본을 아예 잃지 않는다
- 2단(초안+교정)은 **초안 생성과 수정 지시/전체 다시 쓰기 양쪽 모두**에 적용된다
- 스키마·파이프라인 변경 금지. 프롬프트 추가 + LLM 호출 1회 추가뿐 (YAGNI)
- 기존 프롬프트 규칙 유지: 분량은 자료가 정함, coverage 나열, 과장·허위 금지, tag는 역할, "성격은 자료가 정한다"(neutrality)
- 테스트는 vitest. 기존 75개 그린이 하한선. 각 태스크는 자기 테스트를 추가한다
- 커밋 메시지는 한국어. 각 태스크 끝에 커밋

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/script.js` (수정) | `SYSTEM`(초안 프롬프트) 담담 재작성 + `buildScriptEditMessages(draft)` 신설 |
| `app/api/projects/[id]/script/route.js` (수정) | 초안 → 교정 → 폴백 2단 흐름 |
| `tests/script.test.js` (수정) | 담담 프롬프트·교정 프롬프트 단언 |
| `tests/routes.test.js` (수정) | 라우트 2단 저장·폴백 |

---

### Task 1: 초안 프롬프트를 담담 문체로 재작성

**Files:**
- Modify: `lib/script.js` (`SYSTEM` 상수, 파일 상단)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `buildScriptMessages`의 반환 system이 담담 문체·금지어·대조 예시를 담는다. 시그니처·반환 형태는 그대로

- [ ] **Step 1: Write the failing test**

`tests/script.test.js`의 `describe("buildScriptMessages", ...)` 안에 추가:

```js
  it("담담한 목소리를 지시하고 상투어를 금지한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toMatch(/담담|평서문/);
    expect(system).toContain("특별한");     // 금지 목록에 이름을 올려 못 쓰게 한다
    expect(system).toContain("만나보세요");
    expect(system).toContain("쓰지 않는다"); // 금지 지시문
  });
  it("대조 예시를 톤 참고용으로만 제시한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("베끼지 말 것");
    expect(system).toContain("시럽을 쓰지 않습니다"); // 담담한 예
  });
  it("성격 중립·훅 비강제는 그대로 유지한다", () => {
    const { system } = buildScriptMessages(project);
    expect(system).toContain("성격");   // 성격은 자료가 정한다
    expect(system).not.toContain("반드시");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — 새 문구(담담/베끼지 말 것 등)가 아직 프롬프트에 없다

- [ ] **Step 3: Write minimal implementation**

`lib/script.js`의 `SYSTEM` 상수를 통째로 아래로 교체한다:

```js
const SYSTEM = `너는 짧은 영상의 대본 작가다. 주어진 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
목소리는 담담하게, 사실 위주로. 광고 문구가 아니라 사실이 스스로 말하게 한다.
규칙:
- 분량은 자료가 정한다 — 자료에 담긴 내용을 빠짐없이, 군살 없이. 자료가 적으면 짧게, 많으면 길게 (3~8문단).
- 평서문 위주로 사실을 단언한다("시럽은 쓰지 않습니다"). "~해보세요"류 권유를 남발하지 않는다.
- 형용사로 부풀리지 않는다. 수치·고유명사·행동 같은 구체적 사실이 스스로 말하게 한다. 한 문장에 한 가지, 짧게.
- 첫 문단은 자료의 성격에 맞게 연다 — 단, 광고 문구가 아니라 가장 구체적이고 센 사실로.
- 다음 표현은 쓰지 않는다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.
- tag는 그 문단이 하는 역할을 짧게 적는다. 여는말·상황·본문·전환·희소성·마무리 같은 것이 예시이고, 자료에 맞는 다른 이름을 써도 된다.
아래는 톤 참고용 예시다(내용을 베끼지 말 것):
✗ 나쁜 예: "성수동에서 특별한 딸기라떼를 만나보세요. 신선함을 자랑합니다."
✓ 담담한 예: "카페 미영은 딸기라떼에 시럽을 쓰지 않습니다. 매일 아침 논산 설향 딸기를 직접 갈아요. 하루 40잔만 만듭니다."`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/script.test.js`
Expected: PASS (기존 buildScriptMessages 테스트 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 대본 초안 프롬프트를 담담 문체로 — 금지어·대조 예시"
```

---

### Task 2: 교정 패스 프롬프트 (`buildScriptEditMessages`)

**Files:**
- Modify: `lib/script.js` (새 export + 새 상수)
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: 없음 (초안 객체 `{paragraphs:[{tag,text}], coverage:[]}`만 받는다)
- Produces: `buildScriptEditMessages(draft) -> {system, messages}`

- [ ] **Step 1: Write the failing test**

`tests/script.test.js` 상단 import에 `buildScriptEditMessages`를 추가한다:

```js
import { buildScriptMessages, buildScriptEditMessages, estimateSeconds } from "../lib/script.js";
```

파일 끝에 describe 추가:

```js
describe("buildScriptEditMessages", () => {
  const draft = {
    paragraphs: [{ tag: "여는말", text: "특별한 딸기라떼를 만나보세요" }],
    coverage: ["시럽 안 씀"],
  };
  it("다듬을 초안 문장과 반영 포인트가 프롬프트에 들어간다", () => {
    const user = buildScriptEditMessages(draft).messages[0].content;
    expect(user).toContain("특별한 딸기라떼를 만나보세요");
    expect(user).toContain("시럽 안 씀");
  });
  it("사실 유지·상투어 제거·새 사실 추가 금지를 지시한다", () => {
    const { system } = buildScriptEditMessages(draft);
    expect(system).toContain("빠뜨리지 않는다");
    expect(system).toContain("만나보세요");       // 없앨 표현 목록
    expect(system).toContain("더하지 않는다");     // 새 사실 금지
    expect(system).toContain("paragraphs");        // 초안과 같은 출력 스키마
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/script.test.js`
Expected: FAIL — `buildScriptEditMessages is not a function`

- [ ] **Step 3: Write minimal implementation**

`lib/script.js`의 `estimateSeconds` 정의 **위**(또는 아래, 파일 내 아무 곳)에 추가한다:

```js
// 자기 교정 패스 — 초안에서 광고 티·상투어만 걷어낸다. 입력은 초안뿐(원문 자료를 다시 주지 않는다).
const EDIT_SYSTEM = `너는 대본을 다듬는 편집자다. 주어진 대본에서 광고 티·상투어·무른 명령형을 걷어내고 담담한 평서문으로 다시 쓴다.
출력은 JSON 하나로 한다: {"paragraphs":[{"tag":"문단의 역할","text":"문장"}],"coverage":["반영한 포인트"]}
규칙:
- 대본에 있는 사실을 하나도 빠뜨리지 않는다 — 수치·고유명사·위치·특징 그대로. 새 사실을 만들어 더하지 않는다.
- 다음 표현을 없앤다: 특별한, 만나보세요, 경험해보세요, 자랑합니다, 다양한, 완벽한, 놓치지 마세요, 최고의, 진정한, 잊지 못할, 지금 바로, 함께하세요. "~해보세요"류 권유도 평서문으로 바꾼다.
- 형용사로 부풀리지 않는다. 사실이 스스로 말하게 한다. 한 문장에 한 가지, 짧게.
- 문단 수와 구조, tag는 대본 그대로 유지한다. 클리셰 제거 외에 내용을 바꾸지 않는다.
- coverage는 대본의 것을 유지한다.`;

export function buildScriptEditMessages(draft) {
  const body = draft.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n");
  const user = `[다듬을 대본]
${body}
[반영 포인트]
${(draft.coverage || []).join(", ")}`;
  return { system: EDIT_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/script.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/script.js tests/script.test.js
git commit -m "feat: 대본 교정 패스 프롬프트 — 상투어 제거·사실 유지"
```

---

### Task 3: 라우트 2단 흐름 (초안 → 교정 → 폴백)

**Files:**
- Modify: `app/api/projects/[id]/script/route.js`
- Test: `tests/routes.test.js`

**Interfaces:**
- Consumes: `buildScriptMessages`(기존), `buildScriptEditMessages`(Task 2), `callJson`, `validateScript`, `updateProject`
- Produces: `POST /api/projects/[id]/script`가 초안을 교정본으로 다듬어 저장. 교정 실패 시 초안 저장

- [ ] **Step 1: Write the failing test**

`tests/routes.test.js` 상단의 라우트 import 묶음에 script POST를 추가한다(기존 `briefingPOST` import 줄 아래):

```js
const { POST: scriptPOST } = await import("../app/api/projects/[id]/script/route.js");
```

파일 끝에 describe 추가:

```js
describe("POST /api/projects/[id]/script (2단 생성)", () => {
  const cliche = { paragraphs: [{ tag: "여는말", text: "특별한 라떼를 만나보세요" }], coverage: ["시럽 안 씀"] };
  const plain = { paragraphs: [{ tag: "여는말", text: "시럽을 쓰지 않습니다" }], coverage: ["시럽 안 씀"] };

  it("초안을 교정본으로 다듬어 저장한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValueOnce(plain);
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("시럽을 쓰지 않습니다");
  });

  it("교정이 실패하면 초안으로 폴백한다", async () => {
    const p = await projectWithScript();
    llmMock.callJson.mockResolvedValueOnce(cliche).mockResolvedValue({}); // 교정 응답이 스키마 불일치
    await scriptPOST(patchReq({}), ctx(p.id));
    const saved = (await getProject(p.id)).script;
    expect(saved.paragraphs[0].text).toBe("특별한 라떼를 만나보세요");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — 지금 라우트는 교정 패스가 없어 초안(특별한 라떼)이 그대로 저장된다 → 첫 테스트가 "시럽을 쓰지 않습니다"를 기대하다 실패

- [ ] **Step 3: Write minimal implementation**

`app/api/projects/[id]/script/route.js`를 아래로 교체한다:

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import { buildScriptMessages, buildScriptEditMessages } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.briefing?.confirmed) {
    return Response.json({ error: "브리핑을 먼저 확정해 주세요" }, { status: 400 });
  }

  const { instruction } = await req.json().catch(() => ({}));
  const { system, messages } = buildScriptMessages(project, instruction);

  // 1단 초안
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!draft) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  // 2단 자기 교정 — 광고 티·상투어 제거. 실패하면 초안으로 폴백(작업을 잃지 않는다).
  let edited = null;
  const edit = buildScriptEditMessages(draft);
  for (let attempt = 0; attempt < 2 && !edited; attempt++) {
    try {
      edited = validateScript(await callJson({ system: edit.system, messages: edit.messages }));
    } catch {
      break;
    }
  }
  const script = edited || draft;

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    // 어느 브리핑에서 나온 대본인지 찍어둔다 — 브리핑이 다시 확정되면 화면이 차이를 알 수 있다
    script: {
      ...script,
      version: (proj.script?.version || 0) + 1,
      briefing_version: proj.briefing?.version || 1,
    },
  }));
  return Response.json({ script: updated.script });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — 전체 그린 (기존 75 + 신규분)

- [ ] **Step 5: Commit**

```bash
git add "app/api/projects/[id]/script/route.js" tests/routes.test.js
git commit -m "feat: 대본 생성 2단 — 초안 후 자기 교정, 실패 시 초안 폴백"
```

---

### Task 4: 라이브 검증 (실제 gpt-4o 전후 비교)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-24-script-quality-design.md` (구현 중 달라진 판단이 있으면 그 줄만)

**Interfaces:**
- Consumes: 앞선 태스크 전부
- Produces: 없음(검증)

이 태스크는 프롬프트 품질을 실제 호출로 확인한다. **dev 서버가 http://localhost:3000 에 떠 있다**(가짜 이미지 모드일 수 있으나 대본은 실제 OpenAI를 쓴다 — 이미지와 무관). 떠 있지 않으면 `npm run dev`로 띄우되 `npx next build`는 돌리지 않는다(dev 서버의 `.next`가 깨진다).

- [ ] **Step 1: 정보 충분 자료로 실제 대본 생성 (2회)**

아래를 두 번 실행해 재현성을 본다. 한국어는 UTF-8 바이트로 보낸다.

```powershell
$body = @'
{"material":{"text":"성수동 카페 미영에서 이번 주부터 생딸기라떼를 팝니다. 매일 아침 7시에 논산에서 온 설향 딸기를 직접 갈아서 만들고 시럽은 쓰지 않습니다. 한 잔 6,500원이고 오전 11시부터 하루 40잔 한정입니다. 4월 중순까지만 판매합니다. 성수역 3번 출구 도보 2분.","photos":[]}}
'@
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
$p = (Invoke-WebRequest -Uri http://localhost:3000/api/projects -Method POST -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing).Content | ConvertFrom-Json
Invoke-WebRequest -Uri "http://localhost:3000/api/projects/$($p.id)/briefing" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing | Out-Null
Invoke-WebRequest -Uri "http://localhost:3000/api/projects/$($p.id)" -Method PATCH -ContentType 'application/json' -Body '{"briefing":{"confirmed":true}}' -UseBasicParsing | Out-Null
$s = (Invoke-WebRequest -Uri "http://localhost:3000/api/projects/$($p.id)/script" -Method POST -ContentType 'application/json' -Body '{}' -UseBasicParsing -TimeoutSec 120).Content | ConvertFrom-Json
$s.script.paragraphs | ForEach-Object { "$($_.tag): $($_.text)" }
```

확인:
- 금지어(특별한·만나보세요·경험해보세요·자랑합니다 등)가 **나오지 않는다**
- 사실(6,500원·40잔·논산 설향·시럽 안 씀·오전 11시·4월 중순·성수역 3번 출구)이 **다 살아 있다**
- 첫 문단이 광고 문구가 아니라 **센 사실**로 연다
- 두 번 다 담담한지(재현성)

- [ ] **Step 2: 정보 부족 자료로도 완결되는지 확인**

```powershell
$body = @'
{"material":{"text":"필라테스 소도구 수업 새로 시작합니다. 처음 하시는 분도 괜찮아요.","photos":[]}}
'@
# Step 1과 같은 순서로 briefing→confirm→script 실행, 대본 출력
```

확인: 자료가 적어도 대본이 완결되고(빈 대본·오류 아님) 담담하다.

- [ ] **Step 3: 회귀 확인**

Run: `npx vitest run`
Expected: 전체 그린

- [ ] **Step 4: 리포트 및 커밋**

실제 생성된 대본(전후 비교)을 리포트에 붙인다. 스펙과 달라진 판단이 있으면 스펙의 그 줄만 고친다.

```bash
git add -A
git commit -m "docs: 대본 품질 라이브 검증 결과 반영"
```

만약 금지어가 여전히 새거나 사실이 빠지면 **프롬프트를 고칠 자리**는 둘이다: 초안이 문제면 `SYSTEM`(Task 1), 교정이 못 잡으면 `EDIT_SYSTEM`(Task 2). 코드 후처리 필터는 넣지 않는다(한국어 어미 변화로 부서진다 — 스펙 "하지 않는 것").

---

## 구현 중 판단이 필요할 때

- **교정이 사실을 빠뜨리면**: `EDIT_SYSTEM`의 "하나도 빠뜨리지 않는다"를 더 강하게(예: "모든 수치와 고유명사를 그대로 옮겨라") 조인다. 그래도 안 되면 교정 패스가 원문 대신 초안의 coverage를 대조하도록 프롬프트에 명시.
- **교정이 과하게 밋밋해지면**: `EDIT_SYSTEM`에 "문장을 지우지 말고 표현만 바꿔라"를 명시. 문단 수 유지는 이미 규칙에 있다.
- **2단이 너무 느리면(체감)**: 지금은 순차 2회 호출이다. 병렬화 불가(교정은 초안에 의존). 체감 문제면 사용자와 상의 — 범위 밖.
