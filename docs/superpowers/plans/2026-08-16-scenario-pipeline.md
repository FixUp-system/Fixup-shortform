# 시나리오 파이프라인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 만들고 싶은 영상을 설명 한 덩어리로 주면, LLM이 영화 같은 전체 틀(시나리오)을 짜고, 사장님이 그것을 고친 뒤, 그 틀에서 컷·이미지·영상이 나오게 한다.

**Architecture:** 시나리오가 원고를 대신해 **컷의 원본**이 된다. LLM을 세 번 부른다 — ①시나리오(틀·대사·초·화자) → ②화면 설계(shows·움직임 축·속도) → ③캐스팅. 시나리오와 화면 설계를 가르는 이유는 화면 설계에 붙은 재시도 판정 셋(`shotBalance`·`speedContrast`·`motionVariety`)이 컷 전체를 놓고 봐야 하고, 흡수시키면 재시도가 사장님이 고친 시나리오를 다시 쓰기 때문이다. 시나리오의 shot 하나가 컷 하나이고, 옮기는 것은 코드가 한다.

**Tech Stack:** Next.js 15 (App Router) · 순수 JavaScript (타입체커·린터 없음) · vitest · OpenAI gpt-4o (`lib/llm.js`) · fal.ai

**Spec:** `docs/superpowers/specs/2026-08-16-scenario-pipeline-design.md`

## Global Constraints

- **판정하는 것은 테스트뿐이다.** 린터·타입체커가 없다. `npx vitest run` 이 그린인지가 유일한 관문이다.
- **화면(`"use client"`)이 import 하는 모듈은 `fs`를 끌면 안 된다.** 이 계획이 만드는 `lib/scenario-rules.js` 는 화면이 읽으므로 **import 문을 `lib/clip-limits.js`·`lib/cuts.js` 로만 제한**한다(둘 다 사슬 끝에 `fs`가 없다). `lib/scenario.js`(LLM 호출)는 서버 전용이고 화면이 import 하지 않는다.
- **화면 파일을 손댔으면 한 번 굽는다:** `SHOTFORM_DIST_DIR=.next-verify npx next build`. 소스 문자열 검사 테스트는 문법이 깨진 파일을 못 잡는다.
- **`git add -A` 금지.** 파일을 하나씩 지정해 add 한다.
- **유료 fal·이미지 생성 호출 금지.** 이 계획의 모든 테스트는 LLM을 주입(`callJson` mock)하거나 순수 함수를 잰다.
- **테스트 자료는 프롬프트 예시와 소재도 동사도 겹치지 않게 고른다.** 이 계획의 테스트는 `카페`·`베이커리` 소재를 쓴다(지문 예시는 화장품·스포츠카를 쓴다).
- **변이 실험:** 각 태스크에서 테스트를 만든 뒤 구현을 일부러 망가뜨려 실패를 보고 복원한다. 그 결과를 보고에 적는다.
- **컷 필드 이름은 기존 그대로다:** `idx`(0-based) · `sentence` · `seconds` · `spoken_seconds` · `silent`.
- **단계 수는 여섯 그대로다.** ②대본이 ②시나리오로 바뀔 뿐이고 ③목소리 이하는 손대지 않는다.
- **크레딧은 범위 밖이다.** 유료 입구 넷이 같은 `requireVideoCharge()` 를 쓰므로 정가는 저절로 ④이미지로 옮겨간다. 이 계획에서 `lib/charges.js`·`lib/pricing.js` 를 건드리지 않는다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/scenario-rules.js` (신설) | 시나리오가 지켜야 할 규칙 판정. **순수**. 화면·라우트·생성이 같은 함수를 본다 |
| `lib/scenario.js` (신설) | 시나리오 지문 · 메시지 조립 · 모양 검증 · 생성(재시도 1회). 서버 전용 |
| `app/api/projects/[id]/scenario/route.js` (신설) | POST 생성 · PATCH 수정 · POST(confirm) 확정 |
| `app/create/[id]/scenario/page.js` (신설) | 검토·수정 화면 |
| `lib/cuts.js` (수정) | `shotsToCuts` 추가 · `buildShowsMessages` 가 `beat`·`angle` 을 싣는다 |
| `lib/pipeline.js` (수정) | `splitCuts` 가 원고 대신 시나리오를 읽는다 · 캐스팅이 `speaker` 를 받는다 |
| `lib/cast.js` (수정) | `buildCastMessages` 가 `speaker` 를 받는다 |
| `lib/steps.js` (수정) | `STEPS` 의 ②대본 → ②시나리오 · 게이트가 `scenario.confirmed` 를 본다 |
| `app/create/[id]/briefing/page.js` (수정) | 되묻기 폐지 |

---

### Task 1: 시나리오 규칙 판정 (순수 모듈)

초를 사장님에게 열려면 이 판정이 **먼저** 있어야 한다. 광고 쪽(`lib/ad/scenario.js`)이 초를 일부러 안 열어 둔 이유가 주석에 있다 — *"합이 전체 길이와 같아야 한다는 규칙이 SYSTEM 에만 있고 코드 검증이 없어서, 열면 합이 깨진 채로 흘러간다."*

**Files:**
- Create: `lib/scenario-rules.js`
- Test: `tests/scenario-rules.test.js`

**Interfaces:**
- Consumes: `minSecondsFor`·`clipProfileForProject` (`lib/clip-limits.js`) · `CONTENT_MAX_SECONDS` (`lib/cuts.js`)
- Produces:
  - `scenarioSeconds(scenario) -> number` — shot 초의 합
  - `checkScenario(scenario, project) -> { ok: boolean, problems: string[] }` — problems 는 **사장님이 읽는 한국어 문장**이자 **모델이 읽는 재시도 사유**다(한 벌이다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario-rules.test.js
import { describe, it, expect } from "vitest";
import { scenarioSeconds, checkScenario } from "../lib/scenario-rules.js";

// Seedance(하한 4초) 30초 프로젝트. 소재는 베이커리 — 지문 예시와 안 겹친다.
const proj = (target = 30) => ({ settings: { i2v_model: "seedance-2.0", target_seconds: target } });
const shot = (seconds, line = "갓 구운 빵 냄새로 하루를 엽니다.", speaker = "30대 여성 사장") =>
  ({ beat: "가게를 연다", line, speaker, seconds });

describe("scenarioSeconds", () => {
  it("shot 초를 더한다", () => {
    expect(scenarioSeconds({ shots: [shot(5), shot(7)] })).toBe(12);
  });
  it("shots 가 없으면 0 이다", () => {
    expect(scenarioSeconds(null)).toBe(0);
    expect(scenarioSeconds({})).toBe(0);
  });
});

describe("checkScenario", () => {
  it("규칙을 다 지키면 통과한다", () => {
    const s = { shots: [shot(8), shot(8), shot(8), shot(6)] };
    expect(checkScenario(s, proj())).toEqual({ ok: true, problems: [] });
  });

  it("★ 초의 합이 목표와 다르면 걸린다", () => {
    const s = { shots: [shot(8), shot(8), shot(8), shot(4)] };
    const got = checkScenario(s, proj());
    expect(got.ok).toBe(false);
    expect(got.problems.join(" ")).toContain("28");
    expect(got.problems.join(" ")).toContain("30");
  });

  // 경계 — 정확히 8초는 통과한다(CONTENT_MAX_SECONDS 는 "초과"가 아니라 상한이다)
  it("★ 컷 하나가 8초를 넘으면 걸린다 — 정확히 8초는 통과", () => {
    expect(checkScenario({ shots: [shot(8), shot(8), shot(8), shot(6)] }, proj()).ok).toBe(true);
    const over = checkScenario({ shots: [shot(9), shot(8), shot(8), shot(5)] }, proj());
    expect(over.ok).toBe(false);
    expect(over.problems.join(" ")).toContain("8초");
  });

  // 경계 — 정확히 하한(Seedance 4)은 통과한다. 넘으면 fal 이 거절한다.
  it("★ 컷 하나가 모델 하한보다 짧으면 걸린다 — 정확히 4초는 통과", () => {
    expect(checkScenario({ shots: [shot(4), shot(8), shot(8), shot(6), shot(4)] }, proj()).ok).toBe(true);
    const under = checkScenario({ shots: [shot(3), shot(8), shot(8), shot(7), shot(4)] }, proj());
    expect(under.ok).toBe(false);
    expect(under.problems.join(" ")).toContain("4초");
  });

  it("★ 컷 개수가 길이÷하한을 넘으면 걸린다 — 15초·Seedance면 3개", () => {
    const three = { shots: [shot(5), shot(5), shot(5)] };
    expect(checkScenario(three, proj(15)).ok).toBe(true);
    const four = { shots: [shot(4), shot(4), shot(4), shot(3)] };
    expect(checkScenario(four, proj(15)).ok).toBe(false);
  });

  it("★ 대사가 있는 컷에 화자가 없으면 걸린다", () => {
    const s = { shots: [shot(8), { ...shot(8), speaker: "  " }, shot(8), shot(6)] };
    const got = checkScenario(s, proj());
    expect(got.ok).toBe(false);
    expect(got.problems.join(" ")).toContain("2번");
  });

  it("대사가 빈 컷은 화자를 요구하지 않는다 — 무음 컷이다", () => {
    const s = { shots: [shot(8), { ...shot(8), line: "", speaker: "" }, shot(8), shot(6)] };
    expect(checkScenario(s, proj()).ok).toBe(true);
  });

  it("★ 컷이 하나도 없으면 걸린다", () => {
    expect(checkScenario({ shots: [] }, proj()).ok).toBe(false);
    expect(checkScenario(null, proj()).ok).toBe(false);
  });

  it("Kling 프로젝트는 하한이 3초다 — 하한을 손으로 적지 않는다", () => {
    const p = { settings: { i2v_model: "kling-v3", target_seconds: 30 } };
    const s = { shots: [shot(3), shot(8), shot(8), shot(8), shot(3)] };
    expect(checkScenario(s, p).ok).toBe(true);
  });

  it("문제가 여럿이면 전부 모은다 — 하나 고치고 또 걸리는 일이 없게", () => {
    const s = { shots: [shot(20)] };
    const got = checkScenario(s, proj());
    expect(got.problems.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-rules.test.js`
Expected: FAIL — `Failed to resolve import "../lib/scenario-rules.js"`

- [ ] **Step 3: 최소 구현을 쓴다**

```js
// lib/scenario-rules.js
// 시나리오가 지켜야 할 규칙 — 화면·라우트·생성이 **같은 함수**를 본다.
//
// ★ 왜 순수 모듈인가: 사장님이 초를 고치는 화면이 "지금 합이 맞는가"를 즉시 보여줘야 하고,
//   라우트가 저장 전에 같은 판정을 해야 한다. 두 벌이면 화면은 통과라는데 저장이 막힌다.
//   그래서 import 를 lib/clip-limits.js(순수)·lib/cuts.js(사슬에 fs 없음)로만 제한한다.
//
// ★ problems 는 한 벌이다 — 사장님이 화면에서 읽는 문장이자, 모델이 재시도 지시로 받는
//   사유다. 두 벌로 두면 화면에는 친절하고 모델에는 쓸모없는 문장이 갈린다.
import { clipProfileForProject, minSecondsFor } from "./clip-limits.js";
import { CONTENT_MAX_SECONDS } from "./cuts.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const text = (v) => (typeof v === "string" ? v.trim() : "");

export function scenarioSeconds(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.reduce((a, s) => a + num(s?.seconds), 0);
}

export function checkScenario(scenario, project) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  const problems = [];

  if (!shots.length) {
    return { ok: false, problems: ["장면이 하나도 없어요 — 최소 한 장면이 필요해요."] };
  }

  const profile = clipProfileForProject(project);
  const min = minSecondsFor(profile);
  const target = num(project?.settings?.target_seconds);

  // 합 — 어긋나면 합성에서 길이가 안 맞는다
  const total = scenarioSeconds(scenario);
  if (target && total !== target) {
    problems.push(`장면 초의 합이 ${total}초예요 — ${target}초에 맞춰 주세요.`);
  }

  // 컷 개수 — 하한이 천장이다. 15초를 4초짜리로 나누면 3개가 최대다.
  if (target) {
    const maxCuts = Math.max(1, Math.floor(target / min));
    if (shots.length > maxCuts) {
      problems.push(`장면이 ${shots.length}개인데 ${target}초에는 ${maxCuts}개까지만 담을 수 있어요.`);
    }
  }

  shots.forEach((s, i) => {
    const at = `${i + 1}번 장면`;
    const secs = num(s?.seconds);
    if (secs > CONTENT_MAX_SECONDS) {
      problems.push(`${at}이 ${secs}초예요 — 그림 한 장은 ${CONTENT_MAX_SECONDS}초까지만 화면에 둘 수 있어요.`);
    }
    if (secs < min) {
      problems.push(`${at}이 ${secs}초예요 — 이 모델은 ${min}초보다 짧은 장면을 만들지 못해요.`);
    }
    // 대사가 있으면 누가 말하는지가 있어야 한다. 없으면 그 대사가 소리로 안 나온다.
    if (text(s?.line) && !text(s?.speaker)) {
      problems.push(`${at}에 대사가 있는데 말하는 사람이 없어요.`);
    }
  });

  return { ok: problems.length === 0, problems };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-rules.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: 변이 실험 — 그물이 무는지 확인한다**

셋을 하나씩 망가뜨리고 **실패를 눈으로 본 뒤 복원**한다:
1. `if (secs > CONTENT_MAX_SECONDS)` → `if (secs > 99)` → "8초를 넘으면" 테스트가 실패해야 한다
2. `if (secs < min)` → `if (secs < 0)` → "모델 하한" 테스트가 실패해야 한다
3. `total !== target` → `false` → "합이 목표와 다르면" 테스트가 실패해야 한다

복원은 `git checkout` 이 아니라 **되돌려 쓰기**로 한다(이 저장소에서 `git checkout <file>` 로 진행 중 작업을 두 번 날렸다).

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
npx vitest run
git add lib/scenario-rules.js tests/scenario-rules.test.js
git commit -m "feat(scenario): 시나리오가 지켜야 할 규칙을 코드가 판정한다"
```

---

### Task 2: 시나리오 지문과 모양 검증

**Files:**
- Create: `lib/scenario.js`
- Test: `tests/scenario.test.js`

**Interfaces:**
- Consumes: `checkScenario` (Task 1)
- Produces:
  - `buildScenarioMessages(project) -> { system: string, messages: [{role, content}] }`
  - `validateScenario(obj) -> scenario | null` — **모양만** 본다(규칙은 `checkScenario`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario.test.js
import { describe, it, expect } from "vitest";
import { buildScenarioMessages, validateScenario } from "../lib/scenario.js";

const project = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  settings: { i2v_model: "seedance-2.0", target_seconds: 30, aspect_ratio: "9:16" },
  material: { text: "동네 베이커리를 소개하는 영상을 만들고 싶어요. 새벽 4시부터 굽습니다.", photos: [] },
};

describe("buildScenarioMessages", () => {
  it("사장님 설명을 그대로 싣는다", () => {
    const m = buildScenarioMessages(project);
    expect(m.messages[0].content).toContain("새벽 4시부터 굽습니다");
  });

  it("★ 길이·화면비·모델 하한을 사실로 알려 준다", () => {
    const m = buildScenarioMessages(project);
    const all = m.system + m.messages[0].content;
    expect(all).toContain("30");      // 목표 길이
    expect(all).toContain("9:16");    // 화면비
    expect(all).toContain("하한 4초"); // Seedance 하한
  });

  // ★ 광고 지문은 "컷 편집을 지시하지 마라"였다. 여기서는 정확히 뒤집힌다.
  it("★ 장면을 나누라고 요구한다 — 광고 지문과 반대다", () => {
    const m = buildScenarioMessages(project);
    expect(m.system).toMatch(/장면.*나눈다|장면으로 나눈/);
    expect(m.system).not.toContain("컷 편집을 지시하지 마라");
  });

  it("★ 되묻지 말라고 못박는다", () => {
    expect(buildScenarioMessages(project).system).toContain("되묻지");
  });

  it("★ 글자를 화면에 넣으라고 요구하지 말라고 못박는다", () => {
    expect(buildScenarioMessages(project).system).toContain("글자");
  });

  // 화면 설계가 2패스에서 답한다 — 시나리오가 미리 답하면 두 벌이 된다
  it("★ 카메라·조명을 시나리오에서 묻지 않는다", () => {
    const s = buildScenarioMessages(project).system;
    expect(s).not.toContain('"camera"');
    expect(s).not.toContain('"lighting"');
  });
});

describe("validateScenario — 모양만 본다", () => {
  const good = {
    topic: "동네 베이커리 소개",
    focus: { mode: "물건", subject: "갓 구운 식빵", look: "황금빛 겉면" },
    angle: "새벽의 노동을 보여 주고 끝에 갓 나온 빵으로 마무리한다",
    shots: [
      { beat: "새벽 주방에 불이 켜진다", line: "새벽 네 시, 하루가 시작됩니다.", speaker: "40대 남성 제빵사", seconds: 8 },
      { beat: "반죽을 치댄다", line: "", speaker: "", seconds: 7 },
    ],
  };

  it("갖춘 답을 통과시킨다", () => {
    const got = validateScenario(good);
    expect(got.shots).toHaveLength(2);
    expect(got.shots[0].seconds).toBe(8);
    expect(got.angle).toContain("새벽의 노동");
  });

  it("★ seconds 를 숫자로 만든다 — 모델이 문자열로 답한다", () => {
    const got = validateScenario({ ...good, shots: [{ ...good.shots[0], seconds: "8" }] });
    expect(got.shots[0].seconds).toBe(8);
  });

  it("shots 가 없으면 null 이다", () => {
    expect(validateScenario({ ...good, shots: [] })).toBe(null);
    expect(validateScenario({ ...good, shots: "여덟" })).toBe(null);
    expect(validateScenario(null)).toBe(null);
  });

  it("beat 가 빈 shot 은 통째로 버린다 — 무엇을 하는 장면인지 모르면 화면을 못 그린다", () => {
    const got = validateScenario({ ...good, shots: [good.shots[0], { beat: "  ", line: "가", speaker: "나", seconds: 5 }] });
    expect(got.shots).toHaveLength(1);
  });

  it("모르는 focus.mode 는 focus 를 통째로 비운다", () => {
    const got = validateScenario({ ...good, focus: { mode: "동물", subject: "고양이" } });
    expect(got.focus).toBe(null);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario.test.js`
Expected: FAIL — `Failed to resolve import "../lib/scenario.js"`

- [ ] **Step 3: 최소 구현을 쓴다**

```js
// lib/scenario.js
// 시나리오 — 사장님 설명 한 덩어리를 읽고 영화처럼 전체 틀을 짠다.
//
// ★ 이 파일은 서버 전용이다(lib/llm.js 를 부른다). 화면은 이것을 import 하지 않는다 —
//   화면이 쓰는 판정은 lib/scenario-rules.js 에 있다.
//
// ★ 광고(lib/ad/scenario.js)와 갈라 두는 이유: 그쪽 지문은 "컷 편집을 지시하지 마라 —
//   편집 단계가 없다"를 못박는다(영상 모델이 한 번의 생성 안에서 장면을 잇는다).
//   여기는 편집 단계가 있어서 그 줄이 정확히 뒤집힌다. 한 파일을 공유하면 한쪽 요구가
//   다른 쪽을 망가뜨린다. 광고 파일은 건드리지 않는다.
//
// ★ 카메라·조명·움직임은 여기서 묻지 않는다 — 화면 설계(2패스)가 답한다.
//   여기서 미리 받으면 값이 두 벌이 되고, 2패스의 재시도가 사장님이 고친 시나리오를 덮는다.
import { clipProfileForProject, minSecondsFor, maxSecondsFor } from "./clip-limits.js";
import { CONTENT_MAX_SECONDS } from "./cuts.js";

const FOCUS_MODES = ["사람", "물건", "정보"];
const str = (v) => (typeof v === "string" ? v.trim() : "");

const SYSTEM = `너는 짧은 영상의 연출을 총괄하는 감독이다.
사장님이 준 설명을 읽고 **이 영상을 어떻게 전달할지** 전체 틀을 짠다.

너가 정하는 것은 셋이다:
- **무엇을 중심에 둘 것인가** — 이 영상이 따라가는 대상(사람·물건·정보 중 하나)
- **어떤 흐름으로 갈 것인가** — 시작에서 끝까지의 형태. 무엇으로 붙잡고 무엇으로 닫는가
- **장면을 어떻게 나눌 것인가** — 각 장면이 이야기에서 하는 일, 그 장면의 대사, 길이

지켜야 할 것:
- **영상을 장면으로 나눈다.** 장면 하나가 그림 한 장으로 만들어진다 — 한 장면 안에서
  장소나 구도가 바뀌면 안 된다.
- 장면 초의 **합이 주어진 길이와 정확히 같아야** 한다.
- 장면 하나는 **주어진 하한 이상, ${CONTENT_MAX_SECONDS}초 이하**다. 그림 한 장이 그보다
  오래 화면에 머물면 정지 화면처럼 보인다.
- **대사는 짧게. 영상 길이를 말로 다 채우지 마라** — 쉬는 자리가 있어야 숨이 트인다.
  말이 없는 장면을 넣어도 된다(그때는 line 을 빈 문자열로 둔다).
- **대사가 있는 장면에는 누가 말하는지를 반드시 적는다.** 화면에 보이는 사람이면 그 사람을
  적고(예: "40대 남성 제빵사"), 화면 밖 목소리면 "내레이션"이라고 적는다.
  ★ 내레이션은 **최소로** 쓴다 — 화면에 보이는 사람이 말하는 쪽이 결과가 좋다.
- 화면에 **글자를 넣으라고 요구하지 마라.** 모델은 글자를 "글자처럼 생긴 무늬"로 그린다.
  자막·로고는 우리가 나중에 따로 붙인다.
- **화면 설명(무엇이 어떻게 보이는가)은 적지 마라.** 그것은 다음 단계가 정한다.
  너는 "이 장면이 이야기에서 하는 일"만 적는다.
- 정보가 모자라도 **되묻지 말고**, 합리적으로 채워 완성된 시나리오 하나를 낸다.

JSON 으로만 답한다:
{
  "topic": "이 영상이 무엇에 대한 것인지 한 줄",
  "focus": {"mode": "사람|물건|정보 중 하나", "subject": "그 갈래의 대상 한 줄", "look": "물건이면 생김새 — 색·부위·소재(아니면 빈 문자열)"},
  "angle": "이 영상을 어떻게 전달하는가 — 무엇을 중심에 두고 어떤 흐름으로 가는가",
  "shots": [{
    "beat": "이 장면이 이야기에서 하는 일 (한국어)",
    "line": "이 장면의 대사 (없으면 빈 문자열)",
    "speaker": "이 대사를 누가 말하는가 (대사가 없으면 빈 문자열)",
    "seconds": 이 장면의 길이(정수)
  }]
}`;

export function buildScenarioMessages(project) {
  const profile = clipProfileForProject(project);
  const min = minSecondsFor(profile);
  const max = maxSecondsFor(profile);
  const target = Number(project?.settings?.target_seconds) || 0;
  const aspect = project?.settings?.aspect_ratio || "9:16";
  const photos = (project?.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";

  const user = `[사장님 설명]
${project?.material?.text || ""}

[올린 사진]
${photos}

[영상 길이] ${target}초 — 장면 초의 합이 정확히 이 값이어야 한다
[화면 비율] ${aspect} ${aspect === "9:16" ? "(세로 — 세로 구도로 짠다)" : ""}
[장면 길이] 하한 ${min}초 · 상한 ${CONTENT_MAX_SECONDS}초 (영상 모델 상한은 ${max}초지만 그림 한 장의 상한이 더 낮다)
[담을 수 있는 장면 수] 최대 ${Math.max(1, Math.floor(target / min))}개`;

  return { system: SYSTEM, messages: [{ role: "user", content: user }] };
}

// 모양만 본다 — 규칙(합·상한·하한·화자)은 lib/scenario-rules.js 의 checkScenario 가 본다.
// 둘을 한 함수에 넣으면 "모양은 맞는데 규칙에 걸린 답"을 사장님에게 보여 줄 수 없다.
export function validateScenario(obj) {
  if (!obj || !Array.isArray(obj.shots)) return null;
  const shots = [];
  for (const s of obj.shots) {
    const beat = str(s?.beat);
    // beat 가 없으면 화면 설계가 무엇을 그릴지 모른다 — 그 장면은 버린다
    if (!beat) continue;
    const line = str(s?.line);
    shots.push({
      beat,
      line,
      // 대사가 없으면 화자도 없다 — 빈 대사에 화자가 붙으면 checkScenario 가 헷갈린다
      speaker: line ? str(s?.speaker) : "",
      seconds: Math.round(Number(s?.seconds) || 0),
    });
  }
  if (!shots.length) return null;

  const mode = str(obj?.focus?.mode);
  const subject = str(obj?.focus?.subject);
  const focus = FOCUS_MODES.includes(mode) && subject
    ? { mode, subject, look: str(obj?.focus?.look) }
    : null;

  return { topic: str(obj.topic), focus, angle: str(obj.angle), shots };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: 변이 실험**

1. `if (!beat) continue;` 를 지운다 → "beat 가 빈 shot 은 통째로 버린다" 가 실패해야 한다
2. `speaker: line ? str(s?.speaker) : ""` → `speaker: str(s?.speaker)` → 테스트가 통과해 버리면 그 자리를 재는 테스트가 없다는 뜻이다. 이때는 **테스트를 추가**하고 보고한다.

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
npx vitest run
git add lib/scenario.js tests/scenario.test.js
git commit -m "feat(scenario): 시나리오 지문과 모양 검증"
```

---

### Task 3: 시나리오 생성 — 규칙에 걸리면 한 번 다시 부른다

**Files:**
- Modify: `lib/scenario.js` (`generateScenario` 추가)
- Test: `tests/scenario-generate.test.js`

**Interfaces:**
- Consumes: `buildScenarioMessages`·`validateScenario` (Task 2) · `checkScenario` (Task 1) · `callJson` (`lib/llm.js`)
- Produces: `generateScenario(project, { call } = {}) -> { scenario, problems, calls }` — `call` 은 테스트가 주입한다(기본값 `callJson`). `scenario` 는 규칙에 걸려도 **돌려준다**(사장님이 고치게).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario-generate.test.js
import { describe, it, expect, vi } from "vitest";
import { generateScenario } from "../lib/scenario.js";

const project = {
  id: "aaaaaaaa-0000-4000-8000-000000000002",
  settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
  material: { text: "동네 카페를 소개하는 영상", photos: [] },
};
const shot = (seconds, line = "오늘도 문을 엽니다.") => ({ beat: "문을 연다", line, speaker: "20대 여성 바리스타", seconds });
const good = { topic: "카페 소개", focus: { mode: "물건", subject: "핸드드립 커피" }, angle: "아침의 준비", shots: [shot(8), shot(8), shot(8), shot(6)] };
const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] }; // 합 25 ≠ 30 (컷 길이는 전부 유효 — 합 규칙 하나만 어긴다)

describe("generateScenario", () => {
  it("첫 답이 규칙을 지키면 한 번만 부른다", async () => {
    const call = vi.fn(async () => good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(got.problems).toEqual([]);
    expect(got.scenario.shots).toHaveLength(4);
  });

  it("★ 규칙에 걸리면 사유를 붙여 한 번 더 부른다", async () => {
    const call = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    // 두 번째 호출에 사유가 실렸는가 — 무엇이 틀렸는지 모델이 알아야 고친다
    const second = call.mock.calls[1][0];
    const last = second.messages[second.messages.length - 1];
    expect(last.content).toContain("[다시]");
    expect(last.content).toContain("25");
    expect(got.problems).toEqual([]);
  });

  it("★ 두 번째도 걸리면 그대로 돌려준다 — 코드가 초를 주무르지 않는다", async () => {
    const call = vi.fn(async () => bad);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
    expect(got.problems.length).toBeGreaterThan(0);
    // 초를 몰래 고치지 않았다
    expect(got.scenario.shots.map((s) => s.seconds)).toEqual([8, 8, 5, 4]);
  });

  it("★ 모양이 깨진 답은 다시 부른다", async () => {
    const call = vi.fn().mockResolvedValueOnce({ shots: [] }).mockResolvedValueOnce(good);
    const got = await generateScenario(project, { call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(got.scenario.shots).toHaveLength(4);
  });

  it("★ 두 번 다 모양이 깨지면 scenario 가 null 이다", async () => {
    const call = vi.fn(async () => ({ shots: [] }));
    const got = await generateScenario(project, { call });
    expect(got.scenario).toBe(null);
    expect(got.problems.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-generate.test.js`
Expected: FAIL — `generateScenario is not a function`

- [ ] **Step 3: 최소 구현을 쓴다 (`lib/scenario.js` 아래에 덧붙인다)**

```js
import { callJson } from "./llm.js";
import { checkScenario } from "./scenario-rules.js";

// ★ 두 번까지만 부른다. 세 번째를 두지 않는 이유는 이 저장소가 컷 분할에서 이미 겪었다 —
//   되물었더니 모델이 같은 답을 다시 냈고 값(시간·호출)만 치렀다.
//   두 번째도 걸리면 **그대로 사장님에게 보여 준다**. 코드가 초를 몰래 주무르지 않는다:
//   합을 맞추려고 마지막 장면을 늘리면 사장님이 안 시킨 편집이 되고, 무엇이 왜 바뀌었는지
//   화면이 설명할 수 없다.
export async function generateScenario(project, { call = callJson } = {}) {
  const built = buildScenarioMessages(project);
  let scenario = null;
  let problems = [];
  let calls = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = problems.length
      ? [...built.messages, { role: "user", content: `[다시] ${problems.join(" ")}\n같은 형식으로 전부 다시 낸다.` }]
      : built.messages;
    calls += 1;
    const got = validateScenario(
      await call({ system: built.system, messages, stage: "시나리오", projectId: project?.id })
    );
    if (!got) {
      problems = ["형식이 맞지 않았어요."];
      scenario = null;
      continue;
    }
    scenario = got;
    const checked = checkScenario(got, project);
    problems = checked.problems;
    if (checked.ok) break;
  }

  return { scenario, problems, calls };
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-generate.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 변이 실험**

1. 루프 상한 `attempt < 2` → `attempt < 1` → "규칙에 걸리면 한 번 더 부른다" 가 실패해야 한다
2. 재시도 메시지에서 `problems.join(" ")` 를 지운다 → "사유가 실렸는가" 가 실패해야 한다

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
npx vitest run
git add lib/scenario.js tests/scenario-generate.test.js
git commit -m "feat(scenario): 규칙에 걸리면 사유를 붙여 한 번 다시 부른다"
```

---

### Task 4: 시나리오 shot → 컷 옮기기

**Files:**
- Modify: `lib/cuts.js` (`shotsToCuts` 추가 — 파일 끝)
- Test: `tests/shots-to-cuts.test.js`

**Interfaces:**
- Produces: `shotsToCuts(scenario) -> cut[]` — 컷 필드는 `{ idx, sentence, seconds, spoken_seconds, silent?, source: "scenario", regen_count: 0 }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/shots-to-cuts.test.js
import { describe, it, expect } from "vitest";
import { shotsToCuts } from "../lib/cuts.js";

const scenario = {
  angle: "아침의 준비",
  shots: [
    { beat: "문을 연다", line: "오늘도 문을 엽니다.", speaker: "20대 여성 바리스타", seconds: 8 },
    { beat: "원두를 간다", line: "", speaker: "", seconds: 7 },
  ],
};

describe("shotsToCuts", () => {
  it("shot 하나가 컷 하나다 — idx 는 0부터 코드가 매긴다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts).toHaveLength(2);
    expect(cuts.map((c) => c.idx)).toEqual([0, 1]);
  });

  it("line 이 sentence 가 된다", () => {
    expect(shotsToCuts(scenario)[0].sentence).toBe("오늘도 문을 엽니다.");
  });

  it("★ 대사가 빈 장면은 silent 다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts[0].silent).toBeUndefined();
    expect(cuts[1].silent).toBe(true);
    expect(cuts[1].sentence).toBe("");
  });

  // 자막이 머무는 시간이 spoken_seconds 다 — 무음 컷에 값을 주면 없는 자막이 시간을 먹는다
  it("★ spoken_seconds 는 대사 있는 컷만 seconds 와 같고, 무음 컷은 0 이다", () => {
    const cuts = shotsToCuts(scenario);
    expect(cuts[0].seconds).toBe(8);
    expect(cuts[0].spoken_seconds).toBe(8);
    expect(cuts[1].seconds).toBe(7);
    expect(cuts[1].spoken_seconds).toBe(0);
  });

  it("출처를 남긴다 — 어디서 나온 컷인지 나중에 구분해야 한다", () => {
    expect(shotsToCuts(scenario)[0].source).toBe("scenario");
    expect(shotsToCuts(scenario)[0].regen_count).toBe(0);
  });

  it("shots 가 없으면 빈 배열이다", () => {
    expect(shotsToCuts(null)).toEqual([]);
    expect(shotsToCuts({ shots: [] })).toEqual([]);
  });

  // ★ 화면 설계·캐스팅이 읽는 값이라 컷에 저장하지 않는다 — 컷 각인(clipKey)이 부풀면
  //   beat 만 고쳐도 값을 치른 클립이 낡는다
  it("★ beat·speaker 를 컷에 저장하지 않는다", () => {
    const cut = shotsToCuts(scenario)[0];
    expect(cut.beat).toBeUndefined();
    expect(cut.speaker).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/shots-to-cuts.test.js`
Expected: FAIL — `shotsToCuts is not a function`

- [ ] **Step 3: 최소 구현을 쓴다 (`lib/cuts.js` 끝에 덧붙인다)**

```js
// 시나리오의 shot 하나가 컷 하나다. 옮기는 것은 **코드**가 한다 — LLM 이 두 번 답하면
// 사장님이 화면에서 본 대사와 실제로 만들어지는 대사가 갈릴 수 있다.
//
// ★ beat·speaker 는 컷에 저장하지 않는다. 둘은 화면 설계·캐스팅이 읽는 **입력**이고,
//   컷에 얹으면 각인(lib/steps.js clipKey)이 부풀어 beat 만 고쳐도 값을 치른 클립이 낡는다.
//
// ★ spoken_seconds 는 대사 있는 컷만 채운다. 이 값이 자막이 머무는 시간이라
//   (lib/subtitles.js), 무음 컷에 값을 주면 없는 자막이 시간을 먹는다.
export function shotsToCuts(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.map((s, i) => {
    const sentence = typeof s?.line === "string" ? s.line.trim() : "";
    const seconds = Math.round(Number(s?.seconds) || 0);
    return {
      idx: i,
      sentence,
      seconds,
      spoken_seconds: sentence ? seconds : 0,
      ...(sentence ? {} : { silent: true }),
      source: "scenario",
      regen_count: 0,
    };
  });
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/shots-to-cuts.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 변이 실험**

1. `spoken_seconds: sentence ? seconds : 0` → `spoken_seconds: seconds` → "무음 컷은 0" 이 실패해야 한다
2. `...(sentence ? {} : { silent: true })` 를 지운다 → "대사가 빈 장면은 silent" 가 실패해야 한다

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
npx vitest run
git add lib/cuts.js tests/shots-to-cuts.test.js
git commit -m "feat(cuts): 시나리오 shot 을 컷으로 옮긴다"
```

---

### Task 5: 시나리오 라우트

**Files:**
- Create: `app/api/projects/[id]/scenario/route.js`
- Test: `tests/scenario-route.test.js`

**Interfaces:**
- Consumes: `generateScenario` (Task 3) · `checkScenario` (Task 1) · `validateScenario` (Task 2)
- Produces: 프로젝트 문서에 `scenario: { topic, focus, angle, shots, confirmed: boolean }`

**계약:**
- `POST` — 시나리오를 만든다(이미 있으면 다시 만든다). 응답 `{ scenario, problems }`
- `PATCH` — 사장님이 고친 시나리오를 저장한다. **규칙에 걸려도 저장한다**(고치는 중일 수 있다). 응답 `{ scenario, problems }`
- `PATCH { confirmed: true }` — 확정. **규칙에 걸리면 400** 이다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario-route.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, getProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const OWNER = "44444444-4444-4444-4444-444444444444";
const AUTH = { [USER_HEADER]: OWNER, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" };

const gen = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../lib/scenario.js", async (orig) => ({
  ...(await orig()),
  generateScenario: (...a) => gen.run(...a),
}));

const { POST, PATCH } = await import("../app/api/projects/[id]/scenario/route.js");

const shot = (seconds, line = "오늘도 문을 엽니다.") => ({ beat: "문을 연다", line, speaker: "20대 여성 바리스타", seconds });
const good = { topic: "카페", focus: { mode: "물건", subject: "커피" }, angle: "아침", shots: [shot(8), shot(8), shot(8), shot(6)] };

const req = (body) => new Request("http://x", {
  method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(body || {}),
});

let id;
beforeEach(async () => {
  resetMemoryStore();
  gen.run.mockReset();
  const p = await createProject({
    settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
    material: { text: "동네 카페 소개", photos: [] },
    ownerId: OWNER,
  });
  id = p.id;
});

describe("POST /scenario", () => {
  it("시나리오를 만들어 저장한다", async () => {
    gen.run.mockResolvedValue({ scenario: good, problems: [], calls: 1 });
    const res = await POST(req(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenario.shots).toHaveLength(4);
    expect(body.problems).toEqual([]);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(false);
  });

  it("★ 규칙에 걸린 시나리오도 저장하고 problems 를 함께 준다", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    gen.run.mockResolvedValue({ scenario: bad, problems: ["장면 초의 합이 25초예요 — 30초에 맞춰 주세요."], calls: 2 });
    const res = await POST(req(), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).problems[0]).toContain("25");
  });

  it("★ 만들지 못하면 502 다", async () => {
    gen.run.mockResolvedValue({ scenario: null, problems: ["형식이 맞지 않았어요."], calls: 2 });
    expect((await POST(req(), { params: Promise.resolve({ id }) })).status).toBe(502);
  });

  it("자료가 없으면 400 이다", async () => {
    const p = await createProject({ settings: {}, material: { text: "  ", photos: [] }, ownerId: OWNER });
    expect((await POST(req(), { params: Promise.resolve({ id: p.id }) })).status).toBe(400);
  });
});

describe("PATCH /scenario", () => {
  const patch = (body) => new Request("http://x", {
    method: "PATCH", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify(body),
  });

  it("★ 규칙에 걸려도 저장한다 — 고치는 중일 수 있다", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    const res = await PATCH(patch({ scenario: bad }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect((await getProject(id, OWNER)).scenario.shots).toHaveLength(4);
  });

  it("★ 확정은 규칙을 지켜야 한다 — 걸리면 400", async () => {
    const bad = { ...good, shots: [shot(8), shot(8), shot(5), shot(4)] };
    const res = await PATCH(patch({ scenario: bad, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(400);
    expect((await getProject(id, OWNER)).scenario?.confirmed).toBeFalsy();
  });

  it("★ 길이를 안 고른 프로젝트는 확정할 수 없다 — ok:true 가 안전과 같지 않다", async () => {
    const p = await createProject({ settings: { i2v_model: "seedance-2.0" }, material: { text: "동네 카페 소개", photos: [] }, ownerId: OWNER });
    // checkScenario 는 목표가 없으면 합·개수를 안 재므로 ok:true 다 — 그래도 막혀야 한다
    const res = await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("길이");
    expect((await getProject(p.id, OWNER)).scenario?.confirmed).toBeFalsy();
  });

  it("규칙을 지키면 확정된다", async () => {
    const res = await PATCH(patch({ scenario: good, confirmed: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await getProject(id, OWNER)).scenario.confirmed).toBe(true);
  });

  // ★ "고칠 수 있는 척하는 칸"을 막는다 — 화면에 칸이 있는데 라우트가 그 필드를 버리면
  //   사장님은 고쳤다고 믿고 다음 단계에서 돈을 낸다
  it("★ 사장님이 고친 네 필드가 전부 저장된다", async () => {
    const edited = {
      ...good,
      angle: "저녁의 마감으로 바꾼다",
      shots: [{ beat: "불을 끈다", line: "하루를 닫습니다.", speaker: "40대 남성 사장", seconds: 30 }],
    };
    await PATCH(patch({ scenario: edited }), { params: Promise.resolve({ id }) });
    const saved = (await getProject(id, OWNER)).scenario;
    expect(saved.angle).toBe("저녁의 마감으로 바꾼다");
    expect(saved.shots[0].beat).toBe("불을 끈다");
    expect(saved.shots[0].line).toBe("하루를 닫습니다.");
    expect(saved.shots[0].speaker).toBe("40대 남성 사장");
    expect(saved.shots[0].seconds).toBe(30);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-route.test.js`
Expected: FAIL — 모듈을 찾지 못한다

- [ ] **Step 3: 최소 구현을 쓴다**

```js
// app/api/projects/[id]/scenario/route.js
// ②시나리오 — 만들고(POST), 사장님이 고치고(PATCH), 확정한다(PATCH confirmed).
//
// ★ 확정만 규칙을 강제한다. 고치는 도중에는 어긋나 있는 것이 정상이라 PATCH 는 저장하고
//   problems 만 함께 돌려준다 — 막으면 사장님이 한 번에 다 맞춰야 저장이 된다.
import { getProject, updateProject } from "../../../../../lib/projects";
import { generateScenario, validateScenario } from "../../../../../lib/scenario.js";
import { checkScenario } from "../../../../../lib/scenario-rules.js";
import { withUser } from "../../../../../lib/auth/require-user.js";
import { BudgetExceeded } from "../../../../../lib/costs.js";

// 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — 없는 것과 같이 404 다.
async function load(id, userId) {
  const project = await getProject(id, userId);
  return !project || project.kind === "ad" ? null : project;
}

export const POST = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await load(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });
  if (!project.material?.text?.trim()) {
    return Response.json({ error: "만들고 싶은 영상을 먼저 적어 주세요" }, { status: 400 });
  }

  // ★ 예산 오류는 삼키지 않는다 — withUser 까지 올라가야 402 가 된다(브리핑 라우트와 같은
  //   처방). 그 밖의 실패(LLM 장애·네트워크)는 502 로 사장님 말로 답한다. 안 잡으면
  //   프레임워크가 한국어 안내 없이 500 을 낸다.
  let generated;
  try {
    generated = await generateScenario(project);
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    console.error("시나리오 생성 실패:", e);
    return Response.json({ error: "시나리오를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
  }
  const { scenario, problems } = generated;
  if (!scenario) {
    return Response.json({ error: "시나리오를 만들지 못했어요. 다시 시도해 주세요." }, { status: 502 });
  }

  await updateProject(id, user.id, (proj) => ({ ...proj, scenario: { ...scenario, confirmed: false } }));
  return Response.json({ scenario, problems });
});

export const PATCH = withUser(async (req, { params }, user) => {
  const { id } = await params;
  const project = await load(id, user.id);
  if (!project) return Response.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const scenario = validateScenario(body?.scenario);
  if (!scenario) return Response.json({ error: "시나리오 모양이 아니에요" }, { status: 400 });

  const { ok, problems } = checkScenario(scenario, project);
  const confirming = body?.confirmed === true;
  // ★ 길이를 안 고른 프로젝트는 확정할 수 없다. checkScenario 는 목표가 없으면 합·개수를
  //   아예 안 재고 ok:true 를 준다(tests/scenario-rules.test.js 가 그 동작을 못 박아 뒀다) —
  //   즉 **ok:true 가 "확정해도 안전"과 같지 않다.** 여기가 그 차이를 메우는 자리이고,
  //   ③목소리부터 돈이 나가므로 이 문이 마지막 무료 관문이다.
  if (confirming && !Number(project?.settings?.target_seconds)) {
    return Response.json({ error: "영상 길이를 먼저 골라 주세요" }, { status: 400 });
  }
  if (confirming && !ok) {
    return Response.json({ error: problems.join(" "), problems }, { status: 400 });
  }

  await updateProject(id, user.id, (proj) => ({
    ...proj,
    scenario: { ...scenario, confirmed: confirming },
  }));
  return Response.json({ scenario, problems });
});
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-route.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 변이 실험**

1. `if (confirming && !ok)` → `if (false)` → "확정은 규칙을 지켜야 한다" 가 실패해야 한다
2. `validateScenario(body?.scenario)` 결과에서 `shots[0].speaker` 를 버리도록 잠깐 고친다 → "네 필드가 전부 저장된다" 가 실패해야 한다

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
npx vitest run
git add app/api/projects/\[id\]/scenario/route.js tests/scenario-route.test.js
git commit -m "feat(scenario): 생성·수정·확정 라우트"
```

---

### Task 6: 단계 표와 게이트

**Files:**
- Modify: `lib/steps.js` (`STEPS` 의 두 번째 항목 · `currentStepKey` · `isReachable`)
- Test: `tests/steps.test.js` (기존 파일에 추가) · 기존 단정 수정

**Interfaces:**
- Produces: `STEPS[1] = { key: "scenario", no: "2", label: "시나리오", seg: "scenario" }`. 게이트는 `project.scenario?.confirmed` 를 본다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 (`tests/steps.test.js` 끝에 추가)**

```js
describe("②시나리오 — 대본을 대신한다", () => {
  it("★ 단계 표의 둘째가 시나리오다", () => {
    expect(STEPS[1].key).toBe("scenario");
    expect(STEPS[1].seg).toBe("scenario");
    expect(STEPS.map((s) => s.key)).toEqual(["material", "scenario", "voice", "images", "video", "done"]);
  });

  it("★ 시나리오를 확정해야 다음이 열린다", () => {
    const before = { scenario: { shots: [{ beat: "가" }], confirmed: false }, status: "draft" };
    expect(currentStepKey(before)).toBe("material");
    const after = { scenario: { shots: [{ beat: "가" }], confirmed: true }, status: "draft" };
    expect(currentStepKey(after)).toBe("scenario");
  });

  it("주소 → 단계 짝이 맞는다", () => {
    expect(stepFromPathname("/create/abc/scenario").key).toBe("scenario");
    expect(stepHref(STEPS[1], "abc")).toBe("/create/abc/scenario");
  });
});
```

기존 파일에서 **`briefing.confirmed` 를 쓰는 단정을 `scenario.confirmed` 로 바꾼다.** `grep -n "briefing" tests/steps.test.js` 로 전부 찾아 고친다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: FAIL — `STEPS[1].key` 가 `"script"` 다

- [ ] **Step 3: 최소 구현을 쓴다 (`lib/steps.js`)**

`STEPS` 의 둘째 줄을 바꾼다:

```js
  { key: "material", no: "1", label: "자료", seg: "briefing" },
  // ②시나리오 — 예전의 ②대본 자리다. 원고(대사 통짜)가 아니라 영화 틀이 여기서 나오고,
  // 컷은 그 틀에서 만들어진다(2026-08-16). 대사는 시나리오가 컷마다 정한다.
  { key: "scenario", no: "2", label: "시나리오", seg: "scenario" },
  { key: "voice", no: "3", label: "목소리", seg: "voice" },
```

`currentStepKey` 의 첫 게이트를 바꾼다:

```js
export function currentStepKey(project) {
  if (!project) return "material";
  // ★ 시나리오 확정이 ①자료를 닫는 신호다(예전에는 briefing.confirmed 였다).
  //   되묻기가 없어지면서 브리핑에는 확정할 것이 남지 않았다.
  if (!project.scenario?.confirmed) return "material";
  if (project.status === "done") return "done";
  if (project.status === "video") return "video";
  if (project.status === "images") return "video";
  if (project.status === "voice") return "images";
  // ★ 말하는 프로젝트에는 목소리 단계가 없다 — 컷이 끝나면 바로 이미지다.
  //   이 분기를 **떨어뜨리지 마라**: 떨어뜨리면 Seedance 프로젝트가 ③목소리로 들어간다.
  if (project.status === "cuts") return projectSpeaks(project) ? "images" : "voice";
  return "scenario";
}
```

`isReachable` 안의 `project.briefing?.confirmed` 를 `project.scenario?.confirmed` 로 바꾼다.

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/steps.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트를 돌려 파급을 본다**

Run: `npx vitest run`
`briefing.confirmed` 를 쓰던 다른 테스트가 함께 깨진다. **깨진 것을 하나씩 보고, 그 자리가 시나리오를 봐야 하는 곳이면 고친다.** 예상 못 한 실패는 고치지 말고 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "feat(steps): ②대본을 ②시나리오로 바꾸고 게이트를 시나리오 확정으로 옮긴다"
```

---

### Task 7: 파이프라인이 시나리오를 읽는다

**Files:**
- Modify: `lib/pipeline.js` (`defaultDeps.splitCuts` 앞부분 · 캐스팅 호출)
- Modify: `lib/cuts.js` (`buildShowsMessages` 에 `angle`·`beat` 싣기)
- Modify: `lib/cast.js` (`buildCastMessages` 가 `speaker` 를 받는다)
- Modify: `app/api/projects/[id]/cuts/route.js` (선행 조건을 원고 → 시나리오 확정으로)
- Test: `tests/scenario-pipeline.test.js`

**Interfaces:**
- Consumes: `shotsToCuts` (Task 4)
- Produces: `splitCuts` 가 `project.scenario` 를 읽는다. `buildShowsMessages(project, cuts, { angle, beats })`. `buildCastMessages(cuts, avatars, lead, things, { speakers })`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario-pipeline.test.js
import { describe, it, expect } from "vitest";
import { buildShowsMessages } from "../lib/cuts.js";
import { buildCastMessages } from "../lib/cast.js";

const project = {
  settings: { i2v_model: "seedance-2.0", target_seconds: 30 },
  material: { text: "동네 카페", photos: [] },
  scenario: { topic: "카페", focus: { mode: "물건", subject: "핸드드립 커피" }, angle: "아침의 준비를 따라간다" },
};
const cuts = [
  { idx: 0, sentence: "오늘도 문을 엽니다.", seconds: 10 },
  { idx: 1, sentence: "", silent: true, seconds: 10 },
];

describe("화면 설계가 시나리오를 읽는다", () => {
  it("★ 전달 방식(angle)이 지문에 실린다 — 없으면 컷마다 딴 이야기가 된다", () => {
    const m = buildShowsMessages(project, cuts, { angle: project.scenario.angle, beats: ["문을 연다", "원두를 간다"] });
    expect(m.messages[0].content).toContain("아침의 준비를 따라간다");
  });

  it("★ 장면이 하는 일(beat)이 컷마다 실린다", () => {
    const m = buildShowsMessages(project, cuts, { angle: "", beats: ["문을 연다", "원두를 간다"] });
    expect(m.messages[0].content).toContain("문을 연다");
    expect(m.messages[0].content).toContain("원두를 간다");
  });

  it("★ 초점을 브리핑이 아니라 시나리오에서 읽는다", () => {
    const m = buildShowsMessages(project, cuts, { angle: "", beats: ["가", "나"] });
    expect(m.messages[0].content).toContain("핸드드립 커피");
  });

  it("옵션을 안 주면 지금까지와 같은 지문이다 — 옛 호출부가 안 깨진다", () => {
    const m = buildShowsMessages(project, cuts);
    expect(m.messages[0].content).not.toContain("아침의 준비를 따라간다");
  });
});

describe("캐스팅이 화자를 받는다", () => {
  it("★ 시나리오가 정한 화자가 지문에 실린다", () => {
    const m = buildCastMessages(cuts, [], "", [], { speakers: ["20대 여성 바리스타", ""] });
    expect(m.messages[0].content).toContain("20대 여성 바리스타");
  });

  it("★ 화면 밖 목소리는 인물로 뽑지 말라고 알린다", () => {
    const m = buildCastMessages(cuts, [], "", [], { speakers: ["내레이션", ""] });
    expect(m.messages[0].content).toContain("내레이션");
  });

  it("옵션을 안 주면 지금까지와 같다", () => {
    const m = buildCastMessages(cuts, [], "", []);
    expect(m.messages[0].content).not.toContain("말하는 사람");
  });
});

// ★★ 이 설계가 실제로 소리 문제를 푸는가 — 이 계획의 존재 이유를 직접 잰다.
//
// 지금까지 막혔던 것: projectSpeaks 가 "대사 있는 컷마다 화면에 말할 사람이 있어야" 를
// 요구하는데, 원고가 먼저 정해지고 캐스팅이 나중에 "화면에 보이는 사람"만 뽑아서
// 실측 15편 중 13편이 떨어졌다. 시나리오가 대사와 화자를 **같이** 정하면 그 어긋남이
// 설계 단계에서 사라진다 — 그것을 여기서 단언한다.
describe("★ 시나리오가 정한 화자가 캐스팅에 닿으면 클립이 말한다", () => {
  it("모든 대사 컷에 화자가 있으면 projectSpeaks 가 통과한다", async () => {
    const { projectSpeaks } = await import("../lib/clip-limits.js");
    const { shotsToCuts } = await import("../lib/cuts.js");
    const scenario = {
      angle: "아침의 준비",
      shots: [
        { beat: "문을 연다", line: "오늘도 문을 엽니다.", speaker: "20대 여성 바리스타", seconds: 10 },
        { beat: "원두를 간다", line: "", speaker: "", seconds: 10 },
        { beat: "잔을 내민다", line: "한 잔 드릴까요.", speaker: "20대 여성 바리스타", seconds: 10 },
      ],
    };
    const cuts = shotsToCuts(scenario);
    // 캐스팅이 화자를 받아 그 컷들을 맡았다고 본다(실제 캐스팅 패스가 하는 일)
    const cast = [{ id: "c1", who: "20대 여성 바리스타", voice: "밝고 또렷한", cuts: [0, 2] }];
    const project = { settings: { i2v_model: "seedance-2.0" }, cuts, cast };
    expect(projectSpeaks(project)).toBe(true);
  });

  it("무음 컷은 화자가 없어도 막지 않는다", async () => {
    const { projectSpeaks } = await import("../lib/clip-limits.js");
    const { shotsToCuts } = await import("../lib/cuts.js");
    const cuts = shotsToCuts({
      shots: [
        { beat: "가", line: "한 잔 드릴까요.", speaker: "20대 여성 바리스타", seconds: 15 },
        { beat: "나", line: "", speaker: "", seconds: 15 },
      ],
    });
    const cast = [{ id: "c1", who: "20대 여성 바리스타", voice: "밝고 또렷한", cuts: [0] }];
    expect(projectSpeaks({ settings: { i2v_model: "seedance-2.0" }, cuts, cast })).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-pipeline.test.js`
Expected: FAIL — angle·beat·speaker 가 지문에 없다

- [ ] **Step 3: 구현한다**

`lib/cuts.js` 의 `buildShowsMessages(project, cuts)` 에 셋째 인자를 더한다. **옵션이 없으면 지금까지와 글자 그대로 같아야 한다** — 옛 호출부와 테스트가 안 깨진다.

```js
export function buildShowsMessages(project, cuts, opts = {}) {
  // …기존 코드…
  // 초점은 시나리오가 답한다(브리핑이 답하던 자리). 시나리오가 없는 옛 프로젝트는 브리핑을 본다.
  const f = project.scenario?.focus || project.briefing?.focus;
  const focusBlock = f?.mode && f?.subject ? `\n[이 영상이 따라가는 것]\n${f.mode} — ${f.subject}\n` : "";

  // 전달 방식 — 이것이 없으면 컷마다 딴 이야기가 된다. 없으면 블록째 뺀다(옛 호출부 보존).
  const angle = typeof opts.angle === "string" ? opts.angle.trim() : "";
  const angleBlock = angle ? `\n[이 영상을 어떻게 전달하는가]\n${angle}\n` : "";

  // 컷 목록에 "이 장면이 하는 일"을 함께 적는다 — 대사만 주면 화면이 대사의 삽화가 된다.
  const beats = Array.isArray(opts.beats) ? opts.beats : null;
  const list = cuts.map((c, i) => {
    const what = c.silent ? "(말 없는 장면)" : c.sentence;
    const beat = beats && beats[i] ? ` — ${beats[i]}` : "";
    return `${i + 1}. ${what}${beat}`;
  }).join("\n");
  // …이하 기존 코드에서 focusBlock 뒤에 angleBlock 을 잇는다…
}
```

`lib/cast.js` 의 `buildCastMessages` 에도 같은 모양으로 옵션을 더한다:

```js
export function buildCastMessages(cuts, avatars, lead, things, opts = {}) {
  // …기존 코드…
  // 시나리오가 컷마다 "누가 말하는가"를 정했으면 그것을 알려 준다 — 화면 설명만 보고
  // 뽑으면 말하는 사람이 빠질 수 있고, 그러면 그 대사가 소리로 안 나온다.
  // "내레이션"은 화면 밖 목소리라 인물로 뽑지 않는다.
  const speakers = Array.isArray(opts.speakers) ? opts.speakers : null;
  const speakerBlock = speakers && speakers.some(Boolean)
    ? `\n[장면마다 말하는 사람 — 시나리오가 정했다]\n${speakers
        .map((s, i) => `${i + 1}. ${s || "(말 없음)"}`)
        .join("\n")}\n※ "내레이션"은 화면 밖 목소리다 — 화면에 안 보이면 cast 에 넣지 않는다.\n`
    : "";
  // …user 문자열에 speakerBlock 을 잇는다…
}
```

`lib/pipeline.js` 의 `defaultDeps.splitCuts` 앞부분을 갈아 끼운다:

```js
  splitCuts: async (project, ownerId) => {
    // ★ 시나리오가 컷의 원본이다(2026-08-16). 원고를 자르던 자리다.
    //   시나리오가 컷과 초를 직접 정하므로 splitUnits·validateCutRanges·explodeLongRanges·
    //   fillSilentCuts·allocateCutSeconds 를 이 경로에서 쓰지 않는다.
    const scenario = project?.scenario;
    if (!scenario?.shots?.length) throw new Error("시나리오가 없어요");
    let cuts = shotsToCuts(scenario);
    const beats = scenario.shots.map((s) => s?.beat || "");
    const speakers = scenario.shots.map((s) => s?.speaker || "");
    console.log(`[분할 ${project.id.slice(0, 8)}] 시나리오 장면 ${cuts.length}개 → 컷 ${cuts.length}개`);
    // …사진 판정(기존 그대로)…
    // 화면 설계 — 옵션 둘을 함께 넘긴다
    const shots = buildShowsMessages({ ...project, material: { ...project.material, photos } }, cuts, { angle: scenario.angle, beats });
    // …재시도 루프(기존 그대로)…
    // 캐스팅 — 화자를 함께 넘긴다. lead 는 시나리오의 focus 에서 읽는다.
    const focus = scenario.focus;
    const lead = focus?.mode === "사람" ? focus.subject : "";
    const msgs = buildCastMessages(withShows, avatars, lead, things, { speakers });
```

★★ **`POST /cuts` 의 선행 조건도 바꿔야 한다.** 그 라우트는 지금
`if (!project.script?.text) return 400 "대본을 먼저 만들어 주세요"` 로 막는다 — 새 흐름에는
원고가 없으므로 **시나리오를 확정해도 컷 분할이 매번 400 이 된다.** 파이프라인 전체가 막힌다.

```js
// 컷은 시나리오에서 나온다 — 확정된 시나리오가 없으면 나눌 것이 없다(2026-08-16).
// 예전에는 원고(script.text)를 봤다. 옛 프로젝트는 시나리오가 없어 여기서 걸린다 —
// 그 프로젝트들은 ②로 돌아가 시나리오를 만들면 된다.
if (!project.scenario?.confirmed || !(project.scenario.shots || []).length) {
  return Response.json({ error: "시나리오를 먼저 확정해 주세요" }, { status: 400 });
}
```

같은 파일의 `cuts_script_version: proj.script?.version || 1` 은 그대로 둔다 — 원고가 없으면
언제나 1 이고, `areCutsStale` 은 `project.script?.version` 이 없으면 false 라 멱등 가드(409)가
그대로 돈다.

⚠️ `project.briefing?.focus` 를 읽던 자리가 `splitCuts` 안에 **둘** 있다(`lead` 와 `wantsThing`). 둘 다 `scenario.focus` 로 바꾼다. `grep -n "briefing" lib/pipeline.js` 로 전부 확인한다.

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-pipeline.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 전체 테스트**

Run: `npx vitest run`
`tests/pipeline.test.js` 가 원고 기반 fixture 를 쓰고 있어 깨진다. **시나리오 fixture 로 바꾼다.** 예상 못 한 실패는 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/pipeline.js lib/cuts.js lib/cast.js tests/scenario-pipeline.test.js tests/pipeline.test.js
git commit -m "feat(pipeline): 컷이 원고가 아니라 시나리오에서 나온다"
```

---

### Task 8: ②시나리오 화면

**Files:**
- Create: `app/create/[id]/scenario/page.js`
- Test: `tests/scenario-ui.test.js`

**Interfaces:**
- Consumes: `checkScenario`·`scenarioSeconds` (Task 1) · 라우트 (Task 5)

**★ 이 화면이 이 계획에서 가장 중요한 자리다.** 시나리오에는 원고의 되돌리기·채점 같은 자동 장치가 없다. 품질을 지키는 것은 **사장님이 고치는 것**뿐이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/scenario-ui.test.js
// 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다 — 소스 문자열로 계약을 잰다.
// ⚠️ 이 방식은 문법이 깨진 파일을 못 잡는다. 그래서 Step 5 에서 반드시 굽는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/create/[id]/scenario/page.js", "utf8");

describe("②시나리오 화면", () => {
  it("★ 판정을 화면이 손으로 다시 적지 않는다 — 같은 함수를 쓴다", () => {
    expect(page).toMatch(/from ["'].*lib\/scenario-rules["']/);
    expect(page).toContain("checkScenario");
  });

  it("★ 초 합계를 늘 보여 준다", () => {
    expect(page).toContain("scenarioSeconds");
  });

  it("★ 고칠 수 있는 칸이 넷이다 — beat·line·speaker·seconds", () => {
    for (const f of ["beat", "line", "speaker", "seconds"]) {
      expect(page, `${f} 를 고치는 칸이 없다`).toContain(f);
    }
  });

  it("★ 장면을 더하고 지울 수 있다", () => {
    expect(page).toMatch(/장면 추가|추가하기/);
    expect(page).toMatch(/삭제|지우기/);
  });

  it("★ 규칙에 걸리면 다음으로 못 간다", () => {
    expect(page).toMatch(/disabled=\{[^}]*ok/);
  });

  it("★ 무엇이 틀렸는지 화면이 말한다", () => {
    expect(page).toContain("problems");
  });

  // 이 저장소는 setInterval 을 화면에서 직접 돌리는 것을 금지한다(lib/poll.js 한 벌)
  // ★ 옛 ②대본 화면이 POST /cuts 를 불렀다. 그 화면이 지워지므로 이 자리가 물려받지 않으면
  //   컷을 만드는 자리가 저장소에서 사라진다.
  it("★ 확정한 뒤 컷 분할을 시작한다", () => {
    expect(page).toMatch(/\/cuts`/);
    expect(page, "409(이미 나눈 컷)를 정상으로 봐야 한다").toContain("409");
  });

  it("★ setInterval 을 직접 돌리지 않는다", () => {
    expect(page).not.toContain("setInterval");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-ui.test.js`
Expected: FAIL — 파일이 없다

- [ ] **Step 3: 화면을 만든다**

`app/create/[id]/script/page.js` 의 레이아웃(`useProject`·`BackButton`·`panel`·`step-actions`)을 그대로 따른다. 뼈대는 아래와 같다 — 클래스 이름과 문구는 기존 화면에 맞춰 다듬되 **구조와 판정 배선은 이대로 둔다.**

```jsx
"use client";

// ②시나리오 — 영화 틀을 보고 고친다. 이 파이프라인에서 사람이 멈추는 유일한 자리다.
//
// ★ 판정을 화면이 손으로 다시 적지 않는다(checkScenario 한 벌). 두 벌이면 화면은
//   통과라는데 라우트가 400 을 준다.
// ★ 여기 있는 칸 넷은 라우트가 전부 저장한다(tests/scenario-route.test.js 가 박아 둔다).
//   "고칠 수 있는 척하는 칸"을 만들면 사장님은 고쳤다고 믿고 다음 단계에서 돈을 낸다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { checkScenario, scenarioSeconds } from "../../../../lib/scenario-rules";

export default function ScenarioStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const madeFor = useRef(null);

  const scenario = project?.scenario || null;
  const { ok, problems } = scenario ? checkScenario(scenario, project) : { ok: false, problems: [] };
  const total = scenarioSeconds(scenario);
  const target = project?.settings?.target_seconds || 0;

  // 진입하면 한 번 만든다 — ②대본이 원고를 자동 생성하던 것과 같은 모양이다.
  // madeFor 로 한 번만: 안 걸면 저장할 때마다 다시 만들어 사장님이 고친 것이 날아간다.
  useEffect(() => {
    if (!project || scenario || madeFor.current === id) return;
    madeFor.current = id;
    (async () => {
      setBusy(true); setErr("");
      const res = await fetch(`/api/projects/${id}/scenario`, { method: "POST" });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "시나리오를 만들지 못했어요");
      else await load(id).catch(() => {});
      setBusy(false);
    })();
  }, [project?.id, scenario, id]);

  // 고친 것을 문서에 반영한다. 저장(PATCH)은 다음으로 갈 때 한 번에 한다 —
  // 글자마다 저장하면 낙관적 락이 계속 부딪힌다.
  const edit = (next) => setProject((p) => ({ ...p, scenario: { ...p.scenario, ...next } }));
  const editShot = (i, patch) =>
    edit({ shots: scenario.shots.map((s, j) => (i === j ? { ...s, ...patch } : s)) });
  const addShot = () =>
    edit({ shots: [...scenario.shots, { beat: "", line: "", speaker: "", seconds: 0 }] });
  const removeShot = (i) => edit({ shots: scenario.shots.filter((_, j) => j !== i) });
  const moveShot = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= scenario.shots.length) return;
    const next = [...scenario.shots];
    [next[i], next[to]] = [next[to], next[i]];
    edit({ shots: next });
  };

  async function confirm() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/scenario`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, confirmed: true }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "저장하지 못했어요"); return; }
    // ★ 컷 분할을 여기서 시작한다. 옛 ②대본 화면이 하던 일이다(app/create/[id]/script/page.js
    //   의 approve). 그 화면이 없어지므로 이 자리가 물려받지 않으면 **컷을 만드는 자리가
    //   저장소에서 사라진다** — 사장님이 ③목소리에서 "분할 실패" 안내를 거쳐 [다시 시도]를
    //   눌러야만 진행되는 흐름이 된다.
    //   409(이미 나눈 컷이 있음)는 정상이다 — 되돌아와 다시 확정한 경우다.
    const split = await fetch(`/api/projects/${id}/cuts`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }).catch(() => null);
    if (split && !split.ok && split.status !== 409) {
      setErr((await split.json().catch(() => ({}))).error || "컷을 나누지 못했어요");
      return;
    }
    await load(id).catch(() => {});
    // 화면에서 바로 다음 주소로 밀지 않는다 — 가드가 되돌려보낸다(③목소리 화면과 같은 규칙)
    router.push(`/create/${id}/voice`);
  }

  if (!scenario) {
    return (
      <section className="panel panel--narrow">
        <h2>시나리오를 짜는 중이에요</h2>
        {err && <p className="pgsub warn">{err}</p>}
      </section>
    );
  }

  return (
    <section className="panel panel--narrow">
      <h2>시나리오 <span className="badge vlm">②</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      <label className="field">
        <span className="tray-label">이 영상을 어떻게 전달하나</span>
        <textarea value={scenario.angle || ""} rows={2}
          onChange={(e) => edit({ angle: e.target.value })} />
      </label>

      <p className={ok ? "pgsub" : "pgsub warn"}>
        초 합계 {total} / {target}
      </p>
      {problems.map((p, i) => <p key={i} className="pgsub warn">{p}</p>)}

      {scenario.shots.map((s, i) => (
        <div key={i} className="cut-row">
          <span className="rid">{i + 1}</span>
          <label className="field">
            <span className="tray-label">이 장면이 하는 일</span>
            <input value={s.beat || ""} onChange={(e) => editShot(i, { beat: e.target.value })} />
          </label>
          <label className="field">
            <span className="tray-label">대사</span>
            <textarea value={s.line || ""} rows={2}
              onChange={(e) => editShot(i, { line: e.target.value })} />
          </label>
          <label className="field">
            <span className="tray-label">말하는 사람</span>
            <input value={s.speaker || ""} placeholder="화면 밖 목소리면 내레이션"
              onChange={(e) => editShot(i, { speaker: e.target.value })} />
          </label>
          <label className="field">
            <span className="tray-label">초</span>
            <input type="number" value={s.seconds ?? 0}
              onChange={(e) => editShot(i, { seconds: Math.round(Number(e.target.value) || 0) })} />
          </label>
          <div className="row-actions">
            <button className="mini" onClick={() => moveShot(i, -1)} disabled={busy}>↑</button>
            <button className="mini" onClick={() => moveShot(i, 1)} disabled={busy}>↓</button>
            <button className="mini" onClick={() => removeShot(i)} disabled={busy}>삭제</button>
          </div>
        </div>
      ))}

      <button className="mini" onClick={addShot} disabled={busy}>장면 추가</button>

      <div className="step-actions">
        <BackButton stepKey="scenario" />
        <div className="fwd">
          <button className="cta" disabled={busy || !ok} onClick={confirm}>
            목소리 단계로 →
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-ui.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 굽는다 — 소스 문자열 검사가 못 잡는 것을 잡는다**

Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: `✓ Compiled successfully` 그리고 라우트 목록에 `/create/[id]/scenario` 가 보인다

- [ ] **Step 6: 커밋**

```bash
npx vitest run
git add app/create/\[id\]/scenario/page.js tests/scenario-ui.test.js
git commit -m "feat(scenario): 시나리오를 검토하고 고치는 화면"
```

---

### Task 9: ①자료 — 되묻기를 없앤다

**Files:**
- Modify: `app/create/[id]/briefing/page.js`
- Modify: `app/api/projects/[id]/briefing/route.js`
- Test: `tests/briefing-ui.test.js` (기존 파일 수정) · `tests/scenario-ui.test.js` (추가)

**Interfaces:**
- Produces: ①자료는 **설명·사진·설정만** 받는다. 질문 생성·답 저장 경로가 사라진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다 (`tests/scenario-ui.test.js` 에 추가)**

```js
const briefing = readFileSync("app/create/[id]/briefing/page.js", "utf8");

describe("①자료 — 되묻지 않는다", () => {
  it("★ 질문·답 칸이 없다", () => {
    expect(briefing).not.toContain("asked");
    expect(briefing).not.toMatch(/여쭤|질문/);
  });

  it("★ 다음 버튼이 시나리오로 간다", () => {
    expect(briefing).toContain("/scenario");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/scenario-ui.test.js`
Expected: FAIL — `asked` 가 남아 있다

- [ ] **Step 3: 구현한다**

- `app/create/[id]/briefing/page.js` — 질문 목록·답 입력·[더 여쭤보기] 를 걷어낸다. 남는 것은 설명(`material.text`)·사진·길이·화면비·모델·화질과 [시나리오 만들기] 버튼이다. 버튼은 `router.push('/create/<id>/scenario')`
- `app/api/projects/[id]/briefing/route.js` — `body?.kind === "develop"` 블록을 통째로 지운다. `extractBriefing` 호출도 지운다(시나리오가 `topic`·`focus` 를 답한다). 자료·사진 저장만 남긴다

⚠️ **`briefing` 필드 자체는 문서에서 지우지 않는다.** 옛 프로젝트가 그 값을 들고 있고, `buildShowsMessages` 가 시나리오가 없을 때 폴백으로 읽는다(Task 7).

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `npx vitest run tests/scenario-ui.test.js`
Expected: PASS

- [ ] **Step 5: 전체 테스트 + 굽기**

```bash
npx vitest run
SHOTFORM_DIST_DIR=.next-verify npx next build
```
`tests/briefing-ui.test.js` 의 질문 관련 단정이 깨진다 — 없어진 기능이므로 그 단정을 지운다.

- [ ] **Step 6: 커밋**

```bash
git add app/create/\[id\]/briefing/page.js app/api/projects/\[id\]/briefing/route.js tests/briefing-ui.test.js tests/scenario-ui.test.js
git commit -m "feat(briefing): 되묻지 않는다 — 설명과 사진만 받는다"
```

---

### Task 10: 원고를 걷어낸다

**Files:**
- Delete: `app/create/[id]/script/page.js` · `app/api/projects/[id]/script/route.js`
- Modify: `lib/script.js` (남길 것만 남긴다) · `lib/auto.js` · `lib/briefing.js`
- Test: 기존 테스트 정리

**★ 마지막에 하는 이유:** 앞 아홉 태스크가 다 그린이어야 원고를 지워도 무엇이 깨졌는지 구분된다. 먼저 지우면 모든 실패가 한 덩어리로 온다.

- [ ] **Step 1: 무엇이 원고를 읽는지 전수 조사한다**

```bash
grep -rn "script" lib app --include=*.js | grep -v "scripts/" | grep -v node_modules
```

목록을 **보고에 적는다.** 지목된 것이 전부라고 가정하지 않는다 — 이 저장소에서 "지목된 곳이 전부가 아니다"가 네 번 나왔다.

- [ ] **Step 2: 남길 것과 지울 것을 가른다**

`lib/script.js` 에서 **남기는 것**: `CHARS_PER_SEC`·`estimateSeconds` 처럼 다른 모듈이 쓰는 순수 함수만. **지우는 것**: 원고 생성·되돌리기·`scriptScore`·`targetChars`·`SPEECH_DENSITY`.
어느 쪽인지는 Step 1 의 grep 결과가 정한다.

- [ ] **Step 3: 지우고 돌린다**

```bash
git rm app/create/\[id\]/script/page.js app/api/projects/\[id\]/script/route.js
npx vitest run
```

깨진 테스트를 하나씩 본다. **원고 기능을 재는 테스트는 지우고, 다른 것을 재다가 원고를 쓰던 테스트는 시나리오로 고친다.** 판단이 서지 않으면 고치지 말고 보고한다.

- [ ] **Step 4: 굽는다**

Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: `✓ Compiled successfully` · 라우트 목록에 `/create/[id]/script` 가 **없다**

- [ ] **Step 5: 전체 확인**

```bash
npx vitest run
git status --porcelain
```

- [ ] **Step 6: 커밋**

```bash
git add -u
git add lib/script.js
git commit -m "refactor: 원고를 걷어낸다 — 컷의 원본은 이제 시나리오다"
```

---

## 마무리

- [ ] `npx vitest run` 전부 그린
- [ ] `SHOTFORM_DIST_DIR=.next-verify npx next build` 성공
- [ ] `SHOTFORM_FAKE=all npm run dev` 로 ①자료 → ②시나리오 → 확정까지 **0원으로 관통**해 본다. 시나리오를 손으로 고쳐 초 합계가 어긋나게 만들고 다음 버튼이 잠기는지 눈으로 본다
- [ ] 측정 스크립트를 커밋한다 — `scripts/measure/scenario.mjs` 로 시나리오를 n회 뽑아 규칙 위반율·장면 수·내레이션 비율을 낸다. 일회용 하네스로 재고 버리면 수치가 보고서에만 남는다
- [ ] 유료 fal 관통은 **사장님 승인 후에만**
