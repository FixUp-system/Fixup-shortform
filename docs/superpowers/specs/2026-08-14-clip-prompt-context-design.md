# 영상 프롬프트가 무대와 인물을 받는다 (A단계)

> 2026-08-14 · 대상: `lib/cuts.js`(`buildClipPrompt`) · `lib/steps.js`(`clipKey`)
>
> **B단계(카메라·환경·조명·시간 진행을 새로 만드는 것)는 이 문서의 범위가 아니다.**
> 여기서는 **이미 저장돼 있는 값을 영상 프롬프트에 싣는 것**만 한다.

## 무엇을 바꾸나

영상 프롬프트가 이 영상의 **무대도 인물도 제품도 모른다.** 이미지 프롬프트는 다 받는데
영상 프롬프트만 안 받는다. 새 LLM 패스 없이, 이미 컷에 저장된 값을 싣는다.

## 근거는 실측이다 (2026-08-14, fal 원장에서 꺼낸 실제 문자열)

**영상 프롬프트 — 196~215자, 그중 연출은 앞의 한 절뿐이다:**

```
빠른 속도로 도로를 질주한다. fast, explosive motion. The attached image is the first
frame — continue naturally from it. Keep the subject and style unchanged.
No text or letters. No talking faces or lip sync.
```

**이미지 프롬프트 — 300자에서 잘렸고 실제는 더 길다:**

```
High-quality photographic still …, vertical 9:16 composition.
Scene: Z세대 여성이 플러시 키체인을 가방에 다는 모습 미디엄 샷.
Setting (same in every scene of this video): 실내 스튜디오, 한낮, 자연광이 가득한 밝은 공간.
Characters in this frame (keep them identical across every scene) — 20대 여성: 긴 머리, 캐주얼한 옷차림.
The video's subject is: … Keep this exact p…
```

| | 이미지 | 영상 |
|---|---|---|
| 장면 서술 | 구체적 | **한 절** |
| 무대(장소·시간대·조명) | `Setting (same in every scene)` | **없음** |
| 인물 외형 일관성 | `keep them identical` | **없음** |
| 제품 앵커·외형 | `Keep this exact product` | `Keep the subject unchanged` 한 줄 |
| 화면비 | 명시 | **없음** |
| 화풍·톤 | 실림 | **없음** |

★ **클립은 이미지에서 이어지는데, 이어질 맥락을 안 받는다.** 첫 프레임만 보고 나머지를
모델 재량으로 만든다 — 무대가 바뀌고 인물이 달라져도 막을 지시가 없다.

## 구조

### 1. 절을 만드는 자리를 하나로 모은다

지금 무대·인물·제품·톤 절은 `buildImagePrompt` 안에 **인라인으로 조립**돼 있다.
영상 쪽에 복사하면 **두 벌이 되어 언젠가 갈린다**(이 저장소가 반복해 겪은 실패다).

→ 각 절을 **순수 함수로 뽑고** 두 프롬프트가 같은 함수를 부른다.

```
stageClause(cut)      무대   — cut.environment
castClause(cut, project)  인물   — project.cast 중 이 컷에 배정된 look
subjectClause(project)    제품   — briefing.focus(물건) 또는 topic + look
toneClause(cut)       톤     — cut.tone (usableTone 을 그대로 쓴다)
orientOf(project)     화면비 — settings.aspect_ratio
```

⚠️ **문구를 바꾸지 않는다.** 뽑아내기만 한다 — 한 글자라도 달라지면 기존 그림이 낡는다.
이미지 프롬프트의 출력이 **바이트 단위로 같아야** 한다(테스트로 못 박는다).

### 2. 영상 프롬프트가 그 절들을 싣는다

지금:
```
{motion}. {speed}. The attached image is the first frame — … No talking faces …
```

앞으로(순서가 뜻이다 — 움직임이 먼저, 맥락이 뒤):
```
{motion}. {speed}.
{orient} composition.
{stage}          Setting (same in every scene of this video): …
{cast}           Characters in this frame (keep them identical across every scene) — …
{subject}        The video's subject is: … Keep this exact product/subject consistent …
{tone}           Overall look and color treatment, keep identical across all cuts: …
The attached image is the first frame — continue naturally from it.
Keep the subject and style unchanged. No text or letters. [No talking faces or lip sync.]
```

★ **없으면 절을 안 넣는다** — 값이 없는 컷의 프롬프트가 길어지지 않게(이미지 쪽과 같은 규칙).

### 3. 각인에 같은 값을 넣는다

`clipKey`(`lib/steps.js`)는 **프롬프트에 실리는 것**을 담아야 한다. 안 넣으면 무대를 고쳐도
클립이 안 낡아, 화면은 새 무대인데 영상은 옛 무대인 상태가 조용히 남는다.

⚠️ **넣으면 이미 산 클립이 낡는다.** 저장소는 이 자리에서 "있을 때만 덧붙인다"로 네 번
피해 왔다(style_of · 자막 위치 · tone_of · 해상도).

★ **이번에는 재 봤다(2026-08-14):** 클립을 산 프로젝트 **3편 · 클립 7개**가 전부다.
7개 모두 `environment` 를 갖고 있어 낡는다. 전부 다시 사도 **몇 달러**이고, 셋 다 내부 QA
프로젝트다. → **각인을 제대로 넣는다.** 물려받은 두려움보다 실측이 앞선다.

(낡음은 자동 청구가 아니다 — 화면에 "다시 만들기"가 뜨고 사장님이 누를 때 값이 나간다.)

## 지켜야 할 것

- **이미지 프롬프트 출력이 바이트 단위로 안 바뀐다.** 절을 뽑아내되 문구는 그대로
- 값이 없으면 절을 넣지 않는다(빈 절이 프롬프트를 늘리지 않게)
- `motion`·`speed` 는 이 단계에서 **안 건드린다**(B단계 몫)
- 말하는 경로(Seedance)의 대사·목소리 문구를 안 건드린다 — 각인이 그것을 이미 본다
- 광고 경로(`lib/ad/*`)를 안 건드린다

## 검증

1. **이미지 프롬프트 무회귀** — 뽑아내기 전후 출력이 문자열로 동일(테스트)
2. **영상 프롬프트에 무대·인물·제품·톤·화면비가 실린다**(값이 있을 때만)
3. **각인이 그 값들을 본다** — 무대를 바꾸면 클립이 낡고, 안 바꾸면 안 낡는다
4. **원장으로 실측** — 다음 생성 뒤 `cost_records.meta.prompt` 를 다시 꺼내 길이와 내용을 본다.
   지금 196~215자다. 그것이 어떻게 바뀌는지가 이 작업의 성적표다

## 이번에 안 하는 것 (B단계)

- 카메라 이동 방향 · 환경 움직임 · 조명 변화 · 컷 안의 시간 진행
- Motion Arc 강제(`speedContrast()` 가 **호출처 0곳인 죽은 코드**로 있다 — B에서 살린다)
- `motion` 을 카메라/피사체로 쪼개는 것
  (⚠️ `lib/cuts.js:361` 이 "둘 다 넣지 않는다"를 굵게 금지하고 있다. **근거가 주석에 없어
  B단계 설계 전에 커밋 기록에서 확인해야 한다** — 실측으로 정한 규칙이면 뒤집을 때 같은
  실패가 돌아온다)
