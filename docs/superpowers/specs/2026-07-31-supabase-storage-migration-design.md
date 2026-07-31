# 저장 계층을 로컬 파일에서 Supabase로 옮긴다

**한 줄:** `lib/projects.js`·`lib/costs.js` 의 **공개 함수는 그대로 두고** 그 뒤를 Supabase
(Postgres + Storage)로 갈아끼운다. 프로젝트 문서는 `jsonb` 한 칸에 통째로, 비용 원장은
정규화된 행으로, 업로드는 비공개 버킷으로 간다.

워크트리 `C:\Users\fixup\shotform-video`, 브랜치 `feature/video-compose`.

## 왜 지금인가

제품을 서비스로 내보내기로 했고, 그 첫 관문이 저장 계층이다. **지금 상태로는 배포 자체가
불가능하다** — Vercel 함수의 파일시스템은 읽기 전용인데 앱이 `data/` 아래에 읽고 쓴다.

배포와 무관하게 **지금도 결함이 셋 있다.**

1. **비용 원장에 락이 없다.** `lib/costs.js` 의 `addRecord` 는 read → push → write 를 락 없이
   한다. 그런데 파이프라인은 컷을 `Promise.all` 로 병렬 처리하며 컷마다 이걸 부른다
   (`lib/pipeline.js:291`·`:334`·`:420`). **지금도 비용 기록이 유실될 수 있다.**
2. **프로젝트 락이 프로세스 안에서만 유효하다.** `lib/projects.js:40-50` 의 `Map` 기반 락은
   서버가 두 대가 되는 순간 무력해진다. 그때 `updateProject` 는 문서 **전체**를 다시 쓰므로
   갱신 유실이 그대로 일어난다.
3. **`getProject` 가 모든 예외를 "없음"으로 만든다**(`lib/projects.js:32-38`의 `catch { return
   null }`). 깨진 JSON·권한 오류가 전부 "프로젝트를 찾을 수 없어요"가 된다.

셋 다 이번 이전으로 함께 해소된다.

## 범위

**한다**

| | 대상 | 목적지 |
|---|---|---|
| ① | `data/projects/*.json` | Postgres `projects` (jsonb) |
| ② | `data/costs.json` | Postgres `cost_records` (행) |
| ③ | `data/uploads/` | Supabase Storage 비공개 버킷 |

**안 한다** — 혼선을 막기 위해 명시한다.

- **④ `data/renders/`** — ffmpeg 가 로컬 경로와 자식 프로세스를 요구하므로 그대로 둔다
  (아래 "왜 렌더는 남기나")
- **인증·RLS** — `owner_id` 컬럼만 만들어 비워 둔다. 다음 작업
- **크레딧·쿼터** — `cost_records` 가 토대가 되지만 차감은 안 붙인다. 다음 작업
- **프로젝트 목록 API** — 지금도 없다. 소유자 개념이 생긴 뒤에 만드는 것이 맞다
- **fal CDN 산출물 보관** — `image.url`·`video.url`·`audio.url` 이 전부 외부 URL이고 로컬
  사본이 없다. 만료되면 과거 프로젝트를 다시 렌더할 수 없다. **실재하는 문제지만 별건이다**
- **Vercel 배포** — ffmpeg 문제가 남아 이번 작업만으로는 배포되지 않는다

### 왜 렌더는 남기나

`lib/compose.js` 는 세 가지를 로컬 디스크에 의존한다. Storage로 옮겨도 사라지지 않는다.

- `-i <로컬경로>` (`:32`) — 클립·오디오를 로컬 파일로 내려받아 ffmpeg 입력으로 준다
- `subtitles='<로컬.ass>':fontsdir='<로컬 assets>'` (`:61-64`) — **자막 필터는 URL을 못 받는다**
- `spawn(ffmpegPath, args)` (`:77`) — 자식 프로세스 실행

즉 "저장 계층 이전 = 배포 가능"이 자동으로 성립하지 않는다. 합성을 어디서 돌릴지는 별도
설계가 필요하고, 이번 범위 밖이다.

## 구조 — 문은 그대로, 뒤만 바꾼다

```
app/api/... (라우트 13개)  ─┐
lib/pipeline.js (호출 29곳) ─┤→  lib/projects.js  ─┐
lib/llm·vlm·imagegen·tts   ─┤→  lib/costs.js     ─┼→  lib/store/  ─→  Supabase
app/api/uploads            ─┘                     ─┘                  (또는 memory)
```

`lib/projects.js`(`createProject`·`getProject`·`updateProject`)와 `lib/costs.js` 의 **공개
시그니처를 바꾸지 않는다.** 그래서 라우트 13개와 `lib/pipeline.js` 호출 29곳이 그대로 산다.

`lib/store/` 아래 구현 둘:

- `supabase.js` — 실제 저장소
- `memory.js` — 테스트용 인메모리

**파일 구현은 지운다.** 셋을 유지하면 "지금 어느 쪽으로 도는가"가 흐려진다. 2026-07-30 에
i2v 기본값을 두 군데 뒀다가 Kling 을 부르면서 `generate_audio:false` 를 빠뜨린 사고와 같은
모양이다. 인메모리가 폴백을 겸한다.

### 구현 선택은 안전한 쪽으로 못 박는다

```
SHOTFORM_STORE=memory  →  인메모리 (테스트 전용)
그 외 · 미설정          →  Supabase. 접속 정보가 없으면 죽는다
```

**env 가 빠졌을 때 조용히 인메모리로 떨어지면 안 된다.** 저장이 되는 것처럼 보이다가
재시작하면 전부 사라진다. `lib/fake.js` 가 "모르는 값은 `off`(=진짜, 돈이 나감)로 본다"로
안전한 쪽을 고르는 것과 같은 규칙이다.

## 스키마

```sql
create table projects (
  id          uuid primary key,
  owner_id    uuid,                                  -- 지금은 null. 인증이 붙으면 채운다
  status      text not null,
  version     bigint not null default 0,             -- 낙관적 락
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  doc         jsonb not null                         -- 지금 JSON 파일 내용 그대로
);

create table cost_records (
  request_id    text primary key,                    -- 멱등키
  ts            timestamptz not null,
  endpoint      text not null,
  stage         text,
  actor         text not null,                       -- 지금 "local". 인증 후 사용자 id
  project_id    uuid,
  est_cost_usd  numeric(12,6) not null default 0,
  status        text,
  meta          jsonb                                -- prompt·duration·aspect_ratio·video_url
);
create index cost_records_project_idx on cost_records (project_id);
create index cost_records_actor_ts_idx on cost_records (actor, ts);
```

### 왜 문서는 jsonb 이고 원장은 행인가

**문서(projects)는 통짜로 둔다.**

- 호출부가 안 바뀐다 — 29곳이 전부 `updateProject(id, proj => ({...proj, ...}))` 형태다
- **스키마가 아직 흔들린다.** 2026-07-31 하루에도 `vlm.passed` 가 2값에서 3값이 됐고
  `image` 각인 필드가 늘었다. 프로토타입 단계에 컬럼을 못 박으면 매번 마이그레이션을 쓴다
- 컷 하나 갱신에 문서 전체를 다시 쓰는 것은 **지금과 같다.** 나빠지지 않는다
- 나중에 정규화가 필요해지면 jsonb 에서 뽑아낼 수 있다. 반대는 어렵다

**원장(cost_records)은 행으로 쪼갠다.**

- `addRecord` 가 단일 INSERT 가 되어 **락이 필요 없어진다** (지금의 유실 가능성이 사라진다)
- `assertBudget` 이 매 유료 호출마다 원장 전체를 읽어 합산하던 것(`lib/costs.js:148-160`,
  O(n))이 `select sum(...)` 인덱스 조회가 된다
- 다음 작업이 크레딧이라 사용자별·기간별 집계가 곧 필요하다
- `request_id` 를 기본키로 두어 **같은 호출이 두 번 기록되는 것을 DB 가 막는다.** 크레딧이
  붙으면 이중 차감 방어선이 된다

`status` 를 문서 밖 컬럼으로 한 번 더 두는 이유는 목록·필터 때문이다. `doc.status` 와 함께
쓰되 **쓰는 쪽은 한 곳**(store 의 update)이므로 어긋나지 않는다.

`owner_id` 는 지금 만들어 둔다. 나중에 붙이면 기존 행을 손봐야 하고, RLS 를 얹을 자리가 미리
있어야 한다. 비용은 0 이다.

## 동시성 — 낙관적 락

### 왜 비관적 락이 아닌가

`supabase-js` 는 PostgREST(HTTP)를 거치므로 호출 하나하나가 **각각 독립된 트랜잭션**이다.
`BEGIN` 을 걸어놓고 그 안에서 JS 를 돌린 뒤 `COMMIT` 하는 것이 불가능하다. 즉
`SELECT ... FOR UPDATE` 를 쓸 수 없다.

`pg`·`postgres.js` 드라이버로 직접 붙으면 진짜 트랜잭션을 쓸 수 있다. **그래도 그 길을 안
가는 이유:**

- 서버리스에서 연결 수가 금방 고갈된다. 풀러 설정이 따라붙고 모드에 따라 못 쓰는 기능이 생긴다
- 다음 작업이 인증·RLS 인데, 사용자 토큰으로 요청하면 RLS 가 자동 적용되는 `supabase-js`
  쪽이 자연스럽다
- **우리 접근 패턴에서는 낙관적 락으로 정확성이 동일하다**(아래)

### 방식

```js
// lib/store/supabase.js — updateProject
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const { version, doc } = await selectProject(id);      // 없으면 null 반환(오류와 구분)
  const next = patchFn(doc);                             // 지금과 같은 동기 patchFn
  const rows = await supabase.from("projects")
    .update({ doc: next, version: version + 1, status: next.status, updated_at: nowIso() })
    .eq("id", id)
    .eq("version", version)                              // 그 사이 아무도 안 바꿨을 때만
    .select("id");
  if (rows.length) return next;
  await sleep(jitter(attempt));                          // 짧은 무작위 백오프
}
throw new Error("저장이 계속 충돌했어요");
```

단일 `UPDATE` 문은 원자적이다. 두 요청이 같은 `version` 으로 들어오면 하나만 성공하고 다른
하나는 **0 건 갱신**으로 돌아온다. 진 쪽은 **다시 읽어 최신 문서 위에 다시 얹는다.**

| | 지금 (Map 락) | 낙관적 락 |
|---|---|---|
| 한 프로세스 안 | 직렬화됨 | 직렬화됨 |
| **프로세스 여럿** | **깨짐 — 갱신 유실** | **DB 가 막음** |
| 락 누수 | `Map` 이 영구 누적 | 없음 |

### 재시도가 안전한 근거

호출부 29곳이 전부 `proj => ({...proj, ...})` 형태다. **받은 것에서 새 것을 만들 뿐 바깥에
영향을 주지 않는다.** `patchFn` 안에서 fal 호출이나 파일 쓰기를 하는 곳은 없다.

`regenCut` 의 "재생성 3회 상한 판정·증가를 락 안에서 함께 수행 — TOCTOU 제거"
(`lib/pipeline.js:301`) 도 그대로 지켜진다. 읽기-판정-쓰기가 한 덩어리로 원자적이고, 재시도가
나면 **다시 읽은 최신 값으로 판정을 다시 한다.**

### 충돌은 언제 나나

사용자가 한 명이어도 난다. **[이미지 만들기] 한 번에 컷 5 개가 동시에 출발하고**
(`lib/pipeline.js:291`), 각 컷이 `setCut` 으로 문서 전체를 최소 2 회 갱신한다. 그 위에 사장님이
②대본에서 문장을 고치는 PATCH 가 겹칠 수 있다.

반대로 **사용자가 늘어도 충돌은 거의 안 는다** — 각자 자기 프로젝트를 만지기 때문이다.
충돌은 사용자 수가 아니라 **한 프로젝트 안에서** 일어난다. 낙관적 락이 전제하는
"충돌이 드물다"에 우리 구조가 정확히 맞는다.

### 새로 생기는 실패 모드

재시도를 소진하면 오류를 던진다. 지금은 락이 기다려주므로 없던 실패다. 완화책은 백오프이고,
`MAX_ATTEMPTS` 는 5 로 시작한다.

## 업로드 — Storage 비공개 버킷

**URL 형태를 그대로 유지한다.** 프로젝트 문서의 `material.photos[].url` 이
`/api/uploads/<name>` 인데 이 문자열을 바꾸지 않는다.

```
지금:  GET /api/uploads/x.jpg  →  data/uploads/x.jpg 를 읽어 반환
이후:  GET /api/uploads/x.jpg  →  Storage 비공개 버킷에서 받아 반환
```

서명 URL 을 프론트에 직접 주지 않는 이유:

- 문서에 저장된 `url` 이 **영구히 유효**하다. 서명 URL 은 만료되는데 문서에 박히면 썩는다
- 인증이 붙으면 **그 라우트가 소유자 검사를 넣을 자리**가 된다. 지금은 UUID 만 알면 누구나
  남의 업로드를 받을 수 있다

### 저장 계층 밖으로 새는 유일한 변경

서버 내부에서 업로드 파일을 쓰는 경로가 따로 있다.

```
lib/pipeline.js:18  uploadsPath("/api/uploads/x.jpg") → "data/uploads/x.jpg"
        ↓  refs[].path
lib/imagegen.js:37  readFile(path) → base64 → fal
lib/vlm.js:32,80    readFile(path) → base64 → OpenAI
```

Storage 로 가면 로컬 경로가 없다. 게다가 아바타(`assets/refs/`)는 저장소에 커밋된 로컬 파일로
남으므로 **출처가 섞인다.**

→ `refs[]` 가 경로 대신 **출처와 id** 를 담고, 바이트는 store 가 꺼내 준다.

```js
// 지금:  { kind: "thing",  path: "data/uploads/3ff17aee-....jpg" }
// 이후:  { kind: "thing",  source: "upload", key: "3ff17aee-....jpg" }   // 버킷 안의 객체 이름
//        { kind: "person", source: "avatar", key: "man-30s.jpg" }        // assets/refs 안의 파일명
```

`key` 는 **저장소 안에서의 객체 이름**이다. 업로드는 `material.photos[].url` 의 마지막 조각
(`3ff17aee-….jpg`, 확장자 포함)이고, 아바타는 `AVATARS[].file`(`man-30s.jpg`)이다.
`material.photos[].id` (확장자 없는 UUID)와 혼동하지 않는다.

`lib/imagegen.js`·`lib/vlm.js` 가 경로 대신 **바이트**를 받는다. 둘 다 곧바로 base64 로 바꾸고
있어 변경은 얕다. `lib/pipeline.js:198` 의 `.filter(r => r.path)` 는 "바이트를 못 얻은
레퍼런스를 버린다"로 뜻이 유지된다.

`assets/refs/` 아바타와 `assets/subtitle-font.otf` 는 **로컬에 그대로 둔다.** 저장소에
커밋돼 있고 읽기 전용이며, 폰트는 ffmpeg 가 로컬 디렉터리로만 읽을 수 있다.

## 기존 데이터 이관

일회성 스크립트 `scripts/migrate-to-supabase.mjs`.

| 대상 | 방식 |
|---|---|
| 업로드 9 개 (3.1MB) | **파일명 그대로** 버킷에 올린다 → 기존 `url` 이 그대로 동작 |
| 비용 54 건 (40KB) | `cost_records` 로 INSERT |
| 프로젝트 94 개 (672KB) | **옮기지 않는다.** `data/projects/` 는 남겨두되 앱이 보지 않는다 |

프로젝트를 안 옮기는 이유는 전부 실험 산출물이고, 옛 스키마(폐지된 `synopsis`, 옛
`ref_photo_id` 등)를 새 저장소가 떠안을 이유가 없기 때문이다.

`request_id` 가 기본키라 **스크립트를 두 번 돌려도 안전하다.** 중간에 실패하면 그냥 다시
돌린다.

## 오류 처리

**"없음"과 "실패"를 구분한다.**

```js
// lib/projects.js:32-38  현재 — 모든 예외가 "없음"이 된다
try { return JSON.parse(await fs.readFile(...)); } catch { return null; }
```

Postgres 로 가면 연결 실패·타임아웃까지 "프로젝트를 찾을 수 없어요"가 된다. 실제로는 DB 가
잠깐 끊긴 것뿐인데 **사용자는 자기 작업물이 사라진 줄 안다.**

→ 0 건은 `null`, 그 밖의 오류는 던진다. 낙관적 락 재시도 소진도 명확한 오류를 낸다.

덤으로 **반쯤 쓰인 파일을 읽는 문제가 사라진다.** 지금은 `writeFile` 이 원자적이 아니라
폴링 중인 화면이 깨진 JSON 을 읽을 수 있고, 그것이 위 `catch` 를 타 "프로젝트를 찾을 수
없어요"로 보인다. Postgres 는 읽기가 항상 일관된 상태를 본다.

## 테스트

```js
// vitest.setup.js
// 지금:  process.env.SHOTFORM_DATA_DIR = mkdtempSync(...)
// 이후:  process.env.SHOTFORM_STORE = "memory"
```

각 테스트의 `beforeEach` 는 임시 폴더를 만드는 대신 **인메모리 저장소를 비운다.** 765 개
테스트 본문은 대부분 `createProject`/`getProject`/`updateProject` 를 부르므로 그대로 돈다.
바뀌는 것은 격리 방식뿐이다.

영향받는 패턴(조사 결과):

- `tests/projects.test.js` — 동적 import 로 모듈 재로드하던 것이 불필요해진다
- `tests/routes.test.js` — 정적 import 유지, `beforeEach` 만 교체 (호출 100 여 곳은 그대로)
- `tests/pipeline.test.js` — 위와 같다
- `tests/costs.test.js` — "`SHOTFORM_DATA_DIR` 을 호출 시점에 읽는다" 회귀 테스트는 뜻을
  잃는다. **대신 "`SHOTFORM_STORE` 가 미설정이면 인메모리로 떨어지지 않는다"를 판정한다**
- `tests/compose.test.js`·`tts`·`i2v` — `addRecord` 가 실제로 도는 경로라 인메모리 원장을 쓴다
- `tests/refs.test.js`·`imagegen.test.js` — 아바타는 로컬로 남으므로 그대로

**새로 추가할 테스트**

- 낙관적 락: 같은 프로젝트에 동시 `updateProject` 두 건 → 둘 다 반영된다(하나가 사라지지 않음)
- 낙관적 락: 재시도를 소진하면 던진다
- `getProject`: 없음은 `null`, 저장소 오류는 던진다
- 원장 멱등성: 같은 `request_id` 를 두 번 넣어도 한 건이다
- 구현 선택: `SHOTFORM_STORE` 미설정 + 접속 정보 없음 → **죽는다**(조용히 메모리로 안 감)

실제 SQL·제약은 별도 통합 테스트로 검증하고, Supabase 접속 정보가 있을 때만 돌린다.

## 위험과 완화

| 위험 | 완화 |
|---|---|
| 낙관적 락 재시도 소진 | 백오프 + `MAX_ATTEMPTS` 5. 회귀 테스트로 동작 고정 |
| env 누락으로 인메모리 전락 | 명시적 `SHOTFORM_STORE=memory` 일 때만. 그 외에는 죽는다 |
| `refs` 변경이 그림 품질에 영향 | 바이트 내용은 동일. 프롬프트·모델은 안 건드린다 |
| 무료 플랜 비활성 일시정지 | 프로토타입 단계에서 실제로 걸린다. 재개는 대시보드 클릭. 문서에 적어둔다 |
| 이관 스크립트 중복 실행 | `request_id` 기본키 + 파일명 고정으로 멱등 |

## 성공 기준

1. `npx vitest run` 이 **전부 그린**이고, 저장 계층 관련 새 테스트가 포함돼 있다
2. `data/` 아래 `projects/`·`costs.json`·`uploads/` 를 **지워도** 앱이 정상 동작한다
   (`renders/` 는 제외)
3. 자료 입력 → 브리핑 → 대본 → 목소리 → 이미지까지 로컬에서 한 바퀴 돈다
   (⑤영상·⑥완성은 유료라 승인 후 별도 확인)
4. 컷 5 개 병렬 생성에서 **모든 컷의 상태 변화가 문서에 남는다**(갱신 유실 없음)
5. 비용 원장이 `cost_records` 에 쌓이고 `assertBudget` 이 합계로 동작한다
6. 기존 업로드 9 개가 이관 후에도 **같은 URL 로** 열린다

## 관련

- 조사 근거: 이 문서의 파일:줄번호는 2026-07-31 `feature/video-compose` 기준
- 배포 선결 과제 분석: wiki `concepts/shotform-deployment-blockers.md`
  (2026-07-27 작성. P0-3·P2 는 이미 해소됐고 나머지는 유효)
- 다음 작업: 인증·RLS → 크레딧·쿼터 → 결제
