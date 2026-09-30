# 롱폼 1단계 — 30초 관통 스크립트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MiniMax H3 로 15초 구간 두 개를 **구간 1 → 확인 ① → 구간 2 → 확인 ②** 순서로 굽고 이어 붙여, 다중 화자 30초 롱폼이 되는지 재는 측정 스크립트를 만든다.

**Architecture:** 판정·조립은 전부 `lib/longform/*` 의 작은 순수 모듈(테스트로 잰다)에 두고, 네트워크·ffmpeg·파일은 `scripts/measure/longform-2seg.mjs` 한 장이 단계별(`plan`/`seg1`/`seg2`/`join`)로 부른다. 상태는 `data/longform/<run>/run.json` 에 적고, 유료 단계는 `--yes` 없이는 돌지 않는다. `SHOTFORM_FAKE=all` 이면 네 단계 전부 0원으로 관통한다.

**Tech Stack:** Node ESM · vitest · `ffmpeg-static` · fal 큐 API(`queue.fal.run`) · 기존 lib(`lib/reel/scenario.js` · `lib/reel/storyboard.js` · `lib/imagegen.js` · `lib/vlm.js` · `lib/photos.js` · `lib/clip-limits.js` · `lib/ad/models.js`)

**Spec:** `docs/superpowers/specs/2026-09-30-longform-design.md` (3차 개정 `e4e9bec`)

## 스펙과 다르게 가는 곳 (계획을 쓰다 드러났다 — 먼저 읽을 것)

1. **캐스팅을 따로 부르지 않는다 — 시나리오가 인물을 정의한다.** 스펙은 ③시나리오 → ④캐스팅 순서인데, 고정 블록 규칙 ②(대사를 인물 **id** 에 묶는다)를 지키려면 샷이 `speaker_id` 로 가리킬 **id 가 시나리오를 쓸 때 이미 있어야** 한다. 캐스팅이 뒤에 오면 시나리오는 가리킬 id 가 없다. 그래서 롱폼 시나리오 스키마에 최상위 `characters[{key, who, look, voice}]` 를 두고, 샷은 `speaker_id`(key 또는 `"narration"`)와 `on_screen`(보이는 인물 key 목록)을 적는다. 인물 사진·아바타를 인물에 묶는 일은 이 단계에서 안 한다 — 인물 사진은 어차피 영상 참조에서 빠진다(스펙 「축 1」).
2. **H3 는 큐로만 부른다.** 기존 측정 스크립트 `bake-storyboard-h3.mjs` 는 동기 호출(`fal.run`)을 쓰는데, H3 는 *"출력 1초당 30초 안팎"* 이라 15초면 약 7.5분이다. 동기 호출은 **300초에 끊기고 fal 은 계속 만들어 과금한다** — `lib/i2v.js` 머리말: *"$0.90 이 나가고 영상은 못 받았다."* 그래서 접수 → 접수증을 `run.json` 에 **먼저 적고** → 기다린다. 끊겨도 다시 돌리면 **재접수하지 않고** 이어서 기다린다.
3. **`lib/i2v.js` 의 `submitClip` 을 안 쓴다.** 그 함수는 `falWebhookUrl(projectId)` 로 **프로덕션 웹훅 주소**를 붙인다(`publicBase()` 가 있으면). 로컬 측정이 가짜 projectId 로 프로덕션 웹훅을 부르게 된다. 기존 측정 스크립트(`compare-clip-models.mjs`)처럼 fal 을 직접 부른다.
4. **참조 오디오(목소리 닻)는 이 계획에 없다.** 스펙에서 「(선택)」이고, 인물별 대목을 가르려면 화자 구분이 필요한데 그것이 되는지 모른다. 확인 ②에서 씨앗 + 목소리 묘사만으로 목소리가 유지되면 필요 없다(YAGNI). 흔들리면 다음 계획이 다룬다.

## Global Constraints

- **`lib/reel/*` 는 한 줄도 바꾸지 않는다** — 런타임 변형도 안 된다(스키마는 `structuredClone` 해서 넓힌다). 스펙: *"단계별(reel) 변경 — 한 줄도 안 건드린다"*
- 모델: MiniMax H3 r2v — 엔드포인트 `minimax/h3/reference-to-video` · 참조 필드 `reference_image_urls` · 지문에서 참조를 부르는 이름 `Image n`(`adRefLabel("minimax-h3", n)`) · 참조 최대 9장(`adModel("minimax-h3").refs.max`) · **처음 5장 무료, 넘으면 장당 $0.08**(fal 문서 2026-09-30)
- 구간 길이: H3 프로필의 `min 5 · max 15` 초(`profileFor("minimax/h3/reference-to-video")`) — 숫자를 손으로 적지 않는다
- 화질: `"768P"` 또는 `"2K"`(`lib/clip-limits.js` 의 H3 `resolutions`). 두 구간은 **같은 화질**이어야 이어 붙일 때 재인코딩이 없다
- **유료 단계는 `--yes` 가 있어야 돈다.** `seg1` 과 `seg2` 는 따로 승인한다. 접수만 되고 결과를 못 받은 구간은 `--yes` 없이 이어서 기다린다(새 돈이 안 나간다)
- **고정 블록은 `seg1` 뒤에 잠긴다** — `seg2` 에서 다시 만든 블록이 구간 1 에 쓴 것과 한 글자라도 다르면 거부한다
- 작업 폴더는 `data/longform/<run>/`(`.gitignore` 의 `data/` 아래)
- 파일은 **Write/Edit 도구로** 쓴다 — heredoc 은 역슬래시를 먹는다(CLAUDE.md: `\b` 가 백스페이스로 박혔다)
- 관문: `npx vitest run --dir ./tests` 가 그린이어야 한다(이 폴더에서 그냥 `npx vitest run` 을 하면 다른 워크트리 테스트까지 주워 담는다)
- 브랜치 `feat/longform-shell` 에 커밋한다. **푸시하지 않는다**

## Review Focus

1. **LLM 이 구간 초를 5~15 밖으로 배정한다**(예: 구간 1 = 18초) → 시나리오 단계에서 막고 어느 구간이 몇 초인지 말한다. H3 로 넘어가면 잘리거나 거절된다 — Task 1 이 잰다
2. **대사가 있는 샷의 `speaker_id` 가 비었거나 인물 목록에 없다** → 막는다. 안 막으면 그 대사에 목소리 묘사가 안 붙어 목소리 일관성의 유일한 글 채널이 끊긴다 — Task 1 이 잰다
3. **굽는 도중 스크립트가 끊긴다**(노트북을 덮었다 · 30분 넘게 걸렸다) → 다시 돌리면 **재접수하지 않고** 저장된 접수증으로 이어 기다린다. 재접수하면 H3 값이 두 번 나간다 — Task 6·7 이 잰다
4. **확인 ① 뒤에 `run.json` 에서 인물·무대까지 고쳤다** → `seg2` 가 거부하고 이유를 말한다. 안 막으면 두 구간이 다른 설정으로 구워져 일관성 시험이 무의미해진다 — Task 7 이 잰다
5. **얼굴 든 사진을 올렸거나 참조가 9장을 넘는다** → 빠진 사진과 이유를 알리고, 5장 초과분의 값을 미리 말한다. 조용히 버리던 것이 이번 회차 강아지 사고의 뿌리였다 — Task 4 가 잰다

---

## File Structure

| 파일 | 책임 | 종류 |
|---|---|---|
| `lib/longform/plan.js` | 롱폼의 순수 상수(`NARRATION_ID` · `H3_R2V` 추가) | 수정 · import 0 |
| `lib/longform/scenario.js` | 롱폼 시나리오 스키마·지시문·검증·생성 | 새로 |
| `lib/longform/bible.js` | 고정 블록 조립 · 구간 출연자 | 새로 · 순수 |
| `lib/longform/segment-prompt.js` | 구간 지문 조립(본문 → 블록 → 출연 → 참조 → 대사) | 새로 · 순수 |
| `lib/longform/refs.js` | 구간 참조 목록 · 빠진 것 · 추가 값 | 새로 · 순수 |
| `lib/longform/ffmpeg.js` | 프레임 뽑기·이어 붙이기 인자 + 실행기 | 새로 |
| `lib/longform/h3.js` | H3 몸통 · 큐 접수·수거·기다리기 | 새로 |
| `lib/longform/run-state.js` | 단계 관문 · 고정 블록 잠금 · 값 어림 | 새로 · 순수 |
| `scripts/measure/longform-2seg.mjs` | 네 단계를 부르는 CLI | 새로 |

---

### Task 1: 롱폼 시나리오 — 스키마 · 지시문 · 검증 · 생성

**Files:**
- Modify: `lib/longform/plan.js` (끝에 상수 둘 추가)
- Create: `lib/longform/scenario.js`
- Test: `tests/longform-scenario.test.js`

**Interfaces:**
- Consumes: `REEL_SCENARIO_SCHEMA`, `buildScenarioMessages(project, opts) → { system, messages, revising }`, `validateScenario(raw, photoCount) → object|null` (`lib/reel/scenario.js`) · `profileFor(endpoint) → { min, max, … }` (`lib/clip-limits.js`) · `callJson({ system, messages, stage, projectId, schema, fake }) → raw` (`lib/llm.js`)
- Produces:
  - `plan.js`: `export const NARRATION_ID = "narration"` · `export const H3_R2V = "minimax/h3/reference-to-video"`
  - `LONGFORM_SCENARIO_SCHEMA`
  - `segmentBounds() → { min: number, max: number }`
  - `buildLongformScenarioMessages(project, { segmentCount = 2 }) → { system, messages }`
  - `validateLongformScenario(raw, photoCount, { segmentCount = 2 }) → { ok: true, scenario } | { ok: false, errors: string[] }` — `scenario` 는 `validateScenario` 결과 + `characters: [{ key, who, look, voice }]`. `shots[]` 는 원본 객체 그대로라 `segment`·`speaker_id`·`on_screen` 이 산다
  - `generateLongformScenario({ project, segmentCount = 2, deps = {} }) → scenario` (규칙 위반이면 던진다)
  - `fakeLongformResponse() → raw` (`SHOTFORM_FAKE=all` 과 테스트가 쓴다)

- [ ] **Step 1: `plan.js` 에 상수 둘을 더한다**

`lib/longform/plan.js` 파일 끝에 붙인다(import 를 더하지 않는다 — `tests/longform-plan.test.js` 가 import 0 을 잰다):

```js
// 화면 밖 목소리를 가리키는 speaker_id. 인물 key(A·B·C…)와 겹치지 않는 낱말이다.
export const NARRATION_ID = "narration";

// 롱폼이 굽는 모델의 r2v 엔드포인트 — 결정 9(MiniMax H3). 여러 모듈이 이 한 자리를 읽는다.
export const H3_R2V = "minimax/h3/reference-to-video";
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/longform-scenario.test.js`:

```js
// 롱폼 시나리오 — 인물을 시나리오가 정의하고, 샷이 그 key 로 말한다(계획서 「스펙과 다르게
// 가는 곳」 1). 구간 초는 H3 프로필(5~15)이 정한다.
import { describe, it, expect } from "vitest";
import { REEL_SCENARIO_SCHEMA } from "../lib/reel/scenario.js";
import {
  LONGFORM_SCENARIO_SCHEMA, segmentBounds, buildLongformScenarioMessages,
  validateLongformScenario, generateLongformScenario, fakeLongformResponse,
} from "../lib/longform/scenario.js";

const project = {
  id: "00000000-0000-4000-8000-000000000001",
  settings: { aspect_ratio: "9:16", style: "photo", mood: "premium", narration_lang: "ko", seconds: 30, target_seconds: 30 },
  material: { text: "동네 빵집 두 사람의 아침", photos: [] },
};

describe("스키마 — 단계별 것을 넓히되 건드리지 않는다", () => {
  it("★★ 단계별 스키마가 그대로다 — 복사해서 넓혔다", () => {
    expect(REEL_SCENARIO_SCHEMA.properties.characters).toBeUndefined();
    expect(REEL_SCENARIO_SCHEMA.properties.shots.items.properties.segment).toBeUndefined();
    expect(REEL_SCENARIO_SCHEMA.required).not.toContain("characters");
  });

  it("인물·구간·화자·출연을 요구한다", () => {
    expect(LONGFORM_SCENARIO_SCHEMA.required).toContain("characters");
    const shot = LONGFORM_SCENARIO_SCHEMA.properties.shots.items;
    expect(shot.required).toEqual(expect.arrayContaining(["segment", "speaker_id", "on_screen"]));
  });
});

describe("구간 초는 H3 프로필에서 온다", () => {
  it("5~15초", () => expect(segmentBounds()).toEqual({ min: 5, max: 15 }));
});

describe("지시문", () => {
  it("★ 롱폼 규칙이 실리고, 구간 초 범위가 숫자로 들어간다", () => {
    const { system } = buildLongformScenarioMessages(project, { segmentCount: 2 });
    expect(system).toMatch(/구간은 2개/);
    expect(system).toMatch(/5초 이상 15초 이하/);
    expect(system).toMatch(/장면이 바뀌는 자리/);
    expect(system).toMatch(/speaker_id/);
    expect(system).toMatch(/on_screen/);
  });
});

describe("검증", () => {
  it("가짜 응답은 통과한다 — 0원 관통이 이것으로 돈다", () => {
    const out = validateLongformScenario(fakeLongformResponse(), 0, { segmentCount: 2 });
    expect(out.ok).toBe(true);
    expect(out.scenario.characters.map((c) => c.key)).toEqual(["A", "B"]);
    expect(out.scenario.shots[0].segment).toBe(1);
  });

  it("★★★ 구간이 15초를 넘으면 막고, 몇 초인지 말한다", () => {
    const raw = fakeLongformResponse();
    raw.shots[0].seconds = 12; // 구간 1 = 12 + 7 = 19초
    const out = validateLongformScenario(raw, 0, { segmentCount: 2 });
    expect(out.ok).toBe(false);
    expect(out.errors.join(" ")).toMatch(/구간 1 가 19초/);
  });

  it("구간이 5초보다 짧아도 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[2].seconds = 1;
    raw.shots[3].seconds = 1; // 구간 2 = 2초
    expect(validateLongformScenario(raw, 0).ok).toBe(false);
  });

  it("★★ 대사가 있는데 speaker_id 가 비면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[0].speaker_id = "";
    const out = validateLongformScenario(raw, 0);
    expect(out.errors.join(" ")).toMatch(/speaker_id 가 비었다/);
  });

  it("★★ 인물 목록에 없는 key 로 말하면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[1].speaker_id = "C";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/"C" 는 인물 목록에 없다/);
  });

  it("on_screen 에 모르는 key 가 있어도 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[2].on_screen = ["A", "Z"];
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/on_screen "Z"/);
  });

  it("구간이 거꾸로 가면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.shots[3].segment = 1;
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/거꾸로/);
  });

  it("비어 있는 구간이 있으면 막는다", () => {
    const raw = fakeLongformResponse();
    for (const s of raw.shots) s.segment = 1;
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/구간 2 에 샷이 없다/);
  });

  it("인물 key 가 겹치면 막는다", () => {
    const raw = fakeLongformResponse();
    raw.characters[1].key = "A";
    expect(validateLongformScenario(raw, 0).errors.join(" ")).toMatch(/겹쳐요/);
  });
});

describe("생성", () => {
  it("LLM 답을 검증해 돌려준다", async () => {
    const scn = await generateLongformScenario({
      project, deps: { callJson: async () => fakeLongformResponse() },
    });
    expect(scn.characters).toHaveLength(2);
  });

  it("규칙을 어기면 던지고, 무엇을 어겼는지 말한다", async () => {
    const bad = fakeLongformResponse();
    bad.shots[0].seconds = 20;
    await expect(generateLongformScenario({ project, deps: { callJson: async () => bad } }))
      .rejects.toThrow(/구간 1/);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/longform-scenario.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/scenario.js'`

- [ ] **Step 4: 구현한다**

`lib/longform/scenario.js`:

```js
// 롱폼 시나리오 — **30초 전체를 한 번에** 쓰고, 샷마다 구간을 배정한다(스펙 결정 10 · (가)).
//
// ★★ 인물을 **시나리오가 정의한다**(characters). 스펙은 캐스팅을 뒤에 두었지만, 대사를 인물
//   id 에 묶으려면(고정 블록 규칙 ②) 그 id 가 시나리오를 쓸 때 이미 있어야 한다.
// ★ 단계별의 스키마·지시문·검증을 **읽기만** 한다 — lib/reel/* 는 한 줄도 안 바꾼다.
//   스키마는 structuredClone 으로 넓힌다(원본을 변형하면 단계별이 모르는 칸을 요구받는다).
import { REEL_SCENARIO_SCHEMA, buildScenarioMessages, validateScenario } from "../reel/scenario.js";
import { profileFor } from "../clip-limits.js";
import { callJson } from "../llm.js";
import { NARRATION_ID, H3_R2V } from "./plan.js";

export const LONGFORM_SCENARIO_SCHEMA = (() => {
  const s = structuredClone(REEL_SCENARIO_SCHEMA);
  s.properties.characters = {
    type: "array",
    items: {
      type: "object",
      properties: {
        key: { type: "string" },
        who: { type: "string" },
        look: { type: "string" },
        voice: { type: "string" },
      },
      required: ["key", "who", "look", "voice"],
      additionalProperties: false,
    },
  };
  const shot = s.properties.shots.items;
  shot.properties.segment = { type: "integer" };
  shot.properties.speaker_id = { type: "string" };
  shot.properties.on_screen = { type: "array", items: { type: "string" } };
  shot.required = [...shot.required, "segment", "speaker_id", "on_screen"];
  s.required = [...s.required, "characters"];
  return s;
})();

// 구간 하나가 받을 수 있는 초 — H3 프로필이 정한다(손으로 적지 않는다).
export function segmentBounds() {
  const p = profileFor(H3_R2V);
  return { min: p.min, max: p.max };
}

function longformRules({ segmentCount, min, max }) {
  return [
    "★★ 롱폼 규칙 — 이 영상은 짧은 구간 여러 개를 따로 만들어 이어 붙인다.",
    `- 구간은 ${segmentCount}개다. 모든 샷에 segment 를 적는다(1부터). 샷 순서대로 segment 는 줄지 않는다.`,
    `- 구간마다 그 샷들의 seconds 합이 ${min}초 이상 ${max}초 이하다.`,
    "- 구간 경계는 **장면이 바뀌는 자리**에 둔다. 한 장면 한가운데서 자르지 마라.",
    "- 앞 구간은 끝을 닫지 마라 — 다음 구간으로 이어지게 끝낸다.",
    "- characters 에 등장인물을 **전부** 적는다. key 는 A, B, C … 한 글자다. who·look·voice 는 영어로 쓴다.",
    `- 대사가 있는 샷은 speaker_id 에 말하는 인물의 key 를 적는다. 화면 밖 목소리면 "${NARRATION_ID}", 대사가 없으면 빈 문자열이다.`,
    "- on_screen 에 그 샷에 보이는 인물의 key 를 전부 적는다. 사람이 안 보이면 빈 배열이다.",
    "- shows 에서 인물을 가리킬 때는 대명사만 쓰지 말고 key 를 함께 적는다(예: \"A, the woman in her 20s\").",
  ].join("\n");
}

export function buildLongformScenarioMessages(project, { segmentCount = 2 } = {}) {
  const { min, max } = segmentBounds();
  // conceptLine: null — 광고 포맷 줄을 안 싣는다(단계별이 [알아서]에 쓰는 그 규약).
  const { system, messages } = buildScenarioMessages(project, {
    conceptLine: null,
    sceneCountRule: `★ 장면 수 — 구간마다 둘이나 셋. 전체 ${segmentCount * 3}개를 넘기지 마라.`,
  });
  return { system: `${system}\n\n${longformRules({ segmentCount, min, max })}`, messages };
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function validateLongformScenario(raw, photoCount, { segmentCount = 2 } = {}) {
  const base = validateScenario(raw, photoCount);
  if (!base) return { ok: false, errors: ["시나리오 모양이 아니에요(text·shots)"] };
  const { min, max } = segmentBounds();
  const errors = [];

  const characters = (Array.isArray(raw?.characters) ? raw.characters : [])
    .map((c) => ({ key: str(c?.key), who: str(c?.who), look: str(c?.look), voice: str(c?.voice) }))
    .filter((c) => c.key);
  const keys = new Set(characters.map((c) => c.key));
  if (keys.size !== characters.length) errors.push("인물 key 가 겹쳐요");

  let prev = 1;
  const sums = new Map();
  base.shots.forEach((s, i) => {
    const n = i + 1;
    const seg = Number(s?.segment);
    if (!Number.isInteger(seg) || seg < 1 || seg > segmentCount) {
      errors.push(`샷 ${n}: segment ${s?.segment} 이 1~${segmentCount} 밖이다`);
      return;
    }
    if (seg < prev) errors.push(`샷 ${n}: segment 가 거꾸로 간다(${prev} → ${seg})`);
    prev = seg;
    sums.set(seg, (sums.get(seg) || 0) + (Number(s?.seconds) || 0));
    const sp = str(s?.speaker_id);
    if (str(s?.line) && !sp) errors.push(`샷 ${n}: 대사가 있는데 speaker_id 가 비었다`);
    if (sp && sp !== NARRATION_ID && !keys.has(sp)) errors.push(`샷 ${n}: speaker_id "${sp}" 는 인물 목록에 없다`);
    for (const k of Array.isArray(s?.on_screen) ? s.on_screen : []) {
      if (!keys.has(k)) errors.push(`샷 ${n}: on_screen "${k}" 는 인물 목록에 없다`);
    }
  });
  for (let seg = 1; seg <= segmentCount; seg++) {
    const t = sums.get(seg) || 0;
    if (t === 0) errors.push(`구간 ${seg} 에 샷이 없다`);
    else if (t < min || t > max) errors.push(`구간 ${seg} 가 ${t}초 — ${min}~${max}초여야 한다`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, scenario: { ...base, characters } };
}

export async function generateLongformScenario({ project, segmentCount = 2, deps = {} }) {
  const call = deps.callJson || callJson;
  const { system, messages } = buildLongformScenarioMessages(project, { segmentCount });
  const raw = await call({
    system, messages, stage: "롱폼 시나리오", projectId: project.id,
    schema: LONGFORM_SCENARIO_SCHEMA, fake: fakeLongformResponse,
  });
  const out = validateLongformScenario(raw, (project.material?.photos || []).length, { segmentCount });
  if (!out.ok) throw new Error(`롱폼 시나리오가 규칙을 어겼어요 — ${out.errors.join(" · ")}`);
  return out.scenario;
}

// SHOTFORM_FAKE=all 과 테스트가 쓰는 응답 — **검증을 통과하는 모양**이어야 0원 관통이 돈다.
// 구간 1 = 7+7 = 14초 · 구간 2 = 8+7 = 15초.
export function fakeLongformResponse() {
  const shot = (o) => ({
    beat: "", avatar_id: "", transition: "", camera: "eye level, slow push-in",
    lighting: "soft morning window light", action: "", sound: "quiet bakery ambience",
    line: "", speaker: "", speaker_id: "", on_screen: [], ...o,
  });
  return {
    text: "가짜 롱폼 시나리오입니다. 배선을 확인하려고 만든 글이라 실제 내용이 아닙니다.",
    focus: "person", voice: "", music: "", tone: "warm natural color",
    look: "", wardrobe: "flour-dusted aprons", environment: "a small neighborhood bakery at dawn",
    angle: "두 사람의 아침", endpoint: "r2v",
    characters: [
      { key: "A", who: "Korean woman in her 30s, the baker", look: "short black hair, round glasses", voice: "warm, low, unhurried" },
      { key: "B", who: "Korean man in his 20s, her apprentice", look: "tall, curly hair", voice: "bright, slightly nervous" },
    ],
    shots: [
      shot({ segment: 1, seconds: 7, shows: "A, the baker, pulls a tray of bread from the oven", on_screen: ["A"], line: "오늘도 잘 구워졌네.", speaker: "A", speaker_id: "A" }),
      shot({ segment: 1, seconds: 7, shows: "B, the apprentice, rushes in through the back door", on_screen: ["A", "B"], line: "늦어서 죄송해요!", speaker: "B", speaker_id: "B" }),
      shot({ segment: 2, seconds: 8, shows: "A hands B an apron across the counter", on_screen: ["A", "B"], line: "괜찮아, 반죽부터 하자.", speaker: "A", speaker_id: "A" }),
      shot({ segment: 2, seconds: 7, shows: "Both knead dough side by side as the sun rises", on_screen: ["A", "B"], line: "", speaker: "", speaker_id: "" }),
    ],
  };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run tests/longform-scenario.test.js tests/longform-plan.test.js`
Expected: PASS (둘 다 — `plan.js` 는 여전히 import 0)

- [ ] **Step 6: 커밋한다**

```bash
git add lib/longform/plan.js lib/longform/scenario.js tests/longform-scenario.test.js
git commit -m "feat(longform): 롱폼 시나리오 — 인물을 시나리오가 정의하고 샷이 key 로 말한다"
```

---

### Task 2: 고정 블록

**Files:**
- Create: `lib/longform/bible.js`
- Test: `tests/longform-bible.test.js`

**Interfaces:**
- Consumes: `AD_STYLE_LINES` (`lib/ad/options.js`) · `NARRATION_ID` (Task 1, `lib/longform/plan.js`) · Task 1 의 `scenario` 모양
- Produces:
  - `buildBible(scenario, { style }) → string` — 같은 입력이면 **한 글자도 안 다른** 문자열. 빈 칸은 줄째로 빠진다
  - `segmentCharacters(scenario, seg) → string[]` — 그 구간에 보이거나 말하는 인물 key. **`characters` 의 순서**를 따른다. `narration` 은 안 든다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-bible.test.js`:

```js
// 고정 블록 — 구간마다 코드가 **글자 그대로** 붙인다(스펙 결정 8).
import { describe, it, expect } from "vitest";
import { buildBible, segmentCharacters } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";
import { AD_STYLE_LINES } from "../lib/ad/options.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;

describe("고정 블록", () => {
  it("★★★ 같은 입력이면 한 글자도 안 다르다 — 이것이 잠금의 전제다", () => {
    expect(buildBible(scn, { style: "photo" })).toBe(buildBible(structuredClone(scn), { style: "photo" }));
  });

  it("화풍은 영상용 문구 표에서 읽는다", () => {
    expect(buildBible(scn, { style: "photo" })).toContain(AD_STYLE_LINES.photo);
  });

  it("무대·의상·색감을 싣는다", () => {
    const b = buildBible(scn, { style: "photo" });
    expect(b).toContain("Setting: a small neighborhood bakery at dawn.");
    expect(b).toContain("Wardrobe: flour-dusted aprons.");
    expect(b).toContain("Color treatment: warm natural color.");
  });

  it("★ 빈 칸은 줄째로 빠진다 — 'Subject: .' 같은 빈 줄을 안 남긴다", () => {
    expect(buildBible(scn, { style: "photo" })).not.toMatch(/Subject:/);
  });

  it("★★ 인물마다 생김새와 목소리를 한 줄에 싣는다 — 대사와 묶을 key 가 앞에 온다", () => {
    const b = buildBible(scn, { style: "photo" });
    expect(b).toContain("- A: Korean woman in her 30s, the baker — short black hair, round glasses — voice: warm, low, unhurried.");
    expect(b.indexOf("- A:")).toBeLessThan(b.indexOf("- B:"));
  });
});

describe("구간 출연자", () => {
  it("보이거나 말하는 사람을 인물 목록 순서로 돌려준다", () => {
    expect(segmentCharacters(scn, 1)).toEqual(["A", "B"]);
  });

  it("말하기만 해도 출연자다", () => {
    const s = structuredClone(scn);
    s.shots[0].on_screen = [];
    expect(segmentCharacters(s, 1)).toContain("A");
  });

  it("★ 화면 밖 목소리는 출연자가 아니다", () => {
    const s = structuredClone(scn);
    s.shots = [{ segment: 1, on_screen: [], speaker_id: "narration", line: "옛날 옛적에" }];
    expect(segmentCharacters(s, 1)).toEqual([]);
  });

  it("다른 구간의 사람은 안 든다", () => {
    const s = structuredClone(scn);
    s.shots = [{ segment: 1, on_screen: ["A"] }, { segment: 2, on_screen: ["B"] }];
    expect(segmentCharacters(s, 1)).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-bible.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/bible.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/bible.js`:

```js
// 고정 블록 — 모든 구간에 **한 글자도 안 다르게** 붙는 설정(스펙 「고정 블록」).
//
// ★★★ 왜 코드가 조립하나. 무대·의상·색감은 지금 영상 지문에 코드로 실리는 곳이 0건이다
//   (LLM 이 글에 녹여 줬을 때만 간다). 롱폼은 그 글을 구간으로 잘라 구간 2 가 "여기가
//   어디이고 그녀가 누구인지"를 모른다. 그래서 구조화된 칸에서 **문자열 하나**를 만든다.
// ★ 같은 입력이면 같은 문자열이어야 한다 — 그것이 seg2 의 잠금 판정(run-state.js)의 전제다.
// ★ 영어다 — 영상 모델이 읽는 글이다.
import { AD_STYLE_LINES } from "../ad/options.js";
import { NARRATION_ID } from "./plan.js";

const clean = (v) => (typeof v === "string" ? v.trim().replace(/\.+$/, "") : "");

function line(label, v) {
  const t = clean(v);
  return t ? `${label}: ${t}.` : "";
}

export function buildBible(scenario, { style }) {
  const people = (scenario?.characters || []).map((c) => {
    const face = [clean(c.who), clean(c.look)].filter(Boolean).join(" — ");
    const voice = clean(c.voice);
    return `- ${c.key}: ${face}${voice ? ` — voice: ${voice}` : ""}.`;
  });
  return [
    "Fixed setting for every part of this film — keep all of it identical in every part:",
    line("Style", AD_STYLE_LINES[style]),
    line("Setting", scenario?.environment),
    line("Wardrobe", scenario?.wardrobe),
    line("Color treatment", scenario?.tone),
    line("Subject", scenario?.look),
    people.length ? `Characters:\n${people.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

// 그 구간에 보이거나 말하는 인물 key — 인물 목록의 순서를 따른다(같은 입력 → 같은 문장).
export function segmentCharacters(scenario, seg) {
  const seen = new Set();
  for (const s of scenario?.shots || []) {
    if (Number(s?.segment) !== seg) continue;
    for (const k of Array.isArray(s?.on_screen) ? s.on_screen : []) seen.add(k);
    const sp = typeof s?.speaker_id === "string" ? s.speaker_id.trim() : "";
    if (sp && sp !== NARRATION_ID) seen.add(sp);
  }
  return (scenario?.characters || []).map((c) => c.key).filter((k) => seen.has(k));
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-bible.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/bible.js tests/longform-bible.test.js
git commit -m "feat(longform): 고정 블록 — 구간마다 글자 그대로 붙는 설정"
```

---

### Task 3: 구간 지문

**Files:**
- Create: `lib/longform/segment-prompt.js`
- Test: `tests/longform-segment-prompt.test.js`

**Interfaces:**
- Consumes: `adRefLabel(modelId, n) → "Image n"` (`lib/ad/models.js`) · `NARRATION_ID` (Task 1) · `segmentCharacters` (Task 2) · 참조 항목 모양 `{ kind: "sheet"|"photo"|"anchor"|"last", roleEn?, keys? }` (Task 4 가 만든다 — 여기서는 `kind`·`roleEn`·`keys` 만 읽는다)
- Produces:
  - `segmentShots(scenario, seg) → shot[]`
  - `segmentSeconds(scenario, seg) → number`
  - `buildSegmentPrompt({ scenario, seg, bible, refs = [], langLine = "Korean" }) → string` — 순서: **본문 → 고정 블록 → 출연 → 참조 → 대사**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-segment-prompt.test.js`:

```js
// 구간 지문 — 본문 → 고정 블록 → 출연 → 참조 → 대사(스펙 규칙 ④: 뒤에 올수록 강하게 받는다).
import { describe, it, expect } from "vitest";
import { buildSegmentPrompt, segmentShots, segmentSeconds } from "../lib/longform/segment-prompt.js";
import { buildBible } from "../lib/longform/bible.js";
import { fakeLongformResponse, validateLongformScenario } from "../lib/longform/scenario.js";

const scn = validateLongformScenario(fakeLongformResponse(), 0).scenario;
const bible = buildBible(scn, { style: "photo" });
const refs = [{ kind: "sheet" }, { kind: "photo", roleEn: "is the subject — keep it unchanged" }, { kind: "anchor", keys: ["A", "B"] }, { kind: "last" }];

describe("구간 가르기", () => {
  it("그 구간의 샷만", () => expect(segmentShots(scn, 2)).toHaveLength(2));
  it("초를 더한다", () => {
    expect(segmentSeconds(scn, 1)).toBe(14);
    expect(segmentSeconds(scn, 2)).toBe(15);
  });
});

describe("구간 지문", () => {
  const p = buildSegmentPrompt({ scenario: scn, seg: 2, bible, refs });

  it("★★★ 순서가 본문 → 고정 블록 → 출연 → 참조 → 대사다", () => {
    const at = (s) => p.indexOf(s);
    expect(at("Shot 1")).toBeLessThan(at("Fixed setting"));
    expect(at("Fixed setting")).toBeLessThan(at("In this part only"));
    expect(at("In this part only")).toBeLessThan(at("Image 1"));
    expect(at("Image 1")).toBeLessThan(at("says"));
  });

  it("★★ 고정 블록을 글자 그대로 싣는다", () => expect(p).toContain(bible));

  it("그 구간 샷만 본문에 든다", () => {
    expect(p).toContain("A hands B an apron");
    expect(p).not.toContain("pulls a tray of bread");
  });

  it("★ 출연자 밖의 사람을 막는다", () => {
    expect(p).toContain("In this part only A, B appear — no other people, including in the background.");
  });

  it("★★ H3 의 참조 이름(Image n)으로 역할을 말한다", () => {
    expect(p).toMatch(/Image 1 is the storyboard for this part/);
    expect(p).toMatch(/Image 2 is the subject/);
    expect(p).toMatch(/Image 3 is a still from the previous part showing A, B/);
    expect(p).toMatch(/Image 4 is the last frame of the previous part/);
  });

  it("★★★ 대사마다 그 인물의 목소리 묘사를 붙인다 — 목소리의 유일한 글 채널이다", () => {
    expect(p).toContain('A (warm, low, unhurried) says, with natural lip sync, in Korean: "괜찮아, 반죽부터 하자."');
  });

  it("대사 없는 샷은 말하게 하지 않는다", () => {
    expect(p.match(/ says/g)).toHaveLength(1);
  });

  it("사람이 없는 구간은 사람이 없다고 말한다", () => {
    const s = structuredClone(scn);
    for (const sh of s.shots) { sh.on_screen = []; sh.speaker_id = ""; sh.line = ""; }
    expect(buildSegmentPrompt({ scenario: s, seg: 1, bible, refs: [] })).toContain("No people appear in this part.");
  });

  it("화면 밖 목소리는 입을 안 움직이게 말한다", () => {
    const s = structuredClone(scn);
    s.shots[0].speaker_id = "narration";
    const q = buildSegmentPrompt({ scenario: s, seg: 1, bible, refs: [] });
    expect(q).toContain('A narrator says off-screen, in Korean: "오늘도 잘 구워졌네."');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-segment-prompt.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/segment-prompt.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/segment-prompt.js`:

```js
// 구간 지문 — H3 에 보내는 글 한 벌. 순서가 규칙이다(스펙 「고정 블록」 규칙 ④):
//   본문(이 구간에서 일어나는 일) → 고정 블록 → 이 구간 출연 → 참조 이름 → 대사
// 뒤에 올수록 모델이 강하게 받는다 — 말이 맨 끝이다(buildOneShotPrompt 와 같은 규약).
import { adRefLabel } from "../ad/models.js";
import { NARRATION_ID } from "./plan.js";
import { segmentCharacters } from "./bible.js";

const H3 = "minimax-h3";
const clean = (v) => (typeof v === "string" ? v.trim().replace(/\.+$/, "") : "");

export function segmentShots(scenario, seg) {
  return (scenario?.shots || []).filter((s) => Number(s?.segment) === seg);
}

export function segmentSeconds(scenario, seg) {
  return segmentShots(scenario, seg).reduce((t, s) => t + (Number(s?.seconds) || 0), 0);
}

function shotLine(s, i) {
  const what = [clean(s.shows), clean(s.action)].filter(Boolean).join(". ");
  const how = [["Camera", s.camera], ["Lighting", s.lighting], ["Sound", s.sound]]
    .map(([k, v]) => (clean(v) ? `${k}: ${clean(v)}.` : ""))
    .filter(Boolean)
    .join(" ");
  return `Shot ${i + 1} (${Number(s.seconds) || 0}s): ${what}.${how ? ` ${how}` : ""}`;
}

function refLine(r, n) {
  const label = adRefLabel(H3, n);
  if (r.kind === "sheet") {
    return `${label} is the storyboard for this part — follow its shot order and framing, but never show a grid, panel borders or a split screen.`;
  }
  if (r.kind === "anchor") {
    const who = r.keys?.length ? ` showing ${r.keys.join(", ")}` : "";
    return `${label} is a still from the previous part${who} — keep every person's face, hair, build and clothing identical to it.`;
  }
  if (r.kind === "last") return `${label} is the last frame of the previous part — continue naturally from it.`;
  return `${label} ${r.roleEn || "is a reference photo of the subject — keep it unchanged"}.`;
}

export function buildSegmentPrompt({ scenario, seg, bible, refs = [], langLine = "Korean" }) {
  const shots = segmentShots(scenario, seg);
  const keys = segmentCharacters(scenario, seg);
  const body = shots.map(shotLine).join("\n");
  const cast = keys.length
    ? `In this part only ${keys.join(", ")} appear — no other people, including in the background.`
    : "No people appear in this part.";
  const refLines = refs.map((r, i) => refLine(r, i + 1)).join("\n");

  const voiceOf = new Map((scenario?.characters || []).map((c) => [c.key, clean(c.voice)]));
  const said = shots
    .filter((s) => typeof s?.line === "string" && s.line.trim())
    .map((s) => {
      const text = s.line.trim();
      if (s.speaker_id === NARRATION_ID) return `A narrator says off-screen, in ${langLine}: "${text}"`;
      const v = voiceOf.get(s.speaker_id);
      return `${s.speaker_id}${v ? ` (${v})` : ""} says, with natural lip sync, in ${langLine}: "${text}"`;
    });
  const speech = said.length
    ? `${said.join("\n")}\nEvery line is spoken by native ${langLine} speakers with natural, fluent pronunciation — never a foreign accent, never spelled out letter by letter.`
    : "";

  return [body, bible, cast, refLines, speech].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-segment-prompt.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/segment-prompt.js tests/longform-segment-prompt.test.js
git commit -m "feat(longform): 구간 지문 — 본문·고정 블록·출연·참조·대사를 한 순서로"
```

---

### Task 4: 구간 참조 목록

**Files:**
- Create: `lib/longform/refs.js`
- Test: `tests/longform-refs.test.js`

**Interfaces:**
- Consumes: `hasFaceRisk(photo)`, `photoRole(id) → { en } | null` (`lib/photos.js`) · `adModel("minimax-h3").refs.max` (`lib/ad/models.js`)
- Produces:
  - `H3_FREE_REFS = 5` · `H3_EXTRA_REF_USD = 0.08`
  - `segmentRefs({ sheet, photos = [], anchor = null, last = null }) → { refs, dropped, extraUsd }`
    - `sheet`: `{ url }` 또는 `{}`(계획 단계 미리보기) · `photos[]`: `{ id, role, vision?, url?, bytes?, key? }` · `anchor`: `{ bytes, key, keys }` · `last`: `{ bytes, key }`
    - `refs[]` 순서: 판 → 사진 → 닻 → 직전. 각 항목에 `kind` 가 붙고, 사진은 `roleEn` 이 붙는다
    - `dropped[]`: `{ kind, id?, reason: "face" | "room" }`
    - `extraUsd`: 5장 넘는 만큼 × $0.08

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-refs.test.js`:

```js
// 구간 참조 — 판 → 사진 → 닻 → 직전. 자리가 모자라면 직전부터, 그다음 사진을 뒤에서 버린다
// (스펙 「축 1」 자리 계산). 버린 것은 **이유와 함께** 돌려준다 — 조용히 버리지 않는다.
import { describe, it, expect } from "vitest";
import { segmentRefs, H3_FREE_REFS, H3_EXTRA_REF_USD } from "../lib/longform/refs.js";

const photo = (id, extra = {}) => ({ id, role: "product", vision: { person: false, any_face: false }, url: `u/${id}`, ...extra });

describe("구간 참조", () => {
  it("순서가 판 → 사진 → 닻 → 직전이다", () => {
    const { refs } = segmentRefs({ sheet: { url: "s" }, photos: [photo("p1")], anchor: { key: "a" }, last: { key: "l" } });
    expect(refs.map((r) => r.kind)).toEqual(["sheet", "photo", "anchor", "last"]);
  });

  it("사진에는 역할 문구가 붙는다", () => {
    const { refs } = segmentRefs({ sheet: {}, photos: [photo("p1")] });
    expect(refs[1].roleEn).toMatch(/^is the subject/);
  });

  it("★★★ 얼굴 든 사진은 빠지고, 빠진 이유를 말한다", () => {
    const face = photo("p2", { role: "person", vision: { person: true, any_face: true } });
    const { refs, dropped } = segmentRefs({ sheet: {}, photos: [photo("p1"), face] });
    expect(refs.map((r) => r.id)).not.toContain("p2");
    expect(dropped).toEqual([{ kind: "photo", id: "p2", reason: "face" }]);
  });

  it("★★ 9장을 넘으면 직전 프레임부터 버린다 — 이음새에는 0원 대안(장면 경계)이 있다", () => {
    const photos = Array.from({ length: 7 }, (_, i) => photo(`p${i}`));
    const { refs, dropped } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" }, last: { key: "l" } });
    expect(refs).toHaveLength(9);
    expect(refs.map((r) => r.kind)).not.toContain("last");
    expect(refs.map((r) => r.kind)).toContain("anchor");
    expect(dropped).toEqual([{ kind: "last", reason: "room" }]);
  });

  it("그래도 넘치면 사진을 뒤에서부터 버린다 — 닻은 지킨다", () => {
    // 판 1 + 사진 8 + 닻 1 = 10 → 사진 하나(p7)를 뺀다
    const photos = Array.from({ length: 8 }, (_, i) => photo(`p${i}`));
    const { refs, dropped } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" } });
    expect(refs).toHaveLength(9);
    expect(refs.at(-1).kind).toBe("anchor");
    expect(dropped).toEqual([{ kind: "photo", id: "p7", reason: "room" }]);
  });

  it("★ 5장까지는 추가 값이 0 이다", () => {
    const { extraUsd } = segmentRefs({ sheet: {}, photos: [photo("p1"), photo("p2")], anchor: { key: "a" }, last: { key: "l" } });
    expect(extraUsd).toBe(0);
  });

  it("5장을 넘는 만큼 장당 $0.08 이다", () => {
    const photos = Array.from({ length: 4 }, (_, i) => photo(`p${i}`));
    const { refs, extraUsd } = segmentRefs({ sheet: {}, photos, anchor: { key: "a" }, last: { key: "l" } });
    expect(refs).toHaveLength(7);
    expect(extraUsd).toBeCloseTo((7 - H3_FREE_REFS) * H3_EXTRA_REF_USD, 6);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-refs.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/refs.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/refs.js`:

```js
// 구간 참조 목록 — H3 의 reference_image_urls 에 **이 순서로** 실린다.
//   판 → 원본 사진 → 닻 → 직전 구간 마지막 프레임
// 지문의 "Image n" 번호가 이 순서를 가리킨다(segment-prompt.js) — 순서를 바꾸면 번호가
// 거짓말이 된다.
//
// ★ 얼굴 든 사진은 뺀다(hasFaceRisk — 초상 정책). ★★ **빠진 것을 이유와 함께 돌려준다** —
//   조용히 버린 것이 이번 회차 강아지 편(1c979787)의 뿌리였다.
// ★ 자리가 모자라면 직전 프레임부터 버린다 — 이음새(축 2)에는 "경계를 장면 전환에 맞추기"
//   라는 0원 대안이 있고, 인물(축 1, 닻)에는 없다(스펙 「축 1」).
import { hasFaceRisk, photoRole } from "../photos.js";
import { adModel } from "../ad/models.js";

const H3_MAX_REFS = adModel("minimax-h3").refs.max;
// fal 문서(minimax/h3/reference-to-video, 2026-09-30): "first 5 reference images are free
// and each additional image costs $0.08". 코드에 이 값이 사는 다른 자리는 없다.
export const H3_FREE_REFS = 5;
export const H3_EXTRA_REF_USD = 0.08;

export function segmentRefs({ sheet, photos = [], anchor = null, last = null }) {
  const dropped = [];
  const usable = [];
  for (const p of photos) {
    if (hasFaceRisk(p)) dropped.push({ kind: "photo", id: p.id, reason: "face" });
    else usable.push(p);
  }

  const tail = [];
  if (anchor) tail.push({ kind: "anchor", ...anchor });
  if (last) tail.push({ kind: "last", ...last });

  const room = H3_MAX_REFS - 1; // 판이 한 자리
  while (usable.length + tail.length > room) {
    const i = tail.findIndex((r) => r.kind === "last");
    if (i >= 0) {
      tail.splice(i, 1);
      dropped.push({ kind: "last", reason: "room" });
      continue;
    }
    const p = usable.pop();
    dropped.push({ kind: "photo", id: p.id, reason: "room" });
  }

  const refs = [
    { kind: "sheet", ...sheet },
    ...usable.map((p) => ({
      kind: "photo", id: p.id, url: p.url, bytes: p.bytes, key: p.key,
      roleEn: photoRole(p.role)?.en,
    })),
    ...tail,
  ];
  const extraUsd = Math.round(Math.max(0, refs.length - H3_FREE_REFS) * H3_EXTRA_REF_USD * 100) / 100;
  return { refs, dropped, extraUsd };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-refs.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/refs.js tests/longform-refs.test.js
git commit -m "feat(longform): 구간 참조 — 판·사진·닻·직전, 빠진 것을 이유와 함께"
```

---

### Task 5: ffmpeg — 프레임 뽑기 · 이어 붙이기

**Files:**
- Create: `lib/longform/ffmpeg.js`
- Test: `tests/longform-ffmpeg.test.js`

**Interfaces:**
- Consumes: `ffmpeg-static` 기본 export(실행 파일 경로) · `child_process.spawn`
- Produces:
  - `frameAtArgs({ input, at, out }) → string[]` — `at` 초의 한 프레임
  - `lastFrameArgs({ input, out }) → string[]` — 끝에서 0.1초 안쪽 한 프레임
  - `concatList(files) → string` — concat demuxer 목록(절대 경로 · 슬래시 · 작은따옴표 이스케이프)
  - `joinArgs({ list, out }) → string[]` — **재인코딩 없이**(`-c copy`) 잇는다 = 하드컷
  - `runFfmpeg(args, { bin, spawnImpl }) → Promise<void>` — 실패하면 stderr 꼬리를 담아 던진다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-ffmpeg.test.js`:

```js
// ffmpeg — 인자는 순수 함수로 만들고(여기서 잰다), 실행은 얇게 둔다(lib/compose.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { frameAtArgs, lastFrameArgs, concatList, joinArgs, runFfmpeg } from "../lib/longform/ffmpeg.js";

describe("인자", () => {
  it("한 프레임 — 빠른 탐색(-ss 가 -i 앞)", () => {
    expect(frameAtArgs({ input: "a.mp4", at: 7.5, out: "f.jpg" }))
      .toEqual(["-y", "-ss", "7.5", "-i", "a.mp4", "-frames:v", "1", "-q:v", "2", "f.jpg"]);
  });

  it("마지막 프레임 — 끝에서 0.1초 안쪽", () => {
    expect(lastFrameArgs({ input: "a.mp4", out: "l.jpg" }))
      .toEqual(["-y", "-sseof", "-0.1", "-i", "a.mp4", "-update", "1", "-frames:v", "1", "-q:v", "2", "l.jpg"]);
  });

  it("★ 이어 붙이기는 재인코딩이 없다 — 하드컷이고 화질 손실 0", () => {
    const a = joinArgs({ list: "c.txt", out: "o.mp4" });
    expect(a).toEqual(["-y", "-f", "concat", "-safe", "0", "-i", "c.txt", "-c", "copy", "o.mp4"]);
  });

  it("목록은 슬래시로 쓰고 작은따옴표를 이스케이프한다 — 윈도 경로에서 깨지지 않게", () => {
    const text = concatList(["C:\\run\\seg1.mp4", "C:\\run\\it's.mp4"]);
    expect(text).toBe("file 'C:/run/seg1.mp4'\nfile 'C:/run/it'\\''s.mp4'\n");
  });
});

describe("실행기", () => {
  const fakeSpawn = (code, stderr = "") => () => {
    const p = new EventEmitter();
    p.stderr = new EventEmitter();
    setTimeout(() => { p.stderr.emit("data", stderr); p.emit("close", code); }, 0);
    return p;
  };

  it("0 으로 끝나면 풀린다", async () => {
    await expect(runFfmpeg(["-version"], { bin: "ffmpeg", spawnImpl: fakeSpawn(0) })).resolves.toBeUndefined();
  });

  it("★ 실패하면 stderr 꼬리를 담아 던진다 — 원인을 못 보면 고칠 수 없다", async () => {
    await expect(runFfmpeg(["x"], { bin: "ffmpeg", spawnImpl: fakeSpawn(1, "Invalid data found") }))
      .rejects.toThrow(/ffmpeg 실패\(1\).*Invalid data found/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-ffmpeg.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/ffmpeg.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/ffmpeg.js`:

```js
// ffmpeg — 닻 프레임을 뽑고, 두 구간을 잇는다. 로컬이라 0원이다.
//
// ★ 인자는 순수 함수다(테스트가 잰다) — lib/compose.js 가 buildFfmpegArgs 를 따로 두는 것과
//   같은 방식. 실행기는 얇게 둔다.
// ★ 이어 붙이기는 `-c copy` — 두 구간이 **같은 모델·같은 화질**이면 재인코딩 없이 붙는다.
//   이음새는 하드컷이다(스펙 「축 2」 층③: 경계를 장면 전환에 맞췄으니 하드컷이 문법이다).
//   화질이 다르면 ffmpeg 가 실패한다 — 그래서 화질은 plan 단계에서 한 번 정하고 두 구간이 같이 쓴다.
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export function frameAtArgs({ input, at, out }) {
  return ["-y", "-ss", String(at), "-i", input, "-frames:v", "1", "-q:v", "2", out];
}

export function lastFrameArgs({ input, out }) {
  return ["-y", "-sseof", "-0.1", "-i", input, "-update", "1", "-frames:v", "1", "-q:v", "2", out];
}

export function concatList(files) {
  return files
    .map((f) => `file '${String(f).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n") + "\n";
}

export function joinArgs({ list, out }) {
  return ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out];
}

export function runFfmpeg(args, { bin = ffmpegPath, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawnImpl(bin, args);
    let err = "";
    p.stderr?.on("data", (d) => {
      err += String(d);
      if (err.length > 8000) err = err.slice(-8000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0
      ? resolve()
      : reject(new Error(`ffmpeg 실패(${code}): ${err.slice(-600)}`))));
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-ffmpeg.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/ffmpeg.js tests/longform-ffmpeg.test.js
git commit -m "feat(longform): ffmpeg — 닻 프레임 뽑기와 재인코딩 없는 이어 붙이기"
```

---

### Task 6: H3 큐 — 몸통 · 접수 · 수거 · 기다리기

**Files:**
- Create: `lib/longform/h3.js`
- Test: `tests/longform-h3.test.js`

**Interfaces:**
- Consumes: `H3_R2V` (Task 1) · `profileFor`, `fitDurationFor` (`lib/clip-limits.js`) · `toDataUri(bytes, key)` (`lib/refs-io.js`) · Task 4 의 `refs[]`
- Produces:
  - `h3Body({ prompt, seconds, aspect, resolution, refs, seed }) → object` — fal 에 그대로 보낼 몸통
  - `submitH3(body, { key, fetchImpl }) → { requestId, statusUrl, responseUrl }`
  - `collectH3(job, { key, fetchImpl }) → { done: false, status } | { done: true, url }`
  - `waitH3(job, { key, fetchImpl, sleep, now, intervalMs = 10000, timeoutMs = 1800000, onTick }) → url`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-h3.test.js`:

```js
// H3 는 **큐로만** 부른다 — 15초가 ~7.5분이라 동기 호출(fal.run)은 300초에 끊기고
// fal 은 계속 과금한다(lib/i2v.js 머리말: $0.90 을 그렇게 잃었다).
import { describe, it, expect } from "vitest";
import { h3Body, submitH3, collectH3, waitH3 } from "../lib/longform/h3.js";

const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe("몸통", () => {
  const body = h3Body({
    prompt: "p", seconds: 14, aspect: "9:16", resolution: "768P", seed: 42,
    refs: [{ kind: "sheet", url: "https://fal/s.png" }, { kind: "anchor", bytes: Buffer.from("x"), key: "a.jpg" }],
  });

  it("★ 참조 필드는 reference_image_urls 다(Seedance 의 image_urls 가 아니다)", () => {
    expect(body.reference_image_urls[0]).toBe("https://fal/s.png");
    expect(body.image_urls).toBeUndefined();
  });

  it("로컬 바이트는 data URI 로 싣는다", () => {
    expect(body.reference_image_urls[1]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("길이는 H3 프로필이 받는 값이다", () => {
    expect(body.duration).toBeGreaterThanOrEqual(5);
    expect(body.duration).toBeLessThanOrEqual(15);
  });

  it("씨앗이 있으면 싣고, 없으면 칸을 안 만든다", () => {
    expect(body.seed).toBe(42);
    expect(h3Body({ prompt: "p", seconds: 10, aspect: "9:16", resolution: "768P", refs: [] }).seed).toBeUndefined();
  });
});

describe("접수", () => {
  it("큐 주소로 보내고 접수증을 돌려준다", async () => {
    let called = "";
    const job = await submitH3({ prompt: "p" }, {
      key: "k",
      fetchImpl: async (url) => { called = url; return res(200, { request_id: "r1", status_url: "S", response_url: "R" }); },
    });
    expect(called).toBe("https://queue.fal.run/minimax/h3/reference-to-video");
    expect(job).toEqual({ requestId: "r1", statusUrl: "S", responseUrl: "R" });
  });

  it("거절되면 상태 코드를 담아 던진다", async () => {
    await expect(submitH3({}, { key: "k", fetchImpl: async () => res(422, { detail: "bad" }) }))
      .rejects.toThrow(/H3 접수 실패 \(422\)/);
  });
});

describe("수거", () => {
  const job = { statusUrl: "S", responseUrl: "R" };

  it("아직이면 done:false", async () => {
    const out = await collectH3(job, { key: "k", fetchImpl: async () => res(200, { status: "IN_PROGRESS" }) });
    expect(out).toEqual({ done: false, status: "IN_PROGRESS" });
  });

  it("끝났으면 영상 주소를 준다", async () => {
    const out = await collectH3(job, {
      key: "k",
      fetchImpl: async (url) => (url === "S" ? res(200, { status: "COMPLETED" }) : res(200, { video: { url: "https://v.mp4" } })),
    });
    expect(out).toEqual({ done: true, url: "https://v.mp4" });
  });
});

describe("기다리기", () => {
  it("끝날 때까지 두드린다", async () => {
    let n = 0;
    const url = await waitH3({ statusUrl: "S", responseUrl: "R" }, {
      key: "k", sleep: async () => {}, now: () => 0,
      fetchImpl: async (u) => {
        if (u === "S") return res(200, { status: ++n < 3 ? "IN_PROGRESS" : "COMPLETED" });
        return res(200, { video: { url: "https://v.mp4" } });
      },
    });
    expect(url).toBe("https://v.mp4");
    expect(n).toBe(3);
  });

  it("★★ 시간을 넘기면 던지되, 접수증으로 이어 기다릴 수 있다고 말한다 — 재접수하면 값이 두 번 나간다", async () => {
    let t = 0;
    await expect(waitH3({ statusUrl: "S", responseUrl: "R" }, {
      key: "k", sleep: async () => {}, now: () => (t += 60000), timeoutMs: 120000,
      fetchImpl: async () => res(200, { status: "IN_QUEUE" }),
    })).rejects.toThrow(/다시 돌리면 이어서 기다려요/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-h3.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/h3.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/h3.js`:

```js
// MiniMax H3 r2v — **큐로만** 부른다.
//
// ★★★ 동기 호출(fal.run)을 안 쓰는 이유: H3 는 "출력 1초당 30초 안팎"이라 15초면 ~7.5분이다.
//   동기 호출은 300초에 끊기고(undici 헤더 타임아웃) fal 은 그와 무관하게 만들어 **과금한다** —
//   lib/i2v.js 머리말: "$0.90 이 나가고 영상은 못 받았다".
// ★★ lib/i2v.js 의 submitClip 을 안 쓰는 이유: 그 함수는 falWebhookUrl 로 **프로덕션 웹훅**을
//   붙인다. 로컬 측정이 가짜 projectId 로 프로덕션을 부르게 된다(계획서 「스펙과 다르게
//   가는 곳」 3). 모양(접수 → 접수증 → 수거)은 그 함수와 같게 둔다.
import { profileFor, fitDurationFor } from "../clip-limits.js";
import { toDataUri } from "../refs-io.js";
import { H3_R2V } from "./plan.js";

export function h3Body({ prompt, seconds, aspect, resolution, refs, seed }) {
  return {
    prompt,
    duration: fitDurationFor(profileFor(H3_R2V), Number(seconds) || 0),
    aspect_ratio: aspect,
    resolution,
    reference_image_urls: (refs || []).map((r) => (r.url ? r.url : toDataUri(r.bytes, r.key))),
    ...(seed ? { seed } : {}),
  };
}

export async function submitH3(body, { key, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://queue.fal.run/${H3_R2V}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`H3 접수 실패 (${res.status}) ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const j = await res.json();
  if (!j?.status_url || !j?.response_url) throw new Error("H3 접수 응답에 status_url/response_url 이 없어요");
  return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
}

export async function collectH3(job, { key, fetchImpl = fetch }) {
  const headers = { Authorization: `Key ${key}` };
  const st = await fetchImpl(job.statusUrl, { headers });
  if (!st.ok) throw new Error(`H3 상태 조회 실패 (${st.status})`);
  const s = await st.json();
  if (s?.status !== "COMPLETED") return { done: false, status: s?.status || "?" };
  const r = await fetchImpl(job.responseUrl, { headers });
  if (!r.ok) throw new Error(`H3 생성 실패 (${r.status}) ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const d = await r.json();
  const url = d?.video?.url;
  if (!url) throw new Error("H3 결과가 비었어요");
  return { done: true, url };
}

export async function waitH3(job, {
  key, fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now, intervalMs = 10000, timeoutMs = 30 * 60 * 1000, onTick,
} = {}) {
  const t0 = now();
  for (;;) {
    const out = await collectH3(job, { key, fetchImpl });
    if (out.done) return out.url;
    const took = now() - t0;
    onTick?.(out.status, took);
    if (took > timeoutMs) {
      throw new Error(`H3 가 ${Math.round(timeoutMs / 60000)}분 안에 안 끝났어요 — 접수증은 run.json 에 있으니 다시 돌리면 이어서 기다려요`);
    }
    await sleep(intervalMs);
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-h3.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/h3.js tests/longform-h3.test.js
git commit -m "feat(longform): H3 큐 — 접수증을 먼저 들고 기다린다(동기 호출은 300초에 끊긴다)"
```

---

### Task 7: 단계 관문 · 고정 블록 잠금 · 값 어림

**Files:**
- Create: `lib/longform/run-state.js`
- Test: `tests/longform-run-state.test.js`

**Interfaces:**
- Consumes: `adModel("minimax-h3").perSecUsd` (`lib/ad/models.js`)
- Produces:
  - `STAGES = ["plan", "seg1", "seg2", "join"]` · `PAID = Set(["plan", "seg1", "seg2"])`
  - `SCENARIO_USD = 0.40` · `SHEET_USD = 0.83`
  - `h3SecondUsd(resolution) → number` (모르는 화질이면 던진다)
  - `stageCostUsd(stage, { resolution, seconds = 0, extraRefUsd = 0 }) → number`
  - `gate(state, stage, { yes }) → { ok: true, resume?: true } | { ok: false, reason }`
  - `checkBibleLock(state, bible) → { ok: true } | { ok: false, reason }`
- `state` 모양: `{ runId, input, settings, photos, scenario, bible, segments: [{ seg, sheet?, prompt?, bible?, job?, video?, … }, …] }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/longform-run-state.test.js`:

```js
// 단계 관문 — 돈이 나가는 자리를 코드가 지킨다(CLAUDE.md: 유료 생성은 승인 먼저).
import { describe, it, expect } from "vitest";
import { gate, checkBibleLock, stageCostUsd, h3SecondUsd, SCENARIO_USD, SHEET_USD } from "../lib/longform/run-state.js";

const planned = { scenario: { shots: [] }, segments: [{ seg: 1 }, { seg: 2 }] };

describe("관문 — 순서", () => {
  it("plan 전에는 굽지 못한다", () => {
    expect(gate({}, "seg1", { yes: true })).toEqual({ ok: false, reason: expect.stringMatching(/plan 을 먼저/) });
  });

  it("★ 구간 1 없이 구간 2 를 못 굽는다 — 확인 ① 을 건너뛰지 않는다", () => {
    expect(gate(planned, "seg2", { yes: true }).reason).toMatch(/확인 ①/);
  });

  it("두 구간이 다 있어야 잇는다", () => {
    expect(gate(planned, "join", {}).ok).toBe(false);
  });

  it("모르는 단계", () => expect(gate(planned, "seg3", {}).ok).toBe(false));
});

describe("관문 — 돈", () => {
  it("★★★ 유료 단계는 --yes 없이 안 돈다", () => {
    expect(gate(planned, "seg1", {}).reason).toMatch(/--yes/);
    expect(gate({}, "plan", {}).reason).toMatch(/--yes/);
  });

  it("--yes 면 돈다", () => expect(gate(planned, "seg1", { yes: true })).toEqual({ ok: true }));

  it("★★★ 접수만 되고 결과가 없으면 --yes 없이 **이어 기다린다** — 새 돈이 안 나간다", () => {
    const s = { ...planned, segments: [{ seg: 1, job: { statusUrl: "S" } }, { seg: 2 }] };
    expect(gate(s, "seg1", {})).toEqual({ ok: true, resume: true });
  });

  it("★ 이미 구운 구간은 다시 굽지 않는다 — 다시 누르면 값이 두 번 나간다", () => {
    const s = { ...planned, segments: [{ seg: 1, job: {}, video: "seg1.mp4" }, { seg: 2 }] };
    expect(gate(s, "seg1", { yes: true }).reason).toMatch(/이미 구웠어요/);
  });

  it("잇기는 0원이라 --yes 가 필요 없다", () => {
    const s = { ...planned, segments: [{ seg: 1, video: "a" }, { seg: 2, video: "b" }] };
    expect(gate(s, "join", {})).toEqual({ ok: true });
  });
});

describe("고정 블록 잠금", () => {
  it("구간 1 을 굽기 전에는 잠기지 않는다", () => {
    expect(checkBibleLock(planned, "아무거나")).toEqual({ ok: true });
  });

  it("같은 블록이면 통과", () => {
    const s = { segments: [{ bible: "B" }, {}] };
    expect(checkBibleLock(s, "B")).toEqual({ ok: true });
  });

  it("★★★ 한 글자라도 다르면 막고, 무엇만 고칠 수 있는지 말한다", () => {
    const s = { segments: [{ bible: "B" }, {}] };
    const out = checkBibleLock(s, "B ");
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/구간 2 의 본문과 대사만/);
  });
});

describe("값 어림", () => {
  it("H3 초당 값은 모델 표에서 읽는다", () => {
    expect(h3SecondUsd("768P")).toBe(0.06);
    expect(h3SecondUsd("2K")).toBe(0.13);
    expect(() => h3SecondUsd("720p")).toThrow(/모르는 화질/);
  });

  it("plan 은 시나리오 한 번", () => expect(stageCostUsd("plan", {})).toBe(SCENARIO_USD));

  it("구간은 판 + 영상 + 참조 추가분", () => {
    expect(stageCostUsd("seg1", { resolution: "768P", seconds: 14, extraRefUsd: 0.16 }))
      .toBeCloseTo(SHEET_USD + 0.06 * 14 + 0.16, 6);
  });

  it("잇기는 0원", () => expect(stageCostUsd("join", {})).toBe(0));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/longform-run-state.test.js`
Expected: FAIL — `Cannot find module '../lib/longform/run-state.js'`

- [ ] **Step 3: 구현한다**

`lib/longform/run-state.js`:

```js
// 롱폼 30초 시험의 단계 관문 — **돈이 나가는 자리를 코드가 지킨다.**
//
// ★★★ 순서: plan → seg1 → (확인 ①) → seg2 → (확인 ②) → join. seg1 과 seg2 는 **따로**
//   승인한다(스펙 결정 10). --yes 가 그 승인이다.
// ★★ 접수만 되고 결과를 못 받은 구간은 --yes 없이 이어 기다린다 — 새 돈이 안 나간다.
//   반대로 이미 구운 구간은 다시 굽지 않는다 — 누르면 값이 두 번 나간다.
// ★★ 고정 블록은 seg1 뒤에 잠긴다 — 두 구간이 다른 설정으로 구워지면 일관성 시험 자체가 무너진다.
import { adModel } from "../ad/models.js";

export const STAGES = ["plan", "seg1", "seg2", "join"];
export const PAID = new Set(["plan", "seg1", "seg2"]);

// 어림값 — 확인 전에 사장님께 보여 주는 숫자다(청구가 아니다).
// 시나리오: 실측 편 1c979787 의 「광고 시나리오」 $0.3969.
export const SCENARIO_USD = 0.40;
// 판 한 장: 같은 편의 이미지값 $0.826(다시 그리기가 섞였을 수 있어 보수적으로 잡는다).
export const SHEET_USD = 0.83;

export function h3SecondUsd(resolution) {
  const v = adModel("minimax-h3").perSecUsd?.[resolution];
  if (!v) throw new Error(`H3 가 모르는 화질이에요: ${resolution}`);
  return v;
}

export function stageCostUsd(stage, { resolution, seconds = 0, extraRefUsd = 0 } = {}) {
  if (stage === "plan") return SCENARIO_USD;
  if (stage === "seg1" || stage === "seg2") return SHEET_USD + h3SecondUsd(resolution) * seconds + extraRefUsd;
  return 0;
}

export function gate(state, stage, { yes = false } = {}) {
  if (!STAGES.includes(stage)) return { ok: false, reason: `모르는 단계예요: ${stage} (plan·seg1·seg2·join)` };
  const seg = state?.segments || [];
  if (stage !== "plan" && !state?.scenario) return { ok: false, reason: "plan 을 먼저 돌려요" };
  if (stage === "seg2" && !seg[0]?.video) {
    return { ok: false, reason: "구간 1 영상이 없어요 — seg1 을 먼저 굽고, 확인 ① 을 거쳐요" };
  }
  if (stage === "join" && !(seg[0]?.video && seg[1]?.video)) return { ok: false, reason: "두 구간이 다 있어야 이어 붙여요" };

  const i = stage === "seg1" ? 0 : stage === "seg2" ? 1 : -1;
  if (i >= 0 && seg[i]?.video) {
    return { ok: false, reason: `구간 ${i + 1} 은 이미 구웠어요(${seg[i].video}) — 다시 구우려면 run.json 에서 그 구간의 job·video 를 지워요` };
  }
  if (i >= 0 && seg[i]?.job) return { ok: true, resume: true };
  if (PAID.has(stage) && !yes) return { ok: false, reason: "유료 단계예요 — 위 어림값을 확인하고 --yes 를 붙여 다시 돌려요" };
  return { ok: true };
}

export function checkBibleLock(state, bible) {
  const used = state?.segments?.[0]?.bible;
  if (!used || used === bible) return { ok: true };
  return {
    ok: false,
    reason: "고정 블록이 구간 1 을 구운 뒤 바뀌었어요 — 확인 ① 뒤에는 구간 2 의 본문과 대사만 고칠 수 있어요. 인물·무대·의상·목소리를 바꿔야 하면 구간 1 부터 다시 구워요",
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/longform-run-state.test.js`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add lib/longform/run-state.js tests/longform-run-state.test.js
git commit -m "feat(longform): 단계 관문 — --yes·이어 기다리기·다시 굽기 막기·고정 블록 잠금"
```

---

### Task 8: 측정 스크립트 — 네 단계를 잇는다

**Files:**
- Create: `scripts/measure/longform-2seg.mjs`
- Create: `scripts/measure/longform-2seg.example.json`

**Interfaces:**
- Consumes: Task 1~7 전부 · `runWithActor` (`lib/actor.js`) · `fakeFal`, `fakeLlm` (`lib/fake.js`) · `describePhoto({ photoBytes, photoKey, projectId })` (`lib/vlm.js`) · `hasFaceRisk` (`lib/photos.js`) · `generateImage({ prompt, aspect_ratio, projectId, resolution, refs, imageSize }) → { url }`, `imageResolutionFor(project)` (`lib/imagegen.js`) · `resolutionForProject`, `seedForProject` (`lib/clip-limits.js`) · `storyboardGridFor(count, { resolution, aspect })`, `storyboardImageSize(grid, aspect, resolution)`, `buildStoryboardPrompt(project, cuts, grid, note, refs)` (`lib/reel/storyboard.js`) · `buildReelCuts(scenario)` (`app/api/reel/[id]/scenario/route.js` — 측정 스크립트용으로 export 돼 있다)
- Produces: `data/longform/<run>/` 에 `run.json` · `seg1.prompt.txt` · `seg2.prompt.txt` · `seg1.mp4` · `anchor.jpg` · `last.jpg` · `seg2.mp4` · `longform-30s.mp4`

- [ ] **Step 1: 입력 예시를 쓴다**

`scripts/measure/longform-2seg.example.json`:

```json
{
  "text": "동네 작은 빵집. 새벽에 빵을 굽는 30대 여자 제빵사와 늦게 출근한 20대 남자 견습생이 짧게 말을 주고받고, 함께 반죽을 시작한다.",
  "photos": [],
  "style": "photo",
  "mood": "warm",
  "aspect": "9:16",
  "resolution": "768P"
}
```

(`photos` 는 `[{ "path": "C:/…/logo.png", "role": "logo" }]` 모양이다. `role` 은 `logo`·`product`·`person`.)

- [ ] **Step 2: 스크립트를 쓴다**

`scripts/measure/longform-2seg.mjs`:

```js
// 롱폼 1단계 — 15초 두 구간을 **구간 1 → 확인 ① → 구간 2 → 확인 ②** 로 굽고 잇는다.
//   (스펙 docs/superpowers/specs/2026-09-30-longform-design.md · 계획 …/plans/2026-09-30-longform-30s-probe.md)
//
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs plan <작업폴더> --input <입력.json> [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg1 <작업폴더> [--yes]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg2 <작업폴더> [--yes] [--anchor-at 7]
//   node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs join <작업폴더>
//
// ★★★ 유료 단계(plan·seg1·seg2)는 --yes 없이 안 돈다. 먼저 --yes 없이 돌려 어림값을 보고,
//   사장님 승인을 받은 뒤 --yes 를 붙인다. seg1 과 seg2 는 **따로** 승인한다.
// ★★ SHOTFORM_FAKE=all 이면 네 단계가 0원으로 관통한다(--yes 가 필요 없다) — 배선을 먼저 본다.
// ★ 확인 ① 사이에 run.json 의 구간 2 샷(shows·line 등)을 고칠 수 있다. 인물·무대·의상·
//   목소리를 고치면 seg2 가 거부한다(고정 블록 잠금).
// ★ 측정이 낸 값은 운영자 지출이다 — SHOTFORM_MEASURE_USER(크레딧 가진 uuid)로 돈다. 비우면
//   "admin" 이고, admin 은 체험 한도($0.5)에 막힐 수 있다(CLAUDE.md 크레딧 절).
// ⚠️ H3 영상은 원장(cost_records)에 안 남는다 — fal 을 직접 부른다(기존 측정 스크립트와 같다).
//   시나리오·사진 판정·판 그림은 lib 을 거치므로 남는다. 대조할 때 이 차이를 안다.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

// env 를 세운 뒤에 lib 을 부른다 — 모듈이 import 시점에 env 를 읽을 수 있다.
const { runWithActor } = await import("../../lib/actor.js");
const { fakeFal, fakeLlm } = await import("../../lib/fake.js");
const { describePhoto } = await import("../../lib/vlm.js");
const { hasFaceRisk } = await import("../../lib/photos.js");
const { generateImage, imageResolutionFor } = await import("../../lib/imagegen.js");
const { resolutionForProject, seedForProject } = await import("../../lib/clip-limits.js");
const { storyboardGridFor, storyboardImageSize, buildStoryboardPrompt } = await import("../../lib/reel/storyboard.js");
const { buildReelCuts } = await import("../../app/api/reel/[id]/scenario/route.js");
const { generateLongformScenario } = await import("../../lib/longform/scenario.js");
const { buildBible, segmentCharacters } = await import("../../lib/longform/bible.js");
const { buildSegmentPrompt, segmentShots, segmentSeconds } = await import("../../lib/longform/segment-prompt.js");
const { segmentRefs } = await import("../../lib/longform/refs.js");
const { frameAtArgs, lastFrameArgs, concatList, joinArgs, runFfmpeg } = await import("../../lib/longform/ffmpeg.js");
const { h3Body, submitH3, waitH3 } = await import("../../lib/longform/h3.js");
const { gate, checkBibleLock, stageCostUsd } = await import("../../lib/longform/run-state.js");

const [stage, runDir, ...rest] = process.argv.slice(2);
if (!stage || !runDir) {
  console.error("사용법: longform-2seg.mjs <plan|seg1|seg2|join> <작업폴더> [--input 입력.json] [--yes] [--anchor-at 초]");
  process.exit(1);
}
const flag = (n) => rest.includes(n);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const die = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

mkdirSync(runDir, { recursive: true });
const statePath = path.join(runDir, "run.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const free = fakeFal() && fakeLlm();
if (!free && stage !== "join" && !process.env.FAL_KEY) die("FAL_KEY 가 없어요(.env.local)");

// 스크립트 안에서 쓰는 프로젝트 모양 — lib 들이 읽는 칸만 채운다. 저장하지 않는다.
function projectOf() {
  return {
    id: state.runId,
    settings: { ...state.settings, i2v_model: "minimax-h3" },
    material: { text: state.input?.text || "", photos: state.photos || [] },
    scenario: state.scenario,
    cast: (state.scenario?.characters || []).map((c) => ({ id: c.key, who: c.who, look: c.look, voice: c.voice, cuts: [] })),
  };
}

function photosWithBytes() {
  return (state.photos || []).map((p) => ({ ...p, bytes: readFileSync(p.path) }));
}

function printDropped(dropped) {
  for (const d of dropped) {
    const why = d.reason === "face" ? "사람 얼굴이 있어 참조로 안 보낸다(초상 정책)" : "참조 자리(9장)가 모자라 뺐다";
    console.log(`   ⚠ 빠짐 — ${d.kind}${d.id ? ` ${d.id}` : ""}: ${why}`);
  }
}

async function download(url, out) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`영상을 못 받았어요 (${r.status}) ${url}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

async function runPlan() {
  const inputPath = opt("--input");
  if (!inputPath) die("plan 은 --input 입력.json 이 필요해요(scripts/measure/longform-2seg.example.json 참고)");
  state.runId ||= randomUUID();
  state.input = JSON.parse(readFileSync(inputPath, "utf8"));
  state.settings = {
    aspect_ratio: state.input.aspect || "9:16",
    style: state.input.style || "photo",
    mood: state.input.mood || "premium",
    narration_lang: "ko",
    seconds: 30,
    target_seconds: 30,
    resolution: state.input.resolution || "768P",
  };
  state.photos = [];
  for (const [i, ph] of (state.input.photos || []).entries()) {
    const bytes = readFileSync(ph.path);
    const key = path.basename(ph.path);
    const vision = await describePhoto({ photoBytes: bytes, photoKey: key, projectId: state.runId });
    const judged = vision.person || vision.what || vision.lettering;
    state.photos.push({ id: `p${i + 1}`, path: ph.path, key, role: ph.role, ...(judged ? { vision } : {}) });
  }
  state.scenario = await generateLongformScenario({ project: projectOf(), segmentCount: 2 });
  state.bible = buildBible(state.scenario, { style: state.settings.style });
  state.segments = [{ seg: 1 }, { seg: 2 }];
  save();

  // ⏸ 멈춤 0 — 굽기 전에 두 구간의 지문 전문을 보여 준다(0원).
  const photos = photosWithBytes();
  for (const seg of [1, 2]) {
    const anchor = seg === 2 ? { keys: segmentCharacters(state.scenario, 1) } : null;
    const last = seg === 2 ? {} : null;
    const { refs, dropped, extraUsd } = segmentRefs({ sheet: {}, photos, anchor, last });
    const prompt = buildSegmentPrompt({ scenario: state.scenario, seg, bible: state.bible, refs });
    writeFileSync(path.join(runDir, `seg${seg}.prompt.txt`), prompt);
    const seconds = segmentSeconds(state.scenario, seg);
    console.log(`\n구간 ${seg} — ${seconds}초 · 참조 ${refs.length}장(${refs.map((r) => r.kind).join(", ")}) · 추가 참조값 $${extraUsd.toFixed(2)}`);
    console.log(`   출연: ${segmentCharacters(state.scenario, seg).join(", ") || "(없음)"}`);
    console.log(`   지문: ${path.join(runDir, `seg${seg}.prompt.txt`)}`);
    printDropped(dropped);
    console.log(`   어림: $${stageCostUsd(`seg${seg}`, { resolution: state.settings.resolution, seconds, extraRefUsd: extraUsd }).toFixed(2)}`);
  }
  console.log(`\n고정 블록:\n${state.bible}`);
  console.log(`\n⏸ 멈춤 0 — 두 지문을 읽고, 괜찮으면 seg1 을 돌려요(먼저 --yes 없이 → 어림값 확인 → 승인 → --yes).`);
}

async function runSegment(seg) {
  const s = state.segments[seg - 1];
  const scn = state.scenario;
  const bible = buildBible(scn, { style: state.settings.style });
  if (seg === 2) {
    const lock = checkBibleLock(state, bible);
    if (!lock.ok) die(lock.reason);
  }

  if (!s.job) {
    const project = projectOf();
    const photos = photosWithBytes();

    // 판 — 단계별과 같은 지문·같은 크기 규칙을 쓴다. 칸을 잘라 버킷에 올리는 일은 안 한다
    //   (drawStoryboardSheet 의 뒤 절반) — H3 에는 판 한 장의 주소만 있으면 된다.
    const cuts = buildReelCuts({ ...scn, shots: segmentShots(scn, seg) });
    const grid = storyboardGridFor(cuts.length, { resolution: state.settings.resolution, aspect: state.settings.aspect_ratio });
    const boardRefs = photos.filter((p) => !hasFaceRisk(p)).map((p) => ({ bytes: p.bytes, key: p.key, photo_id: p.id, kind: "thing" }));
    const sheet = await generateImage({
      prompt: buildStoryboardPrompt(project, cuts, grid, "", boardRefs),
      aspect_ratio: grid.canvas,
      projectId: state.runId,
      resolution: imageResolutionFor(project),
      refs: boardRefs,
      imageSize: storyboardImageSize(grid, state.settings.aspect_ratio, resolutionForProject(project)),
    });
    s.sheet = sheet.url;

    // 닻 — 구간 2 만. 기본은 구간 1 의 가운데. 확인 ① 에서 "출연자 전원이 보이는" 초를 골라 --anchor-at 으로 준다.
    let anchor = null;
    let last = null;
    if (seg === 2) {
      const prev = path.join(runDir, "seg1.mp4");
      const at = Number(opt("--anchor-at") ?? segmentSeconds(scn, 1) / 2);
      const aPath = path.join(runDir, "anchor.jpg");
      const lPath = path.join(runDir, "last.jpg");
      await runFfmpeg(frameAtArgs({ input: prev, at, out: aPath }));
      await runFfmpeg(lastFrameArgs({ input: prev, out: lPath }));
      anchor = { bytes: readFileSync(aPath), key: "anchor.jpg", keys: segmentCharacters(scn, 1) };
      last = { bytes: readFileSync(lPath), key: "last.jpg" };
      s.anchorAt = at;
    }

    const { refs, dropped, extraUsd } = segmentRefs({ sheet: { url: s.sheet }, photos, anchor, last });
    const prompt = buildSegmentPrompt({ scenario: scn, seg, bible, refs });
    writeFileSync(path.join(runDir, `seg${seg}.prompt.txt`), prompt);
    printDropped(dropped);
    const seconds = segmentSeconds(scn, seg);
    const body = h3Body({
      prompt, seconds,
      aspect: state.settings.aspect_ratio,
      resolution: state.settings.resolution,
      refs,
      seed: seedForProject({ settings: { i2v_model: "minimax-h3" } }, state.runId),
    });
    Object.assign(s, { bible, prompt, seconds, dropped, extraUsd, refCount: refs.length });

    // ★★★ 접수증을 **기다리기 전에** 적는다 — 끊겨도 다시 돌리면 재접수 없이 이어 기다린다.
    s.job = free ? { fake: true } : await submitH3(body, { key: process.env.FAL_KEY });
    save();
    console.log(`구간 ${seg} 접수 — ${s.job.requestId || "(가짜)"} · ${seconds}초 · ${state.settings.resolution}`);
  } else {
    console.log(`구간 ${seg} — 이미 접수된 것(${s.job.requestId || "가짜"})을 이어서 기다린다. 새 돈이 안 나간다.`);
  }

  const out = path.join(runDir, `seg${seg}.mp4`);
  if (s.job.fake) {
    copyFileSync(path.join("public", "samples", "reel-15s.mp4"), out);
  } else {
    const url = await waitH3(s.job, {
      key: process.env.FAL_KEY,
      onTick: (st, ms) => console.log(`   … ${st} · ${Math.round(ms / 1000)}초`),
    });
    await download(url, out);
    s.videoUrl = url;
  }
  s.video = out;
  save();
  console.log(`구간 ${seg} 끝 — ${out}`);
  if (seg === 1) {
    console.log("\n⏸ 확인 ① — 구간 1 만 본다: ① 한국어로 말하나 ② 대사를 글자 그대로 말하나 ③ 한 장면에서 여러 인물이 대화하나.");
    console.log("   막히면 여기서 멈춘다. 통과하면 run.json 의 구간 2 샷만 손보고(선택), 출연자 전원이 보이는 초를 골라 seg2 --anchor-at <초>.");
  } else {
    console.log("\n다음: join (0원)");
  }
}

async function runJoin() {
  const list = path.join(runDir, "concat.txt");
  writeFileSync(list, concatList([path.resolve(runDir, "seg1.mp4"), path.resolve(runDir, "seg2.mp4")]));
  const out = path.join(runDir, "longform-30s.mp4");
  await runFfmpeg(joinArgs({ list, out }));
  console.log(`이어 붙였다 — ${out}`);
  console.log("\n⏸ 확인 ② — 30초를 보고 듣는다: 인물 유지 · 목소리 유지 · 이음새 · 이야기가 한 편인가.");
}

// ── 관문 ────────────────────────────────────────────────────────────────
if (stage === "seg1" || stage === "seg2") {
  const seg = stage === "seg1" ? 1 : 2;
  if (state.scenario) {
    const est = stageCostUsd(stage, { resolution: state.settings.resolution, seconds: segmentSeconds(state.scenario, seg) });
    console.log(`어림 — 구간 ${seg}: 약 $${est.toFixed(2)} (판 + H3 ${state.settings.resolution} · 참조 추가분은 굽기 직전에 다시 말한다)`);
  }
} else if (stage === "plan") {
  console.log(`어림 — plan: 약 $${stageCostUsd("plan").toFixed(2)} (시나리오 한 번 + 사진 판정 장당 ~$0.003)`);
}
const g = gate(state, stage, { yes: flag("--yes") || free });
if (!g.ok) die(g.reason);

await runWithActor(process.env.SHOTFORM_MEASURE_USER || "admin", async () => {
  if (stage === "plan") await runPlan();
  else if (stage === "seg1") await runSegment(1);
  else if (stage === "seg2") await runSegment(2);
  else if (stage === "join") await runJoin();
});
```

- [ ] **Step 3: 0원 관통으로 배선을 확인한다**

먼저 가짜 영상이 있는지 본다:

Run: `ls public/samples/reel-15s.mp4`
Expected: 파일이 있다(`lib/i2v.js` 의 가짜 모드가 주는 그 영상)

네 단계를 가짜 모드로 돌린다(PowerShell 이면 `$env:SHOTFORM_FAKE="all"` 을 먼저):

```bash
SHOTFORM_FAKE=all node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs plan data/longform/dry --input scripts/measure/longform-2seg.example.json
SHOTFORM_FAKE=all node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg1 data/longform/dry
SHOTFORM_FAKE=all node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg2 data/longform/dry --anchor-at 5
SHOTFORM_FAKE=all node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs join data/longform/dry
```

Expected:
- `plan` — 구간 1·2 가 각각 14초·15초, 출연 `A, B`, `seg1.prompt.txt`·`seg2.prompt.txt` 생성, 고정 블록 출력
- `seg1` — `구간 1 끝 — data/longform/dry/seg1.mp4` 와 확인 ① 안내
- `seg2` — `anchor.jpg`·`last.jpg` 생성 · `seg2.prompt.txt` 에 `Image 3 is a still from the previous part showing A, B` 와 `Image 4 is the last frame` 이 있다
- `join` — `data/longform/dry/longform-30s.mp4` 생성

그리고 관문이 막는지 본다:

```bash
node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg1 data/longform/dry
```

Expected: `✖ 구간 1 은 이미 구웠어요` (다시 굽지 않는다)

`data/longform/dry/run.json` 에서 `scenario.environment` 를 한 글자 바꾸고, `segments[1]` 의 `job`·`video` 를 지운 뒤:

```bash
SHOTFORM_FAKE=all node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs seg2 data/longform/dry
```

Expected: `✖ 고정 블록이 구간 1 을 구운 뒤 바뀌었어요 …`

- [ ] **Step 4: 전체 테스트를 돌린다**

Run: `npx vitest run --dir ./tests`
Expected: PASS — 이전 6,847 + 이 계획의 새 테스트 7파일. 실패가 있으면 이름을 적어 보고한다(이 계획이 만든 것이 아니어도)

- [ ] **Step 5: 커밋한다**

```bash
git add scripts/measure/longform-2seg.mjs scripts/measure/longform-2seg.example.json
git commit -m "feat(longform): 30초 관통 측정 스크립트 — plan·seg1·seg2·join, 0원 관통 확인"
```

---

## 이 계획이 끝난 뒤 (구현 범위 밖 — 사장님 승인이 필요한 것)

1. **진짜로 돌린다** — 승인 셋을 따로 받는다: `plan`(≈$0.40) → 멈춤 0 → `seg1`(768p ≈$1.7) → **확인 ①** → `seg2`(≈$1.8) → `join`(0원) → **확인 ②**
2. 확인 ①·② 결과를 스펙의 「실측해야 하는 것」에 적는다 — 되면 ①(H3 직접 말하기) 확정, 목소리가 흔들리면 다음 계획이 참조 오디오 또는 ②(소리 떼기 + TTS + 립싱크)를 다룬다
3. **구간 2 가 초상으로 거절되면**(`H3 접수 실패 (422)` · 참조 속 실사 얼굴 — 닻) 스펙 「축 1」대로 닻에 판과 같은 격자(불투명도 0.45 · `lib/reel/face-grid.js` 의 `gridFacesOnPhoto`)를 씌우는 것이 다음 계획이다. H3 의 초상 정책은 모르므로 이 계획은 미리 씌우지 않는다 — 거절은 0원이고, 격자는 닻이 지키려는 얼굴을 덮는다
4. 화면(`/longform/*`)·만들기 라우트·구간 상태 관리는 이 결과를 본 뒤 설계한다
