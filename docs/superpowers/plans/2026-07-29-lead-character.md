# 주인공을 선언한다 — 카메라가 누구를 따라가는지 정하고 흘려보낸다

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 영상이 한 사람을 따라간다. 그 사람이 컷마다 같은 얼굴로 나온다.

**Architecture:** 브리핑이 자료를 읽을 때 `topic` 과 함께 **주인공(`lead`)** 을 뽑는다.
화면 설계와 캐스팅이 그것을 받아 컷을 쓰고 인물을 배정한다. 사장님은 대본 화면에서 한 줄로
확인·수정한다.

**Tech Stack:** Next.js App Router, vitest, OpenAI(gpt-4o)

앞선 계획: `2026-07-28-avatar-reference-consistency.md`(완료) · `2026-07-28-cast-from-shows.md`(완료)

## 왜 필요한가 — 실측이 시킨 것이다

2026-07-29 실제 이미지 관통에서 **수선사가 컷마다 다른 사람으로 나왔다**:

| 컷 | 수선사가 어떻게 나왔나 |
|---|---|
| 컷1 | 50대 여성 — `shows` 에 없는데 이미지 모델이 덤으로 그려 넣음 |
| 컷3 | 30대 남성 — 아바타 반영, 다만 손님과 배역이 뒤바뀜 |
| 컷4 | 젊은 여성 — 아바타 무시 |

배역 뒤바뀜은 첨부를 번호로 지목해 고쳤다(`a29e182`). 그러나 **컷1의 덤 인물은 그것으로
막지 못한다.** 더 파고 보니 원인이 하나 위에 있었다:

**이 영상은 주인공이 선언된 적이 없다.** 그래서 단계마다 제각각 짐작한다.

| 단계 | 누구를 중심으로 잡았나 |
|---|---|
| 대본 | **사장님** — "가게를 냈습니다"(1인칭 화자) |
| 화면 설계 | **손님** — 컷1이 "손님이 코트를 들고 문을 들어오는 장면" |
| 캐스팅 | **손님** — `c1` 을 손님으로 잡음 |
| 이미지 모델 | 아무나 — 빈자리를 스스로 채움 |

말하는 사람과 보이는 사람이 어긋나 있고, 그 틈에서 인물이 흔들린다.

**이 고침은 성격이 다르다.** 오늘 프롬프트로 규칙을 조인 것이 세 번인데 매번 다른 형태로
샜다. 주인공 선언은 **없던 정보를 주는 것**이지 새 금지 규칙이 아니다 — 정보 부족으로 생긴
빈틈은 정보를 주면 메워진다. 캐스팅을 `shows` 위로 옮겼을 때가 같은 성격이었고 그건 통했다.

**화자와 주인공은 다르다.** 이 대본처럼 사장님이 말하면서 손님을 비추는 구성은 정상이다.
`lead` 는 "누가 말하는가"가 아니라 **"카메라가 누구를 따라가는가"** 다.

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다**
- 기존 테스트 **407개 그린이 하한선**
- **실제 이미지 생성(fal)은 실행 전에 사장님 검토를 받는다.** Task 5가 그 게이트다.
  Task 1~4는 fal 을 부르지 않는다
- Korean 문구는 사장님이 읽는 말로. 파일명·함수명을 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조
- `lead` 가 비면 **모든 자리가 지금 동작 그대로**여야 한다
- `lib/refs.js` 는 import 가 하나도 없어야 한다

## 설계에서 뺀 것 — 이미지 프롬프트에는 넣지 않는다

`lead` 를 `buildImagePrompt` 의 주제 앵커에 넣는 안을 검토했다가 **버렸다.**

사람이 없는 컷(예: "코트 안감 클로즈업")에까지 "이 영상은 50대 남성 손님을 따라간다"가
붙으면 모델이 **없어도 될 사람을 그려 넣는다** — 지금 고치려는 문제를 키운다. 사람이 있는
컷은 이미 첨부 번호로 `who` 를 받고 있어 중복이기도 하다.

주인공이 값어치를 내는 자리는 **화면 설계와 캐스팅** 둘뿐이다.

---

## File Structure

**수정**
- `lib/briefing.js` — `SYSTEM` 에 `lead` 를 더한다
- `lib/validate.js` — `validateBriefing` 이 `lead` 를 통과시킨다
- `lib/cuts.js` — `buildShowsMessages` 가 주인공을 넘긴다
- `lib/cast.js` — `buildCastMessages` 가 주인공을 넘긴다
- `lib/pipeline.js` — `buildCastMessages` 에 project 를 넘긴다
- `app/api/projects/[id]/route.js` — 주인공이 바뀌면 컷을 비운다
- `app/create/[id]/script/page.js` — 주인공 한 줄
- `tests/briefing.test.js` · `tests/validate.test.js` · `tests/cuts.test.js` · `tests/cast.test.js` · `tests/routes.test.js`

**건드리지 않음**
- `lib/imagegen.js` · `lib/refs.js` · `lib/vlm.js`

---

## Task 1: 브리핑이 주인공을 뽑는다

**Files:**
- Modify: `lib/briefing.js` (`SYSTEM`)
- Modify: `lib/validate.js` (`validateBriefing`)
- Test: `tests/briefing.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `briefing.lead` — 문자열. 사람이 중심이 아닌 영상이면 빈 문자열

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 의 `validateBriefing` describe 에 더한다:

```js
  it("주인공을 통과시킨다 — 카메라가 누구를 따라가는지다", () => {
    const got = validateBriefing({
      topic: "옷 수선집 소개", key_points: ["12년"], questions: [],
      lead: "20년 된 아버지 코트를 맡기러 온 50대 남성 손님",
    });
    expect(got.lead).toBe("20년 된 아버지 코트를 맡기러 온 50대 남성 손님");
  });

  it("주인공이 없으면 빈 문자열 — 물건이 중심인 영상이 있다", () => {
    const got = validateBriefing({ topic: "생딸기라떼", key_points: ["딸기"], questions: [] });
    expect(got.lead).toBe("");
  });

  it("주인공이 문자열이 아니면 빈 문자열로 둔다", () => {
    const got = validateBriefing({ topic: "t", key_points: ["k"], questions: [], lead: { who: "손님" } });
    expect(got.lead).toBe("");
  });
```

`tests/briefing.test.js` 의 프롬프트 테스트에 더한다(이 파일의 기존 패턴을 따른다 —
`buildBriefingMessages(project).system` 에 문구가 있는지 본다):

```js
  it("주인공을 뽑으라고 지시한다 — 화자가 아니라 카메라가 따라가는 사람이다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("lead");
    expect(system).toContain("카메라가 따라가는");
    // 화자와 구분하라고 명시한다 — 사장님이 말하면서 손님을 비추는 구성이 정상이다
    expect(system).toContain("말하는 사람과 다를 수 있다");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/briefing.test.js`
Expected: FAIL — `lead` 가 undefined, 프롬프트에 문구 없음

- [ ] **Step 3: `lib/briefing.js` 의 `SYSTEM` 을 고친다**

JSON 스키마 줄에서 `"takeaway"` 다음에 한 줄을 더한다:

```
 "lead":"카메라가 따라가는 사람 한 명 (사람이 중심이 아니면 빈 문자열)",
```

규칙 목록 끝에 더한다:

```
- lead 는 화면의 중심에 서는 사람 한 명이다. **말하는 사람과 다를 수 있다** — 사장님이 말하면서 손님을 비추는 구성이 흔하다.
  누구인지 알아볼 수 있게 적는다: 나이대·성별·그 사람이 이 이야기에서 무엇을 하는지.
  ✗ "손님" / "사장님"
  ✓ "20년 된 아버지 코트를 맡기러 온 50대 남성 손님" / "12년째 수선집을 하는 50대 남성 사장님"
- 물건·공간이 중심이고 사람이 화면에 거의 안 나오는 영상이면 lead 를 빈 문자열로 둔다. 억지로 사람을 만들지 않는다.
```

- [ ] **Step 4: `validateBriefing` 이 통과시키게 한다**

`lib/validate.js:161` 의 `return` 줄을 바꾼다:

```js
  return {
    topic: obj.topic.trim(), key_points, audience: str(obj.audience),
    takeaway: str(obj.takeaway),
    // 주인공 — 카메라가 따라가는 사람. 없는 영상이 있으므로 빈 문자열이 정상이다
    lead: str(obj.lead),
    asked,
  };
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/briefing.test.js`
Expected: PASS

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/briefing.js lib/validate.js tests/briefing.test.js tests/validate.test.js
git commit -m "feat: 브리핑이 카메라가 따라갈 사람을 뽑는다

이 영상이 누구를 비추는지가 어디에도 적혀 있지 않아, 단계마다 제각각 짐작하고 있었다.
대본은 사장님을 1인칭 화자로 쓰고, 화면 설계는 손님을 비추고, 이미지 모델은 빈자리를
아무나로 채웠다. 그 틈에서 인물이 컷마다 달라졌다.

말하는 사람과 구분한다 — 사장님이 말하면서 손님을 비추는 구성이 정상이다.
물건이 중심인 영상은 빈 문자열로 둔다."
```

---

## Task 2: 주인공이 화면 설계와 캐스팅으로 흐른다

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM` 규칙, `buildShowsMessages`)
- Modify: `lib/cast.js` (`CAST_SYSTEM` 규칙, `buildCastMessages`)
- Modify: `lib/pipeline.js` (`buildCastMessages` 호출)
- Test: `tests/cuts.test.js`, `tests/cast.test.js`

**Interfaces:**
- Consumes: `project.briefing.lead` (Task 1)
- Produces: `buildCastMessages(cuts, avatars, lead = "")` — **세 번째 인자가 생긴다**
- Produces: `buildShowsMessages(project, cuts)` — 서명 그대로, 프롬프트에 `[주인공]` 이 생긴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에 더한다:

```js
  it("주인공을 알려 준다 — 카메라가 누구를 따라갈지 알아야 컷이 그 사람을 비춘다", () => {
    const withLead = { ...project, briefing: { ...project.briefing, lead: "50대 남성 손님" } };
    const { messages, system } = buildShowsMessages(withLead, [{ sentence: "한 문장." }]);
    expect(messages[0].content).toContain("[주인공]\n50대 남성 손님");
    expect(system).toContain("주인공");
  });

  it("주인공이 없으면 그 블록을 넣지 않는다 — 물건이 중심인 영상이 있다", () => {
    const { messages } = buildShowsMessages(project, [{ sentence: "한 문장." }]);
    expect(messages[0].content).not.toContain("[주인공]");
  });
```

`tests/cast.test.js` 의 `buildCastMessages` describe 에 더한다:

```js
  it("주인공을 알려 준다 — 반드시 뽑아야 할 사람이다", () => {
    const user = buildCastMessages(cuts, AVATARS, "50대 남성 손님").messages[0].content;
    expect(user).toContain("[주인공]\n50대 남성 손님");
  });

  it("주인공이 없으면 그 블록을 넣지 않는다", () => {
    expect(buildCastMessages(cuts, AVATARS).messages[0].content).not.toContain("[주인공]");
  });

  it("주인공을 빠뜨리지 말라고 지시한다", () => {
    expect(buildCastMessages(cuts, AVATARS, "x").system).toContain("주인공");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/cast.test.js`
Expected: FAIL — `[주인공]` 블록이 없다

- [ ] **Step 3: `buildShowsMessages` 에 주인공을 더한다**

`lib/cuts.js` 의 `buildShowsMessages` 를 바꾼다. `[올린 사진]` **앞에** 넣는다:

```js
export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  // 주인공 — 카메라가 따라가는 사람. 없으면 블록째 빼서 지금 동작 그대로 둔다
  const lead = (project.briefing?.lead || "").trim();
  const leadBlock = lead ? `\n[주인공]\n${lead}\n` : "";
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}
${leadBlock}
[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

`SHOWS_SYSTEM` 의 규칙 목록에 한 줄을 더한다(`ref_ids` 규칙 **앞**):

```
- [주인공]이 주어져 있으면 그 사람이 이 영상의 중심이다. 사람이 보이는 컷은 그 사람을 비추는 쪽으로 쓴다.
  다른 사람이 함께 보이면 그것도 화면에 적는다 — 적지 않은 사람은 뒤 단계가 알 수 없어 컷마다 다른 얼굴로 나온다.
```

- [ ] **Step 4: `buildCastMessages` 에 주인공을 더한다**

`lib/cast.js` 의 `buildCastMessages` 를 바꾼다:

```js
export function buildCastMessages(cuts, avatars, lead = "") {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  // 화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돌아야 한다
  const shots = (cuts || [])
    .map((c, i) => `${i + 1}. ${c.shows || c.sentence || ""}`)
    .join("\n");
  // 주인공 — 없으면 블록째 뺀다
  const leadBlock = String(lead || "").trim() ? `\n[주인공]\n${String(lead).trim()}\n` : "";
  const user = `[컷별 화면 — 번호가 곧 컷 번호다]
${shots}
${leadBlock}
[준비된 인물 사진]
${list}`;
  return { system: CAST_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

`CAST_SYSTEM` 의 규칙 목록 맨 앞에 한 줄을 더한다:

```
- [주인공]이 주어져 있으면 그 사람을 반드시 cast 에 넣는다. 화면 설명이 그 사람을 다르게 불러도 같은 사람으로 묶는다.
```

- [ ] **Step 5: `lib/pipeline.js` 가 주인공을 넘긴다**

`splitCuts` 안의 `buildCastMessages` 호출을 바꾼다:

```js
      const msgs = buildCastMessages(withShows, avatars, project.briefing?.lead);
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/cast.js lib/pipeline.js tests/cuts.test.js tests/cast.test.js
git commit -m "feat: 주인공을 화면 설계와 캐스팅에 알려 준다

카메라가 누구를 따라가는지 알아야 컷이 그 사람을 비추고, 캐스팅이 그 사람을
빠뜨리지 않는다.

이미지 프롬프트에는 넣지 않았다. 사람이 없는 컷(안감 클로즈업 같은)에까지 주인공을
알리면 모델이 없어도 될 사람을 그려 넣는다 — 지금 고치려는 문제를 키운다."
```

---

## Task 3: 사장님이 주인공을 확인하고 고친다

대본 화면 구성 목록 위에 한 줄을 둔다. 고치면 구성을 다시 만든다 — 주인공이 바뀌면 컷의
화면과 캐스팅이 함께 달라져야 하기 때문이다.

**Files:**
- Modify: `app/api/projects/[id]/route.js` (주인공이 바뀌면 컷을 비운다)
- Modify: `app/create/[id]/script/page.js` (한 줄 표시·수정)
- Test: `tests/routes.test.js`

**Interfaces:**
- Produces: `PATCH /api/projects/:id` 가 `{ briefing: { lead } }` 를 받는다.
  **`lead` 가 실제로 달라졌을 때만** `cuts` 를 비우고 `cuts_error` 를 지운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js` 의 PATCH describe 에 더한다:

```js
  it("주인공을 바꾸면 컷을 비운다 — 화면과 캐스팅이 함께 달라져야 한다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, lead: "50대 남성 손님" },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "옛 화면" }],
      cast: [{ id: "c1", who: "손님", cuts: [0] }],
    }));
    const res = await PATCH(patchReq({ briefing: { lead: "30대 남성 사장님" } }), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = await getProject(p.id);
    expect(saved.briefing.lead).toBe("30대 남성 사장님");
    expect(saved.cuts).toEqual([]);
  });

  it("주인공이 그대로면 컷을 건드리지 않는다 — 다시 만들면 고쳐 둔 화면이 지워진다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, lead: "50대 남성 손님" },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "고쳐 둔 화면" }],
    }));
    const res = await PATCH(patchReq({ briefing: { lead: "50대 남성 손님" } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).cuts[0].shows).toBe("고쳐 둔 화면");
  });
```

> `tests/routes.test.js:23` 이 이미 `const { PATCH } = await import(...)` 로 들여오고 있다.
> 새 import 는 필요 없다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — 컷이 그대로 남아 있다

- [ ] **Step 3: PATCH 라우트를 고친다**

`app/api/projects/[id]/route.js` 의 `if (body.briefing) {` 블록 안, 기존 병합 뒤에 더한다:

```js
        // 주인공이 바뀌면 컷을 비운다 — 화면과 캐스팅이 그 사람을 기준으로 다시 만들어져야 한다.
        // 실제로 달라졌을 때만 비운다: 같은 값으로 저장했는데 지우면 사장님이 고쳐 둔 화면이 날아간다.
        const prevLead = (proj.briefing?.lead || "").trim();
        const nextLead = (next.briefing?.lead || "").trim();
        if (prevLead !== nextLead) {
          next.cuts = [];
          next.cuts_error = null;
        }
```

- [ ] **Step 4: 대본 화면에 한 줄을 둔다**

`app/create/[id]/script/page.js` 의 구성 헤더(`<div className="eyebrow mt-lg">구성 …`) **바로 위**에 넣는다:

```jsx
      {/* 주인공 — 카메라가 따라가는 사람. 여기서 고치면 구성을 다시 만든다.
          그림과 클립이 이 사람을 기준으로 나오므로, 만들기 전에 고쳐야 값이 안 든다. */}
      {project.briefing?.lead && (
        <>
          <div className="eyebrow mt-lg">
            이 영상이 따라가는 사람 <small>고치면 구성을 다시 만들어요</small>
          </div>
          <p className="pgsub" contentEditable suppressContentEditableWarning
            onBlur={(e) => {
              const v = e.currentTarget.textContent.trim();
              if (v && v !== project.briefing.lead) saveLead(v);
            }}>{project.briefing.lead}</p>
        </>
      )}
```

`saveCut` 아래에 더한다:

```jsx
  // 주인공을 고치면 구성을 다시 만든다 — 라우트가 컷을 비우므로 이어서 부르면 새로 나뉜다.
  // 분할·화면 설계·캐스팅은 OpenAI 만 써서 fal 값이 들지 않는다.
  async function saveLead(lead) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing: { lead } }),
    }).catch(() => null);
    if (!res || !res.ok) { setErr("고친 것을 저장하지 못했어요 — 다시 시도해 주세요"); return; }
    setErr("");
    await load(id).catch(() => {});
    await splitCuts();
  }
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add "app/api/projects/[id]/route.js" "app/create/[id]/script/page.js" tests/routes.test.js
git commit -m "feat: 대본 화면에서 주인공을 확인하고 고친다

브리핑이 뽑은 주인공이 틀릴 수 있다. 그림과 클립이 그 사람을 기준으로 나오므로
만들기 전에 고쳐야 값이 안 든다 — 구성을 승인 앞에 두는 것과 같은 이유다.

고치면 구성을 다시 만든다. 주인공이 바뀌면 컷의 화면과 캐스팅이 함께 달라져야 하기
때문이다. 같은 값으로 저장할 때는 건드리지 않는다 — 고쳐 둔 화면이 날아간다."
```

---

## Task 4: 가짜 모드로 잰다 (유료 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

fal 을 부르지 않는다. OpenAI 만 편당 4~5센트.

- [ ] **Step 1: 돌린다**

```bash
SHOTFORM_FAKE=1 npm run dev
node scripts/measure/run-pipeline.mjs tailor 1 30 --cuts
node scripts/measure/run-pipeline.mjs rich 1 30 --cuts
node scripts/measure/run-pipeline.mjs workshop 1 30 --cuts
```

- [ ] **Step 2: 되는가 안 되는가를 본다**

비율이 아니라 **작동 여부**를 잰다:

- [ ] `briefing.lead` 가 실제로 뽑혔는가. 나이대·성별이 들어 있는가
- [ ] 그 사람이 **cast 에 들어 있는가** — 주인공을 빠뜨리면 이 계획이 헛돈다
- [ ] 주인공이 **여러 컷에 배정됐는가** — 한 컷에만 나오면 화면 설계가 안 따라간 것이다
- [ ] `shows` 에 **사람이 더 자주 나오는가** — 직전 관측에서는 화면이 사물·손으로 쏠렸다
      (수선집 편에서 사장이 인물로 한 번도 안 나온 적이 있다)
- [ ] 물건이 중심인 자료에서 `lead` 가 비었는가 (`rich` 반찬가게가 후보)

- [ ] **Step 3: 어긋난 것을 고친다**

**무엇이 어긋났는지 한 줄로 적을 수 있을 때만 고친다.** 적을 수 없으면 사장님에게 가져간다 —
프롬프트 왕복은 이 저장소에서 세 번 다 다른 형태로 샜다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "fix: 주인공 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]"
```

---

## Task 5: 실제 이미지로 확인한다 — **사장님 검토 게이트**

> ⚠️ **사장님 승인 없이 시작하지 않는다.**

**예상 비용:** 컷별 재생성 3컷 기준 약 **$0.24**(컷당 후보 2장 × $0.04). 전체를 다시 만들면
$0.32 이므로, 사람이 나오는 컷만 고르면 더 싸다.

- [ ] **Step 1: 승인을 받는다** — 무엇을 확인하려는지, 예상 비용, 대상 컷을 알리고 답을 받는다

- [ ] **Step 2: 사람이 여러 컷에 나오는 편으로 한 편을 만든다**

이미지까지만 만든다(⑤영상은 누르지 않는다).

- [ ] **Step 3: 확인한다**

- [ ] **주인공이 컷마다 같은 얼굴인가** — 이 계획의 목적이다
- [ ] **`shows` 에 없는 사람이 덤으로 그려지는가.** 줄었으면 주인공 선언이 효과가 있었던 것이고,
      그대로면 "설명에 없는 사람을 넣지 마라" 한 줄을 이미지 프롬프트에 붙인다.
      **지금 미리 붙이지 않는 이유**는 두 변경이 섞이면 무엇이 효과였는지 못 가리기 때문이다
- [ ] 배역이 뒤바뀌지 않는가 (`a29e182` 로 고친 것이 유지되는가)

- [ ] **Step 4: 알아낸 것을 적는다**

`docs/models-and-costs.md` §4와 설계 문서를 갱신한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "fix: 주인공 선언을 실제 이미지로 확인하고 어긋난 곳을 고친다

[무엇을 확인했는지]"
```

---

## 다음

완전한 출연 블록(인물마다 아바타를 고르는 화면)은 여전히 남아 있다. Task 4·5의 관측으로
그 화면이 얼마나 필요한지·어떤 모양이어야 하는지가 정해진다.
