# 낡은 것을 낡았다고 말한다 — 무효화 판정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컷을 고친 뒤 낡아버린 소리·그림·클립·완성본을 화면이 알아보고, 다시 만들기 전에는 다음 단계로 못 가게 한다.

**Architecture:** 산출물마다 "무엇에서 나왔는지"를 `of` 한 줄로 각인한다(버전 번호가 아니다). 판정은 지금 값으로 각인을 다시 만들어 비교하는 순수 함수 넷이고, `lib/steps.js`의 `areCutsStale` 옆에 산다. 각 단계 화면은 자기 산출물만 보고 배지를 띄우고 다음 버튼을 잠근다.

**Tech Stack:** Next.js 15 App Router, vitest

설계 문서: `docs/superpowers/specs/2026-07-29-staleness-invalidation-design.md` (커밋 `5bf8683`)

## Global Constraints

- 워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`
- **Edit 도구의 절대경로가 `shotform-saas`(메인 저장소)를 가리키지 않게 한다.** 커밋 직전 `git rev-parse --abbrev-ref HEAD`로 브랜치도 확인한다(병렬 세션이 브랜치를 바꾼 사고 이력이 있다)
- 기존 테스트 **426개 그린이 하한선**
- **fal 을 부르지 않는다.** 이 계획 전체가 유료 호출 없이 끝난다
- `lib/steps.js`는 화면이 import 하므로 **서버 전용 의존을 끌고 오면 안 된다**(`fs`·`crypto` 금지). `lib/voices.js`·`lib/refs.js`와 같은 제약
- 각인이 없는 옛 산출물(`of === undefined`)은 **낡지 않은 것으로 본다**
- Korean 문구는 사장님이 읽는 말로. "낡음"·"stale"·파일명·함수명을 화면에 노출하지 않는다
- 커밋 메시지는 한국어, 기존 이력의 어조

---

## File Structure

**수정**
- `lib/steps.js` — `clipKey`·`renderKey`·판정 함수 넷 (Task 1)
- `lib/pipeline.js` — 각인 여섯 자리 (Task 2)
- `app/create/[id]/voice/page.js` · `images/page.js` · `video/page.js` — 배지·잠금 (Task 3)
- `app/create/[id]/done/page.js` — 내려받기 잠금 (Task 4)

**테스트**
- `tests/steps.test.js` (Task 1) · `tests/pipeline.test.js` (Task 2) ·
  `tests/routes.test.js` (Task 2) · `tests/staleness-ui.test.js` (신규, Task 3·4)

**건드리지 않음**
- `app/api/projects/[id]/cuts/route.js` — 재분할 시 `render`를 지울 필요가 없다(`renderKey`가 잡는다)
- `app/api/projects/[id]/render/route.js` — 멱등 가드 없음이 옳다
- `lib/compose.js` · `lib/subtitles.js` · `lib/tts.js` · `lib/i2v.js`

> `tests/staleness-ui.test.js`는 설계 문서의 테스트 목록에 없던 것을 하나 더한 것이다.
> 이 저장소에는 화면 단위 테스트가 없고(`tests/` 어디에도 `app/create`를 import 하지 않는다),
> **이 작업의 실패 모드가 정확히 "화면 넷 중 하나를 빠뜨리는 것"**이라 소스를 훑는 검사를 둔다.
> `tests/design-system.test.js`가 같은 방식(소스 직접 훑기)의 선례다.

---

## Task 1: 낡음을 판정하는 순수 함수 넷

**Files:**
- Modify: `lib/steps.js` (파일 끝, `isReachable` 아래)
- Test: `tests/steps.test.js` (`areCutsStale` describe 아래)

**Interfaces:**
- Produces:
  - `clipKey(cut) -> string`
  - `renderKey(project) -> string`
  - `isAudioStale(cut) -> boolean` · `isImageStale(cut) -> boolean` ·
    `isClipStale(cut) -> boolean` · `isRenderStale(project) -> boolean`
- Consumes: 없음 (순수 함수, import 없음)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/steps.test.js`의 `areCutsStale` describe **아래**에 더한다. 파일 첫 줄의 import 에
새 이름들을 함께 넣는다:

```js
import {
  STEPS, stepHref, stepFromPathname, currentStepKey, areCutsStale, isReachable,
  clipKey, renderKey, isAudioStale, isImageStale, isClipStale, isRenderStale,
} from "../lib/steps.js";
```

> 위 import 문은 **기존 줄을 통째로 갈아 끼우는 것이다.** 기존에 무엇을 들여오고 있는지
> 먼저 확인하고, 빠진 이름이 있으면 남긴 채 새 이름만 더한다.

```js
describe("낡음 판정 — 산출물마다 무엇에서 나왔는지 각인한다", () => {
  describe("isAudioStale — 소리는 문장에서 나온다", () => {
    it("읽은 문장이 그대로면 낡지 않았다", () => {
      const cut = { sentence: "딸기를 갈아 씁니다.", audio: { url: "u", of: "딸기를 갈아 씁니다." } };
      expect(isAudioStale(cut)).toBe(false);
    });

    it("문장을 고치면 소리가 낡는다", () => {
      const cut = { sentence: "매일 딸기를 갈아 씁니다.", audio: { url: "u", of: "딸기를 갈아 씁니다." } };
      expect(isAudioStale(cut)).toBe(true);
    });

    it("각인이 없는 옛 소리는 낡지 않은 것으로 본다 — 거짓 경고가 유료 호출을 부른다", () => {
      expect(isAudioStale({ sentence: "문장", audio: { url: "u" } })).toBe(false);
    });

    it("소리가 아예 없으면 판정하지 않는다", () => {
      expect(isAudioStale({ sentence: "문장" })).toBe(false);
      expect(isAudioStale(null)).toBe(false);
    });
  });

  describe("isImageStale — 그림은 화면 설명에서 나온다", () => {
    it("화면 설명이 그대로면 낡지 않았다", () => {
      expect(isImageStale({ shows: "주인이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } })).toBe(false);
    });

    it("화면 설명을 고치면 그림이 낡는다", () => {
      expect(isImageStale({ shows: "손님이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } })).toBe(true);
    });

    it("문장만 고친 것은 그림을 낡게 하지 않는다 — 그림 두 장을 다시 사지 않는다", () => {
      const cut = { sentence: "고친 문장", shows: "주인이 코트를 든다", image: { url: "u", of: "주인이 코트를 든다" } };
      expect(isImageStale(cut)).toBe(false);
    });

    it("각인이 없거나 그림이 없으면 낡지 않은 것으로 본다", () => {
      expect(isImageStale({ shows: "설명", image: { url: "u" } })).toBe(false);
      expect(isImageStale({ shows: "설명" })).toBe(false);
    });
  });

  describe("isClipStale — 클립은 그림·길이·움직임에서 나온다", () => {
    const base = { image: { url: "img1" }, seconds: 6, motion: "천천히 다가간다" };

    it("셋 다 그대로면 낡지 않았다", () => {
      expect(isClipStale({ ...base, video: { url: "v", of: clipKey(base) } })).toBe(false);
    });

    it("그림을 다시 만들면 주소가 바뀌어 클립이 낡는다", () => {
      const cut = { ...base, image: { url: "img2" }, video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("소리를 다시 만들어 길이가 바뀌면 클립이 낡는다 — 지금 조용히 틀리는 자리다", () => {
      const cut = { ...base, seconds: 9, video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("움직임을 고쳐도 클립이 낡는다", () => {
      const cut = { ...base, motion: "정지", video: { url: "v", of: clipKey(base) } };
      expect(isClipStale(cut)).toBe(true);
    });

    it("각인이 없거나 클립이 없으면 낡지 않은 것으로 본다", () => {
      expect(isClipStale({ ...base, video: { url: "v" } })).toBe(false);
      expect(isClipStale(base)).toBe(false);
    });
  });

  describe("isRenderStale — 완성본은 컷별 소리·클립·문장에서 나온다", () => {
    const cuts = [
      { idx: 0, sentence: "첫 문장", audio: { url: "a0" }, video: { url: "v0" } },
      { idx: 1, sentence: "둘째 문장", audio: { url: "a1" }, video: { url: "v1" } },
    ];
    const proj = { cuts };

    it("아무것도 안 바뀌었으면 낡지 않았다", () => {
      expect(isRenderStale({ ...proj, render: { url: "r", of: renderKey(proj) } })).toBe(false);
    });

    it("컷 하나의 소리를 다시 만들면 완성본이 낡는다", () => {
      const after = { cuts: [{ ...cuts[0], audio: { url: "a0-new" } }, cuts[1]] };
      expect(isRenderStale({ ...after, render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("문장만 고쳐도 완성본이 낡는다 — 자막이 문장에서 나온다", () => {
      const after = { cuts: [{ ...cuts[0], sentence: "고친 문장" }, cuts[1]] };
      expect(isRenderStale({ ...after, render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("컷을 다시 나누면 완성본이 낡는다 — cuts 라우트에 코드를 더할 필요가 없다", () => {
      expect(isRenderStale({ cuts: [], render: { url: "r", of: renderKey(proj) } })).toBe(true);
    });

    it("각인이 없거나 완성본이 없으면 낡지 않은 것으로 본다", () => {
      expect(isRenderStale({ ...proj, render: { url: "r" } })).toBe(false);
      expect(isRenderStale(proj)).toBe(false);
      expect(isRenderStale(null)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — `clipKey is not a function` 등 (import 자체가 undefined)

- [ ] **Step 3: `lib/steps.js` 끝에 판정을 더한다**

파일 맨 아래(`isReachable` 함수 뒤)에 붙인다:

```js
// ── 낡음 판정 ───────────────────────────────────────────────────────────
// 산출물마다 "무엇에서 나왔는지"를 of 로 각인해 두고, 지금 값과 비교한다.
//
// 버전 번호를 쓰지 않는 이유: 번호를 올려주는 자리를 사람이 기억해야 하고, 컷을 건드리는
// 곳이 이미 넷이다(PATCH·regenCut·runSplitPipeline·초점 변경). 한 군데만 빠뜨리면
// 낡았는데 안 낡았다고 나온다 — 위의 cuts_script_version 이 render 를 빠뜨린 것이 그 예다.
// 각인은 지금 값에서 파생되므로 빠뜨릴 자리가 없다.
//
// ⚠️ areCutsStale 과 판단이 갈리는 곳이 하나 있다: 각인이 없는 옛 산출물을 여기서는
// "낡지 않음"으로 본다. 컷 재분할은 OpenAI 만 써서 공짜지만 소리·클립은 유료이고,
// 거짓 경고는 유료 호출 버튼을 띄운다. 둘을 실수로 맞추지 말 것.
//
// 연쇄를 만들지 않는다("그림이 낡았으니 클립도 낡았다"를 코드로 잇지 않는다).
// 그림이 낡으면 ④에서 막히므로 ⑤로 갈 수 없고, 그림을 실제로 다시 만들면 주소가 바뀌어
// 클립은 그때 자동으로 낡는다. 규칙을 더 두면 규칙끼리 어긋날 자리가 생긴다.

export function clipKey(cut) {
  return `${cut?.image?.url || ""}|${cut?.seconds ?? ""}|${cut?.motion || ""}`;
}

// 자막이 문장에서 나오므로 sentence 도 넣는다(lib/subtitles.js).
export function renderKey(project) {
  return (project?.cuts || [])
    .map((c) => `${c.audio?.url || ""}|${c.video?.url || ""}|${c.sentence || ""}`)
    .join("\n");
}

export function isAudioStale(cut) {
  const of = cut?.audio?.of;
  if (of === undefined) return false;
  return of !== (cut.sentence || "");
}

export function isImageStale(cut) {
  const of = cut?.image?.of;
  if (of === undefined) return false;
  return of !== (cut.shows || "");
}

export function isClipStale(cut) {
  const of = cut?.video?.of;
  if (of === undefined) return false;
  return of !== clipKey(cut);
}

export function isRenderStale(project) {
  const of = project?.render?.of;
  if (of === undefined) return false;
  return of !== renderKey(project);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS (426 + 새 테스트)

- [ ] **Step 6: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "feat: 산출물이 무엇에서 나왔는지로 낡음을 판정한다

버전 번호는 올려주는 자리를 사람이 기억해야 한다. 컷을 건드리는 곳이 이미 넷이고 한
군데만 빠뜨리면 낡았는데 안 낡았다고 나온다 — cuts_script_version 이 render 를 빠뜨린
것이 그 예다. 각인은 지금 값에서 파생되므로 빠뜨릴 자리가 없다.

산출물별로 따로 판정한다. 문장만 고치면 소리만 낡고 그림 두 장은 살아남는다.

각인이 없는 옛 산출물은 낡지 않은 것으로 본다. areCutsStale 은 반대로 골랐는데, 그쪽은
다시 만드는 값이 공짜(OpenAI)이고 여기는 유료라 판단이 갈린다."
```

---

## Task 2: 만들 때 각인을 박는다

**Files:**
- Modify: `lib/pipeline.js` (여섯 자리)
- Test: `tests/pipeline.test.js`, `tests/routes.test.js`

**Interfaces:**
- Consumes: `clipKey`·`renderKey` (Task 1)
- Produces: `cut.audio.of` · `cut.image.of` · `cut.video.of` · `project.render.of` 가 저장된다

- [ ] **Step 1: 실패하는 테스트를 쓴다 — 각인이 박히는가**

`tests/pipeline.test.js`의 각 describe 안에 하나씩 더한다. 파일 맨 위 import 에 판정
함수를 들여온다(맨 위 import 블록 끝에 한 줄):

```js
import { isAudioStale, isImageStale, isClipStale, isRenderStale } from "../lib/steps.js";
```

`describe("분할 → 이미지 …")` 안에:

```js
  it("그림에 무엇을 보고 그렸는지를 각인한다", async () => {
    const p = await makeProject();
    await runBoth(p.id, deps());
    const saved = await projects.getProject(p.id);
    const ai = saved.cuts.find((c) => c.source === "ai");
    expect(ai.image.of).toBe(ai.shows || "");
    expect(isImageStale(ai)).toBe(false);
    // 화면 설명을 고치면 그 자리에서 낡는다
    expect(isImageStale({ ...ai, shows: "다른 화면" })).toBe(true);
  });
```

`describe("runVoicePipeline …")` 안에:

```js
  it("소리에 읽은 문장을 각인한다 — 문장을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await pipeline.runVoicePipeline(p.id, { speak: async () => ({ url: "http://a", seconds: 5 }) });
    const cut = (await projects.getProject(p.id)).cuts[0];
    expect(cut.audio.of).toBe(cut.sentence);
    expect(isAudioStale(cut)).toBe(false);
    expect(isAudioStale({ ...cut, sentence: "고친 문장" })).toBe(true);
  });
```

`describe("runVideoPipeline …")` 안에:

```js
  it("클립에 그림·길이·움직임을 각인한다 — 소리를 다시 만들면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({ ...c, image: { url: "http://img/" + c.idx } })),
    }));
    await pipeline.runVideoPipeline(p.id, {
      clip: async () => ({ url: "http://v", seconds: 6, truncated: false }),
    });
    const cut = (await projects.getProject(p.id)).cuts[0];
    expect(isClipStale(cut)).toBe(false);
    // 낭독을 다시 만들어 길이가 바뀐 상태
    expect(isClipStale({ ...cut, seconds: cut.seconds + 3 })).toBe(true);
  });
```

`describe("runRenderPipeline …")` 안에:

```js
  it("완성본에 컷별 소리·클립·문장을 각인한다 — 컷을 고치면 낡는다", async () => {
    const p = await makeProject();
    await pipeline.runSplitPipeline(p.id, deps());
    await projects.updateProject(p.id, (proj) => ({
      ...proj,
      cuts: proj.cuts.map((c) => ({
        ...c, audio: { url: "http://a" + c.idx, seconds: 5 }, video: { url: "http://v" + c.idx, seconds: 6 },
      })),
    }));
    await pipeline.runRenderPipeline(p.id, {
      compose: async () => ({ url: "http://out.mp4", seconds: 12 }),
    });
    const saved = await projects.getProject(p.id);
    expect(isRenderStale(saved)).toBe(false);
    const edited = { ...saved, cuts: [{ ...saved.cuts[0], sentence: "고친 문장" }, ...saved.cuts.slice(1)] };
    expect(isRenderStale(edited)).toBe(true);
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — `of` 가 undefined 라 판정이 전부 false (낡음을 기대한 단언이 깨진다)

- [ ] **Step 3: `lib/pipeline.js` 에 각인을 박는다**

맨 위 import 블록에 한 줄 더한다:

```js
import { clipKey, renderKey } from "./steps.js";
```

여섯 자리를 고친다. **각인은 산출물 객체 안에 함께 넣는다** — 따로 저장하면 저장이
갈라져 한쪽만 남을 수 있다.

`processCut` 안 (`verdict.passed` 분기):

```js
      if (verdict.passed) {
        await setCut({
          state: "done",
          // 이 그림이 무엇을 보고 그려졌는지 — 화면 설명을 고치면 이 값이 안 맞는다
          image: { url: candidates[verdict.selectedIndex].url, of: cut.shows || "" },
          vlm: { passed: true, note: verdict.note },
        });
        return;
      }
```

`runVoicePipeline` 안:

```js
            c.idx === cut.idx
              // 추정 seconds 를 실측으로 덮는다 — 여기가 이 파이프라인의 핵심이다
              ? { ...c, audio: { url, seconds, of: cut.sentence || "" }, seconds, voice_error: null }
              : c
```

`regenVoice` 안:

```js
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, audio: { url, seconds, of: cut.sentence || "" }, seconds, voice_error: null }
          : c
      ),
```

`runVideoPipeline` 안:

```js
        await setCut({ video: { url, seconds, truncated, of: clipKey(cut) }, video_error: null });
```

`regenClip` 안:

```js
      cuts: proj.cuts.map((c) =>
        c.idx === idx
          ? { ...c, video: { url, seconds, truncated, of: clipKey(cut) }, video_error: null }
          : c
      ),
```

`runRenderPipeline` 안:

```js
  await updateProject(projectId, (proj) => ({
    ...proj,
    status: "done",
    // 이 완성본이 어떤 소리·클립·문장으로 만들어졌는지 — 컷을 고치면 이 값이 안 맞는다
    render: { ...result, ts: Date.now(), of: renderKey(project) },
    render_error: null,
  }));
```

> `renderKey(project)`는 **합성에 실제로 넘긴 그 스냅샷**을 쓴다(`compose` 위에서 읽은
> `project`). `proj`로 바꾸면 합성 도중 바뀐 값을 각인해 낡음을 놓친다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: PASS

- [ ] **Step 5: 관통 테스트를 쓴다**

`tests/routes.test.js` 맨 위 import 에 더한다:

```js
import { isAudioStale, isImageStale, isClipStale, isRenderStale, renderKey } from "../lib/steps.js";
```

파일 끝에 새 describe 를 더한다. **각인을 테스트가 손으로 만들지 않고 `renderKey`를
그대로 쓴다** — 같은 식을 두 번 적으면 어긋난다:

```js
describe("무효화 관통 — 고치면 낡고, 안 고친 것은 살아남는다", () => {
  async function projectWithCuts() {
    const p = await projectWithScript();
    return updateProject(p.id, (proj) => ({
      ...proj,
      status: "video",
      cuts: [
        {
          idx: 0, sentence: "첫 문장.", shows: "주인이 코트를 든다", motion: "천천히", seconds: 6,
          audio: { url: "a0", seconds: 6, of: "첫 문장." },
          image: { url: "i0", of: "주인이 코트를 든다" },
          video: { url: "v0", seconds: 6, of: "i0|6|천천히" },
        },
      ],
    }));
  }

  it("문장을 고치면 소리만 낡는다 — 그림은 살아남는다", async () => {
    const p = await projectWithCuts();
    const res = await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(res.status).toBe(200);
    const cut = (await getProject(p.id)).cuts[0];
    expect(isAudioStale(cut)).toBe(true);
    expect(isImageStale(cut)).toBe(false);
    expect(isClipStale(cut)).toBe(false);
  });

  it("화면 설명을 고치면 그림만 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, shows: "손님이 코트를 든다" } }), ctx(p.id));
    const cut = (await getProject(p.id)).cuts[0];
    expect(isImageStale(cut)).toBe(true);
    expect(isAudioStale(cut)).toBe(false);
  });

  it("움직임을 고치면 클립이 낡는다", async () => {
    const p = await projectWithCuts();
    await PATCH(patchReq({ cut: { idx: 0, motion: "정지" } }), ctx(p.id));
    expect(isClipStale((await getProject(p.id)).cuts[0])).toBe(true);
  });

  it("컷을 고치면 완성본이 낡는다", async () => {
    const p = await projectWithCuts();
    await updateProject(p.id, (proj) => ({
      ...proj, status: "done",
      render: { url: "r.mp4", seconds: 6, of: renderKey({ cuts: proj.cuts }) },
    }));
    expect(isRenderStale(await getProject(p.id))).toBe(false);
    await PATCH(patchReq({ cut: { idx: 0, sentence: "고친 문장." } }), ctx(p.id));
    expect(isRenderStale(await getProject(p.id))).toBe(true);
  });
});
```

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/pipeline.js tests/pipeline.test.js tests/routes.test.js
git commit -m "feat: 소리·그림·클립·완성본에 무엇에서 나왔는지 각인한다

만들 때 산출물 객체 안에 함께 넣는다. 따로 저장하면 한쪽만 남을 수 있다.

완성본은 합성에 실제로 넘긴 스냅샷으로 각인한다 — 저장 시점의 값으로 찍으면 합성 도중
바뀐 것을 놓친다.

이제 문장을 고치면 소리만 낡고 그림 두 장은 살아남는다. 소리를 다시 만들면 길이가 바뀌어
클립이 낡는다 — 지금까지 조용히 틀리던 자리다."
```

---

## Task 3: ③④⑤ 화면이 낡은 것을 보여주고 다음을 막는다

**Files:**
- Modify: `app/create/[id]/voice/page.js` · `app/create/[id]/images/page.js` · `app/create/[id]/video/page.js`
- Create: `tests/staleness-ui.test.js`

**Interfaces:**
- Consumes: `isAudioStale`·`isImageStale`·`isClipStale` (Task 1)
- Produces: 없음 (화면)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/staleness-ui.test.js`를 새로 만든다. 화면 단위 테스트가 없는 저장소라
`tests/design-system.test.js`처럼 소스를 직접 훑는다 — **이 작업의 실패 모드가
"화면 하나를 빠뜨리는 것"**이기 때문이다.

```js
// 화면이 낡은 것을 알아보고 다음을 막는가 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고, 이 기능의 실패 모드는 "화면 하나를 빠뜨리는 것"이다.
// 스펙 docs/superpowers/specs/2026-07-29-staleness-invalidation-design.md
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

const PAGES = [
  { step: "③ 목소리", path: "app/create/[id]/voice/page.js", fn: "isAudioStale" },
  { step: "④ 이미지", path: "app/create/[id]/images/page.js", fn: "isImageStale" },
  { step: "⑤ 영상", path: "app/create/[id]/video/page.js", fn: "isClipStale" },
];

describe("낡은 것이 있으면 다음 단계로 못 간다", () => {
  for (const { step, path, fn } of PAGES) {
    it(`${step} 화면이 ${fn} 로 판정한다`, () => {
      const src = read(path);
      expect(src).toContain(fn);
      expect(src).toMatch(/from ["'][./]*lib\/steps["']/);
    });

    it(`${step} 화면의 다음 버튼이 낡은 것에 잠긴다`, () => {
      // 다음 화면으로 보내는 버튼에 staleCount 조건이 걸려 있어야 한다
      const src = read(path);
      expect(src).toContain("staleCount");
      const button = src.slice(src.indexOf("router.push") - 400, src.indexOf("router.push"));
      expect(button, `${path} 의 다음 버튼에 staleCount 조건이 없다`).toContain("staleCount");
    });
  }
});

describe("⑥ 완성", () => {
  it("낡은 완성본은 내려받기가 잠긴다", () => {
    const src = read("app/create/[id]/done/page.js");
    expect(src).toContain("isRenderStale");
    // 내려받기 링크는 낡지 않았을 때만 나온다
    const anchor = src.slice(0, src.indexOf("내려받기"));
    expect(anchor).toContain("!stale");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/staleness-ui.test.js`
Expected: FAIL — 네 화면 전부 `isAudioStale`·`staleCount` 등이 없다
(⑥ 완성은 Task 4에서 통과한다 — 이 태스크 끝에는 ③④⑤만 초록이다)

- [ ] **Step 3: ③ 목소리 화면**

`app/create/[id]/voice/page.js` 맨 위 import 에 더한다:

```js
import { isAudioStale } from "../../../../lib/steps";
```

`cuts`·`doneCount`를 계산하는 자리 근처에 한 줄 더한다:

```js
  // 문장을 고친 뒤 옛 문장을 읽은 소리가 남아 있으면 다음으로 보내지 않는다
  const staleCount = cuts.filter(isAudioStale).length;
```

컷 카드의 `<div className="badges">` 안, `{c.audio.seconds}초` 배지 **다음**에 넣는다:

```jsx
                    {isAudioStale(c) && (
                      <span className="badge warn">
                        문장을 고친 뒤라 소리가 옛 문장이에요 — 다시 읽히면 됩니다
                      </span>
                    )}
```

다음 버튼을 바꾼다:

```jsx
            <>
              {staleCount > 0 && (
                <span className="hint">고친 문장 {staleCount}개를 다시 읽혀 주세요</span>
              )}
              <button
                className="cta"
                disabled={busy || doneCount === 0 || staleCount > 0}
                onClick={() => router.push(`/create/${id}/images`)}
              >
                ④ 이미지 만들러 가기 →
              </button>
            </>
```

- [ ] **Step 4: ④ 이미지 화면**

`app/create/[id]/images/page.js` 맨 위 import 에 더한다:

```js
import { isImageStale } from "../../../../lib/steps";
```

`cuts`가 정해진 뒤에 한 줄:

```js
  // 화면 설명을 고친 뒤 옛 설명으로 그린 그림이 남아 있으면 클립을 사러 보내지 않는다
  const staleCount = cuts.filter(isImageStale).length;
```

컷 목록의 `<div className="badges">` 안, `<span className="badge ai">{c.seconds}초</span>`
**다음**에 넣는다:

```jsx
                  {isImageStale(c) && (
                    <span className="badge warn">
                      화면 설명을 고친 뒤라 그림이 옛 설명으로 그려진 거예요 — 다시 만들면 됩니다
                    </span>
                  )}
```

다음 버튼을 바꾼다:

```jsx
                <>
                  <span className="hint">
                    {staleCount > 0
                      ? `고친 화면 ${staleCount}개를 다시 그려 주세요`
                      : "이미지가 곧 각 컷의 시작 프레임이 됩니다"}
                  </span>
                  <button
                    className="cta"
                    disabled={staleCount > 0}
                    onClick={() => router.push(`/create/${id}/video`)}
                  >
                    ⑤ 영상 만들러 가기 →
                  </button>
                </>
```

- [ ] **Step 5: ⑤ 영상 화면**

`app/create/[id]/video/page.js` 맨 위 import 에 더한다:

```js
import { isClipStale } from "../../../../lib/steps";
```

`cuts`·`doneCount` 근처에 한 줄:

```js
  // 그림이나 낭독이 바뀐 뒤 옛것으로 만든 클립이 남아 있으면 합치러 보내지 않는다
  const staleCount = cuts.filter(isClipStale).length;
```

컷 카드의 `<div className="badges">` 안, `{c.video && <span className="badge photo">클립 …` 
**다음**에 넣는다:

```jsx
                  {isClipStale(c) && (
                    <span className="badge warn">
                      그림이나 낭독이 바뀐 뒤라 클립이 옛것이에요 — 다시 만들면 됩니다
                    </span>
                  )}
```

다음 버튼을 바꾼다:

```jsx
            <>
              <span className="hint">
                {staleCount > 0
                  ? `바뀐 컷 ${staleCount}개의 클립을 다시 만들어 주세요`
                  : "이어 붙이고 소리와 자막을 얹으면 완성이에요"}
              </span>
              <button
                className="cta"
                disabled={busy || doneCount === 0 || staleCount > 0}
                onClick={() => router.push(`/create/${id}/done`)}
              >
                ⑥ 완성하러 가기 →
              </button>
            </>
```

- [ ] **Step 6: ③④⑤가 통과하는지 확인한다**

Run: `npx vitest run tests/staleness-ui.test.js`
Expected: ③④⑤ 관련 6개 PASS, ⑥ 완성 1개 FAIL (Task 4에서 닫는다)

- [ ] **Step 7: 회귀를 확인한다**

Run: `npx vitest run`
Expected: ⑥ 완성 테스트 하나만 실패, 나머지 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add "app/create/[id]/voice/page.js" "app/create/[id]/images/page.js" "app/create/[id]/video/page.js" tests/staleness-ui.test.js
git commit -m "feat: 낡은 컷을 화면이 알려주고 다음 단계를 막는다

배지는 무엇을 하면 풀리는지까지 말한다. 낡은 그림으로 클립을 사는 것(=돈 버림)까지
막히는 것이 다음 버튼을 잠그는 이유다.

화면 단위 테스트가 없는 저장소라 소스를 훑는 검사를 뒀다 — 이 기능의 실패 모드가
정확히 '화면 하나를 빠뜨리는 것'이다."
```

---

## Task 4: ⑥ 완성 — 낡은 완성본은 내려받지 못한다

**Files:**
- Modify: `app/create/[id]/done/page.js`
- Test: `tests/staleness-ui.test.js` (Task 3에서 이미 씀)

**Interfaces:**
- Consumes: `isRenderStale` (Task 1)

- [ ] **Step 1: 실패를 다시 확인한다**

Run: `npx vitest run tests/staleness-ui.test.js`
Expected: ⑥ 완성 테스트 FAIL — `isRenderStale` 가 화면에 없다

- [ ] **Step 2: 판정을 들여온다**

`app/create/[id]/done/page.js` 맨 위 import 에 더한다:

```js
import { isRenderStale } from "../../../../lib/steps";
```

`const totalSeconds = ...` 아래에 한 줄:

```js
  // 컷을 고친 뒤라면 이 완성본은 옛 소리·옛 그림으로 만든 것이다.
  // 합성은 0원이라 막을 게 아니라 바로 다시 만들게 하는 것이 맞다.
  const stale = isRenderStale(project);
```

- [ ] **Step 3: 완성본 미리보기 위에 알린다**

`<p className="pgsub">완성했어요 — 약 {Math.round(render.seconds || 0)}초.</p>` **바로 아래**,
`{render.noSubtitles && …}` **앞**에 넣는다:

```jsx
          {stale && (
            <div className="script-src warn">
              컷을 고친 뒤라 이 영상은 옛 소리·옛 그림으로 만든 것이에요 — 다시 합쳐 주세요
            </div>
          )}
```

- [ ] **Step 4: 내려받기를 잠근다**

`step-actions` 안의 조건을 바꾼다. **`!stale` 하나가 붙는 것이 전부다:**

```jsx
          {render && !render.fake && render.url && !stale ? (
            <>
              <button className="mini" disabled={busy} onClick={start}>
                {busy ? "합치는 중…" : "다시 합치기"}
              </button>
              <a className="cta" href={render.url} download>
                내려받기
              </a>
            </>
          ) : (
            <>
              <span className="hint">
                {stale
                  ? "다시 합치면 지금 내용으로 내려받을 수 있어요"
                  : render
                  ? "컷을 고쳤다면 다시 합쳐 주세요"
                  : "합치는 데 조금 걸려요"}
              </span>
              <button className="cta" disabled={busy} onClick={start}>
                {busy ? "합치는 중…" : render ? "다시 합치기" : "완성본 만들기"}
              </button>
            </>
          )}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/staleness-ui.test.js`
Expected: 전부 PASS

- [ ] **Step 6: 회귀를 확인한다**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: 가짜 모드로 화면을 눈으로 본다 (0원)**

```bash
SHOTFORM_FAKE=all npm run dev
```

한 바퀴 돌린 뒤 확인한다:

- [ ] ③에서 컷 문장을 고치면 그 컷에 배지가 뜨고 `④ 이미지 만들러 가기`가 잠긴다
- [ ] 그 컷만 다시 읽히면 배지가 사라지고 버튼이 풀린다
- [ ] ④에서 화면 설명을 고치면 그림에 배지가 뜨고 `⑤ 영상 만들러 가기`가 잠긴다
- [ ] ⑥에서 컷을 고친 뒤 들어가면 내려받기가 사라지고 `다시 합치기`만 남는다
- [ ] **아무것도 안 고쳤을 때는 배지가 하나도 없다** (거짓 경고 없음)

> ⚠️ dev 서버를 켜둔 채 `npm run build`를 돌리지 않는다 — `.next`가 덮여 dev 서버가 죽는다.

- [ ] **Step 8: 커밋**

```bash
git add "app/create/[id]/done/page.js"
git commit -m "fix: 낡은 완성본은 내려받지 못하게 한다

컷을 하나만 고쳐도 완성본은 옛 소리·옛 그림이 섞인 파일인데, 화면에는 멀쩡히 있고
내려받기도 눌렸다. 조용히 틀린 영상이 사장님 손에 가던 마지막 자리다.

앞 단계처럼 막지 않고 다시 합치기를 주 버튼으로 둔다 — 합성은 0원이고 재실행이 이미
정상 흐름이다."
```

---

## 다음 — 이 계획이 하지 않는 것

- 낡은 것을 **자동으로 다시 만들지 않는다**(사장님 승인 없이 돈이 나가면 안 된다)
- 낡은 파일을 **지우지 않는다**(되돌릴 길이 없어진다)
- 무효화 **이력을 남기지 않는다**(지금 필요한 것은 "지금 낡았는가" 하나다)

잔여 과제는 `sources/shotform-character-consistency-2026-07-29.md` §6 그대로다 —
VLM 검수 자체를 재는 일, 컷이 문장보다 잘아질 수 없는 문제, 출연 블록.
