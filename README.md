# shotform-saas

사진·자료를 넣으면 **숏폼(광고) 영상**을 만들어 주는 SaaS. 프로덕션으로 운영 중이다
(Vercel `fixup-shortform-service` · 서울 리전).

- **작업 규칙·함정** → [`CLAUDE.md`](CLAUDE.md)
- **지금 상태·남은 일** → [`OUTSTANDING.md`](OUTSTANDING.md)
- 지난 회차 기록 → [`docs/history/`](docs/history/) · 설계 문서 → [`docs/superpowers/`](docs/superpowers/)

## 스택

| | |
|---|---|
| 앱 | **Next.js 15**(App Router) · **React 19** · 순수 JavaScript(TypeScript·린터 없음) |
| 인증·DB·파일 | **Supabase** — Auth · Postgres(`db/schema.sql`) · Storage(`uploads`·`renders` 비공개 버킷) |
| AI | Claude(Fable 5 · Opus 5 · Sonnet 5) · OpenAI(사진 읽기) · **fal.ai**(영상·그림·받아쓰기) |
| 영상 처리 | `ffmpeg-static`(합성·자막) · `sharp`(이미지) |
| 테스트 | **Vitest** — 유일한 관문이다 |

## 만드는 방식

| 방식 | 화면 | 노출 | 요약 |
|---|---|---|---|
| **원클릭(광고)** | `/ads/new` → `/ads/[id]` | ✅ | 시나리오 한 편 → fal 영상 **한 번** → 자막 입히기 |
| **단계별(reel)** | `/reel/new` → 시나리오 → 그림 → 프롬프트 → 영상 → 완성 | ✅ | 스토리보드 판 한 장을 참조로 **통째로 한 번**(oneshot), 안 되면 컷별(percut) |
| film | `/film/...` | 숨김 | 광고 제출기를 참조 영상으로, 두 방식 나란히 |
| 옛 단계별 | `/create/...` | 숨김 | 원고 → TTS → 이미지 → 컷별 i2v → ffmpeg |

노출 스위치는 `components/Sidebar.jsx` 의 `SIDEBAR_FLOWS` 다 — **링크만 숨겼고 코드·API 는 살아 있다.**
영상 모델은 env 가 아니라 프로젝트 설정과 코드 표(`lib/ad/models.js` · `lib/clip-limits.js`)가 정한다.

fal 작업은 **접수 → 수거 → 마무리**로 나뉜다(서버리스는 응답 뒤 인스턴스를 얼린다). 완료는
fal 웹훅(`app/api/fal/webhook`)이 알리고, 화면 폴링도 수거를 부른다. 크론은 등록돼 있지 않다.

## 실행

```bash
npm install                                  # 새 클론이면 이것부터 — 안 하면 vitest 가 모듈을 못 찾는다
cp .env.local.example .env.local             # 키를 채운다 — Supabase 키가 없으면 서버가 뜨면서 죽는다
npm run dev                                  # localhost:3000
SHOTFORM_FAKE=fal npm run dev                # fal(영상·그림·소리)만 가짜 — LLM 은 진짜
SHOTFORM_FAKE=all npm run dev                # 전부 가짜 — 0원, 배선·상태 전이만 확인
npx vitest run --dir ./tests                 # 전체 테스트(--dir 없이 돌리면 워크트리 테스트까지 줍는다)
npx next build                               # ⚠️ dev 서버를 먼저 끈다 — .next 를 덮어써 dev 가 죽는다
```

`SHOTFORM_FAKE` 의 모르는 값은 `off`(= 진짜, 돈이 나감)로 본다.

### 환경 변수

| 이름 | 필수 | 무엇 |
|---|---|---|
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_ANON_KEY` | ✅ | 서버 쪽 Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 브라우저 쪽 Supabase(로그인) |
| `CLAUDE_API_KEY` | ✅ | 시나리오·프롬프트·번역·캐스팅(`ANTHROPIC_API_KEY` 도 받는다) |
| `OPENAI_API_KEY` | ✅ | 사진 읽기·얼굴 상자 |
| `FAL_KEY` | ✅ | fal.ai |
| `FAL_IMAGE_ENDPOINT` | | 그림 모델(기본 `openai/gpt-image-2`) |
| `SHOTFORM_PUBLIC_URL` | | 웹훅 기준 주소(없으면 Vercel 프로덕션 주소) |
| `CRON_SECRET` | | `/api/cron/collect` 의 자물쇠 |
| `SHOTFORM_NO_CREDITS` | | `1` 이면 크레딧을 걷지 않는다(내부 QA) — 그동안 재생성은 3회까지 |
| `SHOTFORM_PUBLIC_ARCHIVE` | | `1` 이면 비로그인에게 첫 화면·보관함을 연다(남의 문서는 여전히 404) |
| `SHOTFORM_FAKE` | | `fal` / `all` — 위 참고 |
| `SHOTFORM_DEV_USER` | | 개발 중 로그인 건너뛰기(프로덕션 빌드에서는 무시) |

`SHOTFORM_BUDGET_TOTAL_USD` 는 아무 데서도 안 읽는다(전역 상한은 2026-08-13 에 걷었다).
처음 켤 때 첫 관리자 만들기는 [`docs/auth-setup.md`](docs/auth-setup.md).

## 폴더

```
app/                화면(App Router) — ads · reel · film · create · archive · admin · me · legal · home
app/api/            라우트 — ads · reel · film · projects · uploads · renders · credits · admin · fal/webhook · cron
lib/                로직 — 화면이 import 하는 파일은 fs 를 끌면 안 된다(CLAUDE.md 참고)
  ad/ reel/ film/   방식별 파이프라인
  store/            저장소 구현(supabase · 테스트용 memory)
  auth/             신원·공개 경로
  pricing.js        크레딧 가격표(화면도 읽는다)   charges.js  크레딧 장부
  costs.js          원가 원장                     compose.js  ffmpeg 합성
components/         공용 UI
db/schema.sql       스키마 하나 — 통째로 다시 올려도 안전하다
tests/              Vitest
scripts/measure/    프롬프트·파이프라인 실측 스크립트(유료 호출이 있다)
```

## 배포

Git 푸시로는 배포되지 않는다. 절차는 [`CLAUDE.md`](CLAUDE.md) 의 「배포」 절을 따른다.
