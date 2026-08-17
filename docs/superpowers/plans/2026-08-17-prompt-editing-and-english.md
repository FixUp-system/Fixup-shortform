# 프롬프트 편집·프로젝트 공통 지시·영문화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 컷마다 실제 프롬프트를 보고 고칠 수 있게 하고, 프로젝트 공통 지시를 ①자료에서 받고, 모델이 읽는 값을 영어로 쓴다.

**Architecture:** 프롬프트를 **본문(사장님이 갈아 끼운다)** 과 **꼬리(코드가 항상 뒤에 붙인다)** 로 가른다. 덮어쓰기는 컷의 선택 필드(`image_prompt`·`clip_prompt`)로 저장하고 각인에 **있을 때만** 담는다. 언어는 SYSTEM 프롬프트의 지시와 **예시 값**으로 바꾼다 — 번역 단계를 새로 두지 않는다.

**Tech Stack:** Next.js 15 App Router · 순수 JS · vitest · Supabase(jsonb `projects.doc`) · fal.ai · `claude-opus-5`

**Spec:** `docs/superpowers/specs/2026-08-17-prompt-editing-and-english-design.md`

## Global Constraints

모든 태스크의 요구사항에 아래가 암묵적으로 포함된다.

1. **각인은 "있을 때만" 덧붙인다.** 새 값이 없는 컷·프로젝트의 각인 문자열은 **글자 그대로** 지금과 같아야 한다. 아니면 이미 값을 치른 그림·클립이 통째로 낡아 재구매가 제시된다.
2. **프롬프트에 실리는 것만 각인에 담는다.** 실리는데 안 담으면 고쳐도 안 낡고, 안 실리는데 담으면 거짓 낡음이 유료 버튼을 연다.
3. **판정을 두 벌로 두지 않는다.** 프롬프트를 만드는 자리와 각인을 만드는 자리가 **같은 함수**를 봐야 한다.
4. **화면이 import 하는 모듈은 `fs` 를 끌면 안 된다** (`lib/scenario-rules.js` 가 그래서 따로 있다).
5. **`npx vitest run` 초록이 유일한 판정이다.** 린터·타입체커가 없다.
6. 주석·오류 문구·화면 문구는 **한국어**. 프롬프트 안에서 **모델이 읽는 값**만 영어.
7. **유료 호출(fal·라이브 LLM)을 실행하지 않는다.** 검증은 테스트와 `fetchImpl` 가로채기($0)로만.

---

## Task 1: 이미지 프롬프트를 본문과 꼬리로 가른다

**이 태스크가 이 계획에서 가장 위험하다.** 리팩터가 기존 프롬프트를 한 글자라도 바꾸면 앞으로 만들 그림이 조용히 달라진다.

**Files:**
- Modify: `lib/cuts.js` (`buildImagePrompt`, 653-757행)
- Test: `tests/prompt-override.test.js` (신규)

**Interfaces:**
- Produces: `buildImagePrompt(cut, project, refs)` — 시그니처 그대로. 내부에 `imagePromptBody(cut, project)` 와 `imagePromptTail(cut, project, refs)` 를 새로 두되 **export 하지 않는다**(호출부가 늘면 판정이 두 벌이 된다).

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 갈라도 글자가 같다**

`tests/prompt-override.test.js`:

```js
// ★ 이 파일이 지키는 것 하나: **덮어쓰기가 없으면 프롬프트가 글자 그대로 지금과 같다.**
// 본문/꼬리로 가르는 리팩터는 조용히 실패한다 — 문구가 한 글자 달라져도 테스트는 초록인데
// 앞으로 만들 그림이 달라진다. 그래서 기대값을 **손으로 적어** 못 박는다.
import { describe, it, expect } from "vitest";
import { buildImagePrompt } from "../lib/cuts.js";

const project = {
  scenario: { focus: { mode: "물건", subject: "black high-top basketball shoe", look: "black upper with red sole" } },
  settings: { aspect_ratio: "9:16" },
};
const cut = { idx: 0, shows: "close-up of the shoe on wet asphalt", tone: "high-contrast night film grain" };

describe("이미지 프롬프트 — 본문과 꼬리", () => {
  it("★ 덮어쓰기가 없으면 지금과 글자 그대로 같다", () => {
    expect(buildImagePrompt(cut, project, [])).toBe(
      "High-quality photographic still for a short-form video, vertical 9:16 composition. " +
      "Scene: close-up of the shoe on wet asphalt. " +
      "The video's subject is: black high-top basketball shoe. " +
      "Keep this exact product/subject consistent in every scene. " +
      "Its appearance, identical in every scene: black upper with red sole. " +
      "Cinematic lighting, realistic, no text or letters in the image. " +
      "Overall look and color treatment, keep identical across all cuts: high-contrast night film grain."
    );
  });
});
```

> 구현자에게: 위 기대 문자열은 **지금 코드가 내는 값**이어야 한다. 먼저 `node -e` 로 현재
> 값을 찍어 확인하고, 다르면 **기대값을 현재 값에 맞춘다**(코드를 기대값에 맞추지 않는다).
> 이 테스트의 목적은 "지금 값을 고정"하는 것이다.

- [ ] **Step 2: 돌려서 통과를 확인한다 (리팩터 전이므로 초록이어야 한다)**

Run: `npx vitest run tests/prompt-override.test.js`
Expected: PASS. 실패하면 기대 문자열이 틀린 것이다 — 고친다.

- [ ] **Step 3: 본문과 꼬리로 가른다**

`buildImagePrompt` 안을 두 조각으로 나눈다. **문자열 조립 순서와 공백을 그대로 유지한다.**

```js
// 프롬프트는 두 조각이다.
//
// **본문(창작부)** — 이 컷이 무엇을 보여 주는가. 사장님이 통째로 갈아 끼울 수 있다(Task 3).
// **꼬리(계약부)** — 코드가 언제나 본문 뒤에 붙인다. 사장님이 무엇을 쓰든 지워지지 않는다.
//
// ★ 이 자리는 새로 만든 규칙이 아니다. 아래 주석("위치가 방어다")이 이미 같은 말을 하고,
//   Style note 와 edit_instruction 이 이미 그렇게 산다. 여기서 하는 일은 그 경계에
//   **이름을 주는 것**뿐이다 — 갈라 놓아야 사장님이 본문만 갈아 끼울 수 있다.
//
// ⚠️ 가르면서 문구가 한 글자라도 달라지면 앞으로 만들 그림이 조용히 달라진다.
//    tests/prompt-override.test.js 의 첫 테스트가 그것을 못 박는다.
function imagePromptBody(cut, project) {
  /* 653-712행에서 `let p = ...` 까지를 그대로 옮기되, 마지막 문장의
     `${style.finish}, no text or letters in the image.` 부분은 꼬리로 넘긴다 */
}

function imagePromptTail(cut, project, refs) {
  /* style.finish + 글자 금지 + 레퍼런스 결속(713-742행) + 톤·전환·edit_instruction */
}
```

**경계를 정확히 어디에 두는가** — 아래 표대로 한다.

| 조각 | 무엇 |
|---|---|
| 본문 | `${style.medium} for a short-form video, ${orient} composition. Scene: ${shows}.${stage}${castClause}${subject}${noteClause}` |
| 꼬리 | ` ${style.finish}, no text or letters in the image.` + 레퍼런스 절 + 톤 + 전환 + `edit_instruction` |

> `orient`(판형)가 본문에 있는 것은 지금 문형이 그래서다. 사장님이 본문을 갈아 끼우면
> 판형이 사라지므로, **Task 3 에서 덮어쓰기 경로에만** 판형을 꼬리로 다시 붙인다.
> 지금 여기서 옮기면 기존 프롬프트가 바뀐다.

- [ ] **Step 4: 테스트를 돌려 글자가 안 바뀐 것을 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (2,688 + 새 테스트). 하나라도 깨지면 가르는 경계가 틀린 것이다.

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/prompt-override.test.js
git commit -m "refactor(cuts): 이미지 프롬프트를 본문과 꼬리로 가른다 — 글자는 그대로"
```

---

## Task 2: 영상 프롬프트를 본문과 꼬리로 가른다

**Files:**
- Modify: `lib/cuts.js` (`buildClipPrompt`, 865-912행)
- Test: `tests/prompt-override.test.js` (Task 1 파일에 describe 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `buildClipPrompt(cut, project)` — 시그니처 그대로. 내부에 `clipPromptBody(cut)`.

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 세 갈래 전부 글자가 같다**

`buildClipPrompt` 는 갈래가 셋이다(내레이션 / 화면 안 대사 / 무음). 셋 다 고정한다.

```js
describe("영상 프롬프트 — 본문과 꼬리", () => {
  const proj = { settings: {} };

  it("★ 무음 컷 — 지금과 글자 그대로 같다", () => {
    const c = { idx: 0, motion: "slow push-in", silent: true };
    expect(buildClipPrompt(c, proj)).toBe(
      "slow push-in. The attached image is the first frame — continue naturally from it. " +
      "Keep the subject and style unchanged. No text or letters. No talking faces or lip sync."
    );
  });

  it("★ 대사 절이 꼬리에 남는다 — 자막과 갈리면 안 된다", () => {
    // 같은 문자열을 ffmpeg 가 자막으로 태운다(lib/subtitles.js).
    const c = { idx: 0, motion: "slow push-in", sentence: "핑계 대지 마세요", narration: true };
    const p = { ...proj, scenario: { narrator_voice: "calm low male voice" } };
    expect(buildClipPrompt(c, p)).toContain('Says exactly, in Korean: "핑계 대지 마세요"');
  });
});
```

> 구현자에게: Task 1 과 같다 — 먼저 현재 값을 찍어 기대값을 맞춘다. 내레이션 갈래는
> `speechFor` 가 프로젝트에서 목소리를 판다(`lib/cuts.js`), 픽스처가 안 맞으면 그것부터 본다.

- [ ] **Step 2: 돌려서 통과를 확인한다**

Run: `npx vitest run tests/prompt-override.test.js`
Expected: PASS

- [ ] **Step 3: 본문만 갈라낸다**

```js
// 본문 = 움직임 + 속도. 그 뒤는 전부 꼬리다.
//
// ★ 대사·목소리·립싱크 지시는 **꼬리**다. 사장님이 영상 프롬프트에서 대사를 고칠 수
//   있으면 들리는 말과 화면의 자막이 갈린다 — 같은 문자열을 ffmpeg 가 태운다
//   (lib/subtitles.js). 대사를 고치는 자리는 ②시나리오의 대사 칸이다.
function clipPromptBody(cut) {
  const axisText = axesOf(cut).map((a) => a.text).join(". ");
  const base = axisText || (typeof cut?.motion === "string" ? cut.motion.trim() : "") || "거의 정지 상태, 아주 느린 카메라 이동";
  const pace = isSpeed(cut?.speed) ? ` ${speedFor(cut.speed).clip}.` : "";
  return `${base}.${pace}`;
}
```

`buildClipPrompt` 의 세 `return` 이 전부 `clipPromptBody(cut)` 로 시작하게 고친다. 나머지 문자열은 손대지 않는다.

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/prompt-override.test.js
git commit -m "refactor(cuts): 영상 프롬프트의 본문을 갈라낸다 — 대사는 꼬리에 남는다"
```

---

## Task 3: 컷별 덮어쓰기를 받는다

**Files:**
- Modify: `lib/cuts.js` (`buildImagePrompt`, `buildClipPrompt`)
- Test: `tests/prompt-override.test.js`

**Interfaces:**
- Consumes: Task 1·2 의 `imagePromptBody`/`imagePromptTail`/`clipPromptBody`
- Produces: 컷 필드 `image_prompt`(문자열, 선택) · `clip_prompt`(문자열, 선택)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("컷별 프롬프트 덮어쓰기", () => {
  it("★ 덮어써도 꼬리는 남는다 — 글자 금지가 지워지지 않는다", () => {
    const c = { ...cut, image_prompt: "A huge neon sign that says SALE in big letters" };
    const out = buildImagePrompt(c, project, []);
    expect(out).toContain("A huge neon sign that says SALE in big letters");
    expect(out, "글자 금지가 사라졌다 — 사장님 입력이 우리 계약을 지웠다").toContain("no text or letters in the image");
  });

  it("★ 덮어쓰면 판형이 꼬리에 붙는다 — 본문이 통째로 갈렸으므로", () => {
    const c = { ...cut, image_prompt: "A cat" };
    expect(buildImagePrompt(c, project, [])).toContain("vertical 9:16 composition");
  });

  it("★ 영상 덮어쓰기 — 대사는 사장님이 못 지운다", () => {
    const c = { idx: 0, sentence: "핑계 대지 마세요", narration: true, clip_prompt: "the shoe explodes" };
    const p = { ...project, scenario: { narrator_voice: "calm low male voice" } };
    const out = buildClipPrompt(c, p);
    expect(out).toContain("the shoe explodes");
    expect(out).toContain('Says exactly, in Korean: "핑계 대지 마세요"');
  });

  it("빈 문자열·공백은 덮어쓰기가 아니다 — 코드가 만든 본문으로 돌아간다", () => {
    expect(buildImagePrompt({ ...cut, image_prompt: "   " }, project, []))
      .toBe(buildImagePrompt(cut, project, []));
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-override.test.js`
Expected: FAIL — `image_prompt` 가 무시되어 본문이 그대로다

- [ ] **Step 3: 덮어쓰기를 받는다**

```js
// 사장님이 본문을 통째로 갈아 끼운 경우. 꼬리는 코드가 그대로 붙인다.
//
// ★ 판형을 여기서 다시 붙인다 — 본문 문형에 있던 값이라(`${orient} composition`)
//   본문을 갈아 끼우면 사라진다. 판형이 틀리면 합성이 깨진다.
// ★ 공백뿐인 값은 덮어쓰기로 안 본다 — 사장님이 지우면 코드가 만든 본문으로 돌아간다.
//   그것이 "원래대로" 버튼의 구현이다(별도 필드를 두지 않는다).
const override = typeof cut?.image_prompt === "string" ? cut.image_prompt.trim() : "";
const body = override
  ? `${override} ${orientOf(project)} composition.`
  : imagePromptBody(cut, project);
```

`buildClipPrompt` 도 같은 모양(`cut.clip_prompt`). 영상 쪽은 판형이 프롬프트에 없으므로 덧붙이지 않는다.

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/prompt-override.test.js
git commit -m "feat(cuts): 컷별 프롬프트 덮어쓰기 — 본문만 갈리고 꼬리는 코드가 지킨다"
```

---

## Task 4: 덮어쓰기를 각인에 담는다

**Files:**
- Modify: `lib/steps.js` (`imageContextKey` 418-432행, `clipKey` 247-320행)
- Test: `tests/prompt-override.test.js`

**Interfaces:**
- Consumes: `cut.image_prompt` · `cut.clip_prompt`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { imageContextKey, clipKey, isImageStale, isClipStale } from "../lib/steps.js";

describe("덮어쓰기와 각인", () => {
  it("★ 덮어쓰기가 없는 컷의 각인은 글자 그대로 그대로다", () => {
    // 이 단언이 지키는 것: 지금 저장된 산출물이 통째로 낡아 재구매가 제시되지 않는다.
    const bare = { idx: 0, shows: "a shoe" };
    expect(imageContextKey(bare, project)).toBe(imageContextKey({ ...bare }, project));
    expect(imageContextKey(bare, project)).not.toContain("prompt:");
    expect(clipKey(bare, project)).not.toContain("prompt:");
  });

  it("★ 덮어쓰면 각인이 바뀐다 — 고쳤는데 조용히 지나가지 않는다", () => {
    const bare = { idx: 0, shows: "a shoe" };
    const edited = { ...bare, image_prompt: "a red shoe" };
    expect(imageContextKey(edited, project)).not.toBe(imageContextKey(bare, project));
  });

  it("★ 덮어쓴 컷의 그림이 낡음으로 뜬다", () => {
    const cutWithImage = {
      idx: 0, shows: "a shoe",
      image: { url: "u", of: "a shoe", context_of: imageContextKey({ idx: 0, shows: "a shoe" }, project) },
      image_prompt: "a red shoe",
    };
    expect(isImageStale(cutWithImage, project)).toBe(true);
  });

  it("★ 덮어쓴 컷의 클립이 낡음으로 뜬다", () => {
    const base = { idx: 0, image: { url: "u" }, seconds: 5, motion: "slow" };
    const edited = { ...base, clip_prompt: "it explodes" };
    const withVideo = { ...edited, video: { url: "v", of: clipKey(base, project) } };
    expect(isClipStale(withVideo, project)).toBe(true);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-override.test.js`
Expected: FAIL — 각인이 안 바뀐다

- [ ] **Step 3: 각인에 담는다**

`imageContextKey` 의 배열에 한 줄 더한다:

```js
    // 사장님이 갈아 끼운 본문 — 프롬프트에 실리므로 각인에 담는다(이 파일의 규칙).
    // ★ 있을 때만. 덮어쓰기를 안 쓴 컷의 각인이 글자 그대로 그대로여야 지금 저장된
    //   그림이 통째로 낡지 않는다 — style_of·해상도·tone_of·자막 위치에서 네 번 겪은 함정이다.
    typeof cut?.image_prompt === "string" && cut.image_prompt.trim()
      ? `prompt:${cut.image_prompt.trim()}` : "",
```

`clipKey` 는 `motionClause` 옆에 같은 모양으로 더하고 `return` 에 잇는다:

```js
  const clipOverride = typeof cut?.clip_prompt === "string" ? cut.clip_prompt.trim() : "";
  const promptClause = clipOverride ? `|prompt:${clipOverride}` : "";
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS. **기존 각인 테스트가 하나라도 깨지면 "있을 때만"이 안 지켜진 것이다.**

- [ ] **Step 5: 커밋**

```bash
git add lib/steps.js tests/prompt-override.test.js
git commit -m "feat(steps): 프롬프트 덮어쓰기를 각인에 담는다 — 있을 때만"
```

---

## Task 5: 프로젝트 공통 지시 두 칸 (`settings.image_note` · `settings.clip_note`)

**★ `settings.style.note` 를 재사용하지 않는다.** 비슷해 보이지만 상한이 **120자**다
(`STYLE_NOTE_MAX`, 근거가 `lib/styles.js:133` 에 적혀 있다). 밖에서 써 온 프롬프트는
보통 300~800자라 **붙여넣기부터 거절당한다.** 화풍 보정 한 줄은 그대로 두고, 새 필드
둘을 만든다.

**Files:**
- Modify: `lib/styles.js` (`PROMPT_NOTE_MAX`, `normalizePromptNote`), `lib/cuts.js` (`buildImagePrompt`·`buildClipPrompt`), `lib/steps.js` (`imageContextKey`·`clipKey`), `app/api/projects/[id]/route.js` (settings 게이트 + import)
- Test: `tests/prompt-override.test.js`

**Interfaces:**
- Produces: `PROMPT_NOTE_MAX = 600` · `normalizePromptNote(raw, label) -> string` — 개행을 눕히고 길이를 재고 던진다. `label` 은 오류 문구에 들어갈 이름("이미지 지시"/"영상 지시")이라 함수를 두 벌 두지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { normalizePromptNote, PROMPT_NOTE_MAX, STYLE_NOTE_MAX } from "../lib/styles.js";

describe("프로젝트 공통 지시", () => {
  it("★ 화풍 보정보다 넉넉하다 — 밖에서 써 온 프롬프트가 들어가야 한다", () => {
    // 이 단언이 지키는 것: style.note 를 재사용하지 않기로 한 이유 그 자체다.
    // 상한이 120 이면 붙여넣기부터 거절당한다.
    expect(PROMPT_NOTE_MAX).toBeGreaterThan(STYLE_NOTE_MAX);
    expect(normalizePromptNote("a".repeat(400), "영상 지시")).toHaveLength(400);
  });

  it("개행을 눕히고 앞뒤를 걷는다 — 프롬프트는 한 줄이다", () => {
    expect(normalizePromptNote("  hand-held\n  documentary feel  ", "영상 지시"))
      .toBe("hand-held documentary feel");
  });

  it("너무 길면 던지고, 이름이 문구에 들어간다", () => {
    expect(() => normalizePromptNote("가".repeat(PROMPT_NOTE_MAX + 1), "영상 지시"))
      .toThrow(/영상 지시.*자까지/);
  });

  it("★ 클립 프롬프트에 실리고, 꼬리보다 앞이다", () => {
    const p = { settings: { clip_note: "hand-held documentary feel" } };
    const out = buildClipPrompt({ idx: 0, motion: "slow push-in", silent: true }, p);
    expect(out).toContain("hand-held documentary feel");
    expect(out.indexOf("hand-held")).toBeLessThan(out.indexOf("The attached image is the first frame"));
  });

  it("★ 이미지 프롬프트에도 실리고, 글자 금지보다 앞이다", () => {
    const p = { ...project, settings: { ...project.settings, image_note: "shot on 35mm film" } };
    const out = buildImagePrompt(cut, p, []);
    expect(out).toContain("shot on 35mm film");
    expect(out.indexOf("35mm")).toBeLessThan(out.indexOf("no text or letters"));
  });

  it("★ 없으면 프롬프트도 각인도 글자 그대로 그대로다", () => {
    const bare = { idx: 0, motion: "slow", image: { url: "u" } };
    expect(buildClipPrompt(bare, { settings: {} })).toBe(buildClipPrompt(bare, {}));
    expect(clipKey(bare, { settings: {} })).not.toContain("clipnote:");
    expect(imageContextKey(cut, project)).not.toContain("imgnote:");
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-override.test.js`
Expected: FAIL — `normalizePromptNote` · `PROMPT_NOTE_MAX` 가 없다

- [ ] **Step 3: 게이트를 만든다**

`lib/styles.js`:

```js
// 프로젝트 공통 지시의 상한. 화풍 보정(STYLE_NOTE_MAX = 120)과 **다른 값이다** —
// 그쪽은 "보정 한 줄"이고 이쪽은 밖에서 써 온 프롬프트 통짜라 300~800자가 예사다.
// 120 을 올려서 재사용하지 않는다: 그 숫자에는 근거가 적혀 있고(위 주석), 화풍 보정을
// 800자로 열어 주는 것은 이 작업이 요청받은 일이 아니다.
export const PROMPT_NOTE_MAX = 600;

// 프로젝트 공통 지시(이미지·영상)의 게이트.
//
// ★ 상자를 둘로 나눈 이유: 영상 지시(움직임·립싱크·시간)를 이미지 프롬프트에 붙이면
//   정지 화면 설계가 망가진다. 그것이 해로운 것은 추측이 아니라 이 저장소가 이미 코드로
//   막고 있는 일이다 — stillOnly() 가 shows 에서 움직임 서술을 걸러낸다(lib/cuts.js).
// ★ label 은 오류 문구에 들어갈 이름이다. 함수를 두 벌 두면 상한이 갈린다.
export function normalizePromptNote(raw, label) {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new Error(`${label}는 글이어야 합니다.`);
  const note = raw.replace(/\s+/g, " ").trim();
  if (note.length > PROMPT_NOTE_MAX) {
    throw new Error(`${label}는 ${PROMPT_NOTE_MAX}자까지예요 (지금 ${note.length}자).`);
  }
  return note;
}
```

- [ ] **Step 4: 프롬프트와 각인에 싣는다**

`buildClipPrompt` — 맥락 절(`context`) **뒤**, 꼬리 **앞**:

```js
  // 프로젝트 공통 지시. 맥락과 꼬리 사이다 — 코드의 계약이 사장님 입력보다 늘 뒤에 남는다.
  const clipNote = typeof project?.settings?.clip_note === "string" ? project.settings.clip_note.trim() : "";
  const clipNoteClause = clipNote ? ` ${clipNote}.` : "";
```

`buildImagePrompt` — 본문 끝(`noteClause` 옆), 꼬리 **앞**:

```js
  const imgNote = typeof project?.settings?.image_note === "string" ? project.settings.image_note.trim() : "";
  const imgNoteClause = imgNote ? ` ${imgNote}.` : "";
```

각인 — 둘 다 **있을 때만**:

```js
  // clipKey
  const noteOf = proj && typeof proj.settings?.clip_note === "string" ? proj.settings.clip_note.trim() : "";
  const clipNoteKey = noteOf ? `|clipnote:${noteOf}` : "";

  // imageContextKey — 배열 항목으로 더한다
  proj.settings?.image_note?.trim() ? `imgnote:${proj.settings.image_note.trim()}` : "",
```

- [ ] **Step 5: PATCH 게이트에 잇는다**

`app/api/projects/[id]/route.js` — import 에 `normalizePromptNote` 를 더하고,
`body.settings?.style` 게이트(189행) 옆에:

```js
  // settings 는 화이트리스트 없이 얕게 머지된다 — 여기서 안 막으면 아무 값이나 들어가고
  // 그 값이 그대로 유료 호출로 나간다(이 파일 113행 주석과 같은 이유).
  for (const [key, label] of [["image_note", "이미지 지시"], ["clip_note", "영상 지시"]]) {
    if (body.settings?.[key] === undefined) continue;
    try {
      body.settings[key] = normalizePromptNote(body.settings[key], label);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
```

> settings 는 화이트리스트 없이 얕게 머지된다 — 여기서 안 막으면 아무 값이나 들어가고
> 그 값이 유료 호출로 나간다(같은 파일 113행 주석).

- [ ] **Step 6: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/styles.js lib/cuts.js lib/steps.js "app/api/projects/[id]/route.js" tests/prompt-override.test.js
git commit -m "feat: 프로젝트 공통 지시 두 칸 — style.note(120자)를 재사용하지 않는다"
```

---

## Task 6: 덮어쓰기 저장 경로 — PATCH 화이트리스트와 비우기

**Files:**
- Modify: `app/api/projects/[id]/route.js` (컷 화이트리스트 262행)
- Test: `tests/prompt-override.test.js`

**Interfaces:**
- Consumes: `PATCH /api/projects/[id]` 의 `{ cut: { idx, image_prompt } }`
- Produces: 빈 문자열을 보내면 필드가 **지워진다**(컷 모양이 원래대로 돌아간다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

라우트 테스트는 저장소 픽스처가 필요하다 — 이 저장소의 기존 라우트 테스트 모양을 그대로 따른다(`tests/minor1-uncovered-routes.test.js` 의 `SHOTFORM_STORE=memory` + `resetMemoryStore()` 준비를 그대로 베낀다).

```js
import { PATCH } from "../app/api/projects/[id]/route.js";
import { resetMemoryStore } from "../lib/store/memory.js";

const patchCut = (id, cut) =>
  PATCH(new Request("http://x", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cut }),
  }), { params: Promise.resolve({ id }) });

describe("덮어쓰기 저장", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 값을 보내면 컷에 담긴다", async () => {
    const id = await seedProjectWithCuts();          // 기존 헬퍼를 따른다
    await patchCut(id, { idx: 0, image_prompt: "  a red shoe  " });
    const cut = (await loadProject(id)).cuts[0];
    expect(cut.image_prompt, "앞뒤 공백이 안 걷혔다").toBe("a red shoe");
  });

  it("★ 빈 값을 보내면 필드가 **지워진다** — 그것이 '원래대로' 버튼이다", async () => {
    // 지금 화이트리스트(262행)는 `.trim()` 이 참일 때만 담으므로 비우기가 아예 안 된다.
    // 필드가 빈 문자열로 남으면 각인에는 안 잡히지만 컷 모양이 옛 컷과 달라진다 —
    // 이 저장소는 "옛 컷과 글자 그대로 같은 모양"을 각인의 전제로 쓴다.
    const id = await seedProjectWithCuts();
    await patchCut(id, { idx: 0, image_prompt: "a red shoe" });
    await patchCut(id, { idx: 0, image_prompt: "" });
    const cut = (await loadProject(id)).cuts[0];
    expect("image_prompt" in cut, "필드가 남아 있다 — 지워져야 한다").toBe(false);
  });

  it("다른 컷은 안 건드린다", async () => {
    const id = await seedProjectWithCuts();
    await patchCut(id, { idx: 0, image_prompt: "a red shoe" });
    expect((await loadProject(id)).cuts[1].image_prompt).toBeUndefined();
  });
});
```

> 구현자에게: `seedProjectWithCuts`·`loadProject` 는 기존 라우트 테스트가 쓰는 준비 코드를
> 그대로 베껴 쓴다. 이 저장소에 공용 헬퍼가 없으면 이 파일 안에 지역 함수로 둔다 —
> 테스트 사이에 공유 상태를 만들지 않는다.

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-override.test.js`

- [ ] **Step 3: 화이트리스트에 더하고 비우기를 만든다**

```js
        // ★ 프롬프트 덮어쓰기는 **비울 수 있어야 한다** — 그것이 "원래대로" 버튼이다.
        //   위 루프는 trim() 이 참일 때만 담으므로 빈 값이 무시된다. 그래서 따로 본다:
        //   값이 있으면 담고, 빈 문자열이면 **필드를 지운다**(옛 컷과 같은 모양으로 되돌린다).
        for (const key of ["image_prompt", "clip_prompt"]) {
          if (typeof body.cut[key] !== "string") continue;
          const v = body.cut[key].trim();
          if (v) patch[key] = v;
          else patch[key] = undefined; // 아래 머지에서 지운다
        }
```

머지 자리(285행)에서 `undefined` 를 지우도록 고친다:

```js
          next.cuts = proj.cuts.map((c) => {
            if (c.idx !== body.cut.idx) return c;
            const merged = { ...c, ...patch };
            for (const k of Object.keys(patch)) if (patch[k] === undefined) delete merged[k];
            return merged;
          });
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/api/projects/[id]/route.js" tests/prompt-override.test.js
git commit -m "feat(api): 프롬프트 덮어쓰기를 저장하고 비운다 — 빈 값이 원래대로다"
```

---

## Task 7: ④이미지 화면 — 프롬프트를 보이고 고친다

**Files:**
- Modify: `app/create/[id]/images/page.js` (컷 카드, 440-475행)
- Test: `tests/prompt-editing-ui.test.js` (신규 — 이 저장소는 화면을 **파일 내용**으로 잰다, `tests/step-advance-race.test.js` 참고)

**Interfaces:**
- Consumes: `buildImagePrompt` (화면에서 직접 부른다 — 서버가 만드는 것과 **같은 함수**여야 사장님이 보는 것과 나가는 것이 같다)

> ✅ **확인했다(2026-08-17): 화면이 `lib/cuts.js` 를 import 해도 된다.** 그 사슬
> (`cuts → script·clip-limits·styles·speeds·motion·clauses`) 어디에도 `fs` 가 없고,
> 이 화면은 이미 `lib/steps`·`lib/clip-limits` 를 import 한다. 서버가 프롬프트를
> 내려주는 우회로는 필요 없다 — 화면과 서버가 **같은 함수**를 부르는 것이 곧
> "사장님이 보는 것과 나가는 것이 같다"의 보장이다(전역 제약 3).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { readFileSync } from "node:fs";
const images = readFileSync("app/create/[id]/images/page.js", "utf8");

describe("④이미지 — 프롬프트 편집", () => {
  it("실제로 나가는 프롬프트를 보여 준다 — 서버와 같은 함수로 만든다", () => {
    expect(images).toMatch(/buildImagePrompt/);
  });

  it("★ 고치면 값이 든다고 미리 말한다", () => {
    expect(images, "유료 경고가 없다 — 사장님이 모르고 누른다").toMatch(/유료|다시 만들/);
  });

  it("원래대로 버튼이 있다 — 빈 값을 보내는 것이 구현이다", () => {
    expect(images).toMatch(/원래대로/);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-editing-ui.test.js`
Expected: FAIL

- [ ] **Step 3: 컷 카드에 프롬프트 자리를 만든다**

기존 "수정 지시" 입력칸 **아래**에, 접힌 채로 둔다(기본 흐름을 어지럽히지 않는다):

```jsx
<details className="prompt-edit">
  <summary>실제로 보내는 지시 보기</summary>
  {/* 사장님이 갈아 끼우는 것은 **본문**이다. 판형·글자 금지·레퍼런스 결속은
      코드가 언제나 뒤에 붙인다 — 무엇을 쓰든 지워지지 않는다. */}
  <textarea
    className="ref mono"
    value={prompt}
    onChange={(e) => setPrompt(e.target.value)}
  />
  <p className="preview-note">
    판형·글자 금지 같은 규칙은 이 뒤에 저희가 항상 붙여요. 영어로 쓰면 더 잘 알아들어요.
  </p>
  <div className="preview-actions">
    <button className="mini" onClick={() => onSavePrompt(cut.idx, prompt)}>저장</button>
    <button className="mini" onClick={() => onSavePrompt(cut.idx, "")}>원래대로</button>
  </div>
  {isImageStale(cut, project) && (
    <p className="preview-note warn">고쳤어요 — 반영하려면 다시 만들어야 해요 (유료)</p>
  )}
</details>
```

`onSavePrompt` 는 `editSentence`(188행)와 같은 모양으로 PATCH 를 보낸다.

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/create/[id]/images/page.js" tests/prompt-editing-ui.test.js
git commit -m "feat(ui): ④이미지에서 실제 프롬프트를 보고 고친다"
```

---

## Task 8: ⑤영상 화면 — 같은 것, 영상 쪽

**Files:**
- Modify: `app/create/[id]/video/page.js`
- Test: `tests/prompt-editing-ui.test.js`

Task 7 과 같은 모양이다. 다른 점 하나: **대사는 못 고친다고 적는다.**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("⑤영상 — 프롬프트 편집", () => {
  it("clipPrompt 를 서버와 같은 함수로 만든다", () => {
    expect(video).toMatch(/buildClipPrompt/);
  });

  it("★ 대사는 여기서 못 고친다고 적는다 — 자막과 갈리기 때문이다", () => {
    expect(video, "대사 안내가 없다 — 사장님이 여기서 고치려 든다").toMatch(/대사.*시나리오|시나리오.*대사/);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-editing-ui.test.js`

- [ ] **Step 3: Task 7 의 블록을 영상 쪽으로 옮긴다**

안내 문구만 다르다:

```jsx
  <p className="preview-note">
    첫 프레임 유지·글자 금지 같은 규칙은 이 뒤에 저희가 항상 붙여요.
    <strong>대사는 여기서 못 고쳐요</strong> — 자막과 갈리지 않게 ②시나리오에서 고쳐 주세요.
  </p>
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add "app/create/[id]/video/page.js" tests/prompt-editing-ui.test.js
git commit -m "feat(ui): ⑤영상에서 프롬프트를 고친다 — 대사는 시나리오에서"
```

---

## Task 9: ①자료 — 프로젝트 공통 지시 상자 둘

**Files:**
- Modify: `app/create/[id]/briefing/page.js`
- Test: `tests/prompt-editing-ui.test.js`

> ✅ **확인했다(2026-08-17):** 이 화면에는 이미 화풍 보정 입력이 있다(`styleNote` 상태 +
> `saveStyle(preset, note)` + `StylePicker`). **그것은 건드리지 않는다** — 새 칸 둘을
> 그 아래에 나란히 놓는다. 저장 경로도 다르다(`saveStyle` 이 아니라 `settings` 직접 PATCH).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("①자료 — 프로젝트 공통 지시", () => {
  it("칸이 둘이다 — 이미지용과 영상용", () => {
    expect(briefing).toMatch(/image_note/);
    expect(briefing).toMatch(/clip_note/);
  });

  it("★ 화풍 보정 입력은 그대로 남는다 — 다른 값이다", () => {
    expect(briefing, "화풍 보정을 지웠다 — 120자짜리 그 칸은 이 작업의 대상이 아니다")
      .toMatch(/styleNote/);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/prompt-editing-ui.test.js`

- [ ] **Step 3: 칸 둘을 더한다**

```jsx
{/* 밖에서 프롬프트를 써 오는 사장님을 위한 자리. 전 컷의 프롬프트에 그대로 실린다.
    ★ 위의 화풍 보정(120자)과 다른 값이다 — 그쪽은 화풍에 딸린 한 줄이고 이쪽은
      써 온 프롬프트 통짜다(상한 600자).
    ★ 이미지와 영상을 나눈 이유: 영상 지시(움직임·립싱크)가 이미지 프롬프트에 붙으면
      정지 화면 설계가 망가진다(lib/cuts.js 의 stillOnly 가 같은 이유로 존재한다). */}
<label>모든 이미지에 함께 보낼 지시 (선택)
  <textarea value={imageNote} onChange={(e) => setImageNote(e.target.value)}
    onBlur={() => saveNote("image_note", imageNote)}
    placeholder="예: shot on 35mm film, shallow depth of field" />
</label>
<label>모든 영상에 함께 보낼 지시 (선택)
  <textarea value={clipNote} onChange={(e) => setClipNote(e.target.value)}
    onBlur={() => saveNote("clip_note", clipNote)}
    placeholder="예: hand-held camera, subtle shake" />
</label>
```

`saveNote` 는 `saveStyle`(57행)과 같은 모양이되 `{ settings: { [key]: value } }` 만 보낸다 —
`normalizeStyle` 이 `preset` 을 함께 요구하므로 화풍과 섞지 않는다.

초기값은 `styleNote` 가 하는 것과 같은 방식으로 프로젝트에서 한 번 읽는다(37-39행의
`noteLoadedFor` 패턴을 그대로 따른다 — 매 렌더마다 덮으면 타이핑이 끊긴다).

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add "app/create/[id]/briefing/page.js" tests/prompt-editing-ui.test.js
git commit -m "feat(ui): ①자료에서 프로젝트 공통 지시를 받는다 — 이미지·영상 따로"
```

---

## Task 10: 영문화 — 시나리오 SYSTEM

**Files:**
- Modify: `lib/scenario.js` (`SYSTEM`, 21행~)
- Test: `tests/scenario.test.js` (기존 파일에 추가)

**Interfaces:**
- Produces: `focus.subject`·`focus.look`·`narrator_voice` 가 영어로 나온다. `beat`·`line`·`speaker`·`angle`·`topic` 은 한국어 그대로.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { readFileSync } from "node:fs";
const src = readFileSync("lib/scenario.js", "utf8");

describe("시나리오 SYSTEM — 언어 지시", () => {
  it("★ 모델이 읽는 칸만 영어로 요구한다", () => {
    expect(src, "focus 를 영어로 쓰라는 지시가 없다").toMatch(/focus[\s\S]{0,300}영어/);
    expect(src, "narrator_voice 를 영어로 쓰라는 지시가 없다").toMatch(/narrator_voice[\s\S]{0,300}영어/);
  });

  it("★ 대사는 한국어를 못 박는다 — 자막이 이 글자를 그대로 태운다", () => {
    expect(src).toMatch(/line[\s\S]{0,200}한국어/);
  });

  it("★ gpt-4o 시절의 과한 강조를 걷었다 — Opus 5 는 문자 그대로 따른다", () => {
    // 세던 것: `**반드시**` 류. 완전히 없앨 필요는 없고 눈에 띄게 줄었으면 된다.
    const shouts = (src.match(/\*\*반드시|절대/g) || []).length;
    expect(shouts, `강조가 아직 ${shouts}군데다`).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/scenario.test.js`

- [ ] **Step 3: SYSTEM 을 고친다**

JSON 스키마 주석에 언어를 못 박는다:

```
  "focus": {"mode": "사람|물건|정보 중 하나", "subject": "그 갈래의 대상 한 줄 — **영어로**", "look": "물건이면 생김새 — 색·부위·소재, **영어로**(아니면 빈 문자열)"},
  "narrator_voice": "화면 밖 목소리의 음색과 톤 — **영어로** (내레이션 장면이 없으면 빈 문자열)",
  "shots": [{
    "beat": "이 장면이 이야기에서 하는 일 (한국어)",
    "line": "이 장면의 대사 — **한국어로**. 이 글자가 그대로 자막이 된다 (없으면 빈 문자열)",
```

규칙 목록에 한 줄 더한다:

```
- **subject·look·narrator_voice 는 영어로 적는다.** 이 값들은 그림·영상 모델에 그대로
  실린다. beat·line·speaker 는 한국어다 — 사장님이 읽고 고치는 값이고, 대사는 자막이 된다.
```

**같은 손에서** 과한 강조를 걷는다: `**반드시**` → 평서문. 요구사항은 한 줄도 바꾸지 않는다.

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: 가짜 모드로 관통을 확인한다 ($0)**

```bash
SHOTFORM_FAKE=all SHOTFORM_STORE=memory npx vitest run tests/scenario.test.js
```
Expected: PASS — 스키마 검증기(`validateScenario`)가 안 깨졌다

- [ ] **Step 6: 커밋**

```bash
git add lib/scenario.js tests/scenario.test.js
git commit -m "feat(scenario): 모델이 읽는 칸을 영어로 — 대사는 한국어, 강조는 걷는다"
```

---

## Task 11: 영문화 — 화면 설계 SYSTEM

**Files:**
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM`, 344-410행쯤)
- Test: `tests/cuts.test.js` (기존)

**Interfaces:**
- Produces: `shows`·`tone`·`environment`·`transition`·움직임 축이 영어로 나온다

★ **이 태스크의 핵심: 예시 값을 영어로 바꾼다.** 설명은 한국어로 두어도 되지만, `✓`/`✗`
예시는 **출력 언어를 가장 강하게 정하는 신호**다. 한국어 예시를 두고 "영어로 써라"라고
하면 둘이 싸운다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("화면 설계 SYSTEM — 언어", () => {
  it("★ ✓ 예시가 영어다 — 예시가 출력 언어를 정한다", () => {
    const shows = src.slice(src.indexOf("SHOWS_SYSTEM"), src.indexOf("motionRules("));
    const good = shows.split("\n").filter((l) => l.trim().startsWith("✓"));
    expect(good.length, "✓ 예시를 못 찾겠다").toBeGreaterThan(3);
    const korean = good.filter((l) => /[가-힣]/.test(l.replace(/^\s*✓/, "")));
    expect(korean, `아직 한국어 예시가 ${korean.length}줄이다`).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`

- [ ] **Step 3: 예시와 지시를 영어로 옮긴다**

`✓`/`✗` 예시를 전부 영어로. 예:

```
  ✓ "dark background with only the product color saturated, cinematic ad film grain"
  ✓ "faded film grain with a green cast, low-contrast documentary texture"
  ✗ "gym, spotlight" (that belongs in environment)
```

지시 한 줄을 더한다:

```
- **shows·tone·environment·transition·움직임 축은 영어로 적는다.** 이 값들은 그림·영상
  모델에 그대로 실린다.
```

`lib/motion.js` 의 `motionRules`·`speedRule` 이 만드는 예시도 함께 확인한다 — 거기 한국어
예시가 남으면 축만 한국어로 나온다.

**같은 손에서** 과한 강조(`**★ ... 반드시**`)를 평서문으로 걷는다. 규칙 자체는 그대로.

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js lib/motion.js tests/cuts.test.js
git commit -m "feat(cuts): 화면 설계가 영어로 나온다 — 예시부터 바꾼다"
```

---

## Task 12: 영문화 — 캐스팅 SYSTEM

**Files:**
- Modify: `lib/cast.js` (`CAST_SYSTEM`, 20-56행)
- Test: `tests/cast.test.js` (기존)

**Interfaces:**
- Produces: `who`·`look`·`voice` 가 영어로 나온다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("캐스팅 SYSTEM — 언어", () => {
  it("★ who·look·voice 예시가 영어다 — 셋 다 모델이 읽는다", () => {
    const src = readFileSync("lib/cast.js", "utf8");
    const good = src.split("\n").filter((l) => l.trim().startsWith("✓"));
    expect(good.filter((l) => /[가-힣]/.test(l.replace(/^\s*✓/, "")))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `npx vitest run tests/cast.test.js`

- [ ] **Step 3: 예시를 영어로 옮긴다**

```
  ✓ "Korean man in his 50s, shop owner" / "East Asian man in his 20s, basketball player"
  ✓ "short black hair, lean muscular build, black sleeveless jersey and red shorts, white socks"
  ✓ "low register, calm and steady tone" / "high and bright, speaks quickly"
```

지시 한 줄:

```
- **who·look·voice 는 영어로 적는다.** 셋 다 그림·영상 모델에 그대로 실린다.
```

- [ ] **Step 4: 테스트를 돌린다**

Run: `npx vitest run`

- [ ] **Step 5: 커밋**

```bash
git add lib/cast.js tests/cast.test.js
git commit -m "feat(cast): 캐스팅이 영어로 나온다 — who·look·voice"
```

---

## Task 13: 관통 확인 (가짜 모드, $0)

**Files:**
- Create: `data/probe-prompt-editing.mjs` (gitignore 된 `data/` — 커밋하지 않는다)

- [ ] **Step 1: 요청 본문을 잡는 탐침을 쓴다**

`data/show-prompts.mjs` 를 본떠, 덮어쓰기를 넣은 컷과 안 넣은 컷의 **실제 요청 본문**을
나란히 찍는다. fal 은 부르지 않는다(`fetchImpl` 가로채기).

- [ ] **Step 2: 돌려서 눈으로 본다**

```bash
SHOTFORM_STORE=memory node data/probe-prompt-editing.mjs
```

확인할 것 넷:
1. 덮어쓰기 없는 컷의 프롬프트가 **병합 전과 글자 그대로 같다**
2. 덮어쓴 컷에 **꼬리가 남아 있다**(`no text or letters`)
3. 프로젝트 공통 지시가 **전 컷에 실린다**
4. 영상 프롬프트의 **대사가 시나리오 값 그대로다**

- [ ] **Step 3: 전체 테스트**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 4: 탐침을 지우고 커밋**

```bash
rm data/probe-prompt-editing.mjs
git status --short   # 비어 있어야 한다
```

---

## 남기는 것 (이 계획 밖)

- **한국어 대 영어 실측** — 유료. 사장님 승인 후 `scripts/measure/` 로 전후를 잰다.
  설계 문서에 *가정*이라고 적어 뒀다.
- **`narrator_voice` 가 ②시나리오 화면에 영어로 보인다** — 안내를 붙일지 이 칸만 한국어로
  둘지는 사장님 결정.
- **덮어쓰기와 `edit_instruction` 의 공존** — 둘 다 살려 두고 써 본 뒤 정리.
