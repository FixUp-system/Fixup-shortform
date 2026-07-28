# 인물 일관성 1단계 — 아바타 레퍼런스 배선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 사진을 주지 않아도 인물이 컷을 가로질러 같은 사람으로 나온다.

**Architecture:** 원고를 한 번 읽어 등장 인물을 뽑고(캐스팅), 인물마다 아바타를 배정한다.
사장님이 올린 사진에 그 인물이 담겨 있으면 사진이 우선한다. 컷은 캐스팅 목록에서 골라
쓰고, 이미지 생성은 레퍼런스를 최대 2장(인물 + 사물) 받는다.

**Tech Stack:** Next.js App Router, vitest, fal.ai(nano-banana/edit), OpenAI(gpt-4o · vision)

설계: `docs/superpowers/specs/2026-07-28-avatar-reference-consistency-design.md`

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 두 워크트리가
  같은 파일 이름을 갖는다 — 잘못 쓰면 다른 세션의 작업을 조용히 오염시킨다
- 기존 테스트 **338개 그린이 하한선**
- **실제 이미지·영상 생성(fal 유료 호출)은 실행 전에 사장님 검토를 받는다.** Task 8이 그
  게이트다. Task 1~7은 유료 호출 없이 끝난다
- 테스트에서 파일을 쓰는 모듈을 다룰 때는 임시 폴더로 돌린다 (`tests/projects.test.js` 패턴).
  아바타 폴더는 `SHOTFORM_AVATARS_DIR` 로 돌린다
- 레퍼런스 상한은 **컷당 2장**(인물 1 + 사물 1). 업로드 사진이 우선이다
- 한국어 문구는 사장님이 읽는 말로 쓴다. 파일명·함수명을 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조를 따른다 (무엇을 왜 바꿨는지 한 줄 + 본문)
- 새 기능의 모든 실패는 **"지금 동작"으로 내려앉아야 한다** — 캐스팅·판정이 실패해도 컷은 남고
  그림은 나온다

---

## File Structure

**생성**
- `lib/refs.js` — 아바타 목록. **순수 데이터, import 없음**(`lib/voices.js`와 같은 이유 —
  화면이 import 해도 번들에 `fs`가 들어가지 않아야 한다)
- `lib/cast.js` — 캐스팅 프롬프트 + 아바타 파일 확인 + 순수 판정 함수들
- `tests/cast.test.js` — 캐스팅·배정·해석
- `tests/refs.test.js` — 아바타 목록 방어

**수정**
- `lib/validate.js` — `validateCast` 신규, `validateShows`가 `ref_ids` 배열을 받는다
- `lib/cuts.js` — `SHOWS_SYSTEM`이 `ref_ids`를 뱉게, `buildShowsMessages`가 캐스팅을 넘긴다,
  `buildImagePrompt`가 `kind`별 문구를 붙인다
- `lib/vlm.js` — `describePhoto` 신규
- `lib/pipeline.js` — `splitCuts`에 캐스팅·사진 판정을 끼우고, `processCut`이 `refs` 배열을 넘긴다
- `lib/imagegen.js` — `refImagePath` 하나 → `refs` 배열
- `tests/validate.test.js` · `tests/cuts.test.js` · `tests/pipeline.test.js` · `tests/vlm.test.js`

**건드리지 않음**
- `app/create/[id]/script/page.js` — 출연 블록은 2단계다
- `lib/i2v.js` · `lib/compose.js` — 클립·합성은 이미지가 정해진 뒤의 일이다

---

## Task 1: 아바타 목록과 파일 확인

목록은 순수 데이터로 두고, 파일이 실제로 있는 항목만 골라내는 함수를 만든다.
**폴더가 비어 있어도 아무것도 부러지지 않아야 한다** — 사장님이 파일을 넣기 전에 켜도 된다.

**Files:**
- Create: `lib/refs.js`
- Create: `lib/cast.js`
- Test: `tests/refs.test.js` (신규)

**Interfaces:**
- Produces: `AVATARS: Array<{id, file, kind, label, traits}>` (from `lib/refs.js`)
- Produces: `avatarsDir(): string` — `SHOTFORM_AVATARS_DIR` 또는 `<cwd>/assets/refs`
- Produces: `availableAvatars(dir?): Promise<Avatar[]>` — 파일이 있는 항목만
- Produces: `avatarFile(avatarId, dir?): string|null` — 절대경로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/refs.test.js` 를 만든다:

```js
// 아바타 풀 — 파일이 없는 항목은 조용히 빠져야 한다.
// 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다(업로드 사진에 이미 같은 방어가 있다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { AVATARS } from "../lib/refs.js";
import { availableAvatars, avatarFile } from "../lib/cast.js";

let dir;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shotform-av-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("AVATARS", () => {
  it("항목마다 id·file·kind·label·traits 가 있다", () => {
    expect(AVATARS.length).toBeGreaterThan(0);
    for (const a of AVATARS) {
      expect(a.id, JSON.stringify(a)).toMatch(/^av-/);
      expect(a.file).toMatch(/\.(jpg|jpeg|png)$/);
      expect(a.kind).toBe("person");
      expect(typeof a.label).toBe("string");
      expect(a.traits.length).toBeGreaterThan(0);
    }
  });

  it("id 가 겹치지 않는다", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("availableAvatars", () => {
  it("폴더가 비어 있으면 빈 배열 — 켜도 아무것도 부러지지 않는다", async () => {
    expect(await availableAvatars(dir)).toEqual([]);
  });

  it("폴더가 아예 없어도 빈 배열이다", async () => {
    expect(await availableAvatars(path.join(dir, "없는폴더"))).toEqual([]);
  });

  it("파일이 있는 항목만 돌려준다", async () => {
    writeFileSync(path.join(dir, AVATARS[0].file), "x");
    const got = await availableAvatars(dir);
    expect(got.map((a) => a.id)).toEqual([AVATARS[0].id]);
  });
});

describe("avatarFile", () => {
  it("id 로 절대경로를 만든다", () => {
    expect(avatarFile(AVATARS[0].id, dir)).toBe(path.join(dir, AVATARS[0].file));
  });

  it("없는 id 는 null", () => {
    expect(avatarFile("av-없음", dir)).toBe(null);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/refs.test.js`
Expected: FAIL — `Cannot find module '../lib/refs.js'`

- [ ] **Step 3: `lib/refs.js` 를 만든다**

```js
// 아바타 풀 — 사장님이 사진을 주지 않았을 때 인물 레퍼런스로 쓴다.
//
// lib/voices.js 와 같은 이유로 여기 따로 둔다: 화면(클라이언트)이 import 할 수 있어야 하고,
// fs 를 끌고 오는 모듈에 두면 번들에 fs 가 들어가 빌드가 깨진다. 목록은 순수 데이터다.
//
// 파일은 assets/refs/ 에 둔다(사장님이 직접 넣는다). 파일이 없는 항목은 조용히 빠진다 —
// lib/cast.js 의 availableAvatars 가 걸러낸다.
//
// traits 는 캐스팅 패스에게 주는 설명이다. 코드가 이것으로 문자열 매칭을 하지 않는다 —
// "10세 전후 아이"와 "초등학생"을 코드로 맞추려면 낱말 목록이 필요하고, 그 목록은
// 표현이 조금 달라지면 못 고른다. 고르는 것은 원고를 읽은 LLM 이 한다.
//
// 나중에 아바타 생성 기능이 이 풀을 채운다. 3장이든 30장이든 코드는 같다.
export const AVATARS = [
  { id: "av-child", file: "child.jpg", kind: "person", label: "아이",   traits: "10세 전후 아이" },
  { id: "av-owner", file: "owner.jpg", kind: "person", label: "사장님", traits: "40~60대 남성" },
  { id: "av-adult", file: "adult.jpg", kind: "person", label: "손님",   traits: "20~40대 성인" },
];
```

- [ ] **Step 4: `lib/cast.js` 를 만든다**

```js
// 캐스팅 — 원고에 나오는 인물을 뽑고, 인물마다 레퍼런스를 정한다.
//
// 왜 컷마다 정하지 않는가: 원고는 같은 사람을 여러 이름으로 부른다("초등학생"·"꼬마"·
// "아드님"). 고정 목록에 컷마다 맞추게 하면 표현이 조금 달라져도 못 고르거나 잘못 고른다.
// 원고당 한 번 뽑고 컷은 그 목록에서만 고르면 그 간극이 없어진다.
import { promises as fs } from "fs";
import path from "path";
import { AVATARS } from "./refs";

export function avatarsDir() {
  return process.env.SHOTFORM_AVATARS_DIR || path.join(process.cwd(), "assets", "refs");
}

// 파일이 실제로 있는 아바타만. 없는 레퍼런스를 가리키는 지시는 그림을 망친다.
export async function availableAvatars(dir = avatarsDir()) {
  const out = [];
  for (const a of AVATARS) {
    try {
      await fs.access(path.join(dir, a.file));
      out.push(a);
    } catch {
      // 파일이 없으면 그 항목은 없는 것으로 둔다 — 폴더가 비어도 정상 동작한다
    }
  }
  return out;
}

export function avatarFile(avatarId, dir = avatarsDir()) {
  const a = AVATARS.find((x) => x.id === avatarId);
  return a ? path.join(dir, a.file) : null;
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/refs.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 338 + 7 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/refs.js lib/cast.js tests/refs.test.js
git commit -m "feat: 아바타 풀을 둔다 — 사진이 없을 때 쓸 인물 레퍼런스

사장님이 사진을 안 주면 인물을 이어줄 것이 아무것도 없어 컷마다 다른 사람이
나왔다. 목록은 순수 데이터로 두고(화면도 봐야 한다), 파일이 있는 항목만 골라
쓴다 — 폴더가 비어 있어도 지금 동작 그대로다.

파일은 assets/refs/ 에 사람이 넣는다. 나중에 아바타 생성이 이 풀을 채운다."
```

---

## Task 2: 캐스팅 패스

원고를 읽고 등장 인물을 뽑는다. 아바타 목록을 함께 넘겨 인물마다 아바타를 고르게 한다.

**Files:**
- Modify: `lib/cast.js` (프롬프트 추가)
- Modify: `lib/validate.js` (`validateCast` 추가)
- Test: `tests/cast.test.js` (신규), `tests/validate.test.js`

**Interfaces:**
- Consumes: `AVATARS`, `availableAvatars` (Task 1)
- Produces: `buildCastMessages(project, avatars): {system, messages}`
- Produces: `validateCast(obj, avatarIds): Array<{id, who, avatar_id?}> | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cast.test.js` 를 만든다:

```js
import { describe, it, expect } from "vitest";
import { buildCastMessages } from "../lib/cast.js";
import { AVATARS } from "../lib/refs.js";

const project = {
  briefing: { topic: "성수동 자전거 수리점 소개" },
  script: { text: "작년에 초등학생이 형에게 물려받은 자전거를 끌고 왔습니다. 그냥 교체해줬습니다." },
};

describe("buildCastMessages", () => {
  it("원고 전문과 아바타 목록을 넘긴다", () => {
    const { system, messages } = buildCastMessages(project, AVATARS);
    const user = messages[0].content;
    expect(user).toContain("초등학생이 형에게 물려받은");
    expect(user).toContain(AVATARS[0].id);
    expect(user).toContain(AVATARS[0].traits);
    expect(system).toContain("JSON");
  });

  it("아바타가 없으면 (없음) 이라고 적는다 — 없는 것을 고르라고 하면 안 된다", () => {
    const { messages } = buildCastMessages(project, []);
    expect(messages[0].content).toContain("(없음)");
  });

  it("주제를 안 밝힌 프로젝트도 견딘다", () => {
    const { messages } = buildCastMessages({ script: { text: "한 문장." } }, AVATARS);
    expect(messages[0].content).toContain("한 문장.");
  });
});
```

`tests/validate.test.js` 끝에 더한다:

```js
describe("validateCast", () => {
  const ids = ["av-child", "av-owner"];

  it("인물 목록을 받는다", () => {
    const got = validateCast({ cast: [
      { who: "가게 주인", avatar_id: "av-owner" },
      { who: "초등학생 아이", avatar_id: "av-child" },
    ] }, ids);
    expect(got).toEqual([
      { id: "c1", who: "가게 주인", avatar_id: "av-owner" },
      { id: "c2", who: "초등학생 아이", avatar_id: "av-child" },
    ]);
  });

  it("없는 아바타 id 는 조용히 제거한다 — 첨부되지 않을 사진을 가리키면 그림을 망친다", () => {
    const got = validateCast({ cast: [{ who: "손님", avatar_id: "av-없음" }] }, ids);
    expect(got).toEqual([{ id: "c1", who: "손님" }]);
  });

  it("who 가 없는 항목은 버린다", () => {
    const got = validateCast({ cast: [{ avatar_id: "av-owner" }, { who: "아이" }] }, ids);
    expect(got).toEqual([{ id: "c1", who: "아이" }]);
  });

  it("인물이 없는 원고는 빈 배열 — 실패가 아니다", () => {
    expect(validateCast({ cast: [] }, ids)).toEqual([]);
  });

  it("모양이 틀리면 null — 호출측이 재시도를 판단한다", () => {
    expect(validateCast(null, ids)).toBe(null);
    expect(validateCast({}, ids)).toBe(null);
    expect(validateCast({ cast: "아이" }, ids)).toBe(null);
  });

  it("인물이 너무 많으면 4명에서 자른다 — 30초 영상에 그 이상은 못 담는다", () => {
    const many = { cast: Array.from({ length: 9 }, (_, i) => ({ who: `사람${i}` })) };
    expect(validateCast(many, ids)).toHaveLength(4);
  });
});
```

`tests/validate.test.js` 상단 import 줄에 `validateCast` 를 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js tests/validate.test.js`
Expected: FAIL — `buildCastMessages is not a function`, `validateCast is not defined`

- [ ] **Step 3: `lib/cast.js` 에 프롬프트를 더한다**

`avatarsDir` 위에 더한다:

```js
const CAST_SYSTEM = `너는 숏폼 영상의 캐스팅을 정한다. 원고를 읽고 화면에 사람으로 나올 인물을 뽑는다.
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)"}]}
규칙:
- 화면에 사람으로 보일 인물만 넣는다. 원고가 이름만 스치는 사람(전화 통화 상대 등)은 넣지 않는다.
- 원고가 같은 사람을 여러 이름으로 부르면 한 인물로 묶는다("초등학생"·"그 아이"·"아드님"은 한 명이다).
- who 는 나이대·성별이 드러나게 적는다. 그 값으로 사진을 고르기 때문이다.
  ✗ "손님" / "그 사람"
  ✓ "50대 남성 가게 주인" / "10세 전후 남자아이"
- avatar_id 는 준비된 목록에서만 고른다. 맞는 것이 없으면 적지 않는다 — 억지로 고르면 엉뚱한 얼굴이 나온다.
- 사람이 안 나오는 원고면 cast 를 빈 배열로 둔다.`;

export function buildCastMessages(project, avatars) {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[준비된 인물 사진]
${list}`;
  return { system: CAST_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 4: `lib/validate.js` 에 `validateCast` 를 더한다**

`validateShows` 아래에 더한다:

```js
// 캐스팅 방어 — 인물 목록과 아바타 선택을 검사한다.
//
// 빈 배열은 실패가 아니다(사람이 안 나오는 원고가 있다). null 은 모양이 틀렸을 때만이고,
// 그때 호출측이 재시도를 판단한다 — 이 파일의 다른 함수와 같은 규약이다.
const CAST_MAX = 4;

export function validateCast(obj, avatarIds = []) {
  if (!obj || !Array.isArray(obj.cast)) return null;
  const out = [];
  for (const c of obj.cast) {
    const who = typeof c?.who === "string" ? c.who.trim() : "";
    if (!who) continue; // 누구인지 모르는 항목은 쓸 데가 없다
    const person = { id: `c${out.length + 1}`, who };
    // 없는 아바타는 조용히 제거 — 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다
    if (c.avatar_id && avatarIds.includes(c.avatar_id)) person.avatar_id = c.avatar_id;
    out.push(person);
    if (out.length >= CAST_MAX) break; // 30초 영상에 다섯 명 이상은 담기지 않는다
  }
  return out;
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/cast.test.js tests/validate.test.js`
Expected: PASS

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cast.js lib/validate.js tests/cast.test.js tests/validate.test.js
git commit -m "feat: 원고에서 등장 인물을 뽑는다

컷마다 '이 컷에 누가 나오나'를 고정 목록에 맞추게 하면 표현이 조금 달라져도 못
고른다 — 원고는 같은 사람을 초등학생·꼬마·아드님으로 부른다. 원고당 한 번 뽑고
컷은 그 목록에서만 고르게 한다.

아바타 선택도 같은 패스가 한다. traits 매칭을 코드로 하면 낱말 목록이 필요하고
그 목록이 같은 약점을 갖는다. 없는 아바타 id 는 검증이 조용히 지운다."
```

---

## Task 3: 올린 사진에 무엇이 담겼는지 본다

사장님이 올린 사진이 인물인지 판정한다. 이것이 있어야 "인물 자리가 비었다"를 알 수 있다.

**Files:**
- Modify: `lib/vlm.js`
- Test: `tests/vlm.test.js`

**Interfaces:**
- Produces: `describePhoto({ photoPath, projectId, fetchImpl, apiKey }): Promise<{person: boolean, what: string, who: string|null}>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/vlm.test.js` 끝에 더한다. 이 파일의 기존 패턴(`fetchImpl` 주입)을 그대로 쓴다:

```js
describe("describePhoto — 올린 사진에 무엇이 담겼나", () => {
  const reply = (obj) => async () => ({
    ok: true,
    json: async () => ({ model: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{ message: { content: JSON.stringify(obj) } }] }),
  });

  it("인물 사진이면 person 과 who 를 돌려준다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: true, what: "작업복 남성", who: "50대 남성" }),
    });
    expect(got).toEqual({ person: true, what: "작업복 남성", who: "50대 남성" });
  });

  it("사물·공간 사진이면 person=false, who=null", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: false, what: "가게 내부", who: "몰라" }),
    });
    expect(got).toEqual({ person: false, what: "가게 내부", who: null });
  });

  it("응답이 깨져도 던지지 않는다 — 사물로 취급해 흐름을 막지 않는다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "{{{" } }] }) }),
    });
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("호출이 실패해도 던지지 않는다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
    });
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("가짜 모드에서는 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    expect(called).toBe(false);
    expect(got.person).toBe(false);
    delete process.env.SHOTFORM_FAKE;
  });
});
```

`tests/vlm.test.js` 상단 import 에 `describePhoto` 를 더한다.

> `photoPath: null` 로 부르는 이유: 파일 읽기를 건너뛰고 판정 로직만 본다. 구현에서
> `photoPath` 가 없으면 이미지를 첨부하지 않는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/vlm.test.js`
Expected: FAIL — `describePhoto is not a function`

- [ ] **Step 3: `lib/vlm.js` 에 더한다**

`selectCandidate` 아래에 더한다:

```js
// 올린 사진에 무엇이 담겼나 — 인물인지 사물인지 가른다.
//
// 이 판정이 있어야 "원고의 인물 중 사진으로 덮이지 않은 사람"을 알 수 있고, 그 자리에만
// 아바타를 붙일 수 있다. 지금까지 화면 설계는 파일명만 보고 사진을 골랐다(IMG_2847.jpg).
//
// **던지지 않는다.** 실패하면 사물로 취급한다 — 판정이 안 됐다고 대본이 멈추면 안 된다.
// 대가는 "사람 사진을 사물로 봐서 그 인물에 아바타가 붙는 것"인데, 2단계 출연 블록에서
// 사장님이 고친다.
export async function describePhoto({ photoPath, projectId, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const none = { person: false, what: "", who: null };
  if (fakeFal()) return none;
  try {
    const content = [
      { type: "text", text: `이 사진에 무엇이 담겼는지 본다. JSON만 출력: {"person":true|false,"what":"무엇이 보이는지 한 마디","who":"사람이면 나이대와 성별(예: 50대 남성), 사람이 아니면 빈 문자열"}
person 은 사람의 얼굴·상반신이 알아볼 수 있게 담겼을 때만 true 다. 멀리 지나가는 행인이나 뒷모습만 있으면 false 다.` },
    ];
    if (photoPath) {
      const buf = await fs.readFile(photoPath);
      const ext = photoPath.split(".").pop();
      content.push({ type: "image_url", image_url: { url: `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}` } });
    }
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) return none;
    const data = await res.json();
    await addRecord({
      request_id: randomUUID(), ts: Date.now(), endpoint: `openai/${data?.model || "gpt-4o"}`,
      stage: "사진 판정", user: costActor(), project_id: projectId,
      prompt: String(photoPath || "-").slice(-60),
      duration: `${data?.usage?.prompt_tokens ?? 0}+${data?.usage?.completion_tokens ?? 0}tok`,
      aspect_ratio: "-",
      est_cost_usd: estimateLlmCost(data?.model || "gpt-4o", data?.usage), status: "done", video_url: "-",
    }).catch(() => {});
    const out = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const person = out.person === true;
    return {
      person,
      what: typeof out.what === "string" ? out.what : "",
      who: person && typeof out.who === "string" && out.who.trim() ? out.who.trim() : null,
    };
  } catch {
    return none; // 판정 실패는 사물로 — 흐름을 막지 않는다
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/vlm.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/vlm.js tests/vlm.test.js
git commit -m "feat: 올린 사진에 사람이 담겼는지 본다

지금까지 화면 설계는 파일명만 보고 사진을 골랐다(IMG_2847.jpg 면 아무것도 모른다).
사진이 인물인지 알아야 '원고의 인물 중 사진으로 덮이지 않은 사람'을 알 수 있고,
그 자리에만 아바타를 붙일 수 있다.

던지지 않는다 — 판정 실패는 사물로 취급한다. 이것 때문에 대본이 멈추면 안 된다."
```

---

## Task 4: 사진을 인물에 붙이고, 빈 자리를 아바타로 메운다

순수 함수 둘이다. 여기가 이 기능의 판정 심장이라 파이프라인과 떼어 테스트한다.

**Files:**
- Modify: `lib/cast.js`
- Test: `tests/cast.test.js`

**Interfaces:**
- Consumes: `validateCast` 결과, `describePhoto` 결과 (Task 2·3)
- Produces: `resolveCastRefs(cast, photos, availableAvatarIds): Array<{id, who, avatar_id?, ref?: {from, id}}>`
  - `ref.from` 은 `"photo"` 또는 `"avatar"` — **출처**다.
    `AVATARS[].kind`(`"person"`)와 다른 것이라 이름을 갈라 뒀다
- Produces: `resolveCutRefs(cut, project): Array<{from, id, kind}>` — 컷이 쓸 레퍼런스, 최대 2

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cast.test.js` 끝에 더한다:

```js
import { resolveCastRefs, resolveCutRefs } from "../lib/cast.js";

const CAST = [
  { id: "c1", who: "50대 남성 가게 주인", avatar_id: "av-owner" },
  { id: "c2", who: "10세 전후 남자아이", avatar_id: "av-child" },
];
const AV_IDS = ["av-owner", "av-child", "av-adult"];

describe("resolveCastRefs — 사진이 먼저다", () => {
  it("사진이 없으면 아바타를 쓴다", () => {
    const got = resolveCastRefs(CAST, [], AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" });
  });

  it("인물 사진이 있으면 그 인물은 사진을 쓴다 — 사장님 얼굴이 아바타로 바뀌면 안 된다", () => {
    const photos = [{ id: "p2", vision: { person: true, who: "50대 남성" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    expect(got[0].ref).toEqual({ from: "photo", id: "p2" });
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" }); // 아이는 사진이 없다
  });

  it("사물 사진은 인물에 붙지 않는다", () => {
    const photos = [{ id: "p1", vision: { person: false, what: "가게 내부" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
  });

  it("판정되지 않은 사진도 인물에 붙지 않는다 — 모르는 것을 얼굴로 쓰지 않는다", () => {
    const got = resolveCastRefs(CAST, [{ id: "p9" }], AV_IDS);
    expect(got[0].ref).toEqual({ from: "avatar", id: "av-owner" });
  });

  it("사진 한 장이 인물 둘에 겹쳐 붙지 않는다", () => {
    const photos = [{ id: "p2", vision: { person: true, who: "사람" } }];
    const got = resolveCastRefs(CAST, photos, AV_IDS);
    const used = got.filter((c) => c.ref?.from === "photo").map((c) => c.ref.id);
    expect(used).toEqual(["p2"]);
  });

  it("파일이 없는 아바타는 배정하지 않는다 — 레퍼런스 없이 간다", () => {
    const got = resolveCastRefs(CAST, [], ["av-child"]);
    expect(got[0].ref).toBeUndefined();
    expect(got[1].ref).toEqual({ from: "avatar", id: "av-child" });
  });

  it("캐스팅이 비면 빈 배열", () => {
    expect(resolveCastRefs([], [], AV_IDS)).toEqual([]);
    expect(resolveCastRefs(null, null, AV_IDS)).toEqual([]);
  });
});

describe("resolveCutRefs — 컷이 실제로 쓸 레퍼런스", () => {
  const project = {
    cast: [
      { id: "c1", who: "주인", ref: { from: "photo", id: "p2" } },
      { id: "c2", who: "아이", ref: { from: "avatar", id: "av-child" } },
      { id: "c3", who: "손님" }, // 레퍼런스 없음
    ],
    material: { photos: [{ id: "p1" }, { id: "p2" }] },
  };

  it("인물과 사물을 함께 붙인다", () => {
    expect(resolveCutRefs({ ref_ids: ["c2", "p1"] }, project)).toEqual([
      { from: "photo", id: "p1", kind: "thing" },
      { from: "avatar", id: "av-child", kind: "person" },
    ]);
  });

  it("업로드 사진이 먼저다 — 2장 상한에 걸릴 때 잘려나가면 안 된다", () => {
    const got = resolveCutRefs({ ref_ids: ["c2", "c1", "p1"] }, project);
    expect(got).toHaveLength(2);
    expect(got[0].from).toBe("photo");
  });

  it("레퍼런스가 없는 인물은 건너뛴다", () => {
    expect(resolveCutRefs({ ref_ids: ["c3"] }, project)).toEqual([]);
  });

  it("모르는 id 는 무시한다", () => {
    expect(resolveCutRefs({ ref_ids: ["없음", "p9"] }, project)).toEqual([]);
  });

  it("옛 프로젝트의 ref_photo_id 도 읽는다", () => {
    expect(resolveCutRefs({ ref_photo_id: "p2" }, project)).toEqual([
      { from: "photo", id: "p2", kind: "thing" },
    ]);
  });

  it("ref 가 아무것도 없으면 빈 배열", () => {
    expect(resolveCutRefs({}, project)).toEqual([]);
    expect(resolveCutRefs({}, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js`
Expected: FAIL — `resolveCastRefs is not a function`

- [ ] **Step 3: `lib/cast.js` 에 더한다**

```js
// 인물마다 레퍼런스를 정한다. **사진이 먼저다** — 사장님이 실제로 올린 얼굴이
// 아바타보다 중요하고, 그것이 아바타로 바뀌면 사장님 얼굴이 남의 얼굴이 된다.
//
// 사진이 어느 인물인지는 VLM 판정(photo.vision.person)으로만 가른다. 판정이 없는 사진은
// 인물에 붙이지 않는다 — 모르는 것을 얼굴로 쓰지 않는다.
export function resolveCastRefs(cast, photos, availableAvatarIds = []) {
  const people = (photos || []).filter((p) => p.vision?.person);
  const taken = new Set();
  return (cast || []).map((c) => {
    // 아직 안 쓴 인물 사진이 있으면 그것을 쓴다.
    // 사진 여러 장을 인물 여러 명에 정교하게 맞추지는 않는다 — 그 판정을 믿을 근거가
    // 아직 없고, 틀리면 얼굴이 뒤바뀐다. 2단계 출연 블록에서 사장님이 고른다.
    const photo = people.find((p) => !taken.has(p.id));
    if (photo) {
      taken.add(photo.id);
      return { ...c, ref: { from: "photo", id: photo.id } };
    }
    if (c.avatar_id && availableAvatarIds.includes(c.avatar_id)) {
      return { ...c, ref: { from: "avatar", id: c.avatar_id } };
    }
    return { ...c }; // 붙일 것이 없다 — 이 인물은 레퍼런스 없이 간다(지금 동작)
  });
}

// 컷이 고른 id 들을 실제로 쓸 레퍼런스로 푼다.
// 경로는 여기서 만들지 않는다 — fs 를 아는 자리(파이프라인)가 맡는다. 여기는 순수하다.
//
// kind 는 프롬프트 문구를 가른다: 사람이면 "같은 사람으로", 사물이면 "모양·색 그대로".
// 업로드 사진을 thing 으로 두는 이유는 지금 문구가 제품용이고, 사진이 인물이어도
// 그 인물의 캐스팅 항목(from:"photo")을 통해 들어오면 아래에서 person 으로 잡힌다.
const REF_MAX = 2;

export function resolveCutRefs(cut, project) {
  const ids = Array.isArray(cut?.ref_ids)
    ? cut.ref_ids
    : cut?.ref_photo_id ? [cut.ref_photo_id] : []; // 옛 프로젝트 폴백
  const cast = project?.cast || [];
  const photoIds = (project?.material?.photos || []).map((p) => p.id);

  const out = [];
  for (const id of ids) {
    if (photoIds.includes(id)) {
      out.push({ from: "photo", id, kind: "thing" });
      continue;
    }
    const person = cast.find((c) => c.id === id);
    if (!person?.ref) continue; // 레퍼런스가 없는 인물은 건너뛴다
    out.push({ ...person.ref, kind: "person" });
  }
  // 업로드 사진이 먼저다. 상한에 걸릴 때 사장님이 올린 것이 잘려나가면 안 된다.
  out.sort((a, b) => (a.from === "photo" ? -1 : 0) - (b.from === "photo" ? -1 : 0));
  return out.slice(0, REF_MAX);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cast.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/cast.js tests/cast.test.js
git commit -m "feat: 인물마다 레퍼런스를 정한다 — 사진이 먼저, 빈 자리는 아바타

사장님이 올린 얼굴이 아바타보다 중요하다. 그것이 아바타로 바뀌면 사장님 얼굴이
남의 얼굴이 된다. 판정되지 않은 사진은 인물에 붙이지 않는다 — 모르는 것을 얼굴로
쓰지 않는다.

컷 단위 해석은 업로드 우선·2장 상한이다. 장수가 늘면 모델이 무엇을 따를지
헷갈리고, 상한에 걸릴 때 사장님이 올린 것이 잘려나가면 안 된다."
```

---

## Task 5: 화면 설계가 캐스팅에서 고르게 한다

`ref_photo_id`(단수, 사진만) → `ref_ids`(배열, 인물+사진).

**Files:**
- Modify: `lib/cuts.js:39` (JSON 스키마 줄), `lib/cuts.js:63` (규칙 줄), `lib/cuts.js:66-79` (`buildShowsMessages`)
- Modify: `lib/validate.js:40-57` (`validateShows`)
- Test: `tests/cuts.test.js`, `tests/validate.test.js`

**Interfaces:**
- Consumes: `project.cast` (Task 2·4)
- Produces: `buildShowsMessages(project, cuts)` — 프롬프트에 `[출연]` 블록이 생긴다
- Produces: `validateShows(obj, cutCount, refIds)` — `shot.ref_ids: string[]`(최대 2).
  세 번째 인자 이름이 `photoIds` 에서 `refIds` 로 바뀐다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에 더한다:

```js
  it("캐스팅을 프롬프트에 넣는다 — 컷은 이 목록에서만 고른다", () => {
    const withCast = {
      ...project,
      cast: [{ id: "c1", who: "50대 남성 가게 주인" }, { id: "c2", who: "10세 전후 남자아이" }],
    };
    const { messages } = buildShowsMessages(withCast, [{ sentence: "한 문장." }]);
    expect(messages[0].content).toContain("c1");
    expect(messages[0].content).toContain("50대 남성 가게 주인");
    expect(messages[0].content).toContain("c2");
  });

  it("캐스팅이 없으면 (없음) — 없는 인물을 고르라고 하면 안 된다", () => {
    const { messages } = buildShowsMessages(project, [{ sentence: "한 문장." }]);
    expect(messages[0].content).toContain("[출연]\n(없음)");
  });
```

`tests/validate.test.js` 의 `validateShows` describe 에 더한다:

```js
  it("ref_ids 배열을 받는다 — 인물과 사물을 함께 고를 수 있다", () => {
    const got = validateShows(
      { shots: [{ shows: "화면", motion: "움직임", ref_ids: ["c2", "p1"] }] },
      1, ["c1", "c2", "p1"]
    );
    expect(got[0].ref_ids).toEqual(["c2", "p1"]);
  });

  it("모르는 id 는 조용히 지운다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["c2", "없음"] }] }, 1, ["c2"]);
    expect(got[0].ref_ids).toEqual(["c2"]);
  });

  it("2장에서 자른다 — 장수가 늘면 모델이 무엇을 따를지 헷갈린다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["a", "b", "c"] }] }, 1, ["a", "b", "c"]);
    expect(got[0].ref_ids).toEqual(["a", "b"]);
  });

  it("고른 것이 없으면 ref_ids 를 두지 않는다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: ["없음"] }] }, 1, ["c1"]);
    expect(got[0].ref_ids).toBeUndefined();
  });

  it("배열이 아니면 무시한다", () => {
    const got = validateShows({ shots: [{ shows: "화면", ref_ids: "c1" }] }, 1, ["c1"]);
    expect(got[0].ref_ids).toBeUndefined();
  });
```

기존 `ref_photo_id` 테스트가 있으면 **지우지 않는다** — `validateShows`는 옛 키를 더 이상
받지 않으므로, 그 테스트는 `ref_ids` 로 바꿔 쓴다(읽기 폴백은 `resolveCutRefs`가 맡는다).

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/validate.test.js`
Expected: FAIL — `[출연]` 없음, `ref_ids` undefined

- [ ] **Step 3: `lib/cuts.js:39` 의 JSON 스키마 줄을 바꾼다**

`"ref_photo_id":"이 컷에 사진 속 피사체가 나오면 그 사진 id(없으면 생략)"` 를 지우고:

```
"ref_ids":["이 컷에 나오는 출연 id 와 사진 id (없으면 빈 배열, 최대 2개)"]
```

- [ ] **Step 4: `lib/cuts.js:63` 의 규칙 줄을 바꾼다**

```
- ref_ids 는 이 컷 화면에 실제로 보이는 것만 적는다. 사람은 [출연] 목록의 id, 물건·공간은 [올린 사진] 의 id 다.
  같은 사람이 나오는 컷들에는 같은 id 를 적는다 — 이것이 컷 사이 인물을 같은 사람으로 묶는 유일한 장치다.
  많아도 2개까지다(사람 하나 + 물건 하나). 사람이 안 보이는 컷은 사람 id 를 적지 않는다.
```

- [ ] **Step 5: `buildShowsMessages` 에 `[출연]` 블록을 더한다**

`lib/cuts.js:66-79` 를 바꾼다:

```js
export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  // 출연 목록 — 컷은 여기서만 사람을 고른다. 원고를 읽고 뽑은 목록이라 표현이 어긋나지 않는다
  const cast = (project.cast || []).map((c) => `- id:${c.id} ${c.who}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}

[출연]
${cast}

[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 6: `validateShows` 를 바꾼다**

`lib/validate.js:40-57` 의 세 번째 인자와 ref 처리를 바꾼다:

```js
// refIds — 실제로 첨부될 수 있는 id 전부(출연 id + 사진 id).
// 상한 2: 인물 하나 + 사물 하나. 장수가 늘면 모델이 무엇을 따를지 헷갈린다.
const SHOT_REF_MAX = 2;

export function validateShows(obj, cutCount, refIds = []) {
  if (!Number.isInteger(cutCount) || cutCount < 1) return null;
  if (!obj || !Array.isArray(obj.shots) || obj.shots.length !== cutCount) return null;
  const out = [];
  for (const s of obj.shots) {
    const shows = typeof s?.shows === "string" ? s.shows.trim() : "";
    if (!shows) return null;
    const shot = { shows };
    // motion 은 없어도 컷을 버리지 않는다 — 그림은 나오고 움직임만 기본값이 된다.
    // shows 와 달리 필수가 아닌 이유: 이것이 없다고 컷이 못 쓸 것이 되지는 않는다.
    const motion = typeof s?.motion === "string" ? s.motion.trim() : "";
    if (motion) shot.motion = motion;
    // 없는 레퍼런스는 조용히 제거 — 첨부되지 않을 것을 가리키는 지시는 그림을 망친다
    const refs = (Array.isArray(s?.ref_ids) ? s.ref_ids : [])
      .filter((id) => refIds.includes(id))
      .slice(0, SHOT_REF_MAX);
    if (refs.length) shot.ref_ids = refs;
    out.push(shot);
  }
  return out;
}
```

- [ ] **Step 7: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/validate.test.js`
Expected: PASS

- [ ] **Step 8: 무엇이 깨졌는지 본다**

Run: `npx vitest run`
Expected: `tests/pipeline.test.js` 에서 실패가 날 수 있다(`photoIds` 를 넘기던 자리).
**여기서 고치지 않는다** — Task 6이 그 자리를 고친다. 실패 목록을 적어두고 넘어간다.

- [ ] **Step 9: 커밋**

```bash
git add lib/cuts.js lib/validate.js tests/cuts.test.js tests/validate.test.js
git commit -m "feat: 화면 설계가 출연 목록에서 사람을 고르게 한다

사진 id 하나만 고를 수 있었다. 사람은 고를 대상이 아예 없었고, 그래서 컷 사이
인물을 묶을 방법이 없었다. 출연 목록을 프롬프트에 주고 ref_ids 배열로 받는다.

같은 사람이 나오는 컷에 같은 id 를 적게 하는 것이 인물 일관성의 유일한 장치다.
상한은 2개다 — 사람 하나 + 물건 하나."
```

---

## Task 6: 파이프라인과 이미지 생성을 잇는다

캐스팅·사진 판정을 `splitCuts` 에 끼우고, 이미지 생성이 레퍼런스 배열을 받게 한다.

**Files:**
- Modify: `lib/pipeline.js:28-52` (`splitCuts`), `lib/pipeline.js:58-100` (`processCut`)
- Modify: `lib/imagegen.js:25-45` (`generateImage`)
- Modify: `lib/cuts.js:81-104` (`buildImagePrompt` 의 ref 문구)
- Create: `tests/imagegen.test.js` — `generateImage` 에 직접 테스트가 하나도 없다
- Test: `tests/pipeline.test.js`, `tests/cuts.test.js`

**Interfaces:**
- Consumes: `buildCastMessages`·`validateCast`·`resolveCastRefs`·`resolveCutRefs`·
  `availableAvatars`·`avatarFile`·`describePhoto` (Task 1~5)
- Produces: `generateImage({ prompt, aspect_ratio, refs, projectId, fetchImpl })` —
  `refs: Array<{path, kind}>`. **`refImagePath` 는 없앤다**
- Produces: `project.cast` 가 저장된다, `project.material.photos[n].vision` 이 저장된다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js` 에 더한다. 이 파일의 헬퍼 `makeProject()`·`deps()` 패턴을 그대로 쓴다:

> **캐스팅이 실제로 저장되는지는 여기서 테스트하지 않는다.** 이 파일의 테스트는 전부
> `splitCuts` 를 주입해 우회하므로, 주입하면 캐스팅 코드가 아예 안 돈다. 캐스팅을 타게
> 하려면 `callJson` 을 mock 해야 하는데 그러면 "mock 이 돌았다"만 확인하는 테스트가 된다.
> 판정은 순수 함수로 이미 덮었고(Task 4), 저장 여부는 Task 7의 가짜 모드 관통에서 본다.

```js
describe("이미지 생성에 레퍼런스가 배열로 간다", () => {
  it("컷이 고른 인물·사물이 refs 로 넘어간다", async () => {
    const p = await makeProject();
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      status: "voice",
      cast: [{ id: "c1", who: "아이", ref: { from: "avatar", id: "av-child" } }],
      cuts: [{ idx: 0, sentence: "문장입니다.", seconds: 3, state: "pending",
               shows: "아이가 자전거를 끄는 미디엄 샷", ref_ids: ["c1"], regen_count: 0 }],
    }));
    const seen = [];
    const d = {
      splitCuts: async () => { throw new Error("부르면 안 된다"); },
      genImage: async (args) => { seen.push(args.refs); return { url: "img" }; },
      select: async () => ({ passed: true, selectedIndex: 0, note: "" }),
    };
    await pipeline.runImagesPipeline(p.id, d);
    // 아바타 파일이 없으면 refs 는 비어 있다 — 그래도 그림은 나온다
    expect(Array.isArray(seen[0])).toBe(true);
    const saved = await projects.getProject(p.id);
    expect(saved.cuts[0].image.url).toBe("img");
  });
});
```

`tests/imagegen.test.js` 를 **새로 만든다.** `generateImage` 에 직접 테스트가 하나도 없어,
레퍼런스 두 장이 실제로 실려 나가는지 확인할 자리가 없다:

```js
// generateImage — 레퍼런스가 실제로 실려 나가는지 본다.
// 이 함수에 직접 테스트가 없어서, 두 장을 보내는 변경이 조용히 틀릴 수 있었다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { generateImage } from "../lib/imagegen.js";

let dir, a, b;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "shotform-img-"));
  a = path.join(dir, "person.jpg"); writeFileSync(a, "AAA");
  b = path.join(dir, "thing.png");  writeFileSync(b, "BBB");
  process.env.SHOTFORM_DATA_DIR = dir;   // 비용 기록을 임시 폴더로
  process.env.SHOTFORM_BUDGET_TOTAL_USD = "100";
  process.env.SHOTFORM_BUDGET_PROJECT_USD = "100";
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_FAKE_IMAGES;
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const ok = (seen) => async (url, init) => {
  seen.url = url;
  seen.body = JSON.parse(init.body);
  return { ok: true, json: async () => ({ images: [{ url: "https://f/out.png" }] }) };
};

describe("generateImage — 레퍼런스", () => {
  it("레퍼런스가 없으면 base 엔드포인트로 가고 image_urls 를 안 보낸다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1", fetchImpl: ok(seen) });
    expect(seen.url).not.toContain("/edit");
    expect(seen.body.image_urls).toBeUndefined();
  });

  it("레퍼런스가 있으면 edit 엔드포인트로 간다 — base 모델은 image_urls 를 받지 않는다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }], fetchImpl: ok(seen) });
    expect(seen.url).toContain("/edit");
  });

  it("두 장을 순서대로 싣는다 — 인물과 사물을 함께 붙이는 자리다", async () => {
    const seen = {};
    await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }, { path: b, kind: "thing" }], fetchImpl: ok(seen) });
    expect(seen.body.image_urls).toHaveLength(2);
    expect(seen.body.image_urls[0]).toContain("image/jpeg");   // .jpg → jpeg
    expect(seen.body.image_urls[1]).toContain("image/png");
    expect(seen.body.image_urls[0]).toContain(Buffer.from("AAA").toString("base64"));
  });

  it("가짜 모드에서는 fal 을 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const got = await generateImage({ prompt: "p", aspect_ratio: "9:16", projectId: "p1",
      refs: [{ path: a, kind: "person" }], fetchImpl: async () => { called = true; } });
    expect(called).toBe(false);
    expect(got.url).toContain("data:image/svg+xml");
    delete process.env.SHOTFORM_FAKE;
  });
});
```

`tests/cuts.test.js` 의 `buildImagePrompt` describe 에 더한다:

```js
  it("사람 레퍼런스에는 같은 사람으로 그리라고 한다 — 제품 문구는 사람에게 틀리다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "아이가 자전거를 끄는 미디엄 샷", ref_ids: ["c1"] };
    const withCast = {
      ...project,
      cast: [{ id: "c1", who: "아이", ref: { from: "avatar", id: "av-child" } }],
    };
    const p = buildImagePrompt(cut, withCast, [{ path: "/x/child.jpg", kind: "person" }]);
    expect(p).toMatch(/same person/i);
    expect(p).not.toMatch(/packaging/i);
  });

  it("사물 레퍼런스에는 모양·색을 그대로 지킨다고 한다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "라떼 클로즈업", ref_ids: ["p1"] };
    const p = buildImagePrompt(cut, project, [{ path: "/x/latte.jpg", kind: "thing" }]);
    expect(p).toMatch(/packaging/i);
  });

  it("레퍼런스가 없으면 첨부를 가리키는 말을 넣지 않는다", () => {
    const cut = { idx: 0, sentence: "문장.", shows: "빈 매장 풀 샷" };
    const p = buildImagePrompt(cut, project, []);
    expect(p).not.toMatch(/attached/i);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js tests/cuts.test.js tests/imagegen.test.js`
Expected: FAIL — `refs` 를 안 받아 `image_urls` 가 없고, 사람 문구가 없다

- [ ] **Step 3: `buildImagePrompt` 가 `refs` 를 받게 한다**

`lib/cuts.js` 의 `buildImagePrompt` 서명과 ref 문구를 바꾼다. 기존 `refExists` 블록
(`lib/cuts.js:132` 부근)을 아래로 교체한다:

```js
export function buildImagePrompt(cut, project, refs = []) {
```

```js
  // 레퍼런스 문구는 종류에 따라 갈린다.
  // 지금까지는 사람에게도 "제품의 모양·색·포장을 첨부와 똑같이"라고 붙이고 있었다 —
  // 사람에게는 틀린 지시다.
  if (refs.some((r) => r.kind === "person")) {
    p += " One of the attached images shows the person who must appear: keep the same person (face, hair, build, clothing style) — do not invent a different person.";
  }
  if (refs.some((r) => r.kind === "thing")) {
    p += " Match the product/subject appearance to the attached reference image exactly (shape, colors, packaging).";
  }
```

- [ ] **Step 4: `generateImage` 가 `refs` 배열을 받게 한다**

`lib/imagegen.js` 의 `generateImage` 를 바꾼다:

```js
export async function generateImage({ prompt, aspect_ratio, refs = [], projectId, fetchImpl = fetch }) {
  // 가짜 모드 — fal을 부르지 않고 플레이스홀더를 즉시 돌려준다. 비용도 기록하지 않는다.
  if (fakeFal()) return { url: placeholderImage(prompt, aspect_ratio) };
  // 레퍼런스가 있으면 edit 계열 엔드포인트 사용 — base 모델은 image_urls를 받지 않음
  const base = process.env.FAL_IMAGE_ENDPOINT || "fal-ai/nano-banana";
  const endpoint = refs.length ? `${base}/edit` : base;
  // 나가기 전에 막는다 — 이미지는 컷마다 후보 2장이라 가장 빨리 쌓인다
  await assertBudget({ projectId, endpoint, amount: ONE_IMAGE });
  const input = { prompt, aspect_ratio, num_images: 1 };
  if (refs.length) {
    input.image_urls = [];
    for (const r of refs) {
      const buf = await fs.readFile(r.path);
      const ext = r.path.split(".").pop();
      input.image_urls.push(`data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`);
    }
  }
```

이하(`fetchImpl` 호출부터)는 그대로 둔다.

- [ ] **Step 5: `splitCuts` 에 캐스팅과 사진 판정을 끼운다**

`lib/pipeline.js` 상단 import 에 더한다:

```js
import { buildCastMessages, resolveCastRefs, resolveCutRefs, availableAvatars, avatarFile } from "./cast";
import { validateCutRanges, validateShows, validateCast } from "./validate";
import { selectCandidate, describePhoto } from "./vlm";
```

`splitCuts` 안에서, 컷을 얻은 뒤(`if (!cuts) {...}` 블록 다음) `photoIds` 줄 앞에 넣는다:

```js
    // 캐스팅 — 원고에 나오는 인물을 뽑고 아바타를 고른다.
    // 실패해도 컷은 남는다(2패스와 같은 원칙). cast 가 비면 아바타를 안 쓴다.
    const avatars = await availableAvatars();
    const cast = await (async () => {
      const msgs = buildCastMessages(project, avatars);
      for (let i = 0; i < 2; i++) {
        const got = validateCast(
          await callJson({ system: msgs.system, messages: msgs.messages, stage: "캐스팅", projectId: project.id }),
          avatars.map((a) => a.id)
        );
        if (got) return got;
      }
      return [];
    })().catch(() => []);

    // 올린 사진에 사람이 담겼는지 본다 — 아직 안 본 사진만
    const photos = [];
    for (const p of project.material?.photos || []) {
      if (p.vision) { photos.push(p); continue; }
      const vision = await describePhoto({ photoPath: uploadsPath(p.url), projectId: project.id });
      photos.push({ ...p, vision });
    }

    const castWithRefs = resolveCastRefs(cast, photos, avatars.map((a) => a.id));
    await updateProject(project.id, (proj) => ({
      ...proj,
      cast: castWithRefs,
      material: { ...proj.material, photos },
    }));
```

그리고 `photoIds` 줄과 `validateShows` 호출을 바꾼다:

```js
    const refIds = [...photos.map((p) => p.id), ...castWithRefs.map((c) => c.id)];
    const shots = buildShowsMessages({ ...project, cast: castWithRefs }, cuts);
    let designed = null;
    for (let i = 0; i < 2 && !designed; i++) {
      designed = validateShows(
        await callJson({ system: shots.system, messages: shots.messages, stage: "화면 설계", projectId: project.id }),
        cuts.length,
        refIds
      );
    }
```

- [ ] **Step 6: `processCut` 이 `refs` 를 넘기게 한다**

`lib/pipeline.js:71-72` 의 두 줄을 바꾼다:

```js
  // 컷이 고른 레퍼런스를 실제 파일 경로로 푼다 — 경로를 아는 것은 이 자리뿐이다
  const refs = resolveCutRefs(cut, project)
    .map((r) => ({
      path: r.from === "photo"
        ? uploadsPath((project.material?.photos || []).find((p) => p.id === r.id)?.url)
        : avatarFile(r.id),
      kind: r.kind,
    }))
    .filter((r) => r.path);
```

`deps.genImage` 호출 두 곳과 `buildImagePrompt` 호출, `deps.select` 호출을 바꾼다:

```js
      let prompt = buildImagePrompt(cut, project, refs);
      if (note) prompt += ` Avoid the previous issue: ${note}.`;
      const candidates = await Promise.all([
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId }),
        deps.genImage({ prompt, aspect_ratio: project.settings.aspect_ratio, refs, projectId }),
      ]);
      const verdict = await deps.select({
        cut,
        scene,
        candidates,
        refImagePath: refs[0]?.path,
        projectId,
      });
```

> `selectCandidate` 는 그대로 둔다 — 검수는 레퍼런스 한 장만 봐도 된다. 첫 장을 준다
> (업로드 우선 정렬이라 사장님이 올린 것이 먼저다).

- [ ] **Step 7: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js tests/cuts.test.js tests/imagegen.test.js`
Expected: PASS

- [ ] **Step 8: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. Task 5에서 적어둔 실패 목록이 전부 사라졌는지 대조한다.
`tests/imagegen.test.js`·`tests/vlm.test.js` 가 `refImagePath` 로 부르던 자리가 남아 있으면
`refs` 로 바꾼다

- [ ] **Step 9: 커밋**

```bash
git add lib/pipeline.js lib/imagegen.js lib/cuts.js tests/imagegen.test.js tests/pipeline.test.js tests/cuts.test.js
git commit -m "feat: 캐스팅을 분할에 끼우고 레퍼런스를 배열로 넘긴다

원고 승인 한 번에 캐스팅·사진 판정·컷 분할·화면 설계가 함께 돈다. 이미지 생성은
레퍼런스를 최대 2장 받는다 — 인물 하나 + 사물 하나.

프롬프트 문구를 갈랐다. 지금까지 사람에게도 '제품의 모양·색·포장을 첨부와
똑같이'라고 붙이고 있었다."
```

---

## Task 7: 가짜 모드로 흐름을 훑는다 (유료 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

여기까지는 **fal 을 한 번도 부르지 않는다.** 캐스팅·사진 판정은 OpenAI 라서 돈이 들지만
편당 1센트 아래다(캐스팅 $0.003 + 사진 판정 장당 $0.006).

- [ ] **Step 1: 아바타 파일이 없는 상태로 돌린다**

`assets/refs/` 를 비운 채 `SHOTFORM_FAKE=all npm run dev` 로 띄우고 한 편을 만든다.

Expected: 지금과 똑같이 동작한다. 사이드바·대본·컷이 정상이고 오류가 없다.
`data/projects/<id>.json` 에 `cast` 가 저장돼 있고 각 인물의 `ref` 가 **없다**.

- [ ] **Step 2: 아바타 파일을 넣고 다시 돌린다**

`assets/refs/` 에 `child.jpg`·`owner.jpg`·`adult.jpg` 를 넣는다(사장님이 준비한 파일).
같은 자료로 한 편을 다시 만든다.

Expected: `cast[n].ref` 가 `{from:"avatar", id:"av-..."}` 로 채워지고, 컷의 `ref_ids` 에
인물 id 가 들어 있다.

- [ ] **Step 3: 확인 목록을 대조한다**

- [ ] 캐스팅이 원고의 인물을 실제로 뽑았는가 (`data/projects/<id>.json` 의 `cast`)
- [ ] `who` 에 나이대·성별이 들어 있는가 — 없으면 아바타 선택이 엉뚱해진다
- [ ] 같은 사람이 나오는 컷들에 **같은 id** 가 붙었는가. 이것이 안 되면 이 기능이 무의미하다
- [ ] 사람이 안 보이는 컷(손 클로즈업·빈 매장)에 인물 id 가 안 붙었는가
- [ ] 아바타 선택이 인물과 맞는가 (아이 → `av-child`)
- [ ] `SHOTFORM_FAKE=all` 인데 `data/costs.json` 에 fal 기록이 없는가

- [ ] **Step 4: 어긋난 것을 고친다**

캐스팅이 인물을 놓치거나 컷에 id 를 안 붙이면 **프롬프트를 조이기 전에 얼마나 잦은지 센다** —
`scripts/measure/shows-motion-leak.mjs` 와 같은 방식이다. 감으로 고치면 다른 것이 깨진다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "fix: 가짜 모드 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]. fal 을 부르지 않고 확인할 수 있는 것은 여기까지다."
```

---

## Task 8: 실제 이미지로 확인한다 — **사장님 검토 게이트**

> ⚠️ **이 태스크는 사장님 승인 없이 시작하지 않는다.** 실제 fal 이미지 생성이 나간다.

**Files:** 없음 (검증). 발견한 것만 고친다.

**예상 비용:** 4컷 × 후보 2장 = 8장 × $0.04 = **약 $0.32**. 클립·합성까지 가면 편당 $2~3
추가지만, **이 태스크는 이미지까지만 본다** — 인물 일관성은 이미지 단계에서 판정된다.

- [ ] **Step 1: 승인을 받는다**

사장님에게 알린다: 무엇을 확인하려는지, 예상 비용, 아바타 파일이 준비됐는지.
**답을 받고 시작한다.**

- [ ] **Step 2: 환경을 맞춘다**

```
SHOTFORM_FAKE=off
SHOTFORM_FAKE_IMAGES=       # 비운다(주석 처리)
SHOTFORM_BUDGET_PROJECT_USD=5
```

- [ ] **Step 3: 인물이 여러 컷에 나오는 자료로 한 편을 만든다**

이미지까지만 만든다(⑤영상은 누르지 않는다). 자료는 사람이 반복해 등장하는 이야기로 고른다 —
인물이 한 컷에만 나오면 일관성을 볼 수 없다.

- [ ] **Step 4: 설계의 미검증 가정 셋을 확인한다**

- [ ] **아바타 한 장으로 컷 사이 인물이 실제로 같아지는가.** 이 기능의 값어치를 전부 정한다.
      얼굴·머리·복장을 컷끼리 나란히 놓고 본다
- [ ] **`image_urls` 두 장이 둘 다 반영되는가.** 인물 + 사물이 함께 붙은 컷에서, 사물도
      맞고 사람도 맞는지 본다. 첫 장만 반영된다면 상한 2장이 무의미해지고 우선순위를
      다시 정해야 한다
- [ ] **VLM 사진 판정이 쓸 만한가.** 인물 사진을 올려 `photos[n].vision.person` 이 `true`
      로 나오는지, `who` 가 나이대·성별을 맞추는지 본다
- [ ] 아바타가 붙은 컷과 안 붙은 컷의 그림 품질 차이 — `nano-banana/edit` 가 base 모델보다
      떨어지는지
- [ ] `data/costs.json` 의 엔드포인트가 `nano-banana/edit` 로 기록되는지, 단가가 맞는지

- [ ] **Step 5: 알아낸 것을 적는다**

설계 문서의 **§검증하지 못한 가정** 을 열어 판명된 항목을 사실로 바꾼다.
`docs/models-and-costs.md` §4의 인물 불일치 항목도 갱신한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "fix: 실제 이미지로 인물 일관성을 확인하고 어긋난 곳을 고친다

아바타 레퍼런스로 컷 사이 인물이 [얼마나] 유지됐다. 레퍼런스 두 장은 [어떻게]
반영됐다."
```

---

## 다음

2단계(출연 블록 — 대본 화면에서 캐스팅을 확인·수정)는 **Task 7·8의 관측으로 모양을 정한다.**
자동 배정이 대체로 맞으면 표시만으로 충분하고, 오판이 잦으면 수정이 필수다. 지금 정하면
추정 위에 추정을 쌓는 것이 된다.
