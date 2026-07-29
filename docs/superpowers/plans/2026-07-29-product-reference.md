# 사물 레퍼런스를 코드가 꽂는다 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제품이 컷마다 같은 물건으로 나온다 — 사진 고르는 책임을 화면 설계에서 캐스팅으로 옮기고, 코드가 컷에 꽂는다.

**Architecture:** 캐스팅 패스가 인물과 **함께** 사물을 답한다(`props`: 사진별 "보이는 컷 번호"). 코드가 그것을 컷의 `ref_ids` **앞에** 꽂는다 — `resolveCutRefs`가 "사물 하나 + 인물 하나"로 자리를 나누므로 앞이어야 제품이 밀리지 않는다. 화면 설계는 마지막에 `ref_ids` 책임을 내려놓는다.

**Tech Stack:** Next.js 15 App Router, OpenAI(gpt-4o), vitest

설계 문서: `docs/superpowers/specs/2026-07-29-product-reference-design.md` (커밋 `3caf011`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD`로 브랜치도 확인한다
- 기존 테스트 **459개 그린이 하한선**
- **fal(유료 이미지·영상)을 부르지 않는다.** Task 4의 측정은 OpenAI만 쓰며 몇 센트다
- **코드가 문자열 매칭으로 사물을 찾지 않는다**(`lib/refs.js`가 못박은 규칙). 무엇이 어느 컷에 보이는지는 **원고를 읽은 LLM이** 답하고 코드는 꽂기만 한다
- 사물 사진이 없으면 프롬프트에 **그 블록을 아예 넣지 않는다** — "칸이 있으면 모델은 채운다"(2026-07-29 실측)
- 실패해도 **컷은 남는다** — 레퍼런스 없이 가면 지금 동작이다
- Korean 문구는 사장님이 읽는 말로. 커밋 메시지는 한국어, 기존 이력의 어조

## 순서를 이렇게 잡은 이유

**더하는 것을 먼저, 떼는 것을 마지막에** 둔다. 화면 설계에서 `ref_ids`를 먼저 떼면 그 사이
`tests/pipeline.test.js`의 단언(`cuts[0].ref_ids === ["p1"]`)이 깨졌다가 Task 3에서 되살아나는
헛품이 생긴다. 이 순서면 각 태스크가 끝날 때마다 초록이고 테스트를 한 번만 고친다.

Task 2가 끝난 시점에는 `ref_ids`가 **두 곳에서** 온다(화면 설계 + 사물). 중복은
`mergePropsIntoCuts`가 거른다. Task 3에서 화면 설계 쪽이 사라진다.

---

## File Structure

**수정**
- `lib/cast.js` — `CAST_SYSTEM`에 `props`, `buildCastMessages`에 사물 블록, `mergePropsIntoCuts` 신설 (Task 1)
- `lib/validate.js` — `validateProps` 신설 (Task 1) · `validateShows`에서 `ref_ids` 제거 (Task 3)
- `lib/pipeline.js` — 사물 사진 전달·0개 재시도·꽂기·로그 (Task 2) · `validateShows` 호출 (Task 3)
- `lib/cuts.js` — `SHOWS_SYSTEM`에서 `ref_ids` 제거, 사람+물건 본보기 추가 (Task 3)
- `tests/cast.test.js` · `tests/validate.test.js` · `tests/pipeline.test.js` · `tests/cuts.test.js`

**건드리지 않음**
- `lib/cast.js`의 `resolveCutRefs` — 사물 자리(`things[0]` + `people[0]`)가 이미 있다
- `lib/imagegen.js` · `lib/vlm.js` · `lib/refs.js`

---

## Task 1: 캐스팅이 사물도 답하고, 코드가 꽂을 수 있게 한다

순수 함수만 만든다. 파이프라인은 아직 부르지 않으므로 **동작은 하나도 바뀌지 않는다.**

**Files:**
- Modify: `lib/cast.js` (`CAST_SYSTEM`, `buildCastMessages`, `mergePropsIntoCuts` 신설)
- Modify: `lib/validate.js` (`validateProps` 신설)
- Test: `tests/cast.test.js`, `tests/validate.test.js`

**Interfaces:**
- Produces: `buildCastMessages(cuts, avatars, lead = "", props = [])` — **네 번째 인자가 생긴다.**
  `props`는 `[{ id, what }]` (사물 사진). 빈 배열이면 블록을 넣지 않는다
- Produces: `validateProps(obj, photoIds, cutCount) -> [{ photo_id, cuts }]` — `cuts`는 **0부터**인
  내부 인덱스. 모르는 `photo_id`·범위 밖 번호는 버린다. 남은 것이 없으면 `[]`
- Produces: `mergePropsIntoCuts(cuts, props) -> cuts` — 사진 id를 `ref_ids` **맨 앞**에 꽂는다

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `validateProps`**

`tests/validate.test.js` 맨 위 import 에 `validateProps` 를 더한다(기존 이름은 그대로 두고 새 이름만 추가). 그다음 `validateCast` describe **아래**에 더한다:

```js
describe("validateProps — 사물이 보이는 컷", () => {
  it("사진과 컷 번호를 받는다 — 1부터 세는 번호를 0부터로 바꾼다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [1, 3] }] }, ["p1"], 4);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0, 2] }]);
  });

  it("모르는 사진은 버린다 — 첨부되지 않을 것을 가리키면 그림을 망친다", () => {
    expect(validateProps({ props: [{ photo_id: "없음", cuts: [1] }] }, ["p1"], 4)).toEqual([]);
  });

  it("범위 밖 컷 번호는 버리고 나머지는 살린다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [1, 9, 0, -2] }] }, ["p1"], 3);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0] }]);
  });

  it("보이는 컷이 하나도 없으면 그 사진은 뺀다 — 꽂을 데가 없다", () => {
    expect(validateProps({ props: [{ photo_id: "p1", cuts: [] }] }, ["p1"], 3)).toEqual([]);
  });

  it("같은 컷을 두 번 적어도 한 번만 남고 정렬된다", () => {
    const got = validateProps({ props: [{ photo_id: "p1", cuts: [3, 1, 3] }] }, ["p1"], 4);
    expect(got).toEqual([{ photo_id: "p1", cuts: [0, 2] }]);
  });

  it("props 가 없거나 깨져 있으면 빈 배열 — cast 는 따로 산다", () => {
    expect(validateProps({}, ["p1"], 3)).toEqual([]);
    expect(validateProps({ props: "이상함" }, ["p1"], 3)).toEqual([]);
    expect(validateProps(null, ["p1"], 3)).toEqual([]);
  });

  it("사물 사진 목록이 비면 아무것도 통과하지 않는다", () => {
    expect(validateProps({ props: [{ photo_id: "p1", cuts: [1] }] }, [], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `validateProps is not a function`

- [ ] **Step 3: `lib/validate.js` 에 `validateProps` 를 더한다**

`validateCast` 함수 **바로 아래**에 붙인다:

```js
// 사물 방어 — 어느 사진이 어느 컷에 보이는지. 인물(validateCast)과 같은 응답에서 읽는다.
//
// 코드가 낱말로 사물을 찾지 않는다(lib/refs.js 규칙). "앰플"·"병"·"제품"을 코드로 맞추려면
// 낱말 목록이 필요하고, 그 목록은 표현이 조금만 달라져도 못 고른다. 고르는 것은 화면 설명을
// 읽은 LLM 이 하고, 여기서는 그 답이 실제로 쓸 수 있는 값인지만 본다.
//
// 모델은 컷을 1부터 센다. 여기서 0부터인 내부 인덱스로 바꾼다(validateCast 와 같다).
export function validateProps(obj, photoIds = [], cutCount = 0) {
  if (!obj || !Array.isArray(obj.props)) return [];
  const out = [];
  for (const p of obj.props) {
    const id = typeof p?.photo_id === "string" ? p.photo_id.trim() : "";
    // 없는 사진은 조용히 제거 — 첨부되지 않을 것을 가리키는 지시는 그림을 망친다
    if (!photoIds.includes(id)) continue;
    if (!Array.isArray(p?.cuts)) continue;
    const cuts = [...new Set(
      p.cuts
        .filter((n) => Number.isInteger(n))
        .map((n) => n - 1) // 1부터 → 0부터
        .filter((n) => n >= 0 && n < cutCount)
    )].sort((a, b) => a - b);
    if (!cuts.length) continue; // 꽂을 컷이 없다
    out.push({ photo_id: id, cuts });
  }
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS

- [ ] **Step 5: 실패하는 테스트를 쓴다 — 프롬프트와 꽂기**

`tests/cast.test.js` 맨 위 import 에 `mergePropsIntoCuts` 를 더한다. 그다음 파일 끝에 더한다:

```js
describe("buildCastMessages — 사물도 함께 묻는다", () => {
  const cuts = [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손 미디엄 샷" }];

  it("사물 사진을 목록으로 준다", () => {
    const user = buildCastMessages(cuts, [], "", [{ id: "p1", what: "화장품 병" }]).messages[0].content;
    expect(user).toContain("[올린 사진 — 사물]");
    expect(user).toContain("id:p1 화장품 병");
  });

  it("사물 사진이 없으면 그 블록을 아예 넣지 않는다 — 칸이 있으면 모델이 채운다", () => {
    const user = buildCastMessages(cuts, [], "").messages[0].content;
    expect(user).not.toContain("[올린 사진 — 사물]");
  });

  it("사물이 보이는 컷을 빠짐없이 적으라고 지시한다", () => {
    expect(buildCastMessages(cuts, [], "", [{ id: "p1", what: "화장품 병" }]).system).toContain("props");
  });
});

describe("mergePropsIntoCuts — 사물을 컷에 꽂는다", () => {
  const cuts = [{ idx: 0 }, { idx: 1 }, { idx: 2 }];

  it("사진을 자기 컷에 꽂는다", () => {
    const got = mergePropsIntoCuts(cuts, [{ photo_id: "p1", cuts: [0, 2] }]);
    expect(got[0].ref_ids).toEqual(["p1"]);
    expect(got[1].ref_ids).toBeUndefined();
    expect(got[2].ref_ids).toEqual(["p1"]);
  });

  it("사물이 인물보다 앞에 온다 — resolveCutRefs 가 사물 한 자리·인물 한 자리로 나눈다", () => {
    const withPeople = [{ idx: 0, ref_ids: ["c1"] }];
    expect(mergePropsIntoCuts(withPeople, [{ photo_id: "p1", cuts: [0] }])[0].ref_ids)
      .toEqual(["p1", "c1"]);
  });

  it("이미 있는 사진을 두 번 넣지 않는다", () => {
    const already = [{ idx: 0, ref_ids: ["p1", "c1"] }];
    expect(mergePropsIntoCuts(already, [{ photo_id: "p1", cuts: [0] }])[0].ref_ids)
      .toEqual(["p1", "c1"]);
  });

  it("사물이 없으면 컷을 그대로 둔다", () => {
    expect(mergePropsIntoCuts(cuts, [])).toEqual(cuts);
    expect(mergePropsIntoCuts(cuts, null)).toEqual(cuts);
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js`
Expected: FAIL — `mergePropsIntoCuts is not a function`, 사물 블록 없음

- [ ] **Step 7: `lib/cast.js` 의 `CAST_SYSTEM` 을 고친다**

JSON 스키마 줄(`반드시 JSON 하나만 출력:`)을 통째로 바꾼다:

```
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)","cuts":[이 인물이 보이는 컷 번호들]}],"props":[{"photo_id":"올린 사진의 id","cuts":[그 사진에 찍힌 것이 보이는 컷 번호들]}]}
```

규칙 목록 **맨 끝**에 더한다:

```
- props 는 [올린 사진 — 사물] 이 주어졌을 때만 적는다. 그 블록이 없으면 props 를 빈 배열로 둔다.
- props 의 cuts 는 그 사진에 찍힌 것이 화면에 보이는 컷 번호를 전부 적는다. 하나도 빠뜨리지 않는다 — 적지 않은 컷은 그 물건이 레퍼런스 없이 그려져 다른 물건으로 나온다.
- 화면 설명이 그것을 다른 이름으로 불러도 같은 것으로 묶는다. "앰플"·"병"·"제품"·"세럼"이 같은 물건이면 하나다.
- 손에 들고 있거나 일부만 보이는 화면도 보이는 것으로 센다.
- 어느 컷에도 안 보이면 그 사진의 cuts 를 빈 배열로 둔다.
```

- [ ] **Step 8: `buildCastMessages` 에 사물 블록을 더한다**

```js
// lead — 이 영상이 따라가는 사람. **갈래가 '사람'일 때만 넘어온다**(lib/pipeline.js).
// 물건·정보 영상에서는 이 자리가 비어 있어야 한다. 칸이 있으면 모델이 채우기 때문에,
// 억지 주인공을 막는 것은 문구가 아니라 "아예 안 넘기는 것"이다.
//
// props — 사물 사진 [{id, what}]. 인물 사진(vision.person)은 여기 오지 않는다(resolveCastRefs 가 쓴다).
// 같은 이유로 비어 있으면 블록째 넣지 않는다.
export function buildCastMessages(cuts, avatars, lead = "", props = []) {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  // 화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돌아야 한다
  const shots = (cuts || [])
    .map((c, i) => `${i + 1}. ${c.shows || c.sentence || ""}`)
    .join("\n");
  const who = String(lead || "").trim();
  const leadBlock = who ? `\n[이 영상이 따라가는 사람]\n${who}\n` : "";
  const things = (props || []).filter((p) => p?.id);
  const propBlock = things.length
    ? `\n[올린 사진 — 사물]\n${things.map((p) => `- id:${p.id} ${p.what || "(무엇인지 모름)"}`).join("\n")}\n`
    : "";
  const user = `[컷별 화면 — 번호가 곧 컷 번호다]
${shots}
${leadBlock}${propBlock}
[준비된 인물 사진]
${list}`;
  return { system: CAST_SYSTEM, messages: [{ role: "user", content: user }] };
}
```

- [ ] **Step 9: `mergePropsIntoCuts` 를 더한다**

`mergeCastIntoCuts` 함수 **바로 아래**에 붙인다:

```js
// 사물을 컷에 꽂는다 — 인물과 같은 방식이다.
//
// **사진이 인물보다 앞에 온다.** resolveCutRefs 가 상한 2장을 "사물 하나 + 인물 하나"로
// 나눠 쓰는데, 뒤에 있으면 사물이 잘려 제품이 레퍼런스 없이 그려진다.
// 사장님이 올린 것이 언제나 먼저라는 원칙과도 같다.
export function mergePropsIntoCuts(cuts, props) {
  const byCut = new Map();
  for (const p of props || []) {
    for (const idx of p.cuts || []) {
      if (!byCut.has(idx)) byCut.set(idx, []);
      const list = byCut.get(idx);
      if (!list.includes(p.photo_id)) list.push(p.photo_id); // 같은 사진을 두 번 꽂지 않는다
    }
  }
  return (cuts || []).map((c, i) => {
    const photos = byCut.get(i);
    if (!photos?.length) return c;
    const already = c.ref_ids || [];
    const fresh = photos.filter((id) => !already.includes(id));
    if (!fresh.length) return c;
    return { ...c, ref_ids: [...fresh, ...already] };
  });
}
```

- [ ] **Step 10: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (459 + 새 테스트)

- [ ] **Step 11: 커밋**

```bash
git add lib/cast.js lib/validate.js tests/cast.test.js tests/validate.test.js
git commit -m "feat: 캐스팅이 사물도 답하고, 코드가 컷에 꽂을 수 있게 한다

인물은 자기 컷 번호를 답하고 코드가 꽂는데(ae2dc26) 사물은 아직 화면 설계의 프롬프트
약속이었다. 홍보 영상에서 제품이 컷마다 다른 물건으로 나온 원인이다.

사물이 인물보다 앞에 꽂힌다. resolveCutRefs 가 상한 2장을 사물 하나·인물 하나로 나눠
쓰는데, 뒤에 있으면 사물이 잘려 제품이 레퍼런스 없이 그려진다.

아직 아무도 부르지 않는다 — 배선은 다음 태스크다."
```

---

## Task 2: 파이프라인이 사물을 넘기고 꽂는다

**Files:**
- Modify: `lib/pipeline.js` (`defaultDeps.splitCuts` 안의 캐스팅 블록)
- Test: `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `buildCastMessages(cuts, avatars, lead, props)` · `validateProps(obj, photoIds, cutCount)` ·
  `mergePropsIntoCuts(cuts, props)` (Task 1)
- Produces: 컷의 `ref_ids`에 사물 사진 id가 들어간다. 서버 로그에 `[사물 xxxxxxxx] 제품이 보이는 컷 N/M`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js` 파일 끝에 더한다. 이 파일은 `deps()` 로 `splitCuts` 를 우회하므로,
여기서는 **실제 `defaultDeps.splitCuts`** 를 부른다(`llmMock.callJson` 이 응답을 대신한다):

```js
describe("사물 레퍼런스 — 캐스팅이 답하고 코드가 꽂는다", () => {
  // 자료에 사물 사진 하나. vision.person 이 false 라 인물 쪽으로 가지 않는다.
  async function projectWithThingPhoto(focusMode = "물건") {
    const p = await projects.createProject({
      settings: { aspect_ratio: "9:16" },
      material: { text: "자료", photos: [{ id: "p1", filename: "b.jpg", vision: { person: false, what: "화장품 병" } }] },
    });
    return projects.updateProject(p.id, (proj) => ({
      ...proj,
      briefing: { topic: "앰플", focus: { mode: focusMode, subject: "VT 앰플" } },
      script: { text: "앰플이 있습니다. 얼굴에 바릅니다." },
    }));
  }

  // 분할 → 화면 설계 → 캐스팅 순서로 응답을 준다
  function answer({ props }) {
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props });
  }

  it("사물이 보이는 컷에 사진을 꽂는다", async () => {
    const p = await projectWithThingPhoto();
    answer({ props: [{ photo_id: "p1", cuts: [1, 2] }] });
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(cuts[1].ref_ids).toEqual(["p1"]);
  });

  it("초점이 물건인데 사물이 0개면 한 번 더 묻는다", async () => {
    const p = await projectWithThingPhoto("물건");
    llmMock.callJson
      .mockResolvedValueOnce({ cuts: [{ from: 1, to: 1 }, { from: 2, to: 2 }] })
      .mockResolvedValueOnce({ shots: [{ shows: "앰플 병 클로즈업" }, { shows: "바르는 손" }] })
      .mockResolvedValueOnce({ cast: [], props: [] })            // 1차 — 빈손
      .mockResolvedValueOnce({ cast: [], props: [{ photo_id: "p1", cuts: [1] }] }); // 2차
    const cuts = await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(cuts[0].ref_ids).toEqual(["p1"]);
    expect(llmMock.callJson).toHaveBeenCalledTimes(4); // 분할·화면·캐스팅 두 번
  });

  it("초점이 물건이 아니면 0개라도 다시 묻지 않는다 — 값을 치를 이유가 없다", async () => {
    const p = await projectWithThingPhoto("정보");
    answer({ props: [] });
    await pipeline.defaultDeps.splitCuts(await projects.getProject(p.id));
    expect(llmMock.callJson).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `ref_ids` 가 undefined (아직 아무도 꽂지 않는다)

- [ ] **Step 3: 캐스팅 블록을 고친다**

`lib/pipeline.js` 의 `import { buildCastMessages, ... }` 줄에 `mergePropsIntoCuts` 를,
`import { validateCutRanges, validateShows, validateCast }` 줄에 `validateProps` 를 더한다.

그다음 캐스팅 블록(`const cast = await (async () => {` 부터 `})().catch(() => []);` 까지)과
그 아래 병합 줄을 통째로 바꾼다:

```js
    const avatars = await availableAvatars();
    // 사물 사진만 캐스팅에 넘긴다 — 인물 사진은 resolveCastRefs 가 인물에 붙인다.
    // 판정이 없는 사진은 사물로 본다: 모르는 것을 얼굴로 쓰지 않는 것이 인물 쪽 원칙이고,
    // 여기서는 그 반대편이라 "사람이라고 확인된 것만" 뺀다.
    const things = photos.filter((p) => !p.vision?.person).map((p) => ({ id: p.id, what: p.vision?.what || "" }));
    const thingIds = things.map((t) => t.id);
    // 초점이 물건이면 제품이 어느 컷에도 안 보인다는 답은 명백한 오답이다 — 그때만 다시 묻는다.
    const wantsThing = project.briefing?.focus?.mode === "물건" && things.length > 0;

    const { cast, props } = await (async () => {
      // 갈래가 '사람'일 때만 초점을 넘긴다 — 물건·정보 영상에 억지 주인공이 생기지 않게.
      const focus = project.briefing?.focus;
      const lead = focus?.mode === "사람" ? focus.subject : "";
      const msgs = buildCastMessages(withShows, avatars, lead, things);
      let last = { cast: [], props: [] };
      for (let i = 0; i < 2; i++) {
        const raw = await callJson({ system: msgs.system, messages: msgs.messages, stage: "캐스팅", projectId: project.id });
        const got = validateCast(raw, avatars.map((a) => a.id), withShows.length);
        const gotProps = validateProps(raw, thingIds, withShows.length);
        if (got) last = { cast: got, props: gotProps };
        // 물건 영상인데 제품이 한 컷도 안 잡혔으면 한 번 더 — 그 외에는 첫 답을 쓴다
        if (got && !(wantsThing && gotProps.length === 0)) break;
      }
      return last;
    })().catch(() => ({ cast: [], props: [] }));

    const castWithRefs = resolveCastRefs(cast, photos, avatars.map((a) => a.id));
    await updateProject(project.id, (proj) => ({
      ...proj,
      cast: castWithRefs,
      material: { ...proj.material, photos },
    }));

    // 제품이 몇 컷에 보이는지 남긴다 — 낱말로 세지 않고 캐스팅이 답한 컷 번호로 센다.
    // 지금은 막지 않는다: 표본이 모자라 임계를 감으로 박으면 거짓 경고가 유료 호출을 부른다.
    if (things.length) {
      const shown = new Set(props.flatMap((p) => p.cuts)).size;
      console.log(`[사물 ${project.id.slice(0, 8)}] 제품이 보이는 컷 ${shown}/${withShows.length}`);
    }

    // 사물을 먼저 꽂고 인물을 그 뒤에 꽂는다 — ref_ids 앞자리가 사물이어야 한다
    return mergeCastIntoCuts(mergePropsIntoCuts(withShows, props), castWithRefs);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js
git commit -m "feat: 사물 사진을 캐스팅에 넘기고 컷에 꽂는다

사물 사진만 넘긴다. 인물 사진은 resolveCastRefs 가 인물에 붙이므로 겹치지 않는다.

초점이 물건인데 제품이 어느 컷에도 안 보인다는 답은 명백한 오답이라 그때만 한 번 더
묻는다. 정상일 때는 호출이 늘지 않는다.

제품이 보이는 컷 수를 로그로 남긴다. 낱말로 세지 않고 캐스팅이 답한 컷 번호로 세므로
문자열 매칭이 없다. 막지는 않는다 — 표본이 한 편이라 임계를 감으로 박으면 거짓 경고가
유료 호출을 부른다."
```

---

## Task 3: 화면 설계에서 사진 고르기를 뗀다

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM`)
- Modify: `lib/validate.js` (`validateShows`)
- Modify: `lib/pipeline.js` (`validateShows` 호출 한 줄)
- Test: `tests/validate.test.js`, `tests/cuts.test.js`, `tests/pipeline.test.js`

**Interfaces:**
- Produces: `validateShows(obj, cutCount) -> [{shows, motion?}]` — **세 번째 인자가 없어진다.**
  `ref_ids` 를 더는 만들지 않는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 의 `validateShows` describe 안, **기존 `ref_ids` 테스트를 지우고**
그 자리에 넣는다. 지울 테스트는 `validateShows({ shots: [{ shows: "화면", ref_ids: ["p1"] }, ...` 로
시작하는 것 하나다(`tests/validate.test.js:104` 부근):

```js
  it("ref_ids 를 더 이상 만들지 않는다 — 사진은 캐스팅이 고른다", () => {
    const shots = validateShows({ shots: [{ shows: "화면", ref_ids: ["p1"] }] }, 1);
    expect(shots[0].ref_ids).toBeUndefined();
    expect(shots[0].shows).toBe("화면");
  });
```

`tests/cuts.test.js` 의 `buildShowsMessages` describe 에 더한다:

```js
  it("사진 목록은 여전히 준다 — 무엇을 찍을 수 있는지 알아야 화면에 넣는다", () => {
    const withPhoto = { ...project, material: { ...project.material, photos: [{ id: "p1", filename: "b.jpg" }] } };
    expect(buildShowsMessages(withPhoto, [{ sentence: "한 문장." }]).messages[0].content)
      .toContain("id:p1");
  });

  it("사진 id 를 적으라고 시키지 않는다 — 그 책임은 캐스팅으로 갔다", () => {
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).system).not.toContain("ref_ids");
  });

  it("초점이 물건인데 사람이 보이면 둘을 한 화면에 담으라고 알려 준다", () => {
    // 규칙을 조이는 대신 본보기를 준다 — 조이는 고침은 이 저장소에서 네 번 다 샜다
    expect(buildShowsMessages(project, [{ sentence: "한 문장." }]).system).toContain("한 화면에");
  });
```

`tests/pipeline.test.js` 에서 **화면 설계가 만들던 `ref_ids` 를 기대하던 단언을 고친다.**
`shots` 픽스처(`tests/pipeline.test.js:64` 부근)와 그 단언 두 곳이다:

```js
// 전:
//   const shots = { shots: [{ shows: "딸기를 가는 손 클로즈업", ref_ids: ["p1"] }, { shows: "골목을 걷는 시점 샷" }] };
//   expect(cuts[0].ref_ids).toEqual(["p1"]);
//   expect(cuts[0].ref_ids).toEqual(["p1", "c1"]);
// 후: 화면 설계는 사진을 고르지 않는다 — 사진은 props 로 온다
const shots = { shots: [{ shows: "딸기를 가는 손 클로즈업" }, { shows: "골목을 걷는 시점 샷" }] };
```

그 아래 단언 둘을 바꾼다:

```js
    expect(cuts[0].ref_ids).toBeUndefined();   // 화면 설계는 사진을 고르지 않는다
    expect(cuts[1].ref_ids).toBeUndefined();
```

```js
    expect(cuts[0].ref_ids).toEqual(["c1"]);   // 인물만 꽂힌다
    expect(cuts[1].ref_ids).toBeUndefined();
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js tests/cuts.test.js tests/pipeline.test.js`
Expected: FAIL — `ref_ids` 가 아직 만들어지고, 본보기 문구가 없다

- [ ] **Step 3: `SHOWS_SYSTEM` 을 고친다**

JSON 스키마 줄에서 `ref_ids` 를 뺀다:

```
반드시 JSON 하나만 출력: {"shots":[{"shows":"화면에 보이는 것(정지 화면)","motion":"그 화면이 어떻게 움직이는지 한 줄"}]}
```

`ref_ids` 규칙 줄(`- ref_ids 는 이 컷 화면에 실제로 보이는 물건·공간이 …`)과 그 다음 줄
(`  사람은 적지 않는다 — 인물은 이 패스 뒤에 따로 정한다.`)을 **지운다.**

`[이 영상이 따라가는 것]` 규칙 **바로 아래**에 본보기를 더한다:

```
- 초점이 물건인데 사람이 보이는 컷이면, 사람과 물건을 한 화면에 담는다. 시선이나 손이 그 물건을 향하게 쓴다.
  ✗ "20대 후반 여성의 미소 짓는 얼굴 클로즈업" — 초점이 물건인데 물건이 화면에 없다
  ✓ "앰플 병을 손에 들고 바라보며 미소 짓는 20대 후반 여성 미디엄 샷"
- [올린 사진]은 무엇을 찍을 수 있는지 알려 주는 목록이다. 그 사진에 있는 물건·공간을 화면에 넣어도 좋다. 어느 사진을 쓸지는 적지 않는다 — 뒤 단계가 정한다.
```

- [ ] **Step 4: `validateShows` 에서 `ref_ids` 를 걷어낸다**

```js
export function validateShows(obj, cutCount) {
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
    // 사진은 여기서 고르지 않는다 — 캐스팅이 인물과 함께 답하고 코드가 꽂는다(validateProps).
    // 모델이 옛 습관으로 ref_ids 를 적어 보내도 무시한다.
    out.push(shot);
  }
  return out;
}
```

같은 파일의 `const SHOT_REF_MAX = 2;` 와 그 위 주석 줄(`// 상한 2: 한 컷에 사진 셋을 붙이면 …`)을
**지운다** — 쓰는 곳이 없어졌다.

- [ ] **Step 5: 호출부에서 인자를 뺀다**

`lib/pipeline.js` 의 `validateShows` 호출에서 `photoIds` 를 뺀다:

```js
      designed = validateShows(
        await callJson({ system: shots.system, messages: shots.messages, stage: "화면 설계", projectId: project.id }),
        cuts.length
      );
```

바로 위의 `const photoIds = photos.map((p) => p.id);` 도 쓰는 곳이 없어졌으면 **지운다**
(Task 2에서 만든 `thingIds` 와는 다른 변수다 — 지우기 전에 `photoIds` 를 쓰는 다른 곳이
없는지 `grep -n "photoIds" lib/pipeline.js` 로 확인한다).

- [ ] **Step 6: 통과를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/cuts.js lib/validate.js lib/pipeline.js tests/validate.test.js tests/cuts.test.js tests/pipeline.test.js
git commit -m "refactor: 화면 설계는 사진을 고르지 않는다 — 캐스팅이 맡는다

컷마다 곁다리로 고르게 두니 빠뜨려도 아무도 몰랐다. 실제로 '앰플을 얼굴에 바르는' 컷에
사진을 안 붙여 제품이 딴 물건으로 나왔다.

사진 목록은 계속 준다. 무엇을 찍을 수 있는지 알아야 그것을 화면에 넣는다 — 고르는 책임만
옮긴다.

초점이 물건인데 사람이 나오는 컷에서 제품이 사라지던 것도 함께 고쳤다. 규칙을 조이는 대신
본보기를 줬다 — 조이는 고침은 이 저장소에서 네 번 다 다른 형태로 샜다."
```

---

## Task 4: 가짜 모드로 잰다 (fal 호출 없음)

**Files:** 없음 (검증). 발견한 것만 고친다.

fal 을 부르지 않는다. OpenAI 만 편당 4~5센트.

- [ ] **Step 1: 사물 사진이 있는 자료로 돌린다**

```bash
SHOTFORM_FAKE=1 npm run dev
```

화면에서 ①자료에 **제품 사진 한 장 + 제품 설명 텍스트**를 넣고 ④이미지 직전까지 간다.
자료는 `docs/` 밖 아무 텍스트나 좋으나, **초점이 `물건`으로 잡히는 것**이면 된다.

- [ ] **Step 2: 되는가 안 되는가를 본다**

서버 로그의 `[사물 xxxxxxxx] 제품이 보이는 컷 N/M` 과 저장된 프로젝트의 `cuts[].ref_ids` 를 본다.

- [ ] **제품이 보이는 컷에 사진 id 가 붙어 있는가.** 특히 **사람이 함께 나오는 컷**에 붙는가
      (이번 사고가 정확히 그 자리였다)
- [ ] `ref_ids` 에서 **사진이 인물보다 앞에** 있는가
- [ ] 초점이 물건인 편에서 `N/M` 이 **0이 아닌가**
- [ ] 사람이 나오는 컷의 `shows` 가 **시선·손이 제품을 향하게** 쓰였는가
- [ ] 사물 사진이 없는 자료로도 돌려 **지금 동작 그대로**인가

- [ ] **Step 3: 어긋난 것을 고친다**

**무엇이 어긋났는지 한 줄로 적을 수 있을 때만 고친다.** 적을 수 없으면 사장님에게 가져간다 —
프롬프트 왕복은 이 저장소에서 네 번 다 다른 형태로 샜다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "fix: 사물 레퍼런스 관통에서 드러난 것을 고친다

[무엇이 어긋났는지]"
```

---

## 다음 — 실제 이미지 확인은 사장님 검토 게이트

이 계획은 **가짜 모드까지**다. 실제로 제품이 컷마다 같은 물건으로 나오는지는 fal 이미지가
필요하고(컷당 후보 2장 × $0.04), **사장님 승인 없이 시작하지 않는다.**

확인할 것은 하나다 — **사람이 함께 나오는 컷에서도 제품이 원본 그대로인가.** 컷2(제품 단독)는
이미 되는 것을 봤고, 안 되던 것은 컷3(바르는 손)이었다.
