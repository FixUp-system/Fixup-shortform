# 시나리오를 흐름으로 · 자막을 받아쓰기로 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 모델에게 **끊기지 않는 흐름**을 주고(컷 분할은 이미지용 내부 단계로 내림), 자막은 **완성본 받아쓰기의 실측 시각**으로 붙인다.

**Architecture:** `shots[]` 는 그대로 두고 **`scenario.text` 하나**를 흐름으로 바꾼다. 자막은 `burnSubtitles` 에 `cues` 우회 인자를 내어 아래층(`toAss`)을 그대로 쓴다. STT 는 이 저장소에 처음 붙는 외부 서비스다.

**Tech Stack:** Next.js App Router · fal(seedance r2v · nano-banana · **STT 미정**) · Anthropic(시나리오) · vitest

**Spec:** `docs/superpowers/specs/2026-08-19-scenario-as-flow-design.md`

## Global Constraints

- 작업 디렉터리는 **`C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate`** 뿐이다(워크트리가 여럿이다).
- **유료 API 실제 호출 금지** — 단, **Task 1·Task 4 는 예외**(각각 승인 필요, 아래 명시).
- **git commit 은 하되 push 는 하지 않는다.** 커밋할 때 **경로를 명시**한다.
- 주석은 한국어로, **왜 그렇게 했는지**를 적는 문체.
- 기준선 **3,510 passed / 10 skipped / 0 failed**. 회귀 0.
- ⚠️ `lib/ad/scenario.js`·`lib/ad/llm.js` 는 **프로덕션 광고가 함께 쓴다**(한 편 $3.63).
- 화면 테스트는 소스 판정이므로 **주석을 걷어내고** 잰다.
- `npx next build` 는 돌리지 않는다(dev 서버를 죽인다) — 마지막에 컨트롤러가 한 번 한다.

---

### Task 1 — 받아쓰기가 가능한지부터 확인한다 (★ 이 결과가 나머지를 정한다)

**이 태스크는 조사다. 코드를 쓰지 않는다.**

`lib/subtitles.js` 의 `toAss` 는 `{ start, end, text }`(초 단위)만 있으면 자막을 굽는다. 문제는 **그 목록을 어디서 얻느냐**다.

- [ ] **fal 이 여는 STT 엔드포인트와 단가**를 찾는다(문서 URL·정확한 값). 후보를 둘 이상 비교한다.
- [ ] ★ **문장/단어별 시각을 주는지** 확인한다. **총 길이만 주면 이 설계는 성립하지 않는다** — 그때는 즉시 멈추고 대안을 보고한다.
- [ ] **한국어 정확도**에 대해 알 수 있는 것(관련 실측: Seedance 한글은 발음은 맞고 글자는 틀린다).
- [ ] `.env.local` 에 이미 STT 관련 키가 있는지.
- [ ] **실제로 한 번 돌려 본다** — 완성된 광고 원본(`renders` 버킷의 `<id>-raw.mp4`)을 하나 받아 받아쓰기에 넣고, **나온 시각과 글자를 그대로 보고**한다.
  - ⚠️ **유료다. 컨트롤러 승인 뒤에만 실행한다.** 예상 비용을 먼저 보고하고 기다린다.

**돌려줄 것:** 위 다섯의 답 + **"이 설계가 성립하는가"에 대한 판정** + 성립한다면 쓸 엔드포인트와 단가.

---

### Task 2 — `shows` 가 실제로 오게 한다 (다른 태스크와 독립, 먼저 해도 된다)

**Files:** `lib/ad/llm.js` · `tests/ad-llm.test.js`(또는 새 파일)

`SCENARIO_SCHEMA` 에 `shows` 가 없고 `additionalProperties: false` 라 SYSTEM 이 요구해도 모델이 못 낸다. **실측: 저장된 시나리오 6개 전부 `shows` 0.**

- [ ] **Step 1** — 실패 테스트: 스키마의 `shots.items.properties` 에 `shows` 가 있고, `required` 에 들어 있는지. (SYSTEM 문자열만 재는 기존 테스트로는 이 결함을 못 잡는다는 것을 주석에 남긴다.)
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — 스키마에 `shows: { type: "string" }` 추가, `required` 에도. `additionalProperties: false` 는 **그대로 둔다**(그게 이 스키마의 성질이다).
- [ ] **Step 4** — 통과 확인 + 전체 회귀 0
- [ ] **Step 5** — 커밋

⚠️ **이 태스크만으로는 "실제로 온다"를 증명하지 못한다.** 라이브 확인은 Task 4 에서 함께 한다.

---

### Task 3 — 자막이 실측 시각을 받을 수 있게 한다 (Task 1 과 병렬 가능)

**Files:** `lib/compose.js` · `tests/subtitles-cues.test.js`(신규)

`toAss` 는 컷 구조를 모르는데 **`burnSubtitles` 가 `cuts` 를 강제**하고 내부에서 `buildCues` 를 부른다.

- [ ] **Step 1** — 실패 테스트: `burnSubtitles({ projectId, cues: [{start:1.2,end:3.4,text:"안녕"}], ... })` 가 **`buildCues` 를 안 거치고** 그 시각 그대로 `.ass` 를 만드는지(ffmpeg 는 주입으로 막고 `.ass` 내용을 검사).
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — `cues` 인자를 낸다. **주면 그것을 쓰고, 안 주면 예전 그대로**(`cuts` → `buildCues`). 광고·단계별이 글자 그대로 동작해야 한다.
  - `seconds` 반환값은 `cues` 경로에서 어떻게 셀지 정하고 근거를 주석에.
- [ ] **Step 4** — 통과 + 광고·단계별 자막 회귀(`tests/subtitles*.test.js`·`tests/compose*.test.js`) 확인
- [ ] **Step 5** — 커밋

---

### Task 4 — 시나리오를 흐름으로 (★ 프로덕션 광고가 함께 쓴다)

**Files:** `lib/ad/scenario.js`(SYSTEM) · `scripts/measure/probe-scenario.mjs`(전후 비교) · 테스트

- [ ] **Step 1** — 실패 테스트: SYSTEM 이 **장면 번호·초 표기를 요구하지 않는지**, 흐름으로 쓰라고 말하는지, 그리고 **`order` 앵커 규칙**(그림 자리를 `(1)`·`(2)` 로 표시)을 요구하는지. `shots[]` 요구는 **그대로 남아야** 한다(내부 단위).
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — SYSTEM 을 고친다:
  - `text` 는 **하나로 이어지는 흐름**. `Scene N (a-bs):` 같은 분할 표기를 쓰지 않는다
  - 연출 세부(카메라·조명·렌즈감)를 **일일이 지정하지 않는다** — 영상 모델이 처리한다. 지금 SYSTEM 의 "반드시 말로 적는다 / 빠뜨리면 밋밋해진다"를 걷어낸다
  - **대사는 그대로 흐름 안에** 따옴표로 남긴다(`withSpokenLines` 가 그것을 확인한다)
  - `shots[]` 는 계속 낸다 — `beat`·`shows`·`line`·`seconds` 는 **이미지·자막·화면이 쓰는 내부 값**이다
- [ ] **Step 4** — 통과 + 전체 회귀 0
- [ ] **Step 5** — ★ **측정**: `node scripts/measure/probe-scenario.mjs` 로 **전/후를 나란히 비교**한다. 이 도구는 지금 SYSTEM 을 대상으로 만들어졌고 "전"을 파일에 박제하는 관례가 있다.
  - 볼 것: 장면 수 · **초 합** · 글자/자막 요구가 나온 자리 수 · **`shows` 가 실제로 오는지**(Task 2 의 라이브 확인이 여기서 된다)
  - ⚠️ **유료(약 $0.10, Anthropic 직접 호출). 컨트롤러 승인 뒤에만.** 결과를 보고에 그대로 적는다
- [ ] **Step 6** — 커밋(측정 결과를 커밋 메시지에)

---

### Task 5 — 받아쓰기를 붙인다 (Task 1 이 "성립한다"를 낸 뒤에만)

**Files:** `lib/stt.js`(신규) · `lib/costs.js` · 테스트

관용구는 `lib/tts.js` 를 따른다: **가짜 판정 → `assertBudget` → 호출 → `addRecord`**.

- [ ] **Step 1** — 실패 테스트: 주입 fetch 로 나가는 요청과, 응답을 `{ cues: [{start,end,text}] }` 로 옮기는 변환. 가짜 모드에서 값이 안 나가는지.
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — 구현. ⚠️ **함께 고쳐야 하는 자리:**
  - `lib/costs.js` 의 `PRICE_TABLE` 에 항목 추가(접두사 순서 주의 — 더 구체적인 것이 위)
  - ★ **`FAL_PREFIXES` 에 반드시 추가**. 안 넣으면 `SHOTFORM_FAKE=fal` 에서 **진짜 돈이 나간다**
  - `assertBudget` 의 `amount` 와 `addRecord` 의 `estimateCost` **인자가 같아야** 게이트와 장부가 안 갈린다
  - `stage` 문자열(예: `"받아쓰기"`) — `/costs` 화면이 그대로 표시한다
- [ ] **Step 4** — 통과 + 회귀 0
- [ ] **Step 5** — 커밋

---

### Task 6 — 수거가 받아쓰기로 자막을 굽는다

**Files:** `lib/film/pipeline.js` · 테스트

- [ ] **Step 1** — 실패 테스트: 수거가 완성본을 받아쓰고 그 `cues` 로 `burnSubtitles` 를 부르는지. **받아쓰기가 실패해도 원본을 잃지 않는지**(지금 자막 실패 처리와 같은 규율).
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — 구현. 받아쓰기 실패 시 **옛 방식(시나리오 초)으로 떨어질지, 자막 없이 갈지** 정하고 근거를 주석에.
- [ ] **Step 4** — 통과 + 회귀 0
- [ ] **Step 5** — 커밋

---

### Task 7 — 두 방식 문구를 흐름에 맞춘다

**Files:** `lib/film/mode.js` · 테스트

- [ ] **Step 1** — 실패 테스트: `order` 문구가 **앵커 규칙**을 말하는지, `refs` 문구가 "장면 순서는 위 글에 적혀 있다"가 아니라 **흐름을 가리키는지**. 둘이 여전히 다른지.
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — 구현. **함께**: `refs` 세 축 프롬프트 결함을 고친다 — `person` 이 마지막 장면에 딸려 인물 없는 장면이면 무의미한 초상이 되고, `place` 는 "empty of people" 이라면서 사람 묘사를 재료로 다 넣는다. **B 에만 있는 결함이라 비교를 오염시킨다.**
- [ ] **Step 4** — 통과 + 회귀 0
- [ ] **Step 5** — 커밋

---

### Task 8 — 앞 회차가 남긴 후속 둘

**Files:** `app/api/film/[id]/scenario/route.js` · `app/film/[mode]/page.js` · 테스트

- [ ] **Step 1** — 실패 테스트 둘:
  - **굽는 중에도 시나리오 재작성이 막히는가**(지금은 `video?.url` 만 봐서 굽는 창 동안 열려 있다)
  - **그림 6회를 다 쓴 방식이 있으면** 시나리오 재작성이 막히는가(안 막으면 굽기도 400·그림도 400 이라 **값을 치를 길이 없는 프로젝트**가 된다)
- [ ] **Step 2** — 실패 확인
- [ ] **Step 3** — 구현(각각 조건 한 줄). 화면도 그 두 경우에 [다시 쓰기] 버튼을 잠근다 — 지금은 **누르면 항상 400 인 버튼**이 열려 있다.
- [ ] **Step 4** — 통과 + 회귀 0
- [ ] **Step 5** — 커밋

---

## 순서와 병렬

```
Task 1 (조사·유료 승인)  ─┐
Task 2 (shows 스키마)    ─┼─ 서로 독립, 병렬 가능
Task 3 (cues 우회)       ─┘
        ↓
Task 4 (시나리오 흐름 · 유료 측정) ← Task 2 뒤에(shows 확인이 여기서 된다)
        ↓
Task 5 (STT) ← Task 1 이 "성립한다"를 냈을 때만
        ↓
Task 6 (수거가 받아쓰기로)
        ↓
Task 7 (문구) · Task 8 (후속) ─ 병렬 가능
```

⚠️ **구현 서브에이전트는 한 번에 하나만** 띄운다(같은 워크트리라 전체 테스트가 서로 간섭한다 — 앞 회차에서 실제로 겪었다).

## 마무리

- [ ] `npx vitest run` 전체 그린
- [ ] **`npx next build`** — dev 서버를 끄고 굽고 `.next` 지우고 다시 띄운다. 앞 회차에서 3,484 그린인 채 기능이 죽은 적이 있다
- [ ] push 하지 않는다 — 배포는 사용자가 요청할 때만
- [ ] 남은 미검증을 보고에 적는다: 흐름이 정말 덜 끊기는지 · 앵커가 끊는 신호로 읽히지 않는지 · 받아쓰기 한국어 정확도 · SYSTEM 변경 뒤 광고 품질
