# 완성본 Storage 이전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성 mp4 를 로컬 파일에서 Supabase Storage 비공개 버킷으로 옮기고, 합성 중간물이 쌓이던 것을 임시 폴더로 몰아 치운다.

**Architecture:** `lib/compose.js` 는 여전히 로컬 파일에 쓴다(ffmpeg 가 자식 프로세스라 스트림을 못 받는다). 바뀌는 것은 **어디에 쓰고 끝나면 무엇을 하느냐**다 — `data/renders/` 대신 `fs.mkdtemp` 임시 폴더에 만들고, 최종본만 `putObject("renders", …)` 로 올린 뒤 `finally` 에서 폴더를 통째로 지운다. 읽기는 `/api/renders/[name]` 이 `getObject` 로 흘려준다. **URL 형태는 그대로다.**

**Tech Stack:** Node `fs/promises`(`mkdtemp`·`rm`·`readFile`) · Supabase Storage(`putObject`/`getObject`) · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-render-storage-design.md` 의 "건드리지 않는 것"을 그대로 옮긴다.

- **URL 형태를 바꾸지 않는다** — `composeVideo` 는 `/api/renders/<projectId>.mp4` 를 그대로 돌려준다. `renderKey`/`render.of`(`lib/steps.js`)가 URL 로 낡음을 판정하므로, 바뀌면 기존 완성본이 전부 "낡음"이 되고 그 버튼은 **유료**다
- **ffmpeg 인자·필터·자막 처리를 건드리지 않는다** — `buildFfmpegArgs` 는 무손상. 그 함수의 기존 테스트 9건이 계약이다
- **`SHOTFORM_COMPOSER=fal` 경로를 건드리지 않는다** — 그쪽은 로컬 파일을 안 쓴다(`composeWithFal`)
- **`/api/renders/[name]` 의 소유자 검사와 `UUID_MP4` 정규식을 유지한다** — 파일명이 곧 프로젝트 id 라 `getProject(id, user.id)` 로 판정한다
- **가짜 모드(`fakeFal()`)의 반환 형태를 바꾸지 않는다** — `{ fake: true, url: null, seconds }`
- **버킷 이름은 `renders`** (비공개). `uploads` 와 같은 방식
- 새 npm 의존성을 추가하지 않는다
- **병렬 세션이 만지는 파일을 건드리지 않는다**: `lib/costs.js` · `lib/llm.js` · `lib/script-gen.js` · `lib/auth/require-user.js` · `lib/briefing-extract.js` · `app/api/chat/route.js` · `app/api/projects/[id]/briefing/route.js` · 재생성 3종 라우트
- **예상 못 한 실패는 고치지 말고 보고한다.** 아래 표에 없는 테스트가 빨개지면 범위를 넘은 것이다

이 계획이 갱신을 **허용**하는 테스트:

| 파일 | 무엇 | 태스크 |
|---|---|---|
| `tests/compose.test.js` | `composeVideo` 호출부에 주입 인자 추가 | Task 2 |

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라(문서에 적힌 숫자는 낡는다). 매 태스크 끝에서 그 수가 유지되거나 늘어야 한다.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

---

### Task 1: 버킷과 store 계약

**Files:**
- Modify: `db/schema.sql`
- Test: `tests/store-memory.test.js`

**Interfaces:**
- Produces: 버킷 이름 문자열 `"renders"`. Task 2·3·4 가 `putObject("renders", key, bytes, contentType)` / `getObject("renders", key)` 로 쓴다

- [ ] **Step 1: 스키마에 버킷을 더한다**

`db/schema.sql` 에서 `uploads` 버킷을 만드는 `insert into storage.buckets` 바로 아래에 붙인다:

```sql
-- 완성 mp4. uploads 와 같은 이유로 비공개다 — /api/renders 라우트가 소유자를 확인하고 흘려준다.
insert into storage.buckets (id, name, public)
values ('renders', 'renders', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: 인메모리 store 가 renders 버킷을 다루는지 확인하는 테스트**

`tests/store-memory.test.js` 의 `describe("인메모리 store", …)` 안에 더한다:

```js
  it("renders 버킷도 같은 방식으로 넣고 꺼낸다", async () => {
    const s = getStore();
    await s.putObject("renders", "p1.mp4", Buffer.from("mp4-bytes"), "video/mp4");
    expect((await s.getObject("renders", "p1.mp4")).toString()).toBe("mp4-bytes");
    // 버킷이 갈라져 있다 — 같은 key 라도 uploads 것과 섞이지 않는다
    await s.putObject("uploads", "p1.mp4", Buffer.from("사진"), "image/jpeg");
    expect((await s.getObject("renders", "p1.mp4")).toString()).toBe("mp4-bytes");
  });
```

- [ ] **Step 3: 테스트를 돌린다**

Run: `npx vitest run tests/store-memory.test.js`
Expected: PASS — `memoryStore` 는 `${bucket}/${key}` 를 키로 쓰므로 이미 통과한다. 이 테스트는 **버킷이 갈라져 있다는 계약을 못 박는 것**이지 새 기능이 아니다.

- [ ] **Step 4: 커밋**

```bash
git add db/schema.sql tests/store-memory.test.js
git commit -m "feat(schema): renders 비공개 버킷 — 완성본이 서버에 묶이지 않게

uploads 와 같은 방식이다. 지금 완성 mp4 는 data/renders/ 로컬 파일이라
서버를 다시 만들면 사장님이 만든 영상이 사라진다."
```

---

### Task 2: 합성이 임시 폴더를 쓰고 최종본만 올린다

이 계획의 핵심이다.

**Files:**
- Modify: `lib/compose.js:140-190`
- Test: `tests/compose.test.js`

**Interfaces:**
- Consumes: Task 1 의 `"renders"` 버킷
- Produces: `composeVideo` 가 **여전히** `{ url: "/api/renders/<projectId>.mp4", seconds }` 를 돌려준다. 새 주입 인자 셋: `mkdtempImpl` · `rmImpl` · `putObjectImpl`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/compose.test.js` 의 `describe("composeVideo", …)` 안에 더한다:

```js
  it("최종본만 Storage 에 올린다 — 중간물은 안 올린다", async () => {
    const put = [];
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async (bucket, key, bytes, ct) => put.push({ bucket, key, ct }),
    });
    // 올린 것은 하나뿐이고 최종본이다 — 클립(p1-0.mp4)·소리(p1-0.m4a)·자막(p1.ass)은 아니다
    expect(put).toEqual([{ bucket: "renders", key: "p1.mp4", ct: "video/mp4" }]);
  });

  it("합성이 실패해도 임시 폴더를 치운다", async () => {
    const removed = [];
    await expect(composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => { throw new Error("ffmpeg 죽음"); },
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async (dir) => removed.push(dir),
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    })).rejects.toThrow("ffmpeg 죽음");
    // 값을 치른 뒤 실패해도 디스크는 안 남긴다 — 지금은 그대로 쌓인다
    expect(removed).toEqual(["/tmp/x"]);
  });

  it("URL 형태는 그대로다 — 각인이 이 문자열로 낡음을 판정한다", async () => {
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async () => {},
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(r.url).toBe("/api/renders/p1.mp4");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: FAIL 3건 — `putObjectImpl` 이 한 번도 안 불리고(`put` 이 빈 배열), `rmImpl` 도 안 불린다.

- [ ] **Step 3: `composeVideo` 를 고친다**

`lib/compose.js` 상단 import 에 더한다:

```js
import os from "os";
import { getStore } from "./store/index.js";
```

서명에 주입 인자 넷을 더한다(기본값은 실물):

```js
export async function composeVideo({
  projectId,
  cuts,
  aspect_ratio,
  fetchImpl = fetch,
  runFfmpeg = defaultRunFfmpeg,
  downloadImpl = defaultDownload,
  writeFileImpl = fs.writeFile,
  mkdirImpl = fs.mkdir,
  mkdtempImpl = (prefix) => fs.mkdtemp(prefix),
  rmImpl = (dir) => fs.rm(dir, { recursive: true, force: true }),
  readFileImpl = fs.readFile,
  putObjectImpl = (bucket, key, bytes, ct) => getStore().putObject(bucket, key, bytes, ct),
}) {
```

`const dir = rendersDir(); await mkdirImpl(dir, { recursive: true });` 를 임시 폴더로 바꾸고 전체를 `try/finally` 로 감싼다:

```js
  // ★ 임시 폴더에 만들고 최종본만 올린 뒤 통째로 지운다.
  //
  // 예전에는 data/renders/ 에 중간물(클립·소리·자막)까지 그대로 쌓였다 — 실측 71개
  // 215MB 중 65개가 중간물이었고, 합성이 실패하면 그것도 남았다. 중간물은 fal CDN 에서
  // 다시 받을 수 있어 지킬 이유가 없다.
  //
  // ffmpeg 는 여전히 로컬 파일에 쓴다(자식 프로세스라 스트림을 못 받는다).
  // "만들고 나서 올린다"가 유일한 순서다.
  const dir = await mkdtempImpl(path.join(os.tmpdir(), `shotform-${projectId}-`));
  try {
    // 1) 클립·소리를 내려받는다
    const local = [];
    for (const c of usable) {
      local.push({
        video: await downloadImpl(c.video.url, path.join(dir, `${projectId}-${c.idx}.mp4`)),
        audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.m4a`)),
        wantSeconds: Number(c.seconds) || 0,
        haveSeconds: Number(c.video?.seconds) || 0,
      });
    }

    // 2) 자막 파일
    const assPath = path.join(dir, `${projectId}.ass`);
    await writeFileImpl(assPath, toAss(buildCues(usable, { width, height }), { width, height }), "utf8");

    // 3) 한 번에 조립
    const out = path.join(dir, `${projectId}.mp4`);
    await runFfmpeg(buildFfmpegArgs({ local, assPath, out, width, height }));

    // 4) 최종본만 올린다 — 중간물은 여기서 버려진다
    await putObjectImpl("renders", `${projectId}.mp4`, await readFileImpl(out), "video/mp4");

    // URL 형태를 바꾸지 않는다 — render.of 각인이 이 문자열로 낡음을 판정한다
    return { url: `/api/renders/${projectId}.mp4`, seconds };
  } finally {
    // 실패해도 치운다. 값(ffmpeg 시간)은 이미 치른 뒤라 디스크까지 남기지 않는다.
    await rmImpl(dir);
  }
```

`mkdirImpl` 은 이제 안 쓰지만 **서명에서 빼지 마라** — 기존 테스트 여섯이 그것을 넘긴다(넘겨도 무해하다). 빼면 그 테스트들이 전부 깨진다.

`rendersDir()` 함수도 **지우지 마라** — Task 4 의 이관 스크립트가 로컬 경로를 찾을 때 쓴다.

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: PASS 전부. 기존 `buildFfmpegArgs` 테스트 9건도 무손상이어야 한다.

- [ ] **Step 5: 변이로 단정이 무는지 본다**

`finally { await rmImpl(dir); }` 를 잠깐 `finally { }` 로 비우고 `npx vitest run tests/compose.test.js` 를 돌린다.
Expected: "합성이 실패해도 임시 폴더를 치운다" 가 FAIL. 확인했으면 **되돌린다**.

★ 되돌릴 때 `git checkout` 을 쓰지 마라 — 이 파일의 다른 미커밋 변경까지 사라진다. 편집기로 그 줄만 되돌린다.

- [ ] **Step 6: 전체 테스트**

Run: `npx vitest run`
Expected: 시작 시 센 수 + 3

- [ ] **Step 7: 커밋**

```bash
git add lib/compose.js tests/compose.test.js
git commit -m "feat(compose): 최종본은 Storage 로, 중간물은 쓰고 버린다

data/renders/ 에 중간물까지 쌓이고 있었다 — 실측 71개 215MB 중 65개가
클립·소리·자막이고, 합성이 실패하면 그것도 남았다. 중간물은 fal CDN 에서
다시 받을 수 있어 지킬 이유가 없다.

임시 폴더에 만들고 최종본만 renders 버킷에 올린 뒤 finally 에서 통째로 지운다.
ffmpeg 는 여전히 로컬 파일에 쓴다 — 자식 프로세스라 스트림을 못 받는다.

★ URL 형태(/api/renders/<id>.mp4)는 그대로다. render.of 각인이 이 문자열로
낡음을 판정해서, 바뀌면 기존 완성본이 전부 낡음이 되고 그 버튼은 유료다."
```

---

### Task 3: 읽기 라우트가 Storage 에서 흘려준다

**Files:**
- Modify: `app/api/renders/[name]/route.js`

**Interfaces:**
- Consumes: Task 1 의 `"renders"` 버킷, Task 2 가 올린 `<projectId>.mp4`

- [ ] **Step 1: 파일 읽기를 Storage 로 바꾼다**

파일 전체를 아래로 바꾼다. **바뀌는 것은 바이트를 어디서 얻는가뿐**이다 —
소유자 검사·정규식·응답 헤더·404 처리는 지금 것 그대로다.

★ `Content-Disposition: attachment` 를 **반드시 살린다.** 지금 라우트에 있는 헤더이고,
빠뜨리면 내려받기 동작이 바뀐다.

```js
import { withUser } from "../../../../lib/auth/require-user.js";
import { getProject } from "../../../../lib/projects.js";
import { getStore } from "../../../../lib/store/index.js";

// 파일명이 곧 프로젝트 id 다(lib/compose.js 가 `${projectId}.mp4` 로 올린다).
// 그래서 별도 매핑 없이 소유자를 검사할 수 있다(uploads 와 달리 upload_owners 가 필요 없다).
const UUID_MP4 = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.mp4$/;

export const GET = withUser(async (_req, { params }, user) => {
  const { name } = await params;
  const m = UUID_MP4.exec(name);
  if (!m) return new Response("잘못된 파일명", { status: 400 });

  const project = await getProject(m[1], user.id);
  if (!project) return new Response("없음", { status: 404 });

  // 완성본은 renders 비공개 버킷에 있다 — 이 라우트가 소유자를 확인하고 흘려준다.
  // 서명 URL 을 프론트에 주지 않는 이유는 uploads 와 같다: 문서에 저장된 url 이
  // 영구히 유효해야 한다.
  try {
    const buf = await getStore().getObject("renders", name);
    return new Response(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch {
    // 버킷에 없다 = 아직 이관되지 않았거나 지워진 것. 파일이 없던 때와 같은 답이다.
    return new Response("없음", { status: 404 });
  }
});
```

`import { promises as fs } from "fs"` 와 `import path from "path"` 는 이제 안 쓰므로 지운다
(위 코드에 이미 빠져 있다).

⚠️ 파일 첫 줄의 주석이 `lib/compose.js:184` 를 가리키는데 Task 2 가 줄을 바꿨다.
위 코드처럼 **줄 번호 없이** 적는다 — 줄 번호를 적으면 다음에 또 낡는다.

- [ ] **Step 2: 전체 테스트**

Run: `npx vitest run`
Expected: 시작 시 센 수 + 3 유지(Task 2 에서 늘어난 것). 이 라우트를 직접 재는 테스트는 없다 — 라이브에서 확인한다(Task 5).

- [ ] **Step 3: 커밋**

```bash
git add "app/api/renders/[name]/route.js"
git commit -m "feat(renders): 완성본을 Storage 에서 흘려준다

소유자 검사와 UUID_MP4 정규식은 그대로다 — 파일명이 곧 프로젝트 id 라
별도 매핑이 필요 없다. 버킷에 없으면 404 로 답한다(아직 이관 안 됐거나 지워진 것)."
```

---

### Task 4: 이관 스크립트 — 최종본만, 멱등

**Files:**
- Create: `scripts/migrate-renders-to-storage.mjs`

**Interfaces:**
- Consumes: Task 1 의 `"renders"` 버킷

- [ ] **Step 1: 스크립트를 쓴다**

```js
// data/renders/ 의 완성본을 renders 버킷으로 옮긴다.
//
// ★ 최종본(<uuid>.mp4)만 올린다. 같은 폴더에 중간물이 섞여 있다 —
//   실측 71개 중 65개가 클립(<uuid>-<N>.mp4)·소리(.m4a)·자막(.ass)이고,
//   그것들은 fal CDN 에서 다시 받을 수 있어 지킬 이유가 없다.
//
// ★ 멱등이다. 두 번 돌려도 개수가 안 는다 — 이미 있는 것은 건너뛴다.
// ★ 로컬 파일을 지우지 않는다. 확인한 뒤 사람이 지운다.
//
// 실행: node scripts/migrate-renders-to-storage.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { getStore } = await import("../lib/store/index.js");
const store = getStore();

// compose.js 와 같은 규칙으로 경로를 잡는다
const base = process.env.SHOTFORM_DATA_DIR || path.join(process.cwd(), "data");
const dir = path.join(base, "renders");
if (!existsSync(dir)) {
  console.log(`${dir} 가 없습니다 — 옮길 것이 없습니다.`);
  process.exit(0);
}

// 라우트의 UUID_MP4 와 같은 형태만 고른다
const FINAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;
const all = readdirSync(dir);
const finals = all.filter((f) => FINAL.test(f));

console.log(`${dir}`);
console.log(`  전체 ${all.length}개 · 최종본 ${finals.length}개 · 건너뜀 ${all.length - finals.length}개(중간물)\n`);

let uploaded = 0;
let skipped = 0;
for (const name of finals) {
  try {
    await store.getObject("renders", name);
    console.log(`  = ${name}  (이미 있음)`);
    skipped += 1;
    continue;
  } catch {
    // 없다 = 올릴 대상
  }
  const bytes = readFileSync(path.join(dir, name));
  await store.putObject("renders", name, bytes, "video/mp4");
  console.log(`  + ${name}  (${(bytes.length / 1024 / 1024).toFixed(1)}MB)`);
  uploaded += 1;
}
console.log(`\n올림 ${uploaded} · 이미 있음 ${skipped} · 합계 ${uploaded + skipped}`);
console.log("로컬 파일은 그대로 뒀습니다 — 화면에서 재생을 확인한 뒤 지우세요.");
```

- [ ] **Step 2: 문법을 확인한다**

Run: `node --check scripts/migrate-renders-to-storage.mjs`
Expected: 아무 출력 없음(통과)

⚠️ **실행은 하지 마라.** 라이브 Supabase 에 쓰는 스크립트다 — Task 5 에서 사장님 확인 아래 돌린다.

- [ ] **Step 3: 커밋**

```bash
git add scripts/migrate-renders-to-storage.mjs
git commit -m "chore: 완성본 이관 스크립트 — 최종본만, 멱등

data/renders/ 71개 중 최종본은 6개뿐이고 나머지는 중간물이다(실측).
<uuid>.mp4 형태만 골라 올리고, 이미 있는 것은 건너뛴다.
로컬 파일은 안 지운다 — 재생을 확인한 뒤 사람이 지운다."
```

---

### Task 5: 라이브 확인

코드가 아니라 **판정**이다. 사장님 확인이 필요한 단계가 둘 있다.

**Files:** 없음 (보고서만)

- [ ] **Step 1: 버킷이 있는지 확인한다**

Supabase 대시보드 Storage 에서 `renders` 버킷을 본다. 없으면 `db/schema.sql` 을 통째로 다시 올린다(멱등).
권한에 막히면 대시보드에서 **비공개 버킷 `renders` 를 수동 생성**한다 — 07-31 에 `uploads` 가 그랬다.

**★ 여기서 멈추고 사장님께 보고한다.** 버킷 없이 다음으로 가면 합성 끝에 업로드가 실패하는데,
그때는 ffmpeg 값(시간)을 이미 치른 뒤다.

- [ ] **Step 2: 이관 스크립트를 돌린다**

Run: `node scripts/migrate-renders-to-storage.mjs`
Expected: `올림 6 · 이미 있음 0`

- [ ] **Step 3: 멱등을 확인한다**

같은 명령을 한 번 더 돌린다.
Expected: `올림 0 · 이미 있음 6` — 개수가 안 는다

- [ ] **Step 4: 화면에서 재생한다**

dev 서버에서 완성된 프로젝트의 ⑥완성 화면을 열어 영상이 재생되는지 본다.
`/api/renders/<id>.mp4` 가 200 이고 mp4 가 흘러야 한다.

- [ ] **Step 5: 낡음이 안 생겼는지 확인한다**

같은 화면에서 **"다시 만들기" 경고가 뜨지 않아야 한다.** 뜨면 URL 형태가 바뀐 것이다
(`isRenderStale` 이 `render.of` 와 지금 URL 을 비교한다) — 그 버튼은 유료다.

- [ ] **Step 6: 보고서에 남긴다**

무엇을 확인했고 무엇이 미검증인지 적는다. 특히 **새로 합성한 영상**(이관된 것이 아니라)이
Storage 에 올라가는 경로는 유료 관통이라 이번에 안 밟았다면 그렇게 적는다.

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert` 가 가능하다. 다만 **Task 3 은 Task 2 에 의존한다** —
Task 2 를 되돌리면 완성본이 Storage 에 안 올라가는데 Task 3 은 거기서만 읽으므로, 둘을 함께
되돌려야 한다.

이미 Storage 에 올라간 파일은 되돌려도 남는다(해롭지 않다 — 로컬 파일이 그대로 있으므로
Task 2·3 을 되돌리면 예전 경로로 다시 읽는다).
