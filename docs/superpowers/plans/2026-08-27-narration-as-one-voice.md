# 내레이션을 한 사람의 말로 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내레이션(화면 밖 목소리)을 **컷에서 떼어 영상 전체 한 벌**로 만든다. 그래서 컷이
바뀌는 자리에서 말이 끊기지 않고, 말이 "그 컷의 설명"이 아니라 **영상 전체를 설명하는 한
사람의 말**이 된다.

**Architecture:** 새 장치를 거의 안 만든다. 음성은 지금도 **영상 모델이** 만들고
(`generate_audio: true`), 모델에게 가는 것은 **프롬프트 안의 따옴표 대사**다. 그래서 바꾸는
것은 세 자리뿐이다 — ① 시나리오가 내는 **모양**(대사가 장면마다 → 한 벌) ② 굽기 지시문이
그 한 벌을 **끝에 한 번** 싣는 것 ③ 자막이 그 한 벌에서 나오는 것. 옛 문서는 `narration`
필드가 없으므로 **예전 길로 그대로** 돈다.

**Tech Stack:** Next.js(App Router, 순수 JS) · vitest · Anthropic SDK(`claude-fable-5`) ·
fal(`bytedance/seedance-*`) · Supabase

**Spec:** `docs/superpowers/specs/2026-08-27-narration-as-one-voice-design.md`

## Global Constraints

- **`main` 에 직접 쓰지 않는다.** 브랜치는 `feat/reel-cut-r2v`. 푸시·배포는 사용자가 요청할 때만.
- **유료 생성(fal)은 실행 전 반드시 사용자 승인.** 이 계획에서 값이 나가는 것은 **Task 8 하나**다.
  그 앞의 일곱은 전부 0원(테스트·`SHOTFORM_FAKE`·LLM 단독)으로 끝난다.
- **회귀 0 이 계약이다.** `narration` 이 없는 문서는 프롬프트가 **글자 그대로** 같아야 한다 —
  각인(`video.of`)이 그 글 위에 서 있어서, 한 글자만 달라도 이미 값을 치른 클립이 낡는다.
- **판정은 테스트가 한다.** 린터도 타입체커도 없다. `npx vitest run` 이 유일한 관문이다.
- **화면 파일을 손댔으면 한 번 굽는다.** dev 서버를 끄고 `npx next build && rm -rf .next`.
- **값이 사는 곳은 한 곳이다.** 초당 글자 수·언어 계수는 `lib/cuts.js` 옆의 한 자리,
  내레이션 판독은 `lib/reel/narration.js` 하나.
- **화면(`"use client"`)이 import 하는 모듈은 `fs` 를 끌면 안 된다.**
- **heredoc 으로 코드를 넣지 마라** — 역슬래시가 한 겹 먹힌다(이 저장소가 여러 번 밟았다).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/reel/narration.js` (신규) | `reelNarration(project)` · 문장 쪼개기 · 길이 판정 — **순수** |
| `lib/ad/scenario.js` (수정) | 스키마에 `narration` · 지시문 규칙 셋 · `normalizeScenario` 가 그 필드를 지킨다 |
| `lib/scenario-rules.js` (수정) | `checkScenario` 가 내레이션 길이를 잰다(초 × 계수) |
| `lib/reel/oneshot.js` (수정) | `buildOneShotPrompt` 가 내레이션 한 벌을 끝에 붙인다 |
| `lib/subtitles.js` (수정) | 자막 원천이 `narration` 이면 문장 목록, 아니면 컷(옛 길) |
| `lib/speech-timing.js` (수정) | 정렬 단위가 "말하는 컷" → "말하는 조각"(문장) |
| `app/reel/[id]/scenario/page.js` (수정) | 내레이션 한 벌을 보여 준다(지금은 컷마다 대사) |

---

### Task 1: 내레이션 판독 한 곳 — `lib/reel/narration.js`

**왜 먼저인가:** 뒤의 모든 태스크가 "이 프로젝트가 새 길인가 옛 길인가"를 묻는다. 그 판정이
두 벌이 되면 지시문은 새 길로, 자막은 옛 길로 가는 어긋남이 생긴다.

**Files:**
- Create: `lib/reel/narration.js`
- Test: `tests/reel-narration.test.js`

**Step 1: 판독**
- [ ] `reelNarration(project)` — `scenario.narration.text` 가 비어 있지 않으면 `{ text, sayAs }`,
      아니면 **`null`**(= 옛 길). 공백만 있는 것은 없는 것으로 본다
- [ ] `narrationSentences(text)` — 자막·정렬이 쓸 문장 목록. **쪼개기 규칙을 새로 만들지
      말고** `lib/cuts.js` 의 `splitSentences` 를 그대로 쓴다(두 벌이면 자막과 정렬이 갈린다)
- [ ] `narrationLimit(seconds, lang)` — 목표 글자 수 상한. 지금은 **한국어 계수 5.5 하나**다.
      ⚠️ 다른 언어는 잰 적이 없다 — 계수 표를 만들되 값은 한국어 것 하나만 넣고,
      모르는 언어는 그 값으로 떨어진다(주석에 "실측 전"이라고 못 박는다)

**Step 2: 순수 규율**
- [ ] import 는 `lib/cuts.js` 하나. ⚠️ 그 파일이 `fs` 를 끄는지 확인하고, 끌면
      `splitSentences` 만 순수 모듈로 내린다(화면이 이 파일을 읽는다)

**Verify:** `npx vitest run tests/reel-narration.test.js`

---

### Task 2: 시나리오가 내레이션을 한 벌로 낸다

**Files:**
- Modify: `lib/ad/scenario.js` (JSON 스키마 · 지시문 · `normalizeScenario`)
- Test: `tests/reel-narration-scenario.test.js`

**Step 1: 스키마**
- [ ] 응답 JSON 에 `"narration": { "text": "...", "say_as": "..." }` 를 더한다
- [ ] `normalizeScenario` 가 그 필드를 **살려서 저장**한다(모르는 필드를 버리는 자리라 안 하면
      조용히 사라진다). 문자열이 아니면 버린다

**Step 2: 지시문 규칙 셋** (이 태스크의 본체다 — 글이 곧 제품이다)
- [ ] **하나의 이어지는 말**이다. 장면을 하나씩 짚지 마라("이건 키링이고, 이건 콜라보고"가
      아니라 한 사람이 이어서 말하는 한 문단)
- [ ] **길이**: 목표 초 × 계수(한국어 5.5자)를 넘지 마라 — 말이 화면보다 길면 뒤가 잘린다
- [ ] **장면 서술(`shots[].shows`)에 대사를 넣지 마라** · `text`(모델 지시문)에도 장면마다
      따옴표 대사를 흩지 마라 ← 지금 지시문의 *"각 장면의 대사는 그 자리가 흐르는 대로
      따옴표로 원문 그대로 넣는다"* 를 **이 규칙으로 갈아 끼운다**

**Step 3: 옛 필드**
- [ ] `shots[].line` 은 **그대로 둔다**(지우면 옛 문서의 자막이 통째로 사라진다).
      새 문서에서는 비어도 된다 — 화면은 이미 빈 값을 견딘다

**Verify:** `npx vitest run tests/reel-narration-scenario.test.js` ·
`SHOTFORM_FAKE=fal node scripts/measure/scenario.mjs 1 15` 로 **실제 글을 눈으로 읽는다**
(대사가 장면에서 빠졌는가 · 한 문단으로 이어지는가 · 길이가 맞는가)

---

### Task 3: 시나리오 게이트가 길이를 잰다

**왜:** 프롬프트로만 부탁하면 모델이 안 지킨다 — 이 저장소의 규율은 **"지켜져야 하는 것은
코드가 판정한다"** 이고, ②시나리오가 사람이 멈추는 유일한 자리다.

**Files:**
- Modify: `lib/scenario-rules.js` (`checkScenario`)
- Test: `tests/reel-narration-gate.test.js`

- [ ] `narration.text` 가 있으면 길이를 잰다 — `narrationLimit(target_seconds, lang)` 초과면 결함
- [ ] 문구는 사장님 말로: *"내레이션이 N자예요 — 15초에는 82자까지 담을 수 있어요."*
- [ ] ⚠️ **없는 것은 결함이 아니다** — 옛 문서·옛 흐름이 그대로 통과해야 한다
- [ ] 장면 초 합·컷 수 판정은 **손대지 않는다**

**Verify:** `npx vitest run tests/reel-narration-gate.test.js`

---

### Task 4: 굽기 지시문이 한 벌을 끝에 싣는다

**Files:**
- Modify: `lib/reel/oneshot.js` (`buildOneShotPrompt`)
- Test: `tests/reel-narration-prompt.test.js`

- [ ] `narration` 이 있으면 격자 설명 + 장면 서술 **뒤에** 한 덩어리를 붙인다:
      *"A single continuous voiceover runs across the whole film … It is one uninterrupted
      narration, not one line per shot — do not pause between shots. Says exactly, in <언어>:
      "<text>" … No one in frame speaks or moves their lips."*
- [ ] ★ **새 문장을 발명하지 않는다** — `lib/cuts.js` 의 내레이션 갈래가 쓰는 문장을 한 벌
      단위로 옮긴다(그 문구는 실측으로 다듬어진 것이다)
- [ ] `say_as` 가 있으면 읽는 표기를 함께 준다(지금 `shots[].say_as` 규칙과 같은 모양)
- [ ] ⚠️ `narration` 이 **없으면 한 글자도 안 바뀐다**(회귀 0 — 각인이 이 글이다)

**Verify:** `npx vitest run tests/reel-narration-prompt.test.js` + 옛 프로젝트 문서로
`buildOneShotPrompt` 를 불러 **예전 문자열과 완전히 같은지** 단정

---

### Task 5: 자막이 그 한 벌에서 나온다

**Files:**
- Modify: `lib/subtitles.js` · `lib/speech-timing.js`
- Test: `tests/reel-narration-subtitles.test.js`

- [ ] 자막 원천: `reelNarration(project)` 이 있으면 **문장 목록**, 없으면 지금처럼 컷
- [ ] `alignSpeech` 의 단위를 "말하는 컷" → "말하는 조각"으로 넓힌다. **하는 일은 같다**
      (whisper 조각을 순서대로 물린다) — 받는 목록만 바뀐다
- [ ] ★ **글자는 여전히 whisper 것을 안 쓴다.** 모델이 "끓이기만"을 "끄기만"으로 발음한
      실측이 근거다(그 파일 머리말)
- [ ] 조각 수가 문장 수와 안 맞을 때: **남는 문장은 시각 없이 둔다**(지금 규칙과 같다).
      임의로 늘려 붙이면 자막이 영상 밖으로 나간다(08-25 에 겪었다)

**Verify:** `npx vitest run tests/reel-narration-subtitles.test.js`

---

### Task 6: ②시나리오 화면이 한 벌을 보여 준다

**Files:**
- Modify: `app/reel/[id]/scenario/page.js`
- Test: `tests/reel-narration-ui.test.js`

- [ ] 시나리오 본문 아래에 **내레이션 한 벌**을 보여 준다(읽는 글) — 지금은 컷마다 흩어져 있다
- [ ] 글자 수를 함께 적는다(`82/82자`) — 게이트가 재는 값과 **같은 함수**로
- [ ] ⚠️ 옛 문서에는 그 자리가 **아예 안 뜬다**(빈 칸을 만들지 않는다)
- [ ] 화면 규칙 그대로: 값·크레딧 문구 없음 · 수정은 한국어 한 칸

**Verify:** `npx vitest run` · **화면을 손댔으니 한 번 굽는다**

---

### Task 7: 0원 관통

**Files:** 없음(확인만)

- [ ] `SHOTFORM_FAKE=fal npm run dev` — ②시나리오에서 내레이션이 한 벌로 나오는지
- [ ] 그 글을 **눈으로 읽는다**: 장면을 짚지 않고 이어지는가 · 길이가 맞는가 ·
      장면 서술에 대사가 안 남았는가
- [ ] ④영상 프롬프트 화면에서 **굽기에 나갈 글 전체**를 확인한다(내레이션이 끝에 한 번)
- [ ] 옛 프로젝트를 하나 열어 **예전과 똑같이** 도는지 본다(회귀 0)

**Verify:** 위 넷이 눈으로 확인될 것 · `npx vitest run` 그린

---

### Task 8: 🔴 한 편 굽기 (사장님 승인 게이트)

**값이 나간다** — 15초 720p Seedance 2.0 ≈ **$4.55**(2.5 는 ≈$6.93).
**승인 없이 실행하지 마라.**

- [ ] 승인받고 `SHOTFORM_FAKE` 를 끄고 한 편을 만든다
- [ ] **귀로 판정한다**: 말이 끊기지 않는가 · 말과 화면이 어긋나지 않는가 · 뒤가 잘리지 않는가
- [ ] 자막 시각이 맞는가(whisper 는 이 회차에 되살아났다)
- [ ] 원장에 실지출을 남기고, **같은 프로젝트의 이전 판과 나란히** 적는다

**되돌리는 길:** 새 길은 `narration` 유무로 갈린다. 지시문을 되돌리고 그 필드를 안 내면
예전과 글자 그대로 돌아온다.

---

## 하지 않는 것 (범위 밖)

- **우리 TTS 로 갈아타기** — `generate_audio` 는 말만이 아니라 그 장면의 소리 전부를 만든다.
  끄면 조용한 화면에 목소리만 뜬다(설계 §5)
- **컷별 갈래(45·60초)의 끊김 해소** — 한 벌을 비례로 잘라 싣는다(지금과 같음). 그 갈래는
  여전히 조각난다 — 감수한다
- **언어별 초당 글자 수 계수** — 실측 전에는 한국어 값 하나. 재는 법은 whisper 조각의
  (글자 수 ÷ 초)이고 그 장치는 이미 있다
- **화면 속 인물 대사(립싱크)** — 그 말은 그 컷에 그대로 남는다
