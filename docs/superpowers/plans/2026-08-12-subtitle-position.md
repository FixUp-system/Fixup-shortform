# 자막 위치 3단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⑥완성 화면에서 자막을 위·중간·아래로 옮길 수 있게 한다. 바꾸면 완성본이 낡고, 다시 만드는 값은 0원이다.

**Architecture:** 위치는 `settings.subtitle_position`(`"bottom"`·`"middle"`·`"top"`, 기본 `bottom`)에 저장한다. `lib/subtitles.js` 가 그 값을 ASS 의 `Alignment`·`MarginV` 로 옮기고, `lib/compose.js` 가 값을 넘긴다. `lib/steps.js` 의 `renderKey` 가 그 값을 각인에 **있을 때만** 덧붙여, 기본값인 옛 프로젝트가 낡지 않게 한다.

**Tech Stack:** ASS 자막(Alignment 숫자패드 1~9) · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-subtitle-position-design.md` 의 "건드리지 않는 것"을 그대로 옮긴다.

- ★★ **옛 프로젝트의 `renderKey` 가 바뀌면 안 된다.** `subtitle_position` 이 없는 프로젝트의 각인은 **바뀌기 전과 글자 그대로 같아야** 한다. 형식을 무조건 바꾸면 이미 만든 완성본이 통째로 "낡음"이 되고, 그 버튼은 **유료가 아니지만**(합성은 0원) 사장님에게 "왜 갑자기 다시 만들라고 하지"가 된다
- ★ **기본값은 `bottom` 이고, 지금 동작과 픽셀 단위로 같아야 한다** — `Alignment: 2` · `marginV = height * 0.18`
- **`buildCues`·줄바꿈·두 줄 규칙·`lineWidthUnits` 를 건드리지 않는다** — 위치만 바꾼다. 폭 계산은 `marginH`·`fontSize` 에서 나오고 그 둘은 안 바뀐다
- **글자 크기·색·글꼴을 바꾸지 않는다**
- **클립·그림·목소리 각인(`clipKey`·`isImageStale`·`isAudioStale`)을 건드리지 않는다** — 자막은 합성에서만 쓰이므로 그것들과 무관하다
- 새 npm 의존성 금지
- **예상 못 한 실패는 고치지 말고 보고한다**

**★ 병렬 세션 주의:** `app/api/projects/[id]/route.js` 는 병렬 세션(`billing-gaps`)이 최근 고친 파일이다(길이 바꿔치기 방어). **Task 4 를 시작하기 전에 `git log --oneline -3 -- "app/api/projects/[id]/route.js"` 로 최근 커밋을 확인**하고, 그쪽이 진행 중이면 멈추고 보고한다.

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라(문서 숫자는 낡는다). 매 태스크 끝에서 유지되거나 늘어야 한다.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

## ★ 병렬 가능 여부

파일이 전부 갈린다:

| Task | 파일 |
|---|---|
| 1 | `lib/subtitles.js` · `tests/subtitles.test.js` |
| 2 | `lib/steps.js` · `tests/steps.test.js` |
| 3 | `lib/compose.js` · `tests/compose.test.js` |
| 4 | `app/api/projects/[id]/route.js` · `tests/routes.test.js` |
| 5 | `app/create/[id]/done/page.js` |

**Task 1·2·4 는 동시에 돌려도 된다.** Task 3 은 Task 1 의 새 시그니처를 쓰므로 그 뒤,
Task 5 는 Task 4 의 저장 경로를 쓰므로 그 뒤다.

병렬로 돌릴 때는 **각자 자기 테스트 파일만** 돌린다(`npx vitest run` 전체 금지 — 남의 미완성
변경으로 거짓 실패가 난다). 전체 테스트는 컨트롤러가 마지막에 한 번 돌린다.

---

### Task 1: 자막 위치를 ASS 로 옮긴다

**Files:**
- Modify: `lib/subtitles.js:73-81`(`subtitleStyle`) · `:274-285`(`toAss`)
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Produces: `subtitleStyle({ width, height, position })` → `{ fontSize, marginH, marginV, alignment }`.
  `toAss(cues, { width, height, position })`. `position` 은 `"bottom"`(기본)·`"middle"`·`"top"`.
  Task 3 이 `toAss` 에 `position` 을 넘긴다

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/subtitles.test.js` 에 describe 를 더한다:

```js
describe("자막 위치", () => {
  const size = { width: 1080, height: 1920 };

  it("기본은 아래다 — 지금 동작과 픽셀 단위로 같다", () => {
    const s = subtitleStyle(size);
    expect(s.alignment).toBe(2);              // ASS 숫자패드: 2 = 하단 중앙
    expect(s.marginV).toBe(Math.round(1920 * 0.18));
    // position 을 명시해도 같아야 한다
    expect(subtitleStyle({ ...size, position: "bottom" })).toEqual(s);
  });

  it("중간은 세로 여백이 0 이다 — 중앙 정렬이라 무의미하다", () => {
    const s = subtitleStyle({ ...size, position: "middle" });
    expect(s.alignment).toBe(5);              // 5 = 중간 중앙
    expect(s.marginV).toBe(0);
  });

  it("위는 상단 UI 를 피한다", () => {
    const s = subtitleStyle({ ...size, position: "top" });
    expect(s.alignment).toBe(8);              // 8 = 상단 중앙
    expect(s.marginV).toBe(Math.round(1920 * 0.12));
  });

  it("모르는 값은 조용히 아래로 떨어진다 — 자막이 안 나오는 것보다 낫다", () => {
    expect(subtitleStyle({ ...size, position: "뒤죽박죽" }).alignment).toBe(2);
  });

  it("글자 크기와 가로 여백은 위치와 무관하다", () => {
    const b = subtitleStyle({ ...size, position: "bottom" });
    for (const p of ["middle", "top"]) {
      const s = subtitleStyle({ ...size, position: p });
      expect(s.fontSize).toBe(b.fontSize);
      expect(s.marginH).toBe(b.marginH);
    }
  });

  it("ASS 스타일 줄에 고른 정렬과 여백이 실린다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "가" }], { ...size, position: "top" });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    const f = style.split(",");
    // Format: Name,Fontname,Fontsize,Primary,Outline,Back,Bold,BorderStyle,Outline,Shadow,
    //         Alignment,MarginL,MarginR,MarginV,Encoding
    expect(f[10]).toBe("8");                                    // Alignment
    expect(f[13]).toBe(String(Math.round(1920 * 0.12)));        // MarginV
  });

  it("position 을 안 주면 ASS 도 지금과 같다", () => {
    const ass = toAss([{ start: 0, end: 1, text: "가" }], size);
    const f = ass.split("\n").find((l) => l.startsWith("Style: Main")).split(",");
    expect(f[10]).toBe("2");
    expect(f[13]).toBe(String(Math.round(1920 * 0.18)));
  });
});
```

파일 상단 import 에 `subtitleStyle`·`toAss` 가 없으면 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `s.alignment` 가 `undefined` 다(지금 `subtitleStyle` 은 그 키를 안 준다).

- [ ] **Step 3: `subtitleStyle` 에 위치를 더한다**

`lib/subtitles.js` 의 `subtitleStyle` 을 바꾼다:

```js
// 자막이 설 자리 셋. ASS 의 Alignment 는 숫자패드 배치다 — 1~3 하단, 4~6 중간, 7~9 상단.
//
// 세로 여백은 자리마다 뜻이 다르다: 하단은 "바닥에서 얼마나 띄우나", 상단은 "천장에서
// 얼마나 내리나", 중간은 정렬이 이미 중앙이라 무의미해서 0 이다.
const POSITIONS = {
  // 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
  bottom: { alignment: 2, marginRatio: 0.18 },
  middle: { alignment: 5, marginRatio: 0 },
  // 상단 UI(시간·배터리·앱 헤더)를 피한다.
  top: { alignment: 8, marginRatio: 0.12 },
};
export const SUBTITLE_POSITIONS = Object.keys(POSITIONS);
export const DEFAULT_SUBTITLE_POSITION = "bottom";

// 자막 스타일 — 글자 크기·여백은 화면에서 파생된다. 값을 두 곳에 두면 갈라지므로 여기 하나뿐이다.
// (toAss 가 쓰고, 폭 한계도 여기서 나온다.)
//
// ★ 모르는 position 은 조용히 아래로 떨어진다. 던지면 합성이 통째로 죽는데, 자막 위치
//   하나 때문에 이미 값을 치른 클립을 못 쓰게 되는 것이 더 나쁘다.
export function subtitleStyle({ width, height, position }) {
  const p = POSITIONS[position] || POSITIONS[DEFAULT_SUBTITLE_POSITION];
  return {
    fontSize: Math.round(height * 0.042),
    marginH: Math.round(width * 0.08),
    marginV: Math.round(height * p.marginRatio),
    alignment: p.alignment,
  };
}
```

- [ ] **Step 4: `toAss` 가 그 값을 쓰게 한다**

같은 파일의 `toAss` 를 바꾼다. **세 곳뿐이다** — 시그니처, 구조분해, Style 줄:

```js
export function toAss(cues, { width, height, position }) {
  const { fontSize, marginH, marginV, alignment } = subtitleStyle({ width, height, position });
```

그리고 `Style: Main,...` 줄에서 하드코딩된 `Alignment` 값 `2` 를 `${alignment}` 로 바꾼다.
그 줄의 다른 값(색·굵기·외곽선)은 **건드리지 마라**. 바뀌는 것은 열한 번째 칸 하나다:

```
Style: Main,Pretendard,${fontSize},&H00FFFFFF,&H00000000,&H80000000,1,1,3,0,${alignment},${marginH},${marginH},${marginV},1
```

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: PASS 전부. 기존 자막 테스트(줄바꿈·두 줄·폭)도 무손상이어야 한다.

- [ ] **Step 6: 변이로 단정이 무는지 본다**

`POSITIONS.top.alignment` 를 잠깐 `2` 로 바꾸고 `npx vitest run tests/subtitles.test.js` 를 돌린다.
Expected: "위는 상단 UI 를 피한다" 와 "ASS 스타일 줄에…" 가 FAIL. 확인했으면 **되돌린다**.

★ 되돌릴 때 `git checkout` 을 쓰지 마라 — 이 파일의 미커밋 작업까지 사라진다. 편집기로 그 값만.

- [ ] **Step 7: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat(subtitles): 자막 위치 세 자리 — 아래·중간·위

ASS 의 Alignment 는 숫자패드 배치다(1~3 하단, 4~6 중간, 7~9 상단).
세로 여백은 자리마다 뜻이 달라서 표로 뒀다 — 하단은 바닥에서 띄우고, 상단은
천장에서 내리고, 중간은 정렬이 이미 중앙이라 0 이다.

기본은 bottom 이고 지금 동작과 픽셀 단위로 같다. 모르는 값은 조용히 아래로
떨어진다 — 던지면 자막 위치 하나 때문에 이미 값을 치른 클립을 못 쓰게 된다."
```

---

### Task 2: 각인에 자막 위치를 더한다 ★ 가장 위험

**Files:**
- Modify: `lib/steps.js:106-112`(`renderKey`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Produces: `renderKey(project)` 가 `settings.subtitle_position` 이 **있을 때만** 그것을 앞에 덧붙인다

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/steps.test.js` 에 더한다:

```js
describe("자막 위치와 완성본 각인", () => {
  const withCuts = (settings) => ({
    settings,
    cuts: [
      { audio: { url: "a0" }, video: { url: "v0" }, sentence: "첫 문장" },
      { audio: { url: "a1" }, video: { url: "v1" }, sentence: "둘째 문장" },
    ],
  });

  // ★★ 이 단정이 이 태스크의 전부다. 형식을 무조건 바꾸면 이미 만든 완성본이
  //    통째로 낡는다 — clipKey 가 speed 를 다루는 방식과 같은 이유다.
  it("자막 설정이 없는 옛 프로젝트의 각인은 그대로다", () => {
    const 옛것 = renderKey(withCuts(undefined));
    const 빈설정 = renderKey(withCuts({}));
    // 손으로 적은 기대값 — 이 형식이 바뀌면 옛 완성본이 전부 낡는다
    expect(옛것).toBe("a0|v0|첫 문장\na1|v1|둘째 문장");
    expect(빈설정).toBe(옛것);
  });

  it("기본값(bottom)을 명시해도 각인이 달라진다 — 그것이 고른 것이다", () => {
    // 사장님이 실제로 '아래'를 눌러 저장한 상태다. 옛것과 구별되어야
    // 그 뒤에 '위'로 바꿨을 때도 정상적으로 낡는다.
    expect(renderKey(withCuts({ subtitle_position: "bottom" }))).not.toBe(
      renderKey(withCuts(undefined))
    );
  });

  it("위치를 바꾸면 각인이 바뀐다", () => {
    const 아래 = renderKey(withCuts({ subtitle_position: "bottom" }));
    const 위 = renderKey(withCuts({ subtitle_position: "top" }));
    const 중간 = renderKey(withCuts({ subtitle_position: "middle" }));
    expect(new Set([아래, 위, 중간]).size).toBe(3);
  });

  it("바꾸면 완성본이 낡는다", () => {
    const p = withCuts({ subtitle_position: "bottom" });
    p.render = { url: "/api/renders/x.mp4", of: renderKey(p) };
    expect(isRenderStale(p)).toBe(false);
    p.settings.subtitle_position = "top";
    expect(isRenderStale(p)).toBe(true);
  });

  it("자막 위치는 클립·그림·소리를 낡게 하지 않는다", () => {
    const cut = { image: { url: "i", of: "장면" }, video: { url: "v", of: clipKey({ image: { url: "i" }, seconds: 3, motion: "m" }) }, seconds: 3, motion: "m" };
    const before = clipKey(cut);
    // 자막 위치는 컷에 없다 — clipKey 의 입력이 아니다
    expect(clipKey(cut)).toBe(before);
  });
});
```

`tests/steps.test.js` 상단 import 에 `renderKey`·`isRenderStale`·`clipKey` 가 없으면 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — "기본값(bottom)을 명시해도 각인이 달라진다" 와 "위치를 바꾸면 각인이 바뀐다" 와 "바꾸면 완성본이 낡는다". 나머지 둘(옛 프로젝트·클립 무관)은 **지금도 통과한다** — 그것이 지켜야 할 계약이다.

- [ ] **Step 3: `renderKey` 를 고친다**

`lib/steps.js` 의 `renderKey` 를 바꾼다:

```js
// 자막이 문장에서 나오므로 sentence 도 넣는다(lib/subtitles.js).
//
// 자막 **위치**도 넣는다 — 합성이 그 값으로 ASS 를 만드는데, 각인에 없으면 위치를 바꿔도
// "안 낡음"이 되어 다시 만들기 버튼이 안 뜬다. 바꿨는데 아무 일도 안 일어난다.
//
// ⚠️ 있을 때만 덧붙인다. 형식을 무조건 바꾸면 옛 각인이 전부 불일치가 되어 이미 만든
//    완성본이 통째로 낡는다 — clipKey 의 speed 와 같은 함정이다(style_of 때 겪었다).
export function renderKey(project) {
  const base = (project?.cuts || [])
    .map((c) => `${c.audio?.url || ""}|${c.video?.url || ""}|${c.sentence || ""}`)
    .join("\n");
  const pos = project?.settings?.subtitle_position;
  return pos ? `${pos}\n${base}` : base;
}
```

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 옛 프로젝트 보호를 변이로 확인한다**

`return pos ? \`${pos}\n${base}\` : base;` 를 잠깐
`return \`${pos || "bottom"}\n${base}\`;` 로 바꾸고 돌린다(= 무조건 덧붙이기).
Expected: "자막 설정이 없는 옛 프로젝트의 각인은 그대로다" 가 FAIL.
**이것이 이 태스크에서 가장 중요한 확인이다** — 확인했으면 되돌린다(편집기로).

- [ ] **Step 6: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "feat(steps): 자막 위치를 완성본 각인에 — 있을 때만 덧붙인다

각인에 자막 위치가 없어서, 위치를 바꿔도 render.of 가 그대로였다. 그러면
isRenderStale 이 '안 낡음'으로 판정해 다시 만들기가 안 뜨고, 바꿨는데 아무 일도
일어나지 않는다.

⚠️ 무조건 덧붙이지 않는다. 형식을 바꾸면 옛 각인이 전부 불일치가 되어 이미 만든
완성본이 통째로 낡는다 — clipKey 가 speed 를 다루는 방식 그대로다."
```

---

### Task 3: 합성이 위치를 넘긴다

**Files:**
- Modify: `lib/compose.js:197`
- Test: `tests/compose.test.js`

**Interfaces:**
- Consumes: Task 1 의 `toAss(cues, { width, height, position })`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/compose.test.js` 의 `describe("composeVideo", …)` 안에 더한다:

```js
  it("고른 자막 위치가 ASS 에 실린다", async () => {
    let ass = "";
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      subtitlePosition: "top",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async (_path, content) => { ass = content; },
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    const style = ass.split("\n").find((l) => l.startsWith("Style: Main"));
    expect(style.split(",")[10]).toBe("8");   // Alignment = 상단 중앙
  });

  it("위치를 안 주면 지금과 같다 — 아래", async () => {
    let ass = "";
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async () => {},
      downloadImpl: async (_url, dest) => dest,
      writeFileImpl: async (_path, content) => { ass = content; },
      mkdirImpl: async () => {},
      mkdtempImpl: async () => "/tmp/x",
      rmImpl: async () => {},
      readFileImpl: async () => Buffer.from("mp4"),
      putObjectImpl: async () => {},
    });
    expect(ass.split("\n").find((l) => l.startsWith("Style: Main")).split(",")[10]).toBe("2");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/compose.test.js`
Expected: FAIL 1건 — "고른 자막 위치가 ASS 에 실린다"(둘째는 지금도 통과한다).

- [ ] **Step 3: `composeVideo` 가 위치를 받아 넘긴다**

`lib/compose.js` 의 `composeVideo` 서명에 `subtitlePosition` 을 더한다(다른 인자는 그대로):

```js
export async function composeVideo({
  projectId,
  cuts,
  aspect_ratio,
  subtitlePosition,
  fetchImpl = fetch,
  // … 나머지 그대로
```

그리고 자막 파일을 쓰는 줄에 넘긴다:

```js
    await writeFileImpl(
      assPath,
      toAss(buildCues(usable, { width, height }), { width, height, position: subtitlePosition }),
      "utf8"
    );
```

★ `buildCues` 에는 **넘기지 마라** — 줄바꿈·폭 계산은 위치와 무관하다(가로 여백과 글자
크기만 쓰는데 둘 다 안 바뀐다).

- [ ] **Step 4: 파이프라인이 값을 전달하게 한다**

`lib/pipeline.js:542` 의 호출에 한 줄을 더한다. 그 자리는 `composeVideo` 를 직접 부르지 않고
`const compose = deps.compose || composeVideo` 로 받은 것을 부른다(테스트가 갈아끼운다):

```js
  const result = await compose({
    projectId,
    cuts: project.cuts || [],
    aspect_ratio: project.settings?.aspect_ratio || "9:16",
    subtitlePosition: project.settings?.subtitle_position,
  });
```

★ `renderKey(project)` 를 부르는 아랫줄(`:552`)은 **건드리지 마라.** Task 2 가 그 함수 안에서
같은 설정을 읽으므로, 여기서 따로 넘길 필요가 없다.

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/compose.test.js tests/pipeline.test.js`
Expected: PASS 전부

- [ ] **Step 6: 커밋**

```bash
git add lib/compose.js lib/pipeline.js tests/compose.test.js
git commit -m "feat(compose): 고른 자막 위치를 ASS 에 넘긴다

buildCues 에는 안 넘긴다 — 줄바꿈·폭 계산은 위치와 무관하고
가로 여백·글자 크기만 쓰는데 둘 다 안 바뀐다."
```

---

### Task 4: 저장 — 닫힌 목록 검증

**Files:**
- Modify: `app/api/projects/[id]/route.js` (settings 검증 자리)
- Test: `tests/routes.test.js`

**★ 시작 전에 확인하라:** `git log --oneline -3 -- "app/api/projects/[id]/route.js"` —
병렬 세션이 이 파일을 진행 중이면 **멈추고 보고한다.**

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/routes.test.js` 에서 `PATCH /api/projects/[id]` 를 재는 기존 describe 를 찾아 그 안에 더한다
그 파일은 `PATCH` 를 직접 import 하고(`:51`) `patchReq(body)` 헬퍼로 요청을 만든다(`:64`).
**기존 PATCH 테스트를 먼저 읽고 그 형태를 그대로 따라 쓴다** — 컨텍스트 인자(`ctx(p.id)`)와
프로젝트 만드는 방식이 파일마다 다르다:

```js
  it("자막 위치는 아는 값만 받는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: OWNER });
    const res = await PATCH(patchReq({ settings: { subtitle_position: "가운데" } }), ctx(p.id));
    expect(res.status).toBe(400);
  });

  it("아는 값이면 저장된다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: OWNER });
    const res = await PATCH(patchReq({ settings: { subtitle_position: "top" } }), ctx(p.id));
    expect(res.status).toBe(200);
    expect((await getProject(p.id, OWNER)).settings.subtitle_position).toBe("top");
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: FAIL 1건 — 모르는 값이 200 으로 통과한다(지금은 `settings` 를 화이트리스트 없이 머지한다).

- [ ] **Step 3: 검증을 더한다**

`app/api/projects/[id]/route.js` 에서 `aspect_ratio` 를 검증하는 줄 **바로 아래**에 붙인다.
같은 자리에 두는 이유는 그 주석이 이미 적고 있다 — "락을 잡기 전에 판정한다":

```js
  // 자막 위치도 닫힌 목록이다. 모르는 값이 들어가면 합성이 조용히 아래로 떨어뜨리는데
  // (lib/subtitles.js), 고른 것과 만들어지는 것이 달라지면 아무도 못 알아본다.
  if (
    body.settings?.subtitle_position !== undefined &&
    !SUBTITLE_POSITIONS.includes(body.settings.subtitle_position)
  ) {
    return Response.json({ error: "그 자막 위치는 몰라요" }, { status: 400 });
  }
```

파일 상단 import 에 더한다:

```js
import { SUBTITLE_POSITIONS } from "../../../../lib/subtitles.js";
```

★ 경로 깊이를 확인하라 — 그 파일의 다른 import 가 몇 단계를 올라가는지 보고 맞춘다.

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/routes.test.js`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add "app/api/projects/[id]/route.js" tests/routes.test.js
git commit -m "feat(api): 자막 위치를 닫힌 목록으로 받는다

settings 는 화이트리스트 없이 머지되므로 닫힌 목록은 라우트가 판정한다 —
aspect_ratio·target_seconds 와 같은 자리, 같은 이유다."
```

---

### Task 5: ⑥완성 화면의 칩 셋

**Files:**
- Modify: `app/create/[id]/done/page.js`

**Interfaces:**
- Consumes: Task 4 의 `PATCH { settings: { subtitle_position } }`

- [ ] **Step 1: 지금 화면을 읽는다**

Run: `sed -n '80,175p' "app/create/[id]/done/page.js"`

합성 버튼(`<button className="cta" … onClick={start}>`)이 어디 있는지, `busy`·`stale` 같은
상태 이름이 무엇인지 확인한다. **아래 코드를 그 파일의 이름에 맞춰 쓴다.**

- [ ] **Step 2: 저장 함수를 더한다**

컴포넌트 안에 더한다(`load`·`setProject` 는 이미 있다 — 없으면 `useProject()` 에서 꺼낸다):

```jsx
  // 자막 위치는 합성에만 쓰인다 — 클립·그림·소리는 그대로다. 그래서 바꿔도 값이 안 든다.
  async function saveSubtitlePosition(position) {
    if (busy) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { subtitle_position: position } }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "자막 위치를 저장하지 못했어요");
      return;
    }
    await load(id).catch(() => {});
  }
```

- [ ] **Step 3: 칩을 그린다**

합성 버튼 **위**에 넣는다:

```jsx
      <div className="eyebrow mt-lg">
        자막 위치 <small>바꿔서 다시 만들어도 값이 들지 않아요</small>
      </div>
      <div className="chips">
        {[["top", "위"], ["middle", "중간"], ["bottom", "아래"]].map(([id_, label]) => (
          <button
            key={id_}
            className={`chip${(project.settings?.subtitle_position || "bottom") === id_ ? " on" : ""}`}
            disabled={busy}
            onClick={() => saveSubtitlePosition(id_)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="pgsub">영상 아래쪽 UI에 가리지 않게 기본은 아래예요.</p>
```

★ `.chips`/`.chip`/`.chip.on` 은 이미 있는 CSS 다(③목소리가 쓴다). **새 CSS 를 만들지 마라.**
★ 화살표 함수 인자 이름을 `id` 로 쓰지 마라 — 컴포넌트의 `const { id } = useParams()` 를 가린다.

- [ ] **Step 4: 눈으로 확인한다**

dev 서버에서 완성 단계 화면을 열어 칩 셋이 보이는지, 고른 것에 `on` 이 붙는지 본다.
이미 완성본이 있는 프로젝트면 다른 위치를 골랐을 때 **"다시 만들기" 경고가 뜨는지** 확인한다
(Task 2 의 각인이 그것을 가능하게 한다).

⚠️ 지금 DB 에 완성본이 있는 프로젝트가 **0개**다. 없으면 이 확인은 미검증으로 남기고 보고한다.

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`
Expected: 시작 시 센 수에서 늘어난 만큼(Task 1~4 의 새 테스트)

- [ ] **Step 6: 커밋**

```bash
git add "app/create/[id]/done/page.js"
git commit -m "feat(done): 완성 직전에 자막 위치를 고른다

⑤영상이 아니라 여기 두는 이유: 자막은 클립에 안 들어가고 합성 때 태워진다.
여기서 정하면 실제 클립을 보고 판단할 수 있고, 바꿔서 다시 만들어도 클립을
다시 안 만든다 — 로컬 ffmpeg 라 0원이다."
```

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert` 가 가능하다. 의존은 둘뿐이다:
- **Task 3 은 Task 1 에 의존한다**(`toAss` 의 `position` 인자)
- **Task 5 는 Task 4 에 의존한다**(저장 경로)

**Task 2(각인)를 되돌리면** 자막 위치를 바꿔도 낡음이 안 잡힌다 — 기능은 도는데 사장님이
바꾼 것이 반영 안 된 것처럼 보인다. 되돌릴 거면 Task 5(화면)도 함께 되돌려야 한다.
