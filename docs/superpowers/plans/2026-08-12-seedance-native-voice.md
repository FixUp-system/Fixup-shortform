# 목소리를 클립이 만든다 — Seedance 네이티브 음성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seedance 프로젝트에서 목소리를 TTS 가 아니라 클립이 직접 만들게 한다 — 등장인물의 입모양까지 함께 온다.

**Architecture:** 새 계층을 만들지 않는다. 그림 일관성을 만드는 `cast[].look` 옆에 `voice` 를 더하고, 그것을 클립 프롬프트에 싣는다. 음성을 누가 만드는가는 `CLIP_PROFILES` 의 플래그 한 줄이 정한다 — Seedance 만 켠다.

**Tech Stack:** 새 의존성 없음 · Vitest

## Global Constraints

설계 `docs/superpowers/specs/2026-08-12-seedance-native-voice-design.md` 의 "지켜야 할 것" 을 그대로 옮긴다.

- ★★ **Kling·LTX 경로를 건드리지 않는다.** TTS·낭독 실측·합성의 `trim` 이 그대로 살아 있어야 한다. 모든 분기는 "이 프로필이 말하는가" 하나로만 갈린다
- ★★ **자막 경로를 한 줄도 바꾸지 않는다.** Seedance 자막은 한글이 변형된다(실측) — 정확한 글자는 계속 ffmpeg 가 태운다
- ★ **캐스팅 실패 폴백을 깨지 않는다.** 캐스팅이 실패해도 컷은 남고 파이프라인은 돈다(`lib/pipeline.js:108` 주석)
- ★ **인물이 없으면(`cast` 빈 배열) TTS 경로로 떨어진다.** 화면 밖 내레이션 설계는 이번 범위가 아니다
- `lib/pricing.js` 의 정가표(`VIDEO_PRICE`)를 바꾸지 않는다 — Seedance 는 오디오를 켜도 단가가 같다
- **새 npm 의존성 금지**
- **예상 못 한 실패는 고치지 말고 보고한다**

**값 (여러 태스크가 쓴다 — 글자 그대로):**

| | 값 |
|---|---|
| 프로필 플래그 이름 | `speaks` |
| 켜는 모델 | `bytedance/seedance-2.0` 만 |
| 캐스팅 새 필드 | `voice` |

**기준 테스트 수:** 시작 시 `npx vitest run` 으로 세라(문서 숫자는 낡는다). 매 태스크 끝에서 유지되거나 늘어야 한다.

**시작 BASE:** `git rev-parse HEAD` 로 기록하고 시작한다.

## ★ Task 0 은 유료다 — 컨트롤러가 사용자 승인을 받은 뒤에만 실행한다

Task 0 이 실패하면 **Task 1~6 을 구현하지 않는다.** 설계가 성립하지 않는다는 뜻이다.

---

### Task 0: ★ 실측 — 컷 간 목소리가 이어지는가

**Files:** 없음(측정만). 결과는 `docs/measurements/2026-08-12-seedance-voice.md` 에 남긴다.

**⚠️ 유료다.** Seedance 15초 = 80 크레딧. 현재 개발 계정 잔액 85.18 로 한 번 된다.

이것이 이 설계의 유일한 치명적 미지수다. 한 편은 컷을 **따로 만들어 이어 붙이므로**, 컷마다 목소리가 달라지면 한 편 안에서 화자가 바뀐 것처럼 들려 광고로 못 쓴다.

- [ ] **Step 1: 손으로 클립 3개를 만든다**

`FAL_KEY` 는 `.env.local` 에 있다. 같은 인물 서술·같은 목소리 서술을 **세 번 똑같이** 보내고, 대사만 바꾼다. 이미지는 `assets/refs/jordan.jfif` 처럼 인물이 있는 것을 쓰거나 없으면 먼저 한 장 만든다.

```bash
# 세 번 반복 — SENTENCE 만 바꾼다
curl -s https://fal.run/bytedance/seedance-2.0/image-to-video \
  -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
  -d '{
    "image_url": "<컷 이미지 URL>",
    "duration": 5,
    "aspect_ratio": "9:16",
    "generate_audio": true,
    "prompt": "20대 동양인 남성 농구 선수(짧은 검은 머리, 마른 근육형)가 카메라를 보며 말한다. 목소리: 중저음, 차분하고 단단한 톤. 대사: \"검정에 빨강. 이 배색이 제일 오래 사랑받았다.\" 자연스러운 입모양. The attached image is the first frame."
  }'
```

- [ ] **Step 2: 네 가지를 듣고 적는다**

1. **컷 간 목소리 일관성** ← 가장 중요. 세 클립을 이어 들었을 때 같은 사람인가
2. **길이 정확도** — 5초 안에서 말이 끝나는가. 무음이 몇 초 남는가
3. **`voice` 문구가 먹히는가** — "중저음" 을 적었을 때 실제로 그런가
4. **자막을 요구하지 않았는데 글자가 나오는가**

- [ ] **Step 3: 판정하고 기록한다**

`docs/measurements/2026-08-12-seedance-voice.md` 에 관측값을 적는다. 판정은 셋 중 하나다:

- **일관성 유지** → Task 1 로 간다
- **무너짐** → **여기서 멈춘다.** 관측값만 남기고 컨트롤러에게 보고한다. 목소리 고정 방법을 다시 설계해야 한다
- **길이가 크게 어긋남** → 추정 계수(5.5자/초)를 실측에서 다시 뽑아야 한다고 보고한다

---

### Task 1: 프로필이 "이 모델이 말하는가" 를 쥔다

**Files:**
- Modify: `lib/clip-limits.js:19-33`(`CLIP_PROFILES`)
- Test: `tests/clip-limits.test.js`

**Interfaces:**
- Produces: `CLIP_PROFILES[].speaks` (boolean) · `speaksFor(profile)` · `projectSpeaks(project)`

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/clip-limits.test.js` 에 describe 를 더한다(상단 import 에 없는 이름은 더한다):

```js
import { profileFor, speaksFor, projectSpeaks } from "../lib/clip-limits.js";

describe("음성을 누가 만드는가 — 모델이 정한다", () => {
  it("Seedance 는 클립이 말한다", () => {
    expect(speaksFor(profileFor("bytedance/seedance-2.0/image-to-video"))).toBe(true);
  });

  // ★ Kling 은 오디오를 켜면 단가가 $0.084 → $0.126 이고 립싱크가 미검증이다
  it("Kling 은 말하지 않는다 — TTS 낭독 그대로다", () => {
    expect(speaksFor(profileFor("fal-ai/kling-video/v3/standard/image-to-video"))).toBe(false);
  });

  it("모르는 모델은 말하지 않는 쪽으로 떨어진다", () => {
    expect(speaksFor(profileFor("어디회사/새모델"))).toBe(false);
  });

  // ★ 오디오를 켜는 것과 말하는 것은 같은 스위치다 — 갈리면 무음 클립에 대사를 넣거나
  //    소리 나는 클립 위에 TTS 를 덧씌운다
  it("말하는 모델만 generate_audio 가 켜져 있다", () => {
    expect(profileFor("bytedance/seedance-2.0/image-to-video").extra.generate_audio).toBe(true);
    expect(profileFor("fal-ai/kling-video/v3/standard/image-to-video").extra.generate_audio).toBe(false);
  });

  // ★★ 모든 컷에 말할 사람과 대사가 있어야 한다 — 하나라도 비면 그 컷만 무음이 되어
  // 한 편 안에서 원고 일부가 안 들린다. 섞지 않는다.
  describe("projectSpeaks — 한 편 안에서 소리의 출처가 갈리지 않는다", () => {
    const seed = (cast, cuts) => ({ settings: { i2v_model: "seedance-2.0" }, cast, cuts });
    const person = (cuts) => [{ id: "c1", who: "20대 남성", voice: "중저음", cuts }];
    const cuts2 = [{ idx: 0, sentence: "가" }, { idx: 1, sentence: "나" }];

    it("모든 컷에 인물이 있으면 말한다", () => {
      expect(projectSpeaks(seed(person([0, 1]), cuts2))).toBe(true);
    });

    it("한 컷이라도 인물이 없으면 전체가 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0]), cuts2))).toBe(false);
    });

    it("한 컷이라도 대사가 비면 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0, 1]), [{ idx: 0, sentence: "가" }, { idx: 1, sentence: "  " }]))).toBe(false);
    });

    it("인물이 아예 없으면 말하지 않는다", () => {
      expect(projectSpeaks(seed([], cuts2))).toBe(false);
      expect(projectSpeaks({ settings: { i2v_model: "seedance-2.0" }, cuts: cuts2 })).toBe(false);
    });

    it("컷이 없으면 말하지 않는다", () => {
      expect(projectSpeaks(seed(person([0, 1]), []))).toBe(false);
    });

    it("모델이 Kling 이면 인물이 다 있어도 말하지 않는다", () => {
      expect(projectSpeaks({ settings: { i2v_model: "kling-v3" }, cast: person([0, 1]), cuts: cuts2 })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: FAIL — `speaksFor` 가 없다.

- [ ] **Step 3: 프로필과 헬퍼를 더한다**

`lib/clip-limits.js` 의 Seedance 프로필을 고친다. **주석의 낡은 이유를 함께 고친다** — 지금 주석은 "우리 낭독과 두 겹이 된다" 인데 이제 낭독을 안 만든다:

```js
  {
    prefix: "bytedance/seedance-2.0",
    steps: null, min: 4, max: 15,
    // ★ 이 모델은 **클립이 직접 말한다**(입모양까지). 그래서 오디오를 켠다.
    // 켜도 단가가 같다(끄든 켜든 $0.3024/s) — 켜서 잃는 것이 없다.
    // 대신 우리 TTS 를 만들지 않는다. 둘 다 만들면 소리가 두 겹이 된다.
    speaks: true,
    extra: { generate_audio: true, resolution: "720p" },
  },
```

Kling·LTX 프로필에는 `speaks: false` 를 **명시**한다(없어서 undefined 로 떨어지는 것과 적어 둔 것은 다르다 — 다음 사람이 읽는다):

```js
  {
    prefix: "fal-ai/kling-video/v3",
    steps: null, min: 3, max: 15,
    // 오디오를 끄는 것이 코드 보장이어야 단가가 $0.084 다(켜면 $0.126). 무엇보다 클립에
    // 소리가 실리면 우리 낭독과 두 겹이 되고, 낭독이 컷 길이를 정하는 뼈대와 어긋난다.
    // ★ 립싱크 품질이 검증되지 않아 이 모델은 아직 말하지 않는다.
    speaks: false,
    extra: { generate_audio: false },
  },
  { prefix: "fal-ai/ltx-2", steps: [6, 8, 10, 12, 14, 16, 18, 20], speaks: false, extra: null },
```

파일 아래쪽(`clipProfileForProject` 다음)에 헬퍼를 둔다:

```js
export function speaksFor(profile) {
  return profile?.speaks === true;
}

// 이 프로젝트에서 클립이 말하는가.
//
// ★ 모델만으로는 부족하다 — **모든 컷에** 말할 사람과 대사가 있어야 한다.
//
// 인물은 컷마다 다르다. 사람이 나오는 컷은 클립이 말하지만 안 나오는 컷(제품 클로즈업)은
// 말할 사람이 없고, 그 컷만 무음이 되면 원고 일부가 안 들린다. 하나라도 비면 프로젝트
// 전체가 TTS 경로로 간다 — 한 편 안에서 소리의 출처가 갈리지 않게 한다.
//
// 화면 밖 내레이션(사물·정보 영상)의 설계는 아직 없다. 그때도 여기서 false 로 떨어진다.
export function projectSpeaks(project) {
  if (!speaksFor(clipProfileForProject(project))) return false;
  const cuts = project?.cuts || [];
  const cast = project?.cast || [];
  if (!cuts.length || !cast.length) return false;
  return cuts.every((cut) =>
    typeof cut?.sentence === "string" && cut.sentence.trim() !== "" &&
    cast.some((p) => Array.isArray(p?.cuts) && p.cuts.includes(cut.idx))
  );
}
```

- [ ] **Step 4: 그린을 확인한다**

Run: `npx vitest run tests/clip-limits.test.js`
Expected: PASS 전부

- [ ] **Step 5: ★ 두 스위치가 함께 움직이는지 변이로 확인한다**

Seedance 의 `generate_audio` 를 잠깐 `false` 로 바꾸고 돌린다.
Expected: "말하는 모델만 generate_audio 가 켜져 있다" 가 FAIL.
확인했으면 되돌린다(편집기로 — `git checkout` 을 쓰지 마라, 이 파일의 다른 작업까지 사라진다).

- [ ] **Step 6: 커밋**

```bash
git add lib/clip-limits.js tests/clip-limits.test.js
git commit -m "feat(clip): 프로필이 이 모델이 말하는가를 쥔다 — Seedance 만 켠다

Seedance 는 오디오를 켜도 단가가 같고 립싱크 품질이 실측됐다. Kling 은 켜면
단가가 1.5배이고 립싱크가 미검증이라 지금처럼 TTS 낭독을 쓴다.

★ 모델만으로는 부족하다 — 인물이 없는 영상은 화면 밖 내레이션이고 그 설계가
아직 없다. projectSpeaks 가 cast 를 함께 본다."
```

---

### Task 2: 캐스팅이 목소리를 정한다

**Files:**
- Modify: `lib/cast.js:20-49`(`CAST_SYSTEM`)
- Modify: `lib/validate.js:84-111`(`validateCast`)
- Test: `tests/validate.test.js`(없으면 `tests/cast.test.js`)

**Interfaces:**
- Produces: `validateCast` 가 돌려주는 인물에 `voice`(string, 선택) 가 실린다

★ `look` 과 정확히 같은 성질이다 — 없어도 인물을 버리지 않는다. 없으면 목소리 지시 없이 나갈 뿐이다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`validateCast` 를 재는 파일을 찾아라: `grep -rn "validateCast" tests/`. 그 파일에 더한다(없으면 `tests/cast-voice.test.js` 를 만들고 `import { validateCast } from "../lib/validate.js";`):

```js
describe("캐스팅이 목소리를 정한다", () => {
  const raw = (extra) => ({ cast: [{ who: "20대 동양인 남성", cuts: [1], ...extra }] });

  it("voice 를 그대로 싣는다", () => {
    const out = validateCast(raw({ voice: "중저음, 차분하고 단단한 톤" }), [], 1);
    expect(out[0].voice).toBe("중저음, 차분하고 단단한 톤");
  });

  it("앞뒤 공백을 턴다", () => {
    expect(validateCast(raw({ voice: "  높고 밝은 톤  " }), [], 1)[0].voice).toBe("높고 밝은 톤");
  });

  // ★ look 과 같은 규칙 — 없어도 인물을 버리지 않는다
  it("voice 가 없어도 인물은 남는다", () => {
    const out = validateCast(raw({ look: "짧은 검은 머리" }), [], 1);
    expect(out).toHaveLength(1);
    expect(out[0].voice).toBeUndefined();
  });

  it("빈 문자열은 싣지 않는다 — 빈 지시가 프롬프트에 들어가면 안 된다", () => {
    expect(validateCast(raw({ voice: "   " }), [], 1)[0].voice).toBeUndefined();
    expect(validateCast(raw({ voice: 42 }), [], 1)[0].voice).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/<그 파일>`
Expected: FAIL — `voice` 가 `undefined` 다.

- [ ] **Step 3: `validateCast` 에 한 줄을 더한다**

`lib/validate.js` 의 `look` 바로 아래에 같은 모양으로 둔다:

```js
    const look = typeof c?.look === "string" ? c.look.trim() : "";
    if (look) person.look = look;
    // 목소리 — look 이 그림 일관성을 만들듯 이것이 소리 일관성을 만든다.
    // 클립이 말하는 모델에서만 쓰인다(lib/clip-limits.js 의 speaks).
    // look 과 같은 규칙: 없어도 인물을 버리지 않는다.
    const voice = typeof c?.voice === "string" ? c.voice.trim() : "";
    if (voice) person.voice = voice;
```

- [ ] **Step 4: 프롬프트가 목소리를 요구하게 한다**

`lib/cast.js` 의 `CAST_SYSTEM` 에서 JSON 스키마 줄에 `voice` 를 더한다:

```
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","look":"외형 — 머리·체형·옷차림","voice":"목소리 — 음색과 톤","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)","cuts":[이 인물이 보이는 컷 번호들]}],"props":[{"photo_id":"올린 사진의 id","cuts":[그 사진에 찍힌 것이 보이는 컷 번호들]}]}
```

`who` 규칙을 인종까지 넓힌다(기존 두 줄을 갈아낀다):

```
- who 는 나이대·성별·인종이 드러나게 적는다. 그 값으로 사진을 고르고, 목소리도 여기서 따라간다.
  ✗ "손님" / "그 사람"
  ✓ "50대 한국인 남성 가게 주인" / "20대 동양인 남성 농구 선수"
```

`look` 규칙 **바로 아래**에 `voice` 규칙을 더한다:

```
- **voice 는 그 인물의 목소리다 — 음색과 톤을 적는다.**
  클립이 직접 말하는 모델에서 이것이 전 컷의 지시에 그대로 실려 같은 목소리가 나온다.
  look 이 그림에서 하는 일을 소리에서 한다 — 한 번 정하면 바꾸지 않는다.
  나이·성별은 who 에 이미 있으므로 되풀이하지 않는다.
  ✗ "20대 남성 목소리" / "좋은 목소리"
  ✓ "중저음, 차분하고 단단한 톤" / "높고 밝은 톤, 말이 빠른 편"
```

- [ ] **Step 5: 그린을 확인한다**

Run: `npx vitest run tests/<그 파일>`
Expected: PASS 전부

프롬프트를 소스로 재는 테스트가 있는지 확인한다: `npx vitest run tests/cast.test.js`. 깨지면 **고치지 말고 보고하라** — 프롬프트 문구를 재는 테스트는 의도가 따로 있다.

- [ ] **Step 6: 커밋**

```bash
git add lib/validate.js lib/cast.js tests/
git commit -m "feat(cast): 캐스팅이 목소리도 정한다

look 이 전 컷의 그림 지시에 실려 같은 사람을 그리듯, voice 가 전 컷의 클립 지시에
실려 같은 목소리를 만든다. 캐스팅은 영상당 한 번 돌고 인물이 자기 컷 번호를 답하므로
'같은 사람에게 같은 값'이 프롬프트 약속이 아니라 코드 보장이다.

who 에 인종을 더했다 — 그 값이 사진 선택과 목소리 양쪽으로 간다."
```

---

### Task 3: 클립이 대사를 말한다 ★ 이 계획의 핵심

**Files:**
- Modify: `lib/cuts.js:410-417`(`buildClipPrompt`)
- Modify: `lib/pipeline.js:473,517`(호출부 — 인자가 하나 는다)
- Modify: `lib/steps.js:100-107`(`clipKey`)
- Test: `tests/cuts.test.js:455`(기존 describe) · `tests/steps.test.js`

**Interfaces:**
- Consumes: Task 1 의 `projectSpeaks(project)` · Task 2 의 `cast[].voice`
- Produces: `buildClipPrompt(cut, project)` — **두 번째 인자가 는다.** 안 넘기면 지금 동작 그대로다(말하지 않는다)

★ 지금 프롬프트가 `No talking faces or lip sync.` 로 립싱크를 **금지**하고 있다. 말하는 경로에서는 그 문장을 빼야 한다 — 남겨 두면 모델에게 서로 반대되는 지시를 준다.

- [ ] **Step 1: 실패 테스트를 쓴다**

`tests/cuts.test.js` 의 `buildClipPrompt` describe 에 더한다(상단 import 는 이미 있다):

```js
  // ★ 말하지 않는 모델에서는 지금 동작 그대로여야 한다 — 옛 각인이 통째로 낡으면
  // 이미 값을 치른 클립을 다시 사게 된다
  it("project 를 안 넘기면 예전과 같다 — 립싱크를 금지한다", () => {
    const p = buildClipPrompt({ motion: "카메라가 천천히 뒤로 물러난다" });
    expect(p).toContain("No talking faces or lip sync");
    expect(p).not.toContain("says");
  });

  it("말하지 않는 모델(Kling)에서도 예전과 같다", () => {
    const kling = { settings: { i2v_model: "kling-v3" }, cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }] };
    const p = buildClipPrompt({ idx: 0, motion: "천천히", sentence: "안녕하세요" }, kling);
    expect(p).toContain("No talking faces or lip sync");
  });

  describe("말하는 모델(Seedance)", () => {
    const project = {
      settings: { i2v_model: "seedance-2.0" },
      cast: [{ id: "c1", who: "20대 동양인 남성 농구 선수", voice: "중저음, 차분하고 단단한 톤", cuts: [0] }],
    };

    it("대사를 원문 그대로 싣는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "검정에 빨강. 이 배색이 제일 오래 사랑받았다.", motion: "천천히" }, project);
      expect(p).toContain("검정에 빨강. 이 배색이 제일 오래 사랑받았다.");
    });

    it("목소리와 인물을 함께 싣는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("중저음, 차분하고 단단한 톤");
      expect(p).toContain("20대 동양인 남성 농구 선수");
    });

    // ★★ 립싱크 금지가 남아 있으면 모델에게 반대되는 지시를 함께 준다
    it("립싱크 금지를 빼고 말하라고 한다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).not.toContain("No talking faces");
      expect(p).not.toContain("no lip sync");
    });

    // ★ 자막은 우리가 태운다 — 클립에 글자를 요구하지 않는다(한글이 변형된다)
    it("글자 금지는 그대로 남는다", () => {
      const p = buildClipPrompt({ idx: 0, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("No text or letters");
    });

    it("이 컷에 인물이 없으면 말하지 않는다", () => {
      const p = buildClipPrompt({ idx: 5, sentence: "안녕하세요", motion: "천천히" }, project);
      expect(p).toContain("No talking faces or lip sync");
    });

    it("문장이 없으면 말하지 않는다", () => {
      const p = buildClipPrompt({ idx: 0, motion: "천천히" }, project);
      expect(p).toContain("No talking faces or lip sync");
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cuts.test.js`
Expected: FAIL — 대사·목소리가 프롬프트에 없다. `buildClipPrompt` 가 두 번째 인자를 안 받는다.

- [ ] **Step 3: `buildClipPrompt` 를 고친다**

`lib/cuts.js` 상단 import 에 더한다:

```js
import { projectSpeaks } from "./clip-limits.js";
```

`buildClipPrompt` 를 갈아낀다:

```js
// prompt 가 이 컷이 어떻게 움직일지를 정한다.
//
// ★ 말하는 모델(Seedance)에서는 **대사와 목소리도 여기서 정한다.** 대사는 원문 그대로
// 싣는다 — 실측에서 모델이 준 문장을 그대로 말했다(2026-08-12). 목소리는 캐스팅이 정한
// 한 줄을 전 컷에 똑같이 실어 컷 사이에서 목소리가 흔들리지 않게 한다(cast[].voice).
//
// ★ 말하지 않는 모델에서는 한 글자도 바뀌지 않는다. 프롬프트가 각인(clipKey)에 들어가므로,
// 문구가 달라지면 이미 값을 치른 클립이 통째로 낡아 다시 사게 된다.
export function buildClipPrompt(cut, project) {
  const motion = typeof cut?.motion === "string" ? cut.motion.trim() : "";
  const base = motion || "거의 정지 상태, 아주 느린 카메라 이동";
  // 속도는 영어로 덧붙인다 — motion 은 한국어 원문 그대로 가지만 속도는 모델이 반응하는 관용구가 있다.
  // 속도가 없는 옛 컷에는 아무것도 붙이지 않는다: 문구가 달라지면 클립을 다시 사게 된다.
  const pace = isSpeed(cut?.speed) ? ` ${speedFor(cut.speed).clip}.` : "";

  const line = typeof cut?.sentence === "string" ? cut.sentence.trim() : "";
  // 이 컷에 보이는 인물 중 첫 번째가 말한다. 둘 이상이 보여도 대사는 하나다 —
  // 누가 말하는지는 원고가 정하지 않으므로 화면에 보이는 순서를 따른다.
  const speaker = projectSpeaks(project) && line
    ? (project.cast || []).find((c) => Array.isArray(c?.cuts) && c.cuts.includes(cut?.idx))
    : null;

  if (speaker) {
    const who = speaker.who || "인물";
    const voice = speaker.voice ? ` Voice: ${speaker.voice}.` : "";
    // 대사는 한국어 원문 그대로다 — 번역하거나 다듬으면 자막(ffmpeg 가 태우는 원고)과 갈린다.
    return `${base}.${pace} ${who} speaks to the camera with natural lip sync.${voice} Says exactly, in Korean: "${line}". The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters.`;
  }

  return `${base}.${pace} The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters. No talking faces or lip sync.`;
}
```

- [ ] **Step 4: 호출부 둘에 project 를 넘긴다**

`lib/pipeline.js:473` 과 `:517` 의 `buildClipPrompt(cut)` 를 `buildClipPrompt(cut, project)` 로 바꾼다.

★ 그 자리에 `project` 라는 이름의 변수가 실제로 있는지 **확인하고** 쓴다. 이름이 다르면 그 파일이 쓰는 이름을 따른다. 없으면 **고치지 말고 보고하라.**

- [ ] **Step 5: 각인에 목소리를 넣는다**

`lib/steps.js` 의 `clipKey` 를 고친다. 목소리가 클립 프롬프트에 실리므로, 목소리가 바뀌면 클립이 낡아야 한다:

```js
export function clipKey(cut) {
  const base = `${cut?.image?.url || ""}|${cut?.seconds ?? ""}|${cut?.motion || ""}`;
  // 속도가 클립 프롬프트에 실리므로(buildClipPrompt) 속도를 바꾸면 클립이 낡아야 한다.
  //
  // ⚠️ 있을 때만 덧붙인다. 형식을 무조건 바꾸면 옛 각인(url|초|움직임)이 전부 불일치가 되어
  //    이미 값을 치른 클립이 통째로 낡는다 — style_of 때와 같은 함정이다.
  const withSpeed = cut?.speed ? `${base}|${cut.speed}` : base;
  // 말하는 모델에서는 대사와 목소리도 프롬프트에 실린다 — 같은 이유로 각인에 넣는다.
  // 여기서도 **있을 때만** 덧붙인다(말하지 않는 프로젝트의 옛 각인을 건드리지 않는다).
  return cut?.spoken_of ? `${withSpeed}|${cut.spoken_of}` : withSpeed;
}
```

그리고 `lib/pipeline.js` 의 클립 저장 자리 둘(`:477`·`:526`)에서, 말하는 프로젝트일 때만 `spoken_of` 를 컷에 함께 남긴다. **`clipKey(cut)` 를 부르기 전에** 세워야 한다:

```js
// 말하는 모델에서는 대사·목소리가 프롬프트에 실리므로 각인에도 들어가야 한다.
// 말하지 않으면 아예 세우지 않는다 — 옛 각인을 건드리면 이미 산 클립이 낡는다.
const speaker = projectSpeaks(project)
  ? (project.cast || []).find((c) => Array.isArray(c?.cuts) && c.cuts.includes(cut.idx))
  : null;
const cutForKey = speaker && cut.sentence
  ? { ...cut, spoken_of: `${cut.sentence}|${speaker.voice || ""}|${speaker.who || ""}` }
  : cut;
```

그 뒤 `of: clipKey(cut)` 를 `of: clipKey(cutForKey)` 로 바꾼다. `lib/pipeline.js` 상단 import 에 `projectSpeaks` 를 더한다.

- [ ] **Step 6: 각인 테스트를 더한다**

`tests/steps.test.js` 에 더한다(`clipKey` 를 import 하는 파일을 찾아라: `grep -rn "clipKey" tests/`):

```js
describe("clipKey — 말하는 컷", () => {
  it("옛 컷의 각인은 한 글자도 안 바뀐다", () => {
    const cut = { image: { url: "u" }, seconds: 5, motion: "천천히" };
    expect(clipKey(cut)).toBe("u|5|천천히");
    expect(clipKey({ ...cut, speed: "fast" })).toBe("u|5|천천히|fast");
  });

  it("대사·목소리가 바뀌면 클립이 낡는다", () => {
    const cut = { image: { url: "u" }, seconds: 5, motion: "천천히" };
    const a = clipKey({ ...cut, spoken_of: "안녕하세요|중저음|20대 남성" });
    const b = clipKey({ ...cut, spoken_of: "안녕하세요|높은 톤|20대 남성" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(clipKey(cut));
  });
});
```

- [ ] **Step 7: 그린을 확인한다**

Run: `npx vitest run tests/cuts.test.js tests/steps.test.js tests/pipeline.test.js`
Expected: PASS 전부

- [ ] **Step 8: ★ 립싱크 금지 제거를 변이로 확인한다**

말하는 분기의 반환문 끝에 `No talking faces or lip sync.` 를 잠깐 도로 붙이고 돌린다.
Expected: "립싱크 금지를 빼고 말하라고 한다" 가 FAIL.
확인했으면 되돌린다(편집기로).

- [ ] **Step 9: 커밋**

```bash
git add lib/cuts.js lib/pipeline.js lib/steps.js tests/
git commit -m "feat(clip): 말하는 모델에서는 클립이 대사를 말한다

대사는 원문 그대로 싣는다 — 실측에서 모델이 준 문장을 그대로 말했다. 목소리는
캐스팅이 정한 한 줄을 전 컷에 똑같이 실어 컷 사이에서 흔들리지 않게 한다.

★ 립싱크 금지(No talking faces or lip sync)를 말하는 경로에서만 뺐다. 남겨 두면
서로 반대되는 지시를 함께 주는 셈이다. 글자 금지는 그대로다 — 자막은 계속
ffmpeg 가 원고를 태운다(모델이 그리면 한글이 변형된다).

말하지 않는 모델의 프롬프트는 한 글자도 안 바뀐다. 각인도 있을 때만 덧붙여
이미 값을 치른 클립이 통째로 낡지 않게 했다."
```

---

### Task 4: 합성이 소리를 클립에서 꺼낸다 ★ 가장 깊은 변경

**Files:**
- Modify: `lib/subtitles.js:23-27`(`cutSeconds`)
- Modify: `lib/compose.js:34-56`(`buildFfmpegArgs`) · `:186-193`(`composeVideo` 의 내려받기) · `:161`(합계)
- Test: `tests/subtitles.test.js` · `tests/compose.test.js`(`grep -rn "buildFfmpegArgs" tests/` 로 파일을 찾아라)

**Interfaces:**
- Consumes: Task 1 의 `projectSpeaks(project)`
- Produces: `cutSeconds(cut, project)` — **두 번째 인자가 는다.** 안 넘기면 지금 동작 그대로다
- Produces: `buildFfmpegArgs` 의 `local[]` 항목에서 **`audio` 가 선택이 된다.** 없으면 클립의 오디오 스트림을 쓴다

★ **세 가지가 한 덩어리다.** 따로 하면 중간 상태가 깨진 채로 커밋된다:
1. 말하는 프로젝트에는 `c.audio` 가 **없다** — 지금 코드는 `c.audio.url` 에서 그대로 죽는다
2. ffmpeg 입력이 `영상·소리·영상·소리…` 순서를 가정한다 — 소리가 빠지면 인덱스가 어긋난다
3. 컷 길이가 **받은 클립 길이**여야 한다 — 주문한 초로 자막을 깔면 컷마다 밀린다

- [ ] **Step 1: `cutSeconds` 실패 테스트를 쓴다**

`tests/subtitles.test.js` 에 더한다:

```js
describe("cutSeconds — 말하는 경로는 받은 클립 길이가 기준이다", () => {
  const speaking = {
    settings: { i2v_model: "seedance-2.0" },
    cast: [{ id: "c1", who: "20대 남성", cuts: [0] }],
    cuts: [{ idx: 0, sentence: "안녕하세요" }],
  };

  it("project 를 안 넘기면 예전과 같다 — 낭독이 기준이다", () => {
    expect(cutSeconds({ seconds: 3, video: { seconds: 5 } })).toBe(3);
  });

  it("말하지 않는 프로젝트도 낭독이 기준이다", () => {
    const kling = { settings: { i2v_model: "kling-v3" }, cast: [], cuts: [] };
    expect(cutSeconds({ seconds: 3, video: { seconds: 5 } }, kling)).toBe(3);
  });

  // ★ 주문한 초(3)가 아니라 받은 초(4)가 기준이다 — Seedance 하한이 4초라 반드시 벌어진다.
  //   주문한 초로 자막을 깔면 컷마다 1초씩 밀린다.
  it("말하는 프로젝트는 받은 클립 길이가 기준이다", () => {
    expect(cutSeconds({ idx: 0, seconds: 3, video: { seconds: 4 } }, speaking)).toBe(4);
  });

  it("클립이 아직 없으면 추정으로 떨어진다 — 화면이 그래도 뭔가 보여야 한다", () => {
    expect(cutSeconds({ idx: 0, seconds: 3 }, speaking)).toBe(3);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/subtitles.test.js`
Expected: FAIL — 말하는 프로젝트에서 4 가 아니라 3 이 나온다.

- [ ] **Step 3: `cutSeconds` 를 고친다**

`lib/subtitles.js` 상단에 `import { projectSpeaks } from "./clip-limits.js";` 를 더하고:

```js
// 완성본에서 이 컷이 차지하는 시간.
//
// 말하지 않는 경로: **낭독 길이**다. i2v 눈금 올림으로 클립이 낭독보다 긴 것이 보통이고,
// 그 차이가 그대로 무음이었다(30초 요청에 완성본 32.8초, 정적 4.8초). 이제 합성이 남는
// 클립을 잘라내므로 구간 길이는 낭독이다. 낭독이 없으면(목소리 실패) 클립 길이로 떨어진다.
//
// ★ 말하는 경로: **받은 클립 길이**다. 소리가 클립 안에 있어 자를 수 없다(자르면 말이
// 잘린다). 주문한 초로 자막을 깔면 컷마다 밀린다 — Seedance 하한이 4초라 3초짜리 컷에서
// 반드시 벌어진다. 클립이 아직 없으면 추정으로 떨어진다(화면이 그래도 뭔가 보여야 한다).
export function cutSeconds(cut, project) {
  const clip = Number(cut?.video?.seconds) || 0;
  const spoken = Number(cut?.seconds) || 0;
  if (projectSpeaks(project)) return clip || spoken;
  return spoken || clip;
}
```

`cutSeconds` 호출처를 전부 찾아 `project` 를 넘긴다: `grep -rn "cutSeconds(" lib/ app/ --include=*.js`.
**넘길 `project` 가 그 자리에 없으면 고치지 말고 보고하라.**

- [ ] **Step 4: 합성 실패 테스트를 쓴다**

`buildFfmpegArgs` 를 재는 파일에 더한다:

```js
describe("말하는 클립 — 소리가 영상 안에 있다", () => {
  const base = { assPath: "/t/x.ass", out: "/t/o.mp4", width: 1080, height: 1920 };

  it("소리 파일이 있으면 지금 그대로다 — 짝으로 넣고 낭독 길이에 맞춘다", () => {
    const args = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", audio: "/t/0.m4a", wantSeconds: 3, haveSeconds: 5 }],
    });
    const s = args.join(" ");
    expect(s).toContain("-i /t/0.mp4");
    expect(s).toContain("-i /t/0.m4a");
    expect(s).toContain("trim=duration=3.00");
    expect(s).toContain("[1:a]anull[a0]");   // 짝수=영상, 홀수=소리
  });

  // ★ 말하는 프로젝트에는 c.audio 가 아예 없다. 소리는 클립 안에 있다.
  it("소리 파일이 없으면 클립의 오디오 스트림을 쓴다", () => {
    const args = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 }],
    });
    const s = args.join(" ");
    expect(s).toContain("-i /t/0.mp4");
    expect(s).not.toContain(".m4a");
    expect(s).toContain("[0:a]anull[a0]");   // 영상과 같은 입력에서 소리를 꺼낸다
  });

  // ★ 자르면 문장 끝이 사라지고, 늘리면 소리 없는 정지 화면이 붙는다
  it("소리 파일이 없으면 자르지도 늘리지도 않는다", () => {
    const s = buildFfmpegArgs({
      ...base,
      local: [{ video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 }],
    }).join(" ");
    expect(s).not.toContain("trim=duration");
    expect(s).not.toContain("tpad");
  });

  it("컷이 여럿이어도 입력 번호가 어긋나지 않는다", () => {
    const s = buildFfmpegArgs({
      ...base,
      local: [
        { video: "/t/0.mp4", wantSeconds: 3, haveSeconds: 4 },
        { video: "/t/1.mp4", wantSeconds: 3, haveSeconds: 4 },
      ],
    }).join(" ");
    expect(s).toContain("[0:a]anull[a0]");
    expect(s).toContain("[1:v]");
    expect(s).toContain("[1:a]anull[a1]");
  });
});
```

- [ ] **Step 5: 실패를 확인한다**

Run: `npx vitest run tests/<그 파일>`
Expected: FAIL — 소리 없는 항목에서 입력 번호가 어긋나고 `trim` 이 붙는다.

- [ ] **Step 6: `buildFfmpegArgs` 를 고친다**

입력 번호를 **세어서** 쓴다. 지금은 `i*2`·`i*2+1` 로 고정인데, 소리가 빠지면 그 계산이 무너진다:

```js
export function buildFfmpegArgs({ local, assPath, out, width, height }) {
  const inputs = [];
  // ★ 입력 번호를 고정 계산(i*2)하지 않고 **센다.** 말하는 클립에는 소리 파일이 없어
  // 항목마다 입력이 1개이거나 2개다 — 고정 계산은 그 순간 어긋난다.
  const slots = [];
  for (const l of local) {
    const videoIdx = inputs.length / 2;   // inputs 는 ["-i", 경로] 쌍이라 파일 수는 길이/2
    inputs.push("-i", l.video);
    let audioIdx = null;
    if (l.audio) {
      audioIdx = inputs.length / 2;
      inputs.push("-i", l.audio);
    }
    slots.push({ videoIdx, audioIdx });
  }

  const filters = [];
  local.forEach((l, i) => {
    const { videoIdx, audioIdx } = slots[i];
    const want = Number(l.wantSeconds) || 0;
    const have = Number(l.haveSeconds) || 0;
    // ★ 소리 파일이 있을 때만 길이를 맞춘다.
    //
    // 소리가 클립 안에 있으면(말하는 모델) 자르는 순간 문장 끝이 사라지고, 늘리면
    // 소리 없는 정지 화면이 붙는다. 그 경로에서는 클립 길이가 곧 이 컷의 길이다
    // (lib/subtitles.js 의 cutSeconds 가 같은 값을 본다).
    const fit = audioIdx !== null;
    const pad = fit ? Math.max(0, want - have) : 0;
    const tpad = pad > 0 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : "";
    const trim = fit && want > 0 && have > want
      ? `trim=duration=${want.toFixed(2)},setpts=PTS-STARTPTS,`
      : "";
    filters.push(`[${videoIdx}:v]${tpad}${trim}scale=${width}:${height},setsar=1[v${i}]`);
    // 소리 파일이 없으면 영상과 같은 입력에서 오디오 스트림을 꺼낸다
    filters.push(`[${audioIdx ?? videoIdx}:a]anull[a${i}]`);
  });
```

그 아래 `concat` 부터는 **한 글자도 바꾸지 않는다** — `[v{i}][a{i}]` 이름을 그대로 쓴다.

- [ ] **Step 7: `composeVideo` 가 소리를 안 받게 한다**

`lib/compose.js` 의 내려받기 자리(`:186-193`)를 고친다. `composeVideo` 는 `cuts` 만 받고 `project` 는 안 받으므로, **부르는 쪽이 `speaks` 를 넘기게** 한다(인자 하나 추가):

```js
export async function composeVideo({
  projectId,
  cuts,
  speaks = false,   // ★ 클립이 소리를 갖고 있는가(lib/clip-limits.js 의 projectSpeaks)
  aspect_ratio = "9:16",
  …
```

```js
    for (const c of usable) {
      local.push({
        video: await downloadImpl(c.video.url, path.join(dir, `${projectId}-${c.idx}.mp4`)),
        // ★ 말하는 클립에는 소리 파일이 없다 — 소리가 영상 안에 있다.
        //   여기서 c.audio.url 을 그대로 읽으면 undefined 로 죽는다.
        ...(speaks ? {} : { audio: await downloadImpl(c.audio.url, path.join(dir, `${projectId}-${c.idx}.m4a`)) }),
        wantSeconds: Number(c.seconds) || 0,
        haveSeconds: Number(c.video?.seconds) || 0,
      });
    }
```

합계(`:161`)도 같은 값을 봐야 한다:

```js
  const seconds = (cuts || []).reduce((s, c) => s + cutSeconds(c, speaks ? SPEAKING : null), 0);
```

★ `cutSeconds` 는 `project` 를 받는데 여기에는 `speaks` 만 있다. **둘 중 하나로 통일하라** — 가장 단순한 것은 `composeVideo` 가 `project` 를 통째로 받는 것이다. 그러면 `speaks` 인자가 필요 없고 `cutSeconds(c, project)` 를 그대로 쓴다. **그렇게 하고, 부르는 쪽에서 `project` 를 넘겨라.** 부르는 쪽을 찾아라: `grep -rn "composeVideo(" lib/ app/ --include=*.js`

- [ ] **Step 8: 그린을 확인한다**

Run: `npx vitest run tests/subtitles.test.js tests/compose.test.js tests/pipeline.test.js`
Expected: PASS 전부

- [ ] **Step 9: ★ 입력 번호 세기를 변이로 확인한다**

`const videoIdx = inputs.length / 2;` 를 잠깐 `const videoIdx = i * 2;` 로 바꾸고 돌린다(`i` 를 쓰려면 `for...of` 를 `forEach` 로 잠깐 바꾼다).
Expected: "컷이 여럿이어도 입력 번호가 어긋나지 않는다" 가 FAIL.
확인했으면 되돌린다(편집기로).

- [ ] **Step 10: 커밋**

```bash
git add lib/subtitles.js lib/compose.js tests/
git commit -m "fix(compose): 말하는 클립은 소리를 자기 안에 갖고 있다

세 가지가 한 덩어리다:
· 말하는 프로젝트에는 c.audio 가 없다 — 지금 코드는 c.audio.url 에서 그대로 죽었다
· ffmpeg 입력이 영상·소리 짝을 가정해 i*2 로 번호를 매겼다. 소리가 빠지면 어긋난다 —
  세어서 쓴다
· 컷 길이가 **받은 클립 길이**여야 한다. 주문한 초로 자막을 깔면 컷마다 밀린다
  (Seedance 하한 4초라 3초짜리 컷에서 반드시 벌어진다)

자르지도 늘리지도 않는다 — 자르면 문장 끝이 사라지고 늘리면 소리 없는 정지 화면이 붙는다.
말하지 않는 경로는 한 줄도 안 바뀐다."
```

---

### Task 5: 말하는 프로젝트는 목소리를 만들지 않는다

**Files:**
- Modify: `lib/pipeline.js`(목소리 파이프라인 · 자동 관통)
- Modify: `app/api/projects/[id]/voice/route.js`
- Modify: `app/api/projects/[id]/cuts/[idx]/voice/regen/route.js`(정확한 경로는 `grep -rn "voice" app/api/projects` 로 찾아라)
- Test: `tests/pipeline.test.js` · `tests/routes.test.js`

**Interfaces:**
- Consumes: Task 1 의 `projectSpeaks(project)`

★ **③목소리 단계를 없애지 않는다.** Kling 경로가 그대로 쓴다. 말하는 프로젝트에서만 건너뛴다.

★ **순서는 확인됐다.** 캐스팅은 `deps.splitCuts` 안에서 화면 설계 직후에 돈다 —
즉 **컷 분할(②대본 승인) 시점**이고 ③목소리보다 앞이다. 그래서 목소리 단계에서
`project.cast` 와 `project.cuts` 가 이미 채워져 있고 `projectSpeaks` 가 제대로 판정한다.
(만약 그 시점에 `cast` 가 비어 있으면 판정이 조용히 false 로 떨어져 TTS 를 만들고,
나중에 클립도 말해 **소리가 두 겹**이 된다. Step 2 의 테스트가 그 자리를 잡는다.)

- [ ] **Step 1: 지금 목소리가 어디서 만들어지는지 읽는다**

Run: `grep -rn "runVoicePipeline\|synthesize\|lib/tts" lib/pipeline.js app/api/projects | head -20`

목소리 파이프라인 이름과 컷에 `audio` 를 꽂는 자리를 확인한다. **아래 코드를 그 파일의 실제 이름에 맞춰 쓴다.**

- [ ] **Step 2: 실패 테스트를 쓴다**

```js
describe("말하는 프로젝트는 목소리를 만들지 않는다", () => {
  it("TTS 를 한 번도 부르지 않는다", async () => {
    const tts = vi.fn(async () => ({ url: "a.mp3", seconds: 3 }));
    const project = {
      id: "p1", settings: { i2v_model: "seedance-2.0" },
      cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
      cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
    };
    await runVoicePipeline(project.id, OWNER, { ...deps, project, synthesize: tts });
    expect(tts).not.toHaveBeenCalled();
  });

  // ★ Kling 은 그대로다 — 이 태스크가 깨면 안 되는 것
  it("말하지 않는 프로젝트는 지금처럼 만든다", async () => {
    const tts = vi.fn(async () => ({ url: "a.mp3", seconds: 3 }));
    const project = {
      id: "p2", settings: { i2v_model: "kling-v3" }, cast: [],
      cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
    };
    await runVoicePipeline(project.id, OWNER, { ...deps, project, synthesize: tts });
    expect(tts).toHaveBeenCalled();
  });
});
```

★ `deps`·`OWNER`·`runVoicePipeline` 은 그 테스트 파일이 이미 쓰는 이름을 따른다. 목소리 파이프라인이 의존성 주입을 안 받으면 **고치지 말고 보고하라.**

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run tests/pipeline.test.js`
Expected: FAIL — 말하는 프로젝트에서도 TTS 가 불린다.

- [ ] **Step 4: 목소리 파이프라인 앞에 게이트를 둔다**

```js
  // ★ 말하는 모델에서는 클립이 목소리를 만든다 — 여기서 또 만들면 소리가 두 겹이 된다.
  // 단계를 없애지 않는 이유는 Kling 경로가 그대로 쓰기 때문이다.
  if (projectSpeaks(project)) return;
```

- [ ] **Step 5: 재생성 라우트도 막는다**

목소리 재생성 라우트에서 말하는 프로젝트면 400 을 준다. 목소리만 따로 다시 만드는 것이 불가능하기 때문이다(클립과 한 몸이다):

```js
  if (projectSpeaks(project)) {
    return Response.json(
      { error: "이 영상은 목소리가 영상에 함께 만들어져요 — 영상을 다시 만들어 주세요" },
      { status: 400 }
    );
  }
```

라우트 테스트를 더한다:

```js
it("말하는 프로젝트에서 목소리 재생성은 400 이다", async () => {
  const p = await createProject({
    ownerId: OWNER,
    settings: { i2v_model: "seedance-2.0" },
    material: { text: "가", photos: [] },
  });
  await updateProject(p.id, OWNER, (proj) => ({
    ...proj,
    cast: [{ id: "c1", who: "20대 남성", voice: "중저음", cuts: [0] }],
    cuts: [{ idx: 0, sentence: "안녕하세요", seconds: 3 }],
  }));
  const res = await VOICE_REGEN_POST(patchReq({}), ctx(p.id, 0));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 6: 화면이 그 단계를 건너뛰게 한다**

Run: `grep -rn "steps\|STEPS" app/create/\[id\]/voice/page.js | head`

말하는 프로젝트에서 ③목소리 화면에 들어오면 무엇을 보여줄지 정한다. **가장 단순한 것**: 안내 한 줄과 다음 단계 버튼.

```jsx
{speaks ? (
  <p className="pgsub">이 영상은 목소리가 영상에 함께 만들어져요 — 다음 단계로 넘어가세요.</p>
) : (
  /* 지금 화면 그대로 */
)}
```

★ 화면이 `projectSpeaks` 를 import 하려면 `lib/clip-limits.js` 가 `"use client"` 에서 안전해야 한다. 그 파일은 이미 화면에서 쓰인다(`app/create/[id]/video/page.js`) — 안전하다.

- [ ] **Step 7: 그린을 확인한다**

Run: `npx vitest run`
Expected: 시작 시 센 수에서 늘어난 만큼, 전부 그린

- [ ] **Step 8: 커밋**

```bash
git add lib app tests
git commit -m "feat(voice): 말하는 프로젝트는 TTS 를 만들지 않는다

클립이 목소리를 만드는데 여기서 또 만들면 소리가 두 겹이 된다. 단계를 없애지
않은 이유는 Kling 경로가 그대로 쓰기 때문이다 — 말하는 프로젝트에서만 건너뛴다.

목소리만 따로 다시 만드는 것은 불가능하다(클립과 한 몸이다) — 재생성 라우트는
400 으로 막고 영상을 다시 만들라고 안내한다."
```

---

### Task 6: ★ 라이브 검증 — 한 편을 관통시킨다

**Files:** 없음(측정만). 결과는 `docs/measurements/2026-08-12-seedance-voice.md` 에 이어 쓴다.

**⚠️ 유료다.** 컨트롤러가 사용자 승인을 받은 뒤에만 실행한다.

- [ ] **Step 1: 전체 테스트가 그린인지 먼저 확인한다**

Run: `npx vitest run`
Expected: 전부 그린. 빨간 것이 있으면 **여기서 멈춘다.**

- [ ] **Step 2: 가짜 모드로 배선을 먼저 본다 — 0원**

Run: `SHOTFORM_FAKE=all PORT=3100 SHOTFORM_DIST_DIR=.next-dev3100 npm run dev`

인물이 있는 자료로 한 편을 관통시킨다. 확인할 것:
- ③목소리 화면이 건너뛰어지는가
- 클립 프롬프트에 대사·목소리가 실리는가(서버 로그)
- 합성이 도는가

- [ ] **Step 3: 진짜로 한 편 만든다**

Seedance 15초(80 크레딧). 확인할 것:

1. **컷 간 목소리가 이어지는가** — Task 0 이 클립 단위로 본 것을 완성본에서 다시 본다
2. **말이 잘리지 않는가** — Task 4 가 실제로 먹었는가
3. **자막과 음성이 어긋나지 않는가** — 우리가 태운 자막과 클립이 말하는 시점
4. **화면에 글자가 나오지 않는가**
5. **원장 원가** — TTS 행이 없고 클립 행만 있는가

- [ ] **Step 4: 결과를 적는다**

관측값을 `docs/measurements/2026-08-12-seedance-voice.md` 에 이어 쓴다. 어긋난 것이 있으면 **고치지 말고 보고한다** — 무엇을 고칠지는 관측을 보고 정한다.

---

## 되돌리는 법

각 태스크가 독립 커밋이라 개별 `git revert` 가 가능하다. 의존은 이렇다:

- **Task 3·4·5 는 Task 1 에 의존한다**(`projectSpeaks`)
- **Task 3 은 Task 2 에 의존한다**(`cast[].voice`)
- **Task 4 와 Task 5 는 서로 짝이다** — 4 만 넣으면 소리 파일이 있는데 안 맞추고,
  5 만 넣으면 소리 파일이 없는데 합성이 그것을 찾다가 죽는다. **함께 넣고 함께 되돌린다**

**Task 1 만 되돌리면** 다른 태스크가 없는 함수를 부른다 — 함께 되돌려야 한다.

**Task 4 만 되돌리면** 말하는 클립이 잘려 문장 끝이 사라진다. Task 3 과 함께 되돌려라.

**Task 5 만 되돌리면** 소리가 두 겹이 된다(클립이 말하는데 TTS 도 얹힌다). Task 3 과 함께 되돌려라.

가장 안전한 되돌리기는 **Task 1 의 `speaks: true` 를 `false` 로 바꾸는 것 하나**다. 그러면 모든 분기가 옛 경로로 떨어지고 코드는 남는다.
