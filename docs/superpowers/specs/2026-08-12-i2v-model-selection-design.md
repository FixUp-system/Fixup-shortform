# 영상 모델 선택 — Seedance 2.0 을 기본으로, 프로젝트마다 한 번 고른다

> 2026-08-12 · 덩어리 A(모델 축). 덩어리 B(낭독 폐지)는 별도 설계다.

## 무엇을 만드나

⑤영상 단계에서 **영상 모델을 고를 수 있게** 한다. 기본은 **Seedance 2.0**,
대안은 지금 쓰는 **Kling v3** 다. 첫 클립을 만들면 **잠긴다.**

사장님이 겪는 흐름:

1. 새 영상을 시작하면 ⑤영상 단계에 모델 고르는 자리가 있다. 기본이 Seedance 2.0 이고,
   옆에 Kling v3 가 "값이 싼 쪽"으로 있다. 각각 **이 길이 영상이 몇 크레딧인지** 같이 보인다
   (30초 기준 160 vs 50).
2. 고르고 **첫 클립을 만들면 그때부터 잠긴다.** 화면에는 "이 영상은 Seedance 2.0 으로
   만들고 있어요"만 남는다.
3. 이미 만들던 옛 영상들은 **Kling 그대로** 계속된다.

왜 잠그나: 클립이 한 편에서 가장 비싸다. 중간에 모델을 바꾸면 ①한 영상 안에 두 모델의
클립이 섞이거나 ②이미 낸 돈을 버리고 전부 다시 만들어야 한다. 둘 다 사장님에게 나쁘다.
고르는 것은 **값을 치르기 전 한 번**이면 충분하다.

## 값

`lib/pricing.js` 의 실측 원가 기준(1크레딧 ≈ 원가 $0.06):

| | Kling v3 (지금) | Seedance 2.0 |
|---|---|---|
| 엔드포인트 | `fal-ai/kling-video/v3/standard/image-to-video` | `bytedance/seedance-2.0/image-to-video` |
| 클립 초당 | $0.084 | $0.3024 |
| 컷 하나(≈5초) | $0.42 | $1.51 |
| 30초 한 편 | $3.06 | $9.62 |
| 60초 한 편 | $6.06 | $19.2 |
| 정가 15/30/45/60초 | 25 / 50 / 75 / 100 | **80 / 160 / 240 / 320** |
| 클립 재생성 | 8 | **25** |

이미지·목소리 재생성 가격은 모델과 무관하므로 그대로다(2 · 1).

## 구조

### 1. 모델 표 — `lib/clip-limits.js`

이미 클립 길이 눈금이 사는 자리다. 여기에 Seedance 프로필과 **사장님에게 보일 목록**을
함께 둔다. 이 파일은 화면도 import 하므로 `fs` 의존이 없어야 한다(기존 제약 그대로).

- `CLIP_PROFILES` 에 Seedance 항목: prefix `bytedance/seedance-2.0`,
  `steps: null, min: 4, max: 15`(정수 초), `extra: { generate_audio: false, resolution: "720p" }`
- `I2V_MODELS` — 화면이 그릴 목록. 각 항목: `id`(짧은 키) · `endpoint` · `label`(사장님 말) ·
  `hint`(한 줄 설명). **`fal-ai/kling-video/v3` 는 `bytedance/…` 와 접두사가 안 겹치므로
  `CLIP_PROFILES` 순서 함정은 생기지 않는다.**
- `DEFAULT_I2V_MODEL = "seedance-2.0"`
- `LEGACY_I2V_MODEL = "kling-v3"` — 아래 "옛 프로젝트" 규칙이 쓴다

### 2. 원천은 프로젝트다 — env 폐지

지금 모델은 `activeI2vEndpoint()` 가 env `FAL_I2V_ENDPOINT` 로 정한다. 이제 프로젝트마다
갈리므로 **`project.settings.i2v_model` 이 유일한 원천**이 된다.

**env `FAL_I2V_ENDPOINT` 는 폐지한다.** 원천이 둘이면 언젠가 갈리고, 그때 프로필과 실제
모델이 어긋난다 — `lib/clip-limits.js` 주석이 이미 경고하고 있는 그 함정이다.
`.env.local.example` · `README.md` · `vitest.setup.js` 의 언급도 함께 걷어낸다.

프로젝트 스코프 함수로 바꾼다:

- `activeI2vEndpoint()` → `endpointForProject(project)`
- `activeClipProfile()` → `clipProfileForProject(project)`
- `activeClipLimits()` → `clipLimitsForProject(project)`
  (`GET /api/projects/[id]` 가 `clip_limits` 를 실어 보내는 자리)

### 3. ★ 옛 프로젝트는 Kling 이다

**`settings.i2v_model` 이 없으면 `LEGACY_I2V_MODEL`(Kling v3)로 본다.**
새로 만드는 프로젝트에만 생성 시점에 `i2v_model: "seedance-2.0"` 을 **명시 저장**한다.

반대로 하면(없으면 Seedance) 이미 Kling 으로 클립을 만들던 옛 영상들이 다음 컷부터 조용히
모델이 바뀌어 한 편 안에 두 모델이 섞인다. 자막 위치 작업에서 겪은 "기본값을 어느 쪽으로
두느냐가 옛 데이터의 뜻을 바꾼다"와 같은 함정이다.

### 4. 세 안전장치가 Seedance 를 모른다

모델 id 가 `bytedance/…` 라 `fal-ai/` 로 시작하지 않는다. 셋 다 접두사로 판정한다.

**(a) 가짜 모드 — 가장 위험하다.** `lib/costs.js` 의 `fakeFor(endpoint)` 가
`startsWith("fal-ai/")` 면 `fakeFal()`, **나머지는 전부 `fakeLlm()`** 으로 본다.
그대로 두면 Seedance 는 "LLM" 으로 분류되어 **`SHOTFORM_FAKE=fal` 에서 진짜 호출이 나간다**
— 0원인 줄 알고 돌린 테스트가 클립당 $1.5 를 쓴다.

→ `isFalEndpoint(endpoint)` 하나로 판정을 모은다. 판정을 **뒤집어** `openai/` 로 시작하는
것만 LLM 으로 보고 **나머지는 fal 로 본다.** 모르는 엔드포인트가 fal 로 분류되면 가짜 모드에서
호출이 막히고(안전), LLM 으로 분류되면 돈이 나간다(위험) — 기본값은 안전한 쪽이어야 한다.

**(b) 원가표.** `lib/costs.js` `PRICE_TABLE` 에 `bytedance/seedance-2.0` `perSec: 0.3024`.
없으면 원가가 조용히 $0 으로 기록되어 원장과 전역 상한이 함께 무력해진다.

**(c) 클립 프로필.** `CLIP_PROFILES` 에 없으면 `profileFor` 가 LTX 폴백을 준다 —
눈금 6·8·…·20 으로 요청해 16초 이상은 거절당하고 `generate_audio:false` 도 안 실린다.
(1번에서 해결된다. 폴백 경고는 그대로 둔다.)

### 5. 가격이 길이 × 모델로 갈라진다 — `lib/pricing.js`

이 파일은 화면에서도 import 되므로 **import 문 없는 순수 데이터·순수 함수**여야 한다
(기존 제약 그대로).

- `VIDEO_PRICE` 를 모델별 표로: `{ "seedance-2.0": {15:80,30:160,45:240,60:320},
  "kling-v3": {15:25,30:50,45:75,60:100} }`
- `videoPrice(seconds, model)` — `model` 이 없거나 모르는 값이면 **Kling 표**로 본다
  (3번과 같은 이유: 값을 안 넘긴 옛 호출은 옛 프로젝트다)
- `REGEN_PRICE.clip` 도 모델별. `regenPrice(kind, priorCount, model)`
- `priceLabel`·`FREE_REGEN_PER_CUT`·`MAX_REGEN_PER_CUT` 는 그대로

**호출처 전부에 모델을 넘겨야 한다.** 실측된 소비자:
`lib/charges.js`(`chargeVideo`·`assertCanAfford`·재생성 청구) ·
`components/QuickCreate.jsx`(2곳, 프로젝트가 아직 없으므로 **기본 모델**) ·
`app/create/[id]/voice/page.js` · `app/create/[id]/images/page.js` ·
`app/create/[id]/video/page.js` · 클립·목소리·이미지 재생성 라우트.

⚠️ `regenPrice` 는 모르는 종류에 **던진다**. 모델 인자를 더할 때 그 성질을 유지한다 —
조용히 0(공짜)이 되는 것이 이 표에서 가장 위험하다.

### 6. 저장과 잠금 — `PATCH /api/projects/[id]`

`aspect_ratio`·`target_seconds` 를 판정하는 자리(락을 잡기 전) 바로 아래에 둔다.

- 닫힌 목록: `I2V_MODELS` 의 id 가 아니면 **400**
- **잠금: 클립이 하나라도 있으면 400.** `cuts.some((c) => c.video?.url)` 이 참이면
  거절한다. `0eb1018 fix(billing): 정가를 낸 뒤 길이를 못 바꾸게 한다` 와 같은 자리·같은
  패턴이다
- 오류 문구는 형제들과 같은 결로: 모르는 값이면 "그 영상 모델은 몰라요",
  잠긴 경우는 "이미 영상을 만들기 시작해서 모델을 바꿀 수 없어요"

`POST /api/projects`(생성)의 settings 화이트리스트에 `i2v_model` 을 더하고, 없으면
기본값을 **명시 저장**한다(3번). ★ 빠른 생성(`lib/auto.js` · `components/QuickCreate.jsx`)도
같은 생성 라우트를 타는지 확인하고, 다른 경로로 프로젝트를 만든다면 그쪽에도 같은 명시
저장이 있어야 한다 — 한 경로만 빠지면 그 프로젝트들이 "옛 프로젝트"로 오인되어 Kling 으로
돈다.

`settings.i2v_model` 에 저장하는 값은 **`I2V_MODELS` 의 `id`**(예: `"seedance-2.0"`)이지
엔드포인트 문자열이 아니다. 엔드포인트는 표가 쥔다.

### 7. 클립을 만드는 자리 — `lib/i2v.js` · `lib/pipeline.js`

`generateClip` 이 env 대신 **넘겨받은 모델**로 돈다. 파이프라인이 `project.settings.i2v_model`
을 넘긴다. 자막 위치(`subtitlePosition`)를 넘긴 것과 같은 배선이다.

`estimateCost`·`addRecord` 에 실리는 endpoint 도 같은 값이어야 한다 — 원장이 어느 모델로
만들었는지의 유일한 기록이다.

### 8. 화면 — ⑤영상

- 모델 카드/칩 둘. 각각 `label` · `hint` · **이 길이의 정가**(크레딧)
- 첫 클립이 생기면 선택이 사라지고 "이 영상은 ○○ 으로 만들고 있어요" 한 줄만 남는다
- `.chips`/`.chip`/`.chip.on` 등 **이미 있는 CSS 를 쓴다**
- 저장은 `PATCH { settings: { i2v_model } }`, 실패하면 그 화면의 기존 오류 자리에 띄운다

### 9. 프로젝트 예산 상한 폐지 — `lib/costs.js`

`limitProject()` 와 `assertBudget` 의 프로젝트 축을 걷어낸다.
**전역 상한 $300 과 크레딧 잔액은 그대로 둔다** — 전역은 버그가 났을 때 우리 돈을 막는
마지막 문이고, 사장님 축은 크레딧이 맡는다.

`BudgetExceeded` 의 `"project"` 갈래와 그것을 읽는 화면·문구도 함께 정리한다.

## 이번에 안 하는 것

- **Seedance 오디오를 쓰지 않는다.** `generate_audio: false` 로 둔다 — 지금은 낭독이 살아
  있어서 켜면 소리가 두 겹이 되고, 낭독이 컷 길이를 정하는 뼈대와 어긋난다.
  다만 fal 문서에 "끄든 켜든 오디오가 붙는다"로 읽히는 대목이 있으므로,
  **합성이 클립의 소리 트랙을 확실히 버리는지 `lib/compose.js` 에서 코드로 확인**하는 것까지가
  이번 범위다. 버리지 않고 있으면 **고치지 말고 보고**한다 — 덩어리 B 의 입력이다
- 낭독(TTS) 폐지, 컷 길이·자막 원천·단계 구조 재설계 → **덩어리 B**
- LTX 를 화면에 노출하는 것 — `CLIP_PROFILES` 에는 남기되 고를 수 없다
- 판매가·마진 — 결제를 붙일 때 정한다

## 지켜야 할 것

- 새 npm 의존성 금지, 새 CSS 금지
- `lib/pricing.js` 와 `lib/clip-limits.js` 는 화면이 import 한다 — 서버 전용 의존(`fs` 등)을
  끌고 오면 번들이 깨진다
- 가격 숫자를 라우트·화면에 흘리지 않는다. `lib/pricing.js` 하나다
- 모델 문자열을 두 군데 두지 않는다. `lib/clip-limits.js` 하나다
- **옛 프로젝트가 조용히 모델을 갈아타면 안 된다**(3번)
- 예상 못 한 실패는 고치지 말고 보고한다

## 어떻게 확인하나

- **단위**: 프로필 매칭(Seedance 4~15 정수·`generate_audio:false`) · `videoPrice`/`regenPrice`
  의 모델별 값과 폴백 · `isFalEndpoint` 가 Seedance 를 fal 로 본다 · 원가표가
  Seedance 를 $0 이 아니게 센다
- **옛 프로젝트 보호**: `i2v_model` 이 없는 프로젝트가 Kling 엔드포인트·Kling 가격으로
  판정되는지. 이 단정이 3번의 전부다
- **라우트**: 모르는 값 400 · 아는 값 200 저장 · **클립이 있으면 400**(잠금) ·
  `i2v_model` 을 안 보내는 PATCH 는 그대로 통과
- **배선**: 파이프라인이 프로젝트의 모델로 `generateClip` 을 부르고, 원장에 그 엔드포인트가
  남는지
- **예산**: 프로젝트 축이 사라지고 전역 축은 그대로 도는지
- **눈으로**: ⑤영상에서 칩 둘과 각각의 크레딧이 보이는가 · 고른 것이 저장되는가 ·
  첫 클립을 만든 뒤 선택이 사라지고 안내 한 줄만 남는가
- **라이브(유료, 사용자 승인 필요)**: Seedance 클립 한 편을 실제로 사서 ①4~15초 요청이
  통과하는지 ②원장 원가가 $0.3024/s 로 맞는지 ③소리가 실렸는지, 실렸다면 합성 뒤에 남는지
