# shotform-saas

숏폼 자동 생성 SaaS. **홈 — 빠른 생성(대화형 text-to-video)** 과 **단계별 워크플로우(자료 정리·확인 → 대본 → 목소리 → 이미지 → 영상 → 완성)** 가 구현돼 있습니다.

## 실행

```bash
npm install
cp .env.local.example .env.local   # 키 채우기
npm run dev
```

필요한 키:
- `CLAUDE_API_KEY` — 대본·컷분할·화면설계·캐스팅·브리핑·대화 (Claude Opus 5)
- `OPENAI_API_KEY` — 이미지 검수·사진 설명만 (gpt-4o vision)
- `FAL_KEY` — 영상 생성 (fal.ai)
- `FAL_IMAGE_ENDPOINT` — 컷·스토리보드 이미지 모델 (코드 기본값: `openai/gpt-image-2`, `lib/imagegen.js`)
- 영상 모델은 env 가 아니라 프로젝트가 정한다(⑤영상에서 고른다, `lib/clip-limits.js`의 `I2V_MODELS`)

## 구조

빠른 생성 (대화 → 단계별 파이프라인 자동 관통):

```
app/page.js                          홈 챗 UI (메시지·퀵리플라이·결과 재생)
components/QuickCreate.jsx           대화 → 요약 카드 → 자동 관통 시작·진행 폴링
components/Sidebar.jsx               사이드바
app/api/chat/route.js                Claude 대화 수집 → ask | generate JSON
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

## 롱폼 (테스트용 · 사이드바 "테스트용 - 롱폼생성")

15초 구간을 여러 개 만들어 이어 붙여 1~10분 영상을 만든다. 모델은 **MiniMax H3**(fal)이고, 인물이
**직접 말한다**(TTS·립싱크 없음). 지금은 화면이 입력만 받고, 생성은 측정 스크립트로 돌린다.

```
plan(시나리오) → cast(실사 캐스팅) → seg1 → seg2 → … → join
```

```bash
S="node --import ./scripts/measure/ext-loader-reg.mjs scripts/measure/longform-2seg.mjs"
$S plan    data/longform/<폴더> --input 입력.json --segments 4 --yes   # 1분 = 구간 4개
$S cast    data/longform/<폴더> --yes                                   # 인물·의상별 H3 5초 클립
$S seg1    data/longform/<폴더> --yes                                   # 구간마다 따로 승인
$S seg2    data/longform/<폴더> --anchor-at 5 --no-last --yes
$S join    data/longform/<폴더>                                         # 0원
$S extend  data/longform/<폴더> --brief "방향" --yes                    # 구운 구간 뒤에 구간 더하기
```

입력 파일 예: `{"text":"사용자가 칠 법한 한 줄","style":"photo","mood":"premium","aspect":"9:16","resolution":"768P","segments":4}`
— 유료 단계는 `--yes` 없이 돌리면 어림값만 보여 주고 멈춘다. `SHOTFORM_FAKE=all` 이면 전 단계가 0원으로 관통한다.

**구조의 핵심(2026-09-30 실측으로 정했다)**
- **참조 사슬의 출발점은 H3 실사 캐스팅이다.** GPT Image 판에서 출발한 참조는 황금빛 역광·보케·화보
  얼굴(AI 질감)을 모든 구간으로 대물림했다. 인물마다 H3 글만(text-to-video)으로 분위기 없는 전신 5초를
  찍고, 그 프레임(얼굴)과 소리(목소리)를 구간 1부터 참조로 넣는다
- **옷이 바뀌면 의상 캐스팅**: 기본 캐스팅 얼굴을 참조로 옷마다 5초를 더 찍고, 구간마다 그 구간에서
  입는 옷의 참조만 싣는다(`characters[].outfits` · `shots[].outfits`)
- **연기 목소리**: 캐스팅이 인물마다 극 중 대사와 겹치지 않는 감정 대사(`audition_line`)를 한 번 더 찍고,
  그 소리를 목소리 참조로 쓴다. 구간 지문은 "음색·나이만 따르고 감정·억양·속도는 장면을 따른다"
  (자기소개 톤 참조가 억양까지 옮겨 목소리가 어색했다 · 극 중 대사로 녹음하면 억양을 통째로 베꼈다)
- **대사별 연기 지시**(`shots[].delivery`): 대사 바로 앞에 `Shot n — [어떻게 말하는지]` 를 붙인다
- **판(스토리보드)은 기본으로 끈다**(`--sheet` 로만 켠다) · 고정 블록에서 "예쁘게" 문구를 뺐다
- **내레이션은 인물의 voiceover** 로만 쓴다 — 캐스팅이 없는 내레이터 목소리는 구간마다 달라진다
- **요구하지 말 것**(`lib/longform/scenario.js` 의 `AVOID_RULES`): 옷감 상태 변화 · 한 우산 뒷모습 ·
  소품 개수 미명시 · golden hour/역광/보케 · 손만 크게 잡는 클로즈업 · 작은 물건을 손가락으로 집거나 놓는 동작

```
lib/longform/plan.js           구간 산수 · 엔드포인트(H3_R2V · H3_T2V)
lib/longform/scenario.js       시나리오 생성·검증·이어 쓰기 · 요구하지 말 것
lib/longform/casting.js        캐스팅·의상 캐스팅 지문 · 목소리 길이
lib/longform/bible.js          고정 블록(인물 잠금) · 구간별 장소·옷
lib/longform/segment-prompt.js 구간 지문 · 구간별 의상 참조(segmentCastRefs)
lib/longform/refs.js           H3 참조 목록(이미지 9 · 파일 12 · 목소리 합 15초)
lib/longform/h3.js             H3 큐 호출(동기 호출은 300초에 끊기고 과금된다)
lib/longform/run-state.js      단계 관문(--yes · 이어 받기 · 인물 잠금) · 어림값
scripts/measure/longform-2seg.mjs   위 단계를 도는 스크립트
scripts/measure/sheet-float-check.mjs 판 자동 검사 정확도 측정(VLM)
```

값(768P): 캐스팅 클립 5초 ≈ $0.30 · 15초 구간 ≈ $0.90 · 시나리오 ≈ $0.40 이하.

## 주의

- fal 모델 엔드포인트·응답 포맷은 모델마다 다를 수 있음 — 새 모델로 바꿀 때 `status/route.js`의 결과 파싱(`result.video.url`) 확인 필요
- 전체 제품 설계(승인 게이트 구조 D1~D12)는 `docs/superpowers/specs/` 참고
