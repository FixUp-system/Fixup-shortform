# shotform-saas — 작업 지침

> **이 파일은 규칙과 함정만 담는다.** 상태·남은 일은 [`OUTSTANDING.md`](OUTSTANDING.md),
> 제품 개요는 [`README.md`](README.md), 회차 서사는 wiki(아래 「세션 마무리」)다.
> 2026-09-30 까지의 긴 판(570줄)은 [`docs/history/CLAUDE-until-2026-09-30.md`](docs/history/CLAUDE-until-2026-09-30.md) 에 있다.
>
> ★ **적는 규칙**: 날짜별 사건 기록을 여기 쌓지 마라 — 그것은 wiki 의 일이다. 여기에는
> "다음 사람이 모르면 사고가 나는 것"만, **지금도 참인 것**만 적는다. 틀린 줄을 발견하면
> 정정 문단을 덧붙이지 말고 **그 줄을 고친다.** 커밋 수·테스트 수는 적지 않는다(적는 순간 낡는다 — 세어라).

## 시작할 때

- `OUTSTANDING.md` 를 먼저 읽는다. wiki(`C:\Users\fixup\obsidian_jaechan`)의 `index.md` 에서
  shotform 최신 회차를 확인한다 — wiki 는 출발점일 뿐, 사실은 코드로 검증한다.
- 새로 클론했으면 `npm install` 이 먼저다. 안 하면 `npx vitest run` 이 `Cannot find module 'vitest/config'` 로 죽는다.
- 테스트는 **`npx vitest run --dir ./tests`** — `--dir` 없이 돌리면 `.claude/worktrees/**` 의 다른
  워크트리 테스트까지 주워 수백 개가 빨개진다.

## 이 저장소에서 일하는 방식

- ★ **다른 사람과 함께 쓰는 저장소다. `main` 에 직접 쓰지 않는다.** 로컬에서 브랜치를 따서
  (`git checkout -b <type>/<주제>`) 고치고, 푸시·PR·배포는 **사용자가 요청할 때만** 한다.
- **유료 생성(fal)은 실행 전 반드시 사용자 승인 — 매 회.** 견적을 한 번 승인받았어도 생성마다 다시 묻는다.
  무료로 볼 수 있는 것(가짜 모드·DB 조회)을 먼저 다 한다.
- 파일 쓰기: PowerShell 로 한글 파일을 쓰지 않는다 · 파이썬 텍스트 모드는 CRLF 로 바꿀 수 있다(`newline="\n"`) —
  커밋 전에 `git diff --stat` 으로 줄 수가 튀지 않았는지 본다 · `git checkout <파일>` 로 되돌리지 않는다(진행 중 작업이 사라진다).
- **측정 없이 품질을 주장하지 않는다.** 프롬프트를 고쳤으면 돌려서 수치를 본다 → 스킬
  `measuring-llm-prompt-changes`(`.claude/skills/`).
- 지켜져야 하는 것(길이·원문 보존·중복)은 프롬프트가 아니라 **코드가 판정**하고, 넘으면 **코드가 되돌린다.**
  금지 문구를 더 붙이는 것은 소용없다 — 못 그리는 것은 애초에 요구하지 않는다.
- 임계값은 감이 아니라 **실측 분포**에서 뽑는다. 프롬프트 예시는 테스트 자료와 소재·동사가 겹치지 않게.
- 병렬 서브에이전트는 **파일 단위로만** 가른다. 지시문에 건드리면 안 되는 파일 목록과 `git add -A`
  금지를 넣고, "예상 못 한 실패는 고치지 말고 보고하라"를 넣는다. 리뷰 BASE 는 태스크별 커밋 해시로.
- ★ **결함은 태스크 경계에 모인다** — 개별 리뷰가 다 통과해도 합쳐 보면 드러난다. "값이 어디서
  만들어져 어디까지 흐르는가"를 태스크 하나로 세운다.
- 린터·타입체커는 없다(순수 JS). **판정하는 것은 테스트뿐이다.**

## ★★ 화면 파일을 손댔으면 한 번 굽는다

화면 계약은 소스 문자열을 훑어 잰다(`tests/*-ui.test.js`) — **문법이 깨진 파일을 못 잡는다**
(판이 전부 초록인데 앱이 안 뜬 적이 여러 번 있다). 화면을 고쳤으면 `npx next build` 로 확인한다.

- ⚠️ **dev 서버를 먼저 끈다.** 빌드가 `.next` 를 덮어써 돌던 dev 서버가 `Cannot find module
  './vendor-chunks/*.js'` 로 죽는다 — 증상은 **손대지 않은 페이지의 500**이다.
  굽고 나면 `.next` 를 지우고 dev 를 다시 띄운다.
- ⚠️ `SHOTFORM_DIST_DIR` 는 **아무 일도 안 한다** — `next.config.mjs` 에 `distDir` 배선이 없다.
  dev 를 못 끄는 상황이면 **별도 워크트리**에서 `npm ci` → 빌드한다.
- ⚠️ **스크립트(heredoc)로 코드를 넣으면 역슬래시가 한 겹 먹힌다** — `\n` 이 줄바꿈으로, 정규식 `\b` 가
  백스페이스(0x08)로 박힌다. 코드 수정은 Edit 도구로, 스크립트면 파일로 써서 돌린다.

## 실행

```bash
npm run dev                                  # localhost:3000
SHOTFORM_FAKE=fal npm run dev                # fal 만 가짜, LLM 은 진짜
SHOTFORM_FAKE=all npm run dev                # 전부 가짜 — 0원
npx vitest run --dir ./tests                 # 전체
npx vitest run --dir ./tests tests/charges.test.js   # 파일 하나
npx vitest run --dir ./tests -t "낡음"        # 이름으로
node scripts/measure/<스크립트>.mjs           # 실측 — 유료 호출이 있다(승인 먼저)
```

- `SHOTFORM_FAKE` 는 `lib/fake.js` 한 곳이 판정한다(`off`/`fal`/`all`). **모르는 값은 `off`(= 돈이 나감)다.**
- ⚠️ **가짜 모드로는 비용 배선을 검증할 수 없다** — 가짜 판정이 원장 기록 **앞**이라 기록이 안 남는다.
  원장을 보려면 `SHOTFORM_FAKE=fal`(LLM 만 진짜)로.
- 개발 중 로그인은 `.env.local` 의 `SHOTFORM_DEV_USER` 로 건너뛴다(프로덕션 빌드에서는 무시).
  **로그인 화면을 보려면 그 값을 비워야 한다.**
- 측정 스크립트가 첫 유료 호출부터 죽으면 체험 그물이다 — `SHOTFORM_MEASURE_USER` 에 크레딧을 가진 uuid 를 넣는다.

## 원격과 배포

- ⚠️⚠️ **원격이 둘이다.** `origin` = FixUp-system/Fixup-shortform · `fixup` = jaechanyoon0519-Fixup/Fixup-shortform.
  **Vercel 이 보는 것은 `fixup` 뿐이다.** 푸시 전에 `git remote -v` 를 본다.
- ⚠️ **푸시는 배포가 아니다.** 커밋 작성자 이메일(`system@fix-up.kr`)이 GitHub 계정과 매칭 안 돼
  Git 트리거 빌드가 0ms 에서 멈춘다(근본 해결: 그 이메일을 GitHub 계정에 인증 등록).
- **배포 절차** (Vercel `fixup-shortform-service` · 팀 scope `fix-up1`):
  1. 배포할 커밋이 `main` 에 있는지 본다 — **브랜치에서 배포하면 `main` 과 라이브가 갈린다**
     (옛 `main` 을 배포해 하루치 64파일을 날린 적이 있다).
  2. `git archive --format=tar <커밋> | tar -x -C <빈폴더>` → `.vercel` 만 복사 → 직전 배포 폴더와 `diff -rq`.
  3. `npx vercel deploy --prod --yes --scope fix-up1`
  4. **`npx vercel inspect https://fixup-shortform-service.vercel.app` 로 사장님 주소가 새 판인지 확인.**
     안 바뀌었으면 `npx vercel promote <배포URL> --scope fix-up1` (롤백하면 주소가 옛 판에 고정된다).
- 배포 전 점검: `.env.local.example` 의 diff(새 env → `npx vercel env ls production` 에 먼저 넣기),
  `db/schema.sql` 의 diff(있으면 라이브 DB 에 먼저 올리기 — 파일을 통째로 올려도 안전하다).
- CLI 함정: `npx vercel whoami` 가 `jaechanyoon0519-8298` 이어야 한다(`fixup-system` 이면 안 된다) ·
  `--scope fix-up1` 을 빼면 Not authorized · `vercel link --project` 는 **새 프로젝트를 만든다**(`.vercel` 을 복사해 쓴다) ·
  확인은 정식 도메인에서 한다(`…-fix-up1` 배포 주소는 팀 SSO 로 막혀 `inspect` 의 Aliases 도 증거가 못 된다).

## 인증 — 불변식

- **이메일·비밀번호 로그인 + 승인제.** 비밀번호 재설정은 운영자가 한다(`/admin`).
  Supabase 대시보드의 **"Confirm email" 을 꺼야** 가입이 된다(켜져 있으면 라우트가 500 + 안내).
  첫 관리자는 `docs/auth-setup.md` — `profiles`·`app_metadata` 양쪽이다.
- **신원 검증은 `middleware.js` 에서 요청당 한 번**, 결과를 요청 헤더로 주입한다. 라우트는
  `withUser(handler, {adminOnly})` 로 읽기만 한다. **matcher 가 곧 보안 경계다.**
- **`getProject(id, ownerId)` — 소유자가 필수 인자다**(안 넘기면 던진다). 이것이 진짜 방어선이고,
  RLS(정책 0개 = 전부 거부)는 anon 키가 샜을 때의 2차 방어다. 앱은 `service_role` 로 붙는다.
- **`costActor()` 는 AsyncLocalStorage 에서 읽고, 컨텍스트가 없으면 던진다**(`lib/actor.js`) —
  라우트는 `withUser` 가, 스크립트·크론은 `runWithActor(...)` 가 세운다.
- 공개 경로는 `lib/auth/paths.js`(둘로 나뉜 이유가 주석에 있다 — 합치지 마라), 손님 읽기 경로는
  `lib/auth/guest.js`. 남의 문서는 운영자만 본다(`getProjectForViewing`).

## 저장 계층 — Supabase

`.env.local` 에 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 가 없으면 **서버가 죽는다**(조용히 인메모리로
안 떨어진다). 테스트만 `vitest.setup.js` 가 `SHOTFORM_STORE=memory` 를 세운다.

| 무엇 | 어디 |
|---|---|
| 프로젝트 문서 | Postgres `projects.doc`(jsonb 통짜) + `version`(낙관적 락) |
| 원가 원장(USD) | `cost_records` — `request_id` 가 기본키 = 멱등키 |
| 크레딧 장부 | `credit_grants`(충전) · `credit_charges`(청구·환불, `idem_key` 유니크) |
| 업로드 사진 · 완성본 | Storage 비공개 버킷 `uploads` · `renders` — URL 은 `/api/uploads/…` · `/api/renders/…` |

- 합계는 SQL 함수(`sum_costs`·`sum_grants`·`sum_charges`)가 낸다 — 앱에서 행을 받아 더하면
  PostgREST 행 상한(1000)에 걸려 **말없이 일부만** 더해진다.
- **`updateProject` 는 프로젝트별 직렬 큐 뒤에 있다.** 정확성은 `version` 이 지키고 큐는 경합을 줄이는
  최적화다(큐가 없으면 동시 갱신 12개 중 2개가 재시도를 소진해 **AI 값만 내고 결과가 버려졌다**).
- ⚠️ 무료 플랜은 며칠 요청이 없으면 **일시정지**되고, 전송량 한도를 넘으면 **402 로 로그인까지 죽는다**(09-07 사고).
  그래서 **랜딩·목록 화면에 `/api/renders` 영상 태그를 쓰지 않는다**(보는 것만으로 전송량을 태운다 — 첫 화면 콜라주의 정적 `/reel/` 파일만 예외).
- jsonb 에서 "없음"을 물을 때는 `->>` 를 쓴다 — 이 저장소는 지울 때 JSON null 을 쓰는데 `->` 는 그것을 SQL NULL 로 안 본다.
- **fal 산출물 URL 은 공개로 읽힌다**(`publicly readable`, 만료 없음). 업로드는 비공개인데 AI 출력은 fal 에
  공개로 남는다 — URL 이 무작위인 것은 가림막이지 자물쇠가 아니다.

## 돈 — 청구·원가·지출 그물

- **장부가 둘이고 단위가 다르다. 섞지 마라** — 청구는 **크레딧**(사장님이 낸 값), 원가는 **USD**(우리가 낸 값).
  잔액 = 충전 합 − 청구 합(잔액 컬럼은 없다). 환불은 지우지 않고 **음수 행**이다.
- **가격은 `lib/pricing.js` 하나가 정한다** — 숫자를 라우트·화면·문서에 옮겨 적지 마라. 이 파일은 화면도
  import 하므로 import 없는 순수 데이터·함수여야 한다.
- **크레딧 스위치**: `SHOTFORM_NO_CREDITS=1` 이면 청구·잔액·체험 한도가 **전부** 꺼진다(`creditsEnabled()`).
  계정별 면제는 `profiles.internal`. **전역 원가 상한은 없다**(2026-08-13 에 걷었다 — `limitTotal()` 은 호출처가 0).
  그래서 크레딧이 꺼진 동안 지출 그물은 **재생성 3회 상한**(`regenCapNow()`)뿐이다.
- 유료 입구는 전부 `requireVideoCharge()` 를 지나고, 재생성은 `chargeRegen()`(회차 키로 멱등)을 지난다.
  **청구는 fal 접수 앞**이다 — 잔액 없이 fal 이 나가는 길을 만들지 않는다.
- **체험 축**(`FREE_TRIAL_USD`): 결제 이력도 크레딧도 없는 사람의 누적 원가. 판정이 `charged <= 0 && balance <= 0`
  인 이유는 `lib/costs.js` 주석에 있다 — 줄이면 돈 낸 사장님이 자기 영상 도중에 갇힌다.

## 오래 걸리는 작업 — fal 은 접수 · 수거 · 마무리

- 서버리스는 응답 뒤 인스턴스를 얼린다. 백그라운드 일은 **`lib/background.js` 의 `runInBackground`** 로 띄운다.
  함수 상한은 300초 — 동기로 기다리는 fal 호출(`fal.run`)은 그 안에 끝나야 하고, 끊기면 **fal 은 계속 과금한다.**
- **fal 에는 요청 목록 API 가 없다.** 접수증(`requestId`)을 잃으면 되찾을 길이 없다. 그래서:
  - 접수 때 웹훅 주소에 `p`(프로젝트)·`b`(굽기 표식)를 싣는다(`lib/fal-webhook.js`).
  - 웹훅(`app/api/fal/webhook`)은 ED25519 서명을 확인하고, **페이로드를 믿지 않고** 다시 수거한다. 항상 2xx
    (fal 은 3xx 를 영구 실패로, 그 밖은 31번 재시도로 본다). 웹훅은 로그인 벽 **밖**이다.
  - 접수증을 적기 전에 함수가 죽은 편은 `lib/orphan-receipt.js` 가 되살린다 — **굽기 표식이 같을 때만**.
  - 운영자 구조선: `/api/ads/[id]/attach` · `/api/reel/[id]/attach`(요청 번호로 결과를 붙인다, 굽지 않는다).
- fal 의 정책 거절(초상·저작권)은 **접수 때가 아니라 큐 결과**로 온다(접수 200 ≠ 통과). 거절은 0원이고,
  취소는 안 먹는다(접수 = 지불).
- **"멈춘 것 같다"는 의심이지 종료가 아니다.** 그것을 근거로 돈 쓰는 버튼을 열거나 권하지 마라.
- 상태는 `idle/running/stalled/failed/done` 다섯(`lib/progress.js` 의 `generationState`, 임계 `STALL_MS`).
  "끝난 컷" 판정은 `isCutDone` 하나다. 멈춘 경과는 **서버가** 잰다(브라우저 시계를 믿지 않는다).
- 폴링은 `lib/poll.js` 한 벌이다 — 화면에서 `setInterval` 을 직접 돌리지 마라(남은 예외: `app/ads/[id]/page.js`,
  `app/film/[id]/[mode]/video/page.js`). `onStop` 안에서 화면 ref 를 스스로 비우고, `onTick` 은 await 된다.

## 값이 사는 곳 — 두 벌이면 갈린다

같은 값을 두 군데 두지 않는다. 새 코드가 숫자·모델 문자열을 들고 있으면 먼저 이 표를 본다.

| 무엇 | 유일한 자리 |
|---|---|
| 크레딧 가격·재생성 상한 상수·체험 한도 | `lib/pricing.js` |
| 크레딧 장부·스위치·지금의 재생성 상한 | `lib/charges.js`(`creditsEnabled` · `regenCapNow`) |
| 원가 단가·예산 축·원장 기록 | `lib/costs.js` |
| 광고 영상 모델 표 | `lib/ad/models.js` |
| 단계별 클립 모델·길이·필드 | `lib/clip-limits.js` |
| 그림 모델·화질 | `lib/imagegen.js`(`FAL_IMAGE_ENDPOINT` 로 교체) |
| 가짜 모드 판정 | `lib/fake.js` |
| 저장소 구현 선택 | `lib/store/index.js` |
| 신원 검증 · 공개 경로 · 손님 경로 | `middleware.js` · `lib/auth/paths.js` · `lib/auth/guest.js` |
| 비용 주체(actor) | `lib/actor.js` |
| 사업자 정보(법률 문서) | `lib/legal/company.js`(`draft: true` 인 동안 어디에도 링크되지 않는다) |
| 실패 사유를 사장님 말로 | `lib/failure.js` 의 `classifyFailure`(못 알아본 것은 원문 그대로) |
| 생성 상태·멈춤 임계 · 폴링 루프 | `lib/progress.js` · `lib/poll.js` |
| 옛 단계별 흐름의 단계 표·낡음(각인 `of`) · 오류 필드 | `lib/steps.js` · `lib/step-errors.js` |
| reel 단계 표 · 잠금 | `lib/reel/steps.js` · `lib/reel/locks.js` |
| 화면 비율 · 목소리 · 화풍 | `lib/aspects.js` · `lib/voices.js` · `lib/styles.js` |
| DB 스키마 | `db/schema.sql` |

★ **화면("use client")이 import 하는 모듈은 `fs` 를 끌면 안 된다.** 순수 모듈(`pricing.js`·`clip-limits.js`·
`aspects.js`·`voices.js`·`styles.js`·`steps.js`·`auth/paths.js`·`step-errors.js`·`failure.js`·`progress.js`·`poll.js`·
`reel/doc.js`·`legal/company.js`)에 import 를 더할 때는 그 사슬 끝에 `fs` 가 없는지 본다(빌드가 깨진 사고가 세 번).

## 잊으면 안 되는 것 (모델·프롬프트)

- **레퍼런스는 복사가 아니라 참고다.** 작은 글자는 "글자처럼 생긴 무늬"로 다시 그려진다 — 정확해야 하는
  글자는 **자막이 맡는다**(자막은 원고를 그대로 태운다). 자막 오타의 원천은 원고다.
- **VLM 검수를 믿지 마라** — 틀린 가격을 "명확함"이라 칭찬했다.
- 정지 프레임 한 장에서 긴 폭발적 움직임을 만들 수 없다 — 컷 상한은 콘텐츠·모델·**움직임 속도** 셋이다.
- **리뷰가 절반에서 결함을 잡았다** — 구현자가 "DONE, 우려 없음"으로 보고한 것들이다.
- 영상 모델 표에서 모델을 **지우지 말고 hidden** 으로 둔다 — 옛 문서가 가격표 조회에서 던진다.

## 세션 마무리 — wiki 반영

**세션을 마칠 때는 요청이 없어도 작업을 정리해 wiki 에 반영한다.**

- 보관함은 `C:\Users\fixup\obsidian_jaechan` 이다(사용자 전역 지침 `~/.claude/CLAUDE.md` 의 「Obsidian 지식 wiki」
  절이 가리킨다). 그 안의 `CLAUDE.md`(규약)와 `index.md` 를 **먼저 읽고** 규약을 따른다.
- **wiki 파일은 Write/Edit 도구로만 쓴다.** PowerShell 로 쓰면 한글이 깨진다(실제로 깨뜨렸다).
- 상태가 바뀌었으면 `OUTSTANDING.md` 도 고친다 — **끝난 항목은 지운다**(쌓지 않는다).
