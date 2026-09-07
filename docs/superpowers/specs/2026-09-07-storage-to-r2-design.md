# 객체 저장소를 Cloudflare R2 로 — 설계 (2026-09-07)

> 대상: `lib/store/supabase.js` 의 객체 함수 **넷**과 그것을 부르는 12곳
> 안 건드리는 것: **DB·인증은 Supabase 그대로.** 이 문서는 파일(영상·사진)만 다룬다
> 계기: 2026-09-07 라이브 정지 — Supabase 가 `exceed_egress_quota` 로 프로젝트를 402 로 막았다

---

## 0. 왜 — 무엇이 서비스를 죽였나

09-07 아침, 로그인도 보관함도 죽었다. 원인은 Vercel 이 아니라 Supabase 였다.
`auth`·`rest`·`storage` 세 갈래가 **전부 402** 를 돌려줬다:

```
Service for this project is restricted due to the following violations:
exceed_cached_egress_quota, exceed_egress_quota.
```

**전송량(egress)이다.** 저장 용량도 DB 크기도 아니다. 무료 플랜 egress 는 **5GB/월**이고
완성본은 **개당 8~13MB**(`app/api/renders/[name]/route.js` 의 실측 주석)다. 즉
**재생 400~500회면 한 달 치가 끝난다.** 아껴 쓸 크기가 아니라 구조가 안 맞는다.

### 0-1. 벽의 성격이 문제다

| | 지금 (Supabase Storage) | R2 로 옮긴 뒤 |
|---|---|---|
| 무엇이 닳는가 | **egress** — **보면** 닳는다 | **저장** — **만들면** 쌓인다 |
| 한도 | 5GB/월 (≈500회 재생) | 10GB (≈1,000편) |
| 리셋 | 매월 (그때까지 **서비스 정지**) | 없음 (누적) |
| 넘으면 | **프로젝트가 통째로 막힌다** | 월 $0.015/GB — 100GB 라도 **월 $1.35** |
| egress 요금 | 이것 때문에 죽었다 | **항상 무료** (티어 한도가 아니라 요금 항목이 없다) |

보관함은 **보라고 만든 자리**다. 보는 행위가 한도를 태우는 구조에서는 쓸수록 죽는다.
R2 는 보는 것이 공짜가 되고, 대신 만드는 것이 쌓인다 — 이 제품에 맞는 모양이다.

### 0-2. 09-07 에 이미 고친 것 (이 설계의 전제)

같은 날 전송을 아끼는 자리 셋을 고쳤다. **R2 로 가도 전부 유효하다**(이유만 바뀐다):

| 고친 것 | 지금 이유 | R2 뒤 이유 |
|---|---|---|
| `lib/signed-url-cache.js` — 같은 내용이면 같은 주소 | egress 절감 | **Class B 연산 절감 + 주소 안정성**(브라우저 캐시) |
| 카드 `poster` + `preload="none"` | 보관함 열 때 영상 요청 0 | 그대로 |
| `isInfra` 에 402 추가 | 402 를 "비밀번호 틀림"으로 뭉개지 않음 | 그대로(다른 사고에도 유효) |

---

## 1. 옮기는 것과 안 옮기는 것

| | 어디로 | 왜 |
|---|---|---|
| **완성 영상**(`renders`) | **R2** | 개당 8~13MB. egress 를 태운 주범 |
| **업로드 사진**(`uploads`) | **R2** | 같은 인터페이스라 함께 옮기는 편이 싸다. Vercel 함수 대역폭도 같이 줄어든다 |
| 프로젝트 문서·원장·크레딧 | **Supabase 그대로** | JSON 이다. 문서 실측 **13,236 bytes** → 5GB 면 **약 38만 회 읽기**. 안 찬다 |
| 로그인·세션 | **Supabase 그대로** | GoTrue 를 옮길 이유가 없다 |

★ **Supabase 의 1GB 파일 저장 한도도 같이 풀린다** — 지금 구조로는 약 100편이 천장이었다.

---

## 2. 이음매 — 함수 넷, 버킷 둘, 호출처 12곳

이 이전이 작은 일인 이유는 **저장소가 이미 한 겹 감싸여 있어서**다.

```js
// lib/store/supabase.js — 객체를 만지는 자리는 이 넷이 전부다
putObject(bucket, key, bytes, contentType)   // 632
getObject(bucket, key)                       // 639  ★ 없으면 던진다
signedObjectUrl(bucket, key, seconds, opts)  // 656  opts.download
deleteObject(bucket, key)                    // 102
```

버킷은 둘(`uploads`·`renders`), 둘 다 비공개다(`db/schema.sql:50,55`).

### 호출처 (전수)

| 파일 | 부르는 것 |
|---|---|
| `lib/compose.js:290,405,605,610` | `getObject`·`putObject` (renders) |
| `lib/ad/pipeline.js:47` · `lib/film/pipeline.js:329` | `putObject` (renders) |
| `lib/reel/storyboard.js:213` | `putObject` (uploads) |
| `lib/refs-io.js:20` | `getObject` (uploads) |
| `app/api/uploads/route.js:27` | `putObject` |
| `app/api/uploads/[name]/route.js:27` | `getObject` |
| `app/api/renders/[name]/route.js:88,100` | `signedObjectUrl`·`getObject` |
| `app/api/reel/[id]/board/route.js:43` | `getObject` (uploads) |

**전부 `getStore()` 를 지난다.** 그래서 아래 3장의 방식이면 **호출처는 한 줄도 안 바뀐다.**

### ★ 깨면 안 되는 계약 셋

1. **`getObject` 는 없으면 던진다** — `null` 을 주지 않는다.
   `lib/compose.js:286` 과 `lib/refs-io.js:8` 이 그 예외를 잡아 "없음"으로 바꾼다.
   R2 구현이 404 에 `null` 을 돌려주면 그 두 곳이 조용히 틀린다.
2. **`memoryStore` 에는 `signedObjectUrl` 이 없다** — 일부러 없다. 라우트가
   `typeof store.signedObjectUrl === "function"` 으로 갈라 로컬에서는 바이트를 흘린다
   (`tests/file-routes-auth.test.js` 의 "서명을 못 만드는 저장소" 판이 이것을 지킨다).
3. **판이 `memoryStore` 를 직접 주무른다** — `memoryStore.signedObjectUrl = ...` 로 심고
   `delete` 한다(같은 파일 5곳). 그래서 `SHOTFORM_STORE=memory` 일 때 `getStore()` 는
   **`memoryStore` 그 객체를 그대로** 돌려줘야 한다. 병합한 새 객체를 주면 그 판들이 죽는다.

---

## 3. 아키텍처 — 저장소를 둘로 가른다

지금은 DB 와 객체가 한 객체(`supabaseStore`)에 섞여 있다. **가르되, 밖에서 보는 모양은 그대로 둔다.**

```
lib/store/index.js          ← 고르는 유일한 자리 (지금도 그렇다)
   ├── memory.js            (SHOTFORM_STORE=memory → 그 객체를 그대로 반환)
   ├── supabase.js          DB: projects·profiles·credits…
   └── objects/
        ├── index.js        객체 백엔드를 고른다 (r2 | supabase)
        ├── r2.js           ★ 새로 만드는 것
        └── supabase.js     지금 코드를 그대로 옮긴 것 (폴백·되돌리기용)
```

`getStore()` 는 이렇게 조립한다:

```js
export function getStore() {
  // ★ 판이 이 객체를 직접 주무른다(2장 계약 ③) — 병합하지 않고 그대로 준다.
  if (process.env.SHOTFORM_STORE === "memory") return memoryStore;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (테스트는 SHOTFORM_STORE=memory)");
  }
  return composedStore;   // DB=supabaseStore, 객체 넷=objectStore()
}
```

`composedStore` 는 **모듈 최상위에서 한 번** 만든다(호출마다 새 객체를 만들면 신원이 흔들린다).
객체 넷은 `objects/index.js` 가 고른 구현으로 위임한다.

**결과: 호출처 12곳·라우트·파이프라인 전부 무수정.** 바뀌는 파일은 `lib/store/index.js` 하나와
새로 생기는 `lib/store/objects/*` 뿐이다.

---

## 4. R2 쪽 — 확인된 것과 열린 것

### 확인된 것 (Cloudflare 공식 문서)

| | |
|---|---|
| 방식 | S3 호환 API. 엔드포인트 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| 서명 URL | **1초 ~ 7일**. ★ **로컬 계산이라 R2 에 왕복이 없다** (Supabase `createSignedUrl` 은 매번 API 호출이었다 — 이전만으로 지연이 준다) |
| Range 요청 | 지원 — 영상 탐색(seek)이 정상 동작 |
| 조건부 헤더 | `If-None-Match`·`If-Modified-Since` 등 지원 |
| 무료 티어 | 저장 **10GB-월** · Class A(쓰기) **100만/월** · Class B(읽기) **1,000만/월** |
| egress | **모든 사용자 무료** |
| 초과 요금 | 저장 $0.015/GB·월 · Class A $4.50/백만 · Class B $0.36/백만 |

우리 규모 대입: 재생 하루 1,000회여도 월 3만 Class B → 한도의 **0.3%**. 굽기는 Class A 수백 회.
**닿는 것은 저장 하나뿐**이고 그것도 1,000편이다.

### 🔴 열린 것 하나 — `?dl=1` (내려받기)

`response-content-disposition` 쿼리 오버라이드를 **R2 가 존중하는지 문서에서 확인하지 못했다.**
서명하는 쪽은 문제가 없다(aws4fetch 가 쿼리를 통째로 서명한다) — **서버가 존중하느냐**가 열려 있다.

**그래서 이것이 Task 1 이다** — 코드를 쓰기 전에 버킷 하나로 2분이면 잰다.

되면 지금 계약 그대로다. **안 되면 실제 손실은 생각보다 작다**:
지금 코드는 `{ download: name }` 을 넘기는데 그 `name` 이 **버킷 키와 같다**
(`app/api/renders/[name]/route.js:88`). 즉 파일 이름은 어차피 안 바뀌고, 잃는 것은
**"저장" 대신 "브라우저에서 재생"** 으로 열리는 것 하나다. 대안은 셋:

- **A. 그대로 산다** — 내려받기 버튼이 새 탭 재생이 된다(우클릭 저장은 된다). 비용 0
- **B. 업로드 때 메타데이터로 박는다** — `renders` 는 인라인 미리보기가 필요해 못 쓴다
- **C. 커스텀 도메인 + Worker 로 헤더를 씌운다** — 되지만 인프라가 하나 는다

★ **A 로 시작하고, 사장님이 불편하다고 하면 C 로 간다.** 검증 결과에 따라 이 절을 고칠 것.

---

## 5. 라이브러리 — `aws4fetch` 하나

Cloudflare 공식 문서가 두 길을 준다:

| | 크기 | 판단 |
|---|---|---|
| `@aws-sdk/client-s3` + `s3-request-presigner` | 수 MB | ❌ 이 저장소 의존성이 **11개**뿐이다. 콜드스타트도 는다 |
| **`aws4fetch`** | **~2KB** | ✅ 서명·`fetch` 둘 다 된다. 넷을 전부 덮는다 |

```js
import { AwsClient } from "aws4fetch";
const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

// 서명 URL (GET)
const signed = await client.sign(
  new Request(`${R2_URL}/${bucket}/${key}?X-Amz-Expires=${seconds}`),
  { aws: { signQuery: true } }
);
signed.url;                                  // ← 302 Location 에 실을 값

// 서버측 읽기·쓰기·지우기는 client.fetch 로 그대로
await client.fetch(`${R2_URL}/${bucket}/${key}`);                    // GET
await client.fetch(url, { method: "PUT", body, headers: { "Content-Type": ct } });
await client.fetch(url, { method: "DELETE" });
```

★ **의존성이 하나 늘어난다.** 이 저장소는 그것을 가볍게 보지 않으므로 여기 근거를 남긴다 —
직접 SigV4 를 구현하는 대안도 있지만, 서명 알고리즘을 손으로 짜는 것은 addog 가 ES256/JWKS 에서
겪은 종류의 사고를 부른다. 2KB 짜리 공식 권장 라이브러리가 옳다.

---

## 6. 키 이름 규약 — 안 바꾼다

R2 키를 **지금 Supabase 키와 글자 그대로 같게** 둔다: `<projectId>.mp4`, `<uuid>.jpg` 등.

- 문서에 저장된 주소(`/api/renders/<id>.mp4`)가 영구히 유효해야 한다는 기존 규약이 그대로 산다
- 이전 스크립트가 **키를 변환하지 않는다** — 틀릴 자리가 하나 준다
- 폴백(7장)이 **같은 키로** 두 저장소를 물어볼 수 있다

R2 버킷 이름만 env 로 매핑한다(계정 안에서 이름이 겹칠 수 있으므로):
`renders` → `R2_BUCKET_RENDERS`, `uploads` → `R2_BUCKET_UPLOADS`.

---

## 7. 이전 전략 — 쓰기 먼저, 읽기는 폴백, 그 다음 배치

한 번에 갈아타지 않는다. 순서가 안전을 만든다.

```
① 쓰기를 R2 로   → 새로 굽는 영상부터 R2 에 쌓인다 (옛것은 그대로 Supabase)
② 읽기는 R2 → 없으면 Supabase → 폴백이 옛것을 계속 보여준다 (화면은 아무 일도 없다)
③ 배치 이관     → 옛 객체를 전부 R2 로 복사 (스크립트, 멱등)
④ 폴백 제거     → 확인 뒤 Supabase 갈래를 걷어낸다
```

★ **②의 폴백이 이 계획의 안전핀이다.** ③이 절반만 돌아도 화면은 멀쩡하다.

### 🔴 시점 제약 — ③은 지금 못 한다

옛 객체를 Supabase 에서 **꺼내는 것 자체가 egress** 다. 지금은 402 로 막혀 있다.
**③은 Supabase 청구 주기가 리셋된 뒤**(또는 Pro 로 올린 뒤)에만 돌릴 수 있다.

다만 ①②는 **새 프로젝트/새 조직으로 서비스를 세운 직후 바로** 할 수 있다. 즉:
- 새로 만드는 영상은 처음부터 R2 로 간다 → **새 조직의 5GB 를 영상이 안 태운다**
- 옛 영상은 주기 리셋을 기다렸다가 ③으로 데려온다

이관 총량은 Supabase 무료 저장 한도가 1GB 라 **최대 1GB** — 새 주기 5GB 안에서 넉넉하다.

---

## 8. env

```bash
# Cloudflare R2 (S3 호환 API 토큰 — 버킷 범위로 좁혀서 발급한다)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_RENDERS=shotform-renders
R2_BUCKET_UPLOADS=shotform-uploads

# 객체 백엔드 스위치. 값이 "r2" 일 때만 R2 다 — 오타는 닫힌 쪽(supabase)으로 떨어진다.
# ★ lib/auth/guest.js 의 `"1" 일 때만` 규율과 같다.
SHOTFORM_OBJECT_STORE=r2
# ③ 이관이 끝나면 0 으로 내리고, 확인 뒤 코드에서 갈래를 지운다.
SHOTFORM_OBJECT_FALLBACK_SUPABASE=1
```

★ R2 자격증명이 없는데 `SHOTFORM_OBJECT_STORE=r2` 면 **고를 때 던진다**
(`lib/store/index.js` 가 Supabase env 에 하는 것과 같은 규칙 — 조용히 떨어지지 않는다).

---

## 9. 비용 — 이전 뒤

| | 무료 한도 | 우리 예상 | 넘으면 |
|---|---|---|---|
| R2 저장 | 10GB | 영상 1,000편 | $0.015/GB·월 (100GB=**$1.35**) |
| R2 Class B(재생) | 1,000만/월 | 하루 1,000회여도 3만 | $0.36/백만 |
| R2 Class A(굽기) | 100만/월 | 수백 | $4.50/백만 |
| R2 egress | **무제한 무료** | — | — |
| Supabase egress | 5GB/월 | JSON 만 → 38만 읽기 | — |

**Supabase Pro($25/월) 없이 무료로 지속 가능하다.** 남는 무료 제약은 하나 —
무료 프로젝트는 **1주일 미사용 시 일시정지**된다(`middleware.js` 주석에 그 함정 기록이 있다).
실사용 중이면 안 걸린다.

---

## 10. 위험과 되돌리기

| 위험 | 대응 |
|---|---|
| R2 자격증명 유출 = 버킷 읽기·쓰기 | API 토큰을 **버킷 범위**로 좁혀 발급. Vercel env 로만 주입 |
| 서명 URL 이 30분간 공유 가능 | **지금과 같다**(Supabase 도 그랬다). 새 위험이 아니다 |
| 이전 중 파일이 어느 쪽에도 없음 | ②의 폴백이 덮는다. ③은 **멱등**이라 몇 번 돌려도 안전 |
| `getObject` 계약 위반(2장 ①) | 판으로 못 박는다 — 없는 키에 **던지는지**를 잰다 |
| 되돌리기 | `SHOTFORM_OBJECT_STORE` 를 지우면 **즉시 Supabase 로 복귀**. ④ 전까지는 옛 객체가 그대로 살아 있다 |

★ **④(폴백 제거)는 서두르지 않는다.** 한 주기쯤 두 곳에 다 있어도 R2 저장은 10GB 무료다.

---

## 11. 작업 순서

| # | 할 일 | 산출 | 지금 가능? |
|---|---|---|---|
| **1** | 🔴 **`response-content-disposition` 실측** — 버킷 하나 만들어 presign 후 curl | 4장 확정 | ✅ (R2 계정 필요) |
| 2 | `aws4fetch` 추가 · `lib/store/objects/r2.js` 넷 구현 (판 먼저) | R2 구현 | ✅ |
| 3 | `lib/store/objects/index.js` + `lib/store/index.js` 조립 (2장 계약 셋을 판으로 고정) | 스위치 | ✅ |
| 4 | 읽기 폴백(R2 → Supabase) | 안전핀 | ✅ |
| 5 | Vercel env 주입 + 배포 · 굽기→재생 관통 확인 | 라이브 | 새 프로젝트 뒤 |
| 6 | `scripts/migrate-storage-to-r2.mjs` (멱등) | 이관 도구 | ✅ (실행은 ⑦) |
| 7 | **배치 이관 실행** | 옛 영상 복구 | 🔴 **주기 리셋 뒤** |
| 8 | 폴백 제거 · `uploads` 라우트도 302 로(선택) | 정리 | 나중 |

★ 8의 선택 항목: `uploads` 는 지금 **바이트가 Vercel 함수를 지난다**
(`app/api/uploads/[name]/route.js:27`). 302 로 바꾸면 Vercel 대역폭과 함수 시간도 준다.
다만 `immutable` 캐시 규약이 바뀌므로 **별도 태스크**로 다룬다 — 이번 이전에 섞지 않는다.

---

## 12. 검증 (무엇을 봐야 끝난 것인가)

- [ ] 없는 키에 `getObject` 가 **던진다**(계약 ①)
- [ ] `SHOTFORM_STORE=memory` 에서 `getStore()` 가 **`memoryStore` 그 객체**를 준다(계약 ③)
- [ ] `signedObjectUrl` 이 없는 저장소에서 라우트가 바이트를 흘린다(계약 ②, 기존 판 유지)
- [ ] 같은 `ts` 면 같은 주소 / `ts` 가 바뀌면 새 주소 (09-07 판이 그대로 통과)
- [ ] R2 서명 URL 로 **영상이 재생되고 탐색(seek)이 된다** — Range 실측
- [ ] 라이브: 굽기 → 보관함 → 재생 관통
- [ ] 이관 뒤 옛 영상이 열린다 · 스크립트를 **두 번 돌려도** 안전하다
- [ ] 전체 판 그린 (기준선: 09-07 현재 5,780 통과 · 1 실패 — `reel-oneshot` 회선 타임아웃은 알려진 것)

---

## 13. 이 문서가 정하지 않은 것

- **서명 수명**(`SIGNED_URL_SECONDS`, 지금 1800초). R2 는 최대 7일까지 되고 길수록 브라우저
  캐시 재사용이 는다. 다만 공유 가능한 시간도 같이 는다 — **사장님 판단이 필요한 값**이라 뒀다
- **옛 Supabase 객체를 언제 지울까.** 이관 확인 뒤에도 한동안 두는 편이 안전하다
- `db/schema.sql` 의 `storage.buckets` 두 줄은 이전 뒤 쓸모가 없어지지만 **해롭지 않다.**
  새 프로젝트를 세울 때도 그대로 둔다 — 폴백이 사는 동안은 실제로 필요하다
