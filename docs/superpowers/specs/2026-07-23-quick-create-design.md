# shotform 빠른 생성 (홈) — 설계

2026-07-23 · 브레인스토밍 세션에서 확정. 목업: 세션 스크래치패드 `shotform-mockup-v4.html`.

## 배경과 목적

shotform-saas 는 숏폼 자동 생성 SaaS. 전체 제품은 승인 게이트 구조(자료·설정 → 대본 → 이미지 → 클립 → 병합, D1~D12)로 설계돼 있으나, 이는 모델 성능이 낮던 시절의 정밀 제어 방식이라는 가설이 있다. **이 슬라이스는 최신 모델의 성능을 검증하는 실험**: 사용자와의 대화로 영상 생성에 필요한 정보를 수집하고, 그것을 비디오 모델에 일괄 전달해 결과 품질을 확인한다.

## 범위

구현: **사이드바 + 홈 빠른 생성**만.
- 사이드바: 홈(활성) / 영상 만들기(단계별) / 보관함 / 템플릿 / 설정 — 홈 외에는 자리만(비활성)
- 홈: 대화형 text-to-video — 챗 UI → 정보 수집 → 영상 생성 → 결과 재생
제외: 인증, 크레딧, DB, 단계별 워크플로우, 템플릿.

## 아키텍처

Next.js(App Router, JS) 단일 앱. DB 없음(상태는 클라이언트 + fal 큐).

| 구성 | 역할 |
|---|---|
| `app/page.js` | 홈 챗 클라이언트 (메시지, 퀵리플라이, 결과 비디오) |
| `components/Sidebar.jsx` | 사이드바 |
| `POST /api/chat` | gpt-4o. 대화 이력 → JSON 응답: `{action:"ask", message, quick_replies[]}` 또는 `{action:"generate", prompt(영어 영상 프롬프트), duration, aspect_ratio, summary}` |
| `POST /api/video` | fal.ai 큐에 제출 → `{request_id}` |
| `GET /api/video/status?id=` | 큐 상태/결과 폴링 → `{status, video_url?}` |

- 비디오 모델: env `FAL_VIDEO_ENDPOINT` (기본 Kling t2v). 단일 클립 5~10초.
- env: `OPENAI_API_KEY`, `FAL_KEY`.
- 디자인: 목업 v4의 dropshot 다크 토큰 그대로 (bg #15191E, surface #1F242A, accent #6633FF, 흰 CTA).

## 대화 수집 규칙 (gpt-4o 시스템 프롬프트 요지)

- 수집 항목: ①무엇을(주제·내용·포인트) ②길이(5초/10초)와 비율(9:16/1:1/16:9) ③느낌·톤
- 한 번에 한 가지만 물음, 가능하면 quick_replies 제공. 이미 준 정보는 다시 묻지 않음
- 충분해지면 `generate`: 수집 내용을 살린 영어 비디오 프롬프트 작성 + 한국어 summary

## 오류 처리

- fal 실패/타임아웃: 챗에 실패 말풍선 + "다시 시도". 폴링 3분 상한
- OpenAI 실패: "잠시 후 다시" 말풍선. JSON 파싱 실패 시 1회 재요청

## 검증

- `npm run build` 통과 + 로컬 dev에서 실키로 e2e 1회(대화→클립 재생) — 실키 검증은 사용자와 함께
- chat 응답 JSON 스키마 검사 로직은 단위 수준으로 API 내 방어
