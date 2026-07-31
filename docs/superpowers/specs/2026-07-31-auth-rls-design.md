# 인증·RLS — 누가 만들었고 누가 돈을 냈는지를 앱이 안다

**한 줄:** Supabase Auth 매직링크 + 승인제로 사람을 거르고, `getProject`가 **소유자를 필수
인자로 요구**하게 만들어 남의 작업물을 구조적으로 못 읽게 하며, `costActor()` 를
AsyncLocalStorage 로 바꿔 **백그라운드까지 사용자가 따라가게** 한다.

워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`.
선행 작업: [저장 계층 Supabase 이관](2026-07-31-supabase-storage-migration-design.md).

## 왜 지금인가

서비스 출시 순서가 **저장 계층 → 인증·RLS → 크레딧 → 결제**이고 저장 계층이 끝났다.
`db/schema.sql` 이 `owner_id` 컬럼과 RLS 를 이미 자리 잡아 뒀고, `lib/costs.js` 의
`costActor()` 주석이 *"인증이 붙는 단 하나의 지점"* 이라고 적어 두었다.

**지금 상태로 사람을 받으면 곧바로 사고가 난다.**

1. **프로젝트 uuid 만 알면 남의 것으로 유료 생성을 지시할 수 있다.** `POST
   /projects/[id]/clips` 에 소유자 검사가 없다. 클립은 $0.084/초다
2. **`GET /api/costs` 가 인증도 필터도 없이 전사 원장을 통째로 반환한다.** 프롬프트·URL 이
   든 `meta` 까지 나간다
3. **Quick Create(`POST /api/video`)에 예산 가드가 없다.** `addRecord`(기록)만 하고
   `assertBudget` 을 안 부른다. 단가는 `fal-ai/kling-video/v3` prefix 에 걸려 **$0.126/s**
   이고 `generate_audio: true` 라 **10초 한 번에 $1.26** 이 상한 없이 나간다
4. **`GET /api/uploads/[name]` 라우트 주석이 이미 자백하고 있다** — *"지금은 이름만 알면
   누구나 받을 수 있다"*
5. **예산 상한이 전역 하나뿐이라** 멀티유저가 되는 순간 *한 사람이 다 쓰면 전원 정지*가 된다

## 범위

**한다**

| | 내용 |
|---|---|
| ① | Supabase Auth 이메일 매직링크 + `profiles` 승인제 |
| ② | `costActor()` 를 AsyncLocalStorage 기반으로 교체 (호출 7곳 무수정) |
| ③ | 라우트 23곳이 신원 헬퍼를 거치게 한다 (검증은 middleware, 라우트는 헤더를 읽는다) |
| ④ | `getProject`·`updateProject` 가 소유자를 **필수 인자**로 요구하게 한다 |
| ⑤ | 사용자별 예산 상한 신설 + Quick Create 예산 가드 신설 |
| ⑥ | `GET /api/projects` 내 프로젝트 목록 + 로그인 후 랜딩 화면 |
| ⑦ | 운영자 승인 화면(대기 목록·승인·차단) |
| ⑧ | RLS 정책 `owner_id = auth.uid()` 얹기 |
| ⑨ | 기존 프로젝트 `owner_id` 백필 |

**안 한다** — 혼선을 막기 위해 명시한다.

- **크레딧·결제** — 다음 단계다. 이번엔 예산 **상한**까지만. 상한은 사고를 막고, 크레딧은
  값을 받는다. 둘은 다른 물건이다
- **fal 산출물 비공개화** — 조사만 하고 기한을 박는다(아래 "남기는 위험" 참조)
- **팀·공유·조직** — 프로젝트 소유자는 한 명이다. **운영자도 남의 프로젝트를 못 본다**
- **Vercel 배포** — `lib/compose.js` 가 ffmpeg 자식 프로세스와 로컬 경로를 요구해 여전히
  불가능하다. 이번 검증 환경은 **로컬 dev 서버 + 라이브 Supabase** 다
- **백그라운드 작업 내구성**(P1-5) — `POST /cuts` 의 fire-and-forget 은 그대로 둔다
- **Quick Create 폐기** — 제품 계획이 있어 **살린다.** 대신 문을 잠근다

---

## 1. 인증 계층 — 검증은 middleware 가 한 번만 한다

```
브라우저 ──매직링크──> Supabase Auth ──쿠키 세션──> middleware.js
                                                       │  getUser() 로 검증 (Auth 서버 왕복 1회)
                                                       │  app_metadata.status 확인
                                                       ▼
                                      요청 헤더에 x-shotform-user / x-shotform-status 를 **덮어쓴다**
                                                       │
                                                  라우트 핸들러 (왕복 0회)
```

### `getSession()` 이 아니라 `getUser()` 다
`getSession()` 은 쿠키를 파싱해 그대로 돌려준다 — **위조된 쿠키를 통과시킨다.** `getUser()`
는 Auth 서버가 검증한다.

**이 선택이 addog 의 ES256/JWKS 함정을 통째로 피한다.** addog 는 JWT 를 직접 검증하다
신형 서명키(ES256)라 HS256 secret 이 무용지물이었고 프로덕션 배포 후 핫픽스했다
(`700efdc`). 우리는 JWT 를 직접 검증하지 않으므로 서명 알고리즘을 알 필요가 없다.

### 왜 middleware 한 곳인가 — 2초 폴링이 이미 있다
`app/create/[id]/script/page.js:70` 과 `voice/page.js:81` 이 **2초 간격**으로 폴링한다.
라우트마다 `getUser()` 를 부르면 생성 중 **분당 30회/사용자**의 Auth 왕복이 생긴다.

- middleware 가 검증하고 **요청 헤더에 `set`(덮어쓰기)** 한다. 클라이언트가
  `x-shotform-user: 남의id` 를 보내도 middleware 가 지우고 자기 값을 넣는다
- **matcher 가 곧 보안 경계다.** matcher 밖에 새 라우트가 생기면 헤더가 비어 들어온다 →
  **헤더가 없으면 던진다.** 조용히 통과시키지 않는다
- matcher 는 `/api/:path*` 전부와 화면 경로를 덮는다. 예외는 `/login`·`/auth/callback` 뿐

**라우트가 하는 일은 검증이 아니라 읽기다.** `requireUser(req)` 헬퍼 하나가 헤더에서 신원을
꺼내고, 없으면 던지고, 미승인이면 403 을 만든다. 라우트는 그 결과를 `getProject` 에 넘기기만
한다 — **인가 판정 로직이 라우트 23곳에 복사되지 않는다.**

### 승인 상태는 `app_metadata` 에 심는다
`profiles.status` 를 매 요청 읽으면 왕복이 하나 더 는다. 승인 버튼이 **둘 다** 쓴다 —
`profiles`(원장, 운영자 화면이 본다)와 `auth.users.app_metadata.status`(캐시,
`getUser()` 응답에 실려 온다). **원장이 진실이고 metadata 는 캐시다.**

> ⚠️ 승인 직후 **이미 발급된 토큰에는 옛 status 가 들어 있다.** 토큰 갱신 시점에 반영되므로
> 승인 후 사용자가 다시 로그인하거나 세션이 갱신될 때까지 지연이 있다. 승인 화면이
> *"본인이 다시 로그인하면 바로 쓸 수 있어요"* 를 안내한다. 차단(`blocked`)은 반대로 지연이
> 위험하므로 **차단 시에는 세션을 무효화**한다(`auth.admin.signOut`).

---

## 2. 소유자 강제 — 라우트가 기억하지 않아도 되게

```js
// 지금
export async function getProject(id)
// 바꾼 뒤
export async function getProject(id, ownerId)   // ownerId 가 없으면 던진다
export function updateProject(id, ownerId, patchFn)
```

store 계층이 쿼리에 `.eq("owner_id", ownerId)` 를 붙인다. **라우트가 `if (project.owner_id
!== me)` 를 쓰는 게 아니라 애초에 못 읽는다.** 남의 프로젝트는 "없음"과 구별되지 않는다.

이관 때는 *"공개 시그니처를 안 건드려 호출부 29곳이 그대로 살았다"* 가 장점이었다. **이번엔
일부러 깬다** — 그래야 호출부 13곳이 전부 드러나고, 새 라우트를 만드는 사람이 소유자 검사를
빠뜨리는 것이 구조적으로 불가능해진다. 이 저장소의 각인(`of`) 이 버전 번호를 버린 이유와
같다: **사람이 기억해야 하는 자리를 만들지 않는다.**

### 파일명만 받는 라우트 둘
| 라우트 | 소유자를 어떻게 아나 |
|---|---|
| `/api/renders/[name]` | **파일명이 `<projectId>.mp4` 다**(`lib/compose.js:184`). 이름에서 id 를 뽑아 `getProject(id, owner)` 로 검사한다. 별도 매핑이 필요 없다 |
| `/api/uploads/[name]` | 업로드는 **프로젝트가 생기기 전에** 일어나 역조회할 대상이 없다 → `upload_owners` 테이블 신설 |

Storage 키에 owner 를 접두어로 넣는 방법도 있으나 **URL 형태가 바뀌어 문서에 박힌 기존
`material.photos[].url` 이 깨진다.** 이관에서 일부러 지킨 불변조건이라 건드리지 않는다.

---

## 3. actor 전파 — 돈을 낸 사람이 백그라운드까지 따라간다

### 문제
`costActor()` 를 부르는 곳이 7개 모듈(`llm`·`imagegen`·`i2v`·`tts`·`vlm`·`compose`·`video`)
인데, **전부 응답이 끝난 뒤 도는 백그라운드에서 불린다**(`cuts/route.js:46` 의
`runSplitPipeline(id).catch(...)`). 요청 쿠키를 읽을 수 없다.

그대로 두면 **원장의 81%(클립·이미지)가 주인을 잃고**, 다음 단계인 크레딧이 이 이음매에서
통째로 선다.

### 채택: AsyncLocalStorage (`lib/actor.js` 신설)

```js
const store = new AsyncLocalStorage();
export function runWithActor(actor, fn)   // 라우트 진입점에서 감싼다
export function currentActor()            // 컨텍스트가 없으면 던진다
```

`lib/costs.js` 의 `costActor()` 가 `currentActor()` 를 부른다. **이름도 시그니처도 그대로라
7개 모듈은 한 글자도 안 바뀐다.**

- **컨텍스트 없이 부르면 던진다.** `"local"` 로 조용히 떨어지지 않는다. 감싸는 것을 빠뜨린
  라우트는 첫 유료 호출에서 즉시 드러난다
- `scripts/measure/*` 는 요청 컨텍스트가 없다 → **스크립트 진입점에서
  `runWithActor("script", …)` 로 감싼다.** 안 하면 측정 도구가 전부 죽는다
- 가짜 모드도 같다. `SHOTFORM_FAKE=all` 이어도 컨텍스트는 필요하다(비용 기록 자체는 돈다)

### 기각한 안

| 안 | 기각 이유 |
|---|---|
| **명시적 인자 전달** | 라우트 13곳 → 파이프라인 → 7개 모듈까지 시그니처가 줄줄이 바뀐다. 중간 하나가 빠뜨리면 **그 아래가 조용히 `local` 로 떨어진다** — 레퍼런스의 "조용한 탈락 7곳"과 같은 실패 모양이다. 대비책으로는 남긴다(아래 위험 참조) |
| **project 에서 되읽기** | **Quick Create 는 `project_id` 가 없어 못 채운다.** 비용 기록마다 DB 왕복이 늘고, "누가 실행했나"와 "누구 프로젝트인가"를 구분할 수 없다 |

### ⚠️ 선행 검증이 필요하다
Next.js route handler 가 **응답을 보낸 뒤에도** fire-and-forget promise 가 ALS 컨텍스트를
유지하는지 확인되지 않았다. 이론상 유지되지만(async resource 가 살아 있는 한 상속) **실측
전이다.** 계획의 **첫 태스크**로 `SHOTFORM_FAKE=all`($0)에서 재현한다. 유지되지 않으면
명시적 인자 전달로 물러난다 — 그 경우 작업량이 늘어나므로 계획을 다시 짠다.

---

## 4. 데이터 모델

### 새 테이블 둘
```sql
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  status      text not null default 'pending',   -- pending | approved | blocked
  role        text not null default 'user',      -- user | admin
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists upload_owners (
  key        text primary key,        -- '<uuid>.jpg' — Storage 객체 키 그대로
  owner_id   uuid not null,
  created_at timestamptz not null default now()
);
```

`profiles` 는 **트리거로 자동 생성**한다(`auth.users` INSERT → `profiles` INSERT). 앱 코드가
만들면 매직링크로 처음 들어온 사용자가 `profiles` 없이 떠도는 순간이 생긴다.

### 기존 테이블
- **`projects.owner_id` 에 `not null` 을 걸지 않는다.** 읽기 경로는 `getProject` 의 필수
  인자가 이미 막는다. 제약을 걸면 백필이 실패했을 때 앱 전체가 죽는다
- `cost_records.actor` — 스키마 변경 없음. 값이 `"local"` 에서 사용자 uuid 로 바뀐다
- `sum_costs(p_project_id)` → `sum_costs(p_project_id, p_actor)`. 둘 다 `default null` 이라
  기존 호출이 그대로 산다. **합계는 계속 DB 가 낸다** — 앱에서 더하면 PostgREST 행
  상한(1000)에 걸려 말없이 일부만 더해지고 상한이 조용히 사라진다(이관 리뷰 Critical)

### RLS 정책
```sql
create policy projects_owner on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy profiles_self on profiles
  for select using (id = auth.uid());
```
`cost_records`·`upload_owners` 는 **정책을 만들지 않는다**(= 전부 거부). 원장은 사용자가 읽을
이유도 쓸 이유도 없다.

> ★ **앱이 service_role 이라 이 정책들은 실제로는 안 탄다.** anon 키가 샜을 때의 방어선이다.
> **"정책을 얹었으니 안전하다"고 착각하면 안 된다** — 진짜 방어는 §2 의 필수 인자다.

---

## 5. 예산 — 사용자 축을 넣는다

```
assertBudget({ projectId, endpoint, amount })
  ├─ 전역     sumCosts({})            vs SHOTFORM_BUDGET_TOTAL_USD    (기존)
  ├─ 사용자   sumCosts({actor})       vs SHOTFORM_BUDGET_USER_USD     (신설)
  └─ 프로젝트 sumCosts({projectId})   vs SHOTFORM_BUDGET_PROJECT_USD  (기존)
```

actor 는 인자로 받지 않고 **`currentActor()` 가 꺼낸다** — 호출부 7곳이 안 바뀐다.
전역 상한은 "회사 전체 안전핀"으로 남긴다.

**Quick Create 에 `assertBudget` 을 신설한다.** `projectId` 가 없으니 전역·사용자 상한만
물린다. 지금은 가드가 아예 없어 이번 스펙이 실제로 막는 구멍이다.

---

## 6. 화면

| 경로 | 내용 |
|---|---|
| `/login` | 이메일 입력 → 매직링크 발송 → "메일함을 확인하세요" |
| `/auth/callback` | 매직링크 착지점. 세션 교환 후 `/` 로 |
| `/pending` | 로그인은 됐으나 `status != approved` |
| `/` | **재구성.** 내 프로젝트 목록 + [새 영상 만들기]. Quick Create 채팅은 컴포넌트로 분리해 목록 아래 한 블록으로 남긴다 |
| `/admin` | `role = admin` 만. 대기자 목록 + 승인/차단 |

`GET /api/projects` 는 **내 것만** 돌려준다(id·created_at·status·제목 대용 요약). `doc`
통짜를 목록에 실어 보내지 않는다.

---

## 7. 오류 처리 — 조용한 실패를 만들지 않는다

| 상황 | 결과 |
|---|---|
| 미로그인 | API 401 / 화면은 `/login` 리다이렉트 |
| 로그인했으나 미승인 | API 403 / 화면은 `/pending` |
| 남의 프로젝트 | **404** — 존재 여부를 흘리지 않는다 |
| middleware 헤더 없음(matcher 밖) | **500 + 로그.** 조용히 통과시키지 않는다 |
| actor 컨텍스트 없음 | **던진다.** `"local"` 로 떨어지지 않는다 |
| 예산 초과 | 기존 `BudgetExceeded`, 사유에 `user` 추가 |

`getProject` 는 이관 때 정한 계약을 지킨다 — **"없음"은 `null`, 그 밖의 오류는 던진다.**

---

## 8. 테스트

**이번 작업의 가장 큰 함정은 "인메모리에서만 통과"다.** 이관에서 최종 전체 리뷰가 잡은 5건이
전부 그 종류였고, 태스크별 리뷰 다섯 번이 전부 놓쳤다.

1. **소유자 격리** — A 의 owner 로 B 의 프로젝트를 못 읽는다 (인메모리로 가능)
2. **필수 인자 강제** — `getProject(id)` 를 owner 없이 부르면 던진다
3. **actor 전파** — 가짜 모드로 파이프라인을 돌리고 `cost_records.actor` 가 전부 그
   사용자인지. **fire-and-forget 이후에 기록된 것까지** 봐야 의미가 있다
4. **★ RLS 정책은 anon 키로만 검증된다** — service_role 로 도는 계약 테스트는 정책을
   통과하는 게 아니라 **무시한다.** anon 클라이언트로 `projects` 를 읽어 **거부되는지** 보는
   테스트를 따로 둔다. 없으면 "정책 얹었고 테스트 그린"인데 아무것도 안 막는 상태가 된다
5. **헤더 위조** — `x-shotform-user` 를 실어 보내도 middleware 가 덮어쓴다
6. **★ 변이 테스트** — 이관에서 "지키는 척하는 테스트"를 두 번 잡았다(수정을 되돌려도
   통과했다). **소유자 검사·헤더 덮어쓰기·actor 던지기** 세 테스트는 구현을 되돌려 실제로
   빨개지는지 확인한다

라이브 계약 테스트는 기존대로 `describe.skipIf(!live)` 이고 **자기가 만든 정확한 id/키로만**
치운다 — 넓은 조건 삭제는 금지다(실제 원장을 오염시킨 전력이 있다).

---

## 9. 마이그레이션

1. `db/schema.sql` 에 새 테이블·정책·트리거·`sum_costs` 시그니처를 **추가**한다. 파일은
   통째로 다시 올려도 안전해야 한다(`if not exists`·`or replace`)
2. 사장님 계정으로 첫 로그인 → `profiles.role = 'admin'`, `status = 'approved'` 를 수동 설정
3. **백필**: `update projects set owner_id = '<사장님 uuid>' where owner_id is null`
4. `upload_owners` 백필: Storage `uploads` 버킷의 기존 키를 전부 사장님 소유로
5. `cost_records.actor` 의 기존 `"local"` 은 **그대로 둔다.** 과거 지출을 특정 사용자
   앞으로 옮기면 사용자별 상한이 첫날부터 잘못 물린다

---

## 남기는 위험 (알고 남긴다)

- **★ fal 산출물이 공개 읽기다.** `image.url`·`video.url`·`audio.url` 이 fal CDN 에
  `publicly readable` 로 남는다. 링크로 할 수 있는 것은 **열람뿐**이고(계정 접근·열거·삭제
  불가, 경로가 무작위 UUID) 지금 있는 것은 사장님 테스트물뿐이라 **당장의 피해는 없다.**
  위험은 URL 이 `projects.doc` 에 통째로 저장돼 있어 **DB 가 새면 전 고객 산출물이 한 번에
  열린다**는 축이다 — 역으로 이번 인증·RLS 가 그 축을 낮춘다.
  **기한: 외부 고객을 받기 전(결제·오픈 직전)까지 닫는다.**
  ⚠️ **조사 미완** — 2026-07-31 시점에 fal 문서 사이트가 429 로 막혀 **원문을 확인하지
  못했다.** 검색 요약은 `X-Fal-Object-Lifecycle-Preference` 에 `initial_acl` 필드가 있어
  생성 파일 접근을 제어한다고 하나 **미검증이다**(같은 날 검색 요약을 원문으로 취급해 틀린
  전력이 있다). 계획에 **원문 확인 태스크**를 따로 둔다
- **ALS 가 fire-and-forget 을 넘어 살아남는지 미검증** — 계획 첫 태스크에서 실측한다.
  실패 시 명시적 인자 전달로 물러난다
- **쓰기 큐는 프로세스 안에서만 유효하다** — 인증과 무관하게 그대로다
- **승인 반영이 토큰 갱신까지 지연된다** — 차단은 세션 무효화로 즉시 처리하지만 승인은 지연을
  안내로 덮는다
- **Vercel 배포는 여전히 막혀 있다** — ffmpeg. 이번 검증은 로컬 + 라이브 Supabase 다

## 관련
- [저장 계층 Supabase 이관](2026-07-31-supabase-storage-migration-design.md)
- `db/schema.sql` · `lib/store/supabase.js` · `lib/costs.js` · `lib/projects.js`
- 선례: addog/Fixup-Insight 의 Supabase Auth + 승인제 + 백오피스(ES256/JWKS 함정 포함)
