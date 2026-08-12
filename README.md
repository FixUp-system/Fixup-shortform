# shotform-saas

숏폼 자동 생성 SaaS. **홈 — 빠른 생성(대화형 text-to-video)** 과 **단계별 워크플로우(자료 정리·확인 → 대본 → 목소리 → 이미지 → 영상 → 완성)** 가 구현돼 있습니다.

## 실행

```bash
npm install
cp .env.local.example .env.local   # 키 채우기
npm run dev
```

필요한 키:
- `OPENAI_API_KEY` — 대화 수집 (gpt-4o)
- `FAL_KEY` — 영상 생성 (fal.ai)
- `FAL_IMAGE_ENDPOINT` — 컷 이미지 모델 (기본: fal-ai/nano-banana, $0.04/장)
- 영상 모델은 env 가 아니라 프로젝트가 정한다(⑤영상에서 고른다, `lib/clip-limits.js`의 `I2V_MODELS`)

## 구조

빠른 생성 (대화 → 단계별 파이프라인 자동 관통):

```
app/page.js                          홈 챗 UI (메시지·퀵리플라이·결과 재생)
components/QuickCreate.jsx           대화 → 요약 카드 → 자동 관통 시작·진행 폴링
components/Sidebar.jsx               사이드바
app/api/chat/route.js                gpt-4o 대화 수집 → ask | generate JSON
app/api/projects/[id]/auto/route.js  대본→목소리→그림→클립→합성 자동 관통
```

단계별 워크플로우 (프로젝트 기반, M1):

```
app/create/page.js                              새 프로젝트 시작 (업로드·정보 입력)
app/create/[id]/page.js                         프로젝트 진행 화면 (대본 승인 → 컷 이미지)
app/api/uploads/route.js                        제품 사진 업로드
app/api/uploads/[name]/route.js                 업로드 파일 서빙
app/api/projects/route.js                       프로젝트 생성·목록
app/api/projects/[id]/route.js                  프로젝트 조회
app/api/projects/[id]/script/route.js           대본 생성·승인
app/api/projects/[id]/cuts/route.js             컷 이미지 생성 시작
app/api/projects/[id]/cuts/status/route.js      컷 생성 진행 폴링
app/api/projects/[id]/cuts/[idx]/regen/route.js 개별 컷 재생성
lib/projects.js                                 프로젝트 저장소 (파일 기반)
lib/llm.js                                      LLM 호출 공통
lib/validate.js                                 입력 검증
lib/script.js                                   대본 생성
lib/cuts.js                                     컷 분해
lib/imagegen.js                                 fal.ai 이미지 생성 ($0.04/장 고정 기록)
lib/vlm.js                                      이미지 검수 (VLM)
lib/pipeline.js                                 컷 생성 파이프라인 오케스트레이션
```

공통:

```
lib/costs.js                   비용 기록 저장소 (data/costs.json)
app/api/costs/route.js         비용 조회
docs/superpowers/specs/        설계 문서
```

## 주의

- fal 모델 엔드포인트·응답 포맷은 모델마다 다를 수 있음 — 새 모델로 바꿀 때 `status/route.js`의 결과 파싱(`result.video.url`) 확인 필요
- 전체 제품 설계(승인 게이트 구조 D1~D12)는 `docs/superpowers/specs/` 참고
