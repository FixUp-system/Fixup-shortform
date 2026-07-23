# shotform-saas

숏폼 자동 생성 SaaS. 현재는 **홈 — 빠른 생성(대화형 text-to-video) 실험 버전**만 구현돼 있습니다.

## 실행

```bash
npm install
cp .env.local.example .env.local   # 키 채우기
npm run dev
```

필요한 키:
- `OPENAI_API_KEY` — 대화 수집 (gpt-4o)
- `FAL_KEY` — 영상 생성 (fal.ai)
- `FAL_VIDEO_ENDPOINT` — 사용할 비디오 모델 (기본: Kling 2.1 standard t2v). 모델 교체는 이 값만 바꾸면 됨

## 구조

```
app/page.js                    홈 챗 UI (메시지·퀵리플라이·결과 재생)
components/Sidebar.jsx         사이드바 (홈 외 메뉴는 준비 중)
app/api/chat/route.js          gpt-4o 대화 수집 → ask | generate JSON
app/api/video/route.js         fal.ai 큐 제출
app/api/video/status/route.js  fal.ai 큐 폴링 → video_url
docs/superpowers/specs/        설계 문서
```

## 주의

- fal 모델 엔드포인트·응답 포맷은 모델마다 다를 수 있음 — 새 모델로 바꿀 때 `status/route.js`의 결과 파싱(`result.video.url`) 확인 필요
- 전체 제품 설계(승인 게이트 구조 D1~D12)는 `docs/superpowers/specs/` 참고
