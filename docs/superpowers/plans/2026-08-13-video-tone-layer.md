# 전체 구성 층 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상 하나가 한 편으로 보이게 — 컷마다 흔들리던 컬러·질감을 하나로 묶고, 컷과 컷 사이에 연결을 만든다.

**Architecture:** `validateShows` 응답에 `tone`(영상 전체)·`transition`(컷별) 둘을 더하고, `environment` 가 이미 쓰는 "전체가 정하고 컷이 들고 다니는" 경로로 저장한다. 두 값은 `buildImagePrompt` 에서만 쓰인다 — 컬러도 매치컷도 이미지에서 결정되기 때문이다. LLM 호출은 늘지 않는다.

**Tech Stack:** Node.js · vitest · 순수 함수 위주(`lib/validate.js`·`lib/cuts.js`·`lib/steps.js`)

**Spec:** `docs/superpowers/specs/2026-08-13-video-style-layer-design.md`

## Global Constraints

- **워크트리:** `C:\Users\fixup\shotform-video` · 브랜치 `feature/i2v-model`. Edit 의 절대경로가 이 워크트리를 가리키는지 매번 확인한다(메인 저장소를 가리키면 남의 세션을 오염시킨다).
- **`git add -A` 금지.** `next.config.mjs` 는 의도적 미커밋이고, 다른 세션의 변경이 섞여 있다. 파일을 **명시적으로** 지정해 add 한다.
- **한글 커밋 메시지는 파일로 전달한다** — 셸을 거치면 깨진 전례가 있다. 메시지를 Write 도구로 파일에 쓴 뒤 `git commit -F <그 경로>`. 아래 태스크의 `<scratchpad>` 는 이 세션의 스크래치패드 디렉터리를 뜻한다(경로는 세션마다 다르다 — 시스템 프롬프트에 적힌 값을 쓴다).
- **`tone`·`transition` 이 없으면 산출물이 글자 그대로 같아야 한다.** 이 계획의 유일한 하드 제약이다.
- **`style_of` 는 화풍(애니·실사)이고 이 작업의 `tone` 과 다른 것이다.** 이름이 비슷하니 섞지 않는다.
- 테스트: `npx vitest run <파일>` · 전체 `npx vitest run`
- 각 태스크는 TDD(실패 → 최소 구현 → 통과 → 커밋)로 진행한다.

---

### Task 1: `validateShows` 가 두 필드를 받는다

**Files:**
- Modify: `lib/validate.js:42-77` (`validateShows`)
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `validateShows(obj, cutCount)` 가 돌려주는 각 shot 에 `tone?: string` · `transition?: string` 이 붙는다. `tone` 은 **전 컷 동일값**, `transition` 은 컷별 고유값. 둘 다 없을 수 있다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 에 추가한다. 기존 `validateShows` describe 안이면 어디든 좋다.

```js
describe("validateShows — tone·transition", () => {
  it("tone 을 전 컷에 복사한다", () => {
    const out = validateShows(
      { tone: "채도를 올린 시네마틱 질감", shots: [{ shows: "가" }, { shows: "나" }] },
      2
    );
    expect(out[0].tone).toBe("채도를 올린 시네마틱 질감");
    expect(out[1].tone, "환경과 같은 경로 — 전체가 정하고 컷이 들고 다닌다")
      .toBe("채도를 올린 시네마틱 질감");
  });

  it("transition 은 컷마다 다르다", () => {
    const out = validateShows(
      { shots: [{ shows: "가" }, { shows: "나", transition: "발 클로즈업, 같은 눈높이" }] },
      2
    );
    expect(out[0].transition, "첫 컷에는 전환이 없다").toBeUndefined();
    expect(out[1].transition).toBe("발 클로즈업, 같은 눈높이");
  });

  it("둘이 없어도 컷을 버리지 않는다", () => {
    // motion·speed 와 같은 취급 — 화면 설계가 부분적으로 실패해도 그림은 나와야 한다
    const out = validateShows({ shots: [{ shows: "가" }] }, 1);
    expect(out).toHaveLength(1);
    expect(out[0].shows).toBe("가");
    expect(out[0]).not.toHaveProperty("tone");
    expect(out[0]).not.toHaveProperty("transition");
  });

  it("빈 문자열은 없는 것으로 본다", () => {
    const out = validateShows({ tone: "   ", shots: [{ shows: "가", transition: "" }] }, 1);
    expect(out[0]).not.toHaveProperty("tone");
    expect(out[0]).not.toHaveProperty("transition");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js -t "tone·transition"`
Expected: FAIL — `expect(out[0].tone).toBe(...)` 가 `undefined` 를 받는다.

- [ ] **Step 3: 최소 구현**

`lib/validate.js` 의 `validateShows` 를 고친다. `stage` 를 읽는 줄 바로 아래에 `tone` 을 더한다:

```js
  const stage = typeof obj.environment === "string" ? obj.environment.trim() : "";
  // 톤 — 영상 하나의 컬러·질감. environment 와 같은 이유로 전 컷에 복사한다:
  // buildImagePrompt 가 컷 하나만 받으므로 컷이 자기 톤을 말할 수 있어야 한다.
  // (project.settings 의 화풍(styleKey)과 다른 것이다 — 그쪽은 애니·실사를 가른다.)
  const tone = typeof obj.tone === "string" ? obj.tone.trim() : "";
```

그리고 shot 조립부, `if (env) shot.environment = env;` 아래에 두 줄을 더한다:

```js
    if (env) shot.environment = env;
    if (tone) shot.tone = tone;
    // 전환 — 이 컷이 시작하는 구도. 앞 컷과 이어 보이게 하는 값이라 컷마다 다르다.
    // 첫 컷에는 없는 것이 정상이다.
    const trans = typeof s?.transition === "string" ? s.transition.trim() : "";
    if (trans) shot.transition = trans;
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS — 새 4개 + 기존 전부.

- [ ] **Step 5: 커밋**

커밋 메시지를 `scratchpad/t1.txt` 에 쓰고:

```
feat(shows): 화면 설계가 톤과 전환을 답한다

tone 은 영상 전체(전 컷 복사), transition 은 컷별이다. environment 가 쓰는
경로를 그대로 쓴다 — buildImagePrompt 가 컷 하나만 받기 때문이다.
둘 다 없어도 컷을 버리지 않는다(motion·speed 와 같은 취급).
```

```bash
git add lib/validate.js tests/validate.test.js
git commit -F <scratchpad>/t1.txt
```

---

### Task 2: 참조어·카메라 어휘 필터

**Files:**
- Modify: `lib/cuts.js` (`stillOnly` 근처, `CAMERA_WORDS` 아래)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: Task 1 의 `cut.tone` · `cut.transition`
- Produces: `lib/cuts.js` 에서 두 함수를 **export** 한다.
  - `usableTone(tone: string|undefined): string` — 카메라 어휘가 있으면 `""`, 없으면 원문
  - `usableTransition(transition: string|undefined): string` — 참조어가 있으면 `""`, 없으면 원문

  둘 다 값이 없으면 `""` 를 돌려준다. **저장값은 건드리지 않는다** — 걸러 쓰기만 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cuts.test.js` 에 추가한다. import 줄에 `usableTone, usableTransition` 을 더한다.

```js
describe("톤·전환 필터", () => {
  it("카메라 어휘가 든 톤은 안 쓴다", () => {
    // 정지 이미지 프롬프트에 카메라 지시가 새면 그림이 그것을 암시하게 그려진다
    expect(usableTone("천천히 줌 인하는 시네마틱 질감")).toBe("");
    expect(usableTone("카메라가 도는 느낌")).toBe("");
  });

  it("정상 톤은 온전히 쓴다", () => {
    // 과잉 필터로 정상값을 날리면 이 기능이 아무 일도 안 한다
    const t = "어두운 배경에 제품 색만 채도를 올린 시네마틱 광고 필름 질감";
    expect(usableTone(t)).toBe(t);
  });

  it("참조어가 든 전환은 통째로 버린다", () => {
    // 이미지 모델은 '앞 컷'을 모른다 — 일부만 자르면 짧은 구도 서술의 뜻이 무너진다
    expect(usableTransition("앞 컷에서 이어지는 발 클로즈업")).toBe("");
    expect(usableTransition("직전 컷과 같은 구도")).toBe("");
    expect(usableTransition("방금 본 손이 그대로")).toBe("");
  });

  it("자기 완결적인 전환은 쓴다", () => {
    const t = "발 클로즈업, 아스팔트 위, 같은 눈높이";
    expect(usableTransition(t)).toBe(t);
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(usableTone(undefined)).toBe("");
    expect(usableTransition(undefined)).toBe("");
    expect(usableTone("  ")).toBe("");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "톤·전환 필터"`
Expected: FAIL — `usableTone is not a function` (또는 import 에러).

- [ ] **Step 3: 최소 구현**

`lib/cuts.js` 의 `stillOnly` 함수 **아래**에 붙인다(`CAMERA_WORDS` 는 그 위에 이미 있다):

```js
// 앞 컷을 가리키는 말. 이미지 모델은 앞 컷을 모르므로 이런 값이 그대로 들어가면
// 그림 지시가 아니라 소음이 된다 — stillOnly 를 만든 것과 같은 결함이다.
const CUT_REFERENCE = /(앞\s?컷|이전\s?컷|직전|방금|같은\s?컷|바로\s?전)/;

// 톤에서 쓸 수 있는 것만 — 카메라 어휘가 섞이면 통째로 버린다.
//
// stillOnly 를 쓰지 않는 이유: 그것은 절을 나눠 정지형 종결만 남기는데, 톤은
// "채도를 올린 시네마틱 질감"처럼 명사·관형형으로 끝나 통째로 날아간다.
// 막으려는 것은 움직임 종결이 아니라 카메라 지시 하나다.
export function usableTone(tone) {
  const t = typeof tone === "string" ? tone.trim() : "";
  if (!t) return "";
  // CAMERA_WORDS 는 g 플래그라 lastIndex 가 남는다 — 매번 0으로 되돌린다
  CAMERA_WORDS.lastIndex = 0;
  return CAMERA_WORDS.test(t) ? "" : t;
}

// 전환에서 쓸 수 있는 것만 — 참조어가 있으면 통째로 버린다.
// 전환 하나가 빠지는 것이 그림이 틀리는 것보다 싸다.
export function usableTransition(transition) {
  const t = typeof transition === "string" ? transition.trim() : "";
  if (!t) return "";
  return CUT_REFERENCE.test(t) ? "" : t;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS — 새 5개 + 기존 전부.

⚠️ `CAMERA_WORDS` 에 `g` 플래그가 있어 `test()` 를 연달아 부르면 결과가 번갈아 나온다. `lastIndex = 0` 이 그것을 막는다. 위 테스트의 두 `usableTone("...")` 연속 호출이 이 함정을 잡는다.

- [ ] **Step 5: 커밋**

```
feat(cuts): 톤·전환을 걸러 쓴다 — 그림 지시로 새지 않게

'앞 컷'은 이미지 모델이 모르는 말이고, 카메라 어휘는 정지 그림을 오염시킨다
(stillOnly 를 만든 것과 같은 결함). 저장값은 건드리지 않고 쓸 때만 거른다.
걸리면 통째로 버린다 — 짧은 서술이라 일부만 자르면 뜻이 무너진다.
```

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -F <scratchpad>/t2.txt
```

---

### Task 3: 이미지 프롬프트에 주입

**Files:**
- Modify: `lib/cuts.js:306-400` (`buildImagePrompt`)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: Task 2 의 `usableTone`·`usableTransition`
- Produces: `buildImagePrompt(cut, project, refs)` 결과 문자열에 톤·전환 문장이 들어간다. 두 값이 없으면 **결과가 이전과 글자 그대로 같다**.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("buildImagePrompt — 톤·전환", () => {
  const project = {
    settings: { aspect_ratio: "9:16" },
    briefing: { topic: "농구화" },
  };
  const cut = { idx: 1, shows: "제품이 놓여 있다", sentence: "문장" };

  it("두 값이 없으면 프롬프트가 글자 그대로 같다", () => {
    // 이 작업의 유일한 하드 제약 — 기존 프로젝트의 그림이 달라지면 안 된다
    const before = buildImagePrompt(cut, project);
    const after = buildImagePrompt({ ...cut, tone: "", transition: "" }, project);
    expect(after).toBe(before);
  });

  it("톤을 프롬프트에 싣는다", () => {
    const p = buildImagePrompt({ ...cut, tone: "채도를 올린 시네마틱 질감" }, project);
    expect(p).toContain("채도를 올린 시네마틱 질감");
  });

  it("전환을 프롬프트에 싣는다", () => {
    const p = buildImagePrompt({ ...cut, transition: "발 클로즈업, 같은 눈높이" }, project);
    expect(p).toContain("발 클로즈업, 같은 눈높이");
  });

  it("카메라 어휘가 든 톤은 안 싣는다", () => {
    const p = buildImagePrompt({ ...cut, tone: "천천히 줌 인하는 질감" }, project);
    expect(p).not.toContain("줌 인");
  });

  it("참조어가 든 전환은 안 싣는다", () => {
    const p = buildImagePrompt({ ...cut, transition: "앞 컷에서 이어지는 발" }, project);
    expect(p).not.toContain("앞 컷");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "buildImagePrompt — 톤·전환"`
Expected: FAIL — "톤을 프롬프트에 싣는다" 가 실패한다. (첫 테스트는 이미 통과할 수 있다 — 아직 아무것도 안 실으니까. 그것이 정상이고, 구현 뒤에도 통과해야 한다.)

- [ ] **Step 3: 최소 구현**

`buildImagePrompt` 의 `return p;` **직전**, `edit_instruction` 블록 **위**에 넣는다. 사용자 수정 지시가 항상 마지막에 오게 유지한다:

```js
  // 톤 — 영상 전체가 같은 색·질감으로 보이게. 컷마다 그림을 따로 만들기 때문에
  // 이 문자열이 전 컷에 똑같이 들어가는 것이 곧 일관성이다.
  const tone = usableTone(cut.tone);
  if (tone) p += ` Overall look and color treatment, keep identical across all cuts: ${tone}.`;
  // 전환 — 이 컷이 시작하는 구도. 앞 컷 끝과 이어 보이게 한다.
  const trans = usableTransition(cut.transition);
  if (trans) p += ` Compose the opening framing as: ${trans}.`;

  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS — 5개 전부. 특히 첫 테스트("글자 그대로 같다")가 여전히 통과해야 한다.

- [ ] **Step 5: 커밋**

```
feat(image): 톤과 전환을 그림 프롬프트에 싣는다

컬러는 shows 문장이 아니라 이미지 단계에서 결정된다. 매치컷도 같다 —
컷 B의 이미지가 A의 끝과 같은 구도여야 이어 보인다. 두 값이 없으면
프롬프트가 글자 그대로 같다.
```

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -F <scratchpad>/t3.txt
```

---

### Task 4: 화면 설계 지문에 규칙 추가

**Files:**
- Modify: `lib/cuts.js:147-225` (`SHOWS_SYSTEM`)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: 없음 (지문 문자열만 바꾼다)
- Produces: 모델이 `{ tone, environment, shots: [{ shows, motion, speed, transition }] }` 을 답한다. Task 1 의 `validateShows` 가 그것을 받는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

지문은 문자열이라 "무엇을 시켰는가"만 잴 수 있다. 그래도 잰다 — 규칙이 조용히 빠지는 것을 막는다.

```js
describe("SHOWS_SYSTEM — 톤·전환 규칙", () => {
  it("출력 형식에 tone 과 transition 이 있다", () => {
    const { system } = buildShowsMessages(
      { briefing: { topic: "t" }, script: { text: "s" }, material: { photos: [] } },
      [{ sentence: "가" }]
    );
    expect(system).toContain('"tone"');
    expect(system).toContain('"transition"');
  });

  it("전환을 자기 완결적으로 쓰라고 시킨다", () => {
    const { system } = buildShowsMessages(
      { briefing: { topic: "t" }, script: { text: "s" }, material: { photos: [] } },
      [{ sentence: "가" }]
    );
    // 이 지시가 없으면 모델이 "앞 컷에서 이어진다"를 쓰고 코드가 통째로 버린다
    expect(system).toContain("앞 컷");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "SHOWS_SYSTEM"`
Expected: FAIL — `'"tone"'` 이 지문에 없다.

- [ ] **Step 3: 최소 구현**

`SHOWS_SYSTEM` 의 출력 형식 줄에 `tone` 을 더하고 각 shot 에 `transition` 을 더한다. 그리고 규칙 두 개를 본문에 추가한다:

```
- **tone 은 영상 하나의 색과 질감이다.** 컬러 그레이딩·명암·필름 질감을 한 문장으로 적는다.
  전 컷이 이 하나를 공유하므로 특정 컷에만 맞는 말을 쓰지 않는다.
  장소·시간대·조명은 environment 가 맡는다 — 여기서 되풀이하지 않는다.
  ✓ "어두운 배경에 제품 색만 채도를 올린 시네마틱 광고 필름 질감"
  ✗ "체육관, 스포트라이트"(그건 environment 다)
- **transition 은 이 컷이 시작하는 구도다.** 앞 컷 끝과 이어 보이게 하는 값이라 첫 컷에는 없다.
  ★ **앞 컷을 가리키는 말을 쓰지 않는다.** 그림을 그리는 쪽은 앞 컷을 볼 수 없다 —
  이어짐을 **구도로 번역해** 그 자체로 읽히게 적는다.
  ✗ "앞 컷에서 이어진다" / "직전 컷과 같은 각도"
  ✓ "발 클로즈업, 아스팔트 위, 같은 눈높이"
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: PASS — 전부.

- [ ] **Step 5: 커밋**

```
feat(shows): 톤과 전환을 답하라고 시킨다

전환은 앞 컷을 가리키는 말 없이 구도로 번역해 쓰게 한다 — 그림을 그리는 쪽은
앞 컷을 볼 수 없다. 코드도 같은 것을 판정하지만(usableTransition) 지문이
먼저 맞으면 버려지는 값이 준다.
```

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -F <scratchpad>/t4.txt
```

---

### Task 5: 낡음 판정 — `image.tone_of`

**Files:**
- Modify: `lib/steps.js:172-180` (`isImageStale`)
- Modify: `lib/pipeline.js:251` (각인을 붙이는 자리)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: Task 2 의 `usableTone`·`usableTransition`
- Produces: `lib/steps.js` 가 `toneKey(cut): string` 을 export 한다 — 쓸 수 있는 톤·전환을 `"\n"` 으로 이은 한 줄. 둘 다 없으면 `""`. `pipeline.js` 는 이 값이 **비어 있지 않을 때만** `image.tone_of` 를 붙인다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("isImageStale — 톤 각인", () => {
  it("각인이 없던 그림은 안 낡는다", () => {
    // 옛 프로젝트가 통째로 낡으면 재구매가 제시된다 — style_of 때 겪은 함정이다
    const cut = { shows: "가", image: { url: "u", of: "가" } };
    expect(isImageStale(cut, {})).toBe(false);
  });

  it("톤이 바뀌면 낡는다", () => {
    const cut = { shows: "가", tone: "새 톤", image: { url: "u", of: "가", tone_of: "옛 톤" } };
    expect(isImageStale(cut, {})).toBe(true);
  });

  it("톤이 그대로면 안 낡는다", () => {
    const cut = { shows: "가", tone: "같은 톤", image: { url: "u", of: "가", tone_of: "같은 톤" } };
    expect(isImageStale(cut, {})).toBe(false);
  });

  it("걸러지는 값은 각인에 안 들어간다", () => {
    // 쓰이지 않는 값으로 낡음을 판정하면 그림이 안 바뀌는데 낡았다고 나온다
    expect(toneKey({ tone: "천천히 줌 인", transition: "앞 컷에서" })).toBe("");
  });

  it("톤과 전환을 한 줄로 굳힌다", () => {
    expect(toneKey({ tone: "질감", transition: "구도" })).toBe("질감\n구도");
    expect(toneKey({ tone: "질감" })).toBe("질감\n");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js -t "톤 각인"`
Expected: FAIL — `toneKey is not a function`.

- [ ] **Step 3: 최소 구현**

`lib/steps.js` 상단 import 에 `usableTone, usableTransition` 을 더하고, `isImageStale` **위**에 넣는다:

```js
// 그림에 실제로 들어간 톤·전환을 한 줄로 굳힌다 — 걸러진 값은 그림에 안 들어가므로
// 각인에도 안 들어간다. 안 그러면 그림이 안 바뀌는데 낡았다고 나온다.
export function toneKey(cut) {
  const tone = usableTone(cut?.tone);
  const trans = usableTransition(cut?.transition);
  if (!tone && !trans) return "";
  return `${tone}\n${trans}`;
}
```

그리고 `isImageStale` 의 `style_of` 판정 **뒤**에 세 번째 축을 더한다:

```js
export function isImageStale(cut, project) {
  const of = cut?.image?.of;
  if (of !== undefined && of !== (cut.shows || "")) return true;
  // 톤·전환 — style_of 와 같은 이유로 별도 필드다. 없던 그림은 안 낡는다.
  const toneOf = cut?.image?.tone_of;
  if (toneOf !== undefined && toneOf !== toneKey(cut)) return true;
  const styleOf = cut?.image?.style_of;
  if (styleOf === undefined) return false;
  if (!project || typeof project !== "object") return false;
  return styleOf !== styleKey(project);
}
```

`lib/pipeline.js:251` 의 각인 조립을 고친다:

```js
  const engraved = (url) => {
    const base = { url, of: cut.shows || "", style_of: styleKey(project) };
    // 빈 각인은 안 붙인다 — undefined 가 아니게 되는 순간 판정에 들어온다
    const tk = toneKey(cut);
    return tk ? { ...base, tone_of: tk } : base;
  };
```

`pipeline.js` 상단 import 에 `toneKey` 를 더한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run`
Expected: PASS — 전체. 특히 기존 낡음 테스트가 전부 그대로여야 한다.

- [ ] **Step 5: 커밋**

```
feat(staleness): 톤이 바뀌면 그림이 낡는다 — 옛 그림은 그대로 둔 채

image.tone_of 를 세 번째 축으로 더한다. of(화면 설명)·style_of(화풍)에 합치지
않는 이유는 style_of 를 가른 이유와 같다 — 합치면 각인 없던 옛 그림이 전부
불일치가 되어 재구매가 제시된다. 걸러지는 값은 그림에 안 들어가므로 각인에도
안 넣는다.
```

```bash
git add lib/steps.js lib/pipeline.js tests/steps.test.js
git commit -F <scratchpad>/t5.txt
```

---

### Task 6: 관통 확인

**Files:**
- Test: `tests/cuts.test.js` (통합 테스트 한 개)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음 (검증만)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
it("화면 설계 응답 하나가 그림 프롬프트까지 관통한다", () => {
  // 태스크 경계마다 리뷰를 통과해도 사이가 비는 일이 이 저장소에서 반복됐다
  const shots = validateShows(
    {
      tone: "채도를 올린 시네마틱 질감",
      environment: "실내 체육관, 야간",
      shots: [
        { shows: "제품이 놓여 있다" },
        { shows: "달리는 발", transition: "발 클로즈업, 아스팔트 위" },
      ],
    },
    2
  );
  const project = { settings: { aspect_ratio: "9:16" }, briefing: { topic: "농구화" } };
  const p0 = buildImagePrompt({ ...shots[0], idx: 0, sentence: "가" }, project);
  const p1 = buildImagePrompt({ ...shots[1], idx: 1, sentence: "나" }, project);

  // 톤은 두 컷에 똑같이
  expect(p0).toContain("채도를 올린 시네마틱 질감");
  expect(p1).toContain("채도를 올린 시네마틱 질감");
  // 전환은 둘째 컷에만
  expect(p0).not.toContain("아스팔트");
  expect(p1).toContain("발 클로즈업, 아스팔트 위");
  // 각인은 컷마다 다르다 — 전환이 다르기 때문이다
  expect(toneKey(shots[0])).not.toBe(toneKey(shots[1]));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js -t "관통"`
Expected: Task 1~5 가 다 됐으면 **바로 통과할 수 있다.** 통과하면 그대로 두고 다음 단계로 간다. 실패하면 어느 경계가 비었는지가 곧 답이다.

- [ ] **Step 3: 전체 테스트**

Run: `npx vitest run`
Expected: PASS — 전부 그린.

- [ ] **Step 4: 커밋**

```
test(cuts): 화면 설계에서 그림 프롬프트까지 관통을 고정한다

태스크 경계마다 리뷰를 통과해도 그 사이가 비는 일이 반복됐다 —
값이 어디서 만들어져 어디까지 흐르는지를 테스트 하나가 쥔다.
```

```bash
git add tests/cuts.test.js
git commit -F <scratchpad>/t6.txt
```

---

## 남는 것 (이 계획 밖)

- **라이브 검증 미완.** 실제 LLM 이 `tone`·`transition` 을 쓸 만하게 답하는지는 돌려봐야 안다. `SHOTFORM_FAKE=fal` 이면 LLM 만 진짜라 fal 비용 0원이다: `node scripts/measure/run-pipeline.mjs thin 1 --cuts`
- **`environment` 와 `tone` 의 경계**가 이 설계의 약한 고리다. 라이브에서 둘이 겹치면 지문을 조정한다.
- 편집 리듬 · 사운드 아크는 스펙의 "범위 밖" 참조.
