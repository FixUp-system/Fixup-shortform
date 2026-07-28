# 캐스팅을 화면 설계 뒤로 — 인물을 추측하지 않고 화면에서 읽는다

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 편에 두 사람이 나오면 두 사람 다 일관되게 만든다.

**Architecture:** 캐스팅을 원고가 아니라 **컷별 `shows`** 위에서 돌린다. 인물이 어느 컷에
나오는지를 캐스팅이 함께 답하고, 코드가 그 번호로 컷에 꽂는다. 화면 설계는 사진만 고르던
원래 자리로 돌아간다.

**Tech Stack:** Next.js App Router, vitest, OpenAI(gpt-4o)

앞선 계획: `docs/superpowers/plans/2026-07-28-avatar-reference-consistency.md` (Task 1~6 완료)
설계: `docs/superpowers/specs/2026-07-28-avatar-reference-consistency-design.md`

## 왜 뒤집는가 — 실측이 시킨 것이다

원고에서 캐스팅하면 **누가 화면에 보일지를 상상해야 한다.** 가짜 모드 관통 8편에서 그 상상이
두 번 다 빗나갔다:

| 프롬프트 | 결과 |
|---|---|
| 초안 ("스치는 사람은 빼라") | 손님을 **3/3 누락** — 주인만 뽑았다 |
| 넓힘 ("보이면 넣어라") | 배경 손님까지 끌어올 위험 |
| 좁힘 ("다시 나오는 사람") | 손님은 정확히 뽑았으나 **주인이 빠졌다.** cast 가 늘 1명으로 수렴 |

세 번째까지 오면 프롬프트 왕복이 회피 연쇄라는 뜻이다(이 저장소가 이미 겪은 패턴 —
`sources/shotform-live-throughput-2026-07-28` §3).

**`shows` 에는 이미 답이 쓰여 있다:**

```
컷1  손님이 코트를 들고 문을 들어서는 장면
컷2  주인이 작업대에서 옷을 수선하고 있다
컷3  주인이 손님에게 옷을 입히고 치수를 재는 장면
```

읽으면 두 사람이고, 각자 어느 컷에 있는지도 적혀 있다. 상상할 것이 없다.

**부수 효과가 더 크다:** "같은 사람에게 같은 id 를 붙인다"가 프롬프트 약속에서 **코드 보장**이
된다. 지금은 모델이 컷마다 같은 id 를 적어 주기를 바라야 하는데, 새 구조에서는 인물이 자기
컷 번호를 한 번에 답하고 코드가 꽂는다. 이 기능의 유일한 장치가 프롬프트 준수에 걸려 있던
것이 없어진다.

**필터는 만들지 않는다.** "한 컷에만 나오는 인물은 레퍼런스를 안 준다"를 검토했다가 버렸다 —
드문 문제(자리 경쟁)를 풀려고 실제 결함(같은 사람이 두 이름으로 쪼개지면 둘 다 레퍼런스를
잃는다)을 새로 만든다. 자리가 실제로 모자라면 진짜 프로젝트에서 신호가 온다.

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 두 워크트리가
  같은 파일 이름을 갖는다
- 기존 테스트 **388개 그린이 하한선**
- **실제 이미지·영상 생성(fal)은 실행 전에 사장님 검토를 받는다.** Task 5가 그 게이트다.
  Task 1~4는 fal 을 부르지 않는다
- Korean 문구는 사장님이 읽는 말로. 파일명·함수명을 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조
- 새 기능의 모든 실패는 **"지금 동작"으로 내려앉아야 한다** — 캐스팅이 실패해도 컷은 남고
  그림은 나온다
- `lib/refs.js` 는 **import 가 하나도 없어야 한다**(화면이 import 하면 번들에 `fs` 가 들어간다)

---

## File Structure

**수정**
- `lib/cast.js` — `CAST_SYSTEM` 을 화면 기반으로 다시 쓰고, `buildCastMessages` 가 컷을 받는다
- `lib/validate.js` — `validateCast` 가 `cuts` 번호를 받는다, `validateShows` 의 ref 는 사진 전용으로
- `lib/cuts.js` — `buildShowsMessages` 에서 `[출연]` 블록과 인물 규칙을 걷어낸다
- `lib/pipeline.js` — 순서를 바꾸고 병합을 넣는다
- `tests/cast.test.js` · `tests/validate.test.js` · `tests/cuts.test.js` · `tests/pipeline.test.js`

**건드리지 않음**
- `lib/refs.js` · `lib/imagegen.js` · `lib/vlm.js` — 아바타 풀·이미지 생성·사진 판정은 그대로다
- `app/create/` — 출연 블록(2단계)은 이 계획 밖이다

---

## Task 1: 캐스팅이 화면을 읽고 컷 번호를 답한다

**Files:**
- Modify: `lib/cast.js` (`CAST_SYSTEM`, `buildCastMessages`)
- Modify: `lib/validate.js` (`validateCast`)
- Test: `tests/cast.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `buildCastMessages(cuts, avatars): {system, messages}` — **첫 인자가 project 에서
  cuts 로 바뀐다.** `cuts` 는 `{shows?, sentence}` 를 가진 배열
- Produces: `validateCast(obj, avatarIds, cutCount): Array<{id, who, avatar_id?, cuts: number[]}> | null`
  — `cuts` 는 0부터 시작하는 컷 번호. 범위 밖·중복은 제거하고 오름차순으로 정렬한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cast.test.js` 의 `buildCastMessages` describe 를 **통째로 바꾼다**(첫 인자가 바뀌었다):

```js
describe("buildCastMessages", () => {
  const cuts = [
    { idx: 0, sentence: "손님이 코트를 들고 오셨습니다.", shows: "손님이 코트를 들고 문을 들어서는 미디엄 샷" },
    { idx: 1, sentence: "안감을 통째로 갈았습니다.", shows: "주인이 작업대에서 옷을 수선하는 클로즈업" },
    { idx: 2, sentence: "치수는 입은 채로 잽니다.", shows: "주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷" },
  ];

  it("컷별 화면을 번호와 함께 넘긴다 — 인물은 여기 이미 쓰여 있다", () => {
    const user = buildCastMessages(cuts, AVATARS).messages[0].content;
    expect(user).toContain("1. 손님이 코트를 들고 문을 들어서는 미디엄 샷");
    expect(user).toContain("3. 주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷");
  });

  it("화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돈다", () => {
    const user = buildCastMessages([{ idx: 0, sentence: "문장뿐인 컷." }], AVATARS).messages[0].content;
    expect(user).toContain("1. 문장뿐인 컷.");
  });

  it("아바타 목록을 id 와 설명으로 넘긴다", () => {
    const user = buildCastMessages(cuts, AVATARS).messages[0].content;
    expect(user).toContain(AVATARS[0].id);
    expect(user).toContain(AVATARS[0].traits);
  });

  it("아바타가 없으면 (없음) — 없는 것을 고르라고 하면 안 된다", () => {
    expect(buildCastMessages(cuts, []).messages[0].content).toContain("(없음)");
  });

  it("어느 컷에 나오는지 함께 답하라고 지시한다 — 같은 사람을 컷에 꽂는 것은 코드가 한다", () => {
    const { system } = buildCastMessages(cuts, AVATARS);
    expect(system).toContain("cuts");
    expect(system).toContain("컷 번호");
  });

  it("화면에 보이는 사람만 세라고 지시한다", () => {
    expect(buildCastMessages(cuts, AVATARS).system).toContain("화면에 보이는 사람");
  });
});
```

`tests/validate.test.js` 의 `validateCast` describe 를 **통째로 바꾼다**:

```js
// ⚠️ 모델은 컷을 **1부터** 센다(프롬프트가 "1. …" 로 매겨 준다). validateCast 가 0부터인
// 내부 인덱스로 바꾼다. 아래 입력은 1부터, 기대값은 0부터다 — 이 변환이 이 함수의 요점이다.
describe("validateCast", () => {
  const ids = ["av-child", "av-owner"];

  it("컷 번호를 1부터에서 0부터로 바꿔 받는다", () => {
    const got = validateCast({ cast: [
      { who: "50대 남성 주인", avatar_id: "av-owner", cuts: [2, 3] },
      { who: "40대 여성 손님", avatar_id: "av-child", cuts: [1, 3] },
    ] }, ids, 3);
    expect(got).toEqual([
      { id: "c1", who: "50대 남성 주인", avatar_id: "av-owner", cuts: [1, 2] },
      { id: "c2", who: "40대 여성 손님", avatar_id: "av-child", cuts: [0, 2] },
    ]);
  });

  it("범위 밖 컷 번호는 버린다 — 없는 컷을 가리키면 아무 데도 못 꽂는다", () => {
    // 컷 3개: 1·2·3 만 유효하다. 6 은 넘고, 0 은 1부터 세는 규약에서 없는 번호다
    const got = validateCast({ cast: [{ who: "주인", cuts: [1, 6, 0] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0]);
  });

  it("중복을 없애고 오름차순으로 정렬한다", () => {
    const got = validateCast({ cast: [{ who: "주인", cuts: [3, 1, 3] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0, 2]);
  });

  it("정수가 아닌 컷 번호는 버린다", () => {
    const got = validateCast({ cast: [{ who: "주인", cuts: [1, "2", 2.5, null] }] }, ids, 3);
    expect(got[0].cuts).toEqual([0]);
  });

  it("나오는 컷이 하나도 없는 인물은 버린다 — 꽂을 데가 없다", () => {
    const got = validateCast({ cast: [
      { who: "주인", cuts: [1] },
      { who: "유령", cuts: [9] },
    ] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "주인", cuts: [0] }]);
  });

  it("cuts 가 배열이 아니면 그 인물을 버린다", () => {
    expect(validateCast({ cast: [{ who: "주인", cuts: 1 }] }, ids, 3)).toEqual([]);
  });

  it("없는 아바타 id 는 조용히 제거한다", () => {
    const got = validateCast({ cast: [{ who: "손님", avatar_id: "av-없음", cuts: [1] }] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "손님", cuts: [0] }]);
  });

  it("who 가 없는 항목은 버린다", () => {
    const got = validateCast({ cast: [{ cuts: [1] }, { who: "아이", cuts: [2] }] }, ids, 3);
    expect(got).toEqual([{ id: "c1", who: "아이", cuts: [1] }]);
  });

  it("사람이 없는 영상은 빈 배열 — 실패가 아니다", () => {
    expect(validateCast({ cast: [] }, ids, 3)).toEqual([]);
  });

  it("모양이 틀리면 null — 호출측이 재시도를 판단한다", () => {
    expect(validateCast(null, ids, 3)).toBe(null);
    expect(validateCast({}, ids, 3)).toBe(null);
    expect(validateCast({ cast: "주인" }, ids, 3)).toBe(null);
  });

  it("인물이 너무 많으면 4명에서 자른다", () => {
    const many = { cast: Array.from({ length: 9 }, (_, i) => ({ who: `사람${i}`, cuts: [1] })) };
    expect(validateCast(many, ids, 3)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js tests/validate.test.js`
Expected: FAIL — `buildCastMessages` 가 컷을 안 받고, `validateCast` 에 `cuts` 처리가 없다

- [ ] **Step 3: `CAST_SYSTEM` 과 `buildCastMessages` 를 바꾼다**

`lib/cast.js` 의 `CAST_SYSTEM` 위 주석과 프롬프트, `buildCastMessages` 를 아래로 교체한다:

```js
// 캐스팅 — 컷별 화면 설명을 읽고 거기 나오는 사람을 뽑는다.
//
// 원고에서 뽑던 것을 화면으로 옮겼다. 원고에서 뽑으면 "누가 화면에 보일지"를 상상해야 하는데,
// 실측에서 그 상상이 두 번 다 빗나갔다(2026-07-28, 가짜 모드 8편):
//   - "스치는 사람은 빼라" → 손님을 3/3 누락, 주인만 뽑았다
//   - "다시 나오는 사람만" → 손님은 뽑았으나 주인이 빠졌다. cast 가 늘 1명으로 수렴했다
// shows 에는 "주인이 손님에게 옷을 입히고" 처럼 이미 답이 적혀 있다. 상상할 것이 없다.
//
// 인물이 자기 컷 번호를 함께 답하는 것이 요점이다 — "같은 사람에게 같은 id"가 프롬프트
// 약속에서 코드 보장으로 바뀐다. 컷에 꽂는 것은 mergeCastIntoCuts 가 한다.
const CAST_SYSTEM = `너는 숏폼 영상의 캐스팅을 정한다. 컷별 화면 설명을 읽고 화면에 보이는 사람을 뽑는다.
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)","cuts":[이 인물이 보이는 컷 번호들]}]}
규칙:
- 화면 설명에 사람으로 적힌 사람을 빠짐없이 센다. 한 화면에 둘이 적혀 있으면 둘 다 넣는다.
  ✗ "주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷" 인데 주인만 넣는 것
  ✓ 주인과 손님을 각각 한 명씩 넣는다
- 같은 사람을 화면마다 다르게 불러도 한 인물로 묶는다. "손님"·"코트를 든 남성"·"그분"이 같은 장면 흐름이면 한 명이다.
- cuts 는 그 인물이 보이는 컷 번호를 전부 적는다. 번호는 아래 목록에 적힌 그대로다.
- 손·발만 나오는 화면도 그 사람이 보이는 것으로 센다.
- 화면 설명에 없는 사람은 넣지 않는다 — 이야기에만 나오고 화면에 안 보이는 사람, 전화 통화 상대.
- who 는 나이대·성별이 드러나게 적는다. 그 값으로 사진을 고르기 때문이다.
  ✗ "손님" / "그 사람"
  ✓ "50대 남성 가게 주인" / "10세 전후 남자아이"
- avatar_id 는 준비된 목록에서만 고른다. 맞는 것이 없으면 적지 않는다 — 억지로 고르면 엉뚱한 얼굴이 나온다.
- 사람이 보이지 않는 영상이면 cast 를 빈 배열로 둔다.`;

export function buildCastMessages(cuts, avatars) {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  // 화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돌아야 한다
  const shots = (cuts || [])
    .map((c, i) => `${i + 1}. ${c.shows || c.sentence || ""}`)
    .join("\n");
  const user = `[컷별 화면 — 번호가 곧 컷 번호다]
${shots}

[준비된 인물 사진]
${list}`;
  return { system: CAST_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

> 프롬프트의 컷 번호는 **1부터**이고 `validateCast` 가 받는 `cuts` 도 1부터다. 0부터인 내부
> 인덱스로 바꾸는 것은 `validateCast` 가 한다 — 모델에게 0부터 세게 하면 틀린다.

- [ ] **Step 4: `validateCast` 를 바꾼다**

`lib/validate.js` 의 `validateCast` 를 아래로 교체한다:

```js
// 캐스팅 방어 — 인물, 아바타 선택, 그리고 그 인물이 나오는 컷 번호를 검사한다.
//
// 모델은 컷을 1부터 센다(0부터 세게 하면 틀린다). 여기서 0부터인 내부 인덱스로 바꾼다.
// 나오는 컷이 하나도 안 남은 인물은 버린다 — 꽂을 데가 없는 인물은 아무 일도 하지 않는다.
const CAST_MAX = 4;

export function validateCast(obj, avatarIds = [], cutCount = 0) {
  if (!obj || !Array.isArray(obj.cast)) return null;
  const out = [];
  for (const c of obj.cast) {
    const who = typeof c?.who === "string" ? c.who.trim() : "";
    if (!who) continue; // 누구인지 모르는 항목은 쓸 데가 없다
    if (!Array.isArray(c?.cuts)) continue;
    const cuts = [...new Set(
      c.cuts
        .filter((n) => Number.isInteger(n))
        .map((n) => n - 1) // 1부터 → 0부터
        .filter((n) => n >= 0 && n < cutCount)
    )].sort((a, b) => a - b);
    if (!cuts.length) continue; // 꽂을 컷이 없다
    const person = { id: `c${out.length + 1}`, who };
    // 없는 아바타는 조용히 제거 — 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다
    if (c.avatar_id && avatarIds.includes(c.avatar_id)) person.avatar_id = c.avatar_id;
    person.cuts = cuts;
    out.push(person);
    if (out.length >= CAST_MAX) break; // 30초 영상에 다섯 명 이상은 담기지 않는다
  }
  return out;
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/cast.test.js tests/validate.test.js`
Expected: PASS

- [ ] **Step 6: 무엇이 깨졌는지 본다**

Run: `npx vitest run`
Expected: `tests/pipeline.test.js` 에서 실패가 날 수 있다(`buildCastMessages` 호출부가 옛 서명).
**여기서 고치지 않는다** — Task 3이 그 자리를 고친다. 실패 목록을 적어둔다.

- [ ] **Step 7: 커밋**

```bash
git add lib/cast.js lib/validate.js tests/cast.test.js tests/validate.test.js
git commit -m "refactor: 캐스팅을 원고가 아니라 화면에서 읽는다

원고에서 뽑으면 누가 화면에 보일지를 상상해야 한다. 실측에서 두 번 다 빗나갔다 —
스치는 사람을 빼라니 손님을 3/3 놓쳤고, 다시 나오는 사람만 넣으라니 이번엔 주인이
빠져 캐스팅이 늘 1명으로 수렴했다.

shows 에는 '주인이 손님에게 옷을 입히고' 처럼 이미 답이 적혀 있다. 인물이 자기 컷
번호를 함께 답하게 해서, '같은 사람에게 같은 id'를 프롬프트 약속이 아니라 코드가
보장하게 한다."
```

---

## Task 2: 화면 설계를 사진 전용으로 되돌린다

캐스팅이 뒤로 갔으므로 화면 설계 시점에는 고를 인물 목록이 없다. `[출연]` 블록과 인물 규칙을
걷어낸다.

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM` 의 ref 규칙, `buildShowsMessages`)
- Modify: `lib/validate.js` (`validateShows` 의 인자 이름과 주석)
- Test: `tests/cuts.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `buildShowsMessages(project, cuts)` — `[출연]` 블록이 사라진다. 서명은 그대로
- Produces: `validateShows(obj, cutCount, photoIds)` — 세 번째 인자가 다시 사진 id 만.
  동작은 그대로(모르는 id 제거, 2개 상한)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에서 캐스팅 관련 테스트 두 개
("캐스팅을 프롬프트에 넣는다", "캐스팅이 없으면 (없음)")를 **아래 하나로 바꾼다**:

```js
  it("출연 목록을 넣지 않는다 — 캐스팅은 이 패스 뒤에 돈다", () => {
    const withCast = { ...project, cast: [{ id: "c1", who: "50대 남성 가게 주인", cuts: [0] }] };
    const { messages, system } = buildShowsMessages(withCast, [{ sentence: "한 문장." }]);
    expect(messages[0].content).not.toContain("[출연]");
    expect(messages[0].content).not.toContain("50대 남성 가게 주인");
    // 화면 설계가 고를 수 있는 것은 사진뿐이다
    expect(system).toContain("올린 사진");
  });
```

`tests/validate.test.js` 의 `validateShows` ref 테스트에서 인물 id 를 쓰는 것이 있으면 사진
id 로 바꾼다. 동작(모르는 id 제거·2개 상한)을 검사하는 테스트는 그대로 둔다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — `[출연]` 블록이 아직 있다

- [ ] **Step 3: `SHOWS_SYSTEM` 의 ref 규칙을 되돌린다**

`lib/cuts.js` 에서 Task 5가 넣은 규칙 줄을 아래로 바꾼다:

```
- ref_ids 는 이 컷 화면에 실제로 보이는 물건·공간이 [올린 사진] 에 있을 때만 그 id 를 적는다. 많아도 2개까지다.
  사람은 적지 않는다 — 인물은 이 패스 뒤에 따로 정한다.
```

JSON 스키마 줄의 `ref_ids` 설명도 바꾼다:

```
"ref_ids":["이 컷에 보이는 올린 사진의 id (없으면 빈 배열, 최대 2개)"]
```

- [ ] **Step 4: `buildShowsMessages` 에서 `[출연]` 을 걷어낸다**

```js
export function buildShowsMessages(project, cuts) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  const list = cuts.map((c, i) => `${i + 1}. ${c.sentence}`).join("\n");
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}

[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 5: `validateShows` 의 인자 이름을 되돌린다**

`lib/validate.js` 에서 `refIds` 를 `photoIds` 로 되돌리고 주석을 바꾼다. **동작은 바꾸지
않는다** — 모르는 id 제거와 2개 상한은 그대로다:

```js
// photoIds — 실제로 첨부될 수 있는 사진 id.
// 인물은 여기 오지 않는다. 캐스팅이 이 패스 뒤에 돌고, 컷에 꽂는 것은 mergeCastIntoCuts 다.
// 상한 2: 한 컷에 사진 셋을 붙이면 모델이 무엇을 따를지 헷갈린다.
const SHOT_REF_MAX = 2;

export function validateShows(obj, cutCount, photoIds = []) {
```

본문의 `refIds.includes(id)` 를 `photoIds.includes(id)` 로 바꾼다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/validate.test.js`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/validate.js tests/cuts.test.js tests/validate.test.js
git commit -m "refactor: 화면 설계는 사진만 고른다 — 인물은 그 뒤에 정한다

캐스팅이 화면 설계 뒤로 갔으므로, 이 패스 시점에는 고를 인물 목록이 없다.
출연 블록과 인물 규칙을 걷어내고 사진만 고르던 자리로 되돌린다."
```

---

## Task 3: 파이프라인 순서를 바꾸고 컷에 꽂는다

**Files:**
- Modify: `lib/cast.js` (`mergeCastIntoCuts` 추가, `resolveCutRefs` 상한 규칙)
- Modify: `lib/pipeline.js` (`splitCuts` 순서)
- Test: `tests/cast.test.js`, `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `buildCastMessages(cuts, avatars)`, `validateCast(obj, avatarIds, cutCount)` (Task 1)
- Produces: `mergeCastIntoCuts(cuts, cast): Array<Cut>` — **순수 함수.** 인물의 `cuts` 번호를
  읽어 각 컷의 `ref_ids` 뒤에 인물 id 를 더한다. 원본을 바꾸지 않는다
- Produces: `resolveCutRefs` 가 **인물 1 + 사물 1** 로 상한을 나눠 쓴다 (아래 이유 참고)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cast.test.js` 끝에 더한다:

```js
import { mergeCastIntoCuts } from "../lib/cast.js";

describe("mergeCastIntoCuts — 인물을 컷에 꽂는다", () => {
  const cuts = [
    { idx: 0, ref_ids: ["p1"] },
    { idx: 1 },
    { idx: 2, ref_ids: ["p2"] },
  ];
  const cast = [
    { id: "c1", who: "주인", cuts: [1, 2] },
    { id: "c2", who: "손님", cuts: [0, 2] },
  ];

  it("인물이 적힌 컷에만 그 id 를 더한다", () => {
    const got = mergeCastIntoCuts(cuts, cast);
    expect(got[0].ref_ids).toEqual(["p1", "c2"]);
    expect(got[1].ref_ids).toEqual(["c1"]);
    expect(got[2].ref_ids).toEqual(["p2", "c1", "c2"]);
  });

  it("사진 id 를 지우지 않는다 — 사장님이 올린 것이 먼저다", () => {
    expect(mergeCastIntoCuts(cuts, cast)[0].ref_ids[0]).toBe("p1");
  });

  it("원본을 바꾸지 않는다", () => {
    mergeCastIntoCuts(cuts, cast);
    expect(cuts[1].ref_ids).toBeUndefined();
  });

  it("캐스팅이 비면 컷이 그대로다", () => {
    expect(mergeCastIntoCuts(cuts, [])).toEqual(cuts);
    expect(mergeCastIntoCuts(cuts, null)).toEqual(cuts);
  });

  it("같은 인물이 두 번 적혀도 한 번만 꽂는다", () => {
    const got = mergeCastIntoCuts([{ idx: 0 }], [{ id: "c1", who: "주인", cuts: [0, 0] }]);
    expect(got[0].ref_ids).toEqual(["c1"]);
  });
});

describe("resolveCutRefs — 인물 하나 + 사물 하나", () => {
  const project = {
    cast: [
      { id: "c1", who: "주인", ref: { from: "avatar", id: "av-owner" } },
      { id: "c2", who: "손님", ref: { from: "avatar", id: "av-adult" } },
    ],
    material: { photos: [{ id: "p1" }, { id: "p2" }] },
  };

  it("사진 둘이 있어도 인물 자리를 남긴다 — 안 그러면 인물 일관성이 통째로 죽는다", () => {
    const got = resolveCutRefs({ ref_ids: ["p1", "p2", "c1"] }, project);
    expect(got).toHaveLength(2);
    expect(got.filter((r) => r.kind === "person")).toHaveLength(1);
    expect(got.filter((r) => r.kind === "thing")).toHaveLength(1);
    expect(got[0].id).toBe("p1"); // 사진이 먼저다
  });

  it("인물 둘이면 첫 인물만 쓴다", () => {
    const got = resolveCutRefs({ ref_ids: ["c1", "c2"] }, project);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("av-owner");
  });

  it("사진만 있으면 두 장까지 쓴다", () => {
    expect(resolveCutRefs({ ref_ids: ["p1", "p2"] }, project)).toHaveLength(2);
  });

  it("같은 레퍼런스를 두 번 싣지 않는다", () => {
    const got = resolveCutRefs({ ref_ids: ["p1", "p1"] }, project);
    expect(got).toHaveLength(1);
  });
});
```

> 마지막 테스트는 앞선 계획에서 미뤄 둔 중복 문제다. 인물과 사물을 갈라 세면서 같은 자리를
> 손보므로 함께 고친다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js`
Expected: FAIL — `mergeCastIntoCuts is not a function`, 인물/사물 분리 안 됨

- [ ] **Step 3: `mergeCastIntoCuts` 를 더한다**

`lib/cast.js` 의 `resolveCastRefs` 아래에 더한다:

```js
// 인물을 컷에 꽂는다 — 캐스팅이 답한 컷 번호를 그대로 쓴다.
//
// 이 함수가 있어서 "같은 사람에게 같은 id"가 코드 보장이 된다. 예전에는 화면 설계가 컷마다
// 같은 id 를 적어 주기를 바라야 했고, 그 약속이 깨지면 인물 일관성이 조용히 사라졌다.
export function mergeCastIntoCuts(cuts, cast) {
  const byCut = new Map();
  for (const person of cast || []) {
    for (const idx of person.cuts || []) {
      if (!byCut.has(idx)) byCut.set(idx, []);
      const list = byCut.get(idx);
      if (!list.includes(person.id)) list.push(person.id); // 같은 인물을 두 번 꽂지 않는다
    }
  }
  return (cuts || []).map((c, i) => {
    const people = byCut.get(i);
    if (!people?.length) return c;
    // 사진 id 를 앞에 둔다 — 사장님이 올린 것이 먼저다
    return { ...c, ref_ids: [...(c.ref_ids || []), ...people] };
  });
}
```

- [ ] **Step 4: `resolveCutRefs` 를 인물 1 + 사물 1 로 바꾼다**

`lib/cast.js` 의 `resolveCutRefs` 를 아래로 교체한다:

```js
// 컷이 고른 id 들을 실제로 쓸 레퍼런스로 푼다.
// 경로는 여기서 만들지 않는다 — fs 를 아는 자리(파이프라인)가 맡는다. 여기는 순수하다.
//
// 상한은 2장인데 **인물 하나 + 사물 하나**로 나눠 쓴다. 그냥 앞에서 두 장을 자르면,
// 사진 두 장이 붙은 컷에서 인물이 통째로 밀려 인물 일관성이 조용히 죽는다.
// 한 종류만 있으면 그 종류로 두 장까지 쓴다.
const REF_MAX = 2;

export function resolveCutRefs(cut, project) {
  const ids = Array.isArray(cut?.ref_ids)
    ? cut.ref_ids
    : cut?.ref_photo_id ? [cut.ref_photo_id] : []; // 옛 프로젝트 폴백
  const cast = project?.cast || [];
  const photoIds = (project?.material?.photos || []).map((p) => p.id);

  const things = [];
  const people = [];
  const seen = new Set();
  for (const id of ids) {
    if (photoIds.includes(id)) {
      if (seen.has(`photo:${id}`)) continue;
      seen.add(`photo:${id}`);
      things.push({ from: "photo", id, kind: "thing" });
      continue;
    }
    const person = cast.find((c) => c.id === id);
    if (!person?.ref) continue; // 레퍼런스가 없는 인물은 건너뛴다
    const key = `${person.ref.from}:${person.ref.id}`;
    if (seen.has(key)) continue; // 같은 파일을 두 번 싣지 않는다
    seen.add(key);
    people.push({ ...person.ref, kind: "person" });
  }

  if (things.length && people.length) return [things[0], people[0]];
  return [...things, ...people].slice(0, REF_MAX);
}
```

- [ ] **Step 5: `splitCuts` 순서를 바꾼다**

`lib/pipeline.js` 의 `defaultDeps.splitCuts` 에서, 컷을 얻은 뒤(`if (!cuts) {...}` 다음)부터
`return` 까지를 아래로 교체한다:

```js
    // 사진 판정 — 올린 사진에 사람이 담겼는지 본다. 아직 안 본 사진만.
    const photos = [];
    for (const p of project.material?.photos || []) {
      const photoPath = uploadsPath(p.url);
      // 볼 파일이 없으면 판정하지 않는다 — 못 보고 내리는 판정에 값을 치를 이유가 없다
      if (p.vision || !photoPath) { photos.push(p); continue; }
      const vision = await describePhoto({ photoPath, projectId: project.id });
      photos.push({ ...p, vision });
    }

    // 화면 설계 — 컷마다 무엇을 보여줄지. 사람은 여기서 고르지 않는다.
    const photoIds = photos.map((p) => p.id);
    const shots = buildShowsMessages({ ...project, material: { ...project.material, photos } }, cuts);
    let designed = null;
    for (let i = 0; i < 2 && !designed; i++) {
      designed = validateShows(
        await callJson({ system: shots.system, messages: shots.messages, stage: "화면 설계", projectId: project.id }),
        cuts.length,
        photoIds
      );
    }
    // 화면 설계가 실패해도 컷은 남는다 — 캐스팅은 문장으로라도 돈다
    const withShows = designed ? cuts.map((c, i) => ({ ...c, ...designed[i] })) : cuts;

    // 캐스팅 — 화면을 읽고 인물과 그 인물이 나오는 컷을 받는다.
    // 화면 설계 뒤에 도는 것이 요점이다: shows 에 "주인이 손님에게" 처럼 답이 적혀 있다.
    const avatars = await availableAvatars();
    const cast = await (async () => {
      const msgs = buildCastMessages(withShows, avatars);
      for (let i = 0; i < 2; i++) {
        const got = validateCast(
          await callJson({ system: msgs.system, messages: msgs.messages, stage: "캐스팅", projectId: project.id }),
          avatars.map((a) => a.id),
          withShows.length
        );
        if (got) return got;
      }
      return [];
    })().catch(() => []);

    const castWithRefs = resolveCastRefs(cast, photos, avatars.map((a) => a.id));
    await updateProject(project.id, (proj) => ({
      ...proj,
      cast: castWithRefs,
      material: { ...proj.material, photos },
    }));

    // 인물을 컷에 꽂는다 — 코드가 한다
    return mergeCastIntoCuts(withShows, castWithRefs);
```

`lib/pipeline.js` 상단 import 에 `mergeCastIntoCuts` 를 더한다.

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS. Task 1 Step 6에서 적어둔 실패가 사라졌는지 대조한다.
`tests/pipeline.test.js` 의 `defaultDeps.splitCuts` 테스트가 옛 순서를 기대하면 새 순서로 고친다

- [ ] **Step 7: 커밋**

```bash
git add lib/cast.js lib/pipeline.js tests/cast.test.js tests/pipeline.test.js
git commit -m "feat: 화면 설계 뒤에 캐스팅하고, 인물을 코드가 컷에 꽂는다

순서가 분할 → 사진 판정 → 화면 설계 → 캐스팅 → 병합이 됐다. 캐스팅이 shows 를
읽으므로 누가 보일지 상상하지 않는다.

레퍼런스 상한도 갈랐다. 그냥 앞에서 두 장을 자르면 사진 두 장이 붙은 컷에서 인물이
통째로 밀려 인물 일관성이 조용히 죽는다. 인물 하나 + 사물 하나로 나눠 쓰고, 한
종류만 있으면 그 종류로 두 장까지 쓴다. 같은 파일을 두 번 싣던 것도 함께 막았다."
```

---

## Task 4: 가짜 모드로 다시 잰다 (유료 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

fal 을 부르지 않는다. OpenAI 만 편당 4~5센트.

- [ ] **Step 1: 아바타를 둔 채로 돌린다**

```bash
SHOTFORM_FAKE=1 SHOTFORM_AVATARS_DIR=<자리표시자 3장이 있는 폴더> npm run dev
node scripts/measure/run-pipeline.mjs tailor 1 30 --cuts
node scripts/measure/run-pipeline.mjs rich 1 30 --cuts
node scripts/measure/run-pipeline.mjs workshop 1 30 --cuts
```

- [ ] **Step 2: 되는가 안 되는가를 본다**

비율이 아니라 **작동 여부**를 잰다. 표본이 사연 위주여도 답이 나오는 항목만 고른다:

- [ ] **주인과 손님이 함께 나오는 편에서 둘 다 뽑혔는가** — 이 계획의 이유다.
      직전 측정에서는 늘 1명이었다
- [ ] 인물의 `cuts` 번호가 실제 화면과 맞는가 — `shows` 에 그 사람이 적힌 컷과 대조한다
- [ ] **같은 사람이 두 인물로 쪼개지지 않았는가** — "손님"과 "코트를 든 남성"이 따로 잡히면
      묶기 규칙이 안 먹은 것이다
- [ ] 사람이 안 보이는 컷에 인물 id 가 안 붙었는가
- [ ] 아바타 선택이 인물과 맞는가
- [ ] 아바타 폴더를 비우고 한 번 더 돌려, `cast` 는 남고 `ref` 만 없는지 (지금 동작 유지)

- [ ] **Step 3: 어긋난 것을 고친다**

프롬프트를 또 조이기 전에 **무엇이 어긋났는지 한 줄로 적을 수 있는지** 본다. 적을 수 없으면
조이지 말고 사장님에게 가져간다 — 오늘 프롬프트 왕복이 두 번 다 다른 형태로 옮겨갔다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "fix: 화면 기반 캐스팅 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]"
```

---

## Task 5: 실제 이미지로 확인한다 — **사장님 검토 게이트**

> ⚠️ **사장님 승인 없이 시작하지 않는다.** 실제 fal 이미지 생성이 나간다.

앞선 계획의 Task 8을 그대로 잇는다. **예상 비용 약 $0.32**(4컷 × 후보 2장 × $0.04).
클립·합성까지 가지 않는다 — 인물 일관성은 이미지 단계에서 판정된다.

- [ ] **Step 1: 승인을 받는다**

무엇을 확인하려는지, 예상 비용, 아바타 파일이 준비됐는지 알리고 **답을 받고 시작한다.**

- [ ] **Step 2: 환경을 맞춘다**

```
SHOTFORM_FAKE=off
SHOTFORM_FAKE_IMAGES=       # 비운다
SHOTFORM_BUDGET_PROJECT_USD=5
```

`assets/refs/` 에 사장님이 준비한 인물 사진이 있어야 한다.

- [ ] **Step 3: 사람이 여러 컷에 나오는 자료로 한 편을 만든다**

이미지까지만 만든다(⑤영상은 누르지 않는다).

- [ ] **Step 4: 미검증 가정을 확인한다**

- [ ] **아바타 한 장으로 컷 사이 인물이 실제로 같아지는가.** 이 기능의 값어치를 전부 정한다
- [ ] **두 사람이 각각 일관되는가** — 이 계획이 푼 문제가 그림에서도 풀렸는가
- [ ] **`image_urls` 두 장이 둘 다 반영되는가**(인물 + 사물이 함께 붙은 컷에서)
- [ ] VLM 사진 판정이 쓸 만한가 — 인물 사진을 올려 `person: true` 가 나오는지
- [ ] `data/costs.json` 의 엔드포인트가 `nano-banana/edit` 로 기록되는지

- [ ] **Step 5: 알아낸 것을 적는다**

설계 문서의 **§검증하지 못한 가정** 과 `docs/models-and-costs.md` §4를 갱신한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "fix: 실제 이미지로 인물 일관성을 확인하고 어긋난 곳을 고친다

[무엇을 확인했는지]"
```

---

## 다음

2단계(출연 블록 — 대본 화면에서 캐스팅을 확인·수정)는 Task 4·5의 관측으로 모양을 정한다.
