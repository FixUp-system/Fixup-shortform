# 영상이 무엇을 따라가는지 정한다 — 초점을 뽑고 흘려보낸다

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 영상의 컷들이 같은 것을 따라간다. 사람 이야기면 그 사람을, 물건 소개면 그 물건을,
정보 전달이면 그 정보를.

**Architecture:** 브리핑이 자료를 읽을 때 **초점(`focus`)** 을 함께 뽑는다 — 갈래(`사람`·
`물건`·`정보`)와 그 대상. 화면 설계가 그것을 받아 컷을 쓰고, **갈래가 `사람`일 때만**
캐스팅이 그 사람을 넘겨받는다.

**Tech Stack:** Next.js App Router, vitest, OpenAI(gpt-4o)

앞선 계획: `2026-07-28-avatar-reference-consistency.md`(완료) · `2026-07-28-cast-from-shows.md`(완료)

## 왜 필요한가

2026-07-29 실제 이미지 관통에서 **수선사가 컷마다 다른 사람으로 나왔다.** 배역 뒤바뀜은
첨부를 번호로 지목해 고쳤지만(`a29e182`), 컷1에 `shows` 에도 없는 사람이 덤으로 그려지는 것은
그것으로 막지 못했다. 파고 보니 원인이 위에 있었다.

**이 영상이 무엇을 따라가는지가 어디에도 적혀 있지 않다.** 그래서 단계마다 제각각 짐작한다:

| 단계 | 무엇을 중심으로 잡았나 |
|---|---|
| 대본 | 사장님 — "가게를 냈습니다"(1인칭 화자) |
| 화면 설계 | 손님 — 컷1이 "손님이 코트를 들고 문을 들어오는 장면" |
| 캐스팅 | 손님 — `c1` 을 손님으로 잡음 |
| 이미지 모델 | 아무나 — 빈자리를 스스로 채움 |

이 흔들림은 인물에 국한되지 않는다. 어제 관측에서는 같은 자료의 화면이 **사물·손 위주**로
쏠려 사장이 인물로 한 번도 안 나온 편이 있었고, 오늘은 인물 위주로 갔다. 매번 새로 짐작하기
때문이다.

**그리고 이 개념은 이미 저장소 안에 있다.** `lib/briefing.js` 첫 줄:

> 영상 성격(알림·판매·기록·이야기)은 자료를 보고 판단한다. 어느 쪽도 전제하지 않는다.

성격을 판단하라고 해 놓고 **그 판단을 아무 데도 남기지 않는다.** 뒤 단계는 볼 수 없다.

## 왜 "주인공"이 아니라 "초점"인가

처음에는 `lead`(주인공 한 명)로 잡았다가 버렸다. **칸이 있으면 모델은 채운다** — 오늘 두 번
실측했다:

- 아바타 풀이 "40~60대 남성"뿐일 때 캐스팅이 네 편 전부 그 나이대로 적었고, 풀을 30대로
  바꾸자 같은 원고에서 "30대 남성 손님"으로 바뀌었다
- `who` 규칙에 `✗ "손님"` 반례를 넣었는데도 그냥 "손님"이라 적은 경우가 있었다

"사람이 중심이 아니면 빈 문자열로 둬라"는 **약한 탈출구**이고, 그것이 지켜진다는 근거가
오늘 데이터에 없다. 정보 전달·제품 홍보 영상에서 억지 주인공이 만들어질 위험이 크다.

**갈래를 먼저 고르게 하면 그 위험이 구조적으로 사라진다.** 사람은 세 갈래 중 하나일 때만
등장하고, 나머지 두 갈래에서는 캐스팅이 초점 얘기를 아예 듣지 않는다.

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다**
- 기존 테스트 **407개 그린이 하한선**
- **실제 이미지 생성(fal)은 실행 전에 사장님 검토를 받는다.** Task 5가 그 게이트다.
  Task 1~4는 fal 을 부르지 않는다
- Korean 문구는 사장님이 읽는 말로. 파일명·함수명을 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조
- `focus` 가 비면 **모든 자리가 지금 동작 그대로**여야 한다
- `lib/refs.js` 는 import 가 하나도 없어야 한다

## 설계 결정 셋 — 이유를 남긴다

**① 갈래는 셋이다: `사람`·`물건`·`정보`.** "과정"을 넷째로 두려다 뺐다 — 만드는 과정은 물건이나
사람 어느 한쪽에 붙지, 뒤 단계 동작을 따로 바꾸지 않는다. **갈래는 뒤 단계가 달라질 때만
나눈다.** 나중에 실제로 갈라야 할 이유가 생기면 그때 넷째를 만든다.

**② 캐스팅에는 갈래가 `사람`일 때만 초점을 넘긴다.** 물건·정보 영상에서 캐스팅은 초점 얘기를
아예 듣지 않는다. 억지 주인공이 나올 칸이 없다.

**③ 이미지 프롬프트에는 넣지 않는다.** 사람이 없는 컷(예: "코트 안감 클로즈업")에까지
"이 영상은 손님을 따라간다"가 붙으면 모델이 없어도 될 사람을 그려 넣는다 — 지금 고치려는
문제를 키운다. 사람이 있는 컷은 이미 첨부 번호로 `who` 를 받고 있어 중복이기도 하다.

---

## File Structure

**수정**
- `lib/briefing.js` — `SYSTEM` 에 `focus` 를 더한다
- `lib/validate.js` — `validateBriefing` 이 `focus` 를 통과시킨다
- `lib/cuts.js` — `buildShowsMessages` 가 초점을 넘긴다
- `lib/cast.js` — `buildCastMessages` 가 사람 초점만 받는다
- `lib/pipeline.js` — 갈래를 보고 넘길지 정한다
- `app/api/projects/[id]/route.js` — 초점이 바뀌면 컷을 비운다
- `app/create/[id]/script/page.js` — 초점 한 줄
- `tests/briefing.test.js` · `tests/validate.test.js` · `tests/cuts.test.js` · `tests/cast.test.js` · `tests/routes.test.js`

**건드리지 않음**
- `lib/imagegen.js` · `lib/refs.js` · `lib/vlm.js`

---

## Task 1: 브리핑이 초점을 뽑는다

**Files:**
- Modify: `lib/briefing.js` (`SYSTEM`)
- Modify: `lib/validate.js` (`validateBriefing`)
- Test: `tests/briefing.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `briefing.focus` — `{ mode: "사람"|"물건"|"정보", subject: string }` 또는 `null`.
  갈래가 셋 중 하나가 아니거나 대상이 비면 **통째로 `null`** 이다 — 반쪽짜리 초점은 뒤 단계를
  헷갈리게만 한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 의 `validateBriefing` describe 에 더한다:

```js
  it("초점을 통과시킨다 — 갈래와 대상이 함께 온다", () => {
    const got = validateBriefing({
      topic: "옷 수선집 소개", key_points: ["12년"], questions: [],
      focus: { mode: "사람", subject: "20년 된 아버지 코트를 맡기러 온 50대 남성 손님" },
    });
    expect(got.focus).toEqual({
      mode: "사람", subject: "20년 된 아버지 코트를 맡기러 온 50대 남성 손님",
    });
  });

  it("물건·정보 갈래도 그대로 받는다", () => {
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "물건", subject: "생딸기라떼" } }).focus.mode).toBe("물건");
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "정보", subject: "가격과 영업시간" } }).focus.mode).toBe("정보");
  });

  it("모르는 갈래는 초점을 통째로 버린다 — 반쪽짜리는 뒤 단계를 헷갈리게만 한다", () => {
    const got = validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "분위기", subject: "따뜻함" } });
    expect(got.focus).toBe(null);
  });

  it("대상이 비면 초점을 버린다", () => {
    const got = validateBriefing({ topic: "t", key_points: ["k"], questions: [],
      focus: { mode: "사람", subject: "  " } });
    expect(got.focus).toBe(null);
  });

  it("초점이 아예 없으면 null — 지금 동작 그대로 간다", () => {
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [] }).focus).toBe(null);
    expect(validateBriefing({ topic: "t", key_points: ["k"], questions: [], focus: "사람" }).focus).toBe(null);
  });
```

`tests/briefing.test.js` 의 `buildBriefingMessages` describe 에 더한다:

```js
  it("초점을 뽑으라고 지시한다 — 갈래를 먼저 고르게 한다", () => {
    const { system } = buildBriefingMessages(project);
    expect(system).toContain("focus");
    for (const mode of ["사람", "물건", "정보"]) {
      expect(system).toContain(mode);
    }
  });

  it("사람이 중심이 아닌 영상에 사람을 만들지 말라고 못 박는다", () => {
    // 칸이 있으면 모델이 채운다 — 정보 전달 영상에 억지 주인공이 생기는 것을 막는다
    expect(buildBriefingMessages(project).system).toContain("억지로");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/briefing.test.js`
Expected: FAIL — `focus` 가 undefined, 프롬프트에 문구 없음

- [ ] **Step 3: `lib/briefing.js` 의 `SYSTEM` 을 고친다**

JSON 스키마에서 `"takeaway"` 다음에 한 줄을 더한다:

```
 "focus":{"mode":"사람|물건|정보 중 하나","subject":"그 갈래의 대상 한 줄"},
```

규칙 목록 끝에 더한다:

```
- focus 는 이 영상이 무엇을 따라가는지다. 갈래를 먼저 고른다.
  · 사람 — 누군가의 경험·이야기를 따라간다. subject 에는 그 사람을 알아볼 수 있게 적는다(나이대·성별·이 이야기에서 무엇을 하는지).
    화면에 보이는 사람이 화자와 다를 수 있다 — 사장님이 말하면서 손님을 비추는 구성이 흔하다. subject 는 **보이는 쪽**이다.
  · 물건 — 제품·음식·공간을 보여준다. subject 에는 그 물건을 적는다.
  · 정보 — 값·시간·방법·조건을 전한다. subject 에는 무엇을 전하는지 적는다.
- 갈래가 애매하면 자료에서 분량을 가장 많이 차지하는 쪽으로 고른다.
- **사람이 중심이 아닌 영상에 억지로 사람을 만들지 않는다.** 물건 소개나 정보 전달인데 사람을 subject 로 적으면 틀린 것이다.
```

- [ ] **Step 4: `validateBriefing` 이 통과시키게 한다**

`lib/validate.js` 의 `validateBriefing` 안, `const str = ...` 아래에 더하고 `return` 을 바꾼다:

```js
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  // 초점 — 이 영상이 무엇을 따라가는지. 갈래가 셋 중 하나가 아니거나 대상이 비면 통째로 버린다.
  // 반쪽짜리 초점은 뒤 단계를 헷갈리게만 한다 — 없느니만 못하다.
  const FOCUS_MODES = ["사람", "물건", "정보"];
  const mode = str(obj.focus?.mode);
  const subject = str(obj.focus?.subject);
  const focus = FOCUS_MODES.includes(mode) && subject ? { mode, subject } : null;

  return {
    topic: obj.topic.trim(), key_points, audience: str(obj.audience),
    takeaway: str(obj.takeaway), focus, asked,
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
git commit -m "feat: 브리핑이 이 영상이 무엇을 따라가는지 뽑는다

영상 성격을 자료로 판단하라고 프롬프트 첫 줄에 적어 두고, 그 판단을 아무 데도 남기지
않고 있었다. 뒤 단계는 볼 수 없으니 매번 새로 짐작했다 — 같은 자료인데 어떤 날은 화면이
사물로 쏠리고 어떤 날은 인물로 쏠렸다.

주인공 한 명으로 잡지 않고 갈래(사람·물건·정보)를 먼저 고르게 했다. 칸이 있으면 모델은
채운다 — 실측에서 아바타 풀이 인물 서술을 끌어당기는 것을 봤다. 주인공 칸을 두면 정보
전달 영상에도 억지 주인공이 생긴다.

갈래가 셋 중 하나가 아니거나 대상이 비면 초점을 통째로 버린다. 반쪽은 없느니만 못하다."
```

---

## Task 2: 초점이 화면 설계와 캐스팅으로 흐른다

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM` 규칙, `buildShowsMessages`)
- Modify: `lib/cast.js` (`CAST_SYSTEM` 규칙, `buildCastMessages`)
- Modify: `lib/pipeline.js` (`buildCastMessages` 호출)
- Test: `tests/cuts.test.js`, `tests/cast.test.js`

**Interfaces:**
- Consumes: `project.briefing.focus` (Task 1)
- Produces: `buildCastMessages(cuts, avatars, lead = "")` — **세 번째 인자가 생긴다.**
  파이프라인은 **갈래가 `사람`일 때만** 값을 넘긴다
- Produces: `buildShowsMessages(project, cuts)` — 서명 그대로, 프롬프트에 `[이 영상이 따라가는 것]` 이 생긴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에 더한다:

```js
  it("초점을 알려 준다 — 갈래와 대상을 함께 준다", () => {
    const withFocus = { ...project, briefing: { ...project.briefing,
      focus: { mode: "사람", subject: "50대 남성 손님" } } };
    const { messages, system } = buildShowsMessages(withFocus, [{ sentence: "한 문장." }]);
    expect(messages[0].content).toContain("[이 영상이 따라가는 것]\n사람 — 50대 남성 손님");
    expect(system).toContain("따라가는 것");
  });

  it("물건 갈래도 그대로 전한다 — 사람만 특별대우하지 않는다", () => {
    const withFocus = { ...project, briefing: { ...project.briefing,
      focus: { mode: "물건", subject: "생딸기라떼" } } };
    expect(buildShowsMessages(withFocus, [{ sentence: "한 문장." }]).messages[0].content)
      .toContain("물건 — 생딸기라떼");
  });

  it("초점이 없으면 그 블록을 넣지 않는다", () => {
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).messages[0].content)
      .not.toContain("[이 영상이 따라가는 것]");
  });
```

`tests/cast.test.js` 의 `buildCastMessages` describe 에 더한다:

```js
  it("사람 초점을 받으면 알려 준다 — 반드시 뽑아야 할 사람이다", () => {
    const user = buildCastMessages(cuts, AVATARS, "50대 남성 손님").messages[0].content;
    expect(user).toContain("[이 영상이 따라가는 사람]\n50대 남성 손님");
  });

  it("초점을 안 받으면 그 블록을 넣지 않는다 — 물건·정보 영상에서는 넘어오지 않는다", () => {
    expect(buildCastMessages(cuts, AVATARS).messages[0].content)
      .not.toContain("[이 영상이 따라가는 사람]");
    expect(buildCastMessages(cuts, AVATARS, "  ").messages[0].content)
      .not.toContain("[이 영상이 따라가는 사람]");
  });

  it("그 사람을 빠뜨리지 말라고 지시한다", () => {
    expect(buildCastMessages(cuts, AVATARS, "x").system).toContain("따라가는 사람");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/cast.test.js`
Expected: FAIL — 블록이 없다

- [ ] **Step 3: `buildShowsMessages` 에 초점을 더한다**

`lib/cuts.js` 의 `buildShowsMessages` 를 바꾼다. `[올린 사진]` **앞에** 넣는다:

```js
export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  // 초점 — 이 영상이 무엇을 따라가는지. 없으면 블록째 빼서 지금 동작 그대로 둔다.
  // 이것이 없을 때 화면이 어떤 편은 사물로, 어떤 편은 인물로 쏠렸다(2026-07-28~29 관측).
  const f = project.briefing?.focus;
  const focusBlock = f?.mode && f?.subject ? `\n[이 영상이 따라가는 것]\n${f.mode} — ${f.subject}\n` : "";
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}
${focusBlock}
[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

`SHOWS_SYSTEM` 의 규칙 목록에 한 줄을 더한다(`ref_ids` 규칙 **앞**):

```
- [이 영상이 따라가는 것]이 주어져 있으면 컷들이 그것을 중심으로 이어지게 쓴다. 사람이면 그 사람을, 물건이면 그 물건을, 정보면 그 정보를 눈에 보이게 만든다.
  사람이 보이는 컷에는 그 컷에 함께 보이는 사람도 빠짐없이 적는다 — 적지 않은 사람은 뒤 단계가 알 수 없어 컷마다 다른 얼굴로 나온다.
```

- [ ] **Step 4: `buildCastMessages` 에 사람 초점을 더한다**

`lib/cast.js` 의 `buildCastMessages` 를 바꾼다:

```js
// lead — 이 영상이 따라가는 사람. **갈래가 '사람'일 때만 넘어온다**(lib/pipeline.js).
// 물건·정보 영상에서는 이 자리가 비어 있어야 한다. 칸이 있으면 모델이 채우기 때문에,
// 억지 주인공을 막는 것은 문구가 아니라 "아예 안 넘기는 것"이다.
export function buildCastMessages(cuts, avatars, lead = "") {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  // 화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돌아야 한다
  const shots = (cuts || [])
    .map((c, i) => `${i + 1}. ${c.shows || c.sentence || ""}`)
    .join("\n");
  const who = String(lead || "").trim();
  const leadBlock = who ? `\n[이 영상이 따라가는 사람]\n${who}\n` : "";
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
- [이 영상이 따라가는 사람]이 주어져 있으면 그 사람을 반드시 cast 에 넣는다. 화면 설명이 그 사람을 다르게 불러도 같은 사람으로 묶는다.
```

- [ ] **Step 5: `lib/pipeline.js` 가 사람일 때만 넘긴다**

`splitCuts` 안의 `buildCastMessages` 호출을 바꾼다:

```js
      // 갈래가 '사람'일 때만 초점을 넘긴다 — 물건·정보 영상에 억지 주인공이 생기지 않게.
      const focus = project.briefing?.focus;
      const lead = focus?.mode === "사람" ? focus.subject : "";
      const msgs = buildCastMessages(withShows, avatars, lead);
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/cast.js lib/pipeline.js tests/cuts.test.js tests/cast.test.js
git commit -m "feat: 초점을 화면 설계와 캐스팅에 흘려보낸다

화면 설계는 갈래와 대상을 함께 받는다 — 사람이면 그 사람을, 물건이면 그 물건을 중심으로
컷이 이어진다. 이것이 없을 때 같은 자료의 화면이 어떤 편은 사물로 어떤 편은 인물로
쏠렸다.

캐스팅에는 갈래가 사람일 때만 넘긴다. 물건·정보 영상에서는 그 자리가 비어 있다 —
칸이 있으면 모델이 채우므로, 억지 주인공을 막는 것은 문구가 아니라 안 넘기는 것이다.

이미지 프롬프트에는 넣지 않았다. 사람이 없는 컷에까지 알리면 없어도 될 사람을 그려
넣는다."
```

---

## Task 3: 사장님이 초점을 확인하고 고친다

대본 화면 구성 목록 위에 한 줄을 둔다. 고치면 구성을 다시 만든다 — 초점이 바뀌면 컷의
화면과 캐스팅이 함께 달라져야 하기 때문이다.

**Files:**
- Modify: `app/api/projects/[id]/route.js` (초점이 바뀌면 컷을 비운다)
- Modify: `app/create/[id]/script/page.js` (한 줄 표시·수정)
- Test: `tests/routes.test.js`

**Interfaces:**
- Produces: `PATCH /api/projects/:id` 가 `{ briefing: { focus } }` 를 받는다.
  **초점이 실제로 달라졌을 때만** `cuts` 를 비우고 `cuts_error` 를 지운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js` 의 PATCH describe 에 더한다. 이 파일은 `const { PATCH } = await import(...)`
로 이미 들여오고 있다(`tests/routes.test.js:23`) — 새 import 는 필요 없다:

```js
  it("초점을 바꾸면 컷을 비운다 — 화면과 캐스팅이 함께 달라져야 한다", async () => {
    const p = await projectWithScript();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus: { mode: "사람", subject: "50대 남성 손님" } },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "옛 화면" }],
      cast: [{ id: "c1", who: "손님", cuts: [0] }],
    }));
    const res = await PATCH(
      patchReq({ briefing: { focus: { mode: "물건", subject: "수선한 코트" } } }), ctx(p.id));
    expect(res.status).toBe(200);
    const saved = await getProject(p.id);
    expect(saved.briefing.focus.mode).toBe("물건");
    expect(saved.cuts).toEqual([]);
  });

  it("초점이 그대로면 컷을 건드리지 않는다 — 다시 만들면 고쳐 둔 화면이 지워진다", async () => {
    const p = await projectWithScript();
    const focus = { mode: "사람", subject: "50대 남성 손님" };
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      briefing: { ...proj.briefing, focus },
      cuts: [{ idx: 0, sentence: SCRIPT_TEXT, seconds: 3, shows: "고쳐 둔 화면" }],
    }));
    const res = await PATCH(patchReq({ briefing: { focus } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id)).cuts[0].shows).toBe("고쳐 둔 화면");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL — 컷이 그대로 남아 있다

- [ ] **Step 3: PATCH 라우트를 고친다**

`app/api/projects/[id]/route.js` 의 `if (body.briefing) {` 블록 안, 기존 병합 뒤에 더한다:

```js
        // 초점이 바뀌면 컷을 비운다 — 화면과 캐스팅이 그것을 기준으로 다시 만들어져야 한다.
        // 실제로 달라졌을 때만 비운다: 같은 값으로 저장했는데 지우면 고쳐 둔 화면이 날아간다.
        const focusKey = (f) => `${f?.mode || ""}|${(f?.subject || "").trim()}`;
        if (focusKey(proj.briefing?.focus) !== focusKey(next.briefing?.focus)) {
          next.cuts = [];
          next.cuts_error = null;
        }
```

- [ ] **Step 4: 대본 화면에 한 줄을 둔다**

`app/create/[id]/script/page.js` 의 구성 헤더(`<div className="eyebrow mt-lg">구성 …`)
**바로 위**에 넣는다:

```jsx
      {/* 초점 — 이 영상이 무엇을 따라가는지. 여기서 고치면 구성을 다시 만든다.
          그림과 클립이 이것을 기준으로 나오므로, 만들기 전에 고쳐야 값이 안 든다. */}
      {project.briefing?.focus?.subject && (
        <>
          <div className="eyebrow mt-lg">
            이 영상이 따라가는 것 <small>고치면 구성을 다시 만들어요</small>
          </div>
          <p className="pgsub">
            <b>{project.briefing.focus.mode}</b>{" — "}
            <span contentEditable suppressContentEditableWarning
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== project.briefing.focus.subject) saveFocus(v);
              }}>{project.briefing.focus.subject}</span>
          </p>
        </>
      )}
```

`saveCut` 아래에 더한다:

```jsx
  // 초점을 고치면 구성을 다시 만든다 — 라우트가 컷을 비우므로 이어서 부르면 새로 나뉜다.
  // 분할·화면 설계·캐스팅은 OpenAI 만 써서 fal 값이 들지 않는다.
  async function saveFocus(subject) {
    const focus = { ...project.briefing.focus, subject };
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing: { focus } }),
    }).catch(() => null);
    if (!res || !res.ok) { setErr("고친 것을 저장하지 못했어요 — 다시 시도해 주세요"); return; }
    setErr("");
    await load(id).catch(() => {});
    await splitCuts();
  }
```

> 갈래(`mode`)는 이번에 고치지 못한다 — 표시만 한다. 갈래를 바꾸는 것은 영상을 통째로 다시
> 기획하는 것에 가까워, 필요한지 Task 4·5의 관측으로 먼저 판단한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add "app/api/projects/[id]/route.js" "app/create/[id]/script/page.js" tests/routes.test.js
git commit -m "feat: 대본 화면에서 초점을 확인하고 고친다

브리핑이 뽑은 초점이 틀릴 수 있다. 그림과 클립이 그것을 기준으로 나오므로 만들기 전에
고쳐야 값이 안 든다 — 구성을 승인 앞에 두는 것과 같은 이유다.

고치면 구성을 다시 만든다. 같은 값으로 저장할 때는 건드리지 않는다 — 고쳐 둔 화면이
날아간다.

갈래는 표시만 한다. 갈래를 바꾸는 것은 영상을 통째로 다시 기획하는 것에 가까워, 필요한지
관측으로 먼저 판단한다."
```

---

## Task 4: 가짜 모드로 잰다 (유료 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

fal 을 부르지 않는다. OpenAI 만 편당 4~5센트.

- [ ] **Step 1: 갈래가 다른 자료로 돌린다**

```bash
SHOTFORM_FAKE=1 npm run dev
node scripts/measure/run-pipeline.mjs tailor 1 30 --cuts     # 사람 이야기가 나올 자료
node scripts/measure/run-pipeline.mjs rich 1 30 --cuts       # 물건(반찬)이 중심일 자료
node scripts/measure/run-pipeline.mjs workshop 1 30 --cuts   # 과정·정보가 섞인 자료
node scripts/measure/run-pipeline.mjs thin 1 30 --cuts       # 자료가 얕은 경우
```

- [ ] **Step 2: 되는가 안 되는가를 본다**

비율이 아니라 **작동 여부**를 잰다:

- [ ] **갈래가 자료에 맞게 나오는가.** 반찬가게가 `물건`, 수선집이 `사람` 쪽으로 가는가.
      **네 편 모두 `사람`으로 나오면 이 설계가 실패한 것이다** — 그게 정확히 막으려던 것이다
- [ ] 갈래가 `물건`·`정보`인 편에서 **cast 가 비거나 작은가.** 억지 주인공이 안 생겼는가
- [ ] 갈래가 `사람`인 편에서 그 사람이 cast 에 있고 **여러 컷에 배정됐는가**
- [ ] `shows` 가 갈래를 따라가는가 — 물건 편은 물건을, 사람 편은 사람을 비추는가
- [ ] 초점이 `null` 인 편이 있으면, 그 편이 **지금 동작 그대로** 도는가

- [ ] **Step 3: 어긋난 것을 고친다**

**무엇이 어긋났는지 한 줄로 적을 수 있을 때만 고친다.** 적을 수 없으면 사장님에게 가져간다 —
프롬프트 왕복은 이 저장소에서 세 번 다 다른 형태로 샜다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "fix: 초점 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]"
```

---

## Task 5: 실제 이미지로 확인한다 — **사장님 검토 게이트**

> ⚠️ **사장님 승인 없이 시작하지 않는다.**

**예상 비용:** 컷별 재생성 3컷 기준 약 **$0.24**(컷당 후보 2장 × $0.04).

- [ ] **Step 1: 승인을 받는다** — 무엇을 확인하려는지, 예상 비용, 대상 컷을 알리고 답을 받는다

- [ ] **Step 2: 사람이 여러 컷에 나오는 편으로 만든다** (이미지까지만)

- [ ] **Step 3: 확인한다**

- [ ] **`shows` 에 없는 사람이 덤으로 그려지는가.** 줄었으면 초점이 효과가 있었던 것이고,
      그대로면 "설명에 없는 사람을 넣지 마라" 한 줄을 이미지 프롬프트에 붙인다.
      **지금 미리 붙이지 않는 이유**는 두 변경이 섞이면 무엇이 효과였는지 못 가리기 때문이다
- [ ] 초점의 대상이 컷마다 같은 얼굴/같은 물건인가
- [ ] 배역이 뒤바뀌지 않는가 (`a29e182` 로 고친 것이 유지되는가)

- [ ] **Step 4: 알아낸 것을 적는다** — `docs/models-and-costs.md` §4와 설계 문서

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "fix: 초점을 실제 이미지로 확인하고 어긋난 곳을 고친다

[무엇을 확인했는지]"
```

---

## 다음 — 전개 설계(B)는 여기서 판단한다

이 계획은 **초점 한 줄**까지다. 컷 흐름의 뼈대(무엇으로 열고 어떻게 이어가고 무엇으로 닫는지)를
정하는 **전개 설계**는 폐지된 "구성" 단계의 부활에 가까우므로(`lib/synopsis.js` 가 폴백으로만
남아 있다), Task 4·5에서 **초점만으로 화면이 얼마나 안정되는지** 보고 필요성을 판단한다.

07-27에 구성을 걷어내고 원고 중심으로 재정의한 이력이 있다. 되살린다면 그때 왜 걷어냈는지부터
다시 봐야 한다.
