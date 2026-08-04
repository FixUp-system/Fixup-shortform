# 빠른 생성 → 단계별 파이프라인 자동 관통 (2026-08-04)

## 목적

빠른 생성(홈 대화)의 산출물을 t2v 단일 클립에서 **단계별 파이프라인의 완성본**
(낭독·자막·합성 mp4)으로 바꾼다. 사용자는 대화 몇 번으로 끝나고, 백엔드가
①자료→②대본→③컷→④목소리→⑤이미지→⑥클립→⑦합성을 **검토 게이트 없이 자동 관통**한다.

## 확정된 결정

| 결정 | 내용 |
|---|---|
| 기존 경로 | **완전 대체** — `/api/video`·`/api/video/status`(t2v 단일 클립)와 chat 의 옛 generate 스키마 제거 |
| 대화 수집 범위 | **최소만** — 주제·내용·느낌 중심. 길이·비율은 빠른 질문 한 번, 화풍·목소리는 LLM 자동 선택. "그냥 만들어줘" 시 전부 기본값(30초·9:16) |
| 실패 처리 | **자동 재시도 1회 후 강행** — 실패 컷은 기존 regen 함수로 1회 재시도(3회 상한 내 소진), 그래도 실패면 빼고 진행. VLM 물림(needs_attention)은 그대로 통과(이 저장소는 VLM 을 안 믿는다) |
| 시작 확인 | **요약 카드 + [만들기] 버튼 한 번** — 이후 완성까지 무정차. 원가 ~$2.59/편이라 오해된 요약으로 바로 나가지 않게 |

## 아키텍처 — 서버 오케스트레이터 (채택안 A)

새 `lib/auto.js` 의 `runAutoPipeline(projectId, ownerId)` 이 기존 lib 함수들을
순서대로 await 로 잇는다. **기존 파이프라인 함수는 무수정 재사용**이 원칙.

```
runAutoPipeline(projectId, ownerId):
  ① 브리핑 추출 → briefing.confirmed=true 자동 확정 (asked 무시, develop 없음)
  ② 대본 생성 (초안→되돌리기→교정 루프) → 승인 없이 채택
  ③ runSplitPipeline           — 컷 분할+화면 설계+캐스팅 (OpenAI만, fal 비용 0)
  ④ runVoicePipeline           — voice_error 컷은 regenVoice 1회 → 실패면 통과
  ⑤ runImagesPipeline          — 이미지 자체가 없는 컷만 regenCut 1회, needs_attention 통과
  ⑥ runVideoPipeline           — video_error 컷은 regenClip 1회
  ⑦ runRenderPipeline          — 합성은 이미 클립 없는 컷을 거른다(lib/compose.js:150 usable 필터) → 무수정
  각 단계 전후 project.auto = { stage, state: "running"|"done"|"failed", error } 갱신
```

- 라우트 안에 있던 브리핑 추출·대본 생성 루프는 **lib 로 추출**해 라우트와
  오케스트레이터가 같은 함수를 부른다(로직 복제 금지).
- 자기 HTTP 호출(안 B)은 쓰지 않는다 — `withUser` 가 middleware 주입 헤더를 신뢰하는
  구조라 자기호출은 헤더 위조와 같은 모양이 된다.
- 치명 실패(단계 자체가 죽음)는 `auto.state="failed"` + 프로젝트는 남는다 →
  화면이 "이어서 단계별로 만들기" 링크를 준다(이미 산 산출물은 살아 있다).
- `assertBudget`(전역·사용자 상한)은 각 lib 호출 안에 이미 있어 그대로 물린다.
- fire-and-forget 은 기존 게이트 라우트와 같은 패턴(시작 응답 후 폴링). actor 는
  ALS 계약 그대로 — 백그라운드 체인에 사용자 uuid 가 실려야 한다.

## 대화(`/api/chat`) 개편

generate 응답 스키마:

```json
{ "action": "generate",
  "material_text": "<자료 원문 — 대화에서 수집한 사실·포인트를 한국어 서술형으로>",
  "target_seconds": 15 | 30 | 45 | 60,
  "aspect_ratio": "9:16" | "1:1" | "16:9",
  "style": "<화풍 7종 중 택1 (lib/styles.js)>",
  "voice_label": "<목소리 4종 중 택1 (lib/voices.js)>",
  "summary": "<한국어 한 줄 요약>" }
```

- 사용자가 말한 구체 디테일(제품명·가격·포인트)은 material_text 에 하나도 빠뜨리지 않는다.
- 검증은 코드가 한다: target_seconds 는 TARGET_CHOICES 밖이면 30, style 은 normalizeStyle,
  voice_label 은 VOICES 목록 대조 — 목록 밖 값이 유료 호출로 새지 않게.

## 시작 흐름과 진행 화면

1. generate → 요약 카드([주제·길이·비율·화풍·목소리]) + [만들기] 버튼
2. 클릭 → `POST /api/projects`(기존 라우트 그대로) → `POST /api/projects/[id]/auto`(신설,
   withUser·멱등 가드) → 202 응답 후 무정차
3. 화면은 `GET /api/projects/[id]` 5초 폴링 — `auto.stage` 로 "대본을 쓰는 중…" 진행 표시
4. 완성: `render.url` 을 대화 안에서 재생 + 보관함 링크. 실패: 단계별 화면 링크

## 테스트

- 오케스트레이터는 deps 주입(기존 pipeline.test.js 패턴)으로: 단계 순서 · 자동 확정 ·
  재시도 1회(초과 금지) · 강행 · 치명 실패 시 auto.state="failed" · actor 유지
- chat 스키마 검증(목록 밖 값 폴백), auto 라우트 인증·멱등
- `SHOTFORM_FAKE=all` 관통 확인. ⚠️ 알려진 함정: 가짜 모드는 비용 기록을 안 남긴다
  (fake 판정이 addRecord 앞) — 비용 배선 검증은 `SHOTFORM_FAKE=fal` 로
- **라이브 유료 검증은 별도 사용자 승인 후**

## 제거 대상

- `app/api/video/route.js` · `app/api/video/status/` (t2v 경로)
- `components/QuickCreate.jsx` 의 t2v 제출·폴링 코드(35·48행 fetch)
- 홈 문구 "결과는 5~10초 단일 클립이에요"
- 관련 테스트 `quick-create-budget.test.js` 는 auto 흐름 기준으로 재작성
