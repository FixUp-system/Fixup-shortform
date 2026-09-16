# 단계별(reel) 자막 시각 재설계 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단계별 통짜 영상의 자막이 모델이 실제로 말한 때에 ±0.3초 안으로 붙게 한다.

**Architecture:** 완성(⑥) 라우트에서 ① 영상의 소리만 로컬 ffmpeg 로 뽑고 ② fal Scribe v2 로 낱말별 시각을 받아 ③ 코드가 낱말을 원고 문장에 묶고 검증한 뒤 ④ 자막을 만들 때만 0.15초 리드인을 건다. 측정(제공자)·묶기(규칙)·추출(파일)을 세 파일로 갈라, 나중에 강제 정렬로 제공자를 바꿔도 묶기·검증은 그대로 쓴다.

**Tech Stack:** Next.js 15 (JavaScript, App Router) · fal.ai (`fal-ai/elevenlabs/speech-to-text/scribe-v2`) · ffmpeg-static · Supabase · vitest

**Spec:** `docs/superpowers/specs/2026-09-16-reel-subtitle-timing-design.md`

**Worktree/브랜치:** `C:\Users\fixup\shotform-saas\.claude\worktrees\subtitle-align` · `fix/subtitle-chunk-grouping`
(Task 0 의 묶기 코드가 이미 이 브랜치에 커밋되지 않은 채 있다 — Task 0 이 그것을 커밋한다.)

## Global Constraints

- **범위는 단계별(reel) 통짜뿐이다.** 원클릭(`lib/ad/*`)·film(`lib/film/*`)·legacy(`lib/pipeline.js`)·컷별 갈래의 자막 경로는 한 줄도 바꾸지 않는다.
- **자막 글자는 원고(`cuts[0].video.said`)다.** 받아쓴 글자는 시각·검증·경고에만 쓴다. 자막 텍스트로 쓰지 않는다.
- **유료 호출(fal)은 사용자 승인 전에는 실행하지 않는다.** 테스트는 전부 가짜 fetch 로 한다.
- `CHARS_PER_SEC`(5.5)는 `lib/script.js` 에서 import 한다. 숫자를 다시 적지 않는다.
- 값이 사는 곳은 하나다: 리드인 상수는 `lib/subtitles.js`, 단가는 `lib/costs.js`, 이상치 임계는 `lib/speech-timing.js`.
- 측정 실패는 던지지 않는다. 빈 결과 → 폴백 → 완성은 계속된다.
- 가짜 모드(`fakeFal()`)에서는 fal 을 부르지 않는다.
- 테스트는 `npx vitest run`. 커밋 전 전체 그린을 확인한다.
- 커밋 메시지는 한국어, 이 저장소 관례(`fix(subtitle): …`)를 따른다. **푸시·배포는 하지 않는다**(사용자가 따로 지시한다).

---

### Task 0: 이미 고친 묶기 코드를 커밋한다

**Files:**
- Modify(이미 수정됨): `lib/speech-timing.js`
- Test(이미 수정됨): `tests/speech-timing.test.js`

**Interfaces:**
- Produces: `alignSpeech(units, chunks)` — `units` 는 `{sentence}` 배열, `chunks` 는 `{timestamp:[start,end], text}` 배열. 반환은 같은 길이의 배열이고 믿을 수 있는 문장에만 `spoken_start`·`spoken_seconds` 가 붙는다.

- [ ] **Step 1: 전체 테스트를 돌려 그린인지 본다**

Run: `npx vitest run`
Expected: PASS (실패 0)

- [ ] **Step 2: 커밋**

```bash
git add lib/speech-timing.js tests/speech-timing.test.js
git commit -m "fix(subtitle): whisper 조각을 글자 수로 문장에 묶는다 — 쉼표 조각이 뒤 문장을 밀던 것"
```

- [ ] **Step 3: 설계 문서와 이 계획도 커밋**

```bash
git add docs/superpowers/specs/2026-09-16-reel-subtitle-timing-design.md docs/superpowers/plans/2026-09-16-reel-subtitle-timing.md
git commit -m "docs: 단계별 자막 시각 재설계 — 설계와 구현 계획"
```

---

### Task 1: 영상에서 소리만 뽑는다 (`lib/speech-audio.js`)

**Files:**
- Create: `lib/speech-audio.js`
- Modify: `lib/compose.js` (기존 ffmpeg 경로·다운로드 함수를 export 만 한다)
- Test: `tests/speech-audio.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export const AUDIO_DATA_URI_MAX = 6 * 1024 * 1024`
  - `export async function extractAudioDataUri(videoUrl, { projectId, runFfmpeg, mkdtempImpl, readFileImpl, rmImpl, downloadImpl } = {})` → 성공하면 `"data:audio/mp4;base64,…"`, 실패하거나 상한을 넘으면 `null`(던지지 않는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/speech-audio.test.js`:

```js
// 소리만 뽑아 data URI 로 준다 — 측정기(Scribe)가 mp4 를 안 받는다.
// 실측 2026-09-16: fal 이 mp4 URL 에 422 unsupported_audio_format 을 돌려줬다.
import { describe, it, expect } from "vitest";
import { extractAudioDataUri, AUDIO_DATA_URI_MAX } from "../lib/speech-audio.js";

const deps = (bytes) => ({
  projectId: "p1",
  downloadImpl: async (_url, dest) => dest,
  mkdtempImpl: async () => "/tmp/x",
  runFfmpeg: async () => ({ ok: true }),
  readFileImpl: async () => Buffer.from(bytes),
  rmImpl: async () => {},
});

describe("extractAudioDataUri", () => {
  it("오디오를 data URI 로 준다", async () => {
    const out = await extractAudioDataUri("https://fal/x_video.mp4", deps("hello"));
    expect(out).toBe(`data:audio/mp4;base64,${Buffer.from("hello").toString("base64")}`);
  });

  it("ffmpeg 가 죽으면 null 이다 — 던지지 않는다", async () => {
    const out = await extractAudioDataUri("https://fal/x_video.mp4", {
      ...deps("hello"),
      runFfmpeg: async () => { throw new Error("ffmpeg exit 1"); },
    });
    expect(out).toBeNull();
  });

  it("상한을 넘으면 null 이다", async () => {
    const big = "a".repeat(AUDIO_DATA_URI_MAX);
    const out = await extractAudioDataUri("https://fal/x_video.mp4", deps(big));
    expect(out).toBeNull();
  });

  it("주소가 없으면 부르지 않는다", async () => {
    let called = false;
    const out = await extractAudioDataUri("", { ...deps("x"), runFfmpeg: async () => { called = true; } });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it("임시 폴더는 실패해도 지운다", async () => {
    let removed = false;
    await extractAudioDataUri("https://fal/x_video.mp4", {
      ...deps("hello"),
      rmImpl: async () => { removed = true; },
      runFfmpeg: async () => { throw new Error("boom"); },
    });
    expect(removed).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/speech-audio.test.js`
Expected: FAIL — `Failed to resolve import "../lib/speech-audio.js"`

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/speech-audio.js`:

```js
// 영상에서 소리만 뽑는다 — 측정기(lib/speech-probe.js)가 mp4 를 안 받는다.
//
// ★ 왜 파일을 따로 두나: 합성(lib/compose.js)과 목적이 다르다. 합성은 완성본을 만들고
//   여기는 재려고 뽑는다. 한 파일에 두면 자막 굽기 인자와 측정 인자가 섞인다.
// ★ 재인코딩하지 않는다(-c:a copy) — 15초 실측 0.36MB, 1초 미만이다.
// ★ 못 뽑으면 null 이다. 던지지 않는다 — 자막 하나 때문에 값을 다 치른 한 편을 잃지 않는다.
import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { ffmpegPath, defaultDownload } from "./compose.js";

// data URI 로 보낼 수 있는 상한. 넘으면 아예 안 보낸다 — 긴 영상이 생겼을 때 요청이
// 조용히 죽는 것보다, 재지 않고 폴백으로 흐르는 편이 낫다.
export const AUDIO_DATA_URI_MAX = 6 * 1024 * 1024;

export async function extractAudioDataUri(videoUrl, {
  projectId = "speech",
  runFfmpeg = defaultRunFfmpeg,
  mkdtempImpl = (prefix) => fs.mkdtemp(prefix),
  readFileImpl = (p) => fs.readFile(p),
  rmImpl = (dir) => fs.rm(dir, { recursive: true, force: true }),
  downloadImpl = defaultDownload,
} = {}) {
  if (typeof videoUrl !== "string" || !videoUrl) return null;
  let dir = null;
  try {
    dir = await mkdtempImpl(path.join(os.tmpdir(), `shotform-speech-${projectId}-`));
    const src = await downloadImpl(videoUrl, path.join(dir, "src.mp4"));
    const out = path.join(dir, "speech.m4a");
    await runFfmpeg(["-y", "-i", src, "-vn", "-c:a", "copy", out]);
    const bytes = await readFileImpl(out);
    if (!bytes?.length || bytes.length > AUDIO_DATA_URI_MAX) return null;
    return `data:audio/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  } finally {
    if (dir) await rmImpl(dir).catch(() => {});
  }
}

function defaultRunFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args);
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(err.slice(-400)))));
  });
}
```

⚠️ `lib/compose.js` 가 이미 갖고 있는 것을 **export 만 한다**(새로 구현하지 않는다 — 두 벌이 되면 한쪽만 고쳐지는 자리가 된다). 실제 이름은 이렇다:
- `lib/compose.js:13` `import ffmpegPath from "ffmpeg-static";` → `export { ffmpegPath };` 를 더한다
- `lib/compose.js:296` `async function defaultDownload(url, dest)` → `export` 를 붙이고 이 계획의 `downloadTo` 자리에 그 이름(`defaultDownload`)을 쓴다

⚠️ `next.config.mjs` 는 `lib/compose.js` 에 닿는 라우트에만 ffmpeg 바이너리를 포함시킨다(`lib/build/compose-routes.mjs`). 이 파일이 `compose.js` 를 import 하므로 그 그물에 자동으로 걸린다 — 확인만 하고 설정은 건드리지 않는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/speech-audio.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`
Expected: 실패 0

- [ ] **Step 6: 커밋**

```bash
git add lib/speech-audio.js lib/compose.js tests/speech-audio.test.js
git commit -m "feat(subtitle): 영상에서 소리만 뽑는다 — 측정기가 mp4 를 안 받는다"
```

---

### Task 2: 측정기를 Scribe v2 로 바꾼다 (`lib/speech-probe.js`)

**Files:**
- Modify: `lib/speech-probe.js`
- Modify: `lib/costs.js` (단가 한 줄)
- Test: `tests/speech-probe.test.js` · `tests/costs-scribe.test.js`

**Interfaces:**
- Consumes: `extractAudioDataUri`(Task 1)
- Produces: `export async function probeSpeech(audioDataUri, { fetchImpl, projectId, seconds, lang } = {})` → `{ words: [{ timestamp: [start, end], text }], text }`. 실패하면 `{ words: [], text: "" }`
- ⚠️ 인자와 반환이 바뀐다(예전: 영상 URL → 조각 배열). 부르는 곳은 Task 4 에서 함께 고친다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/speech-probe.test.js` 의 기존 케이스를 새 계약에 맞게 고치고 아래를 더한다:

```js
// Scribe v2 는 낱말 사이 쉼을 빈 구간으로 남긴다. whisper 는 그 쉼을 다음 낱말의 시작에
// 붙여 실측 2.75초까지 일찍 떴다(설계 문서 §2).
it("낱말만 골라 시각과 글자를 준다", async () => {
  const body = {
    words: [
      { text: "턱선을", start: 1.30, end: 1.60, type: "word" },
      { text: " ", start: 1.60, end: 1.76, type: "spacing" },
      { text: "감싸는", start: 1.76, end: 2.26, type: "word" },
    ],
  };
  const out = await probeSpeech("data:audio/mp4;base64,AA", {
    fetchImpl: async () => ({ ok: true, json: async () => body }),
    projectId: "p1", seconds: 15, lang: "ko",
  });
  expect(out.words).toEqual([
    { timestamp: [1.30, 1.60], text: "턱선을" },
    { timestamp: [1.76, 2.26], text: "감싸는" },
  ]);
  expect(out.text).toBe("턱선을 감싸는");
});

it("언어를 함께 보낸다 — 자동 감지에 맡기지 않는다", async () => {
  let sent = null;
  await probeSpeech("data:audio/mp4;base64,AA", {
    fetchImpl: async (_url, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({ words: [] }) }; },
    projectId: "p1", seconds: 15, lang: "ko",
  });
  expect(sent.language_code).toBe("ko");
  expect(sent.audio_url).toBe("data:audio/mp4;base64,AA");
});

it("실패하면 빈 결과다 — 던지지 않는다", async () => {
  const out = await probeSpeech("data:audio/mp4;base64,AA", {
    fetchImpl: async () => ({ ok: false, status: 422, text: async () => "nope" }),
    projectId: "p1", seconds: 15,
  });
  expect(out).toEqual({ words: [], text: "" });
});

it("소리가 없으면 부르지 않는다", async () => {
  let called = false;
  const out = await probeSpeech(null, { fetchImpl: async () => { called = true; } });
  expect(called).toBe(false);
  expect(out.words).toEqual([]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/speech-probe.test.js`
Expected: FAIL — 반환이 배열이라 `out.words` 가 undefined

- [ ] **Step 3: 구현을 바꾼다**

`lib/speech-probe.js`:

```js
const ENDPOINT = "fal-ai/elevenlabs/speech-to-text/scribe-v2";

export async function probeSpeech(audioDataUri, { fetchImpl = fetch, projectId, seconds, lang = "ko" } = {}) {
  const empty = { words: [], text: "" };
  if (fakeFal()) return empty;
  if (typeof audioDataUri !== "string" || !audioDataUri) return empty;
  try {
    const res = await fetchImpl(`https://fal.run/${ENDPOINT}`, {
      method: "POST",
      headers: falHeaders({ "Content-Type": "application/json" }),
      // ★ 언어를 넘긴다 — 옛 whisper 호출은 안 넘겨 자동 감지에 맡겼다.
      body: JSON.stringify({ audio_url: audioDataUri, language_code: lang }),
    });
    if (!res.ok) return empty;
    const data = await res.json();
    // ★ type 이 "word" 인 것만 쓴다. "spacing"·"audio_event" 는 말이 아니다.
    const words = (Array.isArray(data?.words) ? data.words : [])
      .filter((w) => (w?.type ? w.type === "word" : true))
      .map((w) => ({ timestamp: [Number(w.start), Number(w.end)], text: String(w.text || "") }))
      .filter((w) => Number.isFinite(w.timestamp[0]) && Number.isFinite(w.timestamp[1]));
    if (words.length && Number(seconds) > 0) {
      await addRecord({
        request_id: randomUUID(), ts: Date.now(), endpoint: ENDPOINT,
        stage: "자막 시각", user: costActor(), project_id: projectId,
        prompt: "-", duration: String(seconds), aspect_ratio: "-",
        est_cost_usd: estimateCost(ENDPOINT, Number(seconds)),
      }).catch(() => {});
    }
    return { words, text: words.map((w) => w.text).join(" ").trim() };
  } catch {
    return empty;
  }
}
```

`lib/costs.js` 의 `PRICE_TABLE` 에서 `fal-ai/whisper` 줄 **위에** 더한다(구체적인 것이 위):

```js
  // 자막 시각 — Scribe v2. $0.008/분 = 초당 $0.000133 (2026-09-16 모델 페이지).
  // ⚠️ 실청구로 검증하지 않았다. 올려 잡는 방향이 안전하다.
  { prefix: "fal-ai/elevenlabs/speech-to-text", perSec: 0.000133 },
```

★ `fal-ai/whisper` 줄은 **지우지 않는다** — 옛 원장 행이 그 단가로 조회된다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/speech-probe.test.js`
Expected: PASS

- [ ] **Step 5: 단가가 기본값으로 안 떨어지는지 못박는다**

`tests/costs-scribe.test.js`:

```js
// 표에 없는 엔드포인트는 기본가로 떨어진다 — merge-audios 가 $1.7 로 찍힌 전례가 있다.
import { describe, it, expect } from "vitest";
import { estimateCost } from "../lib/costs.js";

describe("Scribe 단가", () => {
  it("15초가 1센트 미만이다", () => {
    const usd = estimateCost("fal-ai/elevenlabs/speech-to-text/scribe-v2", 15);
    expect(usd).toBeGreaterThan(0);
    expect(usd).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 6: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/speech-probe.js lib/costs.js tests/speech-probe.test.js tests/costs-scribe.test.js
git commit -m "feat(subtitle): 자막 시각을 Scribe v2 낱말 단위로 잰다 — whisper 는 쉼을 다음 말에 붙인다"
```

---

### Task 3: 검증과 이상치 판정 (`lib/speech-timing.js`)

**Files:**
- Modify: `lib/speech-timing.js`
- Test: `tests/speech-timing.test.js`

**Interfaces:**
- Consumes: `alignSpeech`(Task 0), `CHARS_PER_SEC`(`lib/script.js`)
- Produces: `export function speechUnits(sentences, words, { seconds })` → `{ units: [{ start, seconds, ok }], heard: { chars, text } }`. `ok:false` 인 문장은 `start`·`seconds` 가 `null`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/speech-timing.test.js` 에 추가:

```js
import { speechUnits } from "../lib/speech-timing.js";

// 임계값 근거(2026-09-16 실측): 정상 최장 낱말은 글자수 대비 2.3배("올리고" 1.28초/3글자),
// 쉼을 머금은 낱말은 7.6배(whisper "하루" 2.78초/2글자). 그 사이인 3배를 잡았다.
describe("speechUnits — 재 놓고 못 믿으면 버린다", () => {
  const S = ["가나다라 마바사.", "아자차카 타파하."];

  it("정상이면 문장마다 시작~끝이 붙는다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [5.0, 5.5], text: "아자차카" }, { timestamp: [5.5, 6.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[0]).toEqual({ start: 1.0, seconds: 1.0, ok: true });
    expect(out.units[1]).toEqual({ start: 5.0, seconds: 1.0, ok: true });
    expect(out.heard.chars).toBe(14);
  });

  it("첫 낱말이 글자수 대비 3배를 넘게 길면 그 문장을 버린다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [2.0, 5.6], text: "아자차카" }, { timestamp: [5.6, 6.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[0].ok).toBe(true);
    expect(out.units[1]).toEqual({ start: null, seconds: null, ok: false });
  });

  it("영상 길이를 넘으면 버린다", () => {
    const words = [
      { timestamp: [1.0, 1.5], text: "가나다라" }, { timestamp: [1.5, 2.0], text: "마바사." },
      { timestamp: [14.0, 16.5], text: "아자차카" }, { timestamp: [16.5, 17.0], text: "타파하." },
    ];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units[1].ok).toBe(false);
  });

  it("들은 양이 원고의 0.75 배 미만이면 전부 버린다", () => {
    const words = [{ timestamp: [1.0, 1.5], text: "가나" }];
    const out = speechUnits(S, words, { seconds: 15 });
    expect(out.units.every((u) => u.ok === false)).toBe(true);
    expect(out.heard.chars).toBe(2);
  });

  it("낱말이 없으면 전부 버리고 들은 양은 0 이다", () => {
    const out = speechUnits(S, [], { seconds: 15 });
    expect(out.units).toHaveLength(2);
    expect(out.units.every((u) => u.ok === false)).toBe(true);
    expect(out.heard).toEqual({ chars: 0, text: "" });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/speech-timing.test.js`
Expected: FAIL — `speechUnits is not a function`

- [ ] **Step 3: 구현을 더한다**

`lib/speech-timing.js` 상단에 `import { CHARS_PER_SEC } from "./script.js";` 를 더하고 파일 끝에 붙인다:

```js
// 낱말 길이가 글자 수 대비 이 배수를 넘으면 그 낱말이 쉼을 머금었다고 본다.
// 실측(2026-09-16): 정상 최장 2.3배, 병리적 7.6배.
const WORD_STRETCH_MAX = 3;

// 재 놓고 믿을 수 있는지까지 판정해서 돌려준다.
// ★ 이 판정이 없으면 드물게 나는 큰 어긋남이 한 편을 통째로 망친다 — 정렬 도구의 알려진
//   성질이다(중앙값 수십 ms, 드물게 수 초).
export function speechUnits(sentences, words, { seconds } = {}) {
  const list = Array.isArray(sentences) ? sentences : [];
  const parts = (Array.isArray(words) ? words : []).filter(
    (w) => Number.isFinite(w?.timestamp?.[0]) && Number.isFinite(w?.timestamp?.[1])
  );
  const heardText = parts.map((w) => w?.text || "").join(" ").trim();
  const heard = { chars: charCount(heardText), text: heardText };
  const bad = { units: list.map(() => ({ start: null, seconds: null, ok: false })), heard };
  if (!list.length || !parts.length) return bad;

  const wanted = list.reduce((a, s) => a + charCount(s), 0);
  if (!wanted) return bad;
  const ratio = heard.chars / wanted;
  if (ratio < MIN_HEARD_RATIO || ratio > MAX_HEARD_RATIO) return bad;

  const aligned = alignSpeech(list.map((sentence) => ({ sentence })), parts);
  const limit = Number(seconds) > 0 ? Number(seconds) : Infinity;
  let prevEnd = 0;
  const units = aligned.map((u) => {
    const start = Number(u.spoken_start);
    const dur = Number(u.spoken_seconds);
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return { start: null, seconds: null, ok: false };
    if (start < prevEnd - 0.01 || start + dur > limit + 0.01) return { start: null, seconds: null, ok: false };
    const first = parts.find((w) => w.timestamp[0] >= start - 0.01);
    if (first && stretched(first)) return { start: null, seconds: null, ok: false };
    prevEnd = start + dur;
    return { start, seconds: dur, ok: true };
  });
  return { units, heard };
}

function stretched(word) {
  const chars = charCount(word?.text);
  if (!chars) return false;
  return (word.timestamp[1] - word.timestamp[0]) > (chars / CHARS_PER_SEC) * WORD_STRETCH_MAX;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/speech-timing.test.js`
Expected: PASS (기존 + 신규 5)

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/speech-timing.js tests/speech-timing.test.js
git commit -m "feat(subtitle): 잰 시각을 코드가 판정한다 — 순서·범위·낱말 길이·들은 양"
```

---

### Task 4: 완성 라우트 배선

**Files:**
- Modify: `app/api/reel/[id]/render/route.js`
- Modify: `lib/reel/narration.js`
- Test: `tests/reel-render-speech.test.js` · `tests/reel-narration-subtitles.test.js`

**Interfaces:**
- Consumes: `extractAudioDataUri`(T1) · `probeSpeech`(T2) · `speechUnits`(T3)
- Produces: `project.reel.speech = { at, source: "scribe-v2", units, heard }`. `narrationUnits(project, seconds)` 가 `units[i].ok === true` 인 문장에만 `spoken_start`·`spoken_seconds` 를 얹고, `reel.speech` 가 없으면 옛 `reel.narration_timing` 을 읽는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/reel-render-speech.test.js` 에 더한다(이 저장소의 라우트 계약 테스트 방식 그대로 소스 문자열을 잰다):

```js
it("소리를 뽑은 뒤에 잰다", () => {
  const a = route.indexOf("extractAudioDataUri(");
  const b = route.indexOf("probeSpeech(");
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
});

it("판정을 거쳐 새 자리에 저장한다", () => {
  expect(route).toMatch(/speechUnits\(/);
  expect(route).toMatch(/source:\s*"scribe-v2"/);
});

it("이미 잰 편은 다시 재지 않는다", () => {
  expect(route).toMatch(/!reelOf\(project\)\.speech/);
});
```

`tests/reel-narration-subtitles.test.js` 에 동작 테스트를 더한다:

```js
it("새 자리(reel.speech)의 믿을 수 있는 문장만 시각을 얹는다", () => {
  const p = {
    cuts: [{ video: { url: "u", whole: true, said: "가나다.\n라마바." } }],
    reel: { speech: { units: [{ start: 1.5, seconds: 2, ok: true }, { start: null, seconds: null, ok: false }] } },
  };
  const units = narrationUnits(p, 15);
  expect(units[0].spoken_start).toBe(1.5);
  expect(units[1].spoken_start).toBeUndefined();
});

it("reel.speech 가 없으면 옛 narration_timing 을 읽는다", () => {
  const p = {
    cuts: [{ video: { url: "u", whole: true, said: "가나다.\n라마바." } }],
    reel: { narration_timing: [{ start: 0.5, seconds: 1 }] },
  };
  expect(narrationUnits(p, 15)[0].spoken_start).toBe(0.5);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-render-speech.test.js tests/reel-narration-subtitles.test.js`
Expected: FAIL

- [ ] **Step 3: 라우트의 측정 블록을 바꾼다**

`app/api/reel/[id]/render/route.js` 의 기존 `if (units) { if (units.length > 1 && …) { … } }` 블록을 아래로 교체한다(컷 갈래 `else if (needsSpeechProbe(cuts) …)` 는 **그대로 둔다** — 옛 문서·컷별 회귀 0):

```js
  // ★★ 말한 때를 재서 자막에 맞춘다.
  //   설계: docs/superpowers/specs/2026-09-16-reel-subtitle-timing-design.md
  // ★ 자막이 꺼져 있으면 재지 않는다 — 쓰지 않을 값에 돈을 내지 않는다.
  // ★ 이미 잰 편은 다시 안 잰다. 소리가 바뀌면 lib/reel/pipeline.js 가 지운다.
  if (units && units.length > 1 && !reelOf(project).speech && project.settings?.subtitle?.off !== true) {
    const clipUrl = cuts.find((c) => c?.video?.url)?.video?.url;
    const audio = await extractAudioDataUri(clipUrl, { projectId: id });
    const heardRaw = await probeSpeech(audio, { projectId: id, seconds, lang: speechLangOf(project) });
    const measured = speechUnits(units.map((u) => u.sentence), heardRaw.words, { seconds });
    if (measured.units.some((u) => u.ok)) {
      const speech = { at: Date.now(), source: "scribe-v2", units: measured.units, heard: measured.heard };
      await updateProject(id, user.id, (p) => putReel(p, { speech })).catch(() => {});
      timedUnits = narrationUnits({ ...project, reel: { ...reelOf(project), speech } }, seconds) || units;
    }
  }
```

import 셋을 더한다:

```js
import { extractAudioDataUri } from "../../../../../lib/speech-audio.js";
import { speechUnits } from "../../../../../lib/speech-timing.js";
import { reelOf } from "../../../../../lib/reel/doc.js";
```

`lib/reel/narration.js` 의 `narrationUnits` 에서 시각을 읽는 줄을 바꾼다:

```js
  // ★ 새 자리가 있으면 그것이 이긴다. 없으면 옛 자리를 읽는다(옛 편 회귀 0).
  const speech = Array.isArray(project?.reel?.speech?.units) ? project.reel.speech.units : null;
  const timing = speech
    ? speech.map((u) => (u?.ok ? { start: u.start, seconds: u.seconds } : {}))
    : (Array.isArray(project?.reel?.narration_timing) ? project.reel.narration_timing : []);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/reel-render-speech.test.js tests/reel-narration-subtitles.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 커밋**

```bash
npx vitest run
git add "app/api/reel/[id]/render/route.js" lib/reel/narration.js tests/reel-render-speech.test.js tests/reel-narration-subtitles.test.js
git commit -m "feat(subtitle): 완성 때 소리를 뽑아 재고 문장별 시각을 저장한다"
```

---

### Task 5: 리드인 0.15초

**Files:**
- Modify: `lib/subtitles.js`
- Test: `tests/subtitles.test.js`

**Interfaces:**
- Produces: `export const SUBTITLE_LEAD_SECONDS = 0.15`. `buildCues` 가 `spoken_start` 가 있는 문장에만 적용한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// Scribe 실측이 실제 발화보다 +0.09~+0.29초 늦다(2026-09-16). 자막은 말보다 아주 조금
// 먼저 떠야 읽힌다 — 편집 통상값 0.1~0.2초.
import { buildCues, SUBTITLE_LEAD_SECONDS } from "../lib/subtitles.js";

it("잰 시작에서 리드인만큼 당겨 뜬다", () => {
  const cues = buildCues([{ sentence: "가나다.", seconds: 3, spoken_start: 2.0, spoken_seconds: 1.0 }]);
  expect(cues[0].start).toBeCloseTo(2.0 - SUBTITLE_LEAD_SECONDS, 3);
});

it("0 보다 앞으로는 못 간다", () => {
  const cues = buildCues([{ sentence: "가나다.", seconds: 3, spoken_start: 0.05, spoken_seconds: 1.0 }]);
  expect(cues[0].start).toBe(0);
});

it("못 잰 문장(비례)은 당기지 않는다 — 기준이 다른 값이다", () => {
  const cues = buildCues([{ sentence: "가나다.", seconds: 3 }]);
  expect(cues[0].start).toBe(0);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — `SUBTITLE_LEAD_SECONDS` 가 없다

- [ ] **Step 3: 구현**

`lib/subtitles.js` 에 상수를 더한다:

```js
// 자막을 말보다 이만큼 먼저 띄운다.
// ★ 잰 값에는 섞지 않는다 — 저장된 값은 "모델이 실제로 말한 때"여야 나중에 이 값을 바꿔도
//   다시 재지 않는다(설계 §4.6).
export const SUBTITLE_LEAD_SECONDS = 0.15;
```

`buildCues` 의 `base` 를 바꾼다:

```js
    const base = startedAt > 0 ? Math.max(0, startedAt - SUBTITLE_LEAD_SECONDS) : t;
```

- [ ] **Step 4: 통과 확인 + 전체 테스트**

Run: `npx vitest run tests/subtitles.test.js` → PASS
Run: `npx vitest run` → 실패 0
⚠️ 기존 자막 시각 테스트가 0.15 만큼 어긋나 깨질 수 있다. **테스트가 낡은 것**이므로 기대값을 새 규칙으로 고친다(코드를 되돌리지 않는다).

- [ ] **Step 5: 커밋**

```bash
git add lib/subtitles.js tests/subtitles.test.js
git commit -m "feat(subtitle): 자막을 말보다 0.15초 먼저 띄운다"
```

---

### Task 6: 소리가 바뀌면 잰 시각을 버린다

**Files:**
- Modify: `lib/reel/pipeline.js` (`runReelOneShot` 접수 · `collectReelOneShot` 수거 성공 · `attachReelVideo`)
- Test: `tests/reel-speech-invalidate.test.js`

**Interfaces:**
- Produces: 세 자리의 `putReel` 객체에 `speech: null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// 소리가 바뀌면 잰 시각은 딴 소리의 것이다. 2026-09-15 신고의 뿌리 둘 중 하나였다.
import { describe, it, expect } from "vitest";
import fs from "fs";

const src = fs.readFileSync("lib/reel/pipeline.js", "utf8");

describe("영상이 바뀌면 자막 시각을 버린다", () => {
  it("접수·수거·되붙이기 세 자리에서 speech 를 지운다", () => {
    const hits = src.match(/speech:\s*null/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-speech-invalidate.test.js`
Expected: FAIL — 0 개

- [ ] **Step 3: 세 자리에 한 줄씩 더한다**

각 자리의 `putReel(…, { … })` 객체 안에 아래를 넣는다.

```js
        // ★ 소리가 바뀌면 잰 시각을 버린다 — 다음 완성에서 다시 잰다($0.002).
        speech: null,
```

- 접수: `runReelOneShot` 의 `putReel(p, { job: { …startedAt } })`
- 수거 성공: `collectReelOneShot` 의 `status: "clips"` 를 쓰는 `putReel`
- 되붙이기: `attachReelVideo` 의 `putReel({ … }, { job: null, …, status: "clips" })`

- [ ] **Step 4: 통과 확인 + 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/reel/pipeline.js tests/reel-speech-invalidate.test.js
git commit -m "fix(subtitle): 영상이 바뀌면 잰 자막 시각을 버린다"
```

---

### Task 7: 폴백 기준을 "말한 구간"으로

**Files:**
- Modify: `lib/reel/narration.js`
- Test: `tests/reel-narration-subtitles.test.js`

**Interfaces:**
- Consumes: `project.reel.speech.units`
- Produces: 못 믿는 문장의 비례 계산이 측정된 말 구간(첫 믿을 수 있는 시작 ~ 마지막 믿을 수 있는 끝) 안에서 이뤄진다. 측정이 없으면 예전대로 영상 길이를 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
it("측정이 있으면 못 믿는 문장은 말한 구간 안에서 비례로 흐른다", () => {
  const p = {
    cuts: [{ video: { url: "u", whole: true, said: "가나다.\n라마바.\n사아자." } }],
    reel: { speech: { units: [
      { start: 1.0, seconds: 2.0, ok: true },
      { start: null, seconds: null, ok: false },
      { start: 7.0, seconds: 2.0, ok: true },
    ] } },
  };
  const units = narrationUnits(p, 15);
  // 못 믿는 둘째 문장이 말한 구간(1.0~9.0) 기준으로 흐른다 — 영상 끝(15초)까지 안 늘어진다
  expect(units[1].seconds).toBeLessThan(8);
});

it("측정이 아예 없으면 예전처럼 영상 길이로 나눈다", () => {
  const p = { cuts: [{ video: { url: "u", whole: true, said: "가나다.\n라마바." } }], reel: {} };
  const units = narrationUnits(p, 10);
  expect(units[0].seconds + units[1].seconds).toBeCloseTo(10, 3);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-narration-subtitles.test.js`
Expected: FAIL (첫 케이스)

- [ ] **Step 3: 구현**

`narrationUnits` 안에서 비례 기준 길이를 바꾼다:

```js
  // ★ 못 잰 문장의 바닥. 측정이 있으면 말한 구간을 쓴다 — 영상 길이를 쓰면 말이 끝난
  //   뒤에도 자막이 늘어진다(2026-08-25 실측: 15초 영상에 18·24초 자막).
  const ok = (speech || []).filter((u) => u?.ok && Number.isFinite(u.start) && Number.isFinite(u.seconds));
  const last = ok[ok.length - 1];
  const span = ok.length ? (last.start + last.seconds) - ok[0].start : 0;
  const base = span > 0 ? span : total;
```

이후 비례 계산의 `total` 을 `base` 로 바꾼다.

- [ ] **Step 4: 통과 확인 + 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/reel/narration.js tests/reel-narration-subtitles.test.js
git commit -m "fix(subtitle): 못 잰 문장은 영상 길이가 아니라 말한 구간 안에서 흐른다"
```

---

### Task 8: 원고와 다르게 말했을 때 알린다

**Files:**
- Modify: `lib/reel/doc.js`
- Modify: `app/reel/[id]/done/page.js`
- Test: `tests/reel-speech-mismatch.test.js`

**Interfaces:**
- Consumes: `project.reel.speech`
- Produces: `export function speechMismatch(project)` → `null` 또는 `{ reason: "missing-sentence" | "short", heard: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { describe, it, expect } from "vitest";
import { speechMismatch } from "../lib/reel/doc.js";

describe("speechMismatch — 말과 원고가 크게 다른가", () => {
  const said = { cuts: [{ video: { url: "u", whole: true, said: "가나다라마.\n바사아자차." } }] };

  it("문장 하나가 통째로 안 들렸으면 알린다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: false, start: null, seconds: null }], heard: { chars: 5, text: "가나다라마" } } } };
    expect(speechMismatch(p)?.reason).toBe("missing-sentence");
  });

  it("들은 양이 원고의 0.75 배 미만이면 알린다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: true, start: 3, seconds: 1 }], heard: { chars: 3, text: "가나다" } } } };
    expect(speechMismatch(p)?.reason).toBe("short");
  });

  it("정상이면 null 이다", () => {
    const p = { ...said, reel: { speech: { units: [{ ok: true, start: 0, seconds: 2 }, { ok: true, start: 3, seconds: 2 }], heard: { chars: 10, text: "가나다라마 바사아자차" } } } };
    expect(speechMismatch(p)).toBeNull();
  });

  it("측정이 없으면 null 이다 — 모르는 것을 경고하지 않는다", () => {
    expect(speechMismatch({ ...said, reel: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/reel-speech-mismatch.test.js`
Expected: FAIL — `speechMismatch is not a function`

- [ ] **Step 3: 구현**

`lib/reel/doc.js`:

```js
// 모델이 원고와 크게 다르게 말했는가. 글자 몇 개 차이는 보지 않는다
// (발음 표기 차이는 실측 +2~3%: "V라인"→"브이라인", "3분"→"삼 분").
// ★ LLM 에게 묻지 않는다 — 이 저장소는 LLM 검수가 조용히 통과만 시킨 전례가 있다(VLM 9회).
export function speechMismatch(project) {
  const speech = project?.reel?.speech;
  if (!speech || !Array.isArray(speech.units) || !speech.units.length) return null;
  const said = (project?.cuts?.[0]?.video?.said || "").replace(/[\s\p{P}\p{S}]/gu, "");
  const heard = speech.heard || { chars: 0, text: "" };
  if (speech.units.some((u) => u?.ok === false)) return { reason: "missing-sentence", heard: heard.text || "" };
  if (said.length && heard.chars / said.length < 0.75) return { reason: "short", heard: heard.text || "" };
  return null;
}
```

`app/reel/[id]/done/page.js` 에 경고를 단다. 문구는 사장님 말로 쓰고, **들린 말을 함께 보여 준다**(근거 없는 경고는 무시된다). 기존 안내문과 같은 자리·같은 스타일을 쓴다.

```jsx
{mismatch && (
  <p className="note warn">
    ⚠️ 영상 속 말과 자막이 다를 수 있어요 — 들린 말: “{mismatch.heard}”
  </p>
)}
```

- [ ] **Step 4: 통과 확인 + 전체 테스트 + 커밋**

```bash
npx vitest run
git add lib/reel/doc.js "app/reel/[id]/done/page.js" tests/reel-speech-mismatch.test.js
git commit -m "feat(subtitle): 모델이 원고와 다르게 말하면 완성 화면이 알린다"
```

---

### Task 9: 빌드 확인과 배포 후 실측

**Files:** 없음 (검증만)

- [ ] **Step 1: 화면 파일을 손댔으니 굽는다**

dev 서버를 끄고:

```bash
npx next build && rm -rf .next
```

Expected: 빌드 성공. ⚠️ 이 저장소의 화면 테스트는 소스 문자열을 재므로 문법 오류를 못 잡는다 — 굽지 않으면 판이 초록인데 앱이 안 뜬다.

- [ ] **Step 2: 전체 테스트 그린**

Run: `npx vitest run`

- [ ] **Step 3: 사용자에게 보고하고 배포 승인을 받는다**

푸시·배포는 사용자가 지시할 때만 한다. 원격은 `fixup` 이다(`origin` 은 배포와 무관).

- [ ] **Step 4: 배포 후 실측 (유료 — 승인 필요)**

두 편(`3856b99d-f89c-4109-9b8c-0ebeb7dc3f72`, `115387f3-f52d-42e3-a106-a2e096fce9c6`)을 다시 완성하고 아래로 실제 말 시작과 비교한다. **±0.3초 안**이면 채택이다.

```bash
ffmpeg -i <clip_url> -vn -af "aresample=16000,highpass=f=300,lowpass=f=3400,asetnsamples=n=800,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=env.txt" -f null -
```

기준값(2026-09-16 측정): `3856b99d` 문장① 1.20초 · 문장② 10.25초 / `115387f3` 문장② 3.45초 · 문장③ 10.15초

- [ ] **Step 5: wiki 반영**

세션 마무리 규칙에 따라 `C:\Users\fixup\obsidian_jaechan` 에 회차 소스 페이지를 쓰고 `index.md`·`log.md` 를 갱신한다. 반드시 Write/Edit 도구로 쓴다(PowerShell 로 쓰면 한글이 깨진다).

---

## 자기 점검 (작성자 기록)

- 설계 §4.1 의 8단계가 Task 1(②) · 2(③) · 3(⑤) · 4(①③⑤ 배선) · 5(⑥) · 8(⑧) 에 모두 있다. ⑦합성은 기존 코드 그대로다.
- 설계 §4.7 무효화 → Task 6 · §4.9 폴백 → Task 7 · §4.3 데이터 모양 → Task 4 에서 저장하고 Task 7·8 이 읽는다.
- `probeSpeech` 의 계약 변경(영상 URL → data URI, 배열 → `{words,text}`)이 Task 2 와 4 양쪽에 적혀 있다.
- 비목표(강제 정렬 승격·배경음 분리·자막 번역·LLM 대조)는 이번 계획에 넣지 않았다. 설계 §7 에 남아 있다.
