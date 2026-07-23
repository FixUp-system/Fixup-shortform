# 단계별 워크플로우 M1 (이미지 게이트까지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자료·설정 → 대본 [게이트1] → 컷 분할·이미지 생성·VLM 선별 [게이트2] 까지 동작하는 단계별 생성 워크플로우.

**Architecture:** Next.js(App Router, JS) 단일 앱. 프로젝트 상태는 `data/projects/<id>.json` 파일 문서 하나에 저장하고, 모든 API는 이 문서를 읽고 갱신한다. LLM(gpt-4o)이 대본·컷분할·VLM검수를, fal(nano-banana)이 이미지를 담당한다. 이미지 파이프라인은 서버에서 비동기로 돌고 프론트는 상태를 폴링한다.

**Tech Stack:** Next.js 15(JS, App Router) · OpenAI gpt-4o(REST) · fal.ai nano-banana(동기 `fal.run`) · vitest(신규 도입) · 기존 `lib/costs.js` 비용 기록

## Global Constraints

- 언어: 순수 JS (TS 금지). UI 문구는 전부 한국어.
- 디자인: `app/globals.css`의 기존 토큰·클래스 재사용 (다크 전용). 새 클래스는 같은 파일에 추가.
- env: `OPENAI_API_KEY`, `FAL_KEY` (기존), 신규 `FAL_IMAGE_ENDPOINT` 기본 `fal-ai/nano-banana`.
- `data/`는 gitignore 상태 유지 (프로젝트 파일·업로드 사진·비용 기록 전부 여기).
- 파일 저장은 실험용 — 각 저장 모듈 상단에 "배포 시 Supabase 이관" 주석 필수.
- LLM/fal 호출 함수는 `fetchImpl` 파라미터 주입 가능하게 (기본 `fetch`) — 테스트에서 페이크 주입.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- UI 스테퍼는 `/create/[id]` 페이지 상단에 배치 (사이드바는 링크 활성화만 — 전역 컴포넌트가 프로젝트 상태를 모르므로 단순화).

---

### Task 1: vitest 도입 + 프로젝트 파일 저장소 `lib/projects.js`

**Files:**
- Modify: `package.json` (devDependency vitest, `"test": "vitest run"`)
- Create: `lib/projects.js`
- Test: `tests/projects.test.js`

**Interfaces:**
- Produces: `createProject({settings, material}) -> project` (id·created_ts·status:"draft" 부여), `getProject(id) -> project|null`, `updateProject(id, patchFn) -> project` (patchFn은 `(proj)=>proj` 순수함수 — 읽기·수정·쓰기를 원자적으로), `DATA_DIR` (env `SHOTFORM_DATA_DIR` 우선, 기본 `<cwd>/data`)

- [ ] **Step 1: vitest 설치**

```bash
npm install -D vitest
```

`package.json` scripts에 `"test": "vitest run"` 추가.

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/projects.test.js`

```js
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let projects;

describe("projects store", () => {
  beforeEach(async () => {
    process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
    // env 반영을 위해 매번 새로 import
    projects = await import("../lib/projects.js?t=" + Date.now());
  });

  it("createProject는 id·status·created_ts를 부여한다", async () => {
    const p = await projects.createProject({
      settings: { purpose: "홍보·판매", duration_s: 45, aspect_ratio: "9:16" },
      material: { text: "딸기라떼", photos: [] },
    });
    expect(p.id).toMatch(/^[a-z0-9-]+$/);
    expect(p.status).toBe("draft");
    expect(p.settings.duration_s).toBe(45);
  });

  it("getProject는 저장된 프로젝트를 돌려주고, 없으면 null", async () => {
    const p = await projects.createProject({ settings: {}, material: { text: "", photos: [] } });
    expect((await projects.getProject(p.id)).id).toBe(p.id);
    expect(await projects.getProject("없는-id")).toBeNull();
  });

  it("updateProject는 patchFn 결과를 저장한다", async () => {
    const p = await projects.createProject({ settings: {}, material: { text: "", photos: [] } });
    const upd = await projects.updateProject(p.id, (proj) => ({ ...proj, status: "script" }));
    expect(upd.status).toBe("script");
    expect((await projects.getProject(p.id)).status).toBe("script");
  });
});
```

- [ ] **Step 3: 실패 확인** — Run: `npm test` → Expected: FAIL (`Cannot find module '../lib/projects.js'`)

- [ ] **Step 4: 구현** — `lib/projects.js`

```js
// 프로젝트 파일 저장소 — 실험 단계용. 배포 시 Supabase 이관.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

function dataDir() {
  return process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
}
function projPath(id) {
  // path traversal 방지: id는 UUID 형식만 허용
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("잘못된 프로젝트 id");
  return path.join(dataDir(), "projects", `${id}.json`);
}

export async function createProject({ settings, material }) {
  const project = {
    id: randomUUID(),
    created_ts: Date.now(),
    status: "draft", // draft → script → cuts
    settings: settings || {},
    material: material || { text: "", photos: [] },
    script: null,
    cuts: [],
  };
  await fs.mkdir(path.dirname(projPath(project.id)), { recursive: true });
  await fs.writeFile(projPath(project.id), JSON.stringify(project, null, 2), "utf8");
  return project;
}

export async function getProject(id) {
  try {
    return JSON.parse(await fs.readFile(projPath(id), "utf8"));
  } catch {
    return null;
  }
}

export async function updateProject(id, patchFn) {
  const proj = await getProject(id);
  if (!proj) throw new Error("프로젝트를 찾을 수 없어요");
  const next = patchFn(proj);
  await fs.writeFile(projPath(id), JSON.stringify(next, null, 2), "utf8");
  return next;
}
```

- [ ] **Step 5: 통과 확인** — Run: `npm test` → Expected: PASS (3 tests)

- [ ] **Step 6: Commit** — `git add package.json package-lock.json lib/projects.js tests/projects.test.js && git commit -m "feat: vitest 도입 + 프로젝트 파일 저장소"`

---

### Task 2: LLM JSON 호출 헬퍼 `lib/llm.js` + 스키마 검증기 `lib/validate.js`

**Files:**
- Create: `lib/llm.js`, `lib/validate.js`
- Test: `tests/llm.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `callJson({system, messages, fetchImpl}) -> object` (gpt-4o json_object 모드, 파싱 실패 시 1회 재시도, 최종 실패 시 throw), `validateScript(obj) -> {paragraphs:[{tag,text}], coverage:[string]}|null`, `validateCuts(obj, photoIds) -> [{idx,sentence,seconds,source,photo_id,ref_photo_id}]|null` (photo_id/ref_photo_id가 photoIds에 없으면 null 처리)

- [ ] **Step 1: 검증기 실패 테스트** — `tests/validate.test.js`

```js
import { describe, it, expect } from "vitest";
import { validateScript, validateCuts } from "../lib/validate.js";

describe("validateScript", () => {
  it("정상 스키마를 통과시킨다", () => {
    const ok = validateScript({
      paragraphs: [{ tag: "훅", text: "요즘 이거 모르면 손해" }],
      coverage: ["생딸기 직접 갈기"],
    });
    expect(ok.paragraphs).toHaveLength(1);
  });
  it("paragraphs가 없으면 null", () => {
    expect(validateScript({ coverage: [] })).toBeNull();
    expect(validateScript({ paragraphs: [{ tag: "훅" }] })).toBeNull(); // text 누락
  });
});

describe("validateCuts", () => {
  const photoIds = ["p1", "p2"];
  it("정상 컷 배열을 통과시키고 idx를 재부여한다", () => {
    const cuts = validateCuts(
      { cuts: [
        { sentence: "문장1", seconds: 6, source: "ai", ref_photo_id: "p1" },
        { sentence: "문장2", seconds: 8, source: "photo", photo_id: "p2" },
      ]},
      photoIds
    );
    expect(cuts).toHaveLength(2);
    expect(cuts[0].idx).toBe(0);
    expect(cuts[1].photo_id).toBe("p2");
  });
  it("photo 소스인데 photo_id가 목록에 없으면 null", () => {
    expect(validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "photo", photo_id: "없음" }] }, photoIds)).toBeNull();
  });
  it("존재하지 않는 ref_photo_id는 제거하고 통과시킨다", () => {
    const cuts = validateCuts({ cuts: [{ sentence: "s", seconds: 5, source: "ai", ref_photo_id: "없음" }] }, photoIds);
    expect(cuts[0].ref_photo_id).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` → Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `lib/validate.js`

```js
// LLM 응답 스키마 방어 — 실패 시 null 반환 (호출측이 재시도 판단)
export function validateScript(obj) {
  if (!obj || !Array.isArray(obj.paragraphs) || obj.paragraphs.length === 0) return null;
  const paragraphs = [];
  for (const p of obj.paragraphs) {
    if (typeof p?.tag !== "string" || typeof p?.text !== "string" || !p.text.trim()) return null;
    paragraphs.push({ tag: p.tag, text: p.text });
  }
  const coverage = Array.isArray(obj.coverage)
    ? obj.coverage.filter((c) => typeof c === "string")
    : [];
  return { paragraphs, coverage };
}

export function validateCuts(obj, photoIds) {
  if (!obj || !Array.isArray(obj.cuts) || obj.cuts.length === 0) return null;
  const out = [];
  for (const c of obj.cuts) {
    if (typeof c?.sentence !== "string" || !c.sentence.trim()) return null;
    const seconds = Number(c.seconds);
    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 15) return null;
    const source = c.source === "photo" ? "photo" : "ai";
    const cut = { idx: out.length, sentence: c.sentence, seconds, source, regen_count: 0 };
    if (source === "photo") {
      if (!photoIds.includes(c.photo_id)) return null; // 사진 컷인데 사진이 없으면 스키마 실패
      cut.photo_id = c.photo_id;
    } else if (c.ref_photo_id && photoIds.includes(c.ref_photo_id)) {
      cut.ref_photo_id = c.ref_photo_id; // 없는 레퍼런스는 조용히 제거
    }
    out.push(cut);
  }
  return out;
}
```

- [ ] **Step 4: 검증기 통과 확인** — Run: `npm test` → Expected: PASS

- [ ] **Step 5: callJson 실패 테스트** — `tests/llm.test.js`

```js
import { describe, it, expect } from "vitest";
import { callJson } from "../lib/llm.js";

function fakeFetch(responses) {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      json: async () => ({ choices: [{ message: { content: r.content } }] }),
      text: async () => r.content || "",
    };
  };
}

describe("callJson", () => {
  it("정상 JSON을 파싱해 돌려준다", async () => {
    const out = await callJson({
      system: "s", messages: [{ role: "user", content: "u" }],
      fetchImpl: fakeFetch([{ content: '{"a":1}' }]),
      apiKey: "test",
    });
    expect(out.a).toBe(1);
  });
  it("첫 응답이 깨진 JSON이면 1회 재시도한다", async () => {
    const out = await callJson({
      system: "s", messages: [],
      fetchImpl: fakeFetch([{ content: "깨짐{" }, { content: '{"b":2}' }]),
      apiKey: "test",
    });
    expect(out.b).toBe(2);
  });
  it("두 번 다 실패하면 throw", async () => {
    await expect(
      callJson({ system: "s", messages: [], fetchImpl: fakeFetch([{ content: "x" }]), apiKey: "test" })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: 실패 확인** — Run: `npm test` → FAIL

- [ ] **Step 7: 구현** — `lib/llm.js`

```js
// gpt-4o JSON 호출 헬퍼 — response_format json_object, 파싱 실패 시 1회 재시도
export async function callJson({ system, messages, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY, temperature = 0.4 }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM 호출 실패 (${res.status}) ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    try {
      return JSON.parse(data?.choices?.[0]?.message?.content ?? "");
    } catch {
      // 재시도
    }
  }
  throw new Error("LLM 응답 해석 실패");
}
```

- [ ] **Step 8: 통과 확인** — Run: `npm test` → PASS

- [ ] **Step 9: Commit** — `git add lib/llm.js lib/validate.js tests/ && git commit -m "feat: LLM JSON 헬퍼 + 대본/컷 스키마 검증기"`

---

### Task 3: 사진 업로드 API

**Files:**
- Create: `app/api/uploads/route.js` (POST 저장), `app/api/uploads/[name]/route.js` (GET 서빙)

**Interfaces:**
- Produces: `POST /api/uploads` (multipart `file`) → `{id, filename, url:"/api/uploads/<저장명>"}` · 저장 위치 `data/uploads/<uuid>.<ext>` · 허용 jpg/jpeg/png/webp, ≤10MB
- Consumes: 없음 (독립)

- [ ] **Step 1: 구현** — `app/api/uploads/route.js`

```js
// 사진 업로드 — 실험 단계용 로컬 저장. 배포 시 Supabase Storage 이관.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const ALLOWED = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 10 * 1024 * 1024;

function uploadsDir() {
  return path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads");
}

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "file 필드가 필요해요" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return Response.json({ error: "jpg/png/webp만 올릴 수 있어요" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "10MB 이하만 올릴 수 있어요" }, { status: 400 });

  const id = randomUUID();
  const stored = `${id}.${ext}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), stored), Buffer.from(await file.arrayBuffer()));
  return Response.json({ id, filename: file.name, url: `/api/uploads/${stored}` });
}
```

- [ ] **Step 2: 구현** — `app/api/uploads/[name]/route.js`

```js
import { promises as fs } from "fs";
import path from "path";

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(req, { params }) {
  const { name } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return new Response("잘못된 파일명", { status: 400 });
  }
  const dir = path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads");
  try {
    const buf = await fs.readFile(path.join(dir, name));
    return new Response(buf, { headers: { "Content-Type": MIME[name.split(".").pop()] } });
  } catch {
    return new Response("없음", { status: 404 });
  }
}
```

- [ ] **Step 3: 수동 검증** — Run: `npm run build` → Expected: 빌드 통과. dev 서버에서 `Invoke-WebRequest`로 png 업로드 → 200 + url, 그 url GET → 200.

- [ ] **Step 4: Commit** — `git commit -am "feat: 사진 업로드/서빙 API"`

---

### Task 4: 프로젝트 CRUD API

**Files:**
- Create: `app/api/projects/route.js`, `app/api/projects/[id]/route.js`

**Interfaces:**
- Consumes: Task 1 `createProject/getProject/updateProject`
- Produces: `POST /api/projects` body `{settings:{purpose,duration_s,aspect_ratio}, material:{text, photos:[{id,filename,url}]}}` → project JSON · `GET /api/projects/[id]` → project · `PATCH /api/projects/[id]` body `{material?, settings?, cut?:{idx,sentence}, script_paragraph?:{idx,text}}` → 갱신된 project (cut은 문장만, script_paragraph는 해당 문단 text만 수정)

- [ ] **Step 1: 구현** — `app/api/projects/route.js`

```js
import { createProject } from "../../../lib/projects";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body?.settings || typeof body?.material?.text !== "string") {
    return Response.json({ error: "settings와 material.text가 필요해요" }, { status: 400 });
  }
  const { purpose, duration_s, aspect_ratio } = body.settings;
  if (![15, 30, 45, 60].includes(duration_s) || !["9:16", "1:1", "16:9"].includes(aspect_ratio)) {
    return Response.json({ error: "길이/비율 값이 잘못됐어요" }, { status: 400 });
  }
  const project = await createProject({
    settings: { purpose: String(purpose || "홍보·판매"), duration_s, aspect_ratio },
    material: {
      text: body.material.text.slice(0, 4000),
      photos: Array.isArray(body.material.photos) ? body.material.photos : [],
    },
  });
  return Response.json(project);
}
```

- [ ] **Step 2: 구현** — `app/api/projects/[id]/route.js`

```js
import { getProject, updateProject } from "../../../../lib/projects";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const project = await updateProject(id, (proj) => {
      const next = { ...proj };
      if (body.material) next.material = { ...proj.material, ...body.material };
      if (body.settings) next.settings = { ...proj.settings, ...body.settings };
      if (body.cut && Number.isInteger(body.cut.idx) && typeof body.cut.sentence === "string") {
        next.cuts = proj.cuts.map((c) =>
          c.idx === body.cut.idx ? { ...c, sentence: body.cut.sentence } : c
        );
      }
      if (body.script_paragraph && proj.script &&
          Number.isInteger(body.script_paragraph.idx) && typeof body.script_paragraph.text === "string") {
        next.script = {
          ...proj.script,
          paragraphs: proj.script.paragraphs.map((p, i) =>
            i === body.script_paragraph.idx ? { ...p, text: body.script_paragraph.text } : p
          ),
        };
      }
      return next;
    });
    return Response.json(project);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
```

- [ ] **Step 3: 검증** — `npm test`(기존 통과 유지) + `npm run build` 통과. dev에서 POST→GET→PATCH 한 사이클 curl 확인.

- [ ] **Step 4: Commit** — `git commit -am "feat: 프로젝트 CRUD API"`

---

### Task 5: 대본 생성 (게이트 1 백엔드)

**Files:**
- Create: `lib/script.js`, `app/api/projects/[id]/script/route.js`
- Test: `tests/script.test.js`

**Interfaces:**
- Consumes: `callJson`(T2), `validateScript`(T2), `getProject/updateProject`(T1)
- Produces: `buildScriptMessages(project, instruction?) -> {system, messages}` (순수함수), `POST /api/projects/[id]/script` body `{instruction?}` → `{script}` (project.status→"script", script.version 증가)

- [ ] **Step 1: 실패 테스트** — `tests/script.test.js`

```js
import { describe, it, expect } from "vitest";
import { buildScriptMessages } from "../lib/script.js";

const project = {
  settings: { purpose: "홍보·판매", duration_s: 45, aspect_ratio: "9:16" },
  material: { text: "생딸기라떼. 매일 아침 직접 갈아서.", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  script: null,
};

describe("buildScriptMessages", () => {
  it("자료·설정이 프롬프트에 포함된다", () => {
    const { system, messages } = buildScriptMessages(project);
    expect(system).toContain("숏폼");
    const user = messages[0].content;
    expect(user).toContain("생딸기라떼");
    expect(user).toContain("45초");
    expect(user).toContain("라떼.jpg");
  });
  it("instruction과 기존 대본이 있으면 수정 요청으로 구성된다", () => {
    const withScript = { ...project, script: { paragraphs: [{ tag: "훅", text: "기존문장" }], coverage: [] } };
    const { messages } = buildScriptMessages(withScript, "더 짧게");
    expect(messages[0].content).toContain("기존문장");
    expect(messages[0].content).toContain("더 짧게");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL

- [ ] **Step 3: 구현** — `lib/script.js`

```js
// 대본 생성 — 자료 전체를 입력으로 완결된 숏폼 대본(문단+역할 태그) 산출
const SYSTEM = `너는 숏폼 영상 대본 작가다. 사용자가 준 자료를 바탕으로 한국어 나레이션 대본을 쓴다.
반드시 JSON 하나만 출력: {"paragraphs":[{"tag":"훅|본문|희소성|마무리 등 역할","text":"문장"}],"coverage":["자료에서 반영한 포인트"]}
규칙:
- 목표 길이에 맞는 분량 (나레이션 기준 15초≈3문단, 30초≈4, 45초≈5~6, 60초≈7~8).
- 첫 문단은 반드시 3초 안에 시선을 잡는 훅.
- 자료의 구체 포인트(제품명·수치·위치·특징)는 빠뜨리지 말고 반영하고 coverage에 나열.
- 과장·허위 금지 — 자료에 없는 사실을 만들지 않는다.`;

export function buildScriptMessages(project, instruction) {
  const { settings, material, script } = project;
  const photoList = material.photos.map((p) => `- ${p.filename}`).join("\n") || "(없음)";
  let user = `[설정] 목적: ${settings.purpose} / 길이: ${settings.duration_s}초 / 비율: ${settings.aspect_ratio}
[자료 텍스트]
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

- [ ] **Step 4: 통과 확인** — `npm test` → PASS

- [ ] **Step 5: 라우트 구현** — `app/api/projects/[id]/script/route.js`

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { callJson } from "../../../../../lib/llm";
import { validateScript } from "../../../../../lib/validate";
import { buildScriptMessages } from "../../../../../lib/script";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const { instruction } = await req.json().catch(() => ({}));
  const { system, messages } = buildScriptMessages(project, instruction);

  let script = null;
  for (let attempt = 0; attempt < 2 && !script; attempt++) {
    try {
      script = validateScript(await callJson({ system, messages }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502 });
    }
  }
  if (!script) return Response.json({ error: "대본 생성에 실패했어요. 다시 시도해 주세요." }, { status: 502 });

  const updated = await updateProject(id, (proj) => ({
    ...proj,
    status: "script",
    script: { ...script, version: (proj.script?.version || 0) + 1 },
  }));
  return Response.json({ script: updated.script });
}
```

- [ ] **Step 6: 검증** — `npm run build` 통과. (실키 e2e는 Task 11에서)

- [ ] **Step 7: Commit** — `git commit -am "feat: 대본 생성 API (게이트1 백엔드)"`

---

### Task 6: 컷 분할 + 이미지 생성 + VLM 선별 (단위 모듈)

**Files:**
- Create: `lib/cuts.js` (컷 분할 프롬프트), `lib/imagegen.js` (nano-banana 호출), `lib/vlm.js` (후보 선별)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: `callJson`(T2), `validateCuts`(T2), `addRecord`(기존 lib/costs.js)
- Produces:
  - `buildCutsMessages(project) -> {system, messages}` (대본+사진목록 → 컷 JSON 요청)
  - `buildImagePrompt(cut, project) -> string` (컷 문장 → 영어 이미지 프롬프트 지시 포함 문자열)
  - `generateImage({prompt, aspect_ratio, refImagePath?, fetchImpl}) -> {url}` — fal `https://fal.run/<FAL_IMAGE_ENDPOINT>` 동기 호출, 레퍼런스는 base64 data URI로 `image_urls`에 첨부, 비용 기록(건당 $0.04)
  - `selectCandidate({cut, candidates:[{url}], refImagePath?, fetchImpl}) -> {selectedIndex, passed, note}` — gpt-4o vision, 이미지 url 2장 비교

- [ ] **Step 1: 실패 테스트** — `tests/cuts.test.js`

```js
import { describe, it, expect } from "vitest";
import { buildCutsMessages, buildImagePrompt } from "../lib/cuts.js";

const project = {
  settings: { purpose: "홍보·판매", duration_s: 45, aspect_ratio: "9:16" },
  material: { text: "자료", photos: [{ id: "p1", filename: "라떼.jpg" }] },
  script: { paragraphs: [{ tag: "훅", text: "요즘 이거 모르면 손해" }], coverage: [] },
};

describe("buildCutsMessages", () => {
  it("대본 문장과 사진 id가 프롬프트에 포함된다", () => {
    const { messages } = buildCutsMessages(project);
    expect(messages[0].content).toContain("요즘 이거 모르면 손해");
    expect(messages[0].content).toContain("p1");
    expect(messages[0].content).toContain("45"); // 총 길이 제약
  });
});

describe("buildImagePrompt", () => {
  it("컷 문장·비율·레퍼런스 지시가 반영된다", () => {
    const cut = { sentence: "첫 모금에 과육이 씹히는", source: "ai", ref_photo_id: "p1" };
    const prompt = buildImagePrompt(cut, project);
    expect(prompt).toMatch(/vertical|9:16/);
    expect(prompt).toContain("reference");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL

- [ ] **Step 3: 구현** — `lib/cuts.js`

```js
// 컷 분할: 대본 → 컷(문장·초·소스·레퍼런스) / 이미지 프롬프트 생성
const CUTS_SYSTEM = `너는 숏폼 영상 편집자다. 대본을 컷으로 나눈다.
반드시 JSON 하나만 출력: {"cuts":[{"sentence":"컷의 나레이션 문장","seconds":초(2~15),"source":"photo"|"ai","photo_id":"사진 컷이면 사진 id","ref_photo_id":"ai 컷에 같은 피사체가 나오면 참조할 사진 id"}]}
규칙:
- 문장·호흡 단위로 나누고 seconds 합이 목표 길이의 ±20% 안에 오게.
- 업로드 사진이 그 컷 내용을 "그대로 보여줄 수 있으면" source:"photo"+photo_id. 사진에 없는 요소(사람·동작)가 필요하면 source:"ai".
- ai 컷에 사진 속 피사체(제품·장소)가 등장하면 ref_photo_id로 그 사진을 지정 — 외형 일관성의 기준이 된다.`;

export function buildCutsMessages(project) {
  const { settings, material, script } = project;
  const photos = material.photos.map((p) => `- id:${p.id} 파일명:${p.filename}`).join("\n") || "(없음)";
  const user = `[목표 길이] ${settings.duration_s}초
[대본]
${script.paragraphs.map((p) => `(${p.tag}) ${p.text}`).join("\n")}
[업로드 사진 목록]
${photos}`;
  return { system: CUTS_SYSTEM, messages: [{ role: "user", content: user }] };
}

export function buildImagePrompt(cut, project) {
  const ar = project.settings.aspect_ratio;
  const orient = ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
  let p = `High-quality photographic still for a short-form video, ${orient} composition. Scene: ${cut.sentence}. Cinematic lighting, realistic, no text or letters in the image.`;
  if (cut.ref_photo_id) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
  return p;
}
```

- [ ] **Step 4: 통과 확인** — `npm test` → PASS

- [ ] **Step 5: 구현** — `lib/imagegen.js` (외부 호출이라 테스트는 페이크 주입 경로만 — 파이프라인 테스트(T7)에서 커버)

```js
// fal 이미지 생성 (동기 fal.run) — 기본 nano-banana. 배포·모델 교체 시 응답 파싱 확인 필수.
import { promises as fs } from "fs";
import { addRecord } from "./costs";
import { randomUUID } from "crypto";

const IMAGE_PRICE_USD = 0.04;

export async function generateImage({ prompt, aspect_ratio, refImagePath, fetchImpl = fetch }) {
  const endpoint = process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana";
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refImagePath) {
    const buf = await fs.readFile(refImagePath);
    const ext = refImagePath.split(".").pop();
    input.image_urls = [`data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`];
  }
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`이미지 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("이미지 생성 결과가 비어 있어요");
  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    prompt: prompt.slice(0, 300), duration: "-", aspect_ratio,
    est_cost_usd: IMAGE_PRICE_USD, status: "done", video_url: url,
  }).catch(() => {});
  return { url };
}
```

- [ ] **Step 6: 구현** — `lib/vlm.js`

```js
// VLM 검수 — gpt-4o vision으로 후보 중 선택 + 합격 판정
export async function selectCandidate({ cut, candidates, refImageUrl, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const content = [
    { type: "text", text: `숏폼 컷 검수. 나레이션: "${cut.sentence}"
후보 이미지들을 보고 JSON만 출력: {"selectedIndex":0부터 시작하는 최선 후보 번호,"passed":true|false(전원 불합격이면 false),"note":"한국어 한 줄 사유"}
검수 기준: 문장 의도 일치 / 신체·손가락 오류 / 이미지 안 글자 깨짐${refImageUrl ? " / 레퍼런스 피사체와 외형 일치" : ""}` },
    ...candidates.map((c) => ({ type: "image_url", image_url: { url: c.url } })),
  ];
  if (refImageUrl) content.push({ type: "text", text: "(마지막 이미지는 레퍼런스 원본)" }, { type: "image_url", image_url: { url: refImageUrl } });

  const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`VLM 검수 실패 (${res.status})`);
  const data = await res.json();
  const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const selectedIndex = Number.isInteger(out.selectedIndex) && out.selectedIndex >= 0 && out.selectedIndex < candidates.length ? out.selectedIndex : 0;
  return { selectedIndex, passed: out.passed !== false, note: typeof out.note === "string" ? out.note : "" };
}
```

- [ ] **Step 7: 검증** — `npm test` PASS + `npm run build` 통과

- [ ] **Step 8: Commit** — `git commit -am "feat: 컷 분할·이미지 생성·VLM 선별 단위 모듈"`

---

### Task 7: 컷 파이프라인 오케스트레이션 + 상태·재생성 API

**Files:**
- Create: `lib/pipeline.js`, `app/api/projects/[id]/cuts/route.js`, `app/api/projects/[id]/cuts/status/route.js`, `app/api/projects/[id]/cuts/[idx]/regen/route.js`
- Test: `tests/pipeline.test.js`

**Interfaces:**
- Consumes: T1 store, T2 `callJson/validateCuts`, T6 모듈 전부
- Produces:
  - `runCutsPipeline(projectId, deps)` — deps로 `{splitCuts, genImage, select}` 주입(기본 실물 구현). 동작: 컷 분할→저장(status:"cuts", 각 컷 `state:"pending"`) → 컷 병렬 처리(각: `state:"generating"`→후보2장→VLM→합격시 `state:"done"`+image 저장 / 전원탈락시 프롬프트에 note 반영해 1회 자동 보정→그래도 실패면 `state:"needs_attention"`) / photo 컷은 즉시 `state:"done"`
  - `regenCut(projectId, idx, deps)` — 해당 컷만 재실행, `regen_count` 증가, 3회 초과 시 throw
  - `POST /cuts` — 파이프라인 **비동기 시작**(await 안 함) 후 즉시 `{started:true}` / `GET /cuts/status` → `{status, cuts:[...]}` / `POST /cuts/[idx]/regen` → `{cut}`

- [ ] **Step 1: 실패 테스트** — `tests/pipeline.test.js`

```js
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

let projects, pipeline;

function deps({ failCut } = {}) {
  return {
    splitCuts: async () => [
      { idx: 0, sentence: "AI컷", seconds: 6, source: "ai", regen_count: 0 },
      { idx: 1, sentence: "사진컷", seconds: 8, source: "photo", photo_id: "p1", regen_count: 0 },
    ],
    genImage: async ({ prompt }) => ({ url: "http://img/" + Math.random() }),
    select: async ({ cut }) =>
      cut.idx === failCut ? { selectedIndex: 0, passed: false, note: "불합격" } : { selectedIndex: 0, passed: true, note: "ok" },
  };
}

beforeEach(async () => {
  process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-"));
  projects = await import("../lib/projects.js?t=" + Date.now());
  pipeline = await import("../lib/pipeline.js?t=" + Date.now());
});

async function makeProject() {
  return projects.createProject({
    settings: { purpose: "홍보", duration_s: 45, aspect_ratio: "9:16" },
    material: { text: "자료", photos: [{ id: "p1", filename: "a.jpg", url: "/api/uploads/a.jpg" }] },
  });
}

describe("runCutsPipeline", () => {
  it("정상 흐름: ai 컷은 이미지·검수, photo 컷은 즉시 done", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    const after = await projects.getProject(p.id);
    expect(after.status).toBe("cuts");
    expect(after.cuts[0].state).toBe("done");
    expect(after.cuts[0].image.url).toContain("http://img/");
    expect(after.cuts[1].state).toBe("done");
    expect(after.cuts[1].image).toBeUndefined(); // 사진 컷은 원본 사용
  });

  it("전원 탈락 컷은 자동 보정 후에도 실패하면 needs_attention — 다른 컷은 정상(실패 격리)", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps({ failCut: 0 }));
    const after = await projects.getProject(p.id);
    expect(after.cuts[0].state).toBe("needs_attention");
    expect(after.cuts[1].state).toBe("done");
  });

  it("regenCut은 3회 제한", async () => {
    const p = await makeProject();
    await pipeline.runCutsPipeline(p.id, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await pipeline.regenCut(p.id, 0, deps());
    await expect(pipeline.regenCut(p.id, 0, deps())).rejects.toThrow(/3회/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL

- [ ] **Step 3: 구현** — `lib/pipeline.js`

```js
// 컷 파이프라인 — 컷 분할 후 컷별 독립·병렬 이미지 생성 + VLM 선별. 실패는 컷 단위로 격리.
import path from "path";
import { getProject, updateProject } from "./projects";
import { callJson } from "./llm";
import { validateCuts } from "./validate";
import { buildCutsMessages, buildImagePrompt } from "./cuts";
import { generateImage } from "./imagegen";
import { selectCandidate } from "./vlm";

function uploadsPath(url) {
  // "/api/uploads/x.jpg" → 로컬 파일 경로
  const name = url?.split("/").pop();
  if (!name) return null;
  return path.join(process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data"), "uploads", name);
}

const defaultDeps = {
  splitCuts: async (project) => {
    const { system, messages } = buildCutsMessages(project);
    const photoIds = project.material.photos.map((p) => p.id);
    for (let i = 0; i < 2; i++) {
      const cuts = validateCuts(await callJson({ system, messages }), photoIds);
      if (cuts) return cuts;
    }
    throw new Error("컷 분할 실패");
  },
  genImage: generateImage,
  select: selectCandidate,
};

async function processCut(projectId, cut, project, deps) {
  const setCut = (patch) =>
    updateProject(projectId, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => (c.idx === cut.idx ? { ...c, ...patch } : c)),
    }));

  if (cut.source === "photo") {
    await setCut({ state: "done" });
    return;
  }
  await setCut({ state: "generating" });
  const refPhoto = project.material.photos.find((p) => p.id === cut.ref_photo_id);
  const refImagePath = refPhoto ? uploadsPath(refPhoto.url) : undefined;

  try {
    let note = "";
    for (let round = 0; round < 2; round++) {
      let prompt = buildImagePrompt(cut, project);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refImagePath }),
      ]);
      const verdict = await deps.select({ cut, candidates, refImageUrl: candidates.length && refPhoto ? refPhoto.url : undefined });
      if (verdict.passed) {
        await setCut({ state: "done", image: { url: candidates[verdict.selectedIndex].url }, vlm: { passed: true, note: verdict.note } });
        return;
      }
      note = verdict.note; // 자동 보정 재시도 (크레딧 개념 없음 — 비용기록만 쌓임)
    }
    await setCut({ state: "needs_attention", vlm: { passed: false, note } });
  } catch (e) {
    await setCut({ state: "needs_attention", vlm: { passed: false, note: e.message } });
  }
}

export async function runCutsPipeline(projectId, deps = defaultDeps) {
  const project = await getProject(projectId);
  if (!project?.script) throw new Error("대본이 먼저 필요해요");
  const cuts = await deps.splitCuts(project);
  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "cuts",
    cuts: cuts.map((c) => ({ ...c, state: "pending" })),
  }));
  const saved = await getProject(projectId);
  await Promise.all(saved.cuts.map((cut) => processCut(projectId, cut, saved, deps)));
}

export async function regenCut(projectId, idx, deps = defaultDeps) {
  const project = await getProject(projectId);
  const cut = project?.cuts?.find((c) => c.idx === idx);
  if (!cut) throw new Error("컷을 찾을 수 없어요");
  if (cut.regen_count >= 3) throw new Error("재생성은 컷당 3회까지예요");
  await updateProject(projectId, (proj) => ({
    ...proj,
    cuts: proj.cuts.map((c) => (c.idx === idx ? { ...c, regen_count: c.regen_count + 1 } : c)),
  }));
  const fresh = await getProject(projectId);
  await processCut(projectId, fresh.cuts.find((c) => c.idx === idx), fresh, deps);
  return (await getProject(projectId)).cuts.find((c) => c.idx === idx);
}
```

- [ ] **Step 4: 통과 확인** — `npm test` → PASS (전체)

- [ ] **Step 5: 라우트 3개 구현**

`app/api/projects/[id]/cuts/route.js`:
```js
import { getProject } from "../../../../../lib/projects";
import { runCutsPipeline } from "../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.script) return Response.json({ error: "대본을 먼저 만들어 주세요" }, { status: 400 });
  // 비동기 시작 — 완료를 기다리지 않고 폴링으로 확인 (로컬 node 서버 전제. 배포 시 잡 큐 이관)
  runCutsPipeline(id).catch((e) => console.error("pipeline error:", e));
  return Response.json({ started: true });
}
```

`app/api/projects/[id]/cuts/status/route.js`:
```js
import { getProject } from "../../../../../../lib/projects";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({ status: project.status, cuts: project.cuts });
}
```

`app/api/projects/[id]/cuts/[idx]/regen/route.js`:
```js
import { regenCut } from "../../../../../../../lib/pipeline";

export async function POST(req, { params }) {
  const { id, idx } = await params;
  try {
    const cut = await regenCut(id, Number(idx));
    return Response.json({ cut });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
```

- [ ] **Step 6: 검증** — `npm test` PASS + `npm run build` 통과

- [ ] **Step 7: Commit** — `git commit -am "feat: 컷 파이프라인 + 상태/재생성 API"`

---

### Task 8: UI — 1단계 자료·설정 (`/create`)

**Files:**
- Create: `app/create/page.js`
- Modify: `app/globals.css` (뒤에 추가: `.form-panel`은 기존 `.panel` 재사용, 신규는 `.stepper-h` 정도)
- Modify: `components/Sidebar.jsx` ("영상 만들기 (단계별)" → `/create` 링크로 활성화)

**Interfaces:**
- Consumes: `POST /api/uploads`, `POST /api/projects`
- Produces: 제출 성공 시 `router.push('/create/'+project.id)`

- [ ] **Step 1: Sidebar 수정** — `components/Sidebar.jsx`의 "영상 만들기 (단계별)" disabled 버튼을 다음으로 교체:

```jsx
<Link href="/create" className={`side-item${pathname.startsWith("/create") ? " on" : ""}`}>
  <span className="ic">✨</span>영상 만들기 (단계별)
</Link>
```

- [ ] **Step 2: 페이지 구현** — `app/create/page.js` ("use client"). 구성 요소:
  - 텍스트 자료 `textarea.ref`(2,000자 카운트), 사진 업로드(`<input type=file accept="image/*" multiple>` → 각 파일 `POST /api/uploads`, 썸네일 `.up` 그리드로 표시+제거 버튼)
  - 목적 칩(홍보·판매/정보·안내/기록·스토리/축하·이벤트), 길이 칩(15/30/45/60), 비율 칩(9:16/1:1/16:9) — 기존 `.chips/.chip.on` 클래스, useState로 선택 관리
  - CTA "대본 만들기 → 무료": `POST /api/projects` → 성공 시 `router.push`. 텍스트 비면 비활성.

```jsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PURPOSES = ["홍보·판매", "정보·안내", "기록·스토리", "축하·이벤트"];

export default function CreatePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [dur, setDur] = useState(45);
  const [ratio, setRatio] = useState("9:16");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFiles(e) {
    for (const file of e.target.files) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setPhotos((p) => [...p, data]);
      else setErr(data.error || "업로드 실패");
    }
    e.target.value = "";
  }

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { purpose, duration_s: dur, aspect_ratio: ratio },
        material: { text, photos },
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/create/${data.id}`);
    else { setErr(data.error || "생성 실패"); setBusy(false); }
  }

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <p className="pgsub">자료를 주시면 기계가 만들고, 단계마다 확인만 해 주세요 — 대본 → 이미지 → (영상화는 준비 중)</p>
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="eyebrow">레퍼런스 자료 — 텍스트 <small>제품 설명·홍보 포인트·이야기 등 자유롭게</small></div>
        <textarea className="ref" value={text} maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 이번 주 신메뉴 생딸기라떼. 매일 아침 생딸기를 직접 갈아서 만듦…" />
        <div className="char-count">{text.length}자 / 2,000자</div>

        <div className="eyebrow">사진 <small>장면 소스 + AI 컷의 기준 이미지 (선택, ≤10장)</small></div>
        <div className="uploads">
          {photos.map((p) => (
            <div key={p.id} className="up photo-mark" style={{ background: "#333" }}>
              <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button className="tag" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>✕ {p.filename.slice(0, 8)}</button>
            </div>
          ))}
          {photos.length < 10 && (
            <label className="up add">+<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} /></label>
          )}
        </div>

        <div className="eyebrow">영상의 목적</div>
        <div className="chips">{PURPOSES.map((p) => (
          <button key={p} className={`chip${purpose === p ? " on" : ""}`} onClick={() => setPurpose(p)}>{p}</button>))}
        </div>
        <div className="eyebrow">길이</div>
        <div className="chips">{[15, 30, 45, 60].map((d) => (
          <button key={d} className={`chip${dur === d ? " on" : ""}`} onClick={() => setDur(d)}>{d}초</button>))}
        </div>
        <div className="eyebrow">화면 비율</div>
        <div className="chips">{["9:16", "1:1", "16:9"].map((r) => (
          <button key={r} className={`chip${ratio === r ? " on" : ""}`} onClick={() => setRatio(r)}>{r}</button>))}
        </div>

        {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
        <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "만드는 중…" : "대본 만들기 →"} <span className="cr">무료</span>
        </button>
      </section>
    </>
  );
}
```

- [ ] **Step 3: 검증** — `npm run build` 통과, dev에서 /create 접속 → 업로드·칩·제출로 `/create/<id>` 이동(404여도 OK — 다음 태스크에서 구현)

- [ ] **Step 4: Commit** — `git commit -am "feat: 1단계 자료·설정 페이지 + 사이드바 활성화"`

---

### Task 9: UI — 2·3단계 게이트 페이지 (`/create/[id]`)

**Files:**
- Create: `app/create/[id]/page.js`
- Modify: `app/globals.css` (스테퍼 가로형 `.stepper-h`, 대본 박스 `.script-box`, 컷 카드 `.scene/.thumb` — 목업 v4 CSS에서 이식)

**Interfaces:**
- Consumes: `GET /api/projects/[id]`, `POST .../script {instruction?}`, `PATCH .../ (cut 문장)`, `POST .../cuts`, `GET .../cuts/status`(2초 폴링), `POST .../cuts/[idx]/regen`
- Produces: 없음 (말단 UI)

- [ ] **Step 1: CSS 이식** — `app/globals.css` 끝에 추가 (목업 v4에서 가져옴):

```css
/* ── 단계별 워크플로우 */
.stepper-h { display: flex; gap: 4px; margin: 0 0 20px; background: var(--surface); border-radius: 10px; padding: 4px; width: fit-content; }
.stepper-h button { border: 0; background: transparent; color: var(--ink-soft); padding: 8px 16px; font-size: 13px; cursor: pointer; border-radius: 7px; }
.stepper-h button.on { background: var(--surface2); color: var(--ink); font-weight: 700; }
.stepper-h button.done { color: var(--good); }
.stepper-h button:disabled { cursor: default; opacity: .6; }
.script-box { background: var(--deep); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; font-size: 14px; line-height: 1.8; }
.script-box p { margin: 0 0 14px; }
.script-box .tag { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .06em; color: #B9A0FF; background: var(--accent-soft); border-radius: 4px; padding: 1px 7px; margin-right: 7px; }
.script-src { font-size: 11.5px; color: var(--ink-soft); margin-top: 10px; }
.script-src b { color: var(--good); }
.scene { display: grid; grid-template-columns: 112px 1fr auto; gap: 16px; align-items: start; padding: 16px 0; border-bottom: 1px solid rgba(57,62,70,.45); }
.scene:last-of-type { border-bottom: 0; }
.thumb { width: 112px; height: 158px; border-radius: 10px; position: relative; overflow: hidden; flex: none; background: var(--surface2); }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb .num { position: absolute; top: 6px; left: 7px; font-size: 11px; color: #fff; background: rgba(0,0,0,.55); border-radius: 5px; padding: 1px 7px; }
.thumb .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--ink-soft); font-size: 11px; text-align: center; }
.badge.photo { background: var(--good-soft); color: var(--good); }
.badge.ai { background: var(--surface2); color: var(--ink-soft); }
.badge.vlm { background: var(--accent-soft); color: #B9A0FF; }
.badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.regen-note { font-size: 10.5px; color: var(--ink-soft); text-align: center; }
.sent-input { width: 100%; border: 1px solid var(--line); background: var(--deep); color: var(--ink); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; }
```

- [ ] **Step 2: 페이지 구현** — `app/create/[id]/page.js` ("use client"). 상태 머신은 서버 project.status를 따른다:

```jsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const pollRef = useRef(null);

  async function load() {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setProject(await res.json());
    else setErr("프로젝트를 찾을 수 없어요");
  }
  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, [id]);

  // 대본이 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && project.status === "draft" && !busy) genScript();
  }, [project?.status]);

  async function genScript(instr) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/script`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instr ? { instruction: instr } : {}),
    });
    const data = await res.json();
    if (!res.ok) setErr(data.error || "대본 생성 실패");
    await load();
    setBusy(false); setInstruction("");
  }

  async function approveScript() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) { setErr((await res.json()).error || "시작 실패"); setBusy(false); return; }
    // 폴링 시작
    pollRef.current = setInterval(async () => {
      const st = await (await fetch(`/api/projects/${id}/cuts/status`)).json();
      setProject((p) => ({ ...p, status: st.status, cuts: st.cuts }));
      const pending = (st.cuts || []).some((c) => ["pending", "generating"].includes(c.state));
      if (st.cuts?.length && !pending) { clearInterval(pollRef.current); setBusy(false); }
    }, 2000);
  }

  async function regen(idx) {
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setErr(data.error);
    await load();
  }

  if (!project) return <p className="pgsub">{err || "불러오는 중…"}</p>;

  const step = project.status === "cuts" ? 3 : project.status === "script" ? 2 : 1;
  const generating = busy && step >= 2 && (project.cuts || []).some?.((c) => ["pending", "generating"].includes(c.state));

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <nav className="stepper-h">
        <button className="done" disabled>1 자료·설정 ✓</button>
        <button className={step === 2 ? "on" : step > 2 ? "done" : ""} disabled>2 대본 확인</button>
        <button className={step === 3 ? "on" : ""} disabled>3 이미지 확인</button>
        <button disabled>4 영상화 (준비 중)</button>
      </nav>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}

      {step === 2 && project.script && (
        <section className="panel" style={{ maxWidth: 760 }}>
          <h2>대본을 확인해 주세요 <span className="badge vlm">승인 게이트 1</span></h2>
          <div className="script-box">
            {project.script.paragraphs.map((p, i) => (
              <p key={i}>
                <span className="tag">{p.tag}</span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  style={{ outline: "none" }}
                  onBlur={async (e) => {
                    const text = e.currentTarget.textContent.trim();
                    if (text && text !== p.text) {
                      await fetch(`/api/projects/${id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ script_paragraph: { idx: i, text } }),
                      });
                      await load();
                    }
                  }}
                >{p.text}</span>
              </p>
            ))}
          </div>
          <div className="script-src">문장을 클릭하면 바로 고칠 수 있어요</div>
          {project.script.coverage?.length > 0 && (
            <div className="script-src">자료 반영 — {project.script.coverage.map((c, i) => <b key={i}>✓ {c} </b>)}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input className="sent-input" style={{ flex: 1 }} placeholder='수정 지시 (예: "더 짧게", "더 캐주얼하게")'
              value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            <button className="mini" disabled={busy} onClick={() => genScript(instruction || "전체를 다시 써줘")}>
              {instruction ? "지시 반영" : "전체 다시 쓰기"}
            </button>
          </div>
          <button className="cta" disabled={busy} onClick={approveScript}>
            대본 승인 — 컷 나누고 이미지 만들기
          </button>
          <div className="credit-note">컷당 이미지 후보 2장 생성 + AI 검수 (약 $0.08/컷)</div>
        </section>
      )}

      {step === 2 && !project.script && <p className="pgsub">대본을 쓰는 중…</p>}

      {step === 3 && (
        <section className="panel" style={{ maxWidth: 760 }}>
          <h2>{generating ? "컷별 이미지를 만들고 있어요" : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트 2</span></>}</h2>
          {(project.cuts || []).map((c) => {
            const photo = project.material.photos.find((p) => p.id === c.photo_id);
            const img = c.source === "photo" ? photo?.url : c.image?.url;
            return (
              <div className="scene" key={c.idx}>
                <div className={`thumb${c.source === "photo" ? " photo-mark" : ""}`}>
                  <span className="num">{c.idx + 1}</span>
                  {img ? <img src={img} alt="" /> :
                    <span className="ph">{c.state === "needs_attention" ? "품질 확인 필요" : "생성 중…"}</span>}
                </div>
                <div className="txt">
                  “<span contentEditable suppressContentEditableWarning style={{ outline: "none" }}
                    onBlur={async (e) => {
                      const sentence = e.currentTarget.textContent.trim();
                      if (sentence && sentence !== c.sentence) {
                        await fetch(`/api/projects/${id}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cut: { idx: c.idx, sentence } }),
                        });
                        await load();
                      }
                    }}>{c.sentence}</span>”
                  <div className="badges">
                    <span className={`badge ${c.source === "photo" ? "photo" : "ai"}`}>
                      {c.source === "photo" ? `내 사진 · ${photo?.filename || ""}` : "AI 생성"}
                    </span>
                    {c.ref_photo_id && <span className="badge vlm">레퍼런스 적용</span>}
                    {c.vlm?.note && <span className="badge ai">{c.vlm.note.slice(0, 30)}</span>}
                    <span className="badge ai">{c.seconds}초</span>
                  </div>
                </div>
                <div className="ops" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.source === "ai" && (
                    <>
                      <button className="mini" disabled={c.state === "generating" || c.regen_count >= 3} onClick={() => regen(c.idx)}>
                        {c.regen_count >= 3 ? "상한 도달" : "다시 생성"}
                      </button>
                      <span className="regen-note mono">재생성 {c.regen_count}/3</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!generating && (
            <>
              <button className="cta" disabled>영상화 — 준비 중 (M2)</button>
              <div className="credit-note">M1은 여기까지예요 — 이미지가 곧 각 컷의 시작 프레임이 됩니다</div>
            </>
          )}
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 3: 검증** — `npm run build` 통과. dev에서 목데이터 없이 흐름 확인은 Task 11 e2e에서.

- [ ] **Step 4: Commit** — `git commit -am "feat: 대본·이미지 승인 게이트 UI"`

---

### Task 10: 비용 단가표에 이미지 항목 + env 예시 갱신

**Files:**
- Modify: `lib/costs.js` (표시용 — imagegen이 고정가 기록하므로 단가표 주석만), `.env.local.example` (FAL_IMAGE_ENDPOINT 추가), `README.md` (구조 갱신)

- [ ] **Step 1:** `.env.local.example`에 추가:

```
# 이미지 생성 모델 (단계별 워크플로우용)
FAL_IMAGE_ENDPOINT=fal-ai/nano-banana
```

`.env.local`에도 동일 추가.

- [ ] **Step 2:** `README.md` 구조 섹션에 단계별 워크플로우 라우트·lib 목록 추가 (T1~T9에서 만든 파일 반영).

- [ ] **Step 3: Commit** — `git commit -am "docs: env 예시·README 갱신"`

---

### Task 11: 통합 검증 (e2e)

**Files:** 없음 (검증만)

- [ ] **Step 1:** `npm test` 전체 PASS + `npm run build` 통과 확인
- [ ] **Step 2:** dev 서버 재시작 후 실키 e2e — 사용자와 함께:
  1. `/create`에서 카페 시나리오 텍스트 + 사진 1~3장 업로드 → 제출
  2. 대본 확인: 자료 포인트가 coverage에 뜨는지, "더 짧게" 지시가 반영되는지
  3. 승인 → 이미지 게이트: 컷 분할이 상식적인지(사진/AI 소스 판정), 이미지 품질, 레퍼런스 컷의 제품 외형 일치 여부, "다시 생성" 동작
  4. `/costs`에 이미지 비용이 쌓이는지
- [ ] **Step 3:** 발견된 문제는 이 계획 문서 하단에 기록하고 수정 커밋
