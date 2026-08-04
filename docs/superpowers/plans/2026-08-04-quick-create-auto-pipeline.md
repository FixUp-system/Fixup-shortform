# 빠른 생성 → 단계별 파이프라인 자동 관통 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빠른 생성(홈 대화)이 t2v 단일 클립 대신 단계별 파이프라인(자료→대본→컷→목소리→이미지→클립→합성)을 검토 게이트 없이 자동 관통해 완성본 mp4 를 낸다.

**Architecture:** 새 `lib/auto.js` 오케스트레이터가 기존 `lib/pipeline.js` 단계 함수들을 순서대로 await 로 잇는다(무수정 재사용). 라우트 안에 있던 브리핑 추출·대본 생성 루프는 lib 로 추출해 라우트와 오케스트레이터가 같은 함수를 부른다. 자기 HTTP 호출은 쓰지 않는다(withUser 가 middleware 주입 헤더를 신뢰하므로 자기호출=헤더 위조 모양).

**Tech Stack:** Next.js 15 (App Router, JS), Vitest 4, Supabase(메모리 스토어는 테스트 전용), OpenAI raw fetch, fal raw fetch.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-04-quick-create-auto-pipeline-design.md`
- **기존 파이프라인 함수(runSplitPipeline 등 5개 + regen 3개)는 수정 금지** — 재사용만
- 런타임 의존성 추가 금지(raw fetch·Node 내장만). 화면("use client")이 import 하는 모듈에 `fs` 가 딸려 들어가면 빌드가 깨진다 — 화면은 `lib/steps.js`·`lib/styles.js`·`lib/voices.js`(순수 데이터)만 import
- UI·메시지·주석 전부 한국어
- 실패 컷 재시도는 기존 regen 함수로 **1회만**(3회 상한 내 소진). VLM needs_attention 은 통과
- 닫힌 목록(target/aspect/style/voice) 밖 값이 유료 호출로 새지 않게 코드가 검증
- 테스트: `npx vitest run` 전체 그린 유지. 커밋은 태스크마다
- **라이브 유료 검증(fal 실호출)은 별도 사용자 승인 후** — 이 계획에는 없음
- ⚠️ dev 서버 켠 채 `npm run build` 금지(.next 가 덮인다)

## 파일 구조

| 파일 | 역할 |
|---|---|
| Create `lib/briefing-extract.js` | 브리핑 추출 LLM 루프(라우트+auto 공용) |
| Create `lib/script-gen.js` | 대본 초안→되돌리기→교정 루프(라우트+auto 공용) |
| Create `lib/auto.js` | 오케스트레이터 `runAutoPipeline` |
| Create `app/api/projects/[id]/auto/route.js` | 자동 관통 시작 라우트 |
| Modify `app/api/projects/[id]/briefing/route.js` | 추출 루프를 lib 호출로 교체 |
| Modify `app/api/projects/[id]/script/route.js` | 생성 루프를 lib 호출로 교체 |
| Modify `app/api/chat/route.js` | generate 스키마를 단계별 입력으로 개편 |
| Rewrite `components/QuickCreate.jsx` | 요약 카드+[만들기]+진행 폴링+완성 재생 |
| Modify `app/page.js` | 홈 문구 갱신 |
| Delete `app/api/video/route.js`, `app/api/video/status/route.js` | t2v 경로 제거 |
| Delete `tests/quick-create-budget.test.js` | 대상 라우트 제거(예산 가드는 budget.test.js·budget-user.test.js 가 lib 차원에서 이미 검증) |
| Modify `tests/minor1-uncovered-routes.test.js` | /api/video/status 케이스 제거 |
| Test `tests/auto.test.js`, `tests/auto-route.test.js`, `tests/chat-generate.test.js`, `tests/quick-create-ui.test.js` | 신규 |

---

### Task 1: `lib/briefing-extract.js` — 브리핑 추출 루프 추출

**Files:**
- Create: `lib/briefing-extract.js`
- Modify: `app/api/projects/[id]/briefing/route.js:43-56` (추출 루프 → lib 호출)
- Test: `tests/auto.test.js` (신규 파일, describe "extractBriefing")

**Interfaces:**
- Consumes: `buildBriefingMessages(project)` (lib/briefing.js), `validateBriefing(raw, materialText)` (lib/validate.js), `callJson({system, messages, stage, projectId})` (lib/llm.js)
- Produces: `extractBriefing(project, { llm } = {}) → Promise<briefing|null>` — Task 3 의 auto 오케스트레이터와 브리핑 라우트가 부른다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auto.test.js` 생성:

```js
// 자동 관통(lib/auto.js)과 그 재료(추출 루프)의 계약 테스트.
// 스토어는 vitest.setup.js 가 SHOTFORM_STORE=memory 로 세운다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { extractBriefing } from "../lib/briefing-extract.js";

// validateBriefing 스키마를 통과하는 최소 형태 — briefing.test.js 의 실물과 같은 키
const RAW_BRIEFING = {
  topic: "딸기라떼 신메뉴",
  key_points: ["국산 딸기 사용", "이번 주 출시"],
  questions: [],
};

describe("extractBriefing", () => {
  beforeEach(() => resetMemoryStore());

  it("LLM 응답이 검증을 통과하면 브리핑을 돌려준다", async () => {
    const project = { id: "p1", material: { text: "국산 딸기 딸기라떼 이번 주 출시" } };
    const briefing = await extractBriefing(project, { llm: async () => RAW_BRIEFING });
    expect(briefing).toBeTruthy();
    expect(briefing.topic).toBe("딸기라떼 신메뉴");
  });

  it("첫 호출이 죽으면 한 번 더 부르고, 두 번째가 성공하면 그것을 쓴다", async () => {
    let calls = 0;
    const llm = async () => {
      calls += 1;
      if (calls === 1) throw new Error("일시 실패");
      return RAW_BRIEFING;
    };
    const project = { id: "p1", material: { text: "자료" } };
    const briefing = await extractBriefing(project, { llm });
    expect(calls).toBe(2);
    expect(briefing).toBeTruthy();
  });

  it("두 번 다 실패하면 null — 던지지 않는다(응답 코드는 부르는 쪽의 일)", async () => {
    const llm = async () => { throw new Error("죽음"); };
    const briefing = await extractBriefing({ id: "p1", material: { text: "자료" } }, { llm });
    expect(briefing).toBeNull();
  });
});
```

⚠️ `RAW_BRIEFING` 은 `lib/validate.js` 의 `validateBriefing` 실물 스키마에 맞춰라 — 위 키가 안 맞으면 **테스트 픽스처를 실물에 맞추고**(validateBriefing 소스와 tests/briefing.test.js 의 기존 픽스처 참조), 검증기를 고치지 마라.

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auto.test.js` / Expected: FAIL — `lib/briefing-extract.js` 없음

- [ ] **Step 3: 구현** — `lib/briefing-extract.js`:

```js
// 브리핑 추출 루프 — 라우트(POST /briefing)와 자동 관통(lib/auto.js)이 같은 것을 부른다.
// 라우트 안에 있던 코드를 글자 그대로 옮긴 것이다(2026-08-04, 자동 관통 스펙).
// 실패는 null 로 알린다 — 502 냐 auto.state=failed 냐는 부르는 쪽이 정한다.
import { callJson } from "./llm";
import { validateBriefing } from "./validate";
import { buildBriefingMessages } from "./briefing";

export async function extractBriefing(project, { llm = callJson } = {}) {
  const { system, messages } = buildBriefingMessages(project);
  let briefing = null;
  for (let attempt = 0; attempt < 2 && !briefing; attempt++) {
    try {
      // 자료 원문을 함께 넘긴다 — 이미 답이 적혀 있는 질문을 코드가 버린다
      briefing = validateBriefing(
        await llm({ system, messages, stage: "브리핑", projectId: project.id }),
        project.material?.text || ""
      );
    } catch (e) {
      // 일시적 호출 실패는 삼키고 다음 시도로 — 루프 조건이 상한을 쥔다.
      console.error("자료 정리 실패:", e);
    }
  }
  return briefing;
}
```

브리핑 라우트의 44~56행 루프를 다음으로 교체(import 정리 포함 — `callJson`·`validateBriefing`·`buildBriefingMessages` 는 develop 분기가 계속 쓰는 것만 남긴다):

```js
  const briefing = await extractBriefing(project);
```

(develop 분기·502 처리·updateProject 머지는 그대로 둔다.)

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auto.test.js tests/briefing.test.js tests/routes.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/briefing-extract.js "app/api/projects/[id]/briefing/route.js" tests/auto.test.js && git commit -m "refactor: 브리핑 추출 루프를 lib 로 — 자동 관통과 라우트가 같은 것을 부른다"`

---

### Task 2: `lib/script-gen.js` — 대본 생성 루프 추출

**Files:**
- Create: `lib/script-gen.js`
- Modify: `app/api/projects/[id]/script/route.js:25-90` (생성 루프 → lib 호출)
- Test: `tests/auto.test.js` (describe "generateScript" 추가)

**Interfaces:**
- Consumes: `buildScriptMessages/buildScriptRewriteMessages/buildScriptEditMessages/editKeptContent/scriptFaults/scriptScore/targetChars` (lib/script.js), `validateScript` (lib/validate.js), `callJson` (lib/llm.js)
- Produces: `generateScript(project, id, { instruction, llm } = {}) → Promise<script|null>` — script 는 `{text, ...}` (version 필드 없음, 부르는 쪽이 붙인다)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auto.test.js` 에 추가:

```js
import { generateScript } from "../lib/script-gen.js";

// validateScript 를 통과하는 최소 형태 — tests/script.test.js 의 실물 픽스처와 같은 키.
// ⚠️ 키가 다르면 픽스처를 실물에 맞춰라(검증기 수정 금지).
const RAW_SCRIPT = { text: "국산 딸기를 쓴 딸기라떼가 이번 주에 나옵니다. 매장에서 만나 보세요." };

const PROJECT = {
  id: "p1",
  material: { text: "국산 딸기 딸기라떼 이번 주 출시" },
  briefing: { topic: "딸기라떼", key_points: ["국산 딸기"], confirmed: true, version: 1 },
  settings: { target_seconds: 15 },
};

describe("generateScript", () => {
  it("초안이 검증을 통과하면 대본을 돌려준다", async () => {
    const script = await generateScript(PROJECT, "p1", { llm: async () => RAW_SCRIPT });
    expect(script).toBeTruthy();
    expect(typeof script.text).toBe("string");
  });

  it("모든 시도가 실패하면 null", async () => {
    const script = await generateScript(PROJECT, "p1", {
      llm: async () => { throw new Error("죽음"); },
    });
    expect(script).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auto.test.js` / Expected: FAIL — `lib/script-gen.js` 없음

- [ ] **Step 3: 구현** — `lib/script-gen.js` 를 만들고 **script 라우트 25~90행(초안 루프 → 1.5단 되돌리기 → 2단 교정, 로그 포함)을 글자 그대로 옮긴다.** 골격:

```js
// 대본 생성 루프(초안 → 되돌리기 ≤3회 → 교정) — 라우트(POST /script)와
// 자동 관통(lib/auto.js)이 같은 것을 부른다. 라우트에서 글자 그대로 옮겼다(2026-08-04).
import { callJson } from "./llm";
import { validateScript } from "./validate";
import {
  buildScriptMessages, buildScriptEditMessages, buildScriptRewriteMessages,
  editKeptContent, scriptFaults, scriptScore, targetChars,
} from "./script";

export async function generateScript(project, id, { instruction, llm = callJson } = {}) {
  // ── 1단 초안 (라우트 26~37행 그대로, callJson → llm)
  const { system, messages } = buildScriptMessages(project, instruction);
  let draft = null;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    try {
      draft = validateScript(await llm({ system, messages, stage: "대본", projectId: id }));
    } catch (e) {
      console.error("대본 초안 생성 실패:", e);
    }
  }
  if (!draft) return null;

  // ── 1.5단 되돌리기 (라우트 39~71행 그대로: target/chars/tag 로그, 3라운드,
  //     scriptScore 비교로 채택/기각, callJson → llm 만 바꾼다)
  // ── 2단 교정 (라우트 73~90행 그대로: editKeptContent + worse 판정 + 최종 로그)
  //     ... (옮길 때 한 줄도 다시 쓰지 말 것 — diff 가 이동으로 보여야 한다)
  return script;
}
```

라우트는 다음으로 줄인다(가드·updateProject·응답은 그대로):

```js
  const script = await generateScript(project, id, { instruction });
  if (!script) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auto.test.js tests/script.test.js tests/routes.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/script-gen.js "app/api/projects/[id]/script/route.js" tests/auto.test.js && git commit -m "refactor: 대본 생성 루프를 lib 로 — 자동 관통과 라우트가 같은 것을 부른다"`

---

### Task 3: `lib/auto.js` — 오케스트레이터

**Files:**
- Create: `lib/auto.js`
- Test: `tests/auto.test.js` (describe "runAutoPipeline" 추가)

**Interfaces:**
- Consumes: `extractBriefing` (Task 1), `generateScript` (Task 2), `runSplitPipeline/runVoicePipeline/runImagesPipeline/runVideoPipeline/runRenderPipeline/regenVoice/regenCut/regenClip` (lib/pipeline.js — **무수정**), `getProject/updateProject/createProject` (lib/projects.js)
- Produces: `runAutoPipeline(projectId, ownerId, deps = {}) → Promise<void>` — 진행 상태를 `project.auto = { stage, state: "running"|"done"|"failed", error }` 로 남긴다. stage ∈ `"briefing"|"script"|"cuts"|"voice"|"images"|"clips"|"render"`. Task 4 라우트와 Task 6 화면이 이 계약을 본다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auto.test.js` 에 추가:

```js
import { runAutoPipeline } from "../lib/auto.js";
import * as projects from "../lib/projects.js";

const OWNER = "00000000-0000-4000-8000-000000000001";

async function makeProject() {
  return projects.createProject({
    ownerId: OWNER,
    settings: { aspect_ratio: "9:16", target_seconds: 15 },
    material: { text: "국산 딸기 딸기라떼 이번 주 출시", photos: [] },
  });
}

// 성공 경로에서 파이프라인 단계가 프로젝트에 남기는 최소 흔적을 흉내 낸다.
// 스토어를 실제로 거친다 — deps 는 "무엇을 불렀나"와 "무엇을 남겼나"를 함께 검증한다.
function happyDeps(calls) {
  const mark = (name, patch) => async (id, ownerId) => {
    calls.push(name);
    if (patch) await projects.updateProject(id, ownerId, patch);
  };
  return {
    extractBriefing: async () => { calls.push("briefing"); return { topic: "딸기라떼", key_points: [], questions: [] }; },
    generateScript: async () => { calls.push("script"); return { text: "문장 하나." }; },
    runSplitPipeline: mark("split", (p) => ({ ...p, status: "cuts",
      cuts: [{ idx: 0, sentence: "문장 하나.", seconds: 3, state: "pending", regen_count: 0 }] })),
    runVoicePipeline: mark("voice", (p) => ({ ...p, status: "voice",
      cuts: p.cuts.map((c) => ({ ...c, audio: { url: "a0", seconds: 3 }, seconds: 3 })) })),
    runImagesPipeline: mark("images", (p) => ({ ...p, status: "images",
      cuts: p.cuts.map((c) => ({ ...c, state: "done", image: { url: "i0" } })) })),
    runVideoPipeline: mark("clips", (p) => ({ ...p, status: "video",
      cuts: p.cuts.map((c) => ({ ...c, video: { url: "v0", seconds: 3 } })) })),
    runRenderPipeline: mark("render", (p) => ({ ...p, status: "done", render: { url: "/r.mp4" } })),
    regenVoice: async () => calls.push("regenVoice"),
    regenCut: async () => calls.push("regenCut"),
    regenClip: async () => calls.push("regenClip"),
  };
}

describe("runAutoPipeline", () => {
  beforeEach(() => resetMemoryStore());

  it("단계를 순서대로 관통하고 auto.state=done 을 남긴다", async () => {
    const p = await makeProject();
    const calls = [];
    await runAutoPipeline(p.id, OWNER, happyDeps(calls));
    expect(calls).toEqual(["briefing", "script", "split", "voice", "images", "clips", "render"]);
    const done = await projects.getProject(p.id, OWNER);
    expect(done.auto).toEqual({ stage: "render", state: "done", error: null });
    expect(done.briefing.confirmed).toBe(true);   // 자동 확정
    expect(done.script.version).toBe(1);
    expect(done.status).toBe("done");
  });

  it("실패 컷은 해당 regen 을 1회만 부르고 강행한다", async () => {
    const p = await makeProject();
    const calls = [];
    const deps = happyDeps(calls);
    // 목소리 단계가 컷 하나를 voice_error 로 남긴다 — regenVoice 가 정확히 1회 불려야 한다
    deps.runVoicePipeline = async (id, ownerId) => {
      calls.push("voice");
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "voice",
        cuts: proj.cuts.map((c) => ({ ...c, voice_error: "읽지 못했어요" })) }));
    };
    await runAutoPipeline(p.id, OWNER, deps);
    expect(calls.filter((c) => c === "regenVoice")).toHaveLength(1);
    const done = await projects.getProject(p.id, OWNER);
    expect(done.auto.state).toBe("done"); // 재시도가 실패해도(스텁이라 상태 그대로) 멈추지 않는다
  });

  it("브리핑 추출이 끝내 실패하면 auto.state=failed 를 남기고 던진다", async () => {
    const p = await makeProject();
    const deps = happyDeps([]);
    deps.extractBriefing = async () => null;
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    const failed = await projects.getProject(p.id, OWNER);
    expect(failed.auto.state).toBe("failed");
    expect(failed.auto.error).toBeTruthy();
  });

  it("클립이 하나도 없으면 합성 없이 failed — 빈 완성본을 만들지 않는다", async () => {
    const p = await makeProject();
    const calls = [];
    const deps = happyDeps(calls);
    deps.runVideoPipeline = async (id, ownerId) => {
      calls.push("clips");
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "video",
        cuts: proj.cuts.map((c) => ({ ...c, video_error: "만들지 못했어요" })) }));
    };
    deps.regenClip = async () => calls.push("regenClip"); // 재시도도 실패(상태 그대로)
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    expect(calls).not.toContain("render");
    expect((await projects.getProject(p.id, OWNER)).auto.state).toBe("failed");
  });

  it("컷 분할이 빈 컷을 남기면 failed", async () => {
    const p = await makeProject();
    const deps = happyDeps([]);
    deps.runSplitPipeline = async (id, ownerId) => {
      await projects.updateProject(id, ownerId, (proj) => ({ ...proj, status: "cuts", cuts: [] }));
    };
    await expect(runAutoPipeline(p.id, OWNER, deps)).rejects.toThrow();
    expect((await projects.getProject(p.id, OWNER)).auto.state).toBe("failed");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auto.test.js` / Expected: FAIL — `lib/auto.js` 없음

- [ ] **Step 3: 구현** — `lib/auto.js`:

```js
// 자동 관통 — 빠른 생성이 단계별 파이프라인을 검토 게이트 없이 끝까지 민다.
// 단계 함수는 lib/pipeline.js 의 것을 무수정 재사용한다. 이 파일이 하는 일은 셋뿐이다:
// 게이트를 순서대로 눌러 주는 것, 실패 컷을 1회 재시도하고 강행하는 것, 진행을 auto 로 남기는 것.
//
// 실패 정책(스펙 확정): 재시도 1회 후 강행. VLM 물림(needs_attention)은 그대로 통과 —
// 이 저장소는 VLM 을 믿지 않는다(명백한 오류를 아홉 번 통과시켰다).
import { getProject, updateProject } from "./projects";
import { extractBriefing } from "./briefing-extract";
import { generateScript } from "./script-gen";
import {
  runSplitPipeline, runVoicePipeline, runImagesPipeline, runVideoPipeline,
  runRenderPipeline, regenVoice, regenCut, regenClip,
} from "./pipeline";

const defaultDeps = {
  extractBriefing, generateScript,
  runSplitPipeline, runVoicePipeline, runImagesPipeline, runVideoPipeline, runRenderPipeline,
  regenVoice, regenCut, regenClip,
};

export async function runAutoPipeline(projectId, ownerId, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const setAuto = (patch) =>
    updateProject(projectId, ownerId, (p) => ({ ...p, auto: { ...p.auto, ...patch } }));
  // 실패 컷만 1회 재시도한다. regen 은 3회 상한을 스스로 세므로 여기서는 세지 않는다.
  // 재시도 실패는 삼킨다 — 강행이 정책이고, 남은 실패는 완성본에서 그 컷이 빠지는 것으로 나타난다.
  const retryEach = async (pred, regen) => {
    const project = await getProject(projectId, ownerId);
    for (const cut of project?.cuts || []) {
      if (pred(cut)) await regen(projectId, ownerId, cut.idx).catch((e) =>
        console.error(`[자동 ${projectId.slice(0, 8)}] 컷${cut.idx + 1} 재시도 실패:`, e?.message));
    }
  };

  try {
    // ① 브리핑 — 추출 후 자동 확정. asked 질문은 답 없이 두고 develop 라운드는 없다.
    await setAuto({ stage: "briefing", state: "running", error: null });
    let project = await getProject(projectId, ownerId);
    if (!project) throw new Error("프로젝트를 찾을 수 없어요");
    const briefing = await d.extractBriefing(project);
    if (!briefing) throw new Error("자료를 정리하지 못했어요");
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "briefing",
      briefing: { ...briefing, confirmed: true, version: 1 },
    }));

    // ② 대본 — 승인 없이 채택. 버전 부여는 script 라우트와 같은 규칙.
    await setAuto({ stage: "script" });
    project = await getProject(projectId, ownerId);
    const script = await d.generateScript(project, projectId);
    if (!script) throw new Error("대본 생성에 실패했어요");
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "script",
      script: { ...script, version: (p.script?.version || 0) + 1, briefing_version: p.briefing?.version || 1 },
    }));

    // ③ 컷 — 선저장(cuts 라우트와 같은 순서: status 를 먼저 세워야 화면 가드가 통과한다)
    await setAuto({ stage: "cuts" });
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "cuts", cuts: [], cuts_error: null,
      cuts_script_version: p.script?.version || 1,
    }));
    await d.runSplitPipeline(projectId, ownerId);
    project = await getProject(projectId, ownerId);
    if (!(project?.cuts || []).length) throw new Error("컷을 나누지 못했어요");

    // ④ 목소리 — voice_id 는 auto 라우트가 대화에서 받은 것을 이미 세워 두었다
    await setAuto({ stage: "voice" });
    await d.runVoicePipeline(projectId, ownerId);
    await retryEach((c) => c.voice_error, d.regenVoice);

    // ⑤ 이미지 — needs_attention 은 통과. 그림 자체가 없는 컷만 다시 산다.
    //    source:"photo" 컷은 생성 대상이 아니다(processCut 이 바로 done 으로 보낸다).
    await setAuto({ stage: "images" });
    await d.runImagesPipeline(projectId, ownerId);
    await retryEach((c) => c.source !== "photo" && !c.image?.url, d.regenCut);

    // ⑥ 클립 — 그림은 있는데 클립이 없는 컷만
    await setAuto({ stage: "clips" });
    await d.runVideoPipeline(projectId, ownerId);
    await retryEach((c) => c.image?.url && !c.video?.url, d.regenClip);

    // ⑦ 합성 — 클립 없는 컷은 합성이 이미 거른다(lib/compose.js 의 usable 필터).
    //    전부 없으면 합성을 부르지 않는다: 빈 완성본은 "결과가 나왔다"는 거짓말이다.
    project = await getProject(projectId, ownerId);
    if (!(project?.cuts || []).some((c) => c.video?.url)) {
      throw new Error("클립이 하나도 만들어지지 않았어요");
    }
    await setAuto({ stage: "render" });
    await d.runRenderPipeline(projectId, ownerId);

    await setAuto({ state: "done", error: null });
  } catch (e) {
    await setAuto({ state: "failed", error: e?.message || "자동 생성에 실패했어요" }).catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auto.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add lib/auto.js tests/auto.test.js && git commit -m "feat: 자동 관통 오케스트레이터 — 단계 재사용, 재시도 1회 후 강행"`

---

### Task 4: `POST /api/projects/[id]/auto` — 시작 라우트

**Files:**
- Create: `app/api/projects/[id]/auto/route.js`
- Test: `tests/auto-route.test.js`

**Interfaces:**
- Consumes: `runAutoPipeline` (Task 3), `VOICES` (lib/voices.js), `getProject/updateProject` (lib/projects.js), `withUser` (lib/auth/require-user.js)
- Produces: `POST body {voice_label?}` → `202 {started:true}`. 404 남의/없는 프로젝트, 400 자료 없음, 409 이미 진행 중·이미 완성. Task 6 화면이 부른다

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/auto-route.test.js` (헤더 픽스처는 tests/quick-create-budget.test.js 패턴):

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";

// 라우트가 fire-and-forget 으로 부르는 오케스트레이터는 모킹한다 —
// 여기서 검증할 것은 가드·멱등·voice 배선이지 관통이 아니다(그건 tests/auto.test.js).
vi.mock("../lib/auto.js", () => ({ runAutoPipeline: vi.fn(async () => {}) }));
import { runAutoPipeline } from "../lib/auto.js";
import { POST } from "../app/api/projects/[id]/auto/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const headersFor = (id) => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
  "content-type": "application/json",
});
const reqAs = (id, body = {}) =>
  new Request("http://localhost/api/projects/x/auto", {
    method: "POST", headers: headersFor(id), body: JSON.stringify(body),
  });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function makeProject(ownerId = A) {
  return projects.createProject({
    ownerId, settings: { aspect_ratio: "9:16", target_seconds: 30 },
    material: { text: "자료", photos: [] },
  });
}

describe("POST /api/projects/[id]/auto", () => {
  beforeEach(() => { resetMemoryStore(); vi.clearAllMocks(); });

  it("시작하면 voice 를 배선하고 auto running 을 세운 뒤 202", async () => {
    const p = await makeProject();
    const res = await POST(reqAs(A, { voice_label: "밝은 여성" }), ctx(p.id));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ started: true });
    const saved = await projects.getProject(p.id, A);
    expect(saved.voice_id).toBe("Laura");           // lib/voices.js 실물 매핑
    expect(saved.voice_label).toBe("밝은 여성");
    expect(saved.auto).toEqual({ stage: "briefing", state: "running", error: null });
    expect(runAutoPipeline).toHaveBeenCalledWith(p.id, A);
  });

  it("모르는 voice_label 은 기본 목소리로 떨어진다 — 대화 LLM 이 목록 밖을 답해도 새지 않게", async () => {
    const p = await makeProject();
    await POST(reqAs(A, { voice_label: "우렁찬 외계인" }), ctx(p.id));
    expect((await projects.getProject(p.id, A)).voice_id).toBe("Sarah");
  });

  it("남의 프로젝트는 404 — 존재를 흘리지 않는다", async () => {
    const p = await makeProject(A);
    expect((await POST(reqAs(B), ctx(p.id))).status).toBe(404);
    expect(runAutoPipeline).not.toHaveBeenCalled();
  });

  it("이미 진행 중이면 409", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({
      ...proj, auto: { stage: "voice", state: "running", error: null } }));
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(409);
  });

  it("이미 완성본이 있으면 409 — $2.59 를 두 번 사지 않는다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, A, (proj) => ({ ...proj, render: { url: "/r.mp4" } }));
    expect((await POST(reqAs(A), ctx(p.id))).status).toBe(409);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/auto-route.test.js` / Expected: FAIL — 라우트 없음

- [ ] **Step 3: 구현** — `app/api/projects/[id]/auto/route.js`:

```js
// 자동 관통 시작 — 빠른 생성의 [만들기] 버튼이 부른다. 시작만 하고 폴링은 GET /projects/[id].
import { getProject, updateProject } from "../../../../../lib/projects";
import { runAutoPipeline } from "../../../../../lib/auto";
import { VOICES } from "../../../../../lib/voices";
import { withUser } from "../../../../../lib/auth/require-user.js";

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "자료가 없어요" }, { status: 400 });
  }
  // 멱등 가드 — 진행 중 재클릭·완성 후 재시작을 막는다. 한 번의 자동 관통이 ~$2.59 다.
  if (project.auto?.state === "running") {
    return Response.json({ error: "이미 만드는 중이에요" }, { status: 409 });
  }
  if (project.render?.url) {
    return Response.json({ error: "이미 완성한 프로젝트예요 — 보관함에서 확인해 주세요" }, { status: 409 });
  }

  // 목소리는 대화가 고른 라벨. 목록 밖이면 기본으로 — 임의 문자열이 fal 로 새지 않게.
  const body = await req.json().catch(() => ({}));
  const voice = VOICES.find((v) => v.label === body?.voice_label) || VOICES[0];

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    voice_id: voice.id, voice_label: voice.label, voice_error: null,
    auto: { stage: "briefing", state: "running", error: null },
  }));

  // 비동기 시작 — 실패 처리는 runAutoPipeline 이 auto.state=failed 로 스스로 남긴다
  runAutoPipeline(id, user.id).catch((e) => console.error("auto pipeline error:", e));
  return Response.json({ started: true }, { status: 202 });
});
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/auto-route.test.js tests/routes-auth.test.js` / Expected: PASS. routes-auth 가 라우트 목록을 열거식으로 검사한다면 새 라우트를 목록에 추가(위조 헤더 401 케이스 포함 — 기존 패턴 그대로)
- [ ] **Step 5: Commit** — `git add "app/api/projects/[id]/auto" tests/auto-route.test.js tests/routes-auth.test.js && git commit -m "feat: 자동 관통 시작 라우트 — 멱등 가드와 목소리 배선"`

---

### Task 5: `/api/chat` 개편 — 단계별 입력 산출

**Files:**
- Modify: `app/api/chat/route.js` (SYSTEM_PROMPT 교체 + generate 검증 교체)
- Test: `tests/chat-generate.test.js`

**Interfaces:**
- Consumes: `TARGET_CHOICES` (lib/script.js), `STYLE_PRESETS, DEFAULT_STYLE_ID` (lib/styles.js), `VOICES` (lib/voices.js)
- Produces: generate 응답 `{action:"generate", material_text, target_seconds:15|30|45|60, aspect_ratio, style:<preset id>, voice_label, summary}` — Task 6 화면이 소비. ask 응답은 기존 그대로

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/chat-generate.test.js` (OpenAI 는 global.fetch 스텁):

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST } from "../app/api/chat/route.js";

const headersFor = () => ({
  [USER_HEADER]: "00000000-0000-4000-8000-00000000000a",
  [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json",
});
const req = (messages) =>
  new Request("http://localhost/api/chat", {
    method: "POST", headers: headersFor(), body: JSON.stringify({ messages }),
  });
const openaiReply = (obj) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
});

describe("POST /api/chat — generate 스키마", () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = "sk-test"; });
  afterEach(() => vi.unstubAllGlobals());

  it("단계별 입력을 그대로 내보낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "generate", material_text: "국산 딸기 딸기라떼, 이번 주 출시, 5,500원",
      target_seconds: 15, aspect_ratio: "1:1", style: "illust",
      voice_label: "밝은 남성", summary: "딸기라떼 출시 홍보",
    })));
    const data = await (await POST(req([{ role: "me", text: "딸기라떼 홍보" }]))).json();
    expect(data).toEqual({
      action: "generate", material_text: "국산 딸기 딸기라떼, 이번 주 출시, 5,500원",
      target_seconds: 15, aspect_ratio: "1:1", style: "illust",
      voice_label: "밝은 남성", summary: "딸기라떼 출시 홍보",
    });
  });

  it("닫힌 목록 밖 값은 기본으로 — 유료 호출에 모르는 값이 실리지 않게", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "generate", material_text: "자료",
      target_seconds: 20, aspect_ratio: "4:3", style: "유화느낌", voice_label: "외계인",
    })));
    const data = await (await POST(req([{ role: "me", text: "x" }]))).json();
    expect(data.target_seconds).toBe(30);
    expect(data.aspect_ratio).toBe("9:16");
    expect(data.style).toBe("photo");
    expect(data.voice_label).toBe("차분한 여성");
  });

  it("material_text 가 비면 generate 로 받지 않는다(재시도 → 502)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({ action: "generate", material_text: "" })));
    expect((await POST(req([{ role: "me", text: "x" }]))).status).toBe(502);
  });

  it("ask 응답은 그대로 통과한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openaiReply({
      action: "ask", message: "길이는요?", quick_replies: ["15초", "30초", "그냥 바로 만들어줘"],
    })));
    const data = await (await POST(req([{ role: "me", text: "x" }]))).json();
    expect(data.action).toBe("ask");
    expect(data.quick_replies).toContain("그냥 바로 만들어줘");
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/chat-generate.test.js` / Expected: FAIL — 응답에 prompt/duration 만 있음

- [ ] **Step 3: 구현** — `app/api/chat/route.js`:

상단 import 추가:

```js
import { TARGET_CHOICES } from "../../../lib/script";
import { STYLE_PRESETS, DEFAULT_STYLE_ID } from "../../../lib/styles";
import { VOICES } from "../../../lib/voices";
```

`SYSTEM_PROMPT` 전체 교체:

```js
const SYSTEM_PROMPT = `너는 shotform의 영상 제작 도우미다. 사용자와 한국어로 대화하며 숏폼 완성 영상(낭독+자막 포함) 제작에 필요한 정보를 수집한다.

수집할 정보:
1) 자료: 영상의 주제·내용·살릴 포인트 (사용자의 첫 메시지에 대부분 담겨 있다)
2) 길이와 비율: 길이는 15|30|45|60(초, 숫자), 비율은 "9:16" | "1:1" | "16:9"
3) 느낌·톤: 예) 따뜻하고 아기자기하게 / 밝고 경쾌하게 / 고급스럽고 차분하게

규칙:
- 반드시 JSON 하나만 출력한다. 다른 텍스트 금지.
- 이미 받은 정보는 절대 다시 묻지 않는다. 질문은 최소로 — 길이와 비율은 한 질문으로 함께 묻고, 그 외에는 자료가 정말 부족할 때만 묻는다.
- **바로 만들기**: 사용자가 "그냥 만들어줘", "알아서 해줘", "바로 만들어", "질문 그만" 등 신호를 보내면 즉시 generate 한다. 부족한 정보는 기본값: 길이 30, 비율 "9:16", 화풍·목소리·느낌은 주제에 어울리게 네가 정한다.
- 아직 부족하면: {"action":"ask","message":"<한 가지만 묻는 질문>","quick_replies":["선택지1","선택지2","선택지3"]}
  - quick_replies는 2~4개, 마지막에는 항상 "그냥 바로 만들어줘"를 넣는다.
- 충분하면:
  {"action":"generate",
   "material_text":"<자료 원문 — 대화에서 받은 사실·포인트를 한국어 서술형으로. 제품명·가격·기간 같은 구체 디테일은 하나도 빠뜨리지 않는다. 지어내지 않는다>",
   "target_seconds":15|30|45|60,
   "aspect_ratio":"9:16"|"1:1"|"16:9",
   "style":"photo"|"illust"|"anime"|"studio"|"render3d"|"film"|"scifi",
   "voice_label":"차분한 여성"|"밝은 여성"|"차분한 남성"|"밝은 남성",
   "summary":"<수집 내용 한국어 한 줄 요약>"}

style 선택 기준: 실사가 어울리면 "photo", 아기자기·손그림 "illust", 애니메이션 "anime", 지브리풍 "studio", 3D "render3d", 영화룩 "film", SF·네온 "scifi". 모르겠으면 "photo".
voice_label 선택 기준: 느낌이 밝으면 "밝은 여성"/"밝은 남성", 차분·고급이면 "차분한 여성"/"차분한 남성". 모르겠으면 "차분한 여성".
material_text 는 프롬프트가 아니라 **자료**다 — 영어로 쓰지 말고, 연출 지시를 넣지 말고, 사용자가 준 사실만 담는다.`;
```

generate 분기(94~108행) 교체:

```js
      const material = typeof parsed.material_text === "string" ? parsed.material_text.trim() : "";
      if (parsed.action === "generate" && material) {
        // 닫힌 목록은 코드가 판정한다 — LLM 이 목록 밖을 답해도 유료 호출로 새지 않게.
        // 조용한 폴백인 이유: 여기 값은 사장님이 고른 것이 아니라 LLM 의 추천이라,
        // 400 으로 대화를 끊는 것보다 기본값으로 이어 가는 쪽이 맞다.
        return Response.json({
          action: "generate",
          material_text: material.slice(0, 4000),
          target_seconds: TARGET_CHOICES.includes(parsed.target_seconds) ? parsed.target_seconds : 30,
          aspect_ratio: ["9:16", "1:1", "16:9"].includes(parsed.aspect_ratio) ? parsed.aspect_ratio : "9:16",
          style: STYLE_PRESETS.some((s) => s.id === parsed.style) ? parsed.style : DEFAULT_STYLE_ID,
          voice_label: VOICES.some((v) => v.label === parsed.voice_label) ? parsed.voice_label : VOICES[0].label,
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
        });
      }
```

파일 상단 주석(1~3행)도 새 스키마로 갱신한다.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/chat-generate.test.js` / Expected: PASS
- [ ] **Step 5: Commit** — `git add app/api/chat/route.js tests/chat-generate.test.js && git commit -m "feat: 대화가 단계별 입력을 산출한다 — t2v 프롬프트 폐지"`

---

### Task 6: `QuickCreate.jsx` 개편 + 홈 문구

**Files:**
- Rewrite: `components/QuickCreate.jsx`
- Modify: `app/page.js:13-16` (문구)
- Test: `tests/quick-create-ui.test.js` (소스 판정 — staleness-ui.test.js 패턴)

**Interfaces:**
- Consumes: Task 5 generate 응답, `POST /api/projects` (기존: body `{material:{text,photos:[]}, settings:{target_seconds, aspect_ratio, style:{preset}}}` — style 은 `normalizeStyle` 이 `{preset, note}` 형태를 요구한다), Task 4 `POST /api/projects/[id]/auto` (body `{voice_label}`), `GET /api/projects/[id]` (폴링 — `auto.stage/state`, `render.url`), `STYLE_PRESETS` (lib/styles.js), `STEPS, stepHref, currentStepKey` (lib/steps.js — 셋 다 클라이언트 안전)
- Produces: 사용자 흐름 — 대화 → 요약 카드([만들기]) → 진행 표시 → 완성 재생/실패 링크

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/quick-create-ui.test.js`:

```js
// 화면 배선을 소스에서 판정한다(staleness-ui.test.js 패턴) — 이 저장소는 React 렌더 테스트가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("components/QuickCreate.jsx", "utf8");

describe("QuickCreate — 자동 관통 배선", () => {
  it("t2v 경로를 더는 부르지 않는다", () => {
    expect(src).not.toMatch(/api\/video/);
  });
  it("프로젝트 생성과 자동 관통 시작을 부른다", () => {
    expect(src).toMatch(/\/api\/projects"/);
    expect(src).toMatch(/\/auto/);
  });
  it("진행 폴링은 프로젝트 조회로 한다", () => {
    expect(src).toMatch(/\/api\/projects\/\$\{/);
  });
  it("실패 시 단계별 화면으로 보낸다 — stepHref 가 경로의 진실의 원천", () => {
    expect(src).toMatch(/stepHref/);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/quick-create-ui.test.js` / Expected: FAIL — src 에 api/video 잔존

- [ ] **Step 3: 구현** — `components/QuickCreate.jsx` 전체 교체:

```jsx
"use client";

// 빠른 생성 — 대화 몇 번으로 완성 영상(낭독·자막 포함)을 만든다.
// 대화가 자료·길이·비율·화풍·목소리를 모으면, 백엔드가 단계별 파이프라인을
// 검토 게이트 없이 자동 관통한다(POST /api/projects → POST /api/projects/[id]/auto).
// 진행은 GET /api/projects/[id] 폴링으로 본다 — auto.stage 가 진실의 원천이다.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { STYLE_PRESETS } from "../lib/styles";
import { STEPS, stepHref, currentStepKey } from "../lib/steps";

const GREETING = "안녕하세요! 어떤 영상을 만들까요? 한 줄로 편하게 알려주세요.";
const POLL_INTERVAL_MS = 5000;
// 전체 파이프라인(대본→목소리→그림→클립→합성)이라 t2v 시절 3분으로는 모자라다.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const STAGE_LABELS = {
  briefing: "자료를 정리하는 중",
  script: "대본을 쓰는 중",
  cuts: "장면을 나누는 중",
  voice: "목소리를 만드는 중",
  images: "그림을 그리는 중",
  clips: "영상을 만드는 중",
  render: "완성본을 합치는 중",
};

const styleLabel = (id) => STYLE_PRESETS.find((s) => s.id === id)?.label || id;

export default function QuickCreate() {
  const [messages, setMessages] = useState([
    { role: "ai", text: GREETING, hint: '예: "신메뉴 딸기라떼 홍보 영상 만들어줘"' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function push(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  // 실패 프로젝트는 단계별 화면에서 이어 만든다 — 경로는 steps.js 가 진실의 원천
  const continueHref = (project) =>
    stepHref(STEPS.find((s) => s.key === currentStepKey(project)) || STEPS[0], project.id);

  async function startAuto(params) {
    push({ role: "ai", text: "영상을 만들기 시작했어요.", spinner: true, stage: "briefing" });
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: { text: params.material_text, photos: [] },
          settings: {
            target_seconds: params.target_seconds,
            aspect_ratio: params.aspect_ratio,
            style: { preset: params.style },
          },
        }),
      });
      const project = await createRes.json();
      if (!createRes.ok || !project.id) throw new Error(project.error || "프로젝트 생성 실패");

      const autoRes = await fetch(`/api/projects/${project.id}/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_label: params.voice_label }),
      });
      const auto = await autoRes.json();
      if (!autoRes.ok) throw new Error(auto.error || "자동 생성 시작 실패");

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const stRes = await fetch(`/api/projects/${project.id}`);
        if (!stRes.ok) continue; // 일시적 실패는 다음 바퀴에
        const p = await stRes.json();
        const stage = p.auto?.stage || "briefing";
        setMessages((prev) =>
          prev.map((m) => (m.spinner ? { ...m, stage, text: `${STAGE_LABELS[stage] || "만드는 중"}…` } : m))
        );
        if (p.auto?.state === "done" && p.render?.url) {
          setMessages((prev) => [
            ...prev.filter((m) => !m.spinner),
            {
              role: "ai",
              text: "완성! 재생해 보세요. 보관함에도 저장돼 있어요.",
              video: p.render.url,
              aspect: params.aspect_ratio,
              archive: true,
            },
          ]);
          return;
        }
        if (p.auto?.state === "failed") {
          setMessages((prev) => [
            ...prev.filter((m) => !m.spinner),
            {
              role: "ai",
              text: `여기까지 만들다 멈췄어요 — ${p.auto.error || "이유를 몰라요"}\n만든 데까지는 남아 있어요. 이어서 직접 만들 수 있어요.`,
              continueTo: continueHref(p),
            },
          ]);
          return;
        }
      }
      throw new Error("시간이 너무 오래 걸려서 화면 갱신을 멈췄어요. 보관함에서 확인해 주세요.");
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.spinner),
        { role: "ai", text: `문제가 생겼어요 — ${e.message}` },
      ]);
    }
  }

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setBusy(true);

    const history = [...messages, { role: "me", text: trimmed }];
    push({ role: "me", text: trimmed });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => !m.spinner && !m.video)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "대화 실패");

      if (data.action === "ask") {
        push({ role: "ai", text: data.message, quickReplies: data.quick_replies });
      } else if (data.action === "generate") {
        push({
          role: "ai",
          text:
            `정리했어요 — ${data.summary || "요청하신 내용"}\n` +
            `(${data.target_seconds}초 · ${data.aspect_ratio} · ${styleLabel(data.style)} · ${data.voice_label})\n` +
            `아래 버튼을 누르면 완성까지 자동으로 만들어요. 바꾸고 싶은 게 있으면 그냥 이어서 말씀해 주세요.`,
          confirm: true,
          params: data,
        });
      } else {
        throw new Error("알 수 없는 응답");
      }
    } catch (e) {
      push({ role: "ai", text: `문제가 생겼어요 — ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function confirmGenerate(idx) {
    if (busy) return;
    const msg = messages[idx];
    if (!msg?.params) return;
    setBusy(true);
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, confirm: false } : m)));
    await startAuto(msg.params);
    setBusy(false);
  }

  return (
    <div className="chat-wrap">
      <div className="chat-card">
        <div className="chat" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`msg ${m.role}`}>
                {m.role === "ai" && <span className="who"><Icon name="play" size={14} /></span>}
                <div className="bub">
                  {m.spinner ? (
                    <span className="gen-bub">
                      <span className="spin" />
                      {m.text}
                    </span>
                  ) : (
                    m.text
                  )}
                  {m.hint && <small>{m.hint}</small>}
                  {m.video && (
                    <>
                      <video
                        className={`vid-result${m.aspect === "16:9" ? " wide" : ""}`}
                        src={m.video}
                        controls
                        playsInline
                        loop
                      />
                      <div className="res-ops">
                        <a className="mini" href="/archive"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          보관함에서 보기
                        </a>
                      </div>
                    </>
                  )}
                  {m.params && m.confirm && (
                    <details open>
                      <summary>영상에 담길 자료 (수정 가능)</summary>
                      <textarea
                        className="prompt-edit"
                        defaultValue={m.params.material_text}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMessages((prev) =>
                            prev.map((mm, ii) =>
                              ii === i ? { ...mm, params: { ...mm.params, material_text: v } } : mm
                            )
                          );
                        }}
                      />
                    </details>
                  )}
                  {m.confirm && (
                    <div className="res-ops">
                      <button
                        className="mini confirm-btn"
                        onClick={() => confirmGenerate(i)}
                        disabled={busy}
                      >
                        🎬 영상 만들기
                      </button>
                    </div>
                  )}
                  {m.continueTo && (
                    <div className="res-ops">
                      <a className="mini" href={m.continueTo}
                        style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                        이어서 직접 만들기
                      </a>
                    </div>
                  )}
                </div>
              </div>
              {m.quickReplies && m.quickReplies.length > 0 && i === messages.length - 1 && (
                <div className="quick">
                  {m.quickReplies.map((q) => (
                    <button key={q} onClick={() => send(q)} disabled={busy}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="만들고 싶은 영상을 알려주세요…"
            disabled={busy}
            aria-label="메시지 입력"
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? "진행 중…" : "보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

`app/page.js` 의 `pgsub` 문구 교체:

```jsx
      <p className="pgsub">
        대화로 필요한 정보만 모으면, 대본부터 완성까지 자동으로 만들어요.
        낭독과 자막이 들어간 완성 영상이 나와요.
      </p>
```

⚠️ `lib/styles.js`·`lib/steps.js` 는 순수 데이터/함수라 클라이언트 import 안전(파일 상단 주석이 그 성질을 계약으로 명시). `lib/voices.js` 도 같지만 이 화면은 label 문자열만 쓰므로 import 불필요.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/quick-create-ui.test.js tests/design-system.test.js` / Expected: PASS. 이어 `npm run build` 로 번들 오염(fs) 없는지 확인(⚠️ dev 서버 꺼진 상태에서)
- [ ] **Step 5: Commit** — `git add components/QuickCreate.jsx app/page.js tests/quick-create-ui.test.js && git commit -m "feat: 빠른 생성 화면 — 요약 카드 한 번, 이후 완성까지 자동"`

---

### Task 7: t2v 경로 제거 + 전체 그린

**Files:**
- Delete: `app/api/video/route.js`, `app/api/video/status/route.js` (디렉터리째)
- Delete: `tests/quick-create-budget.test.js`
- Modify: `tests/minor1-uncovered-routes.test.js:103-131` (GET /api/video/status describe 제거)
- Modify: `tests/routes-auth.test.js` (라우트 열거에 /api/video 가 있으면 제거)

**Interfaces:**
- Consumes: 없음 (제거 태스크)
- Produces: `/api/video` 참조 0 — Task 6 이후 화면 호출처도 이미 없다

- [ ] **Step 1: 참조 확인** — Run: `grep -rn "api/video" app components lib tests` / Expected: `app/api/video/` 자신과 위 테스트 둘만
- [ ] **Step 2: 제거** —

```bash
git rm -r app/api/video tests/quick-create-budget.test.js
```

`tests/minor1-uncovered-routes.test.js` 의 `GET /api/video/status — withUser` describe 블록(103~131행 부근) 삭제. `tests/routes-auth.test.js` 에 `/api/video` 항목이 있으면 그 항목만 삭제.

예산 커버리지 소실 여부 확인: 삭제한 quick-create-budget.test.js 가 검증하던 것은 "라우트가 assertBudget 을 부른다"였고, 자동 관통에서는 각 lib(imagegen·i2v·tts)이 부른다 — `grep -n "assertBudget" lib/imagegen.js lib/i2v.js lib/tts.js` 로 셋 다 있는지 확인하고, 없으면 **삭제를 멈추고 보고한다**(예산 가드가 라우트에만 있었다는 뜻이라 자동 관통이 무상한이 된다).

- [ ] **Step 3: 전체 테스트** — Run: `npx vitest run` / Expected: 전체 PASS (925+ 그린, 새 실패 0). 실패가 나오면 `/api/video` 참조를 지운 자리인지 확인하고 그 참조만 고친다
- [ ] **Step 4: Commit** — `git commit -am "feat!: t2v 단일 클립 경로 제거 — 빠른 생성은 자동 관통 하나로"`

---

### Task 8: 가짜 모드 관통 검증 (0원)

**Files:** 없음 (검증 태스크 — 결함이 나오면 해당 태스크 파일로 돌아가 고친다)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 관통 증거(로그·화면), 발견 결함 목록

- [ ] **Step 1: 서버 기동** — Run: `SHOTFORM_FAKE=all npm run dev` (OpenAI 까지 가짜 — 완전 0원. `.env.local` 의 SUPABASE_* 필요)
- [ ] **Step 2: API 관통** — 로그인 세션 쿠키로(개발 로그인: `docs/auth-setup.md` 의 generateLink → `type=email` → **발급 즉시 브라우저 직접 열기**) curl 또는 브라우저 fetch:

```bash
# ① 프로젝트 생성 → ② 자동 시작 → ③ 폴링
curl -s -b "$COOKIES" -X POST localhost:3000/api/projects \
  -H 'content-type: application/json' \
  -d '{"material":{"text":"국산 딸기 딸기라떼 이번 주 출시 5,500원","photos":[]},"settings":{"target_seconds":15,"aspect_ratio":"9:16","style":{"preset":"photo"}}}'
curl -s -b "$COOKIES" -X POST localhost:3000/api/projects/<id>/auto \
  -H 'content-type: application/json' -d '{"voice_label":"차분한 여성"}'
curl -s -b "$COOKIES" localhost:3000/api/projects/<id> | # auto.stage 가 전진하는지 반복 확인
```

Expected: `auto.stage` 가 briefing→…→render 로 전진, 최종 `auto.state:"done"` + `render.fake` (가짜 합성은 파일을 만들지 않는다 — 실패가 아니다). 홈 화면에서도 대화→요약 카드→진행 표시가 도는지 확인(⚠️ FAKE=all 에서 chat 라우트는 **실제 OpenAI** 를 부른다 — callJson 을 안 쓰므로 가짜 모드 밖이다. 대화 한 바퀴 몇 센트, OpenAI 단독은 사전 승인 없이 허용 범위)
- [ ] **Step 3: 실패 경로 확인** — 자료 없는 프로젝트로 `/auto` → 400, 진행 중 재클릭 → 409 를 실물로 확인
- [ ] **Step 4: 결과 보고** — 관통 로그·잡은 결함을 사용자에게 보고. **fal 실호출 라이브 검증($2.59/편)은 여기서 멈추고 사용자 승인을 받는다**

---

## Self-Review 결과 (계획 작성 시 수행)

- 스펙 커버리지: 대화 개편(T5)·시작 확인 카드(T6)·오케스트레이터(T3)·재시도 1회 강행(T3)·자동 확정(T3)·라우트(T4)·추출(T1·T2)·제거(T7)·FAKE 관통(T8) — 스펙 전 항목에 태스크 있음. 합성의 usable 필터는 실물 확인 완료(compose.js:150)라 무수정 원칙 유지
- 타입 일치: `auto = {stage, state, error}` 를 T3(생산)·T4(초기화)·T6(소비) 이 같은 형태로 사용. `generateScript` 시그니처 T2 정의 = T3 사용. voice_label→voice_id 매핑 T4 = lib/voices.js 실물
- 픽스처 주의 2건(RAW_BRIEFING·RAW_SCRIPT)은 실물 스키마 대조 지시를 태스크 안에 명시
