# 프로토타입 배포와 팀 QA — 설계

작성 2026-07-28 · 대상 브랜치 `feature/video-compose`

## 왜 하는가

뒷단(목소리·영상·합성)은 구현됐지만 **실제 fal 호출이 아직 0회**다. 파라미터는 전부 문서를 보고
추정한 값이라 맞는지 모른다. 대본 품질 과제도 다섯 개 남아 있지만, 그걸 더 다듬어도 뒷단이
터지면 QA에 닿지 못한다.

그래서 **제일 안 해본 것을 제일 싸게 먼저 해본다.** 얇은 한 줄을 진짜로 관통시키고, 배포해서
내부 팀원 몇 명이 각자 만들어 보게 한 뒤, **고칠 것을 내 감이 아니라 팀원이 실제로 걸린
지점으로 정한다.**

## 전제와 제약

- **QA 주체**: 내부 팀원 몇 명. 흐름(UX)과 결과물 품질을 둘 다 본다
- **예산**: $10~50. Veo 3.1(\$0.40/s)로 30초 한 편이 약 \$12라 **2~4편이면 소진**된다
- **실행 환경**: Vercel Pro + Supabase
- **합성**: fal 경로(`SHOTFORM_COMPOSER=fal`)로 간다. 자막은 굽지 못한다

### 합성 경로를 fal로 정한 이유

로컬 ffmpeg 경로는 자막을 구운 mp4를 만들지만, Vercel 함수에서 `ffmpeg-static` 바이너리가
실제로 실행되는지가 미검증이다(`outputFileTracingIncludes` 설정, 실행 권한, 인코딩 CPU 시간).
이 불확실성을 프로토타입의 크리티컬 패스에 올리지 않는다.

자막을 굽는 일이 정말 필요한 시점은 **사장님이 내려받아 플랫폼에 올릴 때**지, 팀원이 판단하는
지금이 아니다. 지금은 재생 화면 오버레이로 충분하다. `lib/subtitles.js`의 `toAss`는 지우지
않는다 — ffmpeg로 돌아가는 길을 닫지 않는다.

### Vercel Pro라서 성립하는 것

네 라우트(`render`·`clips`·`voice`·`cuts`)가 `runXPipeline(id)`을 await 없이 띄우고 즉시
응답하는 구조다. 서버리스에서는 응답 후 실행이 보장되지 않지만, Fluid Compute + `waitUntil`로
**호출을 감싸는 정도**면 지금 구조가 그대로 산다. 큐 기반 재설계는 하지 않는다.

`/tmp`만 쓸 수 있는 것도 문제가 되지 않는다 — 합성은 파이프라인 한 번의 실행 안에서
다운로드·조립·업로드가 끝나고, 요청 사이에 파일이 남을 필요가 없다.

## 범위

### 하는 것

1. 비용 가드
2. 목소리를 이미지 앞으로
3. 로컬에서 진짜 1편 관통
4. Supabase 전환 (프로젝트·비용·업로드 사진)
5. Vercel 적응
6. 자막 오버레이
7. 배포 + 팀 QA
8. 결함 통합

### 하지 않는 것

- **ffmpeg 자막 굽기** — 위 참조. 나중에 필요해지면 그때
- **인증·계정** — 프로토타입은 링크를 아는 팀원만 쓴다
- **대본 품질 잔여과제 1~5** — QA 결함과 합쳐 7단계에서 우선순위를 다시 매긴다
- **잡 큐·워커 분리** — Pro의 `waitUntil`로 충분하다
- **긴 컷의 자동 재분할** — 2단계에서 초과 컷을 *알려주기만* 한다. 실제로 쪼개는 것은
  QA에서 얼마나 자주 걸리는지 보고 정한다

---

## 1. 비용 가드

예산이 빠듯한데 팀원이 각자 URL로 돌린다. `lib/costs.js`는 지금 **기록만 하고 막지 않는다.**

### 설계

`lib/costs.js`에 추가한다:

```
spentTotal()            → 전체 누적 USD
spentForProject(id)     → 프로젝트 누적 USD
assertBudget({ projectId, endpoint, amount })
```

`assertBudget`은 **이번 호출의 예상 비용을 더한 값**이 상한을 넘으면 던진다. 호출한 뒤에 재는
것이 아니라 나가기 전에 막는다.

- `SHOTFORM_BUDGET_TOTAL_USD` (기본 20)
- `SHOTFORM_BUDGET_PROJECT_USD` (기본 3)

호출 지점은 넷이다: `imagegen.js` · `tts.js` · `i2v.js` · `compose.js`. 각 모듈이 fal 로
나가기 직전에 `assertBudget`을 부른다. **가짜 모드일 때는 부르지 않는다**(0원이므로).

### 딸린 변경

비용 기록에 `project_id`가 없다. `addRecord` 호출부 네 곳에 넣고, 그러려면 `generateImage`·
`generateSpeech`·`generateClip`·`composeVideo`가 `projectId`를 받아야 한다 — 지금 `composeVideo`만
받고 있다.

### 화면

가드에 걸리면 파이프라인이 실패하고 기존 에러 경로를 탄다. 메시지는
`"예산 상한($N)에 닿아 멈췄어요"` 로 구분되게 쓴다 — QA 중에 "고장"과 "예산"을 헷갈리면 안 된다.

### 테스트

단위 테스트: 누적 합계 계산, 상한 미달 시 통과, 상한 초과 시 throw, 가짜 모드에서 통과.
`SHOTFORM_DATA_DIR`을 임시 폴더로 두어 실제 비용 기록을 오염시키지 않는다(기존 규칙).

---

## 2. 목소리를 이미지 앞으로

### 왜

**낭독 길이가 컷 구조를 판정하기 때문이다.** TTS 실측이 `cut.seconds`를 덮는데, 그 값이 i2v
상한(10초)을 넘으면 `truncated`로 잘린다 — 낭독은 12초인데 그림은 10초에서 끝나는 어긋남이다.
지금 순서에서는 **이미 이미지 값을 치른 뒤에** 그 사실을 안다.

비용도 같은 방향이다. TTS는 1000자당 \$0.05, 이미지는 장당 \$0.04에 컷 수를 곱하고 컷마다
후보 2장을 뽑는다. 싼 것으로 먼저 재고 비싼 것을 나중에 하는 편이 예산 $10~50에서 의미 있다.

기존 순서는 필연이 아니었다. `lib/steps.js` 주석이 적어둔 제약은 "컷 분할 뒤 & 영상 앞"뿐이고,
목소리가 이미지 뒤로 간 것은 **컷 분할이 이미지 단계(`POST /cuts`)에 묶여 있었기 때문**이다.

### 어떻게

**컷 분할을 대본 승인 직후로 당긴다.** 분할은 OpenAI만 쓰고 fal 을 부르지 않아 비용이 미미하다
(문장 나누기 + 화면 설계 2패스). 대본을 승인하면 이어서 돌리고, 사장님은 목소리 화면에서 멈춘다.

그러면 단계 개수는 그대로고 순서만 바뀐다:

```
① 자료 → ② 대본 → ③ 목소리 → ④ 이미지 → ⑤ 영상 → ⑥ 완성
```

`runCutsPipeline`을 둘로 가른다:

- `runSplitPipeline(projectId)` — 분할 + 화면 설계. 대본 승인이 부른다
- `runImagesPipeline(projectId)` — 컷별 이미지 생성. 이미지 단계가 부른다(지금 `processCut` 그대로)

`regenCut`은 이미지 재생성이므로 뒤쪽에 남는다.

### 상태 판정

`status`는 **마지막으로 끝난 산출물**, `currentStepKey`는 **다음에 열릴 화면**이다. 이 구분을
흐리면 "완성본을 두고 이미지 화면으로 돌아가는" 결함이 재발한다(커밋 `be15c5b`가 겪은 것).

새 흐름: `cuts`(분할 완료) → `voice`(목소리 완료) → `images`(이미지 완료) → `video` → `done`.
`images`가 새 상태값이다. `currentStepKey`는 지금처럼 **뒤 단계부터** 확인한다.

### 긴 컷 알리기

목소리가 끝나 `cut.seconds`가 실측으로 덮인 뒤, **이미지 화면에 들어갈 때** 10초를 넘는 컷을
표시한다. 이미지 값을 치르기 전에 보이는 것이 요점이다.

문구는 무엇이 잘리는지 말한다: `"이 컷은 낭독이 12초라 영상은 10초까지만 나와요"`.
쪼개는 것은 이번 범위가 아니다.

### 테스트

- `lib/steps.js`: 새 순서의 `STEPS`·`currentStepKey`·`isReachable`. 특히 **각 status 값마다**
  어느 화면이 열리는지 전부 (기존 `tests/steps.test.js` 확장)
- `runSplitPipeline`/`runImagesPipeline`이 갈라져도 컷의 산출물이 같은지 (기존 파이프라인
  테스트를 두 함수로 나눠 재사용)
- 10초 초과 컷 판정 단위 테스트 (경계값 10.0 포함)
- **회귀 하한선**: 화면·라우트에 박힌 단계 번호(③④⑤)와 안내 문구가 전부 새 순서를 따르는지.
  `be15c5b`가 같은 자리에서 옛 번호를 고쳤다

---

## 3. 로컬에서 진짜 1편 관통

**실제 fal 호출이 처음 나가는 지점.** 여기서 파라미터 추정이 맞는지 판명된다.

### 조건

```
SHOTFORM_FAKE=off
SHOTFORM_COMPOSER=fal
FAL_VIDEO_ENDPOINT=fal-ai/veo3.1/fast    # $0.15/s
목표 15초, 컷 3초씩 5개
```

예상 비용: 클립 15초 × \$0.15 ≈ \$2.25 + TTS·이미지 소액 = **$3 이하**.

### 완료 기준

브리핑 → 대본(→ 컷 분할) → 목소리 → 이미지 → 영상 → 완성까지 한 번도 막히지 않고 mp4 URL이
나온다. **2단계에서 바꾼 새 순서를 그대로 검증하는 것**이므로 관통은 한 번이면 된다.

틀린 파라미터는 그 자리에서 고친다. 이 단계의 산출물은 영상이 아니라 **"뒷단이 실제로 도는가"에
대한 답**이다.

### 확인할 것

- fal 응답의 필드 이름이 코드의 가정과 맞는가 (`data.audio.url`·`data.audio.duration`·`data.video.url`)
- TTS가 돌려준 실측 길이가 `cut.seconds`를 덮고, 그 값이 클립 길이로 넘어가는가
- `merge-videos` → `merge-audios` → `merge-audio-video` 3단 호출이 실제로 이어지는가
- 단가표(`PRICE_TABLE`)의 추정 단가가 실제 청구와 얼마나 다른가

---

## 4. Supabase 전환

`lib/projects.js`·`lib/costs.js`·업로드 사진이 전부 로컬 파일이다. Vercel에서는 동작하지 않는다.

### 스키마

```sql
create table projects (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table cost_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  ts bigint not null,
  endpoint text not null,
  stage text,
  actor text,
  est_cost_usd numeric not null default 0,
  status text,
  url text,
  meta jsonb
);
create index on cost_records (project_id);
```

프로젝트는 `data jsonb` 한 컬럼에 지금 구조를 통째로 넣는다. 컬럼으로 펴는 것은 스키마가
아직 흔들리는 지금 이르다.

RLS는 켜되 정책을 두지 않는다 — 서버가 service role 키로만 접근한다. 브라우저는 Supabase를
직접 보지 않는다.

### 사진 업로드

`app/api/uploads/route.js`가 `data/uploads/`에 쓰고 `/api/uploads/<name>`으로 되돌려준다.
이건 Storage가 필요하다 — 이미지 생성과 VLM이 그 파일을 읽고, fal에 넘기려면 **공개 URL**이어야
한다.

공개 버킷 `uploads` 하나를 만들고, 업로드 라우트가 Storage에 올린 뒤 공개 URL을 돌려주게 한다.
`lib/pipeline.js`의 `uploadsPath()`(URL → 로컬 경로 변환)는 URL을 그대로 쓰는 쪽으로 바뀐다.

### 어댑터

`SHOTFORM_STORE=file|supabase` 로 가른다. **기본은 `file`** — 기존 테스트가 파일 기반이라
그대로 그린을 유지한다. 배포 환경에서만 `supabase`.

파일 IO를 `lib/store/` 뒤로 감춘다:

```
lib/store/index.js      → SHOTFORM_STORE 를 보고 구현을 고른다
lib/store/file.js       → 지금 코드
lib/store/supabase.js   → 새로 쓴다
```

`projects.js`·`costs.js`의 공개 함수 시그니처는 바뀌지 않는다. 부르는 쪽은 아무것도 모른다.

`updateProject`의 **프로젝트별 락**이 관건이다. 지금은 프로세스 안 메모리 락인데, 서버리스는
인스턴스가 여러 개라 그것만으로는 못 막는다. 프로토타입에서는 낙관적 갱신으로 간다 —
`updated_at`을 조건에 걸고, 어긋나면 한 번 다시 읽어 재시도한다.

### 테스트

`lib/store` 계약 테스트를 두 구현에 같이 돌린다(파일 구현은 임시 폴더, Supabase 구현은
연결이 있을 때만 — 없으면 skip). 기존 테스트 그린 유지가 하한선이다.

---

## 5. Vercel 적응

작은 수정 셋이다.

1. `runXPipeline(id)` 호출 네 곳을 `waitUntil()`로 감싼다 (`@vercel/functions`)
2. 해당 라우트에 `export const maxDuration = 300`으로 시작한다. 플랜 상한을 대시보드에서 확인해
   더 올릴 수 있으면 올린다(문서 예시에 1800까지 나온다). 짧아서 잘리는 것보다 길게 잡아 두는
   편이 낫다 — 작업이 끝나면 함수도 끝난다
3. 환경변수: `SHOTFORM_DATA_DIR=/tmp`, `SHOTFORM_COMPOSER=fal`, `SHOTFORM_STORE=supabase`

Fluid Compute를 켠다(`vercel.json`의 `"fluid": true`).

### 완료 기준

프리뷰 배포에서 완성까지 폴링이 끊기지 않고 mp4 URL이 나온다.

### 위험

`waitUntil`도 `maxDuration` 안에서만 산다. 컷이 많거나 fal 응답이 느리면 잘릴 수 있고, 그때
화면에는 "10분 폴링하다 타임아웃"으로 보인다. **QA 문서에 목표 길이를 15~20초로 안내**해 이
경우를 줄인다. 실제로 잘리면 그때 잡 분할을 검토한다.

---

## 6. 자막 오버레이

fal 합성본에는 자막이 없다. 완성 화면 플레이어에 얹는다.

`lib/subtitles.js`의 `buildCues(cuts)`는 `cut.seconds`만 보는 순수 함수라 클라이언트에서
그대로 쓴다. `<video>`의 `timeupdate`로 현재 시각에 해당하는 cue를 골라 표시한다.

위치·크기는 `toAss`와 같은 규칙을 따른다 — 하단에서 18%(플랫폼 UI 세이프존), 높이의 4.2%.
**나중에 구웠을 때와 같은 그림이 나와야** 지금 QA가 값어치를 갖는다.

화면에 명시한다: **"내려받은 파일에는 자막이 들어 있지 않아요 — 지금은 미리보기에서만 보입니다."**
팀원이 이걸 결함으로 올리면 QA 시간이 낭비된다.

### 테스트

cue 선택 로직(주어진 시각 → 어느 cue인가) 단위 테스트. 경계값(cue 시작·끝 정각, 빈 문장 컷,
자막 없는 구간)을 포함한다.

---

## 7. 배포 + 팀 QA

`feature/video-compose` 브랜치를 Vercel 프리뷰로 띄운다.

팀원에게 주는 것:
- URL
- **목표 길이 15~20초로 만들어 달라**는 안내(비용·타임아웃)
- 자막은 미리보기에만 있다는 안내
- 걸린 지점을 적을 자리 하나

### 완료 기준

팀원이 각자 한 편씩 만들고, 걸린 지점이 목록으로 모인다.

---

## 8. 결함 통합

QA 결함 + 기존 잔여과제 1~5(길이 임계·약한 오프닝·브리핑 질문 값어치·컷 잘기·카피성 표현)를
**한 목록으로 합쳐** 우선순위를 다시 매긴다. 이게 다음 사이클의 입력이다.

---

## 검증 환경

- **1·2·4·6**: 로컬 `npx vitest run` (기존 211개 그린 유지가 하한선. 단 2단계는 단계 순서가
  바뀌므로 `steps.test.js`와 화면 테스트의 기대값이 **의도적으로** 바뀐다)
- **3**: 로컬 `npm run dev` + 실제 fal 키. 수동 관통
- **5·7**: Vercel 프리뷰 배포. 수동 확인

## 곁가지 (착수 전 정리)

- `lib/script.js`·`tests/script.test.js`에 **미커밋으로 남은 길이 임계 작업**(1.3→1.15,
  `AIM_BAND`)을 먼저 커밋한다. 테스트는 이미 그린이다
- `feature/video-compose`는 `feature/synopsis-redefinition` 위에 얹혀 있고 둘 다 main 미병합이다.
  배포는 `feature/video-compose` 기준으로 한다

## 미검증 가정

이 스펙이 기대는 것 중 아직 사실로 확인되지 않은 것:

- fal 응답 필드 이름과 3단 합성 호출 순서 (→ 3단계에서 판명)
- `PRICE_TABLE`의 추정 단가 (→ 3단계 후 실제 청구와 대조)
- Vercel Pro의 실제 `maxDuration` 상한 (→ 대시보드 확인)
- 합성 한 건이 `maxDuration` 안에 들어오는지 (→ 5단계에서 판명)
- TTS 실측 길이가 추정치(5.5자/초)와 얼마나 벌어지는지 — 10초 초과 컷이 흔한 문제인지
  드문 문제인지가 여기서 갈린다 (→ 3단계에서 처음 관측)
