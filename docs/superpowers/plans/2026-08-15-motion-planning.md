# 움직임 설계 (Motion Planning) 구현 계획 — B단계

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컷의 움직임을 **카메라·피사체·배경** 세 축으로 나눠 설계하고, 그 값이 지문부터
영상 프롬프트·각인·판정·화면까지 다섯 자리를 빠짐없이 흐르게 한다.

**Architecture:** `lib/speeds.js`·`lib/shots.js` 와 같은 계열의 **닫힌 목록 + 순수 판정** 파일
(`lib/motion.js`)을 하나 새로 만들고, 그것을 유일한 원천으로 삼아 지문·검증·프롬프트·각인·
판정·화면이 전부 그 목록에서 파생되게 한다. 축 하나를 목록에서 빼면 여섯 자리가 함께 줄어드는
것이 이 설계의 안전장치다 — 유료 실측에서 무너졌을 때 되돌아올 자리가 **목록 한 줄**이어야 한다.

**Tech Stack:** 순수 JavaScript(타입스크립트·린터 없음), Next.js 15 App Router, vitest,
fal.ai(Kling v3 / Seedance 2.0)

**Spec:** `docs/superpowers/specs/2026-08-14-motion-planning-design.md`

---

## Global Constraints

이 절의 값은 **글자 그대로** 쓴다. 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **축은 셋이고 id 는 `camera` · `subject` · `ambient` 다.** `lighting` 축은 만들지 않는다
  (조명은 `environment`·`shows` 가 이미 나눠 갖는다. 조명 **변화**는 `ambient` 가 받는다).
- **`intensity` 를 별도 필드로 만들지 않는다 — `speed` 에 통합한다.** `speed`(닫힌 5단계)의
  정의를 *"얼마나 빠른가"* 에서 **"얼마나 빠르고 센가"** 로 넓혀 강도까지 맡긴다.
  **speed 하나가 세 축 전체를 덮는다** — 축마다 speed 를 따로 주지 않는다.
- ⚠️ **`lib/speeds.js` 의 `SPEEDS` 배열은 한 글자도 고치지 않는다.** `clip` 영어 문구는
  클립 프롬프트에 그대로 실리고 **각인(`clipKey`)에도 들어간다** — 문구를 손대면 저장된 컷이
  전부 낡아 유료 [다시 만들기]가 열린다. 통합은 **지문에서의 정의**만 바꾼다.
- **세 축은 전부 선택이다.** 하나도 없으면 지금과 같아야 한다.
- **옛 컷은 안 낡는다**: 세 축이 하나도 없는 컷의 `buildClipPrompt` 출력과 `clipKey` 출력은
  이 브랜치 직전과 **바이트 동일**이어야 한다.
- **세 축은 클립 전용이다.** `buildImagePrompt` 에 싣지 않고, 이미지 각인에도 넣지 않는다
  (`lib/cuts.js` 의 *"shows 에 카메라 움직임을 적지 않는다 — 움직임을 섞으면 그림이 흐려진다"*).
- **`lib/motion.js` 는 import 문이 없어야 한다** — 화면("use client")이 직접 읽는다
  (`lib/speeds.js`·`lib/shots.js`·`lib/aspects.js` 와 같은 이유).
- **`static` 속도와 그 문구(`almost still, only the faintest drift`)는 남긴다.**
  없앨 것은 `motion` 이 비었을 때의 폴백 문자열이다.
- **얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작 금지는 그대로 둔다** — 그 규칙에는
  근거가 붙어 있다(`805628f`: *"지금 기술로는 뭉개진다"*).
- **fal 이미지·영상 생성은 사용자 승인 없이 실행하지 않는다.** Task 8 이 그 게이트다.
  ★ 반면 **LLM 호출(프롬프트 생성·화면 설계·대본)은 묻지 않고 한다** — 2026-08-15 사용자 지시:
  *"프롬프트 생성은 내 허락 없이 자동으로 진행하고 이미지나 동영상은 허락을 받고 진행해."*
  경계는 **fal 이미지/영상**이지 "돈이 나가는 모든 것"이 아니다.
- `npx vitest run` 이 유일한 게이트다. 매 태스크 끝에 그린이어야 한다.
- `git add -A` 금지 — 건드린 파일만 `git add`. **`next.config.mjs` 는 절대 커밋하지 않는다.**
- `npm run build` 금지(다른 세션의 dev 서버가 죽는다). 컴파일 확인은
  `SHOTFORM_DIST_DIR=.next-verify npx next build`.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `lib/motion.js` **(새로)** | 축 목록 하나 + 순수 판정. import 없음 | 1, 5 |
| `lib/cuts.js` | 지문(`SHOWS_SYSTEM`)이 목록에서 만들어진다 · `buildClipPrompt` 가 축을 싣는다 · 폴백 | 1, 3 |
| `lib/validate.js` | `validateShows` 가 세 축을 받는다 | 2 |
| `lib/steps.js` | `clipKey` 가 세 축을 각인한다 | 4 |
| `lib/pipeline.js` | 판정에 축 균형을 더한다 | 5 |
| `app/create/[id]/script/page.js` | ②대본에서 사장님이 세 축을 읽는다 | 6 |
| `tests/motion.test.js` **(새로)** | 목록·판정 | 1, 5 |
| `tests/cuts.test.js` · `tests/validate.test.js` · `tests/steps.test.js` | 기존 파일에 더한다 | 2, 3, 4 |
| `tests/script-ui.test.js`(해당 파일) | 화면 계약 | 6 |

---

### Task 1: 축 목록과 지문

축이 사는 자리를 만들고, **지문이 그 목록에서 만들어지게** 한다. 목록과 지문이 따로 놀면
모델에게 시키는 것과 코드가 받는 것이 갈린다.

**Files:**
- Create: `lib/motion.js`
- Create: `tests/motion.test.js`
- Modify: `lib/cuts.js` (`SHOWS_SYSTEM` 의 motion 항목)
- Test: `tests/motion.test.js`, `tests/cuts.test.js`

**Interfaces:**
- Produces: `MOTION_AXES` (배열), `isMotionAxis(id)`, `motionAxisFor(id)`, `axesOf(cut)`
- Consumes: 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/motion.test.js
import { describe, it, expect } from "vitest";
import { MOTION_AXES, isMotionAxis, motionAxisFor, axesOf } from "../lib/motion.js";

describe("MOTION_AXES — 축 목록", () => {
  it("셋이고 순서가 카메라·피사체·배경이다", () => {
    expect(MOTION_AXES.map((a) => a.id)).toEqual(["camera", "subject", "ambient"]);
  });
  it("모든 축이 id·label·hint 를 갖는다", () => {
    for (const a of MOTION_AXES) {
      expect(typeof a.id).toBe("string");
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
    }
  });
  it("isMotionAxis 는 목록 밖을 거절한다", () => {
    expect(isMotionAxis("camera")).toBe(true);
    expect(isMotionAxis("lighting")).toBe(false);
    expect(isMotionAxis(null)).toBe(false);
  });
});

describe("axesOf — 컷이 실제로 가진 축", () => {
  it("적힌 축만, 목록 순서로 돌려준다", () => {
    const cut = { ambient: "창밖으로 사람들이 지나간다", camera: "천천히 뒤로 물러난다" };
    expect(axesOf(cut)).toEqual([
      { id: "camera", text: "천천히 뒤로 물러난다" },
      { id: "ambient", text: "창밖으로 사람들이 지나간다" },
    ]);
  });
  it("빈 문자열·공백은 없는 것으로 본다", () => {
    expect(axesOf({ camera: "   ", subject: "" })).toEqual([]);
  });
  it("컷이 없어도 던지지 않는다", () => {
    expect(axesOf(null)).toEqual([]);
    expect(axesOf(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/motion.test.js`
Expected: FAIL — `Failed to resolve import "../lib/motion.js"`

- [ ] **Step 3: `lib/motion.js` 를 만든다**

```js
// 컷의 움직임 축 — 화면(클라이언트)과 화면 설계·클립 요청(서버)이 함께 본다.
//
// import 가 없다(lib/speeds.js·shots.js·aspects.js·styles.js·voices.js·clip-limits.js 와 같은 이유).
//
// 왜 축을 나누는가: 2026-07-28(805628f)부터 movement 는 "카메라가 움직이거나 피사체가
// 움직이거나 — 둘 다 넣지 않는다"였다. 그 규칙에는 **근거가 붙어 있지 않았고**, 그 커밋의
// 검증은 "가짜 이미지 모드"(=프롬프트 문자열 확인)라 나온 영상을 본 것이 아니었다.
// 그래서 축을 열되, 무너지면 이 목록에서 한 줄을 빼면 지문·검증·프롬프트·각인·판정·화면이
// 함께 줄어들도록 원천을 하나로 뒀다.
//
// ⚠️ 유료 실측 전이다. 무너지면 여기에 실측을 적고 축을 줄인다.
//
// ★ ambient 가 진짜 빈칸이었다 — 지금까지 배경 움직임을 적을 자리가 없어서 배경은 shows 의
//   정지 서술 그대로 얼어 있거나 모델 재량이었다. 조명 변화도 여기가 받는다(lighting 축을
//   따로 만들면 조명이 environment·shows 와 함께 세 군데가 된다).
export const MOTION_AXES = [
  {
    id: "camera",
    label: "카메라",
    hint: "카메라가 어떻게 움직이는가 — 다가간다·물러난다·따라간다·올려본다",
  },
  {
    id: "subject",
    label: "피사체",
    hint: "화면 속 인물이나 물건이 무엇을 하는가",
  },
  {
    id: "ambient",
    label: "배경",
    hint: "주변에서 일어나는 일 — 지나가는 사람, 흔들리는 것, 김·먼지·물결, 빛의 변화",
  },
];

export function isMotionAxis(id) {
  return MOTION_AXES.some((a) => a.id === id);
}

export function motionAxisFor(id) {
  return MOTION_AXES.find((a) => a.id === id) || null;
}

// 이 컷이 실제로 가진 축만, 목록 순서로 돌려준다.
// 순서를 목록에 맡기는 이유: 프롬프트·각인·화면이 전부 이 함수를 쓰면 세 곳의 순서가
// 저절로 같아진다. 순서가 갈리면 각인이 흔들려 멀쩡한 클립이 낡는다.
export function axesOf(cut) {
  const out = [];
  for (const a of MOTION_AXES) {
    const text = typeof cut?.[a.id] === "string" ? cut[a.id].trim() : "";
    if (text) out.push({ id: a.id, text });
  }
  return out;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/motion.test.js`
Expected: PASS

- [ ] **Step 5: 지문을 목록에서 만든다**

`lib/cuts.js` 의 `SHOWS_SYSTEM` 에서 **motion 항목을 찾아**(현재 *"motion 은 그 정지 화면에서
이어지는 움직임 하나다. 카메라가 움직이거나 피사체가 움직이거나 — 둘 다 넣지 않는다"* 로
시작하는 항목) 아래로 갈아 끼운다. **`MOTION_AXES` 를 import 해 축 줄을 만들어 낸다** —
목록에 손대면 지문이 저절로 따라오게 하는 것이 요점이다.

```js
// 파일 상단 import 에 더한다
import { MOTION_AXES } from "./motion.js";

// SHOWS_SYSTEM 안, motion 항목 자리 (템플릿 리터럴로 조립한다)
`- **움직임은 축마다 따로 적는다.** 아래 셋 중 **이 컷에 해당하는 것만** 적고, 없는 축은 빈
  문자열로 둔다. 셋을 다 채우려고 없는 움직임을 지어내지 않는다.
${MOTION_AXES.map((a) => `  · ${a.id}(${a.label}) — ${a.hint}`).join("\n")}
  각 축은 **몇 초 안에 끝나는 작은 변화 하나**로 적는다. 한 축에 둘을 넣지 않는다.
  ✗ camera: "돌면서 뒤로 물러났다가 다시 다가간다"(한 축에 셋)
  ✓ camera: "천천히 뒤로 물러난다"
  ✓ subject: "컵을 들어 입으로 가져간다"
  ✓ ambient: "창밖으로 사람들이 지나간다"
  얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작은 적지 않는다 — 지금 기술로는 뭉개진다.`
```

⚠️ **옛 `motion` 을 지문에서 없앤다**(모델은 이제 세 축으로 답한다). 그러나 **코드는
`motion` 을 계속 읽는다** — 저장된 옛 컷이 그 필드를 갖고 있다(Task 3).

⚠️ `lib/cuts.js` 의 다른 항목 중 **`transition` 설명이 "움직임은 motion 이 맡는다"**를
가리킨다. 그 문장을 "움직임은 움직임 축이 맡는다"로 고친다. **`shows` 항목의 "움직임은
motion 에 따로 적는다"도 같다.** grep 으로 `motion` 을 전부 훑어 지문 안의 언급을 빠짐없이
고친다 — 남으면 모델이 없는 필드를 답한다.

- [ ] **Step 5-b: `speed` 의 정의를 넓힌다 (intensity 통합)**

같은 `SHOWS_SYSTEM` 안에서 **speed 항목**을 찾는다. 현재 이렇게 시작한다:

> `- **speed 는 그 움직임이 얼마나 빠른지다.** 다섯 중 하나를 골라 그 낱말 그대로 적는다:`

첫 문장을 이렇게 고치고, 세 축을 덮는다는 것을 한 줄 더한다:

```
- **speed 는 그 컷의 움직임이 얼마나 빠르고 센지다.** 다섯 중 하나를 골라 그 낱말 그대로 적는다:
  static(거의 안 움직인다) · slow(천천히) · realtime(실제 속도) · fast(폭발적으로) ·
  extreme_slowmo(극단적 슬로모션 — 절정 한 컷에만).
  ★ **세 축 전체에 걸리는 값이라 컷 하나에 하나만 고른다.** 축마다 따로 주지 않는다 —
  카메라가 빠르면 그 컷은 빠른 컷이다.
```

⚠️⚠️ **`lib/speeds.js` 는 열지 마라.** `SPEEDS` 의 `clip` 영어 문구는 클립 프롬프트와
각인에 그대로 실린다 — 한 글자만 바꿔도 **저장된 컷이 전부 낡아** 유료 버튼이 열린다.
다섯 문구는 이미 강도를 말하고 있다(`fast, explosive motion`). 바꾸는 것은 **모델이 speed 를
고르는 기준**이지 그 결과 문자열이 아니다.

회귀 테스트로 그것을 못 박는다:

```js
// tests/cuts.test.js 에 더한다
describe("speed — intensity 통합은 문구를 바꾸지 않는다", () => {
  it("지문이 speed 를 '빠르고 센지'로 정의한다", () => {
    expect(SHOWS_SYSTEM).toContain("얼마나 빠르고 센지");
  });
  it("★ clip 문구는 그대로다 — 바뀌면 저장된 컷이 전부 낡는다", () => {
    expect(SPEEDS.map((s) => s.clip)).toEqual([
      "almost still, only the faintest drift",
      "slow, deliberate motion",
      "real-time speed, natural pacing",
      "fast, explosive motion",
      "extreme slow motion, time nearly frozen",
    ]);
  });
});
```

- [ ] **Step 6: 지문 회귀 테스트를 더한다**

```js
// tests/cuts.test.js 에 더한다
import { MOTION_AXES } from "../lib/motion.js";

describe("SHOWS_SYSTEM — 움직임 축", () => {
  it("세 축이 전부 지문에 나온다", () => {
    for (const a of MOTION_AXES) {
      expect(SHOWS_SYSTEM).toContain(`${a.id}(${a.label})`);
    }
  });
  it("옛 motion 필드를 더 이상 요구하지 않는다", () => {
    expect(SHOWS_SYSTEM).not.toContain("movement 는 그 정지 화면에서");
    expect(SHOWS_SYSTEM).not.toContain("둘 다 넣지 않는다");
  });
});
```

※ 위 `not.toContain` 두 줄의 문자열은 **실제 지문에서 사라질 문구를 그대로** 적는다.
구현자는 지문을 고친 뒤 그 문구를 확인해 리터럴을 맞춘다.

- [ ] **Step 7: 전체 테스트**

Run: `npx vitest run`
Expected: PASS (기존 그린 수 유지 + 새 테스트)

- [ ] **Step 8: 커밋**

```bash
git add lib/motion.js tests/motion.test.js lib/cuts.js tests/cuts.test.js
git commit -m "feat(motion): 움직임을 카메라·피사체·배경 세 축으로 나눈다

'카메라든 피사체든 하나만'은 805628f 부터의 규칙인데 근거가 붙어 있지 않았고,
그 커밋의 검증은 가짜 이미지 모드(=프롬프트 문자열 확인)였다. 나온 영상을 본 적이 없다.

축 목록을 한 곳(lib/motion.js)에 두고 지문이 그 목록에서 만들어지게 했다.
유료 실측에서 무너지면 목록에서 한 줄을 빼는 것으로 되돌아온다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 검증이 세 축을 받는다

**Files:**
- Modify: `lib/validate.js` (`validateShows`)
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: `MOTION_AXES`, `isMotionAxis` (Task 1)
- Produces: 컷 객체에 `camera`·`subject`·`ambient` 문자열 필드(있을 때만)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/validate.test.js 에 더한다
describe("validateShows — 움직임 축", () => {
  const base = (extra) => ({ shots: [{ shows: "미디엄 샷, 커피잔", ...extra }] });

  it("세 축을 받아 컷에 싣는다", () => {
    const out = validateShows(base({
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      ambient: "창밖으로 사람들이 지나간다",
    }), 1);
    expect(out[0].camera).toBe("천천히 뒤로 물러난다");
    expect(out[0].subject).toBe("컵을 들어 입으로 가져간다");
    expect(out[0].ambient).toBe("창밖으로 사람들이 지나간다");
  });

  it("빈 축은 싣지 않는다 — 키 자체가 없어야 한다", () => {
    const out = validateShows(base({ camera: "  ", subject: "컵을 든다" }), 1);
    expect("camera" in out[0]).toBe(false);
    expect(out[0].subject).toBe("컵을 든다");
  });

  it("축이 하나도 없어도 컷을 버리지 않는다", () => {
    const out = validateShows(base({}), 1);
    expect(out).toHaveLength(1);
    expect(out[0].shows).toBe("미디엄 샷, 커피잔");
  });

  it("옛 motion 도 계속 받는다 — 저장된 프로젝트가 그것을 갖고 있다", () => {
    const out = validateShows(base({ motion: "천천히 회전한다" }), 1);
    expect(out[0].motion).toBe("천천히 회전한다");
  });

  it("목록 밖 축은 무시한다", () => {
    const out = validateShows(base({ lighting: "빛이 밝아진다" }), 1);
    expect("lighting" in out[0]).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `out[0].camera` 가 undefined

- [ ] **Step 3: 구현**

`lib/validate.js` 의 `validateShows` 안, 기존 `motion` 처리 **바로 뒤**에 더한다.
`motion` 처리는 **지우지 않는다**(옛 프로젝트).

```js
    // 움직임 축 — 셋 다 선택이다. 적힌 것만 싣는다.
    // motion(옛 자유 서술 하나)을 남겨 둔 이유: 저장된 프로젝트가 그 필드를 갖고 있고,
    // 그 컷을 다시 만들지 않고도 클립을 살 수 있어야 한다(buildClipPrompt 가 폴백한다).
    for (const a of MOTION_AXES) {
      const v = typeof s?.[a.id] === "string" ? s[a.id].trim() : "";
      if (v) shot[a.id] = v;
    }
```

파일 상단에 `import { MOTION_AXES } from "./motion.js";` 를 더한다.

- [ ] **Step 4: 통과 확인 후 전체**

Run: `npx vitest run tests/validate.test.js` → PASS
Run: `npx vitest run` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/validate.js tests/validate.test.js
git commit -m "feat(validate): 화면 설계 응답에서 세 움직임 축을 받는다

옛 motion 은 그대로 받는다 — 저장된 프로젝트가 그 필드를 갖고 있고,
다시 만들지 않고도 클립을 살 수 있어야 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 영상 프롬프트가 세 축을 싣는다 + 폴백을 좁힌다

**이 태스크가 이 계획의 값을 만든다.** 앞 둘은 재료였다.

**Files:**
- Modify: `lib/cuts.js` (`buildClipPrompt`)
- Test: `tests/cuts.test.js`

**Interfaces:**
- Consumes: `axesOf` (Task 1), Task 2 가 실은 필드
- Produces: 축이 실린 클립 프롬프트

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/cuts.test.js 에 더한다
describe("buildClipPrompt — 움직임 축", () => {
  it("세 축이 목록 순서로 실린다", () => {
    const p = buildClipPrompt({
      ambient: "창밖으로 사람들이 지나간다",
      camera: "천천히 뒤로 물러난다",
      subject: "컵을 들어 입으로 가져간다",
      speed: "slow",
    });
    const iCam = p.indexOf("천천히 뒤로 물러난다");
    const iSub = p.indexOf("컵을 들어 입으로 가져간다");
    const iAmb = p.indexOf("창밖으로 사람들이 지나간다");
    expect(iCam).toBeGreaterThan(-1);
    expect(iCam).toBeLessThan(iSub);
    expect(iSub).toBeLessThan(iAmb);
  });

  it("축 하나만 있어도 된다", () => {
    const p = buildClipPrompt({ camera: "천천히 다가간다" });
    expect(p).toContain("천천히 다가간다");
  });

  it("★ 축이 하나도 없으면 옛 motion 을 쓴다 — 저장된 프로젝트", () => {
    const p = buildClipPrompt({ motion: "천천히 회전한다" });
    expect(p).toContain("천천히 회전한다");
  });

  it("★ 축도 motion 도 없을 때만 폴백이 나온다", () => {
    expect(buildClipPrompt({})).toContain("거의 정지");
    expect(buildClipPrompt({ camera: "다가간다" })).not.toContain("거의 정지");
    expect(buildClipPrompt({ motion: "회전한다" })).not.toContain("거의 정지");
  });
});

describe("buildClipPrompt — 옛 컷은 한 글자도 안 바뀐다", () => {
  it("축 없는 컷의 출력이 골든과 바이트 동일이다", () => {
    // 구현자가 축을 넣기 **전에** 실행해 얻은 실제 출력을 리터럴로 박는다.
    const GOLDEN = "<구현 전 실측값을 그대로>";
    expect(buildClipPrompt({ motion: "천천히 회전한다", speed: "slow" })).toBe(GOLDEN);
  });
});
```

⚠️ **골든은 구현 전에 뽑는다.** 축을 넣기 **전** 코드로 위 입력을 실행해 출력을 그대로 리터럴에
박고, 그 다음에 구현한다. `git show <SHA>` 로 잡지 마라 — 이 브랜치가 squash-merge 되면
그 커밋이 도달 불가가 되어 **진짜 회귀와 구분 안 되는 실패**로 터진다(이 계획의 앞 단계에서
리뷰가 실제로 잡은 결함이다).

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/cuts.test.js -t "움직임 축"`
Expected: FAIL

- [ ] **Step 3: 구현**

`lib/cuts.js` 의 `buildClipPrompt` 안, 현재 아래 줄을 찾는다:

```js
  const base = motion || "거의 정지 상태, 아주 느린 카메라 이동";
```

갈아 끼운다:

```js
  // 움직임 — 축이 있으면 축이, 없으면 옛 motion 이, 그것도 없으면 폴백이 말한다.
  //
  // ★ 폴백이 마지막인 이유: 축이 셋이라 "움직일 것이 마땅치 않다"가 성립하기 어렵다.
  //   피사체가 안 움직여도 카메라나 배경은 움직인다. 폴백은 세 축과 motion 이 전부 빈
  //   컷에만 남는다 — 옛 프로젝트와 화면 설계가 통째로 실패한 경우다.
  const axes = axesOf(cut);
  const base = axes.length
    ? axes.map((a) => a.text).join(" ")
    : motion || "거의 정지 상태, 아주 느린 카메라 이동";
```

파일 상단에 `import { axesOf } from "./motion.js";` 를 더한다.

⚠️ **`axesOf` 가 받는 것은 컷 객체다.** `buildClipPrompt` 안에서 `motion` 을 어떤 이름의
변수로 꺼내 쓰고 있는지 확인하고, 컷 객체 자체를 넘겨라.

⚠️ **이음새를 확인하라.** 축 텍스트가 한국어 문장이고 이미 마침표로 끝날 수 있다.
`join(" ")` 이 `"...물러난다. ...가져간다."` 를 만드는지, 마침표가 없어 붙어 버리는지
실제 값으로 확인하고, 필요하면 이음새를 다듬어라. **이중 공백·부유 구분자가 없어야 한다.**

- [ ] **Step 4: 통과 확인 후 전체**

Run: `npx vitest run` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/cuts.js tests/cuts.test.js
git commit -m "feat(clip): 영상 프롬프트가 카메라·피사체·배경 움직임을 싣는다

폴백('거의 정지…')을 마지막으로 밀었다. 축이 셋이라 '움직일 것이 마땅치 않다'가
성립하기 어렵다 — 피사체가 안 움직여도 카메라나 배경은 움직인다.

축이 하나도 없는 컷은 옛 motion 을 그대로 쓴다(골든으로 바이트 동일을 잡았다).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 각인이 세 축을 본다

프롬프트에 실리는데 각인에 없으면, 움직임을 고쳐도 클립이 안 낡아 **화면과 영상이 조용히
갈린다.** A단계가 같은 이유로 stage·cast·subject·tone 을 각인에 넣었다.

**Files:**
- Modify: `lib/steps.js` (`clipKey`)
- Test: `tests/steps.test.js`

**Interfaces:**
- Consumes: `axesOf` (Task 1)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/steps.test.js 에 더한다
describe("clipKey — 움직임 축", () => {
  it("축을 고치면 클립이 낡는다", () => {
    const a = { shows: "미디엄 샷", camera: "천천히 뒤로 물러난다" };
    const b = { shows: "미디엄 샷", camera: "빠르게 다가간다" };
    expect(clipKey(a)).not.toBe(clipKey(b));
  });

  it("축을 더하면 낡는다", () => {
    const a = { shows: "미디엄 샷", camera: "물러난다" };
    const b = { shows: "미디엄 샷", camera: "물러난다", ambient: "사람들이 지나간다" };
    expect(clipKey(a)).not.toBe(clipKey(b));
  });

  it("★ 축이 없는 컷의 각인은 골든과 바이트 동일이다", () => {
    const GOLDEN = "<구현 전 실측값을 그대로>";
    expect(clipKey({ shows: "미디엄 샷", motion: "회전한다", speed: "slow" })).toBe(GOLDEN);
  });

  it("★ project 를 안 주면 프롬프트와 똑같이 침묵한다", () => {
    // A단계 최종 리뷰 I-3 과 같은 불변이다 — 각인이 프롬프트보다 더 말하면 거짓 낡음이 되고,
    // 거짓 낡음은 유료 버튼을 연다.
    const cut = { shows: "미디엄 샷", camera: "물러난다" };
    expect(clipKey(cut)).toBe(clipKey(cut, undefined));
  });
});
```

- [ ] **Step 2: 실패 확인 → Step 3: 구현**

`clipKey` 에서 A단계가 stage·cast·subject·tone 을 붙인 자리를 찾아, **`buildClipPrompt` 와
같은 함수를 같은 순서로** 쓰도록 축을 더한다. 축이 없으면 아무것도 붙이지 않는다.

⚠️ **구분자 충돌을 확인하라.** A단계 리뷰가 `subject:커피:진한` 같은 값에서 구분자가 겹치는
것을 Minor 로 남겼다. 축 텍스트는 자유 서술 한국어라 `|` 나 `:` 가 들어갈 수 있다.
같은 함정을 새로 만들지 마라.

- [ ] **Step 4: 전체 테스트 → Step 5: 커밋**

```bash
git add lib/steps.js tests/steps.test.js
git commit -m "fix(steps): 각인이 움직임 축을 본다

프롬프트에 실리는데 각인에 없으면 움직임을 고쳐도 클립이 안 낡아
화면과 영상이 조용히 갈린다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 판정 — 축이 한쪽으로 쏠렸는가

**판정만 하고 강제하지 않으면 안 된다.** 이 저장소가 컷 길이에서 이미 겪었다.

⚠️ **Arc 규칙(시작-절정-마무리 형태)은 이번에 만들지 않는다.** 실측 분포가 없어서 감으로
임계를 정하게 된다 — `TIGHT_LIMIT` 이 스스로 *"이 선은 감이다"*라고 적어 둔 자리를 하나 더
만드는 것이다. 이번에 넣는 규칙은 **구조적 근거가 있는 것 하나뿐**이다.

**Files:**
- Modify: `lib/motion.js` (`motionVariety`)
- Modify: `lib/pipeline.js` (판정에 더한다)
- Test: `tests/motion.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
// tests/motion.test.js 에 더한다
import { motionVariety } from "../lib/motion.js";

describe("motionVariety — 축이 한쪽으로 쏠렸는가", () => {
  const cuts = (...specs) => specs.map((s) => s);

  it("전 컷이 카메라 하나만 쓰면 되돌린다", () => {
    const v = motionVariety(cuts(
      { camera: "물러난다" }, { camera: "다가간다" }, { camera: "올려본다" }
    ));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("카메라");
  });

  it("축이 섞이면 통과다", () => {
    expect(motionVariety(cuts(
      { camera: "물러난다" }, { subject: "컵을 든다" }, { ambient: "사람들이 지나간다" }
    )).ok).toBe(true);
  });

  it("한 컷이 여러 축을 쓰면 그것만으로도 다양하다", () => {
    expect(motionVariety(cuts(
      { camera: "물러난다", ambient: "김이 오른다" }, { camera: "다가간다" }
    )).ok).toBe(true);
  });

  it("컷이 둘 미만이면 판정하지 않는다", () => {
    expect(motionVariety([{ camera: "물러난다" }]).ok).toBe(true);
    expect(motionVariety([]).ok).toBe(true);
    expect(motionVariety(undefined).ok).toBe(true);
  });

  it("★ 축이 없는 컷은 셈에서 빠진다 — 옛 프로젝트가 재시도를 유발하면 안 된다", () => {
    expect(motionVariety(cuts({ motion: "회전한다" }, { motion: "흔들린다" })).ok).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인 → Step 3: 구현**

```js
// lib/motion.js 에 더한다

// 컷들이 한 축에만 매달려 있지 않은가.
//
// 왜 이 규칙 하나뿐인가: speedContrast 의 첫 규칙("전 컷이 같은 속도")과 같은 모양이라
// 구조적 근거가 있다 — 카메라만 계속 움직이는 영상과 피사체만 계속 움직이는 영상은 둘 다
// 단조롭고, 그 판정에 임계값이 필요 없다.
//
// ⚠️ Arc(시작-절정-마무리 형태)는 여기 없다. 실측 분포가 없어 임계를 감으로 정하게 된다.
//    표본이 쌓이면 그때 더한다.
//
// 축이 하나도 없는 컷은 셈에서 뺀다 — 저장된 옛 프로젝트가 재시도를 유발하면 안 된다
// (shotBalance 가 샷 크기 누락을 셈에서 빼는 것과 같은 이유).
export function motionVariety(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (list.length < 2) return { ok: true, reason: null };
  const used = new Set();
  let counted = 0;
  for (const c of list) {
    const axes = axesOf(c);
    if (!axes.length) continue;
    counted += 1;
    for (const a of axes) used.add(a.id);
  }
  if (counted < 2) return { ok: true, reason: null };
  if (used.size < 2) {
    const only = motionAxisFor([...used][0]);
    return {
      ok: false,
      reason: `${counted}컷이 전부 ${only.label} 움직임 하나뿐이다 — 다른 축을 섞는다`,
    };
  }
  return { ok: true, reason: null };
}
```

- [ ] **Step 4: 파이프라인에 붙인다**

`lib/pipeline.js` 의 재시도 루프(현재 `shotBalance` 와 `speedContrast` 를 부르는 자리)에
셋째 판정으로 더한다. **기존 둘과 같은 방식으로** 사유를 잇는다.

```js
      const shot = shotBalance(got);
      const speed = speedContrast(got);
      const move = motionVariety(got);
      if (shot.ok && speed.ok && move.ok) { redoReason = null; break; }
      redoReason = [shot.reason, speed.reason, move.reason].filter(Boolean).join(" 그리고 ");
```

⚠️ **이 자리의 계약을 바꾸지 마라** — 두 번째 시도도 미달이면 경고만 남기고 그대로 가는 것이
의도다(바로 위 주석). 판정을 하나 더한 것이지 강제를 바꾼 것이 아니다.

- [ ] **Step 5: 전체 테스트 → Step 6: 커밋**

---

### Task 6: ②대본 화면이 세 축을 보여 준다

사장님이 못 읽으면 고칠 수도 없다. 지금 화면은 `c.motion` 하나를 보여 준다.

**Files:**
- Modify: `app/create/[id]/script/page.js`
- Test: 해당 화면의 소스 검사 테스트 파일

- [ ] **Step 1: 현재 자리를 찾는다**

`app/create/[id]/script/page.js` 에서 `c.motion || "거의 정지, 아주 느린 카메라 이동"` 을
렌더하는 자리를 찾는다.

- [ ] **Step 2: 축을 축별로 보여 준다**

`axesOf(c)` 로 축을 받아 `label` 과 함께 보여 준다. 축이 없으면 옛 `c.motion` 을, 그것도
없으면 지금 폴백 문구를 그대로 쓴다 — **`buildClipPrompt` 와 같은 순서**다.

⚠️ **화면은 `lib/motion.js` 를 직접 import 한다**(`lib/speeds.js` 를 그렇게 쓰고 있다).
`lib/motion.js` 에 import 문이 없는 것이 그래서 중요하다.

⚠️ **`setInterval` 을 새로 쓰지 마라** — 이 화면은 소스 문자열 검사로 막혀 있다.

- [ ] **Step 3: 화면 계약 테스트를 더한다**

세 축의 `label` 이 화면 소스에 나타나는지 확인한다.

⚠️ **이 테스트는 소스 문자열을 훑을 뿐 컴파일을 안 한다.** 그래서 Step 4 가 필수다.

- [ ] **Step 4: ★ 한 번 굽는다**

Run: `SHOTFORM_DIST_DIR=.next-verify npx next build`
Expected: 전 화면 컴파일 성공

이 저장소는 화면 파일이 문법이 깨진 채 **테스트 전부 그린인데 앱이 안 뜬** 사고를 겪었다.
화면을 손댔으면 반드시 굽는다.

- [ ] **Step 5: 전체 테스트 → 커밋**

---

### Task 7: 무료 측정 — 값이 다섯 자리를 지나는가

> ★★ **이번에는 측정 도구를 커밋한다.** 이 브랜치에서 리뷰가 **세 번** 같은 것을 지적했다:
> *"실측 수치가 재현 가능한 형태로 저장소에 없다"*(9입력 대조 · A단계 44컷 측정 · 낡는 그림
> 10장). 매번 일회용 하네스를 만들고 버려서, 수치는 보고서에만 남고 **아무도 다시 잴 수 없다.**
> 개별 실수가 아니라 **관례가 없는 것**이다. 이 저장소에는 이미 `scripts/measure/` 가 있고
> (`shows-motion-leak.mjs` 가 같은 성격의 측정을 커밋해 두었다) 거기 두면 끝난다.

**Files:**
- Create: `scripts/measure/motion-axes.mjs` — **커밋한다**
- Modify: `.superpowers/sdd/2026-08-15-motion-planning/progress.md` (결과 기록)

**먼저 읽을 것**: `scripts/measure/shows-motion-leak.mjs` — 같은 성격의 측정이고, 머리말에
*무엇을 왜 재는가*·*비용이 얼마인가*·*어떻게 부르는가* 를 적는 이 저장소의 관례가 들어 있다.
⚠️ 다만 그 스크립트는 `data/projects` 를 읽는데 **저장은 2026-07-31 에 Supabase 로 이관됐다** —
프로젝트를 읽는 방법은 현재 코드(`lib/store/`)에서 확인하라.

- [ ] **Step 1: 저장된 프로젝트로 옛/새 프롬프트를 나란히 낸다**

A단계 Task 4 가 같은 일을 한 기록이 `.superpowers/sdd/2026-08-14-clip-prompt-context/progress.md`
에 있다. 그 방식을 그대로 쓴다.

**보고할 수치**: 전체 컷 수 · **바뀐 컷 수(0이어야 정상이다** — 저장된 컷에는 아직 새 축이
없다) · 폴백이 나오는 컷 수.

★ **여기서 바뀐 컷이 하나라도 나오면 "옛 컷은 안 낡는다" 제약이 깨진 것이다.** 멈추고 보고한다.

- [ ] **Step 2: 가짜 모드로 새 축이 실제로 채워지는지 본다**

```bash
SHOTFORM_DIST_DIR=.next-m7 SHOTFORM_FAKE=fal npx next dev -p 3007   # LLM 만 진짜
```

★ **승인 없이 진행한다** (2026-08-15 사용자 지시: *"프롬프트 생성은 내 허락 없이 자동으로
진행하고 이미지나 동영상은 허락을 받고 진행해"*). `SHOTFORM_FAKE=fal` 은 **LLM 만 진짜**이고
이미지·클립은 가짜라 fal 로 나가는 돈이 0이다 — 이 단계가 정확히 "프롬프트 생성"이다.

⚠️ **다른 세션이 서버를 띄웠을 수 있으니 `SHOTFORM_DIST_DIR` 과 포트를 반드시 갈라라.**
안 가르면 같은 `.next` 를 덮어써 돌아가던 서버가 404 가 된다(2026-08-13 실측).

한 편을 화면 설계까지 돌려 **모델이 실제로 세 축을 답하는지** 본다. 보고할 것:
- 컷별로 어느 축이 채워졌는가(축 분포)
- `ambient` 가 실제로 채워지는가 — **새로 연 축이라 모델이 무시할 수 있다**
- `motionVariety` 가 재시도를 유발했는가

- [ ] **Step 3: 조립된 프롬프트를 눈으로 확인**

컷 하나의 최종 클립 프롬프트를 통째로 출력해 **이음새·이중 공백·부유 구분자**를 본다.

- [ ] **Step 4: 원장에 기록**

---

### Task 8: ★ 유료 실측 — 정지 게이트 (사용자 승인 없이 시작하지 않는다)

> ⚠️⚠️ **이 태스크는 실행하지 않는다.** 컨트롤러는 Task 7 까지 마친 뒤 **멈추고**
> 사용자에게 결과를 보고한다. 승인이 오기 전에는 fal 을 부르지 않는다.

**왜 게이트인가**: 스펙 2절이 보인 대로 "둘 다 금지"는 미검증 가정이었다. 그러나 **여는 것도
미검증**이다. 이 저장소에는 이미 **통과된 적 없는 정지 게이트가 하나 있다**(컷 간 목소리
일관성). 게이트를 또 세우면서 안 지키면 게이트가 장식이 된다.

**승인이 나면 볼 것:**

1. 세 축이 동시에 적힌 컷에서 **그림이 무너지는가** — `805628f` 이 두려워한 바로 그것
2. `ambient` 가 살아 보이는가, 아니면 **노이즈**가 되는가
3. **Kling v3 와 Seedance 2.0 이 다르게 나오는가** — 모델이 둘이고 눈금·오디오 계약이
   이미 다르다. 움직임 계약도 다를 수 있다

**무너지면**: `lib/motion.js` 의 `MOTION_AXES` 에서 축을 빼고, **그 실측을 파일 머리말
주석에 적는다.** 다음 사람이 같은 것을 다시 열지 않도록.

**비용**: 15초 Kling v3 가 가장 싸다(≈$1.26). 컷 둘짜리 비교면 그보다 적다.

---

## 실행 순서와 멈추는 자리

```
Task 1 → 2 → 3 → 4 → 5 → 6 → 7  (전부 무료)
                                  ↓
                            ★ 여기서 멈춘다 — 사용자에게 보고
                                  ↓
                            승인 → Task 8 (유료)
```

## Self-Review 기록

- **스펙 커버리지**: 스펙 3-1(intensity 미채택)은 "만들지 않는다"라 태스크가 없다 —
  Global Constraints 가 지킨다. 3-2 → Task 1·2·3, 3-3(폴백) → Task 3, 3-4 → Task 5,
  3-5 → Task 1·2. 4절(게이트) → Task 7·8. 5절(다섯 자리) → Task 3·4·5·6 + Task 7 이 검산.
- **타입 일관성**: `axesOf(cut)` → `[{id, text}]` 를 Task 1 이 정의하고 3·5·6 이 그대로 쓴다.
  `motionVariety(cuts)` → `{ok, reason}` 은 `shotBalance`·`speedContrast` 와 같은 모양이다.
- **자리표시자**: 골든 문자열 두 개(`<구현 전 실측값을 그대로>`)는 의도적이다 —
  구현자가 구현 **전에** 실제 출력을 뽑아 박아야 한다. 계획이 미리 적으면 틀린 리터럴이
  잘못된 구현과 우연히 맞아 아무것도 증명하지 못한다.
