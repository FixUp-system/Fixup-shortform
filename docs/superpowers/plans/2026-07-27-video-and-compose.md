# 목소리 · 영상 · 완성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지에서 끝나는 파이프라인을 완성된 mp4까지 잇는다 — 목소리(TTS) · 영상(i2v) · 합성(ffmpeg).

**Architecture:** 세 단계 모두 기존 컷 파이프라인과 같은 모양이다 — 라우트가 `status`를 세우고 fire-and-forget으로 파이프라인을 띄우면, 화면이 폴링해 컷별 진행을 보여준다. 새 모듈은 `lib/tts.js`(컷별 낭독) · `lib/i2v.js`(이미지→클립) · `lib/compose.js`(합성, 로컬 ffmpeg 기본 + fal 어댑터)이고, 가짜 모드 판정은 `lib/fake.js` 한 곳으로 모은다.

**Tech Stack:** Next 15 · React 19 · vitest 4 · fal.ai(TTS·i2v·ffmpeg-api) · `ffmpeg-static` · `pretendard`(자막 폰트)

## Global Constraints

스펙 `docs/superpowers/specs/2026-07-27-video-and-compose-design.md`를 따른다.

- **실제로 돌리지 않는다.** fal에 한 푼도 쓰지 않는다. 모든 확인은 `SHOTFORM_FAKE=all`(완전 0원)로 한다.
- **단계 순서** — `① 자료 → ② 대본 → ③ 이미지 → ④ 목소리 → ⑤ 영상 → ⑥ 완성`. 목소리가 이미지 뒤로 간다.
- **`cut.seconds`는 ④를 지나면 실측값**이다. 추정치(글자÷5.5)를 덮어쓴다.
- **i2v 상한 `I2V_MAX_SECONDS = 10`.** 더 긴 컷은 잘라 만들고 합성에서 정지로 늘린다.
- 기본 엔드포인트 — TTS `fal-ai/elevenlabs/tts/turbo-v2.5`, i2v `fal-ai/ltx-2.3/image-to-video/fast`.
  각각 `FAL_TTS_ENDPOINT` · `FAL_I2V_ENDPOINT`로 교체 가능.
- 새 fal 호출은 **전부 `addRecord`로 비용을 기록**한다. 가짜 모드에서는 기록하지 않는다.
- 페이지는 lib을 직접 부르지 않는다 — 전부 API 경유(기존 규약).
- 커밋 메시지는 저장소 관례를 따른다 — 한국어, `타입: 무엇을 왜`.
- **dev 서버를 켜둔 채 `npm run build`를 돌리지 않는다**(`.next`가 덮여 서버가 죽는다).

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/fake.js` | 가짜 모드 판정 한 곳 (`off`/`fal`/`all`) | **신규** |
| `lib/tts.js` | 문장 하나를 낭독 → `{url, seconds}` | **신규** |
| `lib/i2v.js` | 이미지+초 → 클립 `{url, seconds}` | **신규** |
| `lib/compose.js` | 클립·오디오·자막 → mp4. 로컬 ffmpeg + fal 어댑터 | **신규** |
| `lib/subtitles.js` | 컷 배열 → 자막 타이밍(ASS/드로우텍스트 인자) | **신규** |
| `lib/costs.js` | 단가표에 단위(`sec`/`chars`) 추가 | 수정 |
| `lib/llm.js` | `all` 모드에서 가짜 응답 | 수정 |
| `lib/imagegen.js` · `lib/vlm.js` | 판정을 `lib/fake.js`로 이관 | 수정 |
| `lib/pipeline.js` | `runVoicePipeline` · `runVideoPipeline` 추가 | 수정 |
| `lib/steps.js` | STEPS 순서·번호, `currentStepKey` 확장 | 수정 |
| `app/api/projects/[id]/voice/route.js` + `status/` | ④ 시작·폴링 | **신규** |
| `app/api/projects/[id]/clips/route.js` + `status/` | ⑤ 시작·폴링 | **신규** |
| `app/api/projects/[id]/render/route.js` + `status/` | ⑥ 시작·폴링 | **신규** |
| `app/api/projects/[id]/voice/[idx]/regen/` · `clips/[idx]/regen/` | 컷별 재생성 | **신규** |
| `app/create/[id]/voice/page.js` · `video/page.js` · `done/page.js` | 자리표시자 → 실제 화면 | 교체 |
| `assets/subtitle-font.otf` | 자막용 Pretendard | **신규(복사본)** |
| `package.json` | `ffmpeg-static` 추가 | 수정 |

⑤영상 라우트를 `clips`로 짓는 이유: `app/api/video/route.js`(Quick Create용 text-to-video)가 이미 있어 이름이 겹친다.

---

### Task 0: 작업 브랜치

**Files:** 없음 (git 조작만)

**Interfaces:**
- Consumes: 없음
- Produces: `feature/video-compose` 브랜치

- [ ] **Step 1: 상태 확인**

```bash
git branch --show-current
git status --short
npm test
```

기대: 테스트 전량 통과. 여기가 기준선이다.

- [ ] **Step 2: 분기**

```bash
git checkout -b feature/video-compose
```

워킹트리에 다른 세션의 변경이 있으면 워크트리로 격리한다:
`git worktree add ../shotform-video -b feature/video-compose && cd ../shotform-video && npm install`

---

### Task 1: 가짜 모드 3단계 + 비용 단위 확장

두 가지를 한 태스크로 묶는 이유: 이후 모든 태스크가 둘 다에 의존한다. 여기가 기반이다.

**Files:**
- Create: `lib/fake.js`, `tests/fake.test.js`
- Modify: `lib/costs.js`, `lib/imagegen.js`, `lib/vlm.js`, `lib/llm.js`, `tests/costs.test.js`, `tests/vlm.test.js`

**Interfaces:**
- Produces:
  - `fakeLevel(): "off" | "fal" | "all"`
  - `fakeFal(): boolean` — fal 호출을 건너뛰는가
  - `fakeLlm(): boolean` — OpenAI 호출을 건너뛰는가
  - `estimateCost(endpoint, amount): number` — `amount`는 단위에 따라 초 또는 글자 수

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/fake.test.js`:

```js
import { describe, it, expect, afterEach } from "vitest";
import { fakeLevel, fakeFal, fakeLlm } from "../lib/fake";

afterEach(() => {
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_FAKE_IMAGES;
});

describe("fakeLevel", () => {
  it("아무것도 없으면 off", () => {
    expect(fakeLevel()).toBe("off");
    expect(fakeFal()).toBe(false);
    expect(fakeLlm()).toBe(false);
  });

  it("SHOTFORM_FAKE=1 은 fal만 막는다", () => {
    process.env.SHOTFORM_FAKE = "1";
    expect(fakeLevel()).toBe("fal");
    expect(fakeFal()).toBe(true);
    expect(fakeLlm()).toBe(false);
  });

  it("SHOTFORM_FAKE=all 은 LLM까지 막는다", () => {
    process.env.SHOTFORM_FAKE = "all";
    expect(fakeLevel()).toBe("all");
    expect(fakeFal()).toBe(true);
    expect(fakeLlm()).toBe(true);
  });

  it("옛 이름 SHOTFORM_FAKE_IMAGES=1 도 그대로 인정한다", () => {
    // tests/vlm.test.js 가 이 이름을 쓰고 있었다 — 깨뜨리지 않는다
    process.env.SHOTFORM_FAKE_IMAGES = "1";
    expect(fakeLevel()).toBe("fal");
  });
});
```

`tests/costs.test.js`에 추가:

```js
describe("단위", () => {
  it("글자당 단가는 1000자 기준으로 계산한다", () => {
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 165)).toBe(0.01); // 0.00825 → 0.01
    expect(estimateCost("fal-ai/elevenlabs/tts/turbo-v2.5", 2000)).toBe(0.1);
  });

  it("i2v와 ffmpeg 단가가 표에 있다", () => {
    expect(estimateCost("fal-ai/ltx-2.3/image-to-video/fast", 10)).toBe(0.4);
    expect(estimateCost("fal-ai/ffmpeg-api/merge-videos", 30)).toBe(0);
    expect(estimateCost("fal-ai/ffmpeg-api/merge-audio-video", 30)).toBe(0.01); // 0.006 → 0.01
  });

  it("기존 초당 계산은 그대로다", () => {
    expect(estimateCost("fal-ai/kling-video/v3", 5)).toBe(0.63);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run tests/fake.test.js tests/costs.test.js
```

기대: `fake.js`가 없어 import 실패, costs의 새 단가는 기본값으로 떨어져 FAIL.

- [ ] **Step 3: `lib/fake.js` 를 만든다**

```js
// 가짜 모드 판정 한 곳 — 세 단계다.
//   off : 전부 진짜
//   fal : fal(이미지·TTS·i2v·합성)만 가짜. OpenAI는 진짜라 대본 내용까지 확인된다
//   all : OpenAI까지 가짜. 완전 0원 — 배선과 상태 전이만 확인한다
export function fakeLevel() {
  const v = process.env.SHOTFORM_FAKE;
  if (v === "all") return "all";
  // 옛 이름은 계속 인정한다 (tests/vlm.test.js 가 쓴다)
  if (v === "1" || process.env.SHOTFORM_FAKE_IMAGES === "1") return "fal";
  return "off";
}

export function fakeFal() {
  return fakeLevel() !== "off";
}

export function fakeLlm() {
  return fakeLevel() === "all";
}
```

- [ ] **Step 4: `lib/costs.js` 의 단가표에 단위를 넣는다**

`PRICE_TABLE`의 각 항목에 `unit`을 명시하고 새 항목을 추가한다. 기존 항목은 `unit: "sec"`이다.

```js
// 단위가 둘이다 — 영상은 초당, TTS는 글자당(1,000자 기준).
// unit 을 생략하면 "sec" 으로 본다(기존 호출부 보존).
const PRICE_TABLE = [
  { prefix: "fal-ai/veo3.1/fast", perSec: 0.15 },
  { prefix: "fal-ai/veo3.1", perSec: 0.4 },
  { prefix: "fal-ai/kling-video/v3", perSec: 0.126 },
  { prefix: "fal-ai/kling-video", perSec: 0.05 },
  { prefix: "fal-ai/minimax", perSec: 0.05 },
  { prefix: "fal-ai/ltx-2.3/text-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3/image-to-video/fast", perSec: 0.04 },
  { prefix: "fal-ai/ltx-2.3", perSec: 0.06 },
  { prefix: "fal-ai/ltx-2", perSec: 0.04 },
  // 합성 — merge-videos 는 무료로 표기돼 있다(2026-07-27 확인, 실청구 미검증)
  { prefix: "fal-ai/ffmpeg-api/merge-videos", perSec: 0 },
  { prefix: "fal-ai/ffmpeg-api/merge-audio-video", perSec: 0.0002 },
  // TTS — 글자당
  { prefix: "fal-ai/elevenlabs/tts", unit: "chars", per1k: 0.05 },
  { prefix: "fal-ai/chatterbox", unit: "chars", per1k: 0.025 },
  { prefix: "fal-ai/minimax/speech", unit: "chars", per1k: 0.1 },
];
```

> `fal-ai/minimax/speech`를 `fal-ai/minimax`(영상, 초당)보다 **위**에 둘 수 없다 —
> 배열 순서상 `minimax`가 먼저 매치된다. 그래서 speech 항목을 **`minimax` 위로 옮긴다.**
> 순서를 바꾼 뒤 `tests/costs.test.js`에 단언을 추가한다:
> `expect(estimateCost("fal-ai/minimax/speech-02-hd", 1000)).toBe(0.1)`

`estimateCost`를 단위에 맞춰 고친다.

```js
export function estimateCost(endpoint, amount) {
  const entry = PRICE_TABLE.find((p) => endpoint.startsWith(p.prefix));
  if (!entry) return Math.round(DEFAULT_PER_SEC * Number(amount) * 100) / 100;
  const raw = entry.unit === "chars"
    ? (entry.per1k * Number(amount)) / 1000
    : entry.perSec * Number(amount);
  return Math.round(raw * 100) / 100;
}
```

- [ ] **Step 5: 기존 모듈이 `lib/fake.js` 를 보게 한다**

`lib/imagegen.js` — `fakeEnabled()` 지역 함수를 지우고 `fakeFal()`을 쓴다.

```js
import { fakeFal } from "./fake";
// ...
export async function generateImage({ prompt, aspect_ratio, refImagePath, fetchImpl = fetch }) {
  if (fakeFal()) return { url: placeholderImage(prompt, aspect_ratio) };
```

`lib/vlm.js` — `process.env.SHOTFORM_FAKE_IMAGES === "1"` 조건을 `fakeFal()`로 바꾼다.

`lib/llm.js` — `callJson` 맨 앞에 가짜 분기를 넣는다. **무엇을 돌려줄지가 중요하다** —
호출자가 기대하는 모양이 제각각이라, 형태를 지어내면 검증기(`validate.js`)에서 터진다.

```js
import { fakeLlm } from "./fake";

// 가짜 응답 — 호출자마다 기대하는 키가 달라서, system 프롬프트에 담긴 힌트로 갈라 준다.
// 목적은 "내용"이 아니라 "배선과 상태 전이"를 보는 것이다.
function fakeResponse(system) {
  const s = system || "";
  if (s.includes("브리핑")) {
    return { facts: ["가짜 사실 하나", "가짜 사실 둘"], asked: [], confirmed: false };
  }
  if (s.includes("컷") || s.includes("경계")) {
    return { boundaries: [1] };
  }
  if (s.includes("화면")) {
    return { shots: [{ shows: "가짜 화면 설명" }] };
  }
  return { text: "가짜 원고입니다. 배선을 확인하려고 만든 문장입니다. 실제 내용이 아닙니다." };
}

export async function callJson({ system, messages, fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY, temperature = 0.4 }) {
  if (fakeLlm()) return fakeResponse(system);
  // ...기존 구현
}
```

> ⚠️ 위 `fakeResponse`의 키 이름은 **구현 시 실제 호출부에서 확인해 맞춘다.**
> `lib/briefing.js` · `lib/script.js` · `lib/cuts.js`가 `callJson` 결과에서 무엇을 꺼내는지 읽고,
> `lib/validate.js`의 검증을 통과하는 최소 형태로 채운다. 통과하지 못하면 재시도 루프에 빠진다.

- [ ] **Step 6: 통과 확인**

```bash
npx vitest run tests/fake.test.js tests/costs.test.js tests/vlm.test.js
npm test
```

기대: 전량 PASS. `vlm.test.js`가 옛 이름을 계속 써도 통과한다.

- [ ] **Step 7: 커밋**

```bash
git add lib/fake.js lib/costs.js lib/imagegen.js lib/vlm.js lib/llm.js tests/
git commit -m "feat: 가짜 모드를 세 단계로 넓히고, 단가표에 글자당 단위를 넣는다"
```

---

### Task 2: 단계 순서 재배열

목소리가 이미지 뒤로 간다. **뒤 태스크가 전부 이 순서를 전제하므로 먼저 한다.**

**Files:**
- Modify: `lib/steps.js`, `tests/steps.test.js`
- Modify: `app/create/[id]/script/page.js`(안내 문구의 번호), `components/SoonStep.jsx` 호출부

**Interfaces:**
- Consumes: 없음
- Produces: `STEPS` 순서 `material · script · images · voice · video · done`,
  `currentStepKey`가 `voice`/`video`/`done`을 판정

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/steps.test.js`에 추가:

```js
describe("단계 순서와 판정", () => {
  it("목소리는 이미지 뒤다", () => {
    const keys = STEPS.map((s) => s.key);
    expect(keys).toEqual(["material", "script", "images", "voice", "video", "done"]);
  });

  it("status 가 뒤 단계를 가리킨다", () => {
    const base = { briefing: { confirmed: true } };
    expect(currentStepKey({ ...base, status: "cuts" })).toBe("images");
    expect(currentStepKey({ ...base, status: "voice" })).toBe("voice");
    expect(currentStepKey({ ...base, status: "video" })).toBe("video");
    expect(currentStepKey({ ...base, status: "done" })).toBe("done");
  });

  it("뒤 단계에 있으면 앞 단계는 전부 도달 가능하다", () => {
    const p = { briefing: { confirmed: true }, status: "video" };
    for (const k of ["material", "script", "images", "voice", "video"]) {
      expect(isReachable(k, p), k).toBe(true);
    }
    expect(isReachable("done", p)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run tests/steps.test.js
```

- [ ] **Step 3: `lib/steps.js` 를 고친다**

```js
export const STEPS = [
  { key: "material", no: "①", label: "자료", seg: "briefing" },
  { key: "script", no: "②", label: "대본", seg: "script" },
  { key: "images", no: "③", label: "이미지", seg: "images" },
  { key: "voice", no: "④", label: "목소리", seg: "voice" },
  { key: "video", no: "⑤", label: "영상", seg: "video" },
  { key: "done", no: "⑥", label: "완성", seg: "done" },
];
```

`soon: true`를 **전부 지운다**(세 단계를 다 구현하므로).

```js
// 문턱은 산출물의 유무다. 뒤 단계부터 확인해, 이미 앞서간 프로젝트를 뒤로 끌어내리지 않는다.
export function currentStepKey(project) {
  if (!project) return "material";
  if (!project.briefing?.confirmed) return "material";
  if (project.status === "done") return "done";
  if (project.status === "video") return "video";
  if (project.status === "voice") return "voice";
  if (project.status === "cuts") return "images";
  return "script";
}
```

- [ ] **Step 4: 화면의 번호 문구를 고친다**

번호가 박힌 곳을 찾아 고친다.

```bash
grep -rn "④ 이미지\|⑤ 이미지\|③ 목소리\|목소리(③)\|목소리(④)" app components
```

`app/create/[id]/script/page.js`의 `"④ 이미지 확인하러 가기"` → `"③ 이미지 확인하러 가기"`,
안내 문구의 `"목소리(③)는 준비 중이라 건너뜁니다"` → `"이미지를 만든 뒤 목소리를 입힙니다"`.

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
npm test
git add lib/steps.js tests/steps.test.js app components
git commit -m "refactor: 목소리를 이미지 뒤로 옮긴다 — 컷이 있어야 컷별로 읽힌다"
```

---

### Task 3: TTS 모듈

**Files:**
- Create: `lib/tts.js`, `tests/tts.test.js`

**Interfaces:**
- Consumes: `fakeFal()` (Task 1)
- Produces: `generateSpeech({ text, voiceId, fetchImpl }): Promise<{url, seconds}>`
  — 뒤 태스크가 이 시그니처를 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { describe, it, expect, afterEach } from "vitest";
import { generateSpeech, VOICES } from "../lib/tts";

afterEach(() => { delete process.env.SHOTFORM_FAKE; });

describe("generateSpeech", () => {
  it("가짜 모드에서는 fal을 부르지 않고 추정 길이를 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    let called = false;
    const r = await generateSpeech({
      text: "가".repeat(55), voiceId: VOICES[0].id,
      fetchImpl: () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r.seconds).toBe(10);          // 55자 ÷ 5.5
    expect(r.url).toMatch(/^data:audio\//);
  });

  it("응답의 실제 길이를 그대로 돌려준다", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ audio: { url: "https://fal.media/a.mp3", duration: 4.3 } }),
    });
    const r = await generateSpeech({ text: "안녕하세요", voiceId: "v1", fetchImpl });
    expect(r).toEqual({ url: "https://fal.media/a.mp3", seconds: 4.3 });
  });

  it("길이가 안 오면 글자 수로 어림한다", async () => {
    // 모델마다 응답 모양이 다르다 — 길이를 안 주는 경우가 있다
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ audio: { url: "https://fal.media/a.mp3" } }),
    });
    const r = await generateSpeech({ text: "가".repeat(11), voiceId: "v1", fetchImpl });
    expect(r.seconds).toBe(2);
  });

  it("실패하면 이유를 담아 던진다", async () => {
    const fetchImpl = async () => ({ ok: false, status: 402, text: async () => "no credit" });
    await expect(generateSpeech({ text: "가", voiceId: "v1", fetchImpl })).rejects.toThrow(/402/);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run tests/tts.test.js
```

- [ ] **Step 3: `lib/tts.js` 를 만든다**

```js
// fal TTS — 컷 하나(문장 하나)를 읽는다. 길이를 실측해 돌려주는 것이 이 모듈의 존재 이유다.
import { addRecord, costActor, estimateCost } from "./costs";
import { fakeFal } from "./fake";
import { CHARS_PER_SEC } from "./script";
import { randomUUID } from "crypto";

// 목소리 후보 — 실제 voice_id 는 fal 문서에서 확인해 채운다.
// id 를 비워 두면 라우트가 400 을 돌려주므로, 구현 시 반드시 실제 값으로 바꾼다.
export const VOICES = [
  { id: "", label: "차분한 여성" },
  { id: "", label: "밝은 여성" },
  { id: "", label: "차분한 남성" },
  { id: "", label: "밝은 남성" },
];

// 1초짜리 무음 WAV — 가짜 모드에서 미리듣기 자리를 채운다(재생해도 아무 소리 안 남).
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

function estimateSeconds(text) {
  const chars = (text || "").replace(/\s/g, "").length;
  return Math.max(1, Math.round(chars / CHARS_PER_SEC));
}

export async function generateSpeech({ text, voiceId, fetchImpl = fetch }) {
  if (fakeFal()) return { url: SILENT_WAV, seconds: estimateSeconds(text) };

  const endpoint = process.env.FAL_TTS_ENDPOINT || "fal-ai/elevenlabs/tts/turbo-v2.5";
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify({ text, voice: voiceId }),
  });
  if (!res.ok) {
    throw new Error(`목소리 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.audio?.url;
  if (!url) throw new Error("목소리 결과가 비어 있어요");

  // 길이는 모델이 주는 값이 우선 — 없으면 글자 수로 어림한다
  const seconds = Number(data?.audio?.duration) || estimateSeconds(text);
  const chars = (text || "").length;

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "목소리", user: costActor(),
    prompt: (text || "").slice(0, 300), duration: String(seconds), aspect_ratio: "-",
    est_cost_usd: estimateCost(endpoint, chars), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds };
}
```

> `voice` 파라미터 이름과 응답의 `audio.duration` 위치는 **모델마다 다르다.**
> 구현 시 fal 문서에서 확인하고, 다르면 여기와 테스트를 함께 고친다.

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
npx vitest run tests/tts.test.js && npm test
git add lib/tts.js tests/tts.test.js
git commit -m "feat: 컷 하나를 읽는 TTS 모듈 — 길이를 실측해 돌려준다"
```

---

### Task 4: ④목소리 — 파이프라인 · 라우트 · 화면

**Files:**
- Modify: `lib/pipeline.js`
- Create: `app/api/projects/[id]/voice/route.js`, `app/api/projects/[id]/voice/status/route.js`,
  `app/api/projects/[id]/voice/[idx]/regen/route.js`
- Replace: `app/create/[id]/voice/page.js`
- Modify: `tests/pipeline.test.js`, `tests/routes.test.js`

**Interfaces:**
- Consumes: `generateSpeech` (Task 3), `currentStepKey` (Task 2)
- Produces:
  - `runVoicePipeline(projectId, deps?)` — 컷마다 `audio`를 채우고 `cut.seconds`를 실측으로 덮어씀
  - `POST /api/projects/[id]/voice` body `{voiceId}` → `{started:true}`
  - `GET /api/projects/[id]/voice/status` → `{status, cuts, voice_error}`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pipeline.test.js`에 추가:

```js
describe("runVoicePipeline", () => {
  it("컷마다 audio를 채우고 seconds를 실측으로 덮어쓴다", async () => {
    const p = await createProject({ settings: {}, material: { text: "x" } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      cuts: [
        { idx: 0, sentence: "첫 문장", seconds: 3, state: "done", image: { url: "i0" } },
        { idx: 1, sentence: "둘째 문장", seconds: 9, state: "done", image: { url: "i1" } },
      ],
    }));

    await pipeline.runVoicePipeline(p.id, {
      speak: async ({ text }) => ({ url: "a/" + text, seconds: 4.3 }),
    });

    const saved = await getProject(p.id);
    expect(saved.status).toBe("voice");
    expect(saved.cuts[0].audio).toEqual({ url: "a/첫 문장", seconds: 4.3 });
    // 추정치 3초·9초가 실측 4.3초로 덮인다 — 소리와 그림이 어긋나지 않게
    expect(saved.cuts[0].seconds).toBe(4.3);
    expect(saved.cuts[1].seconds).toBe(4.3);
  });

  it("한 컷이 실패해도 나머지는 살아남는다", async () => {
    const p = await createProject({ settings: {}, material: { text: "x" } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "cuts",
      cuts: [
        { idx: 0, sentence: "실패", seconds: 3, state: "done" },
        { idx: 1, sentence: "성공", seconds: 3, state: "done" },
      ],
    }));

    await pipeline.runVoicePipeline(p.id, {
      speak: async ({ text }) => {
        if (text === "실패") throw new Error("고장");
        return { url: "a", seconds: 2 };
      },
    });

    const saved = await getProject(p.id);
    expect(saved.cuts[0].voice_error).toMatch(/고장/);
    expect(saved.cuts[1].audio.url).toBe("a");
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run tests/pipeline.test.js -t "runVoicePipeline"
```

- [ ] **Step 3: `lib/pipeline.js` 에 파이프라인을 추가한다**

```js
import { generateSpeech } from "./tts";

// ④목소리 — 컷마다 문장을 읽힌다. 컷별로 나눠 읽는 이유는 길이를 알아야 하기 때문이다:
// 이 길이가 곧 클립 길이(⑤)이자 자막 타이밍(⑥)이 된다.
export async function runVoicePipeline(projectId, deps = {}) {
  const speak = deps.speak || generateSpeech;
  const project = await getProject(projectId);
  const cuts = project?.cuts || [];

  await Promise.all(
    cuts.map(async (cut) => {
      try {
        const { url, seconds } = await speak({ text: cut.sentence, voiceId: project.voice_id });
        await updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) =>
            c.idx === cut.idx
              // 추정 seconds 를 실측으로 덮는다 — 여기가 이 파이프라인의 핵심이다
              ? { ...c, audio: { url, seconds }, seconds, voice_error: null }
              : c
          ),
        }));
      } catch (e) {
        await updateProject(projectId, (proj) => ({
          ...proj,
          cuts: proj.cuts.map((c) =>
            c.idx === cut.idx ? { ...c, voice_error: e?.message || "읽지 못했어요" } : c
          ),
        })).catch(() => {});
      }
    })
  );

  await updateProject(projectId, (proj) => ({ ...proj, status: "voice" }));
}
```

- [ ] **Step 4: 라우트 세 개를 만든다**

`app/api/projects/[id]/voice/route.js` — `cuts/route.js`의 구조를 그대로 따른다.

```js
import { getProject, updateProject } from "../../../../../lib/projects";
import { runVoicePipeline } from "../../../../../lib/pipeline";
import { VOICES } from "../../../../../lib/tts";

export async function POST(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  // 읽을 컷이 있어야 한다 — 목소리는 컷별로 만든다
  if (!(project.cuts || []).length) {
    return Response.json({ error: "이미지를 먼저 만들어 주세요" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const voiceId = VOICES.find((v) => v.id === body?.voiceId)?.id;
  if (!voiceId) return Response.json({ error: "목소리를 골라 주세요" }, { status: 400 });

  // 멱등 가드 — 이미 만든 소리를 지우고 다시 만들지 않는다(컷 재생성으로 개별 처리)
  if (project.status === "voice" && (project.cuts || []).some((c) => c.audio)) {
    return Response.json({ error: "이미 만든 목소리가 있어요" }, { status: 409 });
  }

  await updateProject(id, (proj) => ({ ...proj, voice_id: voiceId, voice_error: null }));

  runVoicePipeline(id).catch(async (e) => {
    console.error("voice pipeline error:", e);
    await updateProject(id, (proj) => ({
      ...proj, voice_error: e?.message || "목소리를 만들지 못했어요",
    })).catch(() => {});
  });
  return Response.json({ started: true });
}
```

`voice/status/route.js`:

```js
import { getProject } from "../../../../../../lib/projects";

export async function GET(req, { params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  return Response.json({
    status: project.status, cuts: project.cuts, voice_error: project.voice_error || null,
  });
}
```

`voice/[idx]/regen/route.js` — `cuts/[idx]/regen/route.js`를 읽고 같은 구조로 만든다.
컷 하나만 다시 읽히고 `regen_count` 대신 `voice_regen_count`로 ≤3을 센다.

- [ ] **Step 5: `app/create/[id]/voice/page.js` 를 만든다**

`app/create/[id]/images/page.js`를 **읽고 같은 구조**로 만든다(폴링·컷 목록·재생성).
차이는 세 가지다.

- 시작 전에 **목소리 고르기**가 있다 — `VOICES`를 칩으로 깔고, 고른 뒤 `POST /voice`
- 컷마다 `<audio controls src={cut.audio.url}>`로 들어본다
- 진행 표시는 `cuts.filter(c => c.audio).length / cuts.length`

주 버튼은 `.cta` 하나(`⑤ 영상 만들기 →`), 크레딧 칩은 넣지 않는다(비용 계산은 별도 과제).

- [ ] **Step 6: 통과 확인 후 커밋**

```bash
npm test
SHOTFORM_FAKE=all npm run dev   # 화면을 직접 클릭해 본다
git add lib/pipeline.js app tests
git commit -m "feat: ④목소리 — 컷별 낭독과 실측 길이 반영"
```

---

### Task 5: i2v 모듈

**Files:**
- Create: `lib/i2v.js`, `tests/i2v.test.js`

**Interfaces:**
- Consumes: `fakeFal()` (Task 1)
- Produces:
  - `I2V_MAX_SECONDS = 10`
  - `generateClip({ imageUrl, seconds, aspect_ratio, fetchImpl }): Promise<{url, seconds, truncated}>`
    — `truncated`는 상한에 걸려 잘렸는가

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { describe, it, expect, afterEach } from "vitest";
import { generateClip, I2V_MAX_SECONDS } from "../lib/i2v";

afterEach(() => { delete process.env.SHOTFORM_FAKE; });

describe("generateClip", () => {
  it("가짜 모드에서는 이미지 URL을 그대로 클립으로 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    let called = false;
    const r = await generateClip({
      imageUrl: "data:image/svg+xml;base64,AAA", seconds: 4, aspect_ratio: "9:16",
      fetchImpl: () => { called = true; },
    });
    expect(called).toBe(false);
    expect(r).toEqual({ url: "data:image/svg+xml;base64,AAA", seconds: 4, truncated: false });
  });

  it("상한보다 긴 컷은 잘라 만들고 표시를 남긴다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "https://fal.media/v.mp4" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 13, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(I2V_MAX_SECONDS);
    expect(r.seconds).toBe(I2V_MAX_SECONDS);
    expect(r.truncated).toBe(true);
  });

  it("상한 안이면 그대로 보낸다", async () => {
    let sent;
    const fetchImpl = async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ video: { url: "v" } }) };
    };
    const r = await generateClip({ imageUrl: "i", seconds: 4.3, aspect_ratio: "9:16", fetchImpl });
    expect(sent.duration).toBe(4.3);
    expect(r.truncated).toBe(false);
  });

  it("실패하면 이유를 담아 던진다", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    await expect(
      generateClip({ imageUrl: "i", seconds: 4, aspect_ratio: "9:16", fetchImpl })
    ).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: 실패 확인 → Step 3: 구현**

```js
// fal image-to-video — 컷 이미지를 시작 프레임으로 삼아 움직이게 한다.
import { addRecord, costActor, estimateCost } from "./costs";
import { fakeFal } from "./fake";
import { randomUUID } from "crypto";

// i2v 모델의 현실적 상한. 원고 컷이 이보다 길게 나오는 경우가 있어(12~13초) 잘라 만들고,
// 남는 시간은 합성에서 마지막 프레임 정지로 늘린다. 컷을 잘게 나누는 건 별도 과제다.
export const I2V_MAX_SECONDS = 10;

export async function generateClip({ imageUrl, seconds, aspect_ratio, fetchImpl = fetch }) {
  const want = Number(seconds) || 1;
  const duration = Math.min(want, I2V_MAX_SECONDS);
  const truncated = want > I2V_MAX_SECONDS;

  if (fakeFal()) return { url: imageUrl, seconds: duration, truncated };

  const endpoint = process.env.FAL_I2V_ENDPOINT || "fal-ai/ltx-2.3/image-to-video/fast";
  const res = await fetchImpl(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${process.env.FAL_KEY}` },
    body: JSON.stringify({ image_url: imageUrl, duration, aspect_ratio }),
  });
  if (!res.ok) {
    throw new Error(`영상 생성 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.video?.url;
  if (!url) throw new Error("영상 결과가 비어 있어요");

  await addRecord({
    request_id: randomUUID(), ts: Date.now(), endpoint,
    stage: "영상", user: costActor(),
    prompt: "-", duration: String(duration), aspect_ratio,
    est_cost_usd: estimateCost(endpoint, duration), status: "done", video_url: url,
  }).catch(() => {});

  return { url, seconds: duration, truncated };
}
```

> `image_url`·`duration` 파라미터 이름과 응답의 `video.url` 위치는 모델마다 다르다.
> 구현 시 fal 문서에서 확인하고 다르면 여기와 테스트를 함께 고친다.

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
npx vitest run tests/i2v.test.js && npm test
git add lib/i2v.js tests/i2v.test.js
git commit -m "feat: 이미지를 시작 프레임으로 클립을 만드는 i2v 모듈 — 10초 상한"
```

---

### Task 6: ⑤영상 — 파이프라인 · 라우트 · 화면

**Files:**
- Modify: `lib/pipeline.js`
- Create: `app/api/projects/[id]/clips/route.js` + `status/` + `[idx]/regen/`
- Replace: `app/create/[id]/video/page.js`
- Modify: `tests/pipeline.test.js`

**Interfaces:**
- Consumes: `generateClip` (Task 5)
- Produces: `runVideoPipeline(projectId, deps?)` — 컷마다 `video`를 채우고 `status: "video"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
describe("runVideoPipeline", () => {
  it("컷마다 클립을 만들고 잘린 컷을 표시한다", async () => {
    const p = await createProject({ settings: { aspect_ratio: "9:16" }, material: { text: "x" } });
    await updateProject(p.id, (proj) => ({
      ...proj, status: "voice",
      cuts: [
        { idx: 0, sentence: "짧은", seconds: 4, image: { url: "i0" }, audio: { url: "a0", seconds: 4 } },
        { idx: 1, sentence: "긴", seconds: 13, image: { url: "i1" }, audio: { url: "a1", seconds: 13 } },
      ],
    }));

    await pipeline.runVideoPipeline(p.id, {
      clip: async ({ seconds }) => ({
        url: "v" + seconds, seconds: Math.min(seconds, 10), truncated: seconds > 10,
      }),
    });

    const saved = await getProject(p.id);
    expect(saved.status).toBe("video");
    expect(saved.cuts[0].video).toEqual({ url: "v4", seconds: 4, truncated: false });
    expect(saved.cuts[1].video.truncated).toBe(true);
    // 소리 길이(13초)는 그대로 둔다 — 합성이 정지로 늘려 맞춘다
    expect(saved.cuts[1].seconds).toBe(13);
  });
});
```

- [ ] **Step 2: 실패 확인 → Step 3: 구현**

`runVoicePipeline`과 같은 모양이다. 컷마다 `clip({imageUrl: cut.image.url, seconds: cut.seconds, aspect_ratio})`을 부르고 `cut.video`에 담는다. 실패는 `cut.video_error`에 남긴다. 끝나면 `status: "video"`.

**`cut.seconds`를 클립 길이로 덮어쓰지 않는다.** 소리가 13초인데 그림이 10초인 상태를 그대로 두고, 합성이 정지로 늘려 맞춘다.

- [ ] **Step 4: 라우트 · 화면**

라우트 세 개는 Task 4와 같은 구조다(`clips` 경로). 가드는 **"목소리를 먼저 만들어 주세요"** —
`cuts.every(c => c.audio)`가 아니면 400.

화면은 `images/page.js` 구조를 따르되 미리보기가 `<video controls>`다.
`truncated`인 컷에는 **"이 컷은 10초까지만 움직이고 나머지는 멈춰 있어요"**를 배지로 붙인다.

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
npm test
git add lib/pipeline.js app tests
git commit -m "feat: ⑤영상 — 컷 이미지를 클립으로, 상한을 넘은 컷은 표시"
```

---

### Task 7: 합성 — 자막 · 로컬 ffmpeg · fal 어댑터

이 태스크가 가장 크다. 자막 타이밍 계산과 ffmpeg 인자 조립을 분리해 각각 테스트한다.

**Files:**
- Create: `lib/subtitles.js`, `lib/compose.js`, `tests/subtitles.test.js`, `tests/compose.test.js`,
  `assets/subtitle-font.otf`
- Modify: `package.json`

**Interfaces:**
- Consumes: `fakeFal()` (Task 1)
- Produces:
  - `buildCues(cuts): Array<{start, end, text}>` — 자막 타이밍
  - `toAss(cues, { width, height }): string` — 자막 파일 내용
  - `composeVideo({ projectId, cuts, aspect_ratio, fetchImpl }): Promise<{url, seconds, fake?}>`

- [ ] **Step 1: 자막 타이밍 테스트를 쓴다**

```js
import { describe, it, expect } from "vitest";
import { buildCues, toAss } from "../lib/subtitles";

describe("buildCues", () => {
  it("컷 길이를 누적해 시작·끝을 만든다", () => {
    const cues = buildCues([
      { sentence: "첫 문장", seconds: 4 },
      { sentence: "둘째 문장", seconds: 3.5 },
      { sentence: "셋째 문장", seconds: 2 },
    ]);
    expect(cues).toEqual([
      { start: 0, end: 4, text: "첫 문장" },
      { start: 4, end: 7.5, text: "둘째 문장" },
      { start: 7.5, end: 9.5, text: "셋째 문장" },
    ]);
  });

  it("빈 문장은 건너뛰되 시간은 흐른다", () => {
    const cues = buildCues([
      { sentence: "", seconds: 2 },
      { sentence: "둘째", seconds: 3 },
    ]);
    expect(cues).toEqual([{ start: 2, end: 5, text: "둘째" }]);
  });
});

describe("toAss", () => {
  it("세이프존을 아래에서 18% 위에 둔다", () => {
    const ass = toAss([{ start: 0, end: 2, text: "가" }], { width: 1080, height: 1920 });
    // MarginV = 1920 * 0.18 = 345.6 → 346
    expect(ass).toMatch(/MarginV.*346|,346,/);
    expect(ass).toContain("가");
  });

  it("시간을 ASS 형식으로 쓴다", () => {
    const ass = toAss([{ start: 4, end: 7.5, text: "나" }], { width: 1080, height: 1920 });
    expect(ass).toContain("0:00:04.00");
    expect(ass).toContain("0:00:07.50");
  });
});
```

- [ ] **Step 2: 실패 확인 → Step 3: `lib/subtitles.js` 구현**

ASS 자막을 고르는 이유: 위치·여백을 스타일 한 줄로 정할 수 있고, ffmpeg의 `subtitles` 필터가
폰트 파일을 그대로 받는다. `drawtext`로 문장마다 필터를 쌓는 것보다 단순하다.

```js
// 자막 — 컷 경계가 곧 자막 경계다. 컷의 seconds 는 ④에서 실측된 낭독 길이라 소리와 맞는다.
export function buildCues(cuts) {
  let t = 0;
  const cues = [];
  for (const c of cuts || []) {
    const dur = Number(c.seconds) || 0;
    const text = (c.sentence || "").trim();
    if (text) cues.push({ start: round2(t), end: round2(t + dur), text });
    t += dur;
  }
  return cues;
}

const round2 = (n) => Math.round(n * 100) / 100;

function assTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
export function toAss(cues, { width, height }) {
  const marginV = Math.round(height * 0.18);
  const marginH = Math.round(width * 0.08);
  const fontSize = Math.round(height * 0.042);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Pretendard,${fontSize},&H00FFFFFF,&H00000000,&H80000000,1,1,3,0,2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;

  const lines = cues
    .map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Main,,0,0,0,,${c.text.replace(/\n/g, "\\N")}`)
    .join("\n");

  return header + lines + "\n";
}
```

- [ ] **Step 4: 합성 테스트를 쓴다**

ffmpeg를 실제로 돌리지 않고 **주입된 실행기**로 인자를 검사한다.

```js
import { describe, it, expect, afterEach } from "vitest";
import { composeVideo } from "../lib/compose";

afterEach(() => {
  delete process.env.SHOTFORM_FAKE;
  delete process.env.SHOTFORM_COMPOSER;
});

const CUTS = [
  { idx: 0, sentence: "첫", seconds: 4, video: { url: "v0.mp4", seconds: 4 }, audio: { url: "a0.mp3", seconds: 4 } },
  { idx: 1, sentence: "둘", seconds: 13, video: { url: "v1.mp4", seconds: 10, truncated: true }, audio: { url: "a1.mp3", seconds: 13 } },
];

describe("composeVideo", () => {
  it("가짜 모드에서는 파일을 만들지 않고 그렇다고 말한다", async () => {
    process.env.SHOTFORM_FAKE = "1";
    const r = await composeVideo({ projectId: "p1", cuts: CUTS, aspect_ratio: "9:16" });
    expect(r.fake).toBe(true);
    expect(r.url).toBe(null);
    expect(r.seconds).toBe(17); // 4 + 13, 소리 기준
  });

  it("짧은 클립을 소리 길이까지 정지로 늘린다", async () => {
    const calls = [];
    await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16",
      runFfmpeg: async (args) => { calls.push(args); },
      downloadImpl: async () => "/tmp/x",
    });
    const all = calls.flat().join(" ");
    // 클립1은 10초인데 소리가 13초다 — tpad 로 3초를 정지로 채운다
    expect(all).toMatch(/tpad/);
    expect(all).toMatch(/subtitles/);
  });

  it("SHOTFORM_COMPOSER=fal 이면 ffmpeg를 돌리지 않는다", async () => {
    process.env.SHOTFORM_COMPOSER = "fal";
    let ran = false;
    const fetchImpl = async () => ({ ok: true, json: async () => ({ video: { url: "https://fal.media/final.mp4" } }) });
    const r = await composeVideo({
      projectId: "p1", cuts: CUTS, aspect_ratio: "9:16", fetchImpl,
      runFfmpeg: async () => { ran = true; },
    });
    expect(ran).toBe(false);
    expect(r.url).toBe("https://fal.media/final.mp4");
  });
});
```

- [ ] **Step 5: 실패 확인 → Step 6: `lib/compose.js` 구현**

```bash
npm i ffmpeg-static
cp node_modules/pretendard/dist/public/static/Pretendard-Bold.otf assets/subtitle-font.otf
```

구현 뼈대. **주입 가능한 자리를 남겨 두는 것이 테스트의 전제다.**

```js
// 합성 — 클립·소리·자막을 하나의 mp4로. 기본은 로컬 ffmpeg,
// SHOTFORM_COMPOSER=fal 이면 fal ffmpeg API 를 쓴다(자막 없음).
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { fakeFal } from "./fake";
import { buildCues, toAss } from "./subtitles";
import { addRecord, costActor, estimateCost } from "./costs";
import { randomUUID } from "crypto";

const SIZES = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

export async function composeVideo({
  projectId, cuts, aspect_ratio = "9:16",
  fetchImpl = fetch, runFfmpeg = defaultRunFfmpeg, downloadImpl = download,
}) {
  const seconds = (cuts || []).reduce((s, c) => s + (Number(c.seconds) || 0), 0);

  // 가짜 모드 — 파일을 만들지 않는다. 재생 안 되는 더미를 주면 "합성이 깨졌다"로 오해한다.
  if (fakeFal()) return { url: null, seconds, fake: true };

  if (process.env.SHOTFORM_COMPOSER === "fal") {
    return composeWithFal({ cuts, seconds, fetchImpl });
  }

  const [width, height] = SIZES[aspect_ratio] || SIZES["9:16"];
  const dir = path.join(process.cwd(), "data", "renders");
  await fs.mkdir(dir, { recursive: true });

  // 1) 클립·소리를 내려받는다
  const local = [];
  for (const c of cuts) {
    local.push({
      video: await downloadImpl(c.video.url, path.join(dir, `${projectId}-${c.idx}.mp4`)),
      audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.mp3`)),
      wantSeconds: Number(c.seconds) || 0,
      haveSeconds: Number(c.video?.seconds) || 0,
    });
  }

  // 2) 자막 파일
  const assPath = path.join(dir, `${projectId}.ass`);
  await fs.writeFile(assPath, toAss(buildCues(cuts), { width, height }), "utf8");

  // 3) 한 번에 조립 — 클립이 소리보다 짧으면 tpad 로 마지막 프레임을 늘린다(§1.6)
  const out = path.join(dir, `${projectId}.mp4`);
  const args = buildFfmpegArgs({ local, assPath, out, width, height });
  await runFfmpeg(args);

  return { url: `/api/renders/${projectId}.mp4`, seconds };
}
```

`buildFfmpegArgs`는 이렇게 만든다. 컷 수에 따라 필터가 늘어난다.

```js
// 클립이 소리보다 짧으면 마지막 프레임을 정지로 늘려 길이를 맞춘다(§1.6).
// 그 처리를 안 하면 concat 뒤로 갈수록 그림과 소리가 밀린다.
function buildFfmpegArgs({ local, assPath, out, width, height }) {
  const inputs = [];
  local.forEach((l) => { inputs.push("-i", l.video, "-i", l.audio); });

  const filters = [];
  local.forEach((l, i) => {
    const pad = Math.max(0, l.wantSeconds - l.haveSeconds);
    const tpad = pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : "";
    filters.push(`[${i * 2}:v]${tpad}scale=${width}:${height},setsar=1[v${i}]`);
    filters.push(`[${i * 2 + 1}:a]anull[a${i}]`);
  });

  const concatIn = local.map((_, i) => `[v${i}][a${i}]`).join("");
  filters.push(`${concatIn}concat=n=${local.length}:v=1:a=1[cv][ca]`);
  // 자막은 이어붙인 뒤에 한 번만 태운다 — 컷마다 태우면 경계에서 끊긴다
  filters.push(`[cv]subtitles='${assPath.replace(/\\/g, "/")}':fontsdir=assets[outv]`);

  return [
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[outv]", "-map", "[ca]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-y", out,
  ];
}
```

> Windows 경로의 역슬래시를 `subtitles` 필터가 이스케이프로 읽는다. 슬래시로 바꿔 넘긴다.

`defaultRunFfmpeg`는 `spawn(ffmpegPath, args)`를 Promise로 감싸고, 종료 코드가 0이 아니면
stderr 마지막 줄을 담아 던진다.

`composeWithFal`은 `merge-videos`로 클립을 잇고 `merge-audio-video`로 소리를 얹는다.
**두 호출 모두 `addRecord`로 기록한다.** 자막은 넣지 않는다 —
`{ url, seconds, noSubtitles: true }`를 돌려주고 화면이 그 사실을 표시한다.

- [ ] **Step 7: 통과 확인 후 커밋**

```bash
npx vitest run tests/subtitles.test.js tests/compose.test.js && npm test
git add lib/subtitles.js lib/compose.js assets tests package.json package-lock.json
git commit -m "feat: 클립·소리·자막을 하나로 합치는 합성기 — 로컬 ffmpeg 기본, fal 어댑터"
```

---

### Task 8: ⑥완성 — 라우트 · 파일 서빙 · 화면

**Files:**
- Create: `app/api/projects/[id]/render/route.js` + `status/`, `app/api/renders/[name]/route.js`
- Replace: `app/create/[id]/done/page.js`
- Modify: `lib/pipeline.js`(`runRenderPipeline`), `tests/routes.test.js`

**Interfaces:**
- Consumes: `composeVideo` (Task 7)
- Produces: `project.render = { url, ts, seconds, fake?, noSubtitles? }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/routes.test.js`에 추가한다. 기존 라우트 테스트의 목킹 방식을 그대로 따른다.

```js
it("클립이 없으면 합성을 시작하지 않는다", async () => {
  const p = await createProject({ settings: {}, material: { text: "x" } });
  await updateProject(p.id, (proj) => ({ ...proj, status: "voice", cuts: [{ idx: 0, audio: { url: "a" } }] }));
  const res = await renderPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: p.id }) });
  expect(res.status).toBe(400);
});

it("내려받기 라우트는 경로 탈출을 막는다", async () => {
  const res = await renderFileGET(new Request("http://x"), { params: Promise.resolve({ name: "../../secret.json" }) });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: 실패 확인 → Step 3: 구현**

`render/route.js` 가드: `cuts.every(c => c.video?.url)`가 아니면 400 **"영상을 먼저 만들어 주세요"**.
`runRenderPipeline`을 fire-and-forget으로 띄우고, 끝나면 `project.render`와 `status: "done"`을 쓴다.

`app/api/renders/[name]/route.js` — `data/renders/` 아래 파일을 내보낸다.
**`app/api/uploads/[name]/route.js`의 파일명 가드를 그대로 따른다**(정규식으로 `[A-Za-z0-9_-]+\.mp4`만 허용).
경로 조합 전에 검사한다 — `..`가 섞이면 400.

`done/page.js`:
- `render`가 없으면 **"완성본 만들기"** 버튼(`.cta`)
- 만드는 중이면 폴링 + 진행 문구
- `render.fake`면 **"가짜 모드라 파일은 만들어지지 않았어요"**를 다운로드 자리에 표시
- `render.noSubtitles`면 **"이 방식에서는 자막이 들어가지 않아요"**를 함께
- 완성되면 `<video controls src={render.url}>` + `<a download>` 버튼

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
npm test
git add lib/pipeline.js app tests
git commit -m "feat: ⑥완성 — 합성 실행과 내려받기"
```

---

### Task 9: 끝까지 클릭해 본다 (비용 0)

**Files:** 없음 (확인만). 문제를 찾으면 해당 파일을 고친다.

- [ ] **Step 1: 완전 가짜 모드로 띄운다**

```bash
SHOTFORM_FAKE=all npm run dev
```

**dev 서버가 떠 있는 동안 `npm run build`를 돌리지 않는다.**

- [ ] **Step 2: 새 프로젝트로 끝까지 간다**

- [ ] ① 자료 입력 → 브리핑 (더미 텍스트가 나온다)
- [ ] ② 대본 → 승인
- [ ] ③ 이미지 → 컷 목록과 플레이스홀더
- [ ] ④ 목소리 → 목소리 고르기 → 컷별 생성 진행 → `<audio>`가 각 컷에 붙는가
- [ ] ⑤ 영상 → 컷별 클립 → 10초 넘는 컷에 "멈춰 있어요" 배지가 뜨는가
- [ ] ⑥ 완성 → "가짜 모드라 파일은 만들어지지 않았어요"가 뜨는가

- [ ] **Step 3: 앞뒤로 오간다**

- [ ] ⑤에서 ④로 돌아갔다가 다시 와도 **소리가 지워지지 않는가**
- [ ] ③으로 돌아가 컷을 다시 만들면 뒤 단계 산출물이 어떻게 되는가
  (지금은 정의되지 않은 동작이다 — 무엇이 일어나는지 관찰해 기록만 한다)
- [ ] 사이드바 스테퍼의 번호가 `①②③④⑤⑥`으로 맞는가

- [ ] **Step 4: 비용 기록이 비어 있는지 확인한다**

- [ ] 가짜 모드에서 돌렸으니 비용 기록에 **새 줄이 없어야** 정상이다

- [ ] **Step 5: 마지막 검사**

```bash
# 서버를 끈 뒤에 돌린다
npm test
npm run build
```

- [ ] **Step 6: 보고**

병합·푸시는 하지 않는다. 아래를 보고한다.

- 끝까지 도달했는가, 막힌 단계가 있으면 어디서 왜
- Step 3의 "뒤로 갔을 때" 관찰 결과
- 실제 fal 호출은 **한 번도 하지 않았다**는 사실
- 구현 중 fal 문서를 보고 고친 파라미터 이름(TTS `voice`, i2v `image_url` 등)

---

## 이번 작업에서 하지 않는 것

- **실제 fal 호출** — 명시적 범위 밖. 단가표 값도 실청구와 대조되지 않은 채로 남는다
- **컷을 잘게 나누기** — 12~13초 컷의 근본 해결. 컷 분할 로직을 건드리는 별도 과제
- **클립 자동 검수(VLM)** — 프레임 추출이 필요해 단계 의존이 꼬인다
- **배경음(BGM) · 라우드니스 정규화** — 내레이션 하나뿐이라 지금은 균일하다
- **OpenAI 비용 기록** — `llm.js`·`vlm.js`에 토큰 집계를 붙이는 별도 과제
- **뒤 단계 산출물의 무효화 규칙** — ③으로 돌아가 컷을 다시 만들면 소리·클립이 낡는다.
  `areCutsStale`과 같은 판정이 필요하지만, 이번엔 **관찰만 하고 기록**한다
